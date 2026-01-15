// app/sport/profile/page.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconUser, IconStats, IconHome, IconEdit } from "@/app/components/icons";

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

function fmtWeight(w: number | null) {
  if (w == null || !Number.isFinite(w)) return "";
  const isInt = Math.abs(w - Math.round(w)) < 1e-9;
  const s = isInt ? String(Math.round(w)) : String(w);
  return s.replace(".", ",");
}

function parseWeight(input: string): { ok: boolean; value: number | null; error?: string } {
  const raw = String(input || "").trim();

  if (!raw) return { ok: true, value: null };

  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, value: null, error: "Введите число" };
  if (n <= 0) return { ok: false, value: null, error: "Вес должен быть больше 0" };
  if (n > 500) return { ok: false, value: null, error: "Слишком большой вес" };

  const rounded = Math.round(n * 10) / 10;
  return { ok: true, value: rounded };
}

function ymdLocal(d: Date) {
  // YYYY-MM-DD (для input[type=date])
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toMeasuredAtISO(dateYmd: string) {
  // Храним measured_at как ISO, но без сюрпризов по часовым поясам:
  // фиксируем на 12:00 локального времени.
  const [y, m, d] = dateYmd.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  return dt.toISOString();
}

export default function SportProfilePage() {
  const pathname = usePathname();

  const [goal, setGoal] = useState<string>("");
  const [weight, setWeight] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // ===== GOAL MODAL =====
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  // ===== WEIGHT MODAL =====
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  // дата измерения
  const [measuredDate, setMeasuredDate] = useState<string>(ymdLocal(new Date())); // YYYY-MM-DD

  const savingAny = savingGoal || savingWeight;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setHint(null);

      try {
        const r = await fetch("/api/sport/profile", { credentials: "include" });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          const msg =
            j?.reason === "NO_SESSION"
              ? "Нет сессии. Открой через Telegram."
              : j?.error || j?.reason || `HTTP ${r.status}`;
          setHint(msg);
          return;
        }

        setGoal(String(j.goal || "").trim());
        setWeight(j.weight == null ? null : Number(j.weight));

        // если бек отдает weight_at (ISO) - поставим его датой, иначе сегодня
        if (j.weight_at) {
          const d = new Date(String(j.weight_at));
          if (!Number.isNaN(d.getTime())) setMeasuredDate(ymdLocal(d));
        } else {
          setMeasuredDate(ymdLocal(new Date()));
        }
      } catch (e: any) {
        setHint(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ===== Goal handlers =====
  function openGoalModal() {
    setGoalDraft(goal || "");
    setShowGoalModal(true);
  }

  function closeGoalModal() {
    if (savingAny) return;
    setShowGoalModal(false);
  }

  async function saveGoal() {
    if (savingAny) return;

    const nextGoal = String(goalDraft || "").trim();

    setSavingGoal(true);
    setHint(null);

    try {
      const r = await fetch("/api/sport/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ goal: nextGoal }),
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

      setGoal(String(j.goal ?? nextGoal).trim());
      setShowGoalModal(false);
    } catch (e: any) {
      setHint(String(e?.message || e));
    } finally {
      setSavingGoal(false);
    }
  }

  // ===== Weight handlers =====
  function openWeightModal() {
    setWeightDraft(fmtWeight(weight));
    // по умолчанию: сегодня (или если уже есть weight_at - он выставлен в useEffect)
    if (!measuredDate) setMeasuredDate(ymdLocal(new Date()));
    setShowWeightModal(true);
  }

  function closeWeightModal() {
    if (savingAny) return;
    setShowWeightModal(false);
  }

  async function saveWeight() {
    if (savingAny) return;

    const parsed = parseWeight(weightDraft);
    if (!parsed.ok) {
      setHint(parsed.error || "Не смог распознать вес");
      return;
    }

    // вес можно "очистить" (parsed.value === null) — тогда measured_at не нужен
    const measured_at = parsed.value === null ? null : toMeasuredAtISO(measuredDate);

    setSavingWeight(true);
    setHint(null);

    try {
      const r = await fetch("/api/sport/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          weight: parsed.value,
          ...(measured_at ? { measured_at } : {}),
        }),
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

      setWeight(j.weight == null ? null : Number(j.weight));

      // обновим measuredDate по тому, что реально вернулось с бэка
      if (j.weight_at) {
        const d = new Date(String(j.weight_at));
        if (!Number.isNaN(d.getTime())) setMeasuredDate(ymdLocal(d));
      }

      setShowWeightModal(false);
    } catch (e: any) {
      setHint(String(e?.message || e));
    } finally {
      setSavingWeight(false);
    }
  }

  const goalText = useMemo(() => {
    if (loading) return "Загружаю…";
    return goal.trim() ? goal.trim() : "Напишите цель";
  }, [loading, goal]);

  const weightText = useMemo(() => {
    if (loading) return "Загружаю…";
    return weight == null ? "Напишите актуальный вес" : `${fmtWeight(weight)} кг`;
  }, [loading, weight]);

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Профиль</h1>
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
                {t.showDot ? <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} /> : null}
                {hasIcon ? renderTabIcon(t.icon) : t.label}
              </Link>
            );
          })}
        </nav>

        {hint ? <div className={styles.hintDanger}>{hint}</div> : null}

        <div className={styles.list}>
          <section className={styles.card}>
            <div className={styles.profileSectionHead}>
              <div className={styles.profileSectionHeadLeft}>
                <div className={styles.profileSectionTitle}>Цель</div>
                <div className={styles.profileText}>{goalText}</div>
              </div>

              <button
                type="button"
                onClick={openGoalModal}
                title="Редактировать"
                className={styles.iconSmallBtn}
                disabled={loading}
              >
                <IconEdit size={15} />
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.profileSectionHead}>
              <div className={styles.profileSectionHeadLeft}>
                <div className={styles.profileSectionTitle}>Вес</div>
                <div className={styles.profileText}>{weightText}</div>
              </div>

              <button
                type="button"
                onClick={openWeightModal}
                title="Редактировать"
                className={styles.iconSmallBtn}
                disabled={loading}
              >
                <IconEdit size={15} />
              </button>
            </div>
          </section>
        </div>

        {/* ===== GOAL MODAL ===== */}
        {showGoalModal && (
          <div className={styles.modalOverlay} onClick={closeGoalModal}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Цель</div>
              <div className={styles.modalText}>Напиши коротко, что держим в фокусе.</div>

              <div style={{ marginTop: 12 }}>
                <textarea
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "44px";
                    el.style.height = el.scrollHeight + "px";
                  }}
                  placeholder="Например: 3 тренировки в неделю и дефицит без фанатизма"
                  className={styles.textarea}
                  disabled={savingAny}
                />
              </div>

              <div className={styles.modalActions} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeGoalModal}
                  disabled={savingAny}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={saveGoal}
                  disabled={savingAny}
                >
                  {savingGoal ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== WEIGHT MODAL ===== */}
        {showWeightModal && (
          <div className={styles.modalOverlay} onClick={closeWeightModal}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Вес</div>
              <div className={styles.modalText}>Можно поставить дату измерения, даже если вводишь задним числом.</div>

              <div style={{ marginTop: 12 }}>
                <input
                  value={weightDraft}
                  onChange={(e) => setWeightDraft(e.target.value)}
                  placeholder="Введите вес"
                  className={styles.input}
                  style={{ width: "100%" }}
                  disabled={savingAny}
                  inputMode="decimal"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <div className={styles.modalText} style={{ marginBottom: 8 }}>
                  Дата измерения
                </div>

                <input
                  type="date"
                  value={measuredDate}
                  onChange={(e) => setMeasuredDate(e.target.value)}
                  className={styles.input}
                  style={{ width: "100%" }}
                  disabled={savingAny}
                />
              </div>

              <div className={styles.modalActions} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeWeightModal}
                  disabled={savingAny}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={saveWeight}
                  disabled={savingAny}
                >
                  {savingWeight ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}