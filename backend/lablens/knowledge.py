"""Patient-facing explanations.

The seed library is written from the rule set. `adaption_build.py` sends it through
Adaption Adaptive Data (web-search grounding, safety checks, a patient-language
blueprint and Hindi/Marathi localization). The app prefers the adapted text and falls
back to the seed text, so it always works offline.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

from .ranges import TESTS
from .rules import COMBOS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SEED_CSV = DATA / "explanations_seed.csv"
ADAPTED_DIR = DATA / "adapted"
EVAL_JSON = DATA / "adaption_eval.json"
STATE_JSON = DATA / "adaption_state.json"

LANG_NAMES = {"en": "English", "hi": "हिन्दी (Hindi)", "mr": "मराठी (Marathi)", "ta": "தமிழ் (Tamil)",
              "te": "తెలుగు (Telugu)", "bn": "বাংলা (Bengali)", "gu": "ગુજરાતી (Gujarati)"}


def seed_rows() -> list[dict]:
    rows = []
    for key, t in TESTS.items():
        for direction in ("low", "high"):
            note = t[f"{direction}_note"]
            if not note:
                continue
            word = "below" if direction == "low" else "above"
            rows.append(dict(
                id=f"test:{key}:{direction}",
                prompt=(f"My blood test shows {direction} {t['name']} ({t['unit']}). "
                        f"In plain language, what does a {direction} {t['name']} result mean, "
                        f"what are common causes, and when should I see a doctor?"),
                completion=(f"{t['name']} measures {t['about']}. A {direction} result means your value is "
                            f"{word} the usual reference range. {note} One result alone is not a diagnosis; "
                            f"your doctor will read it alongside your symptoms and other tests."),
            ))
    for cid, title, _sev, _fn, text in COMBOS:
        rows.append(dict(
            id=f"combo:{cid}",
            prompt=f"My lab report shows this combination: {title.lower()}. What can it mean together, and what should I do next?",
            completion=text + " This is not a diagnosis; please discuss it with your doctor.",
        ))
    return rows


def write_seed() -> Path:
    DATA.mkdir(exist_ok=True)
    pd.DataFrame(seed_rows()).to_csv(SEED_CSV, index=False)
    return SEED_CSV


# ---------------------------------------------------------------------------
# Loading the adapted dataset (column names are detected, not assumed)
# ---------------------------------------------------------------------------
def _read_any(path: Path) -> pd.DataFrame:
    if path.suffix == ".jsonl":
        return pd.read_json(path, lines=True)
    if path.suffix == ".json":
        return pd.read_json(path)
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    return pd.read_csv(path)


def _pick(cols, prefer, contains=()):
    low = {c.lower(): c for c in cols}
    for p in prefer:
        if p in low:
            return low[p]
    for c in cols:
        if any(s in c.lower() for s in contains):
            return c
    return None


def _norm(s: str) -> str:
    return re.sub(r"\W+", " ", str(s).lower()).strip()


def _lang_of(text: str) -> str | None:
    if re.search(r"[\u0B80-\u0BFF]", text): return "ta"
    if re.search(r"[\u0C00-\u0C7F]", text): return "te"
    if re.search(r"[\u0980-\u09FF]", text): return "bn"
    if re.search(r"[\u0A80-\u0AFF]", text): return "gu"
    return None


def _to_code(v) -> str:
    v = str(v or "").strip().lower()
    if not v or v in ("nan", "none", "original", "source"):  # Adaption labels the un-translated rows "original"
        return "en"
    v = v.replace("_", "-")
    for code, name in LANG_NAMES.items():
        if v == code or v.startswith(code + "-") or v.endswith("-" + code) or name.lower().startswith(v):
            return code
    return {"hindi": "hi", "marathi": "mr", "english": "en", "tamil": "ta", "telugu": "te"}.get(v, v[:2])


def load_library() -> tuple[dict, dict]:
    """Returns ({id: {lang: text}}, info)."""
    seed = seed_rows()
    lib = {r["id"]: {"en": r["completion"]} for r in seed}
    info = {"source": "seed", "languages": ["en"], "adapted_rows": 0, "eval": None, "columns": []}

    if EVAL_JSON.exists():
        info["eval"] = json.loads(EVAL_JSON.read_text())
    if STATE_JSON.exists():
        info["state"] = json.loads(STATE_JSON.read_text())

    files = sorted(p for p in ADAPTED_DIR.glob("*") if p.suffix in (".jsonl", ".json", ".csv", ".parquet"))
    if not files:
        return lib, info
    try:
        df = _read_any(files[0])
    except Exception as e:  # noqa: BLE001
        info["error"] = f"Could not read {files[0].name}: {e}"
        return lib, info

    cols = list(df.columns)
    info["columns"] = cols
    text_col = _pick(cols, ["enhanced_completion", "adapted_completion", "improved_completion", "completion",
                            "response", "output", "chosen"], contains=("completion", "response"))
    prompt_col = _pick(cols, ["enhanced_prompt", "adapted_prompt", "prompt", "original_prompt", "instruction"],
                       contains=("prompt",))
    id_col = _pick(cols, ["id", "row_id_source", "source_id"])
    # Prefer the BCP-47 code ("mr-Deva-IN") over the display name ("Marathi (India)").
    lang_col = _pick(cols, ["language", "target_language_code", "target_language", "locale", "lang"],
                     contains=("language", "locale"))
    if not text_col:
        info["error"] = "No completion column found in the adapted file."
        return lib, info

    seed_by_prompt = {_norm(r["prompt"]): r["id"] for r in seed}
    seed_ids = [r["id"] for r in seed]
    langs = {"en"}
    used = 0
    for i, row in df.iterrows():
        text = str(row[text_col]).strip()
        if not text or text.lower() == "nan":
            continue
        rid = str(row[id_col]) if id_col and str(row[id_col]) in lib else None
        if rid is None and prompt_col:
            rid = seed_by_prompt.get(_norm(row[prompt_col]))
        if rid is None and i < len(seed_ids) and len(df) == len(seed_ids):
            rid = seed_ids[i]  # same row order as the seed file
        if rid is None:
            continue
        lang = _to_code(row[lang_col]) if lang_col else None
        if lang in (None, "en"):
            lang = _lang_of(text) or ("en" if not re.search(r"[\u0900-\u097F]", text) else "hi")
        lib[rid][lang] = text
        langs.add(lang)
        used += 1

    info.update(source="adaption", languages=sorted(langs, key=lambda c: (c != "en", c)), adapted_rows=used)
    return lib, info


def explain(lib: dict, item_id: str, lang: str = "en") -> str:
    entry = lib.get(item_id) or {}
    return entry.get(lang) or entry.get("en") or ""
