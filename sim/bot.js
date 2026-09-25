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
  farmSummary, bestImplement, bestBreaker, seasonCapacity, labourForce, creditLimit,
  feedRequired, totalDebt, netWorth, equipmentPrice, draftPower, desiredDraftPower, croppableAcres,
  livingCost, debtService, carryingCapacity, livestockUnits, breakableAcres, annualWage,
  techEffect, timelinessFactor, BASE_SPRING_DAYS, BASE_HARVEST_DAYS,
} from '../src/engine/derive.js';
import { playerQuarters, ACRES_PER_QUARTER, quarterById, maxBrokenAcres, forageAcres } from '../src/engine/land.js';
import { cropsAvailable, CROPS, WHEAT_VARIETIES } from '../src/data/crops.data.js';
import { cropPrice, inflate, priceIndex } from '../src/data/prices.data.js';
import { EQUIPMENT, equipmentAvailable } from '../src/data/equipment.data.js';
import { TECHNOLOGIES, techAvailable } from '../src/data/tech.data.js';
import { LIVESTOCK, LIVESTOCK_PRICING } from '../src/data/livestock.data.js';
import { creditSourcesAvailable } from '../src/engine/finance.js';
import { operator, age, heirCandidates, pendingLifeChoices } from '../src/engine/family.js';
import { quarterPurchasePrice } from '../src/engine/turn.js';
import { distanceFromYard } from '../src/engine/land.js';
import { offeredPrograms } from '../src/engine/programs.js';
import { interpAnchors } from '../src/engine/market.js';

/** How the bot answers each of the game's scripted decisions. Fixed, so runs compare. */
export const BOT_CHOICES = {
  landBoom: 'sitTight',       // 1882: does not trade land
  wheatPool: 'signPool',      // 1924: joins the Pool
  lift: 'takeLift',           // 1970: takes the payment
  landRunup: 'expandCareful', // 1979: buys one quarter cash, does not gear up
  crowEnds: 'goCanola',       // 1995: shifts acres rather than building a barn
};

// How the bot answers marriage and coming-of-age, the same way it answers a
// scripted history decision — fixed, and written down, rather than left to
// fall back on whatever advanceFamily() defaults to when nothing is
// supplied. It happens to be the SAME choice either way (`standAside` /
// `letThemDecide` is the fallback), but relying on that silently would mean
// a future change to the fallback quietly retunes the reference player. This
// is what "does not get involved" means for a bot: it neither pushes a match
// nor pays to send anyone to school, which is the closest equivalent to the
// old, choice-less behaviour every balance figure in this game was tuned
// against.
const LIFE_CHOICE_DEFAULT = { marriage: 'standAside', comingOfAge: 'letThemDecide' };

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

  // Marriage and coming-of-age decisions are dynamic — which person, if any,
  // has one pending is different in every run — so unlike BOT_CHOICES this
  // cannot be a fixed table. Same policy every time regardless of who is
  // asking: `opts.lifeChoices` overrides it per person, the same way
  // `opts.choices` overrides a scripted decision, for an ablation that wants
  // to know whether this feature moves anything.
  plan.lifeChoices = {};
  for (const choice of pendingLifeChoices(state)) {
    plan.lifeChoices[choice.personId] =
      opts.lifeChoices?.[choice.personId] ?? LIFE_CHOICE_DEFAULT[choice.kind];
  }
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
  const breaker = bestBreaker(state);
  if (breaker?.canBreakSod) {
    plan.breakAcres = {};
    // Break toward what the outfit can crop, plus a margin so breaking LEADS
    // capacity rather than trailing it — a farm that only breaks what it can
    // already seed never has a reason to buy a bigger plow, and never grows.
    const target = Math.max(20, croppableAcres(state).acres * 1.6);
    let deficit = target - sum.acresBroken;
    for (const q of owned) {
      if (deficit <= 0) break;
      const room = maxBrokenAcres(q) - q.brokenAcres;
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
    const feed = feedRequired(state);
    const hayOnHand = state.granary.hay || 0;
    plan.buyLivestock = {};

    // The household flock and the house cow come first — they are most of what
    // the family lives on. But only if there is feed for them: buying a cow
    // every spring and selling her every November at three-quarters price is
    // a standing loss, and the bot was doing exactly that for decades.
    const canFeed = hayOnHand >= feed.hay || year === 1875;
    if ((state.livestock.chickens || 0) < 10 && cash > 20) {
      plan.buyLivestock.chickens = 12 - (state.livestock.chickens || 0);
    }
    if ((state.livestock.dairyCow || 0) < 1 && cash > reserve * 0.5 && canFeed) {
      plan.buyLivestock.dairyCow = 1;
    }

    // A barn is what lets a farm carry stock through a Manitoba winter, and
    // without one the herd is capped at whatever can live in the yard.
    const hasBarn = state.equipment.some((i) => i.type === 'barn');
    if (!hasBarn && cash > reserve * 2.5) {
      plan.buyEquipment = [...(plan.buyEquipment || []), { type: 'barn', count: 1 }];
    }

    // Beyond the household, only stock the farm can actually winter.
    const room = carryingCapacity(state) - livestockUnits(state);
    if (room > 2 && cash > reserve * 2 && hayOnHand > feed.hay * 1.2) {
      const id = year < 1960 ? 'dairyCow' : 'beefCow';
      const price = interpAnchors(LIVESTOCK_PRICING[id], year);
      const n = Math.floor(Math.min(3, room, (cash - reserve) / Math.max(1, price) / 3));
      if (n > 0) plan.buyLivestock[id] = (plan.buyLivestock[id] || 0) + n;
    }
    if (!Object.keys(plan.buyLivestock).length) delete plan.buyLivestock;
  }

  // --- 6. land --------------------------------------------------------------
  // Only take on ground the outfit can actually work. Land carries taxes and
  // has to be broken before it earns anything, so acquiring more of it than
  // you can crop is a straight drain — the farm pays to own acres it never
  // turns a furrow on.
  // Buying land you cannot break is a straight cost: taxes on ground that
  // grows nothing. Only look for more when most of what you hold is working —
  // OR when the outfit has capacity to spare, which is the modern situation:
  // a combine that will take off 4,000 acres on a 640-acre farm is the reason
  // farms had to get bigger, and a bot that never buys land cannot show it.
  const worked = sum.acresOwned > 0 ? sum.acresBroken / sum.acresOwned : 0;
  const outfit = croppableAcres(state);
  const spareCapacity = outfit.acres > sum.acresBroken * 1.5;
  const wantMoreLand = worked > 0.6 || spareCapacity;

  const open = wantMoreLand ? state.quarters.find((q) => !q.owner && q.tenure === 'homestead') : null;
  if (open && cash > 60 && owned.length < 12) {
    plan.fileHomestead = open.id;
  } else if (!opts.noExpand && (wantMoreLand || opts.aggressive) && cash > reserve * (opts.aggressive ? 0.8 : 3)) {
    // Only ground actually on the market: a quarter a neighbour has put up,
    // or company land while the railway still holds any.
    const forSale = state.quarters
      .filter((q) => q.owner !== 'player' && q.owner !== null &&
        (q.forSale || q.owner === 'railway' || q.owner === 'school'))
      .map((q) => ({
        q,
        price: quarterPurchasePrice(state, q),
        miles: distanceFromYard(state, q),
        // What an acre of THIS quarter would actually yield, distance and all.
        timeliness: timelinessFactor(state, q),
      }))
      .filter((x) => x.price < (cash - reserve) * 0.8);

    if (forSale.length) {
      // Cheapest per USABLE acre, not cheapest outright. A quarter three miles
      // out behind a team grows a fifth less than the one across the road, and
      // buying on sticker price alone is how a farm ends up scattered across a
      // township it cannot work.
      if (opts.ignoreDistance) forSale.sort((a, b) => a.price - b.price);
      else forSale.sort((a, b) => (a.price / a.timeliness) - (b.price / b.timeliness));
      plan.buyLand = [forSale[0].q.id];
    }
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
    // Total debt, not just this year's service, has to stay in proportion to
    // what the farm earns. Credit limits are set against ASSETS, so a farm that
    // buys machinery becomes creditworthy for sums its crop cannot retire —
    // and borrows them, one manageable year at a time. Measured across 150
    // runs, a mechanising farm borrowed $374,000 against $57,000 for one that
    // never bought a machine, and died ten years sooner carrying it.
    //
    // Two times gross is roughly where farm lenders have always drawn the line.
    const debtToGross = gross > 0 ? totalDebt(state) / gross : Infinity;
    const geared = debtToGross > (opts.aggressive ? 4 : 2);
    if (service < gross * serviceCeiling && !geared) {
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
  //
  // A real farm hired to match its acres, and that is the point: wages are a
  // FIXED cost that falls due whether or not the crop comes. Capped at a
  // single hand, the reference player spent under two per cent of gross on
  // labour for a century — a 500-acre farm in 1910 running on the family
  // alone — and the farm had almost no operating leverage, which is most of
  // why a bad year could not finish it. Hiring properly buys capacity AND the
  // exposure that goes with it.
  //
  // How many acres one worker covers rises with the machinery: about 90 behind
  // horses, several hundred behind a tractor and a combine.
  const labour = labourForce(state);
  const perWorker = Math.max(
    90,
    Math.min(bestImplement(state, 'seed')?.capacity ?? 0, bestImplement(state, 'harvest')?.capacity ?? 0) * 14
  );
  const shortfall = sum.acresCropped / perWorker - labour.family;
  const wage = annualWage(state);
  // Hire what the acres need, and only as many as the year can pay for.
  const affordable = Math.max(0, (cash - reserve) / Math.max(1, wage * 1.5));
  plan.hiredHands = Math.max(0, Math.min(Math.round(shortfall), Math.floor(affordable), 6));

  // --- 10. government programs ----------------------------------------------
  // Free or cost-shared money with no strings is simply taken. Debt review is
  // not: it writes a third of the debt off and costs six years of credit, so
  // the bot only reaches for it when the farm is genuinely going under.
  if (!opts.noPrograms) {
    const offers = offeredPrograms(state, { yieldRatio: state.yearYieldRatio ?? 1 });
    for (const { program: p, ok } of offers) {
      if (!ok) continue;
      if (p.id === 'debtReview') {
        const desperate = (state.distressYears || 0) >= 2 && totalDebt(state) > netWorth(state) * 0.5;
        if (!desperate) continue;
      }
      if (p.id === 'pfra' && cash < reserve * 1.5) continue;
      if (p.id === 'safetyNet' && cash < reserve) continue;
      plan.takeUpPrograms = [...(plan.takeUpPrograms || []), p.id];
      break; // one a year is plenty of paperwork
    }
  }

  // --- 11. an approach to the worst field ------------------------------------
  // Cheap, local, and it is the difference between a quarter you can get a
  // machine into and one you cannot.
  if (!opts.noRoads && cash > reserve * 1.6) {
    const worst = playerQuarters(state.quarters)
      .filter((q) => q.brokenAcres > 1 && (q.roadImprovement || 0) < 1)
      .map((q) => ({ q, loss: 1 - timelinessFactor(state, q) }))
      .sort((a, b) => b.loss - a.loss)[0];
    if (worst && worst.loss > 0.08) {
      plan.roadWorks = [{ quarterId: worst.q.id, kind: year >= 1920 ? 'gravelPetition' : 'approach' }];
    }
  }

  // --- 12. a will -----------------------------------------------------------
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
  // What the implements on the place could actually put to work — every crew
  // seasonCapacity() would hitch a hand to, not just the one biggest plow.
  // Read from a single implement's own draftNeeded, this stopped buying the
  // moment the farm's FIRST team could pull its best machine, which left a
  // farm with three drills and three hands still running only one of them —
  // the same stale ceiling desiredDraftPower() replaced in phaseWinter's
  // surplus-sale, for the same reason.
  const needed = desiredDraftPower(state);
  // Enough power to crew all of it, with a working margin. More than that is
  // animals eating oats for nothing.
  if (needed === 0 || draft >= needed * 1.05) return null;

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
  const sum = farmSummary(state);
  const base = croppableAcres(state);
  const candidates = [];

  // Capacity is only worth what there is ground to use it on — a combine that
  // could take off four thousand acres is worth nothing to a farm with three
  // hundred broken. But "ground" means land the farm OWNS, not land it has
  // already broken.
  //
  // Valuing it against broken acres alone created a deadlock: breaking is
  // limited by machine capacity, and machine upgrades were valued by acres
  // already broken, so each capped the other. Farms sat on 960 owned acres
  // with 150 broken for decades, paying taxes on land they never touched.
  const breakRate = breakableAcres(state).acres;
  const reachable = Math.min(sum.acresOwned, sum.acresBroken + breakRate * 4);
  const usable = Math.max(20, reachable);
  const effective = (c) => Math.min(c.acres, usable);

  // Anything that performs field work, plus power to pull it — including a
  // second unit of something already owned, which now crews as its own
  // implement given a spare hand and a spare team (seasonCapacity, in
  // derive.js). This used to skip anything owned in good condition outright,
  // back when a farm's second seed drill added nothing but idle iron; the
  // gain test below is what actually decides it now, so the guard would only
  // hide real candidates from a farm with hands to spare.
  for (const def of equipmentAvailable(year)) {
    const isField = ['till', 'seed', 'harvest'].includes(def.operation);
    const isPower = def.category === 'power';
    if (!isField && !isPower) continue;

    const price = estimatePrice(state, def);
    if (price > budget) continue;

    const withIt = croppableAcres(state, def.id);
    const gain = effective(withIt) - effective(base);
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
  // An implement note is secured on the implement, so it does not depend
  // entirely on what the land will carry.
  const room = Math.max(creditLimit(state), 80);
  // Same rule as the operating loan: a note is still debt.
  const sum0 = farmSummary(state);
  const grossNow = estimateGrossIncome(state, sum0);
  if (grossNow > 0 && totalDebt(state) / grossNow > 2) return null;

  let best = null;
  for (const def of equipmentAvailable(state.year)) {
    if (!['till', 'seed', 'harvest'].includes(def.operation)) continue;
    const price = estimatePrice(state, def);
    // A cheap implement that restores a collapsed capacity is worth a note
    // even when the books are tight: without the plow there is no crop, and
    // without a crop there is no way out. The old ceiling of six times cash
    // left farms unable to replace a fifty dollar plow and simply winding down.
    const ceiling = Math.max(cash * 6, room + cash, 60);
    if (price > ceiling) continue;
    const sum2 = farmSummary(state);
    const usableNow = Math.max(20, Math.min(
      sum2.acresOwned, sum2.acresBroken + breakableAcres(state).acres * 4));
    const gain = Math.min(croppableAcres(state, def.id).acres, usableNow) -
                 Math.min(base.acres, usableNow);
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
  // How much summerfallow the farm still needs is a property of the chemistry
  // it has, read from the technology table rather than hardcoded against two
  // specific herbicide names.
  const fallowRelief = Math.abs(techEffect(state, 'fallowNeed', { mode: 'min', base: 0 }));
  const needsFallow = fallowRelief < 0.5;
  const horses = state.equipment.find((i) => i.type === 'horses' || i.type === 'oxen');
  const hasSwather = state.equipment.some((i) => i.type === 'swather');

  const cropped = owned.filter((q) => q.brokenAcres >= 1);
  const totalAcres = cropped.reduce((t, q) => t + q.brokenAcres, 0);

  // How much FEED the farm actually has to grow, in acres.
  //
  // Sized from the feed requirement, not from a head count: counting a dozen
  // hens as "twelve stock" put the farm's only quarter into hay and left it
  // with no grain to sell for five years running.
  const feed = feedRequired(state);
  const hayYield = 1.4;
  const hayNeeded = feed.hay / hayYield;
  // Scaled against totalAcres so a big farm's hay quota does not eat all its
  // cropland — but totalAcres is broken acreage, and a brand-new homestead has
  // none. Capping hay need at totalAcres*0.3 made it zero in the farm's first
  // year regardless of how much feed the oxen and chickens actually needed,
  // which is the same bug from the other side: the bot never asked for hay
  // ground until it already had crop ground to compare it against.
  let hayAcres = totalAcres > 0 ? Math.min(hayNeeded, totalAcres * 0.3) : hayNeeded;
  if (hayAcres < 1 && feed.hay > 0) {
    hayAcres = totalAcres > 0 ? Math.min(4, totalAcres * 0.25) : Math.min(4, hayNeeded);
  }

  let cashCrop = 'wheat';
  if (!opts.noDiversify && available.has('canola') && hasSwather) cashCrop = 'canola';

  // Oats for the teams: horses eat about 55 bushels a year each.
  const teams = state.equipment
    .filter((i) => i.type === 'horses' || i.type === 'oxen')
    .reduce((n, i) => n + (i.count || 1), 0);
  const oatsBushels = teams * 55 * 2;
  let oatAcres = Math.min(oatsBushels / 30, totalAcres * 0.25);

  let hayLeft = hayAcres;
  let oatLeft = horses ? oatAcres : 0;
  let i = 0;

  // Work the near ground hardest. The cash crop wants timely seeding and a
  // timely harvest and loses most by not getting them; hay and pasture do not
  // care how far away they are, so they go on the back quarters. This is the
  // ordinary logic of a farm with distance in it, and without it the bot
  // cannot show whether distance matters.
  const byDistance = [...owned].sort(
    (a, b) => distanceFromYard(state, a) - distanceFromYard(state, b)
  );

  for (const q of byDistance) {
    if (q.brokenAcres < 1) {
      // Unbroken ground still grows grass. A settler cut wild hay off the
      // yard quarter the same summer a strip of it went under the plow for
      // next year's wheat — the two are not in competition, since breaking
      // is its own pass later in the season regardless of this year's `use`.
      if (hayLeft > 0) {
        use[q.id] = 'hay';
        hayLeft -= forageAcres(q);
      } else {
        use[q.id] = 'idle';
      }
      i++;
      continue;
    }
    let pick;

    // Far ground that loses a lot to distance goes to grass rather than grain.
    //
    // NEVER the nearest quarter, whatever the arithmetic says. `byDistance` is
    // sorted, so `i > 0` means there is closer ground than this; without that
    // guard a farm with one broken field could put its whole place into
    // pasture — `timelinessFactor` folds in capacity as well as distance, so a
    // small outfit on its own home quarter reads as "far" — and seed 108 did
    // exactly that, grazing its only field for fifteen years, never growing a
    // bushel, and going under owing money it had no crop to pay with.
    const lostToDistance = opts.ignoreDistance ? 0 : 1 - timelinessFactor(state, q);
    if (i > 0 && lostToDistance > 0.18 && hayLeft > 0) {
      use[q.id] = 'pasture';
      hayLeft -= q.brokenAcres * 0.5;
      i++;
      continue;
    }

    // Feed first, in whole fields, smallest commitment that covers it.
    //
    // THE ROTATION HAS TO TURN. Written as `i % 3 === 2` against a list sorted
    // by distance — which is the same order every year — the third quarter out
    // was summerfallowed every single year and the first two grew wheat on
    // wheat for a century. The farm fallowed a quarter of its acres and got
    // none of the benefit: 95% of its wheat followed wheat, and the rotation
    // penalty sat at a permanent 25% in every era. Phasing by the year is what
    // makes each field take its turn, which is what summerfallow WAS.
    const phase = i + year;
    const lastCrop = (q.cropHistory || []).slice(-1)[0];
    if (hayLeft >= q.brokenAcres * 0.5) { pick = 'hay'; hayLeft -= q.brokenAcres; }
    else if (oatLeft >= q.brokenAcres * 0.5) { pick = 'oats'; oatLeft -= q.brokenAcres; }
    else if (needsFallow && phase % 3 === 2) pick = 'fallow';
    else if (!opts.noDiversify && phase % 4 === 3 && available.has('barley')) pick = 'barley';
    else pick = cashCrop;

    // Never follow a crop with itself when there is anything else to sow. The
    // rotation index handles the general case; this catches the quarters the
    // feed and distance rules pulled out of sequence.
    if (pick === lastCrop && pick !== 'fallow' && pick !== 'pasture') {
      const alt = pick === cashCrop
        ? (needsFallow ? 'fallow' : available.has('barley') ? 'barley' : pick)
        : cashCrop;
      if (available.has(alt) || alt === 'fallow') pick = alt;
    }

    use[q.id] = available.has(pick) ? pick : 'wheat';
    i++;
  }
  return use;
}
