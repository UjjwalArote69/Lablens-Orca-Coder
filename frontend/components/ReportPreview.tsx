import { MiniBar } from "@/components/RangeBar";
import { STATUS_TEXT } from "@/lib/format";
import type { Status } from "@/lib/types";

// An excerpt of the Anita sample exactly as the lab printed it, with what LabLens adds.
const ROWS: { test: string; value: string; unit: string; ref: string; flag?: "L" | "H"; status: Status; bar: [number, number, number] }[] = [
  { test: "Haemoglobin", value: "9.1", unit: "g/dL", ref: "12.0 – 15.5", flag: "L", status: "low", bar: [12, 15.5, 9.1] },
  { test: "Platelet Count", value: "2.6", unit: "lakhs/cumm", ref: "1.5 – 4.1", status: "normal", bar: [1.5, 4.1, 2.6] },
  { test: "MCV", value: "71.4", unit: "fL", ref: "80 – 100", flag: "L", status: "low", bar: [80, 100, 71.4] },
  { test: "Serum Ferritin", value: "8.2", unit: "ng/mL", ref: "15 – 150", flag: "L", status: "low", bar: [15, 150, 8.2] },
  { test: "TSH", value: "7.8", unit: "mIU/L", ref: "0.4 – 4.5", flag: "H", status: "high", bar: [0.4, 4.5, 7.8] },
  { test: "Free T4", value: "0.62", unit: "ng/dL", ref: "0.8 – 1.8", flag: "L", status: "low", bar: [0.8, 1.8, 0.62] },
];

const PATTERNS = ["Pattern of iron-deficiency anemia", "Underactive thyroid pattern"];

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default function ReportPreview({ busy, onOpen }: { busy: boolean; onOpen: () => void }) {
  return (
    <figure className="card">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-3">
        <span className="font-bold">Sunrise Diagnostics</span>
        <span className="text-sm text-slate">Anita Deshmukh, 34 Y / F</span>
      </figcaption>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate">
            <th className="py-2 font-semibold">Test</th>
            <th className="py-2 text-right font-semibold">Result</th>
            <th className="py-2 pl-3 font-semibold">Unit</th>
            <th className="py-2 pl-3 font-semibold">Ref. interval</th>
            <th className="w-24 py-2 pl-4">
              <span className="sr-only">Where the result sits in the range</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.test} className="reveal border-t border-rule" style={delay(150 + i * 90)}>
              <td className="py-2 pr-2">{r.test}</td>
              <td className={`py-2 text-right font-bold whitespace-nowrap tabular-nums ${STATUS_TEXT[r.status]}`}>
                {r.value}
                <span className="inline-block w-4 text-right text-xs">{r.flag}</span>
              </td>
              <td className="py-2 pl-3 text-slate">{r.unit}</td>
              <td className="py-2 pl-3 whitespace-nowrap text-slate tabular-nums">{r.ref}</td>
              <td className="py-2 pl-4">
                <MiniBar low={r.bar[0]} high={r.bar[1]} value={r.bar[2]} status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="reveal mt-4 rounded-2xl bg-[#fbf4ea] px-4 py-3" style={delay(800)}>
        <p className="text-sm text-slate">Read together, these results form two patterns to discuss with a doctor:</p>
        <ul className="mt-1.5 space-y-1 font-semibold text-high">
          {PATTERNS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onOpen} disabled={busy} className="btn-primary mt-4 w-full">
        {busy ? "Analyzing…" : "Open Anita's full report"}
      </button>
    </figure>
  );
}
