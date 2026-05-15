"use client";

import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SafetyNotice, SourceList } from "@/components/SafetyNotice";

type Result = {
  scenario_title: string;
  projected_bio_age_change_years: number;
  uncertainty_low: number;
  uncertainty_high: number;
  timeframe_months: number;
  confidence: string;
  mechanism: string;
  key_evidence: string;
  caveats: string;
  top_supporting_intervention: string;
  sources?: Array<{ label: string; url: string; note?: string }>;
};

const presets = ["Improve sleep consistency", "Zone 2 cardio 3x/week", "Reduce alcohol", "Protein at breakfast", "Meditation 10 minutes", "Earlier light exposure"];

export default function SimulatorPage() {
  const [scenario, setScenario] = useState(presets[0]);
  const [result, setResult] = useState<Result | null>(null);
  async function run(e?: FormEvent) {
    e?.preventDefault();
    setResult(await apiFetch<Result>("/api/v1/simulator/run", { method: "POST", body: JSON.stringify({ scenario }) }));
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">What-if simulator</h1>
      <SafetyNotice>Scenario outputs are rough product prototypes, not patient-specific clinical predictions.</SafetyNotice>
      <div className="flex flex-wrap gap-2">{presets.map((p) => <button key={p} onClick={() => setScenario(p)} className="rounded-md border border-zinc-700 px-3 py-2 text-sm">{p}</button>)}</div>
      <form onSubmit={run} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <textarea value={scenario} onChange={(e) => setScenario(e.target.value)} className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <button className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Run simulation</button>
      </form>
      {result && <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"><div className="text-sm text-zinc-500">{result.confidence} confidence · {result.timeframe_months} months</div><div className="mt-2 text-3xl font-semibold">{result.projected_bio_age_change_years.toFixed(1)} years estimated index change</div><p className="mt-3 text-zinc-300">{result.mechanism}</p><p className="mt-2 text-sm text-zinc-500">{result.caveats}</p><div className="mt-4"><SourceList sources={result.sources} /></div></section>}
    </div>
  );
}
