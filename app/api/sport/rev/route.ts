// app/api/sport/rev/route.ts
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

/**
 * GET /api/sport/rev
 * Возвращает ревизию данных пользователя, которую мы бампим при любых изменениях.
 */
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("app_rev, app_updated_at")
    .eq("id", uid)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, reason: "DB_ERROR", error: error?.message || "users row not found" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    rev: { workouts: Number(data.app_rev || 0) },
    updated_at: data.app_updated_at,
  });
}