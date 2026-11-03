# LabLens Reader: held-out evaluation

99 held-out reports from a separate seed (33 on two layouts never seen in training), the same reports for every system. Every system gets the same prompts with greedy decoding. Gold labels come from the LabLens rules engine.

### All held-out reports

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

### Unseen layouts only

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

### Reports with OCR noise

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
