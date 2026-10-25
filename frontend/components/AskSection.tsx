"use client";

import { useState } from "react";
import { CardHeader, ErrorMessage } from "@/components/ui";
import { ask, errorMessage } from "@/lib/api";
import type { Answer } from "@/lib/types";

export default function AskSection({ reportSummary, lang }: { reportSummary: string; lang: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setAnswer(await ask(question, reportSummary, lang));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card lg:col-span-2" aria-labelledby="ask">
      <CardHeader id="ask" title="Ask about this report" />
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Which result should I worry about first?"
          className="flex-1 rounded-full border border-rule bg-[#f6f8fb] px-5 py-2.5 placeholder:text-[#93a0b2] focus:border-lab focus:outline-none"
        />
        <button type="submit" disabled={busy || !question.trim()} className="btn-primary">
          {busy ? "Getting an answer…" : "Get an answer"}
        </button>
      </form>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {answer && (
        <div className="mt-4 rounded-2xl bg-well p-5" aria-live="polite">
          <p className="max-w-[70ch] whitespace-pre-line leading-relaxed">{answer.answer}</p>
          <p className="mt-3 text-sm text-slate">
            {answer.provider === "adaption"
              ? "Answered through Adaption's inference gateway, grounded in the adapted explanation library. "
              : "Answered by an AI model. "}
            It does not change which results are flagged. Check anything important with your doctor.
          </p>
        </div>
      )}
    </section>
  );
}
