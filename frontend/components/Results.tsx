"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import AskSection from "@/components/AskSection";
import RangeBar from "@/components/RangeBar";
import { ErrorMessage, SectionTitle } from "@/components/ui";
import { fmt, SEVERITY_RULE, SEVERITY_TEXT, STATUS_LABEL, STATUS_TEXT, VERDICT_TEXT } from "@/lib/format";
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
    <div className={`transition-opacity ${busy ? "opacity-60" : ""}`} aria-busy={busy !== null}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <button
          type="button"
          onClick={props.onReset}
          className="cursor-pointer text-sm font-bold underline-offset-4 hover:underline"
        >
          <span aria-hidden="true">←</span> Check another report
        </button>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <SexToggle value={a.sex} disabled={busy !== null} onChange={props.onSexChange} />
          {props.languages.length > 1 && (
            <label className="flex items-center gap-2">
              <span className="text-muted">Explanations in</span>
              <select
                value={a.language}
                disabled={busy !== null}
                onChange={(e) => props.onLangChange(e.target.value)}
                className="cursor-pointer rounded-md border border-line bg-paper px-2 py-1 font-bold"
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
            <span className="text-muted" aria-live="polite">
              Updating…
            </span>
          )}
        </div>
      </div>
      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}

      {/* 1. Verdict */}
      <section className="pt-10" aria-live="polite">
        <p className="text-sm text-muted">{props.sourceLabel}</p>
        <h1 className={`mt-2 max-w-[24ch] text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl ${VERDICT_TEXT[a.verdict.level]}`}>
          {a.verdict.text}
        </h1>
        <Counts counts={a.counts} />
        {a.notice && <p className="mt-3 text-sm text-high">{a.notice}</p>}
      </section>

      {/* 2. Patterns */}
      {a.patterns.length > 0 && (
        <section className="mt-16" aria-labelledby="together">
          <SectionTitle id="together">Results that matter together</SectionTitle>
          <ol className="mt-6 space-y-8">
            {a.patterns.map((p) => (
              <PatternItem key={p.id} p={p} />
            ))}
          </ol>
        </section>
      )}

      {/* 3. Every result */}
      <section className="mt-16" aria-labelledby="every">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionTitle id="every">Every result</SectionTitle>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyFlags}
              onChange={(e) => setOnlyFlags(e.target.checked)}
              className="size-4 accent-[#16181d]"
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
            <div key={panel} className="mt-8">
              <h3 className="text-sm font-bold text-muted">{panel}</h3>
              <ul className="mt-2 border-t border-line">
                {rows.map((r) => (
                  <ResultRow key={r.key} r={r} open={open.includes(r.key)} onToggle={() => toggle(r.key)} />
                ))}
              </ul>
            </div>
          );
        })}
        {onlyFlags && a.counts.abnormal === 0 && (
          <p className="mt-6 text-muted">No results are outside the reference range.</p>
        )}
      </section>

      {/* 4. Ask */}
      {props.aiEnabled && <AskSection reportSummary={a.report_summary} lang={a.language} />}

      {/* 5. Download */}
      <section
        className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8"
        aria-labelledby="download"
      >
        <div>
          <SectionTitle id="download">Take it to your doctor</SectionTitle>
          <p className="mt-1 text-muted">The verdict, the patterns and every result in one short file.</p>
        </div>
        <button type="button" onClick={() => download(a.summary_markdown)} className="btn">
          Download summary for your doctor
        </button>
      </section>

      {/* 6. Disclaimer */}
      <p className="mt-12 max-w-[75ch] text-sm leading-relaxed text-muted">{DISCLAIMER}</p>
    </div>
  );
}

function SexToggle({ value, disabled, onChange }: { value: Sex; disabled: boolean; onChange: (s: Sex) => void }) {
  return (
    <div role="group" aria-label="Reference ranges for" className="flex items-center gap-2">
      <span className="text-muted">Reference ranges for</span>
      <span className="inline-flex rounded-md border border-line p-0.5">
        {(["F", "M"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value === s}
            disabled={disabled}
            onClick={() => value !== s && onChange(s)}
            className={`cursor-pointer rounded px-3 py-1 font-bold transition-colors disabled:cursor-not-allowed ${
              value === s ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            {s === "F" ? "Female" : "Male"}
          </button>
        ))}
      </span>
    </div>
  );
}

function Counts({ counts: c }: { counts: Analysis["counts"] }) {
  const n = (x: number) => <b className="text-ink tabular-nums">{x}</b>;
  return (
    <p className="mt-4 max-w-[62ch] text-lg text-muted">
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

function PatternItem({ p }: { p: Pattern }) {
  return (
    <li className={`border-l-2 pl-5 ${SEVERITY_RULE[p.severity]}`}>
      <p className={`text-sm font-bold ${SEVERITY_TEXT[p.severity]}`}>{p.severity_label}</p>
      <h3 className="mt-1 text-lg font-bold leading-snug">{p.title}</h3>
      {p.explanation && <p className="mt-2 max-w-[70ch] leading-relaxed text-body">{p.explanation}</p>}
      {p.note && <p className="mt-2 max-w-[70ch] text-sm text-muted">{p.note}</p>}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums" aria-label="Results behind this pattern">
        {p.evidence.map((e) => (
          <li key={e.key} className={STATUS_TEXT[e.status]}>
            {e.name} <b>{fmt(e.value)}</b> {e.unit} {e.arrow}
          </li>
        ))}
      </ul>
    </li>
  );
}

const ROW_GRID =
  "grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-3.5 sm:grid-cols-[minmax(150px,1.4fr)_96px_minmax(140px,2fr)_110px_16px]";

function ResultRow({ r, open, onToggle }: { r: Result; open: boolean; onToggle: () => void }) {
  const abnormal = r.status !== "normal";
  const cells = (
    <>
      <span className="block">
        <span className="font-bold">{r.name}</span>{" "}
        <span className="text-sm text-muted">{r.unit}</span>
      </span>
      <span className={`block text-right text-lg font-bold tabular-nums ${STATUS_TEXT[r.status]}`}>
        {fmt(r.value)}
        {r.arrow && <span aria-hidden="true"> {r.arrow}</span>}
        <span className="sr-only"> {STATUS_LABEL[r.status]}</span>
      </span>
      <span className="col-span-2 block sm:col-span-1">
        <RangeBar r={r} />
      </span>
      <span className="text-sm text-muted tabular-nums">{r.range_text}</span>
      <span className="flex justify-end text-muted">
        {abnormal && (
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        )}
      </span>
    </>
  );

  if (!abnormal) {
    return <li className={`${ROW_GRID} border-b border-line`}>{cells}</li>;
  }
  return (
    <li className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`explain-${r.key}`}
        onClick={onToggle}
        className={`${ROW_GRID} w-full cursor-pointer text-left transition-colors hover:bg-subtle`}
      >
        {cells}
      </button>
      {open && (
        <div id={`explain-${r.key}`} className="pb-5 sm:pr-10">
          <p className="text-sm font-bold">
            What a {r.direction} {r.name} result can mean
          </p>
          <p className="mt-1 max-w-[70ch] leading-relaxed text-body">
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
