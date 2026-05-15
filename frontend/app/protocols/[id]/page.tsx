"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";

type Protocol = { id: string; name: string; description: string | null; is_active: boolean; is_public: boolean };
type Compliance = { id: string; compliance_date: string; adhered: boolean };

function days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

export default function ProtocolDetail({ params }: { params: { id: string } }) {
  const protocol = useSWR(`/api/v1/protocols/${params.id}`, (path) => apiFetch<Protocol>(path));
  const compliance = useSWR(`/api/v1/protocols/${params.id}/compliance`, (path) => apiFetch<Compliance[]>(path));
  const map = new Map((compliance.data || []).map((r) => [r.compliance_date, r]));

  async function log(day: string, adhered: boolean) {
    await apiFetch(`/api/v1/protocols/${params.id}/compliance`, { method: "PATCH", body: JSON.stringify({ compliance_date: day, adhered }) });
    compliance.mutate();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{protocol.data?.name || "Protocol"}</h1>
        <p className="text-sm text-zinc-500">{protocol.data?.description || "Track daily adherence."}</p>
      </div>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase text-zinc-400">30-day calendar</h2>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {days().map((day) => {
            const row = map.get(day);
            return (
              <div key={day} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
                <div className="mb-2 text-xs text-zinc-500">{day.slice(5)}</div>
                <div className="flex gap-1">
                  <button onClick={() => log(day, true)} className={`h-7 w-7 rounded-md ${row?.adhered ? "bg-emerald-400 text-zinc-950" : "bg-zinc-900"}`}>✓</button>
                  <button onClick={() => log(day, false)} className={`h-7 w-7 rounded-md ${row && !row.adhered ? "bg-red-400 text-zinc-950" : "bg-zinc-900"}`}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
