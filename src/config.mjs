// Project configuration: vkit.config.mjs in the validation directory, merged
// over the defaults below. All paths are relative to that directory.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dictionary } from './i18n.mjs';

export const CONFIG_FILES = ['vkit.config.mjs', 'vkit.config.js'];

export const DEFAULTS = {
  title: 'Validation report',
  language: 'en',
  locale: undefined, // derived from language
  timeZone: 'UTC',
  paths: {
    requirements: 'requirements',
    sources: 'sources/sources.yml',
    sourceTexts: 'sources/text',
    // Base directory for `file` entries in sources.yml (e.g. the repository root)
    sourceFiles: '..',
    cache: '.cache/sources',
    playwright: 'test-results/results.json',
    run: 'test-results/run.json',
    rules: 'test-results/rule-tests.json',
    behaviour: 'behaviour',
    domain: 'domain',
    html: 'report-out',
    friendlybase: 'report-fb',
  },
  // Allowed risk values, highest first
  risks: ['high', 'medium', 'low'],
  // Pattern of a requirement id; used to find ids in test names (JUnit, plain Playwright tests)
  idPattern: '[A-Z]{2,5}-\\d{3}',
  // Literal quotes are checked against the source text unless quote_type is one of these
  paraphraseTypes: ['paraphrase', 'sinngemäß'],
  numbering: {
    flowDeviation: 'D-F-', // deviation of a flow step
    ruleDeviation: 'D-R-', // failed rule test
    deviationPad: 3,
    rule: 'R',
    rulePad: 2,
  },
  // Behaviour inventory (optional): one entry per requirement with the target
  // behaviour of the new system, plus questions to the client.
  behaviour: {
    inventory: 'inventory',
    questions: 'questions',
    fields: { ref: 'ref', target: 'target', build: 'build', questions: 'questions', state: 'state', requirements: 'requirements' },
    sections: { assessment: 'Assessment', implementation: 'Implementation', question: 'Question', background: 'Background', interim: 'Until clarified', decision: 'Internal decision', answer: 'Answer' },
    // Target that keeps the legacy behaviour (not listed separately in the report)
    keepTarget: 'keep',
    // Target that needs at least one linked question
    questionTarget: 'question',
    proposalState: 'proposal',
    answeredState: 'answered',
    // Progress of the new system from the `build` field: values that count as
    // done or partly done, and entries left out of the share (by build value,
    // e.g. solved outside the system, or by target, e.g. dropped).
    progress: { done: ['as_target'], partial: ['partial'], exclude: [], excludeTargets: [] },
  },
  // Requirement levels (optional), e.g. [{ id: 'business', title: 'Business' },
  // { id: 'ui', title: 'Operating structure' }]. A requirements file names its
  // level with a top-level `level:`, a requirement may override it; the default
  // is the first level. Progress is then reported per level as well.
  levels: [],
  // Domain model (optional, paths.domain): business concepts shared by several
  // variants (customers, installations). Requirements name the variants they
  // apply to and their realisation in the new system.
  domain: {
    variants: [], // e.g. [{ id: 'glasmacher', title: 'Glasmacher' }, 'nottebohm']
    realisations: ['core', 'config', 'extension'],
    // Realisations that need no project code; their share is the fit of the model
    shared: ['core', 'config'],
  },
  friendlybase: {
    spaceId: undefined, // defaults to slug(title)
    spaceTitle: undefined,
  },
  // Titles of flows formed from plain Playwright tests, by spec file
  // (path as in the Playwright report), e.g. { 'invoices/invoice.spec.ts': 'Rechnung als PDF' }
  flowTitles: {},
  // Free texts for the reports (Markdown in the FriendlyBase package, plain HTML in the report)
  texts: {},
  // Overrides of the built-in labels (see src/i18n.mjs)
  labels: {},
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RegExp);
}

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) out[k] = isObject(v) && isObject(base[k]) ? merge(base[k], v) : v;
  return out;
}

/** Resolves a configuration object; `root` is the validation directory. */
export function resolveConfig(root, user = {}) {
  const cfg = merge(DEFAULTS, user);
  cfg.root = path.resolve(root);
  cfg.locale ??= cfg.language === 'de' ? 'de-DE' : 'en-GB';
  cfg.t = merge(dictionary(cfg.language), cfg.labels);
  cfg.path = (key) => path.resolve(cfg.root, cfg.paths[key]);
  cfg.levels = (cfg.levels ?? []).map((l) => (typeof l === 'string' ? { id: l, title: l } : { title: l.id, ...l }));
  return cfg;
}

/** Loads vkit.config.mjs from `root` (or the current directory). */
export async function loadConfig(root = process.cwd()) {
  for (const name of CONFIG_FILES) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) {
      const mod = await import(pathToFileURL(file).href);
      return resolveConfig(root, mod.default ?? {});
    }
  }
  return resolveConfig(root, {});
}
