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

type TopExercise = {
  exercise_id: number;
  name: string;
  delta: number;
  unit: "kg" | "reps";
};

type OverviewStats = {
  workouts_7d: number;
  workouts_28d: number;
  volume_7d: number;
  volume_28d: number;
  top: TopExercise[];
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

/** динамический диапазон Y */
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

/* ---------- chart plot (без заголовков) ---------- */

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
      <div className={styles.muted} style={{ lineHeight: 1.4 }}>
        Нужно минимум 2 замера, чтобы построить график.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 240 }}>
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
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              borderColor: "rgba(0,0,0,0.08)",
            }}
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
              style={{ fontSize: 10, fill: "rgba(0,0,0,0.6)" }}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- ChartCard (для веса: с заголовком) ---------- */

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
    <section className={styles.listWrap} style={{ marginTop: 14 }}>
      <div className={styles.listHeader}>
        <div className={styles.sectionTitle}>{title}</div>
        <div className={styles.muted}>{subtitle || ""}</div>
      </div>

      <div className={styles.list}>
        <div className={styles.listItem} style={{ cursor: "default" }}>
          <div className={styles.listItemMain}>
            <ChartPlot data={data} unit={unit} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- page ---------- */

export default function SportStatsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<StatsTab>("overview");

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewStats | null>(null);

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
        const r = await fetch("/api/sport/stats/overview", { credentials: "include" });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) return;

        setOverview({
          workouts_7d: Number(j.workouts_7d || 0),
          workouts_28d: Number(j.workouts_28d || 0),
          volume_7d: Number(j.volume_7d || 0),
          volume_28d: Number(j.volume_28d || 0),
          top: Array.isArray(j.top) ? j.top : [],
        });
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [tab]);

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

  const workouts7 = overview ? overview.workouts_7d : 0;
  const workouts28 = overview ? overview.workouts_28d : 0;
  const vol7 = overview ? overview.volume_7d : 0;
  const vol28 = overview ? overview.volume_28d : 0;

  const top3 = useMemo(() => (overview?.top || []).slice(0, 3), [overview]);

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

        <nav className={styles.tabWrap} aria-label="Раздел статистики" style={{ marginTop: 10 }}>
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
        {loading ? <div className={styles.muted} style={{ marginTop: 10 }}>Загружаю…</div> : null}

        {tab === "overview" ? (
          <>
            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Тренировки</div>
                <div className={styles.muted}>за периоды</div>
              </div>

              <div className={styles.list} style={{ gap: 10 }}>
                <div className={styles.listItem} style={{ cursor: "default" }}>
                  <div className={styles.listItemMain}>
                    <div className={styles.metaRow}>
                      <span className={styles.chip}>7 дней: {fmtNum(workouts7)}</span>
                      <span className={styles.chip}>28 дней: {fmtNum(workouts28)}</span>
                    </div>
                    <div className={styles.muted} style={{ marginTop: 8, lineHeight: 1.35 }}>
                      Потом добавим: среднее в неделю и сравнение с прошлым периодом.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Объём</div>
                <div className={styles.muted}>только силовые</div>
              </div>

              <div className={styles.list} style={{ gap: 10 }}>
                <div className={styles.listItem} style={{ cursor: "default" }}>
                  <div className={styles.listItemMain}>
                    <div className={styles.metaRow}>
                      <span className={styles.chip}>7 дней: {fmtNum(vol7)} кг</span>
                      <span className={styles.chip}>28 дней: {fmtNum(vol28)} кг</span>
                    </div>
                    <div className={styles.muted} style={{ marginTop: 8, lineHeight: 1.35 }}>
                      Потом добавим: объём на тренировку и тренд.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Лучший прогресс</div>
                <div className={styles.muted}>топ 3</div>
              </div>

              <div className={styles.list} style={{ gap: 10 }}>
                {top3.length ? (
                  top3.map((x) => (
                    <div key={x.exercise_id} className={styles.listItem} style={{ cursor: "default" }}>
                      <div className={styles.listItemMain}>
                        <div className={styles.titleText}>{x.name}</div>
                        <div className={styles.metaRow} style={{ marginTop: 8 }}>
                          <span className={styles.chip}>
                            +{fmtNum(x.delta)} {x.unit === "kg" ? "кг" : "повт"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.listItem} style={{ cursor: "default" }}>
                    <div className={styles.listItemMain}>
                      <div className={styles.muted} style={{ lineHeight: 1.35 }}>
                        Тут появятся упражнения, где лучше всего вырос результат.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <>
            {bodyHint ? <div className={styles.hintDanger}>{bodyHint}</div> : null}
            {bodyLoading ? <div className={styles.muted} style={{ marginTop: 10 }}>Загружаю…</div> : null}

            {/* 1) ВЕС */}
            <ChartCard title="Вес" subtitle={bodyPeriodText} data={weightData} unit="кг" />

            {/* 2) ЗАМЕРЫ */}
            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Замеры тела</div>
                <div className={styles.muted}>{bodyPeriodText}</div>
              </div>

              <div className={styles.list}>
                <div className={styles.listItem} style={{ cursor: "default" }}>
                  <div className={styles.listItemMain}>
                    {/* таб внутри listItem */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                      <button
                        type="button"
                        className={styles.tabBadge}
                        onClick={cycleSize}
                        title="Переключить параметр"
                        aria-label="Переключить параметр замеров"
                        style={{ whiteSpace: "nowrap" }}
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

            {/* 3) СОСТАВ */}
            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Состав тела</div>
                <div className={styles.muted}>{bodyPeriodText}</div>
              </div>

              <div className={styles.list}>
                <div className={styles.listItem} style={{ cursor: "default" }}>
                  <div className={styles.listItemMain}>
                    {/* таб внутри listItem */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                      <button
                        type="button"
                        className={styles.tabBadge}
                        onClick={cycleComp}
                        title="Переключить параметр"
                        aria-label="Переключить параметр состава тела"
                        style={{ whiteSpace: "nowrap" }}
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

        <div style={{ height: 16 }} />
      </main>
    </div>
  );
}