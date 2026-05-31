# Google Play Console — Gravity Stretching listing

Paste into Play Console → your app → Main store listing / App content.

---

## App name (30 chars max)

Gravity Stretching

## Short description (80 chars max)

Book your stretching class in Bali — pick a time, save your QR ticket, walk in.

## Full description (4000 chars max)

Gravity Stretching is the official booking app for Gravity Stretching studios
in Canggu and Ubud, Bali.

Open the app, see what's free today, lock in your spot in three taps, and get a
QR ticket you can show at the door. That's it.

WHAT YOU CAN DO
• Browse the live schedule — group, kids, and private stretching classes
• Book a slot in seconds with your name, phone, and email
• Add a friend or two to the same booking (party size up to 6)
• Pick optional services (mats, towels, etc.) at booking time
• Save QR tickets locally so they work even without signal
• Get notifications for booking confirmations and class reminders

FOR OUR TRAINERS
If you teach at Gravity Stretching, sign in with the credentials your studio
admin gave you and you'll see:
• Today's class roster and the next 7 days at a glance
• Per-class client list with tap-to-call
• A camera-based QR check-in scanner — no more paper lists
• A push whenever a new booking lands in your class

PRIVACY & DATA
We collect only what's needed to manage your booking (name, email, phone). We
never sell your data. Full policy: bookgravity.com/privacy

QUESTIONS
Email hello@bookgravity.com or visit bookgravity.com/support

## Category

Health & Fitness

## Tags / keywords (search terms)

stretching, yoga, booking, bali, canggu, ubud, fitness, wellness, class, schedule

## Contact details

- Email: hello@bookgravity.com
- Website: https://bookgravity.com
- Privacy policy: https://bookgravity.com/privacy

---

## Graphic assets required by Play

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | reuse /assets/icon.png (resize to 512) |
| Feature graphic | 1024×500 PNG/JPG (no alpha) | TODO — needed before publishing |
| Phone screenshots | min 2, 16:9 or 9:16, 1080px+ | TODO — capture from device/emulator |
| (optional) 7" / 10" tablet shots | — | optional |

---

## App content / Data safety (Play's questionnaire)

Mirrors the iOS privacy answers.

**Does your app collect or share user data?** Yes (collect), No sharing for ads.

| Data type | Collected | Shared | Purpose | Linked to user |
|---|---|---|---|---|
| Name | Yes | No | App functionality, Customer support | Yes |
| Email address | Yes | No | App functionality, Customer support | Yes |
| Phone number | Yes | No | App functionality, Customer support | Yes |
| Device or other IDs (push token) | Yes | No | App functionality (notifications) | Yes |
| Location | No | — | — | — |
| Photos / videos | No | — | — | — |
| Financial info | No | — | — | — |

- Data is encrypted in transit: **Yes** (HTTPS).
- Users can request data deletion: **Yes** — via email hello@bookgravity.com.

**Content rating:** complete the IARC questionnaire → expected "Everyone / 3+"
(no violence, no user-generated content shared publicly).

**Target audience:** 18+ (and supervised minors). Not designed for children.

**Ads:** No ads.

**Government app:** No.

---

## Release notes (What's new)

First release. Book a stretching class in three taps, save your QR ticket, and
walk into the studio. Trainers can scan tickets right from their phone.

---

## Build + submit (EAS)

```
# Production AAB (already kicked off — versionCode auto-increments)
eas build --platform android --profile production

# After the Play app + service-account JSON exist, upload to Internal testing:
eas submit --platform android --latest
# (uses submit.production.android in eas.json → ./google-play-service-account.json)
```

First-ever upload note: Google requires the very first AAB to be uploaded
**manually** in Play Console for some accounts before `eas submit` can take
over. If `eas submit` errors on the first try, download the AAB from the EAS
build page and upload it by hand in Play Console → Internal testing → Create
release.
