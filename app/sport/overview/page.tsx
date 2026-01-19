// app/sport/overview/page.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconUser, IconArrow, IconTrash, IconHome } from "@/app/components/icons";
import { useWorkoutStats } from "@/app/hooks/useWorkoutStats";
import { useDeleteWorkout } from "@/app/hooks/useDeleteWorkout";

type Tab = {
  label: string;
  href: string;
  showDot: boolean;
  icon?: "home" | "user";
};

const TABS: Tab[] = [
  { label: "Обзор", href: "/sport/overview", showDot: false, icon: "home" },
  { label: "Тренировки", href: "/sport/workouts", showDot: true },
  { label: "Упражнения", href: "/sport/exercises", showDot: true },
  { label: "Профиль", href: "/sport/profile", showDot: false, icon: "user" },
];

type WorkoutType = "strength" | "cardio";

type Workout = {
  id: number;
  title: string;
  workout_date: string;
  type: WorkoutType;
  duration_min?: number | null;
  status?: "draft" | "done";
  completed_at?: string | null;
  created_at?: string | null;
};

type WeightPoint = {
  value: number;
  measured_at: string; // ISO
};

type WorkoutSummary = {
  workout: { id: number; title: string; completed_at: string | null };
  exercises: Array<{ id: number; name: string }>;
};

function typeLabel(w: WorkoutType) {
  return w === "strength" ? "Силовая" : "Кардио";
}

function formatDateRu(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function isActiveTab(pathname: string, href: string) {
  if (href === "/sport") return pathname === "/sport";
  return pathname === href || pathname.startsWith(href + "/");
}

function renderTabIcon(icon?: Tab["icon"]) {
  if (!icon) return null;

  switch (icon) {
    case "user":
      return <IconUser className={styles.tabIcon} />;
    case "home":
      return <IconHome className={styles.tabIcon} />;
    default:
      return null;
  }
}

function monthLabel(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtWeight(n: number) {
  if (!Number.isFinite(n)) return "—";
  const s = Math.round(n * 10) / 10;
  return String(s).replace(".", ",");
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

function addMonths(d: Date, delta: number) {
  const base = startOfMonth(d);
  return new Date(base.getFullYear(), base.getMonth() + delta, 1, 12, 0, 0);
}

/* ================== CACHE + REV(APP) ================== */

const OVERVIEW_CACHE_KEY = "sport_overview_cache_v3";
const REV_URL = "/api/sport/rev";
const OVERVIEW_CACHE_TTL_MS = 60 * 1000;

type OverviewCache = {
  savedAt: number;
  revApp: number;
  firstName: string;
  goal: string;
  weight: number | null;
  workouts: Workout[];
  weightPoints: WeightPoint[];
};

function readOverviewCache(): OverviewCache | null {
  try {
    const raw = sessionStorage.getItem(OVERVIEW_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OverviewCache;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (typeof parsed.revApp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeOverviewCache(data: Omit<OverviewCache, "savedAt">) {
  try {
    const payload: OverviewCache = { savedAt: Date.now(), ...data };
    sessionStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function isCacheFresh(savedAt: number) {
  return Date.now() - savedAt <= OVERVIEW_CACHE_TTL_MS;
}

async function fetchAppRev(signal?: AbortSignal): Promise<number | null> {
  try {
    const r = await fetch(REV_URL, { credentials: "include", cache: "no-store", signal });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) return null;

    const t = Date.parse(String(j.updated_at || ""));
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/* ================== GRAPH ================== */

function WeightSparkline({ points }: { points: WeightPoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [wPx, setWPx] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      setWPx(Math.max(0, Math.floor(r.width)));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const vals = (points || []).map((p) => Number(p.value)).filter((n) => Number.isFinite(n));

  if (vals.length < 2) {
    return (
      <div ref={ref} style={{ width: "100%", marginTop: 8 }}>
        <div className={styles.muted}>Пока мало данных</div>
      </div>
    );
  }

  const W = Math.max(10, wPx);
  const H = 140;
  const padX = 14;
  const padY = 12;
  const axisBottom = H - 22;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(0.0001, max - min);

  const xStep = (W - padX * 2) / (vals.length - 1);

  const toY = (v: number) => {
    const t = (v - min) / span;
    return padY + (1 - t) * (axisBottom - padY * 2);
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}`;
  };

  const coords = points.map((p, i) => {
    const x = padX + i * xStep;
    const y = toY(p.value);
    return { x, y, v: p.value, date: fmtDate(p.measured_at) };
  });

  const d = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  const last = vals[vals.length - 1];
  const delta = last - vals[0];
  const deltaText = `${delta >= 0 ? "+" : ""}${fmtWeight(delta)} кг`;

  const gridY = 4;
  const gridX = Math.min(5, vals.length);

  return (
    <div ref={ref} style={{ width: "100%", marginTop: 8 }}>
      {W > 0 && (
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", height: H }}
        >
          {Array.from({ length: gridY }).map((_, i) => {
            const y = padY + (i / (gridY - 1)) * (axisBottom - padY * 2);
            return (
              <line
                key={`gy-${i}`}
                x1={padX}
                y1={y}
                x2={W - padX}
                y2={y}
                stroke="rgba(0,0,0,0.12)"
                strokeDasharray="4 4"
              />
            );
          })}

          {Array.from({ length: gridX }).map((_, i) => {
            const x = padX + (i / (gridX - 1)) * (W - padX * 2);
            return (
              <line
                key={`gx-${i}`}
                x1={x}
                y1={padY}
                x2={x}
                y2={axisBottom}
                stroke="rgba(0,0,0,0.1)"
                strokeDasharray="4 4"
              />
            );
          })}

          <path d={d} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="2" strokeLinecap="round" />

          {coords.map((p, i) => {
            const textDown = p.y < 24;
            const textY = textDown ? p.y + 14 : p.y - 10;

            const isFirst = i === 0;
            const isLast = i === coords.length - 1;
            const textAnchor = isLast ? "end" : isFirst ? "start" : "middle";
            const textX = isLast ? p.x - 2 : isFirst ? p.x + 2 : p.x;

            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3.2" fill="rgba(0,0,0,0.65)" />
                <text x={textX} y={textY} textAnchor={textAnchor} fontSize="10" fill="rgba(0,0,0,0.65)">
                  {fmtWeight(p.v)}
                </text>
              </g>
            );
          })}

          {coords.map((p, i) => {
            const show = i === 0 || i === coords.length - 1 || i === Math.floor(coords.length / 2);
            if (!show) return null;
            return (
              <text
                key={`dx-${i}`}
                x={p.x}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(0,0,0,0.45)"
              >
                {p.date}
              </text>
            );
          })}
        </svg>
      )}

      <div className={styles.muted} style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>Последний: {fmtWeight(last)} кг</span>
        <span>Результат: {deltaText}</span>
      </div>
    </div>
  );
}

/* ================== PAGE ================== */

export default function SportPage() {
  const { deleteWorkout, loading: deleteLoading } = useDeleteWorkout();

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [goal, setGoal] = useState("");
  const [weight, setWeight] = useState<number | null>(null);

  const [weightPoints, setWeightPoints] = useState<WeightPoint[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const inFlightRef = useRef<AbortController | null>(null);

  // ===== Calendar popup =====
  const [calOpen, setCalOpen] = useState(false);
  const [calDateKey, setCalDateKey] = useState<string | null>(null);
  const [calWorkouts, setCalWorkouts] = useState<Workout[]>([]);
  const [calActiveId, setCalActiveId] = useState<number | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calSummary, setCalSummary] = useState<WorkoutSummary | null>(null);

  const [popPos, setPopPos] = useState({ left: 12, top: 12 });

  const calAbortRef = useRef<AbortController | null>(null);
  const calCacheRef = useRef(new Map<number, WorkoutSummary>());

  // ===== SWIPE MONTH =====
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [calAnim, setCalAnim] = useState<{ phase: "idle" | "out" | "in"; dir: -1 | 1 }>({
    phase: "idle",
    dir: 1,
  });
  const animTimersRef = useRef<number[]>([]);
  const swipeRef = useRef<{
    down: boolean;
    startX: number;
    startY: number;
    pointerId: number | null;
    decided: boolean;
    isHorizontal: boolean;
  }>({
    down: false,
    startX: 0,
    startY: 0,
    pointerId: null,
    decided: false,
    isHorizontal: false,
  });

  function clearAnimTimers() {
    animTimersRef.current.forEach((t) => window.clearTimeout(t));
    animTimersRef.current = [];
  }

  function goMonth(delta: number) {
    if (!delta) return;
    if (calAnim.phase !== "idle") return;

    clearAnimTimers();

    const dir: -1 | 1 = delta > 0 ? 1 : -1;

    // если открыт попап, закрываем, чтобы не улетел в другой месяц
    if (calOpen) {
      setCalOpen(false);
      setCalDateKey(null);
      setCalWorkouts([]);
      setCalActiveId(null);
      setCalSummary(null);
    }

    setCalAnim({ phase: "out", dir });

    const t1 = window.setTimeout(() => {
      setViewMonth((prev) => addMonths(prev, delta));
      setCalAnim({ phase: "in", dir });

      const t2 = window.setTimeout(() => {
        setCalAnim({ phase: "idle", dir });
      }, 170);

      animTimersRef.current.push(t2);
    }, 170);

    animTimersRef.current.push(t1);
  }

  useEffect(() => {
    return () => clearAnimTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // актуальные значения для записи кеша без устаревших замыканий
  const stateRef = useRef({
    revApp: 0,
    firstName: "",
    goal: "",
    weight: null as number | null,
    workouts: [] as Workout[],
    weightPoints: [] as WeightPoint[],
  });

  useEffect(() => {
    stateRef.current.firstName = firstName;
    stateRef.current.goal = goal;
    stateRef.current.weight = weight;
    stateRef.current.workouts = workouts;
    stateRef.current.weightPoints = weightPoints;
  }, [firstName, goal, weight, workouts, weightPoints]);

  const todayKey = useMemo(() => ymd(new Date()), []);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const doneWorkouts = useMemo(
    () => workouts.filter((w) => w.status === "done" && Boolean(w.completed_at)),
    [workouts]
  );

  const workoutDays = useMemo(() => {
    const s = new Set<string>();
    for (const w of doneWorkouts) {
      const d = new Date(w.completed_at!);
      s.add(ymd(d));
    }
    return s;
  }, [doneWorkouts]);

  const trainingsThisMonth = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    let c = 0;
    workoutDays.forEach((d) => {
      if (d.startsWith(prefix)) c++;
    });
    return c;
  }, [workoutDays, year, month]);

  const calendar = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();

    const jsDay = first.getDay();
    const startOffset = (jsDay + 6) % 7;

    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, key: `e-${i}` });

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({ date: d, key: ymd(d) });
    }

    return cells;
  }, [year, month]);

  const workoutsThisMonthSorted = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    return doneWorkouts
      .filter((w) => ymd(new Date(w.completed_at!)).startsWith(prefix))
      .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
  }, [doneWorkouts, year, month]);

  const statsIds = useMemo(
    () => workoutsThisMonthSorted.filter((w) => w.type === "strength").map((w) => w.id),
    [workoutsThisMonthSorted]
  );
  const { loading: statsLoading, data: statsByWorkoutId } = useWorkoutStats(statsIds);

  const hello = firstName.trim() ? `Привет, ${firstName.trim()}!` : "Привет!";

  async function fetchAndApplyOverview(signal: AbortSignal) {
    const r = await fetch("/api/sport/overview", {
      credentials: "include",
      signal,
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({} as any));

    if (!r.ok || !j.ok) {
      if (j?.reason === "NO_SESSION") return { ok: false as const, silent: true as const, msg: "" };
      return { ok: false as const, silent: false as const, msg: j?.error || j?.reason || "Не смог загрузить обзор" };
    }

    const nextFirstName = String(j.first_name || j.firstName || "").trim();
    const nextGoal = String(j.goal || "").trim();
    const nextWeight = j.weight === null || j.weight === undefined ? null : Number(j.weight);

    const workoutsMapped: Workout[] = (j.workouts || []).map((x: any) => ({
      id: Number(x.id),
      title: String(x.title || "").trim() || "Без названия",
      workout_date: String(x.workout_date || ""),
      type: x.type === "cardio" ? "cardio" : "strength",
      duration_min: x.duration_min == null ? null : Number(x.duration_min),
      status: x.status === "done" ? "done" : "draft",
      completed_at: x.completed_at == null ? null : String(x.completed_at),
      created_at: x.created_at == null ? null : String(x.created_at),
    }));

    let wp: WeightPoint[] = [];
    const rP = await fetch("/api/sport/profile", {
      credentials: "include",
      signal,
      cache: "no-store",
    });
    const jP = await rP.json().catch(() => ({} as any));

    if (rP.ok && jP.ok && Array.isArray(jP.weight_history)) {
      wp = jP.weight_history
        .map((p: any) => ({
          value: Number(p.value),
          measured_at: String(p.measured_at || ""),
        }))
        .filter((p: any) => Number.isFinite(p.value) && p.measured_at);

      wp.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
      wp = wp.slice(-15);
    }

    setFirstName(nextFirstName);
    setGoal(nextGoal);
    setWeight(nextWeight);
    setWorkouts(workoutsMapped);
    setWeightPoints(wp);

    writeOverviewCache({
      revApp: stateRef.current.revApp,
      firstName: nextFirstName,
      goal: nextGoal,
      weight: nextWeight,
      workouts: workoutsMapped,
      weightPoints: wp,
    });

    return { ok: true as const };
  }

  async function loadOverview(opts?: { force?: boolean }) {
    const force = Boolean(opts?.force);

    const cached = !force ? readOverviewCache() : null;
    if (cached) {
      stateRef.current.revApp = cached.revApp;
      setFirstName(cached.firstName);
      setGoal(cached.goal);
      setWeight(cached.weight);
      setWorkouts(cached.workouts);
      setWeightPoints(cached.weightPoints);
    }

    if (inFlightRef.current) {
      try {
        inFlightRef.current.abort();
      } catch {}
    }
    const ac = new AbortController();
    inFlightRef.current = ac;

    setHint(null);
    if (!cached) setLoading(true);

    try {
      const revNow = await fetchAppRev(ac.signal);

      if (revNow == null) {
        if (cached && isCacheFresh(cached.savedAt)) return;
      } else {
        if (cached && !force && cached.revApp === revNow) return;
        stateRef.current.revApp = revNow;
      }

      const res = await fetchAndApplyOverview(ac.signal);
      if (!res.ok) {
        if (!res.silent) setHint(res.msg);
        return;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setHint(String(e?.message || e));
    } finally {
      if (inFlightRef.current === ac) inFlightRef.current = null;
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();

    return () => {
      if (inFlightRef.current) {
        try {
          inFlightRef.current.abort();
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onRefresh() {
      loadOverview({ force: true });
    }
    window.addEventListener("sport:refresh", onRefresh as EventListener);
    return () => window.removeEventListener("sport:refresh", onRefresh as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") loadOverview();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function askDelete(id: number) {
    setDeleteId(id);
    setShowConfirm(true);
  }

  function closeConfirm() {
    if (deleteLoading) return;
    setShowConfirm(false);
    setDeleteId(null);
  }

  async function handleDelete() {
    if (!deleteId || deleteLoading) return;

    const id = deleteId;
    const res = await deleteWorkout(id);

    if (!res.ok) {
      setHint(res.error || "Не смог удалить тренировку");
      return;
    }

    setShowConfirm(false);
    setDeleteId(null);

    setWorkouts((prev) => {
      const next = prev.filter((w) => w.id !== id);

      writeOverviewCache({
        revApp: stateRef.current.revApp,
        firstName: stateRef.current.firstName,
        goal: stateRef.current.goal,
        weight: stateRef.current.weight,
        workouts: next,
        weightPoints: stateRef.current.weightPoints,
      });

      return next;
    });

    window.dispatchEvent(new Event("sport:refresh"));
  }

  function workoutsByDateKey(all: Workout[], dateKey: string) {
    return all
      .filter((w) => w.completed_at && ymd(new Date(w.completed_at)) === dateKey)
      .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
  }

  async function fetchWorkoutSummary(workoutId: number, signal?: AbortSignal) {
    const cached = calCacheRef.current.get(workoutId);
    if (cached) return cached;

    const r = await fetch(`/api/sport/workouts/summary?workout_id=${workoutId}`, {
      credentials: "include",
      cache: "no-store",
      signal,
    });

    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || j?.reason || "Не смог загрузить тренировку");

    const data: WorkoutSummary = {
      workout: {
        id: Number(j?.workout?.id),
        title: String(j?.workout?.title || "").trim() || "Без названия",
        completed_at: j?.workout?.completed_at ? String(j.workout.completed_at) : null,
      },
      exercises: Array.isArray(j?.exercises)
        ? j.exercises
            .map((x: any) => ({ id: Number(x.id), name: String(x.name || "").trim() }))
            .filter((x: any) => Number.isFinite(x.id) && x.id > 0 && x.name)
        : [],
    };

    calCacheRef.current.set(workoutId, data);
    return data;
  }

  // ВАЖНО: anchorEl нужен, чтобы поставить попап "поверх" в нужном месте
  async function openCalendarPopup(date: Date, anchorEl: HTMLElement) {
    const wrap = anchorEl.closest(`.${styles.calWrap}`) as HTMLElement | null;
    const wrapRect = wrap?.getBoundingClientRect();
    const aRect = anchorEl.getBoundingClientRect();

    const baseLeft = wrapRect ? aRect.left - wrapRect.left : 12;
    const baseTop = wrapRect ? aRect.top - wrapRect.top : 12;

    const popW = 270;
    const popH = 240;

    const wrapW = wrapRect?.width ?? 360;
    const wrapH = wrapRect?.height ?? 420;

    let left = baseLeft + aRect.width + 10;
    let top = baseTop;

    if (left + popW > wrapW - 8) left = Math.max(8, baseLeft - popW - 10);
    if (top + popH > wrapH - 8) top = Math.max(8, wrapH - popH - 8);
    if (top < 8) top = 8;

    setPopPos({ left, top });

    const key = ymd(date);
    const list = workoutsByDateKey(workouts, key);

    setCalDateKey(key);
    setCalWorkouts(list);
    setCalOpen(true);
    setCalSummary(null);

    const firstId = list[0]?.id ?? null;
    setCalActiveId(firstId);

    if (!firstId) return;

    if (calAbortRef.current) {
      try {
        calAbortRef.current.abort();
      } catch {}
    }
    const ac = new AbortController();
    calAbortRef.current = ac;

    setCalLoading(true);
    try {
      const s = await fetchWorkoutSummary(firstId, ac.signal);
      setCalSummary(s);
    } catch {
      setCalSummary(null);
    } finally {
      if (calAbortRef.current === ac) calAbortRef.current = null;
      setCalLoading(false);
    }
  }

  async function switchPopupWorkout(workoutId: number) {
    setCalActiveId(workoutId);
    setCalSummary(null);

    if (calAbortRef.current) {
      try {
        calAbortRef.current.abort();
      } catch {}
    }
    const ac = new AbortController();
    calAbortRef.current = ac;

    setCalLoading(true);
    try {
      const s = await fetchWorkoutSummary(workoutId, ac.signal);
      setCalSummary(s);
    } catch {
      setCalSummary(null);
    } finally {
      if (calAbortRef.current === ac) calAbortRef.current = null;
      setCalLoading(false);
    }
  }

  // ===== swipe handlers on calWrap =====
  function onCalPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    swipeRef.current.down = true;
    swipeRef.current.startX = e.clientX;
    swipeRef.current.startY = e.clientY;
    swipeRef.current.pointerId = e.pointerId;
    swipeRef.current.decided = false;
    swipeRef.current.isHorizontal = false;

    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function onCalPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeRef.current.down) return;

    const dx = e.clientX - swipeRef.current.startX;
    const dy = e.clientY - swipeRef.current.startY;

    if (!swipeRef.current.decided) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (ax < 8 && ay < 8) return;

      swipeRef.current.decided = true;
      swipeRef.current.isHorizontal = ax > ay * 1.2;

      // если пошли в горизонталь, стараемся не скроллить страницу
      if (swipeRef.current.isHorizontal) {
        e.preventDefault();
      }
      return;
    }

    if (swipeRef.current.isHorizontal) {
      e.preventDefault();
    }
  }

  function onCalPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeRef.current.down) return;

    const dx = e.clientX - swipeRef.current.startX;
    const dy = e.clientY - swipeRef.current.startY;

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    const isHorizontal = swipeRef.current.decided ? swipeRef.current.isHorizontal : ax > ay * 1.2;

    swipeRef.current.down = false;
    swipeRef.current.pointerId = null;

    if (!isHorizontal) return;
    if (ax < 60) return;

    // dx > 0 = свайп вправо (обычно это прошлый месяц)
    if (dx > 0) goMonth(-1);
    else goMonth(1);
  }

  function onCalPointerCancel() {
    swipeRef.current.down = false;
    swipeRef.current.pointerId = null;
  }

  const calSlideStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      transition: "transform 170ms ease, opacity 170ms ease",
      willChange: "transform, opacity",
    };

    if (calAnim.phase === "idle") {
      return { ...base, transform: "translateX(0px)", opacity: 1 };
    }

    // out: уезжаем в сторону движения
    if (calAnim.phase === "out") {
      const px = 16 * calAnim.dir;
      return { ...base, transform: `translateX(${px}px)`, opacity: 0.55 };
    }

    // in: приезжаем с противоположной стороны
    const px = -16 * calAnim.dir;
    return { ...base, transform: `translateX(${px}px)`, opacity: 0.55 };
  }, [calAnim]);

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Обзор</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Разделы дневника тренировок">
          {TABS.map((t) => {
            const active = isActiveTab(pathname, t.href);
            const hasIcon = Boolean(t.icon);

            return (
              <Link
                key={t.href}
                href={t.href}
                className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}
                title={t.label}
              >
                {t.showDot ? <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} /> : null}
                {hasIcon ? renderTabIcon(t.icon) : t.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.heroHello}>{hello}</div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiItem} onClick={() => router.push("/sport/profile")}>
            <div className={styles.kpiLabel}>Текущая цель</div>
            <div className={styles.kpiValue}>{goal || "Не задана"}</div>
          </div>

          <div className={styles.kpiItem} onClick={() => router.push("/sport/profile")}>
            <div className={styles.kpiLabel}>Текущий вес</div>
            <div className={styles.kpiValue}>{weight === null ? "—" : `${fmtWeight(weight)} кг`}</div>
          </div>

          <div className={styles.kpiItem} style={{ gridColumn: "1 / -1" }}>
            <div className={styles.kpiLabel}>Динамика веса</div>

            {weightPoints.length < 2 ? (
              <div className={styles.kpiValue}>Пока мало данных</div>
            ) : (
              <WeightSparkline points={weightPoints} />
            )}
          </div>
        </div>

        <button type="button" className={styles.bigCta} onClick={() => router.push("/sport/stats")}>
          <div className={styles.bigCtaRow}>
            <span className={styles.bigCtaText}>Больше статистики</span>
            <span className={styles.bigCtaIcon}>
              <IconArrow size={25} style={{ color: "#ffffff" }} />
            </span>
          </div>
        </button>

        <section className={styles.card} style={{ marginTop: 14, overflow: "hidden" }}>
          <div style={calSlideStyle}>
            <div className={styles.calHeader}>
              <div className={styles.calTitle}>{monthLabel(viewMonth)}</div>
              <div className={styles.muted}>Тренировок в этом месяце: {trainingsThisMonth}</div>
            </div>

            {/* свайп сюда */}
            <div
              className={styles.calWrap}
              onPointerDown={onCalPointerDown}
              onPointerMove={onCalPointerMove}
              onPointerUp={onCalPointerUp}
              onPointerCancel={onCalPointerCancel}
              style={{
                touchAction: "pan-y",
                userSelect: "none",
              }}
              aria-label="Календарь. Свайпни влево или вправо, чтобы сменить месяц"
              title="Свайпни влево/вправо чтобы сменить месяц"
            >
              <div className={styles.calWeekdays}>
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((x) => (
                  <div key={x} className={styles.calWeekday}>
                    {x}
                  </div>
                ))}
              </div>

              <div className={styles.calGrid}>
                {calendar.map((cell) => {
                  if (!cell.date) return <div key={cell.key} className={styles.calCellEmpty} />;

                  const key = ymd(cell.date);
                  const hasWorkout = workoutDays.has(key);
                  const isToday = key === todayKey;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      className={`${styles.calCellBtn} ${styles.calCell} ${isToday ? styles.calCellToday : ""}`}
                      title={key}
                      onClick={(e) => openCalendarPopup(cell.date!, e.currentTarget)}
                    >
                      <span className={styles.calDayNum}>{cell.date.getDate()}</span>
                      {hasWorkout ? <span className={styles.calDot} /> : null}
                    </button>
                  );
                })}
              </div>

              {calOpen && (
                <>
                  {/* оверлей внутри календаря */}
                  <button
                    type="button"
                    className={styles.calOverlay}
                    onClick={() => setCalOpen(false)}
                    aria-label="Закрыть"
                  />

                  {/* попап поверх календаря */}
                  <div className={styles.calPopover} style={{ left: popPos.left, top: popPos.top }} role="dialog">
                    <div className={styles.calPopupHead}>
                      <div className={styles.calPopupTitle}>
                        {calSummary?.workout?.title
                          ? calSummary.workout.title
                          : calLoading
                          ? "Загружаю…"
                          : "—"}{" "}
                      </div>
                      <button type="button" className={styles.calPopupClose} onClick={() => setCalOpen(false)}>
                        ✕
                      </button>
                    </div>

                    {calWorkouts.length === 0 ? (
                      <div className={styles.muted}>В этот день тренировок нет</div>
                    ) : (
                      <>
                        {calWorkouts.length > 1 && (
                          <div className={styles.calPopupTabs}>
                            {calWorkouts.map((w) => (
                              <button
                                key={w.id}
                                type="button"
                                className={`${styles.calPopupTab} ${
                                  calActiveId === w.id ? styles.calPopupTabActive : ""
                                }`}
                                onClick={() => switchPopupWorkout(w.id)}
                              >
                                {w.title || "Без названия"}
                              </button>
                            ))}
                          </div>
                        )}

                        {calLoading ? (
                          <div className={styles.muted}>Загружаю…</div>
                        ) : !calSummary ? (
                          <div className={styles.muted}>Не удалось загрузить данные</div>
                        ) : (
                          <div className={styles.calPopupBody}>
                            <div className={styles.muted}>
                              {calSummary.workout.completed_at
                                ? new Date(calSummary.workout.completed_at).toLocaleString("ru-RU")
                                : ""}
                            </div>

                            <div className={styles.calPopupSection}>
                              {calSummary.exercises.length ? (
                                <ul className={styles.muted}>
                                  {calSummary.exercises.map((ex) => (
                                    <li key={ex.id}>{ex.name}</li>
                                  ))}
                                </ul>
                              ) : (
                                <div className={styles.muted}>Упражнений пока нет</div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className={styles.listWrap} style={{ marginTop: 14 }}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>Тренировки этого месяца</div>
            <div className={styles.muted}>{workoutsThisMonthSorted.length} шт.</div>
          </div>

          {hint ? <div className={styles.hintDanger}>{hint}</div> : null}

          {loading ? (
            <div className={styles.muted}>Загружаю…</div>
          ) : workoutsThisMonthSorted.length === 0 ? (
            <div className={styles.empty}>В этом месяце тренировок пока нет.</div>
          ) : (
            <div className={styles.list}>
              {workoutsThisMonthSorted.map((w) => {
                const dateKey = ymd(new Date(w.completed_at!));

                return (
                  <div
                    key={w.id}
                    className={styles.listItem}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/sport/workouts/curworkout?workout_id=${w.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/sport/workouts/curworkout?workout_id=${w.id}`);
                      }
                    }}
                    title="Открыть тренировку"
                  >
                    <div className={styles.listItemMain}>
                      <div className={styles.titleText}>{w.title || "Без названия"}</div>

                      <div className={styles.metaRow}>
                        <span className={styles.chip}>{formatDateRu(dateKey)}</span>
                        <span className={styles.chip}>{typeLabel(w.type)}</span>
                        {w.duration_min ? <span className={styles.chip}>{w.duration_min} мин</span> : null}

                        {w.type === "strength" ? (
                          statsLoading ? (
                            <span className={styles.chip}>Считаю…</span>
                          ) : statsByWorkoutId?.[w.id] ? (
                            <span className={styles.chip}>{statsByWorkoutId[w.id].exerciseCount} упр</span>
                          ) : null
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={styles.trashBtn}
                      disabled={deleteLoading}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        askDelete(w.id);
                      }}
                      title="Удалить тренировку"
                      aria-label="Удалить тренировку"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {showConfirm && (
          <div className={styles.modalOverlay} onClick={closeConfirm}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Удалить тренировку?</div>
              <div className={styles.modalText}>Это действие нельзя отменить.</div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeConfirm}
                  disabled={deleteLoading}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={handleDelete}
                  disabled={deleteLoading || !deleteId}
                >
                  {deleteLoading ? "Удаляю..." : "Удалить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}