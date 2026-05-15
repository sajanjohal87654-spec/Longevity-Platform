import Link from "next/link";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective date: May 14, 2026</p>

      <div className="mt-6 space-y-5 text-sm leading-6 text-zinc-300">
        <section>
          <h2 className="font-medium text-zinc-100">Overview</h2>
          <p className="mt-2">
            Longevity Platform Local is a personal wellness dashboard for tracking wearable, biomarker, environmental, protocol, and genetics-related information. The app is intended for educational wellness use only and does not provide medical diagnosis, treatment, or clinical decision-making.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Information processed</h2>
          <p className="mt-2">
            If you connect Oura, the app may request user-approved scopes such as daily summaries, heart rate, workouts, sessions, and daily SpO2. The app may also store manually entered metrics, biomarkers, protocol adherence, and imported health records.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">How information is used</h2>
          <p className="mt-2">
            Imported and entered data is used to display personal wellness trends, calculate exploratory local wellness scores, and support user-facing dashboards. It is not used for advertising, resale, or clinical diagnosis.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Storage and sharing</h2>
          <p className="mt-2">
            In the local development version, data is stored on the user's machine in SQLite. The app does not sell personal data. Third-party data access only occurs when the user explicitly configures an integration and authorizes access.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">User control</h2>
          <p className="mt-2">
            Users can choose which integrations to configure, can revoke access through the provider such as Oura, and can delete local development data by removing the local database file.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Contact</h2>
          <p className="mt-2">
            For privacy questions, contact the app owner at the contact email listed in the provider developer application.
          </p>
        </section>
      </div>

      <Link href="/" className="mt-6 inline-block rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">Back to website</Link>
    </article>
  );
}
