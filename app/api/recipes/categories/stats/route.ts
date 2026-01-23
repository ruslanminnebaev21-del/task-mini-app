// app/api/recipes/categories/stats/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getUidFromSession(): Promise<number | null> {
  const c = await cookies(); // важно: await (у тебя Next 16 ругается иначе)
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
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // 1) категории
  const { data: cats, error: catsErr } = await supabaseAdmin
    .from("recipe_categories")
    .select("id,title,order_index")
    .order("order_index", { ascending: true });

  if (catsErr) {
    return NextResponse.json({ ok: false, error: "db_error_categories" }, { status: 500 });
  }

  // 2) counts по категориям
  // Берём связку -> рецепты, чтобы учитывать только рецепты текущего пользователя
  const { data: links, error: linksErr } = await supabaseAdmin
    .from("recipes_to_categories")
    .select("category_id, recipes!inner(user_id)")
    .eq("recipes.user_id", uid);

  if (linksErr) {
    return NextResponse.json({ ok: false, error: "db_error_counts" }, { status: 500 });
  }

  const countsByCatId: Record<string, number> = {};
  (links ?? []).forEach((row: any) => {
    const cid = String(row.category_id);
    countsByCatId[cid] = (countsByCatId[cid] ?? 0) + 1;
  });

  // 3) "без категорий"
  // Список рецептов пользователя
  const { data: myRecipes, error: rErr } = await supabaseAdmin
    .from("recipes")
    .select("id")
    .eq("user_id", uid);

  if (rErr) {
    return NextResponse.json({ ok: false, error: "db_error_recipes" }, { status: 500 });
  }

  const recipeIds = (myRecipes ?? []).map((x: any) => Number(x.id)).filter((x: any) => Number.isFinite(x));

  let noneCount = 0;
  if (!recipeIds.length) {
    noneCount = 0;
  } else {
    // какие recipe_id вообще имеют хотя бы одну категорию
    const { data: hasCats, error: hcErr } = await supabaseAdmin
      .from("recipes_to_categories")
      .select("recipe_id")
      .in("recipe_id", recipeIds);

    if (hcErr) {
      return NextResponse.json({ ok: false, error: "db_error_none_count" }, { status: 500 });
    }

    const withCats = new Set((hasCats ?? []).map((x: any) => Number(x.recipe_id)));
    noneCount = recipeIds.reduce((acc, id) => acc + (withCats.has(id) ? 0 : 1), 0);
  }

  return NextResponse.json({
    ok: true,
    categories: Array.isArray(cats) ? cats : [],
    countsByCatId,
    noneCount,
  });
}