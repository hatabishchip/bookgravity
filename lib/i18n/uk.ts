// Ukrainian dictionary for the ADMIN panel (owner 15.07). The English string
// IS the key: `t("Today's Bookings")` - anything missing here silently falls
// back to the English original, so a forgotten string can never break the UI.
// Placeholders use {name} syntax and are interpolated after lookup.
//
// Scope: admin panel only (trainer/client UI and all client-facing WhatsApp
// texts stay English - see docs/META_admin_uk_locale.md).
const uk: Record<string, string> = {
  // ---- Navigation / shell -------------------------------------------------
  "Admin Panel": "Адмін-панель",
  "Dashboard": "Панель",
  "Schedule": "Розклад",
  "Bookings": "Бронювання",
  "Clients": "Клієнти",
  "Member cards": "Абонементи",
  "Trainers": "Тренери",
  "Prices & Services": "Ціни та послуги",
  "Salary": "Зарплата",
  "Cash Flow": "Рух коштів",
  "Safes": "Сейфи",
  "Ad ROI": "Реклама (ROI)",
  "Bank confirmations": "Банківські підтвердження",
  "Settings": "Налаштування",
  "Sign Out": "Вийти",
  "Booking page": "Сторінка бронювання",
  "Admin": "Адмін",
  "Open menu": "Відкрити меню",
  "Close menu": "Закрити меню",
  "Beta": "Бета",

  // ---- Dashboard ----------------------------------------------------------
  "Today's Bookings": "Бронювань сьогодні",
  "Unpaid Today": "Неоплачені сьогодні",
  "Bank to Link": "Банк: до прив'язки",
  "Sessions Today": "Занять сьогодні",
  "Today's Schedule": "Розклад на сьогодні",
  "Manage →": "Керувати →",
  "No sessions today": "Сьогодні занять немає",
  "booked": "записано",
  "Upcoming Sessions": "Найближчі заняття",
  "All →": "Усі →",
  "No upcoming sessions": "Найближчих занять немає",

  // ---- Settings: language switcher ---------------------------------------
  "Interface language": "Мова інтерфейсу",
  "Admin panel only. Trainers and clients always see English.":
    "Лише адмін-панель. Тренери та клієнти завжди бачать англійську.",
  "English": "English",
  "Ukrainian": "Українська",
}

export default uk
