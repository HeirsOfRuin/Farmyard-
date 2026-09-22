// Personal traits: who a person is, in numbers the engine actually reads.
//
// This table used to live inside src/engine/family.js, which is exactly why
// most of it went dead without anyone noticing: the effects-are-consumed
// guard (test/effects.test.js) only scans src/data/*.data.js, on the working
// theory that "the data layer" is where declared-but-unread effects hide. A
// table of effects sitting in the engine file itself was invisible to its own
// guard. Eleven of twelve traits' declared effects — techAdoption,
// communitySupport, livingCost, labour, wearRate's partner breakdownRisk,
// livestockYield's partner livestockMortality, marketing, borrowWillingness,
// crisisResist, health, illnessResist, stayChance — were either read by
// nothing, or read via a hand-copied number in the engine that had already
// drifted from what this table declared (shrewd's marketing bonus was applied
// as 1.06 here and this table said 1.08). Moving the table to the data layer
// does not fix that by itself; every value below is now the SINGLE number the
// engine reads, wherever it applies the trait.

export const TRAITS = {
  shrewd: {
    id: 'shrewd', name: 'Shrewd',
    // Applied in market.js's realisedPrice(). The engine already used 1.06
    // for this before the table and the code were reconciled — kept rather
    // than moved to the round 1.08 the table used to claim, since 1.06 is the
    // number every balance run to date has actually been tuned against.
    effect: { marketing: 1.06 },
    note: 'Reads the market. Sells into strength and does not panic into a low.',
  },
  cautious: {
    id: 'cautious', name: 'Cautious',
    // borrowWillingness scales the ceiling on automatic emergency borrowing
    // (turn.js, the year-end shortfall); crisisResist raises the bar for a
    // bad year to count as genuine distress (finance.js, assessSolvency).
    effect: { borrowWillingness: 0.65, crisisResist: 1.15 },
    note: 'Slow to borrow. Looks foolish in a boom and is still farming after the bust.',
  },
  mechanical: {
    id: 'mechanical', name: 'Mechanical',
    // wearRate slows equipment condition decay (turn.js); breakdownRisk
    // scales how often the machinery-breakdown misfortune is drawn at all
    // (events.js).
    effect: { wearRate: 0.7, breakdownRisk: 0.55 },
    note: 'Keeps machinery running and fixes it in the field rather than waiting on town.',
  },
  stockman: {
    id: 'stockman', name: 'Stockman',
    // Applied in market.js's livestockIncome() and turn.js's herd-increase
    // block — both already read this table directly.
    effect: { livestockYield: 1.15, livestockMortality: 0.7 },
    note: 'Good with animals. The herd does better and loses fewer.',
  },
  hardworking: {
    id: 'hardworking', name: 'Hard-working',
    // Scales this person's own contribution in derive.js's workerUnits().
    effect: { labour: 1.15 },
    note: 'Gets more done in a day than the day should hold.',
  },
  thrifty: {
    id: 'thrifty', name: 'Thrifty',
    // Scales the household's living cost when the OPERATOR carries this
    // trait (derive.js's livingCost()) — it describes how the household is
    // run, not a private saving only this one person keeps.
    effect: { livingCost: 0.85 },
    note: 'Nothing is thrown out and nothing is bought that could be made.',
  },
  literate: {
    id: 'literate', name: 'Educated',
    // Discounts the cash cost of adopting a new technology (turn.js) — reads
    // the bulletin and gets it right the first time instead of an expensive
    // false start.
    effect: { techAdoption: 1.25 },
    note: 'Reads the bulletins and the extension circulars, and acts on them.',
  },
  communal: {
    id: 'communal', name: 'Well-regarded',
    // Scales how often "the neighbours turn out" is drawn at all (events.js),
    // stacking with the background's own communitySupport figure.
    effect: { communitySupport: 1.3 },
    note: 'The district turns out for this family, and this family turns out for the district.',
  },
  hardy: {
    id: 'hardy', name: 'Hardy',
    // Applied directly in family.js's mortalityFor(). Declared as `health`
    // and `illnessResist` originally, neither of which anything read; this is
    // the number the engine has actually been applying to mortality all
    // along, now named for what it is.
    effect: { mortality: 0.8 },
    note: 'Built for this climate and this work.',
  },
  frail: {
    id: 'frail', name: 'Frail', negative: true,
    effect: { mortality: 1.35 },
    note: 'Never quite strong. Every hard winter takes something.',
  },
  restless: {
    id: 'restless', name: 'Restless', negative: true,
    // Applied in family.js's coming-of-age roll: how much less likely this
    // person is to want the farm at all.
    effect: { stayChance: 0.5 },
    note: 'Does not want the farm. Wants somewhere that is not this.',
  },
  stubborn: {
    id: 'stubborn', name: 'Stubborn', negative: true,
    // stayChance is the flip side of restless's — a stubborn heir digs in
    // rather than leaves. techAdoption and crisisResist mirror cautious and
    // literate's, in the negative direction: slow to take up a new method,
    // but that same refusal to be moved is a real defence in a bad year.
    effect: { stayChance: 1.2, techAdoption: 0.7, crisisResist: 1.2 },
    note: 'Will not change the way it is done. Will also not be moved off it.',
  },
};

export const TRAIT_IDS = Object.keys(TRAITS);
export const POSITIVE_TRAITS = TRAIT_IDS.filter((t) => !TRAITS[t].negative);

export function trait(id) {
  const t = TRAITS[id];
  if (!t) throw new Error(`Unknown trait id: ${id}`);
  return t;
}

/** A trait's declared effect value, or `fallback` if the trait or key is absent. */
export function traitEffect(id, key, fallback = 1) {
  const v = TRAITS[id]?.effect?.[key];
  return v == null ? fallback : v;
}
