import { useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Course, Task } from "../types";

export function CalendarView({
  tasks,
  courses,
  onTask,
}: {
  tasks: Task[];
  courses: Course[];
  onTask: (task: Task) => void;
}) {
  const [anchor, setAnchor] = useState(new Date());
  const [mode, setMode] = useState<"month" | "week">("month");
  const [courseId, setCourseId] = useState("all");
  const [completed, setCompleted] = useState(true);
  const first = startOfWeek(mode === "month" ? startOfMonth(anchor) : anchor, {
    weekStartsOn: 1,
  });
  const days = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) =>
    addDays(first, i),
  );
  const visible = tasks.filter(
    (t) =>
      (courseId === "all" || t.course_id === Number(courseId)) &&
      (completed || t.status !== "completed"),
  );
  function move(direction: number) {
    setAnchor(
      mode === "month"
        ? addMonths(anchor, direction)
        : addWeeks(anchor, direction),
    );
  }
  function taskButton(task: Task) {
    const course = courses.find((c) => c.id === task.course_id);
    return (
      <button
        key={task.id}
        className={`calendar-event ${task.status === "completed" ? "completed" : ""}`}
        style={
          {
            "--course-color": course?.color ?? "#A99BFF",
          } as React.CSSProperties
        }
        onClick={() => onTask(task)}
        title={`${task.title} · ${course?.name} · ${format(new Date(task.due_at), "h:mm a")}`}
      >
        <span className="event-time">
          {format(new Date(task.due_at), "h:mm a")}
          {task.task_type === "exam"
            ? " · EXAM"
            : task.task_type === "quiz"
              ? " · QUIZ"
              : ""}
        </span>
        <strong>{task.title}</strong>
        {mode === "week" && (
          <span className="event-course">{course?.name}</span>
        )}
      </button>
    );
  }
  return (
    <div className="view-content">
      <div className="view-toolbar">
        <div className="calendar-nav">
          <button
            className="icon-button"
            aria-label={`Previous ${mode}`}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="icon-button"
            aria-label={`Next ${mode}`}
            onClick={() => move(1)}
          >
            <ChevronRight size={20} />
          </button>
          <h2>
            {mode === "month"
              ? format(anchor, "MMMM yyyy")
              : `${format(first, "MMM d")} – ${format(addDays(first, 6), "MMM d, yyyy")}`}
          </h2>
          <button
            className="button secondary"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </button>
        </div>
        <div className="filter-tabs">
          <button
            className={mode === "month" ? "selected" : ""}
            onClick={() => setMode("month")}
          >
            Month
          </button>
          <button
            className={mode === "week" ? "selected" : ""}
            onClick={() => setMode("week")}
          >
            Week
          </button>
        </div>
      </div>
      <div className="view-toolbar">
        <label className="compact-select">
          Course
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="all">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>
      <div
        className="calendar-scroll"
        role="region"
        aria-label={`${mode} calendar`}
        tabIndex={0}
      >
        <div className={`calendar-grid ${mode}`}>
          {days.slice(0, 7).map((day) => (
            <div className="calendar-weekday" key={day.toISOString()}>
              {format(day, "EEE")}
              {mode === "week" && (
                <strong
                  className={isSameDay(day, new Date()) ? "today-number" : ""}
                >
                  {format(day, "d")}
                </strong>
              )}
            </div>
          ))}
          {days.map((day) => {
            const dayTasks = visible.filter((t) =>
              isSameDay(new Date(t.due_at), day),
            );
            return (
              <div
                className={`calendar-cell ${mode === "month" && !isSameMonth(day, anchor) ? "outside" : ""} ${isSameDay(day, new Date()) ? "today-cell" : ""}`}
                key={day.toISOString()}
              >
                {mode === "month" && (
                  <button
                    className={`calendar-day-number ${isSameDay(day, new Date()) ? "today-number" : ""}`}
                    aria-label={`Show week of ${format(day, "MMMM d, yyyy")}`}
                    onClick={() => {
                      setAnchor(day);
                      setMode("week");
                    }}
                  >
                    {format(day, "d")}
                  </button>
                )}
                {(mode === "month" ? dayTasks.slice(0, 3) : dayTasks).map(
                  taskButton,
                )}
                {mode === "month" && dayTasks.length > 3 && (
                  <button
                    className="more-events"
                    onClick={() => {
                      setAnchor(day);
                      setMode("week");
                    }}
                  >
                    +{dayTasks.length - 3} more
                  </button>
                )}
                {mode === "week" && !dayTasks.length && (
                  <p className="calendar-clear">No deadlines</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="view-footnote">
        All deadlines use {Intl.DateTimeFormat().resolvedOptions().timeZone}.
        Select an item to edit it.
      </p>
    </div>
  );
}
