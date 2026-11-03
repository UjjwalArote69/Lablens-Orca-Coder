"use client";

import { Fragment, useState } from "react";
import { fmt, STATUS_LABEL } from "@/lib/format";
import type { Status } from "@/lib/types";

type ValueCheck = {
  key: string;
  name: string;
  gold: number;
  pred: number | null;
  value_ok: boolean;
  gold_status: Status;
  pred_status: Status | null;
  status_ok: boolean;
};

type Check =
  | { valid: false }
  | {
      valid: true;
      verdict: string;
      verdict_ok: boolean;
      values: ValueCheck[];
      extra_values: string[];
      missing_patterns: string[];
      extra_patterns: string[];
    };

type Case = {
  id: string;
  label: string;
  language: string;
  layout: string;
  unseen_layout: boolean;
  source: "sample" | "heldout";
  prompt: string;
  gold: { verdict: string; patterns: string[] };
  outputs: Record<string, { text: string; check: Check }>;
};

export type ModelBundle = {
  generated: string;
  systems: Record<string, string>;
  left: string;
  right: string;
  pattern_titles: Record<string, string>;
  cases: Case[];
};

const VERDICT_LABEL: Record<string, string> = {
  urgent: "See a doctor today",
  review: "Discuss with your doctor",
  watch: "Keep an eye on",
  ok: "All within range",
};

/**
 * Our answer format (**Heading**, **Label:** text, "- " items, _italic_ disclaimer), plus the plain markdown a base
 * model tends to write instead (# headings, * bullets, --- rules), so both columns read cleanly.
 */
function Answer({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
    );
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length)
      blocks.push(
        <ul key={`ul${blocks.length}`} className="mt-1.5 grid gap-1 pl-4 [list-style:disc]">
          {items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>,
      );
    items = [];
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      items.push(bullet[1]);
      continue;
    }
    flush();
    if (!t || /^(-{3,}|\*{3,})$/.test(t)) continue;
    const heading = t.match(/^#{1,6}\s+(.*)$/);
    if (heading) blocks.push(<h4 key={blocks.length} className="mt-4 font-bold">{inline(heading[1])}</h4>);
    else if (/^\*\*[^*]+\*\*$/.test(t)) blocks.push(<h4 key={blocks.length} className="mt-4 font-bold">{t.slice(2, -2)}</h4>);
    else if (/^_.*_$/.test(t)) blocks.push(<p key={blocks.length} className="mt-4 text-sm text-slate italic">{t.slice(1, -1)}</p>);
    else blocks.push(<p key={blocks.length} className="mt-1.5">{inline(t)}</p>);
  }
  flush();
  return <div className="leading-relaxed [&>*:first-child]:mt-0">{blocks}</div>;
}

function Tick({ ok }: { ok: boolean }) {
  return (
    <span className={`font-bold ${ok ? "text-ok" : "text-critical"}`} aria-hidden="true">
      {ok ? "✓" : "✗"}
    </span>
  );
}

function EngineCheck({ check, gold, titles }: { check: Check; gold: Case["gold"]; titles: Record<string, string> }) {
  if (!check.valid)
    return (
      <p className="text-critical">
        No machine-readable answer, so nothing could be checked. The app would fall back to the rules engine.
      </p>
    );
  const wrong = check.values.filter((v) => !v.value_ok || !v.status_ok);
  const read = check.values.length - check.values.filter((v) => !v.value_ok).length;
  const title = (id: string) => titles[id] ?? id;
  return (
    <ul className="grid gap-2">
      <li className="flex gap-2">
        <Tick ok={check.verdict_ok} />
        <span>
          Verdict {check.verdict_ok ? "matches" : "differs"}: {VERDICT_LABEL[check.verdict] ?? check.verdict}
          {!check.verdict_ok && <> (engine: {VERDICT_LABEL[gold.verdict]})</>}
        </span>
      </li>
      <li className="flex gap-2">
        <Tick ok={read === check.values.length && check.extra_values.length === 0} />
        <span>
          {read} of {check.values.length} values read correctly
          {check.extra_values.length > 0 && <>, {check.extra_values.length} invented</>}
        </span>
      </li>
      <li className="flex gap-2">
        <Tick ok={!check.missing_patterns.length && !check.extra_patterns.length} />
        <span>
          {!check.missing_patterns.length && !check.extra_patterns.length
            ? `All ${gold.patterns.length} combinations found`
            : [
                check.missing_patterns.length ? `Missed: ${check.missing_patterns.map(title).join("; ")}` : "",
                check.extra_patterns.length ? `Not supported by the values: ${check.extra_patterns.map(title).join("; ")}` : "",
              ]
                .filter(Boolean)
                .join(". ")}
        </span>
      </li>
      {wrong.length > 0 && (
        <li>
          <p className="text-sm font-semibold text-slate">Disagreements with the engine</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {wrong.slice(0, 10).map((v) => (
              <li key={v.key} className="rounded-full border border-[#f3c9c2] bg-[#fdf1ef] px-3 py-1 text-sm tabular-nums">
                {v.name}: {v.pred === null ? "not read" : `${fmt(v.pred)} ${STATUS_LABEL[v.pred_status ?? "normal"].toLowerCase()}`}
                <span className="text-slate">
                  {" "}
                  · engine {fmt(v.gold)} {STATUS_LABEL[v.gold_status].toLowerCase()}
                </span>
              </li>
            ))}
            {wrong.length > 10 && <li className="px-1 py-1 text-sm text-slate">and {wrong.length - 10} more</li>}
          </ul>
        </li>
      )}
    </ul>
  );
}

export default function ModelCompare({ data }: { data: ModelBundle }) {
  const [id, setId] = useState(data.cases[0]?.id);
  const current = data.cases.find((c) => c.id === id) ?? data.cases[0];
  const groups: [string, Case[]][] = [
    ["App sample reports", data.cases.filter((c) => c.source === "sample")],
    ["Held-out reports, never seen in training", data.cases.filter((c) => c.source === "heldout")],
  ];
  if (!current) return null;

  return (
    <div className="grid gap-4">
      <section className="card" aria-label="Choose a report">
        {groups.map(([title, cases]) =>
          cases.length ? (
            <div key={title} className="mt-4 first:mt-0">
              <h2 className="text-sm font-semibold text-slate">{title}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={c.id === current.id}
                    onClick={() => setId(c.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      c.id === current.id ? "bg-ink text-white" : "bg-white/60 text-ink hover:bg-white/85"
                    }`}
                  >
                    {c.source === "sample" ? c.label : c.layout} · {c.language}
                    {c.unseen_layout && <span className={c.id === current.id ? "text-band" : "text-ok"}> · new layout</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </section>

      <section className="card" aria-labelledby="report-text">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="report-text" className="text-[1.375rem] leading-tight font-bold tracking-tight">
            The report, exactly as the model saw it
          </h2>
          <p className="text-sm text-slate">
            Layout: {current.layout}
            {current.unseen_layout && " (never used in training)"}
          </p>
        </div>
        <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-white/70 p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
          {current.prompt}
        </pre>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {[data.left, data.right].map((name) => {
          const out = current.outputs[name];
          return (
            <section key={name} className="card" aria-label={data.systems[name]}>
              <h2 className="text-[1.375rem] leading-tight font-bold tracking-tight">{data.systems[name]}</h2>
              {out ? (
                <>
                  <div className="mt-4">
                    <Answer text={out.text || "(empty answer)"} />
                  </div>
                  <div className="mt-5 rounded-2xl border border-rule bg-white/60 p-4">
                    <h3 className="mb-2.5 font-bold">Checked by the rules engine</h3>
                    <EngineCheck check={out.check} gold={current.gold} titles={data.pattern_titles} />
                  </div>
                </>
              ) : (
                <p className="mt-4 text-slate">No recorded output for this report yet.</p>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-sm text-slate">
        Recorded outputs ({data.generated}), greedy decoding, same prompt for both models. The rules engine stays the
        source of truth: in the app, any disagreement is shown, never hidden.
      </p>
    </div>
  );
}
