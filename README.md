# Longevity Platform

Standalone local longevity and wellness dashboard with a FastAPI backend and Next.js frontend.

## Features

- Local SQLite backend with no required external services
- Dashboard with exploratory wellness-age index
- Biomarker storage and source-backed interpretation notes
- Wearable and environmental data entry
- Protocol tracking and reports
- Genetics raw-file parsing workflow
- What-if simulator
- Integrations hub for Oura, WHOOP, Apple Health, and Google Health Connect
- Public website, privacy policy, and terms pages for API registration

## Local Development

Run both backend and frontend:

```bash
./run-local.sh
```

Frontend:

```text
http://localhost:3001
```

Backend:

```text
http://127.0.0.1:8000
```

## Checks

Backend:

```bash
cd backend
python3 -m pytest
```

Frontend:

```bash
cd frontend
npm run build
```

## Production Domain

Planned production URLs:

- Website: `https://longevityplatform.app`
- API: `https://api.longevityplatform.app`
- Privacy: `https://longevityplatform.app/privacy`
- Terms: `https://longevityplatform.app/terms`
- Oura redirect: `https://longevityplatform.app/integrations?provider=oura`

See `DEPLOYMENT.md` for deployment and API registration details.

## Medical Safety

This app is for educational wellness tracking only. It does not diagnose, treat, prevent, or predict disease. Clinical interpretation requires licensed clinician review.
