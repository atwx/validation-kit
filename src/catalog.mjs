// Requirements catalogue and source registry (YAML), plus the catalogue check:
// schema, unique ids, known sources and sections, literal quotes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { listFiles } from './util.mjs';

export const LEGACY_STATES = ['not_met', 'partial', 'met'];

// Code sources: files with these extensions count as sections unless the
// source names its own `extensions`
const CODE_EXTENSIONS = ['.py', '.php', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.html', '.ss', '.twig', '.sql', '.yml', '.yaml', '.cs', '.java', '.rb', '.go'];

/**
 * Source documents by id. A source with `kind: code` is a source tree
 * (`root`, relative to paths.sourceFiles): every file is a section, cited by
 * its path, and quotes are checked against that file.
 */
export function loadSources(cfg) {
  const file = cfg.path('sources');
  if (!fs.existsSync(file)) return {};
  const list = yaml.load(fs.readFileSync(file, 'utf8')) ?? [];
  for (const s of list) {
    s.sections ??= [];
    if (s.kind === 'code') {
      s.rootDir = path.resolve(cfg.path('sourceFiles'), s.root ?? '.');
      if (!s.sections.length && fs.existsSync(s.rootDir)) {
        const exts = s.extensions ?? CODE_EXTENSIONS;
        const exclude = s.exclude ?? [];
        s.sections = listFiles(s.rootDir)
          .map((f) => path.relative(s.rootDir, f).split(path.sep).join('/'))
          .filter((f) => exts.some((e) => f.endsWith(e)) && !exclude.some((x) => f.includes(x)))
          .map((f) => ({ no: f, title: '' }));
      }
    }
  }
  return Object.fromEntries(list.map((s) => [s.id, s]));
}

/** Line of the first line of `quote` in `text` (1-based), or undefined. */
export function quoteLine(text, quote) {
  const first = normalizeCode(String(quote).split('\n').find((l) => l.trim()) ?? '');
  if (!first) return undefined;
  const i = text.split('\n').findIndex((l) => normalizeCode(l).includes(first));
  return i >= 0 ? i + 1 : undefined;
}

/** Link to a cited place in a code source, from its `url` template ({file}, {line}, {revision}). */
export function codeUrl(source, file, line) {
  if (!source.url?.includes('{file}')) return undefined;
  return source.url.replace('{file}', file).replace('{revision}', source.revision ?? 'HEAD').replace('{line}', line ?? 1);
}

/** Areas (one YAML file each) with their requirements. */
export function loadCatalog(cfg) {
  const dir = cfg.path('requirements');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
  const areas = files.map((file) => {
    const area = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'));
    area.file = path.relative(cfg.root, path.join(dir, file));
    area.requirements ??= [];
    for (const req of area.requirements) {
      req.area = area.area;
      req.sources ??= [];
    }
    return area;
  });
  const requirements = areas.flatMap((a) => a.requirements);
  return { areas, requirements, byId: Object.fromEntries(requirements.map((r) => [r.id, r])) };
}

/**
 * Normalises text for quote matching: drops Markdown escapes and emphasis,
 * angle-bracket autolinks and unifies whitespace and dashes.
 */
export function normalize(text) {
  return text
    .replace(/­/g, '') // soft hyphens from Word
    .replace(/<(https?:[^>\s]+)>/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\\(.)/g, '$1')
    .replace(/[*_<>]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalises code for quote matching: only whitespace is unified. */
export function normalizeCode(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** A citation may name a paragraph ("11.300(b)") of an outline entry ("11.300"). */
export function sectionOf(source, no) {
  return source.sections.find((s) => s.no === no) ?? source.sections.find((s) => String(no).startsWith(`${s.no}(`));
}

/**
 * Plain text of a source document: a bundled text file (sourceTexts/<id>.txt),
 * else the document converted once into the cache (.docx etc. with pandoc,
 * .pdf with pdftotext, .md/.txt as is). Returns null if unavailable.
 */
export function sourceText(cfg, source, section) {
  if (source.kind === 'code') {
    const file = section && path.resolve(source.rootDir, section);
    return file && fs.existsSync(file) && file.startsWith(source.rootDir) ? fs.readFileSync(file, 'utf8') : null;
  }
  const bundled = path.join(cfg.path('sourceTexts'), `${source.id}.txt`);
  if (fs.existsSync(bundled)) return fs.readFileSync(bundled, 'utf8');
  if (!source.file) return null;
  const input = path.resolve(cfg.path('sourceFiles'), source.file);
  if (!fs.existsSync(input)) return null;
  if (/\.(md|txt)$/i.test(input)) return fs.readFileSync(input, 'utf8');
  const cacheDir = cfg.path('cache');
  const cached = path.join(cacheDir, `${source.id}.md`);
  if (!fs.existsSync(cached) || fs.statSync(cached).mtimeMs < fs.statSync(input).mtimeMs) {
    fs.mkdirSync(cacheDir, { recursive: true });
    if (input.endsWith('.pdf')) execFileSync('pdftotext', [input, cached]);
    else execFileSync('pandoc', ['-t', 'gfm', '--wrap=none', input, '-o', cached]);
  }
  return fs.readFileSync(cached, 'utf8');
}

/**
 * Checks the catalogue. Returns { errors, warnings, summary }.
 * `sources` and `catalog` may be passed in when already loaded.
 */
export function checkCatalog(cfg, sources = loadSources(cfg), catalog = loadCatalog(cfg)) {
  const { t } = cfg;
  const { areas, requirements } = catalog;
  const errors = [];
  const warnings = [];
  const texts = {};
  const seen = new Set();
  for (const area of areas) {
    for (const req of area.requirements) {
      const where = `${area.file} ${req.id ?? t.checkNoId}`;
      if (area.prefix && !req.id?.startsWith(`${area.prefix}-`)) errors.push(`${where}: ${t.checkPrefix(area.prefix)}`);
      if (seen.has(req.id)) errors.push(`${where}: ${t.checkDuplicate}`);
      seen.add(req.id);
      for (const key of ['title', 'risk', 'acceptance', 'sources']) {
        if (!req[key] || (key === 'sources' && !req.sources.length)) errors.push(`${where}: ${t.checkMissingField(key)}`);
      }
      if (req.risk && !cfg.risks.includes(req.risk)) errors.push(`${where}: ${t.checkUnknownRisk(req.risk)}`);
      if (req.legacy && !LEGACY_STATES.includes(req.legacy.status)) errors.push(`${where}: ${t.checkUnknownLegacy(req.legacy.status)}`);
      if (req.legacy && req.legacy.status !== 'met' && !req.legacy.evidence?.length) errors.push(`${where}: ${t.checkLegacyEvidence}`);

      for (const src of req.sources ?? []) {
        const doc = sources[src.doc];
        if (!doc) { errors.push(`${where}: ${t.checkUnknownSource(src.doc)}`); continue; }
        if (doc.sections.length && !sectionOf(doc, src.section)) errors.push(`${where}: ${t.checkUnknownSection(src.doc, src.section)}`);
        if (!src.quote) { errors.push(`${where}: ${t.checkMissingQuote(src.doc, src.section)}`); continue; }
        if (cfg.paraphraseTypes.includes(src.quote_type)) continue;
        const key = doc.kind === 'code' ? `${src.doc}:${src.section}` : src.doc;
        if (!(key in texts)) texts[key] = sourceText(cfg, doc, src.section);
        const text = texts[key];
        if (text == null) { warnings.push(`${where}: ${t.checkNoSourceText(src.doc)}`); continue; }
        const norm = doc.kind === 'code' ? normalizeCode : normalize;
        if (!norm(text).includes(norm(src.quote))) errors.push(`${where}: ${t.checkQuoteNotFound(src.doc, src.quote.slice(0, 80))}`);
      }
    }
  }
  const notMet = requirements.filter((r) => r.legacy?.status === 'not_met').length;
  const partial = requirements.filter((r) => r.legacy?.status === 'partial').length;
  return { errors, warnings, summary: t.checkSummary(requirements.length, areas.length, notMet, partial) };
}
