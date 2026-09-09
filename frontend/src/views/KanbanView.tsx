import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Course, Task, Status } from "../types";
import { TaskCard } from "../components/TaskCard";

const columns: { id: Status; title: string; color: string }[] = [
  { id: "not_started", title: "To do", color: "#A2A5B4" },
  { id: "in_progress", title: "Doing", color: "#B5A5FF" },
  { id: "completed", title: "Done", color: "#AFD493" },
];
function Column({
  id,
  title,
  color,
  count,
  children,
}: {
  id: Status;
  title: string;
  color: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      className={`kanban-column ${isOver ? "drag-over" : ""}`}
      ref={setNodeRef}
      aria-label={title}
    >
      <div className="kanban-heading">
        <span style={{ background: color }} />
        <h2>{title}</h2>
        <span className="count">{count}</span>
      </div>
      <div className="kanban-stack">
        {children}
        {count === 0 && <div className="kanban-empty">Drop a task here</div>}
      </div>
    </section>
  );
}
function DraggableTask({
  task,
  course,
  onTask,
  onMove,
  busy,
}: {
  task: Task;
  course?: Course;
  onTask: (t: Task) => void;
  onMove: (t: Task, s: Status) => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, disabled: busy });
  return (
    <div
      className="kanban-card"
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.25 : 1,
      }}
    >
      <div className="kanban-card-tools">
        <button
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${task.title}. Use the Move to menu as a keyboard alternative.`}
        >
          <GripVertical size={17} />
        </button>
        <span className="kanban-card-type">{task.task_type}</span>
      </div>
      <TaskCard task={task} course={course} onOpen={onTask} compact />
      <label className="move-label">
        Move to
        <select
          disabled={busy}
          aria-label={`Move ${task.title} to status`}
          value={task.status}
          onChange={(e) => onMove(task, e.target.value as Status)}
        >
          {columns.map((c) => (
            <option value={c.id} key={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function KanbanView({
  tasks,
  courses,
  onTask,
  onMove,
  busy,
}: {
  tasks: Task[];
  courses: Course[];
  onTask: (t: Task) => void;
  onMove: (t: Task, s: Status) => void;
  busy: boolean;
}) {
  const [courseId, setCourseId] = useState("all");
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );
  const visible = tasks.filter(
    (t) => courseId === "all" || t.course_id === Number(courseId),
  );
  function end(event: DragEndEvent) {
    setDragging(null);
    const task = tasks.find((t) => t.id === event.active.id);
    if (
      task &&
      event.over &&
      columns.some((c) => c.id === event.over!.id) &&
      task.status !== event.over.id
    )
      onMove(task, event.over.id as Status);
  }
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
        <p className="view-footnote">
          Drag a grip to move a task, or use its status menu.
        </p>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(event) =>
          setDragging(tasks.find((t) => t.id === event.active.id) ?? null)
        }
        onDragEnd={end}
        onDragCancel={() => setDragging(null)}
      >
        <div className="kanban-grid">
          {columns.map((column) => (
            <Column
              key={column.id}
              {...column}
              count={visible.filter((t) => t.status === column.id).length}
            >
              {visible
                .filter((t) => t.status === column.id)
                .map((task) => (
                  <DraggableTask
                    key={task.id}
                    task={task}
                    course={courses.find((c) => c.id === task.course_id)}
                    onTask={onTask}
                    onMove={onMove}
                    busy={busy}
                  />
                ))}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div className="kanban-card drag-preview">
              <TaskCard
                task={dragging}
                course={courses.find((c) => c.id === dragging.course_id)}
                onOpen={() => {}}
                compact
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
