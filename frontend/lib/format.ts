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

export const STATUS_DOT: Record<Status, string> = {
  normal: "bg-ok",
  low: "bg-low",
  high: "bg-high",
  critical_low: "bg-critical",
  critical_high: "bg-critical",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  urgent: "text-critical",
  review: "text-high",
  watch: "text-low",
};

export const SEVERITY_RULE: Record<Severity, string> = {
  urgent: "border-critical",
  review: "border-high",
  watch: "border-low",
};

export const VERDICT_TEXT: Record<VerdictLevel, string> = {
  urgent: "text-critical",
  review: "text-high",
  watch: "text-ink",
  ok: "text-ok",
};
