from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

SOURCE_FILE = Path("exports/data_clean.csv")
OUTPUT_FILE = Path("exports/migration_preview.csv")

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
    "unknown",
    "لا توجد معلومات",
}

NOT_APPLICABLE_VALUES = {
    "n/a",
    "na",
}

YEAR_MIN = 1950
YEAR_MAX = 2100


def normalize(value: str) -> str:
    return str(value or "").strip()


def key(value: str) -> str:
    return normalize(value).casefold()


def parse_year(value: str) -> int | None:
    value = normalize(value)

    if not value.isdigit() or len(value) != 4:
        return None

    year = int(value)

    if not YEAR_MIN <= year <= YEAR_MAX:
        return None

    return year


def is_unknown(value: str) -> bool:
    return key(value) in UNKNOWN_VALUES


def is_not_applicable(value: str) -> bool:
    return key(value) in NOT_APPLICABLE_VALUES


def read_records(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        records = []

        for row in reader:
            cleaned = {
                str(column or "").strip(): normalize(value)
                for column, value in row.items()
            }

            records.append(cleaned)

    return records


def exact_signature(record: dict[str, str]) -> tuple[str, ...]:
    return tuple(
        key(record.get(column, ""))
        for column in EXPECTED_COLUMNS
    )


def vehicle_range_signature(record: dict[str, str]) -> tuple[str, ...]:
    return (
        key(record.get("Make", "")),
        key(record.get("Model", "")),
        key(record.get("Year_Start", "")),
        key(record.get("Year_End", "")),
    )


def vehicle_signature(record: dict[str, str]) -> tuple[str, str]:
    return (
        key(record.get("Make", "")),
        key(record.get("Model", "")),
    )


def ranges_overlap(
    a_start: int,
    a_end: int,
    b_start: int,
    b_end: int,
) -> bool:
    return max(a_start, b_start) <= min(a_end, b_end)


def classify(records: list[dict[str, str]]) -> list[dict[str, str]]:
    exact_groups: dict[tuple[str, ...], list[int]] = defaultdict(list)
    same_range_groups: dict[tuple[str, ...], list[int]] = defaultdict(list)
    vehicle_groups: dict[tuple[str, str], list[int]] = defaultdict(list)

    for index, record in enumerate(records):
        exact_groups[exact_signature(record)].append(index)
        same_range_groups[vehicle_range_signature(record)].append(index)
        vehicle_groups[vehicle_signature(record)].append(index)

    results: list[dict[str, str]] = []

    for index, record in enumerate(records):
        source_row = index + 2

        reasons: list[str] = []
        warnings: list[str] = []

        make = record.get("Make", "")
        model = record.get("Model", "")

        start_raw = record.get("Year_Start", "")
        end_raw = record.get("Year_End", "")

        start = parse_year(start_raw)
        end = parse_year(end_raw)

        status = "ready"
        data_quality = "complete"

        # ---------------------------------------------------------
        # 1) Exact duplicate takes final priority
        # ---------------------------------------------------------
        exact_members = exact_groups[exact_signature(record)]

        if len(exact_members) > 1:
            first_index = exact_members[0]

            if index != first_index:
                preview = {
                    "Source_Row": str(source_row),
                    "Migration_Status": "duplicate_exact",
                    "Data_Quality": "duplicate",
                    "Has_Overlap": "no",
                    "Review_Reasons": f"نسخة مطابقة للصف {first_index + 2}.",
                    "Warnings": "",
                }

                for column in EXPECTED_COLUMNS:
                    preview[column] = record.get(column, "")

                results.append(preview)
                continue

        # ---------------------------------------------------------
        # 2) Required fields / years
        # ---------------------------------------------------------
        if not make:
            status = "needs_review"
            data_quality = "partial"
            reasons.append("اسم الشركة مفقود.")

        if not model:
            status = "needs_review"
            data_quality = "partial"
            reasons.append("اسم الموديل مفقود.")

        if start is None or end is None:
            status = "needs_review"
            data_quality = "unknown_years"

            if start is None:
                reasons.append("سنة البداية غير صالحة أو غير معروفة.")

            if end is None:
                reasons.append("سنة النهاية غير صالحة أو غير معروفة.")

        if start is not None and end is not None and start > end:
            status = "needs_review"
            data_quality = "partial"
            reasons.append("سنة البداية أكبر من سنة النهاية.")

        # ---------------------------------------------------------
        # 3) Same vehicle + same range, but differing content
        # ---------------------------------------------------------
        same_range_members = same_range_groups[
            vehicle_range_signature(record)
        ]

        if len(same_range_members) > 1:
            distinct_signatures = {
                exact_signature(records[item_index])
                for item_index in same_range_members
            }

            if len(distinct_signatures) > 1:
                status = "conflict"
                data_quality = "conflicting"

                other_rows = [
                    str(item_index + 2)
                    for item_index in same_range_members
                    if item_index != index
                ]

                reasons.append(
                    "نفس السيارة ونفس نطاق السنوات موجود ببيانات مختلفة "
                    f"في الصفوف: {', '.join(other_rows)}."
                )

        # ---------------------------------------------------------
        # 4) Overlap detection
        # ---------------------------------------------------------
        has_overlap = False

        if start is not None and end is not None:
            for other_index in vehicle_groups[vehicle_signature(record)]:
                if other_index == index:
                    continue

                other = records[other_index]

                other_start = parse_year(
                    other.get("Year_Start", "")
                )
                other_end = parse_year(
                    other.get("Year_End", "")
                )

                if other_start is None or other_end is None:
                    continue

                if ranges_overlap(
                    start,
                    end,
                    other_start,
                    other_end,
                ):
                    same_range = (
                        start == other_start
                        and end == other_end
                    )

                    if not same_range:
                        has_overlap = True

                        warnings.append(
                            "نطاق السنوات يتداخل مع الصف "
                            f"{other_index + 2} "
                            f"({other_start}-{other_end})."
                        )

        # ---------------------------------------------------------
        # 5) Unknown fitment values
        # ---------------------------------------------------------
        review_fields = [
            "Low_Beam_Bulb",
            "High_Beam_Bulb",
            "Fog_Light_Bulb",
            "Wiper_Driver_Inch",
            "Wiper_Passenger_Inch",
            "Screen_Frame_Type_Size",
        ]

        unknown_fields = [
            field
            for field in review_fields
            if is_unknown(record.get(field, ""))
        ]

        if unknown_fields and status == "ready":
            status = "needs_review"

            if data_quality == "complete":
                data_quality = "partial"

        if unknown_fields:
            reasons.append(
                "حقول غير معروفة: "
                + ", ".join(unknown_fields)
                + "."
            )

        # ---------------------------------------------------------
        # 6) N/A is valid not-applicable, not unknown
        # ---------------------------------------------------------
        not_applicable_fields = [
            field
            for field in review_fields
            if is_not_applicable(record.get(field, ""))
        ]

        if not_applicable_fields:
            warnings.append(
                "حقول غير منطبقة (N/A): "
                + ", ".join(not_applicable_fields)
                + "."
            )

        # ---------------------------------------------------------
        # 7) Normalization hints only
        # ---------------------------------------------------------
        make_value = normalize(record.get("Make", ""))

        if make_value == "Mercedes":
            warnings.append(
                "اسم الشركة قد يحتاج توحيداً مع Mercedes-Benz."
            )

        low = normalize(record.get("Low_Beam_Bulb", ""))
        high = normalize(record.get("High_Beam_Bulb", ""))

        bulb_alias_values = {
            "HB3/9005",
            "9005 (HB3)",
            "HIR2/9012",
        }

        if low in bulb_alias_values or high in bulb_alias_values:
            warnings.append(
                "يوجد كود لمبة بصيغة Alias ويحتاج توحيداً منظماً لاحقاً."
            )

        if "varies by trim" in key(low) or "varies by trim" in key(high):
            warnings.append(
                "بيانات الإضاءة تعتمد على الفئة/Trim ويجب فصلها عن كود اللمبة."
            )

        preview = {
            "Source_Row": str(source_row),
            "Migration_Status": status,
            "Data_Quality": data_quality,
            "Has_Overlap": "yes" if has_overlap else "no",
            "Review_Reasons": " | ".join(reasons),
            "Warnings": " | ".join(warnings),
        }

        for column in EXPECTED_COLUMNS:
            preview[column] = record.get(column, "")

        results.append(preview)

    return results


def write_preview(rows: list[dict[str, str]]) -> None:
    if not rows:
        raise SystemExit("No records found.")

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    fieldnames = list(rows[0].keys())

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames,
        )

        writer.writeheader()
        writer.writerows(rows)


def print_summary(rows: list[dict[str, str]]) -> None:
    status_counts = defaultdict(int)
    quality_counts = defaultdict(int)
    overlap_count = 0

    for row in rows:
        status_counts[row["Migration_Status"]] += 1
        quality_counts[row["Data_Quality"]] += 1

        if row["Has_Overlap"] == "yes":
            overlap_count += 1

    print()
    print("Smart Dragon Migration Preview completed.")
    print(f"Total rows: {len(rows)}")
    print(f"Ready: {status_counts['ready']}")
    print(f"Needs review: {status_counts['needs_review']}")
    print(f"Conflicts: {status_counts['conflict']}")
    print(f"Exact duplicates: {status_counts['duplicate_exact']}")
    print()
    print("Data quality:")
    print(f"  Complete: {quality_counts['complete']}")
    print(f"  Partial: {quality_counts['partial']}")
    print(f"  Unknown years: {quality_counts['unknown_years']}")
    print(f"  Conflicting: {quality_counts['conflicting']}")
    print(f"  Duplicate: {quality_counts['duplicate']}")
    print()
    print(f"Rows with overlapping year ranges: {overlap_count}")
    print()
    print(f"Preview file: {OUTPUT_FILE}")
    print()
    print(
        "NOTE: N/A is treated as valid 'not applicable', "
        "not as missing information."
    )
    print(
        "This script does NOT modify data.csv "
        "or exports/data_clean.csv."
    )
    print()


def main() -> None:
    if not SOURCE_FILE.exists():
        raise SystemExit(
            "exports/data_clean.csv غير موجود. "
            "شغّل scripts/analyze_csv.py أولاً."
        )

    records = read_records(SOURCE_FILE)

    preview_rows = classify(records)

    write_preview(preview_rows)

    print_summary(preview_rows)


if __name__ == "__main__":
    main()