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

## Фаза 1 - Android тест (прямой APK)
1. `eas build -p android --profile preview` → APK (канал preview). Взять ссылку/QR.
2. Отдать владельцу ссылку/файл → тестеры ставят (разрешить неизвестные источники).
3. Тест OTA: мелкая JS-правка → `eas update --channel preview --message "..."` → на телефоне Profile → Check for updates → проверить что подтянулось без переустановки.

## Фаза 2 - iOS тест (TestFlight, Education A5837FW3PP)
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
