// Selling what the farm made.
//
// A bushel in the bin is not money. It has to be hauled, graded, freighted and
// sold, and between 1875 and 2000 every one of those steps changed hands
// several times — from the line elevator that set its own grades, to the Pool,
// to a compulsory Wheat Board paying an initial price at delivery, and finally
// to freight rates that doubled overnight when the Crow rate ended in 1995.

import { CROPS, crop as cropDef } from '../data/crops.data.js';
import { cropPrice, freightRate, inflate } from '../data/prices.data.js';
import { LIVESTOCK, PRODUCT_PRICING } from '../data/livestock.data.js';
import { equipment as equipDef } from '../data/equipment.data.js';
import { marketingCostPerBushel, clamp, techEffect } from './derive.js';

/** Total bushels of storage on the place. */
export function storageCapacity(state) {
  let cap = 0;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    if (e.storage) cap += e.storage * (item.count || 1);
  }
  return cap;
}

/** Average spoilage rate of the storage actually on hand. */
export function spoilRate(state) {
  let weighted = 0;
  let total = 0;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    if (!e.storage) continue;
    const cap = e.storage * (item.count || 1);
    weighted += (e.spoilRate ?? 0.03) * cap;
    total += cap;
  }
  // Grain with no bin to go in sits in a pile under a tarp and does worse.
  return total > 0 ? weighted / total : 0.09;
}

/**
 * The price a farm actually realises for a bushel — after grade, after the
 * era's marketing institution takes its cut or gives its bonus, and after
 * freight and haulage.
 */
export function realisedPrice(state, cropId, { gradeFactor = 1 } = {}) {
  const c = CROPS[cropId];
  if (!c || state.year < c.from || state.year > c.to) return 0;
  let price = cropPrice(cropId, state.year);

  price *= state.modifiers?.priceMult ?? 1;
  price *= clamp(gradeFactor, 0.35, 1.05);

  // The line elevator's dockage and grade, before farmers had any recourse.
  if (state.year < 1901) price *= 0.93;
  if (state.modifiers?.gradingPenalty) price *= 1 - state.modifiers.gradingPenalty;

  // The Pool paid a pooled average and a patronage dividend back to members.
  if (state.flags.joinedPool && state.year >= 1925 && state.year <= 1931) {
    price *= 1 + techEffect(state, 'priceBonus', { mode: 'max', base: 0.04 });
  }
  if (techEffect(state, 'patronageDividend', { mode: 'max' })) {
    // The co-op returns a share of its margin to the people who shipped through it.
    price *= 1.02;
  }

  // The operator's own judgement counts for something, and so does knowing what
  // the market did this morning instead of when you get to town.
  if (state.operatorTraits?.includes('shrewd')) price *= 1.06;
  price *= 1 + techEffect(state, 'marketInfo', { mode: 'max' }) * 0.12;

  // The Board's initial payment at delivery is not a higher price, it is a
  // knowable one — the swing comes off both ends.
  if (techEffect(state, 'initialPayment', { mode: 'max' }) && state.flags.compulsoryBoard) {
    price = price * 0.98 + cropPrice(cropId, state.year) * 0.02;
  }

  // Freight and haulage come off the top, per bushel, always.
  const marketing = c.category === 'grain' || c.category === 'oilseed'
    ? marketingCostPerBushel(state)
    : inflate(0.03, state.year);

  return Math.max(0.01, price - marketing);
}

/**
 * Sell grain out of the granary.
 * `orders` is { cropId: amount | 'all' }. Returns the proceeds and a per-crop
 * breakdown for the ledger.
 */
export function sellGrain(state, orders, { gradeFactor = 1 } = {}) {
  const lines = [];
  let proceeds = 0;
  for (const [cropId, want] of Object.entries(orders || {})) {
    const have = state.granary[cropId] || 0;
    if (have <= 0) continue;
    const c = CROPS[cropId];
    if (!c || state.year < c.from || state.year > c.to) {
      // The market for this crop no longer exists — sugar beets after the
      // refinery closed. The player is told, not silently zeroed.
      lines.push({ cropId, amount: 0, price: 0, gross: 0, refused: true,
        reason: `There is no longer a market for ${c ? c.name.toLowerCase() : cropId}.` });
      continue;
    }
    const amount = want === 'all' ? have : Math.min(have, want);
    if (amount <= 0) continue;
    const price = realisedPrice(state, cropId, { gradeFactor });
    const gross = price * amount;
    state.granary[cropId] = have - amount;
    proceeds += gross;
    lines.push({ cropId, name: c.name, amount, price, gross, unit: c.unit });
  }
  state.cash += proceeds;
  return { proceeds, lines };
}

/** Income from animals: milk, eggs, calves, market hogs, wool. */
export function livestockIncome(state, rng) {
  const lines = [];
  let total = 0;
  const stockman = state.operatorTraits?.includes('stockman');

  for (const [id, count] of Object.entries(state.livestock || {})) {
    if (!count) continue;
    const l = LIVESTOCK[id];
    if (!l || state.year < l.from || state.year > l.to) continue;

    let perHead = interpAnchors(l.outputAnchors, state.year);
    if (stockman) perHead *= 1.15;
    const productPrice = interpAnchors(PRODUCT_PRICING[l.outputUnit], state.year);
    if (!productPrice) continue;

    let gross = perHead * productPrice * count;

    // The hog cycle is real, roughly four years, and it is brutal at the bottom.
    if (l.marketCycleYears) {
      const phase = (state.year % l.marketCycleYears) / l.marketCycleYears;
      gross *= 1 + 0.3 * Math.sin(phase * Math.PI * 2);
      if (state.modifiers?.hogPriceMult) gross *= state.modifiers.hogPriceMult;
    }

    total += gross;
    lines.push({ id, name: l.name, count, perHead, unit: l.outputUnit, gross });
  }

  state.cash += total;
  return { total, lines };
}

/** Grain left in store loses some of itself over the winter. */
export function applySpoilage(state) {
  const rate = spoilRate(state);
  const cap = storageCapacity(state);
  let stored = 0;
  for (const v of Object.values(state.granary)) stored += v;
  // Grain over capacity sits outside and takes a much worse rate.
  const overflow = Math.max(0, stored - cap);
  const losses = {};
  for (const [cropId, amount] of Object.entries(state.granary)) {
    if (!amount) continue;
    const overflowShare = stored > 0 ? (overflow * (amount / stored)) : 0;
    const lost = (amount - overflowShare) * rate + overflowShare * 0.22;
    if (lost > 0.01) {
      state.granary[cropId] = Math.max(0, amount - lost);
      losses[cropId] = lost;
    }
  }
  return { rate, capacity: cap, stored, overflow, losses };
}

/** Feed drawn out of the granary to winter the animals and the teams. */
export function consumeFeed(state, required) {
  const result = { hayShort: 0, grainShort: 0, fed: { hay: 0, grain: 0 } };

  const hayHave = state.granary.hay || 0;
  const hayUse = Math.min(hayHave, required.hay);
  state.granary.hay = hayHave - hayUse;
  result.fed.hay = hayUse;
  result.hayShort = Math.max(0, required.hay - hayUse);

  // Any feed grain will do: oats first, then barley, then wheat if it must.
  let grainNeed = required.grain;
  for (const cropId of ['oats', 'barley', 'rye', 'wheat']) {
    if (grainNeed <= 0) break;
    const have = state.granary[cropId] || 0;
    const use = Math.min(have, grainNeed);
    state.granary[cropId] = have - use;
    grainNeed -= use;
    result.fed.grain += use;
  }
  result.grainShort = Math.max(0, grainNeed);
  return result;
}

/**
 * What must NOT be sold: next year's seed, and enough feed grain to winter the
 * animals and the teams.
 *
 * A farm that sells its whole crop in November and then discovers in January
 * that it cannot feed the horses is not modelling a farm. Seed and feed came
 * off the top, always, and what went to the elevator was the surplus.
 */
export function retainedGrain(state, { feedRequired, seededByCrop = {} }) {
  const hold = {};

  // Seed for the acres that were cropped this year, plus a margin, since that
  // is the best estimate of what goes in the ground next spring.
  for (const [cropId, acres] of Object.entries(seededByCrop)) {
    const c = CROPS[cropId];
    if (!c || !c.seedRate || !acres) continue;
    hold[cropId] = (hold[cropId] || 0) + c.seedRate * acres * 1.1;
  }

  // Feed grain, taken from the cheapest feed first — oats, then barley, then
  // rye, and only wheat if there is nothing else.
  let need = feedRequired?.grain || 0;
  for (const cropId of ['oats', 'barley', 'rye', 'wheat']) {
    if (need <= 0) break;
    const have = state.granary[cropId] || 0;
    const already = hold[cropId] || 0;
    const spare = Math.max(0, have - already);
    const take = Math.min(spare, need);
    hold[cropId] = already + take;
    need -= take;
  }

  return hold;
}

/**
 * The default marketing plan: sell the surplus, hold the seed and the feed.
 * Used when the player (or the bot) gives no explicit orders.
 */
export function defaultSaleOrders(state, context) {
  const hold = retainedGrain(state, context);
  const orders = {};

  // A farm with bins and a marketing plan can decline to sell into a bad
  // price. Before on-farm storage the crop went when it was threshed, because
  // there was nowhere to put it — which is exactly why the elevator set the
  // terms for the first seventy years.
  const canHold = techEffect(state, 'canHoldGrain', { mode: 'max' });
  const spare = storageCapacity(state) - Object.values(state.granary).reduce((a, b) => a + b, 0);

  for (const [cropId, amount] of Object.entries(state.granary)) {
    const c = CROPS[cropId];
    if (!c || c.feedOnly) continue;                       // hay and pasture never go to town
    if (state.year < c.from || state.year > c.to) continue;
    let surplus = amount - (hold[cropId] || 0);
    if (surplus <= 0.5) continue;

    if (canHold && spare > surplus * 0.4) {
      // Judge this year's price against the run of recent years.
      const recent = [1, 2, 3]
        .map((back) => (state.year - back >= c.from ? cropPrice(cropId, state.year - back) : null))
        .filter((v) => v != null);
      if (recent.length) {
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const now = cropPrice(cropId, state.year);
        if (now < avg * 0.88) surplus *= 0.45; // hold most of it back for a better year
      }
    }
    orders[cropId] = surplus;
  }
  return { orders, held: hold };
}

function interpAnchors(anchors, year) {
  if (!anchors || !anchors.length) return 0;
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

export { interpAnchors };
