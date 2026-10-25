"use client";

import { MessageCircleQuestion } from "lucide-react";
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
      <CardHeader id="ask" title="Ask about this report" tag="Adaption inference" />
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <div className="flex flex-1 items-center gap-2 rounded-full bg-subtle px-4">
          <MessageCircleQuestion className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="Which result should I worry about first?"
            className="w-full bg-transparent py-2.5 text-sm placeholder:text-[#98a2b3] focus:outline-none"
          />
        </div>
        <button type="submit" disabled={busy || !question.trim()} className="btn-primary">
          {busy ? "Getting an answer…" : "Get an answer"}
        </button>
      </form>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {answer && (
        <div className="mt-4 rounded-[20px] bg-subtle p-4 sm:p-5" aria-live="polite">
          <p className="whitespace-pre-line text-sm leading-relaxed">{answer.answer}</p>
          <p className="mt-3 text-xs text-muted">
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
