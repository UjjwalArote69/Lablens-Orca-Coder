"use client";

import { useState } from "react";
import AskSection from "@/components/AskSection";
import ErrorMessage from "@/components/ErrorMessage";
import RangeBar from "@/components/RangeBar";
import {
  fmt,
  SEVERITY_BORDER,
  SEVERITY_TEXT,
  STATUS_CHIP,
  STATUS_TEXT,
  VERDICT_TEXT,
} from "@/lib/format";
import type { Analysis, Pattern, Result, Sex } from "@/lib/types";

interface Props {
  analysis: Analysis;
  sourceLabel: string;
  languages: { code: string; label: string }[];
  aiEnabled: boolean;
  busy: string | null;
  error: string | null;
  onReset: () => void;
  onSexChange: (sex: Sex) => void;
  onLangChange: (lang: string) => void;
}

const DISCLAIMER =
  "LabLens is not a diagnosis. Reference ranges are typical adult values and differ slightly between labs, so " +
  "compare with the range printed on your report. If you feel unwell, contact a doctor whatever these results say.";

export default function Results(props: Props) {
  const { analysis: a, busy } = props;
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [open, setOpen] = useState<string[]>([]);

  const toggle = (key: string) => setOpen((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  return (
    <div className={`pt-2 transition-opacity ${busy ? "opacity-60" : ""}`} aria-busy={busy !== null}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={props.onReset} className="btn btn-secondary">
          <span aria-hidden="true">←</span> Check another report
        </button>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <SexToggle value={a.sex} disabled={busy !== null} onChange={props.onSexChange} />
          {props.languages.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Explanations in</span>
              <select
                value={a.language}
                disabled={busy !== null}
                onChange={(e) => props.onLangChange(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 font-bold"
              >
                {props.languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(busy === "sex" || busy === "lang") && (
            <span className="text-sm text-muted" aria-live="polite">
              Updating…
            </span>
          )}
        </div>
      </div>
      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}

      {/* 1. Verdict */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6 sm:p-8" aria-live="polite">
        <p className="text-sm text-muted">{props.sourceLabel}</p>
        <h1 className={`mt-2 max-w-[30ch] text-[1.7rem] font-bold leading-tight sm:text-[2.2rem] ${VERDICT_TEXT[a.verdict.level]}`}>
          {a.verdict.text}
        </h1>
        <Counts counts={a.counts} />
        {a.notice && <p className="mt-3 text-sm text-high">{a.notice}</p>}
      </section>

      {/* 2. Patterns */}
      {a.patterns.length > 0 && (
        <section className="mt-10" aria-labelledby="together">
          <h2 id="together" className="text-xl font-bold">
            Results that matter together
          </h2>
          <div className="mt-4 space-y-3">
            {a.patterns.map((p) => (
              <PatternCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* 3. Every result */}
      <section className="mt-10" aria-labelledby="every">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="every" className="text-xl font-bold">
            Every result
          </h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyFlags}
              onChange={(e) => setOnlyFlags(e.target.checked)}
              className="size-4 accent-[#15212B]"
            />
            Show only results outside the range
          </label>
        </div>
        {a.counts.abnormal > 0 && (
          <p className="mt-1 text-sm text-muted">Select a result outside the range to see what it can mean.</p>
        )}
        {a.panels.map((panel) => {
          const rows = a.results.filter((r) => r.panel === panel && (!onlyFlags || r.status !== "normal"));
          if (rows.length === 0) return null;
          return (
            <div key={panel} className="mt-5">
              <h3 className="mb-2 text-sm font-bold text-muted">{panel}</h3>
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <ResultRow key={r.key} r={r} open={open.includes(r.key)} onToggle={() => toggle(r.key)} />
                ))}
              </ul>
            </div>
          );
        })}
        {onlyFlags && a.counts.abnormal === 0 && (
          <p className="mt-4 text-muted">No results are outside the reference range.</p>
        )}
      </section>

      {/* 4. Ask */}
      {props.aiEnabled && <AskSection reportSummary={a.report_summary} lang={a.language} />}

      {/* 5. Download */}
      <section className="mt-10" aria-labelledby="download">
        <h2 id="download" className="text-xl font-bold">
          Take it to your doctor
        </h2>
        <p className="mt-1 text-muted">The verdict, the patterns and every result in one short file.</p>
        <button type="button" onClick={() => download(a.summary_markdown)} className="btn btn-primary mt-3">
          Download summary for your doctor
        </button>
      </section>

      {/* 6. Disclaimer */}
      <p className="mt-12 max-w-[80ch] border-t border-line pt-6 text-sm leading-relaxed text-muted">{DISCLAIMER}</p>
    </div>
  );
}

function SexToggle({ value, disabled, onChange }: { value: Sex; disabled: boolean; onChange: (s: Sex) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm" role="group" aria-label="Reference ranges for">
      <span className="text-muted">Reference ranges for:</span>
      <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
        {(["F", "M"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value === s}
            disabled={disabled}
            onClick={() => value !== s && onChange(s)}
            className={`cursor-pointer rounded-md px-3 py-1 font-bold transition-colors disabled:cursor-not-allowed ${
              value === s ? "bg-ink text-white" : "text-ink hover:bg-bg"
            }`}
          >
            {s === "F" ? "Female" : "Male"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Counts({ counts: c }: { counts: Analysis["counts"] }) {
  const n = (x: number) => <b className="font-bold text-ink tabular-nums">{x}</b>;
  return (
    <p className="mt-3 text-lg text-muted">
      We read {n(c.read)} result{c.read === 1 ? "" : "s"}.{" "}
      {c.abnormal === 0 ? (
        c.read === 1 ? "It is within the reference range." : "All of them are within the reference range."
      ) : (
        <>
          {n(c.abnormal)} {c.abnormal === 1 ? "is" : "are"} outside the reference range
          {c.critical > 0 && <>, {n(c.critical)} at a critical level</>}
          {c.patterns > 0 ? (
            <>
              , and they form {n(c.patterns)} pattern{c.patterns === 1 ? "" : "s"} worth a closer look.
            </>
          ) : (
            "."
          )}
        </>
      )}
    </p>
  );
}

function PatternCard({ p }: { p: Pattern }) {
  return (
    <article className={`rounded-xl border border-l-[6px] border-line bg-surface p-5 ${SEVERITY_BORDER[p.severity]}`}>
      <p className={`text-sm font-bold ${SEVERITY_TEXT[p.severity]}`}>{p.severity_label}</p>
      <h3 className="mt-1 text-lg font-bold">{p.title}</h3>
      {p.explanation && <p className="mt-2 max-w-[75ch] leading-relaxed">{p.explanation}</p>}
      {p.note && <p className="mt-2 max-w-[75ch] text-sm text-muted">{p.note}</p>}
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Results behind this pattern">
        {p.evidence.map((e) => (
          <li key={e.key} className={`rounded-full border bg-[#F7FAFB] px-3 py-0.5 text-sm tabular-nums ${STATUS_CHIP[e.status]}`}>
            {e.name} {fmt(e.value)} {e.unit} {e.arrow}
          </li>
        ))}
      </ul>
    </article>
  );
}

const ROW_GRID =
  "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(150px,1.3fr)_110px_minmax(160px,2fr)_130px]";

function ResultRow({ r, open, onToggle }: { r: Result; open: boolean; onToggle: () => void }) {
  const abnormal = r.status !== "normal";
  const cells = (
    <>
      <span className="block font-bold">
        {r.name}
        <span className="block text-sm font-normal text-muted">{r.unit}</span>
      </span>
      <span className={`block text-right text-xl font-bold tabular-nums ${STATUS_TEXT[r.status]}`}>
        {fmt(r.value)}
        {r.arrow && <span aria-hidden="true"> {r.arrow}</span>}
      </span>
      <span className="col-span-2 block sm:col-span-1">
        <RangeBar r={r} />
      </span>
      <span className="col-span-2 flex items-center justify-between gap-2 text-sm text-muted tabular-nums sm:col-span-1">
        range {r.range_text}
        {abnormal && (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="currentColor"
          >
            <path d="M5.2 7.6a.75.75 0 0 1 1.06.04L10 11.6l3.74-3.96a.75.75 0 1 1 1.09 1.03l-4.28 4.53a.75.75 0 0 1-1.1 0L5.17 8.67a.75.75 0 0 1 .04-1.06Z" />
          </svg>
        )}
      </span>
    </>
  );

  if (!abnormal) {
    return <li className={`${ROW_GRID} rounded-lg border border-line bg-surface px-4 py-2.5`}>{cells}</li>;
  }
  return (
    <li className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`explain-${r.key}`}
        onClick={onToggle}
        className={`${ROW_GRID} w-full cursor-pointer rounded-lg px-4 py-2.5 text-left hover:bg-[#F7FAFB]`}
      >
        {cells}
      </button>
      {open && (
        <div id={`explain-${r.key}`} className="border-t border-line px-4 py-3">
          <p className="text-sm font-bold">
            What a {r.direction} {r.name} result can mean
          </p>
          <p className="mt-1 max-w-[75ch] leading-relaxed">
            {r.explanation || "We do not have an explanation for this result yet. Ask your doctor about it."}
          </p>
        </div>
      )}
    </li>
  );
}

function download(markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lablens-summary.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
