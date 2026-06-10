@AGENTS.md

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
