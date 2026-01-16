// app/sport/overview/page.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconUser, IconStats, IconArrow, IconTrash, IconHome, IconEdit } from "@/app/components/icons";
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

  const vals = (points || [])
    .map((p) => Number(p.value))
    .filter((n) => Number.isFinite(n));

  if (vals.length < 2) {
    return (
      <div ref={ref} style={{ width: "100%", marginTop: 8 }}>
        <div className={styles.muted}>Пока мало данных</div>
      </div>
    );
  }

  const W = Math.max(10, wPx);
  const H = 140; // увеличили высоту под даты
  const padX = 14;
  const padY = 12;
  const axisBottom = H - 22; // линия X

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

  const d = coords
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

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
          {/* горизонтальные пунктиры */}
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

          {/* вертикальные пунктиры */}
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

          {/* линия */}
          <path
            d={d}
            fill="none"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* точки + значения */}
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
                <text
                  x={textX}
                  y={textY}
                  textAnchor={textAnchor}
                  fontSize="10"
                  fill="rgba(0,0,0,0.65)"
                >
                  {fmtWeight(p.v)}
                </text>
              </g>
            );
          })}

          {/* подписи дат по оси X */}
          {coords.map((p, i) => {
            const show =
              i === 0 ||
              i === coords.length - 1 ||
              i === Math.floor(coords.length / 2);

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

      <div
        className={styles.muted}
        style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <span>Последний: {fmtWeight(last)} кг</span>
        <span>Результат: {deltaText}</span>
      </div>
    </div>
  );
}

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

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const todayKey = useMemo(() => ymd(new Date()), []);
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      setHint(null);

      try {
        // 1) overview
        const r = await fetch("/api/sport/overview", { credentials: "include" });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          if (j?.reason === "NO_SESSION") return;
          setHint(j?.error || j?.reason || "Не смог загрузить обзор");
          return;
        }

        setFirstName(String(j.first_name || j.firstName || "").trim());
        setGoal(String(j.goal || "").trim());
        setWeight(j.weight === null || j.weight === undefined ? null : Number(j.weight));

        const mapped: Workout[] = (j.workouts || []).map((x: any) => ({
          id: Number(x.id),
          title: String(x.title || "").trim() || "Без названия",
          workout_date: String(x.workout_date || ""),
          type: x.type === "cardio" ? "cardio" : "strength",
          duration_min: x.duration_min == null ? null : Number(x.duration_min),
          status: x.status === "done" ? "done" : "draft",
          completed_at: x.completed_at == null ? null : String(x.completed_at),
          created_at: x.created_at == null ? null : String(x.created_at),
        }));
        setWorkouts(mapped);

        // 2) веса для графика (последние 10)
        const rP = await fetch("/api/sport/profile", { credentials: "include" });
        const jP = await rP.json().catch(() => ({} as any));

        if (rP.ok && jP.ok && Array.isArray(jP.weight_history)) {
          const series: WeightPoint[] = jP.weight_history
            .map((p: any) => ({
              value: Number(p.value),
              measured_at: String(p.measured_at || ""),
            }))
            .filter((p: any) => Number.isFinite(p.value) && p.measured_at);

          series.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
          setWeightPoints(series.slice(-15));
        } else {
          setWeightPoints([]);
        }
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
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
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }

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

        <section className={styles.card} style={{ marginTop: 14 }}>
          <div className={styles.calHeader}>
            <div className={styles.calTitle}>{monthLabel(now)}</div>
            <div className={styles.muted}>Тренировок в этом месяце: {trainingsThisMonth}</div>
          </div>

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
                <div
                  key={cell.key}
                  className={`${styles.calCell} ${isToday ? styles.calCellToday : ""}`}
                  title={key}
                >
                  <span className={styles.calDayNum}>{cell.date.getDate()}</span>
                  {hasWorkout ? <span className={styles.calDot} /> : null}
                </div>
              );
            })}
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