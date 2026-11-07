# Behaviour inventory and questions

Two collections in FriendlyBase package format under `behaviour/` (path:
`paths.behaviour`): a directory with `_index.md` (frontmatter `schema`) and one
Markdown file per entry. They can be edited in any editor or Obsidian and
imported into FriendlyBase.

## behaviour/inventory/<id>.md

```markdown
---
id: inv-fg-013
title: FG-013 Rejected requests stay on record
ref: FG-013          # requirement id (fields.ref)
target: question     # fields.target, values from the schema
build: as_target     # fields.build: state of the new system (optional)
questions: [q-008]   # fields.questions: linked questions
---

## Assessment

Why this target. For `keep`: what the legacy system does. For `fix`: what is
obviously wrong. For `question`: what the criterion asks and why it is not decided.

## Implementation

Optional: how the new system implements the target, with rule tests that prove it.
```

## behaviour/questions/<id>.md

```markdown
---
id: q-008
title: Keep rejected approval requests?
ref: Q-008
state: proposal      # open | asked | answered | proposal (fields.state)
---

## Question
## Background
## Until clarified      (what the new system does meanwhile: usually the legacy behaviour)
## Internal decision    (optional)
## Answer               (the client's answer, with date)
```

`vkit check` validates required fields and select values against the schemas,
that every requirement has exactly one inventory entry, that references between
inventory, questions and catalogue exist, and that a `question` target links a question.

## Different field or section names

A German project can name fields and sections differently; map them in
`vkit.config.mjs`:

```js
behaviour: {
  inventory: 'inventar', questions: 'rueckfragen',
  fields: { ref: 'ref', target: 'ziel', build: 'neubau', questions: 'rueckfragen', state: 'stand', requirements: 'anforderungen' },
  sections: { assessment: 'Einordnung', implementation: 'Neubau', question: 'Frage', background: 'Hintergrund',
              interim: 'Bis zur Klärung', decision: 'Interne Entscheidung', answer: 'Antwort' },
  keepTarget: 'wie_altsystem', questionTarget: 'rueckfrage', proposalState: 'vorschlag', answeredState: 'beantwortet',
},
```

Rule tests can prove the target behaviour instead of the criterion (for `keep`
and `question` targets where the legacy behaviour misses the criterion): list
the requirement under `targets` instead of `reqs` in the rule-test file. They
are shown on the requirement page but do not count as proof of the criterion.
