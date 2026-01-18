import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// GET /api/sport/workouts/summary?workout_id=123
export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const wid = Number(searchParams.get("workout_id"));
    if (!Number.isFinite(wid) || wid <= 0) {
      return NextResponse.json({ ok: false, reason: "BAD_WORKOUT_ID" }, { status: 400 });
    }

    // 1) проверим что тренировка пользователя
    const { data: w, error: wErr } = await supabaseAdmin
      .from("workouts")
      .select("id, title, completed_at")
      .eq("id", wid)
      .eq("user_id", uid)
      .maybeSingle();

    if (wErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wErr.message }, { status: 500 });
    }
    if (!w) {
      return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
    }

    // 2) упражнения без подходов
    // workout_exercises.exercise_id -> exercises.id
    const { data: rows, error: exErr } = await supabaseAdmin
      .from("workout_exercises")
      .select("exercise_id, exercises(name)")
      .eq("workout_id", wid)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true });

    if (exErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: exErr.message }, { status: 500 });
    }

    const exercises = (rows || [])
      .map((r: any) => ({
        id: Number(r.exercise_id),
        name: String(r?.exercises?.name || "").trim(),
      }))
      .filter((x: any) => Number.isFinite(x.id) && x.id > 0 && x.name);

    return NextResponse.json({
      ok: true,
      workout: {
        id: Number(w.id),
        title: String(w.title || "").trim() || "Без названия",
        completed_at: w.completed_at ? String(w.completed_at) : null,
      },
      exercises,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "SERVER_ERROR", error: String(e?.message || e) },
      { status: 500 }
    );
  }
}