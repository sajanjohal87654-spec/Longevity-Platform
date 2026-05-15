import Link from "next/link";
import { Activity, Database, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-wrap items-center gap-3 text-cyan-200">
          <Activity className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-normal">Longevity Platform Local</span>
        </div>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold">Personal wellness dashboard for local health-data tracking.</h1>
        <p className="mt-3 max-w-3xl text-zinc-400">
          Longevity Platform imports wearable and health metrics, including Oura data when authorized by the user, into a local dashboard for non-diagnostic wellness tracking.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard" className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Open app</Link>
          <Link href="/integrations" className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">Integrations</Link>
          <Link href="/privacy" className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">Privacy</Link>
          <Link href="/terms" className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">Terms</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard icon={<Database className="h-5 w-5" />} title="Local data first">
          Data is stored in the local SQLite database unless you explicitly configure a third-party integration.
        </InfoCard>
        <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="User authorized">
          Oura access uses OAuth, requested scopes, and user consent before data can be imported.
        </InfoCard>
        <InfoCard icon={<Activity className="h-5 w-5" />} title="Not medical advice">
          The app provides educational wellness summaries and does not diagnose, treat, or predict disease.
        </InfoCard>
      </section>
    </div>
  );
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-cyan-200">{icon}</div>
      <h2 className="mt-3 font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{children}</p>
    </div>
  );
}
