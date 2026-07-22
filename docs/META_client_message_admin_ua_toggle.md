# Метапромт: переключатель Original/UA на сообщениях клиента для АДМИНА Canggu

Утверждено кнопкой: вариант «заменить» (default Original + тумблер Original/UA; авто-EN и кнопка
Translate у админа для входящих убираются). «Параллельно тренерам» = тот же механизм/вид, что уже
сделан тренерам (Original/ID), только target = украинский, подпись = UA.

## Цель (слова владельца 22.07)

Админ Canggu (владелец, украиноязычный) хочет читать сообщения клиента на украинском прямо в чате -
переключатель **Original / UA** на входящих сообщениях клиента, как у тренеров Original/ID.

## Текущее состояние (что меняем)
- Inbox.tsx: `hasTranslation = role==="ADMIN" && translatedBody != body` -> у АДМИНА входящие
  показываются авто-переведёнными на inboxLanguage (EN), оригинал в футере; плюс on-demand кнопка
  «🌐 Translate» (admin-only, инбаунд). Тренер (сделано ранее) уже имеет Original/ID.

## Что делаем (обобщаем существующий тумблер)
Ввести на `MessageBubble` проп `langToggle?: { target: string; label: string }` вместо булева
`showBahasaToggle`. Вычислять в `Inbox` по роли/студии:
- `role==="TRAINER" && studioSlug==="canggu"` -> `{ target: "id", label: "ID" }` (как сейчас).
- `role==="ADMIN"   && studioSlug==="canggu"` -> `{ target: "uk", label: "UA" }` (новое).
- иначе -> undefined (тумблера нет).
Передавать `langToggle` только для `direction==="INBOUND" && type==="text" && body`.

Поведение при активном `langToggle`:
- По умолчанию активна **Original**: показывается `m.body` (оригинал клиента). ВАЖНО: когда тумблер
  активен, базовый текст = `m.body` ВСЕГДА (для админа это отключает авто-EN как primary для этих
  входящих - «заменить»).
- Вторая кнопка (label = ID/UA): по запросу переводит `m.body` на `target` через
  `/api/whatsapp/translate-preview` `{ text: m.body, targetLang: target }`, кэш per-message,
  назад Original мгновенно.
- Кнопка «🌐 Translate» (admin-only, инбаунд) СКРЫВАЕТСЯ, когда `langToggle` активен (т.е. для
  Canggu-админа на входящих её больше нет; для других студий/сообщений - остаётся как была).

## Что НЕ трогаем
- ИСХОДЯЩИЕ сообщения админа: `hasTranslation`/футер «что получил клиент» - без изменений
  (langToggle только для INBOUND).
- Другие студии, другие роли, отправка, агент, inboxLanguage - без изменений.
- Тренерский Original/ID - работает как был (та же обобщённая кнопка, target id/label ID).
- `uk` = ISO-код украинского для перевода; подпись именно **UA** (метка страны, как просил владелец).

## Реализация
- `app/_components/Inbox.tsx`:
  - `MessageBubble`: проп `showBahasaToggle` -> `langToggle?: {target,label}`. Состояние
    altShown/altText/altLoading (переиспользуем). `baseText = langToggle ? m.body : (hasTranslation
    ? m.translatedBody : m.body)`. primaryText учитывает altShown. Тумблер рендерит label из
    `langToggle.label`; вторая кнопка вызывает перевод на `langToggle.target`. Условие показа
    Translate-кнопки: добавить `&& !langToggle`.
  - Место вызова `<MessageBubble>`: считать `langToggle` по роли/студии (см. выше) и передавать
    только для inbound text.
- Роут `translate-preview` уже есть (targetLang прокидывается; "uk" валиден).

## Проверка (E2E)
1. АДМИН Canggu, чат с входящим не-укр. сообщением: у сообщения клиента тумблер **Original | UA**,
   по умолчанию Original (оригинал клиента, НЕ авто-EN). Кнопки «Translate» на этих входящих нет.
2. Нажать UA -> текст на украинском; назад Original -> оригинал.
3. Исходящие админа - футер «что получил клиент» на месте (не сломан).
4. ТРЕНЕР Canggu - по-прежнему Original/ID, работает.
5. Другие студии/роли - без изменений.
