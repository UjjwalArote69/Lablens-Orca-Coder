"use client";

import { useEffect, useState } from "react";
import { getMeta } from "@/lib/api";
import type { Meta } from "@/lib/types";

export default function AdaptionStats() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMeta()
      .then(setMeta)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="mt-6 text-muted">Quality scores could not be loaded right now.</p>;
  if (!meta) return <p className="mt-6 text-muted">Loading quality scores…</p>;

  const { eval: ev, source, adapted_rows } = meta.adaption;
  if (!ev) {
    return (
      <p className="mt-6 text-muted">
        {source === "adaption"
          ? `Adaption-adapted library loaded: ${adapted_rows} explanations. Quality scores are not available yet.`
          : "Adaption-adapted explanations not loaded yet; showing the built-in drafts."}
      </p>
    );
  }

  const tiles = [
    { label: "Quality before", value: ev.score_before?.toFixed(1) ?? "–", sub: ev.grade_before },
    { label: "Quality after", value: ev.score_after?.toFixed(1) ?? "–", sub: ev.grade_after },
    {
      label: "Improvement",
      value: ev.improvement_percent != null ? `${ev.improvement_percent.toFixed(0)}%` : "–",
      sub: `${adapted_rows} adapted explanations`,
    },
  ];
  return (
    <dl className="mt-6 grid gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-line bg-surface p-5">
          <dt className="text-sm text-muted">{t.label}</dt>
          <dd className="mt-1 text-3xl font-bold tabular-nums">{t.value}</dd>
          {t.sub && <dd className="mt-1 text-sm text-muted">{t.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
