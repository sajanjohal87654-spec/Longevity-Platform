import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { ApiStatus } from "@/components/ApiStatus";

export const metadata: Metadata = {
  title: "Longevity Platform",
  description: "Standalone local longevity platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <main className="min-h-screen px-4 py-6 md:ml-60 md:px-8">
          <div className="mx-auto max-w-6xl space-y-5">
            <ApiStatus />
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
