// app/api/recipes/categories/rename/route.ts
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

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const id = String(body?.id ?? "").trim();
  const title = String(body?.title ?? "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  }

  // ВАЖНО: имя таблицы проверь у себя. Обычно это recipe_categories
  const { error } = await supabaseAdmin
    .from("recipe_categories")
    .update({ title })
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    console.log("rename category db error:", error);
    return NextResponse.json({ ok: false, error: "db_error_rename_category" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}