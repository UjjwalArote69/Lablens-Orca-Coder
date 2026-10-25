import type { Result, Severity, Status, VerdictLevel } from "./types";

/** Like Python's `:g` format: up to 6 significant digits, no trailing zeros. */
export function fmt(n: number): string {
  return String(Number(n.toPrecision(6)));
}

/** The short codes labs and doctors use for each test. */
export const ABBR: Record<string, string> = {
  hb: "Hb",
  wbc: "WBC",
  plt: "Plt",
  mcv: "MCV",
  fbs: "FBS",
  hba1c: "A1c",
  creat: "Cr",
  urea: "Urea",
  bun: "BUN",
  na: "Na",
  k: "K",
  alt: "ALT",
  ast: "AST",
  bili: "Bili",
  chol: "Chol",
  ldl: "LDL",
  hdl: "HDL",
  tg: "TG",
  tsh: "TSH",
  ft4: "FT4",
  ferritin: "Ferr",
  b12: "B12",
  vitd: "Vit D",
  crp: "CRP",
  uric: "Uric",
};

/**
 * Where a value sits relative to its reference range, in "band units":
 * 0 is the lower limit and 1 the upper one, so anything outside 0..1 is out of range.
 */
export function bandUnits(r: Pick<Result, "low" | "high" | "value" | "status">): number {
  let u: number;
  if (r.low !== null && r.high !== null) u = (r.value - r.low) / (r.high - r.low);
  else if (r.high !== null) u = r.value / r.high;
  else if (r.low !== null) u = (r.value - r.low) / r.low;
  else u = 0.5;
  // A normal value always sits inside the band, even when the range is open-ended.
  return r.status === "normal" ? Math.min(Math.max(u, 0.06), 0.94) : u;
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

export const STATUS_BG: Record<Status, string> = {
  normal: "bg-ok",
  low: "bg-low",
  high: "bg-high",
  critical_low: "bg-critical",
  critical_high: "bg-critical",
};

export const STATUS_MARKER: Record<Status, string> = {
  normal: "border-b-ok",
  low: "border-b-low",
  high: "border-b-high",
  critical_low: "border-b-critical",
  critical_high: "border-b-critical",
};

export const STATUS_CHIP: Record<Status, string> = {
  normal: "border-rule text-ink",
  low: "border-[#c9d6f5] text-low",
  high: "border-[#ecd3ad] text-high",
  critical_low: "border-[#f0c3bb] text-critical",
  critical_high: "border-[#f0c3bb] text-critical",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  urgent: "text-critical",
  review: "text-high",
  watch: "text-low",
};

export const SEVERITY_BG: Record<Severity, string> = {
  urgent: "bg-critical",
  review: "bg-high",
  watch: "bg-low",
};

export const VERDICT_TEXT: Record<VerdictLevel, string> = {
  urgent: "text-critical",
  review: "text-high",
  watch: "text-ink",
  ok: "text-ok",
};
