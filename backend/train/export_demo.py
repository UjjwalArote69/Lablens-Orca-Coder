"""Bundle recorded model outputs for the /model page (frontend/lib/model_outputs.json).

    python train/export_demo.py                          # base vs adapted, as soon as both have predictions
    python train/export_demo.py --left regex_engine      # compare against the Round 1 pattern reader instead

Each case carries the report, the rules engine's answer, and for every system its output plus a
cross-check against the engine (the engine stays the source of truth; disagreements are shown).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import BACKEND, COMBOS, DATA, TESTS  # noqa: E402
from eval_model import PREDS, RESULTS_JSON, close, parse_block, preds_path, strip_thinking, valid  # noqa: E402
from run_autoscientist import load_state  # noqa: E402

OUT = BACKEND.parent / "frontend" / "lib" / "model_outputs.json"
SYSTEMS = {"base": "Qwen3.5-4B (base)", "base_with_format": "Qwen3.5-4B + format instructions",
           "adapted": "LabLens Reader", "regex_engine": "Round 1 pattern reader", "gold": "Rules engine answer"}
LANG = {"en": "English", "hi": "Hindi", "mr": "Marathi"}


def check(output: str, gold: dict) -> dict:
    """Where the model agrees and disagrees with the rules engine."""
    text = strip_thinking(output)
    b = parse_block(text)
    if not valid(b):
        return {"valid": False}
    pv, pa = b["values"], b["abnormal"]
    values = []
    for k, g in gold["values"].items():
        p = pv.get(k)
        gs, ps = gold["abnormal"].get(k, "normal"), (pa.get(k, "normal") if k in pv else None)
        values.append(dict(key=k, name=TESTS[k]["name"], gold=g, pred=p, value_ok=p is not None and close(p, g),
                           gold_status=gs, pred_status=ps, status_ok=ps == gs))
    extra = sorted(k for k in pv if k not in gold["values"])
    gp, pp = set(gold["patterns"]), {str(p) for p in b["patterns"]}
    return dict(valid=True, verdict=b["verdict"], verdict_ok=b["verdict"] == gold["verdict"], values=values,
                extra_values=extra, missing_patterns=sorted(gp - pp), extra_patterns=sorted(pp - gp))


def answer_text(output: str) -> str:
    """The patient-facing part; the JSON block is shown by the check panel instead."""
    return strip_thinking(output).split("```json")[0].rstrip()


def load_preds(name: str, source: str) -> dict:
    path = preds_path(name, source)
    return {json.loads(line)["id"]: json.loads(line)["output"] for line in open(path, encoding="utf-8")} if path.exists() else {}


def pick_heldout(rows, have: set, n: int) -> list[dict]:
    """A spread of layouts, languages and verdicts, favouring the layouts training never saw."""
    chosen, seen = [], set()
    for want_unseen, quota in ((True, n // 2), (False, n)):
        for r in rows:
            key = (r["template"], r["lang"], r["gold"]["verdict"])
            if (r["id"] in have and r["unseen_template"] == want_unseen and key not in seen
                    and sum(c["unseen_template"] == want_unseen for c in chosen) < quota and len(chosen) < n):
                chosen.append(r)
                seen.add(key)
    return chosen


def case(r, systems, preds, source) -> dict:
    out = dict(id=r["id"], lang=r["lang"], language=LANG[r["lang"]], layout=r["template"].replace("_", " "),
               unseen_layout=r.get("unseen_template", False), source=source, prompt=r["prompt"], gold=r["gold"],
               label=r.get("label") or f"Held-out report {r['id'][1:]}", outputs={})
    for name in systems:
        output = preds[name].get(r["id"])
        if output is not None:
            out["outputs"][name] = dict(text=answer_text(output), check=check(output, r["gold"]))
    return out


def summary(systems) -> dict:
    s = {}
    if RESULTS_JSON.exists():
        res = json.loads(RESULTS_JSON.read_text())["results"]
        s["eval"] = {n: {k: res[n]["all"].get(k) for k in ("n", "fully_correct", "missed_urgent_rate", "verdict_accuracy",
                                                           "json_valid", "status_accuracy")}
                     | {"values_f1": res[n]["all"]["values"]["f1"], "patterns_f1": res[n]["all"]["patterns"]["f1"],
                        "unseen_fully_correct": res[n]["unseen_layouts"].get("fully_correct")}
                     for n in res if n in SYSTEMS}
    runs = load_state().get("runs", {})
    s["runs"] = [dict(label=k, model=v.get("model"), best_win_rate=(v.get("last") or {}).get("best_win_rate"),
                      status=(v.get("last") or {}).get("status")) for k, v in runs.items()]
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--left", default="base")
    ap.add_argument("--right", default="adapted")
    ap.add_argument("--heldout", type=int, default=18)
    a = ap.parse_args()
    systems = [a.left, a.right]
    showcase = [json.loads(line) for line in open(DATA / "showcase.jsonl", encoding="utf-8")]
    heldout = [json.loads(line) for line in open(DATA / "heldout.jsonl", encoding="utf-8")]
    preds = {s: {**load_preds(s, "heldout"), **load_preds(s, "showcase")} for s in systems}
    have = set(preds[a.left]) | set(preds[a.right])
    cases = [case(r, systems, preds, "sample") for r in showcase if r["id"] in have]
    cases += [case(r, systems, preds, "heldout") for r in pick_heldout(heldout, have, a.heldout)]
    if not cases:
        sys.exit(f"No predictions found in {PREDS} for {systems}. Run eval_model.py predict first.")
    titles = {cid: title for cid, title, *_ in COMBOS} | {f"critical:{k}": f"{t['name']} at a critical level" for k, t in TESTS.items()}
    bundle = dict(generated=date.today().isoformat(), systems={s: SYSTEMS.get(s, s) for s in systems},
                  left=a.left, right=a.right, pattern_titles=titles, summary=summary(systems), cases=cases)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(cases)} cases ({sum(c['source'] == 'heldout' for c in cases)} held-out) to {OUT}")
    for s in systems:
        print(f"  {SYSTEMS.get(s, s)}: {sum(s in c['outputs'] for c in cases)} outputs")


if __name__ == "__main__":
    main()
