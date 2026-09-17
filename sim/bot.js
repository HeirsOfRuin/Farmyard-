// The reference player.
//
// This bot does not need to play WELL. It needs to play CONSISTENTLY, because
// that is what makes two runs comparable — and comparing runs is the only way
// to tell whether a difficulty tier, a subsystem or a rebalance actually did
// anything. A bot that played brilliantly but differently each time would be
// useless for this.
//
// Its policy is deliberately plain and written down here in full: break land
// when you can, keep a rotation, buy the implement that is holding you back,
// borrow only against a clear need, keep some livestock, and write a will when
// the operator gets old.

import {
  farmSummary, bestImplement, seasonCapacity, labourForce, creditLimit,
  feedRequired, totalDebt, netWorth, equipmentPrice, draftPower, croppableAcres,
  livingCost, debtService, BASE_SPRING_DAYS, BASE_HARVEST_DAYS,
} from '../src/engine/derive.js';
import { playerQuarters, ACRES_PER_QUARTER, quarterById } from '../src/engine/land.js';
import { cropsAvailable, CROPS, WHEAT_VARIETIES } from '../src/data/crops.data.js';
import { cropPrice, inflate, priceIndex } from '../src/data/prices.data.js';
import { EQUIPMENT, equipmentAvailable } from '../src/data/equipment.data.js';
import { TECHNOLOGIES, techAvailable } from '../src/data/tech.data.js';
import { LIVESTOCK, LIVESTOCK_PRICING } from '../src/data/livestock.data.js';
import { creditSourcesAvailable } from '../src/engine/finance.js';
import { operator, age, heirCandidates } from '../src/engine/family.js';
import { quarterPurchasePrice } from '../src/engine/turn.js';
import { interpAnchors } from '../src/engine/market.js';

/** How the bot answers each of the game's scripted decisions. Fixed, so runs compare. */
export const BOT_CHOICES = {
  landBoom: 'sitTight',       // 1882: does not trade land
  wheatPool: 'signPool',      // 1924: joins the Pool
  lift: 'takeLift',           // 1970: takes the payment
  landRunup: 'expandCareful', // 1979: buys one quarter cash, does not gear up
  crowEnds: 'goCanola',       // 1995: shifts acres rather than building a barn
};

/**
 * What the farm must keep in the account to put next year's crop in and keep
 * the household going. Everything above this is genuinely spare.
 */
function requiredReserve(state, sum) {
  const seedCost = sum.acresCropped * seedCostPerAcre(state);
  const household = livingCost(state);
  const service = debtService(state).total;
  // A margin, because the point of a reserve is the year that goes wrong.
  return (seedCost + household + service) * 1.25;
}

/** Roughly what the farm will gross, used to size what it can safely service. */
function estimateGrossIncome(state, sum) {
  const perAcre = CROPS.wheat.yieldBase * 0.8 * cropPrice('wheat', state.year);
  return Math.max(30, sum.acresCropped * perAcre * 0.65);
}

function equipmentPriceLike(state, cost, costYear) {
  return inflate(cost / (priceIndex(costYear || 1875) / 100), state.year);
}

function seedCostPerAcre(state) {
  // Wheat is the reference: seed rate times the price of the grain itself.
  const c = CROPS.wheat;
  return c.seedRate * cropPrice('wheat', state.year) * 1.2;
}

export function makePlan(state, opts = {}) {
  // Choice policy is overridable so a variant bot can be run against the
  // baseline — that is how you find out whether a decision in the game
  // actually matters, rather than asserting that it does.
  const plan = { choiceResponse: { ...BOT_CHOICES, ...(opts.choices || {}) } };
  const sum = farmSummary(state);
  const owned = playerQuarters(state.quarters);
  const cash = state.cash;
  const year = state.year;

  // The cash reserve is what a careful farmer keeps back: next spring's seed,
  // the household's cash needs, and a year's debt service. Spending below this
  // line is how a farm ends up unable to put a crop in, which is the one
  // mistake there is no recovering from inside a single season.
  const reserve = requiredReserve(state, sum);

  // --- 1. keep the outfit able to work the acres it has ---------------------
  // Draft power comes first and comes before the cash reserve. A farm with no
  // team is not a farm that is saving money, it is a farm that has stopped,
  // and replacing a dead ox is not an optional upgrade.
  if (!opts.noMechanize) {
    const power = restorePowerPurchase(state, cash);
    if (power) {
      plan.buyEquipment = [{ type: power.type, count: 1 }];
    } else {
      const upgrade = findBottleneckUpgrade(state, cash - reserve);
      if (upgrade) {
        plan.buyEquipment = [{ type: upgrade.type, count: 1 }];
      } else {
        // Nothing affordable outright — try it on a dealer note.
        const onTime = creditPurchase(state, cash);
        if (onTime) {
          const need = Math.max(0, onTime.price - (cash - reserve * 0.3));
          if (need > 0) plan.loans = [{ amount: Math.ceil(need), sourceId: onTime.sourceId, termYears: onTime.term }];
          plan.buyEquipment = [{ type: onTime.type, count: 1 }];
        }
      }
    }
  }

  // --- 2. break new ground --------------------------------------------------
  const breaker = bestImplement(state, 'till');
  if (breaker?.canBreakSod) {
    plan.breakAcres = {};
    // Break toward what the outfit can actually crop, plus a little, so
    // breaking leads capacity rather than chasing a number it cannot work.
    const target = Math.max(20, croppableAcres(state).acres * 1.25);
    let deficit = target - sum.acresBroken;
    for (const q of owned) {
      if (deficit <= 0) break;
      const room = ACRES_PER_QUARTER - q.brokenAcres;
      if (room <= 1) continue;
      const take = Math.min(room, deficit, 45);
      plan.breakAcres[q.id] = take;
      deficit -= take;
    }
  }

  // --- 3. assign the fields -------------------------------------------------
  plan.fieldUse = chooseRotation(state, owned, opts);

  // --- 4. seed variety ------------------------------------------------------
  const bestVar = [...WHEAT_VARIETIES].filter((v) => v.from <= year).pop();
  if (bestVar && bestVar.id !== state.wheatVariety) plan.setVariety = bestVar.id;

  // --- 5. livestock ---------------------------------------------------------
  if (!opts.noLivestock) {
    const stockUnits = Object.values(state.livestock).reduce((s, v) => s + v, 0);
    const feed = feedRequired(state);
    const hayOnHand = state.granary.hay || 0;
    plan.buyLivestock = {};

    // The household flock and the house cow come first. They cost almost
    // nothing, they eat very little, and between them they are most of what
    // the family lives on — which is worth far more than what they would
    // fetch if sold to cover a bill.
    if ((state.livestock.chickens || 0) < 10 && cash > 20) {
      plan.buyLivestock.chickens = 12 - (state.livestock.chickens || 0);
    }
    if ((state.livestock.dairyCow || 0) < 1 && cash > reserve * 0.5) {
      plan.buyLivestock.dairyCow = 1;
    }

    // Beyond the household, only stock the farm can actually winter.
    if (stockUnits < 30 && cash > reserve * 2 && hayOnHand > feed.hay * 1.2) {
      const id = year < 1960 ? 'dairyCow' : 'beefCow';
      const price = interpAnchors(LIVESTOCK_PRICING[id], year);
      const n = Math.floor(Math.min(3, (cash - reserve) / Math.max(1, price) / 3));
      if (n > 0) plan.buyLivestock[id] = (plan.buyLivestock[id] || 0) + n;
    }
    if (!Object.keys(plan.buyLivestock).length) delete plan.buyLivestock;
  }

  // --- 6. land --------------------------------------------------------------
  // Only take on ground the outfit can actually work. Land carries taxes and
  // has to be broken before it earns anything, so acquiring more of it than
  // you can crop is a straight drain — the farm pays to own acres it never
  // turns a furrow on.
  const capacity = croppableAcres(state);
  const roomToGrow = sum.acresBroken < capacity.acres * 1.4;
  const nearlyFull = sum.acresBroken > sum.acresOwned * 0.55;
  const wantMoreLand = !roomToGrow || nearlyFull;

  const open = wantMoreLand ? state.quarters.find((q) => !q.owner && q.tenure === 'homestead') : null;
  if (open && cash > 60 && owned.length < 12) {
    plan.fileHomestead = open.id;
  } else if (!opts.noExpand && (wantMoreLand || opts.aggressive) && cash > reserve * (opts.aggressive ? 0.8 : 3)) {
    // Only ground actually on the market: a quarter a neighbour has put up,
    // or company land while the railway still holds any.
    const forSale = state.quarters
      .filter((q) => q.owner !== 'player' && q.owner !== null &&
        (q.forSale || q.owner === 'railway' || q.owner === 'school'))
      .map((q) => ({ q, price: quarterPurchasePrice(state, q) }))
      .filter((x) => x.price < (cash - reserve) * 0.8)
      .sort((a, b) => a.price - b.price);
    if (forSale.length) plan.buyLand = [forSale[0].q.id];
  }

  // An operator who believes land only goes up borrows to buy it. This is not
  // the baseline policy — it exists so the cost of that belief can be measured
  // against the careful one, in 1920 and in 1981.
  const boomYears = (y) => (y >= 1880 && y <= 1883) || (y >= 1906 && y <= 1920) ||
    (y >= 1973 && y <= 1982);
  if (opts.aggressive && boomYears(year) && !plan.buyLand && creditLimit(state) > 500) {
    const onMarket = state.quarters
      .filter((q) => q.owner !== 'player' && q.owner !== null && (q.forSale || q.owner === 'railway'))
      .map((q) => ({ q, price: quarterPurchasePrice(state, q) }))
      .sort((a, b) => a.price - b.price);
    if (onMarket.length) {
      const target = onMarket[0];
      const need = Math.max(0, target.price - cash * 0.5);
      const sources = creditSourcesAvailable(state);
      const src = sources.find((x) => x.maxTerm >= 10) || sources[0];
      if (src && need > 0 && need < creditLimit(state)) {
        plan.loans = [...(plan.loans || []), { amount: Math.ceil(need), sourceId: src.id, termYears: src.maxTerm }];
        plan.buyLand = [target.q.id];
      }
    }
  }

  // --- 7. technology --------------------------------------------------------
  if (!opts.noTech) {
    const wanted = ['wellAndPump', 'summerfallowRotation', 'manureSpreading', 'grainElevator',
      'commercialFertilizer', 'herbicide24D', 'cropInsurance', 'ruralElectrification',
      'anhydrousAmmonia', 'modernHerbicide', 'onFarmStorage', 'zeroTill'];
    for (const id of wanted) {
      if (state.technologies.includes(id)) continue;
      const t = TECHNOLOGIES[id];
      if (!t || year < t.from) continue;
      if (t.requires && !state.technologies.includes(t.requires)) continue;
      if (t.requiresImplement && !state.equipment.some((i) => i.type === t.requiresImplement)) continue;
      if (t.requiresLivestock && Object.values(state.livestock).reduce((s, v) => s + v, 0) === 0) continue;
      // Only out of genuinely spare cash. A well is worth having; a well
      // bought with the seed money is not.
      const cost = t.cost ? equipmentPriceLike(state, t.cost, t.costYear) : 0;
      const perAcre = (t.costPerAcre || 0) * sum.acresCropped;
      if (cost + perAcre > Math.max(0, cash - reserve)) continue;
      plan.adoptTech = [id];
      break;
    }
  }

  // --- 8. credit ------------------------------------------------------------
  // Borrow only to cover a real shortfall, only what the tier allows, and only
  // while existing debt service is still a sane share of what the farm earns.
  // A farm servicing more than about a third of its gross is already in the
  // spiral, and lending it more is not a rescue.
  if (!opts.noCredit && cash < reserve * 0.4 && !plan.loans) {
    const gross = estimateGrossIncome(state, sum);
    const service = debtService(state).total;
    const serviceCeiling = opts.aggressive ? 0.75 : 0.33;
    if (service < gross * serviceCeiling) {
      const sources = creditSourcesAvailable(state);
      const src = sources.find((x) => x.maxTerm >= 5) || sources[0];
      const limit = creditLimit(state);
      const want = Math.min(limit * 0.4, reserve - cash, gross * 0.5);
      if (src && want > 20) {
        plan.loans = [{ amount: Math.floor(want), sourceId: src.id, termYears: src.maxTerm }];
      }
    }
  }

  // --- 9. hired help --------------------------------------------------------
  const labour = labourForce(state);
  const acresPerHand = sum.acresCropped / Math.max(0.5, labour.units);
  plan.hiredHands = acresPerHand > 90 && cash > reserve * 2 ? 1 : 0;

  // --- 10. a will -----------------------------------------------------------
  // The bot always writes one. A human player usually will not, and the
  // difference between those two behaviours is worth measuring.
  const op = operator(state);
  if (!opts.noWill && op && age(year, op) >= 55 && !state.family.will) {
    const heirs = heirCandidates(state).filter((h) => h.id !== op.id);
    if (heirs.length) plan.writeWill = heirs[0].id;
  }

  return plan;
}

/**
 * Is the farm short of the power to pull what it owns? If so, buy the cheapest
 * thing that will pull it, dipping into the reserve if it has to.
 */
function restorePowerPurchase(state, cash) {
  const draft = draftPower(state);
  // What the implements on the place actually need to work at full rate.
  let needed = 0;
  for (const op of ['till', 'seed', 'harvest']) {
    const impl = bestImplement(state, op);
    if (impl && !impl.byHand) needed = Math.max(needed, impl.draftNeeded || 0);
  }
  if (needed === 0 || draft >= needed * 0.75) return null;

  const options = equipmentAvailable(state.year, 'power')
    .map((d) => ({ type: d.id, price: equipmentPrice(state, d), draft: d.draft }))
    .filter((o) => o.price <= cash)
    .sort((a, b) => a.price / Math.max(0.1, a.draft) - b.price / Math.max(0.1, b.draft));
  return options[0] || null;
}

/**
 * The purchase that would put the most extra acres into crop per dollar.
 *
 * Measured by asking the ENGINE what the farm could crop with and without the
 * machine, rather than comparing rated capacities. A seed drill that doubles
 * seeding is worth nothing when the plow is the constraint, and only the
 * combined figure knows that.
 */
function findBottleneckUpgrade(state, budget) {
  if (budget <= 0) return null;
  const year = state.year;
  const base = croppableAcres(state);
  const candidates = [];

  // Anything that performs field work, plus power to pull it. Machines the
  // farm already owns are included only if worn out — a plow at 10% is not
  // the plow you bought.
  for (const def of equipmentAvailable(year)) {
    const isField = ['till', 'seed', 'harvest'].includes(def.operation);
    const isPower = def.category === 'power';
    if (!isField && !isPower) continue;
    const owned = state.equipment.find((i) => i.type === def.id);
    if (owned && (owned.condition ?? 1) > 0.3) continue;

    const price = estimatePrice(state, def);
    if (price > budget) continue;

    const withIt = croppableAcres(state, def.id);
    const gain = withIt.acres - base.acres;
    if (gain <= 0.5) continue;
    candidates.push({ type: def.id, gain, price, op: def.operation || 'power' });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.gain / Math.max(1, b.price) - a.gain / Math.max(1, a.price));
  return candidates[0];
}

/**
 * Would this machine pay for itself on credit?
 *
 * This is why the implement dealer note existed. A homesteader with no cash
 * and a walking plow could not save their way to a sulky plow out of the crop
 * a walking plow grows — the note was how they broke out of it, and buying
 * machinery on time was near universal.
 */
function creditPurchase(state, cash) {
  const base = croppableAcres(state);
  const sources = creditSourcesAvailable(state);
  const dealer = sources.find((x) => x.id === 'dealer') || sources.find((x) => x.maxTerm >= 3);
  if (!dealer) return null;
  const room = creditLimit(state);
  if (room < 20) return null;

  let best = null;
  for (const def of equipmentAvailable(state.year)) {
    if (!['till', 'seed', 'harvest'].includes(def.operation)) continue;
    const owned = state.equipment.find((i) => i.type === def.id);
    if (owned && (owned.condition ?? 1) > 0.3) continue;
    const price = estimatePrice(state, def);
    if (price > room + cash || price > cash * 6) continue;
    const gain = croppableAcres(state, def.id).acres - base.acres;
    if (gain < 8) continue; // only worth a note if it changes the farm materially
    const score = gain / Math.max(1, price);
    if (!best || score > best.score) best = { type: def.id, price, gain, score, sourceId: dealer.id, term: dealer.maxTerm };
  }
  return best;
}

// The bot uses the engine's own price function, not its own copy of the
// arithmetic. If the two ever disagreed, the bot would be buying machinery at
// a price the engine does not charge and every balance number would be wrong.
const estimatePrice = (state, def) => equipmentPrice(state, def);

/**
 * A plain rotation. Not optimal — consistent. Wheat is the money crop, oats
 * feed the teams, and summerfallow is what weed control looked like before
 * herbicide, so the bot drops it once herbicide arrives.
 */
function chooseRotation(state, owned, opts = {}) {
  const year = state.year;
  const use = {};
  const available = new Set(cropsAvailable(year).map((c) => c.id));
  const hasHerbicide = state.technologies.includes('herbicide24D') || state.technologies.includes('modernHerbicide');
  const needsFallow = !hasHerbicide;
  const stockUnits = Object.values(state.livestock).reduce((s, v) => s + v, 0);
  const horses = state.equipment.find((i) => i.type === 'horses' || i.type === 'oxen');
  const hasSwather = state.equipment.some((i) => i.type === 'swather');

  // The money crop of the era.
  let cashCrop = 'wheat';
  if (!opts.noDiversify && available.has('canola') && hasSwather) cashCrop = 'canola';

  let i = 0;
  for (const q of owned) {
    if (q.brokenAcres < 1) { use[q.id] = 'idle'; continue; }
    const cycle = i % (needsFallow ? 3 : 4);
    let pick;
    if (needsFallow && cycle === 2) pick = 'fallow';
    else if ((horses || stockUnits > 0) && cycle === 1) pick = 'oats';
    else if (cycle === 3) pick = available.has('barley') ? 'barley' : 'wheat';
    else pick = cashCrop;

    // Keep enough hay and pasture to winter the stock that is actually here.
    if (stockUnits > 6 && i === 0) pick = 'hay';
    if (stockUnits > 18 && i === 1) pick = 'pasture';

    use[q.id] = available.has(pick) ? pick : 'wheat';
    i++;
  }
  return use;
}
