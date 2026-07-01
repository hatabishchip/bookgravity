---
id: n-booking-phone-otp-device-trust-2026-07
title: Booking-виджет - ввод любого номера (196 стран), WhatsApp-OTP как единственный гейт, доверие номера на устройстве 400 дней
tags: [ops, booking-widget, whatsapp-otp, phone, device-trust, architecture]
sources: []
confidence: H
created: 2026-07-01
supersedes: []
superseded_by: null
---

# Booking phone + WhatsApp-OTP + доверие устройства (состояние 01.07.2026)

Операционно-архитектурная заметка (не research). Полная версия в базе знаний: `~/.claude/projects/-Users-oleksandrdiachuk/memory/reference_bookgravity_otp_whatsapp.md`.

Как работает подтверждение телефона клиента в публичном booking-виджете bookgravity (repo `~/Documents/Claude/bookgravity`).

## Ввод номера (lib/phone.ts)
- `PHONE_COUNTRIES` = полная база всех стран мира (**196 стран**). Для любого кода показывается флаг + название. Флаги строятся из ISO-кода функцией `isoToFlag` (regional indicators), данные в `RAW_COUNTRIES` (tuple `[code, iso, name, min, max]`). Точные min/max для основных рынков (Индонезия/Украина/РФ/…), разумные диапазоны для остальных.
- Принимается **ЛЮБОЙ** номер: некурируемый код → `INTL_FALLBACK` (🌍 International), валиден при 8-15 цифрах E.164. WhatsApp-проверка = единственный настоящий фильтр, а не список стран.
- `PhoneInput.tsx` (форма тренера/админка/продажа абонемента) тоже принимает любой номер до 15 цифр (снят старый жёсткий блок на 3 цифрах для некурируемого кода).

## WhatsApp-OTP (единственный гейт)
- Код уходит АВТО, один раз, через **дебаунс 1.1с** после того как клиент перестал печатать (не на каждой цифре - старый флуд выбивал rate-limit). `app/_components/BookingWidget.tsx`, эффект на `[form.clientPhone, step]`.
- Детект «нет WhatsApp»: Meta принимает отправку, вебхук доставки пишет статус в `BookingOtp` (sent/delivered/read/**failed**). `failed` = номера нет в WhatsApp → показываем «not on WhatsApp», поле кода прячем. Поллинг `GET /api/otp/status`; окно ожидания статуса **12с** (6×2с), чтобы медленный `failed` пришёл ДО показа поля кода.
- Rate limits (`app/api/otp/send/route.ts`): **15/час на IP** (студийный wifi = один IP на клиентов), **10/день на номер** (главный анти-спам).
- Проверка качества номера у Meta: `GET graph.facebook.com/v21.0/{phoneNumberId}?fields=quality_rating,status,messaging_limit_tier` с per-studio токеном (`Studio.whatsappAccessToken`; `getConfigFor`). phoneNumberId Чангу = `1163623746829979`, был GREEN/CONNECTED/APPROVED.

## Доверие устройства - не вводить код повторно (lib/otp-session.ts)
- После верификации номер запоминается на устройстве в подписанной **httpOnly-куке `gs_otp_session`**. TTL = **400 дней** (жёсткий потолок куки в браузерах, «вечно» невозможно), **скользящий** - каждый verify/бронь/session-check продлевает ещё на 400 дней → для активного клиента фактически навсегда.
- Кука хранит **список** номеров (до 8) → общий телефон помнит несколько номеров. Студийно-скоупленная, подписана `AUTH_SECRET`.
- Бронирование пускает без кода по `hasOtpSession` (`app/api/bookings/route.ts`, строка ~150: `sessionOk` пропускает `verifyBookingOtp`).
- Виджет при вводе номера сначала дёргает `GET /api/otp/session?phone&studio` - если устройство уже доверяет номеру: пускает без кода + подставляет имя/email + продлевает сессию. Новый/неизвестный номер = код один раз, потом добавляется в список.
- Хелпер `getVerifiedClientDetails` (`lib/client-lookup.ts`) - privacy-safe поиск имени/email/абонемента по хвосту номера, общий для `otp/verify` и `otp/session` (данные отдаются ТОЛЬКО после доказанного владения номером).

## Уроки
- НЕ тестировать фейковыми номерами: Meta возвращает `failed`, в объёме роняет качество WABA.
- Флуд отправок (код на каждой длине по мере набора) выбивал старый лимит 8/час → «не приходят коды даже на реальный номер». Дебаунс + лимит 15/час решили.

## Links
- supports: []
- refines: []
- contradicts: []
- generalizes: []
