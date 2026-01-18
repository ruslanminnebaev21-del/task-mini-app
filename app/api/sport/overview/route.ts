// app/api/sport/overview/route.ts
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

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);
  const qYear = Number(url.searchParams.get("year"));
  const qMonth = Number(url.searchParams.get("month")); // 1..12

  const now = new Date();
  const year = Number.isFinite(qYear) && qYear > 2000 ? qYear : now.getFullYear();
  const month1 = Number.isFinite(qMonth) && qMonth >= 1 && qMonth <= 12 ? qMonth : now.getMonth() + 1;

  const monthIndex = month1 - 1;
  const monthStart = new Date(year, monthIndex, 1);
  const monthNext = new Date(year, monthIndex + 1, 1);

  const startISO = ymd(monthStart);
  const nextISO = ymd(monthNext);

  const u = await supabaseAdmin.from("users").select("first_name").eq("id", uid).maybeSingle();

  if (u.error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: u.error.message }, { status: 500 });
  }

  const firstName = String((u.data as any)?.first_name || "").trim() || null;

  const p = await supabaseAdmin.from("sport_profile").select("goal").eq("user_id", uid).maybeSingle();

  if (p.error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: p.error.message }, { status: 500 });
  }

  const goal = String((p.data as any)?.goal || "").trim() || null;

  const wLast = await supabaseAdmin
    .from("sport_measurements")
    .select("value")
    .eq("user_id", uid)
    .eq("kind", "weight")
    .order("measured_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (wLast.error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wLast.error.message }, { status: 500 });
  }

  const weightRaw = (wLast.data as any)?.value ?? null;
  const weight = weightRaw === null ? null : Number(weightRaw);

  const { data: workouts, error: wErr } = await supabaseAdmin
    .from("workouts")
    .select("id, title, workout_date, type, duration, status, completed_at, created_at")
    .eq("user_id", uid)
    .gte("workout_date", startISO)
    .lt("workout_date", nextISO)
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (wErr) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    firstName,
    goal,
    weight: Number.isFinite(weight as any) ? weight : null,
    month: { year, month: month1, startISO, nextISO },
    workouts: workouts || [],
  });
}