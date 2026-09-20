import {
  CalendarDays,
  CheckCheck,
  Clock3,
} from "lucide-react";
import type { Course, Task, Status } from "../types";
import { deadlineGroups } from "../lib/dates";
import { Progress, TaskCard } from "../components/TaskCard";

export function Dashboard({
  tasks,
  courses,
  now,
  onTask,
  onStatus,
  busy,
}: {
  tasks: Task[];
  courses: Course[];
  now: Date;
  onTask: (t: Task) => void;
  onStatus: (t: Task, s: Status) => void;
  busy: boolean;
}) {
  const { today, next, overdue } = deadlineGroups(tasks, now);
  const completed = tasks.filter((t) => t.status === "completed").length;
  const percentage = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;
  const courseFor = (task: Task) =>
    courses.find((c) => c.id === task.course_id);
  return (
    <>
      <div className="stats-grid">
        <div className="stat">
          <span>
            <CalendarDays size={17} />
            Due today
          </span>
          <div>
            <strong>{today.length.toString().padStart(2, "0")}</strong>
            <small>
              {today.length === 1 ? "task to work on" : "tasks to work on"}
            </small>
          </div>
        </div>
        <div className="stat">
          <span>
            <Clock3 size={17} />
            Next 7 days
          </span>
          <div>
            <strong>{next.length.toString().padStart(2, "0")}</strong>
            <small>
              upcoming {next.length === 1 ? "deadline" : "deadlines"}
            </small>
          </div>
        </div>
        <div className="stat">
          <span>
            <CheckCheck size={17} />
            Coursework complete
          </span>
          <div>
            <strong>
              {percentage}
              <em>%</em>
            </strong>
            <small>
              {completed} of {tasks.length} tasks
            </small>
          </div>
          <Progress value={percentage} label="All coursework completion" />
        </div>
      </div>
      {overdue.length > 0 && (
        <section className="overdue-panel">
          <div className="section-heading">
            <h3>
              <Clock3 size={17} />
              {overdue.length} overdue {overdue.length === 1 ? "task" : "tasks"}
            </h3>
            <span>Needs attention</span>
          </div>
          {overdue.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              course={courseFor(task)}
              onOpen={onTask}
              onStatus={onStatus}
              busy={busy}
            />
          ))}
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>
            Due today <span className="count">{today.length}</span>
          </h2>
          <span>
            {now.toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        </div>
        {today.length ? (
          today.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              course={courseFor(task)}
              onOpen={onTask}
              onStatus={onStatus}
              busy={busy}
            />
          ))
        ) : (
          <div className="empty-inline">
            <CheckCheck size={28} />
            <div>
              <strong>No deadlines today</strong>
              <p>
                {tasks.length
                  ? "A little breathing room. Pick an upcoming task to get ahead."
                  : "Add your courses and tasks to start planning your week."}
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Up next <span className="count">{next.length}</span>
          </h2>
          <span>Next 7 days</span>
        </div>
        {next.length ? (
          next.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              course={courseFor(task)}
              onOpen={onTask}
              onStatus={onStatus}
              busy={busy}
            />
          ))
        ) : (
          <div className="empty-inline">
            <CalendarDays size={28} />
            <div>
              <strong>Your week is clear</strong>
              <p>No unfinished tasks due in the next seven days.</p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
