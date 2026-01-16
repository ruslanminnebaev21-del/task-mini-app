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

// measured_at в базе = date, поэтому храним YYYY-MM-DD
function parseMeasuredDate(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  // если уже YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // если прилетел ISO/дата-строка
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNumber(v: any, opts?: { min?: number; max?: number }): number | null | "BAD" {
  if (v === null || v === undefined) return null;

  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return "BAD";
    if (opts?.min != null && n < opts.min) return "BAD";
    if (opts?.max != null && n > opts.max) return "BAD";
    return Math.round(n * 10) / 10;
  }

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "BAD";
    if (opts?.min != null && v < opts.min) return "BAD";
    if (opts?.max != null && v > opts.max) return "BAD";
    return Math.round(v * 10) / 10;
  }

  return "BAD";
}

// create/update на дату: удаляем старое значение и вставляем новое
async function upsertMeasurement(params: {
  uid: number;
  kind: string;
  value: number | null;
  unit: string; // ВАЖНО: в таблице unit NOT NULL
  measured_at: string; // YYYY-MM-DD
}) {
  const { uid, kind, value, unit, measured_at } = params;

  // value = null -> "очистить": удаляем запись на эту дату
  if (value === null) {
    const { error: delErr } = await supabaseAdmin
      .from("sport_measurements")
      .delete()
      .eq("user_id", uid)
      .eq("kind", kind)
      .eq("measured_at", measured_at);

    if (delErr) return { ok: false, error: delErr.message };
    return { ok: true };
  }

  // удалить старую запись на эту дату (если была)
  const { error: delErr } = await supabaseAdmin
    .from("sport_measurements")
    .delete()
    .eq("user_id", uid)
    .eq("kind", kind)
    .eq("measured_at", measured_at);

  if (delErr) return { ok: false, error: delErr.message };

  // вставить новую
  const { error: insErr } = await supabaseAdmin.from("sport_measurements").insert({
    user_id: uid,
    kind,
    value,
    unit, // NOT NULL
    measured_at,
  });

  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
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

    // 2) история веса (последние 15 по дате)
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

    const mapped = (rows || [])
      .map((r: any) => ({
        value: Number(r.value),
        measured_at: String(r.measured_at || "").trim() || String(r.created_at || "").slice(0, 10),
      }))
      .filter((p) => Number.isFinite(p.value) && p.measured_at);

    mapped.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const last = mapped.length ? mapped[mapped.length - 1] : null;

    // 3) последние замеры тела и состава (по каждому kind берём самый свежий measured_at)
    const wantedKinds = [
      // sizes
      "size_chest",
      "size_waist",
      "size_belly",
      "size_pelvis",
      "size_thigh",
      "size_arm",

      // comp
      "comp_water",
      "comp_protein",
      "comp_minerals",
      "comp_body_fat",
      "comp_bmi",
      "comp_fat_percent",
      "comp_visceral_fat",
    ];

    const { data: mRows, error: mErr } = await supabaseAdmin
      .from("sport_measurements")
      .select("kind, value, measured_at, created_at, unit")
      .eq("user_id", uid)
      .in("kind", wantedKinds)
      .order("measured_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (mErr) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: mErr.message }, { status: 500 });
    }

    // берём первый попавшийся kind в отсортированном списке => это самый свежий
    const latestByKind = new Map<string, { value: number; measured_at: string; unit: string }>();

    for (const r of mRows || []) {
      const kind = String((r as any).kind || "").trim();
      if (!kind) continue;
      if (latestByKind.has(kind)) continue;

      const value = Number((r as any).value);
      if (!Number.isFinite(value)) continue;

      const measured_at =
        String((r as any).measured_at || "").trim() || String((r as any).created_at || "").slice(0, 10);

      const unit = String((r as any).unit || "").trim() || "";

      if (!measured_at) continue;
      latestByKind.set(kind, { value, measured_at, unit });
    }

    const body_sizes = {
      measured_at:
        latestByKind.get("size_chest")?.measured_at ||
        latestByKind.get("size_waist")?.measured_at ||
        latestByKind.get("size_belly")?.measured_at ||
        latestByKind.get("size_pelvis")?.measured_at ||
        latestByKind.get("size_thigh")?.measured_at ||
        latestByKind.get("size_arm")?.measured_at ||
        null,
      chest: latestByKind.get("size_chest")?.value ?? null,
      waist: latestByKind.get("size_waist")?.value ?? null,
      belly: latestByKind.get("size_belly")?.value ?? null,
      pelvis: latestByKind.get("size_pelvis")?.value ?? null,
      thigh: latestByKind.get("size_thigh")?.value ?? null,
      arm: latestByKind.get("size_arm")?.value ?? null,
    };

    const body_comp = {
      measured_at:
        latestByKind.get("comp_water")?.measured_at ||
        latestByKind.get("comp_protein")?.measured_at ||
        latestByKind.get("comp_minerals")?.measured_at ||
        latestByKind.get("comp_body_fat")?.measured_at ||
        latestByKind.get("comp_bmi")?.measured_at ||
        latestByKind.get("comp_fat_percent")?.measured_at ||
        latestByKind.get("comp_visceral_fat")?.measured_at ||
        null,
      water: latestByKind.get("comp_water")?.value ?? null,
      protein: latestByKind.get("comp_protein")?.value ?? null,
      minerals: latestByKind.get("comp_minerals")?.value ?? null,
      body_fat: latestByKind.get("comp_body_fat")?.value ?? null,
      bmi: latestByKind.get("comp_bmi")?.value ?? null,
      fat_percent: latestByKind.get("comp_fat_percent")?.value ?? null,
      visceral_fat: latestByKind.get("comp_visceral_fat")?.value ?? null,
    };

    return NextResponse.json({
      ok: true,
      goal: prof?.goal ?? "",
      weight: last ? last.value : null,
      weight_at: last ? last.measured_at : null,
      weight_history: mapped,
      body_sizes,
      body_comp,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "SERVER_ERROR", error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

// PATCH /api/sport/profile
// body: { goal?: string, weight?: number|string|null, measured_at?: string,
//         body_sizes?: {..., measured_at: string}, body_comp?: {..., measured_at: string} }
export async function PATCH(req: Request) {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));

  const hasGoal = Object.prototype.hasOwnProperty.call(body, "goal");
  const hasWeight = Object.prototype.hasOwnProperty.call(body, "weight");
  const hasBodySizes = Object.prototype.hasOwnProperty.call(body, "body_sizes");
  const hasBodyComp = Object.prototype.hasOwnProperty.call(body, "body_comp");

  if (!hasGoal && !hasWeight && !hasBodySizes && !hasBodyComp) {
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

  // 2) вес
  if (hasWeight) {
    const parsed = parseWeight(body?.weight);
    if (parsed === "BAD") {
      return NextResponse.json({ ok: false, reason: "BAD_WEIGHT" }, { status: 400 });
    }

    if (parsed !== null) {
      const measuredDate = parseMeasuredDate(body?.measured_at) || todayYmd();

      const res = await upsertMeasurement({
        uid,
        kind: "weight",
        value: parsed,
        unit: "kg",
        measured_at: measuredDate,
      });

      if (!res.ok) {
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: res.error }, { status: 500 });
      }
    }
  }

  // 3) замеры тела (см)
  if (hasBodySizes) {
    const bs = body?.body_sizes || {};
    const measuredDate = parseMeasuredDate(bs?.measured_at) || todayYmd();

    const map: Array<[string, any]> = [
      ["chest", bs.chest],
      ["waist", bs.waist],
      ["belly", bs.belly],
      ["pelvis", bs.pelvis],
      ["thigh", bs.thigh],
      ["arm", bs.arm],
    ];

    for (const [k, raw] of map) {
      const val = parseNumber(raw, { min: 0, max: 300 });
      if (val === "BAD") {
        return NextResponse.json({ ok: false, reason: "BAD_VALUE", field: k }, { status: 400 });
      }

      const res = await upsertMeasurement({
        uid,
        kind: `size_${k}`,
        value: val,
        unit: "cm",
        measured_at: measuredDate,
      });

      if (!res.ok) {
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: res.error }, { status: 500 });
      }
    }
  }

  // 4) состав тела
  if (hasBodyComp) {
    const bc = body?.body_comp || {};
    const measuredDate = parseMeasuredDate(bc?.measured_at) || todayYmd();

    // единицы храним так:
    // water/protein/minerals/fat_percent -> %
    // body_fat -> kg (как ты сказал)
    // bmi, visceral_fat -> unit тоже обязателен, дадим "idx"
    const map: Array<[string, any, { min?: number; max?: number }, string]> = [
      ["water", bc.water, { min: 0, max: 100 }, "%"],
      ["protein", bc.protein, { min: 0, max: 100 }, "%"],
      ["minerals", bc.minerals, { min: 0, max: 100 }, "%"],
      ["body_fat", bc.body_fat, { min: 0, max: 200 }, "kg"],
      ["bmi", bc.bmi, { min: 0, max: 100 }, "idx"],
      ["fat_percent", bc.fat_percent, { min: 0, max: 100 }, "%"],
      ["visceral_fat", bc.visceral_fat, { min: 0, max: 100 }, "idx"],
    ];

    for (const [k, raw, lim, unit] of map) {
      const val = parseNumber(raw, lim);
      if (val === "BAD") {
        return NextResponse.json({ ok: false, reason: "BAD_VALUE", field: k }, { status: 400 });
      }

      const res = await upsertMeasurement({
        uid,
        kind: `comp_${k}`,
        value: val,
        unit, // NOT NULL, всегда строка
        measured_at: measuredDate,
      });

      if (!res.ok) {
        return NextResponse.json({ ok: false, reason: "DB_ERROR", error: res.error }, { status: 500 });
      }
    }
  }

  return GET();
}