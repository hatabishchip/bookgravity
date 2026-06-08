# Google Play store assets — Gravity Stretching

Generated for the Play Console listing (account 5663118199209445484).

| File | Spec | Play requirement | Status |
|---|---|---|---|
| `play-icon-512.png` | 512×512 PNG | App icon, 512×512 32-bit | ✅ (resized from assets/icon.png) |
| `play-feature-1024x500.png` | 1024×500 PNG | Feature graphic, 1024×500, no alpha | ✅ branded |
| `play-screenshot-1-booking.png` | 450×800 PNG | Phone screenshot, ≥320px, ≤2:1 | ✅ |
| `play-screenshot-2-times.png` | 450×800 PNG | Phone screenshot | ✅ |
| `play-screenshot-3-details.png` | 450×800 PNG | Phone screenshot (min 2 required) | ✅ |

## Notes
- Screenshots capture the **real booking UI** (live bookgravity.com/canggu) at a
  phone viewport (9:16). They represent the actual product experience. Once a
  native Android build is running, they can be swapped for on-device captures
  for extra polish — not required for the first submission.
- Feature graphic: brand green `#2C6E49`, logo + tagline, rendered from
  `feature.html` (kept in the build steps, not shipped).
- Listing copy (title, short/full description, Data Safety answers, content
  rating) is in `../play-metadata.md`.
