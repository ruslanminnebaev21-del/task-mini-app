// app/recipes/main/page.tsx

"use client";

import styles from "./recipes.module.css";
import PageFade from "@/app/components/PageFade/PageFade";
import { IconArrow } from "@/app/components/icons";
import { useRouter } from "next/navigation";

export default function RecipesMainPage() {
  const router = useRouter();

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
              <IconArrow size={25} style={{ color: "#fff" }} />
            </span>
          </div>
        </button>
      </PageFade>
    </div>
  );
}