// /app/api/recipes/categories/reorder/route.ts
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

type Body = {
  order: { id: string; order_index?: number }[];
};

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const orderRaw = Array.isArray(body?.order) ? body.order : [];
  if (!orderRaw.length) {
    return NextResponse.json({ error: "order is required" }, { status: 400 });
  }

  // 1) чистим вход: убираем "__none__" и пустые id
  const ids = orderRaw
    .map((x) => String(x?.id ?? "").trim())
    .filter((id) => id && id !== "__none__");

  if (!ids.length) {
    return NextResponse.json({ error: "No valid ids in order" }, { status: 400 });
  }

  // 2) берём только те id, которые реально есть в таблице
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("recipe_categories")
    .select("id")
    .eq("user_id", uid)
    .in("id", ids);

  if (exErr) {
    return NextResponse.json(
      { error: "Failed to load existing ids", details: exErr.message },
      { status: 500 }
    );
  }

  const existingSet = new Set((existing ?? []).map((x: any) => String(x.id)));

  // 3) вычисляем order_index на сервере, чтобы не ловить NaN
  // делаем шаг 10, чтобы потом можно было “вставлять между”
  const payload = ids
    .filter((id) => existingSet.has(id))
    .map((id, i) => ({
      id,
      order_index: i * 10,
    }));

  if (!payload.length) {
    return NextResponse.json({ error: "No existing ids to update" }, { status: 400 });
  }

  // 4) обновляем только существующие строки (без INSERT)
  const updates = await Promise.all(
    payload.map((p) =>
      supabaseAdmin
        .from("recipe_categories")
        .update({ order_index: p.order_index })
        .eq("id", p.id)
        .eq("user_id", uid)
    )
  );

  const firstErr = updates.find((u) => u.error)?.error;
  if (firstErr) {
    return NextResponse.json(
      { error: "Failed to reorder", details: firstErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}