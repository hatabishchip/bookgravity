"""Assemble the WhatsApp connection guide into a polished PDF.

Layout:
  • Cover page with brand colors
  • What you'll need
  • Time estimate
  • Phase 1: Facebook (steps 1-12)
  • Phase 2: bookgravity (steps 13-17)
  • Sanity check + troubleshooting
  • Glossary
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate,
    Paragraph, Spacer, Image, PageBreak, KeepTogether, Table, TableStyle,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

OUT_PDF = "/tmp/wa-guide/WhatsApp-Connect-Guide.pdf"
IMG = "/tmp/wa-guide/img"

# Brand
BRAND = HexColor("#2C6E49")
BRAND_DARK = HexColor("#1E4D34")
INK = HexColor("#18181B")
MUTED = HexColor("#6B7280")
LINE = HexColor("#E5E7EB")
BG = HexColor("#F9FAFB")
CARD_BG = HexColor("#F3F4F6")
CALLOUT_BG = HexColor("#FEE2E2")
CALLOUT_BORDER = HexColor("#DC2626")
TIP_BG = HexColor("#ECFDF5")
TIP_BORDER = HexColor("#10B981")
WARN_BG = HexColor("#FFF7ED")
WARN_BORDER = HexColor("#F59E0B")

# Register a Cyrillic-capable font. macOS has the Apple SD Gothic, but
# DejaVu Sans is the most reliable cross-platform Cyrillic. Bundled with
# matplotlib usually; fall back to Helvetica.
FONT = "Helvetica"
FONT_B = "Helvetica-Bold"
for candidate, name in [
    ("/Library/Fonts/Arial Unicode.ttf", "ArialU"),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "ArialU"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu"),
    ("/Library/Fonts/Arial.ttf", "ArialReg"),
]:
    if os.path.exists(candidate):
        try:
            pdfmetrics.registerFont(TTFont(name, candidate))
            FONT = name
            # Try to find the matching bold
            bold_candidates = [
                candidate.replace(".ttf", " Bold.ttf"),
                candidate.replace(".ttf", "-Bold.ttf"),
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/Library/Fonts/Arial Bold.ttf",
            ]
            for bc in bold_candidates:
                if os.path.exists(bc):
                    pdfmetrics.registerFont(TTFont(name + "-B", bc))
                    FONT_B = name + "-B"
                    break
            else:
                FONT_B = name
            break
        except Exception:
            continue

# ---------- Styles ----------
ss = getSampleStyleSheet()

H1 = ParagraphStyle("H1", parent=ss["Heading1"],
                    fontName=FONT_B, fontSize=24, leading=30,
                    textColor=INK, spaceBefore=4, spaceAfter=8)
H2 = ParagraphStyle("H2", parent=ss["Heading2"],
                    fontName=FONT_B, fontSize=18, leading=24,
                    textColor=BRAND, spaceBefore=16, spaceAfter=8)
H3 = ParagraphStyle("H3", parent=ss["Heading3"],
                    fontName=FONT_B, fontSize=14, leading=20,
                    textColor=INK, spaceBefore=12, spaceAfter=4)
BODY = ParagraphStyle("Body", parent=ss["BodyText"],
                      fontName=FONT, fontSize=11, leading=16,
                      textColor=INK, spaceAfter=6)
LEAD = ParagraphStyle("Lead", parent=BODY,
                      fontSize=12, leading=18, textColor=MUTED, spaceAfter=10)
CAPTION = ParagraphStyle("Caption", parent=BODY,
                         fontSize=9, leading=12, textColor=MUTED,
                         alignment=TA_CENTER, spaceBefore=4, spaceAfter=14)
STEP_NUM = ParagraphStyle("StepNum", parent=BODY,
                          fontName=FONT_B, fontSize=16, leading=20,
                          textColor=white)
STEP_TITLE = ParagraphStyle("StepTitle", parent=BODY,
                            fontName=FONT_B, fontSize=15, leading=20,
                            textColor=INK)
PILL = ParagraphStyle("Pill", parent=BODY, fontName=FONT_B, fontSize=10,
                      textColor=white, alignment=TA_CENTER)
COVER_TITLE = ParagraphStyle("CoverTitle", parent=ss["Title"],
                             fontName=FONT_B, fontSize=44, leading=52,
                             textColor=white, alignment=TA_CENTER)
COVER_SUB = ParagraphStyle("CoverSub", parent=BODY,
                           fontName=FONT, fontSize=18, leading=24,
                           textColor=white, alignment=TA_CENTER, spaceBefore=12)
COVER_CTA = ParagraphStyle("CoverCTA", parent=BODY,
                           fontName=FONT_B, fontSize=14, leading=18,
                           textColor=BRAND, alignment=TA_CENTER)

# ---------- Page templates ----------
def draw_cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BRAND)
    canvas.rect(0, 0, doc.pagesize[0], doc.pagesize[1], fill=1, stroke=0)
    # decorative leaf circles in the corners
    canvas.setFillColor(BRAND_DARK)
    canvas.circle(0, doc.pagesize[1], 180, fill=1, stroke=0)
    canvas.circle(doc.pagesize[0], 0, 220, fill=1, stroke=0)
    canvas.restoreState()


def draw_page_chrome(canvas, doc):
    canvas.saveState()
    w, h = doc.pagesize
    # Top bar
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 30, w, 30, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont(FONT_B, 10)
    canvas.drawString(20 * mm, h - 20, "BookGravity • WhatsApp connection guide")
    canvas.drawRightString(w - 20 * mm, h - 20, f"Page {doc.page}")
    # bottom rule
    canvas.setStrokeColor(LINE)
    canvas.line(20 * mm, 14 * mm, w - 20 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 8)
    canvas.drawString(20 * mm, 10 * mm, "Internal — owner-only")
    canvas.drawRightString(w - 20 * mm, 10 * mm, "v1.0 • Aleksandr Diachuk")
    canvas.restoreState()


# ---------- Builders ----------
def step_block(num, title, body_paragraphs, image_path=None, caption=None,
               kind="step"):
    """One numbered step: green circle with number + title + body + image."""
    # Build header row
    color = BRAND if kind == "step" else WARN_BORDER if kind == "warn" else TIP_BORDER
    num_cell = Table([[Paragraph(str(num), STEP_NUM)]],
                     colWidths=[12 * mm], rowHeights=[12 * mm])
    num_cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("BOX", (0, 0), (-1, -1), 0, white),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))

    header = Table([[num_cell, Paragraph(title, STEP_TITLE)]],
                   colWidths=[18 * mm, 152 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    flow = [header, Spacer(1, 6)]
    for p in body_paragraphs:
        flow.append(Paragraph(p, BODY))
    if image_path:
        img = Image(image_path, width=170 * mm, height=170 * mm * 9 / 14)
        flow.append(Spacer(1, 4))
        flow.append(img)
        if caption:
            flow.append(Paragraph(caption, CAPTION))

    return flow if image_path else [KeepTogether(flow)]


def note_box(text, kind="tip"):
    """A coloured callout box."""
    bg = TIP_BG if kind == "tip" else WARN_BG if kind == "warn" else CALLOUT_BG
    border = TIP_BORDER if kind == "tip" else WARN_BORDER if kind == "warn" else CALLOUT_BORDER
    icon = "TIP" if kind == "tip" else "NOTE" if kind == "warn" else "STOP"
    style = ParagraphStyle("note", parent=BODY, fontSize=10,
                           leading=14, leftIndent=0)
    p = Paragraph(f"<b>{icon}</b>  {text}", style)
    t = Table([[p]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def kv_table(rows, head_color=BRAND):
    """Two-column data table: label | value."""
    data = []
    for k, v in rows:
        data.append([
            Paragraph(f"<b>{k}</b>", ParagraphStyle("k", parent=BODY, fontSize=10,
                                                    textColor=INK)),
            Paragraph(v, ParagraphStyle("v", parent=BODY, fontSize=10,
                                         textColor=INK, fontName=FONT))
        ])
    t = Table(data, colWidths=[55 * mm, 115 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), CARD_BG),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, -1), 0.5, LINE),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


# ---------- Document setup ----------
doc = BaseDocTemplate(OUT_PDF, pagesize=A4,
                      leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=20 * mm, bottomMargin=20 * mm,
                      title="Connecting WhatsApp to a Gravity Stretching studio",
                      author="Aleksandr Diachuk")

frame_cover = Frame(0, 0, A4[0], A4[1], showBoundary=0,
                    leftPadding=0, rightPadding=0,
                    topPadding=80 * mm, bottomPadding=0)
frame_main = Frame(doc.leftMargin, doc.bottomMargin,
                   doc.width, doc.height - 16 * mm,
                   leftPadding=0, rightPadding=0,
                   topPadding=0, bottomPadding=0)
doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[frame_cover], onPage=draw_cover_bg),
    PageTemplate(id="Main", frames=[frame_main], onPage=draw_page_chrome),
])

story = []

# ---------- Cover page ----------
story.append(Paragraph("WhatsApp", COVER_TITLE))
story.append(Paragraph("connection guide", COVER_TITLE))
story.append(Spacer(1, 18))
story.append(Paragraph("Step-by-step manual for opening a new",
                       COVER_SUB))
story.append(Paragraph("Gravity Stretching studio in the WhatsApp inbox",
                       COVER_SUB))
story.append(Spacer(1, 60))
# white CTA pill
cta = Paragraph("17 steps  •  ≈ 60 minutes  •  Read once, repeat for every studio",
                COVER_CTA)
box = Table([[cta]], colWidths=[140 * mm])
box.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), white),
    ("LEFTPADDING", (0, 0), (-1, -1), 16),
    ("RIGHTPADDING", (0, 0), (-1, -1), 16),
    ("TOPPADDING", (0, 0), (-1, -1), 14),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ("ROUNDEDCORNERS", [12, 12, 12, 12]),
]))
story.append(box)
story.append(NextPageTemplate("Main"))
story.append(PageBreak())

# ---------- TOC / What you'll need ----------
story.append(Paragraph("Before you start", H1))
story.append(Paragraph(
    "This guide walks you through plugging a brand-new phone number into your bookgravity studio "
    "so that booking confirmations and the inbox start working. The process touches two systems: "
    "<b>Meta</b> (Facebook Business Manager) and <b>bookgravity.com</b>. Roughly an hour, mostly "
    "waiting for SMS verification.",
    LEAD,
))
story.append(Spacer(1, 6))

story.append(Paragraph("What you need on hand", H2))
story.append(kv_table([
    ("Phone number", "Brand-new SIM (not registered in WhatsApp/WhatsApp Business app). "
                     "If it was registered, delete the account first in the WhatsApp app."),
    ("Facebook account", "Logged into business.facebook.com with admin access to "
                         "your existing GravityStretching business."),
    ("Studio email + name", "What the new studio will be called publicly, e.g. "
                            "&quot;Gravity Stretching Bali&quot;."),
    ("Meta payment method", "Already added when you set up Canggu — reused automatically."),
    ("Access to bookgravity.com", "Super-admin account (the one you log into /sadmin with)."),
]))
story.append(Spacer(1, 10))

story.append(Paragraph("How the parts fit together", H2))
story.append(Paragraph(
    "Meta needs four pieces of data about your phone — <b>Phone Number ID</b>, <b>WABA ID</b>, "
    "<b>System User Token</b>, and the <b>display phone</b>. You'll copy these into bookgravity's "
    "<i>super-admin → Studios → Connect WhatsApp</i> dialog. After save, every booking made on the "
    "new studio's URL fires WhatsApp confirmations and shows up in the inbox automatically.",
    BODY,
))
story.append(note_box(
    "Don't reuse the +62 821-3130-468 number from Canggu — Meta forbids one number per WABA. "
    "Each studio needs its own SIM.",
    kind="warn",
))
story.append(PageBreak())

# ---------- PHASE 1 ----------
story.append(Paragraph("Phase 1 — Facebook (Meta) setup", H1))
story.append(Paragraph(
    "Most of this happens once per studio. Aim to finish without "
    "switching tabs — the IDs are easiest to copy in one sitting.",
    LEAD,
))

story += step_block(
    1, "Open Meta Business Suite",
    [
        "Go to <b><font color='#2C6E49'>business.facebook.com</font></b> and "
        "make sure you're signed in with the account that owns your existing "
        "<i>GravityStretching</i> business.",
        "On the left rail, click the <b>WhatsApp Manager</b> entry. If you don't see it, "
        "open <b>All tools</b> and pin it.",
    ],
    image_path=f"{IMG}/01_business_home.png",
    caption="① Sign in with the right account → ② Click WhatsApp Manager",
)

story += step_block(
    2, "Open the Phone numbers tab",
    [
        "Inside WhatsApp Manager, click the <b>Phone numbers</b> tab at the top.",
        "Your existing <b>+62 821-3130-468</b> for Canggu shows up as <i>Connected</i>. "
        "We're adding a second row next to it.",
        "Click the green <b>+ Add phone number</b> button in the top-right corner.",
    ],
    image_path=f"{IMG}/02_wa_manager_phones.png",
    caption="③ Click +Add phone number",
)

story += step_block(
    3, "Fill in the new phone details + send SMS code",
    [
        "<b>Business display name</b> — what your clients see as the sender. "
        "Use the studio's public name, e.g. &quot;Gravity Stretching Bali&quot;.",
        "<b>Category</b> — pick <i>Wellness</i> (or Health &amp; medical, both work).",
        "<b>Phone number</b> — pick country code (🇮🇩 +62) and type the new SIM number.",
        "<b>Verify via</b> — leave <b>SMS</b> selected. Voice call works too if SMS fails.",
        "Click <b>Send code</b>. Meta SMS-es you a 6-digit code within ~30 seconds.",
    ],
    image_path=f"{IMG}/03_add_phone_dialog.png",
    caption="④ Display name  ⑤ Phone number  ⑥ Send code",
)
story.append(note_box(
    "If the SIM is already used in WhatsApp app: open WhatsApp on the phone → "
    "Settings → Account → <b>Delete my account</b>. Wait 5 minutes, then try again here.",
    kind="warn",
))
story.append(PageBreak())

story += step_block(
    4, "Enter the SMS code → number is now connected",
    [
        "Type the 6 digits Meta sent you. The dialog flips to <b>Verified</b> with "
        "a green checkmark.",
        "Click <b>Done</b>. You land back on the Phone numbers list — the new row "
        "shows <i>Connected</i> with a grey <b>UNKNOWN</b> quality badge.",
        "The quality goes <i>GREEN</i> automatically after a few days of real "
        "traffic. Don't worry about it for now.",
    ],
)
story.append(note_box(
    "Quality stays UNKNOWN until you've sent a couple of dozen messages without "
    "users blocking the number. Doesn't block anything — it's a reputation gauge.",
    kind="tip",
))

story += step_block(
    5, "Open API Setup to grab your IDs",
    [
        "Switch to the developer console: go to "
        "<b><font color='#2C6E49'>developers.facebook.com</font></b> → "
        "<b>My Apps</b> → click <b>GravityStretchingAP</b> (the app you set up "
        "for Canggu — we reuse it for every studio).",
        "In the left rail click <b>WhatsApp</b> → <b>API Setup</b>. ",
        "In the <i>From</i> dropdown pick the new phone number you just added.",
        "Copy the long number under <b>Phone number ID</b> — that's the one we need.",
    ],
    image_path=f"{IMG}/04_api_setup.png",
    caption="⑦ Phone number ID  ⑧ WABA ID  ⑨ Permanent token path",
)
story.append(note_box(
    "<b>Don't use the temporary access token</b> shown at the top of this page — it "
    "expires every 23 hours and will break your studio's WhatsApp every day. "
    "The next steps create a permanent token instead.",
    kind="callout",
))
story.append(PageBreak())

story += step_block(
    6, "Copy the WABA ID and App ID",
    [
        "Still on the API Setup page, scroll a tiny bit. Two more numbers to copy:",
        "<b>WhatsApp Business Account ID</b> (WABA ID) — same for all studios under "
        "this business. It's <b>1571637721180000</b> for GravityStretchingСanggu — "
        "ALL your studios share this number because they share the WABA.",
        "<b>App ID</b> — <b>1872775433439200</b>. Also shared.",
    ],
)
story.append(note_box(
    "Quick reminder: <b>WABA ID and App ID are the SAME for every studio.</b> "
    "Only the Phone Number ID changes between studios. Saves a lot of clicking.",
    kind="tip",
))

story += step_block(
    7, "Open Business Settings → System Users",
    [
        "Click your profile picture top-right → <b>Business Settings</b>.",
        "In the left rail: <b>Users → System Users</b>.",
        "Find the existing <b>bookgravity-backend</b> user (Admin role). "
        "If it doesn't exist for some reason, click <b>Add</b> and create one "
        "with name <i>bookgravity-backend</i> and role <i>Admin</i>.",
        "Click <b>Generate New Token</b> on its row.",
    ],
    image_path=f"{IMG}/05_system_user_token.png",
    caption="⑩ Generate New Token  ⑪ Expiration: Never  ⑫ Both whatsapp permissions",
)
story.append(PageBreak())

story += step_block(
    8, "Generate a permanent token",
    [
        "In the popup:",
        "&nbsp;&nbsp;&nbsp;&nbsp;<b>App</b> — pick <b>GravityStretchingAP</b>.",
        "&nbsp;&nbsp;&nbsp;&nbsp;<b>Token expiration</b> — <b>Never</b> (this is the whole point).",
        "&nbsp;&nbsp;&nbsp;&nbsp;<b>Available Permissions</b> — check exactly two boxes:",
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;✓ <b>whatsapp_business_messaging</b>",
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;✓ <b>whatsapp_business_management</b>",
        "&nbsp;&nbsp;&nbsp;&nbsp;Don't tick anything else — least-privilege.",
        "Click <b>Generate token</b>. Meta shows the token <i>once</i> — copy it "
        "immediately. It looks like <b>EAAa….</b> and is ~200 characters long.",
    ],
)
story.append(note_box(
    "Save the token to your password manager right away. If you close the popup "
    "without copying it, you can regenerate freely — no harm done, but it's "
    "annoying.",
    kind="warn",
))

# Now bridge to Phase 2 with the credentials summary
story.append(Paragraph("Stop and collect your data", H2))
story.append(Paragraph(
    "Before moving to bookgravity, double-check you have the four values below. "
    "If anything is missing, go back — don't proceed without them.",
    BODY,
))
story.append(kv_table([
    ("Phone Number ID", "<font face='Courier'>1567283746829999</font> (NEW — copied from API Setup, step 5)"),
    ("WABA ID", "<font face='Courier'>1571637721180000</font> (shared — same as Canggu, step 6)"),
    ("Permanent Token", "<font face='Courier'>EAAa….</font> ~200 chars (NEW — generated in step 8)"),
    ("Display phone", "+62 8123456789 (the new number with country code, human-readable)"),
]))
story.append(PageBreak())

# ---------- PHASE 2 ----------
story.append(Paragraph("Phase 2 — bookgravity.com setup", H1))
story.append(Paragraph(
    "Now we glue the data into your super-admin panel. This takes 5 minutes.",
    LEAD,
))

story += step_block(
    9, "Sign in to /sadmin",
    [
        "Go to <b><font color='#2C6E49'>bookgravity.com/sadmin</font></b> and log in "
        "with your super-admin email + password.",
        "You see a list of all your studios — Canggu (Connected), Ubud, and any new "
        "studios you've created.",
        "If <b>Gravity Stretching Bali</b> isn't on the list yet, click <b>+ New "
        "studio</b> top-right, fill in name + slug + admin email, click <b>Create "
        "studio</b>. You'll get a 4-digit starter password — write it down.",
    ],
    image_path=f"{IMG}/06_sadmin_list.png",
    caption="⑬ Click 'Connect WhatsApp' on the new studio's row",
)

story += step_block(
    10, "Click 'Connect WhatsApp' on the new studio's row",
    [
        "The button is on the right side of the studio row, green pill.",
        "A modal pops up: <b>WhatsApp — Gravity Stretching [name]</b>. "
        "Four fields to fill in.",
    ],
    image_path=f"{IMG}/07_sadmin_connect_modal.png",
    caption="⑭ Phone Number ID  ⑮ Token  ⑯ Enable now  ⑰ Save",
)

story += step_block(
    11, "Paste the credentials",
    [
        "<b>Phone Number ID</b> — paste the long number from Meta API Setup (step 5).",
        "<b>System User Access Token</b> — paste the EAAa…. token (step 8). The field "
        "is type=password so it's masked; that's expected.",
        "<b>WABA ID</b> — paste the shared WABA ID (step 6).",
        "<b>Display phone</b> — type the human-friendly version, like "
        "<i>+62 8123456789</i>. This is what admins see in the inbox header.",
    ],
)

story += step_block(
    12, "Toggle 'Enable for clients now' → Save",
    [
        "Flip the <b>Enable for clients now</b> switch to ON (green).",
        "Click the green <b>Save</b> button.",
        "The dialog closes. The studio row now shows a green <b>Connected ✓</b> badge.",
    ],
    image_path=f"{IMG}/08_sadmin_connected.png",
    caption="The studio is live. Bookings on this URL now fire WhatsApp.",
)
story.append(PageBreak())

# ---------- Phase 3: Test ----------
story.append(Paragraph("Phase 3 — sanity check (2 minutes)", H1))

story += step_block(
    13, "Make a test booking on the public booking page",
    [
        "Open the studio's public URL: "
        "<b><font color='#2C6E49'>bookgravity.com/[slug]</font></b> (replace "
        "<i>[slug]</i> with the slug from step 9 — e.g. <i>bali</i>).",
        "Make a booking with your own phone number as the client. Pick any slot, any trainer.",
        "Click <b>Confirm</b>.",
        "Within 5 seconds you receive a WhatsApp from the new number to your phone — "
        "&quot;Hi [name], your booking is confirmed…&quot;. ✅",
    ],
)

story += step_block(
    14, "Check the trainer notification",
    [
        "The trainer assigned to that slot also gets a WhatsApp template message "
        "(if their <b>whatsapp</b> field is set in <i>/admin/trainers</i>).",
        "If they don't see it, the trainer probably has no WhatsApp number on file. "
        "Open the admin → Trainers → click pencil → fill it in.",
    ],
)

story += step_block(
    15, "Open the inbox and see the WhatsApp arrive in real time",
    [
        "Log in to the studio's regular admin: "
        "<b><font color='#2C6E49'>bookgravity.com/[slug]/admin</font></b> "
        "with the starter password from step 9.",
        "Look for the round green chat button bottom-right. Click it — the inbox opens.",
        "The system-sent booking confirmation is the first conversation. "
        "Reply to yourself from the WhatsApp app on your phone, and watch the message "
        "appear in the inbox within seconds.",
    ],
)

story.append(note_box(
    "Auto-translation kicks in automatically because new studios default to "
    "<b>inboxLanguage = ru</b>. If the test client writes in English, the inbox "
    "will show the Russian translation as the main bubble and the original "
    "English underneath in grey.",
    kind="tip",
))

# ---------- Troubleshooting ----------
story.append(Paragraph("Troubleshooting", H2))
story.append(kv_table([
    ("&quot;Phone number can&apos;t be added&quot;",
     "The SIM is still registered in the WhatsApp app. Delete the account inside the "
     "phone (Settings → Account → Delete) and wait 5 minutes."),
    ("SMS code never arrives",
     "Switch to <b>Voice call</b> in the dialog (step 3). Indonesian carriers sometimes "
     "drop Meta SMS."),
    ("Token expired after a day",
     "You picked a 24h token. Re-do step 8 with <b>Expiration: Never</b>."),
    ("Bookings made, but no WhatsApp message",
     "Check the booking row in <i>/admin/bookings</i> — the "
     "<b>waNotifyTrainerStatus</b> column shows <i>failed</i> with the reason. "
     "Common causes: bad Phone Number ID, token doesn't have "
     "<i>whatsapp_business_messaging</i> permission, Meta billing problem."),
    ("Templates rejected by Meta",
     "Open <a href='https://business.facebook.com/wa/manage/message-templates' "
     "color='#2C6E49'>Templates</a> in WhatsApp Manager. New studios under the same "
     "WABA inherit the already-approved <i>booking_confirmed_v2</i>, "
     "<i>trainer_booking_v3</i>, <i>admin_message</i>, etc. If a template shows "
     "<i>Rejected</i>, click it to see the reason."),
]))
story.append(PageBreak())

# ---------- Glossary ----------
story.append(Paragraph("Glossary", H1))
story.append(Paragraph("If anything in this guide felt opaque, here's the cheat sheet.", LEAD))
story.append(kv_table([
    ("WABA", "WhatsApp Business Account. A Meta object that owns one or more phone numbers. "
             "Every Gravity Stretching studio shares the same WABA."),
    ("Phone Number ID", "Numeric ID Meta assigns to each phone you connect. "
                        "This is what Cloud API sends/receives from. <b>Unique per studio.</b>"),
    ("App", "Your developer.facebook.com object. One app per business; you can connect many "
            "phones to it. We use <i>GravityStretchingAP</i> (App ID 1872775433439200) for all studios."),
    ("System User Token", "Permanent OAuth token tied to a System User (server-side bot). "
                          "Never expires. Stored encrypted in Studio.whatsappAccessToken in our DB."),
    ("24h customer-service window", "Meta's rule: free-form text only works if the client "
                                    "wrote to your number in the past 24h. Outside that window we "
                                    "fall back to approved templates."),
    ("Template", "A pre-approved message body with variables like <i>{{1}}</i>. Required for "
                 "outside-window messages. Approved templates: <i>booking_confirmed_v2</i>, "
                 "<i>trainer_booking_v3</i>, <i>admin_message</i>, <i>inbound_message_copy</i>."),
    ("inboxLanguage", "Per-studio admin language. When set (e.g. <i>ru</i>), inbound messages "
                      "get auto-translated. Set in /admin/settings → Inbox language."),
]))

story.append(Spacer(1, 20))
story.append(Paragraph("That's it. Repeat phases 1–3 for every new studio.",
                       ParagraphStyle("Tag", parent=BODY, fontSize=14,
                                      fontName=FONT_B, textColor=BRAND,
                                      alignment=TA_CENTER)))

doc.build(story)
print(f"PDF written to {OUT_PDF}")
print(f"Size: {os.path.getsize(OUT_PDF)//1024} KB")
