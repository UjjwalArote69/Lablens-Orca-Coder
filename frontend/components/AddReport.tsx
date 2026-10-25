"use client";

import { ChevronRight, ScanSearch, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CardHeader, ErrorMessage, IconCircle } from "@/components/ui";
import { errorMessage, getSamples } from "@/lib/api";
import type { Sample } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;

const AVATARS = [
  "from-[#ffe1dc] to-[#ffbcb1] text-[#b42318]",
  "from-[#dfe9ff] to-[#bcd2fd] text-primary",
  "from-[#ffefcf] to-[#ffd98f] text-high",
  "from-[#d9f5eb] to-[#a9e6d0] text-ok",
];

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
      <h1 className="max-w-[24ch] text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.6rem]">
        Understand your <span className="text-primary">lab report</span> in a minute.
      </h1>
      <p className="mt-3 max-w-[62ch] text-muted sm:text-lg">
        LabLens checks each result against adult reference ranges and points out the results that are worth discussing
        with a doctor together.
      </p>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Intro */}
        <section className="relative flex flex-col overflow-hidden rounded-[24px] bg-linear-to-br from-[#5b95f8] to-[#2560e6] p-6 text-white">
          <span aria-hidden="true" className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-white/10 blur-2xl" />
          <div className="flex items-center justify-between gap-2">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/10">
              <ScanSearch className="size-5" aria-hidden="true" />
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary">25 tests · 18 rules</span>
          </div>
          <h2 className="mt-6 text-xl font-semibold leading-snug">Ranges first. AI never decides what is abnormal.</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/85">
            Every flag traces back to a reference range or a written rule. The explanations are grounded and translated
            with Adaption.
          </p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-6">
            <span aria-hidden="true" className="flex gap-1.5">
              <span className="h-1 w-8 rounded-full bg-white" />
              <span className="h-1 w-8 rounded-full bg-white/35" />
              <span className="h-1 w-8 rounded-full bg-white/35" />
            </span>
            <Link href="/how-it-works" className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30">
              How it works
            </Link>
          </div>
        </section>

        {/* 1. Sample reports */}
        <section className="card flex flex-col" aria-labelledby="try-sample">
          <CardHeader id="try-sample" title="Try a sample" tag="4 reports" />
          {samples ? (
            <ul className="mt-3 divide-y divide-line">
              {samples.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => props.onSample(s)}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-xl py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-sm font-semibold ${AVATARS[i % AVATARS.length]}`}
                    >
                      {s.label.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{s.label}</span>
                      <span className="block text-xs text-muted" aria-live="polite">
                        {busy === s.id ? "Analyzing…" : s.description}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
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
            <p className="mt-4 text-sm text-muted" aria-live="polite">
              {slow ? "Waking up the server. This can take up to a minute…" : "Loading samples…"}
            </p>
          )}
        </section>

        {/* 2. File upload */}
        <section className="card flex flex-col" aria-labelledby="upload-file">
          <CardHeader id="upload-file" title="Upload a file" tag="PDF or TXT" />
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
            className={`mt-4 flex min-h-44 flex-1 cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-primary ${
              dragging ? "border-primary bg-primary-soft" : "border-[#d6e0f5] bg-subtle hover:border-primary/50"
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
            <IconCircle className="size-12 bg-white">
              <Upload className="size-5" />
            </IconCircle>
            {busy === "file" ? (
              <span className="mt-3 text-sm font-semibold" aria-live="polite">
                Analyzing…
              </span>
            ) : (
              <>
                <span className="mt-3 text-sm font-semibold">Drop your report here</span>
                <span className="mt-0.5 text-sm text-muted">
                  or <span className="font-semibold text-primary">choose a file</span>
                </span>
                <span className="mt-2 text-xs text-muted">Up to 10 MB</span>
              </>
            )}
          </label>
        </section>

        {/* 3. Paste */}
        <section className="card flex flex-col" aria-labelledby="paste-text">
          <CardHeader id="paste-text" title="Paste text" tag="Results section" />
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
              className="min-h-36 flex-1 resize-y rounded-[16px] border border-transparent bg-subtle px-4 py-3 font-mono text-sm leading-relaxed placeholder:text-[#98a2b3] focus:border-[#c9d8f8] focus:outline-none focus-visible:outline-3 focus-visible:outline-primary"
            />
            <button type="submit" disabled={busy !== null || !text.trim()} className="btn-primary w-full">
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
            className="mt-0.5 size-4 accent-[#2f6fed]"
          />
          <span>
            <b className="font-semibold">Use AI to read messy reports.</b>{" "}
            <span className="text-muted">AI only reads the numbers. Fixed rules still decide what is out of range.</span>
          </span>
        </label>
      )}

      {props.error && <ErrorMessage>{props.error}</ErrorMessage>}
    </div>
  );
}
