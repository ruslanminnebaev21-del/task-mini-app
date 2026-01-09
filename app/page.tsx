"use client";

import { useEffect, useMemo, useState } from "react";

type Project = {
  id: number;
  name: string;
  created_at?: string;
};

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  project_id?: number | null;
};

function getTelegramWebApp() {
  // @ts-ignore
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

export default function HomePage() {
  const [ready, setReady] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hint, setHint] = useState<string | null>(null);

  // debug
  const [tgInfo, setTgInfo] = useState({ hasTg: false, initLen: 0 });

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    return projects.find((p) => p.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

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
    try {
      const r = await fetch("/api/projects", { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (!j.ok) {
        if (j.reason === "NO_SESSION") return;
        setHint(j.error || j.reason || "Не смог загрузить проекты");
        return;
      }

      const list: Project[] = j.projects || [];
      setProjects(list);

      // если проект не выбран, выберем первый
      if (!activeProjectId && list.length > 0) {
        setActiveProjectId(list[0].id);
      }

      // если выбранный пропал, сбросим
      if (activeProjectId && !list.some((p) => p.id === activeProjectId)) {
        setActiveProjectId(list[0]?.id ?? null);
      }
    } catch (e: any) {
      setHint(`Ошибка загрузки проектов: ${String(e?.message || e)}`);
    }
  }

  async function loadTasks() {
    try {
      const qs = new URLSearchParams();
      qs.set("view", "today");
      if (activeProjectId) qs.set("projectId", String(activeProjectId));

      const r = await fetch(`/api/tasks?${qs.toString()}`, { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (j.ok) {
        setTasks(j.tasks || []);
        return;
      }

      if (j.reason === "NO_SESSION") return;

      setHint(j.error || j.reason || "Не смог загрузить задачи");
    } catch (e: any) {
      setHint(`Ошибка загрузки задач: ${String(e?.message || e)}`);
    }
  }

  useEffect(() => {
    authIfPossible().then(async () => {
      await loadProjects();
      await loadTasks();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // при смене проекта перезагружаем задачи
  useEffect(() => {
    if (!ready) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, ready]);

  async function createProject() {
    const name = window.prompt("Название проекта");
    if (!name || !name.trim()) return;

    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: name.trim() }),
    });

    const j = await r.json().catch(() => ({} as any));

    if (j.ok) {
      await loadProjects();
      // выберем созданный
      if (j.project?.id) setActiveProjectId(j.project.id);
      return;
    }

    if (j.reason === "NO_SESSION") {
      setHint("Сессии нет. Открой мини-апп кнопкой у бота (Web App), тогда появится сохранение.");
      return;
    }

    setHint(j.error || j.reason || "Ошибка при создании проекта");
  }

  async function addTask() {
    if (!title.trim()) return;

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

      {/* проекты */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={createProject}
            style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer" }}
          >
            Создать проект
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
              onClick={createProject}
              title="Новый проект"
              style={{ width: 42, height: 42, borderRadius: 10, cursor: "pointer" }}
            >
              +
            </button>
          </div>
        )}

        {activeProject && (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
            Текущий проект: <b>{activeProject.name}</b>
          </div>
        )}
      </section>

      {/* добавление задачи */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={projects.length === 0 ? "Сначала создай проект…" : "Добавить задачу…"}
            style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            disabled={projects.length === 0}
          />
          <button
            type="button"
            disabled={!title.trim() || projects.length === 0}
            onClick={addTask}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              opacity: title.trim() && projects.length > 0 ? 1 : 0.5,
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
            style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
            disabled={projects.length === 0}
          />
        </div>
      </section>

      {!ready ? (
        <div style={{ opacity: 0.7 }}>Загружаю…</div>
      ) : tasks.length === 0 ? (
        <div style={{ opacity: 0.7 }}>
          {projects.length === 0 ? "Создай проект, чтобы добавлять задачи." : "Задач нет."}
        </div>
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
                <span style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
              </label>
              {t.due_date && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>до {t.due_date}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}