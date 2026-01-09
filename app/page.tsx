"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  project_id: number | null;
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

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // debug
  const [tgInfo, setTgInfo] = useState({ hasTg: false, initLen: 0 });

  // projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
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

  async function authIfPossible() {
    const tg = getTelegramWebApp();
    const initData = tg?.initData || "";

    setTgInfo({ hasTg: !!tg, initLen: initData.length });

    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch {}
    }

    if (!initData) {
      setHint("Открой это из Telegram как Web App (кнопкой у бота), тогда появится сохранение в облаке.");
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

      if (list.length > 0) {
        setActiveProjectId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0].id;
        });
      } else {
        setActiveProjectId(null);
        setTasks([]);
      }
    } catch (e: any) {
      setHint(`Не смог загрузить проекты: ${String(e?.message || e)}`);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadTasks() {
    // если проект не выбран, задачи не грузим и не показываем
    if (!activeProjectId) {
      setTasks([]);
      return;
    }

    setLoadingTasks(true);
    try {
      const url = new URL("/api/tasks", window.location.origin);
      url.searchParams.set("view", "today");
      url.searchParams.set("project_id", String(activeProjectId)); // ВАЖНО

      const r = await fetch(url.toString(), { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (j.ok) {
        // на всякий случай дополнительно фильтруем на фронте
        const list: Task[] = j.tasks || [];
        setTasks(list.filter((t) => Number(t.project_id) === Number(activeProjectId)));
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

      const newId = Number(j.project?.id);
      setShowCreateProject(false);
      setHint(null);

      // Важно: сначала обновим список проектов, потом выставим активный
      await loadProjects();
      if (Number.isFinite(newId) && newId > 0) setActiveProjectId(newId);
    } catch (e: any) {
      setHint(`Ошибка создания проекта: ${String(e?.message || e)}`);
    } finally {
      setCreatingProject(false);
    }
  }

  async function addTask() {
    if (!title.trim()) return;

    if (!activeProjectId) {
      setHint("Сначала создай проект.");
      return;
    }

    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: title.trim(),
        due_date: dueDate,
        project_id: activeProjectId, // ВАЖНО
      }),
    });

    const j = await r.json().catch(() => ({} as any));

    if (j.ok) {
      setTitle("");
      await loadTasks();
      return;
    }

    if (j.reason === "NO_SESSION") {
      setHint("Сессии нет. Открой мини-апп кнопкой у бота (Web App), тогда появится сохранение.");
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
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Сегодня</h1>

      {hint && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 10 }}>
          {hint}
        </div>
      )}

      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 12 }}>
        debug: hasTg={String(tgInfo.hasTg)} initLen={tgInfo.initLen}
      </div>

      {/* Projects row */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={openCreateProject}
            disabled={creatingProject || loadingProjects}
            style={{
              width: "100%",
              padding: "14px 12px",
              borderRadius: 12,
              cursor: creatingProject ? "not-allowed" : "pointer",
              opacity: creatingProject ? 0.6 : 1,
              fontSize: 18,
            }}
          >
            {creatingProject ? "Создаю..." : "Создать проект"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={activeProjectId ?? ""}
              onChange={(e) => setActiveProjectId(e.target.value ? Number(e.target.value) : null)}
              style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={openCreateProject}
              disabled={creatingProject}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                cursor: creatingProject ? "not-allowed" : "pointer",
                opacity: creatingProject ? 0.6 : 1,
                fontWeight: 700,
              }}
              title="Создать проект"
            >
              +
            </button>
          </div>
        )}

        {projects.length > 0 && activeProject && (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Текущий проект: <b>{activeProject.name}</b>
          </div>
        )}
      </section>

      {/* Add task */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={activeProjectId ? "Добавить задачу…" : "Сначала создай проект…"}
            disabled={!activeProjectId}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
              opacity: activeProjectId ? 1 : 0.6,
            }}
          />
          <button
            type="button"
            disabled={!title.trim() || !activeProjectId}
            onClick={addTask}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: !title.trim() || !activeProjectId ? "not-allowed" : "pointer",
              opacity: !title.trim() || !activeProjectId ? 0.5 : 1,
            }}
          >
            Добавить
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>Дата</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={!activeProjectId}
            style={{
              padding: 8,
              borderRadius: 10,
              border: "1px solid #ccc",
              opacity: activeProjectId ? 1 : 0.6,
            }}
          />
        </div>
      </section>

      {/* Tasks */}
      {!ready ? (
        <div style={{ opacity: 0.7 }}>Загружаю…</div>
      ) : !activeProjectId ? (
        <div style={{ opacity: 0.7 }}>Сначала создай или выбери проект.</div>
      ) : loadingTasks ? (
        <div style={{ opacity: 0.7 }}>Загружаю задачи…</div>
      ) : tasks.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Задач нет.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {tasks.map((t) => (
            <li key={t.id} style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => toggleDone(t.id, e.target.checked)}
                />
                <div style={{ display: "grid", gap: 4 }}>
                  <span style={{ textDecoration: t.done ? "line-through" : "none", fontWeight: 600 }}>
                    {t.title}
                  </span>
                  {t.due_date && <span style={{ fontSize: 12, opacity: 0.7 }}>до {t.due_date}</span>}
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}

      {/* Modal create project */}
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
              borderRadius: 16,
              border: "1px solid #ddd",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Новый проект</div>

            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Например: Choup, ремонт, переезд…"
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              autoFocus
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => !creatingProject && setShowCreateProject(false)}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  cursor: creatingProject ? "not-allowed" : "pointer",
                  opacity: creatingProject ? 0.6 : 1,
                }}
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={createProject}
                disabled={!newProjectName.trim() || creatingProject}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  cursor: !newProjectName.trim() || creatingProject ? "not-allowed" : "pointer",
                  opacity: !newProjectName.trim() || creatingProject ? 0.6 : 1,
                  fontWeight: 700,
                }}
              >
                {creatingProject ? "Создаю..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}