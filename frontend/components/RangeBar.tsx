import { fmt, STATUS_MARKER } from "@/lib/format";
import type { Result } from "@/lib/types";

/** Positions (in %) of the reference band and the value marker on the track. */
export function barGeometry(low: number | null, high: number | null, value: number) {
  let dmin: number;
  let dmax: number;
  if (low !== null && high !== null) {
    const span = high - low;
    dmin = Math.max(0, low - 0.7 * span);
    dmax = high + 0.7 * span;
  } else if (high !== null) {
    dmin = 0;
    dmax = 1.7 * high;
  } else {
    dmin = 0;
    dmax = 2.2 * (low ?? 1);
  }
  dmin = Math.min(dmin, value * 0.95);
  dmax = Math.max(dmax, value * 1.05);
  const pct = (x: number) => (dmax === dmin ? 50 : (100 * (x - dmin)) / (dmax - dmin));
  const bandStart = low !== null ? pct(low) : 0;
  const bandEnd = high !== null ? pct(high) : 100;
  return { bandStart, bandEnd, marker: Math.min(Math.max(pct(value), 2), 98) };
}

type Props = { r: Pick<Result, "low" | "high" | "value" | "unit" | "status" | "range_text"> };

export default function RangeBar({ r }: Props) {
  const { bandStart, bandEnd, marker } = barGeometry(r.low, r.high, r.value);
  // Label the band edges; when the band is too narrow for two labels, show one in the middle.
  const labels: { at: number; text: string }[] =
    r.low !== null && r.high !== null && bandEnd - bandStart < 14
      ? [{ at: (bandStart + bandEnd) / 2, text: r.range_text }]
      : [
          ...(r.low !== null ? [{ at: bandStart, text: fmt(r.low) }] : []),
          ...(r.high !== null ? [{ at: bandEnd, text: fmt(r.high) }] : []),
        ];

  return (
    <span
      role="img"
      aria-label={`${fmt(r.value)} ${r.unit}, reference range ${r.range_text}`}
      className="relative block h-9"
    >
      <span className="absolute inset-x-0 top-0 block h-2 rounded-full bg-track">
        <span
          className="absolute inset-y-0 block rounded-full bg-linear-to-r from-[#a9e4d0] to-[#62c5a2]"
          style={{ left: `${bandStart}%`, width: `${bandEnd - bandStart}%` }}
        />
      </span>
      <span
        className={`absolute top-[11px] block size-0 -translate-x-1/2 border-x-[6px] border-b-[9px] border-x-transparent ${STATUS_MARKER[r.status]}`}
        style={{ left: `${marker}%` }}
      />
      {labels.map((l) => (
        <span
          key={l.text}
          className="absolute top-[22px] block -translate-x-1/2 text-[11px] leading-none text-muted tabular-nums"
          style={{ left: `${l.at}%` }}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}
