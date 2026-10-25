import type { Metadata } from "next";
import Link from "next/link";
import AdaptionStats from "@/components/AdaptionStats";
import { SectionTitle } from "@/components/ui";

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
    <div>
      <h1 className="max-w-[20ch] text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
        How LabLens decides what to flag
      </h1>
      <p className="mt-4 max-w-[58ch] text-lg text-muted">
        Fixed rules decide what is abnormal. AI never does. Adaption makes the explanations clearer, safer and available
        in more languages.
      </p>

      <ol className="mt-14 grid gap-10 sm:grid-cols-2 sm:gap-x-8">
        {STEPS.map((s, i) => (
          <li key={s.title} className="border-t-2 border-ink pt-3">
            <span className="text-sm font-bold text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="mt-1 text-lg font-bold">{s.title}</h2>
            <p className="mt-2 leading-relaxed text-body">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-16" aria-labelledby="adaption">
        <SectionTitle id="adaption">What Adaption does here</SectionTitle>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {ADAPTION.map(([lead, rest]) => (
            <li key={lead} className="py-3.5 leading-relaxed text-body">
              <b className="text-ink">{lead}</b> {rest}
            </li>
          ))}
        </ul>
        <AdaptionStats />
      </section>

      <p className="mt-16">
        <Link href="/" className="btn">
          Check a report
        </Link>
      </p>
    </div>
  );
}
