// Collections in FriendlyBase package format (Markdown spec 0.4): a directory
// with _index.md (frontmatter `schema`) and one Markdown file per entry. The
// behaviour inventory and the questions to the client are kept this way, so
// they can be read in any editor and imported into FriendlyBase.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export function readNode(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: frontmatter missing`);
  return { file, fm: yaml.load(m[1]) ?? {}, body: m[2] };
}

/** Body sections by "## Heading". */
export function bodySections(body) {
  const out = {};
  let current = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { current = h[1].trim(); out[current] = []; continue; }
    if (current) out[current].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

export function loadCollection(dir) {
  const index = readNode(path.join(dir, '_index.md'));
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_index.md').sort()
    .map((f) => { const n = readNode(path.join(dir, f)); return { ...n, sections: bodySections(n.body) }; });
  return { dir, index, schema: index.fm.schema ?? {}, entries, byId: Object.fromEntries(entries.map((e) => [e.fm.id, e])) };
}

/** value → label of a select property. */
export function optionLabels(schema, key) {
  return Object.fromEntries((schema[key]?.options ?? []).map((o) => (typeof o === 'string' ? [o, o] : [o.value, o.label ?? o.value])));
}

export function optionValues(schema, key) {
  return (schema[key]?.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));
}

/**
 * Checks ids, required fields and select values of a collection against its
 * schema. `ids` collects ids across collections (ids are unique per package).
 * Returns error messages.
 */
export function validateCollection(coll, { t, root, ids = new Set() }) {
  const errors = [];
  for (const e of coll.entries) {
    const where = path.relative(root, e.file);
    if (!e.fm.id) errors.push(`${where}: ${t.checkMissingField('id')}`);
    if (ids.has(e.fm.id)) errors.push(`${where}: ${t.checkDuplicateId(e.fm.id)}`);
    ids.add(e.fm.id);
    for (const [key, def] of Object.entries(coll.schema)) {
      const v = e.fm[key];
      if (def.required && (v === undefined || v === null || v === '')) errors.push(`${where}: ${t.checkMissingField(key)}`);
      if (def.type === 'select' && v != null) {
        const allowed = optionValues(coll.schema, key);
        if (!allowed.includes(v)) errors.push(`${where}: ${t.checkBadOption(key, v, allowed)}`);
      }
    }
  }
  return errors;
}
