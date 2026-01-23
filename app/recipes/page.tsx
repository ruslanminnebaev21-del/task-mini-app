"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconArrow, IconTrash, IconPlus } from "@/app/components/icons";
import { useRouter } from "next/navigation";

type Category = { id: string; title: string; order_index?: number | null };

type CategoriesApi = { categories: Category[] };
type RecipesIdsApi = { recipes: { id: number }[] };

type CurRecipeFull = {
  recipe: { id: number };
  categories: { id: string; title: string }[];
};

type CategoryRow = {
  id: string; // real id or "__none__"
  title: string;
  count: number;
};

type CatsStatsApi = {
  ok: boolean;
  categories: Category[];
  countsByCatId: Record<string, number>;
  noneCount: number;
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? "Request failed");
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
  if (!r.ok) throw new Error(j?.error ?? "Request failed");
  return j as T;
}

export default function RecipesMainPage() {
  const router = useRouter();

  const [editMode, setEditMode] = useState(false);

  const [catsLoading, setCatsLoading] = useState(true);
  const [catsErr, setCatsErr] = useState<string | null>(null);

  const [allCats, setAllCats] = useState<Category[]>([]);
  const allCatsRef = useRef<Category[]>([]);
  useEffect(() => {
    allCatsRef.current = allCats;
  }, [allCats]);

  const [countsByCatId, setCountsByCatId] = useState<Record<string, number>>({});
  const [noneCount, setNoneCount] = useState(0);

  const [newCatTitle, setNewCatTitle] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ===== DRAG STATE =====
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragFromIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragHandleElRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setCatsLoading(true);
        setCatsErr(null);

        // ✅ 1 запрос вместо N запросов
        const stats = await fetchJson<CatsStatsApi>("/api/recipes/categories/stats");
        if (!alive) return;

        setAllCats(Array.isArray(stats?.categories) ? stats.categories : []);
        setCountsByCatId(stats?.countsByCatId ?? {});
        setNoneCount(Number(stats?.noneCount ?? 0));
      } catch (e: any) {
        if (!alive) return;
        setCatsErr(e?.message ?? "Ошибка загрузки категорий");
      } finally {
        if (!alive) return;
        setCatsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const rows: CategoryRow[] = useMemo(() => {
    const base = allCats.map((c) => ({
      id: c.id,
      title: c.title,
      count: countsByCatId[String(c.id)] ?? 0,
    }));

    base.push({
      id: "__none__",
      title: "Без категорий",
      count: noneCount,
    });

    return base;
  }, [allCats, countsByCatId, noneCount]);

  const onToggleEdit = () => {
    setEditMode((v) => !v);

    setDragId(null);
    setOverId(null);
    dragFromIndexRef.current = null;
  };

  const onAddCategory = async () => {
    const t = newCatTitle.trim();
    if (!t || addingCat) return;

    try {
      setAddingCat(true);
      setCatsErr(null);

      const res = await postJson<{ ok: boolean; category: Category }>(
        "/api/recipes/categories/create",
        { title: t }
      );

      const created = res?.category;
      if (!created?.id) throw new Error("Bad response");

      setAllCats((prev) => [...prev, created]);
      setNewCatTitle("");

      setToast("Категория добавлена");
      setTimeout(() => setToast(null), 2000);
    } catch (e: any) {
      setCatsErr(e?.message ?? "Не удалось добавить категорию");
    } finally {
      setAddingCat(false);
    }
  };

  const onDeleteCategory = async (id: string, title: string) => {
    if (!confirm(`Удалить категорию "${title}"?`)) return;

    try {
      const r = await fetch("/api/recipes/categories/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(j?.error ?? "Не удалось удалить категорию");
        return;
      }

      // локально убираем категорию из списка
      setAllCats((prev) => prev.filter((c) => String(c.id) !== String(id)));

      // убираем счётчик
      setCountsByCatId((prev) => {
        const next = { ...prev };
        delete next[String(id)];
        return next;
      });
    } catch (e: any) {
      alert(e?.message ?? "Ошибка удаления");
    }
  };

  // ===== DRAG HELPERS (двигаем только реальные категории, без "__none__") =====
  function moveCatInAllCats(fromIndex: number, toIndex: number) {
    setAllCats((prev) => {
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || toIndex < 0) return prev;
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;

      const next = [...prev];
      const [picked] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, picked);
      return next;
    });
  }

  function onDragStartCat(catId: string) {
    if (!editMode) return;
    if (catId === "__none__") return;

    const from = allCats.findIndex((x) => String(x.id) === String(catId));
    dragFromIndexRef.current = from >= 0 ? from : null;

    setDragId(catId);
    setOverId(null);
  }

  function onDragOverCat(catId: string) {
    if (!editMode) return;
    if (!dragId) return;
    if (catId === "__none__") return;
    if (catId === dragId) return;

    setOverId(catId);
  }

  function onDropCat(catId: string) {
    if (!editMode) return;
    if (!dragId) return;
    if (catId === "__none__") return;

    const from = dragFromIndexRef.current;
    const to = allCats.findIndex((x) => String(x.id) === String(catId));

    if (from === null || from < 0 || to < 0) {
      setDragId(null);
      setOverId(null);
      dragFromIndexRef.current = null;
      return;
    }

    moveCatInAllCats(from, to);

    setDragId(null);
    setOverId(null);
    dragFromIndexRef.current = null;
  }

  function onDragEndAny() {
    setDragId(null);
    setOverId(null);
    dragFromIndexRef.current = null;
  }

  function tgDisableSwipes() {
    try {
      // @ts-ignore
      window?.Telegram?.WebApp?.disableVerticalSwipes?.();
    } catch {}
  }

  function tgEnableSwipes() {
    try {
      // @ts-ignore
      window?.Telegram?.WebApp?.enableVerticalSwipes?.();
    } catch {}
  }

  async function saveCatsOrder(nextCats: Category[]) {
    try {
      const order = nextCats.map((c, idx) => ({
        id: String(c.id),
        order_index: idx,
      }));

      const r = await fetch("/api/recipes/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.warn("reorder failed", j?.error ?? "unknown");
      }
    } catch (e) {
      console.warn("reorder failed", e);
    }
  }

  useEffect(() => {
    if (!editMode) return;
    if (!dragId) return;

    function getRowElFromPoint(x: number, y: number) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return null;
      return el.closest("[data-catid]") as HTMLElement | null;
    }

    function onMove(e: PointerEvent) {
      e.preventDefault();
      const rowEl = getRowElFromPoint(e.clientX, e.clientY);
      const over = rowEl?.getAttribute("data-catid") ?? null;

      if (!over || over === "__none__" || over === dragId) return;
      setOverId(over);

      const cur = allCatsRef.current;
      const from = cur.findIndex((x) => String(x.id) === String(dragId));
      const to = cur.findIndex((x) => String(x.id) === String(over));
      if (from < 0 || to < 0 || from === to) return;

      moveCatInAllCats(from, to);
    }

    function onUp() {
      try {
        if (dragHandleElRef.current && pointerIdRef.current !== null) {
          dragHandleElRef.current.releasePointerCapture(pointerIdRef.current);
        }
      } catch {}

      dragHandleElRef.current = null;
      pointerIdRef.current = null;

      const latest = allCatsRef.current;
      saveCatsOrder(latest);
      tgEnableSwipes();

      setDragId(null);
      setOverId(null);
      dragFromIndexRef.current = null;
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editMode, dragId]);

  return (
    <div className={styles.container}>
      <PageFade>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Главная</h1>
        </div>

        <button
          type="button"
          className={styles.bigCta}
          onClick={() => router.push("/recipes/newRecipe")}
        >
          <div className={styles.bigCtaRow}>
            <span className={styles.bigCtaText}>Новый рецепт</span>
            <span className={styles.bigCtaIcon}>
              <IconArrow size={25} />
            </span>
          </div>
        </button>

        {/* ===== CATEGORIES BLOCK ===== */}
        <div className={styles.categoriesWrap}>
          <div className={styles.categoriesTopRow}>
            <div className={styles.sectionTitle}>Категории</div>

            <button
              type="button"
              className={styles.categoriesEditBtn}
              onClick={onToggleEdit}
            >
              {editMode ? "Готово" : "Править"}
            </button>
          </div>

          <div className={styles.categoriesCard}>
            {editMode && (
              <div className={styles.categoryAddRow}>
                <input
                  className={`${styles.input} ${styles.inputGrow}`}
                  placeholder="Новая категория"
                  value={newCatTitle}
                  onChange={(e) => setNewCatTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAddCategory();
                  }}
                />
                <button
                  type="button"
                  className={styles.btnCircle}
                  onClick={onAddCategory}
                  aria-label="Добавить категорию"
                  title="Добавить"
                >
                  <IconPlus
                    size={18}
                    className={addingCat ? styles.iconSpin : undefined}
                  />
                </button>
              </div>
            )}

            {catsLoading && <div className={styles.recipesState}>Загружаю…</div>}
            {catsErr && <div className={styles.recipesError}>{catsErr}</div>}

            {!catsLoading && !catsErr && (
              <div className={styles.categoriesList} ref={listRef}>
                {rows.map((c, i) => {
                  const isNone = c.id === "__none__";
                  const canDelete = editMode && !isNone;

                  const isDragging = editMode && dragId === c.id;
                  const isOver = editMode && overId === c.id;

                  const rowClassName = [
                    styles.categoryRow,
                    isDragging ? styles.categoryRowDragging : "",
                    isOver ? styles.categoryRowOver : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div key={c.id}>
                      <div
                        className={rowClassName}
                        data-catid={c.id}
                        onClick={() => {
                          if (editMode) return;

                          const cat = isNone ? "__none__" : c.id;
                          const catTitle = c.title;

                          router.push(
                            `/recipes/allRecipes?cat=${encodeURIComponent(
                              cat
                            )}&catTitle=${encodeURIComponent(catTitle)}`
                          );
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {/* LEFT */}
                        <div className={styles.categoryLeft}>
                          {editMode && !isNone ? (
                            <div
                              className={styles.dragHandle}
                              title="Перетащить"
                              aria-label="Перетащить"
                              onMouseDown={(e) => e.stopPropagation()}
                              onPointerDown={(e) => {
                                if (!editMode || isNone) return;
                                tgDisableSwipes();

                                e.preventDefault();
                                e.stopPropagation();

                                pointerIdRef.current = e.pointerId;
                                (e.currentTarget as HTMLElement).setPointerCapture(
                                  e.pointerId
                                );
                                dragHandleElRef.current = e.currentTarget as HTMLElement;
                                setDragId(c.id);
                                setOverId(c.id);

                                const from = allCats.findIndex(
                                  (x) => String(x.id) === String(c.id)
                                );
                                dragFromIndexRef.current = from >= 0 ? from : null;
                              }}
                            >
                              ≡
                            </div>
                          ) : null}

                          <div className={styles.titleText}>{c.title}</div>
                        </div>

                        {/* RIGHT */}
                        <div className={styles.categoryRight}>
                          <div className={styles.categoryCount}>{c.count}</div>

                          {!editMode && (
                            <div className={styles.categoryArrow}>
                              <IconArrow size={18} />
                            </div>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              className={styles.categoryTrashBtn}
                              aria-label={`Удалить ${c.title}`}
                              title="Удалить"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCategory(c.id, c.title);
                              }}
                            >
                              <IconTrash size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      {i !== rows.length - 1 && (
                        <div className={styles.categoryDivider} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}
      </PageFade>
    </div>
  );
}