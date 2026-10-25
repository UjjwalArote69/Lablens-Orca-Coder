"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { getMeta } from "@/lib/api";
import type { Meta } from "@/lib/types";

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex gap-2.5 rounded-[18px] bg-subtle p-4 text-sm leading-relaxed text-muted">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export default function AdaptionStats() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMeta()
      .then(setMeta)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Note>Quality scores could not be loaded right now.</Note>;
  if (!meta) return <Note>Loading quality scores…</Note>;

  const { eval: ev, source, adapted_rows } = meta.adaption;
  if (!ev) {
    return (
      <Note>
        {source === "adaption"
          ? `Adaption-adapted library loaded: ${adapted_rows} explanations. Quality scores are not available yet.`
          : "Adaption-adapted explanations not loaded yet; showing the built-in drafts."}
      </Note>
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
    <dl className="mt-4 grid gap-2.5">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center justify-between gap-3 rounded-[18px] bg-subtle px-4 py-3">
          <div>
            <dt className="text-sm text-muted">{t.label}</dt>
            {t.sub && <dd className="text-xs text-muted">{t.sub}</dd>}
          </div>
          <dd className="text-[1.75rem] font-semibold tracking-tight tabular-nums text-ink">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
