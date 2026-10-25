import type { Severity, Status, VerdictLevel } from "./types";

/** Like Python's `:g` format: up to 6 significant digits, no trailing zeros. */
export function fmt(n: number): string {
  return String(Number(n.toPrecision(6)));
}

export const STATUS_LABEL: Record<Status, string> = {
  normal: "Normal",
  low: "Low",
  high: "High",
  critical_low: "Critical low",
  critical_high: "Critical high",
};

// Low reads blue, high reads amber, critical reads red.
export const STATUS_TEXT: Record<Status, string> = {
  normal: "text-ink",
  low: "text-low",
  high: "text-high",
  critical_low: "text-critical",
  critical_high: "text-critical",
};

export const STATUS_LABEL_TEXT: Record<Status, string> = { ...STATUS_TEXT, normal: "text-ok" };

export const STATUS_DOT: Record<Status, string> = {
  normal: "bg-ok-dot",
  low: "bg-low-dot",
  high: "bg-high-dot",
  critical_low: "bg-critical-dot",
  critical_high: "bg-critical-dot",
};

// Colour of the triangle marker under the range bar.
export const STATUS_MARKER: Record<Status, string> = {
  normal: "border-b-ok-dot",
  low: "border-b-low-dot",
  high: "border-b-high-dot",
  critical_low: "border-b-critical-dot",
  critical_high: "border-b-critical-dot",
};

export const STATUS_CHIP: Record<Status, string> = {
  normal: "border-line bg-surface text-ink",
  low: "border-[#cfe0fd] bg-[#f3f7ff] text-low",
  high: "border-[#f7ddb3] bg-[#fff8ec] text-high",
  critical_low: "border-[#f8cfcb] bg-[#fff4f3] text-critical",
  critical_high: "border-[#f8cfcb] bg-[#fff4f3] text-critical",
};

export const SEVERITY_PILL: Record<Severity, string> = {
  urgent: "bg-[#fdecec] text-critical",
  review: "bg-[#fff4e5] text-high",
  watch: "bg-primary-soft text-low",
};

export const SEVERITY_DOT: Record<Severity, string> = {
  urgent: "bg-critical-dot",
  review: "bg-high-dot",
  watch: "bg-low-dot",
};

// The verdict card is red when urgent, green when all clear, brand blue otherwise.
export const VERDICT_CARD: Record<VerdictLevel, string> = {
  urgent: "from-[#f0645a] to-[#c62a20]",
  review: "from-[#5b95f8] to-[#2560e6]",
  watch: "from-[#5b95f8] to-[#2560e6]",
  ok: "from-[#2fb488] to-[#137a5a]",
};

export const VERDICT_TAG: Record<VerdictLevel, { label: string; dot: string }> = {
  urgent: { label: "See a doctor today", dot: "bg-critical-dot" },
  review: { label: "Discuss with your doctor", dot: "bg-high-dot" },
  watch: { label: "Keep an eye on", dot: "bg-low-dot" },
  ok: { label: "All within range", dot: "bg-ok-dot" },
};
