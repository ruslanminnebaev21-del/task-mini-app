// app/api/sport/stats/overview/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Trend = "up" | "down" | "same";
type Period = "week" | "month";

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

const TZ = "Europe/Moscow";

/** YYYY-MM-DD в заданной TZ */
function ymdInTz(d: Date, timeZone = TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Mon=0 ... Sun=6 в заданной TZ */
function dowMon0Sun6InTz(d: Date, timeZone = TZ) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

function daysInMonthUTC(y: number, m1to12: number) {
  // день 0 следующего месяца = последний день текущего
  return new Date(Date.UTC(y, m1to12, 0)).getUTCDate();
}

function clampDay(y: number, m1to12: number, d: number) {
  const dim = daysInMonthUTC(y, m1to12);
  return Math.max(1, Math.min(d, dim));
}

function ymd(y: number, m1to12: number, d: number) {
  return `${y}-${String(m1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function prevMonthAnchorYmd(anchorYmd: string) {
  const [y, m, d] = anchorYmd.split("-").map(Number);
  let py = y;
  let pm = m - 1;
  if (pm <= 0) {
    pm = 12;
    py -= 1;
  }
  const pd = clampDay(py, pm, d);
  return ymd(py, pm, pd);
}

function safeNum(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function trendFromDelta(delta: number): Trend {
  if (!Number.isFinite(delta) || delta === 0) return "same";
  return delta > 0 ? "up" : "down";
}

type Card = {
  current: number;
  prev: number;
  delta: number;
  trend: Trend;
};

function makeCard(current: number, prev: number): Card {
  const c = safeNum(current);
  const p = safeNum(prev);
  const delta = c - p;
  return { current: c, prev: p, delta, trend: trendFromDelta(delta) };
}

async function fetchWorkoutsInRange(uid: number, fromISO: string, toISOExclusive: string) {
  const { data, error } = await supabaseAdmin
    .from("workouts")
    .select("id, type, duration")
    .eq("user_id", uid)
    .eq("status", "done")
    .gte("workout_date", fromISO)
    .lt("workout_date", toISOExclusive)
    .limit(2000);

  if (error) throw new Error(error.message);
  return (data || []) as Array<{ id: number; type: "strength" | "cardio"; duration: number | null }>;
}

async function fetchStrengthSetsForWorkoutIds(workoutIds: number[]) {
  if (!workoutIds.length) return { totalSets: 0, totalVolume: 0 };

  const { data, error } = await supabaseAdmin
    .from("workout_exercises")
    .select("id, workout_id, workout_sets(id, weight, reps)")
    .in("workout_id", workoutIds)
    .limit(10000);

  if (error) throw new Error(error.message);

  let totalSets = 0;
  let totalVolume = 0;

  for (const ex of data || []) {
    const sets = (ex as any)?.workout_sets || [];
    for (const s of sets) {
      totalSets += 1;
      totalVolume += safeNum(s?.weight) * safeNum(s?.reps);
    }
  }

  return { totalSets, totalVolume };
}

async function calcRange(uid: number, fromISO: string, toISOExclusive: string) {
  const workouts = await fetchWorkoutsInRange(uid, fromISO, toISOExclusive);

  const workoutCount = workouts.length;
  const totalDurationSec = workouts.reduce((acc, w) => acc + safeNum(w.duration), 0);

  const strengthIds = workouts.filter((w) => w.type === "strength").map((w) => w.id);
  const { totalSets, totalVolume } = await fetchStrengthSetsForWorkoutIds(strengthIds);

  return {
    workoutCount,
    totalDurationSec,
    strengthSets: totalSets,
    strengthVolume: totalVolume,
  };
}

function buildRanges(period: Period, anchorYmd: string) {
  if (period === "week") {
    const [ay, am, ad] = anchorYmd.split("-").map(Number);
    const anchorDate = new Date(Date.UTC(ay, (am || 1) - 1, ad || 1, 12, 0, 0));
    const dow = dowMon0Sun6InTz(anchorDate);

    const thisFrom = addDaysYmd(anchorYmd, -dow);
    const thisToExclusive = addDaysYmd(anchorYmd, 1);
    const thisTo = anchorYmd;

    const spanDays = dow + 1;
    const prevFrom = addDaysYmd(thisFrom, -7);
    const prevToExclusive = addDaysYmd(prevFrom, spanDays);
    const prevTo = addDaysYmd(prevToExclusive, -1);

    return {
      kind: "week" as const,
      current: { from: thisFrom, to: thisTo, toExclusive: thisToExclusive },
      prev: { from: prevFrom, to: prevTo, toExclusive: prevToExclusive },
    };
  }

  // month: 1..anchor vs 1..prevMonthAnchor (day clamped to month length)
  const [y, m, d] = anchorYmd.split("-").map(Number);
  const thisFrom = ymd(y, m, 1);
  const thisToExclusive = addDaysYmd(anchorYmd, 1);
  const thisTo = anchorYmd;

  const prevAnchor = prevMonthAnchorYmd(anchorYmd);
  const [py, pm] = prevAnchor.split("-").map(Number);
  const prevFrom = ymd(py, pm, 1);
  const prevToExclusive = addDaysYmd(prevAnchor, 1);
  const prevTo = prevAnchor;

  return {
    kind: "month" as const,
    current: { from: thisFrom, to: thisTo, toExclusive: thisToExclusive },
    prev: { from: prevFrom, to: prevTo, toExclusive: prevToExclusive },
  };
}

export async function GET(req: Request) {
  try {
    const uid = await getUidFromSession();
    if (!uid) return NextResponse.json({ ok: false, reason: "NO_SESSION" }, { status: 401 });

    const url = new URL(req.url);
    const anchor = String(url.searchParams.get("anchor") || "").trim(); // YYYY-MM-DD optional
    const periodRaw = String(url.searchParams.get("period") || "week").trim();

    const period: Period = periodRaw === "month" ? "month" : "week";
    if (periodRaw !== "week" && periodRaw !== "month") {
      return NextResponse.json({ ok: false, reason: "UNSUPPORTED_PERIOD" }, { status: 400 });
    }

    const todayYmd = ymdInTz(new Date());
    const anchorYmd = anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : todayYmd;

    const ranges = buildRanges(period, anchorYmd);

    const cur = await calcRange(uid, ranges.current.from, ranges.current.toExclusive);
    const prev = await calcRange(uid, ranges.prev.from, ranges.prev.toExclusive);

    return NextResponse.json({
      ok: true,
      range: {
        current: { from: ranges.current.from, to: ranges.current.to },
        prev: { from: ranges.prev.from, to: ranges.prev.to },
      },
      cards: {
        workouts: makeCard(cur.workoutCount, prev.workoutCount),
        tonnage: makeCard(cur.strengthVolume, prev.strengthVolume),
        sets: makeCard(cur.strengthSets, prev.strengthSets),
        duration: makeCard(cur.totalDurationSec, prev.totalDurationSec),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "SERVER_ERROR", error: String(e?.message || e) },
      { status: 500 }
    );
  }
}