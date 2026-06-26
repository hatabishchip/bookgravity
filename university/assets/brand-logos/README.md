# Gravity Stretching - official brand logos

Canonical logo files (transparent PNG, 1090x1088, black mark).

- `WORLD.png`  - global brand "GRAVITY STRETCHING WORLD". Used for: the app icon
  / splash, `public/icon-default.png` (global app-icon + /api/logo fallback),
  `mobile/assets/world-logo.png` (login screen). Shown to all clients.
- `CANGGU.png` - Canggu studio "GRAVITY STRETCHING CANGGU". Stored in the DB as
  `Studio.logoUrl` + `faviconUrl` for the canggu studio (white-square composite).
- `USA.png`    - USA studio "GRAVITY STRETCHING USA". Stored in the DB as
  `Studio.logoUrl` + `faviconUrl` for the usa studio (white-square composite).

Rule: these REPLACE the previous World/Canggu logos everywhere. The UBUD studio
logo is separate and must NOT be touched. Stored/icon copies are composited on a
white square so they stay visible on dark themes; these source files keep the
transparent background.

Added 26.06.2026. Backup also on Google Drive: gdrive:Gravity/brand-logos/.
