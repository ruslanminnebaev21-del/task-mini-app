// app/recipes/curRecipe/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";

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

export default function CurRecipeClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const recipeId = sp.get("recipe_id") || sp.get("id") || sp.get("recipeId");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RecipeFull | null>(null);

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

              {catTitle && (
                <div className={styles.recipeHeroChip}>
                  {catTitle}
                </div>
              )}
            </div>

            {/* BODY */}
            <div className={styles.recipeBody}>
              <h1 className={styles.recipeH1}>{data.recipe.title || "Без названия"}</h1>

              <div className={styles.recipeTimeRow}>
                <span >Подготовка: {fmtMin(data.recipe.prep_time_min)}</span>
                <span>Готовка: {fmtMin(data.recipe.cook_time_min)}</span>
                <span>Порций: {data.recipe.portions || "не указано"}</span>
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