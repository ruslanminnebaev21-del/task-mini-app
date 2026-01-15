// app/api/sport/profile/route.ts
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
    if (!Number.isFinite(uid) || uid <= 0) return null;
    return uid;
  } catch {
    return null;
  }
}

function parseWeight(v: any): number | null | "BAD" {
  if (v === null) return null;
  if (v === undefined) return "BAD";

  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return "BAD";
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0 || n > 500) return "BAD";
    return Math.round(n * 10) / 10;
  }

  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0 || v > 500) return "BAD";
    return Math.round(v * 10) / 10;
  }

  return "BAD";
}

function parseMeasuredAt(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// GET /api/sport/profile
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  try {
    // 1) цель
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("sport_profile")
      .select("goal")
      .eq("user_id", uid)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: profErr.message }, { status: 500 });
    }

    // 2) последние 10 замеров веса (берём последние по времени)
    const { data: rows, error: wErr } = await supabaseAdmin
      .from("sport_measurements")
      .select("value, measured_at, created_at")
      .eq("user_id", uid)
      .eq("kind", "weight")
      .order("measured_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(15);

    if (wErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: wErr.message }, { status: 500 });
    }

    // measured_at может быть пустым на старых данных -> подставим created_at
    const mapped = (rows || [])
      .map((r: any) => ({
        value: Number(r.value),
        measured_at: String(r.measured_at || r.created_at || ""),
      }))
      .filter((p) => Number.isFinite(p.value) && p.measured_at);

    // ASC чтобы график шел слева направо
    mapped.sort((a, b) => a.measured_at.localeCompare(b.measured_at));

    const last = mapped.length ? mapped[mapped.length - 1] : null;

    return NextResponse.json({
      ok: true,
      goal: prof?.goal ?? "",
      weight: last ? last.value : null, // последний по measured_at
      weight_at: last ? last.measured_at : null,
      weight_history: mapped,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "SERVER_ERROR", error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

// PATCH /api/sport/profile
// body: { goal?: string, weight?: number | string | null, measured_at?: string }
export async function PATCH(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const hasGoal = Object.prototype.hasOwnProperty.call(body, "goal");
  const hasWeight = Object.prototype.hasOwnProperty.call(body, "weight");

  if (!hasGoal && !hasWeight) {
    return NextResponse.json({ ok: false, reason: "NO_FIELDS" }, { status: 400 });
  }

  // 1) цель
  if (hasGoal) {
    const goal = String(body?.goal ?? "").trim();

    const { error } = await supabaseAdmin
      .from("sport_profile")
      .upsert({ user_id: uid, goal }, { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
    }
  }

  // 2) вес (добавляем новый замер)
  if (hasWeight) {
    const parsed = parseWeight(body?.weight);
    if (parsed === "BAD") {
      return NextResponse.json({ ok: false, reason: "BAD_WEIGHT" }, { status: 400 });
    }

    // null = "очистить" -> замер не добавляем
    if (parsed !== null) {
      const measuredAt = parseMeasuredAt(body?.measured_at) || new Date().toISOString();

      const { error } = await supabaseAdmin.from("sport_measurements").insert({
        user_id: uid,
        kind: "weight",
        value: parsed,
        measured_at: measuredAt,
      });

      if (error) {
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
      }
    }
  }

  // вернём свежие данные
  return GET();
}