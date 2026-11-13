// Test results: flow tests from the Playwright JSON reporter and rule tests
// from a rule-test file (format: skills/validation/references/tests.md), which
// JUnit XML converts into.
import fs from 'node:fs';
import { naturalCompare, readJson } from './util.mjs';

export const FLOW_ATTACHMENTS = ['flow.json', 'xq.json'];

/**
 * Flow tests of a Playwright JSON report. A test written with flowTest()
 * carries its steps as a `flow.json` attachment. A plain Playwright test
 * counts as a step when it names requirements, either as annotation
 * { type: 'req', description: 'AB-001, AB-002' } or in its title; the plain
 * tests of one spec file form one flow, named after the file.
 */
export function loadFlows(file, { idPattern, titles = {} } = {}) {
  const report = readJson(file, { suites: [] });
  const idRe = idPattern ? new RegExp(`\\b${idPattern}\\b`, 'g') : null;
  const flows = [];
  const plainByFile = new Map();
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
        const step = plainStep(spec, t, res, titles, idRe);
        if (step) {
          if (!plainByFile.has(spec.file)) plainByFile.set(spec.file, []);
          plainByFile.get(spec.file).push(step);
        }
      }
    }
    for (const s of suite.suites ?? []) walk(s, [...titles, s.title]);
  })({ suites: report.suites }, []);
  for (const [file, steps] of plainByFile) flows.push(plainFlow(file, steps, titles[file]));
  flows.sort((a, b) => naturalCompare(a.id, b.id));
  return flows;
}

/** A plain test as a step, with the titles of its describe blocks. */
function plainStep(spec, t, res, titles, idRe) {
  const annotated = (t.annotations ?? []).filter((a) => a.type === 'req').flatMap((a) => String(a.description).split(/[\s,]+/)).filter(Boolean);
  const fromTitle = idRe ? [...spec.title.matchAll(idRe)].map((m) => m[0]) : [];
  const reqs = [...new Set([...annotated, ...fromTitle])];
  if (!reqs.length || res.status === 'skipped') return null;
  const passed = res.status === 'passed';
  const error = (res.errors ?? [])[0]?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0];
  // test.fail('…') marks a known defect: the test is expected to fail on this system
  const fail = (t.annotations ?? []).find((a) => a.type === 'fail');
  const known = !passed && !!fail && t.status === 'expected';
  // The first title is the spec file, the others are describe blocks
  const groups = titles.filter(Boolean).slice(1);
  return {
    groups, status: passed || known ? 'passed' : res.status,
    step: {
      nr: '', title: [...groups, spec.title].join(' › '), procedure: '', expected: spec.title, reqs, actual: passed ? '' : error ?? res.status,
      fulfilled: passed, knownDefectApplied: known, knownDefect: known ? { system: '', note: fail.description ?? '' } : undefined, checks: [], attachments: [], startedAt: res.startTime, durationMs: res.duration,
    },
  };
}

/** The plain tests of one spec file as one flow; steps are numbered in order. */
function plainFlow(file, items, configured) {
  items.forEach((x, i) => { x.step.nr = String(i + 1); });
  const steps = items.map((x) => x.step);
  // Title: the describe block all tests share, else the file name
  const first = items[0].groups[0];
  const shared = first && items.every((x) => x.groups[0] === first);
  const title = configured ?? (shared ? first : file.split('/').pop());
  if (shared) for (const s of steps) s.title = s.title.slice(first.length + 3);
  const startTime = steps.map((s) => s.startedAt).filter(Boolean).sort()[0] ?? '';
  return {
    // A failed test is a deviation of its step; only a run that did not finish aborts the flow
    id: file, plain: true, status: items.find((x) => !['passed', 'failed'].includes(x.status))?.status ?? 'passed',
    startTime, duration: steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0), file,
    record: { id: file, title, purpose: '', roles: [], reqs: [...new Set(steps.flatMap((s) => s.reqs))], steps, specFile: file },
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
