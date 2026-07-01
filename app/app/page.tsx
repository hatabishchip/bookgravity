import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Gravity Stretching - the app",
  description:
    "What the Gravity Stretching booking app does, who uses it, and why it asks for Google Calendar access.",
}

// Public application homepage, filed with Google OAuth verification
// (project bookgravity, project number 958353466738) as the "Application
// home page" that explains the purpose of the app and each requested
// scope. Kept plain and text-first on purpose so a Google reviewer can
// read it top-to-bottom.
export default function AppOverviewPage() {
  return (
    <main className="min-h-screen bg-sand">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link href="/" className="text-brand font-bold text-lg">
            Gravity Stretching
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            Back to booking
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-brand-dark mb-2">
          Gravity Stretching - the app
        </h1>
        <p className="text-gray-600 mb-8">
          The booking platform behind Gravity Stretching studios.
        </p>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-semibold text-brand-dark mb-3">
            What the app does
          </h2>
          <p className="text-gray-700 mb-3">
            Gravity Stretching is the official booking software used by our
            physical Gravity Stretching studios in Canggu and Ubud, Bali
            (operated by PT Gravity Stretching Canggu). It has three surfaces
            that all talk to the same backend at{" "}
            <strong>bookgravity.com</strong>:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Client web + mobile app</strong> - a visitor picks a
              studio, sees the live class schedule, books a stretching class in
              a few taps, and gets a QR ticket to show at the door.
            </li>
            <li>
              <strong>Trainer mobile app</strong> - a trainer sees today&apos;s
              class roster, taps a client to call them, and scans QR tickets at
              check-in.
            </li>
            <li>
              <strong>Studio admin panel</strong> - the studio owner and
              managers edit the class schedule, manage bookings and staff, and
              (optionally) connect their Google Calendar so scheduled classes
              also appear there.
            </li>
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-semibold text-brand-dark mb-3">
            Why the app requests Google Calendar access
          </h2>
          <p className="text-gray-700 mb-3">
            A studio admin can optionally connect their Google Calendar from
            the admin panel so every class scheduled inside the app is
            mirrored to their calendar. This is convenience-only: the source
            of truth stays in Gravity Stretching, and the calendar link can
            be revoked at any time from the admin&apos;s Google account.
          </p>
          <p className="text-gray-700 mb-3">
            The app requests only two OAuth scopes, both with a strict,
            narrow purpose:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <code className="text-sm bg-gray-100 px-1 py-0.5 rounded">
                https://www.googleapis.com/auth/calendar.events
              </code>
              &nbsp;- used solely to create, update, and delete the studio&apos;s
              own class events in the connecting admin&apos;s Google Calendar.
              This is a one-way sync from Gravity Stretching to that
              calendar. We do not read or modify any events that were not
              created by the app.
            </li>
            <li>
              <code className="text-sm bg-gray-100 px-1 py-0.5 rounded">
                email
              </code>
              &nbsp;- used only to display which Google account is currently
              connected in the admin Settings screen.
            </li>
          </ul>
          <p className="text-gray-700 mt-3">
            Data received via these scopes is used exclusively for the
            calendar-sync feature described above. It is not sold, shared
            with third parties for advertising, or used to train AI or ML
            models. Full details are in our{" "}
            <Link href="/privacy" className="text-brand font-medium">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-semibold text-brand-dark mb-3">
            Who runs it
          </h2>
          <p className="text-gray-700">
            The Service is operated by <strong>PT Gravity Stretching Canggu</strong>,
            an Indonesian limited liability company (Perseroan Terbatas)
            with foreign capital status (PMA). Registered office: Jalan Raya
            Padonan Gang Pilot, Tibubeneng, Kuta Utara, Badung, Bali 80365,
            Indonesia. NIB: 2304260281773.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-brand-dark mb-3">
            Links
          </h2>
          <ul className="space-y-2 text-gray-700">
            <li>
              Booking home:{" "}
              <Link href="/" className="text-brand font-medium">
                bookgravity.com
              </Link>
            </li>
            <li>
              Privacy Policy:{" "}
              <Link href="/privacy" className="text-brand font-medium">
                bookgravity.com/privacy
              </Link>
            </li>
            <li>
              Support:{" "}
              <Link href="/support" className="text-brand font-medium">
                bookgravity.com/support
              </Link>
            </li>
            <li>
              Contact:{" "}
              <a
                className="text-brand font-medium"
                href="mailto:admin@bookgravity.com"
              >
                admin@bookgravity.com
              </a>
            </li>
          </ul>
        </section>

        <footer className="mt-10 text-center text-xs text-gray-400">
          &copy; 2026 PT Gravity Stretching Canggu.
        </footer>
      </article>
    </main>
  )
}
