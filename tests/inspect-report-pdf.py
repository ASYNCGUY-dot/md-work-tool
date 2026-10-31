"""Inspect actual browser print output; do not modify product sources."""
import json
import pathlib
import re
import sys
from pypdf import PdfReader

base = pathlib.Path(sys.argv[1]).resolve()
expected = json.loads((base / "expected-baseline.json").read_text(encoding="utf-8"))
report = {}
for name in ("report-baseline", "report-long-actions"):
    reader = PdfReader(base / (name + ".pdf"))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n--- PAGE ---\n\n".join(pages)
    (base / (name + ".txt")).write_text(text, encoding="utf-8")
    markers = re.findall(r"ACTION_\d{3}_END", text)
    report[name] = {
        "pages": len(pages),
        "salesTextPresent": expected["salesText"] in text,
        "teamPresent": "검증팀" in text,
        "authorPresent": "검증작성자" in text,
        "exampleLabelPresent": "예시 데이터" in text,
        "actionMarkerCount": len(markers),
        "actionMarkers": markers,
        "pageTextLengths": [len(page) for page in pages],
    }
    assert report[name]["salesTextPresent"], name + " missing exact sales"
    assert report[name]["teamPresent"] and report[name]["authorPresent"]
report["longActionsFullyPrinted"] = report["report-long-actions"]["actionMarkerCount"] == 40
(base / "pdf-inspection.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
