// /app/api/recipes/categories/delete/route.ts
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

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const category_id = cleanStr(body?.id);
  if (!category_id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (category_id === "__none__") {
    return NextResponse.json({ error: "Cannot delete __none__" }, { status: 400 });
  }
  const { data: owned, error: ownErr } = await supabaseAdmin
    .from("recipe_categories")
    .select("id")
    .eq("id", category_id)
    .eq("user_id", uid)
    .maybeSingle();

  if (ownErr) {
    return NextResponse.json({ error: "Failed to check owner", details: ownErr.message }, { status: 500 });
  }
  if (!owned?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1) удаляем связи (чтобы не упереться в FK)
  const { error: linkErr } = await supabaseAdmin
    .from("recipes_to_categories")
    .delete()
    .eq("category_id", category_id);

  if (linkErr) {
    return NextResponse.json(
      { error: "Failed to delete links", details: linkErr.message },
      { status: 500 }
    );
  }

  // 2) удаляем саму категорию
  const { error: catErr } = await supabaseAdmin
    .from("recipe_categories")
    .delete()
    .eq("id", category_id)
    .eq("user_id", uid);

  if (catErr) {
    return NextResponse.json(
      { error: "Failed to delete category", details: catErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}