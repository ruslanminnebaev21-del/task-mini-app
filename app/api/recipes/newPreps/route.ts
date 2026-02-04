// app/api/recipes/newPreps/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PrepUnit = "portions" | "pieces";

const PREP_CATS_TABLE = "preps_categories";
const PREPS_TABLE = "recipes_preps";
const PREPS_TO_CATS_TABLE = "preps_to_categories";

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

function toIdArray(v: any): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => cleanStr(x)).filter(Boolean);
  }
  const one = toIdOrNull(v);
  return one ? [one] : [];
}

// ✅ GET: список категорий (если используешь этот роут как справочник)
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from(PREP_CATS_TABLE)
    .select("id,title,created_at")
    .eq("user_id", uid)
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const categories = (data ?? [])
    .map((c: any) => ({ id: String(c.id), title: cleanStr(c.title), created_at: c.created_at ?? null }))
    .filter((c: any) => c.id && c.title);

  return NextResponse.json({ ok: true, categories }, { status: 200 });
}

// ✅ POST: создание заготовки + привязка категорий many-to-many
export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const title = cleanStr(body?.title);
  const counts = cleanInt(body?.counts ?? body?.count ?? body?.portions ?? 0);
  const unit = cleanUnit(body?.unit);

  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (counts === null) return NextResponse.json({ ok: false, error: "counts_required" }, { status: 400 });
  if (counts < 0) return NextResponse.json({ ok: false, error: "bad_counts" }, { status: 400 });

  // ✅ категории (новое)
  // ожидаем: category_ids: string[]
  // для совместимости: category_id
  const categoryIdsRaw = toIdArray(body?.category_ids);
  const legacyOne = toIdOrNull(body?.category_id);
  const categoryIds = Array.from(new Set([...categoryIdsRaw, ...(legacyOne ? [legacyOne] : [])]));

  // 1) создаём заготовку
  const { data: prep, error: prepErr } = await supabaseAdmin
    .from(PREPS_TABLE)
    .insert({
      title,
      counts,
      unit,
      user_id: uid,
    })
    .select("id,title,counts,unit,user_id,created_at")
    .single();

  if (prepErr || !prep) {
    return NextResponse.json({ ok: false, error: prepErr?.message ?? "insert_failed" }, { status: 500 });
  }

  // 2) если есть категории — валидируем и пишем в preps_to_categories
  let categories: { id: string; title: string }[] = [];

  if (categoryIds.length > 0) {
    // валидируем: категории должны принадлежать uid
    const { data: cats, error: catsErr } = await supabaseAdmin
      .from(PREP_CATS_TABLE)
      .select("id,title")
      .eq("user_id", uid)
      .in("id", categoryIds);

    if (catsErr) {
      return NextResponse.json({ ok: false, error: catsErr.message }, { status: 500 });
    }

    const foundIds = new Set((cats ?? []).map((c: any) => String(c.id)));
    const missing = categoryIds.filter((id) => !foundIds.has(String(id)));
    if (missing.length) {
      return NextResponse.json({ ok: false, error: "bad_category" }, { status: 400 });
    }

    const rows = categoryIds.map((cid) => ({
      prep_id: Number(prep.id),
      category_id: String(cid),
    }));

    const { error: linkErr } = await supabaseAdmin.from(PREPS_TO_CATS_TABLE).insert(rows);
    if (linkErr) {
      return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });
    }

    categories = (cats ?? [])
      .map((c: any) => ({ id: String(c.id), title: cleanStr(c.title) }))
      .filter((c: any) => c.id && c.title)
      .sort((a, b) => a.title.localeCompare(b.title, "ru", { sensitivity: "base" }));
  }

  const first = categories[0] ?? null;

  return NextResponse.json(
    {
      ok: true,
      prep: {
        id: String(prep.id),
        title: String(prep.title ?? title),
        counts: Number(prep.counts ?? counts),
        unit: prep.unit,
        user_id: Number(prep.user_id ?? uid),
        created_at: prep.created_at ?? null,

        categories, // ✅ массив категорий

        // ✅ временная совместимость
        category_id: first ? first.id : null,
        category_title: first ? first.title : null,
      },
    },
    { status: 200 }
  );
}