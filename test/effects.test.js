// Everything the data layer declares must be read by something.
//
// This guard exists because the same bug class has now appeared twice, and both
// times it was invisible until something measured it:
//
//   * 21 of 26 technology effects were read by nothing. Crop insurance, the
//     drilled well, herbicide and rural electrification were decoration, and
//     the ablation reported the entire technology tree moving survival by
//     exactly zero.
//   * Nine policy flags in history.data.js — adHocPayment, debtReviewAvailable,
//     unlockSafetyNet and the rest — were declared and consumed by nothing.
//
// Neither failed a test, because nothing throws when a value is simply never
// looked at. A declared effect the engine ignores is a promise to the player
// that the game does not keep, and it is worth more to make the class
// impossible than to fix the instances.
//
// The check is deliberately crude: it scans the data files for effect keys and
// the engine for references to them. Crude is correct here — anything cleverer
// would need the engine to cooperate, and the whole point is to catch effects
// the engine does not know about.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Keys that are declared but deliberately not read, each with a reason.
 * Adding to this list is allowed; adding to it WITHOUT a reason is the thing
 * the list exists to prevent.
 */
const ALLOWED_INERT = {
  permanent: 'structural: marks an effect that never expires',
  durationYears: 'structural: how long an effect lasts',
  note: 'presentational',
  automatic: 'structural: the effect arrives without being bought',
  compulsoryFrom: 'structural: read from the technology table directly',
  gameEnd: 'redundant: the engine ends the run at LAST_YEAR on its own',
  unlockEquipmentInterest: 'flavour: the 1912 tractor demonstrations happened, and that is all',
};

/**
 * KNOWN BACKLOG — effects declared and read by nothing.
 *
 * When this guard was written it found THIRTY-FIVE, roughly four times what
 * anyone had noticed: most of the technology tree and nearly every policy flag
 * in the history table. They have all since been wired up, removed, or (for
 * two structural keys) listed in ALLOWED_INERT with a reason, so the list is
 * empty and the assertion below is trivially true.
 *
 * It stays because the machinery is the point. If a future change declares an
 * effect and forgets to read it, the test above fails immediately instead of
 * the effect quietly becoming decoration for a year — which is exactly how the
 * thirty-five happened.
 */
const KNOWN_BACKLOG = new Set([]);

// Two keys are structural rather than effects, and are listed with reasons in
// ALLOWED_INERT below rather than here.

async function dataFiles() {
  const dir = join(ROOT, 'src/data');
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith('.data.js')).map((n) => join(dir, n));
}

async function engineSource() {
  const parts = [];
  for (const sub of ['src/engine', 'src/ui', 'sim']) {
    const dir = join(ROOT, sub);
    let names = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.js')) continue;
      parts.push(await readFile(join(dir, n), 'utf8'));
    }
  }
  return parts.join('\n');
}

/** Every key declared inside an `effects: { ... }` or `effect: { ... }` block. */
function declaredEffectKeys(code) {
  const keys = new Set();
  for (const m of code.matchAll(/\beffects?\s*:\s*\{([^{}]*)\}/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g)) keys.add(k[1]);
  }
  return keys;
}

/** Keys used inside a history `choice` option's effects, same contract. */
function declaredChoiceEffectKeys(code) {
  const keys = new Set();
  for (const m of code.matchAll(/effects:\s*\{([^{}]*)\}/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g)) keys.add(k[1]);
  }
  return keys;
}

test('every effect the data layer declares is read somewhere', async () => {
  const files = await dataFiles();
  const engine = await engineSource();

  const declared = new Map(); // key -> the file that declares it
  for (const f of files) {
    const code = await readFile(f, 'utf8');
    for (const k of declaredEffectKeys(code)) if (!declared.has(k)) declared.set(k, f);
    for (const k of declaredChoiceEffectKeys(code)) if (!declared.has(k)) declared.set(k, f);
  }

  assert.ok(declared.size > 20, `only found ${declared.size} declared effect keys — the scan is broken`);

  const dead = [];
  for (const [key, file] of declared) {
    if (ALLOWED_INERT[key]) continue;
    // A key counts as read if the engine, UI or sim mentions it at all —
    // as a property access, a string, or a destructured name.
    const referenced = new RegExp(`\\b${key}\\b`).test(engine);
    if (!referenced) dead.push(`${key}  (declared in ${file.replace(ROOT + '/', '')})`);
  }

  const fresh = dead.filter((d) => !KNOWN_BACKLOG.has(d.split(/\s/)[0]));

  assert.deepEqual(
    fresh, [],
    `These effects are declared in the data layer and read by NOTHING, and they\n` +
      `are not on the known backlog — so they are NEW.\n` +
      `Each one is a promise to the player that the game does not keep.\n` +
      `Wire it up, delete it, or add it to ALLOWED_INERT with a reason.\n\n  ` +
      fresh.join('\n  ') + '\n'
  );
});

test('the dead-effects backlog only shrinks', async () => {
  // Guards the list itself. If an entry has been wired up, it must come OFF
  // the backlog — otherwise the list rots into a permanent excuse and stops
  // describing anything.
  const files = await dataFiles();
  const engine = await engineSource();

  const declared = new Set();
  for (const f of files) {
    const code = await readFile(f, 'utf8');
    for (const k of declaredEffectKeys(code)) declared.add(k);
    for (const k of declaredChoiceEffectKeys(code)) declared.add(k);
  }

  const stale = [];
  for (const key of KNOWN_BACKLOG) {
    if (!declared.has(key)) { stale.push(`${key} — no longer declared anywhere`); continue; }
    if (new RegExp(`\\b${key}\\b`).test(engine)) stale.push(`${key} — now read; take it off the backlog`);
  }

  assert.deepEqual(stale, [], `The backlog is out of date:\n\n  ${stale.join('\n  ')}\n`);
});
