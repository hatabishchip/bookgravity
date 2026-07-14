---
id: n-local-native-build-android-ios-2026-07
title: Локальная сборка Android (.aab) / iOS (.ipa) на Mac через eas build --local, без облачных кредитов EAS
confidence: H
date: 2026-07-14
tags: [build, eas, android, ios, tooling, gradle]
---

# Локальная нативная сборка приложения (Android/iOS) на Mac

**Когда:** облачные сборки EAS исчерпаны (бесплатный тариф - лимит на месяц, сброс 1-го числа). Локальная сборка бесплатна и без лимитов. Проверено 14.07.2026 на bookgravity mobile (Expo SDK 54, RN 0.81.5): Android `.aab` (74 МБ) собран локально и отправлен в Play.

**Где можно собирать:**
- Android - где угодно (Mac / Linux-облако / любая машина с JDK+Android SDK); `.aab` идентичный, подпись из того же keystore.
- iOS - ТОЛЬКО на Mac с полным Xcode (требование Apple). На 14.07 локально ещё не настроено (стоит лишь Command Line Tools).

**Рецепт Android (кратко, полный - в личной памяти [[tooling-local-app-build]]):**
1. `brew install openjdk@17 android-commandlinetools`
2. `sdkmanager --sdk_root=$ANDROID_HOME --licenses` + `platform-tools`, `platforms;android-35`, `build-tools;35.0.0` (версия SDK = compileSdk из expo-build-properties).
3. Env: `JAVA_HOME=/opt/homebrew/opt/openjdk@17`, `ANDROID_HOME=$HOME/Library/Android/sdk`.
4. **Критично:** `~/.gradle/gradle.properties` → `org.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=2048m`. Дефолтный Expo-проект даёт лишь 512m metaspace → gradle-демон циклично `OutOfMemoryError: Metaspace`, виснет на `:app:mergeDexRelease`, и это же роняет `lintVitalAnalyzeRelease FAILED`. Поднятие памяти чинит и то, и другое.
5. `EAS_LOCAL_BUILD_SKIP_CLEANUP=1 eas build --platform android --profile production --local --non-interactive --output=./build.aab` (первая ~50 мин, компилирует C++ reanimated/worklets под 2 ABI; keystore/креды - remote, интерактива нет).
6. `eas submit --platform android --path ./build.aab` (track internal) → `promote_review.mjs`.

**Урок:** «сборка не идёт / зависла на mergeDexRelease / lintVital FAILED» на локальном Android-билде = почти всегда нехватка gradle metaspace, а не медленность и не реальная ошибка lint. Первым делом поднять память gradle, потом уже искать другое.
