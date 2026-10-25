"""LabLens HTTP API. A thin wrapper around the `lablens` engine: no flagging logic lives here.

Run: uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import math
import os
import re
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lablens import ai
from lablens.knowledge import LANG_NAMES, explain, load_library
from lablens.parser import parse_report, pdf_to_text
from lablens.ranges import PANELS, TESTS
from lablens.rules import COMBOS, analyze

log = logging.getLogger("lablens.api")

ROOT = Path(__file__).resolve().parent
SAMPLES_DIR = ROOT / "samples"
MAX_UPLOAD = 10 * 1024 * 1024
MAX_TEXT = 200_000

SAMPLES = [
    dict(id="suresh_kidney_urgent", label="Suresh, 61", description="Emergency sample", sex="M"),
    dict(id="rajesh_metabolic", label="Rajesh, 52", description="Routine check-up", sex="M"),
    dict(id="anita_anemia_thyroid", label="Anita, 34", description="Tired all the time", sex="F"),
    dict(id="priya_healthy", label="Priya, 29", description="Annual wellness", sex="F"),
]
SEVERITY_LABEL = {"urgent": "See a doctor today", "review": "Discuss with your doctor", "watch": "Keep an eye on"}
ARROW = {"low": "↓", "high": "↑", "critical_low": "↓↓", "critical_high": "↑↑", "normal": ""}
VERDICT = {
    "urgent": "Some results need a doctor today.",
    "review": "A few results are worth discussing with your doctor.",
    "watch": "Mostly fine, with a couple of things to keep an eye on.",
    "ok": "Everything we could read is within the reference range.",
}
NOTHING_FOUND = ("No results recognised. Make sure the text includes test names and values, "
                 "for example 'Haemoglobin 9.1 g/dL', or turn on AI reading.")
PANEL_ORDER = {p: i for i, p in enumerate(PANELS)}
TEST_ORDER = {k: i for i, k in enumerate(TESTS)}

lib, info = load_library()

app = FastAPI(title="LabLens API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if o.strip()],
    allow_origin_regex=os.environ.get("FRONTEND_ORIGIN_REGEX") or None,  # e.g. https://lablens-.*\.vercel\.app
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def _bad_request(_: Request, exc: RequestValidationError):
    err = (exc.errors() or [{}])[0]
    field = ".".join(str(x) for x in err.get("loc", ())[1:]) or "request"
    return JSONResponse(status_code=422, content={
        "detail": f"The request has a missing or invalid '{field}' field. Reload the page and try again."})


# ---------------------------------------------------------------------------
# Helpers ported from streamlit_app.py
# ---------------------------------------------------------------------------
def detect_sex(text: str) -> str:
    t = text.lower()
    m = re.search(r"(?:sex|gender)[^\n]{0,20}?\b(female|male|f|m)\b", t) or re.search(r"\d+\s*y\w*\s*/\s*(f|m)\b", t)
    return "M" if m and m.group(1).startswith("m") else "F"


def explanation_id(p, results) -> str:
    if p.id.startswith("critical:"):
        k = p.evidence[0]
        return f"test:{k}:{results[k].direction}"
    return f"combo:{p.id}"


def result_json(r, lang: str) -> dict:
    return dict(key=r.key, name=r.name, value=r.value, unit=r.unit, panel=r.panel, low=r.low, high=r.high,
                status=r.status, direction=r.direction, arrow=ARROW[r.status], range_text=r.range_text(),
                explanation=explain(lib, f"test:{r.key}:{r.direction}", lang) if r.abnormal else "")


def pattern_json(p, results, lang: str) -> dict:
    return dict(id=p.id, title=p.title, severity=p.severity, severity_label=SEVERITY_LABEL[p.severity],
                explanation=explain(lib, explanation_id(p, results), lang), note=p.note,
                evidence=[dict(key=k, name=results[k].name, value=results[k].value, unit=results[k].unit,
                               status=results[k].status, arrow=ARROW[results[k].status]) for k in p.evidence])


def summary_markdown(verdict: str, sex: str, rows, patterns) -> str:
    md = ["# LabLens summary", "", f"**{verdict}**", "",
          f"Reference ranges used: {'female' if sex == 'F' else 'male'} adult.", ""]
    md += [f"- **{p.title}** ({SEVERITY_LABEL[p.severity]})" for p in patterns]
    md += ["", "| Test | Value | Range | Status |", "|---|---|---|---|"]
    md += [f"| {r.name} | {r.value:g} {r.unit} | {r.range_text()} | {r.status.replace('_', ' ')} |" for r in rows]
    md += ["", "_Not a diagnosis. Reference ranges vary between labs; please review these results with your doctor._"]
    return "\n".join(md) + "\n"


def report_summary(rows, patterns) -> str:
    lines = [f"- {r.name}: {r.value:g} {r.unit} (range {r.range_text()}) {r.status.replace('_', ' ').upper()}"
             for r in rows]
    lines += [f"- PATTERN [{p.severity}]: {p.title}" for p in patterns]
    return "\n".join(lines)


def run_analysis(text: str, sex: str | None, lang: str, use_ai: bool) -> dict:
    if not text.strip():
        raise HTTPException(422, NOTHING_FOUND)
    if len(text) > MAX_TEXT:
        raise HTTPException(413, "That report is too long. Paste only the results section and try again.")
    language = lang if lang in info["languages"] else "en"
    sex_detected = detect_sex(text)
    sex = sex or sex_detected

    values = parse_report(text)
    notice = None
    if use_ai:
        if ai.provider():
            try:
                found = ai.extract_values(text)
                values = {**{k: v for k, v in found.items() if math.isfinite(v)}, **values}
            except Exception:  # noqa: BLE001
                log.exception("AI extraction failed")
                notice = "AI reading failed, so only the standard reader was used."
            finally:
                ai.flush()
        else:
            notice = "AI reading is turned off on this server, so only the standard reader was used."
    if not values:
        raise HTTPException(422, NOTHING_FOUND)

    results, patterns = analyze(values, sex)
    rows = sorted(results.values(), key=lambda r: (PANEL_ORDER[r.panel], TEST_ORDER[r.key]))
    abnormal = sum(r.abnormal for r in rows)
    worst = patterns[0].severity if patterns else ("watch" if abnormal else "ok")
    return dict(
        sex=sex, sex_detected=sex_detected, language=language,
        verdict=dict(level=worst, text=VERDICT[worst]),
        counts=dict(read=len(rows), abnormal=abnormal, critical=sum(r.critical for r in rows), patterns=len(patterns)),
        patterns=[pattern_json(p, results, language) for p in patterns],
        results=[result_json(r, language) for r in rows],
        panels=[p for p in PANELS if any(r.panel == p for r in rows)],
        summary_markdown=summary_markdown(VERDICT[worst], sex, rows, patterns),
        report_summary=report_summary(rows, patterns),
        notice=notice,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
class AnalyzeIn(BaseModel):
    text: str
    sex: Literal["F", "M"] | None = None
    lang: str = "en"
    use_ai: bool = False


class AskIn(BaseModel):
    question: str
    report_summary: str
    lang: str = "en"


@app.get("/")
def root():
    return {"ok": True, "service": "LabLens API", "health": "/api/health", "docs": "/docs"}


@app.get("/api/health")
def health():
    p = ai.provider()
    return dict(ok=True, ai_enabled=p is not None, ai_provider=p,
                explanations_source=info["source"], languages=info["languages"])


@app.get("/api/meta")
def meta():
    ev = info.get("eval") or {}
    ev = ({k: ev.get(k) for k in ("score_before", "score_after", "grade_before", "grade_after", "improvement_percent")}
          if ev.get("score_after") is not None else None)
    return dict(
        languages=[dict(code=c, label=LANG_NAMES.get(c, c)) for c in info["languages"]],
        panels=PANELS, test_count=len(TESTS), rule_count=len(COMBOS),
        alias_count=sum(len(t["aliases"]) for t in TESTS.values()),
        adaption=dict(source=info["source"], adapted_rows=info["adapted_rows"], eval=ev, error=info.get("error")),
    )


@app.get("/api/samples")
def samples():
    return SAMPLES


@app.get("/api/samples/{sample_id}")
def sample(sample_id: str):
    if sample_id not in {s["id"] for s in SAMPLES}:
        raise HTTPException(404, "That sample does not exist. Pick one of the samples on the home page.")
    return dict(id=sample_id, text=(SAMPLES_DIR / f"{sample_id}.txt").read_text(encoding="utf-8"))


@app.post("/api/analyze")
def analyze_text(body: AnalyzeIn):
    return run_analysis(body.text, body.sex, body.lang, body.use_ai)


@app.post("/api/analyze/file")
def analyze_file(file: UploadFile = File(...), sex: str | None = Form(None), lang: str = Form("en"),
                 use_ai: bool = Form(False)):
    sex = (sex or "").strip().upper()[:1] or None
    if sex not in (None, "F", "M"):
        raise HTTPException(422, "Choose Female or Male for the reference ranges and try again.")
    data = file.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "That file is larger than 10 MB. Upload a smaller PDF or paste the results as text.")
    name = (file.filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        try:
            text = pdf_to_text(data)
        except Exception:  # noqa: BLE001
            log.exception("PDF read failed")
            raise HTTPException(422, "We could not read that PDF. Try another file or paste the results as text.")
        if not text.strip():
            raise HTTPException(422, "That PDF has no readable text, it may be a scanned image. "
                                     "Paste the results as text instead.")
    elif name.endswith(".txt") or (file.content_type or "").startswith("text/"):
        text = data.decode("utf-8-sig", "ignore")
    else:
        raise HTTPException(415, "Upload a PDF or a .txt file, or paste the results as text.")
    return run_analysis(text, sex, lang, use_ai)


@app.post("/api/ask")
def ask(body: AskIn):
    p = ai.provider()
    if p is None:
        raise HTTPException(503, "Questions are turned off. Set ADAPTION_API_KEY and ADAPTION_MODEL on the server.")
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "Type a question about your report first.")
    try:
        answer = ai.ask(question[:1000], body.report_summary[:20_000], LANG_NAMES.get(body.lang, "English"))
    except Exception:  # noqa: BLE001
        log.exception("AI answer failed")
        raise HTTPException(502, "The assistant could not answer right now. Please try again in a moment.")
    finally:
        ai.flush()
    if not answer.strip():
        raise HTTPException(502, "The assistant returned an empty answer. Try asking in a different way.")
    return dict(answer=answer, provider=p)
