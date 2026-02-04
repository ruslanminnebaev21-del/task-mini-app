// app/api/recipes/newPreps/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PrepUnit = "portions" | "pieces";

const PREP_CATS_TABLE = "preps_categories";
const PREPS_TABLE = "recipes_preps";

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

function cleanInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function cleanUnit(v: any): PrepUnit {
  const s = cleanStr(v).toLowerCase();
  return s === "pieces" ? "pieces" : "portions";
}

function toIdOrNull(v: any) {
  const s = cleanStr(v);
  return s ? s : null;
}

// ✅ GET: список категорий для селекта (если тебе это реально нужно в этом роуте)
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from(PREP_CATS_TABLE)
    .select("id,title,created_at")
    .eq("user_id", uid)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const categories = (data ?? [])
    .map((c: any) => ({ id: String(c.id), title: cleanStr(c.title), created_at: c.created_at ?? null }))
    .filter((c: any) => c.id && c.title);

  return NextResponse.json({ ok: true, categories }, { status: 200 });
}

// ✅ POST: создание заготовки
export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const title = cleanStr(body?.title);
  const counts = cleanInt(body?.counts ?? body?.count ?? body?.portions ?? 0);
  const unit = cleanUnit(body?.unit);

  // ВАЖНО: в таблице recipes_preps поле prep_category_id
  const prep_category_id = toIdOrNull(body?.category_id ?? body?.prep_category_id);

  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (counts === null) return NextResponse.json({ ok: false, error: "counts_required" }, { status: 400 });
  if (counts < 0) return NextResponse.json({ ok: false, error: "bad_counts" }, { status: 400 });

  // Если пришла категория, проверяем что она существует и принадлежит пользователю
  let category_title: string | null = null;

  if (prep_category_id) {
    const { data: cat, error: catErr } = await supabaseAdmin
      .from(PREP_CATS_TABLE)
      .select("id,title")
      .eq("id", prep_category_id)
      .eq("user_id", uid)
      .maybeSingle();

    if (catErr) {
      return NextResponse.json({ ok: false, error: catErr.message }, { status: 500 });
    }
    if (!cat?.id) {
      return NextResponse.json({ ok: false, error: "bad_category" }, { status: 400 });
    }
    category_title = cleanStr(cat.title) || null;
  }

  const { data, error } = await supabaseAdmin
    .from(PREPS_TABLE)
    .insert({
      title,
      counts,
      unit,
      prep_category_id,
      user_id: uid,
    })
    .select("id,title,counts,unit,prep_category_id,user_id,created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      prep: {
        id: String(data.id),
        title: String(data.title ?? title),
        counts: Number(data.counts ?? counts),
        unit: data.unit,
        category_id: data.prep_category_id != null ? String(data.prep_category_id) : null,
        category_title,
        user_id: Number(data.user_id ?? uid),
        created_at: data.created_at ?? null,
      },
    },
    { status: 200 }
  );
}