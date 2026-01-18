// app/components/AppMenu/AppMenu.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./AppMenu.module.css";
import { IconRotate } from "@/app/components/icons";
import { useGlobalLoader } from "@/app/components/GlobalLoader/GlobalLoader";

type Item = { label: string; href: string };

const DEFAULT_ITEMS: Item[] = [
  { label: "Главная", href: "/" },
  { label: "Задачи", href: "/tasks" },
  { label: "Дневник тренировок", href: "/sport/overview" },
];

/* ===== SPORT CACHE KEYS (без _v1) ===== */
const SPORT_CACHE_KEYS = [
  "sport_overview_cache",
  "sport_body_cache",
  "sport_stats_cache",
  "sport_workouts_cache",
];

function clearSportCache() {
  try {
    SPORT_CACHE_KEYS.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export default function AppMenu({ items = DEFAULT_ITEMS }: { items?: Item[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { show, hide } = useGlobalLoader();

  const [open, setOpen] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* закрываем drawer при смене страницы */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /* esc */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  /* кнопка "наверх" */
  useEffect(() => {
    function onScroll() {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setShowTopBtn(y > 260);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function refreshPage() {
    if (refreshing) return;

    setRefreshing(true);

    // 1) жёстко сбрасываем весь спорт-кеш
    clearSportCache();
    window.dispatchEvent(new Event("sport:refresh"));
    

    // 2) показываем глобальный лоадер
    show("Обновляем данные");

    // 3) даём браузеру отрисовать лоадер и делаем refresh
    requestAnimationFrame(() => {
      router.refresh();

      // router.refresh не даёт callback — закрываем лоадер гарантированно
      setTimeout(() => {
        hide();
        setRefreshing(false);
      }, 600);
    });
  }

  function scrollToTop() {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      {/* ===== TOP BAR ===== */}
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={refreshPage}
          aria-label="Обновить"
          title="Обновить"
          disabled={refreshing}
          style={{ opacity: refreshing ? 0.5 : 1 }}
        >
          <IconRotate
            size={18}
            style={{
              color: "#000000",
              transform: refreshing ? "rotate(90deg)" : "none",
            }}
          />
        </button>

        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          title="Меню"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* ===== OVERLAY ===== */}
      <div
        className={`${styles.overlay} ${open ? styles.overlayOpen : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      {/* ===== DRAWER ===== */}
      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}
        role="dialog"
        aria-label="Меню"
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>Меню</div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            title="Закрыть"
          >
            ✕
          </button>
        </div>

        <nav className={styles.nav}>
          {items.map((it) => {
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}
              >
                <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ===== TO TOP ===== */}
      <button
        type="button"
        onClick={scrollToTop}
        className={`${styles.toTopBtn} ${showTopBtn ? styles.toTopBtnVisible : ""}`}
        aria-label="Наверх"
        title="Наверх"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5l7 7M12 5l-7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 5v14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  );
}