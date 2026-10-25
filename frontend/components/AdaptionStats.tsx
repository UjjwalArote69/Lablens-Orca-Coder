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

  const note = (text: string) => <p className="mt-6 text-muted">{text}</p>;
  if (failed) return note("Quality scores could not be loaded right now.");
  if (!meta) return note("Loading quality scores…");

  const { eval: ev, source, adapted_rows } = meta.adaption;
  if (!ev) {
    return note(
      source === "adaption"
        ? `Adaption-adapted library loaded: ${adapted_rows} explanations. Quality scores are not available yet.`
        : "Adaption-adapted explanations not loaded yet; showing the built-in drafts.",
    );
  }

  const stats = [
    { label: "Quality before", value: ev.score_before?.toFixed(1) ?? "–", sub: ev.grade_before },
    { label: "Quality after", value: ev.score_after?.toFixed(1) ?? "–", sub: ev.grade_after },
    {
      label: "Improvement",
      value: ev.improvement_percent != null ? `${ev.improvement_percent.toFixed(0)}%` : "–",
      sub: `${adapted_rows} adapted explanations`,
    },
  ];
  return (
    <dl className="mt-8 grid grid-cols-3 gap-6">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="text-sm text-muted">{s.label}</dt>
          <dd className="mt-1 text-3xl font-bold tabular-nums">{s.value}</dd>
          {s.sub && <dd className="text-sm text-muted">{s.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
