"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";

type Health = {
  status: string;
  database: { status: string; message?: string };
  redis: { status: string; message?: string };
  integrations: Record<string, boolean>;
  mode?: string;
};

export function ApiStatus() {
  const { data, error } = useSWR("/health/dependencies", (path) => apiFetch<Health>(path), { refreshInterval: 15000 });
  if (error) return <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">Backend offline at http://localhost:8000.</div>;
  if (!data) return null;
  const optionalOff = Object.entries(data.integrations).filter(([, enabled]) => !enabled).map(([name]) => name);
  return (
    <div className="space-y-1 text-xs text-zinc-400">
      <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-emerald-200">
        API ok · {data.database.message || "Database ok"} · {data.redis.message || "Cache ok"}
      </div>
      {optionalOff.length > 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          Local mode: optional integrations mocked/off ({optionalOff.join(", ")})
        </div>
      )}
    </div>
  );
}
