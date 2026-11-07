# validation-kit

Show that a rebuilt or upgraded system does what it must – requirement by
requirement, traceable to the documents they come from, compared with the
legacy system.

- **Catalogue**: requirements in YAML, each with a verbatim quote from its source
  (checked against the source text), risk, acceptance criterion and the
  evidenced behaviour of the legacy system. The legacy code itself can be the
  source: quotes are checked per file and linked by line.
- **Domain model** (optional): business concepts shared by several variants
  (customers, installations), with the legacy mapping per variant; per
  requirement the realisation (core, configuration, extension) and the fit of
  the shared model per variant.
- **Behaviour inventory**: for every requirement the target in the new system
  (keep, fix, add, open question, ordered change) and questions for the client.
- **Tests**: Playwright flow tests in protocol form (step, procedure, expected and
  actual result, screenshots), rule tests from any runner via JUnit XML.
- **Report**: static HTML with traceability matrix and checksums, or a
  [FriendlyBase](https://friendlybase.eu) package in which the client comments
  on and confirms each requirement.

Not tied to a stack: the system under test can be anything a browser reaches;
rule tests come from PHPUnit, pytest or any JUnit-writing runner.

## Quick start

```bash
npx -y github:atwx/validation-kit init validation --lang en   # or --lang de
cd validation && npm install && npx playwright install chromium
npx vkit check     # catalogue, quotes, behaviour inventory
npx playwright test
npx vkit report    # report-out/index.html
```

The example in [`examples/library`](examples/library) builds a complete report
from fixtures: `npm run example`.

## Commands

| Command | |
|---|---|
| `vkit init [dir] [--lang en\|de]` | new validation directory with config, example requirement, flow test and inventory |
| `vkit check` | catalogue schema, ids, sources, verbatim quotes, behaviour inventory |
| `vkit report` | HTML report (`report-out/`) |
| `vkit report --fb` | FriendlyBase package (`report-fb/`) |
| `vkit status` | counts per requirement status |
| `vkit junit <file.xml> [--tool T]` | JUnit XML → rule tests |

All commands take `--dir <path>`.

## Claude Code skill

The repository is also a Claude Code plugin with the skill `validation`, which
guides through sources, catalogue, legacy behaviour, tests and report. Install
it from the atwx marketplace:

```text
/plugin marketplace add atwx/silverstripe-gold
/plugin install validation-kit@atwx
```

The skill and its references ([`skills/validation`](skills/validation)) are also
the documentation of the file formats.

## API

```js
import { loadConfig, buildModel, buildHtml, buildFriendlyBase } from '@atwx/validation-kit';
const model = buildModel(await loadConfig('validation'));
```

`buildModel()` returns catalogue, flows, rule tests, coverage, status per
requirement and numbered deviations; a project with its own protocol format
renders it itself.

## License

BSD-3-Clause, © Adiwidjaja Teamworks GmbH
