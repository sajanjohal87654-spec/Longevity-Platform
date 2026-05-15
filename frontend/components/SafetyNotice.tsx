export function SafetyNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-900/60 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
      {children || "Educational wellness information only. This app does not diagnose, treat, or predict disease. Review medical decisions and abnormal findings with a licensed clinician."}
    </div>
  );
}

export function SourceList({ sources }: { sources?: Array<{ label: string; url: string; note?: string }> }) {
  if (!sources?.length) return null;
  return (
    <div className="space-y-1 text-xs text-zinc-500">
      <div className="uppercase tracking-wide text-zinc-600">Reference sources</div>
      {sources.map((source) => (
        <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block text-cyan-300 hover:text-cyan-200">
          {source.label}
        </a>
      ))}
    </div>
  );
}
