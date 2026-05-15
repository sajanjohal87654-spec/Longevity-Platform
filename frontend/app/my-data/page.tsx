"use client";

import { FormEvent, useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch, formatDate } from "@/lib/api";
import { SafetyNotice, SourceList } from "@/components/SafetyNotice";

type Metric = { id: number; source: string; metric_type: string; value: number; unit: string | null; recorded_at: string };
type Source = { label: string; url: string; note?: string };
type BiomarkerInterpretation = { marker: string; interpretation: string; caution: string; sources: Source[] };
type Biomarker = {
  id: string;
  marker_name: string;
  marker_name_normalized: string;
  value: number;
  unit: string | null;
  drawn_at: string;
  interpretation: BiomarkerInterpretation;
};
type Environment = {
  latest_aqi: number | null;
  latest_aqi_at: string | null;
  aqi_category: string | null;
  latest_crp: number | null;
  context: string;
  safety_notice?: string;
  sources?: Source[];
  recent_aqi: { recorded_at: string; value: number }[];
};

export default function MyDataPage() {
  const metrics = useSWR("/api/v1/users/me/wearable-metrics?limit=20", (path) => apiFetch<Metric[]>(path));
  const biomarkers = useSWR("/api/v1/users/me/biomarkers?limit=12", (path) => apiFetch<Biomarker[]>(path));
  const env = useSWR("/api/v1/users/me/environment", (path) => apiFetch<Environment>(path));
  const [metric, setMetric] = useState({ metric_type: "hrv_rmssd", value: "", unit: "ms" });
  const [aqi, setAqi] = useState("");
  const [bio, setBio] = useState({ marker_name: "CRP", value: "", unit: "mg/L" });

  async function addMetric(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/api/v1/users/me/wearable-metrics", { method: "POST", body: JSON.stringify({ ...metric, value: Number(metric.value), source: "manual" }) });
    setMetric((prev) => ({ ...prev, value: "" }));
    metrics.mutate();
  }

  async function addAqi(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/api/v1/users/me/wearable-metrics", { method: "POST", body: JSON.stringify({ metric_type: "aqi", value: Number(aqi), unit: "index", source: "environment" }) });
    setAqi("");
    env.mutate();
    metrics.mutate();
  }

  async function addBiomarker(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/api/v1/users/me/biomarkers", { method: "POST", body: JSON.stringify({ ...bio, value: Number(bio.value) }) });
    setBio((prev) => ({ ...prev, value: "" }));
    biomarkers.mutate();
    env.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My data</h1>
        <p className="text-sm text-zinc-500">Everything here stores locally in SQLite.</p>
      </div>
      <SafetyNotice />

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={addMetric} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">Wearable metric</h2>
          <select value={metric.metric_type} onChange={(e) => setMetric({ ...metric, metric_type: e.target.value })} className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
            <option value="hrv_rmssd">HRV RMSSD</option>
            <option value="resting_hr">Resting HR</option>
            <option value="sleep_efficiency">Sleep efficiency</option>
            <option value="vo2max">VO2 max</option>
          </select>
          <input required type="number" step="any" value={metric.value} onChange={(e) => setMetric({ ...metric, value: e.target.value })} placeholder="Value" className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <input value={metric.unit} onChange={(e) => setMetric({ ...metric, unit: e.target.value })} placeholder="Unit" className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <button className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Add metric</button>
        </form>

        <form onSubmit={addBiomarker} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">Biomarker</h2>
          <input value={bio.marker_name} onChange={(e) => setBio({ ...bio, marker_name: e.target.value })} className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <input required type="number" step="any" value={bio.value} onChange={(e) => setBio({ ...bio, value: e.target.value })} placeholder="Value" className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <input value={bio.unit} onChange={(e) => setBio({ ...bio, unit: e.target.value })} className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <button className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Add biomarker</button>
        </form>

        <form onSubmit={addAqi} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">Environment</h2>
          <input required type="number" min="0" max="500" value={aqi} onChange={(e) => setAqi(e.target.value)} placeholder="AQI" className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          <button className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Add AQI</button>
        </form>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">Environmental context</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">Latest AQI <div className="text-2xl font-semibold">{env.data?.latest_aqi ?? "-"}</div><div className="text-xs text-zinc-500">{env.data?.aqi_category}</div></div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">Latest CRP <div className="text-2xl font-semibold">{env.data?.latest_crp ?? "-"}</div></div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">{env.data?.context}</div>
        </div>
        <div className="mt-3">
          <SourceList sources={env.data?.sources} />
        </div>
        {(env.data?.recent_aqi?.length || 0) > 0 && (
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={env.data!.recent_aqi.map((p) => ({ date: p.recorded_at.slice(5, 10), aqi: p.value }))}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a" }} />
                <Bar dataKey="aqi" fill="#67e8f9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">Biomarker interpretations</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {biomarkers.data?.map((b) => (
            <div key={b.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="text-xs uppercase text-zinc-500">{b.marker_name_normalized.replace(/_/g, " ")}</div>
              <div className="mt-1 text-2xl font-semibold">
                {b.value} <span className="text-sm text-zinc-500">{b.unit}</span>
              </div>
              <div className="mt-2 text-sm text-zinc-200">{b.interpretation.interpretation}</div>
              <div className="mt-2 text-xs leading-5 text-zinc-500">{b.interpretation.caution}</div>
              <div className="mt-2 text-xs text-zinc-600">Drawn {formatDate(b.drawn_at)}</div>
              <div className="mt-3">
                <SourceList sources={b.interpretation.sources} />
              </div>
            </div>
          ))}
          {!biomarkers.data?.length && (
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-500">
              Add glucose, A1C, or CRP to see source-backed interpretation notes.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.data?.map((m) => (
          <div key={m.id} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="text-sm font-medium">{m.metric_type.replace(/_/g, " ")}</div>
            <div className="text-xl font-semibold">{m.value} <span className="text-sm text-zinc-500">{m.unit}</span></div>
            <div className="text-xs text-zinc-500">{m.source} · {formatDate(m.recorded_at)}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
