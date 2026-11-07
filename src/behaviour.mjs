// Behaviour inventory: for every requirement, how the new system behaves
// compared with the legacy system (keep, fix, add, change, open question),
// plus the questions and improvement proposals for the client. Optional: a
// project without paths.behaviour directory has no inventory.
import fs from 'node:fs';
import path from 'node:path';
import { loadCollection, optionLabels, validateCollection } from './collections.mjs';

export function loadBehaviour(cfg) {
  const dir = cfg.path('behaviour');
  const b = cfg.behaviour;
  if (!fs.existsSync(path.join(dir, b.inventory, '_index.md'))) return null;
  const inventory = loadCollection(path.join(dir, b.inventory));
  const questionsDir = path.join(dir, b.questions);
  const questions = fs.existsSync(path.join(questionsDir, '_index.md'))
    ? loadCollection(questionsDir)
    : { dir: questionsDir, schema: {}, entries: [], byId: {} };
  const f = b.fields;
  const labels = {};
  for (const key of Object.keys(inventory.schema)) labels[key] = optionLabels(inventory.schema, key);
  for (const key of Object.keys(questions.schema)) labels[key] ??= optionLabels(questions.schema, key);
  return {
    dir,
    inventory,
    questions,
    fields: f,
    byRef: Object.fromEntries(inventory.entries.map((e) => [e.fm[f.ref], e])),
    questionById: questions.byId,
    labels,
    /** Questions linked to a requirement (via the inventory entry or the question's requirement list). */
    questionsOf(reqId) {
      const entry = this.byRef[reqId];
      const linked = new Set(entry?.fm[f.questions] ?? []);
      return questions.entries.filter((q) => linked.has(q.fm.id) || (q.fm[f.requirements] ?? []).includes(entry?.fm.id));
    },
  };
}

/** Schema checks plus references between inventory, questions and catalogue. */
export function validateBehaviour(cfg, behaviour, requirementIds) {
  const { t } = cfg;
  const b = cfg.behaviour;
  const f = b.fields;
  const ids = new Set();
  const errors = [
    ...validateCollection(behaviour.inventory, { t, root: cfg.root, ids }),
    ...validateCollection(behaviour.questions, { t, root: cfg.root, ids }),
  ];
  const inventoryIds = new Set(behaviour.inventory.entries.map((e) => e.fm.id));
  for (const e of behaviour.inventory.entries) {
    const where = path.relative(cfg.root, e.file);
    if (!requirementIds.has(e.fm[f.ref])) errors.push(`${where}: ${t.checkUnknownRequirement(e.fm[f.ref])}`);
    for (const q of e.fm[f.questions] ?? []) if (!behaviour.questionById[q]) errors.push(`${where}: ${t.checkUnknownQuestion(q)}`);
    if (b.questionTarget && e.fm[f.target] === b.questionTarget && !(e.fm[f.questions] ?? []).length) {
      errors.push(`${where}: ${t.checkTargetWithoutQuestion(b.questionTarget)}`);
    }
  }
  for (const q of behaviour.questions.entries) {
    for (const ref of q.fm[f.requirements] ?? []) {
      if (!inventoryIds.has(ref)) errors.push(`${path.relative(cfg.root, q.file)}: ${t.checkUnknownInventory(ref)}`);
    }
  }
  const covered = new Set(behaviour.inventory.entries.map((e) => e.fm[f.ref]));
  for (const id of requirementIds) if (!covered.has(id)) errors.push(t.checkInventoryMissing(id));
  return errors;
}
