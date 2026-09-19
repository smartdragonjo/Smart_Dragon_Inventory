from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

SOURCE_FILE = Path("exports/migration_preview.csv")
OUTPUT_DIR = Path("exports")

IMPORT_JSON = OUTPUT_DIR / "import_ready.json"
IMPORT_CSV = OUTPUT_DIR / "import_ready.csv"
IMPORT_SUMMARY = OUTPUT_DIR / "import_summary.json"

READY_STATUS = "ready"


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def nullable(value: str) -> str | None:
    value = normalize(value)
    return value if value else None


def parse_year(value: str) -> int | None:
    value = normalize(value)

    if re.fullmatch(r"\d{4}", value):
        return int(value)

    return None


def parse_wiper(value: str) -> int | None:
    value = normalize(value)

    if not value or value.casefold() in {
        "n/a",
        "na",
        "unknown",
        "لا توجد معلومات",
    }:
        return None

    if re.fullmatch(r"\d{1,2}", value):
        return int(value)

    return None


def parse_arabic_keywords(value: str) -> list[str]:
    value = normalize(value)

    if not value:
        return []

    parts = re.split(r"[,،;/|]+", value)

    result = []

    for item in parts:
        item = normalize(item)

        if item and item not in result:
            result.append(item)

    return result


def parse_bulb(value: str) -> dict[str, Any]:
    raw = normalize(value)
    folded = raw.casefold()

    result: dict[str, Any] = {
        "raw": raw or None,
        "type": None,
        "code": None,
        "aliases": [],
        "technology": None,
        "dependsOnTrim": False,
        "notApplicable": False,
        "notes": None,
    }

    if not raw:
        return result

    if folded in {"n/a", "na"}:
        result["notApplicable"] = True
        return result

    if folded in {"unknown", "لا توجد معلومات"}:
        result["notes"] = "Unknown legacy value"
        return result

    # Known alias patterns. Preserve the original raw value.
    alias_map = {
        "hb3/9005": ("9005", ["HB3"]),
        "9005 (hb3)": ("9005", ["HB3"]),
        "hir2/9012": ("9012", ["HIR2"]),
    }

    alias_match = alias_map.get(folded)

    if alias_match:
        code, aliases = alias_match
        result["type"] = "replaceable_bulb"
        result["code"] = code
        result["aliases"] = aliases
        return result

    # Standard replaceable bulb patterns.
    if re.fullmatch(
        r"(H\d{1,2}|9005|9006|9012|D[1-4][SR])",
        raw,
        flags=re.IGNORECASE,
    ):
        result["type"] = "replaceable_bulb"
        result["code"] = raw.upper()

        if raw.upper().startswith("H"):
            result["technology"] = "halogen"

        return result

    if "varies by trim" in folded:
        result["type"] = "oem_or_trim_dependent"
        result["dependsOnTrim"] = True

        if "led" in folded:
            result["technology"] = "LED"

        result["notes"] = raw
        return result

    if "led" in folded:
        result["type"] = "oem_led"
        result["technology"] = "LED"
        result["notes"] = raw
        return result

    # Keep anything ambiguous as notes instead of guessing.
    result["type"] = "legacy_unstructured"
    result["notes"] = raw

    return result


def parse_screen(value: str) -> dict[str, Any]:
    raw = normalize(value)

    result: dict[str, Any] = {
        "raw": raw or None,
        "options": [],
        "notes": None,
    }

    if not raw:
        return result

    if raw.casefold() in {
        "n/a",
        "na",
        "unknown",
        "لا توجد معلومات",
    }:
        result["notes"] = raw
        return result

    # Conservative extraction: collect numeric inch sizes only.
    # Do not guess mount/system semantics from ambiguous text.
    # Extract explicit inch sizes conservatively.
    # Examples:
    #   "7-8 inch" -> 7, 8
    #   "6.5-8.8 inch" -> 6.5, 8.8
    #   "9-inch to 10-inch" -> 9, 10
    matches = re.findall(
        r"(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?)\s*)?inch",
        raw,
        flags=re.IGNORECASE,
    )

    seen = set()

    for first, second in matches:
        for match in (first, second):
            if not match:
                continue

            size = float(match)

            if size.is_integer():
                size = int(size)

            if size in seen:
                continue

            seen.add(size)

            result["options"].append(
                {
                    "size": size,
                    "unit": "inch",
                    "mountType": None,
                    "systemType": None,
                    "oemCompatible": None,
                    "notes": None,
                }
            )

    # Preserve original description for later review.
    result["notes"] = raw

    return result


def transform_record(row: dict[str, str]) -> dict[str, Any]:
    make = normalize(row.get("Make", ""))
    model = normalize(row.get("Model", ""))

    year_start = parse_year(row.get("Year_Start", ""))
    year_end = parse_year(row.get("Year_End", ""))

    return {
        "source": {
            "type": "legacy_csv",
            "sourceRow": int(row["Source_Row"]),
            "migrationStatus": row.get("Migration_Status"),
            "dataQuality": row.get("Data_Quality"),
            "hasOverlap": row.get("Has_Overlap") == "yes",
            "warnings": normalize(row.get("Warnings", "")) or None,
        },

        "vehicle": {
            "make": make,
            "model": model,
            "arabicMake": nullable(row.get("Arabic_Make", "")),
            "arabicKeywords": parse_arabic_keywords(
                row.get("Arabic_Keywords", "")
            ),
            "yearStart": year_start,
            "yearEnd": year_end,
            "status": "migration_candidate",
            "dataQuality": row.get("Data_Quality") or "complete",
            "hasOverlap": row.get("Has_Overlap") == "yes",
        },

        "fitments": [
            {
                "categorySlug": "lighting",
                "fields": {
                    "lowBeam": parse_bulb(
                        row.get("Low_Beam_Bulb", "")
                    ),
                    "highBeam": parse_bulb(
                        row.get("High_Beam_Bulb", "")
                    ),
                    "fogLight": parse_bulb(
                        row.get("Fog_Light_Bulb", "")
                    ),
                },
            },
            {
                "categorySlug": "wipers",
                "fields": {
                    "driver": {
                        "value": parse_wiper(
                            row.get("Wiper_Driver_Inch", "")
                        ),
                        "unit": "inch",
                        "raw": nullable(
                            row.get("Wiper_Driver_Inch", "")
                        ),
                    },
                    "passenger": {
                        "value": parse_wiper(
                            row.get("Wiper_Passenger_Inch", "")
                        ),
                        "unit": "inch",
                        "raw": nullable(
                            row.get("Wiper_Passenger_Inch", "")
                        ),
                    },
                },
            },
            {
                "categorySlug": "screens",
                "fields": {
                    "screen": parse_screen(
                        row.get("Screen_Frame_Type_Size", "")
                    )
                },
            },
        ],
    }


def read_ready_rows() -> list[dict[str, str]]:
    if not SOURCE_FILE.exists():
        raise SystemExit(
            "exports/migration_preview.csv غير موجود. "
            "شغّل scripts/build_migration_preview.py أولاً."
        )

    with SOURCE_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(file)

        return [
            {
                str(key or "").strip(): normalize(value)
                for key, value in row.items()
            }
            for row in reader
            if normalize(row.get("Migration_Status", "")) == READY_STATUS
        ]


def write_json(records: list[dict[str, Any]]) -> None:
    IMPORT_JSON.write_text(
        json.dumps(
            records,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def write_csv(rows: list[dict[str, str]]) -> None:
    if not rows:
        return

    fieldnames = list(rows[0].keys())

    with IMPORT_CSV.open(
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


def build_flat_csv_rows(
    source_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    output = []

    for row in source_rows:
        output.append(
            {
                "Source_Row": row.get("Source_Row", ""),
                "Make": row.get("Make", ""),
                "Model": row.get("Model", ""),
                "Year_Start": row.get("Year_Start", ""),
                "Year_End": row.get("Year_End", ""),
                "Arabic_Make": row.get("Arabic_Make", ""),
                "Arabic_Keywords": row.get("Arabic_Keywords", ""),
                "Low_Beam_Bulb": row.get("Low_Beam_Bulb", ""),
                "High_Beam_Bulb": row.get("High_Beam_Bulb", ""),
                "Fog_Light_Bulb": row.get("Fog_Light_Bulb", ""),
                "Wiper_Driver_Inch": row.get("Wiper_Driver_Inch", ""),
                "Wiper_Passenger_Inch": row.get("Wiper_Passenger_Inch", ""),
                "Screen_Frame_Type_Size": row.get(
                    "Screen_Frame_Type_Size",
                    "",
                ),
                "Data_Quality": row.get("Data_Quality", ""),
                "Has_Overlap": row.get("Has_Overlap", ""),
                "Warnings": row.get("Warnings", ""),
            }
        )

    return output


def main() -> None:
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    ready_rows = read_ready_rows()

    transformed = [
        transform_record(row)
        for row in ready_rows
    ]

    write_json(transformed)

    write_csv(
        build_flat_csv_rows(ready_rows)
    )

    summary = {
        "sourceFile": str(SOURCE_FILE),
        "readyRecords": len(ready_rows),
        "outputJson": str(IMPORT_JSON),
        "outputCsv": str(IMPORT_CSV),
        "firebaseUploadPerformed": False,
        "note": (
            "Migration candidates only. "
            "No Firebase upload is performed."
        ),
    }

    IMPORT_SUMMARY.write_text(
        json.dumps(
            summary,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("Smart Dragon import preparation completed.")
    print(f"Ready records prepared: {len(ready_rows)}")
    print(f"Structured JSON: {IMPORT_JSON}")
    print(f"Flat review CSV: {IMPORT_CSV}")
    print(f"Summary: {IMPORT_SUMMARY}")
    print()
    print("NO Firebase upload was performed.")
    print()


if __name__ == "__main__":
    main()