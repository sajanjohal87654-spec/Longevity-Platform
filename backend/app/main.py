from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.integrations import CATALOG, build_oauth_authorize_url, exchange_oura_code, mask_config, normalize_oura_payload, normalize_records, normalize_whoop_payload, public_catalog, read_access_token, refresh_oura_token, sample_records, fetch_json
from app.medical_knowledge import SAFETY_NOTICE, interpret_biomarker, model_card, normalize_marker_name, source_payload
from app.storage import classify_aqi, connect, calculate_score, get_user, init_db, latest_score, seed_demo_data, utcnow

default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://longevityplatform.app",
    "https://www.longevityplatform.app",
]
extra_origins = [origin.strip() for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if origin.strip()]

app = FastAPI(title="Longevity Platform API", version="0.2.0-local")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(set(default_origins + extra_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


class UserUpdate(BaseModel):
    birth_year: Optional[int] = None
    biological_sex: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    home_timezone: Optional[str] = None
    aqi_zip: Optional[str] = None


class WearableMetricCreate(BaseModel):
    metric_type: str
    value: float
    unit: Optional[str] = None
    recorded_at: Optional[datetime] = None
    source: str = "manual"
    timezone: Optional[str] = None


class BiomarkerCreate(BaseModel):
    marker_name: str
    value: float
    unit: Optional[str] = None
    drawn_at: Optional[date] = None


class ProtocolCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None


class ProtocolUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None


class ComplianceBody(BaseModel):
    compliance_date: date
    adhered: bool
    notes: Optional[str] = None


class GeneticInsightIn(BaseModel):
    snp: str
    label: str
    interpreted_result: str


class GeneticInsightsBody(BaseModel):
    insights: List[GeneticInsightIn]


class SimulatorBody(BaseModel):
    scenario: str


class IntegrationConfigBody(BaseModel):
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None
    notes: Optional[str] = None


class IntegrationImportBody(BaseModel):
    provider: str
    records: List[dict[str, Any]]


class OAuthCallbackBody(BaseModel):
    code: str
    state: Optional[str] = None


def merge_token_payload(config: dict[str, Any], token_payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    expires_in = token_payload.get("expires_in")
    token_expires_at = None
    if isinstance(expires_in, int):
        token_expires_at = (now + timedelta(seconds=expires_in)).isoformat()
    return {
        **config,
        "access_token": token_payload.get("access_token") or config.get("access_token"),
        "refresh_token": token_payload.get("refresh_token") or config.get("refresh_token"),
        "token_type": token_payload.get("token_type") or config.get("token_type"),
        "expires_in": expires_in or config.get("expires_in"),
        "token_obtained_at": now.isoformat(),
        "token_expires_at": token_expires_at or config.get("token_expires_at"),
        "granted_scope": token_payload.get("scope") or config.get("granted_scope"),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.2.0-local"}


@app.get("/health/dependencies")
def dependencies() -> dict[str, Any]:
    with connect() as db:
        rows = db.execute("SELECT provider, status FROM integration_connections WHERE user_id = ?", (get_user()["id"],)).fetchall()
    active = {row["provider"]: row["status"] in ("configured", "synced") for row in rows}
    return {
        "status": "ok",
        "api": {"status": "ok"},
        "database": {"status": "ok", "message": "Local SQLite"},
        "redis": {"status": "ok", "message": "In-memory local mode"},
        "integrations": {
            "clerk": False,
            "terra": False,
            "stripe": False,
            "anthropic": False,
            "s3": False,
            "oura": active.get("oura", bool(read_access_token("oura"))),
            "whoop": active.get("whoop", bool(read_access_token("whoop"))),
            "apple_health": active.get("apple_health", False),
            "google_health_connect": active.get("google_health_connect", False),
        },
        "mode": "standalone-local",
    }


@app.get("/api/v1/medical-knowledge/model-card")
def medical_model_card() -> dict[str, Any]:
    return model_card()


@app.post("/api/v1/dev/seed")
def seed() -> dict[str, str]:
    seed_demo_data()
    return {"status": "seeded"}


@app.get("/api/v1/users/me")
def read_me() -> dict[str, Any]:
    user = get_user()
    user["onboarding_completed"] = bool(user["onboarding_completed"])
    return user


@app.patch("/api/v1/users/me")
def update_me(body: UserUpdate) -> dict[str, Any]:
    user = get_user()
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        return read_me()
    assignments = []
    values: list[Any] = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(int(value) if key == "onboarding_completed" and value is not None else value)
    values.extend([utcnow(), user["id"]])
    with connect() as db:
        db.execute(f"UPDATE users SET {', '.join(assignments)}, updated_at = ? WHERE id = ?", values)
        db.commit()
    return read_me()


@app.post("/api/v1/users/me/calculate-score")
def calculate_me() -> dict[str, Any]:
    return calculate_score(get_user()["id"])


@app.get("/api/v1/users/me/bio-age")
def bio_age() -> dict[str, Any]:
    score = latest_score(get_user()["id"])
    if score is None:
        raise HTTPException(status_code=404, detail="No score yet")
    return score


@app.get("/api/v1/users/me/connections")
def connections() -> list[dict[str, Any]]:
    user_id = get_user()["id"]
    with connect() as db:
        rows = db.execute(
            "SELECT source, MAX(recorded_at) AS last_sync FROM wearable_metrics WHERE user_id = ? GROUP BY source",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/v1/integrations")
def integrations() -> list[dict[str, Any]]:
    user_id = get_user()["id"]
    with connect() as db:
        rows = db.execute("SELECT provider, config, status, last_sync_at, last_error, updated_at FROM integration_connections WHERE user_id = ?", (user_id,)).fetchall()
    connected = {row["provider"]: dict(row) for row in rows}
    result = []
    for item in public_catalog():
        row = connected.get(item["provider"])
        env_token = bool(read_access_token(item["provider"]))
        result.append(
            {
                **item,
                "connected": bool(row) or env_token,
                "status": row["status"] if row else ("env_token" if env_token else "not_configured"),
                "last_sync_at": row["last_sync_at"] if row else None,
                "last_error": row["last_error"] if row else None,
                "config": mask_config(json.loads(row["config"])) if row else {},
            }
        )
    return result


@app.post("/api/v1/integrations/{provider}/configure")
def configure_integration(provider: str, body: IntegrationConfigBody) -> dict[str, Any]:
    if provider not in CATALOG:
        raise HTTPException(status_code=404, detail="Unknown integration provider")
    config = {key: value for key, value in body.model_dump(exclude_none=True).items() if value != ""}
    now = utcnow()
    with connect() as db:
        db.execute(
            """
            INSERT INTO integration_connections (id, user_id, provider, config, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'configured', ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
              config = excluded.config,
              status = 'configured',
              last_error = NULL,
              updated_at = excluded.updated_at
            """,
            (str(uuid.uuid4()), get_user()["id"], provider, json.dumps(config), now, now),
        )
        db.commit()
    return {"provider": provider, "status": "configured", "config": mask_config(config)}


@app.get("/api/v1/integrations/{provider}/authorize-url")
def integration_authorize_url(provider: str, state: str = Query(default="local-dev")) -> dict[str, Any]:
    if provider not in CATALOG:
        raise HTTPException(status_code=404, detail="Unknown integration provider")
    with connect() as db:
        row = db.execute("SELECT config FROM integration_connections WHERE user_id = ? AND provider = ?", (get_user()["id"], provider)).fetchone()
    config = json.loads(row["config"]) if row else {}
    try:
        url = build_oauth_authorize_url(provider, config, state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"provider": provider, "authorize_url": url}


@app.post("/api/v1/integrations/{provider}/oauth-callback")
def integration_oauth_callback(provider: str, body: OAuthCallbackBody) -> dict[str, Any]:
    if provider != "oura":
        raise HTTPException(status_code=400, detail="OAuth callback exchange is currently implemented for Oura")
    with connect() as db:
        row = db.execute("SELECT config FROM integration_connections WHERE user_id = ? AND provider = ?", (get_user()["id"], provider)).fetchone()
    config = json.loads(row["config"]) if row else {}
    try:
        token_payload = exchange_oura_code(config, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    updated_config = merge_token_payload(config, token_payload)
    now = utcnow()
    with connect() as db:
        db.execute(
            """
            INSERT INTO integration_connections (id, user_id, provider, config, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'configured', ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
              config = excluded.config,
              status = 'configured',
              last_error = NULL,
              updated_at = excluded.updated_at
            """,
            (str(uuid.uuid4()), get_user()["id"], provider, json.dumps(updated_config), now, now),
        )
        db.commit()
    return {"provider": provider, "status": "configured", "config": mask_config(updated_config)}


@app.post("/api/v1/integrations/{provider}/refresh")
def refresh_integration(provider: str) -> dict[str, Any]:
    if provider != "oura":
        raise HTTPException(status_code=400, detail="Refresh is currently implemented for Oura")
    with connect() as db:
        row = db.execute("SELECT config FROM integration_connections WHERE user_id = ? AND provider = ?", (get_user()["id"], provider)).fetchone()
    config = json.loads(row["config"]) if row else {}
    try:
        token_payload = refresh_oura_token(config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    updated_config = merge_token_payload(config, token_payload)
    now = utcnow()
    with connect() as db:
        db.execute(
            """
            INSERT INTO integration_connections (id, user_id, provider, config, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'configured', ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
              config = excluded.config,
              status = 'configured',
              last_error = NULL,
              updated_at = excluded.updated_at
            """,
            (str(uuid.uuid4()), get_user()["id"], provider, json.dumps(updated_config), now, now),
        )
        db.commit()
    return {"provider": provider, "status": "configured", "config": mask_config(updated_config)}


def insert_normalized_metrics(records: list[dict[str, Any]]) -> int:
    user_id = get_user()["id"]
    with connect() as db:
        for record in records:
            db.execute(
                """
                INSERT INTO wearable_metrics (user_id, source, metric_type, value, unit, recorded_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    record["source"],
                    record["metric_type"],
                    record["value"],
                    record.get("unit"),
                    record["recorded_at"],
                    json.dumps(record.get("metadata") or {}),
                ),
            )
        db.commit()
    return len(records)


@app.post("/api/v1/integrations/import")
def import_integration_records(body: IntegrationImportBody) -> dict[str, Any]:
    if body.provider not in CATALOG:
        raise HTTPException(status_code=404, detail="Unknown integration provider")
    records = normalize_records(body.provider, body.records)
    imported = insert_normalized_metrics(records)
    now = utcnow()
    with connect() as db:
        db.execute(
            """
            INSERT INTO integration_connections (id, user_id, provider, config, status, last_sync_at, created_at, updated_at)
            VALUES (?, ?, ?, '{}', 'synced', ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET status = 'synced', last_sync_at = excluded.last_sync_at, last_error = NULL, updated_at = excluded.updated_at
            """,
            (str(uuid.uuid4()), get_user()["id"], body.provider, now, now, now),
        )
        db.commit()
    return {"provider": body.provider, "imported": imported, "status": "synced"}


@app.post("/api/v1/integrations/{provider}/sample-import")
def sample_import(provider: str) -> dict[str, Any]:
    if provider not in CATALOG:
        raise HTTPException(status_code=404, detail="Unknown integration provider")
    records = sample_records(provider)
    imported = insert_normalized_metrics(records)
    return {"provider": provider, "imported": imported, "status": "sample_imported"}


@app.post("/api/v1/integrations/{provider}/sync")
def sync_integration(provider: str) -> dict[str, Any]:
    if provider not in CATALOG:
        raise HTTPException(status_code=404, detail="Unknown integration provider")
    with connect() as db:
        row = db.execute("SELECT config FROM integration_connections WHERE user_id = ? AND provider = ?", (get_user()["id"], provider)).fetchone()
    config = json.loads(row["config"]) if row else {}
    token = read_access_token(provider, config)
    if not token:
        raise HTTPException(status_code=400, detail="Add an access token or set the provider access-token environment variable first")
    try:
        if provider == "oura":
            payloads = [
                fetch_json("https://api.ouraring.com/v2/usercollection/sleep", token),
                fetch_json("https://api.ouraring.com/v2/usercollection/daily_sleep", token),
            ]
            records = normalize_oura_payload(payloads)
        elif provider == "whoop":
            payloads = [
                fetch_json("https://api.prod.whoop.com/developer/v2/recovery", token),
                fetch_json("https://api.prod.whoop.com/developer/v2/activity/sleep", token),
                fetch_json("https://api.prod.whoop.com/developer/v2/cycle", token),
            ]
            records = normalize_whoop_payload(payloads)
        else:
            raise HTTPException(status_code=400, detail="This provider requires device import rather than backend sync")
        imported = insert_normalized_metrics(records)
        status = "synced"
        error = None
    except RuntimeError as exc:
        imported = 0
        status = "error"
        error = str(exc)
    now = utcnow()
    with connect() as db:
        db.execute(
            """
            INSERT INTO integration_connections (id, user_id, provider, config, status, last_sync_at, last_error, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
              status = excluded.status,
              last_sync_at = excluded.last_sync_at,
              last_error = excluded.last_error,
              updated_at = excluded.updated_at
            """,
            (str(uuid.uuid4()), get_user()["id"], provider, json.dumps(config), status, now, error, now, now),
        )
        db.commit()
    if error:
        raise HTTPException(status_code=502, detail=error)
    return {"provider": provider, "imported": imported, "status": status}


@app.get("/api/v1/users/me/wearable-metrics")
def wearable_metrics(limit: int = 50) -> list[dict[str, Any]]:
    user_id = get_user()["id"]
    safe_limit = min(max(limit, 1), 200)
    with connect() as db:
        rows = db.execute(
            "SELECT id, source, metric_type, value, unit, recorded_at FROM wearable_metrics WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?",
            (user_id, safe_limit),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/v1/users/me/wearable-metrics")
def create_metric(body: WearableMetricCreate) -> dict[str, Any]:
    user_id = get_user()["id"]
    metadata: dict[str, Any] = {"entry": "manual"}
    if body.timezone:
        metadata["timezone"] = body.timezone
    if body.source == "environment" and body.metric_type == "aqi":
        category, risk = classify_aqi(body.value)
        metadata.update({"category": category, "risk_level": risk})
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO wearable_metrics (user_id, source, metric_type, value, unit, recorded_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, body.source, body.metric_type, body.value, body.unit, (body.recorded_at or datetime.now(timezone.utc)).isoformat(), json.dumps(metadata)),
        )
        db.commit()
        row = db.execute(
            "SELECT id, source, metric_type, value, unit, recorded_at FROM wearable_metrics WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
    return dict(row)


@app.post("/api/v1/users/me/biomarkers")
def create_biomarker(body: BiomarkerCreate) -> dict[str, Any]:
    user_id = get_user()["id"]
    normalized = normalize_marker_name(body.marker_name)
    row_id = str(uuid.uuid4())
    with connect() as db:
        db.execute(
            """
            INSERT INTO biomarker_records (id, user_id, marker_name, marker_name_normalized, value, unit, drawn_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (row_id, user_id, body.marker_name, normalized, body.value, body.unit, (body.drawn_at or date.today()).isoformat(), utcnow()),
        )
        db.commit()
    return {"id": row_id, "interpretation": interpret_biomarker(normalized, body.value, body.unit)}


@app.get("/api/v1/users/me/biomarkers")
def list_biomarkers(limit: int = 50) -> list[dict[str, Any]]:
    user_id = get_user()["id"]
    safe_limit = min(max(limit, 1), 200)
    with connect() as db:
        rows = db.execute(
            """
            SELECT id, marker_name, marker_name_normalized, value, unit, drawn_at, created_at
            FROM biomarker_records
            WHERE user_id = ?
            ORDER BY drawn_at DESC, created_at DESC
            LIMIT ?
            """,
            (user_id, safe_limit),
        ).fetchall()
    return [
        {
            **dict(row),
            "interpretation": interpret_biomarker(row["marker_name_normalized"], float(row["value"]), row["unit"]),
        }
        for row in rows
    ]


@app.get("/api/v1/users/me/environment")
def environment() -> dict[str, Any]:
    user_id = get_user()["id"]
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    with connect() as db:
        aqi_rows = db.execute(
            "SELECT value, recorded_at FROM wearable_metrics WHERE user_id = ? AND source = 'environment' AND metric_type = 'aqi' AND recorded_at >= ? ORDER BY recorded_at ASC",
            (user_id, since),
        ).fetchall()
        crp = db.execute(
            "SELECT value, drawn_at FROM biomarker_records WHERE user_id = ? AND marker_name_normalized IN ('crp','hs_crp') ORDER BY drawn_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    latest = aqi_rows[-1] if aqi_rows else None
    category, risk = classify_aqi(float(latest["value"])) if latest else (None, None)
    latest_crp = float(crp["value"]) if crp else None
    context = "Add AQI and CRP data to compare exposure with inflammation context. This is not a diagnosis."
    if latest and latest_crp is not None:
        context = (
            "AQI and CRP are both elevated in the saved data; consider reviewing trends with a clinician if this persists."
            if latest["value"] >= 100 and latest_crp >= 2
            else "Recent AQI and CRP are available for non-diagnostic trend review."
        )
    return {
        "latest_aqi": float(latest["value"]) if latest else None,
        "latest_aqi_at": latest["recorded_at"] if latest else None,
        "aqi_category": category,
        "aqi_risk_level": risk,
        "latest_crp": latest_crp,
        "latest_crp_drawn_at": crp["drawn_at"] if crp else None,
        "high_aqi_observations_30d": sum(1 for r in aqi_rows if r["value"] >= 100),
        "context": context,
        "safety_notice": SAFETY_NOTICE,
        "sources": source_payload(["airnow_aqi", "medline_crp"]),
        "recent_aqi": [
            {"recorded_at": r["recorded_at"], "value": float(r["value"]), "category": classify_aqi(float(r["value"]))[0], "risk_level": classify_aqi(float(r["value"]))[1]}
            for r in aqi_rows
        ],
    }


@app.get("/api/v1/users/me/travel-mode")
def travel_mode() -> dict[str, Any]:
    user = get_user()
    with connect() as db:
        row = db.execute(
            "SELECT metadata, recorded_at FROM wearable_metrics WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1",
            (user["id"],),
        ).fetchone()
    tz = None
    if row:
        tz = json.loads(row["metadata"] or "{}").get("timezone")
    active = bool(tz and user["home_timezone"] and tz != user["home_timezone"])
    return {
        "active": active,
        "home_timezone": user["home_timezone"],
        "current_timezone": tz,
        "shift_hours": None,
        "latest_data_at": row["recorded_at"] if row else None,
        "suppress_alerts_until": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat() if active else None,
        "suppressed_alert_types": ["hrv_decline", "sleep_disruption", "recovery_decline"] if active else [],
    }


@app.get("/api/v1/protocols")
def list_protocols() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM protocols WHERE user_id = ? ORDER BY created_at DESC", (get_user()["id"],)).fetchall()
    return [{**dict(r), "is_active": bool(r["is_active"]), "is_public": bool(r["is_public"])} for r in rows]


@app.post("/api/v1/protocols")
def create_protocol(body: ProtocolCreate) -> dict[str, str]:
    if body.end_date and body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="Protocol end date cannot be before start date")
    row_id = str(uuid.uuid4())
    with connect() as db:
        db.execute(
            "INSERT INTO protocols (id, user_id, name, description, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (row_id, get_user()["id"], body.name.strip(), body.description, body.start_date.isoformat(), body.end_date.isoformat() if body.end_date else None, utcnow()),
        )
        db.commit()
    return {"id": row_id}


@app.get("/api/v1/protocols/{protocol_id}")
def get_protocol(protocol_id: str) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT * FROM protocols WHERE id = ? AND user_id = ?", (protocol_id, get_user()["id"])).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {**dict(row), "is_active": bool(row["is_active"]), "is_public": bool(row["is_public"])}


@app.patch("/api/v1/protocols/{protocol_id}")
def update_protocol(protocol_id: str, body: ProtocolUpdate) -> dict[str, Any]:
    current = get_protocol(protocol_id)
    fields = body.model_dump(exclude_unset=True)
    next_start = fields.get("start_date") or date.fromisoformat(current["start_date"])
    next_end = fields.get("end_date") if "end_date" in fields else (date.fromisoformat(current["end_date"]) if current["end_date"] else None)
    if next_end and next_end < next_start:
        raise HTTPException(status_code=400, detail="Protocol end date cannot be before start date")
    if not fields:
        return current
    assignments = []
    values: list[Any] = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        if isinstance(value, date):
            value = value.isoformat()
        if isinstance(value, bool):
            value = int(value)
        values.append(value)
    values.extend([protocol_id, get_user()["id"]])
    with connect() as db:
        db.execute(f"UPDATE protocols SET {', '.join(assignments)} WHERE id = ? AND user_id = ?", values)
        db.commit()
    return get_protocol(protocol_id)


@app.get("/api/v1/protocols/{protocol_id}/compliance")
def list_compliance(protocol_id: str) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM protocol_compliance WHERE protocol_id = ? ORDER BY compliance_date DESC", (protocol_id,)).fetchall()
    return [{**dict(r), "adhered": bool(r["adhered"])} for r in rows]


@app.patch("/api/v1/protocols/{protocol_id}/compliance")
def log_compliance(protocol_id: str, body: ComplianceBody) -> dict[str, str]:
    get_protocol(protocol_id)
    with connect() as db:
        db.execute(
            """
            INSERT INTO protocol_compliance (id, protocol_id, compliance_date, adhered, notes, logged_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(protocol_id, compliance_date) DO UPDATE SET adhered = excluded.adhered, notes = excluded.notes, logged_at = excluded.logged_at
            """,
            (str(uuid.uuid4()), protocol_id, body.compliance_date.isoformat(), int(body.adhered), body.notes, utcnow()),
        )
        db.commit()
    return {"status": "ok"}


@app.get("/api/v1/protocols/{protocol_id}/report")
def protocol_report(protocol_id: str) -> dict[str, Any]:
    compliance = list_compliance(protocol_id)
    if len(compliance) < 14:
        raise HTTPException(status_code=400, detail="Need at least 14 days of compliance")
    rate = sum(1 for r in compliance if r["adhered"]) / len(compliance)
    return {
        "deltas": {"adherence_rate": round(rate * 100, 1), "sleep_efficiency": 2.3, "hrv_rmssd": 4.1},
        "narrative": f"The data suggests {rate:.0%} adherence. Continue the protocol another two weeks before making strong conclusions.",
    }


@app.get("/api/v1/genetics")
def list_genetics() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT id, snp, label, interpreted_result FROM genetic_insights WHERE user_id = ? ORDER BY snp", (get_user()["id"],)).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/v1/genetics")
def save_genetics(body: GeneticInsightsBody) -> list[dict[str, Any]]:
    allowed = {"apoe": "APOE genotype", "rs429358": "APOE marker 1", "rs7412": "APOE marker 2", "rs1801133": "MTHFR C677T", "rs1815739": "ACTN3 R577X", "rs9939609": "FTO"}
    sanitized = [i for i in body.insights if i.snp.strip() in allowed and i.interpreted_result.strip()]
    if not sanitized:
        raise HTTPException(status_code=400, detail="No supported genetic insights found")
    with connect() as db:
        for item in sanitized:
            snp = item.snp.strip()
            db.execute(
                """
                INSERT INTO genetic_insights (id, user_id, snp, label, interpreted_result, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, snp) DO UPDATE SET label = excluded.label, interpreted_result = excluded.interpreted_result
                """,
                (str(uuid.uuid4()), get_user()["id"], snp, allowed[snp], item.interpreted_result.strip()[:200], utcnow()),
            )
        db.commit()
    return list_genetics()


@app.post("/api/v1/simulator/run")
def simulator(body: SimulatorBody) -> dict[str, Any]:
    text = body.scenario.strip() or "Lifestyle change"
    impact = -1.2 if any(word in text.lower() for word in ["sleep", "exercise", "protein", "zone 2", "meditation"]) else -0.6
    return {
        "scenario_title": text[:80],
        "projected_bio_age_change_years": impact,
        "uncertainty_low": impact - 0.8,
        "uncertainty_high": impact + 0.5,
        "timeframe_months": 6,
        "confidence": "moderate",
        "mechanism": "The modeled change improves one or more longevity pillars.",
        "key_evidence": "Prototype estimate; not a patient-specific clinical prediction.",
        "caveats": SAFETY_NOTICE,
        "top_supporting_intervention": "Track adherence for 14 days and compare wearable trends.",
        "sources": source_payload(["cdc_a1c", "cdc_glucose", "airnow_aqi"]),
    }


@app.post("/api/v1/reports/doctor-report")
def doctor_report() -> Response:
    from io import BytesIO

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(72, 740, "Longevity Platform Doctor Report")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(72, 710, f"Generated {date.today().isoformat()}")
    score = latest_score(get_user()["id"])
    pdf.drawString(72, 680, f"Latest biological age: {score['biological_age'] if score else 'not calculated'}")
    pdf.drawString(72, 650, "This local report summarizes available biomarkers, wearable metrics, protocols, and genetics insights.")
    pdf.drawString(72, 620, "Not diagnostic. Review findings with a licensed clinician.")
    pdf.showPage()
    pdf.save()
    return Response(buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=doctor-report.pdf"})
