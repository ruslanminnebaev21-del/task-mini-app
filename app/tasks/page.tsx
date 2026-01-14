// app/tasks/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { IconTrash, IconPlus, IconEdit } from "@/app/components/icons";
import AppMenu from "@/app/components/AppMenu/AppMenu";
import { useTelegramAuth } from "@/app/hooks/useTelegramAuth";

type Task = {
  id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  completed_at?: string | null;
  project_id?: number | null;
  note?: string | null;
};

type Project = {
  id: number;
  name: string;
  created_at: string;
};

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map((x) => Number(x));
  if (!y || !m || !day) return d;
  return `${day.toString().padStart(2, "0")}.${m.toString().padStart(2, "0")}.${y}`;
}

function isoDayFromTs(ts?: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HomePage() {
  // ✅ auth теперь в хуке
  const { ready: authReady, hint: authHint } = useTelegramAuth();

  // локальный hint для ошибок проектов/тасков/сети
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
  const [title, setTitle] = useState("");
  const [viewMode, setViewMode] = useState<"all" | "completed">("all");

  // edit task modal
  const [showEditTask, setShowEditTask] = useState(false);
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingEditTask, setSavingEditTask] = useState(false);

  // delete task confirm modal
  const [showDeleteTask, setShowDeleteTask] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);

  const editTitleRef = useRef<HTMLInputElement | null>(null);
  const editNoteRef = useRef<HTMLInputElement | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const dueDateRef = useRef<HTMLInputElement | null>(null);

  // edit projects modal
  type EditableProject = { id: number; name: string; originalName: string; deleted?: boolean };

  const [showEditProjects, setShowEditProjects] = useState(false);
  const [editProjects, setEditProjects] = useState<EditableProject[]>([]);
  const [savingProjectsEdit, setSavingProjectsEdit] = useState(false);

  const [editDueDate, setEditDueDate] = useState<string | null>(null);
  const editDueDateRef = useRef<HTMLInputElement | null>(null);

  const [dueDate, setDueDate] = useState<string | null>(null);

  const [loadingTasks, setLoadingTasks] = useState(false);
  const [listMode, setListMode] = useState<"schedule" | "no_date">("schedule");

  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const isAllTasks = activeProjectId === null;

  const dateISO = (d: Date) => d.toISOString().slice(0, 10);

  const todayISO = useMemo(() => dateISO(new Date()), []);
  const tomorrowISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return dateISO(d);
  }, []);
  const yesterdayISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateISO(d);
  }, []);

  const isToday = dueDate === todayISO;
  const isTomorrow = dueDate === tomorrowISO;
  const hasCustomDate = Boolean(dueDate && !isToday && !isTomorrow);
  const canAddTask = Boolean(!isAllTasks && activeProjectId !== null && title.trim());

  type TaskSection = { key: string; label: string; tasks: Task[]; count: number };

  const taskSections = useMemo<TaskSection[]>(() => {
    const byKey = new Map<string, Task[]>();

    for (const t of tasks) {
      if (t.done) continue;
      const key = t.due_date || "NO_DATE";
      const arr = byKey.get(key) || [];
      arr.push(t);
      byKey.set(key, arr);
    }

    const sections: TaskSection[] = [];

    const overdueDates = Array.from(byKey.keys())
      .filter((k) => k !== "NO_DATE" && k < todayISO)
      .sort((a, b) => a.localeCompare(b));

    const overdueTasks: Task[] = [];
    for (const d of overdueDates) {
      overdueTasks.push(...(byKey.get(d) || []));
      byKey.delete(d);
    }

    if (overdueTasks.length > 0) {
      sections.push({ key: "OVERDUE", label: "Вышел срок", tasks: overdueTasks, count: overdueTasks.length });
    }

    if (byKey.has(todayISO)) {
      const todayTasks = byKey.get(todayISO)!;
      sections.push({ key: todayISO, label: "Сегодня", tasks: todayTasks, count: todayTasks.length });
      byKey.delete(todayISO);
    }

    if (byKey.has(tomorrowISO)) {
      const tomorrowTasks = byKey.get(tomorrowISO)!;
      sections.push({ key: tomorrowISO, label: "Завтра", tasks: tomorrowTasks, count: tomorrowTasks.length });
      byKey.delete(tomorrowISO);
    }

    const otherDates = Array.from(byKey.keys())
      .filter((k) => k !== "NO_DATE")
      .sort((a, b) => a.localeCompare(b));

    for (const d of otherDates) {
      const dt = byKey.get(d)!;
      sections.push({ key: d, label: fmtDate(d), tasks: dt, count: dt.length });
      byKey.delete(d);
    }

    if (byKey.has("NO_DATE")) {
      const nd = byKey.get("NO_DATE")!;
      sections.push({ key: "NO_DATE", label: "Без даты", tasks: nd, count: nd.length });
    }

    return sections;
  }, [tasks, todayISO, tomorrowISO]);

  const completedSections = useMemo<TaskSection[]>(() => {
    const doneTasks = tasks
      .filter((t) => t.done && t.completed_at)
      .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));

    const byKey = new Map<string, Task[]>();

    for (const t of doneTasks) {
      const key = isoDayFromTs(t.completed_at) || "NO_DATE";
      const arr = byKey.get(key) || [];
      arr.push(t);
      byKey.set(key, arr);
    }

    const sections: TaskSection[] = [];

    if (byKey.has(todayISO)) {
      const arr = byKey.get(todayISO)!;
      sections.push({ key: todayISO, label: "Сегодня", tasks: arr, count: arr.length });
      byKey.delete(todayISO);
    }

    if (byKey.has(yesterdayISO)) {
      const arr = byKey.get(yesterdayISO)!;
      sections.push({ key: yesterdayISO, label: "Вчера", tasks: arr, count: arr.length });
      byKey.delete(yesterdayISO);
    }

    const otherDates = Array.from(byKey.keys())
      .filter((k) => k !== "NO_DATE")
      .sort((a, b) => b.localeCompare(a));

    for (const d of otherDates) {
      const arr = byKey.get(d)!;
      sections.push({ key: d, label: fmtDate(d), tasks: arr, count: arr.length });
    }

    if (byKey.has("NO_DATE")) {
      const arr = byKey.get("NO_DATE")!;
      sections.push({ key: "NO_DATE", label: "Без даты", tasks: arr, count: arr.length });
    }

    return sections;
  }, [tasks, todayISO, yesterdayISO]);

  const noDateTasks = useMemo(() => tasks.filter((t) => !t.due_date && !t.done), [tasks]);

  const ui = {
    shell: {
      minHeight: "100vh",
      position: "relative",
      overflowX: "hidden",
      overflowY: "visible",
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

    listsWrap: {
      marginTop: 12,
      position: "relative",
      display: "grid",
      gridTemplateColumns: "1fr",
      overflowX: "hidden",
    } as CSSProperties,

    panel: {
      gridColumn: "1 / 1",
      gridRow: "1 / 1",
      transition: "transform 260ms cubic-bezier(0.18,0.9,0.2,1), opacity 220ms ease",
      willChange: "transform, opacity",
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

    miniInput: {
      width: "100%",
      padding: "12px 16px",
      borderRadius: 16,
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

    trashBtn: {
      width: 15,
      height: 15,
      padding: 0,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 3,
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

    segmentedInner: { position: "relative", width: "100%", height: "100%" } as CSSProperties,

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
      padding: "4px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.07)",
      background: "rgba(255,255,255,0.62)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
      fontSize: 12,
      opacity: 0.55,
    } as CSSProperties,

    taskItem: {
      borderRadius: 20,
      padding: 14,
      border: "1px solid rgba(255,255,255,0.72)",
      boxShadow: "0 16px 34px rgba(0,0,0,0.01)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as CSSProperties,

    taskItemBase: { background: "rgba(255,255,255,0.62)" } as CSSProperties,
    taskItemDone: { background: "rgba(255,255,255,0.55)" } as CSSProperties,
    taskItemOverdue: { background: "rgba(255, 0, 0, 0.1)" } as CSSProperties,

    notePreview: {
      fontSize: 12,
      opacity: 0.55,
      lineHeight: 1.25,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      whiteSpace: "pre-wrap",
      cursor: "pointer",
      userSelect: "text",
    } as CSSProperties,

    titleText: {
      fontWeight: 900,
      fontSize: 16,
      lineHeight: 1.2,
      cursor: "pointer",
      userSelect: "text",
      minWidth: 0,
      wordBreak: "break-word",
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
      boxShadow: isActive ? "0 0 0 3px rgba(34, 197, 94, 0.04)" : "0 0 0 3px rgba(0,0,0,0.04)",
    };
  }

  async function loadProjects() {
    if (!authReady) return;

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
    if (!authReady) return;

    setLoadingTasks(true);
    try {
      const url = new URL("/api/tasks", window.location.origin);
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

  async function saveProjectsEdit() {
    if (savingProjectsEdit) return;

    const bad = editProjects.find((p) => !p.deleted && !p.name.trim());
    if (bad) {
      setHint("Название проекта не может быть пустым.");
      return;
    }

    setSavingProjectsEdit(true);
    setHint(null);

    try {
      const toRename = editProjects.filter((p) => !p.deleted && p.name.trim() !== p.originalName);

      for (const p of toRename) {
        const r = await fetch("/api/projects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: p.id, name: p.name.trim() }),
        });

        const j = await r.json().catch(() => ({} as any));
        if (!r.ok || !j.ok) {
          setHint(`Не смог переименовать "${p.originalName}": ${j.error || j.reason || r.status}`);
          setSavingProjectsEdit(false);
          return;
        }
      }

      const toDelete = editProjects.filter((p) => p.deleted);

      for (const p of toDelete) {
        const r = await fetch("/api/projects", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: p.id }),
        });

        const text = await r.text();
        let j: any = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch {}

        if (!r.ok || !j.ok) {
          setHint(`Не смог удалить "${p.originalName}": ${j.error || j.reason || r.status}`);
          setSavingProjectsEdit(false);
          return;
        }
      }

      await loadProjects();
      await loadTasks();

      closeEditProjects();
    } catch (e: any) {
      setHint(`Ошибка сети: ${String(e?.message || e)}`);
    } finally {
      setSavingProjectsEdit(false);
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

  async function toggleDone(id: number, done: boolean) {
    if (togglingIds.has(id)) return;

    const prev = tasks.find((t) => t.id === id);
    const prevDone = prev?.done ?? false;
    const prevCompletedAt = prev?.completed_at ?? null;

    const nextCompletedAt = done ? new Date().toISOString() : null;

    setTogglingIds((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });

    let okUpdate = false;

    try {
      const r = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, done, completed_at: nextCompletedAt }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) setHint(j.error || j.reason || "Не смог обновить задачу");
      else okUpdate = true;
    } catch (e: any) {
      setHint(`Ошибка сети при обновлении: ${String(e?.message || e)}`);
    } finally {
      if (okUpdate) {
        setTasks((prevTasks) => prevTasks.map((t) => (t.id === id ? { ...t, done, completed_at: nextCompletedAt } : t)));
      } else {
        setTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === id ? { ...t, done: Boolean(prevDone), completed_at: prevCompletedAt } : t))
        );
      }

      setTogglingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  function openEditTaskModal(t: Task, focus: "title" | "note" = "title") {
    if (t.done) return;
    if (togglingIds.has(t.id)) return;

    setHint(null);
    setEditTaskId(t.id);
    setEditTitle(t.title || "");
    setEditNote(t.note || "");
    setEditDueDate(t.due_date || null);
    setShowEditTask(true);

    requestAnimationFrame(() => {
      if (focus === "note") editNoteRef.current?.focus();
      else editTitleRef.current?.focus();
    });
  }

  function openDeleteTaskModal(id: number) {
    if (togglingIds.has(id)) return;
    setHint(null);
    setDeleteTaskId(id);
    setShowDeleteTask(true);
  }

  function closeDeleteTaskModal() {
    if (deletingTask) return;
    setShowDeleteTask(false);
    setDeleteTaskId(null);
  }

  async function deleteTask(id: number) {
    if (deletingTask) return;

    setDeletingTask(true);

    const prevTasks = tasks;
    setTasks((list) => list.filter((t) => t.id !== id));

    try {
      const r = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      const text = await r.text();
      let j: any = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        j = {};
      }

      if (!r.ok || !j.ok) {
        setTasks(prevTasks);
        setHint(`DELETE упал: HTTP ${r.status}. ${j.reason || ""} ${j.error || ""}`.trim());
        return;
      }

      closeDeleteTaskModal();
      await loadTasks();
    } catch (e: any) {
      setTasks(prevTasks);
      setHint(`Ошибка сети при удалении: ${String(e?.message || e)}`);
    } finally {
      setDeletingTask(false);
    }
  }

  function closeEditTaskModal() {
    if (savingEditTask) return;
    setShowEditTask(false);
    setEditTaskId(null);
    setEditTitle("");
    setEditNote("");
    setEditDueDate(null);
  }

  async function saveEditTask() {
    if (savingEditTask) return;
    if (!editTaskId) return;

    const nextTitle = editTitle.trim();
    const nextNoteTrim = editNote.trim();
    const nextNote = nextNoteTrim ? nextNoteTrim : null;
    const nextDueDate = editDueDate || null;

    if (!nextTitle) {
      setHint("Заголовок не может быть пустым.");
      requestAnimationFrame(() => editTitleRef.current?.focus());
      return;
    }

    const id = editTaskId;

    const prev = tasks.find((x) => x.id === id);
    const prevTitle = prev?.title ?? "";
    const prevNote = prev?.note ?? null;
    const prevDueDate = prev?.due_date ?? null;

    if (prevTitle === nextTitle && prevNote === nextNote && prevDueDate === nextDueDate) {
      closeEditTaskModal();
      return;
    }

    setSavingEditTask(true);

    setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: nextTitle, note: nextNote, due_date: nextDueDate } : t)));

    try {
      const r = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, title: nextTitle, note: nextNote, due_date: nextDueDate }),
      });

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.ok) {
        setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: prevTitle, note: prevNote, due_date: prevDueDate } : t)));
        setHint(j.error || j.reason || "Не смог сохранить изменения");
        return;
      }

      closeEditTaskModal();
    } catch (e: any) {
      setTasks((list) => list.map((t) => (t.id === id ? { ...t, title: prevTitle, note: prevNote } : t)));
      setHint(`Ошибка сети при сохранении: ${String(e?.message || e)}`);
    } finally {
      setSavingEditTask(false);
    }
  }

  function openEditProjects() {
    setHint(null);
    setEditProjects(projects.map((p) => ({ id: p.id, name: p.name, originalName: p.name, deleted: false })));
    setShowEditProjects(true);
  }

  function closeEditProjects() {
    if (savingProjectsEdit) return;
    setShowEditProjects(false);
    setEditProjects([]);
  }

  function setProjectName(id: number, name: string) {
    setEditProjects((list) => list.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function toggleProjectDelete(id: number) {
    setEditProjects((list) => list.map((p) => (p.id === id ? { ...p, deleted: !p.deleted } : p)));
  }

  function TaskCard({ t }: { t: Task }) {
    const hasMeta = Boolean((isAllTasks && t.project_id) || t.due_date);
    const isOverdue = Boolean(t.due_date && t.due_date < todayISO);

    return (
      <div
        style={{
          ...ui.taskItem,
          ...ui.taskItemBase,
          ...(isOverdue && !t.done ? ui.taskItemOverdue : null),
          ...(t.done ? ui.taskItemDone : null),
          opacity: togglingIds.has(t.id) ? 0.7 : t.done ? 0.82 : 1,
          pointerEvents: togglingIds.has(t.id) ? "none" : "auto",
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
              marginTop: 3,
              cursor: togglingIds.has(t.id) ? "not-allowed" : "pointer",
              opacity: togglingIds.has(t.id) ? 0.6 : 1,
              flex: "0 0 auto",
            }}
          />

          <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 0 }}>
            <div
              style={{
                ...ui.titleText,
                textDecoration: t.done ? "line-through" : "none",
                cursor: t.done ? "default" : "pointer",
                opacity: t.done ? 0.8 : 1,
              }}
              onClick={() => !t.done && openEditTaskModal(t, "title")}
            >
              {t.title}
            </div>

            {t.note ? (
              <div style={ui.notePreview} onClick={() => !t.done && openEditTaskModal(t, "note")}>
                {t.note}
              </div>
            ) : null}

            {hasMeta ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {isAllTasks && t.project_id ? (
                  <span style={ui.chip}>{projectNameById.get(t.project_id) || "Проект"}</span>
                ) : null}

                {t.due_date ? (
                  <span
                    style={{ ...ui.chip, cursor: t.done ? "default" : "pointer", opacity: 0.55 }}
                    onClick={() => !t.done && openEditTaskModal(t, "title")}
                    title="Нажми, чтобы отредактировать"
                  >
                    до {fmtDate(t.due_date)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => openDeleteTaskModal(t.id)}
            disabled={deletingTask || togglingIds.has(t.id)}
            style={{
              ...ui.trashBtn,
              opacity: deletingTask || togglingIds.has(t.id) ? 0.25 : 0.5,
              cursor: deletingTask || togglingIds.has(t.id) ? "not-allowed" : "pointer",
            }}
            title="Удалить"
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>
    );
  }

  function SkeletonTask() {
    return (
      <div className="skeleton" style={{ padding: 14, borderRadius: 20 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div className="skeleton-line" style={{ width: "70%" }} />
          <div className="skeleton-line" style={{ width: "50%", height: 10 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <div className="skeleton-line" style={{ width: 60, height: 22, borderRadius: 999 }} />
            <div className="skeleton-line" style={{ width: 90, height: 22, borderRadius: 999 }} />
          </div>
        </div>
      </div>
    );
  }

  // ✅ проекты грузим только когда authReady стал true
  useEffect(() => {
    if (!authReady) return;
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  // ✅ задачи грузим только когда authReady true и есть активный проект
  useEffect(() => {
    if (!authReady) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, activeProjectId]);

  const editIsToday = editDueDate === todayISO;
  const editIsTomorrow = editDueDate === tomorrowISO;
  const editHasCustomDate = Boolean(editDueDate && !editIsToday && !editIsTomorrow);

  const shownHint = hint || authHint;

  return (
    <div style={ui.shell}>
      <AppMenu />
      <div style={ui.bgFixed} />
      <div style={{ ...ui.orb, ...ui.orbA }} />
      <div style={{ ...ui.orb, ...ui.orbB }} />

      <main style={ui.container}>
        <div style={ui.headerRow}>
          <h1 style={ui.h1}>Задачи</h1>
        </div>

        <div style={ui.tabWrap}>
          <button
            type="button"
            onClick={openCreateProject}
            disabled={creatingProject || loadingProjects || !authReady}
            style={{
              ...ui.tabPlus,
              opacity: creatingProject || loadingProjects || !authReady ? 0.6 : 1,
              cursor: creatingProject || loadingProjects || !authReady ? "not-allowed" : "pointer",
            }}
            title="Новый проект"
          >
            <IconPlus size={12} style={{ color: "#000000" }} />
          </button>

          <button
            type="button"
            onClick={openEditProjects}
            disabled={creatingProject || loadingProjects || !authReady}
            style={{
              ...ui.tabPlus,
              opacity: creatingProject || loadingProjects || !authReady ? 0.6 : 1,
              cursor: creatingProject || loadingProjects || !authReady ? "not-allowed" : "pointer",
            }}
            title="Редактировать проекты"
          >
            <IconEdit size={12} style={{ color: "#000000" }} />
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode("all");
              setActiveProjectId(null);
            }}
            style={ui.tabBadge}
          >
            <span style={dotStyle(viewMode === "all" && isAllTasks)} />
            Все задачи
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode("completed");
              setActiveProjectId(null);
            }}
            style={ui.tabBadge}
          >
            <span style={dotStyle(viewMode === "completed")} />
            Завершено
          </button>

          {projects.map((p) => {
            const isActive = activeProjectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setViewMode("all");
                  setActiveProjectId(p.id);
                }}
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

        {shownHint && (
          <div
            style={{
              ...ui.cardTight,
              borderColor: "rgba(240,195,109,0.55)",
              background: "rgba(255,250,240,0.7)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Сообщение</div>
            <div style={{ lineHeight: 1.35 }}>{shownHint}</div>
          </div>
        )}

        {/* Add task */}
        {viewMode === "all" && (
          <section style={{ ...ui.card, marginTop: 14, opacity: authReady ? 1 : 0.7 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  name="newTaskTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isAllTasks ? "Выбери проект табом сверху…" : "Добавьте новую задачу"}
                  disabled={!authReady || isAllTasks || !activeProjectId}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                  style={{
                    ...ui.input,
                    flex: 1,
                    opacity: !authReady || isAllTasks || !activeProjectId ? 0.55 : 1,
                  }}
                />

                <button
                  type="button"
                  onClick={addTask}
                  disabled={!authReady || !canAddTask}
                  style={{
                    ...ui.btnCircle,
                    opacity: authReady && canAddTask ? 1 : 0.45,
                    cursor: authReady && canAddTask ? "pointer" : "not-allowed",
                  }}
                  title="Добавить"
                >
                  <IconPlus size={15} style={{ color: "#ffffff" }} />
                </button>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={!authReady || isAllTasks || !activeProjectId}
                  onClick={() => setDueDate((prev) => (prev === todayISO ? null : todayISO))}
                  style={{
                    ...ui.chipBtn,
                    ...(isToday ? ui.chipBtnActive : null),
                    opacity: !authReady || isAllTasks || !activeProjectId ? 0.55 : 1,
                    cursor: !authReady || isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                  }}
                >
                  Сегодня
                </button>

                <button
                  type="button"
                  disabled={!authReady || isAllTasks || !activeProjectId}
                  onClick={() => setDueDate((prev) => (prev === tomorrowISO ? null : tomorrowISO))}
                  style={{
                    ...ui.chipBtn,
                    ...(isTomorrow ? ui.chipBtnActive : null),
                    opacity: !authReady || isAllTasks || !activeProjectId ? 0.55 : 1,
                    cursor: !authReady || isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                  }}
                >
                  Завтра
                </button>

                <div style={{ position: "relative", display: "inline-flex" }}>
                  <button
                    type="button"
                    disabled={!authReady || isAllTasks || !activeProjectId}
                    onClick={() => {
                      if (hasCustomDate) {
                        setDueDate(null);
                        return;
                      }
                      requestAnimationFrame(() => {
                        dueDateRef.current?.focus();
                        dueDateRef.current?.click();
                      });
                    }}
                    style={{
                      ...ui.chipBtn,
                      ...(hasCustomDate ? ui.chipBtnActive : null),
                      opacity: !authReady || isAllTasks || !activeProjectId ? 0.55 : 1,
                      cursor: !authReady || isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                    }}
                    title={dueDate ? `Дата: ${fmtDate(dueDate)}` : "Выбрать дату"}
                  >
                    {dueDate ? `Дата: ${fmtDate(dueDate)}` : "Выбрать дату"}
                  </button>

                  <input
                    ref={dueDateRef}
                    id="dueDatePicker"
                    name="dueDatePicker"
                    type="date"
                    value={dueDate || ""}
                    disabled={!authReady || isAllTasks || !activeProjectId}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setDueDate(v);
                      requestAnimationFrame(() => {
                        dueDateRef.current?.blur();
                        (document.activeElement as HTMLElement | null)?.blur?.();
                      });
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      opacity: 0.001,
                      width: "100%",
                      height: "100%",
                      border: "none",
                      background: "transparent",
                      cursor: !authReady || isAllTasks || !activeProjectId ? "not-allowed" : "pointer",
                    }}
                  />
                </div>
              </div>
            </div>

            {isAllTasks && (
              <div style={{ ...ui.muted, marginTop: 12 }}>
                Сейчас выбран режим “Все задачи”. Для добавления выбери конкретный проект табом.
              </div>
            )}
          </section>
        )}

        {/* Mode switch */}
        {authReady && viewMode === "all" && (
          <div style={{ marginTop: 12 }}>
            <div
              style={ui.segmented}
              onTouchStart={(e) => {
                swipeStartX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (swipeStartX.current === null) return;

                const dx = e.changedTouches[0].clientX - swipeStartX.current;
                swipeStartX.current = null;

                if (Math.abs(dx) < 40) return;

                if (dx < 0 && listMode === "schedule") setListMode("no_date");
                if (dx > 0 && listMode === "no_date") setListMode("schedule");
              }}
            >
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
        {authReady && (
          <div style={ui.listsWrap}>
            {viewMode === "completed" && (
              <div style={{ display: "grid", gap: 18 }}>
                {completedSections.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Завершённых задач пока нет.</div>
                ) : (
                  completedSections.map((sec) => (
                    <div key={sec.key} style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                        <div style={ui.dayTitle}>{sec.label}</div>
                        <div style={ui.muted}>{sec.count} шт.</div>
                      </div>

                      <div style={{ display: "grid", gap: 14 }}>
                        {sec.tasks.map((t) => (
                          <TaskCard key={t.id} t={t} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {viewMode === "all" && (
              <div
                style={{
                  ...ui.panel,
                  opacity: listMode === "schedule" ? 1 : 0,
                  transform: listMode === "schedule" ? "translateX(0%)" : "translateX(-110%)",
                  pointerEvents: listMode === "schedule" ? "auto" : "none",
                }}
              >
                {loadingTasks ? (
                  <div style={{ display: "grid", gap: 18 }}>
                    {Array.from({ length: 3 }).map((_, s) => (
                      <div key={s} style={{ display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div className="skeleton-line" style={{ width: 120, height: 18 }} />
                          <div className="skeleton-line" style={{ width: 40, height: 14 }} />
                        </div>

                        <div style={{ display: "grid", gap: 14 }}>
                          {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i}>
                              <SkeletonTask />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : tasks.length === 0 ? (
                  <div style={{ opacity: 0.7 }}>Пока пусто.</div>
                ) : (
                  <div style={{ display: "grid", gap: 18 }}>
                    {taskSections
                      .filter((s) => s.key !== "NO_DATE")
                      .map((sec) => (
                        <div key={sec.key} style={{ display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
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
                )}
              </div>
            )}

            {viewMode === "all" && (
              <div
                style={{
                  ...ui.panel,
                  opacity: listMode === "no_date" ? 1 : 0,
                  transform: listMode === "no_date" ? "translateX(0%)" : "translateX(110%)",
                  pointerEvents: listMode === "no_date" ? "auto" : "none",
                }}
              >
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div style={ui.dayTitle}>Задачи</div>
                    <div style={ui.muted}>{noDateTasks.length} шт.</div>
                  </div>

                  {loadingTasks ? (
                    <div style={{ display: "grid", gap: 14 }}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i}>
                          <SkeletonTask />
                        </div>
                      ))}
                    </div>
                  ) : noDateTasks.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>Задач без даты нет.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 14 }}>
                      {noDateTasks.map((t) => (
                        <TaskCard key={t.id} t={t} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Create project */}
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
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={true}
                inputMode="text"
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

        {/* Modal: Edit task */}
        {showEditTask && (
          <div style={ui.overlay} onClick={closeEditTaskModal}>
            <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>Редактирование</div>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  ref={editTitleRef}
                  name="editTaskTitle"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Заголовок"
                  style={ui.miniInput}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEditTask();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeEditTaskModal();
                    }
                  }}
                />

                <input
                  ref={editNoteRef}
                  name="editTaskNote"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Заметка"
                  style={{ ...ui.miniInput, fontSize: 14, borderRadius: 16 }}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  inputMode="text"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEditTask();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeEditTaskModal();
                    }
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 10,
                    marginBottom: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditDueDate((prev) => (prev === todayISO ? null : todayISO))}
                    style={{
                      ...ui.chipBtn,
                      ...(editIsToday ? ui.chipBtnActive : null),
                    }}
                  >
                    Сегодня
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditDueDate((prev) => (prev === tomorrowISO ? null : tomorrowISO))}
                    style={{
                      ...ui.chipBtn,
                      ...(editIsTomorrow ? ui.chipBtnActive : null),
                    }}
                  >
                    Завтра
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (editHasCustomDate) {
                        setEditDueDate(null);
                        return;
                      }
                      const el = editDueDateRef.current;
                      if (!el) return;

                      try {
                        // @ts-ignore
                        if (typeof el.showPicker === "function") el.showPicker();
                      } catch {}
                      el.click();
                      el.focus();
                    }}
                    style={{
                      ...ui.chipBtn,
                      ...(editHasCustomDate ? ui.chipBtnActive : null),
                    }}
                    title={editDueDate ? `Дата: ${fmtDate(editDueDate)}` : "Выбрать дату"}
                  >
                    {editDueDate ? fmtDate(editDueDate) : "Выбрать дату"}
                  </button>

                  <input
                    ref={editDueDateRef}
                    type="date"
                    value={editDueDate || ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setEditDueDate(v);
                      requestAnimationFrame(() => {
                        editDueDateRef.current?.blur();
                      });
                    }}
                    style={{
                      position: "absolute",
                      width: 1,
                      height: 1,
                      opacity: 0,
                      pointerEvents: "none",
                    }}
                    tabIndex={-1}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={closeEditTaskModal}
                  style={{
                    ...ui.btnGhost,
                    flex: 1,
                    opacity: savingEditTask ? 0.6 : 1,
                    cursor: savingEditTask ? "not-allowed" : "pointer",
                  }}
                  disabled={savingEditTask}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={saveEditTask}
                  style={{
                    ...ui.btnPrimary,
                    flex: 1,
                    opacity: savingEditTask ? 0.6 : 1,
                    cursor: savingEditTask ? "not-allowed" : "pointer",
                  }}
                  disabled={savingEditTask}
                >
                  {savingEditTask ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete task */}
        {showDeleteTask && (
          <div style={ui.overlay} onClick={closeDeleteTaskModal}>
            <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Удалить задачу?</div>

              <div style={{ opacity: 0.7, lineHeight: 1.35 }}>Задача удалится безвозратно.</div>

              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={closeDeleteTaskModal}
                  style={{
                    ...ui.btnGhost,
                    flex: 1,
                    opacity: deletingTask ? 0.6 : 1,
                    cursor: deletingTask ? "not-allowed" : "pointer",
                  }}
                  disabled={deletingTask}
                >
                  Нет
                </button>

                <button
                  type="button"
                  onClick={() => deleteTask(deleteTaskId!)}
                  style={{
                    ...ui.btnPrimary,
                    flex: 1,
                    opacity: deleteTaskId ? 1 : 0.6,
                    cursor: deleteTaskId ? "pointer" : "not-allowed",
                  }}
                  disabled={!deleteTaskId || deletingTask}
                >
                  {deletingTask ? "Удаляю..." : "Да, удалить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit Project */}
        {showEditProjects && (
          <div style={ui.overlay} onClick={closeEditProjects}>
            <div style={ui.modal} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>Редактирование проекта</div>
              <div style={{ opacity: 0.7, lineHeight: 1.35, marginBottom: 12, fontSize: 12 }}>
                Внимание! При удалении проекта, задачи этого проекта удаляются безвозвратно.
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {editProjects.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      opacity: p.deleted ? 0.45 : 1,
                    }}
                  >
                    <input
                      value={p.name}
                      onChange={(e) => setProjectName(p.id, e.target.value)}
                      disabled={p.deleted}
                      style={{
                        ...ui.miniInput,
                        flex: 1,
                      }}
                      placeholder="Название проекта"
                    />

                    <button
                      type="button"
                      onClick={() => toggleProjectDelete(p.id)}
                      disabled={savingProjectsEdit}
                      style={{
                        ...ui.trashBtn,
                        opacity: p.deleted ? 0.9 : 0.55,
                        cursor: savingProjectsEdit ? "not-allowed" : "pointer",
                      }}
                      title={p.deleted ? "Вернуть проект" : "Удалить проект"}
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={closeEditProjects}
                  style={{
                    ...ui.btnGhost,
                    flex: 1,
                    opacity: savingProjectsEdit ? 0.6 : 1,
                    cursor: savingProjectsEdit ? "not-allowed" : "pointer",
                  }}
                  disabled={savingProjectsEdit}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={saveProjectsEdit}
                  style={{
                    ...ui.btnPrimary,
                    flex: 1,
                    opacity: savingProjectsEdit ? 0.6 : 1,
                    cursor: savingProjectsEdit ? "not-allowed" : "pointer",
                  }}
                  disabled={savingProjectsEdit}
                >
                  {savingProjectsEdit ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}