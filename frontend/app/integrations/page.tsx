"use client";

import { FormEvent, useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, DatabaseZap, ExternalLink, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { apiFetch, formatDate } from "@/lib/api";
import { SafetyNotice, SourceList } from "@/components/SafetyNotice";

type Source = { label: string; url: string; note?: string };
type Integration = {
  provider: string;
  name: string;
  mode: "cloud_oauth" | "device_import";
  status_label: string;
  metrics: string[];
  scopes: string[];
  docs: Source[];
  setup: string[];
  authorize_url?: string;
  token_url?: string;
  redirect_uri?: string;
  connected: boolean;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
};

const exampleJson = JSON.stringify(
  [
    { metric_type: "sleep_efficiency", value: 84, unit: "%", recorded_at: new Date().toISOString() },
    { metric_type: "resting_hr", value: 61, unit: "bpm", recorded_at: new Date().toISOString() }
  ],
  null,
  2
);

export default function IntegrationsPage() {
  const integrations = useSWR("/api/v1/integrations", (path) => apiFetch<Integration[]>(path));
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [oauth, setOauth] = useState<Record<string, { client_id: string; client_secret: string; redirect_uri: string }>>({});
  const [imports, setImports] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const oauthDefaults = (provider: string, redirectUri?: string) => ({
    client_id: oauth[provider]?.client_id || "",
    client_secret: oauth[provider]?.client_secret || "",
    redirect_uri: oauth[provider]?.redirect_uri || redirectUri || "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const code = params.get("code");
    const error = params.get("error");
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashToken = hash.get("access_token");
    if (error) {
      setMessage(`Authorization failed: ${error}`);
      window.history.replaceState({}, "", "/integrations");
      return;
    }
    if (provider === "oura" && code) {
      setBusy("oura-callback");
      apiFetch("/api/v1/integrations/oura/oauth-callback", {
        method: "POST",
        body: JSON.stringify({ code, state: params.get("state") }),
      })
        .then(() => {
          setMessage("Oura authorization saved. You can sync now.");
          integrations.mutate();
          window.history.replaceState({}, "", "/integrations");
        })
        .catch((err) => setMessage(err instanceof Error ? err.message : String(err)))
        .finally(() => setBusy(null));
      return;
    }
    if (provider === "oura" && hashToken) {
      setBusy("oura-token");
      apiFetch("/api/v1/integrations/oura/configure", {
        method: "POST",
        body: JSON.stringify({ access_token: hashToken }),
      })
        .then(() => {
          setMessage("Oura client-side token saved. Server-side OAuth is preferred because it supports refresh tokens.");
          integrations.mutate();
          window.history.replaceState({}, "", "/integrations");
        })
        .catch((err) => setMessage(err instanceof Error ? err.message : String(err)))
        .finally(() => setBusy(null));
    }
  }, [integrations]);

  async function configure(provider: string, e: FormEvent) {
    e.preventDefault();
    setBusy(`${provider}-configure`);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/integrations/${provider}/configure`, {
        method: "POST",
        body: JSON.stringify({
          access_token: tokens[provider] || "",
          client_id: oauth[provider]?.client_id || "",
          client_secret: oauth[provider]?.client_secret || "",
          redirect_uri: oauth[provider]?.redirect_uri || "",
        }),
      });
      setTokens((prev) => ({ ...prev, [provider]: "" }));
      setMessage("Connection saved locally.");
      integrations.mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function authorize(provider: string) {
    setBusy(`${provider}-authorize`);
    setMessage(null);
    try {
      const res = await apiFetch<{ authorize_url: string }>(`/api/v1/integrations/${provider}/authorize-url?state=local-dev`);
      window.location.href = res.authorize_url;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function sync(provider: string) {
    setBusy(`${provider}-sync`);
    setMessage(null);
    try {
      const res = await apiFetch<{ imported: number }>(`/api/v1/integrations/${provider}/sync`, { method: "POST" });
      setMessage(`Synced ${res.imported} records.`);
      integrations.mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function refresh(provider: string) {
    setBusy(`${provider}-refresh`);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/integrations/${provider}/refresh`, { method: "POST" });
      setMessage("Token refreshed. Oura refresh tokens are single-use, so the new refresh token was saved.");
      integrations.mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function sample(provider: string) {
    setBusy(`${provider}-sample`);
    setMessage(null);
    try {
      const res = await apiFetch<{ imported: number }>(`/api/v1/integrations/${provider}/sample-import`, { method: "POST" });
      setMessage(`Imported ${res.imported} sample records. Check My data.`);
      integrations.mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function importRecords(provider: string, e: FormEvent) {
    e.preventDefault();
    setBusy(`${provider}-import`);
    setMessage(null);
    try {
      const records = JSON.parse(imports[provider] || "[]");
      const res = await apiFetch<{ imported: number }>("/api/v1/integrations/import", {
        method: "POST",
        body: JSON.stringify({ provider, records }),
      });
      setMessage(`Imported ${res.imported} records. Check My data.`);
      integrations.mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-zinc-500">Connect real wearable and health data, then normalize it into local metrics.</p>
      </div>

      <SafetyNotice>
        Imported health data is user-provided wellness data. Source devices can be noisy, incomplete, or delayed; clinical decisions still require a licensed clinician.
      </SafetyNotice>

      {message && <div className="rounded-md border border-cyan-900/60 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-100">{message}</div>}

      <section className="grid gap-4 lg:grid-cols-2">
        {integrations.data?.map((item) => (
          <article key={item.provider} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{item.name}</h2>
                <div className="mt-1 text-xs uppercase text-zinc-500">{item.mode === "cloud_oauth" ? "Cloud connector" : "Device import"}</div>
              </div>
              <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${item.connected ? "border-emerald-900 bg-emerald-950/30 text-emerald-200" : "border-zinc-700 bg-zinc-950 text-zinc-400"}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {item.connected ? item.status.replace(/_/g, " ") : item.status_label}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {item.metrics.map((metric) => (
                <span key={metric} className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300">{metric.replace(/_/g, " ")}</span>
              ))}
            </div>

            <div className="mt-4 space-y-1 text-sm text-zinc-400">
              {item.setup.map((step) => (
                <div key={step}>• {step}</div>
              ))}
            </div>

            {item.scopes.length > 0 && (
              <div className="mt-4 text-xs text-zinc-500">
                Requested scopes: <span className="text-zinc-300">{item.scopes.join(", ")}</span>
                {item.provider === "oura" && <div className="mt-1">Server-side OAuth uses response_type=code and supports refresh tokens.</div>}
              </div>
            )}

            {item.mode === "cloud_oauth" && (
              <form onSubmit={(e) => configure(item.provider, e)} className="mt-4 space-y-2">
                {item.authorize_url && (
                  <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-400">
                    <div>Authorize: <span className="text-zinc-200">{item.authorize_url}</span></div>
                    <div className="mt-1">Access token URL: <span className="text-zinc-200">{item.token_url}</span></div>
                    <div className="mt-1">Redirect URI: <span className="text-zinc-200">{oauth[item.provider]?.redirect_uri || item.redirect_uri}</span></div>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={oauth[item.provider]?.client_id || ""}
                    onChange={(e) => setOauth((prev) => ({ ...prev, [item.provider]: { ...oauthDefaults(item.provider, item.redirect_uri), client_id: e.target.value } }))}
                    placeholder={`${item.name} client ID`}
                    className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <input
                    value={oauth[item.provider]?.client_secret || ""}
                    onChange={(e) => setOauth((prev) => ({ ...prev, [item.provider]: { ...oauthDefaults(item.provider, item.redirect_uri), client_secret: e.target.value } }))}
                    placeholder={`${item.name} client secret`}
                    className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </div>
                <input
                  value={oauth[item.provider]?.redirect_uri || item.redirect_uri || ""}
                  onChange={(e) => setOauth((prev) => ({ ...prev, [item.provider]: { ...oauthDefaults(item.provider, item.redirect_uri), redirect_uri: e.target.value } }))}
                  placeholder="Redirect URI"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                />
                <input
                  value={tokens[item.provider] || ""}
                  onChange={(e) => setTokens((prev) => ({ ...prev, [item.provider]: e.target.value }))}
                  placeholder={`${item.name} access token, optional if using OAuth code`}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button className="inline-flex items-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50" disabled={busy === `${item.provider}-configure`}>
                    <ShieldCheck className="h-4 w-4" />
                    Save settings
                  </button>
                  {item.authorize_url && (
                    <button type="button" onClick={() => authorize(item.provider)} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" disabled={busy === `${item.provider}-authorize`}>
                      <ExternalLink className="h-4 w-4" />
                      Open Oura authorization
                    </button>
                  )}
                  <button type="button" onClick={() => sync(item.provider)} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" disabled={busy === `${item.provider}-sync`}>
                    <RefreshCw className="h-4 w-4" />
                    Sync
                  </button>
                  {item.provider === "oura" && (
                    <button type="button" onClick={() => refresh(item.provider)} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" disabled={busy === `${item.provider}-refresh`}>
                      <RefreshCw className="h-4 w-4" />
                      Refresh token
                    </button>
                  )}
                </div>
              </form>
            )}

            <form onSubmit={(e) => importRecords(item.provider, e)} className="mt-4 space-y-2">
              <textarea
                value={imports[item.provider] || ""}
                onChange={(e) => setImports((prev) => ({ ...prev, [item.provider]: e.target.value }))}
                placeholder={exampleJson}
                className="h-28 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
              />
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" disabled={busy === `${item.provider}-import`}>
                  <Upload className="h-4 w-4" />
                  Import JSON
                </button>
                <button type="button" onClick={() => sample(item.provider)} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" disabled={busy === `${item.provider}-sample`}>
                  <DatabaseZap className="h-4 w-4" />
                  Sample import
                </button>
              </div>
            </form>

            <div className="mt-4 text-xs text-zinc-500">Last sync: {formatDate(item.last_sync_at)}</div>
            {item.last_error && <div className="mt-2 rounded-md border border-red-900 bg-red-950/30 p-2 text-xs text-red-200">{item.last_error}</div>}
            <div className="mt-4">
              <SourceList sources={item.docs} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
