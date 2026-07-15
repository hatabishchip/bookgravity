# META: украинский язык админки, per-admin переключатель (утв. 15.07.2026)

## Цель
Админ в Settings выбирает «Interface language: English / Українська». При «Українська» вся ЕГО админка (кроме инбокса) на украинском, включая даты (date-fns/locale/uk). Другие админы/тренеры/клиенты не затронуты. Дефолт en. Любой админ переключает себе сам (per-user, подтверждено владельцем). Инбокс НЕ трогать (подтверждено).

## Архитектура
- User.locale String? (null=en) - миграция: schema + prisma/migrations + прод ALTER + generate.
- Словарь без библиотек: t("English text") - EN-строка = ключ; uk-словарь lib/i18n/uk.ts; нет перевода -> показывается EN (безопасный fallback). Подстановки t("{n} booked", {n}).
- LocaleProvider в admin layout (locale из сессии/БД), hook useT(); переключатель в Settings -> PATCH API -> refresh.
- Даты в админ-разделах через date-fns locale uk (helper useDateLocale).

## Охват (все разделы КРОМЕ инбокса)
AdminShell (меню/навигация), Dashboard, Schedule, Beta-schedule, Bookings, Clients, Memberships, Trainers, Services, Salary, Cashflow, Safes, Ad ROI, Payments (Bank confirmations), WhatsApp-setup, Settings + общие админ-формы: AddClientForm, AddExpenseModal, SellMembershipButton, ReschedulePicker, QueuedClients, ClientBookingRow, StudioSwitcher (если админ-поток).
Перевод: деловой украинский (бронювання, розклад, абонементи, зарплата, витрати). Бренд/имена/номера не переводить.

## НЕ трогать
Inbox.tsx и весь чат-поток; интерфейс тренера; клиентские страницы; WhatsApp-тексты; мобильная оболочка (веб придёт сам).

## Этапы (каждый: npm run build -> E2E превью -> деплой)
1. Инфраструктура + AdminShell + Dashboard + Settings-переключатель.
2. Schedule, Beta-schedule, Bookings, Clients, Memberships + их формы.
3. Salary, Cashflow, Safes, Payments, Ad ROI, Trainers, Services, WhatsApp-setup.
4. Самопроверка: обход всех разделов на uk, греп пропусков, скриншоты владельцу.

## Критерии
Fallback = EN (непереведённая строка никогда не ломает UI); ноль изменений для не-админов; клиентские тексты нетронуты; каждый этап E2E-проверен до деплоя.
