import type { ApiError, ApiResponse } from "./types";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public hint?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>, { status });
}

export function fail(error: unknown): Response {
  const app = error instanceof AppError ? error : null;
  if (!app) console.error("[campuscatch] unexpected error:", error);
  const body: ApiError = app
    ? { code: app.code, message: app.message, hint: app.hint, details: app.details }
    : { code: "internal_error", message: "Something went wrong on the server. Please try again." };
  return Response.json({ ok: false, error: body } satisfies ApiResponse<never>, {
    status: app?.status ?? 500,
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // fall through to the error below
  }
  throw new AppError("invalid_request", "The request body must be a JSON object.");
}
