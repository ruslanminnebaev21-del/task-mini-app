// app/api/recipes/updatePreps/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PREPS_TABLE = "recipes_preps";
const CATS_TABLE = "preps_categories";
const LINK_TABLE = "preps_to_categories";

type Unit = "portions" | "pieces";

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

function toIntOrNull(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normUnit(v: any): Unit | null {
  return v === "pieces" || v === "portions" ? v : null;
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const id = cleanStr(body?.id);
  const counts = toIntOrNull(body?.counts);
  const delta = toIntOrNull(body?.delta);

  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  if (counts === null && delta === null) {
    return NextResponse.json({ ok: false, error: "counts_or_delta_required" }, { status: 400 });
  }

  // 0) проверим, что запись твоя
  const { data: exists, error: existsErr } = await supabaseAdmin
    .from(PREPS_TABLE)
    .select("id")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();

  if (existsErr) return NextResponse.json({ ok: false, error: existsErr.message }, { status: 500 });
  if (!exists?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // 1) считаем nextCounts
  let nextCounts: number;

  if (counts !== null) {
    if (counts < 0) return NextResponse.json({ ok: false, error: "bad_counts" }, { status: 400 });
    nextCounts = counts;
  } else {
    const { data: cur, error: curErr } = await supabaseAdmin
      .from(PREPS_TABLE)
      .select("counts")
      .eq("id", id)
      .eq("user_id", uid)
      .single();

    if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });

    nextCounts = Math.max(0, Number((cur as any)?.counts ?? 0) + Number(delta ?? 0));
  }

  // 2) обновляем counts
  const { data: upd, error: updErr } = await supabaseAdmin
    .from(PREPS_TABLE)
    .update({ counts: nextCounts })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id,title,counts,unit,created_at")
    .single();

  if (updErr || !upd) {
    return NextResponse.json({ ok: false, error: updErr?.message ?? "update_failed" }, { status: 500 });
  }

  // 3) подтянем категории (множественные) для карточки
  const { data: links, error: linkErr } = await supabaseAdmin
    .from(LINK_TABLE)
    .select("category_id")
    .eq("prep_id", id);

  if (linkErr) return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });

  const catIds = (links ?? [])
    .map((x: any) => cleanStr(x.category_id))
    .filter(Boolean);

  let categories: { id: string; title: string }[] = [];

  if (catIds.length) {
    const { data: catRows, error: catErr } = await supabaseAdmin
      .from(CATS_TABLE)
      .select("id,title")
      .eq("user_id", uid)
      .in("id", catIds);

    if (catErr) return NextResponse.json({ ok: false, error: catErr.message }, { status: 500 });

    const titleById = new Map((catRows ?? []).map((c: any) => [String(c.id), cleanStr(c.title)]));

    // сохраним порядок как в связях
    categories = catIds
      .map((cid) => ({ id: cid, title: titleById.get(cid) ?? "" }))
      .filter((c) => c.title);
  }

  // совместимость: первая категория
  const firstCat = categories[0] ?? null;

  return NextResponse.json(
    {
      ok: true,
      prep: {
        id: String((upd as any).id),
        title: cleanStr((upd as any).title),
        counts: Number((upd as any).counts ?? nextCounts),
        unit: normUnit((upd as any).unit),
        created_at: (upd as any).created_at ?? null,

        categories,

        category_id: firstCat ? firstCat.id : null,
        category_title: firstCat ? firstCat.title : null,
      },
    },
    { status: 200 }
  );
}