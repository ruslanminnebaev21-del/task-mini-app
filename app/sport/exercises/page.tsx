// app/sport/exercises/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import { IconPlus, IconTrash, IconUser, IconStats } from "@/app/components/icons";
import styles from "../sport.module.css";


type LoadType = "external" | "bodyweight";

type Tab = {
  label: string;
  href: string;
  showDot: boolean;   // нужна ли точка
  icon?:  "stats" | "user" | "dumbbell"; // какие иконки поддерживаем
};

const TABS: Tab[] = [
  { label: "Тренировки", href: "/sport", showDot: true },
  { label: "Упражнения", href: "/sport/exercises", showDot: true },
  { label: "Статистика", href: "/sport/stats", showDot: false, icon: "stats" },
  { label: "Профиль", href: "/sport/profile", showDot: false, icon: "user" },
];

function isActiveTab(pathname: string, href: string) {
  if (href === "/sport") return pathname === "/sport";
  return pathname === href || pathname.startsWith(href + "/");
}
function renderTabIcon(icon?: string) {
  if (!icon) return null;

  switch (icon) {
    case "user":
      return <IconUser className={styles.tabIcon} />;
    case "stats":
      return <IconStats className={styles.tabIcon} />;
    case "dumbbell":
      return <IconDumbbell className={styles.tabIcon} />;
    default:
      return null;
  }
}



function normName(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

function loadTypeLabel(t: LoadType) {
  return t === "external" ? "Отягощение" : "Собственный вес";
}

export default function SportExercisesPage() {
  const pathname = usePathname();

  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [loadType, setLoadType] = useState<LoadType>("external");
  const [items, setItems] = useState<Exercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());


  useEffect(() => {
    (async () => {
      setLoading(true);
      setHint(null);

      try {
        const r = await fetch("/api/exercises", { credentials: "include" });
        const j = await r.json().catch(() => ({} as any));

        if (!r.ok || !j.ok) {
          if (j.reason === "NO_SESSION") {
            setHint("Сессии нет. Открой мини-апп кнопкой у бота.");
            return;
          }
          setHint(j.error || j.reason || `Не смог загрузить упражнения (HTTP ${r.status})`);
          return;
        }

        const list = (j.exercises || []).map((x: any) => ({
          id: String(x.id),
          name: String(x.name || ""),
          loadType: (x.load_type as LoadType) || "external",
        }));

        setItems(list);
      } catch (e: any) {
        setHint(`Ошибка сети: ${String(e?.message || e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);  

  const nameNorm = useMemo(() => normName(name), [name]);

  const exactDuplicate = useMemo(() => {
    if (!nameNorm) return false;
    return items.some((x) => normName(x.name) === nameNorm);
  }, [items, nameNorm]);

  const suggestions = useMemo(() => {
    if (!nameNorm || nameNorm.length < 4) return [];
    return items
      .filter((x) => normName(x.name) !== nameNorm)
      .filter((x) => normName(x.name).includes(nameNorm))
      .slice(0, 5);
  }, [items, nameNorm]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, "ru", { sensitivity: "base" })
    );
  }, [items]);  

  const canAdd = useMemo(() => nameNorm.length > 0 && !exactDuplicate, [nameNorm, exactDuplicate]);

  async function addExercise() {
    const n = name.trim();
    if (!n) return;

    // фронтовая блокировка дублей (оставляем)
    const nNorm = normName(n);
    const isDup = items.some((x) => normName(x.name) === nNorm);
    if (isDup) return;

    setLoading(true);
    setHint(null);

    try {
      const r = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: n, loadType }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j.ok) {
        if (j.reason === "NO_SESSION") {
          setHint("Сессии нет. Открой мини-апп кнопкой у бота.");
          return;
        }
        setHint(j.error || j.reason || `Не смог добавить (HTTP ${r.status})`);
        return;
      }

      const ex = j.exercise;
      const mapped: Exercise = {
        id: String(ex.id),
        name: String(ex.name || n),
        loadType: (ex.load_type as LoadType) || loadType,
      };

      setItems((prev) => [mapped, ...prev]);
      setName("");
      setLoadType("external");
    } catch (e: any) {
      setHint(`Ошибка сети: ${String(e?.message || e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function removeExercise(id: number) {
    if (deletingIds.has(id)) return;

    setDeletingIds((s) => new Set(s).add(id));

    try {
      const r = await fetch("/api/exercises", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j.ok) {
        // тут можешь вывести hint, если он у тебя есть
        // setHint(`Не смог удалить: ${j.error || j.reason || r.status}`);
        return;
      }

      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      // setHint(`Ошибка сети при удалении: ${String(e?.message || e)}`);
    } finally {
      setDeletingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
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
          <h1 className={styles.h1}>Упражнения</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Разделы дневника тренировок">
        {TABS.map((t) => {
            const active = isActiveTab(pathname, t.href);
            const hasIcon = !!t.icon;

            return (
              <Link
                key={t.href}
                href={t.href}
                className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}
                title={t.label}
              >
                {/* точка только если нужна */}
                {t.showDot && (
                  <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} />
                )}

                {/* иконка или текст */}
                {hasIcon ? renderTabIcon(t.icon) : t.label}
              </Link>
            );
          })}
        </nav>

        {hint ? (
          <section className={styles.card} style={{ marginBottom: 12 }}>
            <div className={styles.muted}>{hint}</div>
          </section>
        ) : null}        

        <section className={styles.card}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              {/*<div className={styles.label}>Название</div>*/}

              <div className={styles.inputRow}>
                <input
                  className={`${styles.input} ${styles.inputGrow}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Добавьте любимое упражнение"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck
                  inputMode="text"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!canAdd) return;
                      addExercise();
                    }
                  }}
                />

                <button
                  type="button"
                  className={`${styles.btnCircle} ${!canAdd ? styles.btnDisabled : ""}`}
                  onClick={addExercise}
                  disabled={!canAdd}
                  title={!canAdd ? (exactDuplicate ? "Дубль" : "Введи название") : "Добавить"}
                >
                  <IconPlus size={15} style={{ color: "#ffffff" }} />
                </button>
              </div>
            </div>

            <div className={styles.field}>
              {/*<div className={styles.label}>Тип нагрузки</div>*/}

              <div className={styles.radioRow} role="radiogroup" aria-label="Тип нагрузки">
                <button
                  type="button"
                  className={`${styles.chipBtn} ${loadType === "external" ? styles.chipBtnActive : ""}`}
                  onClick={() => setLoadType("external")}
                >
                  С отягощением
                </button>

                <button
                  type="button"
                  className={`${styles.chipBtn} ${loadType === "bodyweight" ? styles.chipBtnActive : ""}`}
                  onClick={() => setLoadType("bodyweight")}
                >
                  С собственны весом
                </button>
              </div>

              {/*<div className={styles.muted}>
                Отягощение = в тренировке вводишь килограммы. Собственный вес = “0” означает только свой вес.
              </div>*/}

              {(exactDuplicate || suggestions.length > 0) && (
                <>
                  {exactDuplicate ? (
                    <div className={styles.hintDanger}>Такое упражнение уже есть. Дубли не добавляем.</div>
                  ) : (
                    <>
                      <div className={styles.hintTitle}>Похоже уже есть:</div>

                      <div className={styles.suggestList}>
                        {suggestions.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            className={styles.suggestItem}
                            onClick={() => {
                              setName(x.name);
                              setLoadType(x.loadType);
                            }}
                            title="Подставить в форму"
                          >
                            <div className={styles.suggestName}>{x.name}</div>
                            <div className={styles.suggestMeta}>{loadTypeLabel(x.loadType)}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

            </div>
          </div>
        </section>

        <section className={styles.listWrap}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>Список</div>
            <div className={styles.muted}>{items.length} шт.</div>
          </div>

          {items.length === 0 ? (
            <div className={styles.empty}>Пока пусто. Добавь первое упражнение выше.</div>
          ) : (
            <div className={styles.list}>
              {sortedItems.map((x) => (
                <div key={x.id} className={styles.listItem}>
                  <div className={styles.listItemMain}>
                    <div className={styles.titleText}>{x.name}</div>
                    <div className={styles.metaRow}>
                      <span className={styles.chip}>
                        {x.loadType === "external" ? "С отягощением" : "С собственным весом"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.trashBtn}
                    onClick={() => removeExercise(x.id)}
                    disabled={deletingIds.has(x.id)}
                    title={deletingIds.has(x.id) ? "Удаляю..." : "Удалить"}
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