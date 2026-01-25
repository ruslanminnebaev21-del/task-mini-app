// app/api/recipes/newPreps/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PrepUnit = "portions" | "pieces";

// ⚠️ если у тебя таблица категорий называется иначе — поменяй тут
const PREP_CATS_TABLE = "recipes_prep_categories";

async function getUidFromSession(): Promise<number | null> {
  const c = await cookies();
  const token = c.get("session")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as any;
    const uid = Number(payload?.uid);
    if (!uid || Number.isNaN(uid)) return null;
    return uid;
  } catch {
    return null;
  }
}

function cleanStr(v: any) {
  return String(v ?? "").trim();
}

function cleanInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function cleanUnit(v: any): PrepUnit {
  const s = cleanStr(v).toLowerCase();
  return s === "pieces" ? "pieces" : "portions";
}

// ✅ GET: список категорий для селекта
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // если у категорий есть user_id — фильтруем по uid
  // если user_id нет (общие категории) — просто убери .eq("user_id", uid)
  const { data, error } = await supabaseAdmin
    .from(PREP_CATS_TABLE)
    .select("id, title")
    .eq("user_id", uid)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Select failed", details: error.message }, { status: 500 });
  }

  const categories = (data ?? [])
    .map((c: any) => ({ id: String(c.id), title: cleanStr(c.title) }))
    .filter((c: any) => c.id && c.title);

  return NextResponse.json({ ok: true, categories }, { status: 200 });
}

// ✅ POST: создание заготовки
export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = cleanStr(body?.title);
  const countsRaw = body?.counts ?? body?.count ?? body?.portions;
  const counts = cleanInt(countsRaw);

  const category_id = cleanStr(body?.category_id) || null;
  const unit = cleanUnit(body?.unit);

  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
  if (counts === null) return NextResponse.json({ error: "counts_required" }, { status: 400 });
  if (counts < 0) return NextResponse.json({ error: "counts_must_be_non_negative" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("recipes_preps")
    .insert({
      title,
      counts,
      unit,
      category_id,
      user_id: uid,
    })
    .select("id, title, counts, unit, category_id, user_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Insert failed", details: error.message }, { status: 500 });
  }

  let category_title: string | null = null;

  if (category_id) {
    const { data: cat, error: catErr } = await supabaseAdmin
      .from(PREP_CATS_TABLE)
      .select("title")
      .eq("id", category_id)
      .maybeSingle();

    if (!catErr) category_title = cleanStr(cat?.title) || null;
  }

  return NextResponse.json(
    { ok: true, prep: { ...data, category_title } },
    { status: 200 }
  );
}