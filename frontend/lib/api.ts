import type { Analysis, AnalyzeOptions, Answer, Health, Meta, Sample, SampleText } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Fetch from the API; any failure becomes an ApiError carrying the server's plain-sentence `detail`. */
async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(
      "We could not reach the LabLens server. Check your connection and try again in a minute.",
      0,
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : null;
    throw new ApiError(detail ?? `The server returned an error (${res.status}). Please try again.`, res.status);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

// Health and meta rarely change, so each is fetched once per page load and shared.
let health: Promise<Health> | null = null;
let meta: Promise<Meta> | null = null;

export function getHealth(): Promise<Health> {
  health ??= request<Health>("/api/health").catch((e) => {
    health = null;
    throw e;
  });
  return health;
}

export function getMeta(): Promise<Meta> {
  meta ??= request<Meta>("/api/meta").catch((e) => {
    meta = null;
    throw e;
  });
  return meta;
}

export const getSamples = () => request<Sample[]>("/api/samples");

export const getSample = (id: string) => request<SampleText>(`/api/samples/${encodeURIComponent(id)}`);

export function analyzeText(text: string, opts: AnalyzeOptions = {}): Promise<Analysis> {
  return request<Analysis>("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sex: opts.sex ?? null, lang: opts.lang ?? "en", use_ai: opts.use_ai ?? false }),
  });
}

export function analyzeFile(file: File, opts: AnalyzeOptions = {}): Promise<Analysis> {
  const form = new FormData();
  form.append("file", file);
  if (opts.sex) form.append("sex", opts.sex);
  form.append("lang", opts.lang ?? "en");
  form.append("use_ai", String(opts.use_ai ?? false));
  return request<Analysis>("/api/analyze/file", { method: "POST", body: form });
}

/** Page images of a scanned PDF (one with no text layer), for reading in the browser. */
export function pdfPages(file: File): Promise<{ pages: string[]; page_count: number }> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/pdf/pages", { method: "POST", body: form });
}

/** One-page PDF of an analysis, for the patient to take to their doctor. */
export async function summaryPdf(analysis: Analysis, source: string): Promise<Blob> {
  const res = await send("/api/summary.pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...analysis, source }),
  });
  return res.blob();
}

export function ask(question: string, reportSummary: string, lang: string): Promise<Answer> {
  return request<Answer>("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, report_summary: reportSummary, lang }),
  });
}
