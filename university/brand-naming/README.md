# Канон нейминга: Gravity Stretching

**Правило (владелец, 11.06.2026):** метод и бренд во ВСЕХ материалах называются **Gravity Stretching**.

## Запрещено
- "assisted stretching", "assisted-stretching studio"
- «ассистированная растяжка», «асистент стретчинг»
- "gravity-assisted" (полуформа — тоже нет)

## Разрешённые формулировки
- Gravity Stretching / gravity stretching (метод)
- spinal decompression in suspension straps / by hanging
- декомпрессия позвоночника в подвисе / в стропах

## Почему
"Assisted stretching" — категория конкурентов (Stretchr — «first assisted stretching brand in Indonesia», StretchLab — глобальная франшиза). Использовать их термин = играть на их поле и размывать бренд. Gravity Stretching — собственная категория (терапевтическая инверсия), бренд = имя метода.

## Исключения (единственные)
1. Verbatim-цитаты клиентов в research/.
2. Фактические описания конкурентов в research/ (их официальные самоназвания).
3. Код bookgravity: `assistedSlots` / "as assistant" = тренер-ассистент на классе (другое понятие).

## Чек перед публикацией
`grep -ri "assisted" <файлы>` — должно быть пусто (вне исключений).

## Где уже вычищено (11.06.2026)
- bookgravity.com: StudioInfo (FAQ, классы, интро), keywords, alt обложек.
- gravitystretching.pro: все 8 болевых страниц + генератор site/pain/_build.mjs.
