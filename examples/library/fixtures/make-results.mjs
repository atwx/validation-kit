// Writes example test results into test-results/, as a Playwright run with
// flowTest() and a PHPUnit run (JUnit XML, converted by `vkit junit`) would.
//   node fixtures/make-results.mjs && vkit junit fixtures/phpunit.xml --tool "PHPUnit 12"
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '../test-results');
fs.mkdirSync(dir, { recursive: true });
const at = (min) => new Date(Date.UTC(2026, 10, 6, 9, min)).toISOString();

const step = (nr, title, reqs, fulfilled, actual, extra = {}) => ({
  title, procedure: extra.procedure ?? '', expected: extra.expected ?? title, reqs, nr, actual, fulfilled,
  knownDefectApplied: !!extra.knownDefect && !fulfilled, knownDefect: extra.knownDefect,
  checks: extra.checks ?? [], attachments: [], startedAt: at(Number(nr.split('.')[1] ?? 0)), durationMs: 1200,
});

const flows = [
  {
    id: '1', title: 'Lend and extend', purpose: 'A member borrows media and extends a loan.', roles: ['Member', 'Front desk'],
    reqs: ['LN-001', 'LN-002'], system: 'rebuild', specFile: 'e2e/01-lend-extend.spec.ts',
    steps: [
      step('1.1', 'Borrow five media', ['LN-001'], true, 'Five loans open.', { procedure: 'Front desk lends five media to the test member.', expected: 'All five loans are booked.' }),
      step('1.2', 'Sixth loan is refused', ['LN-001'], true, 'Message “Limit of five media reached”.', {
        procedure: 'Front desk tries to lend a sixth medium.', expected: 'The loan is refused with a message.',
        checks: [{ label: 'Error message shown', ok: true }, { label: 'No sixth loan booked', ok: true }],
      }),
      step('1.3', 'Extend a reserved medium', ['LN-002'], false, 'Not met: extension refused.', {
        procedure: 'Another member reserves medium 3; the test member extends it.', expected: 'The extension is refused.',
        checks: [{ label: 'Extension refused', ok: false, error: 'expected "refused", got "extended until 2026-12-31"' }],
      }),
    ],
  },
  {
    id: '2', title: 'Return late', purpose: 'A member returns a medium 30 days late.', roles: ['Front desk'],
    reqs: ['LN-003'], system: 'rebuild', specFile: 'e2e/02-return-late.spec.ts',
    steps: [
      step('2.1', 'Return 30 days late', ['LN-003'], false, 'Fee 15.00 EUR. Not met: fee capped at 10 EUR.', {
        procedure: 'Front desk books the return of a medium due 30 days ago.', expected: 'The fee is 10.00 EUR.',
        knownDefect: { system: 'rebuild', note: 'Kept like the legacy system until proposal Q-001 is decided.' },
      }),
    ],
  },
];

const attachment = (record) => ({ name: 'flow.json', contentType: 'application/json', body: Buffer.from(JSON.stringify(record)).toString('base64') });
const report = {
  suites: [{
    title: '', file: '', specs: [], suites: [
      ...flows.map((f) => ({
        title: f.specFile, file: f.specFile, specs: [{
          title: `Flow ${f.id}: ${f.title}`, file: f.specFile, tests: [{
            annotations: [{ type: 'req', description: f.reqs.join(', ') }],
            results: [{ status: f.steps.some((s) => !s.fulfilled && !s.knownDefectApplied) ? 'failed' : 'passed', startTime: at(0), duration: 9100, attachments: [attachment(f)], errors: [] }],
          }],
        }],
      })),
      {
        title: 'e2e/accounts.spec.ts', file: 'e2e/accounts.spec.ts', specs: [{
          // A plain Playwright test: the requirement id in the title links it
          title: 'member cannot open the loans of another member AC-001', file: 'e2e/accounts.spec.ts', tests: [{
            annotations: [], results: [{ status: 'passed', startTime: at(20), duration: 2100, attachments: [], errors: [] }],
          }],
        }],
      },
    ],
  }],
};
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({
  system: 'rebuild', systemLabel: 'Library rebuild (Silverstripe 6) in ddev', baseURL: 'https://library.ddev.site',
  commit: 'a1b2c3d', testData: 'fixed test data set (seed/base.yml)', startedAt: at(0), finishedAt: at(25), databaseRestored: true,
}, null, 2));
console.log('test-results/results.json, test-results/run.json');
