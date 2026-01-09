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

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id,name,created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, projects: data || [] });
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const name = String(body?.name || "").trim();

  if (!name) return NextResponse.json({ ok: false, reason: "NO_NAME" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({ user_id: uid, name })
    .select("id,name,created_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project: data });
}
