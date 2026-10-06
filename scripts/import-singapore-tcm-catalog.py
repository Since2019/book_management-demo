"""Convert the Singapore College of Traditional Chinese Medicine PDF catalogue to compact JSON."""

import json
import re
import sys
from pathlib import Path

import pdfplumber


def column(x: float) -> str:
    if x < 320:
        return "t"
    if x < 410:
        return "a"
    if x < 450:
        return "e"
    if x < 600:
        return "p"
    if x < 660:
        return "y"
    return "c"


def append(record: dict[str, str], key: str, value: str) -> None:
    if not value:
        return
    record[key] = f"{record.get(key, '')} {value}".strip()


def extract(source: Path) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    with pdfplumber.open(source) as pdf:
        for page in pdf.pages:
            lines: dict[float, list[dict]] = {}
            for word in page.extract_words(x_tolerance=2, y_tolerance=2):
                lines.setdefault(round(float(word["top"]), 1), []).append(word)
            for words in lines.values():
                words.sort(key=lambda item: float(item["x0"]))
                identifier = next((re.fullmatch(r"<([A-Z]\d{7})>", str(word["text"])) for word in words if float(word["x0"]) < 90), None)
                if identifier:
                    if current and current.get("t"):
                        records.append(current)
                    current = {"i": identifier.group(1)}
                if current is None:
                    continue
                for word in words:
                    x = float(word["x0"])
                    value = str(word["text"]).strip()
                    if x < 90 or value in {"標題", "作者", "版本", "出版商", "出版年份", "核項"}:
                        continue
                    append(current, column(x), value)
        if current and current.get("t"):
            records.append(current)
    return records


if __name__ == "__main__":
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    target.parent.mkdir(parents=True, exist_ok=True)
    records = extract(source)
    target.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(records)} records to {target}")
