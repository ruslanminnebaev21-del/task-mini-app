// app/api/sport/stats/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSession } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const userId = Number((session as any).uid); // <-- ВАЖНО: uid

    const url = new URL(req.url);
    const workoutIdRaw = url.searchParams.get("workoutId");
    const workoutId = Number(workoutIdRaw);

    if (!workoutIdRaw || Number.isNaN(workoutId)) {
      return NextResponse.json({ ok: false, reason: "BAD_WORKOUT_ID" }, { status: 400 });
    }

    const { data: workout, error: wErr } = await supabaseAdmin
      .from("workouts")
      .select("id,type")
      .eq("id", workoutId)
      .eq("user_id", userId) // <-- теперь точно 4
      .single();

    if (wErr || !workout) {
      return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
    }

    // 2) количество упражнений
    const { count: exerciseCount, error: cErr } = await supabaseAdmin
      .from("workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("workout_id", workoutId);

    if (cErr) {
      return NextResponse.json({ ok: false, reason: "COUNT_FAILED", error: cErr.message }, { status: 500 });
    }

    // 3) общий поднятый вес = sum(weight * reps)
    // берём все set'ы через join на workout_exercises, чтобы фильтровать по workout_id
    const { data: sets, error: sErr } = await supabaseAdmin
      .from("workout_sets")
      .select("weight,reps,workout_exercises!inner(workout_id)")
      .eq("workout_exercises.workout_id", workoutId);

    if (sErr) {
      return NextResponse.json({ ok: false, reason: "SETS_FAILED", error: sErr.message }, { status: 500 });
    }

    let totalWeight = 0;
    for (const row of sets || []) {
      const w = Number(row.weight || 0);
      const r = Number(row.reps || 0);
      totalWeight += w * r;
    }

    // если пока считаем только для strength
    if (workout.type !== "strength") {
      totalWeight = 0;
    }

    return NextResponse.json({
      ok: true,
      workoutId,
      type: workout.type,
      exerciseCount: exerciseCount || 0,
      totalWeight,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === "NO_SESSION") {
      return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, reason: "SERVER_ERROR", error: msg }, { status: 500 });
  }
}