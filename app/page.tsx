"use client";

import { useEffect, useState } from "react";

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
};

function getInitDataSafe() {
  // @ts-ignore
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
  return tg?.initData || "";
}

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hint, setHint] = useState<string | null>(null);

  async function authIfPossible() {
    const initData = getInitDataSafe();

    if (!initData) {
      setHint("Открой это из Telegram как Web App (кнопкой у бота), тогда появится сохранение в облаке.");
      setReady(true);
      return;
    }

    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    if (!r.ok) {
      setHint("Не смог авторизоваться через Telegram. Проверь токен бота и .env.local.");
    }

    setReady(true);
  }

  async function loadToday() {
    const r = await fetch("/api/tasks?view=today");
    const j = await r.json();
    if (j.ok) setTasks(j.tasks);
    if (!j.ok && j.reason === "NO_SESSION") {
      // пока не авторизованы
    }
  }

  useEffect(() => {
    authIfPossible().then(() => loadToday());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addTask() {
    if (!title.trim()) return;

    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: title.trim(), due_date: dueDate }),
    });

    const j = await r.json();
    if (j.ok) {
      setTitle("");
      loadToday();
    } else if (j.reason === "NO_SESSION") {
      setHint("Сначала нужно открыть мини-апп внутри Telegram, чтобы появилась сессия.");
    } else {
      setHint(j.error ?? "Ошибка при добавлении задачи");
    }
  }

  async function toggleDone(id: number, done: boolean) {
    const r = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, done }),
    });

    const j = await r.json();
    if (j.ok) loadToday();
  }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Сегодня</h1>

      {hint && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
          {hint}
        </div>
      )}

      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Добавить задачу…"
            style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
          <button onClick={addTask} style={{ padding: "10px 12px", borderRadius: 10 }}>
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

      {!ready ? (
        <div style={{ opacity: 0.7 }}>Загружаю…</div>
      ) : tasks.length === 0 ? (
        <div style={{ opacity: 0.7 }}>На сегодня задач нет.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {tasks.map((t) => (
            <li key={t.id} style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={t.done} onChange={(e) => toggleDone(t.id, e.target.checked)} />
                <span style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
