// Domain model (optional): the business concepts a rebuild has to represent,
// independent of screens and of the legacy data model. Used when the new
// system may be operated differently and structured differently, but has to
// cover the same business. Requirements point to concepts (`domain`), name
// the variants (customers, installations) they apply to (`variants`) and how
// the new system realises them (`realisation`: core, configuration,
// extension). The share realised by core and configuration per variant shows
// how far one model carries all variants.
//
// domain/NN-<group>.yml:
//   group: Case file
//   concepts:
//     - id: Student
//       title: Student
//       kind: entity
//       scope: core
//       description: …
//       variants: { glasmacher: "Student (glasmacher/models/student.py)", nottebohm: "Schüler-Mastertabelle" }
//       attributes:
//         - { name: birthday, title: Date of birth, type: date, variants: { glasmacher: birthday } }
//       states:
//         - { name: placed, title: Placed }
//       relations:
//         - { to: Family, kind: belongs to }
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

/** Variant ids and titles from cfg.domain.variants (strings or { id, title }). */
export function domainVariants(cfg) {
  return (cfg.domain?.variants ?? []).map((v) => (typeof v === 'string' ? { id: v, title: v } : { title: v.id, ...v }));
}

export function loadDomain(cfg) {
  const dir = cfg.path('domain');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  const groups = files.map((file) => {
    const g = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) ?? {};
    g.file = path.relative(cfg.root, path.join(dir, file));
    g.concepts ??= [];
    for (const c of g.concepts) {
      c.group = g.group;
      c.attributes ??= [];
      c.states ??= [];
      c.relations ??= [];
      c.variants ??= {};
    }
    return g;
  });
  const concepts = groups.flatMap((g) => g.concepts);
  const byId = Object.fromEntries(concepts.map((c) => [c.id, c]));
  /** "Student", "Student.birthday" or "Student.placed" → { concept, member } */
  const resolve = (ref) => {
    const [id, name] = String(ref).split('.');
    const concept = byId[id];
    if (!concept) return null;
    if (!name) return { concept };
    const member = concept.attributes.find((a) => a.name === name) ?? concept.states.find((s) => s.name === name);
    return member ? { concept, member } : null;
  };
  return { dir, groups, concepts, byId, resolve };
}

/** Variants a requirement applies to: its own list, else all. */
export function variantsOf(cfg, req) {
  return req.variants?.length ? req.variants : domainVariants(cfg).map((v) => v.id);
}

/** Schema and reference checks for the domain model and the requirement fields that use it. */
export function checkDomain(cfg, domain, requirements) {
  const { t } = cfg;
  const errors = [];
  const warnings = [];
  const variants = new Set(domainVariants(cfg).map((v) => v.id));
  const realisations = cfg.domain?.realisations ?? [];
  const checkVariants = (where, obj) => {
    for (const k of Object.keys(obj ?? {})) if (!variants.has(k)) errors.push(`${where}: ${t.checkUnknownVariant(k)}`);
  };
  if (domain) {
    const seen = new Set();
    for (const g of domain.groups) {
      for (const c of g.concepts) {
        const where = `${g.file} ${c.id ?? t.checkNoId}`;
        if (!c.id || !c.title) errors.push(`${where}: ${t.checkMissingField(!c.id ? 'id' : 'title')}`);
        if (seen.has(c.id)) errors.push(`${where}: ${t.checkDuplicate}`);
        seen.add(c.id);
        if (c.scope && realisations.length && !realisations.includes(c.scope)) errors.push(`${where}: ${t.checkUnknownRealisation(c.scope)}`);
        checkVariants(where, c.variants);
        for (const m of [...c.attributes, ...c.states]) checkVariants(`${where}.${m.name}`, m.variants);
        for (const r of c.relations) if (!domain.byId[r.to]) errors.push(`${where}: ${t.checkUnknownConcept(r.to)}`);
      }
    }
  }
  for (const r of requirements) {
    const where = r.id;
    for (const ref of r.domain ?? []) {
      if (!domain) { errors.push(`${where}: ${t.checkNoDomain}`); break; }
      if (!domain.resolve(ref)) errors.push(`${where}: ${t.checkUnknownConcept(ref)}`);
    }
    for (const v of r.variants ?? []) if (!variants.has(v)) errors.push(`${where}: ${t.checkUnknownVariant(v)}`);
    if (r.realisation && !realisations.includes(r.realisation)) errors.push(`${where}: ${t.checkUnknownRealisation(r.realisation)}`);
    if (domain && realisations.length && !r.realisation) warnings.push(`${where}: ${t.checkMissingField('realisation')}`);
  }
  return { errors, warnings };
}

/**
 * Fit of the shared model per variant: requirements by realisation, and the
 * share realised without project code (cfg.domain.shared, default core and
 * configuration) among the requirements with a realisation.
 */
export function domainFit(cfg, requirements) {
  const realisations = cfg.domain?.realisations ?? [];
  const shared = cfg.domain?.shared ?? realisations.slice(0, 2);
  return domainVariants(cfg).map((v) => {
    const reqs = requirements.filter((r) => variantsOf(cfg, r).includes(v.id));
    const by = Object.fromEntries(realisations.map((x) => [x, 0]));
    let open = 0;
    for (const r of reqs) {
      if (r.realisation in by) by[r.realisation]++;
      else open++;
    }
    const decided = reqs.length - open;
    const sharedCount = shared.reduce((n, x) => n + (by[x] ?? 0), 0);
    return { variant: v, total: reqs.length, by, open, shared: sharedCount, share: decided ? sharedCount / decided : null };
  });
}

/** Requirements per concept id (a reference to an attribute or state counts for its concept). */
export function requirementsByConcept(requirements) {
  const out = {};
  for (const r of requirements) {
    for (const ref of r.domain ?? []) {
      const id = String(ref).split('.')[0];
      (out[id] ??= []).push({ req: r, ref });
    }
  }
  return out;
}
