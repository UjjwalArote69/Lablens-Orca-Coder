"""Train LabLens Reader with Adaption AutoScientist.

    python train/run_autoscientist.py models                 # base models AutoScientist accepts
    python train/run_autoscientist.py launch                 # round start: upload + estimate + runs A and B
    python train/run_autoscientist.py upload                # train.csv -> raw, trainable dataset
    python train/run_autoscientist.py estimate               # hyperparameters it would use (nothing launched)
    python train/run_autoscientist.py run --label A          # Run A: Qwen/Qwen3.5-4B
    python train/run_autoscientist.py run --label B          # identical repeat, to report mean and spread
    python train/run_autoscientist.py run --label auto --model auto   # let AutoScientist pick the model
    python train/run_autoscientist.py status [--watch 300]   # every poll is appended to train/runs.log
    python train/run_autoscientist.py download --label A     # best checkpoint -> train/checkpoints/

Ids are kept in train/state.json. Needs ADAPTION_API_KEY (read from backend/.env).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

TRAIN = Path(__file__).resolve().parent
BACKEND = TRAIN.parent
TRAIN_CSV = TRAIN / "data" / "train.csv"
STATE = TRAIN / "state.json"
RUNS_LOG = TRAIN / "runs.log"
CHECKPOINTS = TRAIN / "checkpoints"

MODEL = "Qwen/Qwen3.5-4B"
GENERAL_SHARE = 0.35  # general-diversity rows as a share of all training rows, against catastrophic forgetting
COLUMNS = {"prompt": "prompt", "completion": "completion"}
TERMINAL = {"succeeded", "failed", "cancelled"}


def client():
    import functools
    import httpx
    from dotenv import load_dotenv
    from adaption import Adaption
    if not isinstance(httpx.put, functools.partial):  # the SDK's file PUT uses httpx's 5 s default; 18 MB needs longer
        httpx.put = functools.partial(httpx.put, timeout=httpx.Timeout(600.0))
    load_dotenv(BACKEND / ".env")
    return Adaption()


def load_state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {"runs": {}}


def save_state(state: dict):
    STATE.write_text(json.dumps(state, indent=2, default=str))


def dump(obj) -> dict:
    return obj.model_dump(mode="json") if hasattr(obj, "model_dump") else dict(obj)


def general_rows(rows: int) -> int:
    return round(rows * GENERAL_SHARE / (1 - GENERAL_SHARE))


def dataset(state) -> str:
    if not state.get("dataset_id"):
        sys.exit("No dataset yet. Run:  python train/run_autoscientist.py upload")
    return state["dataset_id"]


def cmd_models(c, _args):
    for m in c.autoscientist.list_models().models:
        d = dump(m)
        print(f"{d['id']:<55} {d.get('model_size', ''):>6}  methods={d.get('methods')}  types={d.get('training_types')}")


def cmd_upload(c, args):
    state = load_state()
    digest = hashlib.sha256(TRAIN_CSV.read_bytes()).hexdigest()[:12]
    if state.get("dataset_id") and state.get("train_sha") == digest and not args.force:
        print(f"Already uploaded this train.csv as {state['dataset_id']} (use --force to upload again).")
        return
    print(f"Uploading {TRAIN_CSV.name} (sha {digest}) as a raw dataset ...")
    res = c.datasets.upload_file(str(TRAIN_CSV), name=f"lablens-reader-{digest}", processing_mode="raw", column_mapping=COLUMNS)
    ds = res.dataset_id
    state.update(dataset_id=ds, train_sha=digest, uploaded=time.time())
    save_state(state)
    print("dataset_id:", ds)
    for _ in range(120):  # raw ingestion only has to count and materialise the rows
        st = c.datasets.get_status(ds)
        if st.row_count or st.status in ("failed",):
            print(f"ingested: status={st.status} rows={st.row_count}")
            state["rows"] = st.row_count
            save_state(state)
            return
        time.sleep(5)
    print("Still ingesting; check again with `status` before `run`.")


def run_kwargs(state, args) -> dict:
    rows = state.get("rows") or sum(1 for _ in open(TRAIN_CSV, encoding="utf-8")) - 1
    # No column_mapping here: the raw upload already canonicalised prompt/completion, and AutoScientist rejects the
    # original column names; it infers the mapping when it is omitted.
    kw = dict(dataset_id=dataset(state), augmentation_domain_rows=args.domain_rows,
              augmentation_general_rows=general_rows(rows) if args.general_rows is None else args.general_rows)
    if args.model != "auto":
        kw["model"] = args.model
    if args.max_iterations:
        kw["max_iterations"] = args.max_iterations
    if args.target_win_rate:
        kw["target_win_rate"] = args.target_win_rate
    return kw


def cmd_estimate(c, args):
    state = load_state()
    kw = run_kwargs(state, args)
    rec = c.autoscientist.recommend_hyperparams(**{k: v for k, v in kw.items() if k in (
        "dataset_id", "model", "augmentation_domain_rows", "augmentation_general_rows")})
    out = dump(rec)
    state["recommended"] = out
    save_state(state)
    print(f"model: {out['model']}  general rows: {kw['augmentation_general_rows']}  domain rows: {kw['augmentation_domain_rows']}")
    print(json.dumps(out["hyperparams"], indent=2))


def cmd_run(c, args):
    state = load_state()
    if args.label in state["runs"] and not args.force:
        sys.exit(f"Run {args.label} already exists ({state['runs'][args.label]['id']}). Use another --label, or --force.")
    kw = run_kwargs(state, args)
    # The idempotency key is scoped to the dataset: A and B need different keys or B would return A.
    kw["idempotency_key"] = f"lablens-reader-{state.get('train_sha', 'x')}-{args.label}"
    run = c.autoscientist.create(**kw)
    d = dump(run)
    state["runs"][args.label] = dict(id=d["id"], model=d.get("model"), created=time.time(), request=kw, response=d)
    save_state(state)
    log(args.label, d)
    print(f"Started run {args.label}: {d['id']}  model={d.get('model')}  max_iterations={d.get('max_iterations')}  "
          f"target_win_rate={d.get('target_win_rate')}")


def cmd_launch(c, args):
    """Round start in one command: upload, record the hyperparameters, start runs A and B."""
    cmd_upload(c, args)
    if not load_state().get("rows"):
        sys.exit("Dataset is still ingesting. Re-run `launch` in a minute; the upload is not repeated.")
    cmd_estimate(c, args)
    for label in ("A", "B"):
        if label in load_state()["runs"]:
            print(f"Run {label} already started; skipping.")
            continue
        args.label = label
        cmd_run(c, args)
    print("Both runs started. Watch them with:  python train/run_autoscientist.py status --watch 300")


def log(label: str, d: dict):
    entry = {"time": datetime.now(timezone.utc).isoformat(timespec="seconds"), "label": label, **{
        k: d.get(k) for k in ("id", "model", "status", "iterations_completed", "max_iterations", "best_win_rate",
                              "target_win_rate", "download_available", "error", "best_hyperparams")}}
    with open(RUNS_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, default=str) + "\n")


def poll(c, labels) -> bool:
    state = load_state()
    done = True
    for label in labels:
        d = dump(c.autoscientist.get(state["runs"][label]["id"]))
        log(label, d)
        state["runs"][label]["last"] = d
        win = d.get("best_win_rate")
        print(f"{datetime.now():%H:%M:%S}  {label:<5} {d['status']:<10} iter {d['iterations_completed']:g}/{d['max_iterations']:g}  "
              f"best_win_rate={'—' if win is None else f'{win:.3f}'}  download={d['download_available']}"
              + (f"  error={d['error']}" if d.get("error") else ""))
        done &= d["status"] in TERMINAL
    save_state(state)
    return done


def cmd_status(c, args):
    state = load_state()
    labels = [args.label] if args.label else list(state["runs"])
    if not labels:
        sys.exit("No runs yet.")
    from adaption import APIConnectionError, APIStatusError
    while True:
        try:
            if poll(c, labels) or not args.watch:
                return
        except (APIConnectionError, APIStatusError) as e:  # a network blip must not end a long watch
            if not args.watch:
                raise
            print(f"{datetime.now():%H:%M:%S}  status check failed ({type(e).__name__}); retrying next round", flush=True)
        time.sleep(args.watch)


def cmd_download(c, args):
    state = load_state()
    run = state["runs"][args.label]
    CHECKPOINTS.mkdir(exist_ok=True)
    with c.autoscientist.with_streaming_response.download(run["id"]) as resp:
        cd = resp.headers.get("content-disposition", "")
        m = re.search(r'filename="?([^";]+)', cd)
        path = CHECKPOINTS / f"{args.label}-{m.group(1) if m else run['id'] + '.bin'}"
        resp.stream_to_file(path)
    run["checkpoint"] = str(path)
    save_state(state)
    print(f"saved {path} ({path.stat().st_size / 1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["models", "launch", "upload", "estimate", "run", "status", "download"])
    ap.add_argument("--label", help="run name, e.g. A, B, auto")
    ap.add_argument("--model", default=MODEL, help="'auto' lets AutoScientist choose")
    ap.add_argument("--domain-rows", type=int, default=0, help="our generator already supplies verified domain rows")
    ap.add_argument("--general-rows", type=int, help=f"default: {round(GENERAL_SHARE * 100)}%% of the total")
    ap.add_argument("--max-iterations", type=int)
    ap.add_argument("--target-win-rate", type=float)
    ap.add_argument("--watch", type=int, default=0, help="poll every N seconds until all runs finish")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if args.cmd in ("run", "download") and not args.label:
        sys.exit("--label is required")
    globals()[f"cmd_{args.cmd}"](client(), args)


if __name__ == "__main__":
    main()
