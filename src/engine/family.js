// The family line: the people who actually own and work the place.
//
// A centennial farm is not a hundred and twenty-five years of one farmer, it is
// four or five operators handing the same ground along. Everything in this
// module exists to make that handover consequential — who is born, who lives,
// who marries, who stays, and who is left to take it on when the operator dies.
//
// Demography here is era-dependent because it has to be. A family in 1880
// buried children and had eight more; a family in 1980 had two and both went to
// the city. Those are different games and the same farm.

import { namePool, surnamePool } from '../data/names.data.js';

export const TRAITS = {
  shrewd: { id: 'shrewd', name: 'Shrewd', effect: { marketing: 1.08 },
    note: 'Reads the market. Sells into strength and does not panic into a low.' },
  cautious: { id: 'cautious', name: 'Cautious', effect: { borrowWillingness: 0.65, crisisResist: 1.15 },
    note: 'Slow to borrow. Looks foolish in a boom and is still farming after the bust.' },
  mechanical: { id: 'mechanical', name: 'Mechanical', effect: { wearRate: 0.7, breakdownRisk: 0.55 },
    note: 'Keeps machinery running and fixes it in the field rather than waiting on town.' },
  stockman: { id: 'stockman', name: 'Stockman', effect: { livestockYield: 1.15, livestockMortality: 0.7 },
    note: 'Good with animals. The herd does better and loses fewer.' },
  hardworking: { id: 'hardworking', name: 'Hard-working', effect: { labour: 1.15 },
    note: 'Gets more done in a day than the day should hold.' },
  thrifty: { id: 'thrifty', name: 'Thrifty', effect: { livingCost: 0.85 },
    note: 'Nothing is thrown out and nothing is bought that could be made.' },
  literate: { id: 'literate', name: 'Educated', effect: { techAdoption: 1.25 },
    note: 'Reads the bulletins and the extension circulars, and acts on them.' },
  communal: { id: 'communal', name: 'Well-regarded', effect: { communitySupport: 1.3 },
    note: 'The district turns out for this family, and this family turns out for the district.' },
  hardy: { id: 'hardy', name: 'Hardy', effect: { health: 1.15, illnessResist: 1.25 },
    note: 'Built for this climate and this work.' },
  frail: { id: 'frail', name: 'Frail', effect: { health: 0.8, illnessResist: 0.75 }, negative: true,
    note: 'Never quite strong. Every hard winter takes something.' },
  restless: { id: 'restless', name: 'Restless', effect: { stayChance: 0.5 }, negative: true,
    note: 'Does not want the farm. Wants somewhere that is not this.' },
  stubborn: { id: 'stubborn', name: 'Stubborn', effect: { techAdoption: 0.7, crisisResist: 1.2 }, negative: true,
    note: 'Will not change the way it is done. Will also not be moved off it.' },
};

export const TRAIT_IDS = Object.keys(TRAITS);
const POSITIVE_TRAITS = TRAIT_IDS.filter((t) => !TRAITS[t].negative);

/**
 * People are numbered within their own family, from a counter carried on the
 * family object. A module-level counter would leak between games played in
 * one process and make identical seeds produce different-looking runs.
 */
function nextPersonId(fam) {
  if (!fam) return `p${Math.floor(Math.random() * 1e9)}`; // only for isolated unit use
  fam.nextPersonId = (fam.nextPersonId || 0) + 1;
  return `p${fam.nextPersonId}`;
}

export function makeCharacter(rng, { surname, origin, sex, birthYear, traits = [], generation = 1, fam = null }) {
  const pool = namePool(origin, sex, birthYear);
  return {
    id: nextPersonId(fam),
    name: rng.pick(pool),
    surname,
    sex,
    birthYear,
    deathYear: null,
    causeOfDeath: null,
    traits: [...traits],
    health: 1,
    generation,
    spouseId: null,
    parentIds: [],
    role: null, // 'operator' | 'spouse' | 'child' | 'retired'
    away: false, // left for town, the city, or the war
    awayReason: null,
    injuredUntil: null,
    marriedYear: null,
    inheritedShare: 0,
    wantsFarm: null, // decided when they come of age
  };
}

export function fullName(m) { return `${m.name} ${m.surname}`; }

export function age(year, m) { return year - m.birthYear; }

export function isAlive(m) { return !m.deathYear; }

export function living(state) { return state.family.members.filter(isAlive); }

export function operator(state) {
  return state.family.members.find((m) => m.id === state.family.operatorId) || null;
}

/** Roll 1-3 traits for a new character, weighted toward their parents'. */
export function rollTraits(rng, parents = []) {
  const traits = new Set();
  // Traits run in families — partly inheritance, mostly upbringing.
  for (const p of parents) {
    for (const t of p.traits || []) {
      if (rng.chance(0.33)) traits.add(t);
    }
  }
  const count = rng.weighted([
    { n: 1, weight: 40 }, { n: 2, weight: 42 }, { n: 3, weight: 18 },
  ]).n;
  let guard = 0;
  while (traits.size < count && guard++ < 20) {
    // Negatives are less common than positives but not rare.
    traits.add(rng.chance(0.24) ? rng.pick(TRAIT_IDS) : rng.pick(POSITIVE_TRAITS));
  }
  return [...traits].slice(0, 3);
}

/**
 * Era mortality. Life expectancy rose enormously across this century and the
 * farm feels it: an 1890 operator who dies at 52 leaves a 14-year-old heir and
 * a crisis, where a 1970 operator retires at 68 and hands over in good order.
 */
export function mortalityEraFactor(year) {
  if (year <= 1880) return 1.0;
  if (year >= 1990) return 0.28;
  const anchors = [[1880, 1.0], [1900, 0.92], [1920, 0.8], [1940, 0.62], [1960, 0.45], [1980, 0.33], [1990, 0.28]];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, v0] = anchors[i];
    const [y1, v1] = anchors[i + 1];
    if (year >= y0 && year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return 0.28;
}

/** Baseline annual probability of death at a given age, in 1875 terms. */
export function baseMortality(a) {
  if (a < 1) return 0.145;
  if (a < 5) return 0.028;
  if (a < 15) return 0.006;
  if (a < 40) return 0.008;
  if (a < 55) return 0.016;
  if (a < 65) return 0.038;
  if (a < 75) return 0.085;
  if (a < 85) return 0.17;
  return 0.30;
}

export function mortalityFor(state, m) {
  const a = age(state.year, m);
  let p = baseMortality(a) * mortalityEraFactor(state.year);
  if (m.traits.includes('hardy')) p *= 0.8;
  if (m.traits.includes('frail')) p *= 1.35;
  p *= 2 - Math.max(0.3, m.health); // poor health raises it
  return Math.min(0.95, p);
}

/** Births per married year, by era. Family size collapsed across the century. */
export function birthChance(year, motherAge) {
  if (motherAge < 17 || motherAge > 44) return 0;
  const era =
    year < 1900 ? 0.38 :
    year < 1920 ? 0.33 :
    year < 1940 ? 0.24 :
    year < 1960 ? 0.20 :
    year < 1980 ? 0.13 : 0.09;
  // Fertility falls off with age regardless of era.
  const ageFactor = motherAge < 35 ? 1 : motherAge < 40 ? 0.6 : 0.25;
  return era * ageFactor;
}

/** Create the founding settler (and, for some backgrounds, a spouse already). */
export function foundFamily(rng, { backgroundDef, year, difficultyDef }) {
  const fam = { nextPersonId: 0 };
  const origin = backgroundDef.origin;
  const surname = rng.pick(surnamePool(origin));
  const founderAge = rng.range(22, 34);
  const founder = makeCharacter(rng, {
    surname, origin, sex: 'male',
    birthYear: year - founderAge,
    traits: rollTraits(rng),
    generation: 1, fam,
  });
  // Every background's traits are part of who arrived, not a bonus bolted on.
  for (const t of backgroundDef.traits || []) if (!founder.traits.includes(t)) founder.traits.push(t);
  founder.role = 'operator';
  founder.wantsFarm = true; // they crossed a continent to do this

  const members = [founder];

  // Most settlers came married or married within a year or two. A single man
  // homesteading alone is a real and harder start.
  if (rng.chance(0.55)) {
    const spouse = makeCharacter(rng, {
      surname, origin, sex: 'female',
      birthYear: year - rng.range(19, founderAge + 1),
      traits: rollTraits(rng),
      generation: 1, fam,
    });
    spouse.role = 'spouse';
    spouse.wantsFarm = true;
    spouse.spouseId = founder.id;
    spouse.marriedYear = year - rng.range(0, 3);
    founder.spouseId = spouse.id;
    founder.marriedYear = spouse.marriedYear;
    members.push(spouse);
  }

  return {
    ...fam,
    surname,
    origin,
    operatorId: founder.id,
    members,
    generation: 1,
    marriagesMade: founder.spouseId ? 1 : 0,
    deaths: [],
  };
}

/**
 * One year of demography: everyone ages, some marry, some are born, some die,
 * some leave. Returns narrative entries for the ledger — the player should
 * always be told why the labour force changed.
 */
export function advanceFamily(state, rng) {
  const events = [];
  const fam = state.family;
  const year = state.year;
  const diff = state.difficultyDef;

  // --- coming of age: do they want the farm? --------------------------------
  for (const m of fam.members) {
    if (!isAlive(m) || m.away) continue;
    const a = age(year, m);
    if (a === 18 && m.wantsFarm === null) {
      // The pull away from the farm grew steadily across the century. By the
      // 1970s keeping an heir was the hard part, not raising one.
      const eraStay =
        year < 1900 ? 0.78 :
        year < 1930 ? 0.68 :
        year < 1950 ? 0.55 :
        year < 1970 ? 0.42 :
        year < 1990 ? 0.32 : 0.28;
      let p = eraStay;
      if (m.traits.includes('restless')) p *= 0.5;
      if (m.traits.includes('stubborn')) p *= 1.2;
      if (m.sex === 'female' && year < 1960) p *= 0.35; // daughters rarely inherited the operation
      if (state.difficultyDef.guaranteedHeir) p = Math.max(p, 0.85);
      m.wantsFarm = rng.chance(p);
      if (!m.wantsFarm && rng.chance(0.55)) {
        m.away = true;
        m.awayReason = year < 1920 ? 'gone west to file on land of their own'
          : year < 1950 ? 'gone to the city for work'
          : 'gone to the city for school and stayed';
        events.push({ kind: 'departure', text: `${fullName(m)} has left the farm — ${m.awayReason}.` });
      }
    }
  }

  // --- marriage -------------------------------------------------------------
  for (const m of fam.members) {
    if (!isAlive(m) || m.spouseId || m.away) continue;
    const a = age(year, m);
    if (a < 20 || a > 40) continue;
    if (m.wantsFarm === false) continue;
    // A homestead needed two people to work at all, and an unmarried
    // homesteader looked hard and did not look long. If this man is the whole
    // family, the farm's survival depends on it.
    const soleOperator = m.id === fam.operatorId &&
      fam.members.filter((x) => isAlive(x) && !x.away && age(year, x) >= 16).length === 1;
    let p = m.sex === 'male' ? 0.17 : 0.2;
    if (soleOperator) p = 0.42;
    if (!rng.chance(p)) continue;

    const spouse = makeCharacter(rng, {
      surname: fam.surname,
      origin: fam.origin,
      sex: m.sex === 'male' ? 'female' : 'male',
      birthYear: year - rng.range(Math.max(18, a - 6), a + 4),
      traits: rollTraits(rng),
      generation: m.generation, fam,
    });
    spouse.role = 'spouse';
    spouse.wantsFarm = true; // marrying a farmer is choosing the farm
    spouse.spouseId = m.id;
    spouse.marriedYear = year;
    m.spouseId = spouse.id;
    m.marriedYear = year;
    fam.members.push(spouse);
    fam.marriagesMade++;

    // A marriage brought labour, and often capital and connections with it.
    // This was the single most reliable way a prairie farm got bigger.
    const dowry = rng.weighted([
      { kind: 'none', weight: 34 },
      { kind: 'cash', weight: 30 },
      { kind: 'livestock', weight: 22 },
      { kind: 'land', weight: 8 },
      { kind: 'connections', weight: 6 },
    ]).kind;
    events.push({
      kind: 'marriage',
      text: `${fullName(m)} married ${spouse.name} ${spouse.surname}.`,
      dowry,
      spouseId: spouse.id,
      characterId: m.id,
    });
  }

  // --- births ---------------------------------------------------------------
  for (const m of fam.members) {
    if (!isAlive(m) || m.sex !== 'female' || !m.spouseId || m.away) continue;
    const spouse = fam.members.find((x) => x.id === m.spouseId);
    if (!spouse || !isAlive(spouse)) continue;
    const p = birthChance(year, age(year, m));
    if (!rng.chance(p)) continue;
    const child = makeCharacter(rng, {
      surname: fam.surname,
      origin: fam.origin,
      sex: rng.chance(0.51) ? 'male' : 'female',
      birthYear: year,
      traits: rollTraits(rng, [m, spouse]),
      generation: m.generation + 1, fam,
    });
    child.role = 'child';
    child.parentIds = [m.id, spouse.id];
    fam.members.push(child);
    events.push({ kind: 'birth', text: `A ${child.sex === 'male' ? 'son' : 'daughter'}, ${child.name}, born to ${fullName(m)}.` });
  }

  // --- deaths ---------------------------------------------------------------
  for (const m of fam.members) {
    if (!isAlive(m)) continue;
    let p = mortalityFor(state, m);
    if (state.yearHazards?.illnessRisk) p *= 1 + state.yearHazards.illnessRisk;
    if (!rng.chance(p)) continue;
    m.deathYear = year;
    m.causeOfDeath = age(year, m) > 65 ? 'old age'
      : state.yearHazards?.illnessRisk ? 'the sickness that went through the district'
      : rng.pick(['illness', 'an accident', 'a hard winter', 'pneumonia']);
    fam.deaths.push({ id: m.id, year, name: fullName(m) });
    events.push({
      kind: 'death',
      text: `${fullName(m)} died, aged ${age(year, m)} — ${m.causeOfDeath}.`,
      characterId: m.id,
      wasOperator: m.id === fam.operatorId,
    });
    // A widow or widower may remarry; the farm often depended on it.
    if (m.spouseId) {
      const s = fam.members.find((x) => x.id === m.spouseId);
      if (s) s.spouseId = null;
    }
  }

  // --- recovery from injury -------------------------------------------------
  for (const m of fam.members) {
    if (m.injuredUntil && year > m.injuredUntil) m.injuredUntil = null;
  }

  return events;
}

/**
 * Who could take the farm on. Ordered by how naturally the handover falls:
 * a willing adult son first, then any willing adult child, then anyone at all.
 */
export function heirCandidates(state) {
  const year = state.year;
  return state.family.members
    // Fourteen, not sixteen. A boy of fourteen ran a farm when he had to, and
    // a widow with young children held the place together until he could —
    // which is the ordinary history of this, not an edge case.
    .filter((m) => isAlive(m) && !m.away && age(year, m) >= 14 && age(year, m) < 72)
    .filter((m) => m.role !== 'spouse' || !state.family.members.some((x) => x.id === m.spouseId && isAlive(x)))
    .sort((a, b) => heirScore(state, b) - heirScore(state, a));
}

/**
 * How naturally the farm falls to this person.
 *
 * The ordering that matters: a child of working age comes BEFORE a widow.
 * A widow holds the farm when there is nobody else old enough — that is the
 * commonest succession there is — but she holds it FOR the next generation,
 * and hands on when a child is ready. Scoring her above the children produced
 * fifty-year chains of widows inheriting from one another while the
 * generations stood still and the same woman was still operating at 83.
 */
export function heirScore(state, m) {
  const year = state.year;
  const ag = age(year, m);
  let s = 0;

  if (m.wantsFarm === true) s += 100;
  if (m.wantsFarm === false) s -= 60;

  // Prime working age is what the farm actually needs.
  if (ag >= 22 && ag <= 55) s += 40;
  else if (ag >= 18 && ag < 22) s += 25;
  else if (ag >= 14) s += 8;
  if (ag > 65) s -= 30;

  // A child of the line comes before somebody who married into it.
  if (m.parentIds && m.parentIds.length > 0) s += 30;
  // A widow is a caretaker: ahead of nobody, behind a grown child.
  if (m.role === 'spouse') s += 12;
  if (m.role === 'retired') s -= 20;

  if (m.sex === 'male' && year < 1960) s += 12; // the custom of the time
  if (m.traits.includes('restless')) s -= 20;
  if (m.traits.includes('stubborn')) s += 5;
  return s;
}

/** Everyone with a legal claim on the estate when the operator dies. */
export function estateClaimants(state, deceased) {
  const children = state.family.members.filter(
    (m) => isAlive(m) && m.parentIds.includes(deceased.id)
  );
  const spouse = state.family.members.find((m) => m.id === deceased.spouseId && isAlive(m));
  return { children, spouse };
}
