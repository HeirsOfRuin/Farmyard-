// Marriage and coming-of-age, era by era.
//
// Both used to be a silent dice roll with no player in it at all: a child
// turned 18 and `wantsFarm` was decided behind the scenes, and an unmarried
// adult was simply married off in the ledger with no warning and no say.
// These tables are what makes each of those a real decision instead — how
// much control a family had over a match changed enormously across the
// century, from an arranged introduction through a suggested one to a
// marriage the parents heard about after the fact, and this is where that
// difference actually lives, in numbers rather than only in the copy.

/**
 * How much say the family has over a marriage, by era.
 *
 * `waitReliability` is the chance that asking a couple to wait actually
 * works. Early on it reliably does — courtship in 1885 ran through the
 * family, not around it. By the end of the century it is a coin flip: the
 * match goes ahead anyway about as often as not, whatever the parents said.
 *
 * `rebelDowryMult` is what a match that went ahead AGAINST the family's
 * wishes brings with it — a rebellious match arrived with a good deal less
 * behind it than one the family helped arrange, and by the modern era with
 * nothing at all.
 */
export const MARRIAGE_ERAS = [
  {
    id: 'arranged', to: 1910,
    label: 'arranged',
    prompt: (name) => `A match has been proposed for ${name} — a family in the district, well spoken of.`,
    encourageDetail: 'Send word back that the family is agreeable. This is how it is mostly done here.',
    waitDetail: 'Ask them to wait for a better prospect. Out here, that is still your call to make.',
    standAsideDetail: `Leave it between the two of them, such as it is.`,
    waitReliability: 0.97,
    rebelDowryMult: 0.5,
  },
  {
    id: 'suggested', to: 1960,
    label: 'suggested',
    prompt: (name) => `${name} has been keeping company with someone the family knows, and it is looking serious.`,
    encourageDetail: 'Let them know you approve. A blessed match still brings more with it than one that just happens.',
    waitDetail: 'Suggest they wait a year or two and see where things stand.',
    standAsideDetail: 'Say nothing either way and let them work it out themselves.',
    waitReliability: 0.8,
    rebelDowryMult: 0.35,
  },
  {
    id: 'modern', to: Infinity,
    label: 'modern',
    prompt: (name) => `${name} has brought someone home and it is clear this is who they have chosen.`,
    encourageDetail: 'Tell them you are glad of it. It costs nothing and it is worth something to hear.',
    waitDetail: `Say you'd rather they waited. It is your right to say so and not much more than that now.`,
    standAsideDetail: 'It was never really yours to weigh in on. Say as much.',
    waitReliability: 0.45,
    rebelDowryMult: 0,
  },
];

export function marriageEraFor(year) {
  return MARRIAGE_ERAS.find((e) => year <= e.to) || MARRIAGE_ERAS[MARRIAGE_ERAS.length - 1];
}

/** Ages at which an unmarried adult's situation is put to the player again. */
export const MARRIAGE_CHECK_AGES = [20, 24, 28, 32, 36, 40];

/**
 * Formal schooling beyond the farm and the local school, by era.
 *
 * Sending a child away cost real money and real years, and it was not
 * available at all in the early decades — there was nowhere out here to send
 * them. `cost` is in 1875 dollars, inflated the same way everything else in
 * this game is. `yearsAway` is how long they are gone and cannot be counted
 * on as labour, an heir, or anything else. `returnChance` is the odds they
 * come back to the farm rather than stay wherever the schooling took them —
 * which rose across the century as "an education" stopped meaning "a way out".
 */
export const EDUCATION_ERAS = [
  { to: 1899, available: false, label: null },
  {
    to: 1919, available: true, label: 'the Normal School in Winnipeg',
    cost: 35, yearsAway: 2, returnChance: 0.55,
  },
  {
    to: 1949, available: true, label: 'high school in town',
    cost: 60, yearsAway: 3, returnChance: 0.5,
  },
  {
    to: 1974, available: true, label: 'the agricultural college',
    cost: 220, yearsAway: 3, returnChance: 0.42,
  },
  {
    to: Infinity, available: true, label: 'university',
    cost: 650, yearsAway: 4, returnChance: 0.35,
  },
];

export function educationEraFor(year) {
  return EDUCATION_ERAS.find((e) => year <= e.to) || EDUCATION_ERAS[EDUCATION_ERAS.length - 1];
}

/**
 * How much a couple's own wishes move the odds of another child, by era.
 * Before reliable contraception — the Pill reached Canada in 1960, and rural
 * districts later than the cities — "not this year" barely moved the number,
 * and it was never effective family size limiting so much as it was hoped
 * for or endured. `hopeMult` and `avoidMult` both widen across the century as
 * that became less true.
 */
export const FAMILY_PLANNING_ERAS = [
  { to: 1900, hopeMult: 1.1, avoidMult: 0.9 },
  { to: 1930, hopeMult: 1.15, avoidMult: 0.8 },
  { to: 1960, hopeMult: 1.2, avoidMult: 0.7 },
  { to: Infinity, hopeMult: 1.25, avoidMult: 0.4 },
];

/** `stance` is 'hoping' | 'avoid' | anything else (neutral, the old default). */
export function familyStanceMult(year, stance) {
  if (stance !== 'hoping' && stance !== 'avoid') return 1;
  const era = FAMILY_PLANNING_ERAS.find((e) => year <= e.to) || FAMILY_PLANNING_ERAS[FAMILY_PLANNING_ERAS.length - 1];
  return stance === 'hoping' ? era.hopeMult : era.avoidMult;
}
