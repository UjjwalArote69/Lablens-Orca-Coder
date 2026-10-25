"use client";

import { useEffect, useState } from "react";
import AddReport from "@/components/AddReport";
import Results from "@/components/Results";
import { analyzeFile, analyzeText, errorMessage, getHealth, getMeta, getSample } from "@/lib/api";
import type { Analysis, Health, Meta, Sample, Sex } from "@/lib/types";

// What the user gave us, kept so a sex or language change can re-run the same report.
type Source = ({ kind: "text"; text: string } | { kind: "file"; file: File }) & { label: string; origin: string };

export default function ReportApp() {
  const [health, setHealth] = useState<Health | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [lang, setLang] = useState("en");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    getMeta().then(setMeta).catch(() => {});
  }, []);

  async function run(busyKey: string, load: () => Promise<Source>, sex: Sex | null, language: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const src = await load();
      const opts = { sex, lang: language, use_ai: useAi };
      const result = src.kind === "text" ? await analyzeText(src.text, opts) : await analyzeFile(src.file, opts);
      if (src !== source) window.scrollTo({ top: 0 });
      setSource(src);
      setAnalysis(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
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
        error={error}
        aiEnabled={!!health?.ai_enabled}
        useAi={useAi}
        onUseAiChange={setUseAi}
        onLocalError={setError}
        onSample={(s: Sample) =>
          run(
            s.id,
            async () => ({ kind: "text", text: (await getSample(s.id)).text, label: s.label, origin: `Sample report · ${s.description}` }),
            null,
            lang,
          )
        }
        onFile={(file) => run("file", async () => ({ kind: "file", file, label: file.name, origin: "Uploaded file" }), null, lang)}
        onPaste={(text) => run("paste", async () => ({ kind: "text", text, label: "your report", origin: "Pasted text" }), null, lang)}
      />
    );
  }

  return (
    <Results
      analysis={analysis}
      sourceLabel={source.label}
      sourceOrigin={source.origin}
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
