// app/sport/workouts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconTrash, IconArrow, IconUser, IconStats, IconCopy, IconHome, IconEdit } from "@/app/components/icons";
import { useRouter, usePathname } from "next/navigation";
import { useWorkoutStats } from "@/app/hooks/useWorkoutStats";
import { useDeleteWorkout } from "@/app/hooks/useDeleteWorkout";
import { useCopyWorkout } from "@/app/hooks/useCopyWorkout";


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
    case "dumbbell":
      return <IconStats className={styles.tabIcon} />;
    default:
      return null;
  }
}

type WorkoutType = "strength" | "cardio";
type DraftStatus = "draft" | "done";

type DraftWorkout = {
  id: number;
  title: string;
  type: WorkoutType;
  workout_date: string; // YYYY-MM-DD
  duration_min?: number | null;
  notes?: string | null;
  status: DraftStatus;
};

type DoneWorkout = {
  id: number;
  title: string;
  type: WorkoutType;
  workout_date: string; // YYYY-MM-DD
  duration_min?: number | null;
  notes?: string | null;
  status: DraftStatus; // будет "done"
  completed_at?: string | null;
};

function formatDateRu(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function typeLabel(t: WorkoutType) {
  return t === "strength" ? "Силовая" : "Кардио";
}

export default function SportWorkoutsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { deleteWorkout, loading: deleteLoading } = useDeleteWorkout();

  const { copyWorkout, loading: copyLoading } = useCopyWorkout();
  const [copyId, setCopyId] = useState<number | null>(null);

  async function reloadDrafts() {
    try {
      const r = await fetch("/api/sport/workouts?status=draft", { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) return;

      const mapped: DraftWorkout[] = (j.workouts || []).map((x: any) => ({
        id: Number(x.id),
        title: String(x.title || "").trim() || "Без названия",
        type: (x.type === "cardio" ? "cardio" : "strength") as WorkoutType,
        workout_date: String(x.workout_date || ""),
        duration_min: x.duration_min == null ? null : Number(x.duration_min),
        notes: null,
        status: "draft" as const,
      }));

      setDrafts(mapped);
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

      // покажем результат сразу
      await reloadDrafts();

      // можно еще сделать мягкий текст
      // setHint("Скопировано в черновики");
    } finally {
      setCopyId(null);
    }
  }  

  const [drafts, setDrafts] = useState<DraftWorkout[]>([]);
  const [done, setDone] = useState<DoneWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const draftItems = useMemo(() => drafts.filter((x) => x.status === "draft"), [drafts]);
  const doneItems = useMemo(() => done.filter((x) => x.status === "done"), [done]);

  // СТАТЫ СЧИТАЕМ ТОЛЬКО ДЛЯ ВЫПОЛНЕННЫХ (и только силовых)
  const statsIds = useMemo(
    () => doneItems.filter((w) => w.type === "strength").map((w) => w.id),
    [doneItems]
  );

  const { loading: statsLoading, data: statsByWorkoutId } = useWorkoutStats(statsIds);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setHint(null);

      try {
        const r = await fetch("/api/sport/workouts?status=draft", { credentials: "include" });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          if (j?.reason === "NO_SESSION") {
            setHint("Нет сессии (NO_SESSION). Открой миниапп через Telegram или проверь cookie session.");
          } else {
            setHint(j?.error || j?.reason || `HTTP ${r.status}`);
          }
          return;
        }

        const mapped: DraftWorkout[] = (j.workouts || []).map((x: any) => ({
          id: Number(x.id),
          title: String(x.title || "").trim() || "Без названия",
          type: (x.type === "cardio" ? "cardio" : "strength") as WorkoutType,
          workout_date: String(x.workout_date || ""),
          duration_min: x.duration_min == null ? null : Number(x.duration_min),
          notes: null,
          status: "draft" as const,
        }));

        setDrafts(mapped);

        const r2 = await fetch("/api/sport/workouts?status=done", { credentials: "include" });
        const j2 = await r2.json().catch(() => ({} as any));

        if (r2.ok && j2.ok) {
          const mappedDone: DoneWorkout[] = (j2.workouts || []).map((x: any) => ({
            id: Number(x.id),
            title: String(x.title || "").trim() || "Без названия",
            type: (x.type === "cardio" ? "cardio" : "strength") as WorkoutType,
            workout_date: String(x.workout_date || ""),
            duration_min: x.duration_min == null ? null : Number(x.duration_min),
            notes: null,
            status: "done" as const,
            completed_at: x.completed_at == null ? null : String(x.completed_at),
          }));

          mappedDone.sort((a, b) =>
            String(b.completed_at || "").localeCompare(String(a.completed_at || ""))
          );

          setDone(mappedDone);
        }
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

    // закрываем модалку
    setShowConfirm(false);
    setDeleteId(null);

    // убираем из списков (и drafts, и done, вдруг id там окажется)
    setDrafts((prev) => prev.filter((w) => w.id !== id));
    setDone((prev) => prev.filter((w) => w.id !== id));
  }

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

        <button
          type="button"
          className={styles.bigCta}
          onClick={() => router.push("/sport/workouts/newworkout")}
        >
          <div className={styles.bigCtaRow}>
            <span className={styles.bigCtaText}>Создать тренировку</span>
            <span className={styles.bigCtaIcon}>
              <IconArrow size={25} style={{ color: "#ffffff" }} />
            </span>
          </div>
        </button>

        <section className={styles.listWrap} style={{ marginTop: 14 }}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>Черновики</div>
            <div className={styles.muted}>{draftItems.length} шт.</div>
          </div>

          {hint ? <div className={styles.hintDanger}>{hint}</div> : null}

          {loading ? (
            <div className={styles.muted}>Загружаю…</div>
          ) : draftItems.length === 0 ? (
            <div className={styles.empty}>Для удобства вы можете создавать черновики заранее перед тренировкой.</div>
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