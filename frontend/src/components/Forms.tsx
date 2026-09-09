import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { localDateInput, durationLabel } from "../lib/dates";
import type { Course, CourseInput, Task, TaskInput, Subtask } from "../types";
import { statusNames, typeNames, priorityNames } from "../types";
import { Modal } from "./Modal";
import { Progress } from "./TaskCard";

export function CourseForm({
  course,
  onClose,
  onSaved,
}: {
  course?: Course;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<CourseInput>(
    course ?? { name: "", color: "#A99BFF", syllabus: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        color: form.color,
        syllabus: form.syllabus,
      };
      if (course) await api.updateCourse(course.id, payload);
      else await api.createCourse(payload);
      try {
        await onSaved();
      } finally {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={course ? "Edit course" : "Create a course"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Course name
          <input
            autoFocus
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Computer Architecture"
          />
        </label>
        <label>
          Course color
          <div className="color-picker">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <span>{form.color.toUpperCase()}</span>
            {["#A99BFF", "#72C9CF", "#E9B56F", "#EF8EAB", "#9BCA87"].map(
              (color) => (
                <button
                  key={color}
                  type="button"
                  style={{ background: color }}
                  aria-label={`Use color ${color}`}
                  aria-pressed={form.color === color}
                  onClick={() => setForm({ ...form, color })}
                />
              ),
            )}
          </div>
        </label>
        <label>
          Syllabus overview
          <textarea
            rows={6}
            maxLength={50000}
            value={form.syllabus}
            onChange={(e) => setForm({ ...form, syllabus: e.target.value })}
            placeholder="Topics, weekly plans, assessment weights, and useful notes…"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !form.name.trim()}
          >
            {busy ? "Saving…" : course ? "Save course" : "Create course"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TaskForm({
  task,
  courses,
  courseId,
  onClose,
  onSaved,
}: {
  task?: Task;
  courses: Course[];
  courseId?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const defaultDate = new Date();
  defaultDate.setHours(23, 59, 0, 0);
  const [form, setForm] = useState<TaskInput>(
    task ?? {
      course_id: courseId ?? courses[0]?.id ?? 0,
      title: "",
      description: "",
      task_type: "assignment",
      due_at: defaultDate.toISOString(),
      status: "not_started",
      priority: "medium",
    },
  );
  const [date, setDate] = useState(localDateInput(form.due_at));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function field<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { course_id, title, description, task_type, status, priority } =
        form;
      const payload = {
        course_id,
        title,
        description,
        task_type,
        status,
        priority,
        due_at: new Date(date).toISOString(),
      };
      if (task) await api.updateTask(task.id, payload);
      else await api.createTask(payload);
      try {
        await onSaved();
      } finally {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? "Edit task" : "New task"}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => field("title", e.target.value)}
            placeholder="What needs to get done?"
          />
        </label>
        <div className="form-grid">
          <label>
            Course
            <select
              required
              value={form.course_id}
              onChange={(e) => field("course_id", Number(e.target.value))}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={form.task_type}
              onChange={(e) =>
                field("task_type", e.target.value as TaskInput["task_type"])
              }
            >
              {Object.entries(typeNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Due date & time
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <small>
            Your device timezone:{" "}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </small>
        </label>
        <div className="form-grid">
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) =>
                field("status", e.target.value as TaskInput["status"])
              }
            >
              {Object.entries(statusNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) =>
                field("priority", e.target.value as TaskInput["priority"])
              }
            >
              {Object.entries(priorityNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            rows={4}
            maxLength={50000}
            value={form.description}
            onChange={(e) => field("description", e.target.value)}
            placeholder="Requirements, notes, or a link to the brief…"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !form.title.trim() || !form.course_id}
          >
            {busy ? "Saving…" : task ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TaskDetail({
  task,
  course,
  onClose,
  onEdit,
  onDelete,
  onFocus,
  refresh,
}: {
  task: Task;
  course?: Course;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFocus: () => void;
  refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editSubtask(subtask: Subtask) {
    setEditing(subtask.id);
    setEditTitle(subtask.title);
  }
  return (
    <Modal title={task.title} onClose={onClose} wide>
      <div className="detail-body">
        <div className="detail-tags">
          <span className="course-tag" style={{ color: course?.color }}>
            {course?.name}
          </span>
          <span className="tag">{typeNames[task.task_type]}</span>
          <span className={`priority ${task.priority}`}>
            {priorityNames[task.priority]} priority
          </span>
        </div>
        <div className="detail-facts">
          <div>
            <span>Due</span>
            <strong>
              {new Date(task.due_at).toLocaleString([], {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </strong>
          </div>
          <div>
            <span>Focus time</span>
            <strong>{durationLabel(task.focus_seconds)}</strong>
          </div>
        </div>
        <label className="status-field">
          Status
          <select
            disabled={busy}
            value={task.status}
            onChange={(e) =>
              void act(() =>
                api.updateTask(task.id, {
                  status: e.target.value as TaskInput["status"],
                }),
              )
            }
          >
            {Object.entries(statusNames).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <p className="description">
          {task.description || "No description added."}
        </p>
        <div className="section-heading">
          <h3>Checklist</h3>
          <span>
            {task.subtasks.filter((s) => s.is_completed).length} of{" "}
            {task.subtasks.length} complete
          </span>
        </div>
        <Progress
          value={task.checklist_progress}
          label="Checklist completion"
        />
        <div className="checklist">
          {task.subtasks.map((subtask) => (
            <div className="checklist-item" key={subtask.id}>
              <input
                type="checkbox"
                aria-label={`Complete ${subtask.title}`}
                checked={subtask.is_completed}
                disabled={busy}
                onChange={(e) =>
                  void act(() =>
                    api.updateSubtask(subtask.id, {
                      is_completed: e.target.checked,
                    }),
                  )
                }
              />
              {editing === subtask.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await api.updateSubtask(subtask.id, { title: editTitle });
                      setEditing(null);
                    });
                  }}
                  className="inline-form"
                >
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Checklist item title"
                  />
                  <button
                    className="text-button"
                    disabled={busy || !editTitle.trim()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  className={`checklist-title ${subtask.is_completed ? "completed" : ""}`}
                  onClick={() => editSubtask(subtask)}
                  title="Edit checklist item"
                >
                  {subtask.title}
                </button>
              )}
              <button
                className="icon-button"
                disabled={busy}
                onClick={() => void act(() => api.deleteSubtask(subtask.id))}
                aria-label={`Delete ${subtask.title}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.createSubtask(
                task.id,
                title,
                Math.max(-1, ...task.subtasks.map((s) => s.position)) + 1,
              );
              setTitle("");
            });
          }}
        >
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a small next step…"
            aria-label="New checklist item"
          />
          <button className="button secondary" disabled={busy || !title.trim()}>
            <Plus size={16} />
            Add
          </button>
        </form>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="detail-actions">
          <button className="button danger" onClick={onDelete} disabled={busy}>
            <Trash2 size={16} />
            Delete
          </button>
          <div>
            <button
              className="button secondary"
              onClick={onEdit}
              disabled={busy}
            >
              Edit task
            </button>
            <button
              className="button primary"
              onClick={onFocus}
              disabled={busy}
            >
              Focus on this
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
