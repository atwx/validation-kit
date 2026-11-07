---
name: validation
description: Validate a system rebuild or upgrade against the legacy system with @atwx/validation-kit - collect sources, derive a requirements catalogue with verbatim quotes, record legacy behaviour and the target behaviour of the new system, write flow tests (Playwright) and rule tests (PHPUnit, pytest via JUnit XML), and build a traceable report (static HTML or FriendlyBase package for client review). Use when a system is rebuilt, migrated to another framework or upgraded and the result has to be shown to behave as required, when the user mentions validation, acceptance, requirements catalogue, traceability, test report, legacy behaviour or vkit.
---

# Validation of a rebuild with validation-kit

The method: every requirement comes from a source with a verbatim quote, every
requirement has a testable acceptance criterion, tests name the requirements
they check, and the report shows for each requirement what was tested, with
which result, and how the new system relates to the legacy one. The legacy
system is the reference: the rebuild keeps its behaviour unless it is
obviously wrong, and anything beyond that is a proposal for the client.

The kit is a Node package with the `vkit` command. It lives in a `validation/`
directory of the project (or the directory the user names) with its own
`package.json`.

## 0. Orient

Before writing anything, find out and note in `validation/README.md`:

- What is rebuilt or upgraded, from what to what (e.g. Django app → Silverstripe 6).
- Where the legacy system runs (ddev project, URL, branch), where the new one will run.
- Which inputs exist (see [references/inputs.md](references/inputs.md)): specifications,
  work instructions, regulations, task maps or spreadsheets, interviews, the legacy
  code and its data, existing tests.
- Which of them may be committed. Client documents with personal data or
  confidential content stay out of git (`.gitignore`); the catalogue quotes only
  what is needed.
- The report language (`language: 'de'` or `'en'`) and who reads the report.
- Whether the client accepts automated test evidence. Regulated clients often
  require manual execution and signatures; then the flow tests are the
  rehearsal and the template for the manual protocol, not the evidence.

Decide which of two situations applies:

- **Same model, new technology** (upgrade, port): the rebuild keeps the legacy
  behaviour, the same flow tests run against both systems. Follow the phases
  below as written.
- **Different model** (the rebuild may be operated and structured
  differently, often to serve several customers or installations): the
  business has to be covered, not the screens. Often the legacy code is the
  only source. Add a domain model and follow
  [references/domain.md](references/domain.md) in phases 1–4.

Then: `npx -y github:atwx/validation-kit init validation --lang de` (or `en`), `cd validation && npm install`.

## 1. Sources

Register every source in `sources/sources.yml` with its outline (`sections`),
so the report can show coverage per section. Make the text available for the
quote check: `file` (docx/pdf/md, converted once) or `sources/text/<id>.txt`.
Sources without text (interviews, workshops, observations) are listed too;
requirements cite them with `quote_type: paraphrase`. The legacy code itself
can be a source (`kind: code`, quotes checked per file).

## 2. Requirements catalogue

One YAML file per area in `requirements/` (schema: [references/catalogue.md](references/catalogue.md)).

- One requirement = one testable statement. Split compound sentences.
- `acceptance` describes an observable result, not an implementation.
- Quote verbatim; `vkit check` fails if the quote is not in the source.
- `risk` by impact on the business or compliance, not by effort.
- Requirements the legacy system must have but does not fulfil are still
  requirements; they get `legacy.status: not_met` with evidence.

Run `npx vkit check` after every change.

## 3. Legacy behaviour and target

For each requirement, determine how the legacy system behaves: read its code,
query its data, try it out. Record it in the catalogue (`legacy.status`,
`legacy.evidence` with file and line, query or test run) – only when shown, never assumed.

Then one entry per requirement in the behaviour inventory
(`behaviour/inventory/`, schema: [references/behaviour.md](references/behaviour.md)) with the target:

| Target | When |
|---|---|
| `keep` | Default. The rebuild behaves like the legacy system, also where it misses the criterion. |
| `fix` | The legacy behaviour is obviously wrong: data loss, contradiction to a binding document, security hole, crash. |
| `add` | Something missing that changes no process (e.g. a search field). |
| `question` | The criterion asks for a change of behaviour. Keep the legacy behaviour and write a question or improvement proposal (`behaviour/questions/`) for the client. |
| `change` | The client ordered the change (cite the order as source). |

Do not decide `question` items yourself, and do not build them before the
client has answered. Collect them and present them together, ideally once the
rebuild runs on a test system.

## 4. Tests

Two kinds, both naming requirement ids ([references/tests.md](references/tests.md)):

- **Flow tests** (Playwright, `flowTest()` from `@atwx/validation-kit/playwright`):
  one test per business flow, one step per protocol step with procedure,
  expected result, checks and screenshots. Run them against the **legacy system
  first**: they must describe its behaviour. Where the legacy system misses a
  criterion, mark the step `knownDefect: { system: 'legacy', note }`. Then run
  the same tests against the rebuild.
- **Rule tests** in the stack of the new system (PHPUnit, pytest …): business
  rules on models and services, with the requirement id in the test name
  (`#[TestDox('Rejected requests stay on record [FG-013]')]`,
  `test_rejected_requests_FG_013`). Export JUnit XML and convert it with
  `npx vkit junit <file.xml> --tool "PHPUnit 12"`.

Existing Playwright tests count as well: give them an annotation
`{ type: 'req', description: 'AB-001' }` or put the id into the title.

Test data: run against a known database state and restore it afterwards (e.g.
`ddev snapshot` in a global setup, restore in teardown); create test accounts
with random passwords that never land in git.

Never change an expected result to make a test pass. A failing step is a
deviation; it is fixed in the system, accepted as known defect, or turned into
a question.

## 5. Report

```bash
npx vkit report        # static HTML in report-out/ with manifest.json (checksums)
npx vkit report --fb   # FriendlyBase package in report-fb/
npx vkit status        # counts per status
```

The FriendlyBase package lets the client comment on and confirm every
requirement, flow test and proposal (`fb push report-fb --space <slug>
--mode overwrite --version-name "Run <date>"`). Entry ids are stable across
runs, so comments and confirmations survive a new upload.

Texts for the report (introduction, explanations) go into `texts` in
`vkit.config.mjs`; labels can be overridden with `labels`
([references/reports.md](references/reports.md)). When a project needs a report
in its own protocol format, it builds its own renderer on `buildModel()`
instead of patching the kit.

## 6. Keep it honest

- Report what the tests show. An untested requirement is “untested”, not “passed”.
- A requirement covered only by rule tests is shown as such (“passed in rule tests”),
  not as passed in a flow.
- Keep notes and texts current: when a statement in the report is no longer true,
  change it in the same commit as the code.
- Commit catalogue, inventory, tests and config; do not commit test results,
  reports, credentials or client personal data.
