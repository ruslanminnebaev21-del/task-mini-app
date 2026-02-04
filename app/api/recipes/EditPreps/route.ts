// app/api/recipes/EditPreps/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PrepUnit = "portions" | "pieces";

const PREPS_TABLE = "recipes_preps";
const CATS_TABLE = "preps_categories";
const LINK_TABLE = "preps_to_categories";

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

function uniqStrings(arr: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const s = cleanStr(x);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const id = cleanStr(body?.id);
  const title = cleanStr(body?.title);
  const counts = cleanInt(body?.counts);
  const unit = cleanUnit(body?.unit);

  // новое: массив категорий
  const category_ids = Array.isArray(body?.category_ids) ? uniqStrings(body.category_ids) : null;

  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (counts === null || counts < 0) return NextResponse.json({ ok: false, error: "bad_counts" }, { status: 400 });

  // 1) убеждаемся, что заготовка твоя
  const { data: exists, error: existsErr } = await supabaseAdmin
    .from(PREPS_TABLE)
    .select("id")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();

  if (existsErr) return NextResponse.json({ ok: false, error: existsErr.message }, { status: 500 });
  if (!exists?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // 2) обновляем сам prep
  const { data: updated, error: updErr } = await supabaseAdmin
    .from(PREPS_TABLE)
    .update({ title, counts, unit })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id,title,counts,unit,created_at")
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ ok: false, error: updErr?.message ?? "update_failed" }, { status: 500 });
  }

  // 3) если прислали category_ids — синхронизируем таблицу связей
  let categories: { id: string; title: string }[] = [];

  if (category_ids !== null) {
    // валидируем категории (чтобы нельзя было прикрепить чужие)
    if (category_ids.length > 0) {
      const { data: catRows, error: catErr } = await supabaseAdmin
        .from(CATS_TABLE)
        .select("id,title")
        .eq("user_id", uid)
        .in("id", category_ids);

      if (catErr) return NextResponse.json({ ok: false, error: catErr.message }, { status: 500 });

      const got = new Set((catRows ?? []).map((x: any) => String(x.id)));
      const missing = category_ids.filter((x) => !got.has(x));
      if (missing.length) {
        return NextResponse.json({ ok: false, error: "bad_category_ids", details: missing }, { status: 400 });
      }

      categories = (catRows ?? []).map((x: any) => ({
        id: String(x.id),
        title: cleanStr(x.title),
      }));
    }

    // чистим связи
    const { error: delErr } = await supabaseAdmin.from(LINK_TABLE).delete().eq("prep_id", id);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    // вставляем новые
    if (category_ids.length > 0) {
      const rows = category_ids.map((cid) => ({
        prep_id: id,
        category_id: cid,
      }));

      const { error: insErr } = await supabaseAdmin.from(LINK_TABLE).insert(rows);
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    // вернуть категории в том же порядке, что выбрали
    if (categories.length) {
      const titleById = new Map(categories.map((c) => [c.id, c.title]));
      categories = category_ids
        .map((cid) => ({ id: cid, title: titleById.get(cid) ?? "" }))
        .filter((c) => c.title);
    }
  } else {
    // если массив не прислали — ничего не трогаем, но для фронта можно отдать пусто
    categories = [];
  }

  // совместимость: первая категория (если нужна где-то)
  const firstCat = categories[0] ?? null;

  return NextResponse.json(
    {
      ok: true,
      prep: {
        id: String(updated.id),
        title: String(updated.title),
        counts: Number(updated.counts),
        unit: updated.unit,
        created_at: updated.created_at ?? null,

        // новое
        categories,

        // совместимость
        category_id: firstCat ? firstCat.id : null,
        category_title: firstCat ? firstCat.title : null,
      },
    },
    { status: 200 }
  );
}