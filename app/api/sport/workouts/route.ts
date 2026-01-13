// app/api/sport/workouts/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WorkoutType = "strength" | "cardio";
type WorkoutStatus = "draft" | "done";

async function getUidFromSession(): Promise<number | null> {
  const c = await cookies();
  const token = c.get("session")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as any;
    const uid = Number(payload?.uid);
    if (!Number.isFinite(uid) || uid <= 0) return null;
    return uid;
  } catch {
    return null;
  }
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toIdOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function assertExercisesBelongToUser(uid: number, rawExercises: any[]) {
  const ids = rawExercises
    .map((x: any) => Number(x?.exerciseId))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  if (ids.length !== rawExercises.length) {
    return { ok: false as const, reason: "BAD_EXERCISE_ID" as const, missing: [] as number[] };
  }

  const { data: exRows, error: exErr } = await supabaseAdmin
    .from("exercises")
    .select("id")
    .eq("user_id", uid)
    .in("id", ids);

  if (exErr) {
    return { ok: false as const, reason: "DB_ERROR" as const, error: exErr.message, missing: [] as number[] };
  }

  const found = new Set((exRows || []).map((r: any) => Number(r.id)));
  const missing = ids.filter((id: number) => !found.has(id));

  if (missing.length) {
    return { ok: false as const, reason: "EXERCISE_NOT_FOUND" as const, missing };
  }

  return { ok: true as const, ids };
}

/**
 * GET /api/sport/workouts
 * - /api/sport/workouts?status=draft|done      -> список тренировок
 * - /api/sport/workouts?exercise_q=подт        -> подсказки упражнений
 * - /api/sport/workouts?id=123                -> один черновик/тренировка + упражнения + сеты
 */
export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);

  // 0) Один workout по id (для редактирования)
  const idParam = String(url.searchParams.get("id") || "").trim();
  if (idParam) {
    const workoutId = toIdOrNull(idParam);
    if (!workoutId) {
      return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });
    }

    // сам workout (и проверка user_id)
    const { data: workout, error: wErr } = await supabaseAdmin
      .from("workouts")
      .select("id, title, workout_date, type, duration_min, status, created_at")
      .eq("id", workoutId)
      .eq("user_id", uid)
      .single();

    if (wErr || !workout) {
      return NextResponse.json(
        { ok: false, reason: "WORKOUT_NOT_FOUND", error: wErr?.message },
        { status: 404 }
      );
    }

    // упражнения + имя упражнения из exercises
    const { data: wexRows, error: wexErr } = await supabaseAdmin
      .from("workout_exercises")
      .select("id, exercise_id, order_index, note, exercises(name)")
      .eq("workout_id", workoutId)
      .order("order_index", { ascending: true });

    if (wexErr) {
      return NextResponse.json(
        { ok: false, reason: "DB_ERROR", error: wexErr.message },
        { status: 500 }
      );
    }

    const wexIds = (wexRows || []).map((x: any) => Number(x.id)).filter((n: number) => Number.isFinite(n));
    let setsRows: any[] = [];

    if (wexIds.length) {
      const { data: sRows, error: sErr } = await supabaseAdmin
        .from("workout_sets")
        .select("id, workout_exercise_id, set_index, weight, reps")
        .in("workout_exercise_id", wexIds)
        .order("set_index", { ascending: true });

      if (sErr) {
        return NextResponse.json(
          { ok: false, reason: "DB_ERROR", error: sErr.message },
          { status: 500 }
        );
      }
      setsRows = sRows || [];
    }

    const setsByWexId = new Map<number, any[]>();
    for (const s of setsRows) {
      const k = Number((s as any).workout_exercise_id);
      if (!setsByWexId.has(k)) setsByWexId.set(k, []);
      setsByWexId.get(k)!.push(s);
    }

    const exercises = (wexRows || []).map((x: any) => {
      const wexId = Number(x.id);
      const exName = String(x?.exercises?.name || "").trim();

      return {
        workout_exercise_id: wexId,
        exercise_id: x.exercise_id == null ? null : Number(x.exercise_id),
        name: exName,
        order_index: x.order_index == null ? null : Number(x.order_index),
        note: x.note ?? null,
        sets: (setsByWexId.get(wexId) || []).map((s: any) => ({
          id: Number(s.id),
          set_index: s.set_index == null ? null : Number(s.set_index),
          weight: s.weight == null ? null : Number(s.weight),
          reps: s.reps == null ? null : Number(s.reps),
        })),
      };
    });

    return NextResponse.json({ ok: true, workout, exercises });
  }

  // 1) Подсказки упражнений (поиск)
  const exerciseQ = String(url.searchParams.get("exercise_q") || "").trim();
  if (exerciseQ) {
    if (exerciseQ.length < 2) {
      return NextResponse.json({ ok: true, exercises: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("exercises")
      .select("id, name")
      .eq("user_id", uid)
      .ilike("name", `%${exerciseQ}%`)
      .order("name", { ascending: true })
      .limit(8);

    if (error) {
      return NextResponse.json(
        { ok: false, reason: "DB_ERROR", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, exercises: data || [] });
  }

  // 2) Список тренировок (черновики/выполненные)
  const status = String(url.searchParams.get("status") || "").trim(); // draft | done | ""

  let q = supabaseAdmin
    .from("workouts")
    .select("id, title, workout_date, type, duration_min, status, created_at")
    .eq("user_id", uid)
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (status === "draft" || status === "done") {
    q = q.eq("status", status);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "DB_ERROR", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, workouts: data || [] });
}

/**
 * POST /api/sport/workouts
 * (твой код оставил как есть, без изменений)
 */
export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));

  const workout_date = String(body?.workout_date || "").trim();
  const type = String(body?.type || "").trim() as WorkoutType;

  const title = String(body?.title || "").trim();
  const statusRaw = String(body?.status || "draft").trim() as WorkoutStatus;
  const status: WorkoutStatus = statusRaw === "done" ? "done" : "draft";

  const duration_min =
    body?.duration_min === null || body?.duration_min === undefined || body?.duration_min === ""
      ? null
      : Number(body?.duration_min);

  if (!workout_date || !isYmd(workout_date)) {
    return NextResponse.json({ ok: false, reason: "BAD_DATE" }, { status: 400 });
  }

  if (type !== "strength" && type !== "cardio") {
    return NextResponse.json({ ok: false, reason: "BAD_TYPE" }, { status: 400 });
  }

  if (Number.isNaN(duration_min as any)) {
    return NextResponse.json({ ok: false, reason: "BAD_DURATION" }, { status: 400 });
  }

  const rawExercises = body?.exercises;
  const hasExercises = Array.isArray(rawExercises) && rawExercises.length > 0;

  if (type === "strength" && hasExercises) {
    const check = await assertExercisesBelongToUser(uid, rawExercises);
    if (!check.ok) {
      if (check.reason === "DB_ERROR") {
        return NextResponse.json(
          { ok: false, reason: "DB_ERROR", error: (check as any).error },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { ok: false, reason: check.reason, missing: (check as any).missing },
        { status: 400 }
      );
    }
  }

  const { data: workout, error: wErr } = await supabaseAdmin
    .from("workouts")
    .insert({
      user_id: uid,
      workout_date,
      type,
      title: title || null,
      status,
      duration_min,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .select("id, title, workout_date, type, duration_min, status, created_at")
    .single();

  if (wErr || !workout?.id) {
    return NextResponse.json(
      { ok: false, reason: "DB_ERROR", error: wErr?.message || "Workout insert failed" },
      { status: 500 }
    );
  }

  if (type !== "strength" || !hasExercises) {
    return NextResponse.json({ ok: true, workout });
  }

  const workoutId = Number(workout.id);

  try {
    for (let exIndex = 0; exIndex < rawExercises.length; exIndex++) {
      const we = rawExercises[exIndex] || {};
      const exerciseId = Number(we.exerciseId);

      if (!Number.isFinite(exerciseId) || exerciseId <= 0) {
        throw new Error("BAD_EXERCISE_ID");
      }

      const setsArr = Array.isArray(we.sets) ? we.sets : [];

      const { data: wex, error: wexErr } = await supabaseAdmin
        .from("workout_exercises")
        .insert({
          workout_id: workoutId,
          exercise_id: exerciseId,
          order_index: exIndex + 1,
          note: we.note ?? null,
        })
        .select("id")
        .single();

      if (wexErr || !wex?.id) {
        throw new Error(wexErr?.message || "workout_exercises insert failed");
      }

      const workoutExerciseId = Number(wex.id);

      const normalizedSets = (setsArr.length ? setsArr : [{}]).map((s: any, i: number) => ({
        workout_exercise_id: workoutExerciseId,
        set_index: i + 1,
        weight: toNumOrNull(s?.weight),
        reps: toIntOrNull(s?.reps),
      }));

      const { error: setsErr } = await supabaseAdmin.from("workout_sets").insert(normalizedSets);

      if (setsErr) {
        throw new Error(setsErr.message || "workout_sets insert failed");
      }
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    await supabaseAdmin.from("workouts").delete().eq("id", workoutId).eq("user_id", uid);

    return NextResponse.json(
      { ok: false, reason: "SAVE_DETAILS_FAILED", error: msg },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, workout });
}

/**
 * PUT /api/sport/workouts?id=123
 * body: как POST
 * Поведение:
 * - обновляем workouts
 * - полностью пересоздаём workout_exercises + workout_sets
 */
export async function PUT(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);
  const idParam = String(url.searchParams.get("id") || "").trim();
  const workoutId = toIdOrNull(idParam);

  if (!workoutId) {
    return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });
  }

  // проверим что тренировка пользователя существует
  const { data: existing, error: exWErr } = await supabaseAdmin
    .from("workouts")
    .select("id, user_id")
    .eq("id", workoutId)
    .eq("user_id", uid)
    .single();

  if (exWErr || !existing) {
    return NextResponse.json(
      { ok: false, reason: "WORKOUT_NOT_FOUND", error: exWErr?.message },
      { status: 404 }
    );
  }

  const body = await req.json().catch(() => ({} as any));

  const workout_date = String(body?.workout_date || "").trim();
  const type = String(body?.type || "").trim() as WorkoutType;

  const title = String(body?.title || "").trim();
  const statusRaw = String(body?.status || "draft").trim() as WorkoutStatus;
  const status: WorkoutStatus = statusRaw === "done" ? "done" : "draft";

  const duration_min =
    body?.duration_min === null || body?.duration_min === undefined || body?.duration_min === ""
      ? null
      : Number(body?.duration_min);

  if (!workout_date || !isYmd(workout_date)) {
    return NextResponse.json({ ok: false, reason: "BAD_DATE" }, { status: 400 });
  }

  if (type !== "strength" && type !== "cardio") {
    return NextResponse.json({ ok: false, reason: "BAD_TYPE" }, { status: 400 });
  }

  if (Number.isNaN(duration_min as any)) {
    return NextResponse.json({ ok: false, reason: "BAD_DURATION" }, { status: 400 });
  }

  const rawExercises = body?.exercises;
  const hasExercises = Array.isArray(rawExercises) && rawExercises.length > 0;

  // силовая: валидируем exercises до апдейта
  if (type === "strength" && hasExercises) {
    const check = await assertExercisesBelongToUser(uid, rawExercises);
    if (!check.ok) {
      if (check.reason === "DB_ERROR") {
        return NextResponse.json(
          { ok: false, reason: "DB_ERROR", error: (check as any).error },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { ok: false, reason: check.reason, missing: (check as any).missing },
        { status: 400 }
      );
    }
  }

  // 1) обновляем workouts
  const { data: updated, error: upErr } = await supabaseAdmin
    .from("workouts")
    .update({
      workout_date,
      type,
      title: title || null,
      status,
      duration_min,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", workoutId)
    .eq("user_id", uid)
    .select("id, title, workout_date, type, duration_min, status, created_at")
    .single();

  if (upErr || !updated) {
    return NextResponse.json(
      { ok: false, reason: "DB_ERROR", error: upErr?.message || "Workout update failed" },
      { status: 500 }
    );
  }

  // 2) если кардио или exercises пустые -> чистим детали и возвращаем
  // (чтобы черновик не тащил старые упражнения)
  // Сначала найдём workout_exercises.id
  const { data: oldWex, error: oldWexErr } = await supabaseAdmin
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workoutId);

  if (oldWexErr) {
    return NextResponse.json(
      { ok: false, reason: "DB_ERROR", error: oldWexErr.message },
      { status: 500 }
    );
  }

  const oldIds = (oldWex || []).map((x: any) => Number(x.id)).filter((n: number) => Number.isFinite(n));

  if (oldIds.length) {
    // удаляем sets
    const { error: delSetsErr } = await supabaseAdmin
      .from("workout_sets")
      .delete()
      .in("workout_exercise_id", oldIds);

    if (delSetsErr) {
      return NextResponse.json(
        { ok: false, reason: "DB_ERROR", error: delSetsErr.message },
        { status: 500 }
      );
    }
  }

  // удаляем exercises
  const { error: delWexErr } = await supabaseAdmin
    .from("workout_exercises")
    .delete()
    .eq("workout_id", workoutId);

  if (delWexErr) {
    return NextResponse.json(
      { ok: false, reason: "DB_ERROR", error: delWexErr.message },
      { status: 500 }
    );
  }

  // если не силовая или нет упражнений -> всё, детали очищены
  if (type !== "strength" || !hasExercises) {
    return NextResponse.json({ ok: true, workout: updated });
  }

  // 3) вставляем новые упражнения + сеты
  try {
    for (let exIndex = 0; exIndex < rawExercises.length; exIndex++) {
      const we = rawExercises[exIndex] || {};
      const exerciseId = Number(we.exerciseId);

      if (!Number.isFinite(exerciseId) || exerciseId <= 0) {
        throw new Error("BAD_EXERCISE_ID");
      }

      const setsArr = Array.isArray(we.sets) ? we.sets : [];

      const { data: wex, error: wexErr } = await supabaseAdmin
        .from("workout_exercises")
        .insert({
          workout_id: workoutId,
          exercise_id: exerciseId,
          order_index: exIndex + 1,
          note: we.note ?? null,
        })
        .select("id")
        .single();

      if (wexErr || !wex?.id) {
        throw new Error(wexErr?.message || "workout_exercises insert failed");
      }

      const workoutExerciseId = Number(wex.id);

      const normalizedSets = (setsArr.length ? setsArr : [{}]).map((s: any, i: number) => ({
        workout_exercise_id: workoutExerciseId,
        set_index: i + 1,
        weight: toNumOrNull(s?.weight),
        reps: toIntOrNull(s?.reps),
      }));

      const { error: setsErr } = await supabaseAdmin.from("workout_sets").insert(normalizedSets);
      if (setsErr) {
        throw new Error(setsErr.message || "workout_sets insert failed");
      }
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    return NextResponse.json(
      { ok: false, reason: "SAVE_DETAILS_FAILED", error: msg },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, workout: updated });
}