# Changelog

## 0.2.1 – 2026-11-08

- Code quotes are matched with whitespace normalisation only; `<`, `*`, `_` in code no longer break the check

## 0.2.0 – 2026-11-07

For rebuilds with a different model, where the legacy code is the source and
one model is to serve several variants.

- Code as source (`kind: code`): every file is a section, quotes are checked
  per file, the report shows the line and links to it (`url` template)
- Domain model (`domain/`): concepts with attributes, states, relations and
  legacy mapping per variant; requirements name `domain`, `variants`,
  `realisation`; `vkit check` and the report show the fit per variant
  (share realised by core and configuration)
- Skill: reference `domain.md`, the two situations “same model” and
  “different model”
- Not yet in the FriendlyBase package: domain model and fit

## 0.1.0 – 2026-11-07

First version, extracted from the validation of the Schölly IMS upgrade
(Silverstripe 4 → 6).

- Catalogue and source registry in YAML, quote check against the source text
- Behaviour inventory and questions as FriendlyBase collections, with field mapping
- Flow tests for Playwright (`createFlowTest`), plain Playwright tests with requirement ids
- Rule tests from a JSON file or JUnit XML (`vkit junit`)
- HTML report with traceability matrix and checksums, FriendlyBase package
- `vkit init` templates in English and German, skill `validation`
