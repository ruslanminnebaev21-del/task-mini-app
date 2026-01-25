// app/components/RecMenu/RecMenu.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./RecMenu.module.css";

type MenuItem = {
  key: string;
  label: string;
  href: string;
  icon: "home" | "all" | "fav";
};

function useKeyboardOpen(thresholdPx = 140) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;

    // Фоллбек, если visualViewport нет (редко, но бывает)
    if (!vv) {
      const base = window.innerHeight;

      const onResize = () => {
        const diff = base - window.innerHeight;
        setOpen(diff > thresholdPx);
      };

      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    // base берём при монтировании
    const baseHeight = vv.height;

    const onResize = () => {
      const diff = baseHeight - vv.height;
      setOpen(diff > thresholdPx);
    };

    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [thresholdPx]);

  return open;
}

export default function RecMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen(140);

  const items: MenuItem[] = useMemo(
    () => [
      { key: "home", label: "Главная", href: "/recipes", icon: "home" },
      { key: "all", label: "Все рецепты", href: "/recipes/allRecipes", icon: "all" },
      { key: "fav", label: "Заготовки", href: "/recipes/preps", icon: "fav" },
    ],
    []
  );

  const activeKey = useMemo(() => {
    if (!pathname) return "home";

    if (pathname.startsWith("/recipes/allRecipes")) return "all";
    if (pathname.startsWith("/recipes/preps")) return "fav";
    if (pathname === "/recipes") return "home";

    return "home";
  }, [pathname]);

  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navTimer = useRef<number | null>(null);

  useEffect(() => {
    setReady(true);
    return () => {
      if (navTimer.current) window.clearTimeout(navTimer.current);
    };
  }, []);

  useEffect(() => {
    setLeaving(false);
  }, [pathname]);

  const go = (href: string) => {
    if (pathname === href) return;
    if (leaving) return;

    setLeaving(true);

    navTimer.current = window.setTimeout(() => {
      router.push(href);
    }, 160);
  };

  return (
    <div className={`${styles.fixedWrap} ${keyboardOpen ? styles.hiddenOnKeyboard : ""}`}>
      <div className={styles.safePad} />

      <div className={styles.barRow}>
        <div
          className={`${styles.bar} ${ready ? styles.barReady : styles.barNotReady} ${
            leaving ? styles.barLeaving : ""
          }`}
        >
          {items.map((it) => {
            const isActive = it.key === activeKey;

            return (
              <button
                key={it.key}
                type="button"
                onClick={() => go(it.href)}
                className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                disabled={leaving}
              >
                <span className={styles.pill} aria-hidden />

                <span className={styles.itemCol}>
                  <span className={styles.icon} aria-hidden>
                    {it.icon === "home" ? (
                      <HomeIcon />
                    ) : it.icon === "all" ? (
                      <ListIcon />
                    ) : (
                      <SnowflakeIcon />
                    )}
                  </span>

                  <span className={styles.label}>{it.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.svg} fill="none">
      <path
        d="M4 10.6L12 4l8 6.6V20a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 20v-9.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 21.6V14.2c0-.9.7-1.6 1.6-1.6h2.4c.9 0 1.6.7 1.6 1.6v7.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.svg} fill="none">
      <path
        d="M7 7h14M7 12h14M7 17h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.2 7h.01M4.2 12h.01M4.2 17h.01"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SnowflakeIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.svg} fill="none">
      <path
        d="M12 4v16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 12h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.2 6.2l11.6 11.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17.8 6.2L6.2 17.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

