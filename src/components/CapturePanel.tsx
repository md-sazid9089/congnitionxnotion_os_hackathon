"use client";

import { MAX_ANNOUNCEMENT_LENGTH } from "@/lib/validation";
import { Card, Spinner, inputClass, primaryButton } from "./ui";

const SAMPLES = [
  {
    label: "Assignment notice",
    text: "CSE 4137 Soft Computing assignment submission deadline is November 25, 2026 at 11:59 PM.",
  },
  { label: "Banglish", text: "Kalke amader CSE 4137 quiz ase." },
  { label: "Personal task", text: "Renew my university library membership by November 28, 2026." },
];

export function CapturePanel({
  text,
  onChange,
  onExtract,
  busy,
}: {
  text: string;
  onChange: (value: string) => void;
  onExtract: () => void;
  busy: boolean;
}) {
  const tooLong = text.length > MAX_ANNOUNCEMENT_LENGTH;
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">Paste an announcement</h2>
      <p className="mt-1 text-sm text-slate-600">
        From a class group, email, or a note to yourself. English, Bangla and common Banglish phrases work.
      </p>
      <label htmlFor="announcement" className="sr-only">
        Announcement text
      </label>
      <textarea
        id="announcement"
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && text.trim() && !busy) onExtract();
        }}
        rows={6}
        placeholder="e.g. CSE 4137 lab report submission is due Thursday at 5 PM."
        className={`${inputClass} mt-4 resize-y leading-relaxed`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Try:</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample.label}
            type="button"
            onClick={() => onChange(sample.text)}
            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
          >
            {sample.label}
          </button>
        ))}
        <span className={`ml-auto text-xs ${tooLong ? "font-semibold text-red-600" : "text-slate-400"}`}>
          {text.length}/{MAX_ANNOUNCEMENT_LENGTH}
        </span>
      </div>
      <button
        type="button"
        onClick={onExtract}
        disabled={busy || !text.trim() || tooLong}
        className={`${primaryButton} mt-4 w-full sm:w-auto`}
      >
        {busy && <Spinner />}
        {busy ? "Reading the announcement" : "Extract task"}
      </button>
    </Card>
  );
}
