import { AppError } from "../errors";
import { llmConfig } from "../extract/llm";
import type { ConnectionStatus, DatabaseStatus } from "../types";
import { notionClient, notionToken, toAppError, type DatabaseKey } from "./client";
import { FIELDS, findSource } from "./schema";

const REQUIRED: Record<DatabaseKey, boolean> = { assignments: true, tasks: true, courses: false };

async function databaseStatus(key: DatabaseKey): Promise<DatabaseStatus> {
  const required = REQUIRED[key];
  try {
    const source = await findSource(key);
    if (!source) {
      return { ok: false, required, error: `No ${key} database is shared with the integration.` };
    }
    return {
      ok: true,
      required,
      title: source.title,
      url: source.url,
      discovered: source.discovered,
      mapped: Object.fromEntries(FIELDS.map((field) => [field, source.map[field]?.name ?? null])),
    };
  } catch (error) {
    return { ok: false, required, error: toAppError(error, `read the ${key} database`).message };
  }
}

const EMPTY: ConnectionStatus["databases"] = {
  assignments: { ok: false, required: true },
  tasks: { ok: false, required: true },
  courses: { ok: false, required: false },
};

/** Checks the token and each database against the live workspace. Never returns the token. */
export async function connectionStatus(): Promise<ConnectionStatus> {
  const llm = llmConfig();
  const base = { llm: { enabled: Boolean(llm), model: llm?.model } };
  if (!notionToken()) {
    return {
      ...base,
      configured: false,
      connected: false,
      error: "Notion is not connected yet.",
      hint: "Add NOTION_TOKEN to .env.local and restart the app.",
      databases: EMPTY,
    };
  }
  try {
    const me = await notionClient().users.me({});
    const [assignments, tasks, courses] = await Promise.all([
      databaseStatus("assignments"),
      databaseStatus("tasks"),
      databaseStatus("courses"),
    ]);
    return {
      ...base,
      configured: true,
      connected: true,
      botName: me.name ?? undefined,
      workspaceName: (me.type === "bot" && "workspace_name" in me.bot && me.bot.workspace_name) || undefined,
      databases: { assignments, tasks, courses },
    };
  } catch (error) {
    const app: AppError = toAppError(error, "connect to the workspace");
    return { ...base, configured: true, connected: false, error: app.message, hint: app.hint, databases: EMPTY };
  }
}
