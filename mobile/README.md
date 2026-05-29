# Gravity Stretching — iOS / Android

Native mobile companion to the bookgravity.com web app. Built with Expo
(React Native + Expo Router) so a single codebase ships to iOS first and
Android right after.

## Prerequisites (one-time)

1. **Node 20+** — `nvm install 20` if needed.
2. **Expo account** — https://expo.dev/signup (free).
3. **EAS CLI** — `npm i -g eas-cli` then `eas login`.
4. **Apple Developer Program** — active, $99/yr. App ID
   `com.bookgravity.gravitystretching` will be created on first `eas build`.

## Install

```sh
cd mobile
npm install            # installs Expo SDK 52 + RN 0.76
npx expo install --fix # reconciles native deps with the SDK manifest
```

## Run locally

```sh
npx expo start         # opens Metro; press i for iOS simulator
```

For a real device:

```sh
eas build --profile development --platform ios
```

…then scan the QR shown in `expo start` from the Expo Go-style dev client.

## Build for TestFlight

```sh
eas build --platform ios --profile preview        # internal testers
eas build --platform ios --profile production     # store submission
eas submit --platform ios --latest                # uploads to App Store Connect
```

## Architecture

| Path                                | What                                                    |
|-------------------------------------|---------------------------------------------------------|
| `app/_layout.tsx`                   | Root layout — hydrates session, role-based redirect.    |
| `app/(auth)/login.tsx`              | Email + password sign-in against `/api/auth/native/*`.  |
| `app/(client)/*`                    | Tabs for the client surface (book, tickets, profile).   |
| `app/(trainer)/*`                   | Tabs for the trainer surface (schedule, checkin, …).    |
| `lib/api.ts`                        | Fetch wrapper, Bearer token from SecureStore.           |
| `lib/auth.ts`                       | Zustand store: signIn / signOut / hydrate.              |
| `lib/theme.ts`                      | Color / spacing / type tokens, light + dark.            |
| `components/ui/*`                   | `Text`, `Button`, `Input` primitives.                   |
| `../shared/types.ts`                | Types shared with the web app.                          |

## Talking to the backend

Mobile sends `Authorization: Bearer <jwt>` to bookgravity.com. The web's
NextAuth cookie flow stays for browsers. `lib/auth-helpers.ts`
(`requireAdmin / requireTrainer / requireAuth`) reads either source —
existing endpoints work for the app without any changes.

Native-specific endpoints:

- `POST /api/auth/native/login` — sign in, returns access + refresh JWTs.
- `POST /api/auth/native/refresh` — rotates the refresh, returns a fresh access.
- `GET  /api/auth/native/me` — validates a stored token on cold start.

JWTs are HS256, 14-day access + 90-day refresh, signed with
`NATIVE_JWT_SECRET` (falls back to `AUTH_SECRET`).

## What ships next

This commit lays the foundation: navigation, design system, auth, role
router. Up next, in order:

1. Client calendar — mirror of the web booking widget.
2. Client tickets — list + QR-encoded ticket detail.
3. Trainer schedule — today / week views.
4. Trainer QR scan check-in — `expo-camera`.
5. Push notifications — `expo-notifications`.
6. App Store assets + first TestFlight build.
