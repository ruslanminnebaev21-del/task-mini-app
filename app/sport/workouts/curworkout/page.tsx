// app/sport/workouts/curworkout/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../../sport.module.css";
import { useRouter } from "next/navigation";

type WorkoutType = "strength" | "cardio";

type ApiWorkout = {
  id: number;
  title: string | null;
  workout_date: string;
  type: WorkoutType;
  duration_min: number | null;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type ApiSet = {
  id: number;
  set_index: number | null;
  weight: number | null;
  reps: number | null;
};

type BestSet = { weight: number; reps: number };

type ApiExercise = {
  workout_exercise_id: number;
  exercise_id: number | null;
  name: string;
  order_index: number | null;
  note: string | null;
  sets: ApiSet[];

  // computed from API (/api/sport/stats/curworkout)
  best_set?: BestSet | null;
  volume?: number;
  sets_count?: number;
};

type ApiTotals = {
  exCount: number;
  setCount: number;
  totalVolume: number;
};

function formatDateRu(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function typeLabel(t: WorkoutType) {
  return t === "strength" ? "Силовая" : "Кардио";
}

function fmtNum(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(n).replace(".", ",");
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка…</div>}>
      <CurWorkoutInner />
    </Suspense>
  );
}

function CurWorkoutInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const id = useMemo(() => {
    const a = String(sp.get("workout_id") || "").trim();
    const b = String(sp.get("id") || "").trim();
    const c = String(sp.get("workoutId") || "").trim();
    return a || b || c;
  }, [sp]);

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const [workout, setWorkout] = useState<ApiWorkout | null>(null);
  const [exercises, setExercises] = useState<ApiExercise[]>([]);
  const [totals, setTotals] = useState<ApiTotals>({ exCount: 0, setCount: 0, totalVolume: 0 });

  useEffect(() => {
    if (!id) {
      setHint("Не передан id тренировки");
      return;
    }

    (async () => {
      setLoading(true);
      setHint(null);

      try {
        const r = await fetch(`/api/sport/stats/curworkout?id=${encodeURIComponent(id)}`, {
          credentials: "include",
        });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          const msg =
            j?.reason === "NO_SESSION"
              ? "Нет сессии. Открой через Telegram."
              : j?.error || j?.reason || `HTTP ${r.status}`;
          setHint(msg);
          return;
        }

        setWorkout(j.workout || null);
        setExercises(Array.isArray(j.exercises) ? j.exercises : []);
        setTotals(j.totals || { exCount: 0, setCount: 0, totalVolume: 0 });
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const sortedExercises = useMemo(() => {
    return [...(exercises || [])].sort(
      (a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0)
    );
  }, [exercises]);

  const title = String(workout?.title || "").trim() || "Без названия";
  const wType: WorkoutType = workout?.type === "cardio" ? "cardio" : "strength";

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>{title}</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Навигация">
        <button
          type="button"
          className={styles.tabBadge}
          onClick={() => router.back()}
          title="Назад"
        >
          <span className={styles.dot} />
          Назад
        </button>
        </nav>

        {hint ? <div className={styles.hintDanger}>{hint}</div> : null}
        {loading ? <div className={styles.muted}>Загружаю…</div> : null}

        {workout ? (
          <>
            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Сводка</div>
                <div className={styles.muted}>ID: {workout.id}</div>
              </div>

              <div className={styles.list} style={{ gap: 10 }}>
                <div className={styles.listItem} style={{ cursor: "default" }}>
                  <div className={styles.listItemMain}>
                    <div className={styles.metaRow}>
                      <span className={styles.chip}>{typeLabel(wType)}</span>
                      <span className={styles.chip}>{formatDateRu(workout.workout_date)}</span>

                      {wType === "cardio" && workout.duration_min ? (
                        <span className={styles.chip}>{workout.duration_min} мин</span>
                      ) : null}

                      {workout.status ? <span className={styles.chip}>{workout.status}</span> : null}
                    </div>

                    <div className={styles.metaRow} style={{ marginTop: 8 }}>
                      <span className={styles.chip}>Упр: {totals.exCount}</span>
                      <span className={styles.chip}>Подходов: {totals.setCount}</span>
                      {wType === "strength" ? (
                        <span className={styles.chip}>Объём: {fmtNum(Number(totals.totalVolume || 0))} кг</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {wType === "strength" ? (
              <section className={styles.listWrap} style={{ marginTop: 14 }}>
                <div className={styles.listHeader}>
                  <div className={styles.sectionTitle}>Упражнения</div>
                  <div className={styles.muted}>{sortedExercises.length} шт.</div>
                </div>

                {sortedExercises.length === 0 ? (
                  <div className={styles.empty}>Нет упражнений в этой тренировке.</div>
                ) : (
                  <div className={styles.list} style={{ gap: 10 }}>
                    {sortedExercises.map((ex, idx) => {
                      const sets = Array.isArray(ex.sets) ? ex.sets : [];
                      const best = ex.best_set || null;
                      const vol = Number(ex.volume || 0);
                      const setsCount =
                        ex.sets_count != null ? Number(ex.sets_count) : sets.length;

                      const bestText =
                        best && (Number(best.reps) > 0 || Number(best.weight) > 0)
                          ? `${Number(best.reps)}×${fmtNum(Number(best.weight))}кг`
                          : null;

                      return (
                        <div
                          key={ex.workout_exercise_id}

                          className={styles.listItem}
                          style={{ cursor: "default" }}
                        >
                          <div className={styles.listItemMain}>
                            <div className={styles.titleText}>
                              {ex.name || "Без названия"}
                            </div>

                            <div className={styles.metaRow} style={{ marginTop: 8 }}>
                              <span className={styles.chip}>Подходов: {setsCount}</span>
                              {bestText ? <span className={styles.chip}>Лучший: {bestText}</span> : null}
                              <span className={styles.chip}>Объём: {fmtNum(vol)} кг</span>
                            </div>

                            {ex.note ? (
                              <div className={styles.muted} style={{ marginTop: 8, lineHeight: 1.35 }}>
                                {ex.note}
                              </div>
                            ) : null}

                            {setsCount ? (
                              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                                {sets
                                  .slice()
                                  .sort((a, b) => Number(a.set_index ?? 0) - Number(b.set_index ?? 0))
                                  .map((s, i) => (
                                    <div
                                      key={s.id}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "32px 1fr 1fr",
                                        gap: 8,
                                        alignItems: "center",
                                      }}
                                    >
                                      <div className={styles.muted} style={{ textAlign: "right" }}>
                                        {s.set_index ?? i + 1}
                                      </div>

                                      <div className={styles.chip} style={{ justifySelf: "start" }}>
                                        {s.weight == null ? "Доп вес: 0" : `вес: ${fmtNum(Number(s.weight))} кг`}
                                      </div>

                                      <div className={styles.chip} style={{ justifySelf: "start" }}>
                                        {s.reps == null ? "повт: -" : `повт: ${Number(s.reps)}`}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <div className={styles.muted} style={{ marginTop: 8 }}>
                                Подходов нет.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section className={styles.listWrap} style={{ marginTop: 14 }}>
                <div className={styles.listHeader}>
                  <div className={styles.sectionTitle}>Кардио</div>
                  <div className={styles.muted}>Детали</div>
                </div>

                <div className={styles.list}>
                  <div className={styles.listItem} style={{ cursor: "default" }}>
                    <div className={styles.listItemMain}>
                      <div className={styles.metaRow}>
                        <span className={styles.chip}>
                          Длительность: {workout.duration_min == null ? "-" : `${workout.duration_min} мин`}
                        </span>
                      </div>
                      <div className={styles.muted} style={{ marginTop: 8 }}>
                        Тут позже можно добавить дистанцию, пульс, темп и т.д.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}