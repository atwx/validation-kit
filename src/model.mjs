// The data of a validation report: catalogue, sources, behaviour inventory,
// flow and rule tests, numbered deviations and coverage per requirement.
// Both report builders (HTML, FriendlyBase) render this model.
import { codeUrl, loadCatalog, loadSources, quoteLine, sourceText } from './catalog.mjs';
import { domainFit, domainVariants, loadDomain, requirementsByConcept, variantsOf } from './domain.mjs';
import { loadBehaviour } from './behaviour.mjs';
import { loadFlows, loadRuleTests } from './results.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, slug } from './util.mjs';

/** Requirement status codes, in report order. */
export const STATUSES = ['passed', 'unit', 'deviation', 'untested'];

export function buildModel(cfg) {
  const { requirements, areas, byId } = loadCatalog(cfg);
  const sources = loadSources(cfg);
  const run = readJson(cfg.path('run'), {});
  const flows = loadFlows(cfg.path('playwright'), { idPattern: cfg.idPattern });
  const ruleRun = loadRuleTests(cfg.path('rules'));
  const behaviour = loadBehaviour(cfg);
  const domain = loadDomain(cfg);

  // Citations of code: line of the quote in the file and a link to it
  for (const r of requirements) {
    for (const src of r.sources) {
      const doc = sources[src.doc];
      if (doc?.kind !== 'code' || !src.quote) continue;
      const text = sourceText(cfg, doc, src.section);
      src.line = text ? quoteLine(text, src.quote) : undefined;
      src.url = codeUrl(doc, src.section, src.line);
    }
  }
  const n = cfg.numbering;
  const pad = (i, w) => String(i).padStart(w, '0');

  // Attachment paths are absolute paths of the machine that ran the tests
  // (e.g. /e2e/test-results/… in a container). If such a path does not exist
  // here, the longest trailing part that exists next to the Playwright report
  // is used.
  const reportDir = path.dirname(cfg.path('playwright'));
  const locate = (file) => {
    if (!file || fs.existsSync(file)) return file;
    const parts = file.split(/[\\/]/).filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      for (const base of [reportDir, path.dirname(reportDir)]) {
        const candidate = path.join(base, ...parts.slice(i));
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return file;
  };

  // Deviations in protocol order; attachments get their target file name
  let flowDeviations = 0;
  for (const f of flows) {
    for (const step of f.record.steps) {
      if (!step.fulfilled) step.deviation = `${n.flowDeviation}${pad(++flowDeviations, n.deviationPad)}`;
      for (const a of step.attachments) {
        a.target = `${slug(a.name)}.png`;
        a.file = locate(a.file);
      }
    }
    f.deviations = f.record.steps.filter((s) => !s.fulfilled);
  }

  // Skipped tests prove nothing and are left out
  const rules = (ruleRun?.tests ?? []).filter((r) => r.status !== 'skipped')
    .map((r, i) => ({ ...r, nr: `${n.rule}${pad(i + 1, n.rulePad)}`, fulfilled: r.status === 'passed' }));
  let ruleDeviations = 0;
  for (const r of rules) if (!r.fulfilled) r.deviation = `${n.ruleDeviation}${pad(++ruleDeviations, n.deviationPad)}`;

  // Requirement → covering flow steps and rule tests
  const coverage = Object.fromEntries(requirements.map((r) => [r.id, []]));
  const ruleCoverage = Object.fromEntries(requirements.map((r) => [r.id, []]));
  const unknown = [];
  for (const f of flows) {
    for (const step of f.record.steps) {
      for (const id of step.reqs) {
        if (!coverage[id]) { unknown.push(`${f.id} ${step.nr}: ${id}`); continue; }
        coverage[id].push({ flow: f, step });
      }
    }
  }
  for (const rule of rules) {
    for (const id of rule.reqs) {
      if (!ruleCoverage[id]) { unknown.push(`${rule.id}: ${id}`); continue; }
      ruleCoverage[id].push(rule);
    }
  }
  if (unknown.length) throw new Error(cfg.t.unknownRequirementInTests(unknown));

  const isCovered = (id) => coverage[id].length > 0 || ruleCoverage[id].length > 0;
  // "unit": only rule tests cover the requirement; the rule is proven on the
  // model and services, not yet in a flow through the user interface.
  const status = (id) => {
    if (!isCovered(id)) return 'untested';
    if (!coverage[id].every((c) => c.step.fulfilled) || !ruleCoverage[id].every((r) => r.fulfilled)) return 'deviation';
    return coverage[id].length ? 'passed' : 'unit';
  };

  const deviations = [
    ...flows.flatMap((f) => f.deviations.map((step) => ({ ref: step.deviation, flow: f, step }))),
    ...rules.filter((r) => !r.fulfilled).map((r) => ({ ref: r.deviation, rule: r })),
  ];

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of requirements) counts[status(r.id)]++;

  const progress = buildProgress(cfg, behaviour, requirements, areas);

  return {
    cfg, sources, areas, requirements, byId, run, flows, ruleRun, rules, behaviour, progress,
    domain, fit: domain ? domainFit(cfg, requirements) : [], requirementsByConcept: requirementsByConcept(requirements),
    coverage, ruleCoverage, isCovered, status, deviations, counts,
    flowDeviationCount: flowDeviations, ruleDeviationCount: ruleDeviations,
  };
}

/**
 * State of the new system per requirement from the `build` field of the
 * behaviour inventory: counts per value, per variant and per area, and the
 * share done. Null without an inventory or without a select field `build`.
 * A requirement without an inventory entry counts with the first option.
 */
export function buildProgress(cfg, behaviour, requirements, areas) {
  const field = cfg.behaviour.fields.build;
  const schema = behaviour?.inventory.schema[field];
  if (!schema || schema.type !== 'select' || !schema.options?.length) return null;
  const options = schema.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : { label: o.value, ...o }));
  const p = { done: [], partial: [], exclude: [], excludeTargets: [], ...cfg.behaviour.progress };
  const target = cfg.behaviour.fields.target;
  const value = (r) => behaviour.byRef[r.id]?.fm[field] ?? options[0].value;
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;
  const known = (list) => list.filter((v) => options.some((o) => o.value === v));
  // Without a configured done value among the options there is no share (e.g. own value names)
  const hasShare = known(p.done).length > 0;
  const excluded = (r) => p.exclude.includes(value(r)) || p.excludeTargets.includes(behaviour.byRef[r.id]?.fm[target]);
  const tally = (reqs) => {
    const counts = Object.fromEntries(options.map((o) => [o.value, 0]));
    for (const r of reqs) counts[value(r)] = (counts[value(r)] ?? 0) + 1;
    const counted = reqs.filter((r) => !excluded(r));
    const done = counted.filter((r) => p.done.includes(value(r))).length;
    const partial = counted.filter((r) => p.partial.includes(value(r))).length;
    return {
      total: reqs.length, counts, counted: counted.length, excluded: reqs.length - counted.length, done, partial,
      share: hasShare && counted.length ? done / counted.length : null,
    };
  };
  const variants = domainVariants(cfg);
  const { t } = cfg;
  const pct = (x) => (x.share === null ? '–' : `${Math.round(x.share * 100)} %`);
  // Table rows shared by the report builders: per variant (or all), per area
  const row = (name, x) => [name, x.total, ...options.map((o) => x.counts[o.value] || ''), x.excluded || '', ...(hasShare ? [pct(x)] : [])];
  const excludedText = [...p.exclude.map(labelOf), ...p.excludeTargets.map((v) => behaviour.labels[target]?.[v] ?? v)].join(', ');
  return {
    field, label: schema.label ?? field, options, value, labelOf, hasShare,
    lead: !hasShare ? '' : t.progressLead(known(p.done).map(labelOf).join(', '), known(p.partial).map(labelOf).join(', '), excludedText),
    head: (first) => [first, t.requirements, ...options.map((o) => o.label), t.notCounted, ...(hasShare ? [t.progressShare] : [])],
    rows: () => (variants.length
      ? variants.map((v) => row(v.title, tally(requirements.filter((r) => variantsOf(cfg, r).includes(v.id)))))
      : [row(t.progressAll, tally(requirements))]),
    areaRows: () => areas.map((a) => row(a.area, tally(a.requirements))),
    all: tally(requirements),
    variants: variants.map((v) => ({ variant: v, ...tally(requirements.filter((r) => variantsOf(cfg, r).includes(v.id))) })),
    areas: areas.map((a) => ({ area: a.area, ...tally(a.requirements) })),
  };
}
