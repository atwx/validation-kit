// vkit: command line of the validation kit. Runs in the validation directory
// (the one with vkit.config.mjs) or with --dir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { checkCatalog, loadCatalog, loadSources } from './catalog.mjs';
import { loadBehaviour, validateBehaviour } from './behaviour.mjs';
import { checkDomain, domainFit, loadDomain } from './domain.mjs';
import { junitToRuleTests, writeRuleTests } from './results.mjs';
import { buildModel } from './model.mjs';
import { buildHtml } from './report/html.mjs';
import { buildFriendlyBase } from './report/friendlybase.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `vkit – requirements, tests and reports for system rebuilds

Usage: vkit <command> [options]

  init [dir] [--lang en|de]   create a validation directory with config and examples
  check                       check catalogue, quotes and behaviour inventory
  report                      build the HTML report (paths.html)
  report --fb                 build the FriendlyBase package (paths.friendlybase)
  status                      print requirement status counts
  junit <file.xml> [--tool T] convert JUnit XML into rule tests (paths.rules)

Options:
  --dir <path>                validation directory (default: current directory)
`;

function parse(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && ['dir', 'lang', 'tool'].includes(key)) { args[key] = next; i++; } else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

export async function main(argv) {
  const args = parse(argv);
  const [command, ...rest] = args._;
  const dir = path.resolve(args.dir ?? process.cwd());
  switch (command) {
    case 'init': return init(path.resolve(rest[0] ?? dir), args.lang ?? 'en');
    case 'check': return check(await loadConfig(dir));
    case 'report': {
      const cfg = await loadConfig(dir);
      const model = buildModel(cfg);
      if (args.fb) {
        const r = buildFriendlyBase(model);
        console.log(`FriendlyBase: ${path.relative(process.cwd(), r.outDir) || '.'}/ (${r.pages} pages, ${r.images} images)`);
      } else {
        const r = buildHtml(model);
        console.log(`Report: ${path.relative(process.cwd(), path.join(r.outDir, 'index.html'))} (${model.requirements.length} requirements, ${model.flows.length} flow tests, ${model.rules.length} rule tests, ${r.deviations} deviations)`);
      }
      return 0;
    }
    case 'status': {
      const model = buildModel(await loadConfig(dir));
      const { t } = model.cfg;
      for (const [s, n] of Object.entries(model.counts)) console.log(`${String(n).padStart(4)}  ${t.status[s]}`);
      console.log(`${String(model.deviations.length).padStart(4)}  ${t.deviations}`);
      if (model.progress) {
        const { hasShare } = model.progress;
        console.log(`\n${t.buildState}${hasShare ? ` (${model.progress.lead})` : ''}`);
        for (const r of model.progress.rows()) console.log(`  ${r[0] || t.progressAll}: ${hasShare ? `${r.at(-1)}, ` : ''}${model.progress.options.map((o, i) => (r[i + 2] ? `${r[i + 2]} ${o.label}` : '')).filter(Boolean).join(', ')}`);
      }
      return 0;
    }
    case 'junit': {
      const cfg = await loadConfig(dir);
      if (!rest[0]) { console.error(USAGE); return 2; }
      const run = junitToRuleTests(fs.readFileSync(rest[0], 'utf8'), { idPattern: cfg.idPattern, tool: args.tool ?? 'JUnit' });
      fs.mkdirSync(path.dirname(cfg.path('rules')), { recursive: true });
      writeRuleTests(cfg.path('rules'), run);
      const linked = run.tests.filter((x) => x.reqs.length).length;
      console.log(`${run.tests.length} tests (${linked} with requirement ids) -> ${path.relative(process.cwd(), cfg.path('rules'))}`);
      return 0;
    }
    case undefined:
    case 'help':
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command ${command}\n\n${USAGE}`);
      return 2;
  }
}

function check(cfg) {
  const { t } = cfg;
  const sources = loadSources(cfg);
  const catalog = loadCatalog(cfg);
  const { errors, warnings, summary } = checkCatalog(cfg, sources, catalog);
  console.log(summary);
  const behaviour = loadBehaviour(cfg);
  if (behaviour) {
    errors.push(...validateBehaviour(cfg, behaviour, new Set(catalog.requirements.map((r) => r.id))));
    const f = cfg.behaviour.fields;
    const by = behaviour.inventory.entries.reduce((m, e) => ({ ...m, [e.fm[f.target]]: (m[e.fm[f.target]] ?? 0) + 1 }), {});
    console.log(t.behaviourSummary(Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', '), behaviour.questions.entries.length));
  }
  const domain = loadDomain(cfg);
  const d = checkDomain(cfg, domain, catalog.requirements);
  errors.push(...d.errors);
  warnings.push(...d.warnings);
  if (domain) {
    const fit = domainFit(cfg, catalog.requirements).map((x) => t.fitLine(x.variant.title, x.share, x.open)).join(', ');
    console.log(t.domainSummary(domain.concepts.length, fit || '–'));
  }
  for (const w of warnings) console.warn(`${t.warning} ${w}`);
  for (const e of errors) console.error(`${t.error} ${e}`);
  return errors.length ? 1 : 0;
}

function init(target, lang) {
  const template = path.join(KIT, 'templates/init', lang === 'de' ? 'de' : 'en');
  if (fs.existsSync(path.join(target, 'vkit.config.mjs'))) {
    console.error(`${target} already has a vkit.config.mjs`);
    return 1;
  }
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(template, target, { recursive: true, force: false, errorOnExist: false });
  // npm strips .gitignore from packages; the template ships it as "gitignore"
  if (fs.existsSync(path.join(target, 'gitignore'))) fs.renameSync(path.join(target, 'gitignore'), path.join(target, '.gitignore'));
  console.log(`Created ${path.relative(process.cwd(), target) || '.'}/ – next: npm install, then vkit check and vkit report`);
  return 0;
}
