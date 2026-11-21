import type { ApiError, ApiResponse } from "./types";

export class ApiFailure extends Error {
  constructor(
    public error: ApiError,
    public status: number,
  ) {
    super(error.message);
    this.name = "ApiFailure";
  }
}

/** Calls a CampusCatch API route and unwraps the `{ ok, data | error }` envelope. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure(
      { code: "network_error", message: "Could not reach the CampusCatch server.", hint: "Check your connection and try again." },
      0,
    );
  }
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // handled below
  }
  if (!payload) {
    throw new ApiFailure({ code: "bad_response", message: `The server returned an unexpected response (${response.status}).` }, response.status);
  }
  if (!payload.ok) throw new ApiFailure(payload.error, response.status);
  return payload.data;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiFailure) return error.error;
  return { code: "unknown", message: "Something went wrong. Please try again." };
}
