"use client";

import { FormEvent, useState } from "react";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";

type User = {
  birth_year: number | null;
  biological_sex: string | null;
  home_timezone: string | null;
  aqi_zip: string | null;
};

export default function OnboardingPage() {
  const user = useSWR("/api/v1/users/me", (path) => apiFetch<User>(path));
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ birth_year: "", biological_sex: "male", home_timezone: "America/Winnipeg", aqi_zip: "" });

  async function save(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/api/v1/users/me", { method: "PATCH", body: JSON.stringify({ ...form, birth_year: Number(form.birth_year) }) });
    user.mutate();
    setStep(2);
  }

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Onboarding</h1>
      <div className="grid grid-cols-4 gap-2">
        {["Profile", "Wearable", "Bloodwork", "Reveal"].map((label, i) => (
          <button key={label} onClick={() => setStep(i + 1)} className={`rounded-md border px-3 py-2 text-sm ${step === i + 1 ? "border-cyan-400 text-cyan-200" : "border-zinc-800 text-zinc-400"}`}>{i + 1}. {label}</button>
        ))}
      </div>
      {step === 1 && (
        <form onSubmit={save} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input required type="number" placeholder="Birth year" value={form.birth_year} onChange={(e) => setForm({ ...form, birth_year: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            <select value={form.biological_sex} onChange={(e) => setForm({ ...form, biological_sex: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="male">Male</option><option value="female">Female</option></select>
            <input value={form.home_timezone} onChange={(e) => setForm({ ...form, home_timezone: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            <input placeholder="AQI ZIP" value={form.aqi_zip} onChange={(e) => setForm({ ...form, aqi_zip: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
          </div>
          <button className="mt-3 rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Continue</button>
        </form>
      )}
      {step === 2 && <Panel title="Wearable">Local mode uses manual wearable entries in My data. Terra can be added later without blocking local use.</Panel>}
      {step === 3 && <Panel title="Bloodwork">Add CRP, glucose, HbA1c and other markers manually in My data.</Panel>}
      {step === 4 && <Panel title="Reveal">Go to Dashboard and calculate your first local score.</Panel>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"><h2 className="font-medium">{title}</h2><p className="mt-2 text-sm text-zinc-400">{children}</p></section>;
}
