<div align="center">

<img src="frontend/app/icon.svg" width="72" alt="LabLens logo" />

# LabLens

**Understand your lab report in a minute.**

LabLens reads a medical lab report, flags every result outside its reference range, and points out the
combinations of results that need a doctor's attention, explained in plain English, Hindi or Marathi.

**New in Round 2:** LabLens Reader, our own model. It is Qwen3.5-4B fine-tuned with Adaption AutoScientist to read
messy Indian lab reports, and on 99 held-out reports it went from 3% to 55% read fully correctly.

[**Open the live app**](https://lablens-orca-coder.vercel.app) &nbsp;|&nbsp;
[**Our model**](https://lablens-orca-coder.vercel.app/model) &nbsp;|&nbsp;
[Watch the Round 1 demo](docs/lablens-demo.mp4) &nbsp;|&nbsp;
[How it works](https://lablens-orca-coder.vercel.app/how-it-works) &nbsp;|&nbsp;
[API health](https://lablens-api-9jjf.onrender.com/api/health)

[![ORCATHON 2026](https://img.shields.io/badge/ORCATHON_2026-Track_02%3A_Healthcare_%26_MedTech-2557d6)](https://lablens-orca-coder.vercel.app)
[![Model fine-tuned with Adaption AutoScientist](https://img.shields.io/badge/model-fine--tuned_with_AutoScientist-2557d6)](#new-in-round-2-lablens-reader-our-own-model)
[![Explanations built with Adaption](https://img.shields.io/badge/explanations-built_with_Adaption-1e7f5c)](#how-adaption-is-used)
[![Next.js](https://img.shields.io/badge/Next.js-16-13203a?logo=nextdotjs)](frontend)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.12-13203a?logo=fastapi)](backend)

</div>

<br />

<a href="docs/lablens-demo.mp4"><img src="docs/demo-cover.jpg" alt="LabLens demo video, 1 minute 54 seconds" width="100%" /></a>

| 25 | 18 | 3 | 177 | 6.0 → 8.3 |
|:---:|:---:|:---:|:---:|:---:|
| lab tests with sex-specific ranges | rules for risky combinations | languages: English, Hindi, Marathi | explanations adapted by Adaption | explanation quality before and after Adaption |

## New in Round 2: LabLens Reader, our own model

The LabLens rules are exact, but only once the values have been read correctly, and Indian lab reports are messy.
The same test appears as Hb, HGB or Haemoglobin, and platelets as `1.5 lakh/cumm` or `150 x10^3/µL`. Reports arrive
as OCR dumps, WhatsApp forwards and doctor's notes, some with Hindi headers. In Round 1 a regex parser did the
reading. In Round 2 we fine-tuned **Qwen3.5-4B** with **Adaption AutoScientist** to read the report and write the
full analysis in English, Hindi or Marathi. Every answer ends with a JSON block that the rules engine checks.

[**Compare it with the base model, live**](https://lablens-orca-coder.vercel.app/model) &nbsp;|&nbsp;
[Model card](backend/train/MODEL_CARD.md) &nbsp;|&nbsp; [Full evaluation](backend/train/eval_results.md)

| 3% → 55% | 51% → 4% | 83% → 99% | 0.586 |
|:---:|:---:|:---:|:---:|
| held-out reports read fully correctly | urgent reports missed | values read correctly (F1) | AutoScientist win rate against the base model, best of 4 runs |

### How it was trained

- **Every label is correct by construction.** [`make_dataset.py`](backend/train/make_dataset.py) samples a
  synthetic patient and runs the tested `lablens.rules.analyze()` on them. Only then does it render the values as a
  messy report, across 10 layouts with aliases, exact unit conversions, lab-printed ranges as distractors and OCR
  noise. Every row is re-checked against the engine before it is written.
- **3,000 training rows:**
  - by kind: 2,250 full analyses, 450 patient questions, and 300 answers that decline to guess (the test is
    missing, the value is unreadable, or the text is not a lab report)
  - by language: 1,835 English, 736 Hindi and 429 Marathi
  - plus 1,615 general rows that AutoScientist added so the model would not forget its general skills
- **300 held-out reports** come from a different seed, and a third of them use two layouts never seen in training.
  They were never uploaded for training.

| Run | Training data | Iterations | Best win rate |
|---|---|---|---|
| A | 3,000 own rows + 1,615 general | 3 | 0.494 |
| **B** (published) | 3,000 own rows + 1,615 general | 3 | **0.586** |
| C | 3,000 own rows + 1,615 general | 5 | 0.580 |
| D | 6,000 own rows, no general rows | 3 | 0.465 |

AutoScientist's best recipe was LoRA rank 32 on every attention and MLP projection, a learning rate of 2e-4 with
cosine decay, and 5 epochs. Runs B and C found exactly this recipe independently. Run D dropped the general rows,
doubled our own data and added more normal reports. Its score fell to 0.465, so the published model keeps the
general data.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/win-rates.png" alt="AutoScientist win rate: base 41, adapted 59" /></td>
    <td width="50%"><img src="docs/screenshots/train-eval-loss.png" alt="Training and validation loss from AutoScientist" /></td>
  </tr>
  <tr>
    <td><b>Head-to-head win rate (run B).</b> AutoScientist's judge preferred LabLens Reader in 59% of comparisons.</td>
    <td><b>Training loss</b>, from the AutoScientist dashboard.</td>
  </tr>
</table>

### Results on 99 held-out reports

Every system saw the same reports and the same prompt, with greedy decoding. The gold labels come from the rules
engine. The base model got our output format spelled out in its prompt; LabLens Reader did not need it.

| | Round 1 regex parser | Qwen3.5-4B + format instructions | **LabLens Reader** |
|---|---|---|---|
| Reports read fully correctly | 7% | 3% | **55%** |
| Urgent reports missed | 43% | 51% | **4%** |
| Values read correctly (F1) | 70% | 83% | **99%** |
| Combination patterns found (F1) | 66% | 39% | **89%** |
| Verdict correct | 58% | 44% | **86%** |
| Values read correctly on unseen layouts | 4% | 82% | **99.8%** |
| Non-urgent reports called urgent | 0% | 29% | 19% |

### Limits

- The training data is synthetic, and the model is not clinically validated.
- It over-flags: 19% of non-urgent reports are called urgent. That is the cautious direction, but it is still an
  error.
- Free text outside the JSON block is not checked. The emergency line often says "108 or 108" instead of
  "108 or 112", and Hindi and Marathi explanations can contain factual slips.
- Adaption does not host trained adapters, so the [`/model`](https://lablens-orca-coder.vercel.app/model) page shows
  recorded outputs from local 4-bit inference on a 6 GB laptop GPU. The live app still reads reports with the
  Round 1 parser, and the rules engine stays the source of truth.

## The problem

> Develop an intelligent medical report analyzer that detects abnormal health indicators and identifies potentially
> concerning combinations of results.

A lab report is a page of numbers. Patients see a value marked "H" and either panic or ignore it, and a single
result rarely tells the whole story: low haemoglobin with low MCV and low ferritin means something different from
low haemoglobin alone. LabLens answers each part of the brief:

| The brief asks to | LabLens |
|---|---|
| Analyse sample medical reports | Reads PDFs, text, pasted results, phone photos and scanned PDFs, written the way Indian labs write them |
| Flag values outside predefined reference ranges | Checks 25 tests against sex-specific adult ranges and critical limits, and shows each value on its own range bar |
| Highlight combinations that may need medical review | 18 written rules find patterns such as kidney decline with high potassium, ranked from "See a doctor today" down to "Keep an eye on" |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/add-report.jpg" alt="Add your report: try a sample, upload a file or paste text" /></td>
    <td width="50%"><img src="docs/screenshots/urgent-result.jpg" alt="An urgent result with the verdict, the range map and when to call 108 or 112" /></td>
  </tr>
  <tr>
    <td><b>Add a report.</b> Try a sample, upload a PDF, photo or scan, or paste the results.</td>
    <td><b>See the verdict first.</b> A range map shows every result against its own reference band.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/marathi.jpg" alt="Patterns explained in Marathi" /></td>
    <td><img src="docs/screenshots/adaption-quality.jpg" alt="What Adaption does and the explanation quality before and after" /></td>
  </tr>
  <tr>
    <td><b>Read it in your language.</b> Every explanation is available in English, Hindi and Marathi.</td>
    <td><b>Built with Adaption.</b> Grounded, safety-checked explanations, scored before and after.</td>
  </tr>
</table>

## What it does

- **Reads real Indian lab reports.** It understands lab spellings and units such as Haemoglobin, SGPT, TLC,
  "2.6 lakhs/cumm" and "1,62,000 /cumm". Photos and scans are read in the browser with OCR, so the image never
  leaves the device; only the extracted text is analysed.
- **Flags every value** against sex-specific adult reference ranges and critical limits across blood count, sugar,
  kidney and electrolytes, liver, lipids, thyroid, vitamins and inflammation.
- **Finds concerning combinations** such as iron-deficiency anemia, kidney decline with high potassium, metabolic
  syndrome, liver enzymes rising together, thyroid patterns and pancytopenia.
- **Ranks by urgency** and tells patients with urgent results when to call 108 or 112 instead of waiting.
- **Explains each flag** in plain words, in English, Hindi or Marathi.
- **Exports a one-page PDF** with the verdict, the patterns and every result, to take to the doctor.
- **Answers questions** about the report through Adaption's inference gateway (switched on when `ADAPTION_MODEL`
  is set).

### What the four sample reports show

| Sample | Verdict | What LabLens finds |
|---|---|---|
| Suresh, 61 (emergency) | See a doctor today | Reduced kidney clearance with high potassium, potassium at a critical level, kidney markers raised together, anemia with reduced kidney function, signs of infection |
| Rajesh, 52 (routine check-up) | Discuss with your doctor | Liver enzymes raised together, blood sugar in the diabetes range, metabolic syndrome, cholesterol pattern linked to heart risk |
| Anita, 34 (tired all the time) | Discuss with your doctor | Iron-deficiency anemia, underactive thyroid |
| Priya, 29 (annual wellness) | Everything in range | Nothing to flag |

### Safety by design

- **AI never decides what is abnormal.** Every flag traces back to a number in
  [`ranges.py`](backend/lablens/ranges.py) or a rule in [`rules.py`](backend/lablens/rules.py).
- **Explanations are prepared ahead of time,** then grounded and safety-checked by Adaption, rather than generated
  live for each patient.
- **No diagnoses and no medicine doses.** Every explanation ends with a referral to a doctor.
- **Photos stay on the device.** OCR runs in the browser.

## How Adaption is used

| Adaption feature | How LabLens uses it |
|---|---|
| Adaptive Data `adapt` | Improves the 60-row patient explanation library |
| `hallucination_mitigation` | Web-search grounding, so patients never see invented medical claims |
| `blueprint` | Patient-safety style: plain words, no diagnosis, no doses, always refer to a doctor |
| `safety_categories` | Safety analysis on every generated explanation |
| `language_expansion` (localize, IN) | Hindi and Marathi versions of every explanation |
| Evaluation | Quality score before and after, shown in the app |
| Inference gateway `responses.create` + `file_search` | "Ask about this report", grounded in the adapted dataset |

**Result:** explanation quality rose from **6.0 to 8.3** (grade **C → B**, **+38%**), across 177 adapted
explanations in English, Hindi and Marathi. The pipeline is [`backend/adaption_build.py`](backend/adaption_build.py).

**One explanation before and after Adaption**, for the pattern "Reduced kidney clearance with high potassium":

<table>
  <tr>
    <th width="50%">Our draft</th>
    <th width="50%">After Adaption: grounded, safety-checked, patient-friendly</th>
  </tr>
  <tr>
    <td valign="top">High creatinine suggests the kidneys are filtering less well, and high potassium can build up when
    they do. High potassium can affect heart rhythm, so this combination should be checked by a doctor the same
    day. This is not a diagnosis; please discuss it with your doctor.</td>
    <td valign="top">Reduced kidney clearance means your kidneys are filtering waste slower than usual. When this
    happens, potassium—a mineral that helps your muscles and heart work—can build up in your blood. Common causes
    include dehydration, certain medicines, or long-term health issues like diabetes. Usually, your doctor will
    review your history and may repeat the test to confirm. They might suggest simple diet changes or a review of
    your medicines. Do not start or stop any pills on your own. High potassium can sometimes affect heart rhythm, so
    please see a doctor soon if you feel very weak, have chest pain, or notice an irregular heartbeat. Stay
    calm—this is often manageable. Please discuss these results with your doctor for advice tailored to you.</td>
  </tr>
</table>

## Architecture

```mermaid
flowchart LR
    report["Lab report<br/>sample, PDF, text, photo or scan"]

    subgraph web["Next.js on Vercel"]
        ocr["Tesseract.js OCR<br/>photos and scans, on the device"]
        ui["Verdict, range map, patterns,<br/>every result, PDF download"]
    end

    subgraph api["FastAPI on Render"]
        parser["parser.py<br/>reads values and units"]
        rules["ranges.py + rules.py<br/>25 tests, 18 combination rules"]
        knowledge["knowledge.py<br/>explanations in en, hi, mr"]
        pdf["summary.pdf<br/>one-page PDF with fpdf2"]
        parser --> rules --> knowledge
    end

    report --> web
    web -- "/api/analyze" --> api
    adaption[("Adaption<br/>Adaptive Data and inference gateway")]
    adaption -. "177 adapted explanations" .-> knowledge
    api -- "/api/ask with file_search" --> adaption
```

```
backend/
  main.py              FastAPI app: analyze, file upload, scanned pages, PDF summary, ask
  pdf_summary.py       one-page PDF for the doctor
  adaption_build.py    Adaption pipeline: seed, estimate, run, status, fetch
  lablens/             the analysis engine: parser, ranges, rules, knowledge, ai
  data/                seed explanations, Adaption output and quality scores
  samples/             four demo reports
  test_lablens.py      engine tests
  train/               Round 2: LabLens Reader
    make_dataset.py      synthetic messy reports, every label from the rules engine
    run_autoscientist.py Adaption AutoScientist: upload, runs, status, download
    eval_model.py        held-out evaluation, scored against the rules engine
    export_demo.py       recorded outputs for the /model page
    MODEL_CARD.md        data, training, results and limits
    data/  preds/        training data, held-out set and every system's outputs
frontend/
  app/                 the report page, How it works, and /model (base model vs LabLens Reader)
  components/          results, range map, range bars, ask, Adaption stats, model comparison
  lib/                 typed API client, OCR, formatting, recorded model outputs
streamlit_app.py       the original Streamlit version, kept as a fallback
```

## Run locally

Backend (Python 3.12):

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env            # optional: Adaption and Langfuse keys
python test_lablens.py          # All 7 tests passed.
uvicorn main:app --reload --port 8000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev                     # http://localhost:3000, talks to http://localhost:8000
```

The app works with no keys at all. The original Streamlit version still runs from the repo root:
`pip install -r requirements.txt && streamlit run streamlit_app.py`.

<details>
<summary><b>Rebuild the explanation library with Adaption</b></summary>

```bash
cd backend                          # reads ADAPTION_API_KEY from backend/.env
python adaption_build.py estimate   # price it first
python adaption_build.py run        # grounding + safety + blueprint + Hindi/Marathi
python adaption_build.py status
python adaption_build.py fetch      # saves data/adapted/ and data/adaption_eval.json
```

Commit the files in `backend/data/`, and the deployed app picks them up automatically.

</details>

<details>
<summary><b>Train and evaluate LabLens Reader</b></summary>

```bash
cd backend                                         # reads ADAPTION_API_KEY from backend/.env
python train/make_dataset.py                       # 3,000 rows + 300 held-out, all checked against analyze()
python train/run_autoscientist.py launch           # upload train.csv, start run A (one run per dataset)
python train/run_autoscientist.py status --watch 300
python train/run_autoscientist.py download --label B
```

The download is a zstd-compressed tar, so extract it to `train/checkpoints/B` first. Then evaluate on a CUDA GPU
(6 GB is enough in 4-bit) with `torch`, `transformers`, `peft`, `bitsandbytes` and `accelerate` installed:

```bash
python train/eval_model.py predict --backend hf --model Qwen/Qwen3.5-4B --load-4bit \
    --adapter train/checkpoints/B --name adapted --limit 99
python train/eval_model.py predict --backend hf --model Qwen/Qwen3.5-4B --load-4bit \
    --format-hint --name base_with_format --limit 99
python train/eval_model.py predict --backend rules --name regex_engine
python train/eval_model.py predict --backend gold --name gold
python train/eval_model.py score gold regex_engine base_with_format adapted   # writes eval_results.md
python train/export_demo.py --left base_with_format --right adapted          # data for the /model page
```

</details>

<details>
<summary><b>Deploy</b></summary>

- **Backend on Render:** root directory `backend`, build `pip install -r requirements.txt`, start
  `uvicorn main:app --host 0.0.0.0 --port $PORT`, variables from `backend/.env.example`.
- **Frontend on Vercel:** root directory `frontend`, variable `NEXT_PUBLIC_API_URL` set to the Render URL.

Render's free tier sleeps, so the first request after a quiet spell can take up to a minute.

</details>

## Tech and AI tools

- Python, FastAPI, pandas, pypdf, pypdfium2, fpdf2
- Next.js, React, TypeScript, Tailwind CSS
- Tesseract.js (in-browser OCR for photos and scans)
- Adaption (Adaptive Data, localization, evaluation, inference gateway)
- Adaption AutoScientist (LoRA fine-tuning of Qwen3.5-4B into LabLens Reader)
- Hugging Face Transformers, PEFT and bitsandbytes (local 4-bit evaluation)
- Langfuse (tracing of AI calls)
- Render and Vercel (hosting)
- Claude, used as a coding assistant

## Disclaimer

LabLens is not a diagnostic tool. Reference ranges are typical adult values and differ between labs, so compare with
the range printed on your report. If you feel unwell, contact a doctor whatever these results say.
