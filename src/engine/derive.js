// THE single source for every derived number in the game.
//
// This module exists to enforce one rule: the number shown to the player and
// the number used to resolve the outcome must come from the same code. Not
// "the same formula, written twice" — the same function. When a spring plan
// says a field should make 22 bushels and harvest resolves it at 14, that gap
// must be explainable by weather that actually happened, never by two
// implementations drifting apart.
//
// The pattern throughout: a function takes explicit `conditions`. The planning
// screen passes expected conditions, harvest passes the conditions that were
// actually rolled. One derivation, two inputs. Nothing recomputes a yield or a
// capacity anywhere else in this codebase, and nothing in src/ui/ computes one
// at all.

import { crop as cropDef, CROPS, WHEAT_VARIETIES } from '../data/crops.data.js';
import { soil as soilDef } from '../data/regions.data.js';
import { equipment as equipDef } from '../data/equipment.data.js';
import { livestock as stockDef, LIVESTOCK } from '../data/livestock.data.js';
import { TECHNOLOGIES } from '../data/tech.data.js';
import { difficulty as diffDef } from '../data/difficulty.data.js';
import { traitEffect } from '../data/traits.data.js';
import {
  ACRES_PER_QUARTER, playerQuarters, quarterValueFactor, workableAcres,
  distanceFromYard, roadFor, forageAcres,
} from './land.js';
import {
  ROAD_SPEED, ON_FOOT_MPH, TRAVEL_HOURS_PER_DAY, TRIPS_SPRING, TRIPS_HARVEST,
  TRANSPORT_PENALTY, ROAD_CLASSES, HAUL_SHARE_IN_HARVEST,
} from '../data/roads.data.js';
import {
  landPrice, cropPrice, interestRate, livingCostPerAdult, inflate, inflateWage,
  freightRate, priceIndex, propertyTaxRate,
} from '../data/prices.data.js';

// Workable days in each season on this latitude. Spring covers breaking,
// tillage and seeding between the frost going out and the seeding deadline;
// harvest runs from when the crop is fit until it is under the snow.
export const BASE_SPRING_DAYS = 38;
export const BASE_HARVEST_DAYS = 34;
export const BASE_THRESHING_DAYS = 45; // stooked grain waits; it just spoils slowly

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * Neutral conditions: an average year with nothing going wrong. The planning
 * screen shows the player what an average year looks like, so their
 * expectations are calibrated to the same model that will judge them.
 */
export function neutralConditions() {
  return {
    weatherYield: 1.0,
    moistureShift: 0,
    springDaysLost: 0,
    harvestDaysLost: 0,
    gradeFactor: 1.0,
    hailByQuarter: {}, // quarterId -> fraction destroyed
    rustSeverity: 0,
  };
}

// ---------------------------------------------------------------------------
// Yield
// ---------------------------------------------------------------------------

/** Fertility maps to a yield multiplier. Virgin prairie is rich; mined soil is not. */
export function fertilityFactor(fertility) {
  return 0.5 + 0.65 * clamp(fertility, 0, 1.1);
}

/**
 * The virgin-prairie bonus.
 *
 * Land broken out of native sod grew remarkable crops for its first several
 * years — thousands of years of grassland turned under at once — and then
 * settled back as that reserve was used up. Twenty-five and thirty bushel
 * wheat on new breaking is all through the settlement accounts, and it is
 * what actually financed the first decade of a homestead: you lived on the
 * new ground while you broke more of it.
 *
 * Without this the homestead era ran at a structural loss and half of all
 * farms were gone by 1887.
 */
export function newBreakingFactor(q) {
  const cropped = q.yearsCropped ?? 0;
  if (cropped >= 6) return 1;
  // 1.38 on the first crop, easing to 1 by the sixth.
  return 1 + 0.38 * (1 - cropped / 6);
}

/** Moisture against a crop's own drought and wet tolerance. */
export function moistureFactor(moisture, c) {
  const s = c.sensitivity || {};
  const m = clamp(moisture, 0, 1.2);
  if (m < 0.55) {
    const deficit = (0.55 - m) / 0.55;
    return clamp(1 - deficit * 0.8 * (s.drought ?? 1), 0.05, 1);
  }
  if (m > 0.85) {
    const excess = (m - 0.85) / 0.35;
    return clamp(1 - excess * 0.4 * (s.excessWet ?? 1), 0.15, 1);
  }
  return 1;
}

/**
 * Weed pressure, and what holds it down.
 *
 * This is the agronomic argument of the entire period. Before herbicide the
 * only control was a year of summerfallow — which is why farmers gave up a
 * third of their acres to grow nothing, and why 2,4-D in 1947 changed the
 * shape of prairie farming inside a decade. Without weeds in the model, both
 * summerfallow and herbicide are decoration, and the ablation said so: the
 * whole technology tree moved the survival rate by exactly zero.
 */
export function weedControlLevel(state) {
  let control = 0;
  for (const id of state.technologies || []) {
    const t = TECHNOLOGIES[id];
    if (t?.effect?.weedControl) control = Math.max(control, t.effect.weedControl);
  }
  return clamp(control, 0, 0.95);
}

export function weedFactor(state, q) {
  const pressure = clamp(q.weedPressure ?? 0.12, 0, 1);
  const control = weedControlLevel(state);
  // Uncontrolled weeds on long-cropped ground take a serious share of a crop.
  return clamp(1 - pressure * (1 - control) * 0.5, 0.45, 1);
}

/** Aggregate of a named tech effect across everything the farm has adopted. */
export function techEffect(state, key, { mode = 'max', base = 0 } = {}) {
  let v = base;
  for (const id of state.technologies || []) {
    const e = TECHNOLOGIES[id]?.effect;
    if (!e || e[key] == null) continue;
    if (mode === 'max') v = Math.max(v, e[key]);
    else if (mode === 'min') v = v === base ? e[key] : Math.min(v, e[key]);
    else if (mode === 'mult') v = (v || 1) * e[key];
    else v += e[key];
  }
  return v;
}

/** Penalty for growing a crop on ground that grew the same thing last year. */
export function rotationFactor(q, c) {
  const hist = q.cropHistory || [];
  if (!hist.length) return 1;
  let sameRun = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i] === c.id; i--) sameRun++;
  if (sameRun === 0) return 1;
  // The penalty compounds but flattens out — continuous wheat gets worse for a
  // few years and then settles into simply being bad.
  const pen = (c.continuousPenalty || 0) * (1 - Math.pow(0.6, sameRun)) * 2.2;
  return clamp(1 - pen, 0.45, 1);
}

/** The wheat variety a farm is currently sowing. */
export function varietyFactor(state, c) {
  if (c.id !== 'wheat') return 1;
  const v = WHEAT_VARIETIES.find((x) => x.id === state.wheatVariety) || WHEAT_VARIETIES[0];
  return v.yieldFactor;
}

export function currentVariety(state) {
  return WHEAT_VARIETIES.find((x) => x.id === state.wheatVariety) || WHEAT_VARIETIES[0];
}

/** Multiplier from adopted technologies that raise yield. */
export function techYieldFactor(state) {
  let f = 1;
  for (const id of state.technologies || []) {
    const t = TECHNOLOGIES[id];
    if (t?.effect?.yieldFactor) f *= t.effect.yieldFactor;
  }
  // The seeding implement's own quality: broadcast wastes seed and yields less
  // than a drill, and an air drill places it better than either.
  const seeder = bestImplement(state, 'seed');
  if (seeder?.yieldFactor) f *= seeder.yieldFactor;
  return f;
}

/**
 * Bushels (or tons/cwt) per acre for a quarter under a crop.
 *
 * This is the function. Planning calls it with neutralConditions(), harvest
 * calls it with the year's actual rolled conditions, and the year-end ledger
 * reports the difference between the two as "what the weather cost you".
 */
export function yieldPerAcre(state, q, cropId, conditions = neutralConditions()) {
  const c = cropDef(cropId);
  if (!c.yieldBase) return 0;
  const s = soilDef(q.soil);
  const diff = diffDef(state.difficulty);

  let y = c.yieldBase;
  y *= c.category === 'forage' || c.category === 'bush' ? s.pastureFactor ?? 1 : s.yieldFactor;
  if (c.rowCrop && s.rowCropBonus) y *= s.rowCropBonus;
  y *= varietyFactor(state, c);
  y *= fertilityFactor(q.fertility);
  y *= newBreakingFactor(q);
  y *= moistureFactor(q.moisture + (conditions.moistureShift || 0), c);
  y *= rotationFactor(q, c);
  y *= weedFactor(state, c.category === 'forage' ? { ...q, weedPressure: (q.weedPressure ?? 0) * 0.4 } : q);
  // Pasture does not care how far away it is; a crop very much does.
  if (!c.grazed) y *= timelinessFactor(state, q);
  y *= techYieldFactor(state);
  y *= diff.yieldMult;
  y *= conditions.weatherYield ?? 1;

  // Flax on fresh breaking was the classic first crop: it tolerated a seedbed
  // full of sod that would have smothered wheat.
  if (c.breakingCropBonus && q.cropHistory.length === 0) y *= c.breakingCropBonus;

  // Rust, countered by the variety's own resistance.
  if (conditions.rustSeverity > 0) {
    const bypassed = conditions.rustBypassed && c.id === 'wheat';
    const resist = bypassed ? 0
      : c.id === 'wheat' ? currentVariety(state).rustResist
      : 1 - (c.sensitivity?.rust ?? 1) * 0.6;
    y *= clamp(1 - conditions.rustSeverity * (1 - resist), 0.05, 1);
  }

  // Hail is per-quarter: it takes a field and leaves the next one alone.
  const hail = conditions.hailByQuarter?.[q.id] || 0;
  if (hail > 0) y *= clamp(1 - hail * (c.sensitivity?.hail ?? 1), 0, 1);

  return Math.max(0, y);
}

// ---------------------------------------------------------------------------
// Power, implements and capacity
// ---------------------------------------------------------------------------

/** Total draft power on the place, in horse-equivalents. */
export function draftPower(state) {
  let draft = 0;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    if (e.category === 'power') draft += (e.draft || 0) * (item.count || 1) * conditionFactor(item);
  }
  return draft;
}

/** Machines wear out. A 20-year-old binder is not a new one. */
export function conditionFactor(item) {
  return clamp(item.condition ?? 1, 0.35, 1);
}

/** Every implement the farm owns that performs `operation`. */
export function implementsFor(state, operation) {
  return state.equipment
    .map((item) => ({ item, def: equipDef(item.type) }))
    .filter(({ def }) => def.operation === operation);
}

/** The most capable implement the farm owns for an operation, or null. */
export function bestImplement(state, operation, filter) {
  // `filter` exists because "the best thing to till with" and "the best thing
  // to BREAK with" are two different questions, and answering both with the
  // first one is a real bug this codebase shipped: a disc harrow out-works a
  // gang plow on broken ground, so the moment a farm bought a disc in 1890
  // bestImplement(state,'till') stopped returning anything that could turn
  // native sod, breakableAcres() went to zero, and the farm's broken acres
  // froze at 205 for the next hundred and ten years while it went on buying
  // land it could never crop.
  const list = implementsFor(state, operation);
  if (!list.length) return null;
  let best = null;
  let bestCap = -1;
  for (const { item, def } of list) {
    if (filter && !filter(def)) continue;
    const cap = effectiveCapacity(state, item, def);
    if (cap > bestCap) { bestCap = cap; best = { ...def, item, effectiveCapacity: cap }; }
  }
  return best;
}

/** The best thing on the place that will turn sod, which is not the same thing. */
export function bestBreaker(state) {
  return bestImplement(state, 'till', (d) => d.canBreakSod);
}

/**
 * Acres per day an implement actually achieves here — its rated capacity cut
 * back by the draft power available to pull it and by its own condition.
 * A gang plow rated at 5.5 acres behind six horses does 2.7 behind three.
 */
export function effectiveCapacity(state, item, def) {
  const d = def || equipDef(item.type);
  let cap = d.capacity || 0;
  if (!cap) return 0;
  cap *= conditionFactor(item);
  if (!d.selfPowered && d.draftNeeded > 0) {
    const ratio = clamp(draftPower(state) / d.draftNeeded, 0, 1);
    cap *= ratio;
  }
  if (d.reliability) cap *= d.reliability;
  // Rubber tires over steel lugs was worth roughly a quarter more work a day.
  const power = state.equipment.find((i) => equipDef(i.type).capacityBonus);
  if (power && !d.selfPowered) cap *= equipDef(power.type).capacityBonus;
  return cap;
}

/** People able to run a machine or swing a scythe this year. */
export function labourForce(state) {
  const workers = state.family.members.filter(
    (m) => !m.deathYear && workingAge(state.year, m) && !m.away
  );
  let units = 0;
  for (const m of workers) units += workerUnits(state.year, m);
  // Electrification, augers and the like gave real hours back — no more
  // filling lamps, pumping by hand or shovelling grain up a ladder.
  const saved = 1 + techEffect(state, 'labourSaved', { mode: 'sum' });
  units *= saved;
  return {
    people: workers.length,
    units: units + (state.hiredHands || 0),
    hired: state.hiredHands || 0,
    family: units,
  };
}

export function workingAge(year, m) {
  const age = year - m.birthYear;
  return age >= 12 && age <= 72;
}

/** A worker's output, which is not flat across a life. */
export function workerUnits(year, m) {
  const age = year - m.birthYear;
  let u;
  if (age < 12) u = 0;
  else if (age < 16) u = 0.5;
  else if (age < 20) u = 0.85;
  else if (age < 55) u = 1.0;
  else if (age < 65) u = 0.8;
  else if (age <= 72) u = 0.5;
  else u = 0.2;
  u *= clamp(m.health ?? 1, 0.2, 1);
  if (m.injuredUntil && year <= m.injuredUntil) u *= 0.35;
  // A person's own trait, not the farm's — this is what "hard-working" means
  // and it used to mean nothing at all.
  if (m.traits?.includes('hardworking')) u *= traitEffect('hardworking', 'labour');
  return u;
}

/**
 * Hand methods, always available, needing nothing but a person.
 *
 * A farm can never be structurally unable to seed or harvest: a settler with
 * nothing but a sack sowed broadcast by hand, and a settler with nothing but a
 * sickle cut by hand. Both are dreadful — roughly an acre a day against a
 * binder's thirteen — and that gap IS the argument for buying machinery. But
 * they are always there, so "I own no drill" means a slow year, not a farm
 * that silently grows nothing.
 */
export const HAND_METHODS = {
  seed: {
    id: 'handBroadcast', name: 'Broadcasting by hand', operation: 'seed',
    capacity: 6, draftNeeded: 0, selfPowered: true,
    yieldFactor: 0.85, seedWaste: 1.25, byHand: true,
  },
  harvest: {
    id: 'handReaping', name: 'Cutting by hand', operation: 'harvest',
    capacity: 1.2, draftNeeded: 0, selfPowered: true,
    needsThreshing: true, fieldLoss: 0.1, byHand: true,
  },
  till: {
    id: 'handHoe', name: 'Working by hand', operation: 'till',
    capacity: 0.35, draftNeeded: 0, selfPowered: true, byHand: true,
  },
  thresh: {
    id: 'handFlail', name: 'Flailing by hand', operation: 'thresh',
    capacity: 0.7, draftNeeded: 0, selfPowered: true, byHand: true,
  },
};

/**
 * How many acres the farm can get through in an operation this season.
 * Capacity is the constraint that makes mechanization matter: yield says what
 * grew, this says what you got to.
 *
 * Always returns a numeric `perDay`, never undefined. An earlier version
 * omitted it when no implement was owned, and callers dividing by it produced
 * a capacity of four thousandths of an acre — which looks like a farm that
 * simply never grows anything.
 */
export function seasonCapacity(state, operation, daysAvailable) {
  const labour = labourForce(state);
  let impl = bestImplement(state, operation);
  let byHand = false;

  // Fall back to hand work when there is no implement — OR when the implement
  // on the place is currently worse than hands are. A plow with no team to
  // pull it is not a plow, and owning one must never leave a farm worse off
  // than owning nothing at all: that produced farms that silently stopped
  // seeding the year their last ox died.
  const hand = HAND_METHODS[operation];
  if (hand && (!impl || (impl.effectiveCapacity || 0) < hand.capacity)) {
    impl = { ...hand, effectiveCapacity: hand.capacity, item: { condition: 1 } };
    byHand = true;
  }
  if (!impl) {
    return { acres: 0, perDay: 0, implement: null, crews: 0,
      reason: `nothing on the place performs ${operation}` };
  }

  // One implement needs one person; a second machine needs a second person.
  // Hand work scales with people directly — everybody can swing a scythe.
  const machines = byHand ? Math.max(1, Math.floor(labour.units)) : implementsFor(state, operation).length;
  const crews = Math.min(machines, Math.floor(labour.units) || (labour.units > 0 ? 1 : 0));
  if (crews <= 0) {
    return { acres: 0, perDay: 0, implement: impl, crews: 0, byHand,
      reason: 'nobody on the place is able to work' };
  }
  const perDay = impl.effectiveCapacity * crews;
  return { acres: perDay * daysAvailable, perDay, implement: impl, crews, byHand };
}

// ---------------------------------------------------------------------------
// Getting there
// ---------------------------------------------------------------------------

/**
 * How fast the farm can move itself down a road, in miles per hour.
 *
 * The farm travels at the pace of its best power unit — you hitch the fast
 * thing to move the outfit — and with nothing at all you walk. This single
 * number is what makes distance punishing in 1880 and trivial in 1965: two
 * miles an hour behind oxen against fifteen behind a diesel tractor.
 */
export function travelSpeed(state) {
  let best = ON_FOOT_MPH;
  for (const item of state.equipment || []) {
    const mph = ROAD_SPEED[item.type];
    if (mph && mph > best) best = mph;
  }
  return best;
}

/**
 * Bushels the farm can move in one trip. The wagon box that defined the first
 * fifty years held forty-five; the three-ton truck that replaced it holds two
 * hundred and forty, and that alone changed what land was worth owning.
 */
export function haulCapacity(state) {
  let best = 0;
  for (const item of state.equipment || []) {
    const e = equipDef(item.type);
    if (e.haulCapacity) best = Math.max(best, e.haulCapacity * (item.count || 1));
  }
  // With nothing to haul in, you borrow a neighbour's or you make do.
  return best || 30;
}

/** Extra hours per trip to fold, move and re-set the widest machine owned. */
export function transportPenalty(state) {
  let worst = 0;
  for (const item of state.equipment || []) {
    const p = TRANSPORT_PENALTY[item.type];
    if (p && p > worst) worst = p;
  }
  return worst;
}

/**
 * Timeliness: what a field loses for being a long way from the yard.
 *
 * This, not the arithmetic of travel days, is what actually made the back
 * quarter worth less. Distant land got seeded last and so missed the moisture,
 * got worked fewer times, got cut late and stood longer in the weather. On a
 * horse farm three miles out that is a fifth of the crop; behind a diesel
 * tractor on gravel it is nothing, which is precisely why farms could spread
 * across a township after the war and could not before it.
 *
 * It reads the same travel speed and road class the day-cost does, so the two
 * cannot drift apart, and it lands on the yield the player is already shown for
 * that field rather than in a number nobody looks at.
 */
export function timelinessFactor(state, q) {
  const miles = distanceFromYard(state, q);
  if (miles <= 0) return 1;
  const road = roadFor(state, q);
  const effectiveMph = Math.max(0.4, travelSpeed(state) * road.speedFactor);
  const hoursOneWay = miles / effectiveMph;
  // Loss per hour of travel, to a floor — even the furthest corner of a
  // township still grows something. Calibrated so a field three miles out
  // behind a team loses about a fifth of its crop and the same field behind a
  // diesel tractor loses nothing: enough to decide where the money crop goes,
  // not so much that distant land is worthless.
  const penalty = Math.min(0.32, hoursOneWay * 0.075);
  return 1 - penalty;
}

/**
 * What scattered land costs in working days.
 *
 * Every field away from the yard has to be reached, and the outfit has to come
 * home again. On a trail behind a team that is most of a day each way; on
 * gravel behind a tractor it is ten minutes. The days come straight off the
 * season, which is why this is the thing that decides whether a farm can be
 * spread across a township or has to be gathered around one yard.
 *
 * This is the single source for the cost — croppableAcres() subtracts it, the
 * plan panel reports it, and the bot reads it when deciding what land to buy.
 */
export function fieldLogistics(state, conditions = null) {
  const speed = travelSpeed(state);
  const penalty = transportPenalty(state);
  const fields = [];
  let springDaysLost = 0;
  let harvestDaysLost = 0;

  for (const q of playerQuarters(state.quarters)) {
    if (q.brokenAcres < 1) continue;
    const c = CROPS[q.use];
    if (!c || ['idle', 'bush'].includes(q.use)) continue;

    const miles = distanceFromYard(state, q);
    const road = roadFor(state, q);
    // Pasture is walked to once and left; it does not carry an outfit back and
    // forth all season.
    const grazedOnly = q.use === 'pasture';

    const effectiveMph = Math.max(0.4, speed * road.speedFactor);
    const roundTripHours = (2 * miles) / effectiveMph + (miles > 0 ? penalty : 0);

    const springTrips = grazedOnly ? 0 : TRIPS_SPRING;

    // Hauling is the real cost of a distant field, and it scales with the CROP,
    // not with a fixed number of visits. A hundred and twenty acres at fifteen
    // bushels is eighteen hundred bushels, and a wagon box holds forty-five —
    // that is forty loads, each one a round trip. A three-ton truck holds two
    // hundred and forty and collapses the same job to eight.
    //
    // Not all of it lands in the harvest window: a great deal of grain moved in
    // winter, on sleighs, over snow, when there was nothing else to do and the
    // going was good. Only the share that competes with harvest is charged
    // here; the rest is absorbed into a season with days to spare.
    const expectedBushels = grazedOnly ? 0 : yieldPerAcre(state, q, q.use, neutralConditions()) * q.brokenAcres;
    const loads = expectedBushels > 0 ? expectedBushels / haulCapacity(state) : 0;
    // Hauling ran in parallel. A farm at harvest put every wagon, every team
    // and every available body on the road at once, and neighbours traded work
    // besides. Charging it all to one outfit made distant land cost 87% of a
    // farm's capacity, which is not a constraint, it is a prohibition.
    const haulOutfits = Math.max(1, Math.min(4, Math.floor(labourForce(state).units)));
    const haulTripsInSeason = (loads * HAUL_SHARE_IN_HARVEST) / haulOutfits;
    const harvestTrips = grazedOnly ? 0 : TRIPS_HARVEST + haulTripsInSeason;

    const spring = (roundTripHours * springTrips) / TRAVEL_HOURS_PER_DAY;
    const harvest = (roundTripHours * harvestTrips) / TRAVEL_HOURS_PER_DAY;

    springDaysLost += spring;
    harvestDaysLost += harvest;
    fields.push({
      id: q.id, quarter: q.quarter, section: q.section,
      miles, road: road.short, roadLevel: road.level,
      springDays: spring, harvestDays: harvest, total: spring + harvest,
    });
  }

  // Spring breakup. A poor road in a wet spring will not carry a loaded wagon
  // at all until it dries, which is exactly what a road ban still means.
  let breakupDays = 0;
  const wetness = conditions?.springDaysLost || 0;
  if (wetness > 0 && fields.length) {
    const worstRoad = Math.min(...fields.map((f) => f.roadLevel));
    const cls = ROAD_CLASSES[Math.max(0, Math.min(ROAD_CLASSES.length - 1, worstRoad))];
    breakupDays = cls.breakupDays * Math.min(1, wetness / 9);
    springDaysLost += breakupDays;
  }

  fields.sort((a, b) => b.total - a.total);
  return {
    speed,
    transportPenalty: penalty,
    springDaysLost,
    harvestDaysLost,
    breakupDays,
    fields,
    worst: fields[0] || null,
    totalDays: springDaysLost + harvestDaysLost,
  };
}

/**
 * Acres the farm can actually put into crop in a season.
 *
 * Tillage and seeding share the spring, so the limit is the COMBINED rate, not
 * either one alone — and the harvest has to reach it in the fall or it does not
 * count. This is the single number that decides how big a farm can be, and it
 * is the number the spring phase uses to decide what gets seeded, so anything
 * reasoning about "would this machine help?" must ask this and not guess from
 * a rated capacity.
 *
 * `extra` optionally adds a hypothetical implement, which is how the bot (and
 * the UI's "what would this buy me?" line) evaluates a purchase against the
 * same arithmetic the engine will apply.
 */
export function croppableAcres(state, extra = null) {
  const probe = extra
    ? { ...state, equipment: [...state.equipment, { type: extra, count: 1, condition: 1, yearBought: state.year }] }
    : state;
  const cond = neutralConditions();
  // Days on the road are days not in the field. Subtracted here so the number
  // the planning screen shows, the number the engine seeds against and the
  // number the bot plans with are all the same one.
  const logistics = fieldLogistics(probe, cond);
  const days = Math.max(3, springDays(probe, cond) - logistics.springDaysLost);
  const harvestDaysLeft = Math.max(3, harvestDays(probe, cond) - logistics.harvestDaysLost);

  const till = seasonCapacity(probe, 'till', days);
  const seed = seasonCapacity(probe, 'seed', days);
  const harvest = seasonCapacity(probe, 'harvest', harvestDaysLeft);

  const tillRate = till.perDay || 0.0001;
  const seedRate = seed.perDay || 0.0001;
  const springLimit = days / (1 / tillRate + 1 / seedRate);
  return {
    spring: springLimit,
    harvest: harvest.acres,
    logistics,
    daysOnTheRoad: logistics.totalDays,
    // A crop you cannot take off is not a crop.
    acres: Math.min(springLimit, harvest.acres),
    tillPerDay: till.perDay,
    seedPerDay: seed.perDay,
    harvestPerDay: harvest.perDay,
    bottleneck: springLimit <= harvest.acres
      ? (1 / tillRate > 1 / seedRate ? 'tillage' : 'seeding')
      : 'harvest',
  };
}

// Days in the summer breaking window (June-July), after seeding and before
// harvest. Breaking did not compete with seeding — it was its own job.
export const BASE_BREAKING_DAYS = 42;

/**
 * Acres of native sod the outfit can turn in one season.
 *
 * Asked by the engine when it resolves breaking AND by the UI to default the
 * breaking input, so the number the player is offered is the number they will
 * actually get.
 */
export function breakableAcres(state) {
  const impl = bestBreaker(state);
  if (!impl) {
    return { acres: 0, perDay: 0, implement: impl, reason: 'nothing on the place will turn native sod' };
  }
  // Slower than working broken ground, but not by much with a walking plow:
  // contemporary accounts put it near an acre a day behind oxen. A disc or a
  // heavy cultivator taking out scrub and slough margin is a great deal slower
  // than the same machine on land already in crop, which is what
  // `breakingFactor` carries.
  const perDay = impl.effectiveCapacity * (impl.breakingFactor ?? 0.85);
  return { acres: perDay * BASE_BREAKING_DAYS, perDay, implement: impl };
}

export function springDays(state, conditions) {
  return Math.max(6, BASE_SPRING_DAYS - (conditions.springDaysLost || 0));
}

export function harvestDays(state, conditions) {
  return Math.max(5, BASE_HARVEST_DAYS - (conditions.harvestDaysLost || 0));
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/** Tons of hay and bushels of grain the animals will eat over a winter. */
export function feedRequired(state) {
  let hay = 0;
  let grain = 0;
  for (const [id, count] of Object.entries(state.livestock || {})) {
    if (!count) continue;
    const l = LIVESTOCK[id];
    if (!l) continue;
    hay += (l.feed.hay || 0) * count;
    grain += (l.feed.grain || 0) * count;
  }
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    if (e.category === 'power' && e.feed) {
      hay += (e.feed.hay || 0) * (item.count || 1);
      grain += (e.feed.oats || 0) * (item.count || 1);
    }
  }
  return { hay, grain };
}

/** Animals that can be grazed rather than fed, given pasture acres. */
/**
 * How much stock this farm can actually carry.
 *
 * Barn room, grass, and winter feed. Without this the herd compounds: hogs
 * breed at 7.5 and were multiplying more than fourfold every year with nothing
 * to stop them, which by 1929 produced a farm with a net worth of eight and a
 * half MILLION dollars and an income that grew straight through the Depression.
 * Two reasonable numbers in two different files, and nobody had written down
 * their product.
 */
export function carryingCapacity(state) {
  // Barn and building room.
  let housed = 0;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    if (e.livestockCapacity) housed += e.livestockCapacity * (item.count || 1);
  }
  // Grass.
  const grazed = grazingCapacity(state);
  // Winter feed actually in the stack, at roughly what an animal eats.
  const hay = (state.granary.hay || 0) / 2.5;
  const grain = (state.granary.oats || 0) / 45 + (state.granary.barley || 0) / 40;

  // A farm can always keep a few head around the yard, barn or no barn.
  const base = 12;
  return Math.max(base, Math.min(housed + base, grazed + hay + grain + base));
}

/**
 * A hen house is not a pasture. Poultry was limited by the building and by
 * what the local egg market would take, not by grass — and because hens are
 * cheap and breed fast, letting them compete for the same capacity as cattle
 * produced farms with six hundred chickens and one cow.
 */
export function speciesCap(state, id) {
  if (id === 'chickens') {
    // A farm flock, plus more once there is power for lights and water.
    const base = 120;
    const electrified = (state.technologies || []).includes('ruralElectrification');
    return electrified ? 400 : base;
  }
  if (id === 'hogs') {
    // Hogs need housing. The confinement barns of the 1990s are what made
    // thousands of head possible; before that it was a pen and a few dozen.
    const barns = state.equipment.filter((i) => equipDef(i.type).species === 'hogs');
    const housed = barns.reduce((n, i) => n + equipDef(i.type).livestockCapacity * (i.count || 1), 0);
    return Math.max(40, housed);
  }
  return Infinity;
}

/** Animal units currently on the place. */
export function livestockUnits(state) {
  let n = 0;
  for (const [id, count] of Object.entries(state.livestock || {})) {
    if (!count) continue;
    // Poultry are not a cow. Weight them by what they actually consume.
    const l = LIVESTOCK[id];
    const weight = id === 'chickens' ? 0.02 : id === 'hogs' ? 0.25 : id === 'sheep' ? 0.2 : 1;
    n += count * weight;
  }
  return n;
}

export function grazingCapacity(state) {
  let acres = 0;
  for (const q of playerQuarters(state.quarters)) {
    // `||` here used to mean "the native-grass fallback only counts when
    // NOTHING is broken" — the moment a single acre of a pasture quarter got
    // broken, workableAcres(q) returned that small nonzero number and the
    // fallback vanished, collapsing a 128-acre pasture to one grazeable acre.
    // forageAcres() takes the greater of the two, which is what was meant.
    if (q.use === 'pasture') acres += forageAcres(q);
  }
  // Roughly two acres of prairie pasture per animal unit for a season, more
  // where there is water to carry them — a drilled well and later a powered
  // pump are what let a farm run stock it could not otherwise water.
  const waterFactor = techEffect(state, 'livestockCapacity', { mode: 'mult', base: 1 }) || 1;
  return (acres / 2.2) * waterFactor;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function landValue(state) {
  const base = landPrice(state.year) * (state.regionDef?.landValueFactor ?? 1);
  let total = 0;
  for (const q of playerQuarters(state.quarters)) {
    total += base * quarterValueFactor(q) * ACRES_PER_QUARTER;
  }
  return total * (state.modifiers?.landMult ?? 1);
}

/**
 * What a machine costs new, in this year's dollars.
 *
 * This is THE price of a machine. Buying one in turn.js, valuing the farm's
 * assets, and the bot deciding whether it can afford an upgrade all call this
 * — because a binder that costs $305 to buy and is valued as though it cost
 * something else is the displayed-versus-resolved drift this codebase exists
 * to avoid.
 */
export function equipmentPrice(state, def) {
  const e = typeof def === 'string' ? equipDef(def) : def;
  return inflate(e.price / (priceIndex(e.priceYear || 1875) / 100), state.year);
}

export function equipmentValue(state) {
  let total = 0;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    // Secondhand, and worn in proportion to its condition.
    total += equipmentPrice(state, e) * conditionFactor(item) * 0.6 * (item.count || 1);
  }
  return total;
}

export function livestockValue(state) {
  let total = 0;
  for (const [id, count] of Object.entries(state.livestock || {})) {
    if (!count) continue;
    total += headPrice(state, id) * count;
  }
  return total;
}

export function headPrice(state, id) {
  const anchors = LIVESTOCK_PRICE_CACHE[id];
  if (!anchors) return 0;
  return interp(anchors, state.year);
}

export function granaryValue(state) {
  let total = 0;
  for (const [cropId, amount] of Object.entries(state.granary || {})) {
    if (!amount) continue;
    const c = CROPS[cropId];
    if (!c || state.year < c.from || state.year > c.to) continue;
    total += cropPrice(cropId, state.year) * amount;
  }
  return total;
}

export function totalDebt(state) {
  // The store account is a real liability even though it carries no interest.
  return (state.debts || []).reduce((sum, d) => sum + d.principal, 0) + (state.storeAccount || 0);
}

/** Interest plus scheduled principal owed this year. */
export function debtService(state) {
  let interest = 0;
  let principal = 0;
  for (const d of state.debts || []) {
    interest += d.principal * d.rate * (state.modifiers?.interestMult ?? 1);
    if (d.termYears > 0) principal += d.principal / Math.max(1, d.termYears - (state.year - d.yearTaken));
  }
  return { interest, principal, total: interest + principal };
}

/**
 * Municipal and school taxes for the year, before whatever relief the era
 * offers. A mill rate on what the land is assessed at — so a farm that buys a
 * quarter and lets it sit pays for the privilege, which is exactly why real
 * farms did not hoard land they could not crop.
 *
 * Single derivation: the ledger charges this and the planning screen shows it.
 */
export function propertyTax(state) {
  return landValue(state) * propertyTaxRate(state.year);
}

export function netWorth(state) {
  return (
    state.cash + landValue(state) + equipmentValue(state) + livestockValue(state) +
    granaryValue(state) - totalDebt(state)
  );
}

/** What a lender will advance, given assets, era and difficulty. */
export function creditLimit(state) {
  const diff = diffDef(state.difficulty);
  const security = landValue(state) + equipmentValue(state) * 0.4;
  let ease = (state.modifiers?.creditEase ?? 1) * (state.backgroundDef?.creditAccess ?? 1);
  // A farm that put its creditors through a write-down does not get looked at
  // properly for years afterwards. That is the price of the relief, and it is
  // why taking it is a decision rather than an obvious yes.
  if (state.creditPenaltyUntil && state.year <= state.creditPenaltyUntil) {
    ease *= 0.55;
  }
  // The Waisenamt lent within the community on its own footing, and did not
  // freeze up when outside credit did. It is not a bigger credit line in
  // ordinary years — `mutualAid` backgrounds carry a LOWER base creditAccess
  // already, reflecting harder access to banks — it is a floor that holds
  // when everyone else's credit is drying up around them.
  if (state.backgroundDef?.mutualAid && ease < 0.85) {
    ease = Math.max(ease, 0.85);
  }
  const limit = security * diff.maxLoanToValue * ease;
  return Math.max(0, limit - totalDebt(state));
}

export function borrowingRate(state) {
  const diff = diffDef(state.difficulty);
  const base = interestRate(state.year) * (state.modifiers?.interestMult ?? 1);
  return Math.max(0.02, base + diff.creditRateSpread);
}

/**
 * Annual household cost in CASH, from family size and the era's standard of
 * living.
 *
 * The subsistence offset matters as much as the headline figure. A farm with a
 * cow, a few hens, a garden and a woodlot fed and warmed itself, and only the
 * difference was ever a cash expense — which is exactly how families lived
 * through years when the grain cheque was nothing. That self-provisioning
 * shrank steadily as the century went on and the household bought what it
 * used to make.
 */
export function livingCost(state) {
  const diff = diffDef(state.difficulty);
  const living = state.family.members.filter((m) => !m.deathYear && !m.away);
  let cost = 0;
  for (const m of living) {
    const age = state.year - m.birthYear;
    // Children cost a farm household very little CASH. They ate what the place
    // grew, wore what was made or handed down, and the difference between a
    // family of three and a family of eight was work done, not money spent.
    const share = age < 6 ? 0.18 : age < 14 ? 0.38 : age < 18 ? 0.6 : 1.0;
    cost += livingCostPerAdult(state.year) * share;
  }
  cost *= diff.livingCostMult * (state.standardOfLiving ?? 1);
  return cost * (1 - subsistenceOffset(state));
}

/** The share of living costs the farm meets out of its own production. */
export function subsistenceOffset(state) {
  // How much a household could provision itself fell steadily: near half in
  // the 1880s, almost nothing by the 1990s.
  // A homestead household in the 1880s bought flour it had not grown, sugar,
  // tea, coal oil, boots, cloth and nails. Nearly everything else it made,
  // grew or did without, and the cash that left the farm in a year was small.
  // That self-provisioning shrank steadily as the century went on.
  const era =
    state.year < 1900 ? 0.58 :
    state.year < 1920 ? 0.50 :
    state.year < 1940 ? 0.40 :
    state.year < 1960 ? 0.26 :
    state.year < 1980 ? 0.15 : 0.07;

  // It has to actually be produced. A farm with no cow, no hens and no
  // woodlot buys its food like anybody else.
  let self = 0;
  const stock = state.livestock || {};
  if ((stock.dairyCow || 0) > 0) self += 0.4;
  if ((stock.chickens || 0) >= 6) self += 0.25;
  if ((stock.hogs || 0) > 0 || (stock.beefCow || 0) > 0) self += 0.2;
  const hasBush = playerQuarters(state.quarters).some((q) => q.use === 'bush');
  if (hasBush) self += 0.15;
  // A garden is assumed on any farm with a family on it.
  self += 0.3;

  return era * clamp(self, 0, 1);
}

export function annualWage(state) {
  return inflateWage(220, state.year);
}

/** What it costs to move a bushel to the elevator and onward. */
export function marketingCostPerBushel(state) {
  const roadFactor = techEffect(state, 'haulCost', { mode: 'mult', base: 1 }) || 1;
  const haul = inflate(0.04, state.year) * (state.haulMiles ?? 14) * 0.02 * roadFactor;
  return freightRate(state.year) * (state.modifiers?.freightMult ?? 1) + haul;
}

// ---------------------------------------------------------------------------
// Summary used by the ledger, the UI and the bot. All three read this, so all
// three see the same farm.
// ---------------------------------------------------------------------------

export function farmSummary(state) {
  const owned = playerQuarters(state.quarters);
  const broken = owned.reduce((s, q) => s + q.brokenAcres, 0);
  const labour = labourForce(state);
  const feed = feedRequired(state);
  return {
    year: state.year,
    quarters: owned.length,
    acresOwned: owned.length * ACRES_PER_QUARTER,
    acresBroken: broken,
    acresCropped: owned
      .filter((q) => !['idle', 'fallow', 'bush', 'pasture'].includes(q.use))
      .reduce((s, q) => s + q.brokenAcres, 0),
    cash: state.cash,
    debt: totalDebt(state),
    netWorth: netWorth(state),
    landValue: landValue(state),
    labourUnits: labour.units,
    draftPower: draftPower(state),
    feedRequired: feed,
    seedCapacity: seasonCapacity(state, 'seed', BASE_SPRING_DAYS).acres,
    harvestCapacity: seasonCapacity(state, 'harvest', BASE_HARVEST_DAYS).acres,
    livestock: { ...state.livestock },
    generation: state.family.generation,
  };
}

// ---------------------------------------------------------------------------

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function interp(anchors, year) {
  if (year <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, v0] = anchors[i];
    const [y1, v1] = anchors[i + 1];
    if (year >= y0 && year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return last[1];
}

// Imported lazily to keep this module's import list from cycling.
import { LIVESTOCK_PRICING } from '../data/livestock.data.js';
const LIVESTOCK_PRICE_CACHE = LIVESTOCK_PRICING;

export { clamp };
