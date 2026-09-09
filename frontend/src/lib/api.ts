import type {
  Course,
  CourseInput,
  Task,
  TaskInput,
  Subtask,
  FocusSession,
  FocusInput,
} from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      "Could not reach Studyspace. Check the server connection and try again.",
      0,
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (item: { loc: string[]; msg: string }) =>
                  `${item.loc.slice(1).join(".")}: ${item.msg}`,
              )
              .join("; ")
          : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  courses: () => request<Course[]>("/courses"),
  createCourse: (data: CourseInput) =>
    request<Course>("/courses", "POST", data),
  updateCourse: (id: number, data: Partial<CourseInput>) =>
    request<Course>(`/courses/${id}`, "PATCH", data),
  deleteCourse: (id: number) => request<void>(`/courses/${id}`, "DELETE"),
  tasks: () => request<Task[]>("/tasks"),
  createTask: (data: TaskInput) => request<Task>("/tasks", "POST", data),
  updateTask: (id: number, data: Partial<TaskInput>) =>
    request<Task>(`/tasks/${id}`, "PATCH", data),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, "DELETE"),
  createSubtask: (id: number, title: string, position: number) =>
    request<Subtask>(`/tasks/${id}/subtasks`, "POST", { title, position }),
  updateSubtask: (
    id: number,
    data: Partial<Pick<Subtask, "title" | "is_completed" | "position">>,
  ) => request<Subtask>(`/subtasks/${id}`, "PATCH", data),
  deleteSubtask: (id: number) => request<void>(`/subtasks/${id}`, "DELETE"),
  sessions: () => request<FocusSession[]>("/focus-sessions"),
  saveSession: (data: FocusInput) =>
    request<FocusSession>("/focus-sessions", "POST", data),
};
