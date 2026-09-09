import { useState } from "react";
import { ArrowUpRight, CalendarClock, CircleCheck, Zap } from "lucide-react";
import type { Course, Task } from "../types";
import { matrixQuadrant } from "../lib/dates";
import { TaskCard } from "../components/TaskCard";

const quadrants = [
  {
    title: "Do first",
    subtitle: "Urgent & important",
    description: "Protect time for these first.",
    icon: Zap,
    color: "#E9A1A8",
  },
  {
    title: "Schedule",
    subtitle: "Important, less urgent",
    description: "Start early. Give yourself room.",
    icon: CalendarClock,
    color: "#B5A5FF",
  },
  {
    title: "Handle quickly",
    subtitle: "Urgent, lower importance",
    description: "Keep the effort proportional.",
    icon: ArrowUpRight,
    color: "#E9C27F",
  },
  {
    title: "Reconsider",
    subtitle: "Less urgent & lower importance",
    description: "Review after your priorities.",
    icon: CircleCheck,
    color: "#91BDC1",
  },
];
export function MatrixView({
  tasks,
  courses,
  now,
  onTask,
}: {
  tasks: Task[];
  courses: Course[];
  now: Date;
  onTask: (t: Task) => void;
}) {
  const [courseId, setCourseId] = useState("all");
  const active = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      (courseId === "all" || t.course_id === Number(courseId)),
  );
  return (
    <div className="view-content">
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
        <span className="tag">Eisenhower matrix</span>
      </div>
      <div className="matrix-grid">
        {quadrants.map((quadrant, index) => {
          const items = active.filter((t) => matrixQuadrant(t, now) === index);
          const Icon = quadrant.icon;
          return (
            <section
              className="matrix-quadrant"
              key={quadrant.title}
              style={
                { "--quadrant-color": quadrant.color } as React.CSSProperties
              }
            >
              <div className="matrix-heading">
                <div className="matrix-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <span>{quadrant.subtitle}</span>
                  <h2>{quadrant.title}</h2>
                </div>
                <span className="count">{items.length}</span>
              </div>
              <p className="matrix-description">{quadrant.description}</p>
              {items.length ? (
                items.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    course={courses.find((c) => c.id === t.course_id)}
                    onOpen={onTask}
                  />
                ))
              ) : (
                <p className="matrix-empty">No tasks in this quadrant</p>
              )}
            </section>
          );
        })}
      </div>
      <p className="view-footnote">
        Urgent = due within 48 hours, including overdue. Important = high
        priority. Completed tasks are excluded. Edit a task’s due date or
        priority to change its placement.
      </p>
    </div>
  );
}
