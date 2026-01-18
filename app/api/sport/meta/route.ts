// app/api/sport/meta/route.ts
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

export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  // берём самую свежую дату изменения по workouts
  const { data, error } = await supabaseAdmin
    .from("workouts")
    .select("updated_at")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  const latest = (data && data[0] && (data[0] as any).updated_at) ? String((data[0] as any).updated_at) : null;

  return NextResponse.json({
    ok: true,
    rev: {
      workouts: latest, // строка ISO или null, если записей нет
    },
  });
}