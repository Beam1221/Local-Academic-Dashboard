import { Check, Clock3, ListChecks } from "lucide-react";
import type { Course, Task, Status } from "../types";
import { typeNames, priorityNames } from "../types";
import { dueLabel } from "../lib/dates";

export function Progress({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export function TaskCard({
  task,
  course,
  onOpen,
  onStatus,
  compact = false,
  busy = false,
}: {
  task: Task;
  course?: Course;
  onOpen: (task: Task) => void;
  onStatus?: (task: Task, status: Status) => void;
  compact?: boolean;
  busy?: boolean;
}) {
  const overdue =
    task.status !== "completed" && new Date(task.due_at) < new Date();
  return (
    <article
      className={`task-card ${compact ? "compact" : ""} ${task.status === "completed" ? "is-complete" : ""}`}
      style={{ borderLeftColor: course?.color }}
    >
      {onStatus && (
        <button
          disabled={busy}
          className={`task-check ${task.status === "completed" ? "checked" : ""}`}
          aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} ${task.title}`}
          onClick={() =>
            onStatus(
              task,
              task.status === "completed" ? "not_started" : "completed",
            )
          }
        >
          <Check size={14} />
        </button>
      )}
      <button className="task-main" onClick={() => onOpen(task)}>
        <span className="task-course">
          <span style={{ background: course?.color }} />
          {course?.name ?? "Course"}
          <span className="task-type">{typeNames[task.task_type]}</span>
        </span>
        <strong>{task.title}</strong>
        <span className="task-meta">
          <span className={overdue ? "overdue-text" : ""}>
            <Clock3 size={13} />
            {overdue ? "Overdue · " : ""}
            {dueLabel(task.due_at)}
          </span>
          {task.subtasks.length > 0 && (
            <span>
              <ListChecks size={14} />
              {task.subtasks.filter((s) => s.is_completed).length}/
              {task.subtasks.length}
            </span>
          )}
        </span>
        {compact && task.subtasks.length > 0 && (
          <Progress
            value={task.checklist_progress}
            label={`${task.title} checklist`}
          />
        )}
      </button>
      <span className={`priority ${task.priority}`}>
        {priorityNames[task.priority]}
      </span>
    </article>
  );
}
