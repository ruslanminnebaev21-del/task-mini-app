// app/recipes/curRecipe/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconEdit, IconTrash } from "@/app/components/icons";


type Category = { id: string; title: string };

type Ingredient = {
  id: number;
  pos: number;
  text: string;
};

type Step = {
  id: number;
  pos: number;
  text: string;
  photo_url: string | null;
};

type RecipeFull = {
 recipe: {
    id: number;
    title: string;
    photo_url: string | null;
    prep_time_min: number | null;
    cook_time_min: number | null;
    portions: string | null;

    kcal?: number | null;
    b?: number | null;
    j?: number | null;
    u?: number | null;
  };
  categories: Category[];
  ingredients: Ingredient[];
  steps: Step[];
};

function fmtMin(min: number | null) {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}
function fmtKbyu(r?: { kcal?: number | null; b?: number | null; j?: number | null; u?: number | null } | null) {
  const kcal = r?.kcal ?? null;
  const b = r?.b ?? null;
  const j = r?.j ?? null;
  const u = r?.u ?? null;

  const hasAny = [kcal, b, j, u].some((v) => v !== null && v !== undefined);
  if (!hasAny) return "—";

  const kcalTxt = kcal !== null && kcal !== undefined ? `${kcal} ккал` : "—";
  const bTxt = b !== null && b !== undefined ? `Б${b}` : "Б —";
  const jTxt = j !== null && j !== undefined ? `Ж${j}` : "Ж —";
  const uTxt = u !== null && u !== undefined ? `У${u}` : "У —";

  return `${kcalTxt} · ${bTxt} · ${jTxt} · ${uTxt}`;
}

export default function CurRecipeClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const recipeId = sp.get("recipe_id") || sp.get("id") || sp.get("recipeId");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RecipeFull | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!recipeId) {
          setErr("Нет recipe_id в URL");
          setData(null);
          return;
        }

        const r = await fetch(
          `/api/recipes/curRecipe?view=full&recipe_id=${encodeURIComponent(recipeId)}`,
          { method: "GET", cache: "no-store" }
        );

        const j = await r.json();
        if (!alive) return;

        if (!r.ok) {
          setErr(j?.error ?? "Не удалось загрузить рецепт");
          setData(null);
          return;
        }

        setData(j as RecipeFull);
      } catch {
        if (!alive) return;
        setErr("Ошибка загрузки");
        setData(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [recipeId]);

  const catTitle = useMemo(() => {
    const first = data?.categories?.[0];
    return first?.title ? String(first.title) : null;
  }, [data]);

  const onBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/recipes/allRecipes");
  };
  const onDelete = async () => {
    if (!recipeId) return;
    if (deleting) return;

    const ok = window.confirm("Удалить рецепт? Это действие нельзя отменить.");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/recipes/deleteRecipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: Number(recipeId) }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error ?? "Ошибка удаления");
        return;
      }

      router.push("/recipes/allRecipes");
    } catch (e) {
      console.log("DELETE ERROR:", e);
      alert("Ошибка удаления");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className={styles.container}>
      <PageFade>
        {loading && <div className={styles.recipesState}>Загружаю…</div>}
        {err && <div className={styles.recipesError}>{err}</div>}

        {!loading && !err && data && (
          <div className={styles.recipePage}>
            {/* TOP PHOTO */}
            <div className={styles.recipeHero}>
              {data.recipe.photo_url ? (
                <img
                  src={data.recipe.photo_url}
                  alt={data.recipe.title}
                  className={styles.recipeHeroImg}
                />
              ) : (
                <div className={styles.recipeHeroEmpty}>нет фото</div>
              )}

              <button type="button" className={styles.recipeBackBtn} onClick={onBack}>
                Назад
              </button>

              <div className={styles.recipePhotoRow}>
                <button
                  type="button"
                  className={styles.RecipeTabBadge}
                  onClick={onDelete}
                  disabled={deleting}
                  title="Удалить"
                  aria-label="Удалить"
                >
                  <span style={{ color: "#333" }}>
                    <IconTrash size={11} className={deleting ? styles.iconSpin : undefined}/>
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.RecipeTabBadge}
                  disabled={deleting}
                  onClick={() => {
                    if (!recipeId) return;
                    router.push(
                      `/recipes/newRecipe?edit=1&recipe_id=${encodeURIComponent(recipeId)}`
                    );
                  }}
                  title="Редактировать"
                  aria-label="Редактировать"
                >
                  <IconEdit size={11} />
                </button>

                {catTitle && (
                  <div className={styles.recipeHeroChip}>
                    {catTitle}
                  </div>
                )}
              </div>
            </div>

            {/* BODY */}
            <div className={styles.recipeBody}>
              <h1 className={styles.recipeH1}>{data.recipe.title || "Без названия"}</h1>

              <div className={styles.recipeTimeRow}>
                <span>Подготовка: {fmtMin(data.recipe.prep_time_min)}</span>
                <span>Готовка: {fmtMin(data.recipe.cook_time_min)}</span>
                <span>Порций: {data.recipe.portions || "—"}</span>
                <span>{fmtKbyu(data.recipe)}</span>
              </div>
              {/* INGREDIENTS */}
              <div className={styles.recipeSectionTitle}>Ингредиенты</div>
              <div className={styles.recipeCard}>
                {data.ingredients?.length ? (
                  <ul className={styles.recipeIngList}>
                    {data.ingredients.map((i) => (
                      <li key={i.id} className={styles.recipeIngItem}>
                        {i.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.recipeEmptyText}>Пока нет ингредиентов</div>
                )}
              </div>

              {/* STEPS */}
              {/*<div className={styles.recipeSectionTitle}>Шаги</div>*/}
              <div className={styles.recipeSteps}>
                {data.steps?.length ? (
                  data.steps.map((s) => (
                    <div key={s.id}>
                      <div className={styles.recipeSectionTitle}>Шаг {s.pos}</div>
                      {/*<div className={styles.recipeCard}>*/}
                        

                        {s.photo_url ? (
                          <div className={styles.recipeStepPhotoWrap}>
                            <img
                              src={s.photo_url}
                              alt={`Шаг ${s.pos}`}
                              className={styles.recipeStepPhoto}
                            />
                          </div>
                        ) : null}

                        <div className={styles.recipeStepText}>{s.text}</div>
                      {/*</div>*/}
                    </div>
                  ))
                ) : (
                  <div className={styles.recipeEmptyText}>Пока нет шагов</div>
                )}
              </div>
            </div>
          </div>
        )}
      </PageFade>
    </div>
  );
}