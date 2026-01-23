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

  // 1) рецепты
  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id, title, photo_path, prep_time_min, cook_time_min, kcal, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load recipes", details: error.message },
      { status: 500 }
    );
  }

  const rows = data ?? [];

  if (view === "ids") {
    return NextResponse.json(
      { ok: true, recipes: rows.map((r: any) => ({ id: r.id })) },
      { status: 200 }
    );
  }

  const recipeIds = rows.map((r: any) => r.id);

  // 2) связи recipes_to_categories
  const { data: links, error: linksErr } = await supabaseAdmin
    .from("recipes_to_categories")
    .select("recipe_id, category_id")
    .in("recipe_id", recipeIds);

  if (linksErr) {
    return NextResponse.json(
      { error: "Failed to load recipes_to_categories", details: linksErr.message },
      { status: 500 }
    );
  }

  const linksArr = links ?? [];
  const catIds = Array.from(
    new Set(linksArr.map((x: any) => String(x.category_id)).filter(Boolean))
  );

  // 3) сами категории (title)
  let catMap = new Map<string, { id: string; title: string }>();

  if (catIds.length) {
    const { data: cats, error: catsErr } = await supabaseAdmin
      .from("recipe_categories")
      .select("id, title")
      .in("id", catIds);

    if (catsErr) {
      return NextResponse.json(
        { error: "Failed to load recipe_categories", details: catsErr.message },
        { status: 500 }
      );
    }

    (cats ?? []).forEach((c: any) => {
      catMap.set(String(c.id), { id: String(c.id), title: String(c.title ?? "") });
    });
  }

  // 4) собрать categories по recipe_id
  const catsByRecipeId: Record<string, { id: string; title: string }[]> = {};

  linksArr.forEach((l: any) => {
    const rid = String(l.recipe_id);
    const cid = String(l.category_id);
    const cat = catMap.get(cid);
    if (!cat) return;
    if (!catsByRecipeId[rid]) catsByRecipeId[rid] = [];
    catsByRecipeId[rid].push(cat);
  });

  const recipes = rows.map((r: any) => ({
    id: r.id,
    title: r.title ?? "",
    photo_path: r.photo_path ?? null,
    photo_url: publicUrlForPath(r.photo_path ?? null),
    prep_time_min: r.prep_time_min ?? null,
    cook_time_min: r.cook_time_min ?? null,
    kcal: r.kcal ?? null,
    categories: catsByRecipeId[String(r.id)] ?? [],
  }));

  return NextResponse.json({ ok: true, recipes }, { status: 200 });
}