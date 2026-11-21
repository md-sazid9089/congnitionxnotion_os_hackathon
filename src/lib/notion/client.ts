import {
  APIErrorCode,
  APIResponseError,
  Client,
  ClientErrorCode,
  extractNotionId,
  isNotionClientError,
} from "@notionhq/client";
import { AppError } from "../errors";

export type DatabaseKey = "assignments" | "tasks" | "courses";

const ID_ENV: Record<DatabaseKey, string> = {
  assignments: "NOTION_ASSIGNMENTS_DB_ID",
  tasks: "NOTION_TASKS_DB_ID",
  courses: "NOTION_COURSES_DB_ID",
};

export function notionToken(): string | null {
  return process.env.NOTION_TOKEN?.trim() || process.env.NOTION_API_KEY?.trim() || null;
}

let cached: { token: string; client: Client } | null = null;

/** Server-only Notion client. The token never leaves the server. */
export function notionClient(): Client {
  const token = notionToken();
  if (!token) {
    throw new AppError(
      "notion_not_configured",
      "Notion is not connected yet.",
      503,
      "Set NOTION_TOKEN in .env.local and restart the app.",
    );
  }
  if (cached?.token !== token) cached = { token, client: new Client({ auth: token }) };
  return cached.client;
}

/** The configured ID for a database, taken from a raw ID or a pasted Notion URL. */
export function configuredId(key: DatabaseKey): { value: string | null; envName: string; raw: string } {
  const envName = ID_ENV[key];
  const raw = process.env[envName]?.trim() ?? "";
  return { value: raw ? (extractNotionId(raw) ?? raw) : null, envName, raw };
}

export function propertyOverrides(key: DatabaseKey): Record<string, string> {
  const raw = process.env.NOTION_PROPERTY_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    return parsed[key] ?? {};
  } catch {
    throw new AppError(
      "invalid_property_map",
      "NOTION_PROPERTY_MAP is not valid JSON.",
      500,
      'Use the form {"assignments":{"dueDate":"Due Date"},"tasks":{"status":"Status"}}.',
    );
  }
}

export function isNotFound(error: unknown): boolean {
  return (
    APIResponseError.isAPIResponseError(error) &&
    (error.code === APIErrorCode.ObjectNotFound || error.code === APIErrorCode.ValidationError)
  );
}

export function isValidationError(error: unknown): error is APIResponseError {
  return APIResponseError.isAPIResponseError(error) && error.code === APIErrorCode.ValidationError;
}

/** Turns SDK and network failures into messages a student can act on. */
export function toAppError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;
  if (APIResponseError.isAPIResponseError(error)) {
    switch (error.code) {
      case APIErrorCode.Unauthorized:
        return new AppError(
          "notion_unauthorized",
          "Notion rejected the API token.",
          401,
          "Check NOTION_TOKEN. It must be the internal integration secret.",
        );
      case APIErrorCode.RestrictedResource:
        return new AppError(
          "notion_forbidden",
          `The integration is not allowed to ${context}.`,
          403,
          "Give the integration read, insert and update content capabilities in its settings.",
        );
      case APIErrorCode.ObjectNotFound:
        return new AppError(
          "notion_not_found",
          `Notion could not find the database needed to ${context}.`,
          404,
          "Check the database ID, and share the Student OS page with the integration (page menu, Connections).",
        );
      case APIErrorCode.ValidationError:
        return new AppError(
          "notion_validation",
          `Notion rejected the request to ${context}: ${error.message}`,
          400,
          "The database properties may not match. Adjust NOTION_PROPERTY_MAP or the database.",
        );
      case APIErrorCode.RateLimited:
        return new AppError(
          "notion_rate_limited",
          "Notion is rate limiting requests.",
          429,
          "Wait a few seconds and try again.",
        );
      default:
        return new AppError("notion_error", `Notion could not ${context}: ${error.message}`, 502);
    }
  }
  if (isNotionClientError(error) && error.code === ClientErrorCode.RequestTimeout) {
    return new AppError("notion_timeout", "Notion took too long to respond.", 504, "Try again.");
  }
  if (error instanceof TypeError || (error instanceof Error && /fetch|network|ENOTFOUND|ECONN/i.test(error.message))) {
    return new AppError(
      "network_error",
      "Could not reach Notion.",
      502,
      "Check the server's internet connection and try again.",
    );
  }
  console.error(`[campuscatch] failed to ${context}:`, error);
  return new AppError("notion_error", `Could not ${context}.`, 502);
}
