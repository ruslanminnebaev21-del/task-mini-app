// app/api/exercises/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type LoadType = "external" | "bodyweight";

async function getUidFromSession(): Promise<number | null> {
  const c = await cookies();
  const token = c.get("session")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.APP_JWT_SECRET!) as any;
    const uid = Number(payload?.uid);
    if (!Number.isFinite(uid) || uid <= 0) return null;
    return uid;
  } catch {
    return null;
  }
}

function normName(s: string) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * GET /api/exercises
 * Список упражнений юзера
 */
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("exercises")
    .select("id,name,load_type,created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exercises: data || [] });
}

/**
 * POST /api/exercises
 * body: { name: string, loadType: "external" | "bodyweight" }
 */
export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const name = String(body?.name || "").trim();
  const loadType = String(body?.loadType || "") as LoadType;

  if (!name) return NextResponse.json({ ok: false, reason: "NO_NAME" }, { status: 400 });
  if (loadType !== "external" && loadType !== "bodyweight") {
    return NextResponse.json({ ok: false, reason: "BAD_LOAD_TYPE" }, { status: 400 });
  }

  // 1) Проверка дубля (как ты хотел: подсказка + блокируем)
  // Дубль считаем по нормализованному имени + тип нагрузки.
  // Тут делаем запрос по user_id + load_type, и сравниваем нормализованно.
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("exercises")
    .select("id,name,load_type")
    .eq("user_id", uid)
    .eq("load_type", loadType)
    .limit(500);

  if (existingErr) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: existingErr.message }, { status: 500 });
  }

  const needle = normName(name);
  const dup = (existing || []).find((x: any) => normName(x?.name) === needle);

  if (dup) {
    return NextResponse.json(
      {
        ok: false,
        reason: "DUPLICATE",
        duplicate: { id: dup.id, name: dup.name, load_type: dup.load_type },
      },
      { status: 409 }
    );
  }

  // 2) Вставка
  const { data, error } = await supabaseAdmin
    .from("exercises")
    .insert({ user_id: uid, name, load_type: loadType })
    .select("id,name,load_type,created_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exercise: data });
}
/**
 * DELETE /api/exercises
 * body: { id: number }
 */
export async function DELETE(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const id = Number(body?.id);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, reason: "BAD_ID" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("exercises").delete().eq("id", id).eq("user_id", uid);

  if (error) {
    return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}