
// app/api/recipes/prepCategories/editPrepCategories/route.ts
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

function cleanStr(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = cleanStr(body?.id);
  const title = cleanStr(body?.title);

  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  // optional: защита от дублей названий внутри одного user_id
  const { data: dup, error: dupErr } = await supabaseAdmin
    .from("preps_categories")
    .select("id")
    .eq("user_id", uid)
    .ilike("title", title)
    .neq("id", id)
    .limit(1);

  if (dupErr) {
    return NextResponse.json({ ok: false, error: dupErr.message }, { status: 500 });
  }

  if ((dup ?? []).length > 0) {
    return NextResponse.json({ ok: false, error: "title_exists" }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("preps_categories")
    .update({ title })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id,title,created_at")
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
      category: {
        id: String((data as any).id),
        title: String((data as any).title ?? "").trim(),
        created_at: (data as any).created_at ?? null,
      },
    },
    { status: 200 }
  );
}