"use client";

import { ArrowLeft, ChevronDown, Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import AskSection from "@/components/AskSection";
import RangeBar from "@/components/RangeBar";
import RangeMap from "@/components/RangeMap";
import { CardHeader, ErrorMessage } from "@/components/ui";
import { errorMessage, summaryPdf } from "@/lib/api";
import {
  fmt,
  SEVERITY_BG,
  SEVERITY_TEXT,
  STATUS_BG,
  STATUS_CHIP,
  STATUS_LABEL,
  STATUS_LABEL_TEXT,
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

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  async function downloadPdf() {
    setPdfBusy(true);
    setPdfError(null);
    try {
      saveFile(await summaryPdf(a, props.sourceLabel), "lablens-summary.pdf");
    } catch (e) {
      setPdfError(errorMessage(e));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className={`transition-opacity ${busy ? "opacity-70" : ""}`} aria-busy={busy !== null}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={props.onReset} className="btn-pill">
          <ArrowLeft className="size-4" aria-hidden="true" /> Check another report
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {(busy === "sex" || busy === "lang") && (
            <span className="inline-flex items-center gap-1.5 px-2 text-sm text-slate" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Updating…
            </span>
          )}
          <SexToggle value={a.sex} disabled={busy !== null} onChange={props.onSexChange} />
          {props.languages.length > 1 && (
            <label className="btn-pill">
              <span className="text-slate">Explanations in</span>
              <select
                value={a.language}
                disabled={busy !== null}
                onChange={(e) => props.onLangChange(e.target.value)}
                className="cursor-pointer bg-transparent font-bold focus:outline-none"
              >
                {props.languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={downloadPdf} disabled={pdfBusy} className="btn-pill">
            <Download className="size-4" aria-hidden="true" /> {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>
      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}
      {pdfError && <ErrorMessage>{pdfError}</ErrorMessage>}

      {/* 1. Verdict, with every result on one chart */}
      <section className="card mt-4 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center" aria-live="polite">
        <div>
          <p className="text-sm text-slate">{props.sourceLabel}</p>
          <h1
            className={`mt-3 max-w-[15ch] text-[2.25rem] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[3rem] ${VERDICT_TEXT[a.verdict.level]}`}
          >
            {a.verdict.text}
          </h1>
          <Counts counts={a.counts} />
          {a.notice && <p className="mt-3 text-sm text-high">{a.notice}</p>}
          {a.verdict.level === "urgent" && (
            <p role="note" className="mt-5 rounded-2xl border border-[#f3c9c2] bg-[#fdf1ef] px-4 py-3 leading-relaxed text-critical">
              <b>Feeling unwell right now?</b> Chest pain, a racing or irregular heartbeat, severe weakness, confusion or
              fainting need care now: call <b>108</b> for an ambulance or <b>112</b> for emergencies. Do not wait for an
              appointment.
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-2xl bg-well p-4 sm:p-5">
          <RangeMap results={a.results} panels={a.panels} />
        </div>
      </section>

      {/* 2. Patterns */}
      {a.patterns.length > 0 && (
        <section className="card mt-4" aria-labelledby="together">
          <CardHeader
            id="together"
            title="Results that matter together"
            aside={<span className="text-sm text-slate">Most urgent first</span>}
          />
          <ol className="mt-5 divide-y divide-rule border-t border-rule">
            {a.patterns.map((p) => (
              <PatternRow key={p.id} p={p} />
            ))}
          </ol>
        </section>
      )}

      {/* 3. Every result */}
      <section className="card mt-4" aria-labelledby="every">
        <CardHeader
          id="every"
          title="Every result"
          aside={
            <button
              type="button"
              aria-pressed={onlyFlags}
              onClick={() => setOnlyFlags((v) => !v)}
              className={`btn-pill ${onlyFlags ? "border-lab bg-[#eef3fd] text-lab" : ""}`}
            >
              Show only results outside the range
            </button>
          }
        />
        {a.counts.abnormal > 0 && (
          <p className="mt-2 text-sm text-slate">Select a result outside the range to see what it can mean.</p>
        )}
        {a.panels.map((panel) => {
          const all = a.results.filter((r) => r.panel === panel);
          const rows = all.filter((r) => !onlyFlags || r.status !== "normal");
          if (rows.length === 0) return null;
          const out = all.filter((r) => r.status !== "normal").length;
          return (
            <div key={panel} className="mt-7">
              <h3 className="flex flex-wrap items-baseline gap-x-3 font-bold">
                {panel}
                <span className="text-sm font-normal text-slate">
                  {out === 0 ? `all ${all.length} in range` : `${out} of ${all.length} outside the range`}
                </span>
              </h3>
              <ul className="mt-3 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((r) => (
                  <ResultCard key={r.key} r={r} open={open.includes(r.key)} onToggle={() => toggle(r.key)} />
                ))}
              </ul>
            </div>
          );
        })}
        {onlyFlags && a.counts.abnormal === 0 && (
          <p className="mt-6 text-slate">No results are outside the reference range.</p>
        )}
      </section>

      {/* 4. Ask, download, disclaimer */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {props.aiEnabled && <AskSection reportSummary={a.report_summary} lang={a.language} />}
        <section className="card flex flex-col" aria-labelledby="download">
          <CardHeader id="download" title="Take it to your doctor" />
          <p className="mt-2 text-slate">A one-page PDF with the verdict, the patterns and every result.</p>
          <button type="button" onClick={downloadPdf} disabled={pdfBusy} className="btn-primary mt-5 self-start">
            <Download className="size-4" aria-hidden="true" />
            {pdfBusy ? "Preparing PDF…" : "Download summary for your doctor"}
          </button>
          {pdfError && <ErrorMessage>{pdfError}</ErrorMessage>}
        </section>
        <section className={`card ${props.aiEnabled ? "lg:col-span-3" : "lg:col-span-2"}`}>
          <p className="max-w-[78ch] text-sm leading-relaxed text-slate">{DISCLAIMER}</p>
        </section>
      </div>
    </div>
  );
}

function SexToggle({ value, disabled, onChange }: { value: Sex; disabled: boolean; onChange: (s: Sex) => void }) {
  return (
    <div
      role="group"
      aria-label="Reference ranges for"
      className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper p-1 pl-4 text-sm"
    >
      <span className="mr-1 text-slate">Reference ranges for</span>
      {(["F", "M"] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          disabled={disabled}
          onClick={() => value !== s && onChange(s)}
          className={`cursor-pointer rounded-full px-3.5 py-1 font-semibold transition-colors disabled:cursor-not-allowed ${
            value === s ? "bg-ink text-white" : "text-slate hover:bg-well hover:text-ink"
          }`}
        >
          {s === "F" ? "Female" : "Male"}
        </button>
      ))}
    </div>
  );
}

function Counts({ counts: c }: { counts: Analysis["counts"] }) {
  const n = (x: number) => <b className="font-bold text-ink tabular-nums">{x}</b>;
  return (
    <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-slate">
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

function PatternRow({ p }: { p: Pattern }) {
  return (
    <li className="grid gap-x-10 gap-y-3 py-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
      <div>
        <p className={`flex items-center gap-2 text-sm font-semibold ${SEVERITY_TEXT[p.severity]}`}>
          <span className={`size-2 rounded-full ${SEVERITY_BG[p.severity]}`} aria-hidden="true" />
          {p.severity_label}
        </p>
        <h3 className="mt-1.5 text-lg leading-snug font-bold">{p.title}</h3>
      </div>
      <div>
        {p.explanation && <p className="max-w-[68ch] leading-relaxed">{p.explanation}</p>}
        {p.note && <p className="mt-2 max-w-[68ch] text-sm text-slate">{p.note}</p>}
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Results behind this pattern">
          {p.evidence.map((e) => (
            <li key={e.key}>
              <a
                href={`#result-${e.key}`}
                className={`inline-block rounded-full border bg-paper px-3 py-1 text-sm tabular-nums hover:bg-well ${STATUS_CHIP[e.status]}`}
              >
                {e.name} <b>{fmt(e.value)}</b> {e.unit} {e.arrow}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function ResultCard({ r, open, onToggle }: { r: Result; open: boolean; onToggle: () => void }) {
  const abnormal = r.status !== "normal";
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-bold leading-snug">{r.name}</span>
        <span className={`shrink-0 text-right tabular-nums ${STATUS_TEXT[r.status]}`}>
          <span className="text-[1.6rem] leading-none font-bold tracking-tight">{fmt(r.value)}</span>
          <span className="ml-1 text-sm">{r.unit}</span>
        </span>
      </span>
      <span className="mt-4 block">
        <RangeBar r={r} />
      </span>
      <span className="flex items-center justify-between gap-3 text-sm text-slate">
        <span className="tabular-nums">Range {r.range_text}</span>
        <span className={`inline-flex items-center gap-1.5 font-semibold ${STATUS_LABEL_TEXT[r.status]}`}>
          <span className={`size-2 rounded-full ${STATUS_BG[r.status]}`} aria-hidden="true" />
          {STATUS_LABEL[r.status]}
          {r.arrow && <span aria-hidden="true">{r.arrow}</span>}
          {abnormal && (
            <ChevronDown className={`size-4 text-slate transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          )}
        </span>
      </span>
    </>
  );

  if (!abnormal) {
    return (
      <li id={`result-${r.key}`} className="block scroll-mt-6 rounded-2xl bg-well p-4">
        {body}
      </li>
    );
  }
  return (
    <li id={`result-${r.key}`} className={`scroll-mt-6 rounded-2xl bg-well ${open ? "ring-1 ring-[#c9d6f5]" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`explain-${r.key}`}
        onClick={onToggle}
        className="block w-full cursor-pointer rounded-2xl p-4 text-left transition-colors hover:bg-[#ebf0f6]"
      >
        {body}
      </button>
      {open && (
        <div id={`explain-${r.key}`} className="mx-4 border-t border-rule pt-3 pb-4">
          <p className="text-sm font-bold">
            What a {r.direction} {r.name} result can mean
          </p>
          <p className="mt-1 leading-relaxed">
            {r.explanation || "We do not have an explanation for this result yet. Ask your doctor about it."}
          </p>
        </div>
      )}
    </li>
  );
}

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
