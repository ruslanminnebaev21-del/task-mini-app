// app/recipes/main/page.tsx
import styles from "../recipes.module.css";
import RecMenu from "@/app/components/RecMenu/RecMenu";
import PageFade from "@/app/components/PageFade/PageFade";


export default function RecipesMainPage() {
  return (
    

      <div className={styles.container}>
        <PageFade>
          <div className={styles.headerRow}>
            <h1 className={styles.h1}>Все рецепты</h1>
          </div>
        </PageFade>
      </div>
  
  );
}