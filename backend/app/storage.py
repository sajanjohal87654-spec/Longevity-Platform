from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.medical_knowledge import SAFETY_NOTICE, classify_aqi, interpret_biomarker, normalize_marker_name, source_payload

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "local.db"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              email TEXT NOT NULL UNIQUE,
              birth_year INTEGER,
              biological_sex TEXT,
              subscription_tier TEXT NOT NULL DEFAULT 'free',
              onboarding_completed INTEGER NOT NULL DEFAULT 0,
              home_timezone TEXT,
              aqi_zip TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bio_age_scores (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              biological_age REAL NOT NULL,
              chronological_age REAL NOT NULL,
              age_delta REAL NOT NULL,
              pillar_scores TEXT NOT NULL,
              data_completeness REAL NOT NULL,
              calculated_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS wearable_metrics (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              source TEXT NOT NULL,
              metric_type TEXT NOT NULL,
              value REAL NOT NULL,
              unit TEXT,
              recorded_at TEXT NOT NULL,
              metadata TEXT NOT NULL DEFAULT '{}',
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS biomarker_records (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              marker_name TEXT NOT NULL,
              marker_name_normalized TEXT NOT NULL,
              value REAL NOT NULL,
              unit TEXT,
              drawn_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS protocols (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              name TEXT NOT NULL,
              description TEXT,
              start_date TEXT NOT NULL,
              end_date TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              is_public INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS protocol_compliance (
              id TEXT PRIMARY KEY,
              protocol_id TEXT NOT NULL,
              compliance_date TEXT NOT NULL,
              adhered INTEGER NOT NULL,
              notes TEXT,
              logged_at TEXT NOT NULL,
              UNIQUE(protocol_id, compliance_date),
              FOREIGN KEY(protocol_id) REFERENCES protocols(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS genetic_insights (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              snp TEXT NOT NULL,
              label TEXT NOT NULL,
              interpreted_result TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(user_id, snp),
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS integration_connections (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              config TEXT NOT NULL DEFAULT '{}',
              status TEXT NOT NULL DEFAULT 'configured',
              last_sync_at TEXT,
              last_error TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(user_id, provider),
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        ensure_dev_user(db)


def ensure_dev_user(db: sqlite3.Connection) -> sqlite3.Row:
    row = db.execute("SELECT * FROM users WHERE email = ?", ("dev@local.test",)).fetchone()
    if row:
        return row
    user_id = str(uuid.UUID("00000000-0000-4000-8000-000000000001"))
    now = utcnow()
    db.execute(
        """
        INSERT INTO users (id, email, subscription_tier, onboarding_completed, home_timezone, created_at, updated_at)
        VALUES (?, ?, 'free', 0, ?, ?, ?)
        """,
        (user_id, "dev@local.test", "America/Winnipeg", now, now),
    )
    db.commit()
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def get_user() -> dict[str, Any]:
    with connect() as db:
        return dict(ensure_dev_user(db))


def calculate_score(user_id: str) -> dict[str, Any]:
    with connect() as db:
        user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        birth_year = int(user["birth_year"] or 1988)
        chrono = max(18, datetime.now().year - birth_year)
        biomarkers = db.execute("SELECT marker_name_normalized, value FROM biomarker_records WHERE user_id = ?", (user_id,)).fetchall()
        metrics = db.execute("SELECT metric_type, value FROM wearable_metrics WHERE user_id = ?", (user_id,)).fetchall()
        marker = {r["marker_name_normalized"]: float(r["value"]) for r in biomarkers}
        metric = {r["metric_type"]: float(r["value"]) for r in metrics}

        glucose_note = interpret_biomarker("glucose", marker.get("glucose", 90), "mg/dL")
        a1c_note = interpret_biomarker("hba1c", marker.get("hba1c", 5.2), "%")
        metabolic = 82
        if "above common" in glucose_note["interpretation"] or "prediabetes" in a1c_note["interpretation"]:
            metabolic = 68
        if "diabetes screening" in glucose_note["interpretation"] or "diabetes screening" in a1c_note["interpretation"]:
            metabolic = 58
        inflammation = 76 if marker.get("crp", 1) >= 2 else 86
        sleep = min(95, max(45, metric.get("sleep_efficiency", 78)))
        cardio = 80 if metric.get("resting_hr", 62) < 70 else 65
        stress = 82 if metric.get("hrv_rmssd", 45) >= 40 else 62
        environment = 82 if metric.get("aqi", 60) < 100 else 60
        pillars = {
            "metabolic": metabolic,
            "inflammation": inflammation,
            "sleep": sleep,
            "cardiovascular": cardio,
            "stress_resilience": stress,
            "environment": environment,
        }
        avg = sum(pillars.values()) / len(pillars)
        age_delta = round((75 - avg) / 5, 1)
        score = {
            "biological_age": round(chrono + age_delta, 1),
            "chronological_age": float(chrono),
            "age_delta": age_delta,
            "pillar_scores": pillars,
            "data_completeness": min(1.0, round((len(marker) + len(metric)) / 8, 2)),
            "model_version": "local-prototype-0.3",
            "safety_notice": SAFETY_NOTICE,
            "interpretation_notes": [
                "This is an exploratory wellness index, not a diagnosis or validated biological-age test.",
                "Pillar scores are heuristic and should be used for product testing only.",
                "Clinical interpretation requires symptoms, medication history, lab reference intervals, and clinician review.",
            ],
            "sources": source_payload(["cdc_glucose", "cdc_a1c", "medline_crp", "airnow_aqi"]),
        }
        row_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO bio_age_scores
            (id, user_id, biological_age, chronological_age, age_delta, pillar_scores, data_completeness, calculated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                user_id,
                score["biological_age"],
                score["chronological_age"],
                score["age_delta"],
                json.dumps(pillars),
                score["data_completeness"],
                utcnow(),
            ),
        )
        db.commit()
        score["bio_age_score_id"] = row_id
        return score


def latest_score(user_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM bio_age_scores WHERE user_id = ? ORDER BY calculated_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        trend = db.execute(
            "SELECT biological_age, calculated_at FROM bio_age_scores WHERE user_id = ? ORDER BY calculated_at ASC",
            (user_id,),
        ).fetchall()
        return {
            "biological_age": row["biological_age"],
            "chronological_age": row["chronological_age"],
            "age_delta": row["age_delta"],
            "pillar_scores": json.loads(row["pillar_scores"]),
            "data_completeness": row["data_completeness"],
            "calculated_at": row["calculated_at"],
            "trend_data": [dict(r) for r in trend],
            "model_version": "local-prototype-0.3",
            "safety_notice": SAFETY_NOTICE,
            "interpretation_notes": [
                "This is an exploratory wellness index, not a diagnosis or validated biological-age test.",
                "Pillar scores are heuristic and should be used for product testing only.",
            ],
            "sources": source_payload(["cdc_glucose", "cdc_a1c", "medline_crp", "airnow_aqi"]),
        }


def seed_demo_data() -> None:
    with connect() as db:
        user = ensure_dev_user(db)
        user_id = user["id"]
        if db.execute("SELECT COUNT(*) FROM wearable_metrics WHERE user_id = ?", (user_id,)).fetchone()[0]:
            return
        now = datetime.now(timezone.utc)
        for i, aqi in enumerate([42, 55, 68, 88, 104, 77, 61]):
            category, risk = classify_aqi(aqi)
            db.execute(
                """
                INSERT INTO wearable_metrics (user_id, source, metric_type, value, unit, recorded_at, metadata)
                VALUES (?, 'environment', 'aqi', ?, 'index', ?, ?)
                """,
                (user_id, aqi, (now - timedelta(days=6 - i)).isoformat(), json.dumps({"category": category, "risk_level": risk})),
            )
        for metric_type, value, unit in [
            ("hrv_rmssd", 48, "ms"),
            ("resting_hr", 62, "bpm"),
            ("sleep_efficiency", 84, "%"),
            ("vo2max", 43, "ml/kg/min"),
        ]:
            db.execute(
                """
                INSERT INTO wearable_metrics (user_id, source, metric_type, value, unit, recorded_at, metadata)
                VALUES (?, 'manual', ?, ?, ?, ?, '{}')
                """,
                (user_id, metric_type, value, unit, now.isoformat()),
            )
        for marker, value, unit in [("glucose", 88, "mg/dL"), ("crp", 0.9, "mg/L"), ("hba1c", 5.1, "%")]:
            normalized = normalize_marker_name(marker)
            db.execute(
                """
                INSERT INTO biomarker_records (id, user_id, marker_name, marker_name_normalized, value, unit, drawn_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), user_id, marker.upper(), normalized, value, unit, date.today().isoformat(), utcnow()),
            )
        db.commit()
