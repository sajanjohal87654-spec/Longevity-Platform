from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

SAFETY_NOTICE = (
    "Educational wellness estimate only. This app does not diagnose, treat, or predict disease. "
    "Review symptoms, abnormal labs, medication decisions, and genetic findings with a licensed clinician."
)


@dataclass(frozen=True)
class Source:
    label: str
    url: str
    note: str


SOURCES = {
    "airnow_aqi": Source(
        label="EPA AirNow AQI Basics",
        url="https://www.airnow.gov/aqi/aqi-basics",
        note="AQI categories and health-concern bands.",
    ),
    "cdc_a1c": Source(
        label="CDC A1C Test for Diabetes and Prediabetes",
        url="https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html",
        note="A1C ranges used for diabetes and prediabetes screening.",
    ),
    "cdc_glucose": Source(
        label="CDC Diabetes Testing",
        url="https://www.cdc.gov/diabetes/diabetes-testing/index.html",
        note="Fasting blood sugar screening ranges.",
    ),
    "medline_crp": Source(
        label="MedlinePlus C-Reactive Protein Test",
        url="https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/",
        note="CRP is a non-specific inflammation marker; reference ranges vary by lab.",
    ),
    "aha_hr": Source(
        label="American Heart Association Resting Heart Rate",
        url="https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia/tachycardia--fast-heart-rate",
        note="General adult resting heart-rate context.",
    ),
}


def source_payload(keys: list[str]) -> list[dict[str, str]]:
    return [
        {"label": SOURCES[key].label, "url": SOURCES[key].url, "note": SOURCES[key].note}
        for key in keys
        if key in SOURCES
    ]


def classify_aqi(aqi: float) -> tuple[str, str]:
    if aqi <= 50:
        return "Good", "low"
    if aqi <= 100:
        return "Moderate", "moderate"
    if aqi <= 150:
        return "Unhealthy for sensitive groups", "elevated"
    if aqi <= 200:
        return "Unhealthy", "high"
    if aqi <= 300:
        return "Very unhealthy", "very_high"
    return "Hazardous", "severe"


def normalize_marker_name(name: str) -> str:
    cleaned = name.lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "fasting_glucose": "glucose",
        "blood_glucose": "glucose",
        "hemoglobin_a1c": "hba1c",
        "a1c": "hba1c",
        "hs_crp": "crp",
        "hscrp": "crp",
    }
    return aliases.get(cleaned, cleaned)


def interpret_biomarker(marker: str, value: float, unit: Optional[str]) -> dict[str, Any]:
    normalized = normalize_marker_name(marker)
    if normalized == "glucose":
        if value < 100:
            label = "within common fasting screening range"
        elif value < 126:
            label = "above common fasting screening range"
        else:
            label = "at or above diabetes screening threshold"
        return {
            "marker": normalized,
            "interpretation": label,
            "caution": "Only applies to fasting plasma glucose in mg/dL; diagnosis requires clinical confirmation.",
            "sources": source_payload(["cdc_glucose"]),
        }
    if normalized == "hba1c":
        if value < 5.7:
            label = "below CDC prediabetes screening threshold"
        elif value < 6.5:
            label = "within CDC prediabetes screening range"
        else:
            label = "at or above CDC diabetes screening threshold"
        return {
            "marker": normalized,
            "interpretation": label,
            "caution": "A1C can be affected by anemia, kidney disease, pregnancy, blood loss, and other factors.",
            "sources": source_payload(["cdc_a1c"]),
        }
    if normalized == "crp":
        return {
            "marker": normalized,
            "interpretation": "inflammation context marker",
            "caution": "CRP is non-specific and lab reference ranges vary; infection, injury, chronic disease, and medications can affect it.",
            "sources": source_payload(["medline_crp"]),
        }
    return {
        "marker": normalized,
        "interpretation": "stored without automated clinical interpretation",
        "caution": "Use the reference interval from the ordering laboratory and clinician context.",
        "sources": [],
    }


def model_card() -> dict[str, Any]:
    return {
        "name": "Local exploratory longevity score",
        "status": "prototype",
        "safety_notice": SAFETY_NOTICE,
        "limitations": [
            "Not clinically validated.",
            "Uses sparse manually entered data in local mode.",
            "Does not account for diagnoses, medications, pregnancy, acute illness, lab method differences, or clinician judgment.",
            "Biological-age output is a wellness index estimate, not a measured medical age.",
        ],
        "sources": source_payload(["airnow_aqi", "cdc_a1c", "cdc_glucose", "medline_crp", "aha_hr"]),
    }
