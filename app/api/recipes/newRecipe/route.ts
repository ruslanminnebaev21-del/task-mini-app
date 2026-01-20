// app/api/recipes/newRecipe/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TimeParts = { d?: string; h?: string; m?: string };

type NewRecipeBody = {
  title: string;
  url?: string | null;
  portions?: string | number | null;

  category_ids?: string[];

  prep_time?: TimeParts | null;
  cook_time?: TimeParts | null;
  prep_time_min?: number | null;
  cook_time_min?: number | null;

  ingredients?: string[];

  steps?: { text: string; photo_path?: string | null }[];

  photo_path?: string | null;
};

const BUCKET = "recipes";

function publicUrlForPath(path: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return null;
  const cleanBase = base.replace(/\/+$/, "");
  // публичный url для public bucket
  return `${cleanBase}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;
}

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

function toIntSafe(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function clampNonNeg(n: number | null): number | null {
  if (n === null) return null;
  return n < 0 ? 0 : n;
}

function timePartsToMinutes(t?: TimeParts | null): number | null {
  if (!t) return null;
  const d = toIntSafe(t.d) ?? 0;
  const h = toIntSafe(t.h) ?? 0;
  const m = toIntSafe(t.m) ?? 0;
  return d * 1440 + h * 60 + m;
}

function cleanStr(s: any): string {
  return String(s ?? "").trim();
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: NewRecipeBody;
  try {
    body = (await req.json()) as NewRecipeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = cleanStr(body.title);
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const source_url = body.url ? cleanStr(body.url) : null;

  const portionsNum = toIntSafe(body.portions);
  const portions = portionsNum === null ? null : portionsNum;

  const prep_time_min = clampNonNeg(
    body.prep_time_min !== undefined && body.prep_time_min !== null
      ? toIntSafe(body.prep_time_min)
      : timePartsToMinutes(body.prep_time)
  );

  const cook_time_min = clampNonNeg(
    body.cook_time_min !== undefined && body.cook_time_min !== null
      ? toIntSafe(body.cook_time_min)
      : timePartsToMinutes(body.cook_time)
  );

  const category_ids = Array.isArray(body.category_ids)
    ? body.category_ids.map(cleanStr).filter(Boolean)
    : [];

  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients.map(cleanStr).filter(Boolean)
    : [];

  const steps = Array.isArray(body.steps)
    ? body.steps
        .map((s) => ({
          text: cleanStr(s?.text),
          photo_path: s?.photo_path ? cleanStr(s.photo_path) : null,
        }))
        .filter((s) => s.text.length > 0)
    : [];

  const photo_path = body.photo_path ? cleanStr(body.photo_path) : null;

  // 1) создаем рецепт
  const { data: created, error: eCreate } = await supabaseAdmin
    .from("recipes")
    .insert({
      user_id: uid,
      title,
      source_url,
      portions,
      prep_time_min,
      cook_time_min,
      photo_path,
    })
    .select("id, photo_path")
    .single();

  if (eCreate || !created?.id) {
    return NextResponse.json(
      { error: "Failed to create recipe", details: eCreate?.message ?? null },
      { status: 500 }
    );
  }

  const recipe_id = created.id as number;

  async function rollbackAndFail(message: string, details?: any) {
    await supabaseAdmin.from("recipes").delete().eq("id", recipe_id);
    return NextResponse.json({ error: message, details: details ?? null }, { status: 500 });
  }

  // 2) категории
  if (category_ids.length) {
    const rows = category_ids.map((category_id) => ({ recipe_id, category_id }));
    const { error } = await supabaseAdmin.from("recipes_to_categories").insert(rows);
    if (error) return rollbackAndFail("Failed to save categories", error.message);
  }

  // 3) ингредиенты
  if (ingredients.length) {
    const rows = ingredients.map((text, idx) => ({ recipe_id, pos: idx + 1, text }));
    const { error } = await supabaseAdmin.from("recipe_ingredients").insert(rows);
    if (error) return rollbackAndFail("Failed to save ingredients", error.message);
  }

  // 4) шаги
  if (steps.length) {
    const rows = steps.map((s, idx) => ({
      recipe_id,
      pos: idx + 1,
      text: s.text,
      photo_path: s.photo_path,
    }));
    const { error } = await supabaseAdmin.from("recipe_steps").insert(rows);
    if (error) return rollbackAndFail("Failed to save steps", error.message);
  }

  // public urls (bucket public)
  const recipe_photo_url = publicUrlForPath(photo_path);
  const step_photo_urls = steps.map((s, idx) => ({
    pos: idx + 1,
    photo_path: s.photo_path,
    photo_url: publicUrlForPath(s.photo_path ?? null),
  }));

  return NextResponse.json(
    {
      ok: true,
      recipe_id,
      photo_path,
      photo_url: recipe_photo_url,
      step_photos: step_photo_urls,
    },
    { status: 200 }
  );
}