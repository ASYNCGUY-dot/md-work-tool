"""Read OOXML evidence independently of the application's SheetJS reader."""
import datetime
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile

base = pathlib.Path(sys.argv[1]).resolve()
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
out = []
for filename in ("상품마스터.xlsx", "판매_문자날짜.xlsx", "판매_날짜셀.xlsx"):
    with zipfile.ZipFile(base / filename) as archive:
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        styles = ET.fromstring(archive.read("xl/styles.xml"))
        formats = [int(x.attrib.get("numFmtId", "0")) for x in styles.find("s:cellXfs", ns)]
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(x.itertext()) for x in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        rows = []
        for row in sheet.findall("s:sheetData/s:row", ns)[:3]:
            cells = {}
            for cell in row.findall("s:c", ns):
                value = cell.findtext("s:v", default="", namespaces=ns)
                if cell.attrib.get("t") == "s":
                    value = strings[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", ns).itertext())
                fmt = formats[int(cell.attrib.get("s", "0"))]
                record = {"type": cell.attrib.get("t", "n"), "value": value, "numFmtId": fmt}
                if fmt == 14 and value:
                    record["excelDate"] = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(value))).isoformat()
                cells[cell.attrib["r"]] = record
            rows.append(cells)
        out.append({"file": filename, "rowCountIncludingHeader": len(sheet.findall("s:sheetData/s:row", ns)), "firstRows": rows})
(base / "independent-ooxml.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
assert out[0]["rowCountIncludingHeader"] == 25
assert out[1]["firstRows"][1]["A2"]["value"] == "2026-10-01"
assert out[2]["firstRows"][1]["A2"]["excelDate"].startswith("2026-10-01")
assert out[2]["firstRows"][2]["A3"]["excelDate"].startswith("2026-10-02")
print("Independent OOXML: PASS; 24 product rows; text dates and native Excel dates validated")
