@AGENTS.md

## No long dash in any client/notification text

Every string a human reads - WhatsApp templates (Meta), emails, cancel-bot
replies, OTP/error messages, push notifications, time ranges ("11:00-12:30") -
uses a plain hyphen "-", NEVER an em dash "—" (U+2014) or en dash "–" (U+2013).
Applies to client, trainer and admin-facing text. When writing or editing any
such string, type a hyphen; never paste a long dash. Code comments and logs are
exempt. Owner rule (14.06.2026); full version in `~/.claude/CLAUDE.md`.

## Browser rule (applies here and everywhere)

I have my OWN browser — the **Playwright MCP browser** (`mcp__playwright__*`) with the
persistent profile at `~/.claude/playwright-profile` (already logged into Google
`hatabishchip@gmail.com`, etc.). Use IT for EVERY web task, in every chat and situation:
Google Cloud/Search Console/OAuth, Vercel, Apple, Play, Meta — all of it.

- **Never** use the Claude-in-Chrome extension (`mcp__Claude_in_Chrome__*`) — it disconnects
  and forces the user to reopen Chrome. Never ask the user to "open Chrome with the extension."
- If a site isn't logged in yet in the Playwright profile, log in there ONCE (user does any
  2FA that single time); the session then persists forever and is reused silently.
- Full rule lives in `~/.claude/CLAUDE.md` and memory `tooling_browser_persistence.md`.
