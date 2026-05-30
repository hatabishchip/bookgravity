"use client"

// Top-level fallback when even the root layout fails to render.
// Must include <html> and <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#F5F4F0", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ maxWidth: 384, width: "100%", background: "white", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(44,110,73,0.1)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2C6E49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8, margin: "0 0 8px" }}>
              Connection problem
            </h1>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5, margin: "0 0 24px" }}>
              Check your internet and try again.
            </p>
            <button
              onClick={() => { try { reset() } catch {} window.location.reload() }}
              style={{ width: "100%", background: "#2C6E49", color: "white", fontWeight: 600, padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, minHeight: 48 }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
