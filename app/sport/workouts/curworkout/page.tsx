// app/sport/workouts/curworkout/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../../sport.module.css";
import { useCopyWorkout } from "@/app/hooks/useCopyWorkout";
import { useDeleteWorkout } from "@/app/hooks/useDeleteWorkout";
import { IconTrash, IconArrow, IconUser, IconStats, IconCopy, IconEdit } from "@/app/components/icons";

type WorkoutType = "strength" | "cardio";

type ApiWorkout = {
  id: number;
  title: string | null;
  workout_date: string;
  type: WorkoutType;
  duration: number | null; // seconds
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

function formatDurationHms(totalSeconds: number | null | undefined) {
  const t = Number(totalSeconds ?? 0);
  const safe = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;

  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка…</div>}>
      <CurWorkoutInner />
    </Suspense>
  );
}

function CurWorkoutInner() {
  const router = useRouter();
  const sp = useSearchParams();

  async function onCopy() {
    if (!workout?.id || copyLoading) return;

    setCopyToast("Копирую…");
    const res = await copyWorkout(workout.id);

    if (!res.ok) {
      setCopyToast(res.error || "Не смог скопировать тренировку");
      return;
    }

    setCopyToast("Скопировано в черновики");
    setTimeout(() => router.push("/sport/workouts"), 1000);
  }

  const { deleteWorkout, loading: deleteLoading, error: deleteError } = useDeleteWorkout();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);

  const { copyWorkout, loading: copyLoading, error: copyError } = useCopyWorkout();
  const [copyToast, setCopyToast] = useState<string | null>(null);

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
    if (!deleteError) return;
    setDeleteToast(deleteError);
    const t = setTimeout(() => setDeleteToast(null), 3000);
    return () => clearTimeout(t);
  }, [deleteError]);

  useEffect(() => {
    if (!copyError) return;
    setCopyToast(copyError);
    const t = setTimeout(() => setCopyToast(null), 3000);
    return () => clearTimeout(t);
  }, [copyError]);

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

  function openDeleteConfirm() {
    if (!workout?.id || deleteLoading) return;
    setShowDeleteConfirm(true);
  }

  function closeDeleteConfirm() {
    if (deleteLoading) return;
    setShowDeleteConfirm(false);
  }

  async function onDelete() {
    if (!workout?.id || deleteLoading) return;

    const res = await deleteWorkout(workout.id);

    if (!res.ok) {
      setDeleteToast(res.error || "Не смог удалить тренировку");
      return;
    }

    setShowDeleteConfirm(false);
    setDeleteToast("Тренировка удалена");
    setTimeout(() => router.push("/sport/workouts"), 1000);
  }

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
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" className={styles.tabBadge} onClick={() => router.back()} title="Назад">
              <span className={styles.dot} />
              Назад
            </button>

            <button
              type="button"
              className={styles.tabBadge}
              onClick={onCopy}
              disabled={copyLoading || !workout?.id}
              title="Скопировать в черновик"
              aria-label="Скопировать в черновик"
              style={{ width: 44, justifyContent: "center" }}
            >
              <IconCopy size={15} />
            </button>

            <button
              type="button"
              className={styles.tabBadge}
              onClick={() => {
                if (!workout?.id) return;
                router.push(`/sport/workouts/newworkout?workout_id=${encodeURIComponent(String(workout.id))}`);
              }}
              disabled={!workout?.id}
              title="Редактировать"
              aria-label="Редактировать"
              style={{ width: 44, justifyContent: "center" }}
            >
              <IconEdit size={15} />
            </button>

            <button
              type="button"
              className={styles.tabBadge}
              onClick={openDeleteConfirm}
              disabled={deleteLoading || !workout?.id}
              title="Удалить тренировку"
              aria-label="Удалить тренировку"
              style={{ width: 44, justifyContent: "center" }}
            >
              <IconTrash size={15} />
            </button>
          </div>
        </nav>

        {copyToast ? <div className={styles.toast}>{copyToast}</div> : null}
        {deleteToast ? <div className={styles.toast}>{deleteToast}</div> : null}

        {hint ? <div className={styles.hintDanger}>{hint}</div> : null}
        {loading ? <div className={styles.muted}>Загружаю…</div> : null}

        {workout ? (
          <>
            <section className={styles.listWrap} style={{ marginTop: 14 }}>
              <div className={styles.listHeader}>
                <div className={styles.sectionTitle}>Сводка</div>
                {/*<div className={styles.muted}>ID: {workout.id}</div>*/}
              </div>

              <div className={styles.list} style={{ gap: 10 }}>
                <div className={styles.listItem} style={{ cursor: "default" }}>
                  <div className={styles.listItemMain}>
                    <div className={styles.metaRow}>
                      <span className={styles.chip}>{typeLabel(wType)}</span>
                      <span className={styles.chip}>{formatDateRu(workout.workout_date)}</span>

                      {/* Длительность для любой тренировки: 0:00:00 */}
                      <span className={styles.chip}>Время: {formatDurationHms(workout.duration)}</span>

                      <span className={styles.chip}>Упр: {totals.exCount}</span>
                      <span className={styles.chip}>Подходов: {totals.setCount}</span>

                      {wType === "strength" ? (
                        <span className={styles.chip}>
                          Объём: {fmtNum(Number(totals.totalVolume || 0))} кг
                        </span>
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
                    {sortedExercises.map((ex) => {
                      const sets = Array.isArray(ex.sets) ? ex.sets : [];
                      const best = ex.best_set || null;
                      const vol = Number(ex.volume || 0);
                      const setsCount = ex.sets_count != null ? Number(ex.sets_count) : sets.length;

                      const bestText =
                        best && (Number(best.reps) > 0 || Number(best.weight) > 0)
                          ? `${Number(best.reps)}×${fmtNum(Number(best.weight))}кг`
                          : null;

                      return (
                        <div key={ex.workout_exercise_id} className={styles.listItem} style={{ cursor: "default" }}>
                          <div className={styles.listItemMain}>
                            <div className={styles.titleText}>{ex.name || "Без названия"}</div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 12,
                                alignItems: "start",
                              }}
                            >
                              <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                                  <span className={styles.chip}>Подходов: {setsCount}</span>
                                  {bestText ? <span className={styles.chip}>Лучший: {bestText}</span> : null}
                                  <span className={styles.chip}>Объём: {fmtNum(vol)} кг</span>
                                </div>

                                {ex.note ? (
                                  <div className={styles.muted} style={{ lineHeight: 1.35 }}>
                                    {ex.note}
                                  </div>
                                ) : null}
                              </div>

                              {setsCount ? (
                                <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                                  {sets
                                    .slice()
                                    .sort((a, b) => Number(a.set_index ?? 0) - Number(b.set_index ?? 0))
                                    .map((s) => {
                                      const reps = Number(s.reps ?? 0);
                                      const weight = Number(s.weight ?? 0);
                                      return (
                                        <div key={s.id} className={styles.chip}>
                                          {reps}×{fmtNum(weight)} кг
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : (
                                <div className={styles.muted} style={{ justifySelf: "start" }}>
                                  Подходов нет.
                                </div>
                              )}
                            </div>
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
                        <span className={styles.chip}>Длительность: {formatDurationHms(workout.duration)}</span>
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

        {showDeleteConfirm && (
          <div className={styles.modalOverlay} onClick={closeDeleteConfirm}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Удалить тренировку?</div>
              <div className={styles.modalText}>Это действие нельзя отменить.</div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeDeleteConfirm}
                  disabled={deleteLoading}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={onDelete}
                  disabled={deleteLoading || !workout?.id}
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