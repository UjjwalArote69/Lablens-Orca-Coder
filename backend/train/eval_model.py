"""Evaluate LabLens Reader against its base model on the held-out reports.

Predict once per system (resumable), then score all systems together:

    python train/eval_model.py predict --backend gold --name gold             # sanity check: must score 100%
    python train/eval_model.py predict --backend rules --name regex_engine    # Round 1 parser + rules, no model
    python train/eval_model.py predict --backend hf --model Qwen/Qwen3.5-4B --name base --load-4bit
    python train/eval_model.py predict --backend hf --model Qwen/Qwen3.5-4B --format-hint --name base_with_format
    python train/eval_model.py predict --backend hf --model Qwen/Qwen3.5-4B --adapter train/checkpoints/A --name adapted
    python train/eval_model.py predict --backend openai --base-url URL --model NAME --name adapted_api
    python train/eval_model.py score gold regex_engine base base_with_format adapted

Same prompts and greedy decoding for every system; Qwen's thinking mode is switched off.
`--format-hint` gives a base model the output format and the test/pattern ids in a system prompt,
so it is not penalised just for not knowing our schema.
The hf backend needs a GPU and: pip install -U transformers accelerate peft (bitsandbytes for --load-4bit).

Writes train/preds/<name>.jsonl, train/eval_results.json and train/eval_results.md.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tarfile
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import COMBOS, DATA, SEVERITY_ORDER, TESTS, TRAIN, completion, parse_block  # noqa: E402

PREDS = TRAIN / "preds"
HELDOUT = DATA / "heldout.jsonl"
RESULTS_JSON = TRAIN / "eval_results.json"
RESULTS_MD = TRAIN / "eval_results.md"
TOLERANCE = 0.01  # a value counts as read correctly within 1%


def load_rows(source="heldout", limit=None) -> list[dict]:
    """heldout: the 300 evaluation reports. showcase: the app's 4 sample reports (for the demo page)."""
    rows = [json.loads(line) for line in open(DATA / f"{source}.jsonl", encoding="utf-8")]
    if limit and source == "heldout":  # keep the unseen-layout share: every third report uses an unseen layout
        rows = rows[:limit]
    return rows


def preds_path(name: str, source: str) -> Path:
    return PREDS / (f"{name}.jsonl" if source == "heldout" else f"{name}.{source}.jsonl")


def format_hint() -> str:
    tests = ", ".join(f"{k} = {t['name']} ({t['unit']})" for k, t in TESTS.items())
    combos = "; ".join(f"{cid} = {title}" for cid, title, *_ in COMBOS)
    return ("You read lab reports for patients in India. Answer in the language the user asks for, with these sections: "
            "Verdict, Results outside the reference range, Results that matter together, What this means, What to do next, "
            "and a one-line disclaimer. End with a JSON block in ```json fences: "
            '{"sex":"F or M","values":{test_key: number in the canonical unit},'
            '"abnormal":{test_key: "low" | "high" | "critical_low" | "critical_high"},'
            '"patterns":[pattern ids, plus "critical:<test_key>" for each critical value],'
            '"verdict":"urgent" | "review" | "watch" | "ok"}. '
            f"Test keys and canonical units: {tests}. Pattern ids: {combos}.")


def messages(row, hint: bool) -> list[dict]:
    return ([{"role": "system", "content": format_hint()}] if hint else []) + [{"role": "user", "content": row["prompt"]}]


def strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()


# ---------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------
def unpack(path: str) -> str:
    """Accept a downloaded checkpoint archive as well as a directory."""
    p = Path(path)
    if p.is_dir():
        return str(p)
    out = p.with_suffix("").with_suffix("") if p.name.endswith(".tar.gz") else p.with_suffix("")
    if not out.exists():
        if zipfile.is_zipfile(p):
            zipfile.ZipFile(p).extractall(out)
        else:
            with tarfile.open(p) as tf:
                tf.extractall(out, filter="data")
    inner = [d for d in out.iterdir() if d.is_dir()]
    return str(inner[0] if len(inner) == 1 and not any(out.glob("*.json")) else out)


class HF:
    def __init__(self, a):
        import torch
        from transformers import AutoModelForCausalLM, AutoModelForImageTextToText, AutoTokenizer
        if not torch.cuda.is_available():
            sys.exit("No CUDA GPU visible to PyTorch; install the CUDA build of torch.")
        self.tok = AutoTokenizer.from_pretrained(a.model)
        self.tok.padding_side = "left"
        if self.tok.pad_token is None:
            self.tok.pad_token = self.tok.eos_token
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        kw = dict(device_map="auto", dtype=dtype)
        if a.load_4bit:
            from transformers import BitsAndBytesConfig
            kw["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype)
        # AutoScientist trains the image-text class, so its adapter keys are model.language_model.layers.*; load that
        # class when an adapter is given or PEFT silently matches nothing. Same weights either way.
        classes = (AutoModelForImageTextToText, AutoModelForCausalLM) if a.adapter else (AutoModelForCausalLM, AutoModelForImageTextToText)
        try:  # text-only head when transformers has one; Qwen3.5 checkpoints are image-text models
            self.model = classes[0].from_pretrained(a.model, **kw)
        except (ValueError, KeyError):
            self.model = classes[1].from_pretrained(a.model, **kw)
        if a.adapter:
            from peft import PeftModel
            self.model = PeftModel.from_pretrained(self.model, unpack(a.adapter))
            live = sum(1 for n, p in self.model.named_parameters() if "lora_B" in n and p.abs().sum() > 0)
            print(f"adapter: {live} LoRA modules attached with trained weights", flush=True)
            if not live:
                sys.exit("The adapter did not attach to any module; check the base model class.")
        self.model.eval()

    def text(self, msgs) -> str:
        return self.tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)

    def generate(self, batch, max_new_tokens) -> list[str]:
        import torch
        enc = self.tok([self.text(m) for m in batch], return_tensors="pt", padding=True).to(self.model.device)
        with torch.no_grad():
            out = self.model.generate(**enc, max_new_tokens=max_new_tokens, do_sample=False, pad_token_id=self.tok.pad_token_id)
        return [self.tok.decode(o[enc["input_ids"].shape[1]:], skip_special_tokens=True) for o in out]


class OpenAICompatible:
    def __init__(self, a):
        from openai import OpenAI
        self.client = OpenAI(base_url=a.base_url, api_key=os.environ.get(a.api_key_env) or "none")
        self.model, self.no_think, self.workers = a.model, not a.keep_thinking, a.workers

    def one(self, msgs, max_new_tokens) -> str:
        kw = dict(model=self.model, messages=msgs, temperature=0, max_tokens=max_new_tokens)
        if self.no_think:  # vLLM / SGLang pass this to the Qwen chat template
            kw["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
        r = self.client.chat.completions.create(**kw)
        return r.choices[0].message.content or ""

    def generate(self, batch, max_new_tokens) -> list[str]:
        with ThreadPoolExecutor(self.workers) as pool:
            return list(pool.map(lambda m: self.one(m, max_new_tokens), batch))


def rules_output(row) -> str:
    """The Round 1 pipeline on the same text: regex parser, then the rules engine."""
    from lablens.parser import parse_report
    from main import detect_sex  # noqa: PLC0415
    values = parse_report(row["prompt"])
    return completion(values, detect_sex(row["prompt"]), row["lang"]) if values else "No results recognised."


def cmd_predict(a):
    rows = load_rows(a.source, a.limit)
    PREDS.mkdir(exist_ok=True)
    out_path = preds_path(a.name, a.source)
    done = {json.loads(line)["id"] for line in open(out_path, encoding="utf-8")} if out_path.exists() else set()
    todo = [r for r in rows if r["id"] not in done]
    print(f"{a.name}: {len(done)} done, {len(todo)} to go")
    backend = {"hf": HF, "openai": OpenAICompatible}.get(a.backend)
    model = backend(a) if backend else None
    with open(out_path, "a", encoding="utf-8") as f:
        for i in range(0, len(todo), a.batch):
            batch = todo[i:i + a.batch]
            t0 = time.time()
            if a.backend == "gold":
                outs = [r["reference"] for r in batch]
            elif a.backend == "rules":
                outs = [rules_output(r) for r in batch]
            else:
                outs = model.generate([messages(r, a.format_hint) for r in batch], a.max_new_tokens)
            per_row = (time.time() - t0) / len(batch)
            for r, o in zip(batch, outs):
                f.write(json.dumps({"id": r["id"], "output": o, "seconds": round(per_row, 2)}, ensure_ascii=False) + "\n")
            f.flush()
            print(f"  {min(i + a.batch, len(todo))}/{len(todo)}  {per_row:.1f}s per report", flush=True)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
HI_WORDS = {"है", "हैं", "और", "नहीं", "के", "की", "में", "करें", "से"}
MR_WORDS = {"आहे", "आहेत", "आणि", "नाही", "च्या", "मध्ये", "करा", "व"}


def language_ok(text: str, lang: str) -> bool:
    body = text.split("```json")[0]
    words = re.findall(r"[ऀ-ॿ]+", body)
    letters = len(re.findall(r"[A-Za-zऀ-ॿ]", body)) or 1
    share = sum(len(w) for w in words) / letters
    if lang == "en":
        return share < 0.05
    hi, mr = sum(w in HI_WORDS for w in words), sum(w in MR_WORDS for w in words)
    return share > 0.3 and (hi > mr if lang == "hi" else mr > hi)


def close(p, g) -> bool:
    try:
        return abs(float(p) - float(g)) <= TOLERANCE * abs(float(g))
    except (TypeError, ValueError):
        return False


def valid(b) -> bool:
    return (isinstance(b, dict) and isinstance(b.get("values"), dict) and isinstance(b.get("abnormal"), dict)
            and isinstance(b.get("patterns"), list) and b.get("verdict") in SEVERITY_ORDER)


def score_row(row, output: str) -> dict:
    g = row["gold"]
    text = strip_thinking(output)
    b = parse_block(text)
    ok = valid(b)
    pv, pa = (b["values"], b["abnormal"]) if ok else ({}, {})
    pp = {str(p) for p in b["patterns"]} if ok else set()
    gv, gp = g["values"], set(g["patterns"])
    value_hits = sum(k in pv and close(pv[k], v) for k, v in gv.items())
    status = {k: (k in pv and pa.get(k, "normal") == g["abnormal"].get(k, "normal")) for k in gv}
    return dict(
        valid=ok, value_tp=value_hits, value_pred=len(pv), value_gold=len(gv),
        status=status, pattern_tp=len(pp & gp), pattern_pred=len(pp), pattern_gold=len(gp),
        verdict=ok and b["verdict"] == g["verdict"], sex=ok and b.get("sex") == g["sex"],
        gold_urgent=g["verdict"] == "urgent", pred_urgent=ok and b["verdict"] == "urgent",
        exact=ok and value_hits == len(gv) == len(pv) and all(status.values()) and pp == gp and b["verdict"] == g["verdict"],
        language=language_ok(text, row["lang"]), lang=row["lang"], chars=len(text))


def f1(tp, pred, gold) -> dict:
    p, r = (tp / pred if pred else 0.0), (tp / gold if gold else 0.0)
    return dict(precision=p, recall=r, f1=2 * p * r / (p + r) if p + r else 0.0)


def aggregate(scored: list[dict]) -> dict:
    n = len(scored)
    if not n:
        return {"n": 0}
    status = [ok for s in scored for ok in s["status"].values()]
    urgent = [s for s in scored if s["gold_urgent"]]
    not_urgent = [s for s in scored if not s["gold_urgent"]]
    local = [s for s in scored if s["lang"] in ("hi", "mr")]
    return dict(
        n=n, json_valid=sum(s["valid"] for s in scored) / n,
        values=f1(sum(s["value_tp"] for s in scored), sum(s["value_pred"] for s in scored), sum(s["value_gold"] for s in scored)),
        status_accuracy=sum(status) / len(status),
        patterns=f1(sum(s["pattern_tp"] for s in scored), sum(s["pattern_pred"] for s in scored), sum(s["pattern_gold"] for s in scored)),
        verdict_accuracy=sum(s["verdict"] for s in scored) / n,
        missed_urgent_rate=(sum(not s["pred_urgent"] for s in urgent) / len(urgent)) if urgent else None,
        false_urgent_rate=(sum(s["pred_urgent"] for s in not_urgent) / len(not_urgent)) if not_urgent else None,
        fully_correct=sum(s["exact"] for s in scored) / n, sex_accuracy=sum(s["sex"] for s in scored) / n,
        language_correct_all=sum(s["language"] for s in scored) / n,
        language_correct_hi_mr=(sum(s["language"] for s in local) / len(local)) if local else None,
        avg_output_chars=round(sum(s["chars"] for s in scored) / n))


def per_test(scored) -> dict:
    out = {}
    for k in TESTS:
        hits = [s["status"][k] for s in scored if k in s["status"]]
        if hits:
            out[k] = round(sum(hits) / len(hits), 3)
    return out


ROWS = [  # (label, getter, higher is better)
    ("Reports", lambda m: m["n"], None),
    ("JSON block valid", lambda m: m["json_valid"], True),
    ("Values read correctly (F1, within 1%)", lambda m: m["values"]["f1"], True),
    ("Abnormal status per test (accuracy)", lambda m: m["status_accuracy"], True),
    ("Combination patterns (F1)", lambda m: m["patterns"]["f1"], True),
    ("Verdict (accuracy)", lambda m: m["verdict_accuracy"], True),
    ("Missed urgent (lower is better)", lambda m: m["missed_urgent_rate"], False),
    ("False urgent (lower is better)", lambda m: m["false_urgent_rate"], False),
    ("Fully correct reports", lambda m: m["fully_correct"], True),
    ("Sex used for ranges", lambda m: m["sex_accuracy"], True),
    ("Answer in the requested language (hi/mr)", lambda m: m["language_correct_hi_mr"], True),
]


def table(title: str, results: dict, subset: str) -> list[str]:
    names = list(results)
    out = [f"### {title}", "", "| Metric | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
    for label, get, _ in ROWS:
        cells = []
        for n in names:
            m = results[n].get(subset, {})
            v = get(m) if m.get("n") else None
            cells.append("—" if v is None else str(v) if label == "Reports" else f"{100 * v:.1f}%")
        out.append(f"| {label} | " + " | ".join(cells) + " |")
    return out + [""]


def cmd_score(a):
    rows = {r["id"]: r for r in load_rows()}
    preds_by = {n: [json.loads(line) for line in open(PREDS / f"{n}.jsonl", encoding="utf-8")] for n in a.names}
    common = set(rows).intersection(*({p["id"] for p in ps} for ps in preds_by.values()))  # same reports for everyone
    rows = {k: v for k, v in rows.items() if k in common}
    results, details = {}, {}
    for name in a.names:
        preds = [p for p in preds_by[name] if p["id"] in common]
        scored = [(rows[p["id"]], score_row(rows[p["id"]], p["output"])) for p in preds]
        subsets = {"all": [s for _, s in scored],
                   "seen_layouts": [s for r, s in scored if not r["unseen_template"]],
                   "unseen_layouts": [s for r, s in scored if r["unseen_template"]],
                   "ocr_noise": [s for r, s in scored if r["ocr"]],
                   **{f"lang_{lang}": [s for r, s in scored if r["lang"] == lang] for lang in ("en", "hi", "mr")}}
        results[name] = {k: aggregate(v) for k, v in subsets.items()}
        details[name] = {"status_accuracy_by_test": per_test([s for _, s in scored]),
                         "avg_seconds_per_report": round(sum(p.get("seconds", 0) for p in preds) / max(len(preds), 1), 2)}
    RESULTS_JSON.write_text(json.dumps({"results": results, "details": details}, indent=2), encoding="utf-8")
    md = ["# LabLens Reader: held-out evaluation", "",
          f"{len(rows)} held-out reports from a separate seed ({sum(r['unseen_template'] for r in rows.values())} on two "
          "layouts never seen in training), the same reports for every system. "
          "Every system gets the same prompts with greedy decoding. Gold labels come from the LabLens rules engine.", ""]
    md += table("All held-out reports", results, "all")
    md += table("Unseen layouts only", results, "unseen_layouts")
    md += table("Reports with OCR noise", results, "ocr_noise")
    RESULTS_MD.write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))
    print(f"Wrote {RESULTS_JSON.name} and {RESULTS_MD.name}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("predict")
    p.add_argument("--backend", choices=["gold", "rules", "hf", "openai"], required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--source", choices=["heldout", "showcase"], default="heldout")
    p.add_argument("--model")
    p.add_argument("--adapter", help="LoRA adapter directory or downloaded archive")
    p.add_argument("--format-hint", action="store_true")
    p.add_argument("--load-4bit", action="store_true")
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--max-new-tokens", type=int, default=1536)
    p.add_argument("--limit", type=int)
    p.add_argument("--base-url")
    p.add_argument("--api-key-env", default="LLM_API_KEY")
    p.add_argument("--keep-thinking", action="store_true")
    p.add_argument("--workers", type=int, default=8)
    s = sub.add_parser("score")
    s.add_argument("names", nargs="+")
    a = ap.parse_args()
    if a.cmd == "predict" and a.backend in ("hf", "openai") and not a.model:
        sys.exit("--model is required for the hf and openai backends")
    {"predict": cmd_predict, "score": cmd_score}[a.cmd](a)


if __name__ == "__main__":
    main()
