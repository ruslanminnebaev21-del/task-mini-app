// app/api/recipes/EditPreps/route.ts

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

  const body = await req.json().catch(() => ({}));

  const id = String(body?.id ?? "").trim();
  const title = String(body?.title ?? "").trim();
  const counts = Number(body?.counts ?? 0);
  const unit = body?.unit === "pieces" || body?.unit === "portions" ? body.unit : null;
  const category_id = body?.category_id ? String(body.category_id) : null;

  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (!Number.isFinite(counts) || counts < 0) {
    return NextResponse.json({ ok: false, error: "bad_counts" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("recipes_preps")
    .update({
      title,
      counts,
      unit,
      category_id, // ✅ сохраняем id категории
    })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id,title,counts,unit,category_id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      prep: {
        id: String(data.id),
        title: String(data.title),
        counts: Number(data.counts),
        unit: data.unit,
        category_id: data.category_id ? String(data.category_id) : null,
      },
    },
    { status: 200 }
  );
}