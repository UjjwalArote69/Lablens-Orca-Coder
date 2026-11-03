import type { Metadata } from "next";
import ModelCompare, { type ModelBundle } from "@/components/ModelCompare";
import bundle from "@/lib/model_outputs.json";

export const metadata: Metadata = {
  title: "Our model · LabLens",
  description:
    "LabLens Reader, a model fine-tuned with Adaption AutoScientist to read messy Indian lab reports, compared with its base model.",
};

type Metrics = {
  n: number;
  fully_correct: number;
  missed_urgent_rate: number | null;
  values_f1: number;
  unseen_fully_correct: number | null;
};
type Summary = {
  eval?: Record<string, Metrics>;
  runs: { label: string; best_win_rate: number | null; status: string | null }[];
};

const data = bundle as unknown as ModelBundle & { summary: Summary };
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

function Stat({ label, left, right, note }: { label: string; left: string; right: string; note?: string }) {
  return (
    <div className="border-t border-rule pt-4">
      <p className="text-sm font-semibold text-slate">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 tabular-nums">
        <span className="text-lg text-slate line-through decoration-1">{left}</span>
        <span className="text-[2rem] leading-none font-bold">{right}</span>
      </p>
      {note && <p className="mt-1 text-sm text-slate">{note}</p>}
    </div>
  );
}

export default function ModelPage() {
  const { left, right, systems, summary } = data;
  const l = summary.eval?.[left];
  const r = summary.eval?.[right];
  const wins = summary.runs.map((x) => x.best_win_rate).filter((w): w is number => w !== null);
  const mean = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;

  return (
    <div>
      <h1 className="max-w-[20ch] text-[2.5rem] leading-[1.04] font-bold tracking-[-0.025em] sm:text-[3.25rem]">
        LabLens Reader: our own model
      </h1>
      <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-slate">
        A small open model fine-tuned with Adaption AutoScientist to read lab reports the way Indian patients get them:
        odd layouts, lakh/cumm units, OCR noise, Hindi headers. Every training answer was produced by our tested rules
        engine, so each label is correct by construction.
      </p>

      <section className="card mt-10" aria-labelledby="results">
        <h2 id="results" className="text-[1.375rem] leading-tight font-bold tracking-tight">
          {systems[left]} → {systems[right]}
        </h2>
        <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-t border-rule pt-4">
            <p className="text-sm font-semibold text-slate">AutoScientist win rate vs base</p>
            <p className="mt-1 text-[2rem] leading-none font-bold tabular-nums">{pct(mean)}</p>
            <p className="mt-1 text-sm text-slate">
              {wins.length ? `mean of ${wins.length} identical runs (${wins.map(pct).join(", ")})` : "training runs in Round 2"}
            </p>
          </div>
          <Stat label="Reports read fully correctly" left={pct(l?.fully_correct)} right={pct(r?.fully_correct)}
                note={l ? `${l.n} held-out reports` : undefined} />
          <Stat label="Urgent reports missed" left={pct(l?.missed_urgent_rate)} right={pct(r?.missed_urgent_rate)}
                note="lower is better" />
          <Stat label="Correct on layouts never seen in training" left={pct(l?.unseen_fully_correct)}
                right={pct(r?.unseen_fully_correct)} />
        </div>
      </section>

      <div className="mt-4">
        <ModelCompare data={data} />
      </div>
    </div>
  );
}
