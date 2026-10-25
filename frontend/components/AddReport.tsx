"use client";

import { useEffect, useState } from "react";
import { ErrorMessage } from "@/components/ui";
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

function Choice({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="border-t-2 border-ink pt-3 font-bold">
        {title}
      </h2>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

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
    <div>
      <h1 className="max-w-[18ch] text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
        Understand your lab report in a minute.
      </h1>
      <p className="mt-4 max-w-[58ch] text-lg text-muted">
        LabLens checks each result against adult reference ranges and points out the results that are worth discussing
        with a doctor together.
      </p>

      <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
        <Choice id="try-sample" title="Try a sample">
          {samples ? (
            <ul className="divide-y divide-line border-b border-line">
              {samples.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => props.onSample(s)}
                    className="group flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-bold">{s.label}</span>
                      <span className="block text-sm text-muted" aria-live="polite">
                        {busy === s.id ? "Analyzing…" : s.description}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : samplesError ? (
            <div className="text-sm">
              <p className="text-critical">{samplesError}</p>
              <button type="button" onClick={retrySamples} className="link mt-2">
                Try again
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted" aria-live="polite">
              {slow ? "Waking up the server. This can take up to a minute…" : "Loading samples…"}
            </p>
          )}
        </Choice>

        <Choice id="upload-file" title="Upload a file">
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
            className={`flex min-h-48 flex-1 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-ink ${
              dragging ? "border-ink bg-subtle" : "border-[#c9c9c4] hover:border-ink"
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
                <span className="font-bold">Drop a PDF or TXT file</span>
                <span className="mt-1 text-sm text-muted">
                  or <span className="link text-ink">choose a file</span>, up to 10 MB
                </span>
              </>
            )}
          </label>
        </Choice>

        <Choice id="paste-text" title="Paste text">
          <form
            className="flex flex-1 flex-col gap-3"
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
              className="min-h-36 flex-1 resize-y rounded-md border border-line px-3 py-2.5 font-mono text-sm leading-relaxed placeholder:text-[#a3a6ad] focus:border-ink focus:outline-none"
            />
            <button type="submit" disabled={busy !== null || !text.trim()} className="btn">
              {busy === "paste" ? "Analyzing…" : "Analyze report"}
            </button>
          </form>
        </Choice>
      </div>

      {props.aiEnabled && (
        <label className="mt-8 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={props.useAi}
            onChange={(e) => props.onUseAiChange(e.target.checked)}
            className="mt-0.5 size-4 accent-[#16181d]"
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
