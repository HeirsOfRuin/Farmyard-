// Rolling the year's weather and misfortune.
//
// Everything here produces a `conditions` object, which is the only channel by
// which a bad year reaches the crop. Nothing in this module touches a yield
// directly — it sets conditions, and derive.yieldPerAcre reads them. That is
// what keeps the planning preview and the harvest honest with each other.

import { EVENTS, eventsFor, EVENT_SCOPES } from '../data/events.data.js';
import { neutralConditions, clamp, techEffect } from './derive.js';
import { traitEffect } from '../data/traits.data.js';
import { playerQuarters } from './land.js';
import { inflate } from '../data/prices.data.js';

/**
 * Roll the year's events.
 *
 * `forced` is a list of event ids that history demands (the 1935 rust, the 1937
 * drought, the 1950 and 1997 floods). Forced events fire at full weight on top
 * of whatever else the year rolls.
 */
export function rollYearEvents(state, rng, { forced = [], severityOverride = null } = {}) {
  const diff = state.difficultyDef;
  const regionWeights = state.regionDef.hazardWeights || {};
  const conditions = neutralConditions();
  const fired = [];

  // A standing era multiplier on a class of hazard — the drought cycle of the
  // thirties, and nothing else so far. It does not touch beneficial events.
  const tagMult = state.modifiers?.hazardTagMult || {};
  // A drought cycle does not just make bad years likelier, it makes GOOD ones
  // scarce. "A good year" and "a bumper crop" are the two heaviest events in
  // the whole table, and leaving them at full weight through the thirties was
  // most of why the dust bowl kept returning twenty bushels an acre.
  const goodMult = state.modifiers?.beneficialMult ?? 1;

  // Two traits that act on a single tag rather than the whole table. A
  // mechanical operator does not eliminate breakdowns, they draw the event
  // less often; a well-regarded family, on top of whatever their background's
  // own standing in the district is worth, has the neighbours turn out more.
  const mechanical = state.operatorTraits?.includes('mechanical');
  const breakdownMult = mechanical ? traitEffect('mechanical', 'breakdownRisk') : 1;
  const communal = state.operatorTraits?.includes('communal');
  const communityMult = (communal ? traitEffect('communal', 'communitySupport') : 1) *
    (state.backgroundDef?.communitySupport ?? 1);

  const pool = eventsFor(state.year).map((e) => {
    let weight = (e.weight || 0) * (regionWeights[e.tag] ?? 1);
    if (e.beneficial) {
      weight *= goodMult;
      if (e.tag === 'community') weight *= communityMult;
    } else {
      weight *= diff.hazardFrequency * (tagMult[e.tag] ?? 1);
      if (e.tag === 'machinery') weight *= breakdownMult;
    }
    return { ...e, weight };
  });

  // How many things happen to a farm in a year.
  //
  // This distribution is load-bearing. Hazards multiply against each other, so
  // averaging nearly two a year made the MEDIAN year a bad one and put the
  // realised yield about 20% under the baseline the planning screen shows.
  // Around 1.4 events a year keeps a quiet year genuinely quiet.
  const count = rng.weighted([
    { n: 0, weight: 18 }, { n: 1, weight: 40 }, { n: 2, weight: 28 },
    { n: 3, weight: 11 }, { n: 4, weight: 3 },
  ]).n;

  const chosen = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const pick = rng.weighted(pool.filter((e) => !used.has(e.id)));
    if (!pick) break;
    used.add(pick.id);
    chosen.push(pick);
  }
  for (const id of forced) {
    if (used.has(id)) continue;
    const e = EVENTS[id];
    if (e) { chosen.push({ ...e }); used.add(id); }
  }

  for (const e of chosen) {
    // A beneficial event's "severity" is how good it was, so difficulty must
    // not amplify it the way it amplifies a disaster.
    let severity = severityOverride != null && forced.includes(e.id)
      ? severityOverride
      : rng.float(e.severity[0], e.severity[1]);
    if (!e.beneficial) severity *= diff.hazardSeverity;
    severity = clamp(severity, 0, 1);

    // A well and a pump take some of the edge off a dry year — water that does
    // not have to be hauled is the first real capital improvement on dry land.
    if (!e.beneficial && e.tag === 'drought') {
      severity *= 1 - techEffect(state, 'droughtResist', { mode: 'max' });
    }

    // Crop insurance puts a floor under the worst year. Premiums every year
    // for a floor under one of them: the arithmetic only looks foolish until
    // it does not. This was declared in the data and read by nothing, which
    // made the whole decision a cosmetic one.
    const insuredFloor = techEffect(state, 'disasterFloor', { mode: 'max' });
    if (!e.beneficial && insuredFloor > 0) {
      severity = Math.min(severity, 1 - insuredFloor);
    }

    // The floor is a difficulty flag, not a scalar: on Homesteader a disaster
    // cannot take more than a set share of the crop; on Sodbuster there is no
    // floor and a drought can take all of it.
    if (!e.beneficial && diff.catastropheFloor > 0) {
      severity = Math.min(severity, 1 - diff.catastropheFloor);
    }

    applyEvent(state, rng, conditions, e, severity);
    fired.push({ id: e.id, name: e.name, severity, narrative: e.narrative, beneficial: !!e.beneficial });
  }

  return { conditions, fired };
}

function applyEvent(state, rng, conditions, e, severity) {
  const scope = EVENT_SCOPES[e.scope] ?? 1;

  if (e.beneficial) {
    conditions.weatherYield *= 1 + severity * scope;
    if (e.harvestDaysGained) conditions.harvestDaysLost -= e.harvestDaysGained;
    if (e.strainsCapacity) conditions.bumperStrain = true;
    return;
  }

  // Hail and flood are per-quarter: that narrowness is the whole character of
  // the hazard, and averaging it across the farm would erase it.
  if (e.tag === 'hail' || e.tag === 'flood') {
    const owned = playerQuarters(state.quarters);
    const hitCount = Math.max(1, Math.round(owned.length * scope));
    for (const q of rng.shuffle([...owned]).slice(0, hitCount)) {
      const existing = conditions.hailByQuarter[q.id] || 0;
      conditions.hailByQuarter[q.id] = clamp(existing + severity, 0, 1);
    }
  } else if (e.tag === 'rust') {
    conditions.rustSeverity = clamp(conditions.rustSeverity + severity * scope, 0, 1);
    // A variety that was proof against rust last year is not proof against a
    // new race of it. 1954 is the year that lesson was taught.
    if (state.rustBypassVariety && state.wheatVariety === state.rustBypassVariety) {
      conditions.rustBypassed = true;
    }
  } else if (e.tag !== 'winter' && e.tag !== 'livestock' && e.tag !== 'horses' &&
             e.tag !== 'machinery' && e.tag !== 'accident' && e.tag !== 'fire') {
    conditions.weatherYield *= clamp(1 - severity * scope, 0, 1);
  }

  // A planned rotation breaks the disease cycle; continuous cropping feeds it.
  if (e.category === 'disease') {
    severity *= 1 - techEffect(state, 'diseaseResist', { mode: 'max' });
  }
  if (e.moistureDrain) conditions.moistureShift -= e.moistureDrain * severity;
  if (e.seedingDaysLost) conditions.springDaysLost += Math.round(e.seedingDaysLost * severity);
  if (e.harvestDaysLost) conditions.harvestDaysLost += Math.round(e.harvestDaysLost * severity);
  if (e.gradeDowngrade) conditions.gradeFactor *= clamp(1 - severity * 0.4, 0.4, 1);
  if (e.feedDemandMult) conditions.feedDemandMult = (conditions.feedDemandMult ?? 1) * e.feedDemandMult;

  // Effects that hit the farm rather than the crop are queued for the turn
  // pipeline to apply, so that money and animals change hands in one place.
  conditions.pending = conditions.pending || [];
  if (e.livestockLoss) conditions.pending.push({ kind: 'livestockLoss', fraction: e.livestockLoss * severity });
  if (e.drafLoss) conditions.pending.push({ kind: 'draftLoss', fraction: e.drafLoss * severity });
  if (e.cashCost) conditions.pending.push({ kind: 'cash', amount: -inflate(e.cashCost / (e.cashCostYear ? 1 : 1), state.year) * severity });
  if (e.destroysBuilding) conditions.pending.push({ kind: 'destroyBuilding', id: e.destroysBuilding });
  if (e.injuresOperator) conditions.pending.push({ kind: 'injury', severity });
  if (e.soilDamage) conditions.pending.push({ kind: 'soilDamage', amount: e.soilDamage * severity });
  if (e.buildingRisk && rng.chance(e.buildingRisk * severity)) {
    conditions.pending.push({ kind: 'destroyBuilding', id: 'barn' });
  }
}

/** The narrative lines for a year's events, worst first. */
export function describeEvents(fired) {
  return [...fired]
    .sort((a, b) => (a.beneficial === b.beneficial ? b.severity - a.severity : a.beneficial ? 1 : -1))
    .map((f) => ({ name: f.name, text: f.narrative, severity: f.severity, beneficial: f.beneficial }));
}
