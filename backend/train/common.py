"""Shared by the dataset generator and the evaluator: the exact LabLens Reader completion
format, its Hindi/Marathi wording, and the machine-checkable JSON block it ends with.

Labels always come from `lablens.rules.analyze`, so the engine stays the source of truth.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from lablens.ranges import TESTS  # noqa: E402
from lablens.rules import COMBOS, analyze  # noqa: E402

TRAIN = Path(__file__).resolve().parent
DATA = TRAIN / "data"
LANGS = ("en", "hi", "mr")
LANG_NAME = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
COMBO_IDS = [c[0] for c in COMBOS]
TEST_ORDER = {k: i for i, k in enumerate(TESTS)}  # TESTS is already grouped in PANELS order
ARROW = {"low": "↓", "high": "↑", "critical_low": "↓↓", "critical_high": "↑↑", "normal": ""}
SEVERITY_ORDER = ("urgent", "review", "watch", "ok")

# English lines match main.py, so the model speaks like the app. Hindi and Marathi are drafts to proofread.
T = {
    "en": dict(
        h_verdict="Verdict", h_outside="Results outside the reference range", h_together="Results that matter together",
        h_means="What this means", h_next="What to do next",
        verdict=dict(urgent="Some results need a doctor today.",
                     review="A few results are worth discussing with your doctor.",
                     watch="Mostly fine, with a couple of things to keep an eye on.",
                     ok="Everything we could read is within the reference range."),
        label=dict(urgent="See a doctor today", review="Discuss with your doctor", watch="Keep an eye on"),
        next=dict(urgent="See a doctor today. If you feel very unwell, call 108 or 112.",
                  review="Book a visit with your doctor in the next few days and take this report with you.",
                  watch="Keep an eye on these results and mention them at your next check-up.",
                  ok="Nothing extra is needed now; keep up your routine check-ups."),
        all_in_range="All the results we could read are within the reference range.",
        normal_means=("Every test we could read falls inside the usual adult reference range. "
                      "One report is only a snapshot, so read it together with how you feel."),
        reference="reference", critical="critical", normal="normal", upto="up to {h}", ormore="{l} or more",
        disclaimer="_LabLens is not a diagnosis. Compare with the range printed on your report._",
    ),
    "hi": dict(
        h_verdict="निष्कर्ष", h_outside="संदर्भ सीमा से बाहर के परिणाम", h_together="जिन परिणामों को साथ में देखना ज़रूरी है",
        h_means="इसका क्या मतलब है", h_next="आगे क्या करें",
        verdict=dict(urgent="कुछ परिणामों के लिए आज ही डॉक्टर को दिखाना ज़रूरी है।",
                     review="कुछ परिणामों के बारे में अपने डॉक्टर से बात करना अच्छा रहेगा।",
                     watch="ज़्यादातर परिणाम ठीक हैं, बस कुछ बातों पर नज़र रखें।",
                     ok="जो भी परिणाम पढ़े जा सके, वे सभी संदर्भ सीमा के अंदर हैं।"),
        label=dict(urgent="आज ही डॉक्टर को दिखाएं", review="अपने डॉक्टर से चर्चा करें", watch="नज़र रखें"),
        next=dict(urgent="आज ही डॉक्टर को दिखाएं। अगर तबीयत बहुत खराब लगे, तो 108 या 112 पर कॉल करें।",
                  review="अगले कुछ दिनों में डॉक्टर से मिलें और यह रिपोर्ट साथ ले जाएं।",
                  watch="इन परिणामों पर नज़र रखें और अगली जांच के समय डॉक्टर को बताएं।",
                  ok="अभी कुछ अलग करने की ज़रूरत नहीं है; नियमित जांच करवाते रहें।"),
        all_in_range="पढ़े गए सभी परिणाम संदर्भ सीमा के अंदर हैं।",
        normal_means=("पढ़े गए सभी टेस्ट सामान्य वयस्क संदर्भ सीमा के अंदर हैं। "
                      "एक रिपोर्ट सिर्फ़ उस समय की तस्वीर होती है, इसलिए इसे अपनी सेहत के साथ मिलाकर देखें।"),
        reference="संदर्भ", critical="गंभीर स्तर", normal="सामान्य", upto="{h} तक", ormore="{l} या अधिक",
        disclaimer="_LabLens निदान नहीं है। अपनी रिपोर्ट पर छपी सीमा से मिलान करें।_",
    ),
    "mr": dict(
        h_verdict="निष्कर्ष", h_outside="संदर्भ मर्यादेबाहेरील निकाल", h_together="एकत्र पाहणे आवश्यक असलेले निकाल",
        h_means="याचा अर्थ काय", h_next="पुढे काय करावे",
        verdict=dict(urgent="काही निकालांसाठी आजच डॉक्टरांना भेटणे आवश्यक आहे.",
                     review="काही निकालांबद्दल तुमच्या डॉक्टरांशी चर्चा करणे योग्य ठरेल.",
                     watch="बहुतेक निकाल ठीक आहेत, फक्त काही गोष्टींवर लक्ष ठेवा.",
                     ok="वाचता आलेले सर्व निकाल संदर्भ मर्यादेत आहेत."),
        label=dict(urgent="आजच डॉक्टरांना भेटा", review="तुमच्या डॉक्टरांशी चर्चा करा", watch="लक्ष ठेवा"),
        next=dict(urgent="आजच डॉक्टरांना भेटा. तब्येत खूप बिघडल्यासारखी वाटल्यास 108 किंवा 112 वर कॉल करा.",
                  review="पुढील काही दिवसांत डॉक्टरांना भेटा आणि हा रिपोर्ट सोबत घेऊन जा.",
                  watch="या निकालांवर लक्ष ठेवा आणि पुढच्या तपासणीच्या वेळी डॉक्टरांना सांगा.",
                  ok="सध्या वेगळे काही करण्याची गरज नाही; नियमित तपासणी करत रहा."),
        all_in_range="वाचलेले सर्व निकाल संदर्भ मर्यादेत आहेत.",
        normal_means=("वाचलेल्या सर्व चाचण्या प्रौढांच्या सामान्य संदर्भ मर्यादेत आहेत. "
                      "एक रिपोर्ट म्हणजे फक्त त्या वेळेचे चित्र असते, त्यामुळे तो तुमच्या तब्येतीसोबत पाहा."),
        reference="संदर्भ", critical="गंभीर पातळी", normal="सामान्य", upto="{h} पर्यंत", ormore="{l} किंवा अधिक",
        disclaimer="_LabLens हे निदान नाही. तुमच्या रिपोर्टवर छापलेल्या मर्यादेशी तुलना करा._",
    ),
}

_SENTENCE = re.compile(r"(?<=[.!?।])\s+")
_lib = None


def library() -> dict:
    """Adaption-adapted explanations ({id: {lang: text}}), loaded once."""
    global _lib
    if _lib is None:
        from lablens.knowledge import load_library
        _lib, _ = load_library()
    return _lib


def num(v: float):
    return int(v) if float(v).is_integer() else v


def analysis(values: dict, sex: str):
    """(results, patterns, verdict level) exactly as the app computes them."""
    results, patterns = analyze(values, sex)
    verdict = patterns[0].severity if patterns else ("watch" if any(r.abnormal for r in results.values()) else "ok")
    return results, patterns, verdict


def gold(values: dict, sex: str) -> dict:
    """The JSON block a correct answer must contain."""
    results, patterns, verdict = analysis(values, sex)
    ordered = sorted(results.values(), key=lambda r: TEST_ORDER[r.key])
    return {"sex": sex, "values": {r.key: num(r.value) for r in ordered},
            "abnormal": {r.key: r.status for r in ordered if r.abnormal},
            "patterns": [p.id for p in patterns], "verdict": verdict}


def explanation_id(p, results) -> str:
    if p.id.startswith("critical:"):
        k = p.evidence[0]
        return f"test:{k}:{results[k].direction}"
    return f"combo:{p.id}"


def range_text(r, lang: str) -> str:
    t = T[lang]
    if r.low is not None and r.high is not None:
        return f"{r.low:g}–{r.high:g}"
    if r.high is not None:
        return t["upto"].format(h=f"{r.high:g}")
    if r.low is not None:
        return t["ormore"].format(l=f"{r.low:g}")
    return "—"


def evidence_text(keys, results, lang: str) -> str:
    out = []
    for k in keys:
        r = results[k]
        out.append(f"{r.name} {ARROW[r.status]}" if r.abnormal else f"{r.name} ({T[lang]['normal']})")
    return ", ".join(out)


def sentences(text: str, n: int) -> list[str]:
    return [s for s in _SENTENCE.split(text.strip()) if s][:n]


def explanation_ids(results, patterns) -> list[str]:
    """Patterns first (most severe first), then abnormal results no pattern covers."""
    ids, covered = [], set()
    for p in patterns:
        ids.append(explanation_id(p, results))
        covered.update(p.evidence)
    for r in sorted(results.values(), key=lambda r: TEST_ORDER[r.key]):
        if r.abnormal and r.key not in covered:
            ids.append(f"test:{r.key}:{r.direction}")
    return list(dict.fromkeys(ids))


def what_this_means(results, patterns, lang: str, stats: dict | None = None) -> str:
    """2–5 sentences of the adapted explanations, in `lang`, never mixing languages."""
    if not any(r.abnormal for r in results.values()):
        return T[lang]["normal_means"]
    lib = library()
    ids = explanation_ids(results, patterns)
    usable = [i for i in ids if lib.get(i, {}).get(lang)]
    if not usable:  # no adapted text in this language for any item: fall back to English rather than invent
        if stats is not None:
            stats["explanation_fallback_en"] = stats.get("explanation_fallback_en", 0) + 1
        lang, usable = "en", [i for i in ids if lib.get(i, {}).get("en")]
    picked = sentences(lib[usable[0]][lang], 3)
    if len(usable) > 1:
        picked += sentences(lib[usable[1]][lang], 2)
    return " ".join(picked[:5])


def completion(values: dict, sex: str, lang: str, stats: dict | None = None) -> str:
    """The exact LabLens Reader answer for a report whose true values are `values`."""
    t = T[lang]
    results, patterns, verdict = analysis(values, sex)
    rows = sorted((r for r in results.values() if r.abnormal), key=lambda r: TEST_ORDER[r.key])
    out = [f"**{t['h_verdict']}:** {t['verdict'][verdict]}", "", f"**{t['h_outside']}**"]
    if rows:
        out += [f"- {r.name}: {r.value:g} {r.unit} {ARROW[r.status]} ({t['reference']} {range_text(r, lang)})"
                + (f" — {t['critical']}" if r.critical else "") for r in rows]
    else:
        out.append(t["all_in_range"])
    if patterns:
        out += ["", f"**{t['h_together']}**"]
        out += [f"- [{t['label'][p.severity]}] {p.title}: {evidence_text(p.evidence, results, lang)}" for p in patterns]
    out += ["", f"**{t['h_means']}**", what_this_means(results, patterns, lang, stats),
            "", f"**{t['h_next']}**", t["next"][verdict], "", t["disclaimer"], "",
            "```json", json.dumps(gold(values, sex), ensure_ascii=False, separators=(",", ":")), "```"]
    return "\n".join(out)


_BLOCK = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.S)


def parse_block(text: str) -> dict | None:
    """The trailing JSON block of an answer, or None when it is missing or invalid."""
    text = text or ""
    candidates = _BLOCK.findall(text)
    if candidates:
        try:
            d = json.loads(candidates[-1])
            return d if isinstance(d, dict) else None
        except ValueError:
            pass
    dec = json.JSONDecoder()
    for m in reversed(list(re.finditer(r"\{", text))[-40:]):
        try:
            d, _ = dec.raw_decode(text[m.start():])
        except ValueError:
            continue
        if isinstance(d, dict) and "values" in d:
            return d
    return None
