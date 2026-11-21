"use client";

import type { ConnectionStatus } from "@/lib/types";
import { Notice } from "./ui";

const LABELS = { assignments: "Assignments", tasks: "Tasks", courses: "Courses" } as const;

export function ConnectionPill({ status }: { status: ConnectionStatus | null }) {
  const ready = Boolean(status?.connected && status.databases.assignments.ok && status.databases.tasks.ok);
  const partial = Boolean(status?.connected) && !ready;
  const tone = !status ? "bg-slate-100 text-slate-600" : ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
  const label = !status ? "Checking Notion" : ready ? "Notion connected" : partial ? "Notion needs setup" : "Notion not connected";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone}`} title={status?.workspaceName}>
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : status ? "bg-amber-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

export function ConnectionPanel({ status }: { status: ConnectionStatus | null }) {
  if (!status) return null;
  if (!status.connected) {
    return (
      <Notice tone="warning" title={status.error ?? "Notion is not connected."} role="status">
        {status.hint && <p>{status.hint}</p>}
        <p>Extraction and review still work. Saving and the task list need Notion.</p>
      </Notice>
    );
  }
  const keys = ["assignments", "tasks", "courses"] as const;
  const problems = keys.filter((key) => !status.databases[key].ok && status.databases[key].required);
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" open={problems.length > 0}>
      <summary className="cursor-pointer font-medium text-slate-700">
        {status.workspaceName ? `Workspace: ${status.workspaceName}` : "Notion workspace"}
        {problems.length > 0 && <span className="ml-2 text-amber-700">({problems.length} database{problems.length > 1 ? "s" : ""} missing)</span>}
      </summary>
      <ul className="mt-3 space-y-2">
        {keys.map((key) => {
          const db = status.databases[key];
          const unmapped = db.mapped ? Object.entries(db.mapped).filter(([, name]) => !name).map(([field]) => field) : [];
          return (
            <li key={key} className="flex flex-wrap items-baseline gap-x-2">
              <span className={`font-semibold ${db.ok ? "text-emerald-700" : db.required ? "text-amber-700" : "text-slate-500"}`}>{LABELS[key]}</span>
              {db.ok ? (
                <>
                  <a href={db.url} target="_blank" rel="noreferrer" className="text-slate-700 underline">
                    {db.title}
                  </a>
                  {db.discovered && <span className="text-xs text-slate-500">found by name</span>}
                  {unmapped.length > 0 && <span className="text-xs text-slate-500">no property for: {unmapped.join(", ")}</span>}
                </>
              ) : (
                <span className="text-slate-600">{db.error ?? "Not found."}{!db.required && " Optional."}</span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
