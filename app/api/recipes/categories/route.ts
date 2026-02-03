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

export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("recipe_categories")
    .select("id, title, order_index")
    .eq("user_id", uid)
    .order("order_index", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load categories", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ categories: data ?? [] }, { status: 200 });
}