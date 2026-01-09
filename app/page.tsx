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

export default function HomePage() {
  const [ready, setReady] = useState(false);

  const [hint, setHint] = useState<string | null>(null);
  const [tgInfo, setTgInfo] = useState({ hasTg: false, initLen: 0 });

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const hasProject = useMemo(() => Number.isFinite(projectId as any) && (projectId as number) > 0, [projectId]);

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
    setProjectsLoading(true);
    try {
      const r = await fetch("/api/projects", { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (j.ok) {
        const list: Project[] = j.projects || [];
        setProjects(list);

        // автоселектим первый проект, если ещё не выбран
        if (!projectId && list.length > 0) {
          setProjectId(list[0].id);
        }
        return;
      }

      if (j.reason === "NO_SESSION") {
        // вне Telegram может быть ок
        setProjects([]);
        return;
      }

      setHint(j.error || j.reason || "Не смог загрузить проекты");
    } catch (e: any) {
      setHint(`Не смог загрузить проекты: ${String(e?.message || e)}`);
    } finally {
      setProjectsLoading(false);
    }
  }

  async function loadToday() {
    setTasksLoading(true);
    try {
      // пока оставляем как было (без project_id), чтобы не ломать твой текущий api/tasks
      const r = await fetch("/api/tasks?view=today", { credentials: "include" });
      const j = await r.json().catch(() => ({} as any));

      if (j.ok) {
        setTasks(j.tasks || []);
        return;
      }

      if (j.reason === "NO_SESSION") return;

      setHint(j.error || j.reason || "Не смог загрузить задачи");
    } catch (e: any) {
      setHint(`Ошибка загрузки: ${String(e?.message || e)}`);
    } finally {
      setTasksLoading(false);
    }
  }

  // ЭТО ТО, ЧЕГО У ТЕБЯ НЕ ХВАТАЛО
 async function openCreateProject() {
  try {
    const name = prompt("Название проекта?");
    if (!name || !name.trim()) return;

    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: name.trim() }),
    });

    const j = await r.json().catch(() => ({} as any));

    if (!r.ok || !j.ok) {
      setHint(`Не смог создать проект: ${j.reason || r.status}${j.error ? " | " + j.error : ""}`);
      return;
    }

    setHint(null);

    // Временно: просто перезагрузим страницу, чтобы увидеть изменения (потом сделаем красиво через state)
    window.location.reload();
  } catch (e: any) {
    setHint(`Создание проекта упало: ${String(e?.message || e)}`);
  }
}
      // добавляем локально и выбираем новый проект
      const created: Project | null = j.project || null;
      if (created?.id) {
        setProjects((prev) => [...prev, created]);
        setProjectId(created.id);
        setHint(null);
      } else {
        // на всякий случай перечитаем
        await loadProjects();
      }
    } catch (e: any) {
      setHint(`Ошибка создания проекта: ${String(e?.message || e)}`);
    } finally {
      setCreatingProject(false);
    }
  }

  async function addTask() {
    if (!hasProject) return;
    if (!title.trim()) return;

    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      // project_id добавляем уже сейчас, даже если api/tasks пока игнорит
      body: JSON.stringify({ title: title.trim(), due_date: dueDate, project_id: projectId }),
    });

    const j = await r.json().catch(() => ({} as any));

    if (j.ok) {
      setTitle("");
      await loadToday();
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
    if (j.ok) await loadToday();
  }

  useEffect(() => {
    (async () => {
      await authIfPossible();
      await loadProjects();
      await loadToday();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* ПРОЕКТЫ */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        {projectsLoading ? (
          <div style={{ opacity: 0.7 }}>Загружаю проекты…</div>
        ) : projects.length === 0 ? (
          <button
  type="button"
  onClick={openCreateProject}
  style={{
    width: "100%",
    padding: "14px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
  }}
>
  Создать проект
</button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={projectId ?? projects[0].id}
              onChange={(e) => setProjectId(Number(e.target.value))}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "white",
              }}
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
                width: 44,
                height: 44,
                borderRadius: 12,
                border: "1px solid #ccc",
                cursor: creatingProject ? "default" : "pointer",
                opacity: creatingProject ? 0.6 : 1,
                background: "transparent",
                fontSize: 22,
                lineHeight: "44px",
              }}
              aria-label="Добавить проект"
              title="Добавить проект"
            >
              +
            </button>
          </div>
        )}
      </section>

      {/* ДОБАВЛЕНИЕ ЗАДАЧ */}
      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={hasProject ? "Добавить задачу…" : "Сначала создай проект…"}
            disabled={!hasProject}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
              opacity: hasProject ? 1 : 0.6,
            }}
          />
          <button
            type="button"
            disabled={!hasProject || !title.trim()}
            onClick={addTask}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              cursor: !hasProject || !title.trim() ? "default" : "pointer",
              opacity: !hasProject || !title.trim() ? 0.5 : 1,
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
            disabled={!hasProject}
            style={{
              padding: 8,
              borderRadius: 10,
              border: "1px solid #ccc",
              opacity: hasProject ? 1 : 0.6,
            }}
          />
        </div>
      </section>

      {/* СПИСОК ЗАДАЧ */}
      {!ready ? (
        <div style={{ opacity: 0.7 }}>Загружаю…</div>
      ) : tasksLoading ? (
        <div style={{ opacity: 0.7 }}>Гружу задачи…</div>
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
                <div>
                  <div style={{ textDecoration: t.done ? "line-through" : "none", fontWeight: 600 }}>{t.title}</div>
                  {t.due_date && <div style={{ opacity: 0.7, marginTop: 4 }}>до {t.due_date}</div>}
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}