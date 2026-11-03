"""Generate the LabLens Reader training set.

Synthetic patients are labelled by the tested `lablens` engine (labels by construction), then
rendered as messy Indian lab reports: many layouts, aliases, unit variants, printed lab ranges,
distractors and OCR noise. The messiness only ever touches the prompt; the label is always
`analyze()` on the true values.

    python train/make_dataset.py            # ~3,000 training rows + 300 held-out reports
    python train/make_dataset.py --tiny     # quick smoke test

Writes train/data/: train.csv (prompt, completion), train.jsonl (with metadata),
heldout.jsonl (never upload), showcase.jsonl (the 4 app samples) and stats.json.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (ARROW, BACKEND, COMBO_IDS, DATA, TEST_ORDER, T, analysis,  # noqa: E402
                    completion, evidence_text, explanation_id, gold, library, parse_block, range_text, sentences)
from lablens.parser import parse_report  # noqa: E402
from lablens.ranges import PANELS, TESTS, bound  # noqa: E402

# ---------------------------------------------------------------------------
# 1. Values
# ---------------------------------------------------------------------------
# (lowest, highest plausible value, decimals labs print). NORMAL_* close the normal band for
# tests whose reference range is open on one side.
SPAN = dict(hb=(4.0, 21.5, 1), wbc=(0.8, 38.0, 1), plt=(12, 1150, 0), mcv=(58.0, 122.0, 1),
            fbs=(40, 480, 0), hba1c=(3.8, 14.8, 1), creat=(0.3, 8.5, 2), urea=(8, 240, 0), bun=(4, 115, 0),
            na=(114, 166, 0), k=(2.1, 7.4, 1), alt=(6, 1400, 0), ast=(8, 1400, 0), bili=(0.1, 18.0, 1),
            chol=(110, 340, 0), ldl=(45, 250, 0), hdl=(22, 95, 0), tg=(45, 1150, 0), tsh=(0.01, 48.0, 2),
            ft4=(0.25, 4.2, 2), ferritin=(2.0, 1400.0, 1), b12=(90, 1900, 0), vitd=(4.0, 175.0, 1),
            crp=(0.2, 140.0, 1), uric=(1.6, 12.8, 1))
NORMAL_FLOOR = dict(alt=8, ast=10, bili=0.3, chol=130, ldl=60, tg=60, crp=0.3)
NORMAL_CEIL = dict(hdl=85)
CRITICAL_KEYS = [k for k, t in TESTS.items() if t["crit_low"] is not None or t["crit_high"] is not None]
assert set(SPAN) == set(TESTS)


def bounds(key, sex):
    t = TESTS[key]
    return bound(t["low"], sex), bound(t["high"], sex)


def interval(key, spec, sex):
    """Allowed raw values for a spec: normal | low | high | crit_low | crit_high | (a, b)."""
    if isinstance(spec, tuple):
        return spec
    lo_s, hi_s, d = SPAN[key]
    eps = 10 ** -d
    lo, hi = bounds(key, sex)
    t = TESTS[key]
    return {
        "normal": (lo if lo is not None else NORMAL_FLOOR.get(key, lo_s), hi if hi is not None else NORMAL_CEIL.get(key, hi_s)),
        "low": None if lo is None else (lo_s, lo - eps),
        "high": None if hi is None else (hi + eps, hi_s),
        "crit_low": None if t["crit_low"] is None else (lo_s, t["crit_low"] - eps),
        "crit_high": None if t["crit_high"] is None else (t["crit_high"] + eps, hi_s),
    }[spec]


def sample_value(rng, key, spec, sex, crit_p=0.08):
    """Mild abnormal values cluster near the bound; a few are critical where a critical limit exists."""
    d = SPAN[key][2]
    t = TESTS[key]
    if spec in ("low", "high"):
        crit = t["crit_low"] if spec == "low" else t["crit_high"]
        if crit is not None and rng.random() < crit_p:
            spec = "crit_" + spec
        else:
            a, b = interval(key, spec, sex)
            if spec == "low":
                a = max(a, crit) if crit is not None else a
                return round(b - (b - a) * rng.random() ** 1.7, d)
            b = min(b, crit) if crit is not None else b
            return round(a + (b - a) * rng.random() ** 1.7, d)
    a, b = interval(key, spec, sex)
    return round(rng.uniform(a, b), d)


def background_spec(rng, key, sex):
    lo, hi = bounds(key, sex)
    dirs = [s for s, ok in (("low", lo is not None), ("high", hi is not None)) if ok]
    return "normal" if rng.random() < 0.88 else rng.choice(dirs)


# ---------------------------------------------------------------------------
# 2. Panels and combination recipes
# ---------------------------------------------------------------------------
PANEL_SETS = {  # name: (weight, always included, sometimes included {key: probability})
    "cbc": (1.0, ["hb", "wbc", "plt", "mcv"], {"ferritin": .25, "b12": .2, "crp": .2}),
    "anemia": (0.7, ["hb", "wbc", "plt", "mcv", "ferritin"], {"b12": .6, "vitd": .5}),
    "fever": (0.7, ["hb", "wbc", "plt", "crp"], {"mcv": .7, "alt": .4, "ast": .4, "na": .3, "k": .3, "creat": .3}),
    "kft": (0.9, ["creat", "na", "k"], {"urea": .85, "bun": .45, "uric": .5}),
    "kft_cbc": (0.6, ["hb", "wbc", "plt", "mcv", "creat", "urea", "na", "k"], {"bun": .4, "uric": .4}),
    "diabetes": (0.7, ["fbs", "hba1c"], {"creat": .5, "chol": .4, "ldl": .4, "hdl": .4, "tg": .4}),
    "lft_lipid_sugar": (1.0, ["alt", "ast", "bili", "chol", "ldl", "hdl", "tg", "fbs"], {"hba1c": .7}),
    "thyroid": (0.7, ["tsh", "ft4"], {"hb": .3, "vitd": .3, "b12": .3}),
    "full": (1.6, [], {k: .9 for k in TESTS}),
}


def one_of(rng, *options):
    return dict(rng.choice(options))


RECIPES = {  # combo id -> constraints that make the rule fire (randomised variants)
    "pancytopenia": lambda r: {"hb": "low", "wbc": "low", "plt": "low"},
    "kidney_potassium": lambda r: {"creat": "high", "k": "high", **one_of(r, {}, {"urea": "high"})},
    "kidney": lambda r: {"creat": "high", **one_of(r, {"urea": "high"}, {"bun": "high"}, {"urea": "high", "bun": "high"})},
    "liver_jaundice": lambda r: {"bili": "high", **one_of(r, {"alt": "high"}, {"ast": "high"}, {"alt": "high", "ast": "high"})},
    "liver_enzymes": lambda r: {"alt": "high", "ast": "high", "bili": "normal"},
    "iron_def": lambda r: {"hb": "low", "mcv": "low", **one_of(r, {"ferritin": "low"}, {"ferritin": "low"}, {}, {"ferritin": "normal"})},
    "b12_anemia": lambda r: {"hb": "low", "mcv": "high", **one_of(r, {"b12": "low"}, {"b12": "low"}, {}, {"b12": "normal"})},
    "renal_anemia": lambda r: {"hb": "low", "creat": "high"},
    "diabetes": lambda r: {"fbs": (126, 380), "hba1c": (6.5, 12.5)},
    "prediabetes": lambda r: one_of(r, {"fbs": (100, 125)}, {"hba1c": (5.7, 6.4)},
                                    {"fbs": (100, 125), "hba1c": (5.7, 6.4)}, {"fbs": (126, 220), "hba1c": (4.5, 6.4)}),
    "metabolic": lambda r: {"tg": "high", "hdl": "low", **one_of(r, {"fbs": "high"}, {"hba1c": "high"}, {"fbs": "high", "hba1c": "high"})},
    "atherogenic": lambda r: {"ldl": "high", **one_of(r, {"hdl": "low"}, {"tg": "high"}, {"hdl": "low", "tg": "high"})},
    "hypothyroid": lambda r: {"tsh": "high", "ft4": "low"},
    "subclinical_hypo": lambda r: {"tsh": "high", "ft4": "normal"},
    "hyperthyroid": lambda r: {"tsh": "low", "ft4": "high"},
    "infection": lambda r: {"wbc": "high", "crp": "high"},
    "dehydration": lambda r: {"na": "high", "creat": "normal", **one_of(r, {"urea": "high"}, {"bun": "high"})},
    "gout_kidney": lambda r: {"uric": "high", "creat": "high"},
}
assert set(RECIPES) == set(COMBO_IDS)


def merge(cons: dict, extra: dict, sex) -> dict | None:
    """Combine constraints; None when they contradict (e.g. creatinine both high and normal)."""
    out = dict(cons)
    for k, spec in extra.items():
        if k not in out or out[k] == spec:
            out[k] = spec
            continue
        a, b = interval(k, out[k], sex), interval(k, spec, sex)
        if a is None or b is None or max(a[0], b[0]) > min(a[1], b[1]):
            return None
        out[k] = (max(a[0], b[0]), min(a[1], b[1]))
    return out


def pick_panel(rng, required):
    names = [n for n, (_w, always, some) in PANEL_SETS.items() if set(required) <= set(always) | set(some)]
    name = rng.choices(names, [PANEL_SETS[n][0] for n in names])[0]
    _w, always, some = PANEL_SETS[name]
    keys = set(always) | {k for k, p in some.items() if rng.random() < p} | set(required)
    if name == "kft" and not keys & {"urea", "bun"}:
        keys.add("urea")
    if len(keys) < 2:  # a "full" draw that came out nearly empty
        keys |= {"hb", "wbc", "plt"}
    return name, sorted(keys, key=TEST_ORDER.get)


@dataclass
class Patient:
    sex: str
    age: int
    values: dict
    panel: str
    targets: list = field(default_factory=list)


def sample_patient(rng, counts: Counter, quota: int, normal: bool) -> Patient:
    """Draw values aimed at the combinations still below quota; labels still come from analyze()."""
    for _attempt in range(30):
        sex, age = rng.choice("FM"), rng.randint(18, 85)
        if normal:
            name, keys = pick_panel(rng, [])
            return Patient(sex, age, {k: sample_value(rng, k, "normal", sex) for k in keys}, name)
        want = rng.choices([1, 2, 3], [.10, .40, .50])[0]
        weights = [max(quota - counts[c], 0) ** 2 + 1 for c in COMBO_IDS]
        cons, targets = {}, []
        for _ in range(want * 4):
            if len(targets) == want:
                break
            cid = rng.choices(COMBO_IDS, weights)[0]
            merged = merge(cons, RECIPES[cid](rng), sex) if cid not in targets else None
            if merged is not None:
                cons, targets = merged, targets + [cid]
        if rng.random() < 0.10:  # a lone critical value, preferring keys seen least
            ck = rng.choices(CRITICAL_KEYS, [max(quota // 10 - counts["critical:" + k], 0) + 2 for k in CRITICAL_KEYS])[0]
            specs = [s for s in ("crit_low", "crit_high") if interval(ck, s, sex)]
            cons = merge(cons, {ck: rng.choice(specs)}, sex) or cons
        name, keys = pick_panel(rng, list(cons))
        values = {k: sample_value(rng, k, cons[k], sex) if k in cons
                  else sample_value(rng, k, background_spec(rng, k, sex), sex, crit_p=0.02) for k in keys}
        fired = {p.id for p in analysis(values, sex)[1]}
        if set(targets) <= fired:
            return Patient(sex, age, values, name, targets)
    return Patient(sex, age, values, name, targets)  # rare: keep the last draw, labels are still exact


# ---------------------------------------------------------------------------
# 3. Rendering a report the way Indian labs print (and phones mangle) it
# ---------------------------------------------------------------------------
FIRST = {"F": ["Anita", "Priya", "Sunita", "Kavita", "Meena", "Rekha", "Pooja", "Neha", "Swati", "Asha", "Lata", "Shalini",
               "Farah", "Nasreen", "Gurpreet", "Lakshmi", "Deepa", "Sneha", "Vaishali", "Rupali", "Jyoti", "Mary", "Fatima"],
         "M": ["Suresh", "Rajesh", "Amit", "Vikram", "Rahul", "Sanjay", "Mahesh", "Prakash", "Imran", "Arjun", "Harpreet",
               "Joseph", "Ravi", "Ganesh", "Nitin", "Sachin", "Anil", "Vinod", "Ashok", "Faisal", "Manoj"]}
LAST = ["Sharma", "Patil", "Deshmukh", "Kulkarni", "Iyer", "Nair", "Reddy", "Khan", "Shaikh", "Singh", "Gupta", "Joshi",
        "Pawar", "Jadhav", "Mehta", "Shah", "Das", "Banerjee", "Fernandes", "Pillai", "Yadav", "Verma", "Chavan", "Gill"]
HONORIFIC = {"F": ["Mrs.", "Ms.", "Smt."], "M": ["Mr.", "Shri"]}
LAB_A = ["Sunrise", "Lotus", "Neelgiri", "Arogya", "Pranav", "Trinetra", "Vardaan", "Navjeevan", "Om Sai", "Pushpak",
         "Amrut", "Swasthya", "Jeevan Jyoti", "Pratiksha", "Sanjivani", "Kalpataru", "Shubh", "Disha"]
LAB_B = ["Diagnostics", "Pathology Lab", "Path Lab", "Diagnostic Centre", "Clinical Laboratory", "Health Labs"]
CITIES = ["Pune", "Nagpur", "Nashik", "Indore", "Bhopal", "Lucknow", "Jaipur", "Thane", "Aurangabad", "Kolhapur", "Patna"]
RELATION = {"F": ["mother", "wife", "daughter", "grandmother", "sister"], "M": ["father", "husband", "son", "grandfather", "brother"]}

DISPLAY = dict(
    hb=["Haemoglobin", "Hemoglobin", "Hb", "HGB", "Haemoglobin (Hb)", "HEMOGLOBIN"],
    wbc=["Total Leucocyte Count", "Total Leukocyte Count", "TLC", "WBC Count", "Total WBC Count", "White Blood Cell Count"],
    plt=["Platelet Count", "Platelets", "PLT", "PLATELET COUNT"],
    mcv=["MCV", "Mean Corpuscular Volume", "M.C.V.", "MCV (Mean Corpuscular Volume)"],
    fbs=["Fasting Blood Sugar", "FBS", "Glucose Fasting", "Fasting Plasma Glucose", "Blood Sugar (Fasting)"],
    hba1c=["HbA1c", "Glycated Haemoglobin", "Glycosylated Hemoglobin (HbA1c)", "HBA1C"],
    creat=["Serum Creatinine", "Creatinine", "S. Creatinine", "CREATININE"],
    urea=["Blood Urea", "Serum Urea", "Urea", "B. Urea"],
    bun=["BUN", "Blood Urea Nitrogen", "B.U.N."],
    na=["Sodium", "Serum Sodium", "Na+", "S. Sodium (Na)"],
    k=["Potassium", "Serum Potassium", "K+", "S. Potassium (K)"],
    alt=["SGPT", "ALT (SGPT)", "SGPT (ALT)", "Alanine Aminotransferase", "S.G.P.T."],
    ast=["SGOT", "AST (SGOT)", "SGOT (AST)", "Aspartate Aminotransferase", "S.G.O.T."],
    bili=["Total Bilirubin", "Bilirubin Total", "Serum Bilirubin (Total)", "T. Bilirubin", "BILIRUBIN TOTAL"],
    chol=["Total Cholesterol", "Cholesterol Total", "Serum Cholesterol", "T. Cholesterol"],
    ldl=["LDL Cholesterol", "LDL-C", "LDL", "Low Density Lipoprotein"],
    hdl=["HDL Cholesterol", "HDL-C", "HDL", "High Density Lipoprotein"],
    tg=["Triglycerides", "Serum Triglycerides", "TG", "Triglyceride"],
    tsh=["TSH", "TSH (3rd Generation)", "Thyroid Stimulating Hormone", "TSH Ultrasensitive"],
    ft4=["Free T4", "FT4", "Free Thyroxine (FT4)", "F.T4"],
    ferritin=["Serum Ferritin", "Ferritin", "FERRITIN"],
    b12=["Vitamin B12", "Vit. B12", "VITAMIN B12", "Cobalamin (B12)"],
    vitd=["25-OH Vitamin D", "Vitamin D (25-OH)", "25 Hydroxy Vitamin D", "Vit D Total"],
    crp=["CRP", "C-Reactive Protein", "CRP (Quantitative)", "C Reactive Protein"],
    uric=["Uric Acid", "Serum Uric Acid", "S. Uric Acid"],
)
HEADINGS = {
    "Blood count": ["COMPLETE BLOOD COUNT (CBC)", "HAEMOGRAM", "CBC", "Complete Blood Count"],
    "Blood sugar": ["BLOOD SUGAR", "GLUCOSE", "DIABETES PROFILE", "Blood Glucose"],
    "Kidney & electrolytes": ["KIDNEY FUNCTION TEST (KFT)", "RENAL FUNCTION TEST", "KFT", "Renal Profile with Electrolytes"],
    "Liver": ["LIVER FUNCTION TEST (LFT)", "LFT", "Liver Profile"],
    "Lipids": ["LIPID PROFILE", "Lipid Profile", "LIPIDS"],
    "Thyroid": ["THYROID PROFILE", "THYROID FUNCTION TEST", "Thyroid Panel"],
    "Vitamins & iron": ["VITAMINS & IRON", "IRON STUDIES / VITAMINS", "Vitamin Profile"],
    "Inflammation": ["INFLAMMATORY MARKERS", "OTHERS", "Special Chemistry"],
}
HEADINGS_HI = {"Blood count": "रक्त गणना (CBC)", "Blood sugar": "रक्त शर्करा (Blood Sugar)", "Kidney & electrolytes": "किडनी जांच (KFT)",
               "Liver": "लिवर जांच (LFT)", "Lipids": "लिपिड प्रोफाइल", "Thyroid": "थायरॉइड जांच",
               "Vitamins & iron": "विटामिन और आयरन", "Inflammation": "अन्य जांच"}
METHODS = ["Photometry", "Spectrophotometry", "Automated cell counter", "CLIA", "ECLIA", "Ion selective electrode",
           "Enzymatic", "HPLC", "Immunoturbidimetry"]
ILLEGIBLE = ["##.#", "***", "--.-", "(illegible)", "?"]


def indian(n: int) -> str:
    """1,50,000 style grouping."""
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail, parts = s[:-3], s[-3:], []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + parts + [tail])


def unit_style(rng, key):
    """(unit text, show) where show(canonical value) gives the printed number. Only exact conversions."""
    d = SPAN[key][2]
    canonical = lambda x: f"{x:.{d}f}"  # noqa: E731
    if key in ("wbc", "plt"):
        r = rng.random()
        if r < 0.45:
            grouping = rng.choice([indian, lambda n: f"{n:,}", str])
            return rng.choice(["/cumm", "cells/cumm", "/µL", "cells/µL", "/cu mm"]), lambda x: grouping(int(round(x * 1000)))
        if key == "plt" and r < 0.75:
            return rng.choice(["lakhs/cumm", "lakh/cumm", "Lakhs/µL", "lakhs/cu mm"]), lambda x: f"{x / 100:.2f}".rstrip("0").rstrip(".")
        return rng.choice(["x10^3/µL", "10^3/uL", "x10³/µL", "K/uL"] + (["x10^9/L"] if key == "wbc" else [])), canonical
    if key == "hb" and rng.random() < 0.1:
        return "g/L", lambda x: f"{x * 10:.0f}"
    unit = TESTS[key]["unit"]
    variants = {"na": ["mmol/L", "mEq/L", "mmol/l"], "k": ["mmol/L", "mEq/L", "mmol/l"],
                "tsh": ["mIU/L", "µIU/mL", "uIU/mL"], "alt": ["U/L", "IU/L", "U/l"], "ast": ["U/L", "IU/L", "U/l"]}
    return rng.choice(variants.get(key, [unit, unit.replace("dL", "dl").replace("mL", "ml")])), canonical


@dataclass
class Row:
    key: str
    name: str
    value: str
    unit: str
    ref: str
    flag: str
    panel: str


def printed_range(rng, key, sex, show):
    """The lab's own interval: usually ours, sometimes slightly different (a deliberate distractor)."""
    lo, hi = bounds(key, sex)
    if rng.random() < 0.25:
        lo = lo * rng.uniform(0.94, 1.0) if lo is not None else None
        hi = hi * rng.uniform(0.97, 1.06) if hi is not None else None
    if lo is not None and hi is not None:
        if isinstance(TESTS[key]["low"], dict) and rng.random() < 0.2:
            t = TESTS[key]
            return f"M: {show(t['low']['M'])}-{show(t['high']['M'])} / F: {show(t['low']['F'])}-{show(t['high']['F'])}", lo, hi
        sep = rng.choice([" - ", "-", " to "])
        return f"{show(lo)}{sep}{show(hi)}", lo, hi
    if hi is not None:
        return rng.choice([f"< {show(hi)}", f"Up to {show(hi)}", f"0 - {show(hi)}"]), lo, hi
    return rng.choice([f"> {show(lo)}", f">= {show(lo)}"]), lo, hi


def make_rows(rng, values, sex, illegible=()) -> list[Row]:
    rows = []
    for k in sorted(values, key=TEST_ORDER.get):
        unit, show = unit_style(rng, k)
        ref, lo, hi = printed_range(rng, k, sex, show)
        v = values[k]
        flag = "L" if lo is not None and v < lo else "H" if hi is not None and v > hi else ""
        value = rng.choice(ILLEGIBLE) if k in illegible else show(v)
        rows.append(Row(k, rng.choice(DISPLAY[k]), value, unit, ref, flag, TESTS[k]["panel"]))
    return rows


def sections(rows):
    return [(p, [r for r in rows if r.panel == p]) for p in PANELS if any(r.panel == p for r in rows)]


@dataclass
class Report:
    sex: str
    age: int
    name: str
    hon: str
    sex_mode: str  # explicit | honorific | prompt
    lab: str
    date: str
    pid: str
    doctor: str
    rows: list


def date(rng):
    d, m, y = rng.randint(1, 28), rng.randint(1, 12), rng.choice([2025, 2026])
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    return rng.choice([f"{d:02d}-{m:02d}-{y}", f"{d:02d}/{m:02d}/{y}", f"{y}-{m:02d}-{d:02d}", f"{d} {months[m - 1]} {y}"])


def make_report(rng, p: Patient, illegible=()) -> Report:
    sex_mode = rng.choices(["explicit", "honorific", "prompt"], [.6, .15, .25])[0]
    return Report(p.sex, p.age, f"{rng.choice(FIRST[p.sex])} {rng.choice(LAST)}", rng.choice(HONORIFIC[p.sex]), sex_mode,
                  f"{rng.choice(LAB_A)} {rng.choice(LAB_B)}", date(rng), str(rng.randint(10 ** 6, 10 ** 8)),
                  f"Dr. {rng.choice('ABCDGKMNPRSV')}. {rng.choice(LAST)}", make_rows(rng, p.values, p.sex, illegible))


def patient_lines(rng, rep: Report, hindi=False) -> list[str]:
    s1, sw = rep.sex, {"F": "Female", "M": "Male"}[rep.sex]
    if hindi:
        return {"explicit": [f"नाम: {rep.name}   आयु/लिंग: {rep.age} वर्ष / {'महिला' if rep.sex == 'F' else 'पुरुष'}"],
                "honorific": [f"नाम: {rep.hon} {rep.name}   आयु: {rep.age} वर्ष"],
                "prompt": [f"मरीज़ आईडी: {rep.pid}   आयु: {rep.age} वर्ष"]}[rep.sex_mode]
    if rep.sex_mode == "explicit":
        name = rng.choice([rep.name, f"{rep.hon} {rep.name}"])
        return rng.choice([[f"Patient: {name}        Age/Sex: {rep.age} Y / {s1}        Date: {rep.date}"],
                           [f"Name: {name}", f"Age: {rep.age} Years", f"Sex: {sw}"],
                           [f"PT NAME : {rep.name.upper()}   {rep.age}Y/{s1}"],
                           [f"Patient Name : {name}", f"Age / Gender : {rep.age} Yrs / {sw}"]])
    if rep.sex_mode == "honorific":
        return rng.choice([[f"Patient Name: {rep.hon} {rep.name}    Age: {rep.age} Yrs"],
                           [f"Name : {rep.hon} {rep.name.upper()} | Age : {rep.age}"]])
    return rng.choice([[f"Patient ID: {rep.pid}    Age: {rep.age} Yrs"], [f"Reg. No: {rep.pid} | Age: {rep.age}"]])


def header(rng, rep: Report, hindi=False) -> list[str]:
    lines = [rng.choice([rep.lab.upper(), rep.lab]), f"{rng.choice(CITIES)} | Ph: 0{rng.randint(20, 99)}-{rng.randint(10 ** 7, 10 ** 8 - 1)}"]
    lines += patient_lines(rng, rep, hindi)
    extra = [f"Ref. By: {rep.doctor}", f"Lab No: {rep.lab[:2].upper()}/{rep.date[-2:]}/{rng.randint(10 ** 5, 10 ** 6 - 1)}",
             f"Collected: {rep.date} {rng.randint(7, 11):02d}:{rng.randint(0, 59):02d}", f"Barcode: {rng.randint(10 ** 9, 10 ** 10 - 1)}"]
    return lines + rng.sample(extra, rng.randint(1, len(extra)))


def footer(rng, rep: Report) -> list[str]:
    options = ["*** End of Report ***", "Page 1 of 1", "Clinical correlation is advised.",
               f"{rep.doctor}, MD (Pathology)", "Results relate only to the sample tested.",
               f"Reported: {rep.date} {rng.randint(12, 20):02d}:{rng.randint(0, 59):02d}"]
    return rng.sample(options, rng.randint(1, 4))


def t_table_aligned(rng, rep):
    w = rng.randint(24, 32)
    out = header(rng, rep) + [""]
    for panel, rows in sections(rep.rows):
        out += [rng.choice(HEADINGS[panel]), f"{'Test':<{w}}{'Result':<11}{'Unit':<14}Biological Ref. Interval"]
        out += [f"{r.name:<{w}}{r.value:<11}{r.unit:<14}{r.ref}" for r in rows] + [""]
    return "\n".join(out + footer(rng, rep))


def t_table_flags(rng, rep):
    out = header(rng, rep) + [""]
    for panel, rows in sections(rep.rows):
        out += [rng.choice(HEADINGS[panel]), "Investigation              Observed Value   Flag   Unit          Reference Range"]
        for r in rows:
            out.append(f"{r.name:<27}{r.value:<17}{r.flag:<7}{r.unit:<14}{r.ref}")
            if rng.random() < 0.3:
                out.append(f"  Method: {rng.choice(METHODS)}")
        out.append("")
    return "\n".join(out + footer(rng, rep))


def t_key_value(rng, rep):
    style = rng.choice(["{n} : {v} {u}   [{ref}]", "{n} - {v} {u} (Ref: {ref})", "{n}: {v} {u}"])
    out = header(rng, rep) + [""]
    for panel, rows in sections(rep.rows):
        out += [rng.choice(HEADINGS[panel])] + [style.format(n=r.name, v=r.value, u=r.unit, ref=r.ref) for r in rows] + [""]
    return "\n".join(out + footer(rng, rep))


def t_pipe_table(rng, rep):
    out = header(rng, rep) + [""]
    for panel, rows in sections(rep.rows):
        out += [f"**{rng.choice(HEADINGS[panel])}**", "| Test | Result | Unit | Ref. range |", "|---|---|---|---|"]
        out += [f"| {r.name} | {r.value} | {r.unit} | {r.ref} |" for r in rows] + [""]
    return "\n".join(out + footer(rng, rep))


def t_csv_export(rng, rep):
    q = lambda s: f'"{s}"' if "," in s else s  # noqa: E731
    out = header(rng, rep) + ["", "Test,Result,Unit,Reference Range,Flag"]
    out += [",".join(q(x) for x in (r.name, r.value, r.unit, r.ref, r.flag)) for r in rep.rows]
    return "\n".join(out + [""] + footer(rng, rep))


def t_whatsapp(rng, rep):
    out = [f"*{rep.lab} - Report*", *patient_lines(rng, rep), rep.date, ""]
    for panel, rows in sections(rep.rows):
        out.append(f"*{rng.choice(HEADINGS[panel])}*")
        out += [f"{min(DISPLAY[r.key], key=len) if rng.random() < .6 else r.name} - {r.value} {r.unit}" for r in rows]
    return "\n".join(out + ["", rng.choice(["_Forwarded as received_", "Forwarded", "Sent from my phone"])])


def t_ocr_two_col(rng, rep):
    cells = [f"{r.name} {r.value} {r.unit}" for r in rep.rows]
    out = header(rng, rep) + [""]
    for i in range(0, len(cells), 2):
        out.append(cells[i] + (" " * rng.randint(3, 14) + cells[i + 1] if i + 1 < len(cells) else ""))
    return "\n".join(out + footer(rng, rep))


def t_hindi_headers(rng, rep):
    out = [rep.lab, *patient_lines(rng, rep, hindi=True), f"दिनांक: {rep.date}", ""]
    for panel, rows in sections(rep.rows):
        out += [HEADINGS_HI[panel], "जांच | परिणाम | इकाई | संदर्भ सीमा"]
        out += [f"{r.name} | {r.value} | {r.unit} | {r.ref}" for r in rows] + [""]
    return "\n".join(out + footer(rng, rep))


def t_compact_inline(rng, rep):
    out = [rep.lab, " ".join(patient_lines(rng, rep)), ""]
    for panel, rows in sections(rep.rows):
        out.append(f"{rng.choice(HEADINGS[panel])}: " + ", ".join(f"{min(DISPLAY[r.key], key=len)} {r.value} {r.unit}" for r in rows))
    return "\n".join(out)


def t_dot_leaders(rng, rep):
    out = header(rng, rep) + [""]
    for panel, rows in sections(rep.rows):
        out.append(rng.choice(HEADINGS[panel]))
        out += [f"{r.name} {'.' * rng.randint(4, 18)} {r.value} {r.unit}  ({r.ref})" for r in rows] + [""]
    return "\n".join(out + footer(rng, rep))


# Held-out only: never used for training, to test whether the model generalises to new layouts.
def t_vertical_cells(rng, rep):
    """What PDF text extraction often produces: every table cell on its own line."""
    out = header(rng, rep) + [""]
    for panel, rows in sections(rep.rows):
        out += [rng.choice(HEADINGS[panel]), "Test", "Result", "Unit", "Reference"]
        for r in rows:
            out += [r.name, r.value, r.unit, r.ref]
    return "\n".join(out + footer(rng, rep))


def t_doctor_note(rng, rep):
    who = {"explicit": f"{rep.name}, {rep.age}/{rep.sex}", "honorific": f"{rep.hon} {rep.name}, {rep.age} yrs",
           "prompt": f"Pt ID {rep.pid}, {rep.age} yrs"}[rep.sex_mode]
    parts = [f"{rng.choice(HEADINGS[p]).title()}: " + ", ".join(f"{r.name.lower()} {r.value} {r.unit}" for r in rows)
             for p, rows in sections(rep.rows)]
    return f"OPD note, {rep.date}. {who}. Labs from {rep.lab}. " + ". ".join(parts) + ". Review with reports."


TEMPLATES = {f.__name__[2:]: f for f in (t_table_aligned, t_table_flags, t_key_value, t_pipe_table, t_csv_export,
                                         t_whatsapp, t_ocr_two_col, t_hindi_headers, t_compact_inline, t_dot_leaders)}
UNSEEN = {f.__name__[2:]: f for f in (t_vertical_cells, t_doctor_note)}

_OCR_SWAPS = [("l", "1"), ("o", "0"), ("O", "0"), ("I", "l"), ("rn", "m"), ("m", "rn"), ("e", "c")]


def ocr_noise(rng, text: str) -> str:
    """Letters and spacing only: values are never touched, so the label stays exact."""
    out = []
    for line in text.split("\n"):
        if rng.random() < 0.3:
            line = re.sub(r" {2,}", " ", line)  # merged columns
        tokens = line.split(" ")
        for i, tok in enumerate(tokens):
            if len(tok) >= 4 and tok.isalpha() and rng.random() < 0.08:
                a, b = rng.choice(_OCR_SWAPS)
                tokens[i] = tok.replace(a, b, 1)
        out.append(" ".join(tokens))
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 4. Prompts
# ---------------------------------------------------------------------------
MAIN_PROMPTS = [
    "Read this lab report and explain the results in {L}.",
    "Here is my blood test report. What is abnormal and what does it mean? Please reply in {L}.",
    "Please analyse this report for me and answer in {L}.",
    "Can you check my lab results and tell me if anything is outside the normal range? Write in {L}.",
    "I got this report from the lab today. Explain it simply in {L}.",
    "Analyse the following medical report: flag abnormal values and any concerning combinations. Language: {L}.",
    "What does this report say about my health? Answer in {L}, in simple words.",
    "Summarise this lab report for a patient, in {L}.",
    "Check this report and tell me what needs attention. Respond in {L}.",
    "Explain my test results in plain {L} and mention anything I should discuss with a doctor.",
    "This is my {rel}'s report. What do these numbers mean? Please answer in {L}.",
    "Go through this report and give me the LabLens summary in {L}.",
]
NATIVE_PROMPTS = {
    "hi": ["Mera lab report dekho aur Hindi mein samjhao.", "Is report mein kya gadbad hai? Hindi mein batao.",
           "इस लैब रिपोर्ट को हिंदी में समझाइए।", "मेरी रिपोर्ट देखकर बताइए कि क्या ठीक नहीं है। जवाब हिंदी में दें।"],
    "mr": ["Majha lab report bagha ani Marathi madhe samjavun sanga.", "हा लॅब रिपोर्ट मराठीत समजावून सांगा.",
           "माझा रिपोर्ट पाहून काय सामान्य नाही ते मराठीत सांगा."],
}
LANG_LABEL = {"en": ["English"], "hi": ["Hindi", "Hindi (हिंदी)"], "mr": ["Marathi", "Marathi (मराठी)"]}


def sex_note(rng, rep: Report) -> str:
    word = {"F": ("female", "woman"), "M": ("male", "man")}[rep.sex]
    return rng.choice([f"Patient sex: {word[0]}.", f"(The patient is a {rep.age}-year-old {word[1]}.)",
                       f"Sex: {rep.sex}", f"Use {word[0]} reference ranges."])


def wrap(rng, instruction: str, report: str) -> str:
    body = rng.choice([report, f"Report:\n{report}", f"```\n{report}\n```", f"---\n{report}\n---"])
    return f"{instruction}\n\n{body}" if rng.random() < 0.7 else f"{body}\n\n{instruction}"


def main_instruction(rng, rep: Report, lang: str) -> str:
    if lang in NATIVE_PROMPTS and rng.random() < 0.35:
        text = rng.choice(NATIVE_PROMPTS[lang])
    else:
        text = rng.choice(MAIN_PROMPTS).format(L=rng.choice(LANG_LABEL[lang]), rel=rng.choice(RELATION[rep.sex]))
    if rep.sex_mode == "prompt":
        text = f"{sex_note(rng, rep)} {text}" if rng.random() < 0.5 else f"{text} {sex_note(rng, rep)}"
    return text


# ---------------------------------------------------------------------------
# 5. Patient questions and abstentions
# ---------------------------------------------------------------------------
QA_ALIAS = dict(hb=["hemoglobin", "Hb", "haemoglobin"], wbc=["WBC count", "TLC", "white cell count"], plt=["platelets", "platelet count"],
                mcv=["MCV"], fbs=["fasting sugar", "fasting blood sugar"], hba1c=["HbA1c", "A1c"], creat=["creatinine"],
                urea=["urea"], bun=["BUN"], na=["sodium"], k=["potassium"], alt=["SGPT", "ALT"], ast=["SGOT", "AST"],
                bili=["bilirubin"], chol=["cholesterol"], ldl=["LDL", "bad cholesterol"], hdl=["HDL", "good cholesterol"],
                tg=["triglycerides"], tsh=["TSH"], ft4=["free T4"], ferritin=["ferritin"], b12=["vitamin B12", "B12"],
                vitd=["vitamin D"], crp=["CRP"], uric=["uric acid"])
QUESTIONS = {
    "test": {"en": ["Is my {a} normal?", "Is my {a} dangerous?", "What does my {a} result mean?", "Should I worry about my {a}?"],
             "hi": ["क्या मेरा {a} नॉर्मल है?", "Kya mera {a} theek hai?", "Mera {a} zyada hai kya?", "{a} का रिज़ल्ट क्या बताता है?"],
             "mr": ["माझे {a} नॉर्मल आहे का?", "माझे {a} जास्त आहे का?", "माझ्या {a} च्या निकालाचा अर्थ काय?"]},
    "next": {"en": ["What should I do about this report?", "Do I need to see a doctor for these results?", "How serious is this report?"],
             "hi": ["अब मुझे क्या करना चाहिए?", "Kya mujhe doctor ko dikhana chahiye?", "यह रिपोर्ट कितनी गंभीर है?"],
             "mr": ["आता मी काय करावे?", "मला डॉक्टरांकडे जावे लागेल का?", "हा रिपोर्ट किती गंभीर आहे?"]},
    "medicine": {"en": ["Which medicine should I take for this?", "How many tablets should I take to fix this?", "Can you suggest a medicine and dose?"],
                 "hi": ["इसके लिए कौन सी दवा लूं?", "Kaunsi tablet leni chahiye aur kitni?", "कोई दवा बता दीजिए।"],
                 "mr": ["यासाठी कोणते औषध घ्यावे?", "किती गोळ्या घ्याव्यात?", "एखादे औषध सुचवा."]},
}
QA = {
    "en": dict(status="Your {name} is {value} {unit}, which is {phrase} (reference {range}).",
               phrase=dict(normal="within the reference range", low="below the reference range", high="above the reference range",
                           critical_low="far below the reference range, at a critical level",
                           critical_high="far above the reference range, at a critical level"),
               fine="That is within the usual range, so it is not a concern on its own.",
               part_of="Together with {evidence}, it is part of this pattern: {title} ({label}).",
               escalate="Also important: your report shows {title}. Please see a doctor today.",
               no_meds="I can't suggest medicines or doses; only your doctor can decide that after examining you.",
               overall="Overall: {verdict}", top="The main findings are: {items}.",
               missing=("Your report has no {name} result, so I can't tell you your {name} level. "
                        "Please don't rely on a guess; ask your doctor whether this test is needed."),
               present="The tests in this report are: {names}.",
               unreadable=("The {name} value on this report can't be read clearly, so I can't say whether it is normal. "
                           "Please check the original report or ask the lab to confirm it."),
               not_report=("This doesn't look like a lab report with test results, so there is nothing to check against "
                           "reference ranges. Please share the page that lists your test names, values and units.")),
    "hi": dict(status="आपका {name} {value} {unit} है, जो {phrase} है (संदर्भ {range})।",
               phrase=dict(normal="संदर्भ सीमा के अंदर", low="संदर्भ सीमा से कम", high="संदर्भ सीमा से ज़्यादा",
                           critical_low="संदर्भ सीमा से बहुत कम, गंभीर स्तर पर", critical_high="संदर्भ सीमा से बहुत ज़्यादा, गंभीर स्तर पर"),
               fine="यह सामान्य सीमा में है, इसलिए अपने-आप में चिंता की बात नहीं है।",
               part_of="{evidence} के साथ मिलकर यह इस पैटर्न का हिस्सा है: {title} ({label})।",
               escalate="यह भी ज़रूरी है: आपकी रिपोर्ट में {title} दिख रहा है। कृपया आज ही डॉक्टर को दिखाएं।",
               no_meds="मैं कोई दवा या उसकी खुराक नहीं बता सकता; यह जांच के बाद सिर्फ़ आपके डॉक्टर तय कर सकते हैं।",
               overall="कुल मिलाकर: {verdict}", top="मुख्य बातें: {items}।",
               missing=("आपकी रिपोर्ट में {name} का परिणाम नहीं है, इसलिए मैं आपका {name} स्तर नहीं बता सकता। "
                        "अंदाज़े पर भरोसा न करें; डॉक्टर से पूछें कि क्या यह टेस्ट करवाना ज़रूरी है।"),
               present="इस रिपोर्ट में ये टेस्ट हैं: {names}।",
               unreadable=("इस रिपोर्ट में {name} की वैल्यू साफ़ पढ़ी नहीं जा रही, इसलिए मैं नहीं बता सकता कि यह सामान्य है या नहीं। "
                           "कृपया असली रिपोर्ट देखें या लैब से पुष्टि करें।"),
               not_report=("यह टेस्ट परिणामों वाली लैब रिपोर्ट नहीं लगती, इसलिए संदर्भ सीमा से मिलाने के लिए कुछ नहीं है। "
                           "कृपया वह पेज भेजें जिसमें टेस्ट के नाम, वैल्यू और यूनिट लिखे हों।")),
    "mr": dict(status="तुमचे {name} {value} {unit} आहे, जे {phrase} आहे (संदर्भ {range}).",
               phrase=dict(normal="संदर्भ मर्यादेत", low="संदर्भ मर्यादेपेक्षा कमी", high="संदर्भ मर्यादेपेक्षा जास्त",
                           critical_low="संदर्भ मर्यादेपेक्षा खूप कमी, गंभीर पातळीवर", critical_high="संदर्भ मर्यादेपेक्षा खूप जास्त, गंभीर पातळीवर"),
               fine="हे सामान्य मर्यादेत आहे, त्यामुळे स्वतःहून काळजीचे कारण नाही.",
               part_of="{evidence} सोबत मिळून हे या पॅटर्नचा भाग आहे: {title} ({label}).",
               escalate="हेही महत्त्वाचे: तुमच्या रिपोर्टमध्ये {title} दिसत आहे. कृपया आजच डॉक्टरांना भेटा.",
               no_meds="मी कोणतेही औषध किंवा त्याचा डोस सुचवू शकत नाही; तपासणीनंतर फक्त तुमचे डॉक्टरच ते ठरवू शकतात.",
               overall="एकूण: {verdict}", top="मुख्य मुद्दे: {items}.",
               missing=("तुमच्या रिपोर्टमध्ये {name} चा निकाल नाही, त्यामुळे मी तुमची {name} पातळी सांगू शकत नाही. "
                        "अंदाजावर विसंबून राहू नका; ही चाचणी आवश्यक आहे का हे डॉक्टरांना विचारा."),
               present="या रिपोर्टमध्ये या चाचण्या आहेत: {names}.",
               unreadable=("या रिपोर्टमधील {name} ची किंमत स्पष्ट वाचता येत नाही, त्यामुळे ती सामान्य आहे की नाही हे मी सांगू शकत नाही. "
                           "कृपया मूळ रिपोर्ट पाहा किंवा लॅबकडून खात्री करून घ्या."),
               not_report=("हा चाचणी निकाल असलेला लॅब रिपोर्ट वाटत नाही, त्यामुळे संदर्भ मर्यादेशी तुलना करण्यासारखे काही नाही. "
                           "कृपया चाचण्यांची नावे, किंमती आणि युनिट्स असलेले पान पाठवा.")),
}


def explanation(item_id: str, lang: str, n: int) -> str:
    entry = library().get(item_id, {})
    return " ".join(sentences(entry.get(lang) or entry.get("en", ""), n))


def answer_test(key, values, sex, lang) -> str:
    q, t = QA[lang], T[lang]
    results, patterns, _ = analysis(values, sex)
    r = results[key]
    out = [q["status"].format(name=r.name, value=f"{r.value:g}", unit=r.unit, phrase=q["phrase"][r.status], range=range_text(r, lang))]
    mine = [p for p in patterns if key in p.evidence]
    if not r.abnormal:
        out.append(q["fine"])
    else:
        if mine and not mine[0].id.startswith("critical:"):
            p = mine[0]
            others = [k for k in p.evidence if k != key]
            out.append(q["part_of"].format(evidence=evidence_text(others, results, lang), title=p.title, label=t["label"][p.severity]))
        out.append(explanation(explanation_id(mine[0], results) if mine else f"test:{key}:{r.direction}", lang, 2))
        out.append(t["next"][mine[0].severity if mine else "watch"])
    urgent_elsewhere = [p for p in patterns if p.severity == "urgent" and p not in mine]
    if urgent_elsewhere:
        out.append(q["escalate"].format(title=urgent_elsewhere[0].title))
    return " ".join(out)


def findings(results, patterns, lang) -> str:
    t = T[lang]
    items = [f"{p.title} ({t['label'][p.severity]})" for p in patterns[:3]]
    if not items:
        items = [f"{r.name} {ARROW[r.status]}" for r in sorted(results.values(), key=lambda r: TEST_ORDER[r.key]) if r.abnormal][:3]
    return QA[lang]["top"].format(items="; ".join(items))


def answer_next(values, sex, lang, medicine=False) -> str:
    q, t = QA[lang], T[lang]
    results, patterns, verdict = analysis(values, sex)
    out = [q["no_meds"]] if medicine else []
    out.append(q["overall"].format(verdict=t["verdict"][verdict]))
    if verdict != "ok":
        out.append(findings(results, patterns, lang))
    out.append(t["next"][verdict])
    return " ".join(out)


NOT_REPORTS = [
    lambda r: ("Rx\n1. Tab. Paracetamol 650 mg   1-0-1 x 5 days\n2. Tab. Pantoprazole 40 mg   1-0-0 before breakfast\n"
               f"3. ORS sachets as needed\nAdvice: plenty of fluids, rest.\nDr. {r.choice(LAST)}, MBBS"),
    lambda r: ("USG ABDOMEN\nLiver: normal in size (13.2 cm) and echotexture. No focal lesion.\nGall bladder: well distended, "
               "no calculi.\nKidneys: normal size, no hydronephrosis.\nIMPRESSION: No significant abnormality detected."),
    lambda r: f"ECG REPORT\nSinus rhythm. Heart rate {r.randint(62, 96)} bpm. PR {r.randint(140, 190)} ms. QTc {r.randint(390, 440)} ms.\nNo ST-T changes.",
    lambda r: (f"Dear {r.choice(FIRST['F'] + FIRST['M'])}, your appointment with Dr. {r.choice(LAST)} is confirmed for "
               f"{r.randint(1, 28)}/{r.randint(1, 12)}/2026 at {r.randint(9, 12)}:30 AM. Token no. {r.randint(1, 40)}."),
    lambda r: (f"INVOICE No. {r.randint(1000, 9999)}\nComplete Blood Count      Rs. 350\nLipid Profile             Rs. 600\n"
               "Thyroid Profile           Rs. 550\nTotal: Rs. 1500   Paid via UPI\nSamples will be collected tomorrow."),
    lambda r: ("DISCHARGE SUMMARY\nAdmitted with fever for 3 days. Treated with IV fluids and antibiotics. "
               "Discharged in stable condition. Follow up in OPD after 1 week with reports."),
]


def qa_prompt(rng, report_text: str, question: str, lang: str) -> str:
    lang_word = rng.choice(LANG_LABEL[lang])
    return rng.choice([f"{report_text}\n\nQuestion: {question}\nAnswer in {lang_word}.",
                       f"{question} (Please answer in {lang_word}.)\n\n{report_text}",
                       f"My report:\n{report_text}\n\n{question} Reply in {lang_word}."])


# ---------------------------------------------------------------------------
# 6. Building and checking the splits
# ---------------------------------------------------------------------------
def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def render(rng, p: Patient, templates: dict, illegible=()):
    rep = make_report(rng, p, illegible)
    tname = rng.choice(list(templates))
    text = templates[tname](rng, rep)
    noisy = rng.random() < 0.2
    return rep, tname, (ocr_noise(rng, text) if noisy else text), noisy


def main_row(rng, p, lang, templates, stats):
    rep, tname, text, noisy = render(rng, p, templates)
    prompt = wrap(rng, main_instruction(rng, rep, lang), text)
    return dict(kind="main", lang=lang, template=tname, ocr=noisy, sex_mode=rep.sex_mode, prompt=prompt,
                completion=completion(p.values, p.sex, lang, stats), gold=gold(p.values, p.sex),
                shown={r.key: r.value for r in rep.rows})


def qa_row(rng, p, lang, templates):
    kind = rng.choices(["test", "next", "medicine"], [.5, .3, .2])[0]
    rep, tname, text, noisy = render(rng, p, templates)
    if kind == "test":
        results = analysis(p.values, p.sex)[0]
        abnormal = [k for k, r in results.items() if r.abnormal]
        key = rng.choice(abnormal) if abnormal and rng.random() < 0.7 else rng.choice(list(p.values))
        question = rng.choice(QUESTIONS["test"][lang]).format(a=rng.choice(QA_ALIAS[key]))
        answer = answer_test(key, p.values, p.sex, lang)
    else:
        question = rng.choice(QUESTIONS[kind][lang])
        answer = answer_next(p.values, p.sex, lang, medicine=kind == "medicine")
    if rep.sex_mode == "prompt":
        text = f"{sex_note(rng, rep)}\n{text}"
    return dict(kind=f"qa_{kind}", lang=lang, template=tname, ocr=noisy, prompt=qa_prompt(rng, text, question, lang), completion=answer)


def abstain_row(rng, p, lang, templates):
    kind = rng.choices(["missing", "unreadable", "not_report"], [.45, .3, .25])[0]
    if kind == "missing" and len(p.values) == len(TESTS):  # every test present: nothing can be missing
        kind = "unreadable"
    q = QA[lang]
    if kind == "not_report":
        text = rng.choice(NOT_REPORTS)(rng)
        instruction = rng.choice(MAIN_PROMPTS).format(L=rng.choice(LANG_LABEL[lang]), rel=rng.choice(RELATION[p.sex]))
        return dict(kind="abstain_not_report", lang=lang, template="none", ocr=False, prompt=wrap(rng, instruction, text),
                    completion=q["not_report"], about=None)
    if kind == "missing":
        key = rng.choice([k for k in TESTS if k not in p.values])
        rep, tname, text, noisy = render(rng, p, templates)
        names = ", ".join(TESTS[k]["name"] for k in sorted(p.values, key=TEST_ORDER.get))
        answer = f"{q['missing'].format(name=TESTS[key]['name'])} {q['present'].format(names=names)}"
    else:
        key = rng.choice(list(p.values))
        rep, tname, text, noisy = render(rng, p, templates, illegible={key})
        answer = q["unreadable"].format(name=TESTS[key]["name"])
    question = rng.choice(QUESTIONS["test"][lang]).format(a=rng.choice(QA_ALIAS[key]))
    if rep.sex_mode == "prompt":
        text = f"{sex_note(rng, rep)}\n{text}"
    return dict(kind=f"abstain_{kind}", lang=lang, template=tname, ocr=noisy, prompt=qa_prompt(rng, text, question, lang),
                completion=answer, about=key)


def build(rng, n, templates, quota, mix, normal_share, stats, seen=frozenset()):
    """n rows; mix = shares of (main, qa, abstain). Combinations are counted on main rows only."""
    counts = Counter()
    n_main, n_qa = round(n * mix[0]), round(n * mix[1])
    kinds = ["main"] * n_main + ["qa"] * n_qa + ["abstain"] * (n - n_main - n_qa)
    rng.shuffle(kinds)
    rows, prompts = [], set(seen)
    for kind in kinds:
        for _ in range(20):  # regenerate on the rare duplicate prompt
            lang = rng.choices(["en", "hi", "mr"], [.6, .25, .15])[0]
            p = sample_patient(rng, counts, quota, normal=rng.random() < normal_share)
            row = (main_row(rng, p, lang, templates, stats) if kind == "main" else
                   qa_row(rng, p, lang, templates) if kind == "qa" else abstain_row(rng, p, lang, templates))
            if norm(row["prompt"]) not in prompts:
                break
        prompts.add(norm(row["prompt"]))
        row.update(sex=p.sex, values=p.values, panel=p.panel)
        if kind == "main":
            counts.update(row["gold"]["patterns"])
        rows.append(row)
    return rows, counts


DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def check(rows):
    """Fail loudly if any label could be wrong."""
    for i, r in enumerate(rows):
        where = f"row {i} ({r['kind']}, {r['template']})"
        if r["kind"] == "main":
            block = parse_block(r["completion"])
            assert block == r["gold"] == gold(r["values"], r["sex"]), f"{where}: JSON block differs from analyze()"
            assert set(r["shown"]) == set(r["values"]), f"{where}: a test was not rendered"
            for k, shown in r["shown"].items():
                assert shown in r["prompt"], f"{where}: value {shown!r} for {k} missing from the prompt"
            for k in r["gold"]["abnormal"]:
                assert TESTS[k]["name"] in r["completion"], f"{where}: abnormal {k} not listed"
        if r["kind"].startswith("abstain"):
            text = r["completion"]
            for k in TESTS:
                text = text.replace(TESTS[k]["name"], "")
            assert not re.search(r"\d", text), f"{where}: an abstention mentions a number"
        if r["lang"] in ("hi", "mr"):
            assert DEVANAGARI.search(r["completion"]), f"{where}: {r['lang']} answer has no Devanagari"
        assert "```json" not in r["completion"] or r["kind"] == "main", f"{where}: unexpected JSON block"


def parser_baseline(rows) -> dict:
    """How often the Round 1 regex parser reads every value exactly, per layout (evidence for training)."""
    by = {}
    for r in rows:
        if r["kind"] == "main":
            ok = parse_report(r["prompt"]) == r["values"]
            hit, total = by.get(r["template"], (0, 0))
            by[r["template"]] = (hit + ok, total + 1)
    return {t: round(h / n, 3) for t, (h, n) in sorted(by.items())}


def showcase():
    from main import SAMPLES, detect_sex  # noqa: PLC0415  (only the 4 app samples need the app helpers)
    out = []
    extra = {"anita_anemia_thyroid": "hi", "suresh_kidney_urgent": "mr"}  # the same report, explained in another language
    for s in SAMPLES:
        text = (BACKEND / "samples" / f"{s['id']}.txt").read_text(encoding="utf-8")
        values, sex = parse_report(text), detect_sex(text)
        for lang in ["en"] + ([extra[s["id"]]] if s["id"] in extra else []):
            out.append(dict(id=s["id"] if lang == "en" else f"{s['id']}_{lang}", label=s["label"], lang=lang,
                            prompt=f"Read this lab report and explain the results in {LANG_LABEL[lang][0]}.\n\n{text}",
                            gold=gold(values, sex), reference=completion(values, sex, lang),
                            template="app_sample", unseen_template=False, ocr=False))
    return out


def summarise(rows, counts, stats) -> dict:
    crit = Counter(p for r in rows if r["kind"] == "main" for p in r["gold"]["patterns"] if p.startswith("critical:"))
    main = [r for r in rows if r["kind"] == "main"]
    return dict(
        rows=len(rows), kinds=dict(Counter(r["kind"] for r in rows)), languages=dict(Counter(r["lang"] for r in rows)),
        templates=dict(Counter(r["template"] for r in rows)), ocr_noise_rows=sum(r["ocr"] for r in rows),
        sex_modes=dict(Counter(r.get("sex_mode") for r in main)),
        verdicts=dict(Counter(r["gold"]["verdict"] for r in main)),
        fully_normal_main_rows=sum(not r["gold"]["abnormal"] for r in main),
        pattern_counts_main={c: counts[c] for c in COMBO_IDS}, critical_counts_main=dict(sorted(crit.items())),
        avg_prompt_chars=round(sum(len(r["prompt"]) for r in rows) / len(rows)),
        avg_completion_chars=round(sum(len(r["completion"]) for r in rows) / len(rows)),
        regex_parser_exact_match_by_template=parser_baseline(rows), **stats)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=3000)
    ap.add_argument("--heldout", type=int, default=300)
    ap.add_argument("--min-per-combo", type=int, default=300)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--heldout-seed", type=int, default=1007)
    ap.add_argument("--normal-share", type=float, default=.15, help="share of fully normal training reports (held-out stays .15)")
    ap.add_argument("--tiny", action="store_true", help="60 rows + 20 held-out, for a quick check")
    ap.add_argument("--out", type=Path, default=DATA)
    a = ap.parse_args()
    if a.tiny:
        a.rows, a.heldout, a.min_per_combo = 60, 20, 5
    a.out.mkdir(parents=True, exist_ok=True)

    stats = {}
    train, counts = build(random.Random(a.seed), a.rows, TEMPLATES, a.min_per_combo, (.75, .15, .10), a.normal_share, stats)
    check(train)
    seen = {norm(r["prompt"]) for r in train}
    hrng = random.Random(a.heldout_seed)
    heldout = []
    for i in range(a.heldout):  # a third of held-out reports use the two layouts training never sees
        templates = UNSEEN if i % 3 == 0 else TEMPLATES
        rows, _ = build(hrng, 1, templates, 0, (1, 0, 0), .15, {}, seen)
        heldout += rows
        seen.add(norm(rows[0]["prompt"]))
    check(heldout)

    missing = [c for c in COMBO_IDS if counts[c] < a.min_per_combo]
    crit_missing = [k for k in CRITICAL_KEYS if not any(f"critical:{k}" in r["gold"]["patterns"] for r in train if r["kind"] == "main")]
    import pandas as pd  # noqa: PLC0415
    pd.DataFrame([{"prompt": r["prompt"], "completion": r["completion"]} for r in train]).to_csv(a.out / "train.csv", index=False)
    with open(a.out / "train.jsonl", "w", encoding="utf-8") as f:
        for r in train:
            f.write(json.dumps({k: v for k, v in r.items() if k != "shown"}, ensure_ascii=False) + "\n")
    with open(a.out / "heldout.jsonl", "w", encoding="utf-8") as f:
        for i, r in enumerate(heldout):
            f.write(json.dumps(dict(id=f"h{i:03d}", prompt=r["prompt"], gold=r["gold"], lang=r["lang"], template=r["template"],
                                    unseen_template=r["template"] in UNSEEN, ocr=r["ocr"], sex_mode=r["sex_mode"],
                                    reference=r["completion"]), ensure_ascii=False) + "\n")
    with open(a.out / "showcase.jsonl", "w", encoding="utf-8") as f:
        for r in showcase():
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    summary = dict(train=summarise(train, counts, stats),
                   heldout=summarise(heldout, Counter(p for r in heldout for p in r["gold"]["patterns"]), {}),
                   combos_below_quota=missing, critical_keys_missing=crit_missing, min_per_combo=a.min_per_combo,
                   seeds=dict(train=a.seed, heldout=a.heldout_seed))
    (a.out / "stats.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"train: {len(train)} rows {summary['train']['kinds']}  languages {summary['train']['languages']}")
    print(f"held-out: {len(heldout)} reports ({sum(r['template'] in UNSEEN for r in heldout)} on unseen layouts)")
    print("pattern counts (main rows):", {c: counts[c] for c in COMBO_IDS})
    print("regex parser exact match:", summary["train"]["regex_parser_exact_match_by_template"])
    if missing or crit_missing:
        print(f"WARNING below quota: {missing}  critical keys never seen: {crit_missing}")
    print("All rows verified against analyze(). Wrote", a.out)


if __name__ == "__main__":
    main()
