// app/page.tsx
"use client";

import Link from "next/link";
import styles from "./page.module.css";

export default function MenuPage() {
  return (
    <div className={styles.shell}>
      <div className={styles.bgFixed} />
      <div className={`${styles.orb} ${styles.orbA}`} />
      <div className={`${styles.orb} ${styles.orbB}`} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Меню</h1>
          <div className={styles.muted}>Выбери модуль</div>
        </div>

        <section className={styles.grid}>
          <Link href="/tasks" className={styles.tile} aria-label="Открыть задачи">
            <div className={styles.tileTop}>
              <div className={styles.tileTitle}>Задачи</div>
              <div className={styles.tileHint}>Проекты, дедлайны, завершено</div>
            </div>
            <div className={styles.tileMeta}>Перейти</div>
          </Link>

          <Link href="/sport" className={styles.tile} aria-label="Открыть дневник тренировок">
            <div className={styles.tileTop}>
              <div className={styles.tileTitle}>Дневник тренировок</div>
              <div className={styles.tileHint}>Тренировки, объём, прогресс</div>
            </div>
            <div className={styles.tileMeta}>Перейти</div>
          </Link>
        </section>

        <div className={styles.footerNote}>Стили как в задачнике, дальше можно добавлять плитки.</div>
      </main>
    </div>
  );
}