import type { Severity, Status, VerdictLevel } from "./types";

/** Like Python's `:g` format: up to 6 significant digits, no trailing zeros. */
export function fmt(n: number): string {
  return String(Number(n.toPrecision(6)));
}

// Low reads blue, high reads amber, critical reads red.
export const STATUS_TEXT: Record<Status, string> = {
  normal: "text-ink",
  low: "text-low",
  high: "text-high",
  critical_low: "text-critical",
  critical_high: "text-critical",
};

export const STATUS_DOT: Record<Status, string> = {
  normal: "bg-ok",
  low: "bg-low",
  high: "bg-high",
  critical_low: "bg-critical",
  critical_high: "bg-critical",
};

export const STATUS_CHIP: Record<Status, string> = {
  normal: "text-ink border-line",
  low: "text-low border-[#BFD0EA]",
  high: "text-high border-[#E8D2AE]",
  critical_low: "text-critical border-[#F0C4BF]",
  critical_high: "text-critical border-[#F0C4BF]",
};

export const SEVERITY_BORDER: Record<Severity, string> = {
  urgent: "border-l-critical",
  review: "border-l-high",
  watch: "border-l-low",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  urgent: "text-critical",
  review: "text-high",
  watch: "text-low",
};

export const VERDICT_TEXT: Record<VerdictLevel, string> = {
  urgent: "text-critical",
  review: "text-high",
  watch: "text-ink",
  ok: "text-ok",
};
