// app/hooks/useCopyWorkout.ts

"use client";

import { useState } from "react";

type CopyResult = {
  ok: boolean;
  error?: string;
};

export function useCopyWorkout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyWorkout(workoutId: number): Promise<CopyResult> {
    if (!workoutId) {
      return { ok: false, error: "Не передан id тренировки" };
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Получаем исходную тренировку
      const r1 = await fetch(`/api/sport/workouts?id=${workoutId}`, {
        credentials: "include",
      });

      const j1 = await r1.json().catch(() => ({} as any));

      if (!r1.ok || !j1.ok) {
        const msg =
          j1?.reason === "NO_SESSION"
            ? "Нет сессии. Открой через Telegram."
            : j1?.error || j1?.reason || `HTTP ${r1.status}`;

        setError(msg);
        return { ok: false, error: msg };
      }

      const w = j1.workout;
      const exercises = Array.isArray(j1.exercises) ? j1.exercises : [];

      if (!w) {
        const msg = "Не удалось получить тренировку";
        setError(msg);
        return { ok: false, error: msg };
      }

      // 2. Формируем payload для новой тренировки
      const payload: any = {
        workout_date: w.workout_date,
        type: w.type,
        title: `Копия ${String(w.title || "").trim() || "без названия"}`,
        status: "draft",
      };

      if (w.type === "cardio") {
        payload.duration_min = w.duration_min ?? null;
        payload.exercises = [];
      } else {
        payload.duration_min = null;
        payload.exercises = exercises.map((ex: any) => ({
          exerciseId: ex.exercise_id,
          sets: (ex.sets || []).map((s: any) => ({
            weight: s.weight == null ? null : Number(s.weight),
            reps: s.reps == null ? null : Number(s.reps),
          })),
        }));
      }

      // 3. Создаём новую тренировку как черновик
      const r2 = await fetch("/api/sport/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const j2 = await r2.json().catch(() => ({} as any));

      if (!r2.ok || !j2.ok) {
        const msg =
          j2?.reason === "NO_SESSION"
            ? "Нет сессии. Открой через Telegram."
            : j2?.error || j2?.reason || `HTTP ${r2.status}`;

        setError(msg);
        return { ok: false, error: msg };
      }

      return { ok: true };
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setLoading(false);
    }
  }

  return {
    copyWorkout,
    loading,
    error,
  };
}