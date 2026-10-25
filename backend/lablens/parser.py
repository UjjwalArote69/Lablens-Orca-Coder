"""Turn report text (typed, pasted or from a PDF) into {test_key: value}."""
import io
import re

from .ranges import TESTS

# Lines containing these words describe a different test that shares a name.
_SKIP = re.compile(r"(?<![a-z])(ratio|non[- ]hdl|direct|indirect|urine|vldl|hs-crp|post ?prandial|random|pp)(?![a-z])")

_NUM = re.compile(r"(?<![\w.])[-+]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?")
_ALIASES = sorted(((a, k) for k, t in TESTS.items() for a in t["aliases"]), key=lambda x: -len(x[0]))


def pdf_to_text(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _match_alias(line_l: str):
    """Return (key, end_index) for the longest alias found as a whole word."""
    for alias, key in _ALIASES:
        pattern = r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])"
        m = re.search(pattern, line_l)
        if not m:
            continue
        # Very short aliases (hb, k, na, tg...) must start the line to avoid false hits.
        if len(alias) <= 3 and line_l[: m.start()].strip(" :-*•\t") != "":
            continue
        return key, m.end()
    return None, None


def _normalise(key: str, value: float, line_l: str) -> float:
    if key == "plt":
        if "lakh" in line_l:
            value *= 100
        elif value > 2000:
            value /= 1000
    elif key == "wbc" and value > 300:
        value /= 1000
    elif key == "hb" and value > 30:  # g/L -> g/dL
        value /= 10
    return round(value, 2)


def parse_report(text: str) -> dict:
    """Read one value per test. The first occurrence of each test wins."""
    found = {}
    for raw in text.splitlines():
        line_l = raw.lower().strip()
        if not line_l or _SKIP.search(line_l):
            continue
        key, end = _match_alias(line_l)
        if not key or key in found:
            continue
        rest = line_l[end:]
        rest = re.sub(r"\([^)]*[a-z][^)]*\)", " ", rest)  # drop "(sgpt)", "(3rd gen)", "(g/dl)"
        m = _NUM.search(rest)
        if not m:
            continue
        try:
            value = abs(float(m.group().replace(",", "")))
        except ValueError:
            continue
        found[key] = _normalise(key, value, line_l)
    return found
