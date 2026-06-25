import Link from "next/link"

// Public site footer. Beyond the usual links, this exists to make the
// website ↔ legal-entity association explicit and visible: Apple Developer
// enrollment review requires that the company website publicly shows it
// belongs to the enrolling organization (PT Gravity Stretching Canggu).
// Rendered on the apex chooser and every per-studio booking page. The USA /
// Online studio is operated by the US entity (GravityStretching LLC, Texas) and
// shows that instead - so the US service page reads as genuine US commerce
// (important for the GravityStretching USPTO trademark). All other pages keep
// the PT Gravity Stretching Canggu entity that Apple enrollment verification
// requires.
export default function SiteFooter({ variant = "id" }: { variant?: "id" | "us" } = {}) {
  if (variant === "us") {
    return (
      <footer className="mt-10 border-t border-black/5 bg-white/60">
        <div className="max-w-4xl mx-auto px-4 py-8 text-sm text-gray-500">
          <div className="font-semibold text-brand">GravityStretching</div>
          <p className="mt-2 leading-relaxed">
            Operated by <strong>GravityStretching LLC</strong>
            <br />
            Houston, Texas, United States
          </p>
          <p className="mt-2 leading-relaxed">
            <a className="hover:text-brand" href="mailto:admin@bookgravity.com">
              admin@bookgravity.com
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
            © 2026 GravityStretching LLC. GravityStretching is a service mark of GravityStretching LLC.
          </p>
        </div>
      </footer>
    )
  }
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
