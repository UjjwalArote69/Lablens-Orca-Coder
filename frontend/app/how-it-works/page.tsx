import type { Metadata } from "next";
import Link from "next/link";
import AdaptionStats from "@/components/AdaptionStats";
import { CardHeader } from "@/components/ui";

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
  ["Scores data quality", "before and after adaptation."],
  ["Answers questions", "through Adaption's inference gateway, with file_search over the adapted dataset."],
];

export default function HowItWorks() {
  return (
    <div>
      <h1 className="max-w-[18ch] text-[2.5rem] leading-[1.04] font-bold tracking-[-0.025em] sm:text-[3.25rem]">
        How LabLens decides what to flag
      </h1>
      <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-slate">
        Fixed rules decide what is abnormal. AI never does. Adaption makes the explanations clearer, safer and available
        in more languages.
      </p>

      <section className="card mt-10" aria-label="From report to explanation">
        <ol className="grid gap-8 md:grid-cols-4 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="absolute top-[18px] right-0 left-12 hidden h-px bg-rule md:block" />
              )}
              <span className="relative flex size-9 items-center justify-center rounded-full bg-ink font-bold text-white tabular-nums">
                {i + 1}
              </span>
              <h2 className="mt-4 text-lg font-bold">{s.title}</h2>
              <p className="mt-1.5 leading-relaxed text-slate">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2" aria-labelledby="adaption">
          <CardHeader id="adaption" title="What Adaption does here" />
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {ADAPTION.map(([lead, rest]) => (
              <li key={lead} className="border-t border-rule py-4 leading-relaxed text-slate">
                <b className="text-ink">{lead}</b> {rest}
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="quality">
          <CardHeader id="quality" title="Explanation quality" />
          <AdaptionStats />
        </section>
      </div>

      <p className="mt-8">
        <Link href="/" className="btn-primary">
          Check a report
        </Link>
      </p>
    </div>
  );
}
