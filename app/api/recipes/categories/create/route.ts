// /app/api/recipes/categories/create/route.ts

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

function cleanTitle(v: any) {
  return String(v ?? "").trim();
}

function slugifyId(title: string) {
  // простой id на латинице, чтобы не городить uuid (можно заменить потом)
  const base = title
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // если вдруг получилось пусто (например, только русские буквы) — fallback
  return base || `cat-${Date.now()}`;
}

type Body = { title?: string };

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const title = cleanTitle(body?.title);
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // возьмем max order_index
  const { data: maxRow, error: maxErr } = await supabaseAdmin
    .from("recipe_categories")
    .select("order_index")
    .eq("user_id", uid)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    return NextResponse.json(
      { error: "Failed to read max order_index", details: maxErr.message },
      { status: 500 }
    );
  }

  const maxIndex = typeof maxRow?.order_index === "number" ? maxRow.order_index : -1;
  const nextIndex = maxIndex + 1;

  const id = `${uid}-${slugifyId(title)}`;

  // пробуем insert. если id уже есть — добавим суффикс
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("recipe_categories")
    .insert({ id, title, order_index: nextIndex, user_id: uid })
    .select("id, title, order_index")
    .single();

  if (insErr) {
    // fallback на уникальный id
    const id2 = `${id}-${Date.now()}`;
    const { data: inserted2, error: insErr2 } = await supabaseAdmin
      .from("recipe_categories")
      .insert({ id: id2, title, order_index: nextIndex, user_id: uid })
      .select("id, title, order_index")
      .single();

    if (insErr2) {
      return NextResponse.json(
        { error: "Failed to create category", details: insErr2.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, category: inserted2 }, { status: 200 });
  }

  return NextResponse.json({ ok: true, category: inserted }, { status: 200 });
}