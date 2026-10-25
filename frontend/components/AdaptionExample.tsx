"use client";

import { useEffect, useState } from "react";
import { CardHeader } from "@/components/ui";
import { getMeta } from "@/lib/api";
import type { Meta } from "@/lib/types";

/** One explanation as we drafted it and as Adaption returned it. Hidden until adapted data is loaded. */
export default function AdaptionExample() {
  const [example, setExample] = useState<Meta["adaption"]["example"]>(null);

  useEffect(() => {
    getMeta()
      .then((m) => setExample(m.adaption.example ?? null))
      .catch(() => {});
  }, []);

  if (!example) return null;
  return (
    <section className="card mt-4" aria-labelledby="before-after">
      <CardHeader id="before-after" title="Before and after Adaption" />
      <p className="mt-2 max-w-[70ch] text-slate">
        What a patient reads when their report shows the pattern “{example.title}”.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <figure className="rounded-2xl bg-well p-5">
          <figcaption className="text-sm font-semibold text-slate">Our draft</figcaption>
          <blockquote className="mt-2 leading-relaxed">{example.before}</blockquote>
        </figure>
        <figure className="rounded-2xl border border-band-edge bg-band/40 p-5">
          <figcaption className="text-sm font-semibold text-ok">
            After Adaption: grounded, safety-checked, patient-friendly
          </figcaption>
          <blockquote className="mt-2 leading-relaxed">{example.after}</blockquote>
        </figure>
      </div>
    </section>
  );
}
