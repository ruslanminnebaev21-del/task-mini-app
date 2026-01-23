"use client";

import { usePathname } from "next/navigation";
import styles from "./recipes.module.css";
import RecMenu from "@/app/components/RecMenu/RecMenu";

const HIDE_ON = [
  "/recipes/newRecipe"
];

export default function RecipesLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideMenu = !!pathname && HIDE_ON.some((p) => pathname.startsWith(p));

  return (
    <div className={styles.shell}>
      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      {children}
      {modal ?? null}

      {!hideMenu && (
        <div className={styles.menuRoot}>
          <RecMenu />
        </div>
      )}
    </div>
  );
}