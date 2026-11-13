// Tests against the example project in examples/library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFriendlyBase, buildHtml, buildModel, checkCatalog, checkDomain, domainFit, junitToRuleTests, loadBehaviour, loadCatalog,
  loadConfig, loadDomain, normalize, resolveConfig, validateBehaviour,
} from '../src/index.mjs';

const EXAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples/library');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vkit-'));

test('example catalogue and behaviour inventory are valid', async () => {
  const cfg = await loadConfig(EXAMPLE);
  const { errors, warnings } = checkCatalog(cfg);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const b = loadBehaviour(cfg);
  assert.deepEqual(validateBehaviour(cfg, b, new Set(['LN-001', 'LN-002', 'LN-003', 'AC-001', 'AC-002', 'AC-003'])), []);
});

test('a quote that is not in the source is an error', async () => {
  const dir = tmp();
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  const file = path.join(dir, 'requirements/01-loans.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('at most five media', 'at most six media'));
  const { errors } = checkCatalog(await loadConfig(dir));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /LN-001: quote not found verbatim in PROC/);
});

test('model: status per requirement, numbered deviations, known defects', async () => {
  const model = buildModel(await loadConfig(EXAMPLE));
  assert.deepEqual(model.counts, { passed: 2, unit: 1, deviation: 2, untested: 1 });
  assert.equal(model.status('LN-001'), 'passed');
  assert.equal(model.status('LN-002'), 'deviation');
  assert.equal(model.status('AC-002'), 'untested');
  assert.equal(model.status('AC-003'), 'unit'); // rule test only
  assert.equal(model.status('AC-001'), 'passed'); // plain Playwright test with id in its title
  assert.deepEqual(model.deviations.map((d) => d.ref), ['D-F-001', 'D-F-002', 'D-R-001']);
  assert.equal(model.deviations[1].step.knownDefectApplied, true);
  assert.equal(model.rules[0].nr, 'R01');
});

test('plain test with test.fail() is a known defect, not an aborted flow', async () => {
  const dir = tmp();
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  const file = path.join(dir, 'test-results/results.json');
  const spec = (title, status, testStatus, annotations) => ({
    title, file: 'x.spec.ts',
    tests: [{ status: testStatus, annotations, results: [{ status, startTime: '2026-11-08T10:00:00Z', duration: 5, attachments: [], errors: status === 'failed' ? [{ message: 'expected 1 to be 2' }] : [] }] }],
  });
  fs.writeFileSync(file, JSON.stringify({ suites: [{ title: 'x.spec.ts', specs: [
    spec('english invoice', 'failed', 'expected', [{ type: 'req', description: 'AC-002' }, { type: 'fail', description: 'Known bug: hard-coded amount' }]),
  ] }] }));
  const model = buildModel(resolveConfig(dir, {}));
  const flow = model.flows.find((f) => f.plain);
  assert.equal(flow.status, 'passed');
  assert.equal(flow.record.steps[0].knownDefectApplied, true);
  assert.equal(flow.record.steps[0].knownDefect.note, 'Known bug: hard-coded amount');
  assert.equal(model.status('AC-002'), 'deviation');
});

test('attachment paths of another machine are resolved next to the Playwright report', async () => {
  const dir = tmp();
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'test-results/flow-1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'test-results/flow-1/shot.png'), 'png');
  const record = {
    id: '9', title: 'Container run', purpose: '', roles: [], reqs: ['AC-002'],
    steps: [{ nr: '9.1', title: 'x', procedure: '', expected: '', reqs: ['AC-002'], actual: '', fulfilled: true, knownDefectApplied: false,
      checks: [], attachments: [{ name: 'Anlage 9.1-1', caption: 'Shot', file: '/e2e/test-results/flow-1/shot.png' }], startedAt: '', durationMs: 1 }],
  };
  const body = Buffer.from(JSON.stringify(record)).toString('base64');
  fs.writeFileSync(path.join(dir, 'test-results/results.json'), JSON.stringify({ suites: [{ title: 'x', specs: [{ title: 'Prozess 9', file: 'x.spec.ts',
    tests: [{ status: 'expected', annotations: [], results: [{ status: 'passed', startTime: '', duration: 1, errors: [], attachments: [{ name: 'flow.json', contentType: 'application/json', body }] }] }] }] }] }));
  const model = buildModel(resolveConfig(dir, {}));
  const att = model.flows[0].record.steps[0].attachments[0];
  assert.equal(att.file, path.join(dir, 'test-results/flow-1/shot.png'));
});

test('unknown requirement ids in tests fail loudly', async () => {
  const dir = tmp();
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  const file = path.join(dir, 'test-results/rule-tests.json');
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  run.tests[0].reqs = ['ZZ-999'];
  fs.writeFileSync(file, JSON.stringify(run));
  assert.throws(() => buildModel(resolveConfig(dir, {})), /ZZ-999/);
});

test('JUnit XML: requirement ids from test names, failures with message', () => {
  const xml = fs.readFileSync(path.join(EXAMPLE, 'fixtures/phpunit.xml'), 'utf8');
  const run = junitToRuleTests(xml, { idPattern: '[A-Z]{2,5}-\\d{3}', tool: 'PHPUnit' });
  assert.equal(run.tests.length, 4);
  const failed = run.tests.find((t) => t.status === 'failed');
  assert.deepEqual(failed.reqs, ['LN-002']);
  assert.equal(failed.title, 'Reserved medium cannot be extended');
  assert.equal(failed.message, 'Failed asserting that false is true.');
  assert.equal(failed.line, 35);
});

test('JUnit XML from pytest: self-closing and skipped test cases', () => {
  const xml = `<testsuites><testsuite name="pytest">
    <testcase classname="tests.test_invoices" name="test_net_amount_INV_001" time="0.2"/>
    <testcase classname="tests.test_invoices" name="test_reference_INV-002" time="0.1"><skipped message="later"/></testcase>
  </testsuite></testsuites>`;
  const run = junitToRuleTests(xml, { idPattern: 'INV-\\d{3}' });
  assert.deepEqual(run.tests.map((t) => [t.status, t.reqs]), [['passed', ['INV-001']], ['skipped', ['INV-002']]]);
});

test('HTML report: pages, manifest and CSV', async () => {
  const out = tmp();
  const r = buildHtml(buildModel(await loadConfig(EXAMPLE)), out);
  for (const f of ['index.html', 'matrix.html', 'matrix.csv', 'behaviour.html', 'tests/rules.html', 'tests/flow-1.html', 'requirements/ln-003.html', 'sources/proc.html', 'manifest.json', 'style.css']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /D-F-002/);
  assert.match(index, /known defect: Kept like the legacy system/);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  assert.ok(manifest.files['index.html']);
  assert.equal(r.deviations, 3);
});

test('FriendlyBase package: stable entry ids and relations', async () => {
  const out = tmp();
  buildFriendlyBase(buildModel(await loadConfig(EXAMPLE)), out);
  const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
  assert.match(read('space.yml'), /id: library-rebuild-validation-report/);
  const req = read('requirements/req-ln-003.md');
  assert.match(req, /^id: req-ln-003$/m);
  assert.match(req, /proposals:\n {2}- proposal-q-001/);
  assert.ok(fs.existsSync(path.join(out, 'deviations/dev-1-3.md')));
  assert.ok(fs.existsSync(path.join(out, 'rule-tests/rule-app-tests-extensiontest-reserved-medium-cannot-be-extended-ln-002.md')));
});

test('German labels', async () => {
  const cfg = resolveConfig(EXAMPLE, { language: 'de' });
  assert.equal(cfg.t.status.untested, 'ungetestet');
  assert.equal(cfg.locale, 'de-DE');
  const overridden = resolveConfig(EXAMPLE, { language: 'de', labels: { flow: 'Prozess', status: { unit: 'am Modell bestanden' } } });
  assert.equal(overridden.t.flow, 'Prozess');
  assert.equal(overridden.t.status.unit, 'am Modell bestanden');
  assert.equal(overridden.t.status.passed, 'bestanden');
});

test('normalize ignores Markdown emphasis, dashes and soft hyphens', () => {
  assert.equal(normalize('A **member** may­ borrow – at most'), normalize('A member may borrow - at most'));
});

test('code source: files are sections, quotes are checked per file and located by line', async () => {
  const cfg = await loadConfig(EXAMPLE);
  const model = buildModel(cfg);
  assert.deepEqual(model.sources.LEG.sections.map((s) => s.no), ['loan.php']);
  const cite = model.byId['LN-002'].sources.find((s) => s.doc === 'LEG');
  assert.equal(cite.line, 18);
  assert.equal(cite.url, 'https://git.example.org/library/legacy/src/2.4.1/loan.php#L18');

  const dir = tmp();
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  const file = path.join(dir, 'requirements/01-loans.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('return $days * FEE_PER_DAY;', 'return min(10, $days * FEE_PER_DAY);').replace('section: loan.php\n        quote: "if', 'section: lend.php\n        quote: "if'));
  const { errors } = checkCatalog(await loadConfig(dir));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /LN-001: LEG has no section lend.php/);
  assert.match(errors[1], /LN-003: quote not found verbatim in LEG/);
});

test('domain model: references, variants, realisation and fit per variant', async () => {
  const cfg = await loadConfig(EXAMPLE);
  const domain = loadDomain(cfg);
  const { requirements } = loadCatalog(cfg);
  assert.deepEqual(checkDomain(cfg, domain, requirements), { errors: [], warnings: [] });
  assert.equal(domain.resolve('Loan.extensions').member.title, 'Extensions');
  assert.equal(domain.resolve('Loan.open').member.title, 'open');
  const fit = domainFit(cfg, requirements);
  assert.deepEqual(fit.map((x) => [x.variant.id, x.total, x.shared, Math.round(x.share * 100)]), [['city', 6, 5, 83], ['campus', 4, 4, 100]]);

  const broken = requirements.map((r) => (r.id === 'AC-001' ? { ...r, domain: ['Loan.colour'], variants: ['mobile'], realisation: 'magic' } : r));
  const { errors } = checkDomain(cfg, domain, broken);
  assert.deepEqual(errors, ['AC-001: Loan.colour is not in the domain model', 'AC-001: unknown variant mobile', 'AC-001: unknown realisation magic']);
});

test('HTML report: domain page with fit table and concept sections', async () => {
  const out = tmp();
  buildHtml(buildModel(await loadConfig(EXAMPLE)), out);
  const page = fs.readFileSync(path.join(out, 'domain.html'), 'utf8');
  assert.match(page, /id="c-loan"/);
  assert.match(page, /City library<\/td><td class="num">6<\/td>/);
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /83 %/);
  assert.match(fs.readFileSync(path.join(out, 'sources/leg.html'), 'utf8'), /line 18/);
});

test('code quotes keep angle brackets and markup characters', async () => {
  const dir = tmp();
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'legacy/loan.php'), "\n$label = $days < 3 ? '<b>soon</b>' : '*late*';\n");
  const file = path.join(dir, 'requirements/01-loans.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('quote: "return $days * FEE_PER_DAY;"', `quote: "$label = $days < 3 ? '<b>soon</b>' : '*late*';"`));
  const { errors } = checkCatalog(await loadConfig(dir));
  assert.deepEqual(errors, []);
});

test('progress of the new system from the build field, per variant and area', async () => {
  const model = buildModel(await loadConfig(EXAMPLE));
  const p = model.progress;
  assert.equal(p.all.total, 6);
  assert.equal(p.all.counts.as_target, 5);
  assert.equal(p.all.counts.open, 1);
  assert.equal(p.all.done, 5);
  assert.equal(p.variants.length, 2);
  assert.equal(p.rows()[0].at(-1), `${Math.round((p.variants[0].done / p.variants[0].counted) * 100)} %`);
  const out = tmp();
  buildFriendlyBase(model, out);
  const req = fs.readFileSync(path.join(out, 'requirements/req-ln-001.md'), 'utf8');
  assert.match(req, /^build: as_target$/m);
  const views = fs.readFileSync(path.join(out, 'requirements/_views.yml'), 'utf8');
  assert.match(views, /group_by: build/);
  assert.match(fs.readFileSync(path.join(out, '_index.md'), 'utf8'), /\[!counts\|build\]/);
});

test('excluded build values and targets are left out of the share', async () => {
  const cfg = await loadConfig(EXAMPLE);
  cfg.behaviour.progress = { ...cfg.behaviour.progress, exclude: ['open'] };
  const p = buildModel(cfg).progress;
  assert.equal(p.all.counted, 5);
  assert.equal(p.all.share, 1);
});
