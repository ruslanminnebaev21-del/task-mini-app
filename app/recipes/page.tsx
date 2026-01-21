"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconArrow, IconTrash, IconPlus } from "@/app/components/icons";
import { useRouter } from "next/navigation";

type Category = { id: string; title: string };

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

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const j = await r.json();
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

        // 1) категории
        const cats = await fetchJson<CategoriesApi>("/api/recipes/categories");
        if (!alive) return;
        setAllCats(Array.isArray(cats?.categories) ? cats.categories : []);

        // 2) рецепты -> считаем кол-во по категориям
        const idsRes = await fetchJson<RecipesIdsApi>("/api/recipes/list?view=ids");
        if (!alive) return;

        const ids = Array.isArray(idsRes?.recipes) ? idsRes.recipes.map((x) => x.id) : [];
        if (!ids.length) {
          setCountsByCatId({});
          setNoneCount(0);
          return;
        }

        const concurrency = 6;
        let idx = 0;

        const localCounts: Record<string, number> = {};
        let localNone = 0;

        async function worker() {
          while (idx < ids.length) {
            const my = ids[idx++];
            try {
              const one = await fetchJson<CurRecipeFull>(
                `/api/recipes/curRecipe?view=full&recipe_id=${encodeURIComponent(String(my))}`
              );

              const catArr = Array.isArray(one?.categories) ? one.categories : [];
              if (catArr.length === 0) {
                localNone += 1;
                continue;
              }

              catArr.forEach((c) => {
                const k = String(c.id);
                localCounts[k] = (localCounts[k] ?? 0) + 1;
              });
            } catch {
              // пропускаем
            }
          }
        }

        const pool = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
        await Promise.all(pool);

        if (!alive) return;
        setCountsByCatId(localCounts);
        setNoneCount(localNone);
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

  const onAddCategory = () => {
    const t = newCatTitle.trim();
    if (!t) return;
    alert(`Добавить категорию: ${t}\n(пока без API)`);
    setNewCatTitle("");
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

      // на всякий случай убираем счётчик
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
                />
                <button
                  type="button"
                  className={styles.btnCircle}
                  onClick={onAddCategory}
                  aria-label="Добавить категорию"
                  title="Добавить"
                >
                  <IconPlus size={18} />
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
                        // draggable={editMode && !isNone}
                        // onDragStart={(e) => {

                        //   e.dataTransfer.setData("text/plain", c.id);
                        //   e.dataTransfer.effectAllowed = "move";
                        //   onDragStartCat(c.id);
                        // }}
                        // onDragOver={(e) => {
                        //   if (!editMode || isNone) return;
                        //   e.preventDefault();
                        //   onDragOverCat(c.id);
                        // }}
                        // onDrop={(e) => {
                        //   if (!editMode || isNone) return;
                        //   e.preventDefault();

                        //   const dragged = e.dataTransfer.getData("text/plain");
                        //   if (dragged) {
                        //     // подстрахуем state
                        //     setDragId(dragged);
                        //     dragFromIndexRef.current = allCats.findIndex((x) => String(x.id) === String(dragged));
                        //   }

                        //   onDropCat(c.id);
                        // }}
                        // onDragEnd={onDragEndAny}
                        onClick={() => {
                          if (editMode) return;

                          const cat = isNone ? "__none__" : c.id;
                          const catTitle = c.title;

                          router.push(
                            `/recipes/allRecipes?cat=${encodeURIComponent(cat)}&catTitle=${encodeURIComponent(
                              catTitle
                            )}`
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

                            // захват указателя (важно для iOS/WebView)
                            pointerIdRef.current = e.pointerId;
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            dragHandleElRef.current = e.currentTarget as HTMLElement;
                            setDragId(c.id);
                            setOverId(c.id);

                            const from = allCats.findIndex((x) => String(x.id) === String(c.id));
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

                      {i !== rows.length - 1 && <div className={styles.categoryDivider} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PageFade>
    </div>
  );
}