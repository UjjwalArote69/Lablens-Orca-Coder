# LabLens: a medical report analyzer

Upload a lab report and LabLens tells you, in plain language, which results are outside the reference range,
which ones are at critical levels, and which **combinations** of results need a doctor's attention.

Built for **ORCATHON 2026, Track 02: Healthcare & MedTech**.

## What it does

- **Reads real Indian lab reports**: PDF, text or pasted results. It understands lab spellings and units
  such as Haemoglobin, SGPT, TLC, "2.6 lakhs/cumm" and "1,62,000 /cumm".
- **Flags every value** against sex-specific adult reference ranges and critical limits across 25 tests:
  blood count, sugar, kidney and electrolytes, liver, lipids, thyroid, vitamins and inflammation.
- **Detects concerning combinations** with 18 written rules, for example:
  - iron-deficiency anemia (low Hb + low MCV + low ferritin)
  - kidney decline with high potassium
  - metabolic syndrome
  - liver enzymes rising with bilirubin
  - thyroid patterns
  - pancytopenia
- **Ranks by urgency**: "See a doctor today", "Discuss with your doctor", "Keep an eye on".
- **Explains each flag** in English, Hindi or Marathi, using an explanation library built and grounded with **Adaption**.
- **Answers questions** about the report through Adaption's inference gateway, grounded in that library.
- **Exports a summary** to take to the doctor.

Safety by design: an AI model never decides what is abnormal. Every flag traces back to a number in
`lablens/ranges.py` or a rule in `lablens/rules.py`.

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

The pipeline lives in `adaption_build.py`.

## Run locally

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

The app works with no keys at all; it uses the seed explanations.

## Build the explanation library with Adaption

```bash
export ADAPTION_API_KEY=pt_live_...
python adaption_build.py estimate   # price it first
python adaption_build.py run        # grounding + safety + blueprint + Hindi/Marathi
python adaption_build.py status
python adaption_build.py fetch      # saves data/adapted/*.jsonl and data/adaption_eval.json
```

Commit the files in `data/`, and the deployed app picks them up automatically.

## Deploy (Streamlit Community Cloud)

1. Push this folder to a public GitHub repo.
2. Go to share.streamlit.io, choose New app, pick the repo, and set the main file to `streamlit_app.py`.
3. Under Settings → Secrets, add any of the following:
   - `ADAPTION_API_KEY`
   - `ADAPTION_MODEL`
   - `LANGFUSE_PUBLIC_KEY`
   - `LANGFUSE_SECRET_KEY`
   - `LANGFUSE_HOST`

## Tech and AI tools

- Python
- Streamlit
- pandas
- pypdf
- Adaption (Adaptive Data, localization, evaluation, inference gateway)
- Langfuse (tracing of AI calls)
- Claude, used as a coding assistant

## Disclaimer

LabLens is not a diagnostic tool. Reference ranges are typical adult values and differ between labs.
