// app/components/GlobalLoader/GlobalLoader.tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import styles from "@/app/page.module.css";

type LoaderCtx = {
  show: (text?: string) => void;
  hide: () => void;
};

const LoaderContext = createContext<LoaderCtx | null>(null);

const PHRASES = [
  "Собираем свежие данные",
  "Обновляем статистику",
  "Будим сервер",
  "Синхронизируем прогресс",
  "Наводим порядок в цифрах",
];

export function GlobalLoaderProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(PHRASES[0]);

  const show = useCallback((customText?: string) => {
    setText(customText || PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  // защита от зависаний
  useEffect(() => {
    if (!visible) return;

    const t = setTimeout(() => {
      setVisible(false);
    }, 12000); // максимум 12 секунд

    return () => clearTimeout(t);
  }, [visible]);

  return (
    <LoaderContext.Provider value={{ show, hide }}>
      {children}

      {visible && (
        <div className={styles.authOverlay}>
          <div className={styles.authLoaderBox}>
            <div className={styles.loader} />
            <div className={styles.tileHint}>{text}</div>
          </div>
        </div>
      )}
    </LoaderContext.Provider>
  );
}

export function useGlobalLoader() {
  const ctx = useContext(LoaderContext);
  if (!ctx) {
    throw new Error("useGlobalLoader must be used inside GlobalLoaderProvider");
  }
  return ctx;
}