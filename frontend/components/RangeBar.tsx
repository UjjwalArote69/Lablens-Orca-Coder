import { fmt, STATUS_DOT } from "@/lib/format";
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
  return (
    <span
      role="img"
      aria-label={`${fmt(r.value)} ${r.unit}, reference range ${r.range_text}`}
      className="relative block h-3"
    >
      <span className="absolute inset-x-0 top-1/2 block h-1 -translate-y-1/2 rounded-full bg-track" />
      <span
        className="absolute top-1/2 block h-1 -translate-y-1/2 rounded-full bg-band"
        style={{ left: `${bandStart}%`, width: `${bandEnd - bandStart}%` }}
      />
      <span
        className={`absolute top-1/2 block size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper ${STATUS_DOT[r.status]}`}
        style={{ left: `${marker}%` }}
      />
    </span>
  );
}
