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

function toNumOrNull(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const url = new URL(req.url);
  const view = url.searchParams.get("view"); // "today" или null
  const projectId = toNumOrNull(url.searchParams.get("projectId"));

  let q = supabaseAdmin
    .from("tasks")
    .select("id,title,due_date,done,project_id")
    .eq("user_id", uid);

  if (projectId) q = q.eq("project_id", projectId);

  if (view === "today") {
    q = q.gte("due_date", todayStr());
  }

  const { data, error } = await q
    .order("due_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tasks: data || [] });
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const title = String(body?.title || "").trim();
  const due_date = body?.due_date ? String(body.due_date) : null;
  const project_id = Number.isFinite(Number(body?.projectId)) ? Number(body.projectId) : null;

  if (!title) return NextResponse.json({ ok: false, reason: "NO_TITLE" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert({
      user_id: uid,
      title,
      due_date,
      done: false,
      project_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, task: data });
}

export async function PATCH(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const id = Number(body?.id);
  const done = Boolean(body?.done);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .update({ done })
    .eq("id", id)
    .eq("user_id", uid)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, task: data });
}