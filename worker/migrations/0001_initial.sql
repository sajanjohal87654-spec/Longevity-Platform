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
  calculated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wearable_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  recorded_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS biomarker_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  marker_name TEXT NOT NULL,
  marker_name_normalized TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  drawn_at TEXT NOT NULL,
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protocol_compliance (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  compliance_date TEXT NOT NULL,
  adhered INTEGER NOT NULL,
  notes TEXT,
  logged_at TEXT NOT NULL,
  UNIQUE(protocol_id, compliance_date)
);

CREATE TABLE IF NOT EXISTS genetic_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  snp TEXT NOT NULL,
  label TEXT NOT NULL,
  interpreted_result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, snp)
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
  UNIQUE(user_id, provider)
);
