"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [hint, setHint] = useState<string | null>(null);

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

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const isAllTasks = activeProjectId === null;
  const canAddTask = Boolean(!isAllTasks && activeProjectId && title.trim());

  const ui = {
    // page + background
    shell: {
      minHeight: "100vh",
      background:
        "radial-gradient(900px 420px at 70% 20%, rgba(77, 165, 255, 0.22), transparent 60%), radial-gradient(750px 380px at 15% 35%, rgba(0,0,0,0.06), transparent 60%), linear-gradient(180deg, #f7f6f2, #f3f1ed)",
      position: "relative",
      overflow: "hidden",
    } as React.CSSProperties,

    container: {
      maxWidth: 720,
      margin: "0 auto",
      padding: 16,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
      color: "#111",
      position: "relative",
      zIndex: 2,
    } as React.CSSProperties,

    // decorative orbs (like the picture vibe)
    orb: {
      position: "absolute",
      width: 420,
      height: 420,
      borderRadius: 999,
      filter: "blur(6px)",
      opacity: 0.9,
      zIndex: 1,
      pointerEvents: "none",
    } as React.CSSProperties,

    orbA: {
      left: -160,
      top: 260,
      background: "radial-gradient(circle at 35% 35%, rgba(0,0,0,0.18), rgba(0,0,0,0.05) 55%, transparent 70%)",
      transform: "rotate(10deg)",
    } as React.CSSProperties,

    orbB: {
      right: -180,
      top: 170,
      background:
        "radial-gradient(circle at 55% 45%, rgba(64, 153, 255, 0.55), rgba(64, 153, 255, 0.18) 48%, transparent 70%)",
      transform: "rotate(-8deg)",
    } as React.CSSProperties,

    // glass card
    card: {
      borderRadius: 22,
      padding: 16,
      background: "rgba(255,255,255,0.62)",
      border: "1px solid rgba(255,255,255,0.7)",
      boxShadow:
        "0 18px 45px rgba(0,0,0,0.08), 0 2px 0 rgba(255,255,255,0.55) inset, 0 -1px 0 rgba(0,0,0,0.03) inset",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as React.CSSProperties,

    cardTight: {
      borderRadius: 22,
      padding: 14,
      background: "rgba(255,255,255,0.60)",
      border: "1px solid rgba(255,255,255,0.72)",
      boxShadow:
        "0 14px 34px rgba(0,0,0,0.07), 0 2px 0 rgba(255,255,255,0.55) inset, 0 -1px 0 rgba(0,0,0,0.03) inset",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as React.CSSProperties,

    row: { display: "flex", gap: 10, alignItems: "center" } as React.CSSProperties,

    // inputs - pill, soft inset
    input: {
      width: "100%",
      padding: "12px 14px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.07)",
      background: "rgba(255,255,255,0.72)",
      boxShadow: "0 1px 0 rgba(255,255,255,0.8) inset, 0 10px 20px rgba(0,0,0,0.05)",
      outline: "none",
      fontSize: 16,
      color: "#111",
    } as React.CSSProperties,

    // buttons
    btnPrimary: {
      padding: "12px 16px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.1)",
      background: "#111",
      color: "#fff",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
      boxShadow: "0 16px 30px rgba(0,0,0,0.18)",
    } as React.CSSProperties,

    btnGhost: {
      padding: "12px 16px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      color: "#111",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
      boxShadow: "0 12px 24px rgba(0,0,0,0.07)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
    } as React.CSSProperties,

    muted: { fontSize: 12, opacity: 0.65 } as React.CSSProperties,

    // header
    headerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 8,
    } as React.CSSProperties,

    h1: {
      fontSize: 34,
      letterSpacing: -0.6,
      margin: 0,
      lineHeight: "44px",
      fontWeight: 900,
    } as React.CSSProperties,

    // tabs
    tabWrap: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      marginTop: 12,
      marginBottom: 12,
    } as React.CSSProperties,

    tabBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
      height: 36,
    } as React.CSSProperties,

    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: "#bdbdbd",
      flex: "0 0 auto",
      boxShadow: "0 0 0 3px rgba(0,0,0,0.04)",
    } as React.CSSProperties,

    tabPlus: {
      width: 36,
      height: 36,
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      color: "#111",
      fontWeight: 500,
      fontSize: 16,
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
    } as React.CSSProperties,

    refresh: {
      width: 44,
      height: 44,
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 14px 28px rgba(0,0,0,0.07)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      color: "#111",
      fontWeight: 900,
      fontSize: 18,
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
    } as React.CSSProperties,

    sectionTitle: {
      fontSize: 14,
      opacity: 0.7,
      fontWeight: 900,
      letterSpacing: 0.2,
      margin: "0 0 12px",
    } as React.CSSProperties,

    // chips
    chip: {
      display: "inline-flex",
      alignItems: "center",
      padding: "7px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.07)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
      fontSize: 12,
    } as React.CSSProperties,

    // task item
    taskItem: {
      borderRadius: 20,
      padding: 14,
      background: "rgba(255,255,255,0.62)",
      border: "1px solid rgba(255,255,255,0.72)",
      boxShadow: "0 16px 34px rgba(0,0,0,0.07)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as React.CSSProperties,

    // modal overlay + card
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 9999,
    } as React.CSSProperties,

    modal: {
      width: "100%",
      maxWidth: 520,
      borderRadius: 26,
      padding: 16,
      background: "rgba(255,255,255,0.62)",
      border: "1px solid rgba(255,255,255,0.75)",
      boxShadow: "0 22px 60px rgba(0,0,0,0.25)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    } as React.CSSProperties,
  };

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
      if (j.project?.id) setActiveProjectId(Number(j.project.id));
      setShowCreateProject(false);
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
    <div style={ui.shell}>
      <div style={{ ...ui.orb, ...ui.orbA }} />
      <div style={{ ...ui.orb, ...ui.orbB }} />

      <main style={ui.container}>
        {/* Header */}
        <div style={ui.headerRow}>
          <h1 style={ui.h1}>Задачи</h1>

          <button
            type="button"
            onClick={() => loadTasks()}
            disabled={loadingTasks}
            style={{
              ...ui.refresh,
              opacity: loadingTasks ? 0.6 : 1,
              cursor: loadingTasks ? "not-allowed" : "pointer",
            }}
            title="Обновить"
          >
            ↻
          </button>
        </div>

        {/* Tabs at top */}
        <div style={ui.tabWrap}>
          {/* + before "Все задачи" */}
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

          {/* All tasks */}
          <button
            type="button"
            onClick={() => setActiveProjectId(null)}
            style={{
              ...ui.tabBadge,
              background: isAllTasks ? "#111" : "rgba(255,255,255,0.62)",
              color: isAllTasks ? "#fff" : "#111",
              borderColor: isAllTasks ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)",
              boxShadow: isAllTasks ? "0 18px 34px rgba(0,0,0,0.22)" : ui.tabBadge.boxShadow,
            }}
          >
            <span style={{ ...ui.dot, background: isAllTasks ? "#22c55e" : "#bdbdbd" }} />
            Все задачи
          </button>

          {projects.map((p) => {
            const isActive = activeProjectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProjectId(p.id)}
                style={{
                  ...ui.tabBadge,
                  background: isActive ? "#111" : "rgba(255,255,255,0.62)",
                  color: isActive ? "#fff" : "#111",
                  borderColor: isActive ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)",
                  boxShadow: isActive ? "0 18px 34px rgba(0,0,0,0.22)" : ui.tabBadge.boxShadow,
                }}
                title={p.name}
              >
                <span style={{ ...ui.dot, background: isActive ? "#22c55e" : "#bdbdbd" }} />
                {p.name}
              </button>
            );
          })}

          {projects.length === 0 && <div style={ui.muted}>Проектов пока нет, нажми + и создай первый.</div>}
        </div>

        {hint && (
          <div style={{ ...ui.cardTight, borderColor: "rgba(240,195,109,0.55)", background: "rgba(255,250,240,0.7)" }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Сообщение</div>
            <div style={{ lineHeight: 1.35 }}>{hint}</div>
          </div>
        )}

        {/* Add task */}
        <section style={{ ...ui.card, marginTop: 14 }}>
          <div style={ui.sectionTitle}>Новая задача</div>

          <div style={{ display: "grid", gap: 12 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isAllTasks ? "Выбери проект табом сверху…" : "Например: купить билеты, оплатить аренду…"}
              disabled={isAllTasks || !activeProjectId}
              style={{
                ...ui.input,
                opacity: isAllTasks || !activeProjectId ? 0.55 : 1,
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
                  padding: "11px 14px",
                  opacity: isAllTasks || !activeProjectId ? 0.55 : 1,
                }}
              />

              <button
                type="button"
                onClick={addTask}
                disabled={!canAddTask}
                style={{
                  ...ui.btnPrimary,
                  opacity: canAddTask ? 1 : 0.45,
                  cursor: canAddTask ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                  minWidth: 130,
                }}
              >
                Добавить
              </button>
            </div>
          </div>

          {isAllTasks && (
            <div style={{ ...ui.muted, marginTop: 12 }}>
              Сейчас выбран режим “Все задачи”. Для добавления выбери конкретный проект табом.
            </div>
          )}
        </section>

        {/* Tasks */}
        <section style={{ ...ui.card, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={ui.sectionTitle}>Список</div>
            <div style={ui.muted}>{loadingTasks ? "Загружаю…" : `${tasks.length} шт.`}</div>
          </div>

          {!ready ? (
            <div style={{ opacity: 0.7 }}>Загружаю…</div>
          ) : loadingTasks ? (
            <div style={{ opacity: 0.7 }}>Загружаю задачи…</div>
          ) : tasks.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Пока пусто.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {tasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    ...ui.taskItem,
                    background: t.done ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.62)",
                    opacity: t.done ? 0.82 : 1,
                  }}
                >
                  <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => toggleDone(t.id, e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 3 }}
                    />

                    <div style={{ display: "grid", gap: 10, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 16,
                          lineHeight: 1.2,
                          textDecoration: t.done ? "line-through" : "none",
                        }}
                      >
                        {t.title}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {t.due_date && <span style={{ ...ui.chip }}>до {fmtDate(t.due_date)}</span>}
                        <span style={{ ...ui.chip, opacity: 0.55 }}>id #{t.id}</span>
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Modal */}
        {showCreateProject && (
          <div style={ui.overlay} onClick={() => !creatingProject && setShowCreateProject(false)}>
            <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>Новый проект</div>

              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Например: работа, дом, спорт…"
                style={ui.input}
                autoFocus
              />

              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
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
                    ...ui.btnPrimary,
                    flex: 1,
                    opacity: !newProjectName.trim() || creatingProject ? 0.55 : 1,
                    cursor: !newProjectName.trim() || creatingProject ? "not-allowed" : "pointer",
                  }}
                >
                  {creatingProject ? "Создаю..." : "Создать"}
                </button>
              </div>

              <div style={{ ...ui.muted, marginTop: 12 }}>Подсказка: короткие названия читаются лучше.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}