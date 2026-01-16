"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./AppMenu.module.css";
import { IconRotate } from "@/app/components/icons";

type Item = { label: string; href: string };

const DEFAULT_ITEMS: Item[] = [
  { label: "Главная", href: "/" },
  { label: "Задачи", href: "/tasks" },
  { label: "Дневник тренировок", href: "/sport/overview" },
];

export default function AppMenu({ items = DEFAULT_ITEMS }: { items?: Item[] }) {
  const [open, setOpen] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // показать кнопку "вверх" только после небольшого скролла
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
    router.refresh();
  }

  function scrollToTop() {
    // на всякий: если пользователь в drawer - закрываем
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      {/* верхняя панель */}
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={refreshPage}
          aria-label="Обновить"
          title="Обновить"
        >
          <IconRotate size={18} style={{ color: "#000000" }} />
        </button>

        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          title="Меню"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* overlay */}
      <div
        className={`${styles.overlay} ${open ? styles.overlayOpen : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      {/* шторка справа */}
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`} role="dialog" aria-label="Меню">
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
              <Link key={it.href} href={it.href} className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}>
                <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* кнопка "вверх" */}
      <button
        type="button"
        onClick={scrollToTop}
        className={`${styles.toTopBtn} ${showTopBtn ? styles.toTopBtnVisible : ""}`}
        aria-label="Наверх"
        title="Наверх"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 5l7 7M12 5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}