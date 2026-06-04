# To-follow queue (BFS)

Внутренняя очередь ссылок, найденных внутри уже обработанных источников. Пополняется автоматически на шаге 7 пайплайна (см. METHODOLOGY.md §4).

Формат:

```
- <URL>
  parent: <source-id>
  anchor: "<anchor text>"
  predicted_relevance: X/5
  depth: N
  status: queued | fetched | rejected
  note: (optional) why it's important
```

## Queue

- https://www.bain.com/Images/BB_Prescription_cutting_costs.pdf
  parent: src-20260604-hbr-value-keeping-right-customers
  anchor: "Bain — Prescription cutting costs"
  predicted_relevance: 4/5
  depth: 1
  status: queued
  note: первоисточник цифр по retention-экономике — поднять quality claim'а c-0001 с M до H

- https://www.netpromoter.com/why-net-promoter/know/
  parent: src-20260604-hbr-value-keeping-right-customers
  anchor: "Net Promoter Score"
  predicted_relevance: 2/5
  depth: 1
  status: queued
  note: NPS как метрика лояльности — опционально, маркетинговый домен

## Done

<!-- пусто -->
