"use client";

import { useEffect, useState } from "react";

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
};

type Project = {
  id: number;
  name: string;
};

function getTelegramWebApp() {
  // @ts-ignore
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

export default function HomePage() {
  const [ready, setReady] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hint, setHint] = useState<string | null>(null);

  const [tgInfo, setTgInfo] = useState({ hasTg: false, initLen: 0 });

  // ---------- AUTH ----------

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
        setHint(`Auth не прошёл: ${j?.reason || r.status}${j?.error ? " | " + j.error : ""}`);
      } else {
        setHint(null);
      }
    } catch (e: any) {
      setHint(`Auth запрос упал: ${String(e?.message || e)}`);
    }

    setReady(true);
  }

  // ---------- PROJECTS ----------

  async function loadProjects() {
    try {
      const r = await fetch("/api/projects", { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (j?.ok) {
        setProjects(j.projects || []);
        if (!currentProjectId && j.projects?.length) {
          setCurrentProjectId(j.projects[0].id);
        }
        return;
      }

      if (j?.reason === "NO_SESSION") {
        return;
      }

      setHint(`Projects: ${j?.reason || r.status}${j?.error ? " | " + j.error : ""}`);
    } catch (e: any) {
      setHint(`Projects запрос упал: ${String(e?.message || e)}`);
    }
  }

  async function createProject() {
    const name = prompt("Название проекта");
    if (!name) return;

    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (j?.ok) {
        await loadProjects();
        setCurrentProjectId(j.project.id);
        return;
      }

      setHint(`Create project: ${j?.reason || r.status}${j?.error ? " | " + j.error : ""}`);
    } catch (e: any) {
      setHint(`Create project упал: ${String(e?.message || e)}`);
    }
  }

  // ---------- TASKS ----------

  async function loadTasks() {
    if (!currentProjectId) return;

    try {
      const r = await fetch(`/api/tasks?project_id=${currentProjectId}`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({} as any));

      if (j?.ok) {
        setTasks(j.tasks || []);
        return;
      }

      if (j?.reason === "NO_SESSION") return;

      setHint(`Tasks: ${j?.reason || r.status}${j?.error ? " | " + j.error : ""}`);
    } catch (e: any) {
      setHint(`Tasks запрос упал: ${String(e?.message || e)}`);
    }
  }

  async function addTask() {
    if (!title.trim() || !currentProjectId) return;

    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          due_date: dueDate,
          project_id: currentProjectId,
        }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (j?.ok) {
        setTitle("");
        await loadTasks();
        return;
      }

      if (j?.reason === "NO_SESSION") {
        setHint("Сессии нет. Открой мини-апп кнопкой у бота (Web App).");
        return;
      }

      setHint(j?.error || "Ошибка при добавлении задачи");
    } catch (e: any) {
      setHint(`Add task упал: ${String(e?.message || e)}`);
    }
  }

  async function toggleDone(id: number, done: boolean) {
    try {
      const r = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, done }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (j?.ok) await loadTasks();
    } catch {}
  }

  // ---------- EFFECTS ----------

  useEffect(() => {
    authIfPossible().then(() => loadProjects());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  // ---------- UI ----------

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

      {/* PROJECT SELECT */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        {projects.length === 0 ? (
          <button onClick={createProject}>Создать проект</button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={currentProjectId ?? ""}
              onChange={(e) => setCurrentProjectId(Number(e.target.value))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={createProject}>+</button>
          </div>
        )}
      </section>

      {/* ADD TASK */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              currentProjectId ? "Добавить задачу…" : "Сначала создай проект…"
            }
            disabled={!currentProjectId}
            style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
          <button
            type="button"
            disabled={!title.trim() || !currentProjectId}
            onClick={addTask}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              opacity: title.trim() && currentProjectId ? 1 : 0.5,
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
          />
        </div>
      </section>

      {/* TASK LIST */}
      {!ready ? (
        <div style={{ opacity: 0.7 }}>Загружаю…</div>
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
                <span style={{ textDecoration: t.done ? "line-through" : "none" }}>
                  {t.title}
                </span>
                {t.due_date && (
                  <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.6 }}>
                    до {t.due_date}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}