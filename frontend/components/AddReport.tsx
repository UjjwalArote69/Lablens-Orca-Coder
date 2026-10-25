"use client";

import { useEffect, useState } from "react";
import ErrorMessage from "@/components/ErrorMessage";
import { errorMessage, getSamples } from "@/lib/api";
import type { Sample } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  busy: string | null;
  error: string | null;
  aiEnabled: boolean;
  useAi: boolean;
  onUseAiChange: (value: boolean) => void;
  onLocalError: (message: string) => void;
  onSample: (sample: Sample) => void;
  onFile: (file: File) => void;
  onPaste: (text: string) => void;
}

const card = "flex flex-col rounded-xl border border-line bg-surface p-5";

export default function AddReport(props: Props) {
  const { busy } = props;
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let alive = true;
    // A sleeping free-tier server can take up to a minute to answer the first request.
    const timer = setTimeout(() => {
      if (alive) setSlow(true);
    }, 4000);
    getSamples()
      .then((s) => {
        if (alive) setSamples(s);
      })
      .catch((e) => {
        if (alive) setSamplesError(errorMessage(e));
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  function retrySamples() {
    setSamplesError(null);
    setSlow(false);
    setAttempt((n) => n + 1);
  }

  function pickFile(file: File) {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".txt")) {
      props.onLocalError("Upload a PDF or a .txt file, or paste the results as text.");
    } else if (file.size > MAX_BYTES) {
      props.onLocalError("That file is larger than 10 MB. Upload a smaller PDF or paste the results as text.");
    } else {
      props.onFile(file);
    }
  }

  return (
    <div className="pt-6 sm:pt-10">
      <h1 className="max-w-[22ch] text-3xl font-bold leading-tight sm:text-[2.6rem]">
        Understand your lab report in a minute.
      </h1>
      <p className="mt-3 max-w-[62ch] text-lg text-muted">
        LabLens checks each result against adult reference ranges and points out the results that are worth
        discussing with a doctor together.
      </p>

      <h2 className="mt-10 text-sm font-bold text-muted">Add your report</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {/* 1. Sample reports */}
        <section className={card} aria-labelledby="try-sample">
          <h3 id="try-sample" className="text-lg font-bold">
            Try a sample
          </h3>
          <p className="mt-1 text-sm text-muted">Four real-looking reports from Indian labs.</p>
          {samples ? (
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {samples.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => props.onSample(s)}
                    className="h-full w-full cursor-pointer rounded-lg border border-line bg-bg px-3 py-2.5 text-left transition-colors hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block font-bold">{s.label}</span>
                    <span className="block text-sm text-muted" aria-live="polite">
                      {busy === s.id ? "Analyzing…" : s.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : samplesError ? (
            <div className="mt-4 text-sm">
              <p className="text-critical">{samplesError}</p>
              <button type="button" onClick={retrySamples} className="btn btn-secondary mt-3">
                Try again
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted" aria-live="polite">
              {slow ? "Waking up the server. This can take up to a minute…" : "Loading samples…"}
            </p>
          )}
        </section>

        {/* 2. File upload */}
        <section className={card} aria-labelledby="upload-file">
          <h3 id="upload-file" className="text-lg font-bold">
            Upload a file
          </h3>
          <p className="mt-1 text-sm text-muted">A PDF or text file from your lab, up to 10 MB.</p>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file && busy === null) pickFile(file);
            }}
            className={`mt-4 flex min-h-36 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-low ${
              dragging ? "border-low bg-[#EAF0FA]" : "border-line bg-bg hover:border-muted"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) pickFile(file);
                e.target.value = "";
              }}
            />
            {busy === "file" ? (
              <span className="font-bold" aria-live="polite">
                Analyzing…
              </span>
            ) : (
              <>
                <span className="font-bold">Drop your PDF or TXT here</span>
                <span className="mt-1 text-sm text-muted">
                  or <span className="font-bold text-low underline underline-offset-2">choose a file</span>
                </span>
              </>
            )}
          </label>
        </section>

        {/* 3. Paste */}
        <section className={card} aria-labelledby="paste-text">
          <h3 id="paste-text" className="text-lg font-bold">
            Paste text
          </h3>
          <p className="mt-1 text-sm text-muted">Copy the results section of your report.</p>
          <form
            className="mt-4 flex flex-1 flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) props.onPaste(text);
            }}
          >
            <label htmlFor="report-text" className="sr-only">
              Report text
            </label>
            <textarea
              id="report-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={"Haemoglobin  9.1  g/dL\nTSH  7.8  mIU/L\nSGPT  58  U/L"}
              className="min-h-36 flex-1 resize-y rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm leading-relaxed"
            />
            <button type="submit" disabled={busy !== null || !text.trim()} className="btn btn-primary">
              {busy === "paste" ? "Analyzing…" : "Analyze report"}
            </button>
          </form>
        </section>
      </div>

      {props.aiEnabled && (
        <label className="mt-5 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.useAi}
            onChange={(e) => props.onUseAiChange(e.target.checked)}
            className="mt-0.5 size-4 accent-[#15212B]"
          />
          <span>
            <b>Use AI to read messy reports.</b>{" "}
            <span className="text-muted">AI only reads the numbers. Fixed rules still decide what is out of range.</span>
          </span>
        </label>
      )}

      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}
    </div>
  );
}
