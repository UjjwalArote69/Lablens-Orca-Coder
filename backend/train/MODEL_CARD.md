---
license: apache-2.0
base_model: Qwen/Qwen3.5-4B
library_name: peft
language: [en, hi, mr]
tags: [medical, lab-reports, india, lora, adaption-autoscientist]
---

# LabLens Reader

A LoRA fine-tune of **Qwen/Qwen3.5-4B**, trained with **Adaption AutoScientist**. It reads lab reports the way
Indian patients actually get them and returns a verified analysis in English, Hindi or Marathi. It ends every
answer with a machine-checkable JSON block.

> Not a diagnosis. Not clinically validated. In the LabLens app the model's output is always cross-checked by the
> deterministic LabLens rules engine, and any disagreement is shown to the user.

<!-- Fill the bracketed values after the round: run_autoscientist.py status, eval_model.py score. -->

## 1. Problem

Indian lab reports are messy. The same test appears as Hb, HGB or Haemoglobin, and platelets as `1.5 lakh/cumm`,
`150000 /µL` or `150 x10^3/µL`. Layouts range from aligned tables and WhatsApp forwards to OCR dumps with Hindi
headers, and reports carry the lab's own printed ranges, barcodes and signatures. Patients can't read them, and
general models misread units and aliases, invent ranges, miss combinations of results and rarely answer in Hindi or
Marathi.

The LabLens rules engine (25 tests with sex-specific ranges and critical limits, plus 18 combination rules) is
accurate once it has clean numbers. In Round 1, a regex parser fed it. On our 300 held-out reports that parser read
every value correctly in only **10%** of reports, and it missed **46%** of urgent reports. On layouts it had never
seen it read nothing at all. Reading the report is the weak link, and LabLens Reader is trained to fix it.

## 2. Data

Every label is correct by construction: we sample a synthetic patient's true values, run the tested
`lablens.rules.analyze()` on them, and only then render the values as a messy report. Rendering never changes a
value, and every row is re-checked against the engine before it is written.

| | |
|---|---|
| Training rows | 3,000 (2,250 full analyses, 450 patient questions, 300 abstentions) |
| Languages | 1,835 English, 736 Hindi, 429 Marathi |
| Layouts | 10 training layouts (aligned table, flagged table, key-value, pipe table, CSV export, WhatsApp forward, OCR two-column, Hindi headers, inline, dot leaders) |
| Messiness | aliases, exact unit conversions, lab-printed ranges as distractors, OCR noise on 576 rows, sex given in the header, by honorific or only in the prompt |
| Coverage | each of the 18 combination rules in 301–430 rows; all 15 critical-limit tests (28–70 rows each); 347 fully normal reports |
| Abstentions | test not in the report (121), value unreadable (96), not a lab report (83): the answer says so and never invents a value |
| Patient questions | "Is my potassium dangerous?", "Kya mera sugar zyada hai?", medicine requests (always declined, never a dose), with urgent findings escalated |
| Held-out set | 300 reports from a different seed; a third use 2 layouts never used in training (PDF-extraction cell dump, doctor's OPD note). Never uploaded for training. |

Generator: `backend/train/make_dataset.py`. Full statistics: `backend/train/data/stats.json`.

## 3. Model setup

| | |
|---|---|
| Base model | Qwen/Qwen3.5-4B (instruction-tuned, multilingual, small enough to serve cheaply) |
| Method | supervised fine-tuning (instruction) with AutoScientist: LoRA on all linear layers, rank 16, alpha 32, dropout 0, 1 epoch per iteration, learning rate 1e-5 with cosine decay to 10% and 3% warmup, max grad norm 2.0, loss on the answer only (not the prompt). These are AutoScientist's derived starting values; it tunes them across up to 3 iterations, stopping early at a 0.7 win rate |
| Augmentation | 0 synthetic domain rows (our generator already supplies verified domain rows) and 1,615 general-diversity rows (35% of training) against catastrophic forgetting |
| Data format | chat; the prompt is the user turn, the verified answer the assistant turn; uploaded raw so no rewrite could alter a number |

## 4. Training process

- Two identical runs (A and B) launched at the start of the round (12:08 IST), so we can report a mean and a spread
  rather than one lucky number. Identical AutoScientist runs are known to vary by a few points.
- Launch fixes: AutoScientist rejected an explicit column mapping on a raw dataset, so it was left out and the mapping
  inferred. AutoScientist also allows one in-flight run per dataset, so run B trains on a second upload of the same
  `train.csv` (identical rows, identical settings).
- Every status poll was logged with a timestamp to `backend/train/runs.log`.
- Run A: 3 of 3 iterations, best win rate 0.494. Run B: 3 of 3 iterations, best win rate **0.586**. Both finished
  at 13:54 IST. Iteration 1 took about 50 minutes, including augmentation; later iterations took about 25 minutes each.
- AutoScientist moved well away from its starting values. Its best iteration in both runs used LoRA rank 32 and
  alpha 64 on all attention and MLP projections, learning rate 2e-4 with cosine decay, 5 epochs, 5% warmup and
  weight decay 0.01. Run B also used dropout 0.05 and a max grad norm of 2.0. Run B's final train loss was 0.25 and
  its eval loss 0.55.
- Identical settings gave 0.49 and 0.59, so the variance between runs is about 9 points. We therefore launched a
  third run, C (14:10 IST), on the same data with 5 iterations instead of 3, giving the search more attempts:
  5 of 5 iterations, best win rate **0.580** (iterations: 0.463, 0.489, 0.491, 0.580, then no further gain). Its best
  settings are identical to run B's (rank 32, lr 2e-4, 5 epochs, dropout 0.05, grad norm 2.0): two independent
  searches converged on the same recipe and the same score (0.586 and 0.580).
- Run D (15:20 IST) tested a hypothesis: that the 35% general-diversity rows were diluting the head-to-head win rate.
  We built a second dataset (`train/data_v2`, seed 8): 6,000 of our own verified rows with 25% fully normal reports
  (up from 15%, to curb over-flagging). The held-out set stayed byte-identical. D used no general rows and 3
  iterations, and scored a best of **0.465**: iteration 1 reached it and iterations 2–3 did not improve. The
  hypothesis was wrong. Without general data the model drifts further from the base model's general helpfulness,
  which the judge also rewards. We kept run B, the general-row recipe, as the published model.
- Loading the adapter: AutoScientist trains Qwen3.5's image-text class, so the adapter keys are
  `model.language_model.*`. Loading the text-only class attaches nothing, and the result silently runs the base
  model. `eval_model.py` loads the matching class and refuses to run if no LoRA module is attached.

## 5. Results

**AutoScientist head-to-head win rate against the base model: 0.586 (run B, the published adapter).** Run A, with
identical settings, scored 0.494. Run C, given 5 iterations, converged on the same settings as B and
scored 0.580. Run D, the no-general-rows ablation, scored 0.465.

| Run | Data | Iterations | Best win rate |
|---|---|---|---|
| A | 3,000 own rows + 1,615 general | 3 | 0.494 |
| **B** | 3,000 own rows + 1,615 general | 3 | **0.586** |
| C | 3,000 own rows + 1,615 general | 5 | 0.580 |
| D | 6,000 own rows, no general | 3 | 0.465 |

Our own evaluation ran on 99 of the 300 held-out reports (the first 99 ids; 33 on layouts never used in training).
Local inference on a 6 GB laptop GPU limited how many we could run. Every system saw the same reports with greedy
decoding, and the gold labels come from the rules engine. `base_with_format` is the base model with our output
format spelled out in the system prompt, a stronger baseline than the bare model. LabLens Reader gets no format
instructions.

| | Round 1 regex app | Qwen3.5-4B + format instructions | **LabLens Reader** |
|---|---|---|---|
| Reports read fully correctly | 7% | 3% | **55%** |
| Urgent reports missed | 43% | 51% | **4%** |
| Values read correctly (F1) | 70% | 83% | **99%** |
| Combination patterns (F1) | 66% | 39% | **89%** |
| Verdict correct | 58% | 44% | **86%** |
| Values read correctly on unseen layouts | 4% | 82% | **99.8%** |

Weak spot: 19% of non-urgent reports are called urgent (base model: 29%). That errs on the side of caution, and the
app's rules engine corrects it.

Full tables (`gold` is the rules engine itself, as a sanity check; `adapted` is LabLens Reader):


#### All held-out reports

| Metric | gold | regex_engine | base_with_format | adapted |
|---|---|---|---|---|
| Reports | 99 | 99 | 99 | 99 |
| JSON block valid | 100.0% | 78.8% | 87.9% | 98.0% |
| Values read correctly (F1, within 1%) | 100.0% | 70.1% | 82.8% | 99.4% |
| Abnormal status per test (accuracy) | 100.0% | 53.1% | 73.6% | 96.7% |
| Combination patterns (F1) | 100.0% | 65.8% | 38.6% | 88.8% |
| Verdict (accuracy) | 100.0% | 57.6% | 44.4% | 85.9% |
| Missed urgent (lower is better) | 0.0% | 42.6% | 51.1% | 4.3% |
| False urgent (lower is better) | 0.0% | 0.0% | 28.8% | 19.2% |
| Fully correct reports | 100.0% | 7.1% | 3.0% | 54.5% |
| Sex used for ranges | 100.0% | 64.6% | 85.9% | 98.0% |
| Answer in the requested language (hi/mr) | 100.0% | 79.5% | 97.4% | 100.0% |

#### Unseen layouts only

| Metric | gold | regex_engine | base_with_format | adapted |
|---|---|---|---|---|
| Reports | 33 | 33 | 33 | 33 |
| JSON block valid | 100.0% | 36.4% | 87.9% | 97.0% |
| Values read correctly (F1, within 1%) | 100.0% | 3.6% | 82.1% | 99.8% |
| Abnormal status per test (accuracy) | 100.0% | 1.9% | 71.2% | 97.1% |
| Combination patterns (F1) | 100.0% | 0.0% | 37.5% | 91.2% |
| Verdict (accuracy) | 100.0% | 6.1% | 45.5% | 78.8% |
| Missed urgent (lower is better) | 0.0% | 100.0% | 41.7% | 8.3% |
| False urgent (lower is better) | 0.0% | 0.0% | 28.6% | 23.8% |
| Fully correct reports | 100.0% | 0.0% | 6.1% | 45.5% |
| Sex used for ranges | 100.0% | 24.2% | 87.9% | 97.0% |
| Answer in the requested language (hi/mr) | 100.0% | 42.9% | 100.0% | 100.0% |

#### Reports with OCR noise

| Metric | gold | regex_engine | base_with_format | adapted |
|---|---|---|---|---|
| Reports | 19 | 19 | 19 | 19 |
| JSON block valid | 100.0% | 89.5% | 94.7% | 100.0% |
| Values read correctly (F1, within 1%) | 100.0% | 70.8% | 79.5% | 100.0% |
| Abnormal status per test (accuracy) | 100.0% | 54.0% | 74.3% | 97.7% |
| Combination patterns (F1) | 100.0% | 72.5% | 55.4% | 82.8% |
| Verdict (accuracy) | 100.0% | 68.4% | 57.9% | 94.7% |
| Missed urgent (lower is better) | 0.0% | 33.3% | 50.0% | 0.0% |
| False urgent (lower is better) | 0.0% | 0.0% | 0.0% | 14.3% |
| Fully correct reports | 100.0% | 0.0% | 0.0% | 52.6% |
| Sex used for ranges | 100.0% | 78.9% | 89.5% | 100.0% |
| Answer in the requested language (hi/mr) | 100.0% | 87.5% | 100.0% | 100.0% |


## 6. Safety and limits

- The training data is synthetic. Values, layouts and patients are generated, not real patient records.
- The model has not been clinically validated. Its reference ranges are typical adult values, and labs differ.
- The rules engine stays the source of truth: the app recomputes every flag from the extracted values and shows
  any disagreement.
- It never prescribes medicines or doses. Urgent findings are escalated with "see a doctor today; call 108 or 112".
- The Hindi and Marathi section headings and fixed sentences come from templates, not yet reviewed by a native speaker. The explanations come from the LabLens library built with Adaption Adaptive Data.
