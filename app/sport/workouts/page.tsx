"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconTrash, IconArrow, IconUser, IconStats, IconHome } from "@/app/components/icons";
import { useRouter, usePathname } from "next/navigation";
import { useWorkoutStats } from "@/app/hooks/useWorkoutStats";
import { useDeleteWorkout } from "@/app/hooks/useDeleteWorkout";
import { useCopyWorkout } from "@/app/hooks/useCopyWorkout";

/* ================== TABS ================== */

type Tab = {
  label: string;
  href: string;
  showDot: boolean;
  icon?: "home" | "user" | "dumbbell";
};

const TABS: Tab[] = [
  { label: "Обзор", href: "/sport/overview", showDot: false, icon: "home" },
  { label: "Тренировки", href: "/sport/workouts", showDot: true },
  { label: "Упражнения", href: "/sport/exercises", showDot: true },
  { label: "Профиль", href: "/sport/profile", showDot: false, icon: "user" },
];

function isActiveTab(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function renderTabIcon(icon?: Tab["icon"]) {
  if (!icon) return null;

  switch (icon) {
    case "home":
      return <IconHome className={styles.tabIcon} />;
    case "user":
      return <IconUser className={styles.tabIcon} />;
    case "dumbbell":
      return <IconStats className={styles.tabIcon} />;
    default:
      return null;
  }
}

/* ================== CACHE ================== */

const WORKOUTS_CACHE_KEY = "sport_workouts_cache_v2"; // сменил ключ, чтобы не спорить со старым форматом

type WorkoutType = "strength" | "cardio";

type DraftWorkout = {
  id: number;
  title: string;
  type: WorkoutType;
  workout_date: string;
  duration_min?: number | null;
  status: "draft";
};

type DoneWorkout = {
  id: number;
  title: string;
  type: WorkoutType;
  workout_date: string;
  duration_min?: number | null;
  status: "done";
  completed_at?: string | null;
};

type WorkoutsCache = {
  savedAt: number;
  revWorkouts: number;
  drafts: DraftWorkout[];
  done: DoneWorkout[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function readCacheSafe(): WorkoutsCache | null {
  if (!canUseStorage()) return null;

  try {
    const raw = sessionStorage.getItem(WORKOUTS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    if (typeof parsed.savedAt !== "number") return null;
    if (typeof parsed.revWorkouts !== "number") return null;

    return parsed as WorkoutsCache;
  } catch {
    return null;
  }
}

function writeCacheSafe(data: Omit<WorkoutsCache, "savedAt">) {
  if (!canUseStorage()) return;

  try {
    sessionStorage.setItem(
      WORKOUTS_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), ...data })
    );
  } catch {}
}

function clearCacheSafe() {
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(WORKOUTS_CACHE_KEY);
  } catch {}
}

/* ================== PAGE ================== */

export default function SportWorkoutsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const { deleteWorkout, loading: deleteLoading } = useDeleteWorkout();
  const { copyWorkout, loading: copyLoading } = useCopyWorkout();

  const [drafts, setDrafts] = useState<DraftWorkout[]>([]);
  const [done, setDone] = useState<DoneWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [copyId, setCopyId] = useState<number | null>(null);

  const inFlightRef = useRef<AbortController | null>(null);

  const mountedRef = useRef(false);

  const revRef = useRef<number>(0); // актуальная ревизия с сервера (workouts)
  const draftsRef = useRef<DraftWorkout[]>([]);
  const doneRef = useRef<DoneWorkout[]>([]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  const draftItems = useMemo(() => drafts, [drafts]);
  const doneItems = useMemo(() => done, [done]);

  const statsIds = useMemo(
    () => doneItems.filter((w) => w.type === "strength").map((w) => w.id),
    [doneItems]
  );
  const { loading: statsLoading, data: statsByWorkoutId } = useWorkoutStats(statsIds);

  /* ================== API ================== */

  async function fetchRev(): Promise<number | null> {
    try {
      const r = await fetch("/api/sport/rev", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) return null;
      const n = Number(j?.rev?.workouts ?? 0);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return null;
    }
  }

  async function fetchWorkoutsList(ac: AbortController) {
    const [rDraft, rDone] = await Promise.all([
      fetch("/api/sport/workouts?status=draft", {
        credentials: "include",
        signal: ac.signal,
        cache: "no-store",
      }),
      fetch("/api/sport/workouts?status=done", {
        credentials: "include",
        signal: ac.signal,
        cache: "no-store",
      }),
    ]);

    const jDraft = await rDraft.json().catch(() => ({} as any));
    const jDone = await rDone.json().catch(() => ({} as any));

    if (!rDraft.ok || !jDraft.ok) throw new Error(jDraft?.error || "draft load failed");
    if (!rDone.ok || !jDone.ok) throw new Error(jDone?.error || "done load failed");

    const draftsMapped: DraftWorkout[] = (jDraft.workouts || []).map((x: any) => ({
      id: Number(x.id),
      title: String(x.title || "").trim() || "Без названия",
      type: x.type === "cardio" ? "cardio" : "strength",
      workout_date: String(x.workout_date || ""),
      duration_min: x.duration_min ?? null,
      status: "draft",
    }));

    const doneMapped: DoneWorkout[] = (jDone.workouts || [])
      .map((x: any) => ({
        id: Number(x.id),
        title: String(x.title || "").trim() || "Без названия",
        type: x.type === "cardio" ? "cardio" : "strength",
        workout_date: String(x.workout_date || ""),
        duration_min: x.duration_min ?? null,
        status: "done",
        completed_at: x.completed_at ?? null,
      }))
      .sort((a: { completed_at?: string | null }, b: { completed_at?: string | null }) =>
        String(b.completed_at || "").localeCompare(String(a.completed_at || ""))
      )

    return { draftsMapped, doneMapped };
  }

  async function syncFromServer(opts?: { force?: boolean }) {
    const force = Boolean(opts?.force);

    // отменяем прошлый запрос (это нормально, что в Network будет "canceled")
    if (inFlightRef.current) {
      try {
        inFlightRef.current.abort();
      } catch {}
    }

    const ac = new AbortController();
    inFlightRef.current = ac;

    setHint(null);

    try {
      // 1) берем ревизию
      const serverRev = await fetchRev();
      if (serverRev == null) {
        // рев не получили — не убиваем UX, просто принудительно пробуем загрузить
        if (force) {
          setLoading(true);
          const { draftsMapped, doneMapped } = await fetchWorkoutsList(ac);
          setDrafts(draftsMapped);
          setDone(doneMapped);
          writeCacheSafe({ revWorkouts: revRef.current || 0, drafts: draftsMapped, done: doneMapped });
        }
        return;
      }

      // 2) если не force — сравниваем с кешем/локальной ревизией
      const cached = readCacheSafe();
      const localRev = cached?.revWorkouts ?? revRef.current ?? 0;

      revRef.current = serverRev;

      if (!force && cached && localRev === serverRev) {
        // ничего не изменилось на сервере — не дергаем workouts
        return;
      }

      // 3) иначе грузим список
      setLoading(true);
      const { draftsMapped, doneMapped } = await fetchWorkoutsList(ac);

      setDrafts(draftsMapped);
      setDone(doneMapped);

      writeCacheSafe({ revWorkouts: serverRev, drafts: draftsMapped, done: doneMapped });
    } catch (e: any) {
      if (e?.name !== "AbortError") setHint(String(e?.message || e));
    } finally {
      if (inFlightRef.current === ac) inFlightRef.current = null;
      setLoading(false);
    }
  }

  /* ================== INIT ================== */

  useEffect(() => {
    mountedRef.current = true;

    // 1) сначала мгновенно рисуем кеш, если есть
    const cached = readCacheSafe();
    if (cached) {
      revRef.current = cached.revWorkouts || 0;
      setDrafts(cached.drafts || []);
      setDone(cached.done || []);
    }

    // 2) потом проверяем ревизию и при необходимости тянем список
    syncFromServer();

    return () => {
      mountedRef.current = false;
      if (inFlightRef.current) {
        try {
          inFlightRef.current.abort();
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // кнопка "Обновить" из меню
  useEffect(() => {
    function onRefresh() {
      clearCacheSafe();
      syncFromServer({ force: true });
    }

    window.addEventListener("sport:refresh", onRefresh as EventListener);
    return () => window.removeEventListener("sport:refresh", onRefresh as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================== HELPERS ================== */

  function typeLabel(t: WorkoutType) {
    return t === "strength" ? "Силовая" : "Кардио";
  }

  function formatDateRu(dateStr: string) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  }

  function openDraft(id: number) {
    router.push(`/sport/workouts/newworkout?workout_id=${encodeURIComponent(String(id))}`);
  }

  function openDone(id: number) {
    router.push(`/sport/workouts/curworkout?workout_id=${encodeURIComponent(String(id))}`);
  }

  function onKeyOpen(e: React.KeyboardEvent, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDraft(id);
    }
  }

  function onKeyOpenDone(e: React.KeyboardEvent, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDone(id);
    }
  }

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

    const nextDrafts = draftsRef.current.filter((w) => w.id !== id);
    const nextDone = doneRef.current.filter((w) => w.id !== id);

    setDrafts(nextDrafts);
    setDone(nextDone);

    // сервер тоже бампнул app_rev, мы делаем тот же шаг локально (без лишних запросов)
    const nextRev = (revRef.current || 0) + 1;
    revRef.current = nextRev;

    writeCacheSafe({ revWorkouts: nextRev, drafts: nextDrafts, done: nextDone });

    closeConfirm();
  }

  async function reloadDraftsOnly() {
    // тут можно не дергать ревизию, это локальная UX-операция после copy
    try {
      const r = await fetch("/api/sport/workouts?status=draft", {
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) return;

      const mapped: DraftWorkout[] = (j.workouts || []).map((x: any) => ({
        id: Number(x.id),
        title: String(x.title || "").trim() || "Без названия",
        type: x.type === "cardio" ? "cardio" : "strength",
        workout_date: String(x.workout_date || ""),
        duration_min: x.duration_min ?? null,
        status: "draft",
      }));

      setDrafts(mapped);

      const nextRev = (revRef.current || 0) + 1;
      revRef.current = nextRev;

      writeCacheSafe({ revWorkouts: nextRev, drafts: mapped, done: doneRef.current });
    } catch {}
  }

  async function handleCopy(id: number) {
    if (copyLoading) return;

    setHint(null);
    setCopyId(id);

    try {
      const res = await copyWorkout(id);

      if (!res?.ok) {
        setHint(res?.error || "Не смог скопировать тренировку");
        return;
      }

      await reloadDraftsOnly();
    } finally {
      setCopyId(null);
    }
  }

  /* ================== RENDER ================== */

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

        {hint ? <div className={styles.hintDanger}>{hint}</div> : null}

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

        <button
          type="button"
          className={styles.bigCta}
          onClick={() => router.push("/sport/workouts/newworkout")}
        >
          <div className={styles.bigCtaRow}>
            <span className={styles.bigCtaText}>Создать тренировку</span>
            <span className={styles.bigCtaIcon}>
              <IconArrow size={25} style={{ color: "#fff" }} />
            </span>
          </div>
        </button>

        <section className={styles.listWrap} style={{ marginTop: 14 }}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>Черновики</div>
            <div className={styles.muted}>{draftItems.length} шт.</div>
          </div>

          {loading ? (
            <div className={styles.muted}>Загружаю…</div>
          ) : draftItems.length === 0 ? (
            <div className={styles.empty}>
              Для удобства вы можете создавать черновики заранее перед тренировкой.
            </div>
          ) : (
            <div className={styles.list}>
              {draftItems.map((d) => (
                <div
                  key={d.id}
                  className={styles.listItem}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDraft(d.id)}
                  onKeyDown={(e) => onKeyOpen(e, d.id)}
                  title="Открыть черновик"
                >
                  <div className={styles.listItemMain}>
                    <div className={styles.titleText}>{d.title}</div>

                    <div className={styles.metaRow}>
                      <span className={styles.chip}>{typeLabel(d.type)}</span>
                      <span className={styles.chip}>{formatDateRu(d.workout_date)}</span>
                      {d.duration_min ? <span className={styles.chip}>{d.duration_min} мин</span> : null}
                    </div>
                  </div>

                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.trashBtn}
                      disabled={deleteLoading}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        askDelete(d.id);
                      }}
                      title="Удалить черновик"
                      aria-label="Удалить черновик"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.listWrap} style={{ marginTop: 14 }}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>Выполненные</div>
            <div className={styles.muted}>{doneItems.length} шт.</div>
          </div>

          {loading ? (
            <div className={styles.muted}>Загружаю…</div>
          ) : doneItems.length === 0 ? (
            <div className={styles.empty}>Пока нет выполненных тренировок.</div>
          ) : (
            <div className={styles.list}>
              {doneItems.map((w) => (
                <div
                  key={w.id}
                  className={styles.listItem}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDone(w.id)}
                  onKeyDown={(e) => onKeyOpenDone(e, w.id)}
                  title="Открыть тренировку"
                >
                  <div className={styles.listItemMain}>
                    <div className={styles.titleText}>{w.title}</div>

                    <div className={styles.metaRow}>
                      <span className={styles.chip}>{typeLabel(w.type)}</span>
                      <span className={styles.chip}>{formatDateRu(w.workout_date)}</span>
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

                  <div className={styles.itemActions}>
                    

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
                </div>
              ))}
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