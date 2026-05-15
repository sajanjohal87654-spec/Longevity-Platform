type Env = {
  DB: D1Database;
  APP_PUBLIC_URL?: string;
  CORS_ALLOW_ORIGINS?: string;
  OURA_REDIRECT_URI?: string;
  OURA_CLIENT_ID?: string;
  OURA_CLIENT_SECRET?: string;
};

type JsonRecord = Record<string, unknown>;

const USER_ID = "00000000-0000-4000-8000-000000000001";
const USER_EMAIL = "dev@local.test";
const SAFETY_NOTICE =
  "Educational wellness information only. This app does not diagnose, treat, prevent, or predict disease. Review medical decisions and abnormal findings with a licensed clinician.";

const SOURCES = {
  cdc_glucose: { label: "CDC - Diabetes Tests", url: "https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html" },
  cdc_a1c: { label: "CDC - A1C Test", url: "https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html" },
  medline_crp: { label: "MedlinePlus - C-Reactive Protein Test", url: "https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/" },
  airnow_aqi: { label: "AirNow - Air Quality Index Basics", url: "https://www.airnow.gov/aqi/aqi-basics/" },
};

const CATALOG = [
  {
    provider: "oura",
    label: "Oura",
    mode: "cloud_oauth",
    authorize_url: "https://cloud.ouraring.com/oauth/authorize",
    token_url: "https://api.ouraring.com/oauth/token",
    scopes: ["daily", "heartrate", "workout", "session", "spo2Daily"],
    metrics: ["sleep", "daily sleep", "heart rate", "workouts", "sessions", "SpO2"],
  },
  {
    provider: "whoop",
    label: "WHOOP",
    mode: "cloud_token",
    authorize_url: null,
    token_url: null,
    scopes: ["recovery", "sleep", "cycle"],
    metrics: ["recovery", "sleep", "resting HR", "HRV"],
  },
  {
    provider: "apple_health",
    label: "Apple Health",
    mode: "device_import",
    authorize_url: null,
    token_url: null,
    scopes: ["device export"],
    metrics: ["steps", "heart rate", "sleep", "workouts"],
  },
  {
    provider: "google_health_connect",
    label: "Google Health Connect",
    mode: "device_import",
    authorize_url: null,
    token_url: null,
    scopes: ["device export"],
    metrics: ["steps", "heart rate", "sleep", "workouts"],
  },
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      await ensureUser(env.DB);
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (method === "GET" && path === "/health") return json({ status: "ok", version: "0.3.0-worker" }, cors);
      if (method === "GET" && path === "/health/dependencies") return json(await dependencies(env), cors);
      if (method === "GET" && path === "/api/v1/medical-knowledge/model-card") return json(modelCard(), cors);
      if (method === "POST" && path === "/api/v1/dev/seed") return json(await seedDemo(env.DB), cors);
      if (method === "GET" && path === "/api/v1/users/me") return json(await readUser(env.DB), cors);
      if (method === "PATCH" && path === "/api/v1/users/me") return json(await updateUser(env.DB, (await request.json()) as JsonRecord), cors);
      if (method === "POST" && path === "/api/v1/users/me/calculate-score") return json(await calculateScore(env.DB), cors);
      if (method === "GET" && path === "/api/v1/users/me/bio-age") return jsonOr404(await latestScore(env.DB), "No score yet", cors);
      if (method === "GET" && path === "/api/v1/users/me/wearable-metrics") return json(await listMetrics(env.DB, url), cors);
      if (method === "POST" && path === "/api/v1/users/me/wearable-metrics") return json(await createMetric(env.DB, (await request.json()) as JsonRecord), cors);
      if (method === "POST" && path === "/api/v1/users/me/biomarkers") return json(await createBiomarker(env.DB, (await request.json()) as JsonRecord), cors);
      if (method === "GET" && path === "/api/v1/users/me/biomarkers") return json(await listBiomarkers(env.DB, url), cors);
      if (method === "GET" && path === "/api/v1/users/me/environment") return json(await environmentSummary(env.DB), cors);
      if (method === "GET" && path === "/api/v1/integrations") return json(await integrations(env.DB), cors);
      if (method === "POST" && path === "/api/v1/integrations/import") return json(await importRecords(env.DB, (await request.json()) as JsonRecord), cors);
      if (method === "GET" && path === "/api/v1/protocols") return json(await listProtocols(env.DB), cors);
      if (method === "POST" && path === "/api/v1/protocols") return json(await createProtocol(env.DB, (await request.json()) as JsonRecord), cors);
      if (method === "GET" && path === "/api/v1/genetics") return json(await listGenetics(env.DB), cors);
      if (method === "POST" && path === "/api/v1/genetics") return json(await saveGenetics(env.DB, (await request.json()) as JsonRecord), cors);
      if (method === "POST" && path === "/api/v1/simulator/run") return json(simulator((await request.json()) as JsonRecord), cors);

      const integrationMatch = path.match(/^\/api\/v1\/integrations\/([^/]+)\/([^/]+)$/);
      if (integrationMatch) {
        const [, provider, action] = integrationMatch;
        if (method === "POST" && action === "configure") return json(await configureIntegration(env.DB, provider, (await request.json()) as JsonRecord), cors);
        if (method === "GET" && action === "authorize-url") return json(await authorizeUrl(env.DB, provider, url, env), cors);
        if (method === "POST" && action === "oauth-callback") return json(await oauthCallback(env.DB, provider, (await request.json()) as JsonRecord, env), cors);
        if (method === "POST" && action === "sample-import") return json(await sampleImport(env.DB, provider), cors);
        if (method === "POST" && action === "sync") return json({ provider, imported: 0, status: "cloudflare_worker_stub" }, cors);
        if (method === "POST" && action === "refresh") return json({ provider, status: "refresh_requires_provider_secret" }, cors);
      }

      const protocolMatch = path.match(/^\/api\/v1\/protocols\/([^/]+)(?:\/(compliance))?$/);
      if (protocolMatch) {
        const [, protocolId, child] = protocolMatch;
        if (!child && method === "GET") return jsonOr404(await getProtocol(env.DB, protocolId), "Protocol not found", cors);
        if (child === "compliance" && method === "GET") return json(await listCompliance(env.DB, protocolId), cors);
        if (child === "compliance" && method === "PATCH") return json(await logCompliance(env.DB, protocolId, (await request.json()) as JsonRecord), cors);
      }

      return json({ detail: "Not found" }, cors, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return json({ detail: message }, cors, 500);
    }
  },
};

function corsHeaders(origin: string, env: Env): HeadersInit {
  const allowed = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "https://longevityplatform.app",
    "https://www.longevityplatform.app",
    ...String(env.CORS_ALLOW_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
  ]);
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://longevityplatform.app",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
  };
}

function json(body: unknown, headers: HeadersInit, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function jsonOr404(body: unknown, detail: string, headers: HeadersInit): Response {
  return body ? json(body, headers) : json({ detail }, headers, 404);
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function id(): string {
  return crypto.randomUUID();
}

async function ensureUser(db: D1Database): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO users (id, email, subscription_tier, onboarding_completed, home_timezone, created_at, updated_at) VALUES (?, ?, 'free', 0, ?, ?, ?)"
    )
    .bind(USER_ID, USER_EMAIL, "America/Winnipeg", now(), now())
    .run();
}

async function readUser(db: D1Database): Promise<JsonRecord> {
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(USER_ID).first<JsonRecord>();
  return { ...user, onboarding_completed: Boolean(user?.onboarding_completed) };
}

async function updateUser(db: D1Database, body: JsonRecord): Promise<JsonRecord> {
  const allowed = ["birth_year", "biological_sex", "onboarding_completed", "home_timezone", "aqi_zip"];
  const entries = Object.entries(body).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (entries.length) {
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([key, value]) => (key === "onboarding_completed" ? Number(Boolean(value)) : value));
    await db.prepare(`UPDATE users SET ${assignments}, updated_at = ? WHERE id = ?`).bind(...values, now(), USER_ID).run();
  }
  return readUser(db);
}

async function dependencies(env: Env): Promise<JsonRecord> {
  const rows = await env.DB.prepare("SELECT provider, status FROM integration_connections WHERE user_id = ?").bind(USER_ID).all<JsonRecord>();
  const active = Object.fromEntries((rows.results || []).map((row) => [String(row.provider), ["configured", "synced"].includes(String(row.status))]));
  return {
    status: "ok",
    api: { status: "ok" },
    database: { status: "ok", message: "Cloudflare D1" },
    redis: { status: "ok", message: "No Redis required on Workers" },
    integrations: {
      clerk: false,
      terra: false,
      stripe: false,
      anthropic: false,
      s3: false,
      oura: Boolean(active.oura || env.OURA_CLIENT_ID),
      whoop: Boolean(active.whoop),
      apple_health: Boolean(active.apple_health),
      google_health_connect: Boolean(active.google_health_connect),
    },
    mode: "cloudflare-workers",
  };
}

function sourcePayload(keys: Array<keyof typeof SOURCES>): JsonRecord[] {
  return keys.map((key) => SOURCES[key]);
}

function modelCard(): JsonRecord {
  return {
    status: "prototype",
    model_version: "worker-prototype-0.1",
    safety_notice: SAFETY_NOTICE,
    limitations: [
      "This is not a validated biological-age model.",
      "Outputs are educational wellness summaries, not medical advice.",
      "Clinical decisions require a licensed clinician.",
    ],
    sources: sourcePayload(["cdc_glucose", "cdc_a1c", "medline_crp", "airnow_aqi"]),
  };
}

function normalizeMarkerName(marker: unknown): string {
  const name = String(marker || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["a1c", "hba1c", "hemoglobina1c"].includes(name)) return "hba1c";
  if (["crp", "creactiveprotein"].includes(name)) return "crp";
  if (["glucose", "fastingglucose"].includes(name)) return "glucose";
  return name || "unknown";
}

function interpretBiomarker(marker: string, value: number, unit?: unknown): JsonRecord {
  if (marker === "glucose") {
    const interpretation =
      value >= 126 ? "at or above diabetes screening threshold" : value >= 100 ? "above common fasting screening range" : "within common fasting screening range";
    return { marker, interpretation, caution: "Diagnosis requires repeat testing and clinician review.", sources: sourcePayload(["cdc_glucose"]) };
  }
  if (marker === "hba1c") {
    const interpretation =
      value >= 6.5 ? "at or above CDC diabetes screening threshold" : value >= 5.7 ? "within CDC prediabetes screening range" : "below CDC prediabetes screening threshold";
    return { marker, interpretation, caution: "A1C can be affected by anemia, pregnancy, kidney disease, and other factors.", sources: sourcePayload(["cdc_a1c"]) };
  }
  if (marker === "crp") {
    const interpretation = value >= 10 ? "markedly elevated inflammatory marker" : value >= 2 ? "elevated inflammatory marker" : "lower inflammatory marker range";
    return { marker, interpretation, caution: "CRP is nonspecific and should be interpreted with symptoms and clinician review.", sources: sourcePayload(["medline_crp"]) };
  }
  return { marker, interpretation: `stored ${value} ${unit || ""}`.trim(), caution: SAFETY_NOTICE, sources: [] };
}

function classifyAqi(value: number): [string, string] {
  if (value <= 50) return ["Good", "low"];
  if (value <= 100) return ["Moderate", "moderate"];
  if (value <= 150) return ["Unhealthy for sensitive groups", "sensitive"];
  if (value <= 200) return ["Unhealthy", "high"];
  if (value <= 300) return ["Very unhealthy", "very_high"];
  return ["Hazardous", "hazardous"];
}

async function listMetrics(db: D1Database, url: URL): Promise<JsonRecord[]> {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const rows = await db
    .prepare("SELECT id, source, metric_type, value, unit, recorded_at FROM wearable_metrics WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?")
    .bind(USER_ID, limit)
    .all<JsonRecord>();
  return rows.results || [];
}

async function createMetric(db: D1Database, body: JsonRecord): Promise<JsonRecord> {
  const recordedAt = String(body.recorded_at || now());
  const source = String(body.source || "manual");
  const metricType = String(body.metric_type || "");
  const value = Number(body.value);
  const metadata: JsonRecord = { entry: "manual" };
  if (source === "environment" && metricType === "aqi") {
    const [category, risk_level] = classifyAqi(value);
    metadata.category = category;
    metadata.risk_level = risk_level;
  }
  const result = await db
    .prepare("INSERT INTO wearable_metrics (user_id, source, metric_type, value, unit, recorded_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(USER_ID, source, metricType, value, body.unit || null, recordedAt, JSON.stringify(metadata))
    .run();
  const row = await db.prepare("SELECT id, source, metric_type, value, unit, recorded_at FROM wearable_metrics WHERE id = ?").bind(result.meta.last_row_id).first<JsonRecord>();
  return row || {};
}

async function createBiomarker(db: D1Database, body: JsonRecord): Promise<JsonRecord> {
  const marker = normalizeMarkerName(body.marker_name);
  const rowId = id();
  const value = Number(body.value);
  await db
    .prepare("INSERT INTO biomarker_records (id, user_id, marker_name, marker_name_normalized, value, unit, drawn_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(rowId, USER_ID, String(body.marker_name || marker), marker, value, body.unit || null, body.drawn_at || today(), now())
    .run();
  return { id: rowId, interpretation: interpretBiomarker(marker, value, body.unit) };
}

async function listBiomarkers(db: D1Database, url: URL): Promise<JsonRecord[]> {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const rows = await db
    .prepare("SELECT id, marker_name, marker_name_normalized, value, unit, drawn_at FROM biomarker_records WHERE user_id = ? ORDER BY drawn_at DESC, created_at DESC LIMIT ?")
    .bind(USER_ID, limit)
    .all<JsonRecord>();
  return (rows.results || []).map((row) => ({
    ...row,
    interpretation: interpretBiomarker(String(row.marker_name_normalized), Number(row.value), row.unit),
  }));
}

async function environmentSummary(db: D1Database): Promise<JsonRecord> {
  const aqi = await db
    .prepare("SELECT value, recorded_at FROM wearable_metrics WHERE user_id = ? AND metric_type = 'aqi' ORDER BY recorded_at DESC LIMIT 1")
    .bind(USER_ID)
    .first<JsonRecord>();
  const crp = await db
    .prepare("SELECT value FROM biomarker_records WHERE user_id = ? AND marker_name_normalized = 'crp' ORDER BY drawn_at DESC LIMIT 1")
    .bind(USER_ID)
    .first<JsonRecord>();
  const recent = await db
    .prepare("SELECT recorded_at, value FROM wearable_metrics WHERE user_id = ? AND metric_type = 'aqi' ORDER BY recorded_at DESC LIMIT 14")
    .bind(USER_ID)
    .all<JsonRecord>();
  const [category] = classifyAqi(Number(aqi?.value || 0));
  return {
    latest_aqi: aqi ? Number(aqi.value) : null,
    latest_aqi_at: aqi?.recorded_at || null,
    aqi_category: aqi ? category : null,
    latest_crp: crp ? Number(crp.value) : null,
    context: aqi ? `Latest AQI is ${aqi.value} (${category}).` : "Add AQI to see environmental context.",
    safety_notice: SAFETY_NOTICE,
    sources: sourcePayload(["airnow_aqi", "medline_crp"]),
    recent_aqi: recent.results || [],
  };
}

async function calculateScore(db: D1Database): Promise<JsonRecord> {
  const user = await readUser(db);
  const birthYear = Number(user.birth_year || 1988);
  const chrono = Math.max(18, new Date().getFullYear() - birthYear);
  const biomarkerRows = await db.prepare("SELECT marker_name_normalized, value FROM biomarker_records WHERE user_id = ?").bind(USER_ID).all<JsonRecord>();
  const metricRows = await db.prepare("SELECT metric_type, value FROM wearable_metrics WHERE user_id = ?").bind(USER_ID).all<JsonRecord>();
  const markers = Object.fromEntries((biomarkerRows.results || []).map((row) => [String(row.marker_name_normalized), Number(row.value)]));
  const metrics = Object.fromEntries((metricRows.results || []).map((row) => [String(row.metric_type), Number(row.value)]));
  const glucose = interpretBiomarker("glucose", Number(markers.glucose || 90));
  const a1c = interpretBiomarker("hba1c", Number(markers.hba1c || 5.2));
  let metabolic = 82;
  if (String(glucose.interpretation).includes("above") || String(a1c.interpretation).includes("prediabetes")) metabolic = 68;
  if (String(glucose.interpretation).includes("diabetes") || String(a1c.interpretation).includes("diabetes")) metabolic = 58;
  const pillars = {
    metabolic,
    inflammation: Number(markers.crp || 1) >= 2 ? 76 : 86,
    sleep: Math.min(95, Math.max(45, Number(metrics.sleep_efficiency || 78))),
    cardiovascular: Number(metrics.resting_hr || 62) < 70 ? 80 : 65,
    stress_resilience: Number(metrics.hrv_rmssd || 45) >= 40 ? 82 : 62,
    environment: Number(metrics.aqi || 60) < 100 ? 82 : 60,
  };
  const avg = Object.values(pillars).reduce((sum, item) => sum + item, 0) / Object.values(pillars).length;
  const ageDelta = Math.round(((75 - avg) / 5) * 10) / 10;
  const score = {
    biological_age: Math.round((chrono + ageDelta) * 10) / 10,
    chronological_age: chrono,
    age_delta: ageDelta,
    pillar_scores: pillars,
    data_completeness: Math.min(1, Math.round(((Object.keys(markers).length + Object.keys(metrics).length) / 8) * 100) / 100),
    model_version: "worker-prototype-0.1",
    safety_notice: SAFETY_NOTICE,
    interpretation_notes: [
      "This is an exploratory wellness index, not a diagnosis or validated biological-age test.",
      "Pillar scores are heuristic and should be used for product testing only.",
      "Clinical interpretation requires symptoms, medication history, lab reference intervals, and clinician review.",
    ],
    sources: sourcePayload(["cdc_glucose", "cdc_a1c", "medline_crp", "airnow_aqi"]),
  };
  await db
    .prepare("INSERT INTO bio_age_scores (id, user_id, biological_age, chronological_age, age_delta, pillar_scores, data_completeness, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id(), USER_ID, score.biological_age, score.chronological_age, score.age_delta, JSON.stringify(pillars), score.data_completeness, now())
    .run();
  return score;
}

async function latestScore(db: D1Database): Promise<JsonRecord | null> {
  const row = await db.prepare("SELECT * FROM bio_age_scores WHERE user_id = ? ORDER BY calculated_at DESC LIMIT 1").bind(USER_ID).first<JsonRecord>();
  if (!row) return null;
  const trend = await db.prepare("SELECT biological_age, calculated_at FROM bio_age_scores WHERE user_id = ? ORDER BY calculated_at ASC").bind(USER_ID).all<JsonRecord>();
  return {
    biological_age: row.biological_age,
    chronological_age: row.chronological_age,
    age_delta: row.age_delta,
    pillar_scores: JSON.parse(String(row.pillar_scores || "{}")),
    data_completeness: row.data_completeness,
    calculated_at: row.calculated_at,
    trend_data: trend.results || [],
    model_version: "worker-prototype-0.1",
    safety_notice: SAFETY_NOTICE,
    interpretation_notes: ["This is an exploratory wellness index, not a diagnosis or validated biological-age test."],
    sources: sourcePayload(["cdc_glucose", "cdc_a1c", "medline_crp", "airnow_aqi"]),
  };
}

async function seedDemo(db: D1Database): Promise<JsonRecord> {
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM wearable_metrics WHERE user_id = ?").bind(USER_ID).first<{ count: number }>();
  if (existing?.count) return { status: "seeded" };
  for (const aqi of [42, 55, 68, 88, 104, 77, 61]) {
    await createMetric(db, { source: "environment", metric_type: "aqi", value: aqi, unit: "index", recorded_at: now() });
  }
  for (const metric of [
    ["hrv_rmssd", 48, "ms"],
    ["resting_hr", 62, "bpm"],
    ["sleep_efficiency", 84, "%"],
    ["vo2max", 43, "ml/kg/min"],
  ]) {
    await createMetric(db, { source: "manual", metric_type: metric[0], value: metric[1], unit: metric[2], recorded_at: now() });
  }
  for (const marker of [
    ["glucose", 88, "mg/dL"],
    ["crp", 0.9, "mg/L"],
    ["hba1c", 5.1, "%"],
  ]) {
    await createBiomarker(db, { marker_name: marker[0], value: marker[1], unit: marker[2] });
  }
  return { status: "seeded" };
}

async function integrations(db: D1Database): Promise<JsonRecord[]> {
  const rows = await db.prepare("SELECT provider, config, status, last_sync_at, last_error FROM integration_connections WHERE user_id = ?").bind(USER_ID).all<JsonRecord>();
  const connected = Object.fromEntries((rows.results || []).map((row) => [String(row.provider), row]));
  return CATALOG.map((item) => {
    const row = connected[item.provider] as JsonRecord | undefined;
    return {
      ...item,
      connected: Boolean(row),
      status: row?.status || "not_configured",
      last_sync_at: row?.last_sync_at || null,
      last_error: row?.last_error || null,
      config: maskConfig(row?.config ? JSON.parse(String(row.config)) : {}),
    };
  });
}

function maskConfig(config: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, key.includes("secret") || key.includes("token") ? "configured" : value]));
}

async function configureIntegration(db: D1Database, provider: string, body: JsonRecord): Promise<JsonRecord> {
  if (!CATALOG.some((item) => item.provider === provider)) throw new Error("Unknown integration provider");
  const clean = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== "" && value !== null && value !== undefined));
  await db
    .prepare("INSERT INTO integration_connections (id, user_id, provider, config, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'configured', ?, ?) ON CONFLICT(user_id, provider) DO UPDATE SET config = excluded.config, status = 'configured', last_error = NULL, updated_at = excluded.updated_at")
    .bind(id(), USER_ID, provider, JSON.stringify(clean), now(), now())
    .run();
  return { provider, status: "configured", config: maskConfig(clean) };
}

async function authorizeUrl(db: D1Database, provider: string, url: URL, env: Env): Promise<JsonRecord> {
  if (provider !== "oura") throw new Error("OAuth authorize URL is currently implemented for Oura");
  const row = await db.prepare("SELECT config FROM integration_connections WHERE user_id = ? AND provider = ?").bind(USER_ID, provider).first<JsonRecord>();
  const config = row?.config ? JSON.parse(String(row.config)) : {};
  const clientId = String(config.client_id || env.OURA_CLIENT_ID || "");
  if (!clientId) throw new Error("Missing Oura client_id");
  const redirectUri = String(config.redirect_uri || env.OURA_REDIRECT_URI || "https://longevityplatform.app/integrations?provider=oura");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "daily heartrate workout session spo2Daily",
    state: url.searchParams.get("state") || "cloudflare-worker",
  });
  return { provider, authorize_url: `https://cloud.ouraring.com/oauth/authorize?${params.toString()}` };
}

async function oauthCallback(db: D1Database, provider: string, body: JsonRecord, env: Env): Promise<JsonRecord> {
  if (provider !== "oura") throw new Error("OAuth callback exchange is currently implemented for Oura");
  const row = await db.prepare("SELECT config FROM integration_connections WHERE user_id = ? AND provider = ?").bind(USER_ID, provider).first<JsonRecord>();
  const config = row?.config ? JSON.parse(String(row.config)) : {};
  const clientId = String(config.client_id || env.OURA_CLIENT_ID || "");
  const clientSecret = String(config.client_secret || env.OURA_CLIENT_SECRET || "");
  const redirectUri = String(config.redirect_uri || env.OURA_REDIRECT_URI || "https://longevityplatform.app/integrations?provider=oura");
  if (!clientId || !clientSecret) throw new Error("Missing Oura client ID or secret");
  const response = await fetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(body.code || ""),
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) throw new Error(`Oura token exchange failed with HTTP ${response.status}`);
  const tokenPayload = (await response.json()) as JsonRecord;
  const updated = { ...config, ...tokenPayload, token_obtained_at: now() };
  await configureIntegration(db, provider, updated);
  return { provider, status: "configured", config: maskConfig(updated) };
}

function normalizeRecords(provider: string, records: JsonRecord[]): JsonRecord[] {
  return records.map((record) => ({
    source: provider,
    metric_type: String(record.metric_type || record.type || "unknown"),
    value: Number(record.value),
    unit: record.unit || null,
    recorded_at: String(record.recorded_at || record.timestamp || now()),
    metadata: record,
  }));
}

async function insertNormalizedMetrics(db: D1Database, records: JsonRecord[]): Promise<number> {
  for (const record of records) {
    await db
      .prepare("INSERT INTO wearable_metrics (user_id, source, metric_type, value, unit, recorded_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(USER_ID, record.source, record.metric_type, record.value, record.unit || null, record.recorded_at, JSON.stringify(record.metadata || {}))
      .run();
  }
  return records.length;
}

async function importRecords(db: D1Database, body: JsonRecord): Promise<JsonRecord> {
  const provider = String(body.provider || "");
  if (!CATALOG.some((item) => item.provider === provider)) throw new Error("Unknown integration provider");
  const records = normalizeRecords(provider, Array.isArray(body.records) ? (body.records as JsonRecord[]) : []);
  const imported = await insertNormalizedMetrics(db, records);
  await configureIntegration(db, provider, {});
  await db.prepare("UPDATE integration_connections SET status = 'synced', last_sync_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?").bind(now(), now(), USER_ID, provider).run();
  return { provider, imported, status: "synced" };
}

async function sampleImport(db: D1Database, provider: string): Promise<JsonRecord> {
  const imported = await insertNormalizedMetrics(
    db,
    normalizeRecords(provider, [
      { metric_type: "sleep_efficiency", value: 84, unit: "%", recorded_at: now() },
      { metric_type: "resting_hr", value: 61, unit: "bpm", recorded_at: now() },
      { metric_type: "hrv_rmssd", value: 48, unit: "ms", recorded_at: now() },
    ])
  );
  return { provider, imported, status: "sample_imported" };
}

async function listProtocols(db: D1Database): Promise<JsonRecord[]> {
  const rows = await db.prepare("SELECT * FROM protocols WHERE user_id = ? ORDER BY created_at DESC").bind(USER_ID).all<JsonRecord>();
  return (rows.results || []).map((row) => ({ ...row, is_active: Boolean(row.is_active), is_public: Boolean(row.is_public) }));
}

async function createProtocol(db: D1Database, body: JsonRecord): Promise<JsonRecord> {
  const protocolId = id();
  await db
    .prepare("INSERT INTO protocols (id, user_id, name, description, start_date, end_date, is_active, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)")
    .bind(protocolId, USER_ID, body.name, body.description || null, body.start_date || today(), body.end_date || null, now())
    .run();
  return { id: protocolId };
}

async function getProtocol(db: D1Database, protocolId: string): Promise<JsonRecord | null> {
  const row = await db.prepare("SELECT * FROM protocols WHERE id = ? AND user_id = ?").bind(protocolId, USER_ID).first<JsonRecord>();
  return row ? { ...row, is_active: Boolean(row.is_active), is_public: Boolean(row.is_public) } : null;
}

async function listCompliance(db: D1Database, protocolId: string): Promise<JsonRecord[]> {
  const rows = await db.prepare("SELECT * FROM protocol_compliance WHERE protocol_id = ? ORDER BY compliance_date ASC").bind(protocolId).all<JsonRecord>();
  return (rows.results || []).map((row) => ({ ...row, adhered: Boolean(row.adhered) }));
}

async function logCompliance(db: D1Database, protocolId: string, body: JsonRecord): Promise<JsonRecord> {
  await db
    .prepare("INSERT INTO protocol_compliance (id, protocol_id, compliance_date, adhered, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(protocol_id, compliance_date) DO UPDATE SET adhered = excluded.adhered, notes = excluded.notes, logged_at = excluded.logged_at")
    .bind(id(), protocolId, body.compliance_date || today(), Number(Boolean(body.adhered)), body.notes || null, now())
    .run();
  return { status: "logged" };
}

async function listGenetics(db: D1Database): Promise<JsonRecord[]> {
  const rows = await db.prepare("SELECT * FROM genetic_insights WHERE user_id = ? ORDER BY created_at DESC").bind(USER_ID).all<JsonRecord>();
  return rows.results || [];
}

async function saveGenetics(db: D1Database, body: JsonRecord): Promise<JsonRecord[]> {
  const insights = Array.isArray(body.insights) ? (body.insights as JsonRecord[]) : [];
  for (const insight of insights) {
    await db
      .prepare("INSERT INTO genetic_insights (id, user_id, snp, label, interpreted_result, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, snp) DO UPDATE SET label = excluded.label, interpreted_result = excluded.interpreted_result, created_at = excluded.created_at")
      .bind(id(), USER_ID, insight.snp, insight.label, insight.interpreted_result, now())
      .run();
  }
  return listGenetics(db);
}

function simulator(body: JsonRecord): JsonRecord {
  const scenario = String(body.scenario || "Improve sleep consistency");
  return {
    scenario_title: scenario,
    projected_bio_age_change_years: -0.4,
    uncertainty_low: -0.9,
    uncertainty_high: 0.1,
    timeframe_months: 6,
    confidence: "moderate",
    mechanism: "This scenario may improve one or more wellness pillars, but the estimate is heuristic.",
    key_evidence: "Source-backed wellness evidence is used only as educational context.",
    caveats: "This is not medical advice and does not diagnose, treat, prevent, or predict disease.",
    top_supporting_intervention: scenario,
    sources: sourcePayload(["cdc_glucose", "airnow_aqi"]),
  };
}
