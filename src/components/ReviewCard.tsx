"use client";

import { formatDue, joinDue, splitDue } from "@/lib/dates";
import {
  CATEGORIES,
  defaultDestination,
  type ApiError,
  type Category,
  type Destination,
  type ExtractedTask,
  type SaveTaskResult,
} from "@/lib/types";
import { Card, ErrorNotice, Notice, Spinner, inputClass, primaryButton, secondaryButton } from "./ui";

export interface Draft extends ExtractedTask {
  /** True once the student picks a database by hand, so category changes stop moving it. */
  destinationPinned: boolean;
}

const DESTINATION_LABELS: Record<Destination, string> = { assignments: "Assignments", tasks: "Tasks" };

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ReviewCard({
  draft,
  onChange,
  onSave,
  onDiscard,
  saving,
  saveError,
  saved,
  canSave,
  engine,
  notice,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSave: (force?: boolean) => void;
  onDiscard: () => void;
  saving: boolean;
  saveError: ApiError | null;
  saved: SaveTaskResult | null;
  canSave: boolean;
  engine: "rules" | "llm";
  notice?: string;
}) {
  const { date, time } = splitDue(draft.dueDate);
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const duplicateUrl =
    saveError?.code === "duplicate_task" ? (saveError.details as { url?: string } | undefined)?.url : undefined;
  const locked = saving || Boolean(saved);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Review before saving</h2>
          <p className="mt-1 text-sm text-slate-600">Nothing is sent to Notion until you press Save.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {engine === "llm" ? "Extracted with AI" : "Extracted with built-in parser"}
        </span>
      </div>

      {notice && (
        <div className="mt-4">
          <Notice tone="info">{notice}</Notice>
        </div>
      )}

      {draft.needsReview && !saved && (
        <div className="mt-4">
          <Notice tone="warning" title="Please confirm these details" role="status">
            {draft.reviewNotes.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {draft.reviewNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p>Some details could not be read with confidence.</p>
            )}
          </Notice>
        </div>
      )}

      <fieldset disabled={locked} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" htmlFor="title">
            <input id="title" className={inputClass} value={draft.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </div>
        <Field label="Category" htmlFor="category">
          <select
            id="category"
            className={inputClass}
            value={draft.category}
            onChange={(e) => {
              const category = e.target.value as Category;
              set({ category, destination: draft.destinationPinned ? draft.destination : defaultDestination(category) });
            }}
          >
            {CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Field label="Course" htmlFor="course" hint="Optional. Linked to your Courses database when a match exists.">
          <input id="course" className={inputClass} value={draft.course} maxLength={100} placeholder="e.g. CSE 4137" onChange={(e) => set({ course: e.target.value })} />
        </Field>
        <Field label="Due date" htmlFor="due-date" hint={draft.dueDate ? `${formatDue(draft.dueDate)} (Dhaka time)` : "No deadline set."}>
          <input id="due-date" type="date" className={inputClass} value={date} onChange={(e) => set({ dueDate: joinDue(e.target.value, e.target.value ? time : "") })} />
        </Field>
        <Field label="Time" htmlFor="due-time" hint="Optional.">
          <input id="due-time" type="time" className={inputClass} value={time} disabled={!date} onChange={(e) => set({ dueDate: joinDue(date, e.target.value) })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="description">
            <textarea id="description" rows={3} className={`${inputClass} resize-y`} value={draft.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Save to</span>
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1" role="radiogroup" aria-label="Notion database">
            {(Object.keys(DESTINATION_LABELS) as Destination[]).map((destination) => (
              <button
                key={destination}
                type="button"
                role="radio"
                aria-checked={draft.destination === destination}
                onClick={() => set({ destination, destinationPinned: true })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  draft.destination === destination ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {DESTINATION_LABELS[destination]}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">Original message</summary>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">{draft.source}</p>
      </details>

      <div className="mt-5 space-y-3">
        {saveError && (
          <ErrorNotice error={saveError}>
            {duplicateUrl && (
              <p>
                <a href={duplicateUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                  Open the existing entry
                </a>
              </p>
            )}
            <p>Your edits are still here.</p>
          </ErrorNotice>
        )}
        {saved && (
          <Notice tone="success" title={`Saved to Notion ${DESTINATION_LABELS[saved.item.database]}`} role="status">
            <p>
              <a href={saved.page.url} target="_blank" rel="noreferrer" className="font-semibold underline">
                Open in Notion
              </a>
            </p>
            {saved.warnings.map((warning) => (
              <p key={warning}>Note: {warning}</p>
            ))}
          </Notice>
        )}
        {!canSave && !saved && (
          <Notice tone="warning">Connect Notion to save. You can still review and edit the task.</Notice>
        )}
        <div className="flex flex-wrap gap-2">
          {saved ? (
            <button type="button" className={primaryButton} onClick={onDiscard}>
              Capture another
            </button>
          ) : (
            <>
              <button
                type="button"
                className={primaryButton}
                disabled={saving || !canSave || !draft.title.trim()}
                onClick={() => onSave(Boolean(duplicateUrl))}
              >
                {saving && <Spinner />}
                {saving ? "Saving to Notion" : duplicateUrl ? "Save anyway" : "Save to Notion"}
              </button>
              <button type="button" className={secondaryButton} disabled={saving} onClick={onDiscard}>
                Discard
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
