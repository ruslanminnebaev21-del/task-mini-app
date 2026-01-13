// app/sport/workouts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconTrash, IconArrow } from "@/app/components/icons";
import { useRouter } from "next/navigation";

type WorkoutType = "strength" | "cardio";
type DraftStatus = "draft" | "done";

type DraftWorkout = {
  id: string;
  title: string;
  type: WorkoutType;
  workout_date: string; // YYYY-MM-DD
  duration_min?: number | null;
  notes?: string | null;
  status: DraftStatus;
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
  const [drafts, setDrafts] = useState<DraftWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const draftItems = useMemo(() => drafts.filter((x) => x.status === "draft"), [drafts]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setHint(null);

      try {
        const r = await fetch("/api/sport/workouts?status=draft", { credentials: "include" });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          if (j?.reason === "NO_SESSION") {
            setHint(
              "Нет сессии (NO_SESSION). Открой миниапп через Telegram или проверь cookie session."
            );
          } else {
            setHint(j?.error || j?.reason || `HTTP ${r.status}`);
          }
          return;
        }

        const mapped: DraftWorkout[] = (j.workouts || []).map((x: any) => ({
          id: String(x.id),
          title: String(x.title || "").trim() || "Без названия",
          type: (x.type === "cardio" ? "cardio" : "strength") as WorkoutType,
          workout_date: String(x.workout_date || ""),
          duration_min: x.duration_min == null ? null : Number(x.duration_min),
          notes: null,
          status: "draft" as const,
        }));

        setDrafts(mapped);
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function openDraft(id: string) {
    router.push(`/sport/workouts/newworkout?workout_id=${encodeURIComponent(id)}`);
  }

  function onKeyOpen(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDraft(id);
    }
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

        <nav className={styles.tabWrap} aria-label="Навигация">
          <Link href="/sport" className={styles.tabBadge} aria-label="Назад в обзор" title="Назад">
            <span className={styles.dot} />
            Назад
          </Link>
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
            <div className={styles.empty}>Пока нет черновиков. Создай тренировку сверху.</div>
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
                      {d.duration_min ? (
                        <span className={styles.chip}>{d.duration_min} мин</span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.trashBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      alert("Удаление черновика подключим позже");
                    }}
                    title="Удалить черновик"
                    aria-label="Удалить черновик"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}