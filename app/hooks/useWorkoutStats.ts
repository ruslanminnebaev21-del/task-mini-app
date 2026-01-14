// app/hooks/useWorkoutStats.ts
"use client";

import { useEffect, useMemo, useState } from "react";

export type WorkoutStats = {
  workoutId: number;
  type?: string;
  exerciseCount: number;
  totalWeight: number;
};

type StatsMap = Record<number, WorkoutStats>;

const cache = new Map<number, WorkoutStats>();
const cacheTs = new Map<number, number>();
const inflight = new Map<number, Promise<WorkoutStats | null>>();

const TTL_MS = 120_000; // 1 минута

function isFresh(id: number) {
  const ts = cacheTs.get(id);
  if (!ts) return false;
  return Date.now() - ts < TTL_MS;
}

async function fetchOne(workoutId: number): Promise<WorkoutStats | null> {
  // защита от дублей одновременных запросов
  const existing = inflight.get(workoutId);
  if (existing) return existing;

  const p = (async () => {
    try {
      const r = await fetch(`/api/sport/stats?workoutId=${workoutId}`, {
        credentials: "include",
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) return null;

      const stats: WorkoutStats = {
        workoutId,
        type: j.type,
        exerciseCount: Number(j.exerciseCount || 0),
        totalWeight: Number(j.totalWeight || 0),
      };

      cache.set(workoutId, stats);
      cacheTs.set(workoutId, Date.now());
      return stats;
    } catch {
      return null;
    } finally {
      inflight.delete(workoutId);
    }
  })();

  inflight.set(workoutId, p);
  return p;
}

export function useWorkoutStats(workoutIds: number[]) {
  const idsKey = useMemo(() => {
    return workoutIds.filter(Boolean).sort((a, b) => a - b).join(",");
  }, [workoutIds]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StatsMap>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = workoutIds.filter(Boolean);
    if (ids.length === 0) {
      setLoading(false);
      setData({});
      setError(null);
      return;
    }

    // сначала отдадим то, что уже есть и свежее
    const fromCache: StatsMap = {};
    for (const id of ids) {
      const v = cache.get(id);
      if (v && isFresh(id)) fromCache[id] = v;
    }
    setData(fromCache);

    // что нужно догрузить: нет в кеше или протухло
    const missing = ids.filter((id) => !cache.has(id) || !isFresh(id));
    if (missing.length === 0) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.all(missing.map((id) => fetchOne(id)));

        if (cancelled) return;

        const next: StatsMap = { ...fromCache };
        for (const s of results) {
          if (s) next[s.workoutId] = s;
        }

        setData(next);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, data, error };
}

// опционально: ручной сброс кеша
export function clearWorkoutStatsCache(workoutId?: number) {
  if (typeof workoutId === "number") {
    cache.delete(workoutId);
    cacheTs.delete(workoutId);
  } else {
    cache.clear();
    cacheTs.clear();
  }
}