"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  project_id?: number | null;
};

type Project = {
  id: number;
  name: string;
  created_at: string;
};

function getTelegramWebApp() {
  // @ts-ignore
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map((x) => Number(x));
  if (!y || !m || !day) return d;
  return `${day.toString().padStart(2, "0")}.${m.toString().padStart(2, "0")}.${y}`;
}

export default function HomePage() {
  const [ready, setReady] = useState(false);

  // hint = только ошибки (карточкой)
  const [hint, setHint] = useState<string | null>(null);

  // toast = только успехи (снизу, автоскрытие)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null); // null = Все задачи
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadingTasks, setLoadingTasks] = useState(false);

  // tab pulse animation helper
  const [tabPulseKey, setTabPulseKey] = useState<string | null>(null);
  const tabPulseTimer = useRef<number | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const isAllTasks = activeProjectId === null;
  const canAddTask = Boolean(!isAllTasks && activeProjectId && title.trim());

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }

  function pulseTab(key: string) {
    setTabPulseKey(key);
    if (tabPulseTimer.current) window.clearTimeout(tabPulseTimer.current);
    tabPulseTimer.current = window.setTimeout(() => setTabPulseKey(null), 220);
  }

  const ui = {
    page: {
      maxWidth: 720,
      margin: "0 auto",
      padding: 16,
      fontFamily: "system-ui",
      color: "#111",
    } as React.CSSProperties,

    // чуть “стекла” + аккуратная тень
    card: {
      border: "1px solid rgba(229,229,229,0.85)",
      borderRadius: 18,
      padding: 14,
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
    } as React.CSSProperties,

    row: { display: "flex", gap: 10, alignItems: "center" } as React.CSSProperties,

    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 14,
      border: "1px solid rgba(215,215,215,0.9)",
      outline: "none",
      fontSize: 16,
      background: "rgba(255,255,255,0.75)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    } as React.CSSProperties,

    btn: {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(215,215,215,0.9)",
      background: "#111",
      color: "#fff",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
      transition: "transform 160ms ease, opacity 160ms ease",
    } as React.CSSProperties,

    btnGhost: {
      padding: "12px 14px",
      borderRadius: 999,
      border: "1px solid rgba(215,215,215,0.9)",
      background: "rgba(255,255,255,0.7)",
      color: "#111",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
      transition: "transform 160ms ease, opacity 160ms ease",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
    } as React.CSSProperties,

    // типографика
    muted: { fontSize: 13, opacity: 0.7, lineHeight: 1.35 } as React.CSSProperties,

    headerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    } as React.CSSProperties,

    h1: {
      fontSize: 22,
      margin: 0,
      lineHeight: "44px",
      fontWeight: 900,
      letterSpacing: "-0.01em",
    } as React.CSSProperties,

    // tabs
    tabWrap: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      marginTop: 12,
    } as React.CSSProperties,

    tabBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(229,229,229,0.9)",
      background: "rgba(255,255,255,0.65)",
      fontWeight: 550, // меньше “жирности”, но читаемо
      fontSize: 13,
      cursor: "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
      height: 32,
      transition: "transform 160ms ease, box-shadow 200ms ease, background 200ms ease",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.03)",
    } as React.CSSProperties,

    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: "#bdbdbd",
      flex: "0 0 auto",
    } as React.CSSProperties,

    // + button
    tabPlus: {
      width: 32,
      height: 32,
      borderRadius: 999,
      border: "1px solid rgba(229,229,229,0.9)",
      background: "rgba(255,255,255,0.65)",
      color: "#111",
      fontWeight: 700,
      fontSize: 14, // размер плюсика регулируется тут
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
      transition: "transform 160ms ease, box-shadow 200ms ease",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.03)",
    } as React.CSSProperties,

    // refresh
    refresh: {
      width: 44,
      height: 44,
      borderRadius: 999,
      border: "1px solid rgba(215,215,215,0.9)",
      background: "rgba(255,255,255,0.7)",
      color: "#111",
      fontWeight: 900,
      fontSize: 18,
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxShadow: "0 10px 22px rgba(0,0,0,0.04)",
      transition: "transform 160ms ease, opacity 160ms ease",
    } as React.CSSProperties,

    // skeleton
    skel: {
      background: "rgba(0,0,0,0.06)",
      borderRadius: 999,
      position: "relative",
      overflow: "hidden",
    } as React.CSSProperties,
    skelBlock: {
      background: "rgba(0,0,0,0.06)",
      borderRadius: 16,
      position: "relative",
      overflow: "hidden",
    } as React.CSSProperties,
  };

  function SkelShine() {
    return <span className="skel-shine" />;
  }

  function SkeletonTabs() {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ ...ui.skel, width: 32, height: 32 }}>
          <SkelShine />
        </div>
        <div style={{ ...ui.skel, width: 110, height: 32 }}>
          <SkelShine />
        </div>
        <div style={{ ...ui.skel, width: 120, height: 32 }}>
          <SkelShine />
        </div>
        <div style={{ ...ui.skel, width: 92, height: 32 }}>
          <SkelShine />
        </div>
      </div>
    );
  }

  function SkeletonList() {
    return (
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {[1, 2, 3].map((k) => (
          <div key={k} style={{ ...ui.skelBlock, height: 84, border: "1px solid rgba(0,0,0,0.03)" }}>
            <SkelShine />
          </div>
        ))}
      </div>
    );
  }

  async function authIfPossible() {
    const tg = getTelegramWebApp();
    const initData = tg?.initData || "";

    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch {}
    }

    if (!initData) {
      setHint("Открой мини-апп кнопкой в боте, тогда появится сохранение.");
      setReady(true);
      return;
    }

    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setHint(`Auth не прошёл: ${j.reason || r.status}${j.error ? " | " + j.error : ""}`);
      } else {
        setHint(null);
      }
    } catch (e: any) {
      setHint(`Auth запрос упал: ${String(e?.message || e)}`);
    }

    setReady(true);
  }

  async function loadProjects() {
    setLoadingProjects(true);
    try {
      const r = await fetch("/api/projects", { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j.ok) {
        if (j.reason === "NO_SESSION") return;
        setHint(j.error || j.reason || "Не смог загрузить проекты");
        return;
      }

      const list: Project[] = j.projects || [];
      setProjects(list);

      if (list.length === 0) {
        setActiveProjectId(null);
        return;
      }

      setActiveProjectId((prev) => {
        if (prev === null) return null;
        const exists = list.some((p) => p.id === prev);
        return exists ? prev : list[0].id;
      });
    } catch (e: any) {
      setHint(`Не смог загрузить проекты: ${String(e?.message || e)}`);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadTasks() {
    setLoadingTasks(true);
    try {
      const url = new URL("/api/tasks", window.location.origin);
      url.searchParams.set("view", "today");
      if (activeProjectId) url.searchParams.set("projectId", String(activeProjectId));

      const r = await fetch(url.toString(), { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (j.ok) {
        setTasks(j.tasks || []);
        return;
      }

      if (j.reason === "NO_SESSION") return;
      setHint(j.error || j.reason || "Не смог загрузить задачи");
    } catch (e: any) {
      setHint(`Ошибка загрузки задач: ${String(e?.message || e)}`);
    } finally {
      setLoadingTasks(false);
    }
  }

  function openCreateProject() {
    setHint(null);
    setNewProjectName("");
    setShowCreateProject(true);
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    if (creatingProject) return;

    setCreatingProject(true);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setHint(`Ошибка создания проекта: ${j.reason || r.status}${j.error ? " | " + j.error : ""}`);
        return;
      }

      setHint(null);
      await loadProjects();
      if (j.project?.id) {
        setActiveProjectId(Number(j.project.id));
        pulseTab(`p:${Number(j.project.id)}`);
      }
      setShowCreateProject(false);
      showToast("Проект создан");
    } catch (e: any) {
      setHint(`Ошибка создания проекта: ${String(e?.message || e)}`);
    } finally {
      setCreatingProject(false);
    }
  }

  async function addTask() {
    if (!title.trim()) return;

    if (isAllTasks || !activeProjectId) {
      setHint("Выбери проект табом сверху, чтобы добавить задачу.");
      return;
    }

    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: title.trim(),
        due_date: dueDate,
        projectId: activeProjectId,
      }),
    });

    const j = await r.json().catch(() => ({} as any));

    if (j.ok) {
      setTitle("");
      await loadTasks();
      showToast("Задача добавлена");
      return;
    }

    if (j.reason === "NO_SESSION") {
      setHint("Сессии нет. Открой мини-апп кнопкой у бота, тогда появится сохранение.");
      return;
    }

    setHint(j.error || "Ошибка при добавлении задачи");
  }

  async function toggleDone(id: number, done: boolean) {
    const r = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, done }),
    });

    const j = await r.json().catch(() => ({} as any));
    if (j.ok) await loadTasks();
  }

  useEffect(() => {
    (async () => {
      await authIfPossible();
      await loadProjects();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeProjectId]);

  return (
    <main style={ui.page}>
      {/* global styles for animations + skeleton shine */}
      <style jsx global>{`
        .fade-up {
          animation: fadeUp 240ms ease both;
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tab-snap {
          transform: scale(0.985);
        }

        .skel-shine {
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.55) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: skel 1200ms ease-in-out infinite;
        }
        @keyframes skel {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(120%);
          }
        }

        .toast {
          position: fixed;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          z-index: 99999;
          background: rgba(17, 17, 17, 0.86);
          color: white;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
          font-size: 13px;
          line-height: 1.25;
          animation: toastIn 220ms ease both;
          max-width: calc(100vw - 24px);
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <div style={ui.headerRow}>
        <h1 style={ui.h1}>Задачи</h1>

        <button
          type="button"
          onClick={() => loadTasks()}
          disabled={loadingTasks}
          style={{
            ...ui.refresh,
            opacity: loadingTasks ? 0.65 : 1,
            cursor: loadingTasks ? "not-allowed" : "pointer",
            transform: loadingTasks ? "scale(0.98)" : "scale(1)",
          }}
          title="Обновить"
        >
          <span style={{ display: "inline-block" }} className={loadingTasks ? "spin" : ""}>
            ↻
          </span>
        </button>
      </div>

      {/* Tabs at top */}
      <div style={ui.tabWrap}>
        <button
          type="button"
          onClick={openCreateProject}
          disabled={creatingProject || loadingProjects}
          style={{
            ...ui.tabPlus,
            opacity: creatingProject || loadingProjects ? 0.6 : 1,
            cursor: creatingProject || loadingProjects ? "not-allowed" : "pointer",
          }}
          title="Новый проект"
        >
          +
        </button>

        {loadingProjects && projects.length === 0 ? (
          <SkeletonTabs />
        ) : (
          <>
            {/* All tasks */}
            <button
              type="button"
              onClick={() => {
                setActiveProjectId(null);
                pulseTab("all");
              }}
              className={tabPulseKey === "all" ? "tab-snap" : ""}
              style={{
                ...ui.tabBadge,
                background: isAllTasks ? "#111" : "rgba(255,255,255,0.65)",
                color: isAllTasks ? "#fff" : "#111",
                borderColor: isAllTasks ? "#111" : "rgba(229,229,229,0.9)",
                boxShadow: isAllTasks ? "0 10px 22px rgba(0,0,0,0.10)" : ui.tabBadge.boxShadow,
              }}
            >
              <span style={{ ...ui.dot, background: isAllTasks ? "#22c55e" : "#bdbdbd" }} />
              Все задачи
            </button>

            {projects.map((p) => {
              const isActive = activeProjectId === p.id;
              const key = `p:${p.id}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveProjectId(p.id);
                    pulseTab(key);
                  }}
                  className={tabPulseKey === key ? "tab-snap" : ""}
                  style={{
                    ...ui.tabBadge,
                    background: isActive ? "#111" : "rgba(255,255,255,0.65)",
                    color: isActive ? "#fff" : "#111",
                    borderColor: isActive ? "#111" : "rgba(229,229,229,0.9)",
                    boxShadow: isActive ? "0 10px 22px rgba(0,0,0,0.10)" : ui.tabBadge.boxShadow,
                  }}
                  title={p.name}
                >
                  <span style={{ ...ui.dot, background: isActive ? "#22c55e" : "#bdbdbd" }} />
                  {p.name}
                </button>
              );
            })}

            {projects.length === 0 && !loadingProjects && (
              <div style={{ ...ui.muted }}>Проектов пока нет, нажми + и создай первый.</div>
            )}
          </>
        )}
      </div>

      {/* Errors card only */}
      {hint && (
        <div style={{ ...ui.card, marginTop: 12, borderColor: "rgba(240,195,109,0.75)", background: "rgba(255,250,240,0.75)" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Сообщение</div>
          <div style={{ lineHeight: 1.4, fontSize: 13 }}>{hint}</div>
        </div>
      )}

      {/* Add task */}
      <section style={{ ...ui.card, marginTop: 12 }} className="fade-up">
        <div style={{ fontSize: 13, margin: "0 0 10px", opacity: 0.72, fontWeight: 900, letterSpacing: "-0.01em" }}>
          Новая задача
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isAllTasks ? "Выбери проект табом сверху…" : "Например: купить билеты, оплатить аренду…"}
            disabled={isAllTasks || !activeProjectId}
            style={{
              ...ui.input,
              opacity: isAllTasks || !activeProjectId ? 0.6 : 1,
            }}
          />

          <div style={ui.row}>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isAllTasks || !activeProjectId}
              style={{
                ...ui.input,
                padding: "10px 12px",
                opacity: isAllTasks || !activeProjectId ? 0.6 : 1,
              }}
            />

            <button
              type="button"
              onClick={addTask}
              disabled={!canAddTask}
              style={{
                ...ui.btn,
                opacity: canAddTask ? 1 : 0.5,
                cursor: canAddTask ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
                minWidth: 120,
                transform: canAddTask ? "scale(1)" : "scale(0.99)",
              }}
            >
              Добавить
            </button>
          </div>
        </div>

        {isAllTasks && (
          <div style={{ ...ui.muted, marginTop: 10 }}>
            Сейчас выбран режим “Все задачи”. Для добавления выбери конкретный проект табом.
          </div>
        )}
      </section>

      {/* Tasks */}
      <section style={{ ...ui.card, marginTop: 12 }} className="fade-up">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.72, fontWeight: 900, letterSpacing: "-0.01em" }}>Список</div>
          <div style={ui.muted}>{loadingTasks ? "Загружаю…" : `${tasks.length} шт.`}</div>
        </div>

        {!ready ? (
          <SkeletonList />
        ) : loadingTasks ? (
          <SkeletonList />
        ) : tasks.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 10 }}>Пока пусто.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 10 }}>
            {tasks.map((t, idx) => (
              <li
                key={t.id}
                className="fade-up"
                style={{
                  border: "1px solid rgba(233,233,233,0.9)",
                  borderRadius: 16,
                  padding: 12,
                  background: "rgba(255,255,255,0.72)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  boxShadow: "0 12px 26px rgba(0,0,0,0.035)",
                  transition: "opacity 180ms ease, filter 180ms ease, transform 180ms ease, background 180ms ease",
                  opacity: t.done ? 0.74 : 1,
                  filter: t.done ? "blur(0.4px)" : "none", // “успокаиваем” без перебора
                  transform: t.done ? "translateY(1px)" : "translateY(0)",
                  animationDelay: `${Math.min(idx * 25, 120)}ms`,
                }}
              >
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={(e) => toggleDone(t.id, e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2 }}
                  />
                  <div style={{ display: "grid", gap: 6, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        lineHeight: 1.2,
                        textDecoration: t.done ? "line-through" : "none",
                        opacity: t.done ? 0.75 : 1,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {t.title}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {t.due_date && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(229,229,229,0.9)",
                            background: "rgba(250,250,250,0.65)",
                            fontSize: 12,
                            opacity: 0.95,
                          }}
                        >
                          до {fmtDate(t.due_date)}
                        </span>
                      )}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(229,229,229,0.9)",
                          background: "rgba(255,255,255,0.6)",
                          fontSize: 12,
                          opacity: 0.55,
                        }}
                      >
                        id #{t.id}
                      </span>
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Toast успехов */}
      {toast && <div className="toast">{toast}</div>}

      {/* Modal */}
      {showCreateProject && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.30)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => !creatingProject && setShowCreateProject(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "rgba(255,255,255,0.78)",
              borderRadius: 20,
              border: "1px solid rgba(229,229,229,0.9)",
              padding: 14,
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
            className="fade-up"
          >
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, letterSpacing: "-0.01em" }}>
              Новый проект
            </div>

            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Например: работа, дом, спорт…"
              style={ui.input}
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => !creatingProject && setShowCreateProject(false)}
                style={{
                  ...ui.btnGhost,
                  flex: 1,
                  opacity: creatingProject ? 0.6 : 1,
                  cursor: creatingProject ? "not-allowed" : "pointer",
                }}
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={createProject}
                disabled={!newProjectName.trim() || creatingProject}
                style={{
                  ...ui.btn,
                  flex: 1,
                  opacity: !newProjectName.trim() || creatingProject ? 0.6 : 1,
                  cursor: !newProjectName.trim() || creatingProject ? "not-allowed" : "pointer",
                }}
              >
                {creatingProject ? "Создаю..." : "Создать"}
              </button>
            </div>

            <div style={{ ...ui.muted, marginTop: 10 }}>Подсказка: короткие названия читаются лучше.</div>
          </div>
        </div>
      )}
    </main>
  );
}