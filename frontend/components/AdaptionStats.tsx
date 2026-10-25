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

  const note = (text: string) => <p className="mt-4 leading-relaxed text-slate">{text}</p>;
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
    <dl className="mt-4 divide-y divide-rule border-t border-rule">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline justify-between gap-3 py-3">
          <div>
            <dt className="text-slate">{s.label}</dt>
            {s.sub && <dd className="text-sm text-slate">{s.sub}</dd>}
          </div>
          <dd className="text-[1.75rem] font-bold tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
