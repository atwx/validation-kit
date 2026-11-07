// The data of a validation report: catalogue, sources, behaviour inventory,
// flow and rule tests, numbered deviations and coverage per requirement.
// Both report builders (HTML, FriendlyBase) render this model.
import { codeUrl, loadCatalog, loadSources, quoteLine, sourceText } from './catalog.mjs';
import { domainFit, loadDomain, requirementsByConcept } from './domain.mjs';
import { loadBehaviour } from './behaviour.mjs';
import { loadFlows, loadRuleTests } from './results.mjs';
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

  // Deviations in protocol order; attachments get their target file name
  let flowDeviations = 0;
  for (const f of flows) {
    for (const step of f.record.steps) {
      if (!step.fulfilled) step.deviation = `${n.flowDeviation}${pad(++flowDeviations, n.deviationPad)}`;
      for (const a of step.attachments) a.target = `${slug(a.name)}.png`;
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

  return {
    cfg, sources, areas, requirements, byId, run, flows, ruleRun, rules, behaviour,
    domain, fit: domain ? domainFit(cfg, requirements) : [], requirementsByConcept: requirementsByConcept(requirements),
    coverage, ruleCoverage, isCovered, status, deviations, counts,
    flowDeviationCount: flowDeviations, ruleDeviationCount: ruleDeviations,
  };
}
