// app/api/recipes/listPreps/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PrepUnit = "portions" | "pieces";

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

function normUnit(v: any): PrepUnit {
  const s = cleanStr(v).toLowerCase();
  return s === "pieces" ? "pieces" : "portions";
}

export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = cleanStr(url.searchParams.get("view")) || "full"; // full | stock | out
  const limit = toIntOrNull(url.searchParams.get("limit")) ?? 500;

  let query = supabaseAdmin
    .from("recipes_preps")
    .select(`
      id,
      title,
      counts,
      unit,
      category_id,
      created_at,
      category:recipe_categories!recipes_preps_category_id_fkey (
        title,
        user_id
      )
    `)
    .eq("user_id", uid)
    .or(`category.is.null,category.user_id.eq.${uid}`);

  if (view === "stock") query = query.gt("counts", 0);
  if (view === "out") query = query.lte("counts", 0);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(2000, limit)));

  if (error) {
    return NextResponse.json(
      { error: "Select failed", details: error.message },
      { status: 500 }
    );
  }

  const preps = (data ?? []).map((x: any) => ({
    id: x.id,
    title: x.title,
    counts: x.counts,
    unit: normUnit(x.unit),
    category_id: x.category_id,
    category_title: x.recipe_categories?.title ?? null,
    created_at: x.created_at,
  }));

  return NextResponse.json({ ok: true, preps }, { status: 200 });
}