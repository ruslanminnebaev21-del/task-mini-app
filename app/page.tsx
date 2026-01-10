"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  project_id?: number | null;
  note?: string | null;
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
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [title, setTitle] = useState("");

  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const titleBlurGuard = useRef(false);
  const noteInputRef = useRef<HTMLInputElement | null>(null);

  // дата необязательна
  const [dueDate, setDueDate] = useState<string | null>(null);

  const [loadingTasks, setLoadingTasks] = useState(false);
  const [listMode, setListMode] = useState<"schedule" | "no_date">("schedule");

  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const isAllTasks = activeProjectId === null;

  const DEV_LOCAL_AUTH = process.env.NEXT_PUBLIC_DEV_LOCAL_AUTH === "true";

  const dateISO = (d: Date) => d.toISOString().slice(0, 10);

  const todayISO = useMemo(() => dateISO(new Date()), []);
  const tomorrowISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return dateISO(d);
  }, []);

  const isToday = dueDate === todayISO;
  const isTomorrow = dueDate === tomorrowISO;
  const hasCustomDate = Boolean(dueDate && !isToday && !isTomorrow);
  const canAddTask = Boolean(!isAllTasks && activeProjectId && title.trim());

  type TaskSection = { key: string; label: string; tasks: Task[]; count: number };

  const taskSections = useMemo<TaskSection[]>(() => {
    const byKey = new Map<string, Task[]>();

    for (const t of tasks) {
      const key = t.due_date || "NO_DATE";
      const arr = byKey.get(key) || [];
      arr.push(t);
      byKey.set(key, arr);
    }

    const sections: TaskSection[] = [];

    // сегодня
    if (byKey.has(todayISO)) {
      const todayTasks = byKey.get(todayISO)!;
      sections.push({ key: todayISO, label: "Сегодня", tasks: todayTasks, count: todayTasks.length });
      byKey.delete(todayISO);
    }

    // завтра
    if (byKey.has(tomorrowISO)) {
      const tomorrowTasks = byKey.get(tomorrowISO)!;
      sections.push({ key: tomorrowISO, label: "Завтра", tasks: tomorrowTasks, count: tomorrowTasks.length });
      byKey.delete(tomorrowISO);
    }

    // остальные даты (по возрастанию)
    const otherDates = Array.from(byKey.keys())
      .filter((k) => k !== "NO_DATE")
      .sort((a, b) => a.localeCompare(b));

    for (const d of otherDates) {
      const dt = byKey.get(d)!;
      sections.push({ key: d, label: fmtDate(d), tasks: dt, count: dt.length });
      byKey.delete(d);
    }

    // без даты (на всякий, чтобы не терять задачи)
    if (byKey.has("NO_DATE")) {
      const nd = byKey.get("NO_DATE")!;
      sections.push({ key: "NO_DATE", label: "Без даты", tasks: nd, count: nd.length });
    }

    return sections;
  }, [tasks, todayISO, tomorrowISO]);

  const noDateTasks = useMemo(() => tasks.filter((t) => !t.due_date), [tasks]);

  const ui = {
    shell: {
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden",
    } as CSSProperties,

    container: {
      maxWidth: 720,
      margin: "0 auto",
      padding: 16,
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
      color: "#111",
      position: "relative",
      zIndex: 2,
    } as CSSProperties,

    orb: {
      position: "fixed",
      width: 420,
      height: 420,
      borderRadius: 999,
      filter: "blur(6px)",
      opacity: 0.9,
      zIndex: 1,
      pointerEvents: "none",
    } as CSSProperties,

    orbA: {
      left: -160,
      top: 260,
      background:
        "radial-gradient(circle at 35% 35%, rgba(0,0,0,0.18), rgba(0,0,0,0.05) 55%, transparent 70%)",
      transform: "rotate(10deg)",
    } as CSSProperties,

    orbB: {
      right: -180,
      top: 170,
      background:
        "radial-gradient(circle at 55% 45%, rgba(64, 153, 255, 0.55), rgba(64, 153, 255, 0.18) 48%, transparent 70%)",
      transform: "rotate(-8deg)",
    } as CSSProperties,

    bgFixed: {
      position: "fixed",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      background:
        "radial-gradient(900px 420px at 70% 20%, rgba(77, 165, 255, 0.22), transparent 60%), radial-gradient(750px 380px at 15% 35%, rgba(0,0,0,0.06), transparent 60%), linear-gradient(180deg, #f7f6f2, #f3f1ed)",
    } as CSSProperties,

    card: {
      borderRadius: 22,
      padding: 16,
      background: "rgba(255,255,255,0.62)",
      border: "1px solid rgba(255,255,255,0.7)",
      boxShadow:
        "0 18px 45px rgba(0,0,0,0.08), 0 2px 0 rgba(255,255,255,0.55) inset, 0 -1px 0 rgba(0,0,0,0.03) inset",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as CSSProperties,

    cardTight: {
      borderRadius: 22,
      padding: 14,
      background: "rgba(255,255,255,0.60)",
      border: "1px solid rgba(255,255,255,0.72)",
      boxShadow:
        "0 14px 34px rgba(0,0,0,0.07), 0 2px 0 rgba(255,255,255,0.55) inset, 0 -1px 0 rgba(0,0,0,0.03) inset",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as CSSProperties,

    input: {
      width: "100%",
      padding: "12px 16px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.07)",
      background: "rgba(255,255,255,0.72)",
      boxShadow: "0 1px 0 rgba(255,255,255,0.8) inset, 0 10px 20px rgba(0,0,0,0.05)",
      outline: "none",
      fontSize: 16,
      color: "#111",
    } as CSSProperties,

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
    } as CSSProperties,

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
    } as CSSProperties,

    btnCircle: {
      width: 44,
      height: 44,
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.1)",
      background: "#111",
      color: "#fff",
      fontWeight: 500,
      fontSize: 13,
      cursor: "pointer",
      userSelect: "none",
      boxShadow: "0 16px 30px rgba(0,0,0,0.18)",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
    } as CSSProperties,

    chipBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
      fontSize: 12,
      cursor: "pointer",
      userSelect: "none",
    } as CSSProperties,

    chipBtnActive: {
      border: "1px solid rgba(0,0,0,0.16)",
      background: "rgba(17,17,17,0.92)",
      color: "#fff",
    } as CSSProperties,

    chipIcon: {
      width: 28,
      height: 28,
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
    } as CSSProperties,

    muted: { fontSize: 12, opacity: 0.65 } as CSSProperties,

    headerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 8,
    } as CSSProperties,

    h1: {
      fontSize: 34,
      letterSpacing: -0.6,
      margin: 0,
      lineHeight: "44px",
      fontWeight: 900,
    } as CSSProperties,

    tabWrap: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "center",
      marginTop: 12,
      marginBottom: 12,
    } as CSSProperties,

    tabBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "6px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      fontWeight: 500,
      fontSize: 13,
      cursor: "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
      height: 36,
      color: "#111",
    } as CSSProperties,

    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: "#bdbdbd",
      flex: "0 0 auto",
      boxShadow: "0 0 0 3px rgba(0,0,0,0.04)",
    } as CSSProperties,

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
      fontSize: 13,
      cursor: "pointer",
      userSelect: "none",
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
    } as CSSProperties,

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
    } as CSSProperties,

    segmented: {
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: 0,
      height: 44,
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.58)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.06)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      width: "100%",
      maxWidth: 420,
    } as CSSProperties,

    segmentedInner: {
      position: "relative",
      width: "100%",
      height: "100%",
    } as CSSProperties,

    segThumb: {
      position: "absolute",
      top: 1,
      left: 1,
      width: "calc(50% - 1px)",
      height: "calc(100% - 2px)",
      borderRadius: 999,
      background: "rgba(17,17,17,0.92)",
      boxShadow: "0 12px 20px rgba(0,0,0,0.16)",
      transition: "transform 260ms cubic-bezier(0.18, 0.9, 0.2, 1)",
      willChange: "transform",
    } as CSSProperties,

    segBtnText: {
      position: "relative",
      zIndex: 2,
      flex: 1,
      height: "100%",
      padding: 0,
      borderRadius: 999,
      border: "none",
      background: "transparent",
      fontWeight: 900,
      cursor: "pointer",
      userSelect: "none",
      transition: "color 180ms ease",
      fontSize: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
    } as CSSProperties,

    dayTitle: {
      fontSize: 18,
      fontWeight: 900,
      opacity: 0.85,
      letterSpacing: -0.2,
      marginTop: 6,
    } as CSSProperties,

    chip: {
      display: "inline-flex",
      alignItems: "center",
      padding: "7px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.07)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
      fontSize: 12,
    } as CSSProperties,

    taskItem: {
      borderRadius: 20,
      padding: 14,
      background: "rgba(255,255,255,0.62)",
      border: "1px solid rgba(255,255,255,0.72)",
      boxShadow: "0 16px 34px rgba(0,0,0,0.07)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as CSSProperties,

    notePreview: {
      fontSize: 12,
      opacity: 0.55,
      lineHeight: 1.25,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      whiteSpace: "pre-wrap",
    } as CSSProperties,

    noteHint: {
      fontSize: 12,
      opacity: 0.55,
      cursor: "pointer",
      userSelect: "none",
    } as CSSProperties,
    
noteRow: {
  minHeight: 18,          // фиксируем высоту строки, подбери 18–20
  lineHeight: "18px",     // чтобы подсказка и input совпали по базовой линии
  display: "flex",
  alignItems: "center",
} as CSSProperties,

    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 9999,
    } as CSSProperties,

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
    } as CSSProperties,
  };

  function dotStyle(isActive: boolean): CSSProperties {
    return {
      ...ui.dot,
      background: isActive ? "#22c55e" : "#bdbdbd",
      boxShadow: isActive ? "0 0 0 3px rgba(34,197,94,0.04)" : "0 0 0 3px rgba(0,0,0,0.04)",
    };
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
      // dev режим: авторизуемся локально без Telegram
      if (DEV_LOCAL_AUTH) {
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ initData: "dev" }),
          });

          const j = await r.json().catch(() => ({} as any));
          if (!r.ok || !j.ok) {
            setHint(`Dev auth не прошёл: ${j.reason || r.status}${j.error ? " | " + j.error : ""}`);
          } else {
            setHint(null);
          }
        } catch (e: any) {
          setHint(`Dev auth запрос упал: ${String(e?.message || e)}`);
        }

        setReady(true);
        return;
      }

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

      // просим все, чтобы подтянуть null due_date
      url.searchParams.set("view", "all");
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
        due_date: dueDate, // null = без даты
        projectId: activeProjectId,
      }),
    });

    const j = await r.json().catch(() => ({} as any));

    if (j.ok) {
      setTitle("");
      setDueDate(null);
      await loadTasks();
      return;
    }

    if (j.reason === "NO_SESSION") {
      setHint("Сессии нет. Открой мини-апп кнопкой у бота, тогда появится сохранение.");
      return;
    }

    setHint(j.error || "Ошибка при добавлении задачи");
  }

  async function saveNote(id: number, note: string) {
    const trimmed = note.trim();
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, note: trimmed ? trimmed : null } : t)));

    try {
      const r = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, note: trimmed ? trimmed : null }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setHint(j.error || j.reason || "Не смог сохранить заметку");
        await loadTasks();
      }
    } catch (e: any) {
      setHint(`Ошибка сети при сохранении заметки: ${String(e?.message || e)}`);
      await loadTasks();
    }
  }

  async function toggleDone(id: number, done: boolean) {
    if (togglingIds.has(id)) return;

    const prevDone = tasks.find((t) => t.id === id)?.done;

    setTasks((prevTasks) => prevTasks.map((t) => (t.id === id ? { ...t, done } : t)));

    setTogglingIds((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });

    try {
      const r = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, done }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === id ? { ...t, done: Boolean(prevDone) } : t))
        );
        setHint(j.error || j.reason || "Не смог обновить задачу");
      }
    } catch (e: any) {
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === id ? { ...t, done: Boolean(prevDone) } : t))
      );
      setHint(`Ошибка сети при обновлении: ${String(e?.message || e)}`);
    } finally {
      setTogglingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  function startEdit(t: Task) {
    if (t.done) return;
    if (togglingIds.has(t.id)) return;

    setEditingId(t.id);
    setEditingTitle(t.title);

    setNoteDraft(t.note || "");
    setNoteOpenId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingTitle("");
    setNoteOpenId(null);
    setNoteDraft("");
  }
function startEditNote(t: Task) {
  if (t.done) return;
  if (togglingIds.has(t.id)) return;

  setEditingId(t.id);
  setEditingTitle(t.title);

  setNoteDraft(t.note || "");
  setNoteOpenId(t.id);

  requestAnimationFrame(() => noteInputRef.current?.focus());
}
  async function saveTaskEdits(id: number) {
    const nextTitle = editingTitle.trim();
    const nextNoteRaw = noteDraft.trim();
    const nextNote = nextNoteRaw ? nextNoteRaw : null;

    if (!nextTitle) {
      cancelEdit();
      return;
    }

    const prev = tasks.find((x) => x.id === id);
    const prevTitle = prev?.title ?? "";
    const prevNote = prev?.note ?? null;

    if (prevTitle === nextTitle && prevNote === nextNote) {
      cancelEdit();
      return;
    }

    setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: nextTitle, note: nextNote } : t)));

    try {
      const r = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, title: nextTitle, note: nextNote }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: prevTitle, note: prevNote } : t)));
        setHint(j.error || j.reason || "Не смог сохранить изменения");
        return;
      }
    } catch (e: any) {
      setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: prevTitle, note: prevNote } : t)));
      setHint(`Ошибка сети при сохранении: ${String(e?.message || e)}`);
      return;
    } finally {
      cancelEdit();
    }
  }

  function openNoteEditor(t: Task) {
    titleBlurGuard.current = true;
    setNoteDraft(t.note || "");
    setNoteOpenId(t.id);
    requestAnimationFrame(() => noteInputRef.current?.focus());
  }

  function TaskCard({ t }: { t: Task }) {
    const hasMeta = Boolean((isAllTasks && t.project_id) || t.due_date);
    const isEditing = editingId === t.id;
    const isNoteOpen = noteOpenId === t.id;

    return (
      <div
        style={{
          ...ui.taskItem,
          background: t.done ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.62)",
          opacity: t.done ? 0.82 : 1,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={t.done}
            disabled={togglingIds.has(t.id)}
            onChange={(e) => toggleDone(t.id, e.target.checked)}
            style={{
              width: 18,
              height: 18,
              marginTop: 4,
              cursor: togglingIds.has(t.id) ? "not-allowed" : "pointer",
              opacity: togglingIds.has(t.id) ? 0.6 : 1,
            }}
          />

          <div style={{ display: "grid", gap: 10, flex: 1, minWidth: 0 }}>
 {/* Заголовок */}
{isEditing ? (
  isNoteOpen ? (
    // когда редактируем заметку, заголовок показываем как текст, чтобы не украл фокус
    <div
      style={{
        fontWeight: 900,
        fontSize: 16,
        lineHeight: 1.2,
        minWidth: 0,
        wordBreak: "break-word",
        opacity: 0.9,
      }}
      onPointerDown={(e) => {
        // если ткнули по заголовку во время редактирования заметки, переключаемся на редактирование заголовка
        e.preventDefault();
        setNoteOpenId(null);
        requestAnimationFrame(() => {
          // фокус словит title input за счет autoFocus ниже (потому что isNoteOpen станет false)
        });
      }}
    >
      {editingTitle}
    </div>
  ) : (
    <input
      name={`title-${t.id}`}
      id={`title-${t.id}`}
      autoFocus
      value={editingTitle}
      onChange={(e) => setEditingTitle(e.target.value)}
      onBlur={() => {
        if (titleBlurGuard.current) {
          titleBlurGuard.current = false;
          return;
        }
        saveTaskEdits(t.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveTaskEdits(t.id);
        }
        if (e.key === "Escape") cancelEdit();
      }}
      style={{
        width: "100%",
        border: "none",
        outline: "none",
        background: "transparent",
        fontWeight: 900,
        fontSize: 16,
        lineHeight: 1.2,
        padding: 0,
        margin: 0,
      }}
    />
  )
) : (
  <div
    onClick={() => startEdit(t)}
    style={{
      fontWeight: 900,
      fontSize: 16,
      lineHeight: 1.2,
      textDecoration: t.done ? "line-through" : "none",
      cursor: t.done ? "default" : "text",
      userSelect: "text",
      minWidth: 0,
      wordBreak: "break-word",
    }}
  >
    {t.title}
  </div>
)}

{/* Заметка */}
{isEditing ? (
  isNoteOpen ? (
    <input
      ref={noteInputRef}
      name={`note-${t.id}`}
      id={`note-${t.id}`}
      autoFocus
      value={noteDraft}
      onChange={(e) => setNoteDraft(e.target.value)}
      placeholder="Заметка"
      onBlur={() => {
        saveNote(t.id, noteDraft);
        setNoteOpenId(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveNote(t.id, noteDraft);
          setNoteOpenId(null);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setNoteOpenId(null);
        }
      }}
      style={{
        width: "100%",
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: 12,
        lineHeight: 1.25,
        padding: 0,
        margin: 0,
        opacity: 0.55,
      }}
    />
  ) : t.note ? (
    <div
      style={ui.notePreview}
      onPointerDown={(e) => {
        e.preventDefault();
        openNoteEditor(t);
      }}
    >
      {t.note}
    </div>
  ) : (
    <div
      style={ui.noteHint}
      onPointerDown={(e) => {
        e.preventDefault();
        openNoteEditor(t);
      }}
    >
      Заметка
    </div>
  )
) : t.note ? (
  <div
    style={ui.notePreview}
    onPointerDown={(e) => {
      e.preventDefault();
      startEditNote(t);
    }}
  >
    {t.note}
  </div>
) : null}

            {/* Мета */}
            {hasMeta ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {isAllTasks && t.project_id ? (
                  <span style={{ ...ui.chip, opacity: 0.85 }}>{projectNameById.get(t.project_id) || "Проект"}</span>
                ) : null}
                {t.due_date ? <span style={{ ...ui.chip }}>до {fmtDate(t.due_date)}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
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
      <div style={ui.bgFixed} />

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

        {/* Tabs */}
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

          <button type="button" onClick={() => setActiveProjectId(null)} style={ui.tabBadge}>
            <span style={dotStyle(isAllTasks)} />
            Все задачи
          </button>

          {projects.map((p) => {
            const isActive = activeProjectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProjectId(p.id)}
                style={ui.tabBadge}
                title={p.name}
              >
                <span style={dotStyle(isActive)} />
                {p.name}
              </button>
            );
          })}

          {projects.length === 0 && <div style={ui.muted}>Проектов пока нет, нажми + и создай первый.</div>}
        </div>

        {hint && (
          <div
            style={{
              ...ui.cardTight,
              borderColor: "rgba(240,195,109,0.55)",
              background: "rgba(255,250,240,0.7)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Сообщение</div>
            <div style={{ lineHeight: 1.35 }}>{hint}</div>
          </div>
        )}

        {/* Add task */}
        <section style={{ ...ui.card, marginTop: 14 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                name="newTaskTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isAllTasks ? "Выбери проект табом сверху…" : "Добавьте новую задачу"}
                disabled={isAllTasks || !activeProjectId}
                style={{
                  ...ui.input,
                  flex: 1,
                  opacity: isAllTasks || !activeProjectId ? 0.55 : 1,
                }}
              />

              <button
                type="button"
                onClick={addTask}
                disabled={!canAddTask}
                style={{
                  ...ui.btnCircle,
                  opacity: canAddTask ? 1 : 0.45,
                  cursor: canAddTask ? "pointer" : "not-allowed",
                }}
                title="Добавить"
              >
                +
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={isAllTasks || !activeProjectId}
                onClick={() => setDueDate((prev) => (prev === todayISO ? null : todayISO))}
                style={{
                  ...ui.chipBtn,
                  ...(isToday ? ui.chipBtnActive : null),
                  opacity: isAllTasks || !activeProjectId ? 0.55 : 1,
                  cursor: isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                }}
              >
                Сегодня
              </button>

              <button
                type="button"
                disabled={isAllTasks || !activeProjectId}
                onClick={() => setDueDate((prev) => (prev === tomorrowISO ? null : tomorrowISO))}
                style={{
                  ...ui.chipBtn,
                  ...(isTomorrow ? ui.chipBtnActive : null),
                  opacity: isAllTasks || !activeProjectId ? 0.55 : 1,
                  cursor: isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                }}
              >
                Завтра
              </button>

              <button
                type="button"
                disabled={isAllTasks || !activeProjectId}
                onClick={() => {
                  if (hasCustomDate) {
                    setDueDate(null);
                    return;
                  }
                  const el = document.getElementById("dueDatePicker") as HTMLInputElement | null;
                  el?.showPicker?.();
                  el?.click();
                }}
                style={{
                  ...ui.chipIcon,
                  ...(hasCustomDate ? ui.chipBtnActive : null),
                  opacity: isAllTasks || !activeProjectId ? 0.55 : 1,
                  cursor: isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                }}
                title={dueDate ? `Дата: ${fmtDate(dueDate)}` : "Выбрать дату"}
              >
                📅
              </button>

              <input
                id="dueDatePicker"
                name="dueDatePicker"
                type="date"
                value={dueDate || ""}
                onChange={(e) => setDueDate(e.target.value || null)}
                style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
                tabIndex={-1}
              />
            </div>
          </div>

          {isAllTasks && (
            <div style={{ ...ui.muted, marginTop: 12 }}>
              Сейчас выбран режим “Все задачи”. Для добавления выбери конкретный проект табом.
            </div>
          )}
        </section>

        {/* Mode switch */}
        {ready && !loadingTasks && (
          <div style={{ marginTop: 12 }}>
            <div style={ui.segmented}>
              <div style={ui.segmentedInner}>
                <div
                  style={{
                    ...ui.segThumb,
                    transform: listMode === "schedule" ? "translateX(0)" : "translateX(100%)",
                  }}
                />

                <div
                  style={{
                    position: "relative",
                    zIndex: 3,
                    display: "flex",
                    gap: 0,
                    padding: 0,
                    height: "100%",
                    width: "100%",
                    alignItems: "stretch",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setListMode("schedule")}
                    style={{
                      ...ui.segBtnText,
                      color: listMode === "schedule" ? "#fff" : "rgba(0,0,0,0.55)",
                    }}
                  >
                    Расписание
                  </button>

                  <button
                    type="button"
                    onClick={() => setListMode("no_date")}
                    style={{
                      ...ui.segBtnText,
                      color: listMode === "no_date" ? "#fff" : "rgba(0,0,0,0.55)",
                    }}
                  >
                    Без даты
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lists */}
        {ready && !loadingTasks && (
          <>
            {listMode === "schedule" ? (
              tasks.length === 0 ? (
                <div style={{ opacity: 0.7, marginTop: 12 }}>Пока пусто.</div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 18 }}>
                  {taskSections
                    .filter((s) => s.key !== "NO_DATE")
                    .map((sec) => (
                      <div key={sec.key} style={{ display: "grid", gap: 10 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div style={ui.dayTitle}>{sec.label}</div>
                          <div style={ui.muted}>{sec.count} шт.</div>
                        </div>

                        <div style={{ display: "grid", gap: 14 }}>
                          {sec.tasks.map((t) => (
                            <TaskCard key={t.id} t={t} />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div style={ui.dayTitle}>Задачи</div>
                  <div style={ui.muted}>{noDateTasks.length} шт.</div>
                </div>

                {noDateTasks.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Задач без даты нет.</div>
                ) : (
                  <div style={{ display: "grid", gap: 14 }}>
                    {noDateTasks.map((t) => (
                      <TaskCard key={t.id} t={t} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Modal */}
        {showCreateProject && (
          <div style={ui.overlay} onClick={() => !creatingProject && setShowCreateProject(false)}>
            <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>Новый проект</div>

              <input
                name="newProjectName"
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