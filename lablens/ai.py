"""Optional AI features. The core analyzer never depends on these.

- Adaption inference gateway (`client.responses.create`) answers questions, grounded with
  `file_search` over the Adaption-adapted explanation dataset.
- Any OpenAI-compatible endpoint (Gemini, Groq, OpenRouter...) is a fallback.
- Every call is traced in Langfuse when LANGFUSE_* keys are set.
"""
from __future__ import annotations

import json
import os
import re

import requests

try:
    from langfuse import get_client, observe
except Exception:  # noqa: BLE001
    def observe(*a, **k):
        if a and callable(a[0]):
            return a[0]
        return lambda f: f

    def get_client():
        return None

from .ranges import TESTS
from .knowledge import STATE_JSON

SAFETY = ("You explain lab results to patients in plain, calm language. You never diagnose, never "
          "prescribe and never change medicine doses. You point to the specific values you are "
          "discussing, and you always recommend confirming with a doctor. If any value is at a "
          "critical level, say clearly that it needs prompt medical attention.")


def _env(name):
    v = os.environ.get(name, "").strip()
    return v or None


def adapted_dataset_id() -> str | None:
    if _env("ADAPTION_DATASET_ID"):
        return _env("ADAPTION_DATASET_ID")
    try:
        state = json.loads(STATE_JSON.read_text())
        return state.get("adapted_dataset_id") or state.get("dataset_id")
    except Exception:  # noqa: BLE001
        return None


def provider() -> str | None:
    if _env("ADAPTION_API_KEY") and _env("ADAPTION_MODEL"):
        return "adaption"
    if _env("LLM_API_KEY") and _env("LLM_BASE_URL") and _env("LLM_MODEL"):
        return "openai-compatible"
    return None


def _response_text(resp) -> str:
    if hasattr(resp, "model_dump"):
        resp = resp.model_dump()
    if not isinstance(resp, dict):
        return str(resp)
    if resp.get("output_text"):
        return resp["output_text"]
    parts = []
    for item in resp.get("output", []) or []:
        for c in (item.get("content") or []) if isinstance(item, dict) else []:
            if isinstance(c, dict) and c.get("text"):
                parts.append(c["text"])
    return "\n".join(parts).strip()


@observe(as_type="generation", name="adaption-responses")
def _adaption(prompt: str, instructions: str, grounded: bool) -> str:
    from adaption import Adaption

    client = Adaption()
    kwargs = dict(model=_env("ADAPTION_MODEL"), instructions=instructions, input=prompt,
                  max_output_tokens=900, temperature=0.2)
    ds = adapted_dataset_id()
    if grounded and ds:
        kwargs["tools"] = [{"type": "file_search", "dataset_ids": [ds]}]
        kwargs["max_tool_calls"] = 3
    try:
        resp = client.responses.create(**kwargs)
    except Exception:  # noqa: BLE001
        if "tools" not in kwargs:
            raise
        kwargs.pop("tools"); kwargs.pop("max_tool_calls")  # retry ungrounded rather than fail the demo
        resp = client.responses.create(**kwargs)
    lf = get_client()
    if lf:
        lf.update_current_generation(model=f"adaption/{kwargs['model']}", metadata={"grounded_dataset": ds})
    return _response_text(resp)


@observe(as_type="generation", name="llm-chat")
def _openai_compatible(prompt: str, instructions: str) -> str:
    url = _env("LLM_BASE_URL").rstrip("/") + "/chat/completions"
    r = requests.post(url, timeout=60, headers={"Authorization": f"Bearer {_env('LLM_API_KEY')}"},
                      json={"model": _env("LLM_MODEL"), "temperature": 0.2,
                            "messages": [{"role": "system", "content": instructions},
                                         {"role": "user", "content": prompt}]})
    r.raise_for_status()
    lf = get_client()
    if lf:
        lf.update_current_generation(model=_env("LLM_MODEL"))
    return r.json()["choices"][0]["message"]["content"]


def complete(prompt: str, instructions: str = SAFETY, grounded: bool = True) -> str:
    p = provider()
    if p == "adaption":
        return _adaption(prompt, instructions, grounded)
    if p == "openai-compatible":
        return _openai_compatible(prompt, instructions)
    raise RuntimeError("No AI provider configured. Set ADAPTION_API_KEY and ADAPTION_MODEL "
                       "(or LLM_BASE_URL, LLM_API_KEY and LLM_MODEL).")


@observe(name="ask-about-report")
def ask(question: str, report_summary: str, language: str = "English") -> str:
    prompt = (f"Here is a patient's lab report summary, already checked against reference ranges:\n\n"
              f"{report_summary}\n\nThe patient asks: {question}\n\n"
              f"Answer in {language}, in under 180 words.")
    return complete(prompt)


@observe(name="ai-extract-values")
def extract_values(report_text: str) -> dict:
    """AI fallback for messy reports. Returns {test_key: value}; ranges are still applied by rules.py."""
    catalogue = "\n".join(f"{k}: {t['name']} ({t['unit']})" for k, t in TESTS.items())
    prompt = (f"Extract lab values from this report. Use only these keys and convert to these units:\n"
              f"{catalogue}\n\nReturn only a JSON object like {{\"hb\": 9.1, \"tsh\": 6.2}}. "
              f"Skip tests that are not listed or not present.\n\nREPORT:\n{report_text[:12000]}")
    raw = complete(prompt, instructions="You convert lab reports into JSON. Output JSON only.", grounded=False)
    m = re.search(r"\{.*\}", raw, re.S)
    data = json.loads(m.group()) if m else {}
    out = {}
    for k, v in data.items():
        if k in TESTS:
            try:
                out[k] = float(v)
            except (TypeError, ValueError):
                pass
    return out


def flush():
    lf = get_client()
    if lf:
        try:
            lf.flush()
        except Exception:  # noqa: BLE001
            pass
