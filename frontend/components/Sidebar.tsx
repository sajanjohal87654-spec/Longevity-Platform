import Link from "next/link";
import { Activity, BarChart3, CalendarCheck, Database, Dna, FlaskConical, Gauge, Link2 } from "lucide-react";

const nav = [
  ["Dashboard", "/dashboard", Gauge],
  ["Onboarding", "/onboarding", Activity],
  ["My data", "/my-data", Database],
  ["Integrations", "/integrations", Link2],
  ["Protocols", "/protocols", CalendarCheck],
  ["Simulator", "/simulator", BarChart3],
  ["Genetics", "/genetics", Dna],
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-zinc-800 bg-zinc-950 p-4 md:block">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <FlaskConical className="h-5 w-5 text-cyan-300" />
        Longevity
      </div>
      <nav className="space-y-1">
        {nav.map(([label, href, Icon]) => (
          <Link key={href as string} href={href as string} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900">
            <Icon className="h-4 w-4" />
            {label as string}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
