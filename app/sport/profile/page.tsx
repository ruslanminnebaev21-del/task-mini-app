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

type BodySizesDraft = {
  chest: string;
  waist: string;
  belly: string;
  pelvis: string;
  thigh: string;
  arm: string;
};

type BodyCompDraft = {
  water: string;
  protein: string;
  minerals: string;
  body_fat: string;
  bmi: string;
  fat_percent: string;
  visceral_fat: string;
};

type BodySizes = {
  measured_at: string | null; // YYYY-MM-DD
  chest: number | null;
  waist: number | null;
  belly: number | null;
  pelvis: number | null;
  thigh: number | null;
  arm: number | null;
};

type BodyComp = {
  measured_at: string | null; // YYYY-MM-DD
  water: number | null;
  protein: number | null;
  minerals: number | null;
  body_fat: number | null;
  bmi: number | null;
  fat_percent: number | null;
  visceral_fat: number | null;
};

function numToStr(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return "";
  const n = Number(v);
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  const s = isInt ? String(Math.round(n)) : String(n);
  return s.replace(".", ",");
}

function parsePositiveNumber(
  input: string,
  opts?: { allowEmpty?: boolean; max?: number }
): { ok: boolean; value: number | null; error?: string } {
  const raw = String(input || "").trim();
  if (!raw) return { ok: true, value: null };

  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, value: null, error: "Введите число" };
  if (n < 0) return { ok: false, value: null, error: "Значение не может быть отрицательным" };
  if (opts?.max != null && n > opts.max) return { ok: false, value: null, error: "Слишком большое значение" };

  const rounded = Math.round(n * 10) / 10;
  return { ok: true, value: rounded };
}

function emptySizesDraft(): BodySizesDraft {
  return { chest: "", waist: "", belly: "", pelvis: "", thigh: "", arm: "" };
}

function emptyCompDraft(): BodyCompDraft {
  return { water: "", protein: "", minerals: "", body_fat: "", bmi: "", fat_percent: "", visceral_fat: "" };
}

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt3(a: string, b: string, c: string) {
  // красиво для карточек, если пусто -> "—"
  const A = a || "—";
  const B = b || "—";
  const C = c || "—";
  return `${A} · ${B} · ${C}`;
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
  const [measuredDate, setMeasuredDate] = useState<string>(ymdLocal(new Date())); // YYYY-MM-DD

  // ===== BODY SIZES MODAL =====
  const [showSizesModal, setShowSizesModal] = useState(false);
  const [sizesDraft, setSizesDraft] = useState<BodySizesDraft>(emptySizesDraft());
  const [savingSizes, setSavingSizes] = useState(false);
  const [sizesMeasuredDate, setSizesMeasuredDate] = useState<string>(ymdLocal(new Date()));

  // ===== BODY COMPOSITION MODAL =====
  const [showCompModal, setShowCompModal] = useState(false);
  const [compDraft, setCompDraft] = useState<BodyCompDraft>(emptyCompDraft());
  const [savingComp, setSavingComp] = useState(false);
  const [compMeasuredDate, setCompMeasuredDate] = useState<string>(ymdLocal(new Date()));

  const savingAny = savingGoal || savingWeight || savingSizes || savingComp;

  // ===== DATA FROM DB (last measurements) =====
  const [bodySizes, setBodySizes] = useState<BodySizes | null>(null);
  const [bodyComp, setBodyComp] = useState<BodyComp | null>(null);

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

        // weight_at у тебя с бэка должен быть YYYY-MM-DD (или ISO) — тут подстрахуемся
        if (j.weight_at) {
          const s = String(j.weight_at);
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            setMeasuredDate(s);
          } else {
            const d = new Date(s);
            if (!Number.isNaN(d.getTime())) setMeasuredDate(ymdLocal(d));
          }
        } else {
          setMeasuredDate(ymdLocal(new Date()));
        }

        // ВАЖНО: сохраняем замеры/состав из бэка (если пришли)
        if (j.body_sizes) setBodySizes(j.body_sizes);
        if (j.body_comp) setBodyComp(j.body_comp);
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
      // если бэк возвращает body_* тоже — подтянем
      if (j.body_sizes) setBodySizes(j.body_sizes);
      if (j.body_comp) setBodyComp(j.body_comp);

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

    const measured_at = parsed.value === null ? null : measuredDate; // YYYY-MM-DD

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

      if (j.weight_at) {
        const s = String(j.weight_at);
        setMeasuredDate(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ymdLocal(new Date(s)));
      }

      if (j.body_sizes) setBodySizes(j.body_sizes);
      if (j.body_comp) setBodyComp(j.body_comp);

      setShowWeightModal(false);
    } catch (e: any) {
      setHint(String(e?.message || e));
    } finally {
      setSavingWeight(false);
    }
  }

  // ===== Body sizes handlers =====
  function openSizesModal() {
    const src = bodySizes;

    setSizesDraft({
      chest: numToStr(src?.chest),
      waist: numToStr(src?.waist),
      belly: numToStr(src?.belly),
      pelvis: numToStr(src?.pelvis),
      thigh: numToStr(src?.thigh),
      arm: numToStr(src?.arm),
    });

    setSizesMeasuredDate(src?.measured_at ? String(src.measured_at) : ymdLocal(new Date()));
    setShowSizesModal(true);
  }

  function closeSizesModal() {
    if (savingAny) return;
    setShowSizesModal(false);
  }

  async function saveSizes() {
    if (savingAny) return;

    const fields: Array<[keyof BodySizesDraft, string]> = [
      ["chest", "Грудь"],
      ["waist", "Талия"],
      ["belly", "Живот"],
      ["pelvis", "Таз"],
      ["thigh", "Ляжка"],
      ["arm", "Рука"],
    ];

    const payload: any = {};
    for (const [k, label] of fields) {
      const parsed = parsePositiveNumber(sizesDraft[k], { max: 300 });
      if (!parsed.ok) {
        setHint(`${label}: ${parsed.error || "ошибка"}`);
        return;
      }
      payload[k] = parsed.value;
    }

    const measured_at = sizesMeasuredDate; // YYYY-MM-DD

    setSavingSizes(true);
    setHint(null);

    try {
      const r = await fetch("/api/sport/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body_sizes: { ...payload, measured_at },
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

      // подтягиваем актуальное с бэка (самое главное)
      if (j.body_sizes) setBodySizes(j.body_sizes);
      if (j.body_comp) setBodyComp(j.body_comp);

      setShowSizesModal(false);
    } catch (e: any) {
      setHint(String(e?.message || e));
    } finally {
      setSavingSizes(false);
    }
  }

  // ===== Body composition handlers =====
  function openCompModal() {
    const src = bodyComp;

    setCompDraft({
      water: numToStr(src?.water),
      protein: numToStr(src?.protein),
      minerals: numToStr(src?.minerals),
      body_fat: numToStr(src?.body_fat),
      bmi: numToStr(src?.bmi),
      fat_percent: numToStr(src?.fat_percent),
      visceral_fat: numToStr(src?.visceral_fat),
    });

    setCompMeasuredDate(src?.measured_at ? String(src.measured_at) : ymdLocal(new Date()));
    setShowCompModal(true);
  }

  function closeCompModal() {
    if (savingAny) return;
    setShowCompModal(false);
  }
  function fmtDate(d: string | null | undefined) {
    if (!d) return "";
    const [y, m, day] = String(d).split("-");
    if (!y || !m || !day) return "";
    return `${day}.${m}.${y}`;
  }

  async function saveComp() {
    if (savingAny) return;

    const fields: Array<[keyof BodyCompDraft, string, number]> = [
      ["water", "Вода", 100],
      ["protein", "Протеин", 100],
      ["minerals", "Минералы", 100],
      ["body_fat", "Жир в теле", 200],
      ["bmi", "ИМТ", 100],
      ["fat_percent", "% жира", 100],
      ["visceral_fat", "Висцеральный жир", 100],
    ];

    const payload: any = {};
    for (const [k, label, max] of fields) {
      const parsed = parsePositiveNumber(compDraft[k], { max });
      if (!parsed.ok) {
        setHint(`${label}: ${parsed.error || "ошибка"}`);
        return;
      }
      payload[k] = parsed.value;
    }

    const measured_at = compMeasuredDate; // YYYY-MM-DD

    setSavingComp(true);
    setHint(null);

    try {
      const r = await fetch("/api/sport/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body_comp: { ...payload, measured_at },
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

      if (j.body_sizes) setBodySizes(j.body_sizes);
      if (j.body_comp) setBodyComp(j.body_comp);

      setShowCompModal(false);
    } catch (e: any) {
      setHint(String(e?.message || e));
    } finally {
      setSavingComp(false);
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

  const sizesCardText = useMemo(() => {
    if (loading) return "Загружаю…";
    if (!bodySizes) return "Заполните замеры";

    const date = fmtDate(bodySizes.measured_at);

    return fmt3(
      `Грудь: ${numToStr(bodySizes.chest) || "—"}`,
      `Талия: ${numToStr(bodySizes.waist) || "—"}`,
      `Таз: ${numToStr(bodySizes.pelvis) || "—"}${date ? ` · ${date}` : ""}`
    );
  }, [loading, bodySizes]);

  const compCardText = useMemo(() => {
    if (loading) return "Загружаю…";
    if (!bodyComp) return "Заполните состав";

    const date = fmtDate(bodyComp.measured_at);

    return fmt3(
      `% жира: ${numToStr(bodyComp.fat_percent) || "—"}`,
      `ИМТ: ${numToStr(bodyComp.bmi) || "—"}`,
      `Вода: ${numToStr(bodyComp.water) || "—"}${date ? ` · ${date}` : ""}`
    );
  }, [loading, bodyComp]);

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

          {/* Замеры тела */}
          <section className={styles.card}>
            <div className={styles.profileSectionHead}>
              <div>
                <div className={styles.profileSectionTitle}>Замеры тела</div>
                <div className={styles.profileText}>{sizesCardText}</div>
              </div>

              <button className={styles.iconSmallBtn} onClick={openSizesModal} disabled={loading}>
                <IconEdit size={15} />
              </button>
            </div>
          </section>

          {/* Состав тела */}
          <section className={styles.card}>
            <div className={styles.profileSectionHead}>
              <div>
                <div className={styles.profileSectionTitle}>Состав тела</div>
                <div className={styles.profileText}>{compCardText}</div>
              </div>

              <button className={styles.iconSmallBtn} onClick={openCompModal} disabled={loading}>
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

        {/* ===== SIZES MODAL ===== */}
        {showSizesModal && (
          <div className={styles.modalOverlay} onClick={closeSizesModal}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Замеры тела</div>
              <div className={styles.modalText}>Запиши значения в сантиметрах.</div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center" }}>
                  <div className={styles.modalText} style={{ margin: 0, whiteSpace: "nowrap" }}>
                    Дата:
                  </div>
                  <input
                    type="date"
                    value={sizesMeasuredDate}
                    onChange={(e) => setSizesMeasuredDate(e.target.value)}
                    className={styles.input}
                    disabled={savingAny}
                  />
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { key: "chest", label: "Грудь" },
                    { key: "waist", label: "Талия" },
                    { key: "belly", label: "Живот" },
                    { key: "pelvis", label: "Таз" },
                    { key: "thigh", label: "Ляжка" },
                    { key: "arm", label: "Рука" },
                  ].map((f) => (
                    <div
                      key={f.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr 34px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div className={styles.modalText} style={{ margin: 0 }}>
                        {f.label}
                      </div>

                      <input
                        className={styles.input}
                        value={(sizesDraft as any)[f.key]}
                        onChange={(e) =>
                          setSizesDraft((p) => ({
                            ...p,
                            [f.key]: e.target.value.replace(/[^\d.,]/g, ""),
                          }))
                        }
                        inputMode="decimal"
                        disabled={savingAny}
                      />

                      <div className={styles.modalText} style={{ margin: 0, opacity: 0.8 }}>
                        см
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.modalActions} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeSizesModal}
                  disabled={savingAny}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={saveSizes}
                  disabled={savingAny}
                >
                  {savingSizes ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== COMPOSITION MODAL ===== */}
        {showCompModal && (
          <div className={styles.modalOverlay} onClick={closeCompModal}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalTitle}>Состав тела</div>
              <div className={styles.modalText}>Можно заполнять не все поля.</div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center" }}>
                  <div className={styles.modalText} style={{ margin: 0, whiteSpace: "nowrap" }}>
                    Дата:
                  </div>
                  <input
                    type="date"
                    value={compMeasuredDate}
                    onChange={(e) => setCompMeasuredDate(e.target.value)}
                    className={styles.input}
                    disabled={savingAny}
                  />
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { key: "water", label: "Вода %", unit: "%" },
                    { key: "protein", label: "Протеин %", unit: "%" },
                    { key: "minerals", label: "Минералы %", unit: "%" },
                    { key: "body_fat", label: "Жир в теле", unit: "кг" },
                    { key: "bmi", label: "ИМТ", unit: "" },
                    { key: "fat_percent", label: "% жира", unit: "%" },
                    { key: "visceral_fat", label: "Висцеральный жир", unit: "" },
                  ].map((f) => (
                    <div
                      key={f.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 1fr 44px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div className={styles.modalText} style={{ margin: 0 }}>
                        {f.label}
                      </div>

                      <input
                        className={styles.input}
                        value={(compDraft as any)[f.key]}
                        onChange={(e) =>
                          setCompDraft((p) => ({
                            ...p,
                            [f.key]: e.target.value.replace(/[^\d.,]/g, ""),
                          }))
                        }
                        inputMode="decimal"
                        disabled={savingAny}
                      />

                      <div className={styles.modalText} style={{ margin: 0, opacity: 0.8 }}>
                        {f.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.modalActions} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalCancel}`}
                  onClick={closeCompModal}
                  disabled={savingAny}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  className={`${styles.modalBtn} ${styles.modalDelete}`}
                  onClick={saveComp}
                  disabled={savingAny}
                >
                  {savingComp ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}