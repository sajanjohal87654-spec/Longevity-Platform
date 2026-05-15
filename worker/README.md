# Longevity Platform Cloudflare Worker API

This is the Cloudflare Workers version of the backend. It uses:

- Cloudflare Workers for the API runtime
- Cloudflare D1 for SQL storage
- Wrangler for local development, database migrations, and deploys

## One-Time Setup

Install dependencies:

```bash
cd worker
npm install
```

Log in to Cloudflare:

```bash
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create longevity-platform-db
```

Copy the returned `database_id` into `worker/wrangler.jsonc`, replacing:

```text
REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID
```

Apply the database migration:

```bash
npm run db:migrate
```

Set Oura secrets when you have them:

```bash
npx wrangler secret put OURA_CLIENT_ID
npx wrangler secret put OURA_CLIENT_SECRET
```

Deploy:

```bash
npm run deploy
```

## Custom Domain

In Cloudflare, attach this Worker to:

```text
api.longevityplatform.app
```

Then update Vercel's frontend environment variable:

```text
NEXT_PUBLIC_API_URL=https://api.longevityplatform.app
```

Redeploy the frontend after changing that value.
