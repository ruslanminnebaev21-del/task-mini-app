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

function normUnit(v: any): PrepUnit {
  const s = cleanStr(v).toLowerCase();
  return s === "pieces" ? "pieces" : "portions";
}

export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const view = cleanStr(url.searchParams.get("view")) || "full"; // full | stock | out
  const limit = toIntOrNull(url.searchParams.get("limit")) ?? 500;

  let query = supabaseAdmin
    .from("recipes_preps")
    .select(
      `
        id,
        title,
        counts,
        unit,
        created_at,
        preps_to_categories (
          category_id,
          category:category_id (
            id,
            title
          )
        )
      `
    )
    .eq("user_id", uid);

  if (view === "stock") query = query.gt("counts", 0);
  if (view === "out") query = query.lte("counts", 0);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(2000, limit)));

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const preps = (data ?? []).map((x: any) => {
    const cats = Array.isArray(x.preps_to_categories) ? x.preps_to_categories : [];

    const categories = cats
      .map((r: any) => ({
        id: r?.category?.id != null ? String(r.category.id) : (r?.category_id != null ? String(r.category_id) : ""),
        title: r?.category?.title != null ? String(r.category.title) : "",
      }))
      .filter((c: any) => c.id && c.title);

    // если где-то фронт ещё ждёт старые поля — оставим "первую" категорию
    const first = categories[0] ?? null;

    return {
      id: String(x.id),
      title: String(x.title ?? ""),
      counts: Number(x.counts ?? 0),
      unit: normUnit(x.unit),
      created_at: x.created_at ?? null,

      categories, // ✅ массив категорий

      // ✅ совместимость (можешь потом убрать)
      category_id: first ? String(first.id) : null,
      category_title: first ? String(first.title) : null,
    };
  });

  return NextResponse.json({ ok: true, preps }, { status: 200 });
}