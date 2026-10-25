"use client";

import { useEffect, useState } from "react";
import AddReport from "@/components/AddReport";
import Results from "@/components/Results";
import { analyzeFile, analyzeText, ApiError, errorMessage, getHealth, getMeta, getSample, pdfPages } from "@/lib/api";
import { isImageFile, readImages } from "@/lib/ocr";
import type { Analysis, AnalyzeOptions, Health, Meta, Sample, Sex } from "@/lib/types";

// What the user gave us, kept so a sex or language change can re-run the same report.
type Source = ({ kind: "text"; text: string } | { kind: "file"; file: File }) & { label: string };

export default function ReportApp() {
  const [health, setHealth] = useState<Health | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [lang, setLang] = useState("en");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    getMeta().then(setMeta).catch(() => {});
  }, []);

  /** Text read from a photo or scan, analysed with a clearer message when nothing was found. */
  async function analyzeRead(src: Source & { kind: "text" }, opts: AnalyzeOptions, what: "photo" | "scan") {
    try {
      return { src, result: await analyzeText(src.text, opts) };
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        throw new ApiError(
          `We could not find any results in that ${what}. Try a sharper, well-lit ${what} of the results page, or paste the results as text.`,
          422,
        );
      }
      throw e;
    }
  }

  async function analyze(src: Source, opts: AnalyzeOptions): Promise<{ src: Source; result: Analysis }> {
    if (src.kind === "text") return { src, result: await analyzeText(src.text, opts) };
    if (isImageFile(src.file)) {
      return analyzeRead({ kind: "text", text: await readImages([src.file], setStatus), label: src.label }, opts, "photo");
    }
    try {
      return { src, result: await analyzeFile(src.file, opts) };
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 422 && e.message.includes("no readable text"))) throw e;
    }
    // A scanned PDF has no text layer: read its pages in the browser instead.
    setStatus("Preparing the scanned pages…");
    const { pages } = await pdfPages(src.file);
    const text = await readImages(pages, setStatus);
    return analyzeRead({ kind: "text", text, label: `${src.label}, read from the scan` }, opts, "scan");
  }

  async function run(busyKey: string, load: () => Promise<Source>, sex: Sex | null, language: string) {
    setBusy(busyKey);
    setStatus(null);
    setError(null);
    try {
      const { src, result } = await analyze(await load(), { sex, lang: language, use_ai: useAi });
      if (src !== source) window.scrollTo({ top: 0 });
      setSource(src);
      setAnalysis(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      setStatus(null);
    }
  }

  function reset() {
    setSource(null);
    setAnalysis(null);
    setError(null);
    window.scrollTo({ top: 0 });
  }

  if (!analysis || !source) {
    return (
      <AddReport
        busy={busy}
        status={status}
        error={error}
        aiEnabled={!!health?.ai_enabled}
        useAi={useAi}
        onUseAiChange={setUseAi}
        onLocalError={setError}
        onSample={(s: Sample) =>
          run(s.id, async () => ({ kind: "text", text: (await getSample(s.id)).text, label: `Sample report for ${s.label}` }), null, lang)
        }
        onFile={(file) =>
          run(
            "file",
            async () => ({ kind: "file", file, label: `From your ${isImageFile(file) ? "photo" : "file"} ${file.name}` }),
            null,
            lang,
          )
        }
        onPaste={(text) => run("paste", async () => ({ kind: "text", text, label: "From the text you pasted" }), null, lang)}
      />
    );
  }

  return (
    <Results
      analysis={analysis}
      sourceLabel={source.label}
      languages={meta?.languages ?? []}
      aiEnabled={!!health?.ai_enabled}
      busy={busy}
      error={error}
      onReset={reset}
      onSexChange={(sex) => run("sex", async () => source, sex, lang)}
      onLangChange={(next) => {
        setLang(next);
        run("lang", async () => source, analysis.sex, next);
      }}
    />
  );
}
