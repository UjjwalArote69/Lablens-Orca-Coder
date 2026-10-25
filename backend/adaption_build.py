"""Build LabLens's explanation library with Adaption Adaptive Data.

    python adaption_build.py seed        # write data/explanations_seed.csv
    python adaption_build.py estimate    # upload + price the run (no credits spent)
    python adaption_build.py run         # start: grounding + safety + blueprint + Hindi/Marathi
    python adaption_build.py status      # progress
    python adaption_build.py fetch       # wait, save evaluation + adapted rows into data/

Options: --no-lang (skip localization), --langs hi,mr,ta (choose Indian languages)
Needs ADAPTION_API_KEY in the environment.
"""
from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()  # backend/.env -> environment, where the Adaption SDK reads ADAPTION_API_KEY

import argparse
import json
import sys
import time

from lablens.knowledge import ADAPTED_DIR, EVAL_JSON, SEED_CSV, STATE_JSON, write_seed

BLUEPRINT = (
    "You are writing for patients in India reading their own lab report. Use short sentences and "
    "everyday words; explain any medical term the first time you use it. Never diagnose, never "
    "name a medicine dose, and never tell the reader to start or stop a medicine. Mention common "
    "causes, what usually happens next, and clear signs that need a doctor soon. Stay under 120 "
    "words. Keep a calm, reassuring tone and end by recommending a discussion with their doctor."
)


def client():
    from adaption import Adaption
    return Adaption()


def load_state() -> dict:
    return json.loads(STATE_JSON.read_text()) if STATE_JSON.exists() else {}


def save_state(**kw):
    s = load_state(); s.update(kw)
    STATE_JSON.write_text(json.dumps(s, indent=2))
    return s


def ensure_uploaded(c) -> str:
    s = load_state()
    if s.get("dataset_id"):
        return s["dataset_id"]
    write_seed()
    print(f"Uploading {SEED_CSV.name} ...")
    res = c.datasets.upload_file(str(SEED_CSV), name="lablens-explanations")
    ds = res.dataset_id
    save_state(dataset_id=ds)
    print("dataset_id:", ds)
    for _ in range(60):  # wait until ingestion has counted rows
        st = c.datasets.get_status(ds)
        if st.row_count or st.status in ("awaiting_input", "succeeded", "failed"):
            print(f"ingested: status={st.status} rows={st.row_count}")
            break
        time.sleep(3)
    return ds


def adapt_kwargs(args) -> dict:
    kw = dict(
        column_mapping={"prompt": "prompt", "completion": "completion"},
        brand_controls={
            "hallucination_mitigation": True,          # web-search grounding
            "length": "concise",
            "safety_categories": ["self_harm", "violence", "harassment", "hate", "sexual"],
            "blueprint": BLUEPRINT,
        },
        recipe_specification={"recipes": {"deduplication": True, "prompt_rephrase": False,
                                          "reasoning_traces": False}},
        job_specification={"idempotency_key": f"lablens-{args.langs or 'en'}"},
    )
    if not args.no_lang and args.langs:
        kw["language_expansion"] = {"type": "localize", "sample_rate": 1.0,
                                    "pairs": [{"country": "IN", "language": l.strip()} for l in args.langs.split(",")]}
    return kw


def cmd_seed(_):
    print("wrote", write_seed())


def cmd_estimate(args):
    c = client(); ds = ensure_uploaded(c)
    est = c.datasets.adapt(ds, estimate=True, **adapt_kwargs(args))
    print(f"Estimated credits: {est.estimated_credits_consumed}  minutes: {est.estimated_minutes}")


def cmd_run(args):
    c = client(); ds = ensure_uploaded(c)
    try:
        run = c.datasets.adapt(ds, **adapt_kwargs(args))
    except Exception as e:  # noqa: BLE001
        if "language_expansion" in adapt_kwargs(args):
            print(f"Run with localization failed ({e}).\nRetry without it:  python adaption_build.py run --no-lang")
        raise
    save_state(run_id=run.run_id, started=time.time(), languages=None if args.no_lang else args.langs)
    print(f"Started run {run.run_id}. Estimated {run.estimated_minutes} min, {run.estimated_credits_consumed} credits.")
    print("Check progress:  python adaption_build.py status")


def cmd_status(_):
    c = client(); ds = load_state()["dataset_id"]
    st = c.datasets.get_status(ds)
    p = st.progress
    print(f"status={st.status} rows={st.row_count}"
          + (f" progress={p.percent}% ({p.processed_rows}/{p.total_rows})" if p else ""))
    if st.error_data:
        print("error:", st.error_data.message)


def cmd_fetch(args):
    c = client(); ds = load_state()["dataset_id"]
    print("Waiting for the run to finish ...")
    st = c.datasets.wait_for_completion(ds, timeout=args.timeout)
    print("run status:", st.status)

    ADAPTED_DIR.mkdir(parents=True, exist_ok=True)
    out = ADAPTED_DIR / "explanations_adapted.jsonl"
    c.datasets.download(ds, file_format="jsonl").write_to_file(str(out))
    print("saved", out)

    try:
        ev = c.datasets.wait_for_evaluation(ds, timeout=min(args.timeout, 600))
        q = ev.quality
        data = {"status": ev.status, **(q.model_dump() if q else {})}
    except Exception as e:  # noqa: BLE001
        data = {"status": "unavailable", "error": str(e)}
    EVAL_JSON.write_text(json.dumps(data, indent=2))
    print("evaluation:", json.dumps(data))
    save_state(adapted_dataset_id=ds, fetched=time.time())

    import pandas as pd
    df = pd.read_json(out, lines=True)
    print(f"\n{len(df)} rows. Columns: {list(df.columns)}")
    print(df.head(3).to_string()[:1500])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["seed", "estimate", "run", "status", "fetch"])
    ap.add_argument("--no-lang", action="store_true")
    ap.add_argument("--langs", default="hi,mr")
    ap.add_argument("--timeout", type=float, default=3600)
    args = ap.parse_args()
    globals()[f"cmd_{args.cmd}"](args)


if __name__ == "__main__":
    sys.exit(main())
