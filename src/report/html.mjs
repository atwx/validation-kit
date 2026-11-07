// Static HTML report: overview, one page per requirement, source documents
// with coverage per section, one page per flow test (step table with
// attachments), rule tests, behaviour and questions, traceability matrix and
// a manifest with checksums of all files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionOf } from '../catalog.mjs';
import { esc, listFiles, makeDateFormatter, miniMarkdown as md, sha256, slug } from '../util.mjs';

const STYLE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'style.css');

export function buildHtml(model, outDir = model.cfg.path('html')) {
  const { cfg, sources, areas, requirements, byId, run, flows, rules, ruleRun, behaviour, coverage, ruleCoverage, isCovered, status, deviations, counts } = model;
  const { t } = cfg;
  const fmtDate = makeDateFormatter(cfg.locale, cfg.timeZone);
  const texts = cfg.texts;
  const b = cfg.behaviour;
  const f = b.fields;

  fs.rmSync(outDir, { recursive: true, force: true });
  for (const dir of ['requirements', 'sources', 'tests', 'attachments']) fs.mkdirSync(path.join(outDir, dir), { recursive: true });

  for (const flow of flows) {
    for (const step of flow.record.steps) {
      for (const a of step.attachments) {
        a.href = `attachments/${a.target}`;
        if (a.file && fs.existsSync(a.file)) fs.copyFileSync(a.file, path.join(outDir, a.href));
      }
    }
    flow.page = `tests/flow-${slug(flow.id)}.html`;
  }

  // ------------------------------------------------------------ helpers

  const write = (rel, html) => fs.writeFileSync(path.join(outDir, rel), html);
  const pill = (s) => `<span class="pill pill-${s}">${esc(t.status[s] ?? s)}</span>`;
  const legacyPill = (req) => (req.legacy ? `<span class="pill pill-legacy-${req.legacy.status}" title="${esc(t.legacySystem)}">${esc(t.legacySystem)}: ${esc(t.legacy[req.legacy.status])}</span>` : '');
  const riskPill = (risk) => `<span class="pill pill-risk-${slug(risk)}">${esc(t.riskLabel(t.risk[risk] ?? risk))}</span>`;
  const reqLink = (id, depth) => `<a class="req-chip req-${status(id)}" href="${depth}requirements/${slug(id)}.html" title="${esc(byId[id]?.title)}">${esc(id)}</a>`;
  const sectionAnchor = (no) => `s-${slug(no)}`;
  const sourceRef = (src, depth) => {
    const doc = sources[src.doc];
    const sec = sectionOf(doc, src.section);
    return `<a href="${depth}sources/${slug(doc.id)}.html${sec ? `#${sectionAnchor(sec.no)}` : ''}">${esc(doc.id)} ${esc(src.section ?? '')}</a>`;
  };
  const entryOf = (id) => behaviour?.byRef[id];
  const targetPill = (id) => {
    const e = entryOf(id);
    if (!e) return '';
    return `<span class="pill pill-target-${slug(e.fm[f.target])}" title="${esc(t.targetInNewSystem)}">${esc(behaviour.labels[f.target]?.[e.fm[f.target]] ?? e.fm[f.target])}</span>`;
  };
  const questionLink = (q, depth) => `<a class="req-chip q-chip q-${slug(q.fm[f.state] ?? '')}" href="${depth}behaviour.html#${esc(q.fm.id)}" title="${esc(q.fm.title)}">${esc(q.fm.ref ?? q.fm.id)}</a>`;
  // A plain Playwright test is named after its spec file
  const flowName = (flow) => (flow.plain ? path.basename(flow.file ?? flow.id) : `${t.flow} ${flow.id}`);

  const firstSource = Object.values(sources)[0];
  const layout = ({ title, depth, body, active }) => {
    const nav = [
      ['index.html', t.navOverview, 'index'],
      ...(firstSource ? [[`sources/${slug(firstSource.id)}.html`, t.navSources, 'sources']] : []),
      ['matrix.html', t.navTraceability, 'matrix'],
      ...(rules.length ? [['tests/rules.html', t.ruleTests, 'rules']] : []),
      ...(behaviour ? [['behaviour.html', t.navBehaviour, 'behaviour']] : []),
    ].map(([href, label, key]) => `<a href="${depth}${href}" class="${active === key ? 'active' : ''}">${esc(label)}</a>`).join('');
    return `<!doctype html>
<html lang="${esc(cfg.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(cfg.title)}</title>
<link rel="stylesheet" href="${depth}style.css">
</head>
<body>
<header class="top">
  <a class="brand" href="${depth}index.html">${esc(cfg.title)}</a>
  <nav>${nav}</nav>
  <span class="system">${esc(run.systemLabel ?? '')}</span>
</header>
<main>
${body}
</main>
<footer>${esc(t.generated)} ${esc(fmtDate(new Date().toISOString()))} · ${esc(t.run)} ${esc(fmtDate(run.startedAt))} · ${esc(t.commit)} ${esc(run.commit ?? '–')} · ${t.checksumsIn('<a href="' + depth + 'manifest.json">manifest.json</a>')}</footer>
</body>
</html>
`;
  };

  // ------------------------------------------------------------ overview

  const legacyNotMet = requirements.filter((r) => r.legacy?.status === 'not_met').length;
  const legacyPartial = requirements.filter((r) => r.legacy?.status === 'partial').length;
  const allSteps = flows.flatMap((fl) => fl.record.steps);
  const hasLegacy = requirements.some((r) => r.legacy);

  const areaRows = areas.map((a) => {
    const c = { passed: 0, unit: 0, deviation: 0, untested: 0 };
    for (const r of a.requirements) c[status(r.id)]++;
    const notMet = a.requirements.filter((r) => r.legacy?.status === 'not_met').length;
    return `<tr><td><a href="#area-${slug(a.area)}">${esc(a.area)}</a></td><td class="num">${a.requirements.length}</td>
    <td class="num">${c.passed || ''}</td>${rules.length ? `<td class="num">${c.unit || ''}</td>` : ''}<td class="num">${c.deviation || ''}</td><td class="num">${c.untested || ''}</td>${hasLegacy ? `<td class="num">${notMet || ''}</td>` : ''}</tr>`;
  }).join('');

  const flowRows = flows.map((fl) => {
    const ok = fl.record.steps.filter((s) => s.fulfilled).length;
    const known = fl.deviations.filter((s) => s.knownDefectApplied).length;
    return `<tr><td><a href="${fl.page}">${esc(flowName(fl))}</a></td><td>${esc(fl.record.title)}</td>
    <td class="num">${fl.record.steps.length}</td><td class="num">${ok}</td><td class="num">${fl.deviations.length || ''}</td>
    <td>${fl.status === 'passed' ? (fl.deviations.length ? esc(t.knownCount(known)) : esc(t.withoutDeviation)) : `<strong class="bad">${esc(t.aborted)} (${esc(fl.status)})</strong>`}</td>
    <td>${esc(fmtDate(fl.startTime))}</td></tr>`;
  }).join('');

  const deviationRows = deviations.map((d) => (d.step ? `<tr>
  <td><a href="${d.flow.page}#step-${slug(d.step.nr)}">${esc(d.ref)}</a></td>
  <td>${esc(flowName(d.flow))}, ${esc(t.step)} ${esc(d.step.nr)}: ${esc(d.step.title)}</td>
  <td>${d.step.reqs.map((id) => reqLink(id, '')).join(' ')}</td>
  <td>${esc(d.step.actual)}</td>
  <td>${d.step.knownDefectApplied ? `${esc(t.knownDefect)}: ${esc(d.step.knownDefect.note)}` : `<strong class="bad">${esc(t.new)}</strong>`}</td>
</tr>` : `<tr>
  <td><a href="tests/rules.html#${slug(d.rule.nr)}">${esc(d.ref)}</a></td>
  <td>${esc(t.ruleTest)} ${esc(d.rule.nr)}: ${esc(d.rule.title)}</td>
  <td>${d.rule.reqs.map((id) => reqLink(id, '')).join(' ')}</td>
  <td>${esc(d.rule.message)}</td>
  <td><strong class="bad">${esc(t.new)}</strong></td>
</tr>`)).join('');

  const reqTable = areas.map((a) => `
  <tbody id="area-${slug(a.area)}">
  <tr class="group"><th colspan="6">${esc(a.area)} <span class="muted">· ${esc(a.description ?? '')}</span></th></tr>
  ${a.requirements.map((r) => `<tr data-search="${esc([r.id, r.title, r.acceptance, ...r.sources.map((s) => `${s.doc} ${s.section ?? ''} ${s.quote ?? ''}`), r.legacy?.evidence?.join(' '), entryOf(r.id)?.fm[f.target], ...(entryOf(r.id)?.fm[f.questions] ?? [])].join(' ').toLowerCase())}">
    <td><a href="requirements/${slug(r.id)}.html">${esc(r.id)}</a></td>
    <td>${esc(r.title)}<div class="muted small">${r.sources.filter((s) => sources[s.doc]).map((s) => sourceRef(s, '')).join(' · ')}</div></td>
    <td>${r.risk ? riskPill(r.risk) : ''}</td>
    <td>${pill(status(r.id))}</td>
    <td>${legacyPill(r)}</td>
    <td>${targetPill(r.id)}${(behaviour?.questionsOf(r.id) ?? []).map((q) => ' ' + questionLink(q, '')).join('')}</td>
  </tr>`).join('')}
  </tbody>`).join('');

  write('index.html', layout({
    title: t.navOverview, depth: '', active: 'index', body: `
<h1>${esc(cfg.title)}</h1>
<p class="lead">${esc(t.leadRun(fmtDate(run.startedAt), run.systemLabel ?? t.unknownSystem))}
${esc(t.leadCoverage(flows.length, allSteps.length, rules.length, requirements.filter((r) => isCovered(r.id)).length, requirements.length))}</p>
${texts.intro ? `<div class="intro">${texts.intro}</div>` : ''}

<section class="cards">
  <div class="card"><div class="big">${requirements.length}</div>${esc(t.requirements)}</div>
  <div class="card ok"><div class="big">${counts.passed}</div>${esc(t.cardPassed)}</div>
  ${rules.length ? `<div class="card model"><div class="big">${counts.unit}</div>${esc(t.cardUnit)}</div>` : ''}
  <div class="card bad"><div class="big">${counts.deviation}</div>${esc(t.cardDeviation)}</div>
  <div class="card"><div class="big">${counts.untested}</div>${esc(t.cardUntested)}</div>
  ${hasLegacy ? `<div class="card legacy"><div class="big">${legacyNotMet}</div>${esc(t.cardLegacyNotMet)}${legacyPartial ? ` (+${legacyPartial} ${esc(t.legacy.partial)})` : ''}</div>` : ''}
</section>

<h2>${esc(t.systemState)}</h2>
<table class="kv">
  <tr><th>${esc(t.system)}</th><td>${esc(run.systemLabel ?? '–')}</td></tr>
  <tr><th>URL</th><td>${esc(run.baseURL ?? '–')}</td></tr>
  <tr><th>${esc(t.codeVersion)}</th><td>${esc(run.commit ?? '–')}</td></tr>
  <tr><th>${esc(t.testData)}</th><td>${esc(run.testData ?? '–')}</td></tr>
  <tr><th>${esc(t.run)}</th><td>${esc(fmtDate(run.startedAt))} – ${esc(fmtDate(run.finishedAt))}${run.databaseRestored ? esc(t.databaseRestored) : ''}</td></tr>
</table>

<h2>${esc(t.flowTests)}</h2>
<table class="list">
  <thead><tr><th>${esc(t.flow)}</th><th>${esc(t.title)}</th><th class="num">${esc(t.steps)}</th><th class="num">${esc(t.fulfilledShort)}</th><th class="num">${esc(t.deviations)}</th><th>${esc(t.result)}</th><th>${esc(t.performed)}</th></tr></thead>
  <tbody>${flowRows || `<tr><td colspan="7">${esc(t.noResults)}</td></tr>`}</tbody>
</table>

${rules.length ? `<h2>${esc(t.ruleTests)}</h2>
<p>${esc(t.ruleSummary(rules.length, ruleRun.tool, fmtDate(ruleRun.finishedAt), rules.filter((r) => r.fulfilled).length))}${model.ruleDeviationCount ? `, <strong class="bad">${esc(t.withDeviationCount(model.ruleDeviationCount))}</strong>` : ''}.
${esc(t.ruleExplanation)} <a href="tests/rules.html">${esc(t.allRuleTests)}</a></p>
${texts.ruleNote ? `<div class="note">${texts.ruleNote}</div>` : ''}` : ''}

<h2>${esc(t.deviations)}</h2>
${deviations.length ? `<table class="list">
  <thead><tr><th>${esc(t.no)}</th><th>${esc(t.step)}</th><th>${esc(t.requirements)}</th><th>${esc(t.actual)}</th><th>${esc(t.classification)}</th></tr></thead>
  <tbody>${deviationRows}</tbody>
</table>` : `<p>${esc(t.noDeviations)}</p>`}

<h2>${esc(t.areas)}</h2>
<table class="list">
  <thead><tr><th>${esc(t.area)}</th><th class="num">${esc(t.requirements)}</th><th class="num">${esc(t.status.passed)}</th>${rules.length ? `<th class="num">${esc(t.status.unit)}</th>` : ''}<th class="num">${esc(t.status.deviation)}</th><th class="num">${esc(t.status.untested)}</th>${hasLegacy ? `<th class="num">${esc(t.legacyNotMetShort)}</th>` : ''}</tr></thead>
  <tbody>${areaRows}</tbody>
</table>

<h2>${esc(t.requirements)}</h2>
<div class="searchbar">
  <input type="search" id="q" placeholder="${esc(t.searchPlaceholder)}" autocomplete="off">
  ${hasLegacy ? `<label><input type="checkbox" id="only-legacy"> ${esc(t.onlyLegacyNotMet)}</label>` : ''}
  <label><input type="checkbox" id="only-tested"> ${esc(t.onlyTested)}</label>
  <span id="hits" class="muted"></span>
</div>
<table class="list reqs" id="reqs">
  <thead><tr><th>ID</th><th>${esc(t.requirementAndSources)}</th><th>${esc(t.riskHeader)}</th><th>${esc(t.test)}</th><th>${esc(t.legacySystem)}</th><th>${esc(t.newSystem)}</th></tr></thead>
  ${reqTable}
</table>
<script>
(function () {
  const q = document.getElementById('q');
  const onlyLegacy = document.getElementById('only-legacy');
  const onlyTested = document.getElementById('only-tested');
  const rows = [...document.querySelectorAll('#reqs tr[data-search]')];
  const hits = document.getElementById('hits');
  function apply() {
    const terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    let n = 0;
    for (const row of rows) {
      const show = terms.every((w) => row.dataset.search.includes(w))
        && (!onlyLegacy || !onlyLegacy.checked || row.querySelector('.pill-legacy-not_met'))
        && (!onlyTested.checked || !row.querySelector('.pill-untested'));
      row.hidden = !show;
      if (show) n++;
    }
    for (const body of document.querySelectorAll('#reqs tbody')) {
      body.hidden = ![...body.querySelectorAll('tr[data-search]')].some((r) => !r.hidden);
    }
    hits.textContent = ${JSON.stringify(t.hitsOf)}.replace('{n}', n).replace('{total}', rows.length);
  }
  for (const el of [q, onlyLegacy, onlyTested]) if (el) el.addEventListener('input', apply);
  apply();
})();
</script>`,
  }));

  // ------------------------------------------------------------ requirement pages

  const behaviourHtml = (id) => {
    const e = entryOf(id);
    if (!e) return '';
    const targetLabel = behaviour.labels[f.target]?.[e.fm[f.target]] ?? e.fm[f.target];
    const qs = behaviour.questionsOf(id);
    const targetRules = rules.filter((x) => (x.targets ?? []).includes(id));
    return `<h2>${esc(t.newSystem)}: ${esc(targetLabel)}</h2>
  <table class="kv"><tr><th>${esc(t.target)}</th><td>${targetPill(id)}</td></tr>
  ${e.fm[f.build] ? `<tr><th>${esc(t.buildState)}</th><td>${esc(behaviour.labels[f.build]?.[e.fm[f.build]] ?? e.fm[f.build])}</td></tr>` : ''}
  ${qs.length ? `<tr><th>${esc(t.questions)}</th><td>${qs.map((q) => `${questionLink(q, '../')} ${esc(q.fm.title)} (${esc(behaviour.labels[f.state]?.[q.fm[f.state]] ?? q.fm[f.state])})`).join('<br>')}</td></tr>` : ''}</table>
  ${md(e.sections[b.sections.assessment])}
  ${e.sections[b.sections.implementation] ? `<div class="note">${md(e.sections[b.sections.implementation])}</div>` : ''}
  ${targetRules.length ? `<h3>${esc(t.targetRuleTests)}</h3><ul>${targetRules.map((x) => `<li><a href="../tests/rules.html#${slug(x.nr)}">${esc(x.nr)}</a> ${esc(x.title)} ${x.fulfilled ? pill('passed') : `<span class="pill pill-deviation">${esc(t.failed)}</span> ${esc(x.deviation)}`}</li>`).join('')}</ul>` : ''}
  <p class="small muted">${esc(t.sourceFile)}: <code>${esc(path.relative(cfg.root, e.file))}</code></p>`;
  };

  for (const r of requirements) {
    const steps = coverage[r.id];
    const sourcesHtml = r.sources.map((s) => {
      const doc = sources[s.doc];
      if (!doc) return '';
      const sec = sectionOf(doc, s.section);
      return `<blockquote class="quote">
      <p>${esc(s.quote)}</p>
      <cite>${sourceRef(s, '../')} ${esc(sec?.title ?? '')} · ${esc(doc.title)}${cfg.paraphraseTypes.includes(s.quote_type) ? ` · <em>${esc(t.paraphrase)}</em>` : ''}</cite>
    </blockquote>`;
    }).join('');
    const stepHtml = steps.length ? `<table class="list">
    <thead><tr><th>${esc(t.flowStep)}</th><th>${esc(t.expected)}</th><th>${esc(t.actual)}</th><th>${esc(t.fulfilledShort)}</th></tr></thead>
    <tbody>${steps.map(({ flow, step }) => `<tr>
      <td><a href="../${flow.page}#step-${slug(step.nr)}">${esc(flow.plain ? flow.id : step.nr)} ${flow.plain ? '' : esc(step.title)}</a></td>
      <td>${esc(step.expected)}</td>
      <td>${esc(step.actual)}</td>
      <td>${step.fulfilled ? `<span class="pill pill-passed">${esc(t.yes)}</span>` : `<span class="pill pill-deviation">${esc(t.no_)}</span> ${esc(step.deviation)}`}</td>
    </tr>`).join('')}</tbody></table>` : '';
    const ruleHtml = ruleCoverage[r.id].length ? `<h3>${esc(t.ruleTests)}</h3><table class="list">
    <thead><tr><th>${esc(t.no)}</th><th>${esc(t.ruleTest)}</th><th>${esc(t.result)}</th></tr></thead>
    <tbody>${ruleCoverage[r.id].map((rule) => `<tr>
      <td><a href="../tests/rules.html#${slug(rule.nr)}">${esc(rule.nr)}</a></td>
      <td>${esc(rule.title)}<div class="small muted"><code>${esc(rule.file)}${rule.line ? `:${rule.line}` : ''}</code></div></td>
      <td>${rule.fulfilled ? pill('passed') : `<span class="pill pill-deviation">${esc(t.failed)}</span> ${esc(rule.deviation)}`}</td>
    </tr>`).join('')}</tbody></table>` : '';
    write(`requirements/${slug(r.id)}.html`, layout({
      title: r.id, depth: '../', body: `
<p class="crumbs"><a href="../index.html#area-${slug(r.area)}">${esc(r.area)}</a></p>
<h1><span class="id">${esc(r.id)}</span> ${esc(r.title)}</h1>
<p>${r.risk ? riskPill(r.risk) : ''} ${pill(status(r.id))} ${legacyPill(r)} ${targetPill(r.id)}</p>
<h2>${esc(t.acceptance)}</h2>
<p class="acceptance">${esc(r.acceptance)}</p>
${r.note ? `<div class="note"><strong>${esc(t.note)}:</strong> ${esc(r.note)}</div>` : ''}
${sourcesHtml ? `<h2>${esc(t.navSources)}</h2>\n${sourcesHtml}` : ''}
${r.legacy ? `<h2>${esc(t.legacySystem)}: ${esc(t.legacy[r.legacy.status])}</h2><ul>${(r.legacy.evidence ?? []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
${behaviourHtml(r.id)}
<h2>${esc(t.tests)}</h2>
${steps.length && ruleCoverage[r.id].length ? `<h3>${esc(t.flowTests)}</h3>` : ''}${stepHtml}${ruleHtml}${!steps.length && !ruleCoverage[r.id].length ? `<p class="muted">${esc(t.noTestYet)}</p>` : ''}`,
    }));
  }

  // ------------------------------------------------------------ source views

  const sourceNav = Object.values(sources).map((d) => `<a href="${slug(d.id)}.html">${esc(d.id)}</a>`).join(' · ');
  for (const doc of Object.values(sources)) {
    const bySection = new Map(doc.sections.map((s) => [s.no, []]));
    const unsectioned = [];
    for (const r of requirements) {
      for (const s of r.sources) {
        if (s.doc !== doc.id) continue;
        const sec = sectionOf(doc, s.section);
        (sec ? bySection.get(sec.no) : unsectioned).push({ r, s });
      }
    }
    let withReq = 0;
    let withTest = 0;
    const rowFor = (no, title, refs, depthLevel) => {
      const ids = [...new Set(refs.map((x) => x.r.id))];
      const tested = ids.filter((id) => isCovered(id));
      if (ids.length) withReq++;
      if (tested.length) withTest++;
      const state = !ids.length ? 'none' : tested.length === ids.length ? 'full' : tested.length ? 'some' : 'derived';
      return `<tr id="${sectionAnchor(no)}" class="cov-${state}">
      <td class="secno" style="padding-left:${0.5 + depthLevel}em">${esc(no)}</td>
      <td><strong>${esc(title)}</strong>
        ${refs.map(({ r, s }) => `<div class="cite">${reqLink(r.id, '../')} <span class="quote-inline">„${esc(s.quote)}“</span></div>`).join('')}</td>
      <td><span class="cov cov-${state}">${esc(t.coverage[state])}</span></td>
    </tr>`;
    };
    const rows = doc.sections.map((sec) => rowFor(sec.no, sec.title, bySection.get(sec.no), String(sec.no).split('.').length - 1)).join('')
      + (unsectioned.length ? rowFor('–', t.withoutSection, unsectioned, 0) : '');
    write(`sources/${slug(doc.id)}.html`, layout({
      title: doc.title, depth: '../', active: 'sources', body: `
<p class="crumbs">${esc(t.navSources)}: ${sourceNav}</p>
<h1>${esc(doc.title)}</h1>
<p class="lead">${doc.file ? `${esc(t.file)} <code>${esc(doc.file)}</code>${doc.revision ? `, ${esc(t.revision)} ${esc(doc.revision)}` : ''}. ` : ''}${doc.url ? `<a href="${esc(doc.url)}">${esc(doc.url)}</a>. ` : ''}
${esc(t.sourceCoverage(withReq, doc.sections.length || 1, withTest))}</p>
<table class="list sections">
  <thead><tr><th>${esc(t.section)}</th><th>${esc(t.sectionHeader)}</th><th>${esc(t.coverageHeader)}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`,
    }));
  }

  // ------------------------------------------------------------ flow test pages

  for (const flow of flows) {
    const x = flow.record;
    const rows = x.steps.map((s) => `<tr id="step-${slug(s.nr)}" class="${s.fulfilled ? '' : 'row-bad'}">
    <td class="nowrap">${esc(s.nr)}</td>
    <td><strong>${esc(s.title)}</strong><div>${esc(s.procedure)}</div><div class="small">${s.reqs.map((id) => reqLink(id, '../')).join(' ')}</div></td>
    <td>${esc(s.expected)}</td>
    <td>${esc(s.actual)}${s.checks.length ? `<ul class="checks">${s.checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'} ${esc(c.label)}${c.error ? `<div class="small muted">${esc(c.error)}</div>` : ''}</li>`).join('')}</ul>` : ''}</td>
    <td>${s.fulfilled ? `<span class="pill pill-passed">${esc(t.yes)}</span>` : `<span class="pill pill-deviation">${esc(t.no_)}</span>`}</td>
    <td class="nowrap">${s.deviation ? `${esc(s.deviation)}${s.knownDefectApplied ? `<div class="small muted">${esc(t.known)}</div>` : ''}` : '–'}</td>
    <td class="nowrap">${s.attachments.map((a) => `<a href="#${slug(a.name)}">${esc(a.name)}</a>`).join('<br>') || '–'}</td>
    <td class="nowrap small">${esc(fmtDate(s.startedAt))}<br>${esc(t.automated)}</td>
  </tr>`).join('');
    const missing = x.steps.length && flow.status !== 'passed' ? `<p class="bad">${esc(t.abortedAfter(x.steps.at(-1).nr))}</p>` : '';
    const attachments = x.steps.flatMap((s) => s.attachments.map((a) => ({ s, a })));
    write(flow.page, layout({
      title: flowName(flow), depth: '../', body: `
<p class="crumbs"><a href="../index.html">${esc(t.navOverview)}</a></p>
<h1>${esc(flow.plain ? x.title : `${flowName(flow)}: ${x.title}`)}</h1>
<table class="kv">
  ${x.purpose ? `<tr><th>${esc(t.purpose)}</th><td>${esc(x.purpose)}</td></tr>` : ''}
  ${x.roles?.length ? `<tr><th>${esc(t.roles)}</th><td>${esc(x.roles.join(', '))}</td></tr>` : ''}
  ${x.precondition ? `<tr><th>${esc(t.precondition)}</th><td>${esc(x.precondition)}</td></tr>` : ''}
  <tr><th>${esc(t.requirements)}</th><td>${x.reqs.map((id) => reqLink(id, '../')).join(' ')}</td></tr>
  <tr><th>${esc(t.system)}</th><td>${esc(run.systemLabel ?? x.system ?? '–')} · ${esc(t.codeVersion)} ${esc(run.commit ?? '–')}</td></tr>
  <tr><th>${esc(t.execution)}</th><td>${esc(t.executionText(fmtDate(flow.startTime), (flow.duration / 1000).toFixed(1)))} (<code>${esc(x.specFile ?? flow.file)}</code>)</td></tr>
  <tr><th>${esc(t.result)}</th><td>${esc(t.criteriaMet(x.steps.filter((s) => s.fulfilled).length, x.steps.length, flow.deviations.length))}</td></tr>
</table>
${missing}
<h2>${esc(t.stepTable)}</h2>
<table class="list xq">
  <thead><tr><th>${esc(t.no)}</th><th>${esc(t.stepProcedure)}</th><th>${esc(t.expected)}</th><th>${esc(t.actual)}</th><th>${esc(t.fulfilledShort)}</th><th>${esc(t.deviationNo)}</th><th>${esc(t.attachments)}</th><th>${esc(t.date)}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${attachments.length ? `<h2>${esc(t.attachments)}</h2>
${attachments.map(({ s, a }) => `<figure id="${slug(a.name)}">
  <a href="../${a.href}"><img src="../${a.href}" alt="${esc(a.caption)}" loading="lazy"></a>
  <figcaption><strong>${esc(a.name)}</strong> – ${esc(a.caption)} (${esc(t.step)} ${esc(s.nr)}; ${esc(t.framedInRed)})</figcaption>
</figure>`).join('')}` : ''}`,
    }));
  }

  // ------------------------------------------------------------ rule tests

  if (rules.length) {
    const byClass = Map.groupBy(rules, (r) => r.class);
    write('tests/rules.html', layout({
      title: t.ruleTests, depth: '../', active: 'rules', body: `
<p class="crumbs"><a href="../index.html">${esc(t.navOverview)}</a></p>
<h1>${esc(t.ruleTests)}</h1>
<table class="kv">
  <tr><th>${esc(t.tool)}</th><td>${esc(ruleRun.tool)}</td></tr>
  <tr><th>${esc(t.execution)}</th><td>${esc(fmtDate(ruleRun.finishedAt))}</td></tr>
  <tr><th>${esc(t.result)}</th><td>${esc(t.passedOf(rules.filter((r) => r.fulfilled).length, rules.length))}</td></tr>
</table>
<p>${esc(t.ruleExplanation)}</p>
${texts.ruleNote ? `<div class="note">${texts.ruleNote}</div>` : ''}
${[...byClass].map(([cls, list]) => `<h2><code>${esc(cls)}</code></h2>
<table class="list">
  <thead><tr><th>${esc(t.no)}</th><th>${esc(t.rule)}</th><th>${esc(t.requirements)}</th><th>${esc(t.result)}</th><th class="num">${esc(t.duration)}</th></tr></thead>
  <tbody>${list.map((r) => `<tr id="${slug(r.nr)}" class="${r.fulfilled ? '' : 'row-bad'}">
    <td>${esc(r.nr)}</td>
    <td>${esc(r.title)}<div class="small muted"><code>${esc(r.method)}</code>${r.file ? ` · <code>${esc(r.file)}${r.line ? `:${r.line}` : ''}</code>` : ''}</div>${r.message ? `<div class="small bad">${esc(r.message)}</div>` : ''}</td>
    <td>${r.reqs.map((id) => reqLink(id, '../')).join(' ')}${(r.targets ?? []).map((id) => ` <a class="req-chip target-chip" href="../requirements/${slug(id)}.html" title="${esc(t.targetChipTitle)}">${esc(t.target)} ${esc(id)}</a>`).join('')}${!r.reqs.length && !(r.targets ?? []).length ? '<span class="muted">–</span>' : ''}</td>
    <td>${r.fulfilled ? pill('passed') : `<span class="pill pill-deviation">${esc(t.failed)}</span> ${esc(r.deviation)}`}</td>
    <td class="num">${r.timeMs ?? ''} ms</td>
  </tr>`).join('')}</tbody>
</table>`).join('')}`,
    }));
  }

  // ------------------------------------------------------------ behaviour and questions

  if (behaviour) {
    const entries = behaviour.inventory.entries;
    const targetOptions = behaviour.inventory.schema[f.target]?.options ?? [];
    const optValue = (o) => (typeof o === 'string' ? o : o.value);
    const optLabel = (o) => (typeof o === 'string' ? o : o.label ?? o.value);
    const count = (v) => entries.filter((e) => e.fm[f.target] === v).length;
    const head = `<thead><tr><th>ID</th><th>${esc(t.requirement)}</th><th>${esc(t.assessment)}</th><th>${esc(t.questions)}</th><th>${esc(t.buildState)}</th></tr></thead>`;
    const list = (v) => entries.filter((e) => e.fm[f.target] === v).map((e) => `<tr>
    <td><a href="requirements/${slug(e.fm[f.ref])}.html">${esc(e.fm[f.ref])}</a></td><td>${esc(byId[e.fm[f.ref]]?.title)}</td>
    <td>${md(e.sections[b.sections.assessment])}</td>
    <td>${behaviour.questionsOf(e.fm[f.ref]).map((q) => questionLink(q, '')).join(' ')}</td>
    <td>${esc(behaviour.labels[f.build]?.[e.fm[f.build]] ?? e.fm[f.build] ?? '')}</td></tr>`).join('');
    const questionRows = (proposals) => behaviour.questions.entries.filter((q) => (q.fm[f.state] === b.proposalState) === proposals).map((q) => `<tr id="${esc(q.fm.id)}">
    <td class="nowrap"><strong>${esc(q.fm.ref ?? q.fm.id)}</strong></td>
    <td><strong>${esc(q.fm.title)}</strong>${md(q.sections[b.sections.question])}<div class="small muted">${md(q.sections[b.sections.background])}</div>
      ${q.sections[b.sections.decision] ? `<div class="note small">${md(q.sections[b.sections.decision])}</div>` : ''}
      ${q.sections[b.sections.answer] ? `<div class="small"><strong>${esc(t.answer)}:</strong> ${md(q.sections[b.sections.answer])}</div>` : ''}</td>
    <td>${md(q.sections[b.sections.interim])}</td>
    <td>${(q.fm[f.requirements] ?? []).map((inv) => { const e = behaviour.inventory.byId[inv]; return e ? reqLink(e.fm[f.ref], '') : esc(inv); }).join(' ')}${(q.fm[f.requirements] ?? []).length ? '' : entries.filter((e) => (e.fm[f.questions] ?? []).includes(q.fm.id)).map((e) => reqLink(e.fm[f.ref], '')).join(' ')}</td>
    <td><span class="pill q-pill-${slug(q.fm[f.state] ?? '')}">${esc(behaviour.labels[f.state]?.[q.fm[f.state]] ?? q.fm[f.state] ?? '')}</span></td>
  </tr>`).join('');
    const proposals = behaviour.questions.entries.filter((q) => q.fm[f.state] === b.proposalState);
    const open = behaviour.questions.entries.filter((q) => ![b.answeredState, b.proposalState].includes(q.fm[f.state]));
    write('behaviour.html', layout({
      title: t.navBehaviour, depth: '', active: 'behaviour', body: `
<h1>${esc(t.behaviourTitle)}</h1>
${texts.behaviourIntro ? `<p class="lead">${texts.behaviourIntro}</p>` : ''}
<section class="cards">
  ${targetOptions.map((o) => `<div class="card"><div class="big">${count(optValue(o))}</div>${esc(optLabel(o))}</div>`).join('')}
  <div class="card"><div class="big">${proposals.length}</div>${esc(t.proposals)}</div>
  <div class="card"><div class="big">${open.length}</div>${esc(t.openQuestions)}</div>
</section>

${behaviour.questions.entries.length - proposals.length ? `<h2>${esc(t.questions)}</h2>
<table class="list"><thead><tr><th>${esc(t.no)}</th><th>${esc(t.question)}</th><th>${esc(t.interim)}</th><th>${esc(t.requirements)}</th><th>${esc(t.state)}</th></tr></thead>
<tbody>${questionRows(false)}</tbody></table>` : ''}

${proposals.length ? `<h2>${esc(t.proposals)}</h2>
${texts.proposalsIntro ? `<p>${texts.proposalsIntro}</p>` : ''}
<table class="list"><thead><tr><th>${esc(t.no)}</th><th>${esc(t.proposal)}</th><th>${esc(t.interim)}</th><th>${esc(t.requirements)}</th><th>${esc(t.state)}</th></tr></thead>
<tbody>${questionRows(true)}</tbody></table>` : ''}

${targetOptions.filter((o) => optValue(o) !== b.keepTarget && count(optValue(o))).map((o) => `<h2>${esc(optLabel(o))}</h2>
${texts[`target_${optValue(o)}`] ? `<p>${texts[`target_${optValue(o)}`]}</p>` : ''}
<table class="list">${head}<tbody>${list(optValue(o))}</tbody></table>`).join('\n')}

<p class="small muted">${esc(t.behaviourSource)}: <code>${esc(path.relative(cfg.root, behaviour.dir))}</code></p>`,
    }));
  }

  // ------------------------------------------------------------ traceability matrix

  const matrixRules = rules.filter((r) => r.reqs.length);
  const matrixHead = flows.flatMap((fl) => fl.record.steps.map((s) => `<th class="vert" title="${esc(s.title)}"><a href="${fl.page}#step-${slug(s.nr)}">${esc(fl.plain ? fl.id : s.nr)}</a></th>`)).join('')
    + matrixRules.map((r) => `<th class="vert" title="${esc(r.title)}"><a href="tests/rules.html#${slug(r.nr)}">${esc(r.nr)}</a></th>`).join('');
  const cell = (hit, ok) => (hit ? `<td class="${ok ? 'm-ok' : 'm-bad'}">${ok ? '●' : '✗'}</td>` : '<td></td>');
  const matrixRows = requirements.filter((r) => isCovered(r.id)).map((r) => `<tr><th><a href="requirements/${slug(r.id)}.html">${esc(r.id)}</a></th>${
    flows.flatMap((fl) => fl.record.steps.map((s) => cell(s.reqs.includes(r.id), s.fulfilled))).join('')
    + matrixRules.map((rule) => cell(rule.reqs.includes(r.id), rule.fulfilled)).join('')}</tr>`).join('');
  write('matrix.html', layout({
    title: t.navTraceability, depth: '', active: 'matrix', body: `
<h1>${esc(t.matrixTitle)}</h1>
<p class="lead">${esc(t.matrixLead(matrixRules.length > 0, counts.untested))}</p>
<div class="scroll"><table class="matrix"><thead><tr><th></th>${matrixHead}</tr></thead><tbody>${matrixRows}</tbody></table></div>
<p><a href="matrix.csv">${esc(t.downloadCsv)}</a></p>`,
  }));
  const csvRow = (cells) => cells.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
  const csv = [t.csvHead.join(';'),
    ...requirements.map((r) => csvRow([r.id, r.title, r.area, r.risk, t.status[status(r.id)], r.legacy ? t.legacy[r.legacy.status] : '',
      coverage[r.id].map(({ flow, step }) => `${flow.plain ? flow.id : step.nr}${step.fulfilled ? '' : ` (${step.deviation})`}`).join(', '),
      ruleCoverage[r.id].map((rule) => `${rule.nr}${rule.fulfilled ? '' : ` (${rule.deviation})`}`).join(', '),
      entryOf(r.id) ? behaviour.labels[f.target]?.[entryOf(r.id).fm[f.target]] ?? '' : '',
      (behaviour?.questionsOf(r.id) ?? []).map((q) => q.fm.ref ?? q.fm.id).join(', ')]))].join('\n');
  fs.writeFileSync(path.join(outDir, 'matrix.csv'), `﻿${csv}\n`);

  // ------------------------------------------------------------ assets and manifest

  fs.copyFileSync(cfg.styleSheet ? path.resolve(cfg.root, cfg.styleSheet) : STYLE, path.join(outDir, 'style.css'));
  const files = listFiles(outDir);
  const input = (key) => (fs.existsSync(cfg.path(key)) ? { file: path.relative(cfg.root, cfg.path(key)), sha256: sha256(cfg.path(key)) } : null);
  const manifest = {
    generatedAt: new Date().toISOString(),
    run,
    results: input('playwright'),
    ruleTests: input('rules'),
    files: Object.fromEntries(files.map((file) => [path.relative(outDir, file), sha256(file)])),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { outDir, pages: files.filter((file) => file.endsWith('.html')).length, deviations: deviations.length };
}
