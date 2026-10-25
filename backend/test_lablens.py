"""Engine checks. Run: python test_lablens.py  (also works under pytest)."""
from pathlib import Path

from lablens.knowledge import explain, load_library
from lablens.parser import parse_report
from lablens.rules import analyze

SAMPLES = Path(__file__).resolve().parent / "samples"
LIB, _ = load_library()


def run(name, sex):
    return analyze(parse_report((SAMPLES / f"{name}.txt").read_text(encoding="utf-8")), sex)


def assert_explained(results, patterns):
    """Every flag shown to a patient must have an explanation to go with it."""
    for p in patterns:
        k = p.evidence[0]
        eid = f"test:{k}:{results[k].direction}" if p.id.startswith("critical:") else f"combo:{p.id}"
        assert explain(LIB, eid), f"no explanation for {eid}"
    for r in results.values():
        if r.abnormal:
            assert explain(LIB, f"test:{r.key}:{r.direction}"), f"no explanation for {r.key} {r.direction}"


def test_parser_reads_indian_lab_formats():
    values = parse_report((SAMPLES / "anita_anemia_thyroid.txt").read_text(encoding="utf-8"))
    assert values["hb"] == 9.1
    assert values["wbc"] == 6.8      # "6,800 cells/cumm"
    assert values["plt"] == 260.0    # "2.6 lakhs/cumm"
    assert values["tsh"] == 7.8      # "TSH (3rd generation)"
    assert values["vitd"] == 14.6    # "25-OH Vitamin D"
    assert len(values) == 9          # MCH is not a tracked test


def test_suresh_is_urgent():
    results, patterns = run("suresh_kidney_urgent", "M")
    assert [p.id for p in patterns] == ["kidney_potassium", "critical:k", "kidney", "renal_anemia", "infection"]
    assert patterns[0].severity == "urgent"
    assert results["k"].status == "critical_high"
    assert_explained(results, patterns)


def test_rajesh_needs_review():
    results, patterns = run("rajesh_metabolic", "M")
    assert [p.id for p in patterns] == ["liver_enzymes", "diabetes", "metabolic", "atherogenic"]
    assert patterns[0].severity == "review"
    assert_explained(results, patterns)


def test_anita_iron_and_thyroid():
    results, patterns = run("anita_anemia_thyroid", "F")
    assert [p.id for p in patterns] == ["iron_def", "hypothyroid"]
    assert patterns[0].severity == "review"
    assert results["hb"].status == "low"
    assert_explained(results, patterns)


def test_priya_is_all_normal():
    results, patterns = run("priya_healthy", "F")
    assert patterns == []
    assert not any(r.abnormal for r in results.values())
    assert len(results) == 10


def test_pasted_pancytopenia_is_urgent():
    results, patterns = analyze(parse_report("Hb 6.1\nPlatelet count 32000\nTLC 1500"), "F")
    ids = [p.id for p in patterns]
    assert "pancytopenia" in ids
    assert patterns[0].severity == "urgent"
    assert results["plt"].value == 32.0 and results["wbc"].value == 1.5
    assert_explained(results, patterns)


def test_sex_changes_reference_ranges():
    female, _ = run("anita_anemia_thyroid", "F")
    male, _ = run("anita_anemia_thyroid", "M")
    assert (female["hb"].low, female["hb"].high) == (12.0, 15.5)
    assert (male["hb"].low, male["hb"].high) == (13.0, 17.0)


if __name__ == "__main__":
    tests = [f for name, f in list(globals().items()) if name.startswith("test_") and callable(f)]
    for t in tests:
        t()
    print(f"All {len(tests)} tests passed.")
