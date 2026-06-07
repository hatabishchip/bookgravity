"""Минимальная инструкция: 6 шагов, никакой воды."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Image, PageBreak, Table, TableStyle, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

OUT = "/tmp/wa-guide/WhatsApp-Активация.pdf"
IMG = "/tmp/wa-guide/img_ru"

BRAND = HexColor("#2C6E49")
INK = HexColor("#18181B")
MUTED = HexColor("#6B7280")
CODE_BG = HexColor("#F3F4F6")
CODE_BORDER = HexColor("#D1D5DB")
ACCENT = HexColor("#DC2626")

FONT = "Helvetica"
FONT_B = "Helvetica-Bold"
for cand, name in [("/Library/Fonts/Arial Unicode.ttf", "ArialU")]:
    if os.path.exists(cand):
        pdfmetrics.registerFont(TTFont(name, cand))
        FONT = name
        FONT_B = name
        break

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", fontName=FONT_B, fontSize=28, leading=32,
                    textColor=BRAND, spaceAfter=4)
STEP = ParagraphStyle("Step", fontName=FONT_B, fontSize=20, leading=24,
                      textColor=INK, spaceBefore=8, spaceAfter=6)
BODY = ParagraphStyle("Body", fontName=FONT, fontSize=13, leading=18,
                      textColor=INK, spaceAfter=4)
CODE = ParagraphStyle("Code", fontName="Courier", fontSize=11, leading=16,
                      textColor=INK)


def draw_chrome(canvas, doc):
    canvas.saveState()
    w, h = doc.pagesize
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 18, w, 18, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 8)
    canvas.drawRightString(w - 20 * mm, 10 * mm, f"стр. {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=18 * mm, bottomMargin=14 * mm)
doc.addPageTemplates([PageTemplate(
    id="m",
    frames=[Frame(doc.leftMargin, doc.bottomMargin,
                  doc.width, doc.height - 8 * mm,
                  leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0)],
    onPage=draw_chrome,
)])

story = []

# Header
story.append(Paragraph("Активация WhatsApp", H1))
story.append(Paragraph(
    "Получить 2 значения для запуска новой студии. ~30 минут.",
    ParagraphStyle("Sub", fontName=FONT, fontSize=12, textColor=MUTED,
                   spaceAfter=12),
))


def step(num, title, lines, image=None):
    block = []
    block.append(Paragraph(f"{num}. {title}", STEP))
    for ln in lines:
        block.append(Paragraph("· " + ln, BODY))
    if image:
        block.append(Spacer(1, 4))
        block.append(Image(image, width=174 * mm,
                           height=174 * mm * 8 / 14))
    return block


# Шаг 1
story += step(
    1, "Открой бизнес-менеджер",
    [
        "Адрес: <font color='#2C6E49'><b>business.facebook.com/wa/manage/phone-numbers</b></font>",
        "В правом верхнем углу должен быть выбран "
        "<b>GravityStretchingCanggu</b>.",
    ],
    image=f"{IMG}/ru01_phone_numbers.png",
)
story.append(Spacer(1, 6))

# Шаг 2
story += step(
    2, "Жми синюю кнопку справа",
    [
        "Кнопка: <b>«Добавить номер телефона»</b> "
        "(<i>Add phone number</i>).",
    ],
)
story.append(PageBreak())

# Шаг 3
story += step(
    3, "Заполни профиль → Далее",
    [
        "<b>Отображаемое имя</b> — например <i>Gravity Stretching Bali</i>.",
        "<b>Категория</b> — <i>Здоровье и красота</i>.",
        "<b>Описание</b> — пропусти.",
        "Жми <b>Далее</b> (<i>Next</i>).",
    ],
    image=f"{IMG}/ru02_create_profile.png",
)
story.append(PageBreak())

# Шаг 4
story += step(
    4, "Введи номер → Отправить код",
    [
        "<b>Код страны</b>: +62.",
        "<b>Номер</b>: 10 цифр без +62 и без нуля.",
        "<b>Способ</b>: SMS.",
        "Жми <b>Отправить код</b> (<i>Send code</i>).",
    ],
    image=f"{IMG}/ru03_phone_input.png",
)
story.append(PageBreak())

# Шаг 5
story += step(
    5, "Введи 6 цифр из SMS → Подтвердить",
    [
        "SMS придёт за ~30 секунд.",
        "Жми <b>Подтвердить</b> (<i>Verify</i>).",
        "Номер появится в списке как <b>«Подключено»</b>.",
    ],
    image=f"{IMG}/ru04_sms_code.png",
)
story.append(PageBreak())

# Шаг 6
story += step(
    6, "Скопируй 2 значения и отправь",
    [
        "Кликни на свой новый номер в списке.",
        "<b>Phone Number ID</b> — длинная цифра ~16 знаков.",
        "<b>Display phone</b> — номер в формате <i>+62 8123456789</i>.",
    ],
)
story.append(Spacer(1, 8))

# Готовый шаблон для копирования
tbl_style = ParagraphStyle("Tbl", fontName=FONT, fontSize=12, leading=18,
                            textColor=INK)
tpl1 = Paragraph("Подключила номер для <b>[НАЗВАНИЕ СТУДИИ]</b>.", tbl_style)
tpl2 = Paragraph("<font face='Courier' size='12'>Phone Number ID: ____________________</font>",
                 tbl_style)
tpl3 = Paragraph("<font face='Courier' size='12'>Display phone:   +62 ___________</font>",
                 tbl_style)
tbl = Table([[tpl1], [Spacer(1, 6)], [tpl2], [tpl3]], colWidths=[174 * mm])
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
    ("BOX", (0, 0), (-1, -1), 1, CODE_BORDER),
    ("LEFTPADDING", (0, 0), (-1, -1), 16),
    ("RIGHTPADDING", (0, 0), (-1, -1), 16),
    ("TOPPADDING", (0, 0), (-1, -1), 12),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
]))
story.append(Paragraph("Скопируй шаблон, подставь свои значения, отправь:",
                       ParagraphStyle("L", fontName=FONT_B, fontSize=12,
                                      textColor=INK, spaceAfter=6)))
story.append(tbl)
story.append(Spacer(1, 12))
story.append(Paragraph(
    "Готово.",
    ParagraphStyle("End", fontName=FONT_B, fontSize=18, textColor=BRAND,
                   alignment=TA_CENTER, spaceBefore=20),
))

doc.build(story)
print(f"PDF: {OUT}")
print(f"Size: {os.path.getsize(OUT)//1024} KB")
