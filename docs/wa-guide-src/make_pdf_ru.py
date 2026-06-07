"""Russian-language WhatsApp connection guide for studio admins.

Audience: studio admin who DOESN'T have super-admin access. Their job is
to collect 4 values from Facebook and hand them to the super-admin, who
will plug them into bookgravity's /sadmin. No bookgravity steps for the
admin — just the Facebook flow + the data hand-off.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate,
    Paragraph, Spacer, Image, PageBreak, KeepTogether, Table, TableStyle,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

OUT_PDF = "/tmp/wa-guide/WhatsApp-Подключение-RU.pdf"

# Helper: render a bilingual button/label as "RU («EN»)". Used everywhere
# the admin needs to find a control in Facebook — Meta's UI language depends
# on user account settings, so we always give both names. Inline.
def L(ru, en):
    return f"<b>{ru}</b> <font color='#6B7280'>(англ. <i>{en}</i>)</font>"
IMG = "/tmp/wa-guide/img_ru"

BRAND = HexColor("#2C6E49")
BRAND_DARK = HexColor("#1E4D34")
INK = HexColor("#18181B")
MUTED = HexColor("#6B7280")
LINE = HexColor("#E5E7EB")
CARD_BG = HexColor("#F3F4F6")
TIP_BG = HexColor("#ECFDF5")
TIP_BORDER = HexColor("#10B981")
WARN_BG = HexColor("#FFF7ED")
WARN_BORDER = HexColor("#F59E0B")
CALLOUT_BG = HexColor("#FEE2E2")
CALLOUT_BORDER = HexColor("#DC2626")

# Cyrillic-capable font
FONT = "Helvetica"
FONT_B = "Helvetica-Bold"
for candidate, name in [
    ("/Library/Fonts/Arial Unicode.ttf", "ArialU"),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "ArialU"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu"),
]:
    if os.path.exists(candidate):
        try:
            pdfmetrics.registerFont(TTFont(name, candidate))
            FONT = name
            for bc in [candidate.replace(".ttf", " Bold.ttf"),
                       candidate.replace(".ttf", "-Bold.ttf"),
                       "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
                if os.path.exists(bc):
                    pdfmetrics.registerFont(TTFont(name + "-B", bc))
                    FONT_B = name + "-B"
                    break
            else:
                FONT_B = name
            break
        except Exception:
            continue

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontName=FONT_B,
                    fontSize=24, leading=30, textColor=INK,
                    spaceBefore=4, spaceAfter=8)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName=FONT_B,
                    fontSize=18, leading=24, textColor=BRAND,
                    spaceBefore=14, spaceAfter=8)
BODY = ParagraphStyle("Body", parent=ss["BodyText"], fontName=FONT,
                      fontSize=11, leading=16, textColor=INK, spaceAfter=6)
LEAD = ParagraphStyle("Lead", parent=BODY, fontSize=12, leading=18,
                      textColor=MUTED, spaceAfter=10)
CAPTION = ParagraphStyle("Caption", parent=BODY, fontSize=9, leading=12,
                         textColor=MUTED, alignment=TA_CENTER,
                         spaceBefore=4, spaceAfter=14)
STEP_NUM = ParagraphStyle("StepNum", parent=BODY, fontName=FONT_B,
                          fontSize=16, leading=20, textColor=white)
STEP_TITLE = ParagraphStyle("StepTitle", parent=BODY, fontName=FONT_B,
                            fontSize=15, leading=20, textColor=INK)
COVER_TITLE = ParagraphStyle("CT", parent=ss["Title"], fontName=FONT_B,
                             fontSize=42, leading=50, textColor=white,
                             alignment=TA_CENTER)
COVER_SUB = ParagraphStyle("CS", parent=BODY, fontName=FONT, fontSize=17,
                           leading=24, textColor=white, alignment=TA_CENTER,
                           spaceBefore=12)
COVER_CTA = ParagraphStyle("CC", parent=BODY, fontName=FONT_B, fontSize=14,
                           leading=18, textColor=BRAND, alignment=TA_CENTER)


def draw_cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BRAND)
    canvas.rect(0, 0, doc.pagesize[0], doc.pagesize[1], fill=1, stroke=0)
    canvas.setFillColor(BRAND_DARK)
    canvas.circle(0, doc.pagesize[1], 180, fill=1, stroke=0)
    canvas.circle(doc.pagesize[0], 0, 220, fill=1, stroke=0)
    canvas.restoreState()


def draw_page_chrome(canvas, doc):
    canvas.saveState()
    w, h = doc.pagesize
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 30, w, 30, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont(FONT_B, 10)
    canvas.drawString(20 * mm, h - 20,
                      "BookGravity • Подключение WhatsApp к новой студии")
    canvas.drawRightString(w - 20 * mm, h - 20, f"стр. {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.line(20 * mm, 14 * mm, w - 20 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 8)
    canvas.drawString(20 * mm, 10 * mm, "Внутренний документ — для админов студий")
    canvas.drawRightString(w - 20 * mm, 10 * mm, "v1.0")
    canvas.restoreState()


def step_block(num, title, body_paragraphs, image_path=None, caption=None):
    color = BRAND
    num_cell = Table([[Paragraph(str(num), STEP_NUM)]],
                     colWidths=[12 * mm], rowHeights=[12 * mm])
    num_cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
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
        img = Image(image_path, width=170 * mm, height=170 * mm * 8 / 14)
        flow.append(Spacer(1, 4))
        flow.append(img)
        if caption:
            flow.append(Paragraph(caption, CAPTION))
    return flow if image_path else [KeepTogether(flow)]


def note_box(text, kind="tip"):
    bg = TIP_BG if kind == "tip" else WARN_BG if kind == "warn" else CALLOUT_BG
    border = TIP_BORDER if kind == "tip" else WARN_BORDER if kind == "warn" else CALLOUT_BORDER
    icon = "СОВЕТ" if kind == "tip" else "ВАЖНО" if kind == "warn" else "СТОП"
    style = ParagraphStyle("note", parent=BODY, fontSize=10, leading=14)
    p = Paragraph(f"<b>{icon}.</b> {text}", style)
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


def kv_table(rows):
    data = []
    for k, v in rows:
        data.append([
            Paragraph(f"<b>{k}</b>", ParagraphStyle("k", parent=BODY,
                                                    fontSize=10, textColor=INK)),
            Paragraph(v, ParagraphStyle("v", parent=BODY, fontSize=10,
                                         textColor=INK)),
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


doc = BaseDocTemplate(OUT_PDF, pagesize=A4,
                      leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=20 * mm, bottomMargin=20 * mm,
                      title="Подключение WhatsApp к студии Gravity Stretching",
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

# ---------------- Cover ----------------
story.append(Paragraph("Подключение", COVER_TITLE))
story.append(Paragraph("WhatsApp к студии", COVER_TITLE))
story.append(Spacer(1, 18))
story.append(Paragraph("Пошаговая инструкция для админа студии", COVER_SUB))
story.append(Paragraph("Gravity Stretching", COVER_SUB))
story.append(Spacer(1, 80))
cta = Paragraph("6 шагов · ≈ 30 минут · твоя задача — собрать 4 значения и передать супер-админу",
                COVER_CTA)
box = Table([[cta]], colWidths=[150 * mm])
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

# ---------------- Что и зачем ----------------
story.append(Paragraph("Что это за инструкция", H1))
story.append(Paragraph(
    "Открываешь новую студию Gravity Stretching. Чтобы клиентам приходили "
    "WhatsApp-подтверждения на бронирования, а у тебя и тренеров появился "
    "WhatsApp-инбокс — нужно один раз подключить номер к Meta (Facebook), "
    "после чего супер-админ зальёт 4 значения в систему. Эта инструкция "
    "— про твою часть работы: что нажимать в Facebook и какие 4 значения "
    "отдать супер-админу.",
    LEAD,
))
story.append(Paragraph("Как роли распределены", H2))
story.append(kv_table([
    ("Ты (админ студии)",
     "Открываешь новый номер в WhatsApp Manager, проходишь верификацию SMS, "
     "копируешь 4 значения. <b>Это и есть содержание этой инструкции.</b>"),
    ("Супер-админ",
     "Заходит в /sadmin на bookgravity.com, вставляет твои 4 значения в "
     "форму подключения, включает тумблер. К нему — отдельно, после твоей части."),
    ("Meta (Facebook)",
     "Верифицирует номер, выдаёт уникальные ID и токен доступа. Без её "
     "одобрения ничего не работает."),
]))

story.append(Paragraph("Что подготовить до начала", H2))
story.append(kv_table([
    ("SIM-карта",
     "Новая, на которой <b>не установлен</b> WhatsApp / WhatsApp Business "
     "на телефоне. Если установлен — открой приложение и удали аккаунт: "
     "<i>Settings → Account → Delete my account</i>. Иначе Meta откажет."),
    ("Доступ к Facebook",
     "Тебя должен добавить владелец бизнеса как админа в Business Manager "
     "(делается за минуту в Business Settings → Users). Без этого ты не "
     "увидишь WhatsApp Manager."),
    ("Название студии",
     "Что увидят клиенты в WhatsApp, например &quot;Gravity Stretching "
     "Bali&quot;. Лучше согласовать заранее с владельцем."),
    ("Телефон",
     "Чтобы получить SMS с 6-значным кодом подтверждения."),
]))
story.append(note_box(
    "<b>Интерфейс Facebook может быть на любом языке.</b> У всех админов "
    "по-разному: где-то русский, где-то английский, где-то индонезийский. "
    "Поэтому в инструкции рядом с каждой русской подписью кнопки в скобках "
    "указано её английское название — ищи по обоим. "
    "<b>Расположение и порядок шагов одинаковые в любом языке.</b>",
    kind="tip",
))
story.append(note_box(
    "<b>Хочешь переключить FB на русский?</b> Слева снизу любой страницы "
    "<i>business.facebook.com</i> есть пункт <b>Русский</b> / <b>English</b> "
    "— одним кликом меняется язык всего интерфейса.",
    kind="tip",
))
story.append(PageBreak())

# ---------------- Шаги ----------------
story.append(Paragraph("Шаг 1 — открой WhatsApp Manager", H1))
story += step_block(
    1, "Открой WhatsApp Manager → Номера телефонов / Phone numbers",
    [
        "Вставь в адресную строку: "
        "<b><font color='#2C6E49'>business.facebook.com/wa/manage/phone-numbers/</font></b>",
        f"Слева на тёмной панели — раздел {L('Инструменты управления', 'Account tools')}, "
        f"внутри него {L('Номера телефонов', 'Phone numbers')}. Уже должен быть открыт.",
        "Сверху справа — переключатель аккаунта с <b>GravityStretchingCanggu</b>. "
        "Это объединяющий WhatsApp Business Account — все наши студии висят на нём. "
        "Проверь, что выбран именно он.",
        f"В таблице видишь существующий номер Чангу <b>+62 821-3130-468</b> "
        f"со статусом {L('Подключено', 'Connected')} и качеством "
        f"{L('Высокое', 'High')}.",
        f"Жми синюю кнопку {L('Добавить номер телефона', 'Add phone number')} справа.",
    ],
    image_path=f"{IMG}/ru01_phone_numbers.png",
    caption="① Кнопка «Добавить номер телефона» / «Add phone number» в правом верхнем углу",
)
story.append(note_box(
    "Если не видишь раздела WhatsApp Manager — значит владелец ещё не выдал тебе права. "
    "Напиши ему: «Добавь меня в "
    "<i>Business Settings → Users → People / Бизнес-настройки → Пользователи → Люди</i> "
    "как <b>Admin / Администратор</b> к Gravitystretchingcanggu и к WhatsApp Account».",
    kind="warn",
))
story.append(PageBreak())

story += step_block(
    2, "Заполни профиль / Create WhatsApp Business profile",
    [
        "Откроется мастер из двух шагов. Заголовок: "
        f"{L('Создайте профиль WhatsApp Business', 'Create WhatsApp Business profile')}. "
        "Сначала — профиль компании.",
        f"{L('Отображаемое имя WhatsApp Business', 'WhatsApp Business display name')} — "
        "что увидят клиенты в шапке чата. Пиши официальное название, "
        "например <i>Gravity Stretching Bali</i>. "
        "Без эмодзи и без слова «WhatsApp» — Meta их режет.",
        f"{L('Категория', 'Category')} — выбери "
        f"{L('Здоровье и красота', 'Health &amp; beauty')} или "
        f"{L('Спорт и фитнес', 'Sports &amp; fitness')}. Влияет только на классификацию, не критично.",
        f"{L('Описание компании', 'Business description')} — "
        f"{L('Необязательно', 'Optional')}, можно пропустить. До 512 символов.",
        f"Жми {L('Далее', 'Next')}.",
    ],
    image_path=f"{IMG}/ru02_create_profile.png",
    caption="② Имя для клиентов  ③ Категория  ④ Далее / Next",
)
story.append(PageBreak())

story += step_block(
    3, "Введи номер и отправь код / Phone number + Send code",
    [
        f"Заголовок экрана: {L('Добавьте номер телефона', 'Add a phone number')}.",
        f"Слева — {L('код страны', 'country code')}. По умолчанию +62 (Индонезия). "
        "Если открываешь студию в другой стране — поменяй.",
        "Справа — сам номер <b>без кода страны и без ведущего нуля</b>. "
        "Например, для +62 812 345 6789 пиши <i>8123456789</i>.",
        f"{L('Способ подтверждения', 'Verification method')} — оставь "
        f"{L('Текстовое сообщение (SMS)', 'Text message (SMS)')}. "
        f"{L('Телефонный звонок', 'Voice call')} работает дольше, "
        "переключайся только если SMS не приходят.",
        f"Жми {L('Отправить код', 'Send code')}. SMS приходит в течение 30 секунд.",
    ],
    image_path=f"{IMG}/ru03_phone_input.png",
    caption="⑤ Номер  ⑥ Отправить код / Send code",
)
story.append(note_box(
    "<b>SIM уже была в WhatsApp.</b> Самая частая ошибка. Признаки: "
    "Meta после <i>Отправить код / Send code</i> пишет «Этот номер "
    "используется в приложении WhatsApp» / «This number is already in "
    "use on WhatsApp», либо вообще не шлёт SMS. Решение — открой "
    "WhatsApp на телефоне с этой SIM → "
    "<i>Settings → Account → Delete my account</i> → введи номер → "
    "подтверди. Подожди 5 минут. Повтори шаг 3.",
    kind="warn",
))
story.append(PageBreak())

story += step_block(
    4, "Введи 6-значный код / Enter the verification code",
    [
        "SMS приходит от Meta вида: <i>Your WhatsApp Business verification "
        "code is: 748291.</i>",
        f"Заголовок экрана: {L('Введите код подтверждения', 'Enter verification code')}. "
        "Введи 6 цифр в боксики. Поле автозаполняется — двигаться курсором не нужно.",
        f"Жми {L('Подтвердить', 'Verify')}.",
        f"Готово — номер подключен. Тебя вернёт в список номеров, появится "
        f"новая строка с твоим номером, статусом {L('Подключено', 'Connected')} "
        f"и качеством <b>UNKNOWN</b>.",
    ],
    image_path=f"{IMG}/ru04_sms_code.png",
    caption="⑦ Введи 6 цифр  ⑧ Подтвердить / Verify",
)
story.append(note_box(
    "<b>Не получил SMS за минуту?</b> Жди 1-2 минуты (индонезийские "
    "операторы тормозят). Через 1 минуту появится кнопка "
    "<i>Отправить заново / Resend code</i>. Через 2 повторных попытки "
    "переключись на <i>Телефонный звонок / Voice call</i> — придёт "
    "автоматический звонок и продиктует код голосом.",
    kind="tip",
))
story.append(PageBreak())

story += step_block(
    5, "Проверь, что номер появился как «Подключено» / Connected",
    [
        f"Тебя должно вернуть в список {L('Номера телефонов', 'Phone numbers')}. "
        f"Видишь вторую строку — твой новый номер с зелёным бейджем "
        f"{L('Подключено', 'Connected')}.",
        f"{L('Оценка качества', 'Quality rating')} показывает <b>UNKNOWN</b> "
        "или серую точку. <b>Это нормально</b> — Meta поднимает оценку до "
        f"{L('Высокое', 'High')} через ~2 дня реального трафика. Не блокирует отправку.",
        "На странице вверху может появиться зелёная плашка "
        f"{L('Номер успешно подключен!', 'Phone number connected successfully!')}.",
    ],
    image_path=f"{IMG}/ru05_connected.png",
    caption="⑨ Новая строка с твоим номером, статус «Подключено» / «Connected»",
)
story.append(PageBreak())

# ---------------- Hand-off ----------------
story.append(Paragraph("Шаг 6 — собери 4 значения и передай супер-админу", H1))
story.append(Paragraph(
    "Финал. Из подключённого номера нужно вытащить 4 значения. "
    "Скопируй каждое <b>точно</b> (один пропущенный символ — и подключение "
    "не сработает) и отправь супер-админу одним сообщением.",
    LEAD,
))

story += step_block(
    6, "Собери 4 значения для супер-админа",
    [
        "<b>1. Phone Number ID</b> — нажми на свой новый номер в списке. "
        f"Слева откроется панель с заголовком {L('Обзор API', 'API setup')}. "
        f"Найди строку <i>Phone number ID</i> / "
        f"{L('Идентификатор номера телефона', 'Phone number ID')} (обычно "
        "второе поле сверху). Длинная цифра ~16 знаков. Скопируй.",
        "<b>2. WABA ID</b> — посмотри в адресную строку браузера. Там есть "
        "<font face='Courier'>?asset_id=1571637721189360</font> — вот эта цифра. "
        "<i>Одинаковая для всех студий — твоя такая же как у Canggu.</i>",
        "<b>3. Постоянный токен</b> — самый важный пункт. Его создаёт супер-админ "
        "сам, нужны его доступы. Просто скажи «Я подключила номер, сгенерируй "
        "мне постоянный System User Token для нашей студии». Его 5-минутная задача.",
        "<b>4. Отображаемый номер</b> — твой номер в красивом формате с кодом страны, "
        "например <i>+62 812 345 6789</i>. Идёт в админ-инбокс над чатами, "
        "чтобы по виду номера было понятно от какой студии чат.",
    ],
    image_path=f"{IMG}/ru06_handoff.png",
    caption="Что и куда — одним сообщением супер-админу",
)

story.append(Paragraph("Шаблон сообщения супер-админу", H2))
story.append(Paragraph(
    "Скопируй блок ниже, подставь свои значения и пришли супер-админу:",
    BODY,
))
story.append(Paragraph(
    "<font face='Courier' size='10'>"
    "Подключила номер для студии Gravity Stretching Bali.<br/>"
    "<br/>"
    "Phone Number ID: 1567283746829999<br/>"
    "WABA ID:         1571637721189360<br/>"
    "Display phone:   +62 812 345 6789<br/>"
    "Permanent token: создай сам, пожалуйста (System User → Generate New Token).<br/>"
    "</font>",
    BODY,
))
story.append(Spacer(1, 6))
story.append(note_box(
    "Если что-то не получается — пришли супер-админу скриншот того места "
    "где застрял, он поймёт что делать.",
    kind="tip",
))
story.append(PageBreak())

# ---------------- FAQ ----------------
story.append(Paragraph("Что может пойти не так", H1))
story.append(kv_table([
    ("Не вижу WhatsApp Manager",
     "Владелец не выдал тебе доступ. Напиши ему: «Добавь меня в "
     "<i>Business Settings → Users → People</i> (рус. "
     "<i>Бизнес-настройки → Пользователи → Люди</i>) как <b>Admin / Администратор</b>». "
     "1 минута на его стороне."),
    ("Кнопка «Добавить номер телефона» / «Add phone number» серая",
     "Скорее всего, ты в неправильном бизнес-аккаунте. В правом верхнем углу — "
     "выпадашка, проверь что выбран <i>GravityStretchingCanggu</i>, а не "
     "какой-то другой бизнес."),
    ("SMS-код не приходит",
     "Подожди 2 минуты. Если не пришёл — нажми "
     "<i>Отправить заново / Resend code</i>. Если опять не пришёл — "
     "переключись на <i>Телефонный звонок / Voice call</i>, "
     "Meta позвонит и продиктует код голосом."),
    ("«Этот номер уже используется» / «This number is already in use»",
     "На этой SIM стоит WhatsApp / WhatsApp Business на телефоне. "
     "Открой приложение → <i>Settings → Account → Delete my account</i> "
     "(рус. <i>Настройки → Аккаунт → Удалить мой аккаунт</i>) → "
     "введи номер → подтверди. Подожди 5 минут. Повтори шаг 3."),
    ("«Превышено количество попыток» / «Too many attempts»",
     "Meta ограничивает 5 попыток подтверждения в сутки на номер. "
     "Подожди 24 часа и повтори. Лучше с первого раза сделать всё внимательно."),
    ("«Качество: UNKNOWN»",
     "Нормально для свежего номера. Через 1-2 дня реального трафика "
     "(10-20 отправленных сообщений) Meta автоматически поднимет до "
     "<b>Высокое / High</b>. На отправку не влияет."),
    ("Интерфейс на индонезийском / другом языке",
     "Слева снизу любой страницы business.facebook.com есть список языков. "
     "Кликни <b>Русский</b> или <b>English</b> — весь интерфейс переключится."),
]))
story.append(PageBreak())

# ---------------- Глоссарий ----------------
story.append(Paragraph("Словарь терминов", H1))
story.append(Paragraph(
    "Если по тексту встретилось непонятное слово.", LEAD,
))
story.append(kv_table([
    ("WhatsApp Business Account (WABA)",
     "Контейнер в Meta, к которому привязаны все номера телефонов одного "
     "бизнеса. У нас один WABA на все студии Gravity Stretching."),
    ("Phone Number ID",
     "Уникальный номер, который Meta даёт каждому подключённому телефону. "
     "Через него Cloud API отправляет/получает сообщения. <b>Уникален для "
     "каждой студии.</b>"),
    ("Системный пользователь (System User)",
     "Серверный «бот»-аккаунт в Business Manager, от имени которого "
     "bookgravity отправляет сообщения. Под него генерируется постоянный токен. "
     "Создаёт только супер-админ."),
    ("Постоянный токен",
     "Длинная строка вида <font face='Courier'>EAAa….</font> ~200 символов. "
     "Заменяет логин-пароль для серверной интеграции. <b>Никогда не публикуй "
     "и не пересылай в открытых чатах</b> — это полный доступ к отправке."),
    ("24-часовое окно",
     "Правило Meta: свободный текст работает только если клиент тебе писал "
     "в последние 24 часа. За пределами окна — только утверждённые шаблоны "
     "(шаблоны bookgravity уже одобрены, переживать не нужно)."),
    ("Шаблон (template)",
     "Заранее одобренный Meta текст со вставками. Используется для "
     "бронирования, уведомлений тренерам и т.д. Все шаблоны общие для "
     "всех студий — после подключения номера автоматически доступны."),
]))

story.append(Spacer(1, 20))
story.append(Paragraph(
    "Готово. Передай 4 значения супер-админу — и в течение часа в твоей "
    "студии заработает WhatsApp.",
    ParagraphStyle("End", parent=BODY, fontSize=13, fontName=FONT_B,
                   textColor=BRAND, alignment=TA_CENTER)
))

doc.build(story)
print(f"PDF written: {OUT_PDF}")
print(f"Size: {os.path.getsize(OUT_PDF)//1024} KB")
