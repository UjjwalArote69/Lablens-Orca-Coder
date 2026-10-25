"""Deterministic flagging. No AI decides what is abnormal: every flag is traceable
to a reference range or a written combination rule below."""
from __future__ import annotations

from dataclasses import dataclass, field

from .ranges import TESTS, bound

SEVERITY_ORDER = {"urgent": 0, "review": 1, "watch": 2}


@dataclass
class Result:
    key: str
    name: str
    value: float
    unit: str
    panel: str
    low: float | None
    high: float | None
    status: str  # normal | low | high | critical_low | critical_high

    @property
    def abnormal(self):
        return self.status != "normal"

    @property
    def critical(self):
        return self.status.startswith("critical")

    @property
    def direction(self):
        return "low" if self.status.endswith("low") else "high" if self.status.endswith("high") else None

    def range_text(self):
        if self.low is not None and self.high is not None:
            return f"{self.low:g}–{self.high:g}"
        if self.high is not None:
            return f"up to {self.high:g}"
        if self.low is not None:
            return f"{self.low:g} or more"
        return "—"


@dataclass
class Pattern:
    id: str
    title: str
    severity: str
    evidence: list = field(default_factory=list)  # test keys that triggered it
    note: str = ""


def evaluate(values: dict, sex: str = "F") -> dict:
    out = {}
    for key, value in values.items():
        t = TESTS[key]
        lo, hi = bound(t["low"], sex), bound(t["high"], sex)
        status = "normal"
        if t["crit_low"] is not None and value < t["crit_low"]:
            status = "critical_low"
        elif t["crit_high"] is not None and value > t["crit_high"]:
            status = "critical_high"
        elif lo is not None and value < lo:
            status = "low"
        elif hi is not None and value > hi:
            status = "high"
        out[key] = Result(key, t["name"], value, t["unit"], t["panel"], lo, hi, status)
    return out


# ---------------------------------------------------------------------------
# Combination rules. Each returns (evidence_keys, note) when it fires, else None.
# ---------------------------------------------------------------------------
def _lo(r, k): return k in r and r[k].direction == "low"
def _hi(r, k): return k in r and r[k].direction == "high"
def _ok(r, k): return k in r and r[k].status == "normal"
def _v(r, k): return r[k].value if k in r else None


def _pancytopenia(r):
    if _lo(r, "hb") and _lo(r, "wbc") and _lo(r, "plt"):
        return ["hb", "wbc", "plt"], ""

def _kidney_potassium(r):
    if _hi(r, "creat") and _hi(r, "k"):
        return ["creat", "k"] + (["urea"] if _hi(r, "urea") else []), ""

def _kidney(r):
    waste = [k for k in ("urea", "bun") if _hi(r, k)]
    if _hi(r, "creat") and waste:
        return ["creat"] + waste, ""

def _liver_jaundice(r):
    enz = [k for k in ("alt", "ast") if _hi(r, k)]
    if enz and _hi(r, "bili"):
        return enz + ["bili"], ""

def _liver_enzymes(r):
    if _hi(r, "alt") and _hi(r, "ast") and not _hi(r, "bili"):
        return ["alt", "ast"], ""

def _iron_def(r):
    if _lo(r, "hb") and _lo(r, "mcv"):
        ev = ["hb", "mcv"] + (["ferritin"] if _lo(r, "ferritin") else [])
        note = "Low ferritin supports this." if "ferritin" in ev else (
            "A ferritin test would confirm it." if "ferritin" not in r else "")
        return ev, note

def _b12_anemia(r):
    if _lo(r, "hb") and _hi(r, "mcv"):
        ev = ["hb", "mcv"] + (["b12"] if _lo(r, "b12") else [])
        return ev, "Low vitamin B12 supports this." if "b12" in ev else ""

def _renal_anemia(r):
    if _lo(r, "hb") and _hi(r, "creat"):
        return ["hb", "creat"], ""

def _diabetes(r):
    f, a = _v(r, "fbs"), _v(r, "hba1c")
    if f is not None and a is not None and f >= 126 and a >= 6.5:
        return ["fbs", "hba1c"], f"Fasting glucose {f:g} mg/dL and HbA1c {a:g}% are both at or above diabetes cut-offs (126 mg/dL and 6.5%)."

def _prediabetes(r):
    f, a = _v(r, "fbs"), _v(r, "hba1c")
    if _diabetes(r):
        return None
    ev = []
    if f is not None and 100 <= f < 126: ev.append("fbs")
    if a is not None and 5.7 <= a < 6.5: ev.append("hba1c")
    if f is not None and f >= 126: ev.append("fbs")
    if a is not None and a >= 6.5: ev.append("hba1c")
    if ev:
        return sorted(set(ev)), ""

def _metabolic(r):
    sugar = [k for k in ("fbs", "hba1c") if _hi(r, k)]
    if _hi(r, "tg") and _lo(r, "hdl") and sugar:
        return ["tg", "hdl"] + sugar, ""

def _atherogenic(r):
    if _hi(r, "ldl") and (_lo(r, "hdl") or _hi(r, "tg")):
        return ["ldl"] + [k for k in ("hdl", "tg") if _lo(r, k) or _hi(r, k)], ""

def _hypothyroid(r):
    if _hi(r, "tsh") and _lo(r, "ft4"):
        return ["tsh", "ft4"], ""

def _subclinical_hypo(r):
    if _hi(r, "tsh") and _ok(r, "ft4"):
        return ["tsh", "ft4"], ""

def _hyperthyroid(r):
    if _lo(r, "tsh") and _hi(r, "ft4"):
        return ["tsh", "ft4"], ""

def _infection(r):
    if _hi(r, "wbc") and _hi(r, "crp"):
        return ["wbc", "crp"], ""

def _dehydration(r):
    waste = [k for k in ("urea", "bun") if _hi(r, k)]
    if waste and _ok(r, "creat") and _hi(r, "na"):
        return waste + ["creat", "na"], ""

def _gout_kidney(r):
    if _hi(r, "uric") and _hi(r, "creat"):
        return ["uric", "creat"], ""


COMBOS = [
    # id, title, severity, fn, seed explanation (draft; improved by Adaption)
    ("pancytopenia", "Low counts across red cells, white cells and platelets", "urgent", _pancytopenia,
     "All three blood cell types are low together. This can happen with severe infections, vitamin B12 or folate deficiency, some medicines, or problems in the bone marrow where blood cells are made. It needs prompt review by a doctor."),
    ("kidney_potassium", "Reduced kidney clearance with high potassium", "urgent", _kidney_potassium,
     "High creatinine suggests the kidneys are filtering less well, and high potassium can build up when they do. High potassium can affect heart rhythm, so this combination should be checked by a doctor the same day."),
    ("liver_jaundice", "Liver enzymes raised together with bilirubin", "urgent", _liver_jaundice,
     "Raised liver enzymes with raised bilirubin suggest the liver is inflamed or bile flow is blocked. Causes include viral hepatitis, alcohol, medicines and gallstones. This should be reviewed by a doctor soon."),
    ("liver_enzymes", "Liver enzymes raised together", "review", _liver_enzymes,
     "ALT and AST both rising points to irritation of liver cells. In India the most common causes are fatty liver, alcohol, viral hepatitis and some medicines. A doctor may suggest an ultrasound or repeat tests."),
    ("kidney", "Kidney filtration markers raised together", "review", _kidney,
     "Creatinine and urea both clear through the kidneys, so when both are high it points to reduced kidney filtration. Dehydration can do this too. A doctor may repeat the test and check your eGFR and urine."),
    ("renal_anemia", "Anemia alongside reduced kidney function", "review", _renal_anemia,
     "The kidneys make a hormone that tells the body to produce red blood cells. When kidney function drops, anemia often follows. A doctor can check whether these two results are linked."),
    ("iron_def", "Pattern of iron-deficiency anemia", "review", _iron_def,
     "Low hemoglobin with small red blood cells is the typical pattern of iron-deficiency anemia, the most common anemia in India. Thalassemia trait can look similar. A doctor will look for the cause, such as diet or blood loss."),
    ("b12_anemia", "Pattern of B12 or folate-deficiency anemia", "review", _b12_anemia,
     "Low hemoglobin with large red blood cells is typical of vitamin B12 or folate deficiency. This is common with vegetarian diets and with some medicines like metformin. Treatment is usually simple once the cause is confirmed."),
    ("diabetes", "Blood sugar results in the diabetes range", "review", _diabetes,
     "When fasting glucose and HbA1c are both in the diabetes range, it strongly suggests diabetes. A doctor will confirm the diagnosis and discuss diet, activity and medicines. Early control lowers the risk of complications."),
    ("prediabetes", "Blood sugar above normal", "watch", _prediabetes,
     "Your sugar results are above the normal range but do not meet the full diabetes criteria on both tests. This is often called prediabetes, and lifestyle changes can bring it back to normal."),
    ("metabolic", "Metabolic syndrome pattern", "review", _metabolic,
     "High triglycerides, low HDL and raised blood sugar often appear together as metabolic syndrome. This combination raises the risk of heart disease and diabetes more than any single result."),
    ("atherogenic", "Cholesterol pattern linked to heart risk", "watch", _atherogenic,
     "High LDL together with low HDL or high triglycerides increases the build-up of fat in arteries. A doctor may estimate your overall heart risk and suggest diet, exercise or medicines."),
    ("hypothyroid", "Underactive thyroid pattern", "review", _hypothyroid,
     "High TSH with low free T4 is the typical pattern of an underactive thyroid (hypothyroidism). It is common and treatable with a daily tablet."),
    ("subclinical_hypo", "Mildly underactive thyroid pattern", "watch", _subclinical_hypo,
     "TSH is high but free T4 is still normal. This is often called subclinical hypothyroidism. Doctors usually repeat the test in a few weeks before deciding on treatment."),
    ("hyperthyroid", "Overactive thyroid pattern", "review", _hyperthyroid,
     "Low TSH with high free T4 is the typical pattern of an overactive thyroid (hyperthyroidism). It can cause a fast heartbeat, weight loss and anxiety, and should be reviewed by a doctor."),
    ("infection", "Signs of active infection or inflammation", "review", _infection,
     "High white cells together with high CRP usually mean the body is fighting an infection or significant inflammation. A doctor will match this with your symptoms, such as fever."),
    ("dehydration", "Pattern suggesting dehydration", "watch", _dehydration,
     "High urea and sodium with normal creatinine is often seen when the body is short of water. Drinking enough fluids and repeating the test usually clarifies it."),
    ("gout_kidney", "High uric acid with reduced kidney clearance", "watch", _gout_kidney,
     "The kidneys clear uric acid, so it can rise when kidney function drops. Together these raise the risk of gout and kidney stones."),
]


def find_patterns(results: dict) -> list:
    pats = []
    for cid, title, sev, fn, _ in COMBOS:
        hit = fn(results)
        if hit:
            ev, note = hit
            pats.append(Pattern(cid, title, sev, [k for k in ev if k in results], note))
    # Any critical single value is urgent on its own.
    for r in results.values():
        if r.critical:
            pats.append(Pattern(f"critical:{r.key}", f"{r.name} at a critical level", "urgent", [r.key],
                                "Values this far outside the range usually need same-day medical attention."))
    pats.sort(key=lambda p: SEVERITY_ORDER[p.severity])
    return pats


def analyze(values: dict, sex: str = "F"):
    results = evaluate(values, sex)
    return results, find_patterns(results)
