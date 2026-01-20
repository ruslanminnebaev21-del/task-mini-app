// app/api/recipes/upload/route.ts
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

function extFromFile(file: File): string {
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext && ext.length <= 8) return ext;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function publicUrlForPath(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const cleanBase = base.replace(/\/+$/, "");
  return `${cleanBase}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();

  // file
  const f = form.get("file");
  const file = f instanceof File && f.size > 0 ? f : null;
  if (!file) return NextResponse.json({ error: "File is required" }, { status: 400 });

  // folder: "main" or "steps"
  const folderRaw = String(form.get("folder") ?? "misc");
  const folder = folderRaw === "main" || folderRaw === "steps" ? folderRaw : "misc";

  // recipe_id может быть пустым на этапе черновика
  const recipeIdRaw = String(form.get("recipe_id") ?? "");
  const recipe_id = recipeIdRaw ? recipeIdRaw.replace(/[^\d]/g, "") : "tmp";

  // step_pos только для steps
  const stepPosRaw = String(form.get("step_pos") ?? "");
  const step_pos = stepPosRaw ? stepPosRaw.replace(/[^\d]/g, "") : "";

  const ext = extFromFile(file);
  const ts = Date.now();

  let path = `u_${uid}/r_${recipe_id}/${folder}/${ts}.${ext}`;
  if (folder === "main") path = `u_${uid}/r_${recipe_id}/main/${ts}.${ext}`;
  if (folder === "steps" && step_pos) path = `u_${uid}/r_${recipe_id}/steps/${step_pos}_${ts}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });

  if (error) {
    return NextResponse.json({ error: "Upload failed", details: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      photo_path: path,
      photo_url: publicUrlForPath(path),
    },
    { status: 200 }
  );
}