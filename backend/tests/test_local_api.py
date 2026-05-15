from fastapi.testclient import TestClient

from app.medical_knowledge import classify_aqi, interpret_biomarker
from app.main import app


def test_health_dependencies_local_mode() -> None:
    with TestClient(app) as client:
        res = client.get("/health/dependencies")

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"]["message"] == "Local SQLite"
    assert body["redis"]["message"] == "In-memory local mode"


def test_simulator_local_fallback() -> None:
    with TestClient(app) as client:
        res = client.post("/api/v1/simulator/run", json={"scenario": "Improve sleep"})

    assert res.status_code == 200
    assert res.json()["confidence"] == "moderate"
    assert "not medical advice" in res.json()["caveats"].lower() or "does not diagnose" in res.json()["caveats"].lower()


def test_model_card_exposes_sources_and_limitations() -> None:
    with TestClient(app) as client:
        res = client.get("/api/v1/medical-knowledge/model-card")

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "prototype"
    assert "does not diagnose" in body["safety_notice"].lower()
    assert any(source["label"].startswith("CDC") for source in body["sources"])


def test_score_response_is_marked_non_diagnostic() -> None:
    with TestClient(app) as client:
        client.post("/api/v1/dev/seed")
        res = client.post("/api/v1/users/me/calculate-score")

    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "local-prototype-0.3"
    assert "not a diagnosis" in " ".join(body["interpretation_notes"]).lower()


def test_official_threshold_boundaries_are_locked() -> None:
    assert classify_aqi(50)[0] == "Good"
    assert classify_aqi(51)[0] == "Moderate"
    assert classify_aqi(101)[0] == "Unhealthy for sensitive groups"
    assert classify_aqi(151)[0] == "Unhealthy"
    assert classify_aqi(301)[0] == "Hazardous"

    assert interpret_biomarker("glucose", 99, "mg/dL")["interpretation"] == "within common fasting screening range"
    assert interpret_biomarker("glucose", 100, "mg/dL")["interpretation"] == "above common fasting screening range"
    assert interpret_biomarker("glucose", 126, "mg/dL")["interpretation"] == "at or above diabetes screening threshold"
    assert interpret_biomarker("hba1c", 5.6, "%")["interpretation"] == "below CDC prediabetes screening threshold"
    assert interpret_biomarker("hba1c", 5.7, "%")["interpretation"] == "within CDC prediabetes screening range"
    assert interpret_biomarker("hba1c", 6.5, "%")["interpretation"] == "at or above CDC diabetes screening threshold"


def test_biomarkers_are_listed_with_source_backed_interpretation() -> None:
    with TestClient(app) as client:
        create = client.post("/api/v1/users/me/biomarkers", json={"marker_name": "A1C", "value": 5.8, "unit": "%"})
        listed = client.get("/api/v1/users/me/biomarkers?limit=5")

    assert create.status_code == 200
    assert listed.status_code == 200
    row = listed.json()[0]
    assert row["interpretation"]["marker"] == "hba1c"
    assert "prediabetes" in row["interpretation"]["interpretation"].lower()
    assert row["interpretation"]["sources"][0]["label"].startswith("CDC")
    assert "diagnosis requires" in create.json()["interpretation"]["caution"].lower() or "affected by" in create.json()["interpretation"]["caution"].lower()


def test_integrations_catalog_and_sample_import() -> None:
    with TestClient(app) as client:
        catalog = client.get("/api/v1/integrations")
        sample = client.post("/api/v1/integrations/oura/sample-import")
        metrics = client.get("/api/v1/users/me/wearable-metrics?limit=10")

    assert catalog.status_code == 200
    providers = {item["provider"]: item for item in catalog.json()}
    assert {"oura", "whoop", "google_health_connect", "apple_health"}.issubset(providers)
    assert providers["apple_health"]["mode"] == "device_import"
    assert providers["oura"]["mode"] == "cloud_oauth"
    assert providers["oura"]["authorize_url"] == "https://cloud.ouraring.com/oauth/authorize"
    assert providers["oura"]["token_url"] == "https://api.ouraring.com/oauth/token"
    assert "spo2Daily" in providers["oura"]["scopes"]
    assert sample.status_code == 200
    assert sample.json()["imported"] >= 1
    assert any(metric["source"] == "oura" for metric in metrics.json())


def test_oura_authorize_url_uses_official_oauth_endpoints() -> None:
    with TestClient(app) as client:
        configured = client.post(
            "/api/v1/integrations/oura/configure",
            json={"client_id": "client_123", "client_secret": "secret_456", "redirect_uri": "http://localhost:3001/integrations?provider=oura"},
        )
        res = client.get("/api/v1/integrations/oura/authorize-url?state=test-state")

    assert configured.status_code == 200
    assert res.status_code == 200
    body = res.json()
    assert body["authorize_url"].startswith("https://cloud.ouraring.com/oauth/authorize?")
    assert "client_id=client_123" in body["authorize_url"]
    assert "state=test-state" in body["authorize_url"]
    assert "scope=daily+heartrate+workout+session+spo2Daily" in body["authorize_url"]
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fintegrations%3Fprovider%3Doura" in body["authorize_url"]


def test_normalized_device_import_records() -> None:
    with TestClient(app) as client:
        res = client.post(
            "/api/v1/integrations/import",
            json={
                "provider": "apple_health",
                "records": [
                    {"metric_type": "steps", "value": 9001, "unit": "count", "recorded_at": "2026-05-14T12:00:00+00:00"},
                    {"type": "resting_hr", "value": 59, "unit": "bpm", "timestamp": "2026-05-14T12:00:00+00:00"},
                ],
            },
        )
        metrics = client.get("/api/v1/users/me/wearable-metrics?limit=20")

    assert res.status_code == 200
    assert res.json()["imported"] == 2
    imported = [metric for metric in metrics.json() if metric["source"] == "apple_health"]
    assert any(metric["metric_type"] == "steps" and metric["value"] == 9001 for metric in imported)
