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

  // Вариант А: аплоад разрешаем только когда рецепт уже создан
  const recipeIdNum = Number(recipe_id_raw);
  if (!recipe_id_raw || recipe_id_raw === "tmp" || !Number.isFinite(recipeIdNum) || recipeIdNum <= 0) {
    return NextResponse.json({ error: "recipe_id_required" }, { status: 400 });
  }

  const step_id = step_id_raw ? Number(step_id_raw) : null;

  // простая валидация folder
  const safeFolder = folder === "steps" ? "steps" : "main";

  // путь: u_{uid}/r_{recipe_id}/{folder}/{timestamp}.webp
  const ts = Date.now();
  const photo_path = `u_${uid}/r_${recipeIdNum}/${safeFolder}/${ts}.webp`;

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
  const { error: upErr } = await supabaseAdmin.storage
    .from("recipes")
    .upload(photo_path, out, {
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

  // 4) иначе это главное фото рецепта (folder=main)
  if (safeFolder === "main") {
    const { error: recErr } = await supabaseAdmin
      .from("recipes")
      .update({ photo_path })
      .eq("id", recipeIdNum)
      .eq("user_id", uid);

    if (recErr) {
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
  }

  return NextResponse.json({ ok: true, photo_path, photo_url }, { status: 200 });
}