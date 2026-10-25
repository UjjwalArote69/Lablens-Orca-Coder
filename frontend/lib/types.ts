// Mirrors the JSON returned by backend/main.py.

export type Sex = "F" | "M";
export type Status = "normal" | "low" | "high" | "critical_low" | "critical_high";
export type Severity = "urgent" | "review" | "watch";
export type VerdictLevel = Severity | "ok";

export interface Health {
  ok: boolean;
  ai_enabled: boolean;
  ai_provider: string | null;
  explanations_source: "seed" | "adaption";
  languages: string[];
}

export interface AdaptionEval {
  score_before: number | null;
  score_after: number | null;
  grade_before: string | null;
  grade_after: string | null;
  improvement_percent: number | null;
}

export interface Meta {
  languages: { code: string; label: string }[];
  panels: string[];
  test_count: number;
  rule_count: number;
  alias_count: number;
  adaption: {
    source: "seed" | "adaption";
    adapted_rows: number;
    eval: AdaptionEval | null;
    error: string | null;
    example: { id: string; title: string; before: string; after: string } | null;
  };
}

export interface Sample {
  id: string;
  label: string;
  description: string;
  sex: Sex;
}

export interface SampleText {
  id: string;
  text: string;
}

export interface Evidence {
  key: string;
  name: string;
  value: number;
  unit: string;
  status: Status;
  arrow: string;
}

export interface Pattern {
  id: string;
  title: string;
  severity: Severity;
  severity_label: string;
  explanation: string;
  note: string;
  evidence: Evidence[];
}

export interface Result {
  key: string;
  name: string;
  value: number;
  unit: string;
  panel: string;
  low: number | null;
  high: number | null;
  status: Status;
  direction: "low" | "high" | null;
  arrow: string;
  range_text: string;
  explanation: string; // "" when normal
}

export interface Analysis {
  sex: Sex;
  sex_detected: Sex;
  language: string;
  verdict: { level: VerdictLevel; text: string };
  counts: { read: number; abnormal: number; critical: number; patterns: number };
  patterns: Pattern[];
  results: Result[]; // ordered by panel
  panels: string[]; // only panels present
  summary_markdown: string;
  report_summary: string;
  notice: string | null;
}

export interface AnalyzeOptions {
  sex?: Sex | null;
  lang?: string;
  use_ai?: boolean;
}

export interface Answer {
  answer: string;
  provider: string;
}
