import { fmt, STATUS_BG, STATUS_MARKER } from "@/lib/format";
import type { Result, Status } from "@/lib/types";

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

/** Full bar for a result card: band, a marker under the value, and the band's limits labelled. */
export default function RangeBar({ r }: Props) {
  const { bandStart, bandEnd, marker } = barGeometry(r.low, r.high, r.value);
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
          className="absolute inset-y-0 block bg-band"
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
          className="absolute top-[22px] block -translate-x-1/2 text-xs leading-none text-slate tabular-nums"
          style={{ left: `${l.at}%` }}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}

/** Compact bar used in the landing-page report excerpt. */
export function MiniBar({ low, high, value, status }: { low: number; high: number; value: number; status: Status }) {
  const { bandStart, bandEnd, marker } = barGeometry(low, high, value);
  return (
    <span aria-hidden="true" className="relative block h-2.5 w-full">
      <span className="absolute inset-x-0 top-1/2 block h-1 -translate-y-1/2 rounded-full bg-track" />
      <span
        className="absolute top-1/2 block h-1 -translate-y-1/2 bg-band"
        style={{ left: `${bandStart}%`, width: `${bandEnd - bandStart}%` }}
      />
      <span
        className={`absolute top-1/2 block size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper ${STATUS_BG[status]}`}
        style={{ left: `${marker}%` }}
      />
    </span>
  );
}
