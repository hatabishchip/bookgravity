# App Store Connect — Gravity Stretching metadata

Source of truth for everything that goes into App Store Connect. Copy / paste
into the matching field in App Store Connect → My Apps → Gravity Stretching →
App Store → 1.0 Prepare for Submission.

When the values here change, bump the in-app version (`expo.version`) and the
prepare-for-submission record at the same time so the listing and the binary
stay in lockstep.

---

## App name (30 chars max)

GravityStretching

## Subtitle (30 chars max)

Book your stretching class

## Primary category

Health & Fitness

## Secondary category

Lifestyle

## Promotional text (170 chars, can update without a new build)

Same-day spots open and close every hour. Book on the go, save your QR
ticket, and walk straight into class — no email scrolling needed.

## Description (4000 chars max)

Gravity Stretching is the official booking app for Gravity Stretching
studios in Canggu and Ubud, Bali.

Open the app, see what's free today, lock in your spot in three taps, and
get a QR ticket you can flash at the door. That's it.

WHAT YOU CAN DO

• Browse the live schedule — group, kids, and private stretching classes
• Book a slot in seconds with your name, phone, and email
• Add a friend or two to the same booking (party size up to 6)
• Pick optional services (mats, towels, etc.) at booking time
• Save QR tickets locally so they work even without signal
• Get push notifications for booking confirmations and class reminders

FOR OUR TRAINERS

If you teach at Gravity Stretching, sign in with the credentials your
studio admin gave you and you'll see:

• Today's class roster and next 7 days at a glance
• Per-class client list with phone tap-to-call
• A camera-based QR check-in scanner — no more paper lists
• A live push whenever a new booking lands in your class

PRIVACY & DATA

We collect only the information needed to manage your booking (name,
email, phone). We never sell your data. Read the full policy at
bookgravity.com/privacy.

QUESTIONS

Email admin@bookgravity.com or visit bookgravity.com/support.

## Keywords (100 chars, comma-separated)

stretching,yoga,booking,bali,canggu,ubud,fitness,wellness,class,schedule

## Support URL

https://bookgravity.com/support

## Marketing URL (optional)

https://bookgravity.com

## Privacy Policy URL

https://bookgravity.com/privacy

## App rating

4+ — no objectionable content.

## What's new in this version (4000 chars, per-release)

First release. Book a stretching class in three taps, save your QR
ticket, and walk into the studio. Trainers can scan tickets right from
their phone.

---

## App Privacy questionnaire answers (Data collection section)

Apple asks line-by-line what we collect and how it's used. Answers
below match the privacy policy.

| Data type | Collected? | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality, Customer Support |
| Name | Yes | Yes | No | App Functionality |
| Phone Number | Yes | Yes | No | App Functionality, Customer Support |
| Device ID (Expo push token) | Yes | Yes | No | App Functionality (notifications) |
| Coarse Location | No | — | — | — |
| Precise Location | No | — | — | — |
| Photos / Camera | No | — | — | — (camera is used only on-device for QR scanning; nothing is uploaded) |
| Health & Fitness | No | — | — | — |
| Financial Info | No | — | — | — |
| Contacts | No | — | — | — |
| Browsing History | No | — | — | — |
| Search History | No | — | — | — |
| User Content | No | — | — | — |
| Identifiers (Advertising ID) | No | — | — | — |
| Diagnostics (Crash Data) | Not yet | — | — | — |

**Does the app collect data?** Yes.
**Does the app use tracking (App Tracking Transparency)?** No.

---

## Export compliance

`ITSAppUsesNonExemptEncryption` = `false` in `app.json` →
Apple's "uses only standard HTTPS encryption" exemption applies. No
ERN required.

---

## Review notes (private, only Apple sees)

Demo account for the reviewer:

- Email: demo-reviewer@bookgravity.com
- Password: GravityReview2026!
- Role: TRAINER (set up under the Canggu studio so reviewer can see the
  full trainer surface — schedule, check-in scanner, profile)

The reviewer doesn't need to scan a real ticket — they can tap any
class in the schedule and tour the screens. The check-in screen
requires camera permission, which the OS prompt explains.

Server: https://canggu.bookgravity.com (production). The app talks to
https://bookgravity.com (apex) for native auth.
