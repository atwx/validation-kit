// Tests against the example project in examples/library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFriendlyBase, buildHtml, buildModel, checkCatalog, junitToRuleTests, loadBehaviour, loadConfig, normalize,
  resolveConfig, validateBehaviour,
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
