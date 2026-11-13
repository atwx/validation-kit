// The validation report as a FriendlyBase package (Markdown spec 0.4):
// requirements, flow tests, deviations, rule tests and proposals as
// collections, so the client can filter, comment on and confirm single
// entries. Upload with `fb push <dir> --space <slug>`.
//
// Entry ids are derived from stable source keys (requirement id, flow id,
// step number, test class::method), because comments and confirmations in
// FriendlyBase hang on them.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { sectionOf } from '../catalog.mjs';
import { kebab, listFiles, makeDateFormatter, slug } from '../util.mjs';

export function buildFriendlyBase(model, outDir = model.cfg.path('friendlybase')) {
  const { cfg, sources, areas, requirements, byId, run, flows, rules, behaviour, coverage, ruleCoverage, isCovered, status, deviations, counts, progress } = model;
  const { t } = cfg;
  const fmtDate = makeDateFormatter(cfg.locale, cfg.timeZone);
  const texts = cfg.texts;
  const b = cfg.behaviour;
  const f = b.fields;
  const n = t.fb; // collection and property names

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // ------------------------------------------------------------ helpers

  const reqNode = (id) => `${n.reqPrefix}-${slug(id)}`;
  const flowNode = (fl) => `${n.flowPrefix}-${/^\d+$/.test(fl.id) ? fl.id.padStart(2, '0') : kebab(fl.id)}`;
  const ruleNode = (r) => `${n.rulePrefix}-${kebab(r.id.replace('::', '-'))}`;
  const devNode = (d) => (d.step ? `${n.devPrefix}-${d.flow.plain ? kebab(d.flow.id) : kebab(d.step.nr)}` : `${n.devPrefix}-${kebab(d.rule.id.replace('::', '-'))}`);
  const qNode = (q) => `${n.proposalPrefix}-${slug(q.fm.ref ?? q.fm.id)}`;
  const sourceNode = (doc) => `${n.sourcePrefix}-${slug(doc.id)}`;

  const write = (rel, frontmatter, body) => {
    const file = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fm = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true });
    fs.writeFileSync(file, `---\n${fm}---\n\n${body.trim()}\n`);
  };
  const writeYaml = (rel, data) => {
    fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(outDir, rel), yaml.dump(data, { lineWidth: -1, noRefs: true }));
  };
  // Table cell: no line breaks, pipes escaped
  const cell = (v) => String(v ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim() || '–';
  const table = (head, rows) => (rows.length
    ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')
    : `_${t.none}_`);
  const link = (node, label) => `[[${node}|${String(label).replace(/[|\]]/g, ' ')}]]`;
  const reqLink = (id) => link(reqNode(id), id);
  const quote = (text) => String(text ?? '').split('\n').map((l) => `> ${l}`).join('\n');
  const option = (value, label, color) => ({ value, label, color });
  const flowName = (fl) => (fl.plain ? path.basename(fl.file ?? fl.id) : `${t.flow} ${fl.id}`);

  const STATUS_OPTIONS = [option('passed', t.status.passed, 'green'), option('unit', t.status.unit, 'blue'), option('deviation', t.status.deviation, 'red'), option('untested', t.status.untested, 'gray')];
  const LEGACY_OPTIONS = [option('met', t.legacy.met, 'green'), option('partial', t.legacy.partial, 'yellow'), option('not_met', t.legacy.not_met, 'red')];
  const riskColors = ['red', 'yellow', 'gray', 'gray'];
  const RISK_OPTIONS = cfg.risks.map((r, i) => option(r, t.risk[r] ?? r, riskColors[i] ?? 'gray'));
  const targetSchema = behaviour?.inventory.schema[f.target];
  const questions = behaviour?.questions.entries ?? [];
  const proposals = questions.filter((q) => q.fm[f.state] === b.proposalState);
  const hasLegacy = requirements.some((r) => r.legacy);

  const flowResult = (fl) => {
    if (fl.status !== 'passed') return 'aborted';
    if (!fl.deviations.length) return 'clean';
    return fl.deviations.every((s) => s.knownDefectApplied) ? 'known' : 'new';
  };

  // ------------------------------------------------------------ space and overview

  const spaceId = cfg.friendlybase.spaceId ?? slug(cfg.title);
  const spaceTitle = cfg.friendlybase.spaceTitle ?? cfg.title;
  const collections = [n.requirements, n.flows, n.deviations, ...(rules.length ? [n.rules] : []), ...(proposals.length ? [n.proposals] : []), n.sources, n.traceability];
  writeYaml('space.yml', { spec: 0.4, id: spaceId, title: spaceTitle, type: 'concept' });
  writeYaml('_order.yml', collections);

  const allSteps = flows.flatMap((fl) => fl.record.steps);
  write('_index.md', {
    id: spaceId, type: 'chapter', title: spaceTitle, visibility: 'shared', status: 'review',
    system: run.systemLabel ?? '', [n.runProp]: run.startedAt ?? '', commit: run.commit ?? '',
  }, `
# ${cfg.title}

${t.leadRun(fmtDate(run.startedAt), run.systemLabel ?? t.unknownSystem)} ${t.codeVersion} ${run.commit ?? '–'}.
${t.leadCoverage(flows.length, allSteps.length, rules.length, requirements.filter((r) => isCovered(r.id)).length, requirements.length)}

| | ${t.count} |
|---|---:|
| ${t.requirements} | ${requirements.length} |
| ${t.cardPassed} | ${counts.passed} |
${rules.length ? `| ${t.cardUnit} | ${counts.unit} |\n` : ''}| ${t.cardDeviation} | ${counts.deviation} |
| ${t.cardUntested} | ${counts.untested} |
| ${t.deviations} | ${deviations.length} |
${proposals.length ? `| ${t.proposals} | ${proposals.length} |\n` : ''}
> [!counts|${n.resultProp}] ${t.requirementsByResult}
> [[${n.requirements}]]

> [!counts|confirmation] ${t.requirementsByConfirmation}
> [[${n.requirements}]]

> [!counts|${n.assessmentProp}] ${t.deviations}
> [[${n.deviations}]]
${progress ? `
> [!counts|${n.buildProp}] ${t.buildState}
> [[${n.requirements}]]
` : ''}${texts.intro ? `\n> [!note] ${t.howToRead}\n${quote(stripHtml(texts.intro))}\n` : ''}
## ${t.areas}

${table([t.area, t.requirements, t.status.passed, ...(rules.length ? [t.status.unit] : []), t.status.deviation, t.status.untested, ...(hasLegacy ? [t.legacyNotMetShort] : [])], areas.map((a) => {
    const c = { passed: 0, unit: 0, deviation: 0, untested: 0 };
    for (const r of a.requirements) c[status(r.id)]++;
    return [a.area, a.requirements.length, c.passed || '', ...(rules.length ? [c.unit || ''] : []), c.deviation || '', c.untested || '', ...(hasLegacy ? [a.requirements.filter((r) => r.legacy?.status === 'not_met').length || ''] : [])];
  }))}

## ${t.flowTests}

${table([t.flow, t.title, t.steps, t.fulfilledShort, t.deviations, t.result], flows.map((fl) => [
    link(flowNode(fl), flowName(fl)), fl.record.title, fl.record.steps.length, fl.record.steps.filter((s) => s.fulfilled).length, fl.deviations.length || '', t.flowResult[flowResult(fl)],
  ]))}
${progress ? `\n## ${t.buildState}\n\n${progress.lead}\n\n${table(progress.head(progress.rows().length > 1 ? t.variant : ''), progress.rows())}\n\n### ${t.areas}\n\n${table(progress.head(t.area), progress.areaRows())}\n` : ''}${targetSchema ? `\n## ${t.newVersusLegacy}\n\n${table([t.target, t.requirements], (targetSchema.options ?? []).map((o) => [typeof o === 'string' ? o : o.label, behaviour.inventory.entries.filter((e) => e.fm[f.target] === (typeof o === 'string' ? o : o.value)).length]))}\n` : ''}
> [!note] ${t.confirmAndComment}
> ${t.confirmText}
`);

  // ------------------------------------------------------------ requirements

  const reqSchema = {
    ref: { type: 'text', label: t.no, required: true },
    [n.areaProp]: { type: 'select', label: t.area, options: areas.map((a) => a.area) },
    [n.riskProp]: { type: 'select', label: t.riskHeader, options: RISK_OPTIONS },
    [n.resultProp]: { type: 'select', label: t.result, options: STATUS_OPTIONS },
  };
  if (hasLegacy) reqSchema[n.legacyProp] = { type: 'select', label: t.legacySystem, options: LEGACY_OPTIONS };
  if (targetSchema) reqSchema[n.targetProp] = { type: 'select', label: t.targetInNewSystem, options: targetSchema.options ?? [] };
  if (progress) reqSchema[n.buildProp] = { type: 'select', label: t.buildState, options: progress.options };
  reqSchema[n.flows] = { type: 'relation', label: t.flowTests, collection: n.flows, display: 'ref' };
  if (rules.length) reqSchema[n.rules] = { type: 'relation', label: t.ruleTests, collection: n.rules, display: 'ref' };
  if (proposals.length) reqSchema[n.proposals] = { type: 'relation', label: t.proposals, collection: n.proposals, display: 'ref' };

  write(`${n.requirements}/_index.md`, { id: n.requirements, type: 'chapter', title: t.requirements, schema: reqSchema }, `
# ${t.requirements}

${texts.requirementsIntro ?? t.requirementsIntro(requirements.length)}
`);
  const views = [
    { name: t.allRequirements, type: 'table', properties: ['ref', n.areaProp, n.riskProp, n.resultProp, ...(hasLegacy ? [n.legacyProp] : []), ...(targetSchema ? [n.targetProp] : []), ...(progress ? [n.buildProp] : []), 'confirmation'], sorts: [{ property: 'ref', direction: 'asc' }], default: true },
    { name: t.byResult, type: 'board', group_by: n.resultProp, properties: ['ref', n.areaProp, ...(targetSchema ? [n.targetProp] : [])] },
    { name: t.confirmation, type: 'board', group_by: 'confirmation', properties: ['ref', n.areaProp, n.resultProp] },
  ];
  if (progress) views.splice(1, 0, { name: t.byBuild, type: 'board', group_by: n.buildProp, properties: ['ref', n.areaProp, ...(targetSchema ? [n.targetProp] : [])] });
  if (targetSchema) {
    views.push({ name: t.byTarget, type: 'board', group_by: n.targetProp, properties: ['ref', n.areaProp, n.resultProp] });
    for (const o of targetSchema.options ?? []) {
      const value = typeof o === 'string' ? o : o.value;
      if (value === b.keepTarget) continue;
      views.push({ name: typeof o === 'string' ? o : o.label, type: 'table', properties: ['ref', n.areaProp, n.resultProp], filters: [{ property: n.targetProp, op: 'equals', value }] });
    }
  }
  writeYaml(`${n.requirements}/_views.yml`, views);
  writeYaml(`${n.requirements}/_order.yml`, requirements.map((r) => reqNode(r.id)));

  for (const r of requirements) {
    const inv = behaviour?.byRef[r.id];
    const steps = coverage[r.id];
    const ruleList = ruleCoverage[r.id];
    const qs = behaviour?.questionsOf(r.id) ?? [];
    const fm = { id: reqNode(r.id), title: `${r.id} ${r.title}`, ref: r.id, [n.areaProp]: r.area, [n.riskProp]: r.risk, [n.resultProp]: status(r.id) };
    if (r.legacy) fm[n.legacyProp] = r.legacy.status;
    if (inv) fm[n.targetProp] = inv.fm[f.target];
    if (progress) fm[n.buildProp] = progress.value(r);
    const flowIds = [...new Set(steps.map(({ flow }) => flowNode(flow)))];
    if (flowIds.length) fm[n.flows] = flowIds;
    if (ruleList.length) fm[n.rules] = ruleList.map(ruleNode);
    const linkedProposals = qs.filter((q) => q.fm[f.state] === b.proposalState);
    if (linkedProposals.length) fm[n.proposals] = linkedProposals.map(qNode);

    const sourcesMd = r.sources.filter((s) => sources[s.doc]).map((s) => {
      const doc = sources[s.doc];
      const sec = sectionOf(doc, s.section);
      return `${quote(s.quote)}\n>\n> — ${link(sourceNode(doc), `${doc.id} ${s.section ?? ''}`.trim())} ${sec?.title ?? ''} · ${doc.title}${cfg.paraphraseTypes.includes(s.quote_type) ? ` · _${t.paraphrase}_` : ''}`;
    }).join('\n\n');

    const newSystem = inv ? `## ${t.newSystem}: ${behaviour.labels[f.target]?.[inv.fm[f.target]] ?? inv.fm[f.target]}
${inv.fm[f.build] ? `\n${t.buildState}: ${behaviour.labels[f.build]?.[inv.fm[f.build]] ?? inv.fm[f.build]}\n` : ''}${linkedProposals.map((q) => `\n${t.proposal}: ${link(qNode(q), q.fm.title)}`).join('')}

${inv.sections[b.sections.assessment] ?? ''}
${inv.sections[b.sections.implementation] ? `\n> [!info] ${t.implementation}\n${quote(inv.sections[b.sections.implementation])}\n` : ''}` : '';

    const stepRows = steps.map(({ flow, step }) => [link(flowNode(flow), flow.plain ? flow.id : `${step.nr} ${step.title}`), step.expected, step.actual, step.fulfilled ? t.yes : `${t.no_} (${step.deviation})`]);
    const ruleRows = ruleList.map((rule) => [link(ruleNode(rule), rule.nr), rule.title, rule.fulfilled ? t.status.passed : `${t.failed} (${rule.deviation})`]);

    write(`${n.requirements}/${reqNode(r.id)}.md`, fm, `
# ${r.id} ${r.title}

## ${t.acceptance}

${r.acceptance}
${r.note ? `\n> [!note] ${t.note}\n${quote(r.note)}\n` : ''}
${sourcesMd ? `## ${t.navSources}\n\n${sourcesMd}\n` : ''}
${r.legacy ? `\n## ${t.legacySystem}: ${t.legacy[r.legacy.status]}\n\n${(r.legacy.evidence ?? []).map((e) => `- ${e}`).join('\n')}\n` : ''}
${newSystem}

## ${t.tests}

${stepRows.length ? `### ${t.flowTests}\n\n${table([t.flowStep, t.expected, t.actual, t.fulfilledShort], stepRows)}\n` : ''}
${ruleRows.length ? `### ${t.ruleTests}\n\n${table([t.no, t.ruleTest, t.result], ruleRows)}\n` : ''}
${!stepRows.length && !ruleRows.length ? `_${t.noTestYet}_` : ''}
`);
  }

  // ------------------------------------------------------------ flow tests

  write(`${n.flows}/_index.md`, {
    id: n.flows, type: 'chapter', title: t.flowTests,
    schema: {
      ref: { type: 'text', label: t.no, required: true },
      [n.numberProp]: { type: 'number', label: t.flow },
      [n.resultProp]: { type: 'select', label: t.result, options: [option('clean', t.flowResult.clean, 'green'), option('known', t.flowResult.known, 'yellow'), option('new', t.flowResult.new, 'red'), option('aborted', t.flowResult.aborted, 'red')] },
      [n.stepsProp]: { type: 'number', label: t.steps },
      [n.fulfilledProp]: { type: 'number', label: t.fulfilledShort },
      [n.deviations]: { type: 'number', label: t.deviations },
      [n.performedProp]: { type: 'datetime', label: t.performed },
      [n.requirements]: { type: 'relation', label: t.requirements, collection: n.requirements, display: 'ref' },
    },
  }, `
# ${t.flowTests}

${texts.flowsIntro ?? t.flowsIntro}
`);
  writeYaml(`${n.flows}/_views.yml`, [
    { name: t.allFlows, type: 'table', properties: ['ref', n.resultProp, n.stepsProp, n.fulfilledProp, n.deviations, n.performedProp, 'confirmation'], sorts: [{ property: n.numberProp, direction: 'asc' }], default: true },
  ]);
  writeYaml(`${n.flows}/_order.yml`, flows.map(flowNode));

  for (const fl of flows) {
    const x = fl.record;
    for (const s of x.steps) for (const a of s.attachments) if (a.file && fs.existsSync(a.file)) fs.copyFileSync(a.file, path.join(outDir, n.flows, a.target));
    const stepsMd = x.steps.map((s) => `### ${s.nr} ${s.title}

${s.procedure ?? ''}

| | |
|---|---|
| ${t.requirements} | ${s.reqs.map(reqLink).join(' ') || '–'} |
| ${t.expected} | ${cell(s.expected)} |
| ${t.actual} | ${cell(s.actual)} |
| ${t.fulfilledShort} | ${s.fulfilled ? t.yes : `**${t.no_}**, ${s.deviation}${s.knownDefectApplied ? ` (${t.known})` : ''}`} |
| ${t.performed} | ${fmtDate(s.startedAt)}, ${t.automated} |
${s.checks.length ? `\n${s.checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.label}${c.error ? ` – ${c.error}` : ''}`).join('\n')}\n` : ''}
${s.attachments.some((a) => a.file && fs.existsSync(a.file)) ? `> [!gallery|2] ${t.attachments}\n${s.attachments.filter((a) => a.file && fs.existsSync(a.file)).map((a) => `> ![[${a.target}|${a.name}]]`).join('\n')}\n` : ''}`).join('\n\n');

    const fm = {
      id: flowNode(fl), title: fl.plain ? x.title : `${flowName(fl)}: ${x.title}`, ref: flowName(fl), [n.resultProp]: flowResult(fl),
      [n.stepsProp]: x.steps.length, [n.fulfilledProp]: x.steps.filter((s) => s.fulfilled).length, [n.deviations]: fl.deviations.length,
      [n.performedProp]: fl.startTime, [n.requirements]: x.reqs.filter((id) => byId[id]).map(reqNode),
    };
    if (/^\d+$/.test(fl.id)) fm[n.numberProp] = Number(fl.id);
    write(`${n.flows}/${flowNode(fl)}.md`, fm, `
# ${fm.title}

| | |
|---|---|
${x.purpose ? `| ${t.purpose} | ${cell(x.purpose)} |\n` : ''}${x.roles?.length ? `| ${t.roles} | ${cell(x.roles.join(', '))} |\n` : ''}${x.precondition ? `| ${t.precondition} | ${cell(x.precondition)} |\n` : ''}| ${t.system} | ${cell(run.systemLabel ?? x.system)}, ${t.codeVersion} ${run.commit ?? '–'} |
| ${t.execution} | ${t.executionText(fmtDate(fl.startTime), (fl.duration / 1000).toFixed(1))} (\`${x.specFile ?? fl.file}\`) |
| ${t.result} | ${t.criteriaMet(x.steps.filter((s) => s.fulfilled).length, x.steps.length, fl.deviations.length)} |
${fl.status !== 'passed' && x.steps.length ? `\n> [!danger] ${t.aborted}\n> ${t.abortedAfter(x.steps.at(-1).nr)}\n` : ''}
## ${t.steps}

${stepsMd}
`);
  }

  // ------------------------------------------------------------ deviations

  write(`${n.deviations}/_index.md`, {
    id: n.deviations, type: 'chapter', title: t.deviations,
    schema: {
      ref: { type: 'text', label: t.no, required: true },
      [n.kindProp]: { type: 'select', label: t.kind, options: [option('flow', t.flowTest, 'blue'), option('rule', t.ruleTest, 'purple')] },
      [n.assessmentProp]: { type: 'select', label: t.classification, options: [option('known', t.knownDefect, 'yellow'), option('new', t.new, 'red')] },
      [n.requirements]: { type: 'relation', label: t.requirements, collection: n.requirements, display: 'ref' },
      [n.testProp]: { type: 'relation', label: t.test, display: 'ref' },
    },
  }, `
# ${t.deviations}

${t.deviationsIntro(cfg.numbering.flowDeviation, cfg.numbering.ruleDeviation)}
`);
  writeYaml(`${n.deviations}/_views.yml`, [
    { name: t.allDeviations, type: 'table', properties: ['ref', n.kindProp, n.assessmentProp, n.requirements, n.testProp], sorts: [{ property: 'ref', direction: 'asc' }], default: true },
    { name: t.byClassification, type: 'board', group_by: n.assessmentProp, properties: ['ref', n.requirements] },
  ]);
  writeYaml(`${n.deviations}/_order.yml`, deviations.map(devNode));

  for (const d of deviations) {
    if (d.step) {
      const { flow, step } = d;
      const title = `${d.ref} ${flowName(flow)}${flow.plain ? '' : `, ${t.step} ${step.nr}: ${step.title}`}`;
      write(`${n.deviations}/${devNode(d)}.md`, {
        id: devNode(d), title, ref: d.ref, [n.kindProp]: 'flow', [n.assessmentProp]: step.knownDefectApplied ? 'known' : 'new',
        [n.requirements]: step.reqs.filter((id) => byId[id]).map(reqNode), [n.testProp]: flowNode(flow),
      }, `
# ${title}

| | |
|---|---|
| ${t.flowTest} | ${link(flowNode(flow), `${flowName(flow)}: ${flow.record.title}`)} |
| ${t.requirements} | ${step.reqs.map(reqLink).join(' ')} |
| ${t.expected} | ${cell(step.expected)} |
| ${t.actual} | ${cell(step.actual)} |
${step.knownDefectApplied ? `\n> [!info] ${t.knownDefect}\n${quote(step.knownDefect.note)}\n` : ''}`);
    } else {
      const r = d.rule;
      write(`${n.deviations}/${devNode(d)}.md`, {
        id: devNode(d), title: `${d.ref} ${t.ruleTest} ${r.nr}: ${r.title}`, ref: d.ref, [n.kindProp]: 'rule', [n.assessmentProp]: 'new',
        [n.requirements]: r.reqs.map(reqNode), [n.testProp]: ruleNode(r),
      }, `
# ${d.ref} ${t.ruleTest} ${r.nr}: ${r.title}

${link(ruleNode(r), `${t.ruleTest} ${r.nr}`)} · ${r.reqs.map(reqLink).join(' ')}

${quote(r.message ?? '')}
`);
    }
  }

  // ------------------------------------------------------------ rule tests

  if (rules.length) {
    write(`${n.rules}/_index.md`, {
      id: n.rules, type: 'chapter', title: t.ruleTests,
      schema: {
        ref: { type: 'text', label: t.no, required: true },
        [n.resultProp]: { type: 'select', label: t.result, options: [option('passed', t.status.passed, 'green'), option('failed', t.failed, 'red')] },
        [n.requirements]: { type: 'relation', label: t.requirements, collection: n.requirements, display: 'ref' },
        [n.fileProp]: { type: 'text', label: t.file },
      },
    }, `
# ${t.ruleTests}

${t.ruleExplanation}
`);
    writeYaml(`${n.rules}/_views.yml`, [
      { name: t.allRuleTests, type: 'table', properties: ['ref', n.resultProp, n.requirements, n.fileProp], sorts: [{ property: 'ref', direction: 'asc' }], default: true },
    ]);
    writeYaml(`${n.rules}/_order.yml`, rules.map(ruleNode));
    for (const r of rules) {
      write(`${n.rules}/${ruleNode(r)}.md`, {
        id: ruleNode(r), title: `${r.nr} ${r.title}`, ref: r.nr, [n.resultProp]: r.fulfilled ? 'passed' : 'failed',
        [n.requirements]: r.reqs.map(reqNode), [n.fileProp]: r.file ? `${r.file}${r.line ? `:${r.line}` : ''}` : '',
      }, `
# ${r.nr} ${r.title}

| | |
|---|---|
| ${t.requirements} | ${r.reqs.map(reqLink).join(' ') || '–'} |
${(r.targets ?? []).length ? `| ${t.targetInNewSystem} | ${r.targets.map(reqLink).join(' ')} |\n` : ''}| ${t.test} | \`${r.file || r.id}${r.line ? `:${r.line}` : ''}\` |
| ${t.result} | ${r.fulfilled ? t.status.passed : `**${t.failed}**, ${r.deviation}`} |
${r.message && !r.fulfilled ? `\n${quote(r.message)}\n` : ''}`);
    }
  }

  // ------------------------------------------------------------ proposals

  if (proposals.length) {
    write(`${n.proposals}/_index.md`, {
      id: n.proposals, type: 'chapter', title: t.proposals,
      schema: {
        ref: { type: 'text', label: t.no, required: true },
        [n.requirements]: { type: 'relation', label: t.requirements, collection: n.requirements, display: 'ref' },
      },
    }, `
# ${t.proposals}

${texts.proposalsIntro ? stripHtml(texts.proposalsIntro) : t.proposalsIntro}
`);
    writeYaml(`${n.proposals}/_views.yml`, [
      { name: t.allProposals, type: 'table', properties: ['ref', n.requirements, 'confirmation'], sorts: [{ property: 'ref', direction: 'asc' }], default: true },
    ]);
    writeYaml(`${n.proposals}/_order.yml`, proposals.map(qNode));
    const idRe = new RegExp(`\\b(${cfg.idPattern})\\b`, 'g');
    for (const q of proposals) {
      const refs = requirements.filter((r) => behaviour.questionsOf(r.id).includes(q)).map((r) => r.id);
      // Body without its own H1; requirement ids become links
      const body = q.body.replace(/^# .*\n/m, '').replace(idRe, (m) => (byId[m] ? reqLink(m) : m));
      write(`${n.proposals}/${qNode(q)}.md`, { id: qNode(q), title: q.fm.title, ref: q.fm.ref ?? q.fm.id, [n.requirements]: refs.map(reqNode) }, `# ${q.fm.title}\n${body}`);
    }
  }

  // ------------------------------------------------------------ sources

  write(`${n.sources}/_index.md`, { id: n.sources, type: 'chapter', title: t.navSources }, `
# ${t.navSources}

${t.sourcesIntro}

${Object.values(sources).map((d) => `- ${link(sourceNode(d), `${d.id}: ${d.title}`)}`).join('\n')}
`);
  writeYaml(`${n.sources}/_order.yml`, Object.values(sources).map(sourceNode));
  for (const doc of Object.values(sources)) {
    const rows = doc.sections.map((sec) => {
      const refs = requirements.flatMap((r) => r.sources.filter((s) => s.doc === doc.id && sectionOf(doc, s.section)?.no === sec.no).map((s) => ({ r, s })));
      const ids = [...new Set(refs.map((x) => x.r.id))];
      const tested = ids.filter((id) => isCovered(id));
      const state = !ids.length ? 'none' : tested.length === ids.length ? 'full' : tested.length ? 'some' : 'derived';
      return [sec.no, `**${sec.title}**${refs.map(({ r, s }) => ` · ${reqLink(r.id)} „${s.quote}“`).join('')}`, t.coverage[state]];
    });
    write(`${n.sources}/${sourceNode(doc)}.md`, { id: sourceNode(doc), title: `${doc.id}: ${doc.title}` }, `
# ${doc.title}

${doc.file ? `${t.file} \`${doc.file}\`${doc.revision ? `, ${t.revision} ${doc.revision}` : ''}. ` : ''}${doc.url ?? ''}

${rows.length ? table([t.section, t.sectionHeader, t.coverageHeader], rows) : ''}
`);
  }

  // ------------------------------------------------------------ traceability

  write(`${n.traceability}.md`, { id: n.traceability, title: t.navTraceability }, `
# ${t.navTraceability}

${t.traceabilityIntro}

${table([t.requirement, t.result, t.flowSteps, ...(rules.length ? [t.ruleTests] : [])], requirements.map((r) => [
    reqLink(r.id), t.status[status(r.id)],
    coverage[r.id].map(({ flow, step }) => `${link(flowNode(flow), flow.plain ? flow.id : step.nr)}${step.fulfilled ? '' : ` (${step.deviation})`}`).join(', '),
    ...(rules.length ? [ruleCoverage[r.id].map((rule) => `${link(ruleNode(rule), rule.nr)}${rule.fulfilled ? '' : ` (${rule.deviation})`}`).join(', ')] : []),
  ]))}
`);

  const files = listFiles(outDir);
  return { outDir, pages: files.filter((file) => file.endsWith('.md')).length, images: files.filter((file) => file.endsWith('.png')).length };
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, '').replace(/\s*\n\s*/g, ' ').trim();
}
