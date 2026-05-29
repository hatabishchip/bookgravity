import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Support — Gravity Stretching",
  description: "Help and contact info for Gravity Stretching clients and trainers.",
}

// Public support URL — filed in App Store Connect under "Support URL".
// Apple links it directly from the app's product page so it must answer
// the basics: how to book, how to cancel, how to sign in to the app.
export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#F5F4F0]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link href="/" className="text-[#2C6E49] font-bold text-lg">
            Gravity Stretching
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← Back to booking
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-[#1E4D34] mb-2">Support</h1>
        <p className="text-gray-600 mb-8">
          Need a hand? Most things can be sorted in a few taps — but if you
          get stuck, we&apos;re here.
        </p>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#1E4D34] mb-3">
            Contact us
          </h2>
          <ul className="space-y-2 text-gray-700">
            <li>
              Email:{" "}
              <a className="text-[#2C6E49] font-medium" href="mailto:hello@bookgravity.com">
                hello@bookgravity.com
              </a>
            </li>
            <li>
              WhatsApp Canggu:{" "}
              <a className="text-[#2C6E49] font-medium" href="https://wa.me/6281234567890">
                +62 812 3456 7890
              </a>
            </li>
            <li>
              Studio location: Canggu &amp; Ubud, Bali, Indonesia
            </li>
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#1E4D34] mb-3">FAQ</h2>

          <h3 className="font-semibold mt-4">How do I book a class?</h3>
          <p className="text-gray-700">
            Open the Gravity Stretching app or go to bookgravity.com, pick a
            date, choose a time, and tap <em>Confirm</em>. You&apos;ll
            receive a confirmation by email and WhatsApp.
          </p>

          <h3 className="font-semibold mt-4">How do I cancel?</h3>
          <p className="text-gray-700">
            Reply to the confirmation WhatsApp message, or email us at least
            2 hours before the class. The app currently does not support
            self-service cancellation — we&apos;re working on it.
          </p>

          <h3 className="font-semibold mt-4">I didn&apos;t get my ticket — what now?</h3>
          <p className="text-gray-700">
            Check the Tickets tab in the app, or your spam folder. If you
            still don&apos;t see it, email us.
          </p>

          <h3 className="font-semibold mt-4">I&apos;m a trainer. How do I sign in?</h3>
          <p className="text-gray-700">
            Use the email and password your studio admin set up for you.
            Forgot it? Tap &quot;Reset password&quot; on the login screen,
            or ask your admin to reset it from /admin.
          </p>

          <h3 className="font-semibold mt-4">How do push notifications work?</h3>
          <p className="text-gray-700">
            The app asks for notification permission the first time you sign
            in. Trainers receive a push whenever a new booking lands in
            their class. You can turn this off any time in iOS / Android
            Settings → Gravity Stretching → Notifications.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-[#1E4D34] mb-3">Legal</h2>
          <p>
            <Link href="/privacy" className="text-[#2C6E49] font-medium">
              Privacy Policy
            </Link>
          </p>
        </section>
      </article>
    </main>
  )
}
