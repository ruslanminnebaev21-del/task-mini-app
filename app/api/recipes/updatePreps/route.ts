// app/api/recipes/updatePreps/route.ts

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

function toIntOrNull(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
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

  // 1) Если пришёл counts — обновляем напрямую
  if (counts !== null) {
    if (counts < 0) return NextResponse.json({ ok: false, error: "bad_counts" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("recipes_preps")
      .update({ counts })
      .eq("id", id)
      .eq("user_id", uid)
      // важно: поле категории = prep_category_id
      .select("id,title,counts,unit,prep_category_id,created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        prep: {
          id: String(data.id),
          title: String((data as any).title ?? ""),
          counts: Number((data as any).counts ?? counts),
          unit: (data as any).unit ?? null,
          category_id: (data as any).prep_category_id != null ? String((data as any).prep_category_id) : null,
          created_at: (data as any).created_at ?? null,
        },
      },
      { status: 200 }
    );
  }

  // 2) Иначе delta: читаем текущий counts и пишем новый
  const { data: cur, error: readErr } = await supabaseAdmin
    .from("recipes_preps")
    .select("id,counts")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();

  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const nextCounts = Math.max(0, Number((cur as any).counts ?? 0) + Number(delta ?? 0));

  const { data, error } = await supabaseAdmin
    .from("recipes_preps")
    .update({ counts: nextCounts })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id,title,counts,unit,prep_category_id,created_at")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json(
    {
      ok: true,
      prep: {
        id: String(data.id),
        title: String((data as any).title ?? ""),
        counts: Number((data as any).counts ?? nextCounts),
        unit: (data as any).unit ?? null,
        category_id: (data as any).prep_category_id != null ? String((data as any).prep_category_id) : null,
        created_at: (data as any).created_at ?? null,
      },
    },
    { status: 200 }
  );
}