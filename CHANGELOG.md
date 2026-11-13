# Changelog

## 0.4.0 – 2026-11-13

- Requirement levels (`levels` in the config, `level:` per requirements file with an override per requirement, default the first level), e.g. business behaviour and operating structure. Without levels nothing changes.
- Progress per level and variant: `vkit status` ("Glasmacher: Fachlich 100 %, Bedienstruktur 14 %, gesamt 93 %"), HTML report and FriendlyBase overview ("By level").
- FriendlyBase package: requirement property `level` (`ebene`) and a board "By level".
- `vkit check` rejects unknown level ids.

## 0.3.2

- Plain Playwright tests of one spec file form one flow with a step per test, instead of a flow per test. A failed test is a deviation of its step, not an aborted flow.
- `flowTitles` in the config names these flows by spec file; otherwise the shared describe block or the file name is the title.

## 0.3.1 – 2026-11-13

- FriendlyBase package: ids longer than 90 characters (long test titles) are cut and get a short hash of the full id (FriendlyBase allows 100)

## 0.3.0 – 2026-11-13

- State of the new system: the `build` field of the behaviour inventory is counted per variant and area with the share done (`behaviour.progress`: done, partial, exclude, excludeTargets); HTML overview, `vkit status` and FriendlyBase package (requirement property, board "By state of the new system", counts block and tables on the summary page)
- Without a configured done value among the options (own value names) the counts are shown without a share

## 0.2.3 – 2026-11-08

- Screenshots of flow tests run on another machine or in a container (absolute paths such as `/e2e/test-results/…`) are found next to the Playwright report

## 0.2.2 – 2026-11-08

- Plain Playwright tests marked with `test.fail('…')` count as known defect of the system under test (step not fulfilled, flow not aborted); the description is the note
- Report: plain background for code inside code quotes

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
