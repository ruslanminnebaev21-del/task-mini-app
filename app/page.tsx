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
    page: {
      maxWidth: 720,
      margin: "0 auto",
      padding: 16,
      fontFamily: "system-ui",
      color: "#111",
    } as React.CSSProperties,
    card: {
      border: "1px solid #e5e5e5",
      borderRadius: 16,
      padding: 14,
      background: "#fff",
    } as React.CSSProperties,
    row: { display: "flex", gap: 10, alignItems: "center" } as React.CSSProperties,
    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 12,
      border: "1px solid #d7d7d7",
      outline: "none",
      fontSize: 16,
    } as React.CSSProperties,
    btn: {
      padding: "12px 14px",
      borderRadius: 12,
      border: "1px solid #d7d7d7",
      background: "#111",
      color: "#fff",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
    } as React.CSSProperties,
    btnGhost: {
      padding: "12px 14px",
      borderRadius: 12,
      border: "1px solid #d7d7d7",
      background: "#fff",
      color: "#111",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
    } as React.CSSProperties,
    btnIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      border: "1px solid #d7d7d7",
      background: "#fff",
      color: "#111",
      fontWeight: 900,
      fontSize: 18,
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
    } as React.CSSProperties,
    muted: { fontSize: 12, opacity: 0.65 } as React.CSSProperties,
    h1: { fontSize: 22, margin: 0 } as React.CSSProperties,

    // tabs -> wrap instead of horizontal scroll
    tabWrap: {
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      marginTop: 12,
    } as React.CSSProperties,

    tabGrid: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      flex: "1 1 auto",
    } as React.CSSProperties,

    tabBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid #e5e5e5",
      background: "#fff",
      fontWeight: 800,
      cursor: "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
    } as React.CSSProperties,

    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: "#bdbdbd",
      flex: "0 0 auto",
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
    <main style={ui.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h1 style={ui.h1}>Задачи</h1>

          {/* Tabs under header, wrap into lines */}
          <div style={ui.tabWrap}>
            <div style={ui.tabGrid}>
              {/* All tasks */}
              <button
                type="button"
                onClick={() => setActiveProjectId(null)}
                style={{
                  ...ui.tabBadge,
                  background: isAllTasks ? "#111" : "#fff",
                  color: isAllTasks ? "#fff" : "#111",
                  borderColor: isAllTasks ? "#111" : "#e5e5e5",
                }}
              >
                <span
                  style={{
                    ...ui.dot,
                    background: isAllTasks ? "#22c55e" : "#bdbdbd",
                  }}
                />
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
                      background: isActive ? "#111" : "#fff",
                      color: isActive ? "#fff" : "#111",
                      borderColor: isActive ? "#111" : "#e5e5e5",
                    }}
                    title={p.name}
                  >
                    <span
                      style={{
                        ...ui.dot,
                        background: isActive ? "#22c55e" : "#bdbdbd",
                      }}
                    />
                    {p.name}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={openCreateProject}
              disabled={creatingProject || loadingProjects}
              style={{
                ...ui.btnIcon,
                opacity: creatingProject || loadingProjects ? 0.6 : 1,
                cursor: creatingProject || loadingProjects ? "not-allowed" : "pointer",
              }}
              title="Новый проект"
            >
              +
            </button>
          </div>

          {/* убрали бейдж активного проекта полностью */}
          {projects.length === 0 && (
            <div style={{ ...ui.muted, marginTop: 10 }}>Проектов пока нет, нажми + и создай первый.</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => loadTasks()}
          disabled={loadingTasks}
          style={{
            ...ui.btnGhost,
            opacity: loadingTasks ? 0.6 : 1,
            cursor: loadingTasks ? "not-allowed" : "pointer",
            minWidth: 56,
          }}
          title="Обновить"
        >
          ↻
        </button>
      </div>

      {hint && (
        <div style={{ ...ui.card, marginTop: 12, borderColor: "#f0c36d", background: "#fffaf0" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Сообщение</div>
          <div style={{ lineHeight: 1.35 }}>{hint}</div>
        </div>
      )}

      {/* Add task */}
      <section style={{ ...ui.card, marginTop: 12 }}>
        <div style={{ fontSize: 14, margin: "0 0 10px", opacity: 0.75, fontWeight: 800 }}>Новая задача</div>

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
      <section style={{ ...ui.card, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 800 }}>Список</div>
          <div style={ui.muted}>{loadingTasks ? "Загружаю…" : `${tasks.length} шт.`}</div>
        </div>

        {!ready ? (
          <div style={{ opacity: 0.7 }}>Загружаю…</div>
        ) : loadingTasks ? (
          <div style={{ opacity: 0.7 }}>Загружаю задачи…</div>
        ) : tasks.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Пока пусто.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 10 }}>
            {tasks.map((t) => (
              <li
                key={t.id}
                style={{
                  border: "1px solid #e9e9e9",
                  borderRadius: 14,
                  padding: 12,
                  background: t.done ? "#fafafa" : "#fff",
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
                        opacity: t.done ? 0.6 : 1,
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
                            border: "1px solid #e5e5e5",
                            background: "#fafafa",
                            fontSize: 12,
                            opacity: 0.9,
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
                          border: "1px solid #e5e5e5",
                          background: "#fff",
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

      {/* Modal */}
      {showCreateProject && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
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
              background: "#fff",
              borderRadius: 18,
              border: "1px solid #e5e5e5",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Новый проект</div>

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