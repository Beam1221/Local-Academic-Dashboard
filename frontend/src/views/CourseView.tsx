import { useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { Course, Task, Status } from "../types";
import { statusNames } from "../types";
import { Progress, TaskCard } from "../components/TaskCard";

export function CourseView({
  course,
  tasks,
  busy,
  onTask,
  onStatus,
  onEdit,
  onDelete,
  onNewTask,
}: {
  course: Course;
  tasks: Task[];
  busy: boolean;
  onTask: (t: Task) => void;
  onStatus: (t: Task, s: Status) => void;
  onEdit: () => void;
  onDelete: () => void;
  onNewTask: () => void;
}) {
  const [filter, setFilter] = useState<Status | "all">("all");
  const courseTasks = tasks.filter((t) => t.course_id === course.id);
  const visible = courseTasks.filter(
    (t) => filter === "all" || t.status === filter,
  );
  return (
    <div className="view-content">
      <div className="course-overview-grid">
        <section className="panel course-progress-panel">
          <BookOpen size={24} style={{ color: course.color }} />
          <span className="eyebrow">COURSE PROGRESS</span>
          <div>
            <strong>
              {Math.round(course.progress)}
              <span>%</span>
            </strong>
            <p>
              {course.completed_tasks} of {course.total_tasks}
              <br />
              tasks complete
            </p>
          </div>
          <Progress
            value={course.progress}
            color={course.color}
            label={`${course.name} completion`}
          />
        </section>
        <section className="panel syllabus">
          <div className="section-heading">
            <h2>Syllabus overview</h2>
            <button className="text-button" onClick={onEdit}>
              <Pencil size={14} />
              Edit course
            </button>
          </div>
          <p>
            {course.syllabus ||
              "Add your course topics, assessment weights, and weekly study plan."}
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Coursework <span className="count">{courseTasks.length}</span>
          </h2>
          <button className="text-button" onClick={onNewTask}>
            <Plus size={16} />
            Add task
          </button>
        </div>
        <div className="filter-tabs" aria-label="Task status filter">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            All tasks
          </button>
          {Object.entries(statusNames).map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "selected" : ""}
              onClick={() => setFilter(key as Status)}
            >
              {label}
            </button>
          ))}
        </div>
        {visible.map((task) => (
          <TaskCard
            task={task}
            course={course}
            key={task.id}
            onOpen={onTask}
            onStatus={onStatus}
            busy={busy}
          />
        ))}
        {!visible.length && (
          <div className="empty-inline">
            <BookOpen size={28} />
            <div>
              <strong>
                {courseTasks.length
                  ? "No tasks in this status"
                  : "Your coursework starts here"}
              </strong>
              <p>
                {courseTasks.length
                  ? "Choose another filter to see your tasks."
                  : "Add an assignment, quiz, or project to start tracking progress."}
              </p>
            </div>
          </div>
        )}
      </section>
      <button className="text-button course-delete" onClick={onDelete}>
        <Trash2 size={15} />
        Delete this course
      </button>
    </div>
  );
}
