# LabLens: a medical report analyzer

Upload a lab report and LabLens tells you, in plain language, which results are outside the reference range,
which ones are at critical levels, and which **combinations** of results need a doctor's attention.

Built for **ORCATHON 2026, Track 02: Healthcare & MedTech**.

- **Live app:** https://lablens-orca-coder.vercel.app
- **API:** https://lablens-api-9jjf.onrender.com/api/health (free tier: the first request after a quiet spell can take up to a minute)

## What it does

- **Reads real Indian lab reports**: PDF, text, pasted results, **photos and scanned PDFs**. It understands lab
  spellings and units such as Haemoglobin, SGPT, TLC, "2.6 lakhs/cumm" and "1,62,000 /cumm". Photos and scans are
  read in the browser with OCR, so the image never leaves the device; only the extracted text is analysed.
- **Flags every value** against sex-specific adult reference ranges and critical limits across 25 tests:
  blood count, sugar, kidney and electrolytes, liver, lipids, thyroid, vitamins and inflammation.
- **Detects concerning combinations** with 18 written rules, for example:
  - iron-deficiency anemia (low Hb + low MCV + low ferritin)
  - kidney decline with high potassium
  - metabolic syndrome
  - liver enzymes rising with bilirubin
  - thyroid patterns
  - pancytopenia
- **Ranks by urgency**: "See a doctor today", "Discuss with your doctor", "Keep an eye on". Urgent results also
  show when to call 108 or 112 instead of waiting.
- **Shows the whole report at a glance**: a range map plots every result against its own reference band, so it is
  clear what is off and by how much.
- **Explains each flag** in English, Hindi or Marathi, from an explanation library built and grounded with **Adaption**.
- **Exports a one-page PDF summary** to take to the doctor.
- **Answers questions** about the report through Adaption's inference gateway, grounded in that library
  (switched on when `ADAPTION_MODEL` is set).

Safety by design: an AI model never decides what is abnormal. Every flag traces back to a number in
`backend/lablens/ranges.py` or a rule in `backend/lablens/rules.py`.

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

**Results of the run used in the app:** quality score **6.0 → 8.3** (grade **C → B**, **+38%**), 177 adapted
explanations across English, Hindi and Marathi. The How it works page shows one explanation before and after
Adaption side by side. The pipeline lives in `backend/adaption_build.py`.

## Architecture

```
Browser (Next.js on Vercel)                     API (FastAPI on Render)
  add a report: sample / PDF / text / photo  ──▶  /api/analyze, /api/analyze/file
  photos + scans: OCR in the browser               lablens/parser.py   read values
  (Tesseract.js); scans rendered by          ◀──   lablens/rules.py    ranges + 18 combination rules
  /api/pdf/pages                                   lablens/knowledge.py  Adaption-adapted explanations
  results, range map, languages                    /api/summary.pdf    one-page PDF (fpdf2)
                                                   /api/ask            Adaption inference gateway
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

## Build the explanation library with Adaption

```bash
cd backend                          # reads ADAPTION_API_KEY from backend/.env
python adaption_build.py estimate   # price it first
python adaption_build.py run        # grounding + safety + blueprint + Hindi/Marathi
python adaption_build.py status
python adaption_build.py fetch      # saves data/adapted/ and data/adaption_eval.json
```

Commit the files in `backend/data/`, and the deployed app picks them up automatically.

## Deploy

- **Backend on Render:** root directory `backend`, build `pip install -r requirements.txt`, start
  `uvicorn main:app --host 0.0.0.0 --port $PORT`, variables from `backend/.env.example`.
- **Frontend on Vercel:** root directory `frontend`, variable `NEXT_PUBLIC_API_URL` set to the Render URL.

## Tech and AI tools

- Python, FastAPI, pandas, pypdf, pypdfium2, fpdf2
- Next.js, React, TypeScript, Tailwind CSS
- Tesseract.js (in-browser OCR for photos and scans)
- Adaption (Adaptive Data, localization, evaluation, inference gateway)
- Langfuse (tracing of AI calls)
- Render and Vercel (hosting)
- Claude, used as a coding assistant

## Disclaimer

LabLens is not a diagnostic tool. Reference ranges are typical adult values and differ between labs.
