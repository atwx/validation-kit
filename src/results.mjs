// Test results: flow tests from the Playwright JSON reporter and rule tests
// from a rule-test file (format: skills/validation/references/tests.md), which
// JUnit XML converts into.
import fs from 'node:fs';
import { naturalCompare, readJson } from './util.mjs';

export const FLOW_ATTACHMENTS = ['flow.json', 'xq.json'];

/**
 * Flow tests of a Playwright JSON report. A test written with flowTest()
 * carries its steps as a `flow.json` attachment. A plain Playwright test
 * counts as a flow with one step when it names requirements, either as
 * annotation { type: 'req', description: 'AB-001, AB-002' } or in its title.
 */
export function loadFlows(file, { idPattern } = {}) {
  const report = readJson(file, { suites: [] });
  const idRe = idPattern ? new RegExp(`\\b${idPattern}\\b`, 'g') : null;
  const flows = [];
  (function walk(suite, titles) {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const res = t.results.at(-1);
        if (!res) continue;
        const att = res.attachments.find((a) => FLOW_ATTACHMENTS.includes(a.name));
        if (att) {
          const record = JSON.parse(Buffer.from(att.body, 'base64').toString('utf8'));
          record.id ??= record.process;
          flows.push({ id: String(record.id), record, status: res.status, startTime: res.startTime, duration: res.duration, file: spec.file });
          continue;
        }
        const plain = plainFlow(spec, t, res, titles, idRe);
        if (plain) flows.push(plain);
      }
    }
    for (const s of suite.suites ?? []) walk(s, [...titles, s.title]);
  })({ suites: report.suites }, []);
  flows.sort((a, b) => naturalCompare(a.id, b.id));
  return flows;
}

function plainFlow(spec, t, res, titles, idRe) {
  const annotated = (t.annotations ?? []).filter((a) => a.type === 'req').flatMap((a) => String(a.description).split(/[\s,]+/)).filter(Boolean);
  const fromTitle = idRe ? [...spec.title.matchAll(idRe)].map((m) => m[0]) : [];
  const reqs = [...new Set([...annotated, ...fromTitle])];
  if (!reqs.length || res.status === 'skipped') return null;
  const passed = res.status === 'passed';
  const error = (res.errors ?? [])[0]?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0];
  const id = [...titles.filter(Boolean).slice(1), spec.title].join(' › ');
  const step = {
    nr: '1', title: spec.title, procedure: '', expected: spec.title, reqs, actual: passed ? '' : error ?? res.status,
    fulfilled: res.status === 'passed', knownDefectApplied: false, checks: [], attachments: [], startedAt: res.startTime, durationMs: res.duration,
  };
  return {
    id, plain: true, status: passed ? 'passed' : res.status, startTime: res.startTime, duration: res.duration, file: spec.file,
    record: { id, title: spec.title, purpose: '', roles: [], reqs, steps: [step], specFile: spec.file },
  };
}

/**
 * Rule tests: { tool, finishedAt, tests: [{ id, class, method, title, file,
 * line, status, message, reqs, targets, timeMs }] }, or null without file.
 */
export function loadRuleTests(file) {
  const run = readJson(file, null);
  if (run) for (const r of run.tests) { r.reqs ??= []; r.targets ??= []; }
  return run;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : undefined;
}

/**
 * Converts JUnit XML (PHPUnit --log-junit, pytest --junitxml, Django
 * test runners with a JUnit reporter …) into the rule-test format.
 * Requirement ids are taken from the test name (e.g. a TestDox title
 * "Rejected requests stay on record [FG-013]", or a method name
 * test_rejected_requests_FG_013) and the class name.
 * Tests without requirement id are kept, with an empty list.
 */
export function junitToRuleTests(xml, { idPattern, tool = 'JUnit' } = {}) {
  // Python and PHP method names cannot contain "-": test_fee_LN_003 names LN-003
  const idRe = new RegExp(`(?<![A-Za-z0-9])${idPattern.replace(/-(?![^[]*\])/g, '[-_]')}(?![0-9])`, 'g');
  const tests = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = `<testcase${m[1]}>`;
    const inner = m[3] ?? '';
    const name = attr(tag, 'name') ?? '';
    const cls = attr(tag, 'class') ?? attr(tag, 'classname') ?? '';
    const failure = inner.match(/<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/);
    const skipped = /<skipped\b/.test(inner);
    const reqs = [...new Set([...`${name} ${cls}`.matchAll(idRe)].map((x) => x[0].replace(/_/g, '-')))];
    const message = failure ? (attr(`<x${failure[2]}>`, 'message') ?? (failure[3] ?? '').trim().split('\n')[0]) : undefined;
    tests.push({
      id: `${cls}::${name}`,
      class: cls,
      method: name,
      title: name.replace(idRe, '').replace(/\[\s*\]|\(\s*\)/g, '').replace(/\s+/g, ' ').trim(),
      file: attr(tag, 'file') ?? '',
      line: Number(attr(tag, 'line') ?? 0) || undefined,
      status: failure ? 'failed' : skipped ? 'skipped' : 'passed',
      message,
      reqs,
      targets: [],
      timeMs: Math.round(Number(attr(tag, 'time') ?? 0) * 1000),
    });
  }
  return { tool, finishedAt: new Date().toISOString(), tests };
}

export function writeRuleTests(file, run) {
  fs.writeFileSync(file, JSON.stringify(run, null, 2));
}
