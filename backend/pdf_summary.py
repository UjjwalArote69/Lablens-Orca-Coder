"""One-page PDF summary of an analysis, for the patient to take to their doctor.

Built from the analysis the API already returned, so it works the same for samples,
pasted text and uploaded files. Uses Atkinson Hyperlegible (SIL Open Font License,
see fonts/OFL.txt), the same face as the web app.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace

FONTS = Path(__file__).resolve().parent / "fonts"
FONT = "Atkinson"

INK = (19, 32, 58)
SLATE = (86, 101, 125)
RULE = (220, 227, 236)
WELL = (243, 246, 250)
COLORS = {
    "normal": INK, "low": (37, 87, 214), "high": (166, 90, 0),
    "critical_low": (196, 50, 31), "critical_high": (196, 50, 31),
}
SEVERITY_COLORS = {"urgent": (196, 50, 31), "review": (166, 90, 0), "watch": (37, 87, 214)}
VERDICT_COLORS = {"urgent": (196, 50, 31), "review": (166, 90, 0), "watch": INK, "ok": (30, 127, 92)}
STATUS_WORDS = {"normal": "Normal", "low": "Low", "high": "High",
                "critical_low": "Critical low", "critical_high": "Critical high"}
DISCLAIMER = ("LabLens is not a diagnosis. Reference ranges are typical adult values and differ slightly between "
              "labs, so compare with the range printed on the original report.")
IST = timezone(timedelta(hours=5, minutes=30))


class _Summary(FPDF):
    def footer(self):
        self.set_y(-13)
        self.set_font(FONT, size=8)
        self.set_text_color(*SLATE)
        self.cell(0, 5, "LabLens summary. Not a diagnosis.")
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")


def _counts_sentence(c: dict) -> str:
    s = f"We read {c['read']} result{'' if c['read'] == 1 else 's'}. "
    if c["abnormal"] == 0:
        return s + "All of them are within the reference range."
    s += f"{c['abnormal']} {'is' if c['abnormal'] == 1 else 'are'} outside the reference range"
    if c["critical"]:
        s += f", {c['critical']} at a critical level"
    if c["patterns"]:
        s += f", and they form {c['patterns']} pattern{'' if c['patterns'] == 1 else 's'} worth a closer look."
    return s + ("" if c["patterns"] else ".")


def build_summary_pdf(a: dict, source: str = "") -> bytes:
    pdf = _Summary(format="A4")
    pdf.set_margins(18, 14, 18)
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_font(FONT, "", str(FONTS / "AtkinsonHyperlegible-Regular.ttf"))
    pdf.add_font(FONT, "B", str(FONTS / "AtkinsonHyperlegible-Bold.ttf"))
    pdf.set_title("LabLens summary")
    pdf.set_author("LabLens")
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    # Masthead
    pdf.set_font(FONT, "B", 20)
    pdf.set_text_color(*INK)
    pdf.cell(width / 2, 9, "LabLens")
    pdf.set_font(FONT, size=10)
    pdf.set_text_color(*SLATE)
    pdf.cell(width / 2, 9, "Summary for your doctor", align="R", new_x="LMARGIN", new_y="NEXT")
    sex = "female" if a["sex"] == "F" else "male"
    meta = f"Prepared {datetime.now(IST):%d %b %Y}. Reference ranges used: {sex} adult."
    pdf.multi_cell(0, 5, f"{source}. {meta}" if source else meta, align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y() + 3, pdf.w - pdf.r_margin, pdf.get_y() + 3)
    pdf.ln(7)

    # Verdict, with a bar in its colour
    color = VERDICT_COLORS.get(a["verdict"]["level"], INK)
    top = pdf.get_y()
    pdf.set_x(pdf.l_margin + 5)
    pdf.set_font(FONT, "B", 17)
    pdf.set_text_color(*color)
    pdf.multi_cell(width - 5, 8, a["verdict"]["text"], align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(pdf.l_margin + 5)
    pdf.set_font(FONT, size=11)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(width - 5, 6, _counts_sentence(a["counts"]), align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.set_fill_color(*color)
    pdf.rect(pdf.l_margin, top + 1, 1.6, pdf.get_y() - top - 1, style="F")
    pdf.set_fill_color(255, 255, 255)  # the table below would otherwise inherit this fill
    pdf.ln(5)

    # Patterns
    if a["patterns"]:
        _heading(pdf, "Results that matter together")
        for p in a["patterns"]:
            pdf.set_font(FONT, "B", 9)
            pdf.set_text_color(*SEVERITY_COLORS.get(p["severity"], INK))
            pdf.cell(0, 4.5, p["severity_label"], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(FONT, "B", 11)
            pdf.set_text_color(*INK)
            pdf.multi_cell(0, 5.5, p["title"], align="L", new_x="LMARGIN", new_y="NEXT")
            evidence = "; ".join(f"{e['name']} {e['value']:g} {e['unit']} ({STATUS_WORDS[e['status']].lower()})"
                                 for e in p["evidence"])
            pdf.set_font(FONT, size=10)
            pdf.set_text_color(*SLATE)
            pdf.multi_cell(0, 4.8, evidence, align="L", new_x="LMARGIN", new_y="NEXT")
            if p.get("note"):
                pdf.multi_cell(0, 4.8, p["note"], align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
        pdf.ln(2)

    # Every result, grouped by panel
    _heading(pdf, "Every result")
    pdf.set_font(FONT, size=10)
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.2)
    with pdf.table(
        width=width,
        col_widths=(62, 24, 26, 32, 30),
        text_align=("LEFT", "RIGHT", "LEFT", "LEFT", "LEFT"),
        borders_layout="HORIZONTAL_LINES",
        headings_style=FontFace(emphasis="BOLD", color=SLATE, fill_color=(255, 255, 255)),
        cell_fill_mode="NONE",
        line_height=5,
        padding=(0.6, 2),
    ) as table:
        head = table.row()
        for h in ("Test", "Result", "Unit", "Reference range", "Status"):
            head.cell(h)
        for panel in a["panels"]:
            row = table.row()
            row.cell(panel, colspan=5, style=FontFace(emphasis="BOLD", color=INK, fill_color=WELL))
            for r in (r for r in a["results"] if r["panel"] == panel):
                abnormal = r["status"] != "normal"
                flag = FontFace(emphasis="BOLD" if abnormal else None, color=COLORS.get(r["status"], INK))
                row = table.row()
                row.cell(r["name"], style=FontFace(color=INK))
                row.cell(f"{r['value']:g}", style=flag)
                row.cell(r["unit"], style=FontFace(color=SLATE))
                row.cell(r["range_text"], style=FontFace(color=SLATE))
                row.cell(STATUS_WORDS.get(r["status"], r["status"]), style=flag)

    pdf.ln(6)
    pdf.set_font(FONT, size=9)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(0, 4.8, DISCLAIMER, align="L", new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def _heading(pdf: FPDF, text: str) -> None:
    pdf.set_font(FONT, "B", 13)
    pdf.set_text_color(*INK)
    pdf.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
