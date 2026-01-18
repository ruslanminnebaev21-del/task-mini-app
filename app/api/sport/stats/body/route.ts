// app/api/sport/stats/body/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Point = { date: string; value: number };

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

function ymdFromRow(measured_at: any, created_at: any): string | null {
  const m = String(measured_at || "").trim();
  if (m && /^\d{4}-\d{2}-\d{2}$/.test(m)) return m;

  const c = String(created_at || "").trim();
  if (c && c.length >= 10) {
    const s = c.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }

  return null;
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sortPointsAsc(points: Point[]): Point[] {
  return points.slice().sort((a, b) => a.date.localeCompare(b.date));
}

function mapPointsFromKind(kindMap: Map<string, Point[]> , kind: string): Point[] {
  return sortPointsAsc(kindMap.get(kind) || []);
}

/**
 * GET /api/sport/stats/body
 * Возвращает точки для графиков тела за всё время:
 * - weight
 * - sizes: chest, waist, belly, pelvis, thigh, arm
 * - comp: water, protein, minerals, body_fat, bmi, fat_percent, visceral_fat
 */
export async function GET() {
  const uid = await getUidFromSession();
  if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

  try {
    const wantedKinds = [
      "weight",

      "size_chest",
      "size_waist",
      "size_belly",
      "size_pelvis",
      "size_thigh",
      "size_arm",

      "comp_water",
      "comp_protein",
      "comp_minerals",
      "comp_body_fat",
      "comp_bmi",
      "comp_fat_percent",
      "comp_visceral_fat",
    ];

    const { data: rows, error } = await supabaseAdmin
      .from("sport_measurements")
      .select("kind,value,measured_at,created_at")
      .eq("user_id", uid)
      .in("kind", wantedKinds)
      .order("measured_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, reason: "DB_ERROR", error: error.message }, { status: 500 });
    }

    // На всякий случай защищаемся от дублей на одну дату:
    // если вдруг есть 2 записи на один kind+date, берём последнюю по created_at
    const latestByKindDate = new Map<string, { date: string; value: number; created_at: string }>();

    for (const r of rows || []) {
      const kind = String((r as any).kind || "").trim();
      if (!kind) continue;

      const date = ymdFromRow((r as any).measured_at, (r as any).created_at);
      if (!date) continue;

      const value = toNum((r as any).value);
      if (value == null) continue;

      const createdAt = String((r as any).created_at || "").trim() || "";

      const key = `${kind}__${date}`;
      const prev = latestByKindDate.get(key);
      if (!prev) {
        latestByKindDate.set(key, { date, value, created_at: createdAt });
        continue;
      }

      // если created_at сравним, берём более поздний
      if (!prev.created_at || createdAt > prev.created_at) {
        latestByKindDate.set(key, { date, value, created_at: createdAt });
      }
    }

    const kindMap = new Map<string, Point[]>();
    for (const [key, v] of latestByKindDate.entries()) {
      const kind = key.split("__")[0];
      if (!kind) continue;

      const arr = kindMap.get(kind) || [];
      arr.push({ date: v.date, value: v.value });
      kindMap.set(kind, arr);
    }

    const payload = {
      weight: mapPointsFromKind(kindMap, "weight"),

      sizes: {
        chest: mapPointsFromKind(kindMap, "size_chest"),
        waist: mapPointsFromKind(kindMap, "size_waist"),
        belly: mapPointsFromKind(kindMap, "size_belly"),
        pelvis: mapPointsFromKind(kindMap, "size_pelvis"),
        thigh: mapPointsFromKind(kindMap, "size_thigh"),
        arm: mapPointsFromKind(kindMap, "size_arm"),
      },

      comp: {
        water: mapPointsFromKind(kindMap, "comp_water"),
        protein: mapPointsFromKind(kindMap, "comp_protein"),
        minerals: mapPointsFromKind(kindMap, "comp_minerals"),
        body_fat: mapPointsFromKind(kindMap, "comp_body_fat"),
        bmi: mapPointsFromKind(kindMap, "comp_bmi"),
        fat_percent: mapPointsFromKind(kindMap, "comp_fat_percent"),
        visceral_fat: mapPointsFromKind(kindMap, "comp_visceral_fat"),
      },
    };

    // диапазон дат (удобно для UI)
    const allDates = [
      ...payload.weight.map((p) => p.date),
      ...Object.values(payload.sizes).flat().map((p) => p.date),
      ...Object.values(payload.comp).flat().map((p) => p.date),
    ].filter(Boolean);

    allDates.sort((a, b) => a.localeCompare(b));
    const range = allDates.length ? { from: allDates[0], to: allDates[allDates.length - 1] } : { from: null, to: null };

    return NextResponse.json({ ok: true, range, data: payload });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "SERVER_ERROR", error: String(e?.message || e) },
      { status: 500 }
    );
  }
}