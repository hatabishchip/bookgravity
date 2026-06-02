import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy — Gravity Stretching",
  description: "How Gravity Stretching collects and uses your personal data.",
}

// Plain HTML privacy policy hosted at https://bookgravity.com/privacy.
// The URL is filed in App Store Connect for both the iOS app and the web
// app. Keeping it on the same root domain (not behind a studio subdomain)
// so super-admin onboarding doesn't have to repeat it.
export default function PrivacyPage() {
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

      <article className="max-w-3xl mx-auto px-4 py-10 prose prose-neutral">
        <h1 className="text-3xl font-bold text-[#1E4D34] mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 29 May 2026</p>

        <p>
          This Privacy Policy describes how Gravity Stretching (&quot;we&quot;,
          &quot;us&quot;, &quot;our&quot;) collects, uses, and protects your
          personal information when you use our website at bookgravity.com
          (and its subdomains) and our mobile applications &quot;Gravity
          Stretching&quot; for iOS and Android (together, the
          &quot;Service&quot;).
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Who we are</h2>
        <p>
          Gravity Stretching operates yoga and stretching studios in Bali,
          Indonesia (Canggu and Ubud). You can contact us at{" "}
          <a href="mailto:admin@bookgravity.com">admin@bookgravity.com</a>.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. What we collect</h2>
        <p>When you book a class, we collect:</p>
        <ul>
          <li>Your name</li>
          <li>Your email address</li>
          <li>Your phone number (used for WhatsApp confirmations)</li>
          <li>The class date, time, and any additional services you select</li>
        </ul>
        <p>
          When you sign in to the mobile app as a client, trainer, or
          administrator we also collect:
        </p>
        <ul>
          <li>Your email and a hashed password</li>
          <li>
            A device push notification token (Expo / APNS / FCM) so we can
            deliver reminders and booking notifications
          </li>
          <li>Your device model and operating system, for debugging</li>
        </ul>
        <p>
          We do <strong>not</strong> collect: payment card numbers, government
          ID, location data, or biometric data. The mobile app uses the camera
          only to scan check-in QR codes on the device — no photos are
          uploaded or stored.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. How we use it</h2>
        <ul>
          <li>To create and manage your class bookings</li>
          <li>To send you booking confirmations and reminders by email and WhatsApp</li>
          <li>To let your trainer see who is booked into their class</li>
          <li>To send push notifications about your upcoming classes (mobile app only)</li>
          <li>To prevent double-booking and manage class capacity</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. Who we share it with</h2>
        <p>We share the minimum necessary data with:</p>
        <ul>
          <li>
            <strong>Resend</strong> — to deliver transactional emails
            (confirmations, reminders)
          </li>
          <li>
            <strong>Meta (WhatsApp Business Cloud API)</strong> — to deliver
            WhatsApp confirmations and let our team chat with you about your
            booking
          </li>
          <li>
            <strong>Expo / Apple APNS / Google FCM</strong> — to deliver push
            notifications to your device
          </li>
          <li>
            <strong>Vercel</strong> and <strong>Turso</strong> — our hosting
            and database providers
          </li>
        </ul>
        <p>
          We never sell your data, and we never share it for marketing
          purposes with third parties.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Retention</h2>
        <p>
          Booking records are kept for accounting purposes for up to 5 years.
          You can request earlier deletion by emailing us. Push notification
          tokens are deleted automatically when you sign out of the mobile
          app or uninstall it.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Your rights</h2>
        <p>You may at any time:</p>
        <ul>
          <li>Request a copy of the personal data we hold about you</li>
          <li>Ask us to correct inaccurate data</li>
          <li>Ask us to delete your account and associated bookings</li>
          <li>
            Withdraw consent for push notifications (in iOS / Android settings)
            or WhatsApp messages (by replying &quot;STOP&quot;)
          </li>
        </ul>
        <p>
          To exercise any of these rights, email{" "}
          <a href="mailto:admin@bookgravity.com">admin@bookgravity.com</a>.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Children</h2>
        <p>
          The Service is intended for adults and minors with parental
          supervision. We do not knowingly collect data from children under
          the age of 13 without parental consent.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Changes</h2>
        <p>
          We may update this policy from time to time. The latest version
          will always be available at this URL with an updated date.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Contact</h2>
        <p>
          Questions? Write to{" "}
          <a href="mailto:admin@bookgravity.com">admin@bookgravity.com</a>.
        </p>
      </article>
    </main>
  )
}
