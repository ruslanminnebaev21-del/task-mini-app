// app/api/recipes/prepCategories/delPrepCategories/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PREP_CATS_TABLE = "preps_categories"; // твоя таблица категорий
const LINK_TABLE = "preps_to_categories"; // связь prep_id <-> category_id

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

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = cleanStr(body?.id);

  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  // 1) проверяем что категория существует и принадлежит пользователю
  const { data: cat, error: catErr } = await supabaseAdmin
    .from(PREP_CATS_TABLE)
    .select("id")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();

  if (catErr) {
    return NextResponse.json({ ok: false, error: catErr.message }, { status: 500 });
  }
  if (!cat?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // 2) удаляем связи (на всякий случай, если нет ON DELETE CASCADE)
  const { error: linkErr } = await supabaseAdmin
    .from(LINK_TABLE)
    .delete()
    .eq("category_id", id);

  if (linkErr) {
    return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });
  }

  // 3) удаляем саму категорию
  const { error: delErr } = await supabaseAdmin
    .from(PREP_CATS_TABLE)
    .delete()
    .eq("id", id)
    .eq("user_id", uid);

  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id }, { status: 200 });
}