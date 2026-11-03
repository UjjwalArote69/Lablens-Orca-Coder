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
  [result].
- Loading the adapter: AutoScientist trains Qwen3.5's image-text class, so the adapter keys are
  `model.language_model.*`. Loading the text-only class attaches nothing, and the result silently runs the base
  model. `eval_model.py` loads the matching class and refuses to run if no LoRA module is attached.

## 5. Results

**AutoScientist head-to-head win rate against the base model: [mean] (runs: [A], [B]).**

Our own evaluation on the 300 held-out reports uses the same prompts and greedy decoding for every system, with gold
labels from the rules engine:

[paste backend/train/eval_results.md]

## 6. Safety and limits

- The training data is synthetic. Values, layouts and patients are generated, not real patient records.
- The model has not been clinically validated. Its reference ranges are typical adult values, and labs differ.
- The rules engine stays the source of truth: the app recomputes every flag from the extracted values and shows
  any disagreement.
- It never prescribes medicines or doses. Urgent findings are escalated with "see a doctor today; call 108 or 112".
- The Hindi and Marathi section headings and fixed sentences come from templates, [reviewed by a native speaker / not
  yet reviewed by a native speaker]. The explanations come from the LabLens library built with Adaption Adaptive Data.
