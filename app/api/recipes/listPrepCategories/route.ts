// app/api/recipes/listPrepCategories/route.ts
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

export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("recipe_categories")
    .select("id, title")
    .eq("user_id", uid) // ✅ только категории текущего пользователя
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Select failed", details: error.message }, { status: 500 });
  }

  const categories = (data ?? [])
    .map((c: any) => ({ id: String(c.id), title: cleanStr(c.title) }))
    .filter((c) => c.id && c.title);

  return NextResponse.json({ ok: true, categories }, { status: 200 });
}