import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  BookOpen,
  Headphones,
  Settings,
  Users,
  Mail,
  ListTodo,
  Palette,
  CalendarDays,
  Columns3,
  Grid2X2,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Sun,
  X,
} from "lucide-react";
import { api } from "./lib/api";
import type { Course, Task, Status, FocusSession } from "./types";
import { CourseForm, TaskForm, TaskDetail } from "./components/Forms";
import { Modal } from "./components/Modal";
import { TodoView } from "./views/TodoView";
import { CoursesView } from "./views/CoursesView";
import { Appearance } from "./components/Appearance";
import { Dashboard } from "./views/Dashboard";
import { CourseView } from "./views/CourseView";
import { MusicPlayer } from "./components/MusicPlayer";
import { MeetingsView } from "./views/MeetingsView";
import { SettingsView } from "./views/SettingsView";
import { NotificationsView } from "./views/NotificationsView";
import { CalendarView } from "./views/CalendarView";
import { KanbanView } from "./views/KanbanView";
import { MatrixView } from "./views/MatrixView";
import { Pomodoro } from "./components/Pomodoro";
import { registerWorkspaceTools } from "./lib/webmcp";

type View = "settings" | "music" | "meetings" | "notifications" | "todos" | "courses" | "dashboard" | "calendar" | "board" | "matrix" | `course-${number}`;
type Dialog =
  | { type: "course"; course?: Course }
  | { type: "task"; task?: Task }
  | { type: "detail"; id: number }
  | { type: "deleteCourse"; course: Course }
  | { type: "deleteTask"; task: Task }
  | null;
const navigation = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["todos", "To-do list", ListTodo],
  ["courses", "Courses", BookOpen],
  ["calendar", "Calendar", CalendarDays],
  ["meetings", "Meetings", Users],
  ["music", "Music", Headphones],
  ["notifications", "Email reminders", Mail],
  ["board", "Kanban board", Columns3],
  ["matrix", "Priority matrix", Grid2X2],
  ["settings", "Settings", Settings],
] as const;
function currentView(): View {
  const value = location.hash.slice(1);
  return /^(settings|dashboard|todos|courses|calendar|music|meetings|notifications|board|matrix|course-\d+)$/.test(value)
    ? (value as View)
    : "dashboard";
}
function savedTheme() {
  try {
    const value = localStorage.getItem("studyspace-theme");
    return value === "system" || value === "light" ? value : "dark";
  } catch {
    return "dark";
  }
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [view, setView] = useState<View>(currentView);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const [theme, setTheme] = useState(savedTheme);
  const [focusRequest, setFocusRequest] = useState<{
    taskId: number;
    key: number;
  } | null>(null);
  const taskRef = useRef(tasks);
  taskRef.current = tasks;
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme; };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("studyspace-theme", theme);
    } catch {
      /* Theme still works for this visit. */
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(
    () =>
      registerWorkspaceTools(
        () => taskRef.current,
        (id) => flushSync(() => setDialog({ type: "detail", id })),
      ),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const [nextCourses, nextTasks, nextSessions] = await Promise.all([
        api.courses(),
        api.tasks(),
        api.sessions(),
      ]);
      setCourses(nextCourses);
      setTasks(nextTasks);
      setSessions(nextSessions);
      setError("");
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);
  useEffect(() => {
    void refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible")
        void refresh().catch((err) => setError(err.message));
    };
    document.addEventListener("visibilitychange", reload);
    return () => document.removeEventListener("visibilitychange", reload);
  }, [refresh]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function go(next: View) {
    setView(next);
    location.hash = next;
    setMobileOpen(false);
  }
  function status(task: Task, value: Status) {
    void act(() => api.updateTask(task.id, { status: value }));
  }
  const course = view.startsWith("course-")
    ? courses.find((c) => c.id === Number(view.slice(7)))
    : undefined;
  const selectedTask =
    dialog?.type === "detail"
      ? tasks.find((t) => t.id === dialog.id)
      : undefined;
  const title =
    course?.name ?? navigation.find((n) => n[0] === view)?.[1] ?? "Dashboard";
  const newTask = () =>
    setDialog(courses.length ? { type: "task" } : { type: "course" });

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Appearance mode={theme} onMode={setTheme} open={appearanceOpen} onClose={() => setAppearanceOpen(false)}/>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          <span className="sidebar-text">
            Studyspace<small>YOUR ACADEMIC WORKSPACE</small>
          </span>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <span className="sidebar-label sidebar-text">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              title={label}
              aria-current={view === id || (id === "courses" && view.startsWith("course-")) ? "page" : undefined}
              className={`nav-item ${view === id || (id === "courses" && view.startsWith("course-")) ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span className="sidebar-text">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setAppearanceOpen(true)} title="Appearance"><Palette size={19}/><span className="sidebar-text">Appearance</span></button>
          <div className="sidebar-note sidebar-text">
            <span className="tiny-label">YOUR WORKSPACE</span>
            <p>
              {courses.length} courses
              <br />
              {tasks.filter((t) => t.status !== "completed").length} open tasks
            </p>
          </div>
          <button
            className="nav-item"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle color theme"
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            <span className="sidebar-text">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>
          <button
            className="nav-item collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
            <span className="sidebar-text">Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <PanelLeftOpen size={20} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <span className="topbar-date">
            {now.toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {course ? "COURSE WORKSPACE" : "YOUR STUDY WORKSPACE"}
              </span>
              <h1>{title}</h1>
              <p>
                {course
                  ? `${course.completed_tasks} of ${course.total_tasks} tasks completed`
                  : now.toLocaleDateString([], {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
              </p>
            </div>
            {!["todos", "meetings", "notifications", "music"].includes(view) && <button
              className="button primary"
              onClick={view === "courses" ? () => setDialog({ type: "course" }) : newTask}
              disabled={loading}
            >
              <Plus size={18} />
              {view === "courses" || !courses.length ? "Add a course" : "New task"}
            </button>}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => void act(async () => {})}
              >
                <RefreshCw size={15} />
                Retry
              </button>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading && (
            <div className="loading-state" role="status">
              <RefreshCw className="spin" />
              Loading your workspace…
            </div>
          )}
          <div
            className={
              view === "dashboard" ? "dashboard-layout" : "full-width-layout"
            }
            style={loading ? { display: "none" } : undefined}
          >
            <div className="view-content">
              {view === "dashboard" && (
                <Dashboard
                  tasks={tasks}
                  courses={courses}
                  now={now}
                  onTask={(t) => setDialog({ type: "detail", id: t.id })}
                  onStatus={status}
                  busy={busy}
                />
              )}
              <MusicPlayer active={view === "music"} onOpen={()=>go("music")}/>
              {view === "meetings" && <MeetingsView/>}
              {view === "notifications" && <NotificationsView/>}
              {view === "settings" && <SettingsView onAppearance={()=>setAppearanceOpen(true)}/>}
              {view === "todos" && <TodoView tasks={tasks} courses={courses} now={now} onTask={t => setDialog({ type: "detail", id: t.id })}/>}
              {view === "courses" && <CoursesView courses={courses} tasks={tasks} onCourse={id => go(`course-${id}`)} onNewCourse={() => setDialog({ type: "course" })}/>}
              {view === "calendar" && (
                <CalendarView
                  tasks={tasks}
                  courses={courses}
                  onTask={(t) => setDialog({ type: "detail", id: t.id })}
                />
              )}
              {view === "board" && (
                <KanbanView
                  tasks={tasks}
                  courses={courses}
                  onTask={(t) => setDialog({ type: "detail", id: t.id })}
                  onMove={status}
                  busy={busy}
                />
              )}
              {view === "matrix" && (
                <MatrixView
                  tasks={tasks}
                  courses={courses}
                  now={now}
                  onTask={(t) => setDialog({ type: "detail", id: t.id })}
                />
              )}
              {course && (
                <CourseView
                  key={course.id}
                  course={course}
                  tasks={tasks}
                  busy={busy}
                  onTask={(t) => setDialog({ type: "detail", id: t.id })}
                  onStatus={status}
                  onEdit={() => setDialog({ type: "course", course })}
                  onDelete={() => setDialog({ type: "deleteCourse", course })}
                  onNewTask={newTask}
                />
              )}
              {view.startsWith("course-") && !course && (
                <div className="panel empty-inline">
                  <p>This course is no longer available.</p>
                  <button
                    className="text-button"
                    onClick={() => go("dashboard")}
                  >
                    Back to dashboard
                  </button>
                </div>
              )}
            </div>
            <aside
              className={
                view === "dashboard" ? "focus-rail" : "focus-dock-container"
              }
              aria-label="Focus timer"
            >
              <Pomodoro
                tasks={tasks}
                sessions={sessions}
                request={focusRequest}
                compact={view !== "dashboard"}
                refresh={refresh}
              />
            </aside>
          </div>
        </main>
      </div>
      {dialog?.type === "course" && (
        <CourseForm
          course={dialog.course}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog?.type === "task" && (
        <TaskForm
          task={dialog.task}
          courseId={course?.id}
          courses={courses}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          course={courses.find((c) => c.id === selectedTask.course_id)}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ type: "task", task: selectedTask })}
          onDelete={() => setDialog({ type: "deleteTask", task: selectedTask })}
          onFocus={() => {
            setFocusRequest({ taskId: selectedTask.id, key: Date.now() });
            setDialog(null);
          }}
          refresh={refresh}
        />
      )}
      {(dialog?.type === "deleteCourse" || dialog?.type === "deleteTask") && (
        <Modal
          title={
            dialog.type === "deleteCourse" ? "Delete course?" : "Delete task?"
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <div className="form-stack">
            <p>
              {dialog.type === "deleteCourse"
                ? `“${dialog.course.name}” and all its tasks and checklists will be permanently deleted.`
                : `“${dialog.task.title}” and its checklist will be permanently deleted.`}{" "}
              Saved focus history is retained.
            </p>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    if (dialog.type === "deleteCourse") {
                      await api.deleteCourse(dialog.course.id);
                      go("dashboard");
                    } else await api.deleteTask(dialog.task.id);
                    setDialog(null);
                  })
                }
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
