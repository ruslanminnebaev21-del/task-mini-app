"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";

/* ---------- types ---------- */

type StatsTab = "overview" | "body";
type OverviewPeriod = "week" | "month";

type OverviewCardKey = "workouts" | "tonnage" | "sets" | "duration";

type OverviewCard = {
  key: OverviewCardKey;
  current: number;
  prev: number;
  delta: number;
  trend: "up" | "down" | "same";
};

type OverviewApi = {
  ok: boolean;
  range?: {
    current?: { from: string; to: string };
    prev?: { from: string; to: string };
  };
  cards?: Partial<Record<OverviewCardKey, OverviewCard>>;
  reason?: string;
  error?: string;
};

type Point = { date: string; value: number };

type BodyApi = {
  ok: boolean;
  range?: { from: string | null; to: string | null };
  data?: {
    weight: Point[];
    sizes: {
      chest: Point[];
      waist: Point[];
      belly: Point[];
      pelvis: Point[];
      thigh: Point[];
      arm: Point[];
    };
    comp: {
      water: Point[];
      protein: Point[];
      minerals: Point[];
      body_fat: Point[];
      bmi: Point[];
      fat_percent: Point[];
      visceral_fat: Point[];
    };
  };
  reason?: string;
  error?: string;
};

type SizeKey = "chest" | "waist" | "belly" | "pelvis" | "thigh" | "arm";
type CompKey = "water" | "protein" | "minerals" | "body_fat" | "bmi" | "fat_percent";

/* ---------- helpers ---------- */

function fmtNum(n: number | null | undefined) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(v).replace(".", ",");
}

function formatDateRu(ymd: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}.${m}.${y}` : ymd;
}

function toChartData(points: { date: string; value: number }[]) {
  return (points || [])
    .filter((p) => p && p.date && Number.isFinite(Number(p.value)))
    .map((p) => ({ date: p.date, value: Number(p.value) }));
}

function calcYDomain(values: number[]) {
  const clean = (values || []).filter((v) => Number.isFinite(v));
  if (clean.length < 2) return ["auto", "auto"] as const;

  const min = Math.min(...clean);
  const max = Math.max(...clean);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return ["auto", "auto"] as const;

  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05);
    return [min - pad, max + pad] as const;
  }

  const range = max - min;
  const pad = range * 0.1;
  return [min - pad, max + pad] as const;
}

function nextKey<T extends string>(keys: T[], cur: T): T {
  const idx = keys.indexOf(cur);
  if (idx === -1) return keys[0];
  return keys[(idx + 1) % keys.length];
}

function formatHms(totalSeconds: number) {
  const t = Math.max(0, Math.trunc(Number(totalSeconds || 0)));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function trendArrow(trend: "up" | "down" | "same") {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "+";
}

/* ---------- chart plot ---------- */

function ChartPlot({
  data,
  unit,
}: {
  data: Array<{ date: string; value: number }>;
  unit?: string;
}) {
  const hasData = (data?.length || 0) >= 2;

  const yValues = useMemo(() => data.map((d) => d.value), [data]);
  const yDomain = useMemo(() => calcYDomain(yValues), [yValues]);

  if (!hasData) {
    return (
      <div className={`${styles.muted} ${styles.chartEmpty}`}>
        Нужно минимум 2 замера, чтобы построить график.
      </div>
    );
  }

  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="date"
            tickFormatter={formatDateRu}
            minTickGap={22}
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.45)" }}
          />

          <YAxis
            type="number"
            scale="linear"
            domain={yDomain as [number, number]}
            allowDataOverflow
            tickFormatter={(v) => fmtNum(v)}
            width={40}
            tick={{ fontSize: 10, fill: "rgba(0,0,0,0.45)" }}
          />

          <Tooltip
            labelFormatter={(l) => formatDateRu(String(l))}
            contentStyle={{}}
            wrapperStyle={{}}
            formatter={(v: any) => {
              const n = Number(v);
              const txt = Number.isFinite(n) ? fmtNum(n) : String(v);
              return [unit ? `${txt} ${unit}` : txt, ""];
            }}
          />

          <Line type="monotone" dataKey="value" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}>
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: any) => fmtNum(v)}
              className={styles.chartLabel}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- ChartCard ---------- */

function ChartCard({
  title,
  subtitle,
  data,
  unit,
}: {
  title: string;
  subtitle?: string | null;
  data: Array<{ date: string; value: number }>;
  unit?: string;
}) {
  return (
    <section className={`${styles.listWrap} ${styles.statsSection}`}>
      <div className={styles.listHeader}>
        <div className={styles.sectionTitle}>{title}</div>
        <div className={styles.muted}>{subtitle || ""}</div>
      </div>

      <div className={styles.list}>
        <div className={`${styles.listItem} ${styles.listItemStatic}`}>
          <div className={styles.listItemMain}>
            <ChartPlot data={data} unit={unit} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Overview карточка ---------- */

function OverviewStatCard({
  title,
  value,
  unit,
  delta,
  deltaHint,
  trend = "same",
}: {
  title: string;
  value: string;
  unit?: string;
  delta: { badge: string; tail: string };
  deltaHint?: string;
  trend?: "up" | "down" | "same";
}) {
  const deltaClass =
    trend === "up"
      ? styles.deltaUp
      : trend === "down"
      ? styles.deltaDown
      : styles.deltaSame;

  return (
    <div className={`${styles.listItem} ${styles.overviewCard}`}>
      <div className={styles.overviewCardHead}>
        <div className={`${styles.muted} ${styles.overviewCardTitle}`}>{title}</div>
        <div className={styles.overviewCardDecor} />
      </div>

      <div className={styles.overviewCardValueBlock}>
        <div className={styles.overviewCardValue}>{value}</div>
        {unit ? <div className={styles.overviewCardUnit}>{unit}</div> : null}
      </div>

      <div className={styles.overviewCardFoot}>
        <div className={styles.overviewCardDelta}>
          <span className={`${styles.deltaBadge} ${deltaClass}`}>{delta.badge}</span>
          <span className={styles.deltaTail}> {delta.tail}</span>
        </div>

        {deltaHint ? (
          <div className={`${styles.muted} ${styles.overviewCardHint}`}>{deltaHint}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function SportStatsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<StatsTab>("overview");

  // NEW: период обзора
  const [overviewPeriod, setOverviewPeriod] = useState<OverviewPeriod>("week");

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewApi | null>(null);

  // BODY
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyHint, setBodyHint] = useState<string | null>(null);
  const [body, setBody] = useState<BodyApi["data"] | null>(null);
  const [bodyRange, setBodyRange] = useState<{ from: string | null; to: string | null } | null>(null);

  const [sizeKey, setSizeKey] = useState<SizeKey>("waist");
  const [compKey, setCompKey] = useState<CompKey>("fat_percent");

  // ---------- OVERVIEW ----------
  useEffect(() => {
    if (tab !== "overview") return;

    (async () => {
      setLoading(true);
      setHint(null);

      try {
        const r = await fetch(`/api/sport/stats/overview?period=${overviewPeriod}`, {
          credentials: "include",
        });
        const j: OverviewApi = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          const msg =
            j?.reason === "NO_SESSION"
              ? "Нет сессии. Открой через Telegram."
              : j?.error || j?.reason || `HTTP ${r.status}`;
          setHint(msg);
          setOverview(null);
          return;
        }

        setOverview(j);
      } catch (e: any) {
        setHint(String(e?.message || e));
        setOverview(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, overviewPeriod]);

  // ---------- BODY ----------
  useEffect(() => {
    if (tab !== "body") return;
    if (body) return;

    (async () => {
      setBodyLoading(true);
      setBodyHint(null);

      try {
        const r = await fetch("/api/sport/stats/body", { credentials: "include" });
        const j: BodyApi = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok || !j.data) {
          const msg =
            j?.reason === "NO_SESSION"
              ? "Нет сессии. Открой через Telegram."
              : j?.error || j?.reason || `HTTP ${r.status}`;
          setBodyHint(msg);
          return;
        }

        setBody(j.data);
        setBodyRange(j.range || null);
      } catch (e: any) {
        setBodyHint(String(e?.message || e));
      } finally {
        setBodyLoading(false);
      }
    })();
  }, [tab, body]);

  const cards = overview?.cards || {};

  // const currentPeriod = overview?.range?.current
  //   ? `${formatDateRu(overview.range.current.from)} – ${formatDateRu(overview.range.current.to)}`
  //   : overviewPeriod === "month"
  //   ? "текущий месяц"
  //   : "текущая неделя";

  // const prevPeriod =
  //   overview?.range?.prev
  //     ? `${formatDateRu(overview.range.prev.from)} – ${formatDateRu(overview.range.prev.to)}`
  //     : overviewPeriod === "month"
  //     ? "предыдущего месяца"
  //     : "предыдущей недели";
// показываем человеку-подписи, а не даты
  const currentPeriod = overviewPeriod === "month" ? "текущий месяц" : "текущая неделя";
  const prevPeriod = overviewPeriod === "month" ? "предыдущего месяца" : "предыдущей недели";

  const bodyPeriodText = useMemo(() => {
    const from = bodyRange?.from;
    const to = bodyRange?.to;
    if (!from || !to) return "за всё время";
    return `${formatDateRu(from)} – ${formatDateRu(to)}`;
  }, [bodyRange]);

  const weightData = useMemo(() => toChartData(body?.weight || []), [body]);

  const sizesMeta = useMemo(() => {
    const map: Record<SizeKey, { label: string; unit: string; data: Point[] }> = {
      chest: { label: "Грудь", unit: "см", data: body?.sizes.chest || [] },
      waist: { label: "Талия", unit: "см", data: body?.sizes.waist || [] },
      belly: { label: "Живот", unit: "см", data: body?.sizes.belly || [] },
      pelvis: { label: "Таз", unit: "см", data: body?.sizes.pelvis || [] },
      thigh: { label: "Ляжка", unit: "см", data: body?.sizes.thigh || [] },
      arm: { label: "Рука", unit: "см", data: body?.sizes.arm || [] },
    };
    return map;
  }, [body]);

  const compMeta = useMemo(() => {
    const map: Record<CompKey, { label: string; unit: string; data: Point[] }> = {
      water: { label: "Вода", unit: "%", data: body?.comp.water || [] },
      protein: { label: "Протеин", unit: "%", data: body?.comp.protein || [] },
      minerals: { label: "Минералы", unit: "%", data: body?.comp.minerals || [] },
      body_fat: { label: "Жир в теле", unit: "кг", data: body?.comp.body_fat || [] },
      bmi: { label: "ИМТ", unit: "", data: body?.comp.bmi || [] },
      fat_percent: { label: "% жира", unit: "%", data: body?.comp.fat_percent || [] },
    };
    return map;
  }, [body]);

  const sizeKeys = useMemo(() => Object.keys(sizesMeta) as SizeKey[], [sizesMeta]);
  const compKeys = useMemo(() => Object.keys(compMeta) as CompKey[], [compMeta]);

  function cycleSize() {
    if (!sizeKeys.length) return;
    setSizeKey((cur) => nextKey(sizeKeys, cur));
  }

  function cycleComp() {
    if (!compKeys.length) return;
    setCompKey((cur) => nextKey(compKeys, cur));
  }

  const activeSize = sizesMeta[sizeKey];
  const activeComp = compMeta[compKey];

  const sizesData = useMemo(() => toChartData(activeSize?.data || []), [activeSize]);
  const compData = useMemo(() => toChartData(activeComp?.data || []), [activeComp]);

  function makeDeltaParts(c?: OverviewCard, mode?: "num" | "hms") {
    const safe =
      c || ({
        current: 0,
        prev: 0,
        delta: 0,
        trend: "same",
        key: "workouts" as OverviewCardKey,
      } as OverviewCard);

    const arrow = trendArrow(safe.trend);
    const sign = safe.delta > 0 ? "+" : safe.delta < 0 ? "−" : "";
    const abs = Math.abs(safe.delta);

    const deltaVal = mode === "hms" ? formatHms(abs) : fmtNum(abs);

    return {
      badge: `${arrow} ${sign}${deltaVal}`.trim(),
      tail: `от ${prevPeriod}`,
    };
  }

  function toggleOverviewPeriod() {
    setOverviewPeriod((p) => (p === "week" ? "month" : "week"));
  }

  const periodBadgeText = overviewPeriod === "week" ? "Неделя" : "Месяц";

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Статистика</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Навигация">
          <button type="button" className={styles.tabBadge} onClick={() => router.back()} title="Назад">
            <span className={styles.dot} />
            Назад
          </button>
        </nav>

        <nav className={`${styles.tabWrap} ${styles.statsTabs}`} aria-label="Раздел статистики">
          <button
            type="button"
            className={`${styles.tabBadge} ${tab === "overview" ? styles.tabBadgeActive : ""}`}
            onClick={() => setTab("overview")}
            title="Обзор"
          >
            <span className={`${styles.dot} ${tab === "overview" ? styles.dotActive : ""}`} />
            Обзор
          </button>

          <button
            type="button"
            className={`${styles.tabBadge} ${tab === "body" ? styles.tabBadgeActive : ""}`}
            onClick={() => setTab("body")}
            title="Тело"
          >
            <span className={`${styles.dot} ${tab === "body" ? styles.dotActive : ""}`} />
            Тело
          </button>
        </nav>

        {hint ? <div className={styles.hintDanger}>{hint}</div> : null}
        {/*{loading ? <div className={`${styles.muted} ${styles.statsTopGap}`}>Загружаю…</div> : null}*/}

        {tab === "overview" ? (
          <section className={`${styles.listWrap} ${styles.statsSection}`}>
            <div className={styles.listHeader}>
              <div className={styles.sectionTitle}>Обзор</div>

              {/* вместо "текущая неделя" */}
              <button
                type="button"
                className={`${styles.tabBadge} ${styles.tabBadgeNowrap}`}
                onClick={toggleOverviewPeriod}
                title={currentPeriod}
                aria-label="Переключить период обзора"
              >
                <span className={`${styles.dot} ${styles.dotActive}`} />
                {periodBadgeText}
              </button>
            </div>

            <div className={styles.overviewGrid}>
              <OverviewStatCard
                title="Тренировок"
                value={fmtNum(cards.workouts?.current || 0)}
                delta={makeDeltaParts(cards.workouts, "num")}
                trend={cards.workouts?.trend || "same"}
              />

              <OverviewStatCard
                title="Тоннаж"
                value={fmtNum(cards.tonnage?.current || 0)}
                delta={makeDeltaParts(cards.tonnage, "num")}
                trend={cards.tonnage?.trend || "same"}
              />

              <OverviewStatCard
                title="Подходы"
                value={fmtNum(cards.sets?.current || 0)}
                delta={makeDeltaParts(cards.sets, "num")}
                trend={cards.sets?.trend || "same"}
              />

              <OverviewStatCard
                title="Длительность"
                value={formatHms(cards.duration?.current || 0)}
                delta={makeDeltaParts(cards.duration, "hms")}
                trend={cards.duration?.trend || "same"}
              />
            </div>
          </section>
        ) : (
          <>
            {bodyHint ? <div className={styles.hintDanger}>{bodyHint}</div> : null}
            {bodyLoading ? <div className={`${styles.muted} ${styles.statsTopGap}`}>Загружаю…</div> : null}

            <ChartCard title="Вес" subtitle={bodyPeriodText} data={weightData} unit="кг" />

            <section className={`${styles.listWrap} ${styles.statsSection}`}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Замеры тела</div>
                <div className={styles.muted}>{bodyPeriodText}</div>
              </div>

              <div className={styles.list}>
                <div className={`${styles.listItem} ${styles.listItemStatic}`}>
                  <div className={styles.listItemMain}>
                    <div className={styles.chartSwitchRow}>
                      <button
                        type="button"
                        className={`${styles.tabBadge} ${styles.tabBadgeNowrap}`}
                        onClick={cycleSize}
                        title="Переключить параметр"
                        aria-label="Переключить параметр замеров"
                        disabled={!sizeKeys.length}
                      >
                        <span className={`${styles.dot} ${styles.dotActive}`} />
                        {activeSize?.label || "Параметр"}
                      </button>
                    </div>

                    <ChartPlot data={sizesData} unit={activeSize?.unit || "см"} />
                  </div>
                </div>
              </div>
            </section>

            <section className={`${styles.listWrap} ${styles.statsSection}`}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Состав тела</div>
                <div className={styles.muted}>{bodyPeriodText}</div>
              </div>

              <div className={styles.list}>
                <div className={`${styles.listItem} ${styles.listItemStatic}`}>
                  <div className={styles.listItemMain}>
                    <div className={styles.chartSwitchRow}>
                      <button
                        type="button"
                        className={`${styles.tabBadge} ${styles.tabBadgeNowrap}`}
                        onClick={cycleComp}
                        title="Переключить параметр"
                        aria-label="Переключить параметр состава тела"
                        disabled={!compKeys.length}
                      >
                        <span className={`${styles.dot} ${styles.dotActive}`} />
                        {activeComp?.label || "Параметр"}
                      </button>
                    </div>

                    <ChartPlot data={compData} unit={activeComp?.unit || ""} />
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        <div className={styles.statsBottomSpacer} />
      </main>
    </div>
  );
}