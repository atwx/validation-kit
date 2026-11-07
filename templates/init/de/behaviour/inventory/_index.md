---
id: inventory
type: chapter
title: Verhaltensinventar
schema:
  ref:
    type: text
    label: Anforderung
    required: true
  target:
    type: select
    label: Ziel
    required: true
    options:
      - { value: keep, label: wie Altsystem, color: gray }
      - { value: fix, label: Fehlerbehebung, color: blue }
      - { value: add, label: Ergänzung, color: purple }
      - { value: question, label: Verbesserungsvorschlag, color: orange }
      - { value: change, label: Änderung (beauftragt), color: green }
  build:
    type: select
    label: Neubau
    options:
      - { value: open, label: offen, color: gray }
      - { value: as_target, label: wie Ziel, color: green }
      - { value: differs, label: abweichend, color: red }
  questions:
    type: relation
    label: Rückfragen
    collection: questions
---

# Verhaltensinventar

Ein Eintrag je Anforderung: wie sich der Neubau gegenüber dem Altsystem verhält.
Abschnitte: „Einordnung“ (warum dieses Ziel), „Umsetzung“ (optional).
