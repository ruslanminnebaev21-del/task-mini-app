// app/api/recipes/deleteRecipe/route.ts
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

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const recipeId = Number(body?.recipe_id);
  if (!Number.isFinite(recipeId) || recipeId <= 0) {
    return NextResponse.json({ ok: false, error: "recipe_id_required" }, { status: 400 });
  }

  // 1) проверяем владельца и сразу забираем photo_path рецепта
  const { data: recipeRow, error: ownerErr } = await supabaseAdmin
    .from("recipes")
    .select("id, photo_path")
    .eq("id", recipeId)
    .eq("user_id", uid)
    .maybeSingle();

  if (ownerErr) {
    return NextResponse.json({ ok: false, error: "db_error_owner_check" }, { status: 500 });
  }
  if (!recipeRow?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // 2) забираем photo_path всех шагов (до удаления строк!)
  const { data: stepRows, error: stepsLoadErr } = await supabaseAdmin
    .from("recipe_steps")
    .select("photo_path")
    .eq("recipe_id", recipeId);

  if (stepsLoadErr) {
    return NextResponse.json({ ok: false, error: "db_error_steps_load" }, { status: 500 });
  }

  // 3) собираем список файлов для удаления из storage
  const filesToDelete: string[] = [];

  if (recipeRow.photo_path) {
    filesToDelete.push(String(recipeRow.photo_path));
  }

  (stepRows ?? []).forEach((s: any) => {
    if (s?.photo_path) filesToDelete.push(String(s.photo_path));
  });

  // чистим мусор/дубликаты на всякий
  const uniqFiles = Array.from(new Set(filesToDelete.filter(Boolean)));

  // 4) удаляем файлы из storage (bucket recipes)
  // важно: делаем до удаления из БД, иначе потеряем пути
  if (uniqFiles.length) {
    const { error: storageErr } = await supabaseAdmin.storage
      .from("recipes")
      .remove(uniqFiles);

    if (storageErr) {
      return NextResponse.json(
        { ok: false, error: "storage_delete_failed", details: storageErr.message },
        { status: 500 }
      );
    }
  }

  // 5) удаляем зависимости
  const delCats = await supabaseAdmin
    .from("recipes_to_categories")
    .delete()
    .eq("recipe_id", recipeId);

  if (delCats.error) {
    return NextResponse.json({ ok: false, error: "db_error_categories_delete" }, { status: 500 });
  }

  const delIngs = await supabaseAdmin
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId);

  if (delIngs.error) {
    return NextResponse.json({ ok: false, error: "db_error_ingredients_delete" }, { status: 500 });
  }

  const delSteps = await supabaseAdmin
    .from("recipe_steps")
    .delete()
    .eq("recipe_id", recipeId);

  if (delSteps.error) {
    return NextResponse.json({ ok: false, error: "db_error_steps_delete" }, { status: 500 });
  }

  // 6) удаляем сам рецепт
  const delRecipe = await supabaseAdmin
    .from("recipes")
    .delete()
    .eq("id", recipeId)
    .eq("user_id", uid);

  if (delRecipe.error) {
    return NextResponse.json({ ok: false, error: "db_error_recipe_delete" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    recipe_id: recipeId,
    deleted_files: uniqFiles.length,
  });
}