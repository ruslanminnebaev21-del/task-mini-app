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
function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    .map((x: any) => toIdOrNull(x?.exerciseId))
    .filter((n: number | null): n is number => Boolean(n));

  if (ids.length === 0) {
    return { ok: true as const, ids: [] as number[] };
  }

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

// ===== PR (best_weight / best_reps) from workout_sets of ONE workout =====

type BestSet = { weight: number; reps: number };

function isBetterSet(a: BestSet, b: BestSet) {
  // лучше = больше вес, при равном весе больше повторов
  if (a.weight !== b.weight) return a.weight > b.weight;
  return a.reps > b.reps;
}

async function recomputeAllExercisePRForUser(uid: number) {
  // 1) берём все workout_exercises из выполненных тренировок пользователя
  const { data: wexRows, error: wexErr } = await supabaseAdmin
    .from("workout_exercises")
    .select("id, exercise_id, workouts!inner(user_id, status)")
    .eq("workouts.user_id", uid)
    .eq("workouts.status", "done");

  if (wexErr) throw new Error(`WEX_ALL_DONE_SELECT_FAILED: ${wexErr.message}`);

  const wex = (wexRows || [])
    .map((r: any) => ({
      id: Number(r.id),
      exercise_id: Number(r.exercise_id),
    }))
    .filter((x) => Number.isFinite(x.id) && x.id > 0 && Number.isFinite(x.exercise_id) && x.exercise_id > 0);

  // 2) если нет ни одного выполненного сета в истории — очищаем PR у всех упражнений юзера
  if (wex.length === 0) {
    const { error: clearErr } = await supabaseAdmin
      .from("exercises")
      .update({ best_weight: null, best_reps: null })
      .eq("user_id", uid);

    if (clearErr) throw new Error(`EX_CLEAR_ALL_PR_FAILED: ${clearErr.message}`);
    return;
  }

  const wexIds = wex.map((x) => x.id);

  const exByWexId = new Map<number, number>();
  for (const x of wex) exByWexId.set(x.id, x.exercise_id);

  // 3) берём все сеты по этим workout_exercises
  const { data: setsRows, error: setsErr } = await supabaseAdmin
    .from("workout_sets")
    .select("workout_exercise_id, weight, reps")
    .in("workout_exercise_id", wexIds);

  if (setsErr) throw new Error(`SETS_ALL_DONE_SELECT_FAILED: ${setsErr.message}`);

  // 4) считаем лучший сет по каждому exercise_id
  const bestByExerciseId = new Map<number, BestSet>();

  for (const row of setsRows || []) {
    const wexId = Number((row as any).workout_exercise_id);
    const exerciseId = exByWexId.get(wexId);
    if (!exerciseId) continue;

    const reps = Number((row as any).reps ?? 0);
    if (!Number.isFinite(reps) || reps <= 0) continue;

    const weight = (row as any).weight == null ? 0 : Number((row as any).weight);
    if (!Number.isFinite(weight) || weight < 0) continue;

    const candidate: BestSet = { weight, reps };
    const prev = bestByExerciseId.get(exerciseId);
    if (!prev || isBetterSet(candidate, prev)) bestByExerciseId.set(exerciseId, candidate);
  }

  // 5) обновляем все exercises юзера:
  // - если по упражнению нет ни одного валидного сета -> best_* = null
  const { data: exRows, error: exErr } = await supabaseAdmin
    .from("exercises")
    .select("id")
    .eq("user_id", uid);

  if (exErr) throw new Error(`EX_SELECT_ALL_FAILED: ${exErr.message}`);

  for (const r of exRows || []) {
    const exId = Number((r as any).id);
    if (!Number.isFinite(exId) || exId <= 0) continue;

    const best = bestByExerciseId.get(exId) || null;

    const nextBestWeight = best && best.weight > 0 ? best.weight : null;
    const nextBestReps = best && best.reps > 0 ? best.reps : null;

    const { error: upErr } = await supabaseAdmin
      .from("exercises")
      .update({ best_weight: nextBestWeight, best_reps: nextBestReps })
      .eq("id", exId)
      .eq("user_id", uid);

    if (upErr) throw new Error(`EX_PR_UPDATE_FAILED: ${upErr.message}`);
  }
}

async function recomputeExercisePRFromAllDoneWorkouts(opts: { uid: number; exerciseIds: number[] }) {
  const { uid, exerciseIds } = opts;

  const uniq = Array.from(new Set(exerciseIds.filter((x) => Number.isFinite(x) && x > 0)));
  if (uniq.length === 0) return;

  // 1) берём все workout_exercises по этим exercise_id, но только из выполненных тренировок юзера
  // Важно: inner join на workouts, чтобы фильтровать по user_id и status
  const { data: wexRows, error: wexErr } = await supabaseAdmin
    .from("workout_exercises")
    .select("id, exercise_id, workouts!inner(user_id, status)")
    .in("exercise_id", uniq)
    .eq("workouts.user_id", uid)
    .eq("workouts.status", "done");

  if (wexErr) throw new Error(`WEX_HISTORY_SELECT_FAILED: ${wexErr.message}`);

  const wex = (wexRows || [])
    .map((r: any) => ({
      id: Number(r.id),
      exercise_id: Number(r.exercise_id),
    }))
    .filter((x) => Number.isFinite(x.id) && x.id > 0 && Number.isFinite(x.exercise_id) && x.exercise_id > 0);

  // если вообще нет выполненных сетов по этим упражнениям — PR должен стать null
  if (wex.length === 0) {
    for (const exId of uniq) {
      const { error: upErr } = await supabaseAdmin
        .from("exercises")
        .update({ best_weight: null, best_reps: null })
        .eq("id", exId)
        .eq("user_id", uid);

      if (upErr) throw new Error(`EX_PR_CLEAR_FAILED: ${upErr.message}`);
    }
    return;
  }

  const wexIds = wex.map((x) => x.id);

  const exByWexId = new Map<number, number>();
  for (const x of wex) exByWexId.set(x.id, x.exercise_id);

  // 2) берём все сеты по найденным workout_exercises
  const { data: setsRows, error: setsErr } = await supabaseAdmin
    .from("workout_sets")
    .select("workout_exercise_id, weight, reps")
    .in("workout_exercise_id", wexIds);

  if (setsErr) throw new Error(`SETS_HISTORY_SELECT_FAILED: ${setsErr.message}`);

  // 3) находим лучший сет по каждому exercise_id по всей истории выполненных
  const bestByExerciseId = new Map<number, BestSet>();

  for (const row of setsRows || []) {
    const wexId = Number((row as any).workout_exercise_id);
    const exerciseId = exByWexId.get(wexId);
    if (!exerciseId) continue;

    const reps = Number((row as any).reps ?? 0);
    if (!Number.isFinite(reps) || reps <= 0) continue;

    const weight = (row as any).weight == null ? 0 : Number((row as any).weight);
    if (!Number.isFinite(weight) || weight < 0) continue;

    const candidate: BestSet = { weight, reps };
    const prev = bestByExerciseId.get(exerciseId);
    if (!prev || isBetterSet(candidate, prev)) bestByExerciseId.set(exerciseId, candidate);
  }

  // 4) апдейтим exercises: тут важно — мы НЕ “только если стало лучше”.
  // Мы выставляем ровно то, что посчитали по истории (может и уменьшиться).
  for (const exId of uniq) {
    const best = bestByExerciseId.get(exId) || null;

    const nextBestWeight = best && best.weight > 0 ? best.weight : null;
    const nextBestReps = best && best.reps > 0 ? best.reps : null;

    const { error: upErr } = await supabaseAdmin
      .from("exercises")
      .update({
        best_weight: nextBestWeight,
        best_reps: nextBestReps,
      })
      .eq("id", exId)
      .eq("user_id", uid);

    if (upErr) throw new Error(`EX_PR_UPDATE_FAILED: ${upErr.message}`);
  }
}

async function recomputePRForWorkout(opts: { uid: number; workoutId: number }) {
  const { uid, workoutId } = opts;

  // Берём список упражнений из этой тренировки (это минимальный набор, который надо пересчитать)
  const { data: wexRows, error: wexErr } = await supabaseAdmin
    .from("workout_exercises")
    .select("exercise_id")
    .eq("workout_id", workoutId);

  if (wexErr) throw new Error(`WEX_SELECT_FOR_RECOMPUTE_FAILED: ${wexErr.message}`);

  const exerciseIds = (wexRows || [])
    .map((r: any) => Number(r.exercise_id))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  await recomputeExercisePRFromAllDoneWorkouts({ uid, exerciseIds });
}

async function runPRIfDone(opts: { uid: number; workoutId: number; type: WorkoutType; status: WorkoutStatus }) {
  if (opts.type !== "strength") return;
  if (opts.status !== "done") return;

  try {
    await recomputePRForWorkout({ uid: opts.uid, workoutId: opts.workoutId });
  } catch (e: any) {
    console.log("PR_RECOMPUTE_FOR_WORKOUT_FAILED:", String(e?.message || e));
  }
}

/**
 * GET /api/sport/workouts
 * - /api/sport/workouts?status=draft|done
 * - /api/sport/workouts?exercise_q=подт
 * - /api/sport/workouts?id=123
 */
export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);

  // 0) Один workout по id
  const idParam = String(url.searchParams.get("id") || "").trim();
  if (idParam) {
    const workoutId = toIdOrNull(idParam);
    if (!workoutId) return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });

    const { data: workout, error: wErr } = await supabaseAdmin
      .from("workouts")
      .select("id, title, workout_date, type, duration_min, status, created_at, completed_at")
      .eq("id", workoutId)
      .eq("user_id", uid)
      .single();

    if (wErr || !workout) {
      return NextResponse.json({ ok: false, reason: "WORKOUT_NOT_FOUND", error: wErr?.message }, { status: 404 });
    }

    const { data: wexRows, error: wexErr } = await supabaseAdmin
      .from("workout_exercises")
      .select("id, exercise_id, order_index, note, exercises(name)")
      .eq("workout_id", workoutId)
      .order("order_index", { ascending: true });

    if (wexErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wexErr.message }, { status: 500 });
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
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: sErr.message }, { status: 500 });
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

  // 1) Подсказки упражнений
  const exerciseQ = String(url.searchParams.get("exercise_q") || "").trim();
  if (exerciseQ) {
    if (exerciseQ.length < 2) return NextResponse.json({ ok: true, exercises: [] });

    const { data, error } = await supabaseAdmin
      .from("exercises")
      .select("id, name, best_weight, best_reps")
      .eq("user_id", uid)
      .ilike("name", `%${exerciseQ}%`)
      .order("name", { ascending: true })
      .limit(8);

    if (error) return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, exercises: data || [] });
  }

  // 2) Список тренировок
  const status = String(url.searchParams.get("status") || "").trim();

  let q = supabaseAdmin
    .from("workouts")
    .select("id, title, workout_date, type, duration_min, status, created_at, completed_at")
    .eq("user_id", uid)
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (status === "draft" || status === "done") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, workouts: data || [] });
}

/**
 * POST /api/sport/workouts
 */
export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));

  // ===== COPY MODE =====
  if (String(body?.action || "").trim() === "copy") {
    const sourceId = toIdOrNull(body?.source_id);
    if (!sourceId) return NextResponse.json({ ok: false, reason: "BAD_SOURCE_ID" }, { status: 400 });

    const { data: src, error: srcErr } = await supabaseAdmin
      .from("workouts")
      .select("id, title, type, duration_min")
      .eq("id", sourceId)
      .eq("user_id", uid)
      .single();

    if (srcErr || !src) {
      return NextResponse.json({ ok: false, reason: "WORKOUT_NOT_FOUND", error: srcErr?.message }, { status: 404 });
    }

    const srcType: WorkoutType = src.type === "cardio" ? "cardio" : "strength";
    const newTitle = `Копия ${String(src.title || "").trim() || "Без названия"}`;

    const { data: created, error: cErr } = await supabaseAdmin
      .from("workouts")
      .insert({
        user_id: uid,
        workout_date: todayYmd(),
        type: srcType,
        title: newTitle,
        status: "draft",
        duration_min: srcType === "cardio" ? (src.duration_min == null ? null : Number(src.duration_min)) : null,
        completed_at: null,
      })
      .select("id, title, workout_date, type, duration_min, status, created_at, completed_at")
      .single();

    if (cErr || !created?.id) {
      return NextResponse.json(
        { ok: false, reason: "DB_ERROR", error: cErr?.message || "Workout copy insert failed" },
        { status: 500 }
      );
    }

    const newWorkoutId = Number(created.id);

    if (srcType !== "strength") {
      return NextResponse.json({ ok: true, workout: created, new_workout_id: newWorkoutId });
    }

    try {
      const { data: srcWex, error: wexErr } = await supabaseAdmin
        .from("workout_exercises")
        .select("id, exercise_id, order_index, note")
        .eq("workout_id", sourceId)
        .order("order_index", { ascending: true });

      if (wexErr) throw new Error(`WEX_SELECT_FAILED: ${wexErr.message}`);

      const srcWexRows = (srcWex || []).map((x: any) => ({
        id: Number(x.id),
        exercise_id: x.exercise_id == null ? null : Number(x.exercise_id),
        order_index: x.order_index == null ? 0 : Number(x.order_index),
        note: x.note ?? null,
      }));

      if (srcWexRows.length === 0) {
        return NextResponse.json({ ok: true, workout: created, new_workout_id: newWorkoutId });
      }

      const srcWexIds = srcWexRows.map((x) => x.id);

      const { data: srcSets, error: setsErr } = await supabaseAdmin
        .from("workout_sets")
        .select("workout_exercise_id, set_index, weight, reps")
        .in("workout_exercise_id", srcWexIds)
        .order("set_index", { ascending: true });

      if (setsErr) throw new Error(`SETS_SELECT_FAILED: ${setsErr.message}`);

      const setsByOldWex = new Map<number, any[]>();
      for (const s of srcSets || []) {
        const k = Number((s as any).workout_exercise_id);
        if (!setsByOldWex.has(k)) setsByOldWex.set(k, []);
        setsByOldWex.get(k)!.push(s);
      }

      for (const old of srcWexRows) {
        const exerciseId = Number(old.exercise_id);
        if (!Number.isFinite(exerciseId) || exerciseId <= 0) continue;

        const { data: newWex, error: insWexErr } = await supabaseAdmin
          .from("workout_exercises")
          .insert({
            workout_id: newWorkoutId,
            exercise_id: exerciseId,
            order_index: old.order_index || 1,
            note: old.note,
          })
          .select("id")
          .single();

        if (insWexErr || !newWex?.id) throw new Error(insWexErr?.message || "WEX_INSERT_FAILED");

        const newWexId = Number(newWex.id);
        const oldSets = setsByOldWex.get(old.id) || [];

        if (oldSets.length) {
          const payload = oldSets.map((s: any) => ({
            workout_exercise_id: newWexId,
            set_index: s.set_index == null ? null : Number(s.set_index),
            weight: s.weight == null ? null : Number(s.weight),
            reps: s.reps == null ? null : Number(s.reps),
          }));

          const { error: insSetsErr } = await supabaseAdmin.from("workout_sets").insert(payload);
          if (insSetsErr) throw new Error(insSetsErr.message || "SETS_INSERT_FAILED");
        }
      }

      return NextResponse.json({ ok: true, workout: created, new_workout_id: newWorkoutId });
    } catch (e: any) {
      const msg = String(e?.message || e);

      const { data: wexRows } = await supabaseAdmin
        .from("workout_exercises")
        .select("id")
        .eq("workout_id", newWorkoutId);

      const ids = (wexRows || [])
        .map((x: any) => Number(x.id))
        .filter((n: number) => Number.isFinite(n) && n > 0);

      if (ids.length) await supabaseAdmin.from("workout_sets").delete().in("workout_exercise_id", ids);
      await supabaseAdmin.from("workout_exercises").delete().eq("workout_id", newWorkoutId);
      await supabaseAdmin.from("workouts").delete().eq("id", newWorkoutId).eq("user_id", uid);

      return NextResponse.json({ ok: false, reason: "COPY_FAILED", error: msg }, { status: 500 });
    }
  }
  // ===== END COPY MODE =====

  const workout_date = String(body?.workout_date || "").trim();
  const type = String(body?.type || "").trim() as WorkoutType;

  const title = String(body?.title || "").trim();
  const statusRaw = String(body?.status || "draft").trim() as WorkoutStatus;
  const status: WorkoutStatus = statusRaw === "done" ? "done" : "draft";

  const duration_min =
    body?.duration_min === null || body?.duration_min === undefined || body?.duration_min === ""
      ? null
      : Number(body?.duration_min);

  if (!workout_date || !isYmd(workout_date)) return NextResponse.json({ ok: false, reason: "BAD_DATE" }, { status: 400 });
  if (type !== "strength" && type !== "cardio") return NextResponse.json({ ok: false, reason: "BAD_TYPE" }, { status: 400 });
  if (Number.isNaN(duration_min as any)) return NextResponse.json({ ok: false, reason: "BAD_DURATION" }, { status: 400 });

  const rawExercises = body?.exercises;
  const hasExercises = Array.isArray(rawExercises) && rawExercises.length > 0;

  if (type === "strength" && hasExercises) {
    const check = await assertExercisesBelongToUser(uid, rawExercises);
    if (!check.ok) {
      if (check.reason === "DB_ERROR") {
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: (check as any).error }, { status: 500 });
      }
      return NextResponse.json({ ok: false, reason: check.reason, missing: (check as any).missing }, { status: 400 });
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
    .select("id, title, workout_date, type, duration_min, status, created_at, completed_at")
    .single();

  if (wErr || !workout?.id) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wErr?.message || "Workout insert failed" }, { status: 500 });
  }

  const workoutId = Number(workout.id);

  if (type !== "strength" || !hasExercises) {
    await runPRIfDone({ uid, workoutId, type, status });
    return NextResponse.json({ ok: true, workout });
  }

  try {
    for (let exIndex = 0; exIndex < rawExercises.length; exIndex++) {
      const we = rawExercises[exIndex] || {};
      const exerciseId = Number(we.exerciseId);

      if (!Number.isFinite(exerciseId) || exerciseId <= 0) throw new Error("BAD_EXERCISE_ID");

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

      if (wexErr || !wex?.id) throw new Error(wexErr?.message || "workout_exercises insert failed");

      const workoutExerciseId = Number(wex.id);

      const normalizedSets = (setsArr.length ? setsArr : [{}]).map((s: any, i: number) => ({
        workout_exercise_id: workoutExerciseId,
        set_index: i + 1,
        weight: toNumOrNull(s?.weight),
        reps: toIntOrNull(s?.reps),
      }));

      const { error: setsErr } = await supabaseAdmin.from("workout_sets").insert(normalizedSets);
      if (setsErr) throw new Error(setsErr.message || "workout_sets insert failed");
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    await supabaseAdmin.from("workouts").delete().eq("id", workoutId).eq("user_id", uid);
    return NextResponse.json({ ok: false, reason: "SAVE_DETAILS_FAILED", error: msg }, { status: 500 });
  }

  await runPRIfDone({ uid, workoutId, type, status });
  return NextResponse.json({ ok: true, workout });
}

/**
 * PUT /api/sport/workouts?id=123
 * - полностью пересоздаёт детали
 * - если итоговый статус = done -> пересчитывает PR всегда (даже если тренировка уже была done)
 */
export async function PUT(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);
  const idParam = String(url.searchParams.get("id") || "").trim();
  const workoutId = toIdOrNull(idParam);
  if (!workoutId) return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });

  const { data: existing, error: exWErr } = await supabaseAdmin
    .from("workouts")
    .select("id, user_id, status, completed_at")
    .eq("id", workoutId)
    .eq("user_id", uid)
    .single();

  if (exWErr || !existing) {
    return NextResponse.json({ ok: false, reason: "WORKOUT_NOT_FOUND", error: exWErr?.message }, { status: 404 });
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

  if (!workout_date || !isYmd(workout_date)) return NextResponse.json({ ok: false, reason: "BAD_DATE" }, { status: 400 });
  if (type !== "strength" && type !== "cardio") return NextResponse.json({ ok: false, reason: "BAD_TYPE" }, { status: 400 });
  if (Number.isNaN(duration_min as any)) return NextResponse.json({ ok: false, reason: "BAD_DURATION" }, { status: 400 });

  const rawExercises = body?.exercises;
  const hasExercises = Array.isArray(rawExercises) && rawExercises.length > 0;

  if (type === "strength" && hasExercises) {
    const check = await assertExercisesBelongToUser(uid, rawExercises);
    if (!check.ok) {
      if (check.reason === "DB_ERROR") {
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: (check as any).error }, { status: 500 });
      }
      return NextResponse.json({ ok: false, reason: check.reason, missing: (check as any).missing }, { status: 400 });
    }
  }

  // completed_at: если уже done — не трогаем (чтоб "дата выполнения" не прыгала)
  const prevStatus: WorkoutStatus = (existing as any).status === "done" ? "done" : "draft";
  const prevCompletedAt = (existing as any).completed_at ? String((existing as any).completed_at) : null;

  const nextCompletedAt =
    status === "done" ? (prevStatus === "done" ? prevCompletedAt : new Date().toISOString()) : null;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("workouts")
    .update({
      workout_date,
      type,
      title: title || null,
      status,
      duration_min,
      completed_at: nextCompletedAt,
    })
    .eq("id", workoutId)
    .eq("user_id", uid)
    .select("id, title, workout_date, type, duration_min, status, created_at, completed_at")
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: upErr?.message || "Workout update failed" }, { status: 500 });
  }

  // чистим старые детали
  const { data: oldWex, error: oldWexErr } = await supabaseAdmin
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workoutId);

  if (oldWexErr) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: oldWexErr.message }, { status: 500 });
  }

  const oldIds = (oldWex || []).map((x: any) => Number(x.id)).filter((n: number) => Number.isFinite(n));

  if (oldIds.length) {
    const { error: delSetsErr } = await supabaseAdmin
      .from("workout_sets")
      .delete()
      .in("workout_exercise_id", oldIds);

    if (delSetsErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: delSetsErr.message }, { status: 500 });
    }
  }

  const { error: delWexErr } = await supabaseAdmin.from("workout_exercises").delete().eq("workout_id", workoutId);
  if (delWexErr) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: delWexErr.message }, { status: 500 });
  }

  if (type !== "strength" || !hasExercises) {
    await runPRIfDone({ uid, workoutId, type, status });
    return NextResponse.json({ ok: true, workout: updated });
  }

  // вставляем новые детали
  try {
    for (let exIndex = 0; exIndex < rawExercises.length; exIndex++) {
      const we = rawExercises[exIndex] || {};
      const exerciseId = Number(we.exerciseId);

      if (!Number.isFinite(exerciseId) || exerciseId <= 0) throw new Error("BAD_EXERCISE_ID");

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

      if (wexErr || !wex?.id) throw new Error(wexErr?.message || "workout_exercises insert failed");

      const workoutExerciseId = Number(wex.id);

      const normalizedSets = (setsArr.length ? setsArr : [{}]).map((s: any, i: number) => ({
        workout_exercise_id: workoutExerciseId,
        set_index: i + 1,
        weight: toNumOrNull(s?.weight),
        reps: toIntOrNull(s?.reps),
      }));

      const { error: setsErr } = await supabaseAdmin.from("workout_sets").insert(normalizedSets);
      if (setsErr) throw new Error(setsErr.message || "workout_sets insert failed");
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    return NextResponse.json({ ok: false, reason: "SAVE_DETAILS_FAILED", error: msg }, { status: 500 });
  }

  // главное: если в итоге done — пересчитываем ВСЕГДА
  await runPRIfDone({ uid, workoutId, type, status });

  return NextResponse.json({ ok: true, workout: updated });
}

/**
 * DELETE /api/sport/workouts?id=123
 */
export async function DELETE(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);
  const idParam = String(url.searchParams.get("id") || "").trim();
  const workoutId = toIdOrNull(idParam);
  if (!workoutId) return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });

  const { data: existing, error: exErr } = await supabaseAdmin
    .from("workouts")
    .select("id, status, type")
    .eq("id", workoutId)
    .eq("user_id", uid)
    .single();

  if (exErr || !existing) {
    return NextResponse.json({ ok: false, reason: "WORKOUT_NOT_FOUND", error: exErr?.message }, { status: 404 });
  }
  const shouldRecomputePR = existing.type === "strength" && existing.status === "done";

  let exerciseIds: number[] = [];
  if (shouldRecomputePR) {
    const { data: exRows, error: exRowsErr } = await supabaseAdmin
      .from("workout_exercises")
      .select("exercise_id")
      .eq("workout_id", workoutId);

    if (exRowsErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: exRowsErr.message }, { status: 500 });
    }

    exerciseIds = (exRows || [])
      .map((r: any) => Number(r.exercise_id))
      .filter((n: number) => Number.isFinite(n) && n > 0);
  }

  const { data: wexRows, error: wexErr } = await supabaseAdmin
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workoutId);

  if (wexErr) return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wexErr.message }, { status: 500 });

  const wexIds = (wexRows || [])
    .map((x: any) => Number(x.id))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  if (wexIds.length) {
    const { error: delSetsErr } = await supabaseAdmin
      .from("workout_sets")
      .delete()
      .in("workout_exercise_id", wexIds);

    if (delSetsErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: delSetsErr.message }, { status: 500 });
    }
  }

  const { error: delWexErr } = await supabaseAdmin.from("workout_exercises").delete().eq("workout_id", workoutId);
  if (delWexErr) return NextResponse.json({ ok: false, reason: "DB_ERROR", error: delWexErr.message }, { status: 500 });

  const { error: delWorkoutErr } = await supabaseAdmin
    .from("workouts")
    .delete()
    .eq("id", workoutId)
    .eq("user_id", uid);

  if (delWorkoutErr) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: delWorkoutErr.message }, { status: 500 });
  }
  if (shouldRecomputePR && exerciseIds.length) {
    try {
      await recomputeExercisePRFromAllDoneWorkouts({ uid, exerciseIds });
    } catch (e: any) {
      console.log("PR_RECOMPUTE_AFTER_DELETE_FAILED:", String(e?.message || e));
    }
  }
  return NextResponse.json({ ok: true });
}