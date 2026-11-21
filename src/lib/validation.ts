import { AppError } from "./errors";
import { CATEGORIES, DESTINATIONS, type Category, type Destination, type SaveTaskInput } from "./types";

export const MAX_ANNOUNCEMENT_LENGTH = 5000;
const DUE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function validateAnnouncement(body: Record<string, unknown>): string {
  const announcement = text(body.text);
  if (!announcement) {
    throw new AppError("empty_input", "Paste an announcement first.");
  }
  if (announcement.length > MAX_ANNOUNCEMENT_LENGTH) {
    throw new AppError(
      "input_too_long",
      `The announcement is too long. Keep it under ${MAX_ANNOUNCEMENT_LENGTH} characters.`,
    );
  }
  return announcement;
}

export function isValidDue(value: string): boolean {
  if (!DUE_PATTERN.test(value)) return false;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  return value.length === 10 || !Number.isNaN(new Date(value).getTime());
}

export function validateSaveInput(body: Record<string, unknown>): SaveTaskInput {
  const title = text(body.title);
  if (!title) throw new AppError("invalid_task", "A task title is required.");
  if (title.length > 200) throw new AppError("invalid_task", "The title must be 200 characters or fewer.");

  if (!CATEGORIES.includes(body.category as Category)) {
    throw new AppError("invalid_task", `Category must be one of: ${CATEGORIES.join(", ")}.`);
  }
  if (!DESTINATIONS.includes(body.destination as Destination)) {
    throw new AppError("invalid_task", "Choose the Notion database to save to.");
  }

  const rawDue = text(body.dueDate);
  if (rawDue && !isValidDue(rawDue)) {
    throw new AppError("invalid_task", "The deadline is not a valid date.");
  }

  return {
    title,
    course: text(body.course).slice(0, 100),
    category: body.category as Category,
    dueDate: rawDue || null,
    description: text(body.description).slice(0, 2000),
    source: text(body.source).slice(0, MAX_ANNOUNCEMENT_LENGTH),
    destination: body.destination as Destination,
    force: body.force === true,
  };
}
