import styles from "./recipes.module.css";
import RecMenu from "@/app/components/RecMenu/RecMenu";

export default function RecipesLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      {children}
      {modal ?? null}

      <RecMenu />
    </div>
  );
}