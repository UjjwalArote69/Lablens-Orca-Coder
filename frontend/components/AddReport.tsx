"use client";

import { ChevronRight, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import ReportPreview from "@/components/ReportPreview";
import { CardHeader, ErrorMessage } from "@/components/ui";
import { errorMessage, getSamples } from "@/lib/api";
import type { Sample } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;
const ANITA: Sample = { id: "anita_anemia_thyroid", label: "Anita, 34", description: "Tired all the time", sex: "F" };

interface Props {
  busy: string | null;
  status: string | null;
  error: string | null;
  aiEnabled: boolean;
  useAi: boolean;
  onUseAiChange: (value: boolean) => void;
  onLocalError: (message: string) => void;
  onSample: (sample: Sample) => void;
  onFile: (file: File) => void;
  onPaste: (text: string) => void;
}

export default function AddReport(props: Props) {
  const { busy, status } = props;
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
    if (!/\.(pdf|txt|jpe?g|png|webp)$/i.test(file.name) && !file.type.startsWith("image/")) {
      props.onLocalError("Upload a PDF, a photo (JPG or PNG) or a .txt file, or paste the results as text.");
    } else if (file.size > MAX_BYTES) {
      props.onLocalError("That file is larger than 10 MB. Upload a smaller PDF or paste the results as text.");
    } else {
      props.onFile(file);
    }
  }

  return (
    <div>
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h1 className="max-w-[13ch] text-[2.5rem] leading-[1.04] font-bold tracking-[-0.025em] sm:text-[3.25rem] xl:text-[3.75rem]">
            Understand your lab report in a minute.
          </h1>
          <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-slate">
            LabLens reads the numbers on your report, checks each one against adult reference ranges, and points out the
            results worth discussing with a doctor together.
          </p>
        </div>
        <div className="hidden lg:block">
          <ReportPreview
            busy={busy === ANITA.id}
            onOpen={() => props.onSample(samples?.find((s) => s.id === ANITA.id) ?? ANITA)}
          />
        </div>
      </section>

      <h2 className="mt-12 text-[1.375rem] font-bold tracking-tight lg:mt-14">Add your report</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {/* 1. Sample reports */}
        <section className="card flex flex-col" aria-labelledby="try-sample">
          <CardHeader id="try-sample" title="Try a sample" />
          {samples ? (
            <ul className="mt-3 divide-y divide-rule">
              {samples.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => props.onSample(s)}
                    className="group flex w-full cursor-pointer items-center gap-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eef2f7] text-sm font-bold text-slate">
                      {s.sex}
                      <span className="sr-only">{s.sex === "F" ? " (female)" : " (male)"}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{s.label}</span>
                      <span className="block text-sm text-slate" aria-live="polite">
                        {busy === s.id ? "Analyzing…" : s.description}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-slate transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : samplesError ? (
            <div className="mt-4 text-sm">
              <p className="text-critical">{samplesError}</p>
              <button type="button" onClick={retrySamples} className="btn-pill mt-3">
                Try again
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate" aria-live="polite">
              {slow ? "Waking up the server. This can take up to a minute…" : "Loading samples…"}
            </p>
          )}
        </section>

        {/* 2. File upload */}
        <section className="card flex flex-col" aria-labelledby="upload-file">
          <CardHeader id="upload-file" title="Upload a file" />
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
            className={`mt-4 flex min-h-48 flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-lab ${
              dragging ? "border-lab bg-[#eef3fd]" : "border-[#cdd7e4] bg-[#f6f8fb] hover:border-lab"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,image/*"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) pickFile(file);
                e.target.value = "";
              }}
            />
            {busy === "file" ? (
              <span className="font-bold tabular-nums" aria-live="polite">
                {status ?? "Analyzing…"}
              </span>
            ) : (
              <>
                <Upload className="size-6 text-lab" aria-hidden="true" />
                <span className="mt-3 font-bold">Drop a PDF, photo or text file</span>
                <span className="mt-1 text-sm text-slate">
                  or <span className="font-bold text-lab underline underline-offset-4">choose a file</span>, up to 10 MB
                </span>
              </>
            )}
          </label>
          <p className="mt-3 text-sm text-slate">Photos and scanned pages are read on your device.</p>
        </section>

        {/* 3. Paste */}
        <section className="card flex flex-col" aria-labelledby="paste-text">
          <CardHeader id="paste-text" title="Paste text" />
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
              className="min-h-36 flex-1 resize-y rounded-2xl border border-rule bg-[#f6f8fb] px-4 py-3 text-[15px] leading-relaxed placeholder:text-[#93a0b2] focus:border-lab focus:outline-none"
            />
            <button type="submit" disabled={busy !== null || !text.trim()} className="btn-primary">
              {busy === "paste" ? "Analyzing…" : "Analyze report"}
            </button>
          </form>
        </section>
      </div>

      {props.aiEnabled && (
        <label className="mt-5 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={props.useAi}
            onChange={(e) => props.onUseAiChange(e.target.checked)}
            className="mt-0.5 size-4 accent-[#2557d6]"
          />
          <span>
            <b>Use AI to read messy reports.</b>{" "}
            <span className="text-slate">AI only reads the numbers. Fixed rules still decide what is out of range.</span>
          </span>
        </label>
      )}

      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}
    </div>
  );
}
