// app/api/recipes/deletePreps/route.ts
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

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = cleanStr(body?.id);
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  // ✅ удаляем только свои записи
  const { error } = await supabaseAdmin
    .from("recipes_preps")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    return NextResponse.json({ error: "Delete failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}