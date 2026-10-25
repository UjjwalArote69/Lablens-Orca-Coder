import type { Metadata } from "next";
import Link from "next/link";
import AdaptionStats from "@/components/AdaptionStats";

export const metadata: Metadata = {
  title: "How it works · LabLens",
  description: "How LabLens reads a lab report, flags results and explains them, and what Adaption does.",
};

const STEPS = [
  {
    title: "Read",
    body: "A pattern reader matches the test names Indian labs use, such as Haemoglobin, SGPT, TLC and “2.6 lakhs/cumm”, across 25 tests. Optional AI reading helps with messy PDFs, but it only extracts the numbers.",
  },
  {
    title: "Check ranges",
    body: "Each value is compared with sex-specific adult reference ranges and critical limits. No AI is involved, so every flag can be traced to a number.",
  },
  {
    title: "Find combinations",
    body: "18 written rules look for results that mean more together: iron-deficiency anemia, kidney decline with high potassium, metabolic syndrome, thyroid patterns and others.",
  },
  {
    title: "Explain",
    body: "Each flag links to a plain-language explanation from a library built with Adaption Adaptive Data.",
  },
];

const ADAPTION = [
  ["Grounds every explanation", "with web-search hallucination mitigation, so text shown to patients is checked against published sources instead of being generated live."],
  ["Applies a patient-safety blueprint:", "plain words, no diagnoses, no medicine doses, and always a referral to a doctor."],
  ["Runs safety analysis", "on every generated explanation."],
  ["Localizes the library", "into Hindi and Marathi, so explanations reach people beyond English."],
  ["Scores data quality", "before and after adaptation, shown below."],
  ["Answers questions", "through Adaption's inference gateway, with file_search over the adapted dataset."],
];

export default function HowItWorks() {
  return (
    <div className="pt-6 sm:pt-10">
      <h1 className="text-3xl font-bold leading-tight sm:text-[2.4rem]">How LabLens decides what to flag</h1>
      <p className="mt-3 max-w-[62ch] text-lg text-muted">
        Fixed rules decide what is abnormal. AI never does. Adaption makes the explanations clearer, safer and available in
        more languages.
      </p>

      <ol className="mt-8 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-line bg-surface p-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-ink font-bold text-white tabular-nums">
              {i + 1}
            </span>
            <h2 className="mt-3 text-lg font-bold">{s.title}</h2>
            <p className="mt-1 leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-12" aria-labelledby="adaption">
        <h2 id="adaption" className="text-2xl font-bold">
          What Adaption does here
        </h2>
        <ul className="mt-4 space-y-2">
          {ADAPTION.map(([lead, rest]) => (
            <li key={lead} className="flex gap-3 rounded-lg border border-line bg-surface px-4 py-3 leading-relaxed">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-ok" />
              <span>
                <b>{lead}</b> {rest}
              </span>
            </li>
          ))}
        </ul>
        <AdaptionStats />
      </section>

      <p className="mt-12">
        <Link href="/" className="btn btn-primary">
          Check a report
        </Link>
      </p>
    </div>
  );
}
