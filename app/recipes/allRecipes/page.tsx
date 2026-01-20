"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";

type RecipeCategory = { id: string; title: string };

type RecipeMeta = {
  id: number;
  title: string;
  photo_url: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  categories?: { id: string; title: string }[];
};

function fmtMin(min: number | null) {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}

export default function AllRecipesPage() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<RecipeMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch("/api/recipes/list?view=meta", {
          method: "GET",
          cache: "no-store",
        });

        const j = await r.json();
        if (!alive) return;

        if (!r.ok) {
          setErr(j?.error ?? "Не удалось загрузить рецепты");
          setRecipes([]);
          return;
        }

        setRecipes(
          Array.isArray(j?.recipes)
            ? (j.recipes as RecipeMeta[])
            : []
        );
      } catch {
        if (!alive) return;
        setErr("Ошибка загрузки");
        setRecipes([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => recipes, [recipes]);

  return (
    <div className={styles.container}>
      <PageFade>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Все рецепты</h1>
        </div>

        {loading && <div className={styles.recipesState}>Загружаю…</div>}
        {err && <div className={styles.recipesError}>{err}</div>}

        {!loading && !err && rows.length === 0 && (
          <div className={styles.recipesState}>Пока нет рецептов</div>
        )}

        <div className={styles.recipesList}>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/recipes/${r.id}`}
              className={styles.recipeLink}
            >
            <div className={styles.recipeItem}>
              {/* IMAGE */}
              <div className={styles.recipeImgWrap}>
                {r.photo_url ? (
                  <img
                    src={r.photo_url}
                    alt={r.title}
                    className={styles.recipeImg}
                  />
                ) : (
                  <div className={styles.recipeImgEmpty}>нет фото</div>
                )}
              </div>

              {/* TEXT */}
              <div className={styles.recipeText}>
                <p className={styles.recipeTitle}>
                  {r.title || "Без названия"}
                </p>

                <div className={styles.recipeSub}>
                  <span>Подготовка: {fmtMin(r.prep_time_min)}</span>
                  <span>Готовка: {fmtMin(r.cook_time_min)}</span>
                </div>
                {(r.categories?.length ?? 0) > 0 && (
                  <div className={styles.recipeMetaRow}>
                    {(r.categories ?? []).map((c) => (
                      <span key={c.id} className={styles.recipeChip}>
                        {c.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </Link>
          ))}
        </div>
      </PageFade>
    </div>
  );
}