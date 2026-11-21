"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, toApiError } from "@/lib/api";
import type { ApiError, ConnectionStatus, ExtractionResult, SaveTaskResult, TaskItem } from "@/lib/types";
import { CapturePanel } from "./CapturePanel";
import { ConnectionPanel, ConnectionPill } from "./ConnectionPanel";
import { ReviewCard, type Draft } from "./ReviewCard";
import { TaskDashboard } from "./TaskDashboard";
import { ErrorNotice, Notice } from "./ui";

export function CampusCatch() {
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<SaveTaskResult | null>(null);

  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<ApiError | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      setTasks((await api<{ tasks: TaskItem[] }>("/api/tasks")).tasks);
    } catch (error) {
      setTasksError(toApiError(error));
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await api<ConnectionStatus>("/api/status");
        if (cancelled) return;
        setStatus(next);
        if (next.connected) void loadTasks();
      } catch (error) {
        if (cancelled) return;
        const failure = toApiError(error);
        setStatus({
          configured: false,
          connected: false,
          error: failure.message,
          hint: failure.hint,
          databases: {
            assignments: { ok: false, required: true },
            tasks: { ok: false, required: true },
            courses: { ok: false, required: false },
          },
          llm: { enabled: false },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTasks]);

  const extract = async () => {
    setExtracting(true);
    setExtractError(null);
    setSaveError(null);
    setSaved(null);
    try {
      const next = await api<ExtractionResult>("/api/extract", { text });
      setResult(next);
      setDraft(next.task ? { ...next.task, destinationPinned: false } : null);
      if (next.task) requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (error) {
      setExtractError(toApiError(error));
    } finally {
      setExtracting(false);
    }
  };

  const save = async (force = false) => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await api<SaveTaskResult>("/api/tasks", {
        title: draft.title,
        course: draft.course,
        category: draft.category,
        dueDate: draft.dueDate,
        description: draft.description,
        source: draft.source,
        destination: draft.destination,
        force,
      });
      setSaved(response);
      void loadTasks();
    } catch (error) {
      setSaveError(toApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setText("");
    setResult(null);
    setDraft(null);
    setSaved(null);
    setSaveError(null);
    setExtractError(null);
  };

  const destinationReady = Boolean(status?.connected && draft && status.databases[draft.destination].ok);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white" aria-hidden="true">
            C
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">CampusCatch</h1>
            <p className="text-sm text-slate-600">Turn class announcements into Notion tasks.</p>
          </div>
        </div>
        <ConnectionPill status={status} />
      </header>

      <div className="mt-6">
        <ConnectionPanel status={status} />
      </div>

      <main className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <CapturePanel text={text} onChange={setText} onExtract={extract} busy={extracting} />
          {extractError && <ErrorNotice error={extractError} />}
          {result && !result.actionable && (
            <Notice tone="info" title="No task found in this message" role="status">
              <p>{result.reason ?? "This message does not seem to contain anything to do."}</p>
            </Notice>
          )}
          <div ref={reviewRef}>
            {draft && result && (
              <ReviewCard
                draft={draft}
                onChange={setDraft}
                onSave={save}
                onDiscard={reset}
                saving={saving}
                saveError={saveError}
                saved={saved}
                canSave={destinationReady}
                engine={result.engine}
                notice={result.notice}
              />
            )}
          </div>
        </div>
        <TaskDashboard
          tasks={tasks}
          loading={tasksLoading}
          error={tasksError}
          onRefresh={loadTasks}
          connected={Boolean(status?.connected && (status.databases.assignments.ok || status.databases.tasks.ok))}
          newId={saved?.item.id ?? null}
        />
      </main>

      <footer className="mt-10 text-center text-xs text-slate-500">
        Built for the Cognition × Notion Student OS hackathon. Dates are read in Asia/Dhaka time.
      </footer>
    </div>
  );
}
