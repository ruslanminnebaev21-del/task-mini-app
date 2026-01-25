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
    if (!uid || Number.isNaN(uid)) return null;
    return uid;
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
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = cleanStr(body?.id);
  const counts = toIntOrNull(body?.counts);
  const delta = toIntOrNull(body?.delta);

  if (!id) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  // Разрешаем либо counts, либо delta (или оба, но приоритет counts)
  if (counts === null && delta === null) {
    return NextResponse.json({ error: "counts_or_delta_required" }, { status: 400 });
  }

  // Если прислали counts — просто обновляем
  if (counts !== null) {
    if (counts < 0) {
      return NextResponse.json({ error: "counts_must_be_non_negative" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("recipes_preps")
      .update({ counts })
      .eq("id", id)
      .eq("user_id", uid)
      .select("id, title, counts, unit, category_id, user_id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Update failed", details: error.message }, { status: 500 });
    }

    // если не нашли запись (или не твоя)
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, prep: data }, { status: 200 });
  }

  // Иначе работаем через delta: сначала читаем текущие counts
  const { data: cur, error: readErr } = await supabaseAdmin
    .from("recipes_preps")
    .select("id, counts")
    .eq("id", id)
    .eq("user_id", uid)
    .single();

  if (readErr) {
    return NextResponse.json({ error: "Select failed", details: readErr.message }, { status: 500 });
  }
  if (!cur) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const nextCounts = Math.max(0, Number(cur.counts ?? 0) + Number(delta ?? 0));

  const { data, error } = await supabaseAdmin
    .from("recipes_preps")
    .update({ counts: nextCounts })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id, title, counts, unit, category_id, user_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Update failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, prep: data }, { status: 200 });
}