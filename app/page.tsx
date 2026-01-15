// app/page.tsx
"use client";

import Link from "next/link";
import styles from "./page.module.css";
import { useTelegramAuth } from "@/app/hooks/useTelegramAuth";
import { useEffect, useState } from "react";

const FUN_PHRASES = [
  "Настраиваем кнопки",
  "Ждём админов",
  "Подключаем провода к интернету",
  "Собираем данные по крупицам",
  "Будим сервер, он ещё спит",
  "Проверяем, всё ли на месте",
  "Протираем объектив у системы",
  "Завариваем кофе для алгоритмов",
  "Разгружаем облака",
  "Почти готово, не моргай",
];

export default function MenuPage() {
  const { ready, hint } = useTelegramAuth();

  const [phrase, setPhrase] = useState(FUN_PHRASES[0]);

  useEffect(() => {
    if (ready) return;

    // сразу ставим рандом
    setPhrase(FUN_PHRASES[Math.floor(Math.random() * FUN_PHRASES.length)]);

    const id = setInterval(() => {
      setPhrase(FUN_PHRASES[Math.floor(Math.random() * FUN_PHRASES.length)]);
    }, 2000);

    return () => clearInterval(id);
  }, [ready]);

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

        {hint ? <div className={styles.hint}>{hint}</div> : null}

        {/* ===== LOADER ===== */}
        {!ready && (
          <div className={styles.authOverlay}>
            <div className={styles.authLoaderBox}>
              <div className={styles.loader} />
              <div className={styles.tileHint}>{phrase}</div>
            </div>
          </div>
        )}

        {/* ===== MENU ===== */}
        <section className={styles.grid}>
          <Link
            href="/tasks"
            className={`${styles.tile} ${!ready ? styles.tileDisabled : ""}`}
            aria-label="Открыть задачи"
            aria-disabled={!ready}
            tabIndex={!ready ? -1 : 0}
            onClick={(e) => {
              if (!ready) e.preventDefault();
            }}
          >
            <div className={styles.tileTop}>
              <div className={styles.tileTitle}>Задачи</div>
              <div className={styles.tileHint}>Проекты, дедлайны, завершено</div>
            </div>
            <div className={styles.tileMeta}>{ready ? "Перейти" : "Авторизация..."}</div>
          </Link>

          <Link
            href="/sport/overview"
            className={`${styles.tile} ${!ready ? styles.tileDisabled : ""}`}
            aria-label="Открыть дневник тренировок"
            aria-disabled={!ready}
            tabIndex={!ready ? -1 : 0}
            onClick={(e) => {
              if (!ready) e.preventDefault();
            }}
          >
            <div className={styles.tileTop}>
              <div className={styles.tileTitle}>Дневник тренировок</div>
              <div className={styles.tileHint}>Тренировки, объём, прогресс</div>
            </div>
            <div className={styles.tileMeta}>{ready ? "Перейти" : "Авторизация..."}</div>
          </Link>
        </section>

        <div className={styles.footerNote}>
          Стили как в задачнике, дальше можно добавлять плитки.
        </div>
      </main>
    </div>
  );
}