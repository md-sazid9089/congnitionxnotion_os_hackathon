export const CATEGORIES = [
  "Assignment",
  "Quiz",
  "Examination",
  "Lab",
  "Project",
  "Meeting",
  "General Task",
  "Reminder",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DESTINATIONS = ["assignments", "tasks"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const ACADEMIC_CATEGORIES: readonly Category[] = [
  "Assignment",
  "Quiz",
  "Examination",
  "Lab",
  "Project",
];

export function defaultDestination(category: Category): Destination {
  return ACADEMIC_CATEGORIES.includes(category) ? "assignments" : "tasks";
}

export interface ExtractedTask {
  title: string;
  course: string;
  category: Category;
  /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:00+06:00`; null when the message has no deadline. */
  dueDate: string | null;
  description: string;
  status: "Not Started";
  needsReview: boolean;
  reviewNotes: string[];
  destination: Destination;
  source: string;
}

export interface ExtractionResult {
  actionable: boolean;
  task: ExtractedTask | null;
  reason?: string;
  engine: "rules" | "llm";
  notice?: string;
}

export interface TaskItem {
  id: string;
  url: string;
  title: string;
  course: string | null;
  category: string | null;
  dueDate: string | null;
  status: string | null;
  completed: boolean;
  database: Destination;
}

export interface SaveTaskInput {
  title: string;
  course: string;
  category: Category;
  dueDate: string | null;
  description: string;
  source: string;
  destination: Destination;
  force?: boolean;
}

export interface SaveTaskResult {
  page: { id: string; url: string };
  item: TaskItem;
  warnings: string[];
}

export interface DatabaseStatus {
  ok: boolean;
  required: boolean;
  title?: string;
  url?: string;
  discovered?: boolean;
  mapped?: Record<string, string | null>;
  error?: string;
}

export interface ConnectionStatus {
  configured: boolean;
  connected: boolean;
  workspaceName?: string;
  botName?: string;
  error?: string;
  hint?: string;
  databases: Record<"assignments" | "tasks" | "courses", DatabaseStatus>;
  llm: { enabled: boolean; model?: string };
}

export interface ApiError {
  code: string;
  message: string;
  hint?: string;
  details?: unknown;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
