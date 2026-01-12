// app/sport/stats/page.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";
import { IconPlus, IconTrash, IconUser, IconStats} from "@/app/components/icons";


type Tab = {
  label: string;
  href: string;
  showDot: boolean;   // нужна ли точка
  icon?:  "stats" | "user" | "dumbbell"; // какие иконки поддерживаем
};

const TABS: Tab[] = [
  { label: "Тренировки", href: "/sport", showDot: true },
  { label: "Упражнения", href: "/sport/exercises", showDot: true },
  { label: "Статистика", href: "/sport/stats", showDot: false, icon: "stats" },
  { label: "Профиль", href: "/sport/profile", showDot: false, icon: "user" },
];

function isActiveTab(pathname: string, href: string) {
  if (href === "/sport") return pathname === "/sport";
  return pathname === href || pathname.startsWith(href + "/");
}
function renderTabIcon(icon?: string) {
  if (!icon) return null;

  switch (icon) {
    case "user":
      return <IconUser className={styles.tabIcon} />;
    case "stats":
      return <IconStats className={styles.tabIcon} />;
    case "dumbbell":
      return <IconStats className={styles.tabIcon} />;
    default:
      return null;
  }
}

export default function SportStatsPage() {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Статистика</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Разделы дневника тренировок">
          {TABS.map((t) => {
            const active = isActiveTab(pathname, t.href);
            const hasIcon = !!t.icon;

            return (
              <Link
                key={t.href}
                href={t.href}
                className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}
                title={t.label}
              >
                {/* точка только если нужна */}
                {t.showDot && (
                  <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} />
                )}

                {/* иконка или текст */}
                {hasIcon ? renderTabIcon(t.icon) : t.label}
              </Link>
            );
          })}
        </nav>

        <section className={styles.card}>
          <div className={styles.muted}>Заглушка. Тут будет статистика по тренировкам, тоннажу, кардио и телу.</div>
        </section>
      </main>
    </div>
  );
}