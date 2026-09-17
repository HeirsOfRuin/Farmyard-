// Game state: its shape, how a new game is built, and how it is saved.
//
// The save key is a contract, not a label. `centennial-farm.save.v1` is fixed
// from the first commit and carries an explicit version number, because a save
// already sitting in somebody's browser refers to this string. Renaming it
// silently orphans every game in progress; changing the shape without bumping
// the version silently corrupts them. Migrations go in `migrate()` below.

import { makeRng, streamFor } from './rng.js';
import { generateTownship, seedNeighbours, quarterById, ACRES_PER_QUARTER } from './land.js';
import { foundFamily } from './family.js';
import { region as regionDef } from '../data/regions.data.js';
import { background as backgroundDef } from '../data/names.data.js';
import { difficulty as difficultyDef } from '../data/difficulty.data.js';
import { surnamePool } from '../data/names.data.js';
import { FIRST_YEAR, LAST_YEAR } from '../data/prices.data.js';

export const SAVE_KEY = 'centennial-farm.save.v1';
export const SAVE_VERSION = 1;

export const STATUS = {
  ACTIVE: 'active',
  RUINED: 'ruined',       // foreclosed; the land is gone
  LINE_ENDED: 'lineEnded', // no heir would or could take it on
  COMPLETE: 'complete',   // reached 2000 still farming
};

/**
 * Build a new game. Everything about the run is a pure function of
 * (seed, difficulty, background), which is what makes a seed reproducible and
 * what makes the balance harness meaningful.
 */
export function newGame({ seed = 1, difficulty = 'settler', background = 'ontario' } = {}) {
  const bg = backgroundDef(background);
  const diff = difficultyDef(difficulty);
  const reg = regionDef(bg.region);
  const setup = streamFor(seed, FIRST_YEAR, 'setup');

  const quarters = generateTownship(setup, reg);

  // The home quarter: the one they filed on. It must be homestead-eligible,
  // because that is the only kind a settler could get for the $10 fee.
  const eligible = quarters.filter((q) => q.tenure === 'homestead');
  const home = setup.pick(eligible);
  home.owner = 'player';
  home.ownerName = 'you';
  home.yearAcquired = FIRST_YEAR;
  home.acquiredBy = 'homestead';
  home.brokenAcres = 0;
  home.use = 'idle';

  seedNeighbours(setup, quarters, surnamePool(bg.origin), home.id);

  const family = foundFamily(setup, { backgroundDef: bg, year: FIRST_YEAR, difficultyDef: diff });

  const equipment = bg.startingEquipment.map((type) => ({
    type, count: 1, yearBought: FIRST_YEAR, condition: setup.float(0.6, 0.9),
  }));

  const livestock = {};
  const draftFromBackground = {};
  for (const [k, v] of Object.entries(bg.startingLivestock)) {
    // Oxen and horses are power, not livestock — they live in `equipment`.
    if (k === 'oxen' || k === 'horses') draftFromBackground[k] = v;
    else livestock[k] = v;
  }
  for (const [type, count] of Object.entries(draftFromBackground)) {
    equipment.push({ type, count, yearBought: FIRST_YEAR, condition: setup.float(0.7, 0.95) });
  }

  const state = {
    version: SAVE_VERSION,
    seed,
    year: FIRST_YEAR,
    status: STATUS.ACTIVE,

    difficulty,
    difficultyDef: diff,
    background,
    backgroundDef: bg,
    region: bg.region,
    regionDef: reg,
    townshipLabel: reg.townshipLabel,
    haulMiles: reg.initialHaulMiles,

    quarters,
    homeQuarterId: home.id,

    family,

    cash: Math.round(bg.startingCapital * diff.startingCapitalMult),
    debts: [],
    storeAccount: 0, // carried at the general store until the crop is sold
    statuteDaysWorked: 0, // days owed the municipality on the roads, worked off
    equipment,
    livestock,
    granary: {},
    technologies: [],
    wheatVariety: 'redFife',
    hiredHands: 0,
    standardOfLiving: 1,

    // Flags set by history and never unset; modifiers expire.
    flags: {
      homesteadProved: false,
      centennialEarned: false,
      joinedPool: false,
      compulsoryBoard: false,
    },
    modifiers: {},
    activeEffects: [], // { effects, expiresAfter }

    // Per-year record. This is the ledger the player reads and the data the
    // balance harness measures, so it is built by the engine, never by the UI.
    ledger: [],
    log: [],
    pendingChoice: null,

    // Set when the run ends, for the summary screen and the harness.
    outcome: null,
  };

  state.log.push({
    year: FIRST_YEAR,
    kind: 'start',
    text:
      `${family.members[0].name} ${family.surname} filed on ${home.quarter} ${home.section} ` +
      `in ${reg.townshipLabel}, ${reg.name}. One hundred and sixty acres of unbroken prairie, ` +
      `a ten dollar filing fee, and three years to prove it up.`,
  });

  return state;
}

/** Quarters the player holds. */
export function ownedQuarters(state) {
  return state.quarters.filter((q) => q.owner === 'player');
}

export function isOver(state) {
  return state.status !== STATUS.ACTIVE;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

// Definitions are re-attached on load rather than stored: they are code, and a
// save that carries a stale copy of the difficulty table would quietly play by
// last version's rules.
const DERIVED_KEYS = ['difficultyDef', 'backgroundDef', 'regionDef'];

export function serialize(state) {
  const out = { ...state };
  for (const k of DERIVED_KEYS) delete out[k];
  return JSON.stringify(out);
}

export function deserialize(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  const migrated = migrate(raw);
  return rehydrate(migrated);
}

/** Re-attach the code-side definitions a save deliberately does not carry. */
export function rehydrate(s) {
  s.difficultyDef = difficultyDef(s.difficulty);
  s.backgroundDef = backgroundDef(s.background);
  s.regionDef = regionDef(s.region);
  return s;
}

/**
 * Bring an older save forward. Each step is from one version to the next, so
 * a v1 save still loads after v4 ships.
 */
export function migrate(s) {
  if (!s.version) {
    throw new Error('Save has no version field; it cannot be safely loaded.');
  }
  if (s.version > SAVE_VERSION) {
    throw new Error(
      `Save is version ${s.version} but this build understands up to ${SAVE_VERSION}. ` +
        'It was written by a newer version of the game.'
    );
  }
  // v1 is current. Future migrations chain here:
  //   if (s.version === 1) { ...; s.version = 2; }
  return s;
}

// ---------------------------------------------------------------------------
// Browser storage. Every access is wrapped: localStorage throws in private
// windows and returns null when site data has been cleared, and a save system
// that assumes it works will lose somebody's century.
// ---------------------------------------------------------------------------

export function saveToStorage(state, storage = globalThis.localStorage) {
  if (!storage) return { ok: false, reason: 'no storage available' };
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || 'storage write refused' };
  }
}

export function loadFromStorage(storage = globalThis.localStorage) {
  if (!storage) return { ok: false, reason: 'no storage available' };
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (err) {
    return { ok: false, reason: err?.message || 'storage read refused' };
  }
  if (!raw) return { ok: false, reason: 'no saved game found' };
  try {
    return { ok: true, state: deserialize(raw) };
  } catch (err) {
    return { ok: false, reason: err?.message || 'saved game could not be read' };
  }
}

export function clearStorage(storage = globalThis.localStorage) {
  try { storage?.removeItem(SAVE_KEY); return { ok: true }; }
  catch (err) { return { ok: false, reason: err?.message }; }
}

export { ACRES_PER_QUARTER, quarterById, FIRST_YEAR, LAST_YEAR };
