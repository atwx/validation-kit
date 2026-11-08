# Tests

## Flow tests (Playwright)

```ts
// e2e/flow.ts
import { test } from '@playwright/test';
import { createFlowTest } from '@atwx/validation-kit/playwright';

export const SYSTEM = process.env.SYSTEM ?? 'rebuild';
export const { flowTest } = createFlowTest({
  test,                       // the project's Playwright `test`
  language: 'de',             // labels of attachments and actual results
  system: SYSTEM,             // compared with knownDefect.system
  flowLabel: 'Prozess',       // optional, test title prefix
  blockUrls: [/^https?:\/\/production-host\//], // optional
});
```

```ts
flowTest({ id: '4', title: 'Approval by the process owner', purpose: '…', roles: ['Editor', 'Process owner'], reqs: ['FG-001', 'FG-013'] },
  async ({ page, flow, browser }) => {
    await flow.step('4.1', {
      title: 'Reject the request',
      procedure: 'The process owner opens the request and rejects it with a comment.',
      expected: 'The request is closed as “rejected” and stays visible in the history.',
      reqs: ['FG-013'],
      knownDefect: { system: 'legacy', note: 'The legacy system deletes rejected requests (FG-013).' },
    }, async (s) => {
      await s.check('Status “rejected”', () => expect(page.getByText('rejected')).toBeVisible());
      s.observe('The request shows status “rejected”.');
      await s.evidence('Rejected request', page.getByText('rejected'));
    });
  });
```

- `s.check(label, fn)`: one assertion of the acceptance criterion. A failing
  check ends the step as deviation and (without known defect) the test.
- `s.observe(text)`: sentence for the actual result; without, “As expected.”
- `s.evidence(caption, ...locators)`, `s.evidenceIn(area, …)`, `s.evidenceOf(page, …)`:
  screenshot attachment with the locators framed in red.
- A step that throws outside a check is reported as “Aborted: …”.
- Flows share one database and build on each other: `workers: 1`, and the
  JSON reporter to `test-results/results.json`.
- Page loads aborted by ERR_NETWORK_CHANGED (Docker starting containers) are retried.
- Playwright lists a flow test under the kit's file, not the spec file; select
  single flows by title (`npx playwright test -g "Prozess 3:"`), not by path.
- Tests may run in a container (e.g. the Playwright image in docker compose):
  screenshot paths in the report JSON are resolved next to the report.

Plain Playwright tests count as one-step flows when they name requirements:
`test('…', { annotation: { type: 'req', description: 'AB-001, AB-002' } }, …)`
or an id in the title. A plain test marked with `test.fail('Known bug: …')`
is shown as known defect with that note: the step is not fulfilled, the flow
is not aborted.

## Rule tests

The file `test-results/rule-tests.json` (path: `paths.rules`):

```json
{ "tool": "PHPUnit 12", "finishedAt": "2026-11-06T09:30:00Z",
  "tests": [{ "id": "App\\Tests\\FeeTest::testCap", "class": "App\\Tests\\FeeTest", "method": "testCap",
              "title": "Fee is capped at 10 EUR", "file": "app/tests/FeeTest.php", "line": 18,
              "status": "passed", "message": null, "reqs": ["LN-003"], "targets": [], "timeMs": 41 }] }
```

Write it from any test runner, or convert JUnit XML:

```bash
ddev exec vendor/bin/phpunit --log-junit validation/test-results/junit.xml
npx vkit junit test-results/junit.xml --tool "PHPUnit 12"
pytest --junitxml=validation/test-results/junit.xml
npx vkit junit test-results/junit.xml --tool pytest
```

Requirement ids are taken from test name and class (`[FG-013]`, `FG_013`).
Skipped tests are left out.

## Test data and accounts

Pattern for a ddev project (Playwright `globalSetup`/`globalTeardown`):

1. Refuse to start if test accounts of an earlier run are still in the database.
2. `ddev snapshot --name validation-pre-run`.
3. Create test accounts with random passwords (a fixture script run with
   `ddev exec`), store the passwords in `.auth/` (gitignored).
4. Write `test-results/run.json`: `{ system, systemLabel, baseURL, commit, testData, startedAt }`.
5. Teardown: `ddev snapshot restore validation-pre-run` unless `KEEP_DB=1`;
   add `finishedAt` and `databaseRestored: true` to run.json.
