// Small helpers shared by loaders and report builders.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** URL- and file-safe slug; keeps dots and underscores. */
export function slug(v) {
  return String(v).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Slug without dots and underscores, for ids that must be plain kebab case. */
export function kebab(v) {
  return slug(v).replace(/[._]+/g, '-');
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function makeDateFormatter(locale, timeZone) {
  return (iso) => {
    if (!iso) return '–';
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone });
  };
}

export function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** All files below a directory, sorted. */
export function listFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else out.push(p);
    }
  })(dir);
  return out.sort();
}

/** Natural sort of ids such as "2" < "10" or "1.2" < "1.10". */
export function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

/** Minimal Markdown for short texts: paragraphs, bullet lists, `code`. */
export function miniMarkdown(text) {
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
  return String(text ?? '').split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^- /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${inline(block.replace(/\n/g, ' '))}</p>`;
  }).join('');
}
