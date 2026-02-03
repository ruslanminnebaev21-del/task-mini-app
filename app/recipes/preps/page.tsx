// app/recipes/preps/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconArrow, IconPlus, IconTrash, IconEdit } from "@/app/components/icons";
import RecMenu from "@/app/components/RecMenu/RecMenu";

type Unit = "portions" | "pieces";

type Prep = {
  id: string;
  title: string;
  counts: number;
  unit?: Unit | null;
  category_id?: string | null;
  category_title?: string | null;

};

type PrepCategory = {
  id: string;
  title: string;
};

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error ?? "Request failed");
  return j as T;
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error ?? "Request failed");
  return j as T;
}

async function updateCounts(id: string, delta: number) {
  return postJson<{
    ok: boolean;
    prep: {
      id: string;
      counts: number;
      title?: string;
      unit?: Unit | null;
      category_id?: string | null;
      category_title?: string | null;
      created_at?: string;
    };
  }>("/api/recipes/updatePreps", { id, delta });
}

async function deletePrep(id: string) {
  return postJson<{ ok: boolean }>("/api/recipes/deletePreps", { id });
}

function unitLabel(u: Unit | null | undefined) {
  if (u === "pieces") return "штук";
  if (u === "portions") return "порц";
  return "ед.";
}

function sortByTitle(a: Prep, b: Prep) {
  const ta = String(a.title ?? "").trim();
  const tb = String(b.title ?? "").trim();
  return ta.localeCompare(tb, "ru", { sensitivity: "base" });
}

export default function PrepsPage() {
  // ===== DATA =====
  const [items, setItems] = useState<Prep[]>([]);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);

  // ===== TOAST =====
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1700);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ===== CATEGORIES =====
  const [categories, setCategories] = useState<PrepCategory[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(""); // "" = без категории

  const [catOpen, setCatOpen] = useState(false);
  const catWrapRef = useRef<HTMLDivElement | null>(null);

  // ===== ADD FORM STATE =====
  const [newTitle, setNewTitle] = useState("");
  const [unit, setUnit] = useState<Unit>("portions");
  const [newCount, setNewCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // режим формы: создание/редактирование
  const [editId, setEditId] = useState<string | null>(null); // id редактируемой заготовки
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const formWrapRef = useRef<HTMLDivElement | null>(null);

  function scrollToForm() {
    const el = formWrapRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ✅ сортируем внутри useMemo (items не мутируем)
  const inStock = useMemo(
    () => items.filter((x) => (x.counts ?? 0) > 0).slice().sort(sortByTitle),
    [items]
  );
  const outOfStock = useMemo(
    () => items.filter((x) => (x.counts ?? 0) <= 0).slice().sort(sortByTitle),
    [items]
  );

  const canAdd = useMemo(() => newTitle.trim().length > 0 && !saving, [newTitle, saving]);

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const categoryTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(String(c.id), String(c.title ?? "").trim());
    return m;
  }, [categories]);

  const selectedCatTitle = useMemo(() => {
    if (!categoryId) return "";
    return categoryTitleById.get(categoryId) ?? "";
  }, [categoryId, categoryTitleById]);

  // ===== LOAD LIST + CATEGORIES =====
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setHint(null);

      try {
        setCatLoading(true);

        const [prepsRes, catsRes] = await Promise.all([
          fetchJson<{ ok: boolean; preps: any[] }>("/api/recipes/listPreps"),
          fetchJson<{ ok: boolean; categories: any[] }>("/api/recipes/listPrepCategories").catch(() => ({
            ok: false,
            categories: [],
          })),
        ]);

        if (!alive) return;

        const list: Prep[] = (prepsRes?.preps ?? []).map((p: any) => ({
          id: String(p.id),
          title: String(p.title ?? ""),
          counts: Number(p.counts ?? 0),
          unit: p.unit === "pieces" || p.unit === "portions" ? p.unit : null,
          category_id: p.category_id != null ? String(p.category_id) : null, // <-- добавь
          category_title: p.category_title != null ? String(p.category_title) : null,
        }));

        const cats: PrepCategory[] = (catsRes?.categories ?? [])
          .map((c: any) => ({
            id: String(c.id),
            title: String(c.title ?? "").trim(),
          }))
          .filter((c: PrepCategory) => c.id && c.title);

        setItems(list);
        setCategories(cats);
      } catch (e: any) {
        if (!alive) return;
        setHint(e?.message ?? "Не удалось загрузить заготовки");
        setItems([]);
      } finally {
        if (!alive) return;
        setLoading(false);
        setCatLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!catOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = catWrapRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setCatOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [catOpen]);

  // ===== ACTIONS =====
  const focusAddForm = () => {
    setHint(null);
    setIsEditing(false);
    setEditId(null);

    setShowForm(true);
    requestAnimationFrame(() => {
      scrollToForm();
      titleInputRef.current?.focus();
    });
  };
  function closeForm() {
    setShowForm(false);
    setCatOpen(false);

    setIsEditing(false);
    setEditId(null);

    setNewTitle("");
    setNewCount("");
    setUnit("portions");
    setCategoryId("");
  }
  async function submitForm() {
    if (saving) return;

    const title = newTitle.trim();
    if (!title) return;

    if (isEditing) {
      await onSaveEdit();
      closeForm(); // по галочке закрываем форму
    } else {
      await onAdd();
      closeForm(); // по галочке закрываем форму
    }
  }  

  function openEdit(p: Prep) {
    setHint(null);

    setIsEditing(true);
    setEditId(p.id);

    setShowForm(true);

    setNewTitle(p.title ?? "");
    setNewCount(String(p.counts ?? 0));
    setUnit(p.unit === "pieces" || p.unit === "portions" ? p.unit : "portions");
    setCategoryId(p.category_id ? String(p.category_id) : "");
    setCatOpen(false);

    requestAnimationFrame(() => {
      scrollToForm();
      titleInputRef.current?.focus();
    });
  }


  async function onSaveEdit() {
    const id = editId; // <<< ВАЖНО
    const title = newTitle.trim();
    if (!id || !title || saving) return;

    const counts = Math.max(0, Number(onlyDigits(newCount) || "0"));
    const nextCatId = categoryId ? categoryId : null;
    const nextCatTitle = nextCatId ? (categoryTitleById.get(nextCatId) ?? null) : null;

    setSaving(true);
    setHint(null);

    try {
      const res = await postJson<{
        ok: boolean;
        prep: { id: string; title: string; counts: number; unit?: Unit | null; category_title?: string | null };
      }>("/api/recipes/EditPreps", {
        id,
        title,
        counts,
        unit,
        category_id: nextCatId,
      });

      const p = res?.prep;
      if (!p?.id) throw new Error("Bad response");

      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? { ...x, title, counts, unit, category_id: nextCatId, category_title: nextCatTitle }
            : x
        )
      );

      showToast("Сохранено");
    } catch (e: any) {
      setHint(e?.message ?? "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const onAdd = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;

    const counts = Math.max(0, Number(onlyDigits(newCount) || "0"));
    const catIdToSend = categoryId ? categoryId : null;
    const catTitleLocal = categoryId ? (categoryTitleById.get(categoryId) ?? null) : null;

    setSaving(true);
    setHint(null);

    try {
      const res = await postJson<{
        ok: boolean;
        prep: {
          id: string;
          title: string;
          counts: number;
          unit?: Unit | null;
          category_id: string | null;
          category_title?: string | null;
          user_id: number;
          created_at?: string;
        };
      }>("/api/recipes/newPreps", {
        title,
        counts,
        unit,
        category_id: catIdToSend,
      });

      const p = res?.prep;
      if (!p?.id) throw new Error("Bad response");

      setItems((prev) => [
        {
          id: String(p.id),
          title: String(p.title ?? title),
          counts: Number(p.counts ?? counts),
          unit:
            (p as any)?.unit === "pieces" || (p as any)?.unit === "portions"
              ? (p as any).unit
              : unit,
          category_title: (p as any)?.category_title != null ? String((p as any).category_title) : catTitleLocal,
        },
        ...prev,
      ]);

      showToast("Добавлено");

      requestAnimationFrame(() => titleInputRef.current?.focus());
    } catch (e: any) {
      setHint(e?.message ?? "Не удалось добавить заготовку");
    } finally {
      setSaving(false);
    }
  };

  const inc = async (id: string) => {
    if (updatingIds.has(id)) return;

    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, counts: (x.counts ?? 0) + 1 } : x)));
    setUpdatingIds((s) => new Set(s).add(id));
    setHint(null);

    try {
      const res = await updateCounts(id, +1);
      const next = Number(res?.prep?.counts);
      if (!Number.isFinite(next)) throw new Error("Bad response");
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, counts: next } : x)));
    } catch (e: any) {
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, counts: Math.max(0, (x.counts ?? 0) - 1) } : x)));
      setHint(e?.message ?? "Не удалось обновить количество");
    } finally {
      setUpdatingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const dec = async (id: string) => {
    if (updatingIds.has(id)) return;

    const cur = items.find((x) => x.id === id)?.counts ?? 0;
    if (cur <= 0) return;

    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, counts: Math.max(0, (x.counts ?? 0) - 1) } : x)));
    setUpdatingIds((s) => new Set(s).add(id));
    setHint(null);

    try {
      const res = await updateCounts(id, -1);
      const next = Number(res?.prep?.counts);
      if (!Number.isFinite(next)) throw new Error("Bad response");
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, counts: next } : x)));
    } catch (e: any) {
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, counts: (x.counts ?? 0) + 1 } : x)));
      setHint(e?.message ?? "Не удалось обновить количество");
    } finally {
      setUpdatingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const onDelete = async (id: string) => {
    const ok = window.confirm("Удалить?");
    if (!ok) return;

    setHint(null);

    const prevItems = items;
    setItems((prev) => prev.filter((x) => x.id !== id));

    try {
      const res = await deletePrep(id);
      if (!res?.ok) throw new Error("Bad response");
      showToast("Удалено");
    } catch (e: any) {
      setItems(prevItems);
      setHint(e?.message ?? "Не удалось удалить");
    }
  };

  const Counter = ({ p }: { p: Prep }) => {
    const busy = updatingIds.has(p.id);

    return (
      <div className={styles.counter}>
        <button
          type="button"
          className={`${styles.recipeChip} ${styles.counterBtn}`}
          onClick={() => dec(p.id)}
          disabled={busy}
        >
          -
        </button>

        <span className={`${styles.recipeChip} ${styles.counterValue}`}>
          {p.counts} {unitLabel(p.unit)}
        </span>

        <button
          type="button"
          className={`${styles.recipeChip} ${styles.counterBtn}`}
          onClick={() => inc(p.id)}
          disabled={busy}
        >
          +
        </button>
      </div>
    );
  };

  const PrepListItem = ({ p }: { p: Prep }) => {
    const cat = (p.category_title ?? "").trim();

    return (
      <div className={styles.listItem}>
        <div className={styles.listItemHeader}>
          <div className={styles.listItemMain}>
            <div className={styles.titleText}>{p.title || "Без названия"}</div>

            {cat ? (
              <div className={styles.metaRow}>
                <span className={styles.chip}>{cat}</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.EditBtn}
            onClick={() => openEdit(p)}
            aria-label="Редактировать"
            title="Редактировать"
          >
            <IconEdit size={14} />
          </button>
          <button
            type="button"
            className={styles.trashBtn}
            onClick={() => onDelete(p.id)}
            aria-label="Удалить"
            title="Удалить"
          >
            <IconTrash size={15} />
          </button>
          
          
        </div>

        <div className={styles.counterRow}>
          <Counter p={p} />
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <PageFade>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Заготовки</h1>
        </div>

        <button
          type="button"
          className={styles.bigCta}
          onClick={() => {
            if (showForm && !isEditing) {
              closeForm(); // вторым кликом закрыть
              return;
            }
            focusAddForm();
          }}
        >
          <div className={styles.bigCtaRow}>
            <span className={styles.bigCtaText}>Добавить заготовку</span>
            <span className={styles.bigCtaIcon}>
              <IconArrow size={25} />
            </span>
          </div>
        </button>

        {/* ===== ADD FORM ===== */}
        <div
          ref={formWrapRef}
          className={`${styles.addFormWrap} ${showForm ? styles.addFormWrapOpen : ""}`}
        >
          <section className={`${styles.card} ${styles.addFormCard}`}>
            {hint ? <div className={styles.formHint}>{hint}</div> : null}

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <div className={styles.inputRow}>
                  <input
                    ref={titleInputRef}
                    className={`${styles.input} ${styles.inputGrow}`}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Название заготовки"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck
                    inputMode="text"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!canAdd) return;
                        submitForm();
                      }
                    }}
                  />

                <button
                  type="button"
                  className={`${styles.btnCircle} ${!canAdd ? styles.btnDisabled : ""}`}
                  onClick={submitForm}
                  disabled={!canAdd}
                  title={saving ? "Сохраняю..." : isEditing ? "Сохранить" : "Добавить"}
                >
                  {isEditing ? "✓" : (
                    <IconPlus size={18} className={saving ? styles.iconSpin : undefined} />
                  )}
                </button>
                </div>
              </div>

              <div className={styles.field}>
                <div className={styles.unitRow} role="radiogroup" aria-label="Единицы учета">
                  <div className={styles.unitCatWrap} ref={catWrapRef}>
                    <button
                      type="button"
                      className={`${styles.chipBtn} ${styles.unitChip} ${
                        categoryId ? styles.chipBtnActive : ""
                      } ${styles.unitCatBtn}`}
                      onClick={() => {
                        if (catLoading) return;
                        setCatOpen((v) => !v);
                      }}
                      aria-label="Категория"
                      aria-haspopup="listbox"
                      aria-expanded={catOpen}
                      disabled={catLoading}
                    >
                      <span className={styles.unitCatBtnText}>
                        {catLoading ? "Загружаю..." : selectedCatTitle || "Категория"}
                      </span>
                    </button>

                    {catOpen ? (
                      <div className={styles.unitCatMenu} role="listbox" aria-label="Категории">
                        <button
                          type="button"
                          className={`${styles.unitCatItem} ${!categoryId ? styles.unitCatItemActive : ""}`}
                          onClick={() => {
                            setCategoryId("");
                            setCatOpen(false);
                          }}
                        >
                          <span className={styles.unitCatCheck}>{!categoryId ? "✓" : ""}</span>
                          <span className={styles.unitCatItemText}>Без категории</span>
                        </button>

                        {categories.map((c) => {
                          const active = categoryId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`${styles.unitCatItem} ${active ? styles.unitCatItemActive : ""}`}
                              onClick={() => {
                                setCategoryId(c.id);
                                setCatOpen(false);
                              }}
                            >
                              <span className={styles.unitCatCheck}>{active ? "✓" : ""}</span>
                              <span className={styles.unitCatItemText}>{c.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <input
                    className={`${styles.input} ${styles.unitInput}`}
                    placeholder="Сколько"
                    value={newCount}
                    onChange={(e) => setNewCount(onlyDigits(e.target.value))}
                    inputMode="numeric"
                  />

                  <button
                    type="button"
                    className={`${styles.chipBtn} ${styles.unitChip} ${
                      unit === "portions" ? styles.chipBtnActive : ""
                    }`}
                    onClick={() => setUnit("portions")}
                  >
                    Порции
                  </button>

                  <button
                    type="button"
                    className={`${styles.chipBtn} ${styles.unitChip} ${
                      unit === "pieces" ? styles.chipBtnActive : ""
                    }`}
                    onClick={() => setUnit("pieces")}
                  >
                    Штуки
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>


        {loading ? <div className={styles.recipesState}>Загружаю…</div> : null}

        <section className={styles.listWrap} style={{ marginTop: 14 }}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>В наличии</div>
            <div className={styles.muted}>{inStock.length} шт.</div>
          </div>

          {!loading && inStock.length === 0 ? (
            <div className={styles.empty}>Пока пусто. Добавь первую заготовку выше.</div>
          ) : (
            <div className={styles.list}>
              {inStock.map((p) => (
                <PrepListItem key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>

        <section className={styles.listWrap} style={{ marginTop: 18 }}>
          <div className={styles.listHeader}>
            <div className={styles.sectionTitle}>Закончились</div>
            <div className={styles.muted}>{outOfStock.length} шт.</div>
          </div>

          {!loading && outOfStock.length === 0 ? (
            <div className={styles.empty}>Тут пока никого.</div>
          ) : (
            <div className={styles.list}>
              {outOfStock.map((p) => (
                <PrepListItem key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>

        {toast ? <div className={styles.toast}>{toast}</div> : null}
      </PageFade>

      <RecMenu />
    </div>
  );
}