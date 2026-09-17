// Succession, estates, and the fight over them.
//
// This is where centennial farms are actually lost. Not to drought — to three
// children, one farm, and no will. The land is the estate's largest asset and
// the only one that cannot be divided without destroying what makes it work.
//
// The mechanism:
//   * The operator dies or retires.
//   * An heir must be found who is willing to farm. If none is, the line ends.
//   * The estate is valued and divided among the widow and the children.
//   * Heirs who are not farming may want their share in cash. The new operator
//     must raise it — from the chequebook, from a mortgage, or by selling land.
//
// A will, written in advance and cheap, is what keeps the land whole. Most
// players will not think of it until an operator is sixty-eight, which is
// precisely the point.

import { heirCandidates, estateClaimants, fullName, age, isAlive, operator } from './family.js';
import { netWorth, landValue, equipmentValue, livestockValue, granaryValue, totalDebt } from './derive.js';
import { playerQuarters, quarterValueFactor, ACRES_PER_QUARTER } from './land.js';
import { landPrice, inflate } from '../data/prices.data.js';
import { STATUS } from './state.js';

export const RETIREMENT_AGE = 65;

/** What a will costs to draw up — trivial money, and almost nobody does it. */
export function willCost(state) {
  return Math.round(inflate(12, state.year));
}

export function writeWill(state, heirId) {
  const cost = willCost(state);
  if (state.cash < cost) return { ok: false, reason: `A solicitor in town wants $${cost} to draw it up.` };
  const heir = state.family.members.find((m) => m.id === heirId);
  if (!heir || !isAlive(heir)) return { ok: false, reason: 'That person cannot be named.' };
  state.cash -= cost;
  state.family.will = { heirId, yearWritten: state.year };
  return { ok: true, cost, heirName: fullName(heir) };
}

/** Does the current operator need replacing this year? */
export function needsSuccession(state) {
  const op = operator(state);
  if (!op) return { needed: true, reason: 'no operator' };
  if (op.deathYear) return { needed: true, reason: 'death', deceased: op };
  if (op.wantsRetire && (age(state.year, op) >= RETIREMENT_AGE || op.role === 'spouse')) {
    // Only retire in favour of somebody. Handing over to nobody is not
    // retirement, it is abandoning the farm.
    const successor = heirCandidates(state).find((c) => c.id !== op.id && c.wantsFarm);
    if (successor) return { needed: true, reason: 'retirement', deceased: null };
    op.wantsRetire = false;
  }
  return { needed: false };
}

/** Total value of what is being handed on. */
export function valueEstate(state) {
  const land = landValue(state);
  const equipment = equipmentValue(state);
  const stock = livestockValue(state);
  const grain = granaryValue(state);
  const debt = totalDebt(state);
  const gross = land + equipment + stock + grain + Math.max(0, state.cash);
  return { land, equipment, stock, grain, cash: Math.max(0, state.cash), debt, gross, net: gross - debt };
}

/**
 * Work out who gets what. Follows the practice of the period: a widow takes
 * roughly a third (her dower), and the remainder divides among the children.
 */
export function divideEstate(state, rng, deceased) {
  const { children, spouse } = estateClaimants(state, deceased);
  const est = valueEstate(state);
  const shares = [];

  const widowShare = spouse ? 1 / 3 : 0;
  const childPool = 1 - widowShare;
  const perChild = children.length ? childPool / children.length : 0;

  if (spouse) {
    shares.push({ id: spouse.id, name: fullName(spouse), relation: 'widow', share: widowShare, wantsCash: false });
  }
  for (const c of children) {
    // A child who is farming takes their share in the farm. A child who has
    // gone to the city wants money, and is entitled to it.
    const farming = c.wantsFarm && !c.away;
    const demandRate = state.difficultyDef.estateCashDemandRate;
    const wantsCash = !farming && rng.chance(demandRate);
    shares.push({
      id: c.id, name: fullName(c), relation: 'child',
      share: perChild, wantsCash, farming, away: c.away,
    });
  }

  return { estate: est, shares };
}

/**
 * Settle the estate against a chosen heir.
 *
 * Returns the outcome and — importantly — whether the farm survived it intact.
 * `willProtectsLand` and `siblingsAcceptInstalments` are difficulty FLAGS, not
 * scalars: on Sodbuster a will is a piece of paper and siblings want cash now.
 */
export function settleEstate(state, rng, { heirId, deceased, division }) {
  const diff = state.difficultyDef;
  const heir = state.family.members.find((m) => m.id === heirId);
  const log = [];
  const will = state.family.will;
  const hadWill = !!will && will.heirId === heirId;

  const cashClaims = division.shares.filter((s) => s.wantsCash && s.id !== heirId);
  let owed = cashClaims.reduce((sum, s) => sum + s.share * division.estate.net, 0);
  owed = Math.max(0, owed);

  if (owed <= 0) {
    log.push('The estate passed without a claim against it.');
    return { ok: true, owed: 0, landSold: [], log, intact: true };
  }

  const names = cashClaims.map((s) => s.name).join(' and ');
  log.push(
    `${names} want ${cashClaims.length > 1 ? 'their shares' : 'their share'} in cash — ` +
      `$${Math.round(owed).toLocaleString()} against an estate valued at $${Math.round(division.estate.net).toLocaleString()}.`
  );

  // 1. A will, where it holds, converts the claim into instalments over years
  //    instead of a demand the farm cannot meet in one November.
  if (hadWill && diff.willProtectsLand) {
    state.debts.push({
      id: `estate${state.year}`,
      source: 'estate',
      sourceName: `Estate of ${fullName(deceased || heir)}`,
      principal: owed,
      original: owed,
      rate: 0.04,
      termYears: 12,
      yearTaken: state.year,
    });
    log.push(`The will provides for it: the shares are paid out over twelve years and the land stays whole.`);
    return { ok: true, owed, landSold: [], log, intact: true, viaWill: true };
  }

  // 2. Pay what cash there is.
  const fromCash = Math.min(state.cash, owed);
  state.cash -= fromCash;
  let remaining = owed - fromCash;
  if (fromCash > 0) log.push(`$${Math.round(fromCash).toLocaleString()} paid out of the account.`);

  // 3. Siblings who will take instalments become a debt against the farm.
  if (remaining > 0 && diff.siblingsAcceptInstalments) {
    state.debts.push({
      id: `estate${state.year}`,
      source: 'estate',
      sourceName: 'Estate settlement',
      principal: remaining,
      original: remaining,
      rate: 0.06,
      termYears: 10,
      yearTaken: state.year,
    });
    log.push(`The rest is carried as a note to the family, at six per cent over ten years. It is a mortgage in all but name.`);
    return { ok: true, owed, landSold: [], log, intact: true, viaNote: true };
  }

  // 4. Nothing left but to sell land. This is the farm being taken apart.
  const landSold = [];
  if (remaining > 0) {
    const base = landPrice(state.year) * (state.regionDef.landValueFactor ?? 1);
    const candidates = playerQuarters(state.quarters)
      .filter((q) => q.id !== state.homeQuarterId)
      .sort((a, b) => quarterValueFactor(a) - quarterValueFactor(b));
    for (const q of candidates) {
      if (remaining <= 0) break;
      const value = base * quarterValueFactor(q) * ACRES_PER_QUARTER;
      q.owner = 'neighbour';
      q.ownerName = 'sold to settle the estate';
      q.use = 'wheat';
      remaining -= value;
      landSold.push({ id: q.id, value });
    }
    if (landSold.length) {
      log.push(
        `${landSold.length} quarter${landSold.length > 1 ? 's' : ''} sold to settle the estate. ` +
          `Land this family broke is now somebody else's.`
      );
    }
    if (remaining > 0) {
      // Even the home quarter cannot cover it.
      log.push('Even selling the land does not cover the shares. The farm cannot be settled.');
      return { ok: false, owed, landSold, log, intact: false, insufficient: true };
    }
  }

  return { ok: true, owed, landSold, log, intact: landSold.length === 0 };
}

/**
 * Run a full succession: choose an heir, divide, settle, install the new
 * operator. Returns a narrative record for the ledger.
 */
export function runSuccession(state, rng, { reason, deceased }) {
  const log = [];
  const candidates = heirCandidates(state);
  const will = state.family.will;

  // A named heir in a will takes precedence if they are alive and able.
  let heir = null;
  if (will) {
    const named = candidates.find((c) => c.id === will.heirId);
    if (named) { heir = named; log.push(`The will names ${fullName(named)}.`); }
  }
  // Someone who actively wants it takes it first.
  if (!heir) heir = candidates.find((c) => c.wantsFarm === true) || null;

  // Then anyone who has not refused. A widow, or a son too young to have been
  // asked, does not need to have declared an ambition to farm — they are
  // already here, and the farm still needs working in the spring. Requiring an
  // explicit yes ended nearly half of all lines with the family standing in
  // the yard.
  if (!heir) {
    heir = candidates.find((c) => c.wantsFarm !== false) || null;
    if (heir) {
      log.push(`${fullName(heir)} took the farm on because it was there to be taken on.`);
    }
  }

  // Last resort: somebody who actively did not want it, but will not see it
  // go. On the hardest tier, nobody will.
  if (!heir && candidates.length && state.difficultyDef.guaranteedHeir) {
    heir = candidates[0];
    log.push(`${fullName(heir)} did not want the farm, but took it on rather than see it sold.`);
  }

  if (!heir) {
    // An operator who wanted to retire and has nobody to hand over to does not
    // end the line — they carry on. Farmers farmed into their eighties when
    // there was no one coming after them, and it is the ordinary shape of a
    // farm running out of family: the work gets harder, not sudden.
    if (reason === 'retirement') {
      const current = operator(state);
      if (current && isAlive(current)) {
        current.wantsRetire = false;
        log.push(
          `${fullName(current)} would have handed the farm over this year, but there is ` +
            'no one to hand it to. The work carries on, and it does not get easier.'
        );
        return { ok: true, log, deferred: true, heir: current, generation: state.family.generation, intact: true, owed: 0, landSold: [] };
      }
    }

    state.status = STATUS.LINE_ENDED;
    state.outcome = {
      kind: 'lineEnded',
      year: state.year,
      reason: candidates.length
        ? 'No one left in the family was willing to take the farm on.'
        : 'There was no one left to take the farm on.',
      generation: state.family.generation,
    };
    log.push(state.outcome.reason);
    return { ok: false, log, lineEnded: true };
  }

  const division = divideEstate(state, rng, deceased || operator(state));
  const settlement = settleEstate(state, rng, { heirId: heir.id, deceased, division });
  log.push(...settlement.log);

  if (!settlement.ok && settlement.insufficient) {
    state.status = STATUS.RUINED;
    state.outcome = {
      kind: 'estateBroken',
      year: state.year,
      reason: 'The estate could not be settled and the farm was sold out from under the family.',
      generation: state.family.generation,
    };
    return { ok: false, log, ruined: true };
  }

  // Install the heir.
  const previous = operator(state);
  if (previous && isAlive(previous)) {
    previous.role = 'retired';
    previous.wantsRetire = false;
  }
  heir.role = 'operator';
  heir.wantsFarm = true;
  state.family.operatorId = heir.id;
  state.family.generation = Math.max(state.family.generation, heir.generation);
  state.family.will = null; // a new operator needs a new will

  log.unshift(
    reason === 'retirement'
      ? `${previous ? fullName(previous) : 'The operator'} handed the farm over to ${fullName(heir)}.`
      : `${fullName(heir)} took over the farm.`
  );

  return {
    ok: true,
    log,
    heir,
    generation: state.family.generation,
    intact: settlement.intact,
    owed: settlement.owed,
    landSold: settlement.landSold,
  };
}
