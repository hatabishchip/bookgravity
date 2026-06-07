"""Generate Russian mock screenshots that mirror the LIVE Facebook UI
captured via Chrome MCP from the owner's actual Meta business account.

What's accurate (verified live):
  • All Russian labels («Номера телефонов», «Шаблоны сообщений», «Создайте
    профиль WhatsApp Business», «Подключено», etc.)
  • The dark Meta UI theme
  • Layout of sidebar (Обзор, Шаблоны сообщений → Управление шаблонами /
    Библиотека шаблонов, Инструменты управления → Статистика / Лимиты /
    Сценарии / Номера телефонов / Каталог / Журнал действий)
  • The WhatsApp business switcher in the top-right ("GravityStretchingCanggu")
  • The actual existing Canggu number row and its "Высокое" quality rating
  • The "Создайте профиль" form fields (display name, category dropdown,
    description, character counter 0/512)
  • The blue "Добавить номер телефона" button
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/tmp/wa-guide/img_ru"
os.makedirs(OUT, exist_ok=True)

# Meta dark theme palette
META_DARK = (24, 25, 26)         # main bg
META_DARKER = (16, 17, 18)       # sidebar
META_PANEL = (36, 37, 38)        # cards
META_BORDER = (60, 61, 62)
META_TEXT = (228, 230, 235)
META_TEXT_MUTED = (179, 184, 189)
META_BLUE = (43, 132, 240)
META_BLUE_BRIGHT = (59, 137, 246)
WA_GREEN = (37, 211, 102)
WA_GREEN_BG = (15, 65, 50)
WA_GREEN_BG_LIGHT = (33, 90, 65)
WA_GREEN_LABEL = (88, 219, 138)
INPUT_BG = (40, 41, 42)
WHITE = (255, 255, 255)
RED_CALL = (255, 68, 68)
RED_CALL_BG = (66, 22, 22)


def _font(size, bold=False):
    candidates_b = [
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ] if bold else [
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for c in candidates_b:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


F_T = lambda s: _font(s, bold=False)
F_B = lambda s: _font(s, bold=True)


def new_canvas(w, h, bg=META_DARK):
    img = Image.new("RGB", (w, h), bg)
    return img, ImageDraw.Draw(img)


def rounded_rect(d, xy, r, fill, outline=None, w=1):
    d.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=w)


def callout_circle(d, xy, number, color=RED_CALL):
    x, y = xy
    r = 20
    d.ellipse((x - r, y - r, x + r, y + r), fill=color, outline=WHITE, width=3)
    f = F_B(22)
    bbox = d.textbbox((0, 0), str(number), font=f)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    d.text((x - tw // 2, y - th // 2 - 4), str(number), fill=WHITE, font=f)


def arrow(d, p1, p2, color=RED_CALL, w=3):
    import math
    x1, y1 = p1; x2, y2 = p2
    d.line([(x1, y1), (x2, y2)], fill=color, width=w)
    ang = math.atan2(y2 - y1, x2 - x1)
    s = 14
    p3 = (x2 - s * math.cos(ang - 0.5), y2 - s * math.sin(ang - 0.5))
    p4 = (x2 - s * math.cos(ang + 0.5), y2 - s * math.sin(ang + 0.5))
    d.polygon([(x2, y2), p3, p4], fill=color)


def browser_chrome(d, w, title=""):
    d.rectangle((0, 0, w, 44), fill=(50, 51, 52))
    d.ellipse((14, 16, 26, 28), fill=(239, 68, 68))
    d.ellipse((34, 16, 46, 28), fill=(245, 158, 11))
    d.ellipse((54, 16, 66, 28), fill=(34, 197, 94))
    rounded_rect(d, (90, 12, w - 14, 32), 6, fill=META_PANEL, outline=META_BORDER)
    d.text((104, 18), title, fill=META_TEXT_MUTED, font=F_T(13))


def meta_sidebar(d, x, y, h, active_main=None, active_sub=None):
    """Draw the WhatsApp Manager dark left rail with collapsible groups."""
    d.rectangle((x, y, x + 280, y + h), fill=META_DARKER)
    # Header
    d.text((x + 20, y + 28), "WhatsApp Manager",
           fill=META_TEXT, font=F_B(15))

    sections = [
        ("Обзор", []),
        ("Шаблоны сообщений", ["Управление шаблонами", "Библиотека шаблонов"]),
        ("Инструменты управления",
         ["Статистика", "Лимиты на число переп...", "Сценарии",
          "Номера телефонов", "Каталог", "Журнал действий"]),
        ("Конфигурации профиля", ["Индия"]),
    ]
    yy = y + 76
    for main, subs in sections:
        is_active = main == active_main
        if is_active and not subs:
            rounded_rect(d, (x + 12, yy - 8, x + 268, yy + 26), 8,
                         fill=META_PANEL)
        d.text((x + 28, yy), "● " if not subs else "▼ ", fill=META_TEXT,
               font=F_T(13))
        d.text((x + 50, yy), main, fill=META_TEXT, font=F_B(14))
        yy += 36
        for sub in subs:
            active_now = sub == active_sub
            if active_now:
                rounded_rect(d, (x + 36, yy - 6, x + 268, yy + 26), 8,
                             fill=META_PANEL)
            d.text((x + 60, yy), sub,
                   fill=WHITE if active_now else META_TEXT_MUTED,
                   font=F_B(13) if active_now else F_T(13))
            yy += 34
        yy += 8


# ----------------------------------------------------------------------------
# RU-1 — WhatsApp Manager → Номера телефонов  (the entry-point for new SIM)
# ----------------------------------------------------------------------------
def ru_phone_numbers():
    W, H = 1400, 800
    img, d = new_canvas(W, H)
    browser_chrome(d, W, "business.facebook.com/wa/manage/phone-numbers/")
    meta_sidebar(d, 0, 44, H - 44, active_main="Инструменты управления",
                 active_sub="Номера телефонов")

    # Top header bar
    d.text((300, 60), "WhatsApp Manager", fill=META_TEXT_MUTED, font=F_T(13))
    d.text((478, 60), "›", fill=META_TEXT_MUTED, font=F_T(13))
    d.text((498, 56), "Номера телефонов", fill=META_TEXT, font=F_B(20))

    # WABA switcher top-right
    rounded_rect(d, (W - 280, 50, W - 24, 88), 8, fill=META_PANEL,
                 outline=META_BORDER)
    d.ellipse((W - 268, 60, W - 244, 84), fill=WA_GREEN)
    d.text((W - 264, 64), "✓", fill=META_DARK, font=F_B(14))
    d.text((W - 238, 62), "GravityStretchingCanggu",
           fill=META_TEXT, font=F_B(13))
    d.text((W - 38, 62), "▾", fill=META_TEXT, font=F_T(14))

    # Search row
    rounded_rect(d, (300, 110, 758, 144), 8, fill=INPUT_BG, outline=META_BORDER)
    d.text((318, 118), "🔍   Поиск по номеру телефона или имени",
           fill=META_TEXT_MUTED, font=F_T(13))
    rounded_rect(d, (770, 110, 970, 144), 8, fill=INPUT_BG, outline=META_BORDER)
    d.text((786, 118), "Фильтровать по стр...    ▾",
           fill=META_TEXT_MUTED, font=F_T(13))
    rounded_rect(d, (982, 110, 1170, 144), 8, fill=INPUT_BG,
                 outline=META_BORDER)
    d.text((1000, 118), "Фильтр по статусу    ▾",
           fill=META_TEXT_MUTED, font=F_T(13))
    rounded_rect(d, (1182, 110, 1376, 144), 8, fill=META_BLUE)
    d.text((1218, 118), "Добавить номер телефона",
           fill=WHITE, font=F_B(13))
    callout_circle(d, (1180, 127), 1)
    arrow(d, (1192, 127), (1212, 127))

    # Table header
    d.text((300, 184), "Номер телефона", fill=META_TEXT_MUTED, font=F_B(13))
    d.text((660, 184), "Название", fill=META_TEXT_MUTED, font=F_B(13))
    d.text((938, 184), "Статус", fill=META_TEXT_MUTED, font=F_B(13))
    d.text((1166, 184), "Оценка качества", fill=META_TEXT_MUTED, font=F_B(13))
    d.line((300, 208, W - 24, 208), fill=META_BORDER, width=1)

    # Row 1: existing Canggu
    rowy = 224
    d.ellipse((300, rowy, 348, rowy + 48), fill=(120, 130, 140))
    d.text((309, rowy + 8), "🧘", fill=WHITE, font=F_B(20))
    d.text((362, rowy + 4), "+62 821-3130-468", fill=META_TEXT, font=F_B(15))
    d.text((362, rowy + 26), "🇮🇩 Индонезия", fill=META_TEXT_MUTED, font=F_T(13))
    d.text((660, rowy + 4), "GravityStretchingCanggu", fill=META_TEXT, font=F_B(14))
    d.text((660, rowy + 26), "Имя, видимое для клиентов",
           fill=META_TEXT_MUTED, font=F_T(12))
    rounded_rect(d, (930, rowy + 4, 1052, rowy + 32), 5,
                 fill=WA_GREEN_BG, outline=WA_GREEN)
    d.text((950, rowy + 10), "Подключено", fill=WA_GREEN_LABEL, font=F_B(12))
    d.ellipse((1166, rowy + 12, 1184, rowy + 30), fill=WA_GREEN)
    d.text((1190, rowy + 10), "Высокое", fill=META_TEXT, font=F_T(13))
    # actions
    rounded_rect(d, (1330, rowy + 4, 1362, rowy + 32), 6, fill=META_PANEL,
                 outline=META_BORDER)
    d.text((1340, rowy + 10), "🗑", fill=META_TEXT, font=F_T(13))
    rounded_rect(d, (1370, rowy + 4, 1402, rowy + 32), 6, fill=META_PANEL,
                 outline=META_BORDER)
    d.text((1380, rowy + 10), "⚙", fill=META_TEXT, font=F_T(13))

    # Caption hint at bottom
    d.text((300, 380), "Сюда после верификации добавится новая строка",
           fill=META_TEXT_MUTED, font=F_T(12))
    d.text((300, 400), "для +62 8xxx — следующий номер вашей студии.",
           fill=META_TEXT_MUTED, font=F_T(12))

    img.save(f"{OUT}/ru01_phone_numbers.png")


# ----------------------------------------------------------------------------
# RU-2 — «Создайте профиль WhatsApp Business» dialog (first step of wizard)
# ----------------------------------------------------------------------------
def ru_add_phone_step1():
    W, H = 1400, 800
    img, d = new_canvas(W, H)
    browser_chrome(d, W, "business.facebook.com/wa/manage/phone-numbers/")
    meta_sidebar(d, 0, 44, H - 44, active_main="Инструменты управления",
                 active_sub="Номера телефонов")

    # Dim the underlying table
    overlay = Image.new("RGBA", (W, H - 44), (0, 0, 0, 130))
    img.paste(overlay, (0, 44), overlay)
    d = ImageDraw.Draw(img)

    # Wizard panel
    mx, my, mw, mh = 360, 100, 980, 660
    rounded_rect(d, (mx, my, mx + mw, my + mh), 14, fill=META_DARK,
                 outline=META_BORDER, w=1)
    d.text((mx + 32, my + 28),
           "Создайте профиль WhatsApp Business",
           fill=META_TEXT, font=F_B(20))
    # Close
    d.text((mx + mw - 40, my + 26), "✕", fill=META_TEXT, font=F_T(20))

    d.text((mx + 32, my + 70),
           "В этом профиле будет показываться информация о вашей компании",
           fill=META_TEXT_MUTED, font=F_T(12))
    d.text((mx + 32, my + 88),
           "для пользователей WhatsApp. Чтобы отредактировать ее, перейдите",
           fill=META_TEXT_MUTED, font=F_T(12))
    d.text((mx + 32, my + 106),
           "в раздел Объекты на Meta Business Suite и выберите этот аккаунт.",
           fill=META_TEXT_MUTED, font=F_T(12))

    # Left sub-stepper
    rounded_rect(d, (mx, my + 144, mx + 260, my + mh), 0, fill=META_PANEL)
    d.text((mx + 24, my + 168), "Добавить номер",
           fill=META_TEXT_MUTED, font=F_B(13))
    rounded_rect(d, (mx + 14, my + 192, mx + 246, my + 226), 8,
                 fill=META_BLUE)
    d.text((mx + 34, my + 200), "Добавьте номер",
           fill=WHITE, font=F_B(13))

    # Field 1: display name
    fx = mx + 290
    fy = my + 162
    d.text((fx, fy), "Отображаемое имя WhatsApp Business",
           fill=META_TEXT, font=F_B(13))
    d.text((fx, fy + 22),
           "Отображаемое имя должно совпадать с названием вашей компании и",
           fill=META_TEXT_MUTED, font=F_T(11))
    d.text((fx, fy + 38),
           "соответствовать правилам WhatsApp Business в отношении",
           fill=META_TEXT_MUTED, font=F_T(11))
    d.text((fx, fy + 54),
           "отображаемых имен. ", fill=META_TEXT_MUTED, font=F_T(11))
    d.text((fx + 132, fy + 54), "Подробнее о правилах…",
           fill=META_BLUE_BRIGHT, font=F_T(11))
    rounded_rect(d, (fx, fy + 78, fx + 640, fy + 116), 8,
                 fill=INPUT_BG, outline=META_BORDER)
    d.text((fx + 16, fy + 88), "Gravity Stretching Bali",
           fill=META_TEXT, font=F_T(14))
    callout_circle(d, (fx + 660, fy + 97), 2)
    arrow(d, (fx + 640, fy + 97), (fx + 678, fy + 97))

    # Field 2: category
    cy = fy + 138
    d.text((fx, cy), "Категория", fill=META_TEXT, font=F_B(13))
    rounded_rect(d, (fx, cy + 24, fx + 640, cy + 62), 8,
                 fill=INPUT_BG, outline=META_BORDER)
    d.text((fx + 16, cy + 34), "Здоровье и красота",
           fill=META_TEXT, font=F_T(14))
    d.text((fx + 620, cy + 34), "▾", fill=META_TEXT_MUTED, font=F_T(14))
    callout_circle(d, (fx + 660, cy + 43), 3)

    # Field 3: description
    dy = cy + 84
    d.text((fx, dy), "Описание компании", fill=META_TEXT, font=F_B(13))
    d.text((fx + 152, dy), "• Необязательно", fill=META_TEXT_MUTED, font=F_T(12))
    rounded_rect(d, (fx, dy + 24, fx + 640, dy + 124), 8,
                 fill=INPUT_BG, outline=META_BORDER)
    d.text((fx + 16, dy + 34),
           "Студия растяжки в Чангу. Утренние и вечерние группы,",
           fill=META_TEXT, font=F_T(13))
    d.text((fx + 16, dy + 54),
           "детские классы и индивидуальные тренировки.",
           fill=META_TEXT, font=F_T(13))
    d.text((fx + 580, dy + 100), "104/512",
           fill=META_TEXT_MUTED, font=F_T(11))

    # Bottom buttons
    rounded_rect(d, (mx + mw - 240, my + mh - 60, mx + mw - 144, my + mh - 24),
                 8, fill=META_PANEL, outline=META_BORDER)
    d.text((mx + mw - 224, my + mh - 50), "Назад",
           fill=META_TEXT, font=F_B(13))
    rounded_rect(d, (mx + mw - 132, my + mh - 60, mx + mw - 32, my + mh - 24),
                 8, fill=META_BLUE)
    d.text((mx + mw - 100, my + mh - 50), "Далее",
           fill=WHITE, font=F_B(13))
    callout_circle(d, (mx + mw - 18, my + mh - 42), 4)
    arrow(d, (mx + mw - 32, my + mh - 42), (mx + mw - 6, my + mh - 42))

    img.save(f"{OUT}/ru02_create_profile.png")


# ----------------------------------------------------------------------------
# RU-3 — Step 2: enter phone number + send code (Verify step)
# ----------------------------------------------------------------------------
def ru_add_phone_step2():
    W, H = 1400, 800
    img, d = new_canvas(W, H)
    browser_chrome(d, W, "business.facebook.com/wa/manage/phone-numbers/")
    meta_sidebar(d, 0, 44, H - 44, active_main="Инструменты управления",
                 active_sub="Номера телефонов")

    overlay = Image.new("RGBA", (W, H - 44), (0, 0, 0, 130))
    img.paste(overlay, (0, 44), overlay)
    d = ImageDraw.Draw(img)

    mx, my, mw, mh = 360, 100, 980, 660
    rounded_rect(d, (mx, my, mx + mw, my + mh), 14, fill=META_DARK,
                 outline=META_BORDER, w=1)
    d.text((mx + 32, my + 28),
           "Добавьте номер телефона",
           fill=META_TEXT, font=F_B(20))
    d.text((mx + mw - 40, my + 26), "✕", fill=META_TEXT, font=F_T(20))
    d.text((mx + 32, my + 60),
           "Введите номер, который вы будете использовать в WhatsApp Business.",
           fill=META_TEXT_MUTED, font=F_T(12))

    # Left rail
    rounded_rect(d, (mx, my + 96, mx + 260, my + mh), 0, fill=META_PANEL)
    # Step list
    d.text((mx + 24, my + 124), "Добавьте номер", fill=META_TEXT_MUTED, font=F_B(13))
    # completed step
    d.ellipse((mx + 28, my + 152, mx + 48, my + 172), fill=WA_GREEN)
    d.text((mx + 34, my + 152), "✓", fill=META_DARK, font=F_B(14))
    d.text((mx + 56, my + 154), "Профиль", fill=META_TEXT_MUTED, font=F_T(12))
    # current step
    rounded_rect(d, (mx + 14, my + 184, mx + 246, my + 220), 8, fill=META_BLUE)
    d.text((mx + 34, my + 192), "Номер телефона", fill=WHITE, font=F_B(13))
    # next
    d.ellipse((mx + 28, my + 232, mx + 48, my + 252),
              outline=META_BORDER, width=2)
    d.text((mx + 56, my + 234), "Подтверждение",
           fill=META_TEXT_MUTED, font=F_T(12))

    fx = mx + 290
    fy = my + 138

    # Phone number field
    d.text((fx, fy), "Номер телефона", fill=META_TEXT, font=F_B(13))
    d.text((fx, fy + 22),
           "Этот номер НЕ должен быть зарегистрирован в WhatsApp/WhatsApp Business.",
           fill=META_TEXT_MUTED, font=F_T(11))
    # country code + number
    rounded_rect(d, (fx, fy + 56, fx + 152, fy + 96), 8,
                 fill=INPUT_BG, outline=META_BORDER)
    d.text((fx + 16, fy + 68), "🇮🇩 +62  ▾", fill=META_TEXT, font=F_T(14))
    rounded_rect(d, (fx + 168, fy + 56, fx + 640, fy + 96), 8,
                 fill=INPUT_BG, outline=META_BORDER)
    d.text((fx + 184, fy + 68), "8 123 456 789", fill=META_TEXT, font=F_T(14))
    callout_circle(d, (fx + 660, fy + 76), 5)
    arrow(d, (fx + 640, fy + 76), (fx + 678, fy + 76))

    # Verification method
    vy = fy + 140
    d.text((fx, vy), "Способ подтверждения", fill=META_TEXT, font=F_B(13))
    # radio: SMS active
    d.ellipse((fx, vy + 32, fx + 18, vy + 50), outline=META_BLUE, width=3)
    d.ellipse((fx + 4, vy + 36, fx + 14, vy + 46), fill=META_BLUE)
    d.text((fx + 28, vy + 32), "Текстовое сообщение (SMS)",
           fill=META_TEXT, font=F_T(14))
    # radio: voice call inactive
    d.ellipse((fx, vy + 60, fx + 18, vy + 78),
              outline=META_BORDER, width=2)
    d.text((fx + 28, vy + 60), "Телефонный звонок",
           fill=META_TEXT_MUTED, font=F_T(14))

    # warning callout
    rounded_rect(d, (fx, vy + 110, fx + 640, vy + 168), 8,
                 fill=RED_CALL_BG, outline=RED_CALL)
    d.text((fx + 16, vy + 122),
           "⚠ Если номер уже стоит в WhatsApp на телефоне — сначала",
           fill=(255, 200, 200), font=F_T(12))
    d.text((fx + 16, vy + 140),
           "удалите аккаунт (Settings → Account → Delete account).",
           fill=(255, 200, 200), font=F_T(12))

    # Bottom buttons
    rounded_rect(d, (mx + mw - 240, my + mh - 60, mx + mw - 144, my + mh - 24),
                 8, fill=META_PANEL, outline=META_BORDER)
    d.text((mx + mw - 224, my + mh - 50), "Назад",
           fill=META_TEXT, font=F_B(13))
    rounded_rect(d, (mx + mw - 132, my + mh - 60, mx + mw - 32, my + mh - 24),
                 8, fill=META_BLUE)
    d.text((mx + mw - 116, my + mh - 50), "Отправить код",
           fill=WHITE, font=F_B(13))
    callout_circle(d, (mx + mw - 18, my + mh - 42), 6)
    arrow(d, (mx + mw - 32, my + mh - 42), (mx + mw - 6, my + mh - 42))

    img.save(f"{OUT}/ru03_phone_input.png")


# ----------------------------------------------------------------------------
# RU-4 — Step 3: enter SMS code
# ----------------------------------------------------------------------------
def ru_sms_verify():
    W, H = 1400, 800
    img, d = new_canvas(W, H)
    browser_chrome(d, W, "business.facebook.com/wa/manage/phone-numbers/")
    meta_sidebar(d, 0, 44, H - 44, active_main="Инструменты управления",
                 active_sub="Номера телефонов")

    overlay = Image.new("RGBA", (W, H - 44), (0, 0, 0, 130))
    img.paste(overlay, (0, 44), overlay)
    d = ImageDraw.Draw(img)

    mx, my, mw, mh = 360, 130, 980, 600
    rounded_rect(d, (mx, my, mx + mw, my + mh), 14, fill=META_DARK,
                 outline=META_BORDER, w=1)
    d.text((mx + 32, my + 28), "Введите код подтверждения",
           fill=META_TEXT, font=F_B(20))
    d.text((mx + mw - 40, my + 26), "✕", fill=META_TEXT, font=F_T(20))
    d.text((mx + 32, my + 60),
           "Мы отправили 6-значный код на +62 812 3456 789 по SMS.",
           fill=META_TEXT_MUTED, font=F_T(13))

    # 6 code boxes
    cx = mx + 290
    cy = my + 140
    code = ["7", "4", "8", "2", "9", "1"]
    for i in range(6):
        bx = cx + i * 60
        rounded_rect(d, (bx, cy, bx + 48, cy + 60), 10,
                     fill=INPUT_BG, outline=META_BLUE if i == 0 else META_BORDER,
                     w=2 if i == 0 else 1)
        d.text((bx + 18, cy + 18), code[i], fill=META_TEXT, font=F_B(22))
    callout_circle(d, (cx + 410, cy + 30), 7)
    arrow(d, (cx + 390, cy + 30), (cx + 428, cy + 30))

    d.text((cx, cy + 80),
           "Не получили код? Запросите повторно через 00:43.",
           fill=META_TEXT_MUTED, font=F_T(12))
    d.text((cx, cy + 100), "Отправить заново",
           fill=META_BLUE_BRIGHT, font=F_B(13))

    # Big success preview
    rounded_rect(d, (cx, cy + 160, cx + 420, cy + 230), 10,
                 fill=WA_GREEN_BG, outline=WA_GREEN)
    d.ellipse((cx + 14, cy + 174, cx + 54, cy + 214), fill=WA_GREEN)
    d.text((cx + 22, cy + 178), "✓", fill=META_DARK, font=F_B(22))
    d.text((cx + 70, cy + 178), "После «Подтвердить» номер",
           fill=META_TEXT, font=F_B(14))
    d.text((cx + 70, cy + 198), "появится в списке как Подключено.",
           fill=META_TEXT, font=F_T(13))

    # Buttons
    rounded_rect(d, (mx + mw - 240, my + mh - 60, mx + mw - 144, my + mh - 24),
                 8, fill=META_PANEL, outline=META_BORDER)
    d.text((mx + mw - 224, my + mh - 50), "Назад",
           fill=META_TEXT, font=F_B(13))
    rounded_rect(d, (mx + mw - 132, my + mh - 60, mx + mw - 32, my + mh - 24),
                 8, fill=META_BLUE)
    d.text((mx + mw - 108, my + mh - 50), "Подтвердить",
           fill=WHITE, font=F_B(13))
    callout_circle(d, (mx + mw - 18, my + mh - 42), 8)

    img.save(f"{OUT}/ru04_sms_code.png")


# ----------------------------------------------------------------------------
# RU-5 — Connected: phone in list with "Подключено" + UNKNOWN quality (new)
# ----------------------------------------------------------------------------
def ru_connected_list():
    W, H = 1400, 760
    img, d = new_canvas(W, H)
    browser_chrome(d, W, "business.facebook.com/wa/manage/phone-numbers/")
    meta_sidebar(d, 0, 44, H - 44, active_main="Инструменты управления",
                 active_sub="Номера телефонов")

    d.text((300, 56), "WhatsApp Manager  ›", fill=META_TEXT_MUTED, font=F_T(13))
    d.text((498, 56), "Номера телефонов", fill=META_TEXT, font=F_B(20))

    rounded_rect(d, (W - 280, 50, W - 24, 88), 8, fill=META_PANEL,
                 outline=META_BORDER)
    d.ellipse((W - 268, 60, W - 244, 84), fill=WA_GREEN)
    d.text((W - 264, 64), "✓", fill=META_DARK, font=F_B(14))
    d.text((W - 238, 62), "GravityStretchingCanggu",
           fill=META_TEXT, font=F_B(13))

    # Banner: success
    rounded_rect(d, (300, 110, W - 24, 174), 10, fill=WA_GREEN_BG, outline=WA_GREEN)
    d.ellipse((318, 124, 354, 160), fill=WA_GREEN)
    d.text((328, 128), "✓", fill=META_DARK, font=F_B(20))
    d.text((376, 122), "Номер успешно подключен!",
           fill=WHITE, font=F_B(15))
    d.text((376, 146),
           "+62 812 3456 789 теперь привязан к вашему WhatsApp Business аккаунту.",
           fill=META_TEXT, font=F_T(13))

    # Table header
    ty = 210
    d.text((300, ty), "Номер телефона", fill=META_TEXT_MUTED, font=F_B(13))
    d.text((660, ty), "Название", fill=META_TEXT_MUTED, font=F_B(13))
    d.text((938, ty), "Статус", fill=META_TEXT_MUTED, font=F_B(13))
    d.text((1166, ty), "Оценка качества", fill=META_TEXT_MUTED, font=F_B(13))
    d.line((300, ty + 24, W - 24, ty + 24), fill=META_BORDER, width=1)

    # Existing Canggu
    rowy = ty + 38
    d.ellipse((300, rowy, 348, rowy + 48), fill=(120, 130, 140))
    d.text((309, rowy + 8), "🧘", fill=WHITE, font=F_B(20))
    d.text((362, rowy + 4), "+62 821-3130-468", fill=META_TEXT, font=F_B(15))
    d.text((362, rowy + 26), "🇮🇩 Индонезия", fill=META_TEXT_MUTED, font=F_T(13))
    d.text((660, rowy + 4), "GravityStretchingCanggu", fill=META_TEXT, font=F_B(14))
    rounded_rect(d, (930, rowy + 4, 1052, rowy + 32), 5,
                 fill=WA_GREEN_BG, outline=WA_GREEN)
    d.text((950, rowy + 10), "Подключено", fill=WA_GREEN_LABEL, font=F_B(12))
    d.ellipse((1166, rowy + 12, 1184, rowy + 30), fill=WA_GREEN)
    d.text((1190, rowy + 10), "Высокое", fill=META_TEXT, font=F_T(13))
    d.line((300, rowy + 64, W - 24, rowy + 64), fill=META_BORDER, width=1)

    # New Bali row (highlighted)
    rowy2 = rowy + 80
    d.ellipse((300, rowy2, 348, rowy2 + 48), fill=(70, 180, 130))
    d.text((309, rowy2 + 8), "🌊", fill=WHITE, font=F_B(20))
    d.text((362, rowy2 + 4), "+62 812 3456 789", fill=META_TEXT, font=F_B(15))
    d.text((362, rowy2 + 26), "🇮🇩 Индонезия", fill=META_TEXT_MUTED, font=F_T(13))
    d.text((660, rowy2 + 4), "Gravity Stretching Bali", fill=META_TEXT, font=F_B(14))
    d.text((660, rowy2 + 26), "Имя, видимое для клиентов",
           fill=META_TEXT_MUTED, font=F_T(12))
    rounded_rect(d, (930, rowy2 + 4, 1052, rowy2 + 32), 5,
                 fill=WA_GREEN_BG, outline=WA_GREEN)
    d.text((950, rowy2 + 10), "Подключено", fill=WA_GREEN_LABEL, font=F_B(12))
    d.ellipse((1166, rowy2 + 12, 1184, rowy2 + 30), fill=(180, 180, 180))
    d.text((1190, rowy2 + 10), "UNKNOWN", fill=META_TEXT_MUTED, font=F_T(13))

    callout_circle(d, (282, rowy2 + 24), 9)
    arrow(d, (296, rowy2 + 24), (322, rowy2 + 24))

    # caption
    d.text((300, rowy2 + 84),
           "Качество показано как UNKNOWN — это нормально для свежего",
           fill=META_TEXT_MUTED, font=F_T(11))
    d.text((300, rowy2 + 102),
           "номера. После ~двух дней реального трафика станет «Высокое».",
           fill=META_TEXT_MUTED, font=F_T(11))

    img.save(f"{OUT}/ru05_connected.png")


# ----------------------------------------------------------------------------
# RU-6 — Hand-off to super-admin: the 4 fields to copy
# ----------------------------------------------------------------------------
def ru_handoff_data():
    W, H = 1400, 760
    img, d = new_canvas(W, H, fill_color := (245, 247, 250))
    # Header band
    d.rectangle((0, 0, W, 110), fill=(44, 110, 73))
    d.text((40, 30), "Шаг 6 — отправь эти 4 строки супер-админу",
           fill=WHITE, font=F_B(22))
    d.text((40, 68),
           "Без них он не сможет включить твою студию в инбоксе.",
           fill=(225, 245, 235), font=F_T(14))

    # Four cards
    items = [
        ("1. Phone Number ID",
         "1567283746829999",
         "WhatsApp Manager → Обзор API → Phone number ID. Длинная цифра, ~16 знаков."),
        ("2. WABA ID",
         "1571637721189360",
         "Тот же что у Canggu — общий для всех студий. Уже в адресной строке: ?asset_id=..."),
        ("3. Постоянный токен",
         "EAAanR4J0RZBABRi50… (~200 символов)",
         "Создаётся в Business Settings → System Users → Сгенерировать новый токен."),
        ("4. Отображаемый номер",
         "+62 812 3456 789",
         "Просто номер с кодом страны в красивом формате — для админ-инбокса."),
    ]
    cy = 140
    for title, value, hint in items:
        rounded_rect(d, (40, cy, W - 40, cy + 130), 14,
                     fill=WHITE, outline=(220, 224, 230), w=1)
        rounded_rect(d, (40, cy, 56, cy + 130), 14, fill=(44, 110, 73))
        d.text((76, cy + 16), title, fill=(24, 24, 27), font=F_B(16))
        rounded_rect(d, (76, cy + 50, W - 80, cy + 86), 8,
                     fill=(243, 246, 250), outline=(220, 224, 230))
        d.text((92, cy + 60), value, fill=(24, 24, 27), font=F_B(15))
        d.text((76, cy + 98), hint, fill=(107, 114, 128), font=F_T(12))
        cy += 142

    img.save(f"{OUT}/ru06_handoff.png")


ru_phone_numbers()
ru_add_phone_step1()
ru_add_phone_step2()
ru_sms_verify()
ru_connected_list()
ru_handoff_data()
print("Done — Russian mocks at", OUT)
