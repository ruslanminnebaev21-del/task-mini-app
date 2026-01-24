// app/recipes/preps/page.tsx

"use client";


import { useMemo, useState } from "react";
import styles from "../recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconArrow } from "@/app/components/icons";
import RecMenu from "@/app/components/RecMenu/RecMenu";

type Prep = {
  id: string;
  recipeTitle: string;
  portions: number; // сколько порций в наличии
};

export default function PrepsPage() {
  const [items, setItems] = useState<Prep[]>([
    { id: "1", recipeTitle: "Куриный бульон", portions: 4 },
    { id: "2", recipeTitle: "Болоньезе", portions: 2 },
    { id: "3", recipeTitle: "Сырники (заморозка)", portions: 0 },
    { id: "4", recipeTitle: "Котлеты", portions: 0 },
  ]);

  const inStock = useMemo(() => items.filter((x) => x.portions > 0), [items]);
  const outOfStock = useMemo(() => items.filter((x) => x.portions <= 0), [items]);

  const onAdd = () => {
    alert("TODO: попап добавления заготовки");
  };

  const inc = (id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, portions: x.portions + 1 } : x))
    );
  };

  const dec = (id: string) => {
    setItems((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, portions: Math.max(0, x.portions - 1) } : x
      )
    );
  };

  const Counter = ({ value, onMinus, onPlus }: { value: number; onMinus: () => void; onPlus: () => void }) => {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className={styles.recipeChip}
          onClick={onMinus}
          aria-label="Уменьшить"
          title="Минус"
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          -
        </button>

        <span className={styles.recipeChip} style={{ minWidth: 64, textAlign: "center" }}>
          {value} порц.
        </span>

        <button
          type="button"
          className={styles.recipeChip}
          onClick={onPlus}
          aria-label="Увеличить"
          title="Плюс"
          style={{ cursor: "pointer", userSelect: "none" }}
        >
          +
        </button>
      </div>
    );
  };

  const PrepCard = ({ p }: { p: Prep }) => {
    return (
      <div className={styles.recipeItem} style={{ padding: 14 }}>
        <div className={styles.recipeText} style={{ width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p className={styles.recipeTitle} style={{ margin: 0 }}>
              {p.recipeTitle || "Без названия"}
            </p>

            <Counter value={p.portions} onMinus={() => dec(p.id)} onPlus={() => inc(p.id)} />
          </div>

          {/* маленькая подсказка, чтобы было очевиднее */}
          <div className={styles.recipeSub} style={{ marginTop: 10 }}>
            <span style={{ opacity: 0.7 }}>Тапай + или -, чтобы учесть остаток</span>
          </div>
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

        <button type="button" className={styles.bigCta} onClick={onAdd}>
          <div className={styles.bigCtaRow}>
            <span className={styles.bigCtaText}>Добавить заготовку</span>
            <span className={styles.bigCtaIcon}>
              <IconArrow size={25} />
            </span>
          </div>
        </button>

        {/* ===== В НАЛИЧИИ ===== */}
        <div className={styles.categoriesWrap} style={{ marginTop: 14 }}>
          <div className={styles.sectionTitle}>В наличии</div>

          {inStock.length === 0 ? (
            <div className={styles.recipesState} style={{ marginTop: 10 }}>
              Пока пусто
            </div>
          ) : (
            <div className={styles.recipesList} style={{ marginTop: 10 }}>
              {inStock.map((p) => (
                <div key={p.id} className={styles.recipeLink} style={{ textDecoration: "none" }}>
                  <PrepCard p={p} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== ЗАКОНЧИЛИСЬ ===== */}
        <div className={styles.categoriesWrap} style={{ marginTop: 18 }}>
          <div className={styles.sectionTitle}>Закончились</div>

          {outOfStock.length === 0 ? (
            <div className={styles.recipesState} style={{ marginTop: 10 }}>
              Тут пока никого
            </div>
          ) : (
            <div className={styles.recipesList} style={{ marginTop: 10 }}>
              {outOfStock.map((p) => (
                <div key={p.id} className={styles.recipeLink} style={{ textDecoration: "none" }}>
                  <PrepCard p={p} />
                </div>
              ))}
            </div>
          )}
        </div>
      </PageFade>
    </div>
  );
}