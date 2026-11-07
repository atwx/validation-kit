# Domain model: rebuilds with a different model

Use this when the new system may be **operated differently** and **structured
differently** from the legacy system, but has to cover the same business – and
especially when one model is to serve several variants (customers,
installations) at once. Examples: a Django database replaced by a configurable
platform that also serves a second customer; an Access database migrated into
a case management module.

Then the catalogue does not describe screens, and flow tests of the legacy
system cannot run unchanged against the rebuild. What carries over is the
**business**: concepts, their states and rules. The domain model makes that
explicit and is the bridge between legacy code, requirements and the new
implementation.

## Files

`domain/NN-<group>.yml`, one file per group of concepts:

```yaml
group: Case file
description: Students, families and their path through counselling and placement.
concepts:
  - id: SchoolApplication
    title: School application
    kind: entity               # entity | process | rule | catalogue … (free)
    scope: core                # where the new system realises it: core | config | extension
    description: One student applies to one school; several per student.
    variants:                  # where each variant keeps it today
      glasmacher: "SchoolApplication (glasmacher/models/placement.py)"
      nottebohm: "Tabelle Schulwahl, Applicationprozess"
    relations:
      - { to: Student, kind: belongs to }
      - { to: School, kind: refers to }
    attributes:
      - { name: interview_date, title: Interview, type: date, variants: { glasmacher: interview_date } }
    states:
      - { name: offered, title: Place offered, note: "Glasmacher: offer_date set" }
```

`vkit.config.mjs`:

```js
domain: {
  variants: [{ id: 'glasmacher', title: 'Glasmacher' }, { id: 'nottebohm', title: 'Nottebohm' }],
  realisations: ['core', 'config', 'extension'],   // default
  shared: ['core', 'config'],                      // default: realised without project code
},
```

Requirements get three optional fields:

```yaml
    domain: [SchoolApplication, SchoolApplication.offered]
    variants: [glasmacher]      # omit when it applies to all variants
    realisation: config         # core | config | extension
```

`vkit check` reports unknown concepts, attributes, states, variants and
realisations, and warns about requirements without realisation. It prints the
**fit** per variant: the share of requirements realised by core and
configuration. The report has a domain page (concepts with attributes, states,
relations, legacy mapping per variant and referring requirements) and the fit
table on the overview.

## Method

1. **Requirements from the legacy code.** Read the code area by area (models,
   views, forms, templates, reports, scheduled jobs). Each business rule,
   calculation, state change, output document and list becomes a requirement
   with a code citation ([catalogue.md](catalogue.md#code-as-source)). Data
   tells what is actually used: fill rates of fields, values in status
   columns, row counts per table. Record such queries as `legacy.evidence`.
   Unused features are listed too, with `risk: low` and a note – the client
   decides whether they go.
2. **Requirements of the other variants.** From their own sources (data
   exports, process diagrams, concepts, interviews). Mark `variants`.
3. **Concepts.** Group what the requirements talk about into concepts. Name
   them by business meaning, not by legacy tables. A legacy field is mapped to
   a concept attribute, a state, a checklist item, a free field (configuration)
   or dropped (with reason). Several legacy columns often become one concept
   (“sent on”, “received on” → states with history).
4. **Realisation.** For every requirement: does the shared core cover it,
   configuration (lists, states, templates, free fields, saved views), or does
   the variant need its own code (extension)? Aim for core + configuration;
   an extension is fine for real business logic (calculation rules,
   interfaces), not for lists and texts.
5. **Compromises in operation.** The rebuild may work differently in the user
   interface. Record it in the behaviour inventory with a target such as
   `adapt` (same business result, different operation) and say what changes
   for the user. Changes of the business result stay `question`.
6. **Tests.** Business rules are rule tests in the new system. Where the
   legacy system computes something (invoices, exports, documents), generate
   golden files from the legacy system with real or anonymised data and
   compare the rebuild's output against them; each comparison names its
   requirement ids. Flow tests are written for the new system and describe the
   business flow; they do not mirror legacy screens.

## What the fit means

The fit is a planning figure, not a test result: it says how much of each
variant the shared model is expected to carry. It becomes evidence once the
requirements are tested in the new system. Keep it honest: a requirement only
counts as `config` when the configuration building block exists or is planned
in the core.
