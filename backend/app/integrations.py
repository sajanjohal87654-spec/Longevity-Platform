from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlencode
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

OURA_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize"
OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token"


def public_app_url() -> str:
    return os.getenv("APP_PUBLIC_URL", "http://localhost:3001").rstrip("/")


def default_oura_redirect_uri() -> str:
    return os.getenv("OURA_REDIRECT_URI", f"{public_app_url()}/integrations?provider=oura")

INTEGRATION_SOURCES = [
    {
        "label": "Oura Cloud API Authentication",
        "url": "https://cloud.ouraring.com/docs/authentication",
        "note": "OAuth2 endpoints, scopes, and bearer-token usage for Oura Cloud API.",
    },
    {
        "label": "WHOOP API",
        "url": "https://developer.whoop.com/api/",
        "note": "OAuth2 scopes and recovery, sleep, cycle, workout endpoints.",
    },
    {
        "label": "Android Health Connect",
        "url": "https://developer.android.com/health-and-fitness/health-connect",
        "note": "Device-side Android health and fitness data access.",
    },
    {
        "label": "Apple HealthKit Authorization",
        "url": "https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data",
        "note": "Device-side HealthKit permissions and privacy model.",
    },
]


CATALOG: dict[str, dict[str, Any]] = {
    "oura": {
        "name": "Oura",
        "mode": "cloud_oauth",
        "status_label": "Token or OAuth app required",
        "authorize_url": OURA_AUTHORIZE_URL,
        "token_url": OURA_TOKEN_URL,
        "redirect_uri": default_oura_redirect_uri(),
        "metrics": ["sleep_efficiency", "resting_hr", "hrv_rmssd", "spo2"],
        "scopes": ["daily", "heartrate", "workout", "session", "spo2Daily"],
        "docs": [INTEGRATION_SOURCES[0]],
        "setup": [
            "Create an Oura application and set the redirect URI shown here.",
            "Save client ID and client secret, then open Oura authorization.",
            "After Oura redirects back, this page exchanges the code for access and refresh tokens.",
        ],
    },
    "whoop": {
        "name": "WHOOP",
        "mode": "cloud_oauth",
        "status_label": "OAuth app required",
        "metrics": ["hrv_rmssd", "resting_hr", "recovery_score", "sleep_performance", "strain"],
        "scopes": ["read:recovery", "read:cycles", "read:workout", "read:sleep", "read:profile", "read:body_measurement"],
        "docs": [INTEGRATION_SOURCES[1]],
        "setup": [
            "Create a WHOOP developer app and request the read scopes you need.",
            "Use OAuth to obtain a user access token; paste it here for local development.",
            "Sync imports recovery, sleep, and strain summaries into local wearable metrics.",
        ],
    },
    "google_health_connect": {
        "name": "Google Health Connect",
        "mode": "device_import",
        "status_label": "Android bridge/import required",
        "metrics": ["steps", "sleep_efficiency", "resting_hr", "heart_rate", "vo2max"],
        "scopes": [],
        "docs": [INTEGRATION_SOURCES[2]],
        "setup": [
            "Health Connect is accessed on Android, not through a backend Google login.",
            "Use the import box for exported Health Connect JSON now.",
            "A future Android companion can post the same normalized records to this backend.",
        ],
    },
    "apple_health": {
        "name": "Apple Health",
        "mode": "device_import",
        "status_label": "iOS HealthKit bridge/import required",
        "metrics": ["steps", "sleep_efficiency", "resting_hr", "heart_rate", "vo2max", "workout_minutes"],
        "scopes": [],
        "docs": [INTEGRATION_SOURCES[3]],
        "setup": [
            "HealthKit authorization happens on iPhone or Apple Watch apps.",
            "Use the import box for Apple Health export-derived JSON now.",
            "A future iOS companion can post the same normalized records after HealthKit permission.",
        ],
    },
}


def public_catalog() -> list[dict[str, Any]]:
    items = []
    for key, value in CATALOG.items():
        item = {"provider": key, **value}
        if key == "oura":
            item["redirect_uri"] = default_oura_redirect_uri()
        items.append(item)
    return items


def read_access_token(provider: str, config: Optional[dict[str, Any]] = None) -> Optional[str]:
    config = config or {}
    env_key = f"{provider.upper()}_ACCESS_TOKEN"
    return config.get("access_token") or os.getenv(env_key)


def build_oauth_authorize_url(provider: str, config: dict[str, Any], state: str) -> str:
    if provider != "oura":
        raise ValueError("OAuth URL generation is only implemented for Oura")
    client_id = config.get("client_id") or os.getenv("OURA_CLIENT_ID")
    if not client_id:
        raise ValueError("Add Oura client_id first")
    redirect_uri = config.get("redirect_uri") or default_oura_redirect_uri()
    scope = " ".join(CATALOG["oura"]["scopes"])
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
        }
    )
    return f"{OURA_AUTHORIZE_URL}?{query}"


def exchange_oura_code(config: dict[str, Any], code: str) -> dict[str, Any]:
    client_id = config.get("client_id") or os.getenv("OURA_CLIENT_ID")
    client_secret = config.get("client_secret") or os.getenv("OURA_CLIENT_SECRET")
    redirect_uri = config.get("redirect_uri") or default_oura_redirect_uri()
    if not client_id or not client_secret:
        raise ValueError("Add Oura client_id and client_secret first")
    body = urlencode(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        OURA_TOKEN_URL,
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Oura token exchange returned HTTP {exc.code}: {detail[:240]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Oura token exchange failed: {exc.reason}") from exc


def refresh_oura_token(config: dict[str, Any]) -> dict[str, Any]:
    client_id = config.get("client_id") or os.getenv("OURA_CLIENT_ID")
    client_secret = config.get("client_secret") or os.getenv("OURA_CLIENT_SECRET")
    refresh_token = config.get("refresh_token") or os.getenv("OURA_REFRESH_TOKEN")
    if not client_id or not client_secret or not refresh_token:
        raise ValueError("Add Oura client_id, client_secret, and refresh_token first")
    body = urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        OURA_TOKEN_URL,
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Oura refresh returned HTTP {exc.code}: {detail[:240]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Oura refresh failed: {exc.reason}") from exc


def mask_config(config: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not config:
        return {}
    masked: dict[str, Any] = {}
    for key, value in config.items():
        if "token" in key or "secret" in key:
            masked[key] = bool(value)
        else:
            masked[key] = value
    return masked


def fetch_json(url: str, access_token: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Provider returned HTTP {exc.code}: {detail[:240]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Provider request failed: {exc.reason}") from exc


def normalize_records(provider: str, records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).isoformat()
    for record in records:
        metric_type = str(record.get("metric_type") or record.get("type") or "").strip()
        value = record.get("value")
        if not metric_type or value is None:
            continue
        normalized.append(
            {
                "source": provider,
                "metric_type": metric_type,
                "value": float(value),
                "unit": record.get("unit"),
                "recorded_at": record.get("recorded_at") or record.get("timestamp") or now,
                "metadata": {"imported": True, "provider_record": record.get("id") or record.get("record_id")},
            }
        )
    return normalized


def normalize_oura_payload(payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for payload in payloads:
        for item in payload.get("data", []):
            recorded_at = item.get("day") or item.get("bedtime_start") or item.get("timestamp")
            mappings = [
                ("sleep_efficiency", item.get("efficiency"), "%"),
                ("resting_hr", item.get("lowest_heart_rate") or item.get("average_heart_rate"), "bpm"),
                ("hrv_rmssd", item.get("average_hrv"), "ms"),
                ("spo2", item.get("average_spo2"), "%"),
            ]
            for metric_type, value, unit in mappings:
                if value is not None:
                    records.append({"metric_type": metric_type, "value": value, "unit": unit, "recorded_at": recorded_at})
    return normalize_records("oura", records)


def normalize_whoop_payload(payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for payload in payloads:
        for item in payload.get("records", []):
            recorded_at = item.get("created_at") or item.get("start") or item.get("updated_at")
            score = item.get("score") or {}
            mappings = [
                ("recovery_score", score.get("recovery_score"), "%"),
                ("resting_hr", score.get("resting_heart_rate"), "bpm"),
                ("hrv_rmssd", score.get("hrv_rmssd_milli"), "ms"),
                ("sleep_performance", score.get("sleep_performance_percentage"), "%"),
                ("strain", score.get("strain"), "score"),
                ("average_hr", score.get("average_heart_rate"), "bpm"),
            ]
            for metric_type, value, unit in mappings:
                if value is not None:
                    records.append({"metric_type": metric_type, "value": value, "unit": unit, "recorded_at": recorded_at})
    return normalize_records("whoop", records)


def sample_records(provider: str) -> list[dict[str, Any]]:
    base_time = datetime.now(timezone.utc).isoformat()
    samples = {
        "oura": [
            {"metric_type": "sleep_efficiency", "value": 86, "unit": "%", "recorded_at": base_time},
            {"metric_type": "hrv_rmssd", "value": 51, "unit": "ms", "recorded_at": base_time},
            {"metric_type": "resting_hr", "value": 58, "unit": "bpm", "recorded_at": base_time},
        ],
        "whoop": [
            {"metric_type": "recovery_score", "value": 72, "unit": "%", "recorded_at": base_time},
            {"metric_type": "hrv_rmssd", "value": 46, "unit": "ms", "recorded_at": base_time},
            {"metric_type": "strain", "value": 10.8, "unit": "score", "recorded_at": base_time},
        ],
        "google_health_connect": [
            {"metric_type": "steps", "value": 8420, "unit": "count", "recorded_at": base_time},
            {"metric_type": "vo2max", "value": 43.2, "unit": "ml/kg/min", "recorded_at": base_time},
        ],
        "apple_health": [
            {"metric_type": "steps", "value": 9130, "unit": "count", "recorded_at": base_time},
            {"metric_type": "workout_minutes", "value": 42, "unit": "min", "recorded_at": base_time},
        ],
    }
    return normalize_records(provider, samples.get(provider, []))
