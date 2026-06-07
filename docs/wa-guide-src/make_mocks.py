"""Generate annotated mock screenshots for the WhatsApp connection guide.

Real Facebook screenshots aren't accessible from this environment (Meta auth
required). For the bookgravity admin we reproduce the actual UI based on
app/sadmin/page.tsx so the mockups read identically to the live product.

All images saved as PNG at 2x DPI for crisp embedding in the PDF.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/tmp/wa-guide/img"
os.makedirs(OUT, exist_ok=True)

# Brand + UI palette
BRAND = (44, 110, 73)         # #2C6E49
BRAND_DARK = (30, 77, 52)     # #1E4D34
META_BLUE = (24, 119, 242)    # Facebook blue
WA_GREEN = (37, 211, 102)     # WhatsApp green
INK = (24, 24, 27)            # near-black text
MUTED = (107, 114, 128)       # grey-500
LINE = (229, 231, 235)        # grey-200
BG = (249, 250, 251)          # grey-50
WHITE = (255, 255, 255)
CALLOUT = (220, 38, 38)       # red-600 for annotation arrows
CALLOUT_BG = (254, 226, 226)  # red-100 chip bg
SUCCESS = (16, 185, 129)      # emerald-500

# Font picks. macOS reliably has these.
def _font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()

F_T = lambda s: _font(s, bold=False)
F_B = lambda s: _font(s, bold=True)


def new_canvas(w, h, bg=BG):
    img = Image.new("RGB", (w, h), bg)
    return img, ImageDraw.Draw(img)


def rounded_rect(d, xy, r, fill, outline=None, w=1):
    d.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=w)


def callout_circle(d, xy, number, color=CALLOUT):
    """A red numbered circle used to highlight things in screenshots."""
    x, y = xy
    r = 18
    d.ellipse((x - r, y - r, x + r, y + r), fill=color, outline=WHITE, width=3)
    f = F_B(22)
    bbox = d.textbbox((0, 0), str(number), font=f)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    d.text((x - tw // 2, y - th // 2 - 4), str(number), fill=WHITE, font=f)


def arrow(d, p1, p2, color=CALLOUT, w=3):
    """Simple arrow with head."""
    x1, y1 = p1; x2, y2 = p2
    d.line([(x1, y1), (x2, y2)], fill=color, width=w)
    # arrow head
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    s = 12
    p3 = (x2 - s * math.cos(ang - 0.5), y2 - s * math.sin(ang - 0.5))
    p4 = (x2 - s * math.cos(ang + 0.5), y2 - s * math.sin(ang + 0.5))
    d.polygon([(x2, y2), p3, p4], fill=color)


def browser_chrome(d, w, h, title=""):
    """Draw a fake browser top bar — Chrome-style."""
    d.rectangle((0, 0, w, 44), fill=(243, 244, 246))
    # 3 dots
    d.ellipse((14, 16, 26, 28), fill=(239, 68, 68))
    d.ellipse((34, 16, 46, 28), fill=(245, 158, 11))
    d.ellipse((54, 16, 66, 28), fill=(34, 197, 94))
    # URL bar
    rounded_rect(d, (90, 12, w - 14, 32), 6, fill=WHITE, outline=LINE)
    d.text((104, 18), title, fill=MUTED, font=F_T(13))


# ----------------------------------------------------------------------------
# Mock 1 — business.facebook.com home (WhatsApp Manager card)
# ----------------------------------------------------------------------------
def mock_business_home():
    W, H = 1400, 900
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H, "https://business.facebook.com")
    # Left side nav
    d.rectangle((0, 44, 260, H), fill=(243, 246, 250))
    rounded_rect(d, (20, 72, 240, 110), 8, fill=META_BLUE)
    d.text((36, 84), "Meta Business Suite", fill=WHITE, font=F_B(15))
    items = ["Home", "Inbox", "Notifications", "Posts & stories",
             "Insights", "Ads", "Apps", "WhatsApp Manager", "Settings"]
    y = 140
    for i, it in enumerate(items):
        if it == "WhatsApp Manager":
            rounded_rect(d, (12, y - 6, 248, y + 28), 8, fill=(225, 240, 235))
            d.text((36, y), "💬  " + it, fill=BRAND, font=F_B(15))
        else:
            d.text((36, y), "•  " + it, fill=INK, font=F_T(14))
        y += 44

    # Main area title
    d.text((300, 80), "Welcome back, Aleksandr", fill=INK, font=F_B(28))
    d.text((300, 120), "Connect your WhatsApp number to start sending notifications.",
           fill=MUTED, font=F_T(15))

    # WhatsApp card
    rounded_rect(d, (300, 180, 1080, 480), 16, fill=WHITE, outline=LINE, w=2)
    d.ellipse((328, 208, 408, 288), fill=WA_GREEN)
    d.text((352, 230), "💬", fill=WHITE, font=F_B(36))
    d.text((430, 218), "WhatsApp Manager", fill=INK, font=F_B(24))
    d.text((430, 254), "Add a phone number, manage templates,",
           fill=MUTED, font=F_T(15))
    d.text((430, 278), "and connect it to your bookgravity studio.",
           fill=MUTED, font=F_T(15))

    # Big CTA button
    rounded_rect(d, (340, 380, 620, 440), 10, fill=BRAND)
    d.text((396, 396), "Open WhatsApp Manager", fill=WHITE, font=F_B(18))

    # Annotations
    callout_circle(d, (240, 322), 1)
    arrow(d, (260, 322), (300, 322))
    callout_circle(d, (640, 410), 2)
    arrow(d, (620, 410), (660, 410))

    img.save(f"{OUT}/01_business_home.png")


# ----------------------------------------------------------------------------
# Mock 2 — WhatsApp Manager → Phone numbers tab → Add phone number
# ----------------------------------------------------------------------------
def mock_wa_manager_phones():
    W, H = 1400, 900
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H, "https://business.facebook.com/wa/manage/phone-numbers")

    d.text((40, 72), "WhatsApp Manager", fill=INK, font=F_B(26))
    # Tabs
    tabs = ["Overview", "Phone numbers", "Message templates", "Insights", "Account tools"]
    x = 40
    for t in tabs:
        active = t == "Phone numbers"
        f = F_B(15) if active else F_T(15)
        bbox = d.textbbox((0, 0), t, font=f)
        tw = bbox[2] - bbox[0]
        d.text((x, 130), t, fill=BRAND if active else MUTED, font=f)
        if active:
            d.line((x, 158, x + tw, 158), fill=BRAND, width=3)
        x += tw + 38
    d.line((40, 162, W - 40, 162), fill=LINE, width=1)

    # Phone numbers table
    rounded_rect(d, (40, 200, W - 40, 720), 14, fill=WHITE, outline=LINE, w=2)
    d.text((64, 220), "Your phone numbers", fill=INK, font=F_B(20))

    # Header row
    d.text((64, 270), "Phone", fill=MUTED, font=F_B(12))
    d.text((460, 270), "Display name", fill=MUTED, font=F_B(12))
    d.text((780, 270), "Status", fill=MUTED, font=F_B(12))
    d.text((1020, 270), "Quality", fill=MUTED, font=F_B(12))
    d.line((64, 295, W - 64, 295), fill=LINE, width=1)

    # Existing rows
    rows = [
        ("+62 821-3130-468", "GravityStretchingСanggu", "Connected", WA_GREEN),
        ("+62 ... new", "Gravity Stretching Bali", "Not added yet", MUTED),
    ]
    y = 320
    for ph, name, status, badge_color in rows:
        d.text((64, y), ph, fill=INK, font=F_B(15))
        d.text((460, y), name, fill=INK, font=F_T(15))
        # badge
        rounded_rect(d, (780, y - 4, 920, y + 24), 6,
                     fill=(225, 240, 235) if badge_color == WA_GREEN else BG,
                     outline=badge_color, w=1)
        d.text((792, y), status, fill=badge_color, font=F_B(13))
        d.text((1020, y), "GREEN" if status == "Connected" else "—",
               fill=badge_color, font=F_T(14))
        y += 60
        d.line((64, y - 8, W - 64, y - 8), fill=LINE, width=1)

    # Add phone number CTA
    rounded_rect(d, (W - 280, 220, W - 64, 252), 8, fill=BRAND)
    d.text((W - 256, 228), "+ Add phone number", fill=WHITE, font=F_B(14))

    # Annotation
    callout_circle(d, (W - 290, 236), 3)
    arrow(d, (W - 280, 236), (W - 240, 236))

    img.save(f"{OUT}/02_wa_manager_phones.png")


# ----------------------------------------------------------------------------
# Mock 3 — Add phone number dialog (the verification step)
# ----------------------------------------------------------------------------
def mock_add_phone_dialog():
    W, H = 1400, 900
    img, d = new_canvas(W, H, (230, 230, 230))
    browser_chrome(d, W, H, "https://business.facebook.com/wa/manage/phone-numbers")
    # Backdrop
    d.rectangle((0, 44, W, H), fill=(0, 0, 0, 128))

    # Centered modal
    mx, my, mw, mh = 350, 130, 700, 700
    rounded_rect(d, (mx, my, mx + mw, my + mh), 18, fill=WHITE)
    d.text((mx + 32, my + 28), "Add a phone number", fill=INK, font=F_B(22))
    d.text((mx + 32, my + 60), "Step 1 of 3 — Phone verification",
           fill=MUTED, font=F_T(13))
    # Stepper dots
    for i, label in enumerate(["Info", "Verify", "Confirm"]):
        cx = mx + 100 + i * 220
        fill = BRAND if i == 0 else LINE
        d.ellipse((cx - 10, my + 110, cx + 10, my + 130), fill=fill)
        d.text((cx - 14, my + 138), label, fill=INK if i == 0 else MUTED,
               font=F_B(12) if i == 0 else F_T(12))

    # Form
    d.text((mx + 32, my + 200), "Business display name", fill=INK, font=F_B(14))
    rounded_rect(d, (mx + 32, my + 224, mx + mw - 32, my + 264), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 44, my + 234), "Gravity Stretching Bali", fill=INK, font=F_T(14))

    d.text((mx + 32, my + 290), "Time zone", fill=INK, font=F_B(14))
    rounded_rect(d, (mx + 32, my + 314, mx + mw - 32, my + 354), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 44, my + 324), "(GMT+08:00) Asia/Makassar", fill=INK, font=F_T(14))

    d.text((mx + 32, my + 380), "Category", fill=INK, font=F_B(14))
    rounded_rect(d, (mx + 32, my + 404, mx + mw - 32, my + 444), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 44, my + 414), "Wellness", fill=INK, font=F_T(14))

    d.text((mx + 32, my + 470), "Phone number", fill=INK, font=F_B(14))
    rounded_rect(d, (mx + 32, my + 494, mx + 180, my + 534), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 44, my + 504), "🇮🇩 +62 ▾", fill=INK, font=F_T(14))
    rounded_rect(d, (mx + 192, my + 494, mx + mw - 32, my + 534), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 204, my + 504), "8123456789", fill=INK, font=F_T(14))

    # Verification radio buttons
    d.text((mx + 32, my + 558), "Verify via", fill=INK, font=F_B(14))
    d.ellipse((mx + 44, my + 586, mx + 58, my + 600), outline=BRAND, width=3, fill=BRAND)
    d.text((mx + 70, my + 584), "SMS", fill=INK, font=F_T(14))
    d.ellipse((mx + 150, my + 586, mx + 164, my + 600), outline=LINE, width=2)
    d.text((mx + 176, my + 584), "Voice call", fill=INK, font=F_T(14))

    # CTA
    rounded_rect(d, (mx + 32, my + mh - 70, mx + mw - 32, my + mh - 22), 10, fill=BRAND)
    d.text((mx + mw // 2 - 64, my + mh - 56), "Send code", fill=WHITE, font=F_B(16))

    # Annotations
    callout_circle(d, (mx + mw - 60, my + 244), 4)
    arrow(d, (mx + mw - 80, my + 244), (mx + mw - 30, my + 244))
    callout_circle(d, (mx + mw - 60, my + 514), 5)
    arrow(d, (mx + mw - 80, my + 514), (mx + mw - 30, my + 514))
    callout_circle(d, (mx + mw + 30, my + mh - 46), 6)
    arrow(d, (mx + mw + 12, my + mh - 46), (mx + mw - 32, my + mh - 46))

    img.save(f"{OUT}/03_add_phone_dialog.png")


# ----------------------------------------------------------------------------
# Mock 4 — API Setup page after the number is verified (where the IDs live)
# ----------------------------------------------------------------------------
def mock_api_setup():
    W, H = 1400, 900
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H,
                   "https://developers.facebook.com/apps/1872775433439200/whatsapp-business/wa-dev-console")

    d.text((40, 72), "GravityStretchingAP", fill=INK, font=F_B(22))
    d.text((40, 100), "App ID: 1872775433439200", fill=MUTED, font=F_T(13))

    # Left rail
    rail = ["Dashboard", "Settings", "App Roles", "WhatsApp"]
    y = 140
    for r in rail:
        active = r == "WhatsApp"
        d.text((40, y), ("●  " if active else "○  ") + r,
               fill=META_BLUE if active else INK, font=F_B(14) if active else F_T(14))
        y += 30

    # Sub-rail under WhatsApp
    d.text((60, 240), "  ↳ API Setup", fill=BRAND, font=F_B(13))
    d.text((60, 268), "  ↳ Quickstart", fill=MUTED, font=F_T(13))
    d.text((60, 296), "  ↳ Configuration", fill=MUTED, font=F_T(13))

    # Main card
    rounded_rect(d, (240, 140, W - 40, H - 60), 14, fill=BG, outline=LINE, w=1)
    d.text((264, 168), "API Setup", fill=INK, font=F_B(24))
    d.text((264, 204),
           "Use these credentials to send messages via the Cloud API.",
           fill=MUTED, font=F_T(14))

    # Section: Temporary access token (red callout — DON'T use this)
    rounded_rect(d, (264, 240, W - 64, 320), 10, fill=WHITE, outline=LINE, w=1)
    d.text((286, 256), "Temporary access token", fill=INK, font=F_B(15))
    d.text((286, 280), "EAAanR4J0RZBABRi50zZBdBKEBuD6ZBPmHm87Vw…  (expires in 23h)",
           fill=MUTED, font=F_T(13))
    d.text((286, 300), "⚠  Don't use — generate a Permanent System User token instead.",
           fill=CALLOUT, font=F_B(13))

    # Section: From / Phone number ID
    rounded_rect(d, (264, 340, W - 64, 420), 10, fill=WHITE, outline=LINE, w=1)
    d.text((286, 356), "From (Phone number)", fill=INK, font=F_B(15))
    d.text((286, 380), "+62 8123456789", fill=INK, font=F_T(14))
    d.text((286, 402), "Phone number ID:  1567283746829999", fill=INK, font=F_B(14))
    callout_circle(d, (820, 410), 7)

    # Section: WABA ID
    rounded_rect(d, (264, 440, W - 64, 510), 10, fill=WHITE, outline=LINE, w=1)
    d.text((286, 456), "WhatsApp Business Account ID (WABA ID)", fill=INK, font=F_B(15))
    d.text((286, 480), "1571637721180000", fill=INK, font=F_B(14))
    callout_circle(d, (560, 488), 8)

    # Section: App ID
    rounded_rect(d, (264, 530, W - 64, 600), 10, fill=WHITE, outline=LINE, w=1)
    d.text((286, 546), "App ID", fill=INK, font=F_B(15))
    d.text((286, 570), "1872775433439200", fill=INK, font=F_B(14))

    # System user token CTA
    rounded_rect(d, (264, 640, W - 64, 740), 10, fill=(225, 240, 235), outline=BRAND, w=2)
    d.text((286, 658), "Permanent token (System User)", fill=BRAND, font=F_B(16))
    d.text((286, 686),
           "Business Settings → Users → System Users → Add → Admin →",
           fill=INK, font=F_T(14))
    d.text((286, 708),
           "Generate New Token → Permissions: whatsapp_business_messaging,",
           fill=INK, font=F_T(14))
    d.text((286, 728),
           "whatsapp_business_management → Expiration: Never",
           fill=INK, font=F_T(14))
    callout_circle(d, (1020, 690), 9)

    img.save(f"{OUT}/04_api_setup.png")


# ----------------------------------------------------------------------------
# Mock 5 — System User token generator
# ----------------------------------------------------------------------------
def mock_system_user():
    W, H = 1400, 900
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H, "https://business.facebook.com/settings/system-users/")

    d.text((40, 72), "Business Settings", fill=INK, font=F_B(24))
    # Left rail
    rail = [("Business info", False), ("Users", False),
            ("  ↳ People", False), ("  ↳ Partners", False),
            ("  ↳ System Users", True),
            ("Accounts", False), ("Data sources", False), ("Integrations", False)]
    y = 130
    for label, active in rail:
        rounded_rect(d, (24, y - 4, 270, y + 24), 6,
                     fill=(225, 240, 235) if active else WHITE)
        d.text((40, y), label, fill=BRAND if active else INK,
               font=F_B(13) if active else F_T(13))
        y += 32

    # Main
    rounded_rect(d, (300, 130, W - 40, H - 60), 14, fill=WHITE, outline=LINE, w=1)
    d.text((324, 152), "System Users", fill=INK, font=F_B(22))
    d.text((324, 184), "Programmatic access to your business assets.",
           fill=MUTED, font=F_T(14))

    # Existing user row
    rounded_rect(d, (324, 230, W - 64, 310), 10, fill=BG, outline=LINE, w=1)
    d.ellipse((344, 246, 392, 294), fill=BRAND)
    d.text((354, 260), "BG", fill=WHITE, font=F_B(18))
    d.text((410, 252), "bookgravity-backend", fill=INK, font=F_B(16))
    d.text((410, 278), "Admin  •  GravityStretchingAP  •  WhatsApp Account",
           fill=MUTED, font=F_T(13))

    # Generate new token button
    rounded_rect(d, (W - 280, 252, W - 80, 290), 8, fill=BRAND)
    d.text((W - 264, 260), "Generate New Token", fill=WHITE, font=F_B(14))
    callout_circle(d, (W - 304, 270), 10)
    arrow(d, (W - 288, 270), (W - 250, 270))

    # Token dialog overlay
    mx, my, mw, mh = 380, 360, 760, 470
    rounded_rect(d, (mx, my, mx + mw, my + mh), 14, fill=WHITE, outline=LINE, w=2)
    d.text((mx + 24, my + 24), "Generate new token", fill=INK, font=F_B(20))

    d.text((mx + 24, my + 80), "App", fill=INK, font=F_B(13))
    rounded_rect(d, (mx + 24, my + 100, mx + mw - 24, my + 138), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 36, my + 110), "GravityStretchingAP", fill=INK, font=F_T(14))

    d.text((mx + 24, my + 152), "Token expiration", fill=INK, font=F_B(13))
    rounded_rect(d, (mx + 24, my + 172, mx + mw - 24, my + 210), 8,
                 fill=WHITE, outline=LINE, w=1)
    d.text((mx + 36, my + 182), "Never", fill=INK, font=F_B(14))
    callout_circle(d, (mx + mw - 50, my + 192), 11)

    d.text((mx + 24, my + 230), "Available Permissions", fill=INK, font=F_B(13))
    # checkboxes
    perms = [
        ("whatsapp_business_messaging", True),
        ("whatsapp_business_management", True),
        ("business_management", False),
        ("ads_management", False),
    ]
    yy = my + 256
    for p, on in perms:
        if on:
            rounded_rect(d, (mx + 26, yy, mx + 42, yy + 16), 3, fill=BRAND)
            d.text((mx + 28, yy - 2), "✓", fill=WHITE, font=F_B(14))
        else:
            rounded_rect(d, (mx + 26, yy, mx + 42, yy + 16), 3,
                         fill=WHITE, outline=LINE, w=1)
        d.text((mx + 54, yy - 1), p, fill=INK if on else MUTED, font=F_T(14))
        yy += 24
    callout_circle(d, (mx + mw - 40, my + 268), 12)

    # Generate button
    rounded_rect(d, (mx + 24, my + mh - 60, mx + mw - 24, my + mh - 24), 10, fill=BRAND)
    d.text((mx + mw // 2 - 50, my + mh - 50), "Generate token", fill=WHITE, font=F_B(15))

    img.save(f"{OUT}/05_system_user_token.png")


# ----------------------------------------------------------------------------
# Mock 6 — bookgravity /sadmin list (super-admin)
# ----------------------------------------------------------------------------
def mock_sadmin_list():
    W, H = 1400, 900
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H, "https://bookgravity.com/sadmin")

    # Top bar
    rounded_rect(d, (0, 44, W, 96), 0, fill=WHITE)
    d.line((0, 96, W, 96), fill=LINE, width=1)
    d.text((40, 60), "BookGravity", fill=BRAND, font=F_B(20))
    d.text((40, 80), "Super Admin", fill=MUTED, font=F_T(12))
    rounded_rect(d, (W - 140, 56, W - 40, 88), 8, fill=BG, outline=LINE, w=1)
    d.text((W - 122, 64), "Sign out", fill=INK, font=F_T(13))

    # Page header
    d.text((40, 130), "Studios", fill=INK, font=F_B(28))
    d.text((40, 166), "All bookgravity studios. Connect / disconnect WhatsApp here.",
           fill=MUTED, font=F_T(14))

    # New studio button
    rounded_rect(d, (W - 200, 140, W - 40, 178), 10, fill=BRAND)
    d.text((W - 180, 150), "+ New studio", fill=WHITE, font=F_B(15))

    # Studio cards
    cards = [
        ("Gravity Stretching Canggu", "canggu",
         "+62 821-3130-468", "Connected", True),
        ("Gravity Stretching Ubud", "ubud",
         "—", "Not connected", False),
        ("Gravity Stretching Bali (new)", "bali",
         "—", "Not connected", False),
    ]
    y = 210
    for name, slug, phone, status, on in cards:
        rounded_rect(d, (40, y, W - 40, y + 140), 14,
                     fill=WHITE, outline=LINE, w=1)
        # Color stripe
        rounded_rect(d, (40, y, 56, y + 140), 14,
                     fill=BRAND if on else LINE)

        d.text((80, y + 24), name, fill=INK, font=F_B(18))
        d.text((80, y + 52), f"bookgravity.com/{slug}", fill=MUTED, font=F_T(13))

        # WhatsApp pill
        pill_color = WA_GREEN if on else MUTED
        pill_bg = (225, 250, 235) if on else (235, 235, 235)
        rounded_rect(d, (80, y + 80, 300, y + 110), 14, fill=pill_bg)
        d.text((96, y + 86), f"💬  {status}", fill=pill_color, font=F_B(13))
        d.text((320, y + 86), phone, fill=INK if on else MUTED, font=F_T(13))

        # Connect WhatsApp button on the right
        btn_label = "Manage" if on else "Connect WhatsApp"
        btn_w = 200
        rounded_rect(d, (W - 60 - btn_w, y + 80, W - 60, y + 116), 10,
                     fill=BRAND if not on else WHITE,
                     outline=BRAND if on else None, w=2 if on else 0)
        d.text((W - 60 - btn_w + 28, y + 88), btn_label,
               fill=WHITE if not on else BRAND, font=F_B(14))

        # Annotation: highlight 'Connect WhatsApp' on Bali row
        if name.endswith("(new)"):
            callout_circle(d, (W - 60 - btn_w - 22, y + 98), 13)
            arrow(d, (W - 60 - btn_w - 6, y + 98), (W - 60 - btn_w + 14, y + 98))

        y += 160

    img.save(f"{OUT}/06_sadmin_list.png")


# ----------------------------------------------------------------------------
# Mock 7 — WhatsApp connect modal in /sadmin
# ----------------------------------------------------------------------------
def mock_sadmin_connect_modal():
    W, H = 1400, 900
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H, "https://bookgravity.com/sadmin")

    # Greyed backdrop
    d.rectangle((0, 44, W, H), fill=(0, 0, 0))
    overlay = Image.new("RGBA", (W, H - 44), (0, 0, 0, 140))
    img.paste(overlay, (0, 44), overlay)
    d = ImageDraw.Draw(img)  # refresh after paste

    # Modal
    mx, my, mw, mh = 290, 80, 820, 760
    rounded_rect(d, (mx, my, mx + mw, my + mh), 16, fill=WHITE)
    d.text((mx + 32, my + 28),
           "WhatsApp — Gravity Stretching Bali", fill=INK, font=F_B(22))
    # Sub box info
    rounded_rect(d, (mx + 32, my + 78, mx + mw - 32, my + 134), 10,
                 fill=(225, 235, 252), outline=(186, 214, 252), w=1)
    d.text((mx + 48, my + 90),
           "One-click Facebook flow: coming next — requires a configured",
           fill=(28, 67, 134), font=F_T(13))
    d.text((mx + 48, my + 110),
           "Meta App. For now, paste credentials manually from WhatsApp Manager.",
           fill=(28, 67, 134), font=F_T(13))

    # Field 1 — Phone Number ID
    d.text((mx + 32, my + 158), "Phone Number ID", fill=INK, font=F_B(14))
    d.text((mx + 32, my + 178),
           "WhatsApp Manager → API setup → Phone number ID",
           fill=MUTED, font=F_T(12))
    rounded_rect(d, (mx + 32, my + 198, mx + mw - 32, my + 240), 10,
                 fill=WHITE, outline=LINE, w=2)
    d.text((mx + 48, my + 210), "1567283746829999", fill=INK, font=F_B(14))
    callout_circle(d, (mx + mw - 28, my + 219), 14)

    # Field 2 — Token
    d.text((mx + 32, my + 264), "System User Access Token",
           fill=INK, font=F_B(14))
    d.text((mx + 32, my + 284),
           "Permanent token with whatsapp_business_messaging + management scopes",
           fill=MUTED, font=F_T(12))
    rounded_rect(d, (mx + 32, my + 304, mx + mw - 32, my + 346), 10,
                 fill=WHITE, outline=LINE, w=2)
    d.text((mx + 48, my + 316), "•••••••••••••••••••••••••••••••••••••••",
           fill=INK, font=F_T(14))
    callout_circle(d, (mx + mw - 28, my + 325), 15)

    # Field 3 — WABA ID
    d.text((mx + 32, my + 372), "WABA ID", fill=INK, font=F_B(14))
    d.text((mx + 32, my + 392),
           "WhatsApp Business Account ID (optional — used by webhook router)",
           fill=MUTED, font=F_T(12))
    rounded_rect(d, (mx + 32, my + 412, mx + mw - 32, my + 454), 10,
                 fill=WHITE, outline=LINE, w=2)
    d.text((mx + 48, my + 424), "1571637721180000", fill=INK, font=F_T(14))

    # Field 4 — display phone
    d.text((mx + 32, my + 480), "Display phone", fill=INK, font=F_B(14))
    d.text((mx + 32, my + 500),
           "Shown to admins. E.g. +62 …", fill=MUTED, font=F_T(12))
    rounded_rect(d, (mx + 32, my + 520, mx + mw - 32, my + 562), 10,
                 fill=WHITE, outline=LINE, w=2)
    d.text((mx + 48, my + 532), "+62 8123456789", fill=INK, font=F_T(14))

    # Enable now switch
    d.text((mx + 32, my + 590), "Enable for clients now", fill=INK, font=F_B(14))
    rounded_rect(d, (mx + 260, my + 588, mx + 320, my + 614), 13, fill=BRAND)
    d.ellipse((mx + 296, my + 590, mx + 318, my + 612), fill=WHITE)
    callout_circle(d, (mx + 350, my + 600), 16)

    # Buttons
    rounded_rect(d, (mx + 32, my + mh - 70, mx + mw // 2 - 8, my + mh - 24),
                 10, fill=WHITE, outline=LINE, w=2)
    d.text((mx + mw // 4 - 24, my + mh - 56), "Cancel", fill=INK, font=F_B(14))
    rounded_rect(d, (mx + mw // 2 + 8, my + mh - 70, mx + mw - 32, my + mh - 24),
                 10, fill=BRAND)
    d.text((mx + mw * 3 // 4 - 32, my + mh - 56), "Save",
           fill=WHITE, font=F_B(15))
    callout_circle(d, (mx + mw - 18, my + mh - 46), 17)

    img.save(f"{OUT}/07_sadmin_connect_modal.png")


# ----------------------------------------------------------------------------
# Mock 8 — Saved / connected state with green checkmark
# ----------------------------------------------------------------------------
def mock_sadmin_connected():
    W, H = 1400, 700
    img, d = new_canvas(W, H, WHITE)
    browser_chrome(d, W, H, "https://bookgravity.com/sadmin")

    d.text((40, 80), "Studios", fill=INK, font=F_B(26))

    # Bali card (now connected)
    y = 140
    rounded_rect(d, (40, y, W - 40, y + 160), 14,
                 fill=WHITE, outline=BRAND, w=2)
    rounded_rect(d, (40, y, 56, y + 160), 14, fill=BRAND)

    d.text((80, y + 24), "Gravity Stretching Bali", fill=INK, font=F_B(20))
    d.text((80, y + 56), "bookgravity.com/bali", fill=MUTED, font=F_T(13))

    rounded_rect(d, (80, y + 90, 280, y + 122), 16, fill=(225, 250, 235))
    d.text((100, y + 96), "💬  Connected ✓", fill=WA_GREEN, font=F_B(14))
    d.text((300, y + 96), "+62 8123456789  •  GREEN quality",
           fill=INK, font=F_T(13))

    # Open admin button
    rounded_rect(d, (W - 280, y + 90, W - 60, y + 122), 10, fill=BRAND)
    d.text((W - 252, y + 98), "Open admin →", fill=WHITE, font=F_B(14))

    # Big success banner
    by = y + 200
    rounded_rect(d, (40, by, W - 40, by + 120), 14,
                 fill=(225, 250, 235), outline=BRAND, w=2)
    d.ellipse((68, by + 36, 112, by + 80), fill=BRAND)
    d.text((78, by + 42), "✓", fill=WHITE, font=F_B(26))
    d.text((140, by + 32), "WhatsApp connected!", fill=BRAND, font=F_B(20))
    d.text((140, by + 64),
           "Templates auto-imported from your Canggu account. New bookings will send",
           fill=INK, font=F_T(14))
    d.text((140, by + 84),
           "WhatsApp confirmations to clients and notifications to trainers.",
           fill=INK, font=F_T(14))

    img.save(f"{OUT}/08_sadmin_connected.png")


# Run all
mock_business_home()
mock_wa_manager_phones()
mock_add_phone_dialog()
mock_api_setup()
mock_system_user()
mock_sadmin_list()
mock_sadmin_connect_modal()
mock_sadmin_connected()
print("Mocks generated to", OUT)
