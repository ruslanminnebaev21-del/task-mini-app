// app/api/sport/stats/curworkout/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WorkoutType = "strength" | "cardio";

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

function toIdOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type BestSet = { weight: number; reps: number };

function isBetterSet(a: BestSet, b: BestSet) {
  if (a.weight !== b.weight) return a.weight > b.weight;
  return a.reps > b.reps;
}

function bestSetOf(sets: Array<{ weight: any; reps: any }>): BestSet | null {
  let best: BestSet | null = null;

  for (const s of sets || []) {
    const reps = s?.reps == null ? 0 : Number(s.reps);
    if (!Number.isFinite(reps) || reps <= 0) continue;

    const weight = s?.weight == null ? 0 : Number(s.weight);
    if (!Number.isFinite(weight) || weight < 0) continue;

    const cand: BestSet = { weight, reps };
    if (!best || isBetterSet(cand, best)) best = cand;
  }

  return best;
}

function volumeOf(sets: Array<{ weight: any; reps: any }>) {
  let sum = 0;

  for (const s of sets || []) {
    const reps = s?.reps == null ? 0 : Number(s.reps);
    const weight = s?.weight == null ? 0 : Number(s.weight);
    if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
    if (reps <= 0 || weight < 0) continue;
    sum += reps * weight;
  }

  return sum;
}

/**
 * GET /api/sport/stats/curworkout?id=123
 * (можно workout_id или workoutId, чтобы не ловить несостыковки)
 */
export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);

  const idRaw =
    String(url.searchParams.get("id") || "").trim() ||
    String(url.searchParams.get("workout_id") || "").trim() ||
    String(url.searchParams.get("workoutId") || "").trim();

  const workoutId = toIdOrNull(idRaw);
  if (!workoutId) {
    return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });
  }

  // 1) workout (и проверка user_id)
  const { data: workout, error: wErr } = await supabaseAdmin
    .from("workouts")
    .select("id, title, workout_date, type, duration_min, status, created_at, completed_at")
    .eq("id", workoutId)
    .eq("user_id", uid)
    .single();

  if (wErr || !workout) {
    return NextResponse.json(
      { ok: false, reason: "WORKOUT_NOT_FOUND", error: wErr?.message },
      { status: 404 }
    );
  }

  const wType: WorkoutType = workout.type === "cardio" ? "cardio" : "strength";

  // 2) exercises (workout_exercises) + name из exercises
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

  const wexIds = (wexRows || [])
    .map((x: any) => Number(x.id))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  // 3) sets
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
    if (!Number.isFinite(k)) continue;
    if (!setsByWexId.has(k)) setsByWexId.set(k, []);
    setsByWexId.get(k)!.push(s);
  }

  // 4) собираем exercises + считаем best/volume
  const exercises = (wexRows || []).map((x: any) => {
    const wexId = Number(x.id);
    const exName = String(x?.exercises?.name || "").trim();
    const sets = (setsByWexId.get(wexId) || []).map((s: any) => ({
      id: Number(s.id),
      set_index: s.set_index == null ? null : Number(s.set_index),
      weight: s.weight == null ? null : Number(s.weight),
      reps: s.reps == null ? null : Number(s.reps),
    }));

    const best = bestSetOf(sets);
    const volume = volumeOf(sets);

    return {
      workout_exercise_id: wexId,
      exercise_id: x.exercise_id == null ? null : Number(x.exercise_id),
      name: exName,
      order_index: x.order_index == null ? null : Number(x.order_index),
      note: x.note ?? null,
      sets,
      // computed:
      best_set: best, // {weight, reps} | null
      volume, // number
      sets_count: sets.length,
    };
  });

  // 5) totals
  const totals = (() => {
    const exCount = exercises.length;
    let setCount = 0;
    let totalVolume = 0;

    for (const ex of exercises) {
      setCount += Number(ex.sets_count || 0);
      totalVolume += Number(ex.volume || 0);
    }

    return { exCount, setCount, totalVolume };
  })();

  return NextResponse.json({
    ok: true,
    workout: {
      id: Number(workout.id),
      title: workout.title ?? null,
      workout_date: String(workout.workout_date || ""),
      type: wType,
      duration_min: workout.duration_min == null ? null : Number(workout.duration_min),
      status: workout.status ?? null,
      created_at: workout.created_at ?? null,
      completed_at: workout.completed_at ?? null,
    },
    exercises,
    totals,
  });
}