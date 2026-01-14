// app/sport/page.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "./sport.module.css";
import { IconUser, IconStats, IconArrow } from "@/app/components/icons";
import { useWorkoutStats } from "@/app/hooks/useWorkoutStats";

type Tab = {
  label: string;
  href: string;
  showDot: boolean;
  icon?: "stats" | "user" | "dumbbell";
};

const TABS: Tab[] = [
  { label: "Тренировки", href: "/sport", showDot: true },
  { label: "Упражнения", href: "/sport/exercises", showDot: true },
  { label: "Статистика", href: "/sport/stats", showDot: false, icon: "stats" },
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
    case "stats":
      return <IconStats className={styles.tabIcon} />;
    case "dumbbell":
      return <IconStats className={styles.tabIcon} />;
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

export default function SportPage() {
  const pathname = usePathname();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [goal, setGoal] = useState("");
  const [weight, setWeight] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const todayKey = useMemo(() => ymd(new Date()), []);
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();

  // только завершённые, только с completed_at
  const doneWorkouts = useMemo(
    () => workouts.filter((w) => w.status === "done" && Boolean(w.completed_at)),
    [workouts]
  );

  // точки календаря по completed_at
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

  // список “этого месяца” тоже по completed_at
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
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Тренировки</h1>
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
                {t.showDot ? (
                  <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} />
                ) : null}
                {hasIcon ? renderTabIcon(t.icon) : t.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.heroHello}>{hello}</div>
        <div className={styles.kpiGrid}>
          <div className={styles.kpiItem}>
            <div className={styles.kpiLabel}>Текущая цель</div>
            <div className={styles.kpiValue}>{goal || "Не задана"}</div>
          </div>

          <div className={styles.kpiItem}>
            <div className={styles.kpiLabel}>Текущий вес</div>
            <div className={styles.kpiValue}>{weight === null ? "—" : `${weight} кг`}</div>
          </div>

          <button type="button" className={styles.bigCta} onClick={() => router.push("/sport/workouts")}>
            <div className={styles.bigCtaRow}>
              <span className={styles.bigCtaText}>Тренировка</span>
              <span className={styles.bigCtaIcon}>
                <IconArrow size={25} style={{ color: "#ffffff" }} />
              </span>
            </div>
          </button>
        </div>

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
                          <>
                            <span className={styles.chip}>{statsByWorkoutId[w.id].exerciseCount} упр</span>
                            <span className={styles.chip}>{Math.round(statsByWorkoutId[w.id].totalWeight)} кг</span>
                          </>
                          ) : null
                        ) : null}  
                      </div>

                    </div>

                    <span className={styles.listChevron}>›</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}