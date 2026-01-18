// app/sport/stats/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import styles from "../sport.module.css";

type RangeKey = "7d" | "30d" | "90d" | "all";
type TabKey = "overview" | "strength" | "cardio" | "body" | "insights";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatInt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

function format1(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);
}

function Sparkline({
  values,
  height = 34,
}: {
  values: number[];
  height?: number;
}) {
  const w = 120;
  const h = height;

  const { path, area, min, max } = useMemo(() => {
    if (!values.length) return { path: "", area: "", min: 0, max: 0 };

    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = Math.max(1e-9, maxV - minV);

    const pts = values.map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - 2) + 1;
      const y = h - 1 - ((v - minV) / span) * (h - 2);
      return { x, y };
    });

    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");

    const a =
      `M${pts[0].x.toFixed(2)},${h - 1} ` +
      pts.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") +
      ` L${pts[pts.length - 1].x.toFixed(2)},${h - 1} Z`;

    return { path: d, area: a, min: minV, max: maxV };
  }, [values, h]);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={area} fill="rgba(255,255,255,0.08)" />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
      <circle
        cx={w - 2}
        cy={
          values.length
            ? h - 1 - ((values[values.length - 1] - min) / Math.max(1e-9, max - min)) * (h - 2)
            : h / 2
        }
        r="2.4"
        fill="rgba(255,255,255,0.9)"
      />
    </svg>
  );
}

function MiniBarChart({ values }: { values: number[] }) {
  const w = 280;
  const h = 74;
  const maxV = Math.max(1, ...values);
  const gap = 6;
  const barW = (w - gap * (values.length - 1)) / values.length;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="rgba(255,255,255,0.10)" />
      {values.map((v, i) => {
        const bh = clamp((v / maxV) * (h - 10), 2, h - 10);
        const x = i * (barW + gap);
        const y = h - 1 - bh;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={bh}
            rx="6"
            fill="rgba(255,255,255,0.18)"
          />
        );
      })}
    </svg>
  );
}

function PillButton({
  active,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={styles.tabBadge}
      onClick={onClick}
      title={title}
      style={{
        opacity: active ? 1 : 0.7,
        transform: active ? "translateY(-1px)" : "none",
        border: active ? "1px solid rgba(255,255,255,0.24)" : undefined,
      }}
    >
      <span className={styles.dot} />
      {children}
    </button>
  );
}

function StatCard({
  title,
  value,
  sub,
  spark,
  onClick,
}: {
  title: string;
  value: string;
  sub?: string;
  spark?: number[];
  onClick?: () => void;
}) {
  return (
    <div className={styles.card} style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className={styles.muted} style={{ marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
          {sub ? (
            <div className={styles.muted} style={{ marginTop: 6 }}>
              {sub}
            </div>
          ) : null}
        </div>

        <div style={{ flex: "0 0 auto", opacity: 0.95 }}>
          {spark ? <Sparkline values={spark} /> : null}
        </div>
      </div>

      {onClick ? (
        <button
          type="button"
          className={styles.tabBadge}
          onClick={onClick}
          style={{ marginTop: 10, width: "fit-content" }}
          title="Открыть подробнее"
        >
          <span className={styles.dot} />
          Подробнее
        </button>
      ) : null}
    </div>
  );
}

export default function SportStatsPage() {
  const router = useRouter();

  // UI-состояния (пока без реальной загрузки данных)
  const [range, setRange] = useState<RangeKey>("30d");
  const [tab, setTab] = useState<TabKey>("overview");

  // мок-данные, чтобы всё выглядело как реальный дашборд
  const mock = useMemo(() => {
    // можно потом заменить на реальные запросы под range
    const series = {
      workouts: [2, 3, 3, 4, 2, 4, 5, 3, 4, 4, 5, 4],
      tonnage: [18, 22, 21, 26, 24, 28, 32, 30, 35, 33, 36, 40], // тыс кг
      minutes: [140, 160, 155, 190, 170, 210, 240, 220, 260, 245, 270, 300],
      cardioKm: [6, 7, 5, 10, 8, 12, 9, 14, 10, 13, 12, 16],
      weight: [82.4, 82.1, 81.9, 81.6, 81.3, 81.0, 80.8, 80.5, 80.4, 80.2, 80.1, 79.9],
    };

    const totals = {
      workouts: 42,
      sets: 612,
      reps: 6850,
      tonnageKg: 685_000,
      minutes: 2150,
      cardioKm: 128.4,
    };

    const prs = [
      { name: "Жим в хаммере", value: "40×10", when: "3 дня назад" },
      { name: "Тяга сверху", value: "75×8", when: "9 дней назад" },
      { name: "Присед в смите", value: "120×6", when: "2 недели назад" },
    ];

    const insights = [
      { t: "Сила растёт быстрее, когда держишь 3+ тренировки в неделю.", s: "Корреляция +0.42 (мок)" },
      { t: "Тоннаж вверх, но регулярность просела. Риск плато.", s: "Серия прерывалась 2 раза (мок)" },
      { t: "Вечерние тренировки выходят стабильнее по объёму.", s: "Средний тоннаж +11% (мок)" },
    ];

    return { series, totals, prs, insights };
  }, []);

  const rangeLabel = useMemo(() => {
    switch (range) {
      case "7d":
        return "7 дней";
      case "30d":
        return "30 дней";
      case "90d":
        return "90 дней";
      case "all":
        return "Всё время";
    }
  }, [range]);

  return (
    <div className={styles.shell}>
      <AppMenu />

      <div className={styles.bg} />
      <div className={styles.orbA} />
      <div className={styles.orbB} />

      <main className={styles.container}>
        {/* заголовок */}
        <div className={styles.headerRow}>
          <h1 className={styles.h1}>Статистика</h1>
        </div>

        {/* навигация */}
        <nav className={styles.tabWrap} aria-label="Навигация" style={{ flexWrap: "wrap", gap: 10 }}>
          <PillButton onClick={() => router.back()} title="Назад">
            Назад
          </PillButton>

          <div style={{ width: 10 }} />

          <PillButton active={tab === "overview"} onClick={() => setTab("overview")} title="Обзор">
            Обзор
          </PillButton>
          <PillButton active={tab === "strength"} onClick={() => setTab("strength")} title="Сила">
            Сила
          </PillButton>
          <PillButton active={tab === "cardio"} onClick={() => setTab("cardio")} title="Кардио">
            Кардио
          </PillButton>
          <PillButton active={tab === "body"} onClick={() => setTab("body")} title="Тело">
            Тело
          </PillButton>
          <PillButton active={tab === "insights"} onClick={() => setTab("insights")} title="Инсайты">
            Инсайты
          </PillButton>

          <div style={{ flex: "1 1 auto" }} />

          <PillButton
            onClick={() => alert("Позже сделаем выбор периода и подтянем реальные данные из Supabase")}
            title="Период"
          >
            Период: {rangeLabel}
          </PillButton>
        </nav>
        <div className={styles.sectionTitle}>Ниже представлены демонстрационные данные</div>
        

        {/* контент */}
        <section style={{ marginTop: 14, display: "grid", gap: 12 }}>

          {/* Верхние KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <StatCard
              title="Тренировок"
              value={formatInt(mock.totals.workouts)}
              sub="Серия, регулярность, дни недели"
              spark={mock.series.workouts}
              onClick={() => alert("Откроем деталку: календарь, серия, дни недели")}
            />
            <StatCard
              title="Тоннаж"
              value={`${formatInt(mock.totals.tonnageKg)} кг`}
              sub="Объём, нагрузка, темп прогресса"
              spark={mock.series.tonnage}
              onClick={() => alert("Откроем деталку: тоннаж по неделям и по упражнениям")}
            />
            <StatCard
              title="Подходы"
              value={formatInt(mock.totals.sets)}
              sub="Сеты/мин, объём по мышцам"
              spark={mock.series.minutes}
              onClick={() => alert("Откроем деталку: объём и плотность тренировки")}
            />
            <StatCard
              title="Кардио"
              value={`${format1(mock.totals.cardioKm)} км`}
              sub="Дистанция, минуты, темп"
              spark={mock.series.cardioKm}
              onClick={() => alert("Откроем деталку: кардио по дням и типам")}
            />
          </div>

          {/* Большой блок с графиком */}
          <div className={styles.card} style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Динамика за {rangeLabel}</div>
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  Тут можно переключать метрику: тоннаж, минуты, вес, дистанция. Пока мок.
                </div>
              </div>

              <button
                type="button"
                className={styles.tabBadge}
                onClick={() => alert("Позже: переключатель метрики графика")}
                title="Сменить метрику"
              >
                <span className={styles.dot} />
                Метрика
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <MiniBarChart values={mock.series.tonnage.map((x) => x * 1000)} />
            </div>

            <div
              className={styles.muted}
              style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}
            >
              <span>Пик: 40k</span>
              <span>Среднее: 28.8k</span>
              <span>Тренд: +</span>
            </div>
          </div>

          {/* Секции по вкладкам */}
          {tab === "overview" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div className={styles.card} style={{ padding: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Плотность</div>
                  <div className={styles.muted} style={{ marginTop: 6 }}>
                    Сеты/мин, тоннаж/мин, средняя длительность.
                  </div>
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={styles.muted}>Тоннаж/мин</span>
                      <span style={{ fontWeight: 800 }}>318 кг/мин (мок)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={styles.muted}>Сеты/мин</span>
                      <span style={{ fontWeight: 800 }}>0.31 (мок)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={styles.muted}>Длительность</span>
                      <span style={{ fontWeight: 800 }}>52 мин (мок)</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем деталку: сравнение тренировок по КПД")}
                    style={{ marginTop: 12 }}
                  >
                    <span className={styles.dot} />
                    Топ тренировки
                  </button>
                </div>

                <div className={styles.card} style={{ padding: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Регулярность</div>
                  <div className={styles.muted} style={{ marginTop: 6 }}>
                    Серии, пропуски, активные дни недели.
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={styles.muted}>Текущая серия</span>
                      <span style={{ fontWeight: 800 }}>8 дней (мок)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={styles.muted}>Лучшая серия</span>
                      <span style={{ fontWeight: 800 }}>19 дней (мок)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={styles.muted}>Средний интервал</span>
                      <span style={{ fontWeight: 800 }}>2.1 дня (мок)</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем календарь активности")}
                    style={{ marginTop: 12 }}
                  >
                    <span className={styles.dot} />
                    Календарь
                  </button>
                </div>
              </div>

              <div className={styles.card} style={{ padding: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Личные рекорды</div>
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  Лента PR и сколько дней прошло с последнего рекорда.
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {mock.prs.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.name}
                        </div>
                        <div className={styles.muted} style={{ marginTop: 2 }}>
                          {p.when}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900 }}>{p.value}</div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => alert("Откроем страницу рекордов по всем упражнениям")}
                  style={{ marginTop: 12 }}
                >
                  <span className={styles.dot} />
                  Все рекорды
                </button>
              </div>
            </div>
          ) : null}

          {tab === "strength" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className={styles.card} style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Сила по упражнениям</div>
                    <div className={styles.muted} style={{ marginTop: 6 }}>
                      1RM, рабочие веса, скорость прогресса (кг/месяц).
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем выбор упражнения")}
                    title="Выбрать упражнение"
                  >
                    <span className={styles.dot} />
                    Упражнение
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <MiniBarChart values={[60, 62, 61, 64, 66, 65, 68, 70, 71, 73, 74, 76]} />
                </div>

                <div className={styles.muted} style={{ marginTop: 10 }}>
                  Сейчас: 76 (мок) • Рост за {rangeLabel}: +16 (мок)
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div className={styles.card} style={{ padding: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Плато-детектор</div>
                  <div className={styles.muted} style={{ marginTop: 6 }}>
                    Если 3+ недели без роста веса/повторов, подсветим.
                  </div>
                  <div style={{ marginTop: 12, fontWeight: 900 }}>2 упражнения в зоне риска (мок)</div>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Покажем упражнения в плато и рекомендации")}
                    style={{ marginTop: 12 }}
                  >
                    <span className={styles.dot} />
                    Показать
                  </button>
                </div>

                <div className={styles.card} style={{ padding: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Объём по нагрузке</div>
                  <div className={styles.muted} style={{ marginTop: 6 }}>
                    Условно: тяжёлые сеты vs объёмные, и что даёт больше прогресса.
                  </div>
                  <div style={{ marginTop: 12, fontWeight: 900 }}>Тяжёлые дают +9% к 1RM (мок)</div>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем сравнение по сетам")}
                    style={{ marginTop: 12 }}
                  >
                    <span className={styles.dot} />
                    Сравнить
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "cardio" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className={styles.card} style={{ padding: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Кардио объём</div>
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  Дистанция, минуты, тренды. Потом добавим темп/пульс если решишь хранить.
                </div>
                <div style={{ marginTop: 12 }}>
                  <MiniBarChart values={mock.series.cardioKm} />
                </div>
                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => alert("Откроем кардио по дням и типам")}
                  style={{ marginTop: 12 }}
                >
                  <span className={styles.dot} />
                  Деталка
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <StatCard title="Минут кардио" value={`${formatInt(640)} мин`} sub="За период (мок)" spark={mock.series.minutes} />
                <StatCard title="Лучший день" value={`${format1(8.2)} км`} sub="Пик дистанции (мок)" spark={mock.series.cardioKm} />
              </div>
            </div>
          ) : null}

          {tab === "body" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className={styles.card} style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Тело</div>
                    <div className={styles.muted} style={{ marginTop: 6 }}>
                      Вес, замеры, тренды. Плюс корреляция с объёмом тренировок.
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Позже: переключатель kind замера")}
                    title="Выбрать метрику"
                  >
                    <span className={styles.dot} />
                    Метрика
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <MiniBarChart values={mock.series.weight.map((x) => x * 10)} />
                </div>

                <div className={styles.muted} style={{ marginTop: 10 }}>
                  Сейчас: 79.9 кг (мок) • За {rangeLabel}: -2.5 кг (мок)
                </div>

                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => alert("Откроем корреляции: вес vs объём, вес vs регулярность")}
                  style={{ marginTop: 12 }}
                >
                  <span className={styles.dot} />
                  Корреляции
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div className={styles.card} style={{ padding: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Скорость изменений</div>
                  <div className={styles.muted} style={{ marginTop: 6 }}>
                    кг/неделю и стабильность тренда.
                  </div>
                  <div style={{ marginTop: 12, fontWeight: 900 }}>-0.32 кг/нед (мок)</div>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем деталку по скорости изменения")}
                    style={{ marginTop: 12 }}
                  >
                    <span className={styles.dot} />
                    Подробнее
                  </button>
                </div>

                <div className={styles.card} style={{ padding: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>Стабильность</div>
                  <div className={styles.muted} style={{ marginTop: 6 }}>
                    Насколько ровно идёшь без качелей.
                  </div>
                  <div style={{ marginTop: 12, fontWeight: 900 }}>72/100 (мок)</div>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем индекс стабильности и график разброса")}
                    style={{ marginTop: 12 }}
                  >
                    <span className={styles.dot} />
                    Разбор
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "insights" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className={styles.card} style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Автоинсайты</div>
                    <div className={styles.muted} style={{ marginTop: 6 }}>
                      Тут будут выводы из связок: тренировки, замеры, регулярность, рекорды.
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Позже: пересчитать инсайты на сервере или в клиенте")}
                    title="Пересчитать"
                  >
                    <span className={styles.dot} />
                    Пересчитать
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {mock.insights.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div style={{ fontWeight: 850 }}>{it.t}</div>
                      <div className={styles.muted} style={{ marginTop: 6 }}>
                        {it.s}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем: какие упражнения дают лучший перенос")}
                    title="Перенос"
                  >
                    <span className={styles.dot} />
                    Перенос силы
                  </button>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем: риск выгорания по трендам")}
                    title="Риск"
                  >
                    <span className={styles.dot} />
                    Риск выгорания
                  </button>
                  <button
                    type="button"
                    className={styles.tabBadge}
                    onClick={() => alert("Откроем: топ бесполезных тренировок (по КПД)")}
                    title="КПД"
                  >
                    <span className={styles.dot} />
                    Тренировки по КПД
                  </button>
                </div>
              </div>

              <div className={styles.card} style={{ padding: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Индекс прогресса</div>
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  Композит: сила + регулярность + объём + замеры. Один показатель, чтобы видеть тренд.
                </div>

                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 34, fontWeight: 950, letterSpacing: -0.5 }}>78</div>
                  <div className={styles.muted} style={{ textAlign: "right" }}>
                    Рост за {rangeLabel}: +6 (мок)
                    <div style={{ marginTop: 6 }}>
                      <Sparkline values={[60, 62, 61, 64, 66, 68, 69, 71, 73, 74, 76, 78]} height={40} />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => alert("Откроем формулу индекса и вклад каждого фактора")}
                  style={{ marginTop: 12 }}
                >
                  <span className={styles.dot} />
                  Как считается
                </button>
              </div>
            </div>
          ) : null}

          {/* Нижняя панель действий */}
          <div className={styles.card} style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Экспорт и режимы</div>
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  Потом сделаем экспорт в CSV, сравнение периодов, и “что если”.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => alert("Экспорт в CSV (позже)")}
                  title="Экспорт"
                >
                  <span className={styles.dot} />
                  Экспорт
                </button>
                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => {
                    alert("Сравнение периодов (позже)");
                    setRange((r) => (r === "30d" ? "90d" : "30d"));
                  }}
                  title="Сравнение"
                >
                  <span className={styles.dot} />
                  Сравнить
                </button>
                <button
                  type="button"
                  className={styles.tabBadge}
                  onClick={() => alert("Настройки статистики (позже)")}
                  title="Настройки"
                >
                  <span className={styles.dot} />
                  Настройки
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Невидимый, но полезный переключатель range (пока через alert) */}
        <div style={{ display: "none" }}>
          <button onClick={() => setRange("7d")}>7d</button>
          <button onClick={() => setRange("30d")}>30d</button>
          <button onClick={() => setRange("90d")}>90d</button>
          <button onClick={() => setRange("all")}>all</button>
        </div>
      </main>
    </div>
  );
}