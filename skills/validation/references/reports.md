# Reports and configuration

## vkit.config.mjs

```js
export default {
  title: 'Testbericht IMS',
  language: 'de',               // 'en' | 'de'
  timeZone: 'Europe/Berlin',
  paths: { behaviour: 'verhalten', sourceFiles: '..' },   // see src/config.mjs for all
  risks: ['hoch', 'mittel', 'niedrig'],
  idPattern: '[A-Z]{2}-\\d{3}',
  numbering: { flowDeviation: 'A_XQ-', ruleDeviation: 'A_RT-' },
  texts: {
    intro: 'HTML for the overview …',
    ruleNote: '…', behaviourIntro: '…', proposalsIntro: '…',
    target_fix: 'Text above the list of fixes …',   // per target value
  },
  labels: { flow: 'Prozess', status: { unit: 'am Modell bestanden' } },
  friendlybase: { spaceId: 'acme-upgrade-report', spaceTitle: 'ACME Upgrade Report' },
  styleSheet: 'report/style.css', // optional own stylesheet
};
```

## Status of a requirement

| Status | Meaning |
|---|---|
| `passed` | At least one flow step covers it, and all covering steps and rule tests passed. |
| `unit` | Only rule tests cover it, all passed (“passed in rule tests”). |
| `deviation` | A covering step or rule test failed (known defects included). |
| `untested` | No test names it. |

Deviations are numbered in protocol order: flow steps first (by flow id and
step), then rule tests; prefixes from `numbering`.

## HTML report (`vkit report`)

`report-out/`: overview, requirement pages, source pages with coverage per
section, flow pages with step table and attachments, rule tests, behaviour and
questions, traceability matrix (+ CSV), `manifest.json` with SHA-256 of every
file and of the input result files.

## FriendlyBase package (`vkit report --fb`)

`report-fb/`: collections for requirements, flows, deviations, rule tests and
proposals with select properties (result, risk, legacy, target), relations and
board/table views; sources and traceability as pages. Collection and property
names follow the language (`anforderungen`, `ergebnis` …). Upload:

```bash
fb push report-fb --space <slug> --mode overwrite --version-name "Run 06.11.2026"
```

Enable confirmations on the space and invite the client with role
“comment” to let them confirm entries.

## Own renderer

`buildModel(cfg)` returns `{ sources, areas, requirements, byId, run, flows,
rules, ruleRun, behaviour, coverage, ruleCoverage, status(id), isCovered(id),
deviations, counts }`. A project with its own protocol format renders this
model itself (see the Schölly IMS validation for an example with the XQ format).
