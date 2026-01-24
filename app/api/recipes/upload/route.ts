// app/api/recipes/upload/route.ts

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import sharp from "sharp";

export const runtime = "nodejs";

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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const folder = cleanStr(form.get("folder")) || "main";
  const recipe_id_raw = cleanStr(form.get("recipe_id"));
  const step_id_raw = cleanStr(form.get("step_id"));
  const old_path_raw = cleanStr(form.get("old_path"));

  const isTmp = recipe_id_raw === "tmp";
  const recipeIdNum = isTmp ? null : Number(recipe_id_raw);

  if (
    !recipe_id_raw ||
    (!isTmp && (!Number.isFinite(recipeIdNum) || (recipeIdNum as number) <= 0))
  ) {
    return NextResponse.json({ error: "recipe_id_required" }, { status: 400 });
  }

  const step_id = step_id_raw ? Number(step_id_raw) : null;

  // простая валидация folder
  const safeFolder = folder === "steps" ? "steps" : "main";

  // путь: u_{uid}/r_{recipe_id}/{folder}/{timestamp}.webp
  const ts = Date.now();
  const ridPart = isTmp ? "r_tmp" : `r_${recipeIdNum}`;
  const photo_path = `u_${uid}/${ridPart}/${safeFolder}/${ts}.webp`;

  // old_path: удаляем только "своё" и только tmp/main
  const old_path_safe = (() => {
    if (!old_path_raw) return null;

    // только внутри папки текущего юзера
    if (!old_path_raw.startsWith(`u_${uid}/`)) return null;

    // tmp-очистка только для r_tmp/main
    if (!old_path_raw.startsWith(`u_${uid}/r_tmp/main/`)) return null;

    // не удаляем только что загруженный
    if (old_path_raw === photo_path) return null;

    return old_path_raw;
  })();

  // читаем файл
  const arrayBuffer = await file.arrayBuffer();
  const input = Buffer.from(arrayBuffer);

  // конвертим в webp
  let out: Buffer;
  try {
    out = await sharp(input)
      .rotate() // чтобы не поехала ориентация с телефона
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e: any) {
    console.log("sharp convert error:", e);
    return NextResponse.json(
      { error: "Convert failed", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }

  // 1) upload to storage
  const { error: upErr } = await supabaseAdmin.storage.from("recipes").upload(photo_path, out, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "3600",
  });

  if (upErr) {
    return NextResponse.json({ error: "Upload failed", details: upErr.message }, { status: 500 });
  }

  // 2) get public url (bucket public)
  const { data: pub } = supabaseAdmin.storage.from("recipes").getPublicUrl(photo_path);
  const photo_url = pub?.publicUrl ?? null;

  // 3) если это фото шага — пишем photo_path в recipe_steps
  if (step_id && Number.isFinite(step_id)) {
    const { error: stepErr } = await supabaseAdmin
      .from("recipe_steps")
      .update({ photo_path })
      .eq("id", step_id);

    if (stepErr) {
      return NextResponse.json(
        {
          error: "Uploaded but failed to update step",
          details: stepErr.message,
          photo_path,
          photo_url,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, photo_path, photo_url }, { status: 200 });
  }

  // если tmp — просто вернем путь, БД трогать нельзя
  if (isTmp) {
    // tmp чистим только в main и только безопасный путь
    if (safeFolder === "main" && old_path_safe) {
      const { error: rmOld } = await supabaseAdmin.storage.from("recipes").remove([old_path_safe]);
      if (rmOld) console.log("TMP OLD REMOVE ERROR:", rmOld.message);
    }

    return NextResponse.json({ ok: true, photo_path, photo_url }, { status: 200 });
  }

  // для реального рецепта: при замене главного фото удалим старое из bucket
  let oldRecipePhotoPath: string | null = null;

  if (safeFolder === "main") {
    const { data: oldRow } = await supabaseAdmin
      .from("recipes")
      .select("photo_path")
      .eq("id", recipeIdNum as number)
      .eq("user_id", uid)
      .maybeSingle();

    oldRecipePhotoPath = (oldRow?.photo_path as string | null) ?? null;
  }

  // 4) иначе это главное фото рецепта (folder=main)
  if (safeFolder === "main") {
    const { error: recErr } = await supabaseAdmin
      .from("recipes")
      .update({ photo_path })
      .eq("id", recipeIdNum)
      .eq("user_id", uid);

    if (recErr) {
      await supabaseAdmin.storage.from("recipes").remove([photo_path]);
      return NextResponse.json(
        {
          error: "Uploaded but failed to update recipe",
          details: recErr.message,
          photo_path,
          photo_url,
        },
        { status: 500 }
      );
    }

    // удаляем старый файл, если он был и он другой
    if (oldRecipePhotoPath && oldRecipePhotoPath !== photo_path) {
      const { error: rmErr } = await supabaseAdmin.storage.from("recipes").remove([oldRecipePhotoPath]);

      if (rmErr) {
        console.log("OLD PHOTO REMOVE ERROR:", rmErr.message);
        // не фейлим запрос, просто логируем
      }
    }
  }

  return NextResponse.json({ ok: true, photo_path, photo_url }, { status: 200 });
}

/**
 * Вариант 2: "Полностью удалить tmp-файл сразу"
 * Удаляем только tmp/main и только внутри текущего юзера.
 */
export async function DELETE(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const photo_path_raw = cleanStr(body?.photo_path);
  if (!photo_path_raw) {
    return NextResponse.json({ error: "photo_path_required" }, { status: 400 });
  }

  // удалять позволяем только своё
  if (!photo_path_raw.startsWith(`u_${uid}/`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // чистим только tmp/main
  if (!photo_path_raw.startsWith(`u_${uid}/r_tmp/main/`)) {
    return NextResponse.json({ error: "forbidden_path" }, { status: 403 });
  }

  const { error: rmErr } = await supabaseAdmin.storage.from("recipes").remove([photo_path_raw]);

  if (rmErr) {
    return NextResponse.json({ error: "Remove failed", details: rmErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}