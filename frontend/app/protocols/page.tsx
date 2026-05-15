"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetch, formatDate } from "@/lib/api";

type Protocol = { id: string; name: string; description: string | null; start_date: string; is_active: boolean; is_public: boolean };

export default function ProtocolsPage() {
  const protocols = useSWR("/api/v1/protocols", (path) => apiFetch<Protocol[]>(path));
  const [form, setForm] = useState({ name: "", description: "", start_date: new Date().toISOString().slice(0, 10) });

  async function create(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/api/v1/protocols", { method: "POST", body: JSON.stringify(form) });
    setForm({ ...form, name: "", description: "" });
    protocols.mutate();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={create} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h1 className="mb-3 text-xl font-semibold">New protocol</h1>
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <button className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Create</button>
      </form>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h1 className="mb-3 text-xl font-semibold">Protocols</h1>
        <div className="space-y-2">
          {protocols.data?.map((p) => (
            <div key={p.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div><div className="font-medium">{p.name}</div><div className="text-xs text-zinc-500">Started {formatDate(p.start_date)}</div></div>
                <Link href={`/protocols/${p.id}`} className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200">Open</Link>
              </div>
            </div>
          ))}
          {protocols.data?.length === 0 && <div className="text-sm text-zinc-500">No protocols yet.</div>}
        </div>
      </section>
    </div>
  );
}
