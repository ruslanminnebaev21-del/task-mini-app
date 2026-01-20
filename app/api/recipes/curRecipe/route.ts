// app/api/recipes/curRecipe/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "recipes";

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

function toIntSafe(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function publicUrlForPath(path: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return null;
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;
}

export async function GET(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const recipeIdRaw =
    url.searchParams.get("recipe_id") ??
    url.searchParams.get("id") ??
    url.searchParams.get("recipeId");

  const recipe_id = toIntSafe(recipeIdRaw);
  if (!recipe_id) {
    return NextResponse.json({ error: "recipe_id is required" }, { status: 400 });
  }

  const view = cleanStr(url.searchParams.get("view")) || "full";
  // view: "full" | "meta" | "photo"

  // 1) сам рецепт (и проверка owner)
  const { data: recipe, error: rErr } = await supabaseAdmin
    .from("recipes")
    .select(
      "id, user_id, title, photo_path, source_url, portions, prep_time_min, cook_time_min, created_at, updated_at"
    )
    .eq("id", recipe_id)
    .single();

  if (rErr || !recipe?.id) {
    return NextResponse.json(
      { error: "Recipe not found", details: rErr?.message ?? null },
      { status: 404 }
    );
  }

  if (Number(recipe.user_id) !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recipe_photo_url = publicUrlForPath(recipe.photo_path ?? null);

  // 2) быстрые режимы
  if (view === "photo") {
    return NextResponse.json(
      {
        ok: true,
        recipe_id: recipe.id,
        photo_path: recipe.photo_path ?? null,
        photo_url: recipe_photo_url,
      },
      { status: 200 }
    );
  }

  if (view === "meta") {
    return NextResponse.json(
      {
        ok: true,
        recipe: {
          id: recipe.id,
          title: recipe.title,
          portions: recipe.portions ?? null,
          prep_time_min: recipe.prep_time_min ?? null,
          cook_time_min: recipe.cook_time_min ?? null,
          photo_path: recipe.photo_path ?? null,
          photo_url: recipe_photo_url,
        },
      },
      { status: 200 }
    );
  }

  // 3) full: ингредиенты
  const { data: ingData, error: ingErr } = await supabaseAdmin
    .from("recipe_ingredients")
    .select("id, pos, text")
    .eq("recipe_id", recipe_id)
    .order("pos", { ascending: true });

  if (ingErr) {
    return NextResponse.json(
      { error: "Failed to load ingredients", details: ingErr.message },
      { status: 500 }
    );
  }

  // 4) full: шаги
  const { data: stepsData, error: stepsErr } = await supabaseAdmin
    .from("recipe_steps")
    .select("id, pos, text, photo_path")
    .eq("recipe_id", recipe_id)
    .order("pos", { ascending: true });

  if (stepsErr) {
    return NextResponse.json(
      { error: "Failed to load steps", details: stepsErr.message },
      { status: 500 }
    );
  }

  const steps = (stepsData ?? []).map((s) => ({
    id: s.id,
    pos: s.pos,
    text: s.text,
    photo_path: s.photo_path ?? null,
    photo_url: publicUrlForPath(s.photo_path ?? null),
  }));

  // 5) full: категории (через таблицу связей)
  const { data: rtc, error: rtcErr } = await supabaseAdmin
    .from("recipes_to_categories")
    .select("category_id")
    .eq("recipe_id", recipe_id);

  if (rtcErr) {
    return NextResponse.json(
      { error: "Failed to load categories links", details: rtcErr.message },
      { status: 500 }
    );
  }

  const categoryIds = (rtc ?? [])
    .map((x: any) => cleanStr(x.category_id))
    .filter(Boolean);

  let categories: { id: string; title: string }[] = [];

  if (categoryIds.length) {
    const { data: cats, error: catsErr } = await supabaseAdmin
      .from("recipe_categories")
      .select("id, title")
      .in("id", categoryIds);

    if (catsErr) {
      return NextResponse.json(
        { error: "Failed to load categories", details: catsErr.message },
        { status: 500 }
      );
    }

    // сохраним порядок как в links (если важно)
    const map = new Map((cats ?? []).map((c: any) => [String(c.id), c]));
    categories = categoryIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((c: any) => ({ id: String(c.id), title: String(c.title) }));
  }

  return NextResponse.json(
    {
      ok: true,
      recipe: {
        id: recipe.id,
        title: recipe.title,
        photo_path: recipe.photo_path ?? null,
        photo_url: recipe_photo_url,
        source_url: recipe.source_url ?? null,
        portions: recipe.portions ?? null,
        prep_time_min: recipe.prep_time_min ?? null,
        cook_time_min: recipe.cook_time_min ?? null,
        created_at: recipe.created_at ?? null,
        updated_at: recipe.updated_at ?? null,
      },
      categories,
      ingredients: (ingData ?? []).map((i: any) => ({
        id: i.id,
        pos: i.pos,
        text: i.text,
      })),
      steps,
    },
    { status: 200 }
  );
}