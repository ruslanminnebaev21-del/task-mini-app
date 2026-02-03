
// app/api/recipes/prepCategories/addPrepCategories/route.ts

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
    return Number.isFinite(uid) ? uid : null;
  } catch {
    return null;
  }
}

function cleanStr(v: any) {
  return String(v ?? "").trim();
}

function makeId() {
  return `pc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const title = cleanStr(body?.title);
  const id = cleanStr(body?.id) || makeId();

  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  // простая защита от дублей по названию у одного пользователя
  const { data: exists, error: existsErr } = await supabaseAdmin
    .from("preps_categories")
    .select("id")
    .eq("user_id", uid)
    .ilike("title", title)
    .limit(1);

  if (existsErr) {
    return NextResponse.json({ ok: false, error: existsErr.message }, { status: 500 });
  }
  if ((exists ?? []).length) {
    return NextResponse.json({ ok: false, error: "title_exists" }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("preps_categories")
    .insert([{ id, user_id: uid, title }])
    .select("id,user_id,title,created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      category: {
        id: String((data as any).id),
        user_id: Number((data as any).user_id),
        title: String((data as any).title ?? ""),
        created_at: String((data as any).created_at ?? ""),
      },
    },
    { status: 200 }
  );
}