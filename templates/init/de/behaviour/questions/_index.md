---
id: questions
type: chapter
title: Rückfragen und Verbesserungsvorschläge
schema:
  ref:
    type: text
    label: Nr.
    required: true
  state:
    type: select
    label: Stand
    options:
      - { value: open, label: offen, color: orange }
      - { value: asked, label: gestellt, color: yellow }
      - { value: answered, label: beantwortet, color: green }
      - { value: proposal, label: Verbesserungsvorschlag, color: purple }
---

# Rückfragen und Verbesserungsvorschläge

Eine Datei je Rückfrage (q-001.md …). Abschnitte: „Frage“, „Hintergrund“,
„Bis zur Klärung“, „Interne Entscheidung“, „Antwort“.
