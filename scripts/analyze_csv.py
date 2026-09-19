from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

SOURCE_FILE = Path("data.csv")
OUTPUT_DIR = Path("exports")

CLEAN_FILE = OUTPUT_DIR / "data_clean.csv"
ANALYSIS_FILE = OUTPUT_DIR / "data_analysis.json"
ISSUES_FILE = OUTPUT_DIR / "data_issues.csv"
DUPLICATES_FILE = OUTPUT_DIR / "data_duplicates.csv"

YEAR_MIN = 1950
YEAR_MAX = 2100

EXPECTED_COLUMNS = [
    "Make",
    "Model",
    "Year_Start",
    "Year_End",
    "Low_Beam_Bulb",
    "High_Beam_Bulb",
    "Fog_Light_Bulb",
    "Wiper_Driver_Inch",
    "Wiper_Passenger_Inch",
    "Screen_Frame_Type_Size",
    "Arabic_Keywords",
    "Arabic_Make",
]

UNKNOWN_VALUES = {
    "",
    "n/a",
    "na",
    "unknown",
    "لا توجد معلومات",
}


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_key(value: str) -> str:
    return normalize_space(value).casefold()


def is_unknown(value: str) -> bool:
    return normalized_key(value) in UNKNOWN_VALUES


def parse_year(value: str) -> int | None:
    value = normalize_space(value)
    if not re.fullmatch(r"\d{4}", value):
        return None
    year = int(value)
    if not YEAR_MIN <= year <= YEAR_MAX:
        return None
    return year


def read_csv(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        rows = list(csv.reader(file))
    if not rows:
        raise ValueError("CSV file is empty.")
    headers = [normalize_space(header) for header in rows[0]]
    data_rows = [row for row in rows[1:] if any(normalize_space(value) for value in row)]
    width = max(len(headers), *(len(row) for row in data_rows))
    headers += [""] * (width - len(headers))
    padded_rows = [row + [""] * (width - len(row)) for row in data_rows]
    return headers, padded_rows


def get_active_columns(headers, rows):
    active_indexes = []
    for index, header in enumerate(headers):
        has_header = bool(normalize_space(header))
        has_data = any(normalize_space(row[index]) for row in rows)
        if has_header or has_data:
            active_indexes.append(index)
    return active_indexes


def build_clean_headers(headers, active_indexes):
    result = []
    seen = {}
    for index in active_indexes:
        name = normalize_space(headers[index]) or f"Unnamed_{index + 1}"
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            name = f"{name}_{seen[name]}"
        result.append(name)
    return result


def build_records(rows, active_indexes, clean_headers):
    records = []
    for row in rows:
        record = {}
        for position, column_index in enumerate(active_indexes):
            record[clean_headers[position]] = normalize_space(row[column_index])
        records.append(record)
    return records


def add_issue(issues, row_number, issue_type, field, value, details):
    issues.append({
        "Source_Row": row_number,
        "Issue_Type": issue_type,
        "Field": field,
        "Value": value,
        "Details": details,
    })


def analyze(records):
    issues = []
    duplicate_groups = []
    value_counts = defaultdict(Counter)
    exact_rows = defaultdict(list)
    vehicle_range_rows = defaultdict(list)
    vehicle_ranges = defaultdict(list)

    for row_number, record in enumerate(records, start=2):
        make = record.get("Make", "")
        model = record.get("Model", "")
        year_start_raw = record.get("Year_Start", "")
        year_end_raw = record.get("Year_End", "")

        for column in EXPECTED_COLUMNS:
            value_counts[column][record.get(column, "")] += 1

        if not make:
            add_issue(issues, row_number, "missing_required", "Make", "", "اسم الشركة فارغ.")
        if not model:
            add_issue(issues, row_number, "missing_required", "Model", "", "اسم الموديل فارغ.")

        year_start = parse_year(year_start_raw)
        year_end = parse_year(year_end_raw)

        if year_start is None:
            add_issue(issues, row_number, "invalid_year", "Year_Start", year_start_raw, "سنة البداية تحتاج مراجعة يدوية.")
        if year_end is None:
            add_issue(issues, row_number, "invalid_year", "Year_End", year_end_raw, "سنة النهاية تحتاج مراجعة يدوية.")

        if year_start is not None and year_end is not None:
            if year_start > year_end:
                add_issue(issues, row_number, "reversed_year_range", "Year_Start / Year_End", f"{year_start_raw} - {year_end_raw}", "سنة البداية أكبر من سنة النهاية.")
            else:
                vehicle_key = (normalized_key(make), normalized_key(model))
                vehicle_ranges[vehicle_key].append((year_start, year_end, row_number))

        for field in [
            "Low_Beam_Bulb",
            "High_Beam_Bulb",
            "Fog_Light_Bulb",
            "Wiper_Driver_Inch",
            "Wiper_Passenger_Inch",
            "Screen_Frame_Type_Size",
        ]:
            value = record.get(field, "")
            if is_unknown(value):
                add_issue(issues, row_number, "unknown_value", field, value, "القيمة غير معروفة أو تحتاج مراجعة قبل الاعتماد.")

        exact_key = tuple(normalized_key(record.get(column, "")) for column in EXPECTED_COLUMNS)
        exact_rows[exact_key].append(row_number)

        vehicle_range_key = (
            normalized_key(make),
            normalized_key(model),
            normalized_key(year_start_raw),
            normalized_key(year_end_raw),
        )
        vehicle_range_rows[vehicle_range_key].append(row_number)

    for rows in exact_rows.values():
        if len(rows) > 1:
            duplicate_groups.append({
                "Duplicate_Type": "exact_record",
                "Rows": ", ".join(str(row) for row in rows),
                "Count": len(rows),
                "Details": "السجلات متطابقة في جميع الحقول الأساسية.",
            })

    for rows in vehicle_range_rows.values():
        if len(rows) > 1:
            duplicate_groups.append({
                "Duplicate_Type": "same_vehicle_and_range",
                "Rows": ", ".join(str(row) for row in rows),
                "Count": len(rows),
                "Details": "نفس الشركة والموديل ونطاق السنوات موجود أكثر من مرة.",
            })

    overlap_count = 0
    for ranges in vehicle_ranges.values():
        ranges = sorted(ranges)
        for first_index in range(len(ranges)):
            start_1, end_1, row_1 = ranges[first_index]
            for second_index in range(first_index + 1, len(ranges)):
                start_2, end_2, row_2 = ranges[second_index]
                if start_2 > end_1:
                    break
                if max(start_1, start_2) <= min(end_1, end_2):
                    overlap_count += 1
                    add_issue(
                        issues,
                        row_2,
                        "overlapping_year_range",
                        "Year_Start / Year_End",
                        f"{start_2}-{end_2}",
                        f"يتداخل مع الصف {row_1} ({start_1}-{end_1}) لنفس السيارة.",
                    )

    makes = {record["Make"] for record in records if record.get("Make")}
    models = {record["Model"] for record in records if record.get("Model")}

    analysis = {
        "source_rows": len(records),
        "unique_makes": len(makes),
        "unique_models": len(models),
        "issues_count": len(issues),
        "duplicate_groups_count": len(duplicate_groups),
        "overlap_issues_count": overlap_count,
        "value_counts": {
            field: dict(counter.most_common())
            for field, counter in value_counts.items()
        },
    }

    return analysis, issues, duplicate_groups


def write_clean_csv(records):
    if not records:
        return
    with CLEAN_FILE.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)


def write_issues_csv(issues):
    with ISSUES_FILE.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["Source_Row", "Issue_Type", "Field", "Value", "Details"])
        writer.writeheader()
        writer.writerows(issues)


def write_duplicates_csv(duplicates):
    with DUPLICATES_FILE.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["Duplicate_Type", "Rows", "Count", "Details"])
        writer.writeheader()
        writer.writerows(duplicates)


def main():
    if not SOURCE_FILE.exists():
        raise SystemExit("data.csv غير موجود في جذر المشروع.")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    headers, rows = read_csv(SOURCE_FILE)
    active_indexes = get_active_columns(headers, rows)
    clean_headers = build_clean_headers(headers, active_indexes)
    records = build_records(rows, active_indexes, clean_headers)
    analysis, issues, duplicates = analyze(records)

    analysis["original_column_count"] = len(headers)
    analysis["cleaned_column_count"] = len(clean_headers)
    analysis["removed_empty_columns"] = len(headers) - len(clean_headers)
    analysis["clean_columns"] = clean_headers

    write_clean_csv(records)
    write_issues_csv(issues)
    write_duplicates_csv(duplicates)

    ANALYSIS_FILE.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print("Smart Dragon CSV analysis completed.")
    print(f"Rows: {analysis['source_rows']}")
    print(f"Original columns: {analysis['original_column_count']}")
    print(f"Clean columns: {analysis['cleaned_column_count']}")
    print(f"Removed empty columns: {analysis['removed_empty_columns']}")
    print(f"Unique makes: {analysis['unique_makes']}")
    print(f"Unique models: {analysis['unique_models']}")
    print(f"Issues: {analysis['issues_count']}")
    print(f"Duplicate groups: {analysis['duplicate_groups_count']}")
    print(f"Overlapping ranges: {analysis['overlap_issues_count']}")
    print()
    print(f"Clean CSV: {CLEAN_FILE}")
    print(f"Analysis: {ANALYSIS_FILE}")
    print(f"Issues: {ISSUES_FILE}")
    print(f"Duplicates: {DUPLICATES_FILE}")
    print()


if __name__ == "__main__":
    main()
