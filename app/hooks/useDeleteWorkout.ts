// app/hooks/useDeleteWorkout.ts

"use client";

import { useState } from "react";

type DeleteResult = {
  ok: boolean;
  error?: string;
};

export function useDeleteWorkout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteWorkout(workoutId: number): Promise<DeleteResult> {
    if (!workoutId) return { ok: false, error: "Не передан id тренировки" };

    setLoading(true);
    setError(null);

    try {
      const r = await fetch(`/api/sport/workouts?id=${encodeURIComponent(String(workoutId))}`, {
        method: "DELETE",
        credentials: "include",
      });

      const text = await r.text();
      let j: any = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {}

      if (!r.ok || !j.ok) {
        const msg =
          j?.reason === "NO_SESSION"
            ? "Нет сессии. Открой через Telegram."
            : j?.error || j?.reason || `HTTP ${r.status}`;

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

  return { deleteWorkout, loading, error };
}