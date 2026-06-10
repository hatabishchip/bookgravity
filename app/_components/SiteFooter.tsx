import Link from "next/link"

// Public site footer. Beyond the usual links, this exists to make the
// website ↔ legal-entity association explicit and visible: Apple Developer
// enrollment review requires that the company website publicly shows it
// belongs to the enrolling organization (PT Gravity Stretching Canggu).
// Rendered on the apex chooser and every per-studio booking page.
export default function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-black/5 bg-white/60">
      <div className="max-w-4xl mx-auto px-4 py-8 text-sm text-gray-500">
        <div className="font-semibold text-brand">Gravity Stretching</div>
        <p className="mt-2 leading-relaxed">
          Operated by <strong>PT Gravity Stretching Canggu</strong>
          <br />
          Jalan Raya Padonan Gang Pilot, Tibubeneng, Kuta Utara,
          <br />
          Badung, Bali 80365, Indonesia
        </p>
        <p className="mt-2 leading-relaxed">
          <a className="hover:text-brand" href="mailto:admin@bookgravity.com">
            admin@bookgravity.com
          </a>
          {" · "}
          <a className="hover:text-brand" href="tel:+6282131304681">
            +62 821 3130 468
          </a>
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link className="hover:text-brand" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-brand" href="/support">
            Support
          </Link>
          <a className="hover:text-brand" href="/login">
            Staff sign in
          </a>
        </nav>
        <p className="mt-4 text-xs text-gray-400">
          © 2026 PT Gravity Stretching Canggu. NIB 2304260281773.
        </p>
      </div>
    </footer>
  )
}
