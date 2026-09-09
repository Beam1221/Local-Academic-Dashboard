import type { Task } from "../types";

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}
type ToolDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: Tool,
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};

export function registerWorkspaceTools(
  getTasks: () => Task[],
  openTask: (id: number) => void,
) {
  const context = (document as ToolDocument).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: "list_coursework",
      title: "List coursework",
      description:
        "Read coursework with task identifiers, due dates, priorities, and statuses.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("Expected an empty object");
        return getTasks().map(
          ({ id, title, due_at, priority, status, course_id }) => ({
            id,
            title,
            due_at,
            priority,
            status,
            course_id,
          }),
        );
      },
    },
    {
      name: "open_task_details",
      title: "Open task details",
      description:
        "Open a task and its checklist in the workspace. Does not modify or complete the task.",
      inputSchema: {
        type: "object",
        properties: { task_id: { type: "integer" } },
        required: ["task_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (
          !input ||
          typeof input !== "object" ||
          Object.keys(input).length !== 1 ||
          !("task_id" in input) ||
          !Number.isInteger(input.task_id)
        )
          throw new Error("A task_id integer is required");
        const task = getTasks().find((t) => t.id === input.task_id);
        if (!task) throw new Error("Task not found");
        openTask(task.id);
        return { opened_task_id: task.id };
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser API: the normal interface remains available. */
    }
  }
  return () => lifecycle.abort();
}
