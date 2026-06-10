import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy — Gravity Stretching",
  description: "How Gravity Stretching collects and uses your personal data.",
}

// Plain HTML privacy policy hosted at https://bookgravity.com/privacy.
// The URL is filed in App Store Connect for both the iOS app and the web
// app, and in Google Play Console for the Android app. Keeping it on the
// same root domain (not behind a studio subdomain) so super-admin
// onboarding doesn't have to repeat it.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-sand">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link href="/" className="text-brand font-bold text-lg">
            Gravity Stretching
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← Back to booking
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 py-10 prose prose-neutral">
        <h1 className="text-3xl font-bold text-brand-dark mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 2 June 2026</p>

        <p>
          This Privacy Policy describes how PT Gravity Stretching Canggu
          (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and
          protects your personal information when you use our website at
          bookgravity.com (and its subdomains) and our mobile applications
          &quot;Gravity Stretching&quot; for iOS and Android (together, the
          &quot;Service&quot;).
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Who we are</h2>
        <p>
          The Service is operated by{" "}
          <strong>PT Gravity Stretching Canggu</strong>, an Indonesian limited
          liability company (Perseroan Terbatas) with foreign capital status
          (PMA), registered under the laws of the Republic of Indonesia.
        </p>
        <ul>
          <li>
            <strong>Registered office:</strong> Jalan Raya Padonan Gang Pilot,
            Tibubeneng, Kecamatan Kuta Utara, Kabupaten Badung, Bali 80365,
            Indonesia
          </li>
          <li>
            <strong>NIB (Business Identification Number):</strong> 2304260281773
          </li>
          <li>
            <strong>NPWP (Tax ID):</strong> 10.000.000.0-931.2478
          </li>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:admin@bookgravity.com">admin@bookgravity.com</a>
          </li>
          <li>
            <strong>Phone:</strong>{" "}
            <a href="tel:+6282131304681">+62 821 3130 468</a>
          </li>
        </ul>
        <p>
          For the purposes of GDPR (where applicable), PT Gravity Stretching
          Canggu acts as the data controller of your personal information.
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
          ID, location data, biometric data, contacts, browsing history,
          photos, or advertising identifiers. The mobile app uses the camera
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
        <p>
          The legal basis for processing this data is the performance of the
          contract between you and PT Gravity Stretching Canggu when you book
          a class, and your consent for push notifications.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">
          4. No tracking, no advertising
        </h2>
        <p>
          We do <strong>not</strong> use any third-party analytics SDKs,
          advertising networks, or advertising identifiers. We do not track
          you across other websites or applications. The Service does not
          display advertisements. We do not sell, rent, or trade your personal
          information to anyone for any purpose.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Who we share it with</h2>
        <p>We share the minimum necessary data with the following processors:</p>
        <ul>
          <li>
            <strong>Resend</strong> (United States) — to deliver transactional
            emails (confirmations, reminders)
          </li>
          <li>
            <strong>Meta Platforms, Inc.</strong> via the WhatsApp Business
            Cloud API (Ireland / United States) — to deliver WhatsApp
            confirmations and let our team chat with you about your booking
          </li>
          <li>
            <strong>Expo</strong> (United States),{" "}
            <strong>Apple Push Notification Service</strong>, and{" "}
            <strong>Google Firebase Cloud Messaging</strong> — to deliver push
            notifications to your device
          </li>
          <li>
            <strong>Vercel Inc.</strong> (United States) — hosting and edge
            delivery of our web and API endpoints
          </li>
          <li>
            <strong>Turso</strong> (United States) — managed database hosting
          </li>
        </ul>
        <p>
          Each processor is bound by its own terms of service and acts under
          our instructions for the purposes described above only. We never
          sell your data, and we never share it for marketing purposes with
          third parties.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">
          6. International data transfers
        </h2>
        <p>
          PT Gravity Stretching Canggu is based in Indonesia. Some of the
          processors listed above store and process data in the United States
          or the European Union. Where personal data is transferred outside
          your country of residence, we rely on appropriate safeguards offered
          by each processor (such as Standard Contractual Clauses for transfers
          governed by GDPR). By using the Service, you understand that your
          personal data may be transferred to and processed in these
          jurisdictions.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Retention</h2>
        <p>
          Booking records are kept for accounting purposes for up to 5 years,
          consistent with Indonesian tax and bookkeeping requirements. You can
          request earlier deletion by emailing us. Push notification tokens
          are deleted automatically when you sign out of the mobile app or
          uninstall it. Trainer and administrator accounts are deleted within
          30 days of the staff member leaving the studio.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Your rights</h2>
        <p>You may at any time:</p>
        <ul>
          <li>Request a copy of the personal data we hold about you</li>
          <li>Ask us to correct inaccurate data</li>
          <li>Ask us to delete your account and associated bookings</li>
          <li>
            Withdraw consent for push notifications (in iOS / Android settings)
            or WhatsApp messages (by replying &quot;STOP&quot;)
          </li>
          <li>
            Object to or restrict certain processing of your data, where
            applicable under your local law
          </li>
          <li>
            Lodge a complaint with your local data protection authority
          </li>
        </ul>
        <p>
          To exercise any of these rights, email{" "}
          <a href="mailto:admin@bookgravity.com">admin@bookgravity.com</a>.
          We will respond within 30 days.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Children</h2>
        <p>
          The Service is not directed at children under the age of 13. We do
          not knowingly collect personal information from children under 13.
          We comply with the United States Children&apos;s Online Privacy
          Protection Act (COPPA) and the European General Data Protection
          Regulation provisions for children (GDPR-K). If you believe a child
          has provided us with personal data, please contact us and we will
          delete it promptly.
        </p>
        <p>
          Minors aged 13 or older may use the Service only with the
          supervision and consent of a parent or legal guardian.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">
          10. Data Safety form alignment
        </h2>
        <p>
          The disclosures in this Privacy Policy align with the data
          collection and sharing declarations we provide in the Apple App
          Store privacy questionnaire and the Google Play Data Safety form.
          If you spot any discrepancy, please let us know — the Privacy
          Policy is the source of truth.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">11. Security</h2>
        <p>
          We protect your data with HTTPS in transit, encrypted database
          storage at rest, hashed passwords (bcrypt), and access controls
          that limit staff access on a need-to-know basis. No method of
          transmission or storage is 100% secure, but we work to follow
          industry-standard practices.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">12. Changes</h2>
        <p>
          We may update this policy from time to time. The latest version
          will always be available at this URL with an updated date.
          Material changes will also be communicated through the Service.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">13. Contact</h2>
        <p>
          Questions, concerns, or data-related requests? Write to{" "}
          <a href="mailto:admin@bookgravity.com">admin@bookgravity.com</a>.
        </p>
        <p>
          <strong>PT Gravity Stretching Canggu</strong>
          <br />
          Jalan Raya Padonan Gang Pilot
          <br />
          Tibubeneng, Kuta Utara
          <br />
          Badung, Bali 80365, Indonesia
        </p>
      </article>
    </main>
  )
}
