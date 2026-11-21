import { dhakaToday, formatYMD, TIME_ZONE, TZ_OFFSET } from "../dates";
import { CATEGORIES, defaultDestination, type Category, type ExtractionResult } from "../types";
import { isValidDue } from "../validation";

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Any OpenAI-compatible chat completions endpoint works (OpenAI, Gemini, Groq, ...). */
export function llmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.LLM_MODEL || "gpt-4o-mini",
  };
}

function systemPrompt(now: Date): string {
  const today = dhakaToday(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long" }).format(now);
  return [
    "You extract one actionable student task from a class-group announcement.",
    "Messages may be in English, Bangla, or Banglish (Bangla in Latin letters).",
    `Today is ${weekday}, ${formatYMD(today)} in ${TIME_ZONE} (UTC${TZ_OFFSET}).`,
    "Reply with a single JSON object and nothing else:",
    '{"actionable": boolean, "reason": string, "title": string, "course": string, "category": string,',
    ' "dueDate": string | null, "description": string, "needsReview": boolean, "reviewNotes": string[]}',
    `category must be one of: ${CATEGORIES.join(", ")}.`,
    `dueDate is "YYYY-MM-DD" when no time is given, or "YYYY-MM-DDTHH:mm:00${TZ_OFFSET}" when a time is given.`,
    "Resolve relative dates (tomorrow, kalke, next Friday) against today.",
    "NEVER invent a deadline. If the message has no date, dueDate is null and needsReview is true.",
    "If a date or time is ambiguous, give your best reading, set needsReview true, and explain in reviewNotes.",
    "course is the course code such as \"CSE 4137\", or an empty string.",
    "title is short, in English, such as \"Soft Computing Assignment\". description holds extra instructions only.",
    "If the message is small talk with nothing to do, set actionable false and explain in reason.",
  ].join("\n");
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function extractWithLlm(
  text: string,
  now: Date,
  config: LlmConfig,
  rules: ExtractionResult,
): Promise<ExtractionResult> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(now) },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`LLM request failed with status ${response.status}`);

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "") as Record<string, unknown>;

  if (parsed.actionable === false) {
    return {
      actionable: false,
      task: null,
      engine: "llm",
      reason: str(parsed.reason) || "No actionable item was detected in this message.",
    };
  }

  const category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : (rules.task?.category ?? "General Task");
  const reviewNotes = Array.isArray(parsed.reviewNotes)
    ? parsed.reviewNotes.filter((note): note is string => typeof note === "string")
    : [];

  let dueDate: string | null = str(parsed.dueDate) || null;
  let needsReview = parsed.needsReview === true;
  if (dueDate && !isValidDue(dueDate)) {
    dueDate = null;
    reviewNotes.push("The AI returned a deadline that could not be read, so it was left empty.");
  }
  // The model must not add a deadline the message does not support.
  if (dueDate && !rules.task?.dueDate) {
    needsReview = true;
    reviewNotes.push("This deadline was inferred by AI. Confirm it against the message.");
  }
  if (!dueDate) {
    needsReview = true;
    if (reviewNotes.length === 0) {
      reviewNotes.push("No deadline was found in the message. Add one or confirm it has none.");
    }
  }

  const title = str(parsed.title) || rules.task?.title || "";
  return {
    actionable: true,
    engine: "llm",
    task: {
      title,
      course: str(parsed.course) || rules.task?.course || "",
      category,
      dueDate,
      description: str(parsed.description),
      status: "Not Started",
      needsReview: needsReview || !title,
      reviewNotes,
      destination: defaultDestination(category),
      source: text.trim(),
    },
  };
}
