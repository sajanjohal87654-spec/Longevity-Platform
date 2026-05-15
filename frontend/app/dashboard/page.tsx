"use client";

import { useState } from "react";
import useSWR from "swr";
import { Calculator } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";
import { SafetyNotice, SourceList } from "@/components/SafetyNotice";

type Score = {
  biological_age: number;
  chronological_age: number;
  age_delta: number;
  data_completeness: number;
  pillar_scores: Record<string, number>;
  safety_notice?: string;
  interpretation_notes?: string[];
  sources?: Array<{ label: string; url: string; note?: string }>;
};

export default function DashboardPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = useSWR("/api/v1/users/me/bio-age", (path) => apiFetch<Score>(path).catch((err) => {
    if (String(err.message).includes("No score yet")) return null;
    throw err;
  }), { fallbackData: null });

  async function calculate() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<Score>("/api/v1/users/me/calculate-score", { method: "POST" });
      await score.mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!score.data) {
    return (
      <section className="max-w-xl rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-zinc-400">No biological age score yet. Seed demo data or add your own data, then calculate a baseline.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={calculate} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50">
            <Calculator className="h-4 w-4" />
            {busy ? "Calculating..." : "Calculate score"}
          </button>
          <button
            onClick={async () => { await apiFetch("/api/v1/dev/seed", { method: "POST" }); await calculate(); }}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            Seed demo data
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
      </section>
    );
  }

  const pillars = Object.entries(score.data.pillar_scores).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-500">Exploratory local wellness estimate</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-5 py-3">
          <div className="text-xs uppercase text-zinc-500">Estimated wellness age index</div>
          <div className="text-4xl font-semibold">{score.data.biological_age.toFixed(1)}</div>
          <div className="text-sm text-zinc-400">Chrono {score.data.chronological_age.toFixed(1)} · Δ {score.data.age_delta.toFixed(1)} y</div>
        </div>
        <button onClick={calculate} disabled={busy} className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">
          {busy ? "Calculating..." : "Recalculate"}
        </button>
      </div>

      <SafetyNotice>{score.data.safety_notice}</SafetyNotice>
      {score.data.interpretation_notes && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">
          {score.data.interpretation_notes.map((note) => (
            <div key={note}>• {note}</div>
          ))}
        </div>
      )}

      <section className="h-80 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">Pillar scores</h2>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={pillars}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
            <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a" }} />
            <Bar dataKey="value" fill="#67e8f9" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <SourceList sources={score.data.sources} />
    </div>
  );
}
