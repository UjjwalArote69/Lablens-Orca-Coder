import { ABBR, bandUnits, fmt, STATUS_BG, STATUS_LABEL, STATUS_TEXT } from "@/lib/format";
import type { Result } from "@/lib/types";

// Vertical scale in band units: the reference range spans 0..1 and sits in the middle.
const TOP = 2.25;
const BOTTOM = -1.25;
const y = (u: number) => ((TOP - u) / (TOP - BOTTOM)) * 100;

/** Every result on one chart: how far each value sits from its own reference range. */
export default function RangeMap({ results, panels }: { results: Result[]; panels: string[] }) {
  const groups = panels
    .map((panel) => ({ panel, rows: results.filter((r) => r.panel === panel) }))
    .filter((g) => g.rows.length > 0);

  return (
    <figure className="min-w-0">
      <div className="overflow-x-auto">
        <div className="relative min-w-max">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-44">
            <div
              className="absolute inset-x-0 border-y border-band-edge bg-band"
              style={{ top: `${y(1)}%`, height: `${y(0) - y(1)}%` }}
            />
          </div>
          <div className="relative flex">
            {groups.map((g, i) => (
              <div
                key={g.panel}
                role="group"
                aria-label={g.panel}
                className={`flex ${i > 0 ? "ml-1.5 border-l border-dashed border-[#c4cfdc] pl-1.5" : ""}`}
              >
                {g.rows.map((r) => (
                  <Column key={r.key} r={r} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-slate">
        The green band is each test&apos;s reference range. Select a test to see its result.
      </figcaption>
    </figure>
  );
}

function Column({ r }: { r: Result }) {
  const u = bandUnits(r);
  const shown = Math.min(Math.max(u, BOTTOM + 0.1), TOP - 0.1); // far-off values are pinned to the edge
  const dot = y(shown);
  const stem = u > 1 ? { top: dot, height: y(1) - dot } : u < 0 ? { top: y(0), height: dot - y(0) } : null;
  const critical = r.status.startsWith("critical");

  return (
    <a
      href={`#result-${r.key}`}
      aria-label={`${r.name}: ${fmt(r.value)} ${r.unit}, ${STATUS_LABEL[r.status].toLowerCase()}`}
      className="flex w-11 flex-col items-center rounded-lg pb-1.5 transition-colors hover:bg-ink/5"
    >
      <span className="relative block h-44 w-full">
        {stem && (
          <span
            className={`absolute left-1/2 block w-0.5 -translate-x-1/2 rounded-full ${STATUS_BG[r.status]}`}
            style={{ top: `${stem.top}%`, height: `${stem.height}%` }}
          />
        )}
        <span
          className={`absolute left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-[#f3f6fa] ${STATUS_BG[r.status]} ${
            critical ? "size-4" : "size-3"
          }`}
          style={{ top: `${dot}%` }}
        />
      </span>
      <span className="mt-2 text-xs font-bold">{ABBR[r.key] ?? r.key}</span>
      <span className={`text-xs tabular-nums ${STATUS_TEXT[r.status]}`}>{fmt(r.value)}</span>
    </a>
  );
}
