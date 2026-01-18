// app/sport/workouts/newworkout/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../../sport.module.css";
import { IconTrash, IconPlus } from "@/app/components/icons";

type WorkoutType = "strength" | "cardio";
type WorkoutStatus = "draft" | "done";

type Suggestion = {
  id: number;
  name: string;
  best_weight?: number | null;
  best_reps?: number | null;
};

type LiftSet = {
  id: string;
  weight: string;
  reps: string;
};

type WorkoutExercise = {
  id: string;
  exerciseId: number | null;
  exerciseName: string;
  bestWeight?: number | null;
  bestReps?: number | null;
  sets: LiftSet[];
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeEmptySet(): LiftSet {
  return { id: uid(), weight: "", reps: "" };
}

function makeEmptyExercise(): WorkoutExercise {
  return {
    id: uid(),
    exerciseId: null,
    exerciseName: "",
    sets: [makeEmptySet()],
  };
}

function toWeightOrNull(v: string): number | null {
  const s = String(v || "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: string): number | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка…</div>}>
      <NewWorkoutInner />
    </Suspense>
  );
}

function NewWorkoutInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // принимаем оба варианта, чтобы не ловить баги из-за несостыковки
  const editId = useMemo(() => {
    const a = String(sp.get("workout_id") || "").trim();
    const b = String(sp.get("id") || "").trim();
    return a || b; // приоритет workout_id
  }, [sp]);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkoutType>("strength");
  const [durationMin, setDurationMin] = useState("");
  // ===== ADD EXERCISE MODAL =====
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [addExerciseName, setAddExerciseName] = useState("");
  const [loadType, setLoadType] = useState<"external" | "bodyweight">("external");
  const [addExerciseForId, setAddExerciseForId] = useState<string | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);  

  // важно: не затирать дату при редактировании
  const [workoutDate, setWorkoutDate] = useState<string>(todayYmd());

  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([
    makeEmptyExercise(),
  ]);

  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(
    workoutExercises[0]?.id ?? null
  );
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(null);
  const [suggestionsByEx, setSuggestionsByEx] = useState<Record<string, Suggestion[]>>({});
  const [suggestLoadingByEx, setSuggestLoadingByEx] = useState<Record<string, boolean>>({});
  const [openSuggestFor, setOpenSuggestFor] = useState<string | null>(null);

  const debounceRef = useMemo(() => new Map<string, any>(), []);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);

  // статус тренировки с сервера (нужен для заголовка/кнопок)
  const [workoutStatus, setWorkoutStatus] = useState<WorkoutStatus | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);


// ====== автоскролл ТОЛЬКО для exerciseInput к верху (30px) ======
useEffect(() => {
  const OFFSET_TOP = 30;

  const isExerciseInput = (el: Element | null) => {
    if (!el) return false;
    if (!(el instanceof HTMLElement)) return false;

    // ловим только нужные инпуты по классу
    return el.classList.contains(styles.exerciseInput);
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element | null;
    if (!isExerciseInput(target)) return;

    requestAnimationFrame(() => {
      const el = target as HTMLElement;
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;

      const desired = Math.max(0, top - OFFSET_TOP);
      if (Math.abs(window.scrollY - desired) < 4) return;

      window.scrollTo({ top: desired, behavior: "smooth" });
    });
  };

  document.addEventListener("focusin", onFocusIn, true);
  return () => document.removeEventListener("focusin", onFocusIn, true);
}, []);
  function showToast(msg: string) {
    setToast(msg);
  }
  function openAddExerciseModal(exBlockId: string, presetName: string) {
    setAddExerciseForId(exBlockId);
    setAddExerciseName(String(presetName || "").trim());
    setLoadType("external");
    setShowAddExerciseModal(true);
  }

  function closeAddExerciseModal() {
    if (addingExercise) return;
    setShowAddExerciseModal(false);
  }

  async function confirmAddExercise() {
    if (addingExercise) return;

    const name = String(addExerciseName || "").trim();
    if (name.length < 2) {
      showToast("Название слишком короткое");
      return;
    }

    const targetId = addExerciseForId;
    if (!targetId) {
      showToast("Не понял, куда вставлять упражнение");
      return;
    }

    setAddingExercise(true);
    try {
      const r = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, loadType }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j.ok) {
        // если дубль — покажем норм сообщение
        if (j?.reason === "DUPLICATE" && j?.duplicate?.id) {
          showToast("Такое упражнение уже есть, выбери его из списка");
        } else {
          const msg =
            j?.reason === "NO_SESSION"
              ? "Нет сессии. Открой через Telegram."
              : j?.error || j?.reason || `HTTP ${r.status}`;
          showToast(msg);
        }
        return;
      }

      const ex = j.exercise || {};
      const exId = Number(ex.id);
      const exName = String(ex.name || "").trim();

      if (!Number.isFinite(exId) || !exName) {
        showToast("Не смог прочитать добавленное упражнение");
        return;
      }

      // вставляем в текущий exerciseInput
      updateExercise(targetId, {
        exerciseId: exId,
        exerciseName: exName,
        bestWeight: null,
        bestReps: null,
      });

      setActiveExerciseId(targetId);
      setOpenSuggestFor(null);
      setSuggestionsByEx((prev) => ({ ...prev, [targetId]: [] }));

      setShowAddExerciseModal(false);
      showToast("Упражнение добавлено");
    } catch (e: any) {
      showToast(String(e?.message || e));
    } finally {
      setAddingExercise(false);
    }
  }

  // ---------- load draft/workout by id ----------
  useEffect(() => {
    if (!editId) return;

    (async () => {
      setLoadingDraft(true);
      try {
        const r = await fetch(`/api/sport/workouts?id=${encodeURIComponent(editId)}`, {
          credentials: "include",
        });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          const msg =
            j?.reason === "NO_SESSION"
              ? "Нет сессии. Открой через Telegram."
              : j?.error || j?.reason || `HTTP ${r.status}`;
          showToast(msg);
          return;
        }

        const w = j.workout || {};
        const wType: WorkoutType = w.type === "cardio" ? "cardio" : "strength";

        const statusFromApi: WorkoutStatus =
          String(w.status || "").trim() === "done" ? "done" : "draft";
        setWorkoutStatus(statusFromApi);

        setTitle(String(w.title || "").trim());
        setType(wType);
        setDurationMin(w.duration_min == null ? "" : String(w.duration_min));
        setWorkoutDate(String(w.workout_date || "").trim() || todayYmd());

        const exArr = Array.isArray(j.exercises) ? j.exercises : [];

        if (wType === "strength") {
          const mapped: WorkoutExercise[] = exArr
            .sort((a: any, b: any) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
            .map((x: any) => {
              const sets = Array.isArray(x.sets) ? x.sets : [];
              const mappedSets: LiftSet[] = sets
                .sort((a: any, b: any) => Number(a.set_index ?? 0) - Number(b.set_index ?? 0))
                .map((s: any) => ({
                  id: uid(),
                  weight: s.weight == null ? "" : String(s.weight).replace(".", ","),
                  reps: s.reps == null ? "" : String(s.reps),
                }));

              return {
                id: uid(),
                exerciseId: x.exercise_id == null ? null : Number(x.exercise_id),
                exerciseName: String(x.name || "").trim(),
                sets: mappedSets.length ? mappedSets : [makeEmptySet()],
              };
            });

          const safe = mapped.length ? mapped : [makeEmptyExercise()];
          setWorkoutExercises(safe);
          setActiveExerciseId(safe[0]?.id ?? null);
        } else {
          // кардио: упражнения не нужны
          const first = makeEmptyExercise();
          setWorkoutExercises([first]);
          setActiveExerciseId(first.id);
        }
      } catch (e: any) {
        showToast(String(e?.message || e));
      } finally {
        setLoadingDraft(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ---------- suggestions ----------
  function fetchExerciseSuggestions(exBlockId: string, qRaw: string) {
    const q = qRaw.trim();
    if (q.length < 2) {
      setSuggestionsByEx((prev) => ({ ...prev, [exBlockId]: [] }));
      return;
    }

    const prevT = debounceRef.get(exBlockId);
    if (prevT) clearTimeout(prevT);

    const t = setTimeout(async () => {
      setSuggestLoadingByEx((p) => ({ ...p, [exBlockId]: true }));
      try {
        const r = await fetch(`/api/sport/workouts?exercise_q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || !j.ok) {
          setSuggestionsByEx((prev) => ({ ...prev, [exBlockId]: [] }));
          return;
        }

        const arr: Suggestion[] = (j.exercises || [])
          .map((x: any) => ({
            id: Number(x.id),
            name: String(x.name || "").trim(),
            best_weight: x.best_weight == null ? null : Number(x.best_weight),
            best_reps: x.best_reps == null ? null : Number(x.best_reps),
          }))
          .filter((x: Suggestion) => Number.isFinite(x.id) && x.name);

        setSuggestionsByEx((prev) => ({ ...prev, [exBlockId]: arr.slice(0, 8) }));
      } finally {
        setSuggestLoadingByEx((p) => ({ ...p, [exBlockId]: false }));
      }
    }, 200);

    debounceRef.set(exBlockId, t);
  }

  // ---------- ui helpers ----------
  function resetAll() {
    setTitle("");
    setType("strength");
    setDurationMin("");
    setWorkoutDate(todayYmd());

    const first = makeEmptyExercise();
    setWorkoutExercises([first]);
    setActiveExerciseId(first.id);

    setSuggestionsByEx({});
    setSuggestLoadingByEx({});
    setOpenSuggestFor(null);

    setWorkoutStatus(null);
  }

  function updateExercise(exId: string, patch: Partial<WorkoutExercise>) {
    setWorkoutExercises((prev) => prev.map((x) => (x.id === exId ? { ...x, ...patch } : x)));
  }

  function addExercise() {
    const ex = makeEmptyExercise();
    setWorkoutExercises((prev) => [...prev, ex]);
    setActiveExerciseId(ex.id);
    setOpenSuggestFor(ex.id);
  }

  function removeExercise(exId: string) {
    setWorkoutExercises((prev) => {
      const next = prev.filter((x) => x.id !== exId);

      if (next.length === 0) {
        const first = makeEmptyExercise();
        setActiveExerciseId(first.id);
        return [first];
      }

      if (activeExerciseId === exId) {
        setActiveExerciseId(next[next.length - 1]?.id ?? null);
      }

      return next;
    });

    setSuggestionsByEx((prev) => {
      const copy = { ...prev };
      delete copy[exId];
      return copy;
    });

    setSuggestLoadingByEx((prev) => {
      const copy = { ...prev };
      delete copy[exId];
      return copy;
    });

    if (openSuggestFor === exId) setOpenSuggestFor(null);

    const t = debounceRef.get(exId);
    if (t) clearTimeout(t);
    debounceRef.delete(exId);
  }

  function addSetTo(exId: string) {
    setWorkoutExercises((prev) =>
      prev.map((x) => (x.id === exId ? { ...x, sets: [...x.sets, makeEmptySet()] } : x))
    );
  }

  function addSetToActive() {
    const targetId = activeExerciseId ?? workoutExercises[workoutExercises.length - 1]?.id ?? null;
    if (!targetId) {
      const first = makeEmptyExercise();
      setWorkoutExercises([first]);
      setActiveExerciseId(first.id);
      return;
    }
    addSetTo(targetId);
  }

  function updateSet(exId: string, setId: string, patch: Partial<LiftSet>) {
    setWorkoutExercises((prev) =>
      prev.map((x) => {
        if (x.id !== exId) return x;
        return { ...x, sets: x.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) };
      })
    );
  }

  function removeSet(exId: string, setId: string) {
    setWorkoutExercises((prev) =>
      prev.map((x) => {
        if (x.id !== exId) return x;
        const nextSets = x.sets.filter((s) => s.id !== setId);
        return { ...x, sets: nextSets.length ? nextSets : [makeEmptySet()] };
      })
    );
  }

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  function validateStrengthExercises(): boolean {
    const badIndex = workoutExercises.findIndex((we) => {
      const name = String(we.exerciseName || "").trim();
      const hasAnySetValue = we.sets.some(
        (s) => String(s.weight || "").trim() || String(s.reps || "").trim()
      );
      const blockTouched = name.length > 0 || hasAnySetValue;
      if (!blockTouched) return false;
      return we.exerciseId == null;
    });

    if (badIndex !== -1) {
      showToast(`Упражнение №${badIndex + 1}: выбери из списка`);
      return false;
    }
    return true;
  }

  function buildStrengthPayload() {
    return workoutExercises
      .map((we) => {
        const name = String(we.exerciseName || "").trim();
        const hasAnySetValue = we.sets.some(
          (s) => String(s.weight || "").trim() || String(s.reps || "").trim()
        );

        if (!name && !hasAnySetValue) return null;

        return {
          exerciseId: we.exerciseId as number,
          sets: (we.sets.length ? we.sets : [makeEmptySet()]).map((s) => ({
            weight: toWeightOrNull(s.weight),
            reps: toIntOrNull(s.reps),
          })),
        };
      })
      .filter(Boolean) as Array<{
      exerciseId: number;
      sets: Array<{ weight: number | null; reps: number | null }>;
    }>;
  }

  async function saveWorkout(status: WorkoutStatus) {
    if (!canSave || saving || loadingDraft) return;

    if (type === "strength") {
      const ok = validateStrengthExercises();
      if (!ok) return;
    }

    setSaving(true);
    try {
      const body: any = {
        workout_date: workoutDate || todayYmd(),
        type,
        title: title.trim(),
        status,
      };

      if (type === "cardio") {
        body.duration_min = durationMin.trim() ? Number(durationMin) : null;
        body.exercises = [];
      } else {
        body.duration_min = null;
        body.exercises = buildStrengthPayload();
      }

      const isEdit = Boolean(editId);
      const url = isEdit
        ? `/api/sport/workouts?id=${encodeURIComponent(editId)}`
        : "/api/sport/workouts";

      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j.ok) {
        const msg =
          j?.reason === "NO_SESSION"
            ? "Нет сессии. Открой через Telegram."
            : j?.error || j?.reason || `HTTP ${r.status}`;
        showToast(msg);
        return;
      }

      if (status === "draft") {
        showToast(isEdit ? "Черновик обновлён" : "Черновик сохранен");
        setTimeout(() => router.push("/sport/workouts"), 1000);
      } else {
        showToast(isEdit ? "Изменения сохранены" : "Тренировка записана");
        setTimeout(() => router.push("/sport/workouts"), 1000);
      }
    } catch (e: any) {
      showToast(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function onSaveDraft() {
    void saveWorkout("draft");
  }

  function onDone() {
    if (!canSave || saving || loadingDraft) return;
    setShowDoneConfirm(true);
  }

  function closeDoneConfirm() {
    if (saving || loadingDraft) return;
    setShowDoneConfirm(false);
  }

  function confirmDone() {
    if (saving || loadingDraft) return;
    setShowDoneConfirm(false);
    void saveWorkout("done");
  }

  const pageTitle = useMemo(() => {
    if (!editId) return "Новая";
    if (workoutStatus === "draft") return "Черновик";
    return "Изменить";
  }, [editId, workoutStatus]);

  const isEdit = Boolean(editId);
  const isEditingDoneWorkout = isEdit && workoutStatus === "done";

  return (
    <div className={styles.shell}>
      <AppMenu />
      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>{pageTitle}</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Навигация">
          <Link href="/sport/workouts" className={styles.tabBadge} title="Назад">
            <span className={styles.dot} />
            Назад
          </Link>
        </nav>

        {toast ? (
          <div className={styles.toast} role="status" aria-live="polite">
            {toast}
          </div>
        ) : null}

        {loadingDraft ? (
          <div className={styles.muted} style={{ marginTop: 10 }}>
            Загружаю…
          </div>
        ) : null}

        <div className={styles.field}>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название тренировки"
            disabled={loadingDraft}
          />
        </div>

        <div className={styles.field} style={{ marginTop: 12 }}>
          <div className={styles.radioRow} role="radiogroup" aria-label="Тип тренировки">
            <button
              type="button"
              className={`${styles.chipBtn} ${type === "strength" ? styles.chipBtnActive : ""}`}
              onClick={() => setType("strength")}
              disabled={loadingDraft}
            >
              Силовая
            </button>

            <button
              type="button"
              className={`${styles.chipBtn} ${type === "cardio" ? styles.chipBtnActive : ""}`}
              onClick={() => setType("cardio")}
              disabled={loadingDraft}
            >
              Кардио
            </button>
          </div>
        </div>

        {type === "cardio" ? (
          <div className={styles.field} style={{ marginTop: 12 }}>
            <div className={styles.sectionTitle}>Длительность, мин</div>
            <input
              className={`${styles.input} ${styles.exerciseInput}`}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Например: 35"
              inputMode="numeric"
              disabled={loadingDraft}
            />
          </div>
        ) : null}

        {type === "strength" ? (
          <div className={styles.field} style={{ marginTop: 14 }}>
            <div className={styles.sectionTitle}>Упражнения и подходы</div>

            <div className={styles.setsWrap}>
              {workoutExercises.map((we, idx) => {
                const suggestions = suggestionsByEx[we.id] || [];
                const loading = Boolean(suggestLoadingByEx[we.id]);

                const query = we.exerciseName.trim();

                const showSuggestUI =
                  openSuggestFor === we.id &&
                  we.exerciseId == null &&
                  query.length >= 2;

                const exactExists = suggestions.some(
                  (s) => String(s.name || "").trim().toLowerCase() === query.toLowerCase()
                );

                const showAddBtn = showSuggestUI && suggestions.length === 0;

                return (
                  <div key={we.id} style={{ display: "grid", gap: 10 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div
                        className={styles.exInputWrap}
                        tabIndex={-1}
                        onBlur={() => {
                          setTimeout(() => setOpenSuggestFor(null), 120);

                          setTimeout(() => {
                            setWorkoutExercises((prev) =>
                              prev.map((x) => {
                                if (x.id !== we.id) return x;
                                if (x.exerciseId != null) return x;
                                if (!String(x.exerciseName || "").trim()) return x;
                                return { ...x, exerciseName: "" };
                              })
                            );
                          }, 140);
                        }}
                      >
                        <div className={styles.exerciseInputWrap}>
                          {focusedExerciseId !== we.id &&
                          we.exerciseId != null &&
                          ((we.bestWeight ?? 0) > 0 || (we.bestReps ?? 0) > 0) ? (
                            <span
                              className={styles.chip}
                              style={{
                                position: "absolute",
                                right: 8,
                                top: "50%",
                                transform: "translateY(-50%)",
                                pointerEvents: "none",
                                zIndex: 2,
                              }}
                            >
                              Лучший: {(we.bestReps ?? 0)}×{(we.bestWeight ?? 0)}кг
                            </span>
                          ) : null}

                          <input
                            className={`${styles.input} ${styles.exerciseInput} ${
                              focusedExerciseId !== we.id ? styles.withBestPadding : ""
                            }`}
                            value={we.exerciseName}
                            onFocus={() => {
                              setFocusedExerciseId(we.id);
                              setActiveExerciseId(we.id);
                              setOpenSuggestFor(we.id);
                              fetchExerciseSuggestions(we.id, we.exerciseName);
                            }}
                            onBlur={() => {
                              setFocusedExerciseId((cur) => (cur === we.id ? null : cur));
                            }}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateExercise(we.id, { exerciseName: v, exerciseId: null });
                              setActiveExerciseId(we.id);
                              setOpenSuggestFor(we.id);
                              fetchExerciseSuggestions(we.id, v);
                            }}
                            placeholder={loading ? "Ищу…" : `Упражнение №${idx + 1}`}
                            disabled={loadingDraft}
                          />
                        </div>
                        {showSuggestUI ? (
                          <div className={styles.suggestionBox}>
                            {suggestions.length ? (
                              <>
                                {suggestions.map((e) => (
                                  <button
                                    key={e.id}
                                    type="button"
                                    className={styles.suggestionItem}
                                    onClick={() => {
                                      updateExercise(we.id, {
                                        exerciseId: e.id,
                                        exerciseName: e.name,
                                        bestWeight: e.best_weight ?? null,
                                        bestReps: e.best_reps ?? null,
                                      });
                                      setActiveExerciseId(we.id);
                                      setOpenSuggestFor(null);
                                      setSuggestionsByEx((prev) => ({ ...prev, [we.id]: [] }));
                                    }}
                                  >
                                    {e.name}
                                  </button>
                                ))}

                                {!exactExists && (
                                  <>
                                    <div className={styles.suggestionDivider} />
                                    <button
                                      type="button"
                                      className={styles.suggestionItem}
                                      onClick={() => openAddExerciseModal(we.id, query)}
                                    >
                                      + Добавить в базу
                                    </button>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={styles.suggestionItem}
                                  onClick={() => openAddExerciseModal(we.id, query)}
                                >
                                  + Добавить в базу
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className={styles.setRemoveBtn}
                        onClick={() => removeExercise(we.id)}
                        title="Удалить упражнение"
                        style={{ alignSelf: "center" }}
                        disabled={loadingDraft}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridAutoFlow: "column",
                        gridAutoColumns: "44px",
                        gap: 12,
                        alignItems: "start",
                        justifyContent: "start",
                        overflowX: "auto",
                        paddingBottom: 2,
                        paddingRight: 56,
                      }}
                    >
                      {we.sets.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "grid",
                            gridTemplateRows: "auto auto auto auto auto",
                            gap: 6,
                            justifyItems: "center",
                            alignItems: "start",
                          }}
                        >
                          <div className={styles.smallLabel} style={{ paddingLeft: 0 }}>
                            кг
                          </div>

                          <input
                            className={styles.smallInput}
                            value={s.weight}
                            onChange={(e) =>
                              updateSet(we.id, s.id, {
                                weight: e.target.value.replace(/[^\d.,]/g, ""),
                              })
                            }
                            inputMode="decimal"
                            placeholder="0"
                            disabled={loadingDraft}
                          />

                          <div className={styles.smallLabel} style={{ paddingLeft: 0, marginTop: 2 }}>
                            повт
                          </div>

                          <input
                            className={styles.smallInput}
                            value={s.reps}
                            onChange={(e) =>
                              updateSet(we.id, s.id, { reps: e.target.value.replace(/[^\d]/g, "") })
                            }
                            inputMode="numeric"
                            placeholder="0"
                            disabled={loadingDraft}
                          />

                          <button
                            type="button"
                            className={styles.setRemoveBtn}
                            onClick={() => removeSet(we.id, s.id)}
                            title="Удалить подход"
                            style={{ width: 40, height: 40, alignSelf: "center", justifySelf: "center" }}
                            disabled={loadingDraft}
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      ))}
                       <button
                          type="button"
                          onClick={() => addSetTo(we.id)}
                          disabled={loadingDraft}
                          title="Добавить подход"
                          className={styles.addSetBtn}
                          style={{ marginTop: -25}}
                        >
                          <IconPlus size={10} />
                        </button>                      
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "center" }}>
                <div className={styles.addButtonsRow}>
                  <button type="button" className={styles.addExBtn} onClick={addExercise} disabled={loadingDraft}>
                    + Добавить упражнение
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.editorActions} style={{ marginTop: 30 }}>
          {isEditingDoneWorkout ? (
            <button
              type="button"
              className={`${styles.btnPrimary} ${
                !canSave || saving || loadingDraft ? styles.btnDisabled : ""
              }`}
              onClick={() => void saveWorkout("done")}
              disabled={!canSave || saving || loadingDraft}
              title={!canSave ? "Введите название" : "Сохранить изменения"}
            >
              {saving ? "Сохраняю…" : "Сохранить изменения"}
            </button>
          ) : (
            <>
              <button type="button" className={styles.btnGhost} onClick={resetAll} disabled={saving || loadingDraft}>
                Сбросить
              </button>

              <button
                type="button"
                className={`${styles.btnSoft} ${
                  !canSave || saving || loadingDraft ? styles.btnDisabled : ""
                }`}
                onClick={onSaveDraft}
                disabled={!canSave || saving || loadingDraft}
              >
                {saving ? "Сохраняю…" : "В черновик"}
              </button>

              <button
                type="button"
                className={`${styles.btnPrimary} ${
                  !canSave || saving || loadingDraft ? styles.btnDisabled : ""
                }`}
                onClick={onDone}
                disabled={!canSave || saving || loadingDraft}
              >
                {saving ? "Сохраняю…" : "Выполнено"}
              </button>
            </>
          )}
        </div>

        {showDoneConfirm ? (
          <div className={styles.modalOverlay} onClick={closeDoneConfirm}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Сохранить?</div>
              <div className={styles.modalText}>Тренировка будет отмечена как выполненная.</div>

              <div className={styles.modalActions} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeDoneConfirm}
                  disabled={saving || loadingDraft}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={confirmDone}
                  disabled={saving || loadingDraft}
                >
                  {saving ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {showAddExerciseModal ? (
          <div className={styles.modalOverlay} onClick={closeAddExerciseModal}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Добавить упражнение</div>
              <div className={styles.modalText}>Название и тип нагрузки.</div>

              <div style={{ marginTop: 12 }}>
                <input
                  className={styles.input}
                  value={addExerciseName}
                  onChange={(e) => setAddExerciseName(e.target.value)}
                  placeholder="Например: Жим гантелей"
                  disabled={addingExercise}
                />
              </div>

              <div className={styles.radioRow} role="radiogroup" aria-label="Тип нагрузки" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={`${styles.chipBtn} ${loadType === "external" ? styles.chipBtnActive : ""}`}
                  onClick={() => setLoadType("external")}
                  disabled={addingExercise}
                >
                  С отягощением
                </button>

                <button
                  type="button"
                  className={`${styles.chipBtn} ${loadType === "bodyweight" ? styles.chipBtnActive : ""}`}
                  onClick={() => setLoadType("bodyweight")}
                  disabled={addingExercise}
                >
                  С собственным весом
                </button>
              </div>

              <div className={styles.modalActions} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeAddExerciseModal}
                  disabled={addingExercise}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={confirmAddExercise}
                  disabled={addingExercise}
                >
                  {addingExercise ? "Добавляю..." : "Добавить"}
                </button>
              </div>
            </div>
          </div>
        ) : null}        
      </main>
    </div>
  );
}