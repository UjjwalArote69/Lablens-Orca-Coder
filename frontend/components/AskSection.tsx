"use client";

import { useState } from "react";
import ErrorMessage from "@/components/ErrorMessage";
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
    <section className="mt-10" aria-labelledby="ask">
      <h2 id="ask" className="text-xl font-bold">
        Ask about this report
      </h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Which result should I worry about first?"
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5"
        />
        <button type="submit" disabled={busy || !question.trim()} className="btn btn-primary">
          {busy ? "Getting an answer…" : "Get an answer"}
        </button>
      </form>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {answer && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-5" aria-live="polite">
          <p className="whitespace-pre-line leading-relaxed">{answer.answer}</p>
          <p className="mt-3 text-sm text-muted">
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
