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
	console.log("INIT DATA:", data);
  	return data;
}

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hint, setHint] = useState<string | null>(null);
  const [tgInfo, setTgInfo] = useState({ hasTg: false, initLen: 0 });
  
  async function authIfPossible() {

  // @ts-ignore
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
  const initData = tg?.initData || "";

  setTgInfo({ hasTg: !!tg, initLen: initData.length });

  if (!initData) {
    setHint("initData пустой. Значит Telegram не отдал данные, сессия не создастся.");
    setReady(true);
    return;
  }

  const initData = getInitDataSafe();

  if (!initData) {
    setHint("Я открыт не внутри Telegram. Открой через кнопку Web App у бота.");
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
      setHint(`Auth не прошёл: ${j.reason || j.error || r.status}`);
    } else {
      setHint(null);
    }
  } catch (e: any) {
    setHint(`Auth запрос упал: ${String(e?.message || e)}`);
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

  useEffect(() => {// @ts-ignore
 	 const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;

 	 if (tg) {
 	   try {
 	     tg.ready();
 	     tg.expand();
 	   } catch {}
	  }

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
	
	<div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
  		debug: hasTg={String(tgInfo.hasTg)} initLen={tgInfo.initLen}
	</div>

      <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Добавить задачу…"
            style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
	<button
 		 type="button"
 		 disabled={!title.trim()}
 		 onClick={addTask}
	 	 style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", opacity: title.trim() ? 1 : 0.5 }}
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
