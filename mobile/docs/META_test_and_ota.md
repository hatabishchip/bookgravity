# META: тест-сборки GravityStretching + OTA-обновления + путь в production

Согласовано 21.06.2026 (метапромт). Стек: Expo SDK 52 + RN 0.76.9, EAS,
owner `hatabishchip`, projectId `538cbb55-1fe3-4195-bed2-b8ece8b0f43d`.
OTA = EAS Update (expo-updates). Каналы в eas.json: `preview` (тест) / `production`.

## Решения владельца
- iOS-тест: **TestFlight** через Apple Team **A5837FW3PP** ("Digitalization of Education in Ukraine", hatabishchip = Admin). Только для теста, не production. iOS-bundle для теста = `com.bookgravity.gravitystretching.test` (чтобы не занять продакшн-id под чужой командой; продакшн-id `com.bookgravity.gravitystretching` зарезервирован под PT).
- Android-тест: **прямой APK** (файл/ссылка, sideload).
- OTA: JS-фиксы мгновенно через кнопку; нативные изменения - редко, через новую сборку (бамп runtimeVersion).
- Тестеры: несколько, email даст владелец.

## Фаза 0 - OTA-механизм в коде ✅ СДЕЛАНО 21.06.2026
- Установлен `expo-updates ~0.27.5`.
- `app.json`: `runtimeVersion.policy = "appVersion"`, `updates.url = https://u.expo.dev/538cbb55-...`.
- `components/UpdateButton.tsx`: кнопка «Check for updates» (check → download → reload), статусы, версия/канал/updateId, no-op в Expo Go/dev.
- `app/_layout.tsx`: тихая авто-проверка+загрузка обновления на старте и при возврате в foreground.
- Кнопка добавлена в `app/(client)/profile.tsx` и `app/(trainer)/profile.tsx`.
- typecheck чистый. Закоммичено + запушено.

## Фаза 1 - Android тест (прямой APK) ✅ СОБРАНО 22.06.2026
- EAS auth: токен hatabishchip в ~/.claude/secure/expo-token.txt (создан через Continue-with-Google).
- `eas build -p android --profile preview` → **APK готов**: https://expo.dev/artifacts/eas/m89bpnG9fSy5AXWH8U00UWieX9aJqA85E2dJBKFJYiY.apk (v1.0.0, versionCode 6, канал preview, build 9b7ea0fb). Keystore сгенерирован EAS (Build Credentials lU7KKWC7yr).
- TODO: отдать тестерам, проверить установку + OTA-цикл (`eas update --channel preview` → кнопка в Profile).

## Фаза 2 - iOS тест (TestFlight) - ⏸️ ОТЛОЖЕНО 22.06.2026
**Заблокировано на Apple-аккаунте.** Education A5837FW3PP: владелец (Account Holder) НЕ hatabishchip (он там только Admin) → owner-only действия (принять обновлённое лиц.соглашение, включить ASC API) недоступны, упирается «на владельца». PT Gravity Stretching Canggu: enrollment ещё не одобрен (ждём переводы). Личный Individual Apple под hatabishchip - не подтверждён в App Store Connect (показывал только Education). **Решение владельца 22.06: iOS отложить, делать под PT после одобрения enrollment** (там hatabishchip = владелец, без блоков). Код-groundwork (.test bundle через app.config.js + профиль testflight в eas.json) уже готов и закоммичен (d62c662) - пригодится позже. NB про iOS-auth: интерактивная 2FA через Bash в этом харнессе не работает; нужен ASC API key (создаётся в браузере владельцем, headless Apple-сессию не читает) ИЛИ ждать PT.

## Фаза 2-OLD - iOS тест (TestFlight, Education A5837FW3PP)
1. EAS логин в Apple Team A5837FW3PP (Apple ID hatabishchip, 2FA от владельца).
2. iOS bundle для теста: `com.bookgravity.gravitystretching.test` (через app config override для preview, чтобы продакшн app.json не менять).
3. Создать app в App Store Connect (Education) → `eas build -p ios --profile preview` (store-signed) → `eas submit -p ios`.
4. Пригласить тестеров по email в TestFlight. OTA-кнопка работает так же (канал preview).

## Фаза 3 - выверить цикл end-to-end
На реальном устройстве: баг → JS-правка → `eas update` → Обновить в приложении → ок. Зафиксировать инструкцию «как пушить фикс» (ниже).

## Фаза 4 (позже) - production
- Android: продакшн-AAB на ревью в Play под PT (отправлено 21.06). После одобрения - promote. OTA-канал `production`.
- iOS: пересобрать под PT после enrollment → App Store. OTA-канал `production`.

## Как пушить фикс тестерам (шпаргалка)
- JS/UI/логика/текст/багфикс: `cd mobile && eas update --channel preview --message "fix: ..."`. Тестер жмёт «Check for updates» (или ловит на следующем запуске). Переустановка НЕ нужна.
- Нативное (новое разрешение, нативная либа, иконка/имя, апгрейд SDK): бамп `version` в app.json (=> новый runtimeVersion) → новая сборка (`eas build`) → раздать заново (APK/TestFlight).
