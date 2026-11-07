---
id: inventory
type: chapter
title: Behaviour inventory
schema:
  ref:
    type: text
    label: Requirement
    required: true
  target:
    type: select
    label: Target
    required: true
    options:
      - { value: keep, label: like the legacy system, color: gray }
      - { value: fix, label: fix, color: blue }
      - { value: add, label: addition, color: purple }
      - { value: question, label: improvement proposal, color: orange }
      - { value: change, label: change (ordered), color: green }
  build:
    type: select
    label: New system
    options:
      - { value: open, label: open, color: gray }
      - { value: as_target, label: as target, color: green }
      - { value: differs, label: differs, color: red }
  questions:
    type: relation
    label: Questions
    collection: questions
---

# Behaviour inventory

One entry per requirement: how the new system behaves compared with the legacy
system. Sections: “Assessment” (why this target), “Implementation” (optional).
