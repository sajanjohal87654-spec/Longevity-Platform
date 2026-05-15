import Link from "next/link";

export default function TermsPage() {
  return (
    <article className="max-w-3xl rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective date: May 14, 2026</p>

      <div className="mt-6 space-y-5 text-sm leading-6 text-zinc-300">
        <section>
          <h2 className="font-medium text-zinc-100">Use of the app</h2>
          <p className="mt-2">
            Longevity Platform Local is provided for personal wellness tracking and product development. By using the app, you agree to use it only for lawful, personal, and non-clinical purposes.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">No medical advice</h2>
          <p className="mt-2">
            The app does not diagnose, treat, prevent, or predict disease. Wellness scores, biomarker notes, wearable trends, and reports are educational estimates only. Review symptoms, abnormal labs, medications, and health decisions with a licensed clinician.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Third-party integrations</h2>
          <p className="mt-2">
            Integrations such as Oura require user authorization and are subject to the third-party provider's own terms, privacy policy, API limits, and availability. Users are responsible for granting and revoking third-party access.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Data accuracy</h2>
          <p className="mt-2">
            Wearable and imported health data can be delayed, incomplete, inaccurate, or affected by device placement, firmware, user behavior, and provider processing. The app should not be used as the sole basis for medical or safety decisions.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Availability</h2>
          <p className="mt-2">
            This local development app may change, break, or be unavailable during active development. Features may be modified or removed without notice.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-zinc-100">Contact</h2>
          <p className="mt-2">
            For terms questions, contact the app owner at the contact email listed in the provider developer application.
          </p>
        </section>
      </div>

      <Link href="/" className="mt-6 inline-block rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">Back to website</Link>
    </article>
  );
}
