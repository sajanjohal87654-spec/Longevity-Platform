# Deployment and API Registration

Production domain:

- Website: `https://longevityplatform.app`
- Privacy Policy: `https://longevityplatform.app/privacy`
- Terms of Service: `https://longevityplatform.app/terms`
- Oura Redirect URI: `https://longevityplatform.app/integrations?provider=oura`
- Suggested API URL: `https://api.longevityplatform.app`

## Recommended Hosting Setup

Use Vercel for the Next.js frontend. For the backend, the current preferred
free-path target is Cloudflare Workers with Cloudflare D1.

Frontend:

- Project root: `frontend`
- Framework: Next.js
- Build command: `npm run build`
- Production environment variable:
  - `NEXT_PUBLIC_API_URL=https://api.longevityplatform.app`

Backend option A - Cloudflare Workers:

- Project root: `worker`
- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- Deploy command: `npm run deploy`
- Production API URL: `https://api.longevityplatform.app`
- Secrets:
  - `OURA_CLIENT_ID=<from Oura>`
  - `OURA_CLIENT_SECRET=<from Oura>`

Cloudflare setup:

1. `cd worker`
2. `npm install`
3. `npx wrangler login`
4. `npx wrangler d1 create longevity-platform-db`
5. Copy the returned D1 `database_id` into `worker/wrangler.jsonc`.
6. `npm run db:migrate`
7. `npx wrangler secret put OURA_CLIENT_ID`
8. `npx wrangler secret put OURA_CLIENT_SECRET`
9. `npm run deploy`
10. Add `api.longevityplatform.app` as the Worker's custom domain.

Backend option B - FastAPI host:

- Project root: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `python3 -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Production environment variables:
  - `APP_PUBLIC_URL=https://longevityplatform.app`
  - `CORS_ALLOW_ORIGINS=https://longevityplatform.app,https://www.longevityplatform.app`
  - `OURA_REDIRECT_URI=https://longevityplatform.app/integrations?provider=oura`
  - `SQLITE_DB_PATH=/var/data/local.db`
  - `OURA_CLIENT_ID=<from Oura>`
  - `OURA_CLIENT_SECRET=<from Oura>`

The repository includes `render.yaml` for Render. It creates the FastAPI web service,
sets the public URL/CORS/Oura redirect values, and mounts a persistent disk at
`/var/data` so SQLite data is not stored in the temporary app filesystem.

## Domain DNS

Point `longevityplatform.app` and `www.longevityplatform.app` at the frontend host.

Point `api.longevityplatform.app` at the backend host.

The exact DNS records depend on the host. Most hosts show either:

- A `CNAME` target for subdomains, or
- An `A` record IP address, plus a `CNAME` for `www`.

## Oura App Registration Values

Display Name:

`Longevity Platform`

Description:

`A personal longevity and wellness dashboard that imports Oura sleep, readiness, heart rate, activity, workout, session, and SpO2 data into a user-authorized dashboard for non-diagnostic wellness tracking.`

Website:

`https://longevityplatform.app`

Privacy Policy:

`https://longevityplatform.app/privacy`

Terms of Service:

`https://longevityplatform.app/terms`

Redirect URI:

`https://longevityplatform.app/integrations?provider=oura`

Requested scopes:

`daily heartrate workout session spo2Daily`

## Adding More APIs Later

For every new provider, use the same checklist:

1. Add the provider's public docs/source link to `backend/app/integrations.py`.
2. Add the provider to `CATALOG` with mode, scopes, setup steps, and metrics.
3. Add configure/auth/sync endpoints in `backend/app/main.py`.
4. Normalize provider data into local wearable metrics using `normalize_records`.
5. Add regression tests in `backend/tests/test_local_api.py`.
6. Add or update the card in `frontend/app/integrations/page.tsx`.
7. Add production env vars to the backend or frontend host.
8. Redeploy frontend and backend.

## Updating the Live App

After code changes:

1. Run backend tests:

   `cd backend && python3 -m pytest`

2. Run frontend build:

   `cd frontend && npm run build`

3. Commit/push the changes to the Git repo connected to your host.

4. The frontend host and backend host redeploy from that push.

5. If you changed env vars or API dashboard settings, update the hosting dashboard and redeploy.
