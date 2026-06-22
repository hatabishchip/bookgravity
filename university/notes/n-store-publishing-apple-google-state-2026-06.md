---
id: n-store-publishing-apple-google-state-2026-06
title: Публикация GravityStretching в App Store требует wet-sign employment letter + заверенные EN-переводы Akta/NIB; Google Play отклонял по Misleading Claims
tags: [ops, store-publishing, apple, google-play, compliance]
sources: []
confidence: H
created: 2026-06-20
supersedes: []
superseded_by: null
---

# Публикация GravityStretching: состояние Apple + Google Play на 20.06.2026

Операционная заметка (не research). Полная версия в базе знаний: `~/.claude/projects/-Users-oleksandrdiachuk/memory/project_apple_developer.md`.

App **com.bookgravity.gravitystretching** на юр.лицо **PT GRAVITY STRETCHING CANGGU** (D-U-N-S 781261202).

**Apple Developer enrollment Y2J6Z4TT4P** (case 102916863141, агент Patrick) отклонён 2 раза. Apple требует: (1) employment verification letter на бланке PT с МОКРОЙ подписью + печатью; (2) заверенные английские переводы учредительных документов Akta Pendirian (19 стр.) + NIB. Мои готовые англ-переводы лежат в `~/Downloads/apple-translation/` (4 файла: оригинал+перевод × 2). Формат заверения - по примеру SKOLN (двуязычный укр/англ блок нотариуса). После заверения - смержить 3 PDF, залить на developer.apple.com/contact/file-upload/, затем оплата $99 и EAS iOS build.

**Akta факты:** нотариус BISTOK SITUMORANG S.H., акт No.14 от 22.04.2026, SK AHU-0031466.AH.01.01.TAHUN 2026; Oleksandr Diachuk = Director (99%), Artem Kushdavlatov = Commissioner (1%). **NIB:** 2304260281773, NPWP 1000000009312478, PMA, KBLI 93116 Fitness Center.

**Google Play** отклонял по политике **Misleading Claims** (описание перечисляло несуществующие фичи). Описание сверено с кодом mobile/, исправлено (оставлены реальные: party-бронь partySize, QR-билет, сканер тренера, нотификации тренеру), сохранено в `mobile/store/play-metadata.md`, отправлено на resubmit 18.06.2026.

**Загрузка файлов на Apple/Google формы:** только Playwright `browser_file_upload` или AppleScript native picker; Claude-in-Chrome `file_upload` отвергает /tmp и ~/Downloads.

## Links

- supports: []
- refines: []
- contradicts: []
- generalizes: []
