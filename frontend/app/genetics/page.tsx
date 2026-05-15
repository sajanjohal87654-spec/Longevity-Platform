"use client";

import { ChangeEvent, useState } from "react";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { SafetyNotice } from "@/components/SafetyNotice";

type Insight = { id?: string; snp: string; label: string; interpreted_result: string };

const labels: Record<string, string> = {
  rs429358: "APOE marker 1",
  rs7412: "APOE marker 2",
  rs1801133: "MTHFR C677T",
  rs1815739: "ACTN3 R577X",
  rs9939609: "FTO",
};

function genotype(raw: string) {
  return raw.replace(/[^ACGTDI]/gi, "").toUpperCase();
}

function parse(text: string): Insight[] {
  const found: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (labels[parts[0]] && parts[3]) found[parts[0]] = genotype(parts[3]);
  }
  const out: Insight[] = [];
  if (found.rs429358 && found.rs7412) out.push({ snp: "apoe", label: "APOE genotype", interpreted_result: `APOE markers: rs429358 ${found.rs429358}, rs7412 ${found.rs7412}` });
  for (const [snp, label] of Object.entries(labels)) if (found[snp]) out.push({ snp, label, interpreted_result: `${label}: ${found[snp]}` });
  return out;
}

export default function GeneticsPage() {
  const saved = useSWR("/api/v1/genetics", (path) => apiFetch<Insight[]>(path));
  const [preview, setPreview] = useState<Insight[]>([]);
  const [message, setMessage] = useState("");
  async function file(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const rows = parse(await f.text());
    setPreview(rows);
    setMessage(rows.length ? "Parsed locally. Raw file was not uploaded." : "No supported SNPs found.");
  }
  async function save() {
    await apiFetch("/api/v1/genetics", { method: "POST", body: JSON.stringify({ insights: preview }) });
    setPreview([]);
    saved.mutate();
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Genetics</h1>
      <SafetyNotice>Genetic parsing is informational. APOE and other variants should not be used for medical decisions without genetic counseling or clinician review.</SafetyNotice>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <input type="file" accept=".txt,.csv" onChange={file} className="text-sm" />
        <p className="mt-2 text-sm text-zinc-500">23andMe/Ancestry raw files are parsed in-browser; only interpreted SNP strings are saved.</p>
      </section>
      {message && <div className="text-sm text-zinc-400">{message}</div>}
      {preview.length > 0 && <Grid rows={preview} action={<button onClick={save} className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Save interpreted results</button>} />}
      <Grid rows={saved.data || []} />
    </div>
  );
}

function Grid({ rows, action }: { rows: Insight[]; action?: React.ReactNode }) {
  return <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"><div className="mb-3">{action}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((r) => <div key={`${r.snp}-${r.interpreted_result}`} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3"><div className="text-xs text-zinc-500">{r.snp}</div><div className="font-medium">{r.label}</div><div className="text-sm text-zinc-300">{r.interpreted_result}</div></div>)}</div></section>;
}
