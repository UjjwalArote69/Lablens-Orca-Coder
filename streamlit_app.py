import html
import os
import re
from pathlib import Path

import streamlit as st

# Streamlit Cloud secrets -> environment variables (SDKs read env vars).
try:
    for _k, _v in st.secrets.items():
        if isinstance(_v, (str, int, float)):
            os.environ.setdefault(_k, str(_v))
except Exception:  # noqa: BLE001
    pass

from lablens import ai  # noqa: E402
from lablens.knowledge import LANG_NAMES, explain, load_library  # noqa: E402
from lablens.parser import parse_report, pdf_to_text  # noqa: E402
from lablens.ranges import PANELS, TESTS  # noqa: E402
from lablens.rules import COMBOS, analyze  # noqa: E402

st.set_page_config(page_title="LabLens: read your lab report", page_icon="🩸", layout="wide")

ROOT = Path(__file__).parent
SAMPLES = {
    "Anita, 34 F: tired all the time": "anita_anemia_thyroid.txt",
    "Rajesh, 52 M: routine check-up": "rajesh_metabolic.txt",
    "Suresh, 61 M: emergency sample": "suresh_kidney_urgent.txt",
    "Priya, 29 F: annual wellness": "priya_healthy.txt",
}
SEVERITY = {
    "urgent": ("See a doctor today", "sev-urgent"),
    "review": ("Discuss with your doctor", "sev-review"),
    "watch": ("Keep an eye on", "sev-watch"),
}
ARROW = {"low": "↓", "high": "↑", "critical_low": "↓↓", "critical_high": "↑↑", "normal": ""}

st.markdown("""
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F2F5F7;--surface:#FFFFFF;--ink:#15212B;--muted:#5A6B78;--line:#D7E0E6;
--ok:#2E7D6B;--low:#2F5DA8;--high:#A35F00;--crit:#B42318;--band:#DCEEE8;}
html,body,[class*="css"],.stMarkdown,.stTextInput,.stButton,p,li,label{font-family:"Atkinson Hyperlegible",system-ui,sans-serif;}
.stApp{background:var(--bg);color:var(--ink);}
.block-container{max-width:1080px;padding-top:3.6rem;}
h1,h2,h3{font-family:"Atkinson Hyperlegible",system-ui,sans-serif;color:var(--ink);letter-spacing:-.01em;}
.brand{font-size:.95rem;color:var(--muted);margin-bottom:.2rem}
.brand b{color:var(--ink)}
.verdict{font-size:2.1rem;line-height:1.15;font-weight:700;margin:.2rem 0 .5rem;max-width:30ch}
.verdict.sev-urgent{color:var(--crit)} .verdict.sev-review{color:var(--high)} .verdict.sev-ok{color:var(--ok)}
.counts{color:var(--muted);font-size:1.05rem;margin-bottom:1.6rem}
.counts b{color:var(--ink);font-variant-numeric:tabular-nums}
.pattern{background:var(--surface);border:1px solid var(--line);border-left:6px solid var(--muted);
 border-radius:10px;padding:1rem 1.2rem;margin:0 0 .9rem}
.pattern.sev-urgent{border-left-color:var(--crit)} .pattern.sev-review{border-left-color:var(--high)}
.pattern.sev-watch{border-left-color:var(--low)}
.pattern .sev{font-size:.9rem;font-weight:700} .pattern.sev-urgent .sev{color:var(--crit)}
.pattern.sev-review .sev{color:var(--high)} .pattern.sev-watch .sev{color:var(--low)}
.pattern h4{margin:.15rem 0 .45rem;font-size:1.2rem}
.pattern p{margin:.2rem 0 .6rem;line-height:1.55;max-width:75ch}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:.12rem .6rem;margin:0 .35rem .3rem 0;
 font-size:.9rem;font-variant-numeric:tabular-nums;background:#F7FAFB}
.chip.low,.chip.critical_low{color:var(--low);border-color:#BFD0EA} .chip.high,.chip.critical_high{color:var(--high);border-color:#E8D2AE}
.panel-title{font-weight:700;margin:1.3rem 0 .3rem;color:var(--muted);font-size:.95rem}
.row{display:grid;grid-template-columns:minmax(150px,1.3fr) 110px minmax(160px,2fr) 110px;gap:.9rem;align-items:center;
 background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.55rem .9rem;margin-bottom:.35rem}
.row .nm{font-weight:700}.row .nm small{display:block;font-weight:400;color:var(--muted)}
.row .vl{font-size:1.25rem;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.vl.normal{color:var(--ink)}.vl.low,.vl.critical_low{color:var(--low)}.vl.high,.vl.critical_high{color:var(--high)}
.vl.critical_low,.vl.critical_high{color:var(--crit)}
.strip{position:relative;height:14px;background:#EEF2F4;border-radius:7px}
.strip .band{position:absolute;top:0;bottom:0;background:var(--band);border-left:2px solid #9CC9BB;border-right:2px solid #9CC9BB}
.strip .dot{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;transform:translate(-50%,-50%);
 border:3px solid var(--surface);box-shadow:0 0 0 1px var(--ink)}
.dot.normal{background:var(--ok)}.dot.low{background:var(--low)}.dot.high{background:var(--high)}
.dot.critical_low,.dot.critical_high{background:var(--crit)}
.row .rf{color:var(--muted);font-size:.9rem;font-variant-numeric:tabular-nums}
.note{color:var(--muted);font-size:.92rem;line-height:1.5;max-width:80ch}
@media (max-width:700px){.row{grid-template-columns:1fr 80px}.row .strip,.row .rf{grid-column:1/-1}.verdict{font-size:1.6rem}}
</style>""", unsafe_allow_html=True)


@st.cache_data(show_spinner=False)
def library():
    return load_library()


def detect_sex(text: str) -> str:
    t = text.lower()
    m = re.search(r"(?:sex|gender)[^\n]{0,20}?\b(female|male|f|m)\b", t) or re.search(r"\d+\s*y\w*\s*/\s*(f|m)\b", t)
    return "M" if m and m.group(1).startswith("m") else "F"


def strip_html(r) -> str:
    lo, hi, v = r.low, r.high, r.value
    if lo is not None and hi is not None:
        span = hi - lo
        dmin, dmax = max(0, lo - span * .7), hi + span * .7
    elif hi is not None:
        dmin, dmax = 0, hi * 1.7
    else:
        dmin, dmax = 0, (lo or 1) * 2.2
    dmin, dmax = min(dmin, v * .95), max(dmax, v * 1.05)
    pct = lambda x: 100 * (x - dmin) / (dmax - dmin)  # noqa: E731
    b0 = pct(lo) if lo is not None else 0
    b1 = pct(hi) if hi is not None else 100
    return (f'<div class="strip" aria-hidden="true"><div class="band" style="left:{b0:.1f}%;width:{b1 - b0:.1f}%"></div>'
            f'<div class="dot {r.status}" style="left:{min(max(pct(v), 2), 98):.1f}%"></div></div>')


def chip(r) -> str:
    return f'<span class="chip {r.status}">{html.escape(r.name)} {r.value:g} {html.escape(r.unit)} {ARROW[r.status]}</span>'


def summary_text(results, patterns) -> str:
    lines = [f"- {r.name}: {r.value:g} {r.unit} (range {r.range_text()}) {r.status.replace('_', ' ').upper()}"
             for r in results.values()]
    lines += [f"- PATTERN [{p.severity}]: {p.title}" for p in patterns]
    return "\n".join(lines)


lib, info = library()

# ------------------------------------------------------------------ sidebar
with st.sidebar:
    st.markdown("### Your report")
    source = st.radio("Where is it?", ["Try a sample", "Upload a file", "Paste text"], label_visibility="collapsed")
    text = ""
    if source == "Try a sample":
        pick = st.selectbox("Sample report", list(SAMPLES))
        text = (ROOT / "samples" / SAMPLES[pick]).read_text()
    elif source == "Upload a file":
        up = st.file_uploader("PDF or text file", type=["pdf", "txt"])
        if up is not None:
            data = up.read()
            text = pdf_to_text(data) if up.name.lower().endswith(".pdf") else data.decode("utf-8", "ignore")
    else:
        text = st.text_area("Paste the results section", height=220,
                            placeholder="Haemoglobin   9.1   g/dL   12.0 - 15.5")

    sex_guess = detect_sex(text) if text else "F"
    sex = st.radio("Use reference ranges for", ["Female", "Male"], index=0 if sex_guess == "F" else 1,
                   horizontal=True)[0]
    langs = info["languages"]
    lang = st.selectbox("Explanations in", langs, format_func=lambda c: LANG_NAMES.get(c, c))
    use_ai = st.toggle("Use AI to read messy reports", value=False, disabled=ai.provider() is None,
                       help="Turns on AI extraction. Ranges and flags are still decided by fixed rules.")

    st.divider()
    if info["source"] == "adaption":
        ev = info.get("eval") or {}
        sa, sb = ev.get("score_after"), ev.get("score_before")
        st.markdown("**Explanations built with Adaption**")
        if sa is not None and sb is not None:
            st.markdown(f"Quality score {sb:.1f} → **{sa:.1f}**"
                        + (f" (+{ev['improvement_percent']:.0f}%)" if ev.get("improvement_percent") else ""))
        st.caption(f"{info['adapted_rows']} grounded explanations, {len(langs)} languages")
    else:
        st.caption("Explanations: built-in drafts. Run `adaption_build.py` to ground and translate them with Adaption.")

# ------------------------------------------------------------------ main
st.markdown('<div class="brand"><b>LabLens</b>, a medical report analyzer</div>', unsafe_allow_html=True)
tab_report, tab_how = st.tabs(["Report", "How it works"])

with tab_report:
    if not text.strip():
        st.markdown("## Upload a lab report to see what's out of range")
        st.markdown('<p class="note">LabLens reads blood count, sugar, kidney, liver, lipid, thyroid and vitamin results, '
                    "checks each against adult reference ranges, and points out combinations that matter together. "
                    "Pick a sample from the sidebar to try it.</p>", unsafe_allow_html=True)
        st.stop()

    values = parse_report(text)
    if use_ai and ai.provider():
        try:
            with st.spinner("Reading the report with AI"):
                values = {**ai.extract_values(text), **values}
        except Exception as e:  # noqa: BLE001
            st.warning(f"AI reading failed, so only the standard reader was used. {e}")
    if not values:
        st.error("No results recognised. Check that the text includes test names and values, "
                 "for example “Haemoglobin 9.1 g/dL”, or turn on AI reading.")
        st.stop()

    results, patterns = analyze(values, sex)
    abnormal = [r for r in results.values() if r.abnormal]
    critical = [r for r in results.values() if r.critical]
    worst = patterns[0].severity if patterns else ("watch" if abnormal else None)
    verdict, vclass = {
        "urgent": ("Some results need a doctor today.", "sev-urgent"),
        "review": ("A few results are worth discussing with your doctor.", "sev-review"),
        "watch": ("Mostly fine, with a couple of things to keep an eye on.", ""),
        None: ("Everything we could read is within the reference range.", "sev-ok"),
    }[worst]
    st.markdown(f'<div class="verdict {vclass}">{verdict}</div>', unsafe_allow_html=True)
    st.markdown(
        f'<div class="counts">We read <b>{len(results)}</b> results. <b>{len(abnormal)}</b> are outside the reference range'
        + (f', <b>{len(critical)}</b> at a critical level' if critical else "")
        + (f", and they form <b>{len(patterns)}</b> pattern{'s' if len(patterns) != 1 else ''} worth a closer look." if patterns else ".")
        + "</div>", unsafe_allow_html=True)

    if patterns:
        st.markdown("### Results that matter together")
        for p in patterns:
            label, cls = SEVERITY[p.severity]
            key = f"combo:{p.id}" if not p.id.startswith("critical:") else f"test:{p.evidence[0]}:{results[p.evidence[0]].direction}"
            body = explain(lib, key, lang)
            chips = "".join(chip(results[k]) for k in p.evidence)
            note = f'<p class="note">{html.escape(p.note)}</p>' if p.note else ""
            st.markdown(f'<div class="pattern {cls}"><div class="sev">{label}</div><h4>{html.escape(p.title)}</h4>'
                        f'<p>{html.escape(body)}</p>{note}<div>{chips}</div></div>', unsafe_allow_html=True)

    st.markdown("### Every result")
    only_flags = st.toggle("Show only results outside the range", value=False)
    for panel in PANELS:
        rows = [r for r in results.values() if r.panel == panel and (r.abnormal or not only_flags)]
        if not rows:
            continue
        st.markdown(f'<div class="panel-title">{panel}</div>', unsafe_allow_html=True)
        for r in rows:
            st.markdown(f'<div class="row"><div class="nm">{html.escape(r.name)}<small>{html.escape(r.unit)}</small></div>'
                        f'<div class="vl {r.status}">{r.value:g} {ARROW[r.status]}</div>{strip_html(r)}'
                        f'<div class="rf">range {r.range_text()}</div></div>', unsafe_allow_html=True)
            if r.abnormal:
                with st.expander(f"What a {r.direction} {r.name} can mean"):
                    st.write(explain(lib, f"test:{r.key}:{r.direction}", lang))

    st.markdown("### Ask about this report")
    if ai.provider():
        q = st.text_input("Your question", placeholder="Which result should I worry about first?")
        if st.button("Get an answer", type="primary") and q.strip():
            with st.spinner("Checking the explanation library"):
                try:
                    st.info(ai.ask(q, summary_text(results, patterns), LANG_NAMES.get(lang, "English")))
                except Exception as e:  # noqa: BLE001
                    st.error(f"The assistant could not answer: {e}")
                finally:
                    ai.flush()
    else:
        st.caption("Set ADAPTION_API_KEY and ADAPTION_MODEL to ask questions, answered by Adaption's inference "
                   "gateway and grounded in the adapted explanation dataset.")

    md = ["# LabLens summary", "", f"**{verdict}**", ""]
    md += [f"- **{p.title}** ({SEVERITY[p.severity][0]})" for p in patterns]
    md += ["", "| Test | Value | Range | Status |", "|---|---|---|---|"]
    md += [f"| {r.name} | {r.value:g} {r.unit} | {r.range_text()} | {r.status.replace('_', ' ')} |" for r in results.values()]
    md += ["", "_Not a diagnosis. Reference ranges vary between labs; please review these results with your doctor._"]
    st.download_button("Download summary for your doctor", "\n".join(md), file_name="lablens-summary.md")

    st.markdown('<p class="note" style="margin-top:1.5rem">LabLens is not a diagnosis. Reference ranges are typical adult '
                "values and differ slightly between labs, so compare with the range printed on your report. "
                "If you feel unwell, contact a doctor whatever these results say.</p>", unsafe_allow_html=True)

with tab_how:
    st.markdown("### How LabLens decides what to flag")
    st.markdown(f"""
1. **Read.** A pattern reader matches {sum(len(t['aliases']) for t in TESTS.values())} test-name spellings used by Indian labs
   (Haemoglobin, SGPT, TLC, lakhs/cumm...) across {len(TESTS)} tests. Optional AI reading handles messy PDFs.
2. **Check ranges.** Each value is compared with sex-specific adult reference ranges and critical limits. No AI is
   involved, so every flag can be traced to a number.
3. **Find combinations.** {len(COMBOS)} written rules look for results that mean more together:
   iron-deficiency anemia, kidney decline with high potassium, metabolic syndrome, thyroid patterns and others.
4. **Explain.** Each flag links to a patient-language explanation from a library built with **Adaption Adaptive Data**.
""")
    st.markdown("### What Adaption does here")
    st.markdown("""
- **Grounds every explanation** with web-search hallucination mitigation, so text shown to patients is checked
  against published sources instead of being generated live.
- **Applies a patient-safety blueprint**: plain words, no diagnoses, no medicine doses, always refer to a doctor.
- **Runs safety analysis** on every generated explanation.
- **Localizes** the library for India (Hindi, Marathi), so explanations are available beyond English.
- **Scores data quality** before and after adaptation (shown below).
- **Answers questions** through Adaption's inference gateway, with `file_search` over the adapted dataset.
""")
    ev = info.get("eval")
    if info["source"] == "adaption" and ev:
        c1, c2, c3 = st.columns(3)
        c1.metric("Quality before", f"{ev.get('score_before', 0):.1f}", ev.get("grade_before"))
        c2.metric("Quality after", f"{ev.get('score_after', 0):.1f}", ev.get("grade_after"))
        c3.metric("Improvement", f"{ev.get('improvement_percent', 0):.0f}%")
    elif info["source"] == "adaption":
        st.caption(f"Adapted library loaded: {info['adapted_rows']} rows. Evaluation not available yet.")
    else:
        st.caption("Adapted library not loaded yet. The app is showing the seed drafts.")
    if info.get("error"):
        st.warning(info["error"])
    with st.expander("Dataset details"):
        st.json({k: v for k, v in info.items() if k != "eval"})
