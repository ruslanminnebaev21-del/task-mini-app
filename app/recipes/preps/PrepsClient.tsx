// app/recipes/preps/page.tsx


"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "../recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconArrow, IconPlus, IconTrash, IconEdit } from "@/app/components/icons";
import RecMenu from "@/app/components/RecMenu/RecMenu";

type Unit = "portions" | "pieces";

type PrepCategoryRef = { id: string; title: string };

type Prep = {
  id: string;
  title: string;
  counts: number;
  unit?: Unit | null;

  // новое
  categories?: PrepCategoryRef[];

  // можно оставить для совместимости (пока где-то используется)
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
  const [categoryIds, setCategoryIds] = useState<string[]>([]); // [] = без категорий

  const [catOpen, setCatOpen] = useState(false);
  const catWrapRef = useRef<HTMLDivElement | null>(null);

  // ===== ADD/EDIT PREP FORM =====
  const [newTitle, setNewTitle] = useState("");
  const [unit, setUnit] = useState<Unit>("portions");
  const [newCount, setNewCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const formWrapRef = useRef<HTMLDivElement | null>(null);

  function scrollToForm(offset = 80) {
    const el = formWrapRef.current;
    if (!el) return;

    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCatId = (searchParams.get("cat") ?? "").trim(); // "" = все

  const filteredItems = useMemo(() => {
    if (!activeCatId) return items;
    return items.filter((x) => (x.categories ?? []).some((c) => String(c.id) === activeCatId));
  }, [items, activeCatId]);

  const inStock = useMemo(
    () => filteredItems.filter((x) => (x.counts ?? 0) > 0).slice().sort(sortByTitle),
    [filteredItems]
  );
  const outOfStock = useMemo(
    () => filteredItems.filter((x) => (x.counts ?? 0) <= 0).slice().sort(sortByTitle),
    [filteredItems]
  );

  const canAdd = useMemo(() => newTitle.trim().length > 0 && !saving, [newTitle, saving]);

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const categoryTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(String(c.id), String(c.title ?? "").trim());
    return m;
  }, [categories]);

  const selectedCatTitle = useMemo(() => {
    const n = categoryIds.length;
    if (n === 0) return "";
    if (n === 1) return categoryTitleById.get(categoryIds[0]) ?? "";

    // 2+ категорий
    return `${n} кат`;
  }, [categoryIds, categoryTitleById]);

  type CatModalMode = "add" | "edit";

  const [catModalMode, setCatModalMode] = useState<CatModalMode>("add");
  const [catEdits, setCatEdits] = useState<Record<string, string>>({});  

  // ===== ADD CATEGORY MODAL =====
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catTitle, setCatTitle] = useState("");
  const [catSaving2, setCatSaving2] = useState(false);
  const [catSavingId, setCatSavingId] = useState<string | null>(null);
  const [catHint2, setCatHint2] = useState<string | null>(null);
  const catInputRef = useRef<HTMLInputElement | null>(null);

  const openCatModal = () => {
    setCatModalMode("add");
    setCatHint2(null);
    setCatTitle("");
    setCatModalOpen(true);
    requestAnimationFrame(() => catInputRef.current?.focus());
  };
  const openCatEditModal = () => {
    setCatModalMode("edit");
    setCatHint2(null);
    setCatTitle(""); // в edit не нужен, но пусть очищается
    setCatEdits(() => {
      const m: Record<string, string> = {};
      for (const c of categories) m[String(c.id)] = String(c.title ?? "");
      return m;
    });
    setCatModalOpen(true);
    requestAnimationFrame(() => {
      // фокус на первый инпут списка (если найдется)
      const first = document.querySelector<HTMLInputElement>("[data-cat-edit='1']");
      first?.focus();
    });
  };

  const closeCatModal = () => {
    if (catSaving2) return;
    setCatModalOpen(false);
    setCatHint2(null);
    setCatTitle("");
  };

  async function addCategoryFromModal() {
    const title = catTitle.trim();
    if (!title || catSaving2) return;

    setCatSaving2(true);
    setCatHint2(null);

    try {
      const res = await postJson<{
        ok: boolean;
        category: { id: string; title: string; created_at?: string };
      }>("/api/recipes/prepCategories/addPrepCategories", { title });

      const c = res?.category;
      if (!c?.id) throw new Error("Bad response");

      setCategories((prev) => {
        const exists = prev.some((x) => String(x.id) === String(c.id));
        if (exists) return prev;
        return [{ id: String(c.id), title: String(c.title ?? title).trim() }, ...prev].sort((a, b) =>
          a.title.localeCompare(b.title, "ru", { sensitivity: "base" })
        );
      });

      showToast("Категория добавлена");
      setCatModalOpen(false);
      setCatTitle("");
    } catch (e: any) {
      // title_exists приходит 409 из твоего роута
      const msg = String(e?.message ?? "Не удалось добавить категорию");
      setCatHint2(msg === "title_exists" ? "Такая категория уже есть" : msg);
    } finally {
      setCatSaving2(false);
    }
  }

async function saveCategoryTitle(id: string) {
  const title = (catEdits[id] ?? "").trim();
  if (!title || catSaving2) return;

  setCatSavingId(id);
  setCatHint2(null);

  try {
    const res = await postJson<{
      ok: boolean;
      category: { id: string; title: string };
    }>("/api/recipes/prepCategories/editPrepCategories", {
      id,
      title,
    });

    const c = res.category;

    setCategories((prev) =>
      prev.map((x) =>
        x.id === c.id ? { ...x, title: c.title } : x
      )
    );

    setItems((prev) =>
      prev.map((p) =>
        p.category_id === c.id
          ? { ...p, category_title: c.title }
          : p
      )
    );

    showToast("Категория сохранена");
  } catch (e: any) {
    setCatHint2(e?.message ?? "Ошибка сохранения");
  } finally {
      setCatSavingId(null);

  }
}
async function deleteCategory(id: string) {
  if (catSaving2) return;

  const ok = window.confirm("Удалить категорию?");
  if (!ok) return;

  setCatSavingId(id);
  setCatHint2(null);

  try {
    await postJson<{ ok: boolean }>("/api/recipes/prepCategories/delPrepCategories", {
      id,
    });

    // убираем категорию из списка
    setCategories((prev) => prev.filter((c) => c.id !== id));

    // убираем категорию из заготовок
    setItems((prev) =>
      prev.map((p) => ({
        ...p,
        categories: (p.categories ?? []).filter((c) => c.id !== id),
      }))
    );

    // если категория была выбрана в форме — убираем
    setCategoryIds((prev) => prev.filter((cid) => cid !== id));

    showToast("Категория удалена");
  } catch (e: any) {
    setCatHint2(e?.message ?? "Ошибка удаления");
  } finally {
    setCatSavingId(null);
  }
}

  useEffect(() => {
    if (!catModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCatModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catModalOpen, catSaving2]);

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
          fetchJson<{ ok: boolean; categories: any[] }>("/api/recipes/prepCategories/listPrepCategories").catch(
            () => ({ ok: false, categories: [] })
          ),
        ]);

        if (!alive) return;

        const list: Prep[] = (prepsRes?.preps ?? []).map((p: any) => ({
          id: String(p.id),
          title: String(p.title ?? ""),
          counts: Number(p.counts ?? 0),
          unit: p.unit === "pieces" || p.unit === "portions" ? p.unit : null,

          categories: Array.isArray(p.categories)
            ? p.categories
                .map((c: any) => ({
                  id: String(c.id),
                  title: String(c.title ?? "").trim(),
                }))
                .filter((c: any) => c.id && c.title)
            : [],

          // на всякий (если где-то ещё используешь старые поля)
          category_id: p.category_id != null ? String(p.category_id) : null,
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

    // режим добавления
    setIsEditing(false);
    setEditId(null);

    // очистка формы
    setNewTitle("");
    setNewCount("");
    setUnit("portions");
    setCategoryIds([]);

    // закрыть дропдаун категорий
    setCatOpen(false);

    // открыть форму + фокус
    setShowForm(true);
    requestAnimationFrame(() => {
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
    setCategoryIds([]);
  }

  async function submitForm() {
    if (saving) return;

    const title = newTitle.trim();
    if (!title) return;

    if (isEditing) {
      await onSaveEdit();
      closeForm();
    } else {
      await onAdd();
      closeForm();
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
    setCategoryIds((p.categories ?? []).map((c) => String(c.id)));
    setCatOpen(false);

    requestAnimationFrame(() => {
      scrollToForm(80); // 50-100px, я поставил 80
      titleInputRef.current?.focus();
    });
  }

  async function onSaveEdit() {
    const id = editId;
    const title = newTitle.trim();
    if (!id || !title || saving) return;

    const counts = Math.max(0, Number(onlyDigits(newCount) || "0"));
    const nextCatIds = categoryIds.slice();
    

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
        category_ids: nextCatIds,
      });

      const p = res?.prep;
      if (!p?.id) throw new Error("Bad response");

      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                title,
                counts,
                unit,
                categories: nextCatIds.map((cid) => ({ id: cid, title: categoryTitleById.get(cid) ?? "" })).filter((c) => c.title),
              }
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
    const catIdsToSend = categoryIds.slice();
    

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
        category_ids: catIdsToSend,
      });

      const p = res?.prep;
      if (!p?.id) throw new Error("Bad response");

      setItems((prev) => [
        {
          id: String(p.id),
          title: String(p.title ?? title),
          counts: Number(p.counts ?? counts),
          unit: (p as any)?.unit === "pieces" || (p as any)?.unit === "portions" ? (p as any).unit : unit,

          categories: Array.isArray((p as any)?.categories)
            ? (p as any).categories.map((c: any) => ({ id: String(c.id), title: String(c.title ?? "").trim() }))
            : catIdsToSend.map((id) => ({ id, title: categoryTitleById.get(id) ?? "" })).filter((c) => c.title),

          // совместимость
          category_id: (p as any)?.category_id != null ? String((p as any).category_id) : null,
          category_title: (p as any)?.category_title != null ? String((p as any).category_title) : null,
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
      setItems((prev) =>
        prev.map((x) => (x.id === id ? { ...x, counts: Math.max(0, (x.counts ?? 0) - 1) } : x))
      );
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

    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, counts: Math.max(0, (x.counts ?? 0) - 1) } : x))
    );
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
    const cats = (p.categories ?? []).filter((c) => (c.title ?? "").trim());

    return (
      <div className={styles.listItem}>
        <div className={styles.listItemHeader}>
          <div className={styles.listItemMain}>
            <div className={styles.titleText}>{p.title || "Без названия"}</div>

            {cats.length ? (
              <div className={styles.metaRow}>
                {cats.map((c) => (
                  <span key={c.id} className={styles.chip}>{c.title}</span>
                ))}
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
              closeForm();
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

        {/* ===== TABS ===== */}
        <nav className={styles.tabWrap} aria-label="Категории заготовок">
          {/* + всегда */}
          <button
            type="button"
            className={styles.tabBadgeIcon}
            title="Добавить категорию"
            onClick={openCatModal}
          >
            <IconPlus size={12} />
          </button>

          {/* ✎ только если есть категории */}
          {categories.length > 0 ? (
            <button
              type="button"
              className={styles.tabBadgeIcon}
              title="Редактировать категорию"
              onClick={openCatEditModal}
            >
              <IconEdit size={12} />
            </button>
          ) : null}

          {/* Все всегда */}
          <Link
            href={pathname}
            className={`${styles.tabBadge} ${!activeCatId ? styles.tabBadgeActive : ""}`}
            title="Все"
          >
            Все
          </Link>

          {/* Категории только если есть */}
          {categories.length > 0
            ? categories.map((c) => {
                const active = activeCatId === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`${pathname}?cat=${encodeURIComponent(c.id)}`}
                    className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}
                    title={c.title}
                  >
                    {c.title}
                  </Link>
                );
              })
            : null}
        </nav>

        {/* ===== ADD/EDIT PREP FORM ===== */}
        <div ref={formWrapRef} className={`${styles.addFormWrap} ${showForm ? styles.addFormWrapOpen : ""}`}>
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
                    {isEditing ? "✓" : <IconPlus size={18} className={saving ? styles.iconSpin : undefined} />}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <div className={styles.unitRow} role="radiogroup" aria-label="Единицы учета">
                  <div className={styles.unitCatWrap} ref={catWrapRef}>
                    <button
                      type="button"
                      className={`${styles.chipBtn} ${styles.unitChip} ${
                        categoryIds.length ? styles.chipBtnActive : ""
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
                      <div
                        className={styles.unitCatMenu}
                        role="listbox"
                        aria-label="Категории"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={`${styles.unitCatItem} ${categoryIds.length === 0 ? styles.unitCatItemActive : ""}`}
                          onClick={() => {
                            setCategoryIds([]);
                            // меню не закрываем
                          }}
                        >
                          <span className={styles.unitCatCheck}>{categoryIds.length === 0 ? "✓" : ""}</span>
                          <span className={styles.unitCatItemText}>Без категорий</span>
                        </button>

                        {categories.map((c) => {
                          const active = categoryIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`${styles.unitCatItem} ${active ? styles.unitCatItemActive : ""}`}
                              onClick={() => {
                                setCategoryIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                                // меню не закрываем
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
                    className={`${styles.chipBtn} ${styles.unitChip} ${unit === "portions" ? styles.chipBtnActive : ""}`}
                    onClick={() => setUnit("portions")}
                  >
                    Порции
                  </button>

                  <button
                    type="button"
                    className={`${styles.chipBtn} ${styles.unitChip} ${unit === "pieces" ? styles.chipBtnActive : ""}`}
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

        {/* ===== MODAL: ADD CATEGORY ===== */}
        {catModalOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Добавить категорию"
            className={styles.modalOverlay}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeCatModal();
            }}
          >
            <div className={`${styles.card} ${styles.modalCard}`}>
              <div className={styles.modalHead}>
              <div className={styles.cardTitle}>
                {catModalMode === "add" ? "Новая категория" : "Редактирование категорий"}
              </div>

                <button
                  type="button"
                  className={styles.sheetIconBtn}
                  style={{fontSize: "13px"}}
                  onClick={closeCatModal}
                  disabled={catSaving2}
                  title="Закрыть"
                >
                  ✕
                </button>
              </div>

              {catHint2 ? <div className={`${styles.formHint} ${styles.modalHint}`}>{catHint2}</div> : null}

              {catModalMode === "add" ? (
                <div className={styles.modalRow}>
                  <input
                    ref={catInputRef}
                    className={`${styles.input} ${styles.modalInput}`}
                    value={catTitle}
                    onChange={(e) => setCatTitle(e.target.value)}
                    placeholder="Название категории"
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    spellCheck
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategoryFromModal();
                      }
                    }}
                  />

                  <button
                    type="button"
                    className={`${styles.btnCircle} ${catSaving2 || !catTitle.trim() ? styles.btnDisabled : ""}`}
                    onClick={addCategoryFromModal}
                    disabled={catSaving2 || !catTitle.trim()}
                    title={catSaving2 ? "Добавляю..." : "Добавить"}
                  >
                    <IconPlus size={18} className={catSaving2 ? styles.iconSpin : undefined} />
                  </button>
                </div>
              ) : (
                <div className={styles.modalEditList}>
                  {categories.map((c, idx) => {
                    const id = String(c.id);
                    const value = catEdits[id] ?? "";

                    return (
                      <div key={id} className={styles.modalRow}>
                        <button
                          type="button"
                          className={styles.trashBtn}
                          onClick={() => deleteCategory(id)}
                          disabled={catSavingId === id}
                          title="Удалить категорию"
                        >
                          <IconTrash size={15} />
                        </button>
                        <input
                          data-cat-edit={idx === 0 ? "1" : "0"}
                          className={`${styles.input} ${styles.modalInput}`}
                          value={value}
                          onChange={(e) =>
                            setCatEdits((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          placeholder="Название категории"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveCategoryTitle(id);
                            }
                          }}
                        />

                        <button
                          type="button"
                          className={`${styles.btnCircle} ${
                            !value.trim() || catSavingId ? styles.btnDisabled : ""
                          }`}
                          onClick={() => saveCategoryTitle(id)}
                          disabled={!value.trim() || catSavingId !== null}
                          title="Сохранить"
                        >
                          <IconPlus
                            size={18}
                            className={catSavingId === id ? styles.iconSpin : undefined}
                          />
                        </button>
                     </div>
                    );
                  })}
                </div>
              )}

              
            </div>
          </div>
        ) : null}       


      <RecMenu />
    </div>
  );
}