// Flow tests for Playwright: one test per business flow, one step per flow
// step, each with procedure, expected result (acceptance criterion), actual
// result, checks and screenshots as attachments. Every test writes its steps
// as a `flow.json` attachment, which the report turns into the step table.
//
//   //   import { createFlowTest } from '@atwx/validation-kit/playwright';
//   export const { flowTest } = createFlowTest({ test, language: 'de', system: process.env.SYSTEM });
//
// `test` is passed in rather than imported, so the project's own Playwright
// instance runs the tests (two copies of @playwright/test do not mix).
//
//   flowTest({ id: '1', title: '…', purpose: '…', roles: ['…'], reqs: ['AB-001'] }, async ({ page, flow }) => {
//     await flow.step('1.1', { title, procedure, expected, reqs: ['AB-001'] }, async (s) => {
//       await s.check('Logout link visible', () => expect(page.getByRole('link', { name: 'Logout' })).toBeVisible());
//       s.observe('…');
//       await s.evidence('Logout link', page.getByRole('link', { name: 'Logout' }));
//     });
//   });
import path from 'node:path';
import { dictionary } from './i18n.mjs';

class CheckFailed extends Error {
  constructor(label, detail, cause) {
    super(`${label}: ${detail}`);
    this.label = label;
    this.detail = detail;
    this.cause = cause;
  }
}

function firstLine(e) {
  const msg = e instanceof Error ? e.message : String(e);
  // Playwright error messages carry ANSI colour codes and a call log
  return msg.replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter((l) => l.trim())[0] ?? msg;
}

export class FlowStep {
  constructor(flow, record) {
    this.flow = flow;
    this.record = record;
    this.notes = [];
  }

  /** Runs one assertion of the acceptance criterion and records its outcome. */
  async check(label, fn) {
    try {
      await fn();
      this.record.checks.push({ label, ok: true });
    } catch (e) {
      const error = firstLine(e);
      this.record.checks.push({ label, ok: false, error });
      throw new CheckFailed(label, error, e);
    }
  }

  /** Adds a sentence to the actual result. */
  observe(text) {
    this.notes.push(text);
  }

  /** Screenshot as attachment, with the given elements framed in red. */
  async evidence(caption, ...highlight) {
    await this.flow.screenshot(this.record, caption, highlight);
  }

  /** Screenshot cropped to `area`, e.g. one row in a list of others. */
  async evidenceIn(area, caption, ...highlight) {
    await this.flow.screenshot(this.record, caption, highlight, undefined, area);
  }

  /** Same as evidence(), for another page, e.g. a second browser context. */
  async evidenceOf(page, caption, ...highlight) {
    await this.flow.screenshot(this.record, caption, highlight, page);
  }

  get observations() {
    return this.notes;
  }
}

export class Flow {
  constructor(page, info, meta, options) {
    this.page = page;
    this.info = info;
    this.meta = meta;
    this.options = options;
    this.steps = [];
  }

  async step(nr, spec, fn) {
    const { t, system, test } = this.options;
    const record = {
      ...spec, nr, actual: '', fulfilled: false, knownDefectApplied: false,
      checks: [], attachments: [], startedAt: new Date().toISOString(), durationMs: 0,
    };
    this.steps.push(record);
    const known = !!spec.knownDefect && spec.knownDefect.system === system;
    const started = Date.now();

    await test.step(`${nr} ${spec.title}`, async () => {
      const s = new FlowStep(this, record);
      try {
        await fn(s);
        record.fulfilled = true;
        record.actual = [...s.observations, ...(s.observations.length ? [] : [t.asExpected])].join(' ');
        if (known) record.actual += t.knownDefectDidNotOccur;
      } catch (e) {
        record.fulfilled = false;
        record.error = e instanceof CheckFailed ? e.message : firstLine(e);
        const failed = e instanceof CheckFailed ? t.notFulfilled(e.label) : t.abort(record.error);
        record.actual = [...s.observations, failed].join(' ');
        await this.screenshot(record, t.stateAtDeviation, []).catch(() => {});
        if (known) {
          record.knownDefectApplied = true;
          return;
        }
        throw e instanceof CheckFailed ? e.cause : e;
      } finally {
        record.durationMs = Date.now() - started;
      }
    });
  }

  async screenshot(record, caption, highlight, page = this.page, area) {
    const { t } = this.options;
    const index = record.attachments.length + 1;
    const name = `${t.attachment} ${this.meta.id}.${record.nr.split('.').pop()}-${index}`;
    const file = this.info.outputPath(`attachment-${record.nr}-${index}.png`);
    // Page coordinates, independent of the scroll position
    const boxesOf = async (loc, max) => {
      const out = [];
      for (let i = 0; i < Math.min(await loc.count(), max); i++) {
        const b = await loc.nth(i).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
        });
        if (b.width || b.height) out.push(b);
      }
      return out;
    };

    const first = area ?? highlight[0];
    if (first && (await first.count())) await first.first().scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    const boxes = (await Promise.all(highlight.map((l) => boxesOf(l, 10)))).flat();
    let clip;
    if (area) {
      const parts = await boxesOf(area, 50);
      if (parts.length) {
        const pad = 12;
        const x = Math.max(0, Math.min(...parts.map((b) => b.x)) - pad);
        const y = Math.max(0, Math.min(...parts.map((b) => b.y)) - pad);
        clip = { x, y, width: Math.max(...parts.map((b) => b.x + b.width)) + pad - x, height: Math.max(...parts.map((b) => b.y + b.height)) + pad - y };
      }
    }

    await page.evaluate((list) => {
      for (const b of list) {
        const el = document.createElement('div');
        el.className = 'vkit-highlight';
        Object.assign(el.style, {
          position: 'absolute', left: `${b.x - 4}px`, top: `${b.y - 4}px`,
          width: `${b.width + 8}px`, height: `${b.height + 8}px`, border: '3px solid #e00000',
          borderRadius: '3px', zIndex: '2147483647', pointerEvents: 'none', boxSizing: 'border-box',
        });
        document.body.appendChild(el);
      }
    }, boxes);
    await page.screenshot({ path: file, clip, fullPage: !!clip });
    await page.evaluate(() => document.querySelectorAll('.vkit-highlight').forEach((e) => e.remove()));
    await this.info.attach(name, { path: file, contentType: 'image/png' });
    record.attachments.push({ name, caption, file });
  }

  async finish(specFile) {
    const { system, attachmentName } = this.options;
    const record = { ...this.meta, system, specFile, steps: this.steps };
    await this.info.attach(attachmentName, { body: JSON.stringify(record, null, 2), contentType: 'application/json' });
  }
}

/**
 * Chrome aborts a navigation with ERR_NETWORK_CHANGED whenever a network
 * interface appears or disappears, e.g. when Docker starts a container during
 * the run. A plain page load (GET) is repeated then; form submissions are not.
 */
const NETWORK_CHANGE = /ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED/;

export function retryNetworkChanges(page) {
  for (const method of ['goto', 'reload']) {
    const original = page[method].bind(page);
    page[method] = async (...args) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await original(...args);
        } catch (e) {
          if (attempt >= 3 || !NETWORK_CHANGE.test(String(e?.message))) throw e;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };
  }
}

function withRetryingContexts(browser) {
  return new Proxy(browser, {
    get(target, prop, receiver) {
      if (prop === 'newContext') {
        return async (...args) => {
          const context = await target.newContext(...args);
          context.on('page', retryNetworkChanges);
          return context;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

const SPEC_FILE = /(?:file:\/\/)?([^\s()]+\.(?:spec|test)\.[cm]?[jt]sx?):\d+:\d+/;

function specFileFromStack(root) {
  const m = new Error().stack?.match(SPEC_FILE);
  return m ? path.relative(root, m[1]).split(path.sep).join('/') : undefined;
}

/**
 * Creates the flowTest() function for a project.
 *
 * Options:
 *   test            the `test` function of @playwright/test (required)
 *   language        'en' | 'de' (labels of attachments and actual results)
 *   labels          overrides of single labels
 *   system          name of the system under test; steps with
 *                   knownDefect.system equal to it may fail without failing the run
 *   flowLabel       prefix of the Playwright test title (default: label "flow")
 *   attachmentName  name of the JSON attachment (default flow.json)
 *   blockUrls       requests to abort, e.g. absolute links to the production host
 *   specRoot        directory the spec path in the report is relative to (default: cwd)
 */
export function createFlowTest(opts = {}) {
  const { test } = opts;
  if (typeof test !== 'function') throw new Error('createFlowTest: pass `test` from @playwright/test');
  const t = { ...dictionary(opts.language ?? 'en'), ...(opts.labels ?? {}) };
  const options = {
    t,
    test,
    system: opts.system,
    attachmentName: opts.attachmentName ?? 'flow.json',
  };
  const flowLabel = opts.flowLabel ?? t.flow;
  const blockUrls = opts.blockUrls ?? [];
  const specRoot = opts.specRoot ?? process.cwd();

  function flowTest(meta, body) {
    const m = { ...meta, id: String(meta.id ?? meta.process) };
    // Playwright attributes the test to this file, where test() is called;
    // the spec file that declared the flow is taken from the call stack
    const specFile = specFileFromStack(specRoot);
    test(`${flowLabel} ${m.id}: ${m.title}`, {
      annotation: [
        { type: 'flow', description: m.id },
        { type: 'req', description: (m.reqs ?? []).join(', ') },
      ],
    }, async ({ page, browser }, info) => {
      for (const url of blockUrls) await page.route(url, (route) => route.abort());
      retryNetworkChanges(page);
      const flow = new Flow(page, info, m, options);
      try {
        await body({ page, flow, browser: withRetryingContexts(browser) });
      } finally {
        await flow.finish(specFile ?? path.relative(specRoot, info.file).split(path.sep).join('/'));
      }
    });
  }

  return { flowTest, options };
}
