import { BadgeCheck, ChartLine, Globe, MessageCircleQuestion, Search, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import AdaptionStats from "@/components/AdaptionStats";
import { CardHeader, IconCircle } from "@/components/ui";

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
  {
    icon: Search,
    lead: "Grounds every explanation",
    rest: "with web-search hallucination mitigation, so text shown to patients is checked against published sources instead of being generated live.",
  },
  {
    icon: ShieldCheck,
    lead: "Applies a patient-safety blueprint:",
    rest: "plain words, no diagnoses, no medicine doses, and always a referral to a doctor.",
  },
  { icon: BadgeCheck, lead: "Runs safety analysis", rest: "on every generated explanation." },
  { icon: Globe, lead: "Localizes the library", rest: "into Hindi and Marathi, so explanations reach people beyond English." },
  { icon: ChartLine, lead: "Scores data quality", rest: "before and after adaptation, shown alongside." },
  {
    icon: MessageCircleQuestion,
    lead: "Answers questions",
    rest: "through Adaption's inference gateway, with file_search over the adapted dataset.",
  },
];

export default function HowItWorks() {
  return (
    <div>
      <h1 className="max-w-[24ch] text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.6rem]">
        How LabLens decides <span className="text-primary">what to flag</span>
      </h1>
      <p className="mt-3 max-w-[62ch] text-muted sm:text-lg">
        Fixed rules decide what is abnormal. AI never does. Adaption makes the explanations clearer, safer and available
        in more languages.
      </p>

      <ol className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card">
            <span className="flex size-10 items-center justify-center rounded-full bg-linear-to-b from-[#4c8df6] to-[#2563eb] font-semibold text-white tabular-nums shadow-[0_8px_18px_-8px_rgba(37,99,235,0.7)]">
              {i + 1}
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2" aria-labelledby="adaption">
          <CardHeader id="adaption" title="What Adaption does here" tag="Adaptive Data" />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {ADAPTION.map(({ icon: Icon, lead, rest }) => (
              <li key={lead} className="flex gap-3 rounded-[18px] bg-subtle p-4">
                <IconCircle className="bg-white">
                  <Icon className="size-[18px]" />
                </IconCircle>
                <p className="text-sm leading-relaxed text-body">
                  <b className="font-semibold text-ink">{lead}</b> {rest}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="quality">
          <CardHeader id="quality" title="Explanation quality" tag="Before and after" />
          <AdaptionStats />
        </section>
      </div>

      <section className="relative mt-4 flex flex-col items-start justify-between gap-4 overflow-hidden rounded-[24px] bg-linear-to-br from-[#5b95f8] to-[#2560e6] p-6 text-white sm:flex-row sm:items-center sm:p-7">
        <span aria-hidden="true" className="pointer-events-none absolute -top-20 -right-10 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <h2 className="text-xl font-semibold">Ready to read your report?</h2>
          <p className="mt-1 text-sm text-white/85">Try a sample, upload a PDF or paste the results.</p>
        </div>
        <Link href="/" className="relative rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary hover:bg-white/90">
          Check a report
        </Link>
      </section>
    </div>
  );
}
