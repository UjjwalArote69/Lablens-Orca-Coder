"use client";

import {
  Activity,
  ChevronDown,
  Download,
  Droplet,
  Droplets,
  FileText,
  FlaskConical,
  Gauge,
  HeartPulse,
  Info,
  Languages,
  ListFilter,
  LoaderCircle,
  Microscope,
  Plus,
  Stethoscope,
  TestTubes,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import AskSection from "@/components/AskSection";
import RangeBar from "@/components/RangeBar";
import { CardHeader, ErrorMessage, IconCircle } from "@/components/ui";
import {
  fmt,
  SEVERITY_DOT,
  SEVERITY_PILL,
  STATUS_CHIP,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_LABEL_TEXT,
  STATUS_TEXT,
  VERDICT_CARD,
  VERDICT_TAG,
} from "@/lib/format";
import type { Analysis, Pattern, Result, Sex } from "@/lib/types";

interface Props {
  analysis: Analysis;
  sourceLabel: string;
  sourceOrigin: string;
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

const PANEL_ICON: Record<string, typeof Activity> = {
  "Blood count": Droplet,
  "Blood sugar": Gauge,
  "Kidney & electrolytes": Droplets,
  Liver: FlaskConical,
  Lipids: HeartPulse,
  Thyroid: Activity,
  "Vitamins & iron": TestTubes,
  Inflammation: Microscope,
};

export default function Results(props: Props) {
  const { analysis: a, busy } = props;
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [open, setOpen] = useState<string[]>([]);

  const toggle = (key: string) => setOpen((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  const tag = VERDICT_TAG[a.verdict.level];

  return (
    <div className={`transition-opacity ${busy ? "opacity-70" : ""}`} aria-busy={busy !== null}>
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{props.sourceOrigin}</p>
          <h1 className="mt-1 truncate text-[1.75rem] font-semibold tracking-tight sm:text-[2.2rem]">
            Results for <span className="text-primary">{props.sourceLabel}</span>
          </h1>
        </div>
        <button type="button" onClick={props.onReset} className="btn-primary">
          <Plus className="size-4" aria-hidden="true" /> Check another report
        </button>
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <SexToggle value={a.sex} disabled={busy !== null} onChange={props.onSexChange} />
        {props.languages.length > 1 && (
          <label className="btn-pill">
            <Languages className="size-4 text-muted" aria-hidden="true" />
            <span className="text-muted">Explanations in</span>
            <select
              value={a.language}
              disabled={busy !== null}
              onChange={(e) => props.onLangChange(e.target.value)}
              className="cursor-pointer bg-transparent font-semibold focus:outline-none"
            >
              {props.languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={() => download(a.summary_markdown)} className="btn-pill">
          <Download className="size-4 text-muted" aria-hidden="true" /> Download summary
        </button>
        {(busy === "sex" || busy === "lang") && (
          <span className="inline-flex items-center gap-1.5 px-2 text-sm text-muted" aria-live="polite">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Updating…
          </span>
        )}
      </div>
      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}

      {/* Row 1: verdict + panels */}
      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <section
          className={`relative overflow-hidden rounded-[24px] bg-linear-to-br p-6 text-white sm:p-7 lg:col-span-3 ${VERDICT_CARD[a.verdict.level]}`}
          aria-live="polite"
        >
          <span aria-hidden="true" className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/10">
              <Stethoscope className="size-5" aria-hidden="true" />
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink">
              <span className={`size-2 rounded-full ${tag.dot}`} aria-hidden="true" />
              {tag.label}
            </span>
          </div>
          <h2 className="relative mt-5 max-w-[26ch] text-[1.6rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">
            {a.verdict.text}
          </h2>
          <Counts counts={a.counts} />
          <dl className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Results read", a.counts.read],
              ["Outside range", a.counts.abnormal],
              ["Critical", a.counts.critical],
              ["Patterns", a.counts.patterns],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/15 px-3 py-3 text-center backdrop-blur-sm">
                <dt className="text-xs text-white/80">{label}</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {a.notice && <p className="relative mt-4 text-sm text-white/90">{a.notice}</p>}
        </section>

        <section className="card lg:col-span-2" aria-labelledby="by-panel">
          <CardHeader id="by-panel" title="By panel" tag={`${a.panels.length} panel${a.panels.length === 1 ? "" : "s"}`} />
          <ul className="mt-4 space-y-3.5">
            {a.panels.map((panel) => {
              const rows = a.results.filter((r) => r.panel === panel);
              const out = rows.filter((r) => r.status !== "normal").length;
              const critical = rows.some((r) => r.status.startsWith("critical"));
              const Icon = PANEL_ICON[panel] ?? Activity;
              return (
                <li key={panel} className="flex items-center gap-3">
                  <IconCircle>
                    <Icon className="size-[18px]" />
                  </IconCircle>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{panel}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {out === 0 ? `All ${rows.length} in range` : `${out} of ${rows.length} outside`}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-track">
                      <div
                        className={`h-full rounded-full ${critical ? "bg-critical-dot" : out ? "bg-high-dot" : "bg-ok-dot"}`}
                        style={{ width: `${Math.max(((rows.length - out) / rows.length) * 100, 4)}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted">Bars show the share of each panel within the reference range.</p>
        </section>
      </div>

      {/* Row 2: patterns */}
      {a.patterns.length > 0 && (
        <section className="card mt-4" aria-labelledby="together">
          <CardHeader
            id="together"
            title="Results that matter together"
            tag={`${a.patterns.length} pattern${a.patterns.length === 1 ? "" : "s"}`}
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {a.patterns.map((p) => (
              <PatternCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* Row 3: every result */}
      <section className="card mt-4" aria-labelledby="every">
        <CardHeader id="every" title="Every result">
          <button
            type="button"
            aria-pressed={onlyFlags}
            onClick={() => setOnlyFlags((v) => !v)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              onlyFlags ? "border-primary bg-primary-soft text-primary" : "border-line text-ink hover:border-[#c9d3e3]"
            }`}
          >
            <ListFilter className="size-3.5" aria-hidden="true" />
            Show only results outside the range
          </button>
        </CardHeader>
        {a.counts.abnormal > 0 && (
          <p className="mt-1 text-sm text-muted">Select a result outside the range to see what it can mean.</p>
        )}
        {a.panels.map((panel) => {
          const rows = a.results.filter((r) => r.panel === panel && (!onlyFlags || r.status !== "normal"));
          if (rows.length === 0) return null;
          return (
            <div key={panel} className="mt-5">
              <h3 className="mb-2.5 text-sm font-semibold text-muted">{panel}</h3>
              <ul className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((r) => (
                  <ResultCard key={r.key} r={r} open={open.includes(r.key)} onToggle={() => toggle(r.key)} />
                ))}
              </ul>
            </div>
          );
        })}
        {onlyFlags && a.counts.abnormal === 0 && (
          <p className="mt-4 text-sm text-muted">No results are outside the reference range.</p>
        )}
      </section>

      {/* Row 4: ask, download, disclaimer */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {props.aiEnabled && <AskSection reportSummary={a.report_summary} lang={a.language} />}
        <section className="card flex flex-col" aria-labelledby="download">
          <IconCircle>
            <FileText className="size-[18px]" />
          </IconCircle>
          <h2 id="download" className="mt-4 text-lg font-semibold tracking-tight">
            Take it to your doctor
          </h2>
          <p className="mt-1 text-sm text-muted">The verdict, the patterns and every result in one short file.</p>
          <button type="button" onClick={() => download(a.summary_markdown)} className="btn-primary mt-5 self-start">
            <Download className="size-4" aria-hidden="true" /> Download summary for your doctor
          </button>
        </section>
        <section className={`card flex gap-3 ${props.aiEnabled ? "lg:col-span-3" : "lg:col-span-2"}`}>
          <Info className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted">{DISCLAIMER}</p>
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
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1 pl-3.5 text-sm"
    >
      <UserRound className="size-4 text-muted" aria-hidden="true" />
      <span className="mr-1 text-muted">Reference ranges for</span>
      {(["F", "M"] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          disabled={disabled}
          onClick={() => value !== s && onChange(s)}
          className={`cursor-pointer rounded-full px-3.5 py-1 font-medium transition-colors disabled:cursor-not-allowed ${
            value === s ? "bg-linear-to-b from-[#4c8df6] to-[#2563eb] text-white" : "text-ink hover:bg-subtle"
          }`}
        >
          {s === "F" ? "Female" : "Male"}
        </button>
      ))}
    </div>
  );
}

function Counts({ counts: c }: { counts: Analysis["counts"] }) {
  const n = (x: number) => <b className="font-semibold text-white tabular-nums">{x}</b>;
  return (
    <p className="relative mt-3 max-w-[60ch] text-white/85">
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
    <article className="rounded-[20px] bg-subtle p-4 sm:p-5">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_PILL[p.severity]}`}>
        <span className={`size-1.5 rounded-full ${SEVERITY_DOT[p.severity]}`} aria-hidden="true" />
        {p.severity_label}
      </span>
      <h3 className="mt-3 font-semibold leading-snug">{p.title}</h3>
      {p.explanation && <p className="mt-1.5 text-sm leading-relaxed text-body">{p.explanation}</p>}
      {p.note && <p className="mt-2 text-xs text-muted">{p.note}</p>}
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Results behind this pattern">
        {p.evidence.map((e) => (
          <li key={e.key} className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${STATUS_CHIP[e.status]}`}>
            {e.name} {fmt(e.value)} {e.unit} {e.arrow}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ResultCard({ r, open, onToggle }: { r: Result; open: boolean; onToggle: () => void }) {
  const abnormal = r.status !== "normal";
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm font-semibold leading-snug">{r.name}</span>
        <span className={`shrink-0 text-right tabular-nums ${STATUS_TEXT[r.status]}`}>
          <span className="text-[1.6rem] leading-none font-semibold tracking-tight">{fmt(r.value)}</span>
          <span className="ml-1 text-xs font-medium">{r.unit}</span>
        </span>
      </span>
      <span className="mt-4 block">
        <RangeBar r={r} />
      </span>
      <span className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="tabular-nums">
          Range {r.range_text} {r.unit}
        </span>
        <span className={`inline-flex items-center gap-1.5 font-semibold ${STATUS_LABEL_TEXT[r.status]}`}>
          <span className={`size-2 rounded-full ${STATUS_DOT[r.status]}`} aria-hidden="true" />
          {STATUS_LABEL[r.status]}
          {r.arrow && <span aria-hidden="true">{r.arrow}</span>}
          {abnormal && (
            <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          )}
        </span>
      </span>
    </>
  );

  if (!abnormal) {
    return <li className="block rounded-[20px] bg-subtle p-4">{body}</li>;
  }
  return (
    <li className={`rounded-[20px] bg-subtle ${open ? "ring-1 ring-[#d6e0f5]" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`explain-${r.key}`}
        onClick={onToggle}
        className="block w-full cursor-pointer rounded-[20px] p-4 text-left transition-colors hover:bg-[#eef2f8]"
      >
        {body}
      </button>
      {open && (
        <div id={`explain-${r.key}`} className="mx-4 border-t border-line pt-3 pb-4">
          <p className="text-xs font-semibold text-ink">
            What a {r.direction} {r.name} result can mean
          </p>
          <p className="mt-1 text-sm leading-relaxed text-body">
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
