// app/api/recipes/list/route.ts
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
  const view = cleanStr(url.searchParams.get("view")) || "meta"; // meta | ids

  // 1) recipes
  const { data: dataRecipes, error: rErr } = await supabaseAdmin
    .from("recipes")
    .select("id, title, photo_path, prep_time_min, cook_time_min, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (rErr) {
    return NextResponse.json(
      { error: "Failed to load recipes", details: rErr.message },
      { status: 500 }
    );
  }

  const baseRecipes = Array.isArray(dataRecipes) ? dataRecipes : [];

  if (view === "ids") {
    return NextResponse.json(
      { ok: true, recipes: baseRecipes.map((r: any) => ({ id: r.id })) },
      { status: 200 }
    );
  }

  if (baseRecipes.length === 0) {
    return NextResponse.json({ ok: true, recipes: [] }, { status: 200 });
  }

  const recipeIds = baseRecipes.map((r: any) => r.id);

  // 2) links recipe -> category
  const { data: links, error: lErr } = await supabaseAdmin
    .from("recipes_to_categories")
    .select("recipe_id, category_id")
    .in("recipe_id", recipeIds);

  if (lErr) {
    return NextResponse.json(
      { error: "Failed to load recipe categories links", details: lErr.message },
      { status: 500 }
    );
  }

  const safeLinks = Array.isArray(links) ? links : [];
  const categoryIds = Array.from(
    new Set(safeLinks.map((x: any) => cleanStr(x.category_id)).filter(Boolean))
  );

  // 3) categories dictionary
  let catMap = new Map<string, { id: string; title: string }>();

  if (categoryIds.length) {
    const { data: cats, error: cErr } = await supabaseAdmin
      .from("recipe_categories")
      .select("id, title")
      .in("id", categoryIds);

    if (cErr) {
      return NextResponse.json(
        { error: "Failed to load categories", details: cErr.message },
        { status: 500 }
      );
    }

    (cats ?? []).forEach((c: any) => {
      catMap.set(String(c.id), { id: String(c.id), title: String(c.title ?? "") });
    });
  }

  // 4) group categories by recipe_id
  const catsByRecipe = new Map<number, { id: string; title: string }[]>();
  for (const l of safeLinks) {
    const rid = Number(l.recipe_id);
    const cid = cleanStr(l.category_id);
    const cat = catMap.get(cid);
    if (!rid || !cat) continue;

    const arr = catsByRecipe.get(rid) ?? [];
    // защита от дублей
    if (!arr.some((x) => x.id === cat.id)) arr.push(cat);
    catsByRecipe.set(rid, arr);
  }

  const recipes = baseRecipes.map((r: any) => ({
    id: r.id,
    title: r.title ?? "",
    photo_path: r.photo_path ?? null,
    photo_url: publicUrlForPath(r.photo_path ?? null),
    prep_time_min: r.prep_time_min ?? null,
    cook_time_min: r.cook_time_min ?? null,
    categories: catsByRecipe.get(Number(r.id)) ?? [],
  }));

  return NextResponse.json({ ok: true, recipes }, { status: 200 });
}