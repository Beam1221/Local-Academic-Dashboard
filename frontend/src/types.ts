export type Status = "not_started" | "in_progress" | "completed";
export type Priority = "low" | "medium" | "high";
export type TaskType = "assignment" | "homework" | "quiz" | "project" | "exam";
export interface Course {
  id: number;
  name: string;
  color: string;
  syllabus: string;
  total_tasks: number;
  completed_tasks: number;
  progress: number;
}
export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  is_completed: boolean;
  position: number;
}
export interface Task {
  id: number;
  course_id: number;
  title: string;
  description: string;
  task_type: TaskType;
  due_at: string;
  status: Status;
  priority: Priority;
  subtasks: Subtask[];
  checklist_progress: number;
  focus_seconds: number;
}
export interface FocusSession {
  id: number;
  client_session_id: string;
  task_id: number | null;
  started_at: string;
  ended_at: string;
  elapsed_seconds: number;
}
export type FocusInput = Omit<FocusSession, "id">;
export type CourseInput = Pick<Course, "name" | "color" | "syllabus">;
export type TaskInput = Pick<
  Task,
  | "course_id"
  | "title"
  | "description"
  | "task_type"
  | "due_at"
  | "status"
  | "priority"
>;
export const statusNames: Record<Status, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};
export const typeNames: Record<TaskType, string> = {
  assignment: "Assignment",
  homework: "Homework",
  quiz: "Quiz",
  project: "Project",
  exam: "Exam",
};
export const priorityNames: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
