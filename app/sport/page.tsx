// app/sport/page.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "./sport.module.css";
import { IconUser, IconStats } from "@/app/components/icons";

type Tab = {
  label: string;
  href: string;
  showDot: boolean; // нужна ли точка
  icon?: "stats" | "user" | "dumbbell"; // какие иконки поддерживаем
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

function renderTabIcon(icon?: Tab["icon"]) {
  if (!icon) return null;

  switch (icon) {
    case "user":
      return <IconUser className={styles.tabIcon} />;
    case "stats":
      return <IconStats className={styles.tabIcon} />;
    case "dumbbell":
      return <IconDumbbell className={styles.tabIcon} />;
    default:
      return null;
  }
}

function monthLabel(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SportPage() {
  const pathname = usePathname();

  // пока без бэка: заглушки (потом подцепим из профиля/таблиц)
  const [firstName] = useState<string>(""); // например: "Руслан"
  const [goal] = useState<string>("Набрать форму к отпуску");
  const [weight] = useState<number | null>(82.4);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();

  // мок: дни с тренировками (потом заменим на данные из БД)
  const workoutDays = useMemo(() => {
    const a = new Date(year, month, 2);
    const b = new Date(year, month, 6);
    const c = new Date(year, month, 10);
    return new Set([ymd(a), ymd(b), ymd(c)]);
  }, [year, month]);

  const trainingsThisMonth = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    let c = 0;
    workoutDays.forEach((d) => {
      if (d.startsWith(prefix)) c++;
    });
    return c;
  }, [workoutDays, year, month]);

  const calendar = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();

    // понедельник = первый день
    const jsDay = first.getDay(); // 0..6 (вс..сб)
    const startOffset = (jsDay + 6) % 7; // 0..6 (пн..вс)

    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, key: `e-${i}` });

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({ date: d, key: ymd(d) });
    }

    // while (cells.length < 42) cells.push({ date: null, key: `t-${cells.length}` });

    return cells;
  }, [year, month]);

  const hello = firstName?.trim() ? `Привет, ${firstName.trim()}!` : "Привет!";

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Тренировки</h1>
        </div>

        <nav className={styles.tabWrap} aria-label="Разделы дневника тренировок">
          {TABS.map((t) => {
            const active = isActiveTab(pathname, t.href);
            const hasIcon = Boolean(t.icon);

            return (
              <Link
                key={t.href}
                href={t.href}
                className={`${styles.tabBadge} ${active ? styles.tabBadgeActive : ""}`}
                title={t.label}
              >
                {t.showDot ? <span className={`${styles.dot} ${active ? styles.dotActive : ""}`} /> : null}
                {hasIcon ? renderTabIcon(t.icon) : t.label}
              </Link>
            );
          })}
        </nav>

        {/* Верхний блок */}
        {/*<section className={styles.card}>*/}
          <div className={styles.heroHello}>{hello}</div>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiItem}>
              <div className={styles.kpiValue}>{goal || "Не задана"}</div>
              <div className={styles.kpiLabel}>Текущая цель</div>
            </div>
            <div className={styles.kpiItem}>
              <div className={styles.kpiValue}>{weight === null ? "—" : `${weight} кг`}</div>
              <div className={styles.kpiLabel}>Текущий вес</div>
            </div>
          <button
            type="button"
            className={styles.bigCta}
            onClick={() => {
              // позже: открываем модалку/страницу создания тренировки
              alert("Тут откроем создание тренировки");
            }}
          >
            <div className={styles.bigCtaTitle}>Сделай тренировку</div>
            <div className={styles.bigCtaSub}>Два подхода и ты уже другой человек.</div>
          </button>
          </div>
        {/*</section>*/}

        {/* Календарь */}
        <section className={styles.card} style={{ marginTop: 14 }}>
          <div className={styles.calHeader}>
            <div className={styles.calTitle}>{monthLabel(now)}</div>
            <div className={styles.muted}>Тренировок в этом месяце: {trainingsThisMonth}</div>
          </div>

          <div className={styles.calWeekdays}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((x) => (
              <div key={x} className={styles.calWeekday}>
                {x}
              </div>
            ))}
          </div>

          <div className={styles.calGrid}>
            {calendar.map((cell) => {
              if (!cell.date) return <div key={cell.key} className={styles.calCellEmpty} />;

              const key = ymd(cell.date);
              const hasWorkout = workoutDays.has(key);
              const isToday = key === ymd(new Date());

              return (
                <div
                  key={cell.key}
                  className={`${styles.calCell} ${isToday ? styles.calCellToday : ""}`}
                  title={key}
                >
                  <span className={styles.calDayNum}>{cell.date.getDate()}</span>
                  {hasWorkout ? <span className={styles.calDot} /> : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}