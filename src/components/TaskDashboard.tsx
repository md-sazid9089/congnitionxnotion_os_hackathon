"use client";

import { useState } from "react";
import { formatDue, urgencyOf, type UrgencyLevel } from "@/lib/dates";
import type { ApiError, TaskItem } from "@/lib/types";
import { Card, ErrorNotice, Spinner, secondaryButton } from "./ui";

const BADGES: Record<UrgencyLevel, string> = {
  overdue: "bg-red-100 text-red-800",
  today: "bg-orange-100 text-orange-800",
  soon: "bg-amber-100 text-amber-800",
  later: "bg-emerald-100 text-emerald-800",
  none: "bg-slate-100 text-slate-600",
  done: "bg-slate-100 text-slate-500",
};

const BARS: Record<UrgencyLevel, string> = {
  overdue: "bg-red-500",
  today: "bg-orange-500",
  soon: "bg-amber-400",
  later: "bg-emerald-400",
  none: "bg-slate-300",
  done: "bg-slate-200",
};

function TaskRow({ task, isNew }: { task: TaskItem; isNew: boolean }) {
  const urgency = urgencyOf(task.dueDate, task.completed);
  const meta = [task.course, task.category, task.database === "assignments" ? "Assignments" : "Tasks"].filter(Boolean);
  return (
    <li className={`relative flex gap-3 rounded-xl border p-3 pl-4 ${isNew ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white"}`}>
      <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${BARS[urgency.level]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <a
          href={task.url}
          target="_blank"
          rel="noreferrer"
          className={`block truncate text-sm font-semibold hover:underline ${task.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
          title={`Open "${task.title}" in Notion`}
        >
          {task.title}
        </a>
        <p className="mt-0.5 truncate text-xs text-slate-500">{meta.join(" · ")}</p>
        <p className="mt-1 text-xs text-slate-600">{formatDue(task.dueDate)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGES[urgency.level]}`}>{urgency.label}</span>
        {isNew && <span className="text-xs font-medium text-indigo-700">Just saved</span>}
      </div>
    </li>
  );
}

export function TaskDashboard({
  tasks,
  loading,
  error,
  onRefresh,
  connected,
  newId,
}: {
  tasks: TaskItem[] | null;
  loading: boolean;
  error: ApiError | null;
  onRefresh: () => void;
  connected: boolean;
  newId: string | null;
}) {
  const [showDone, setShowDone] = useState(false);
  const all = tasks ?? [];
  const doneCount = all.filter((task) => task.completed).length;
  const visible = showDone ? all : all.filter((task) => !task.completed);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Upcoming in Notion</h2>
          <p className="mt-1 text-sm text-slate-600">Read live from your Assignments and Tasks databases.</p>
        </div>
        <button type="button" className={secondaryButton} onClick={onRefresh} disabled={loading || !connected}>
          {loading && <Spinner />}
          Refresh
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {error && <ErrorNotice error={error} />}

        {!connected && !error && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Connect Notion to see your tasks here.
          </p>
        )}

        {connected && tasks === null && loading && (
          <ul className="space-y-2" aria-label="Loading tasks">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </ul>
        )}

        {connected && tasks !== null && visible.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {all.length === 0 ? "No tasks in Notion yet. Capture your first announcement." : "Everything is done."}
          </p>
        )}

        {visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((task) => (
              <TaskRow key={task.id} task={task} isNew={task.id === newId} />
            ))}
          </ul>
        )}

        {doneCount > 0 && (
          <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : "Show"} {doneCount} completed
          </button>
        )}
      </div>
    </Card>
  );
}
