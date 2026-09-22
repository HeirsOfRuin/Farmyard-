// The side panels: what needs deciding, what is growing, what the books say,
// and who the family is.
//
// Nothing here computes a farm number. Every figure is asked of the engine, so
// what the player reads and what the year resolves cannot disagree. Where a
// panel can come up empty it says WHY it is empty and what would fill it — an
// absent thing and a broken thing look identical otherwise.

import {
  farmSummary, croppableAcres, yieldPerAcre, neutralConditions, totalDebt,
  debtService, creditLimit, borrowingRate, livingCost, feedRequired,
  grazingCapacity, netWorth, landValue, equipmentValue, livestockValue,
  granaryValue, labourForce, draftPower, equipmentPrice, currentVariety,
  bestImplement, breakableAcres, seasonCapacity, fieldLogistics, timelinessFactor,
} from '../engine/derive.js';
import { offeredPrograms, isEnrolled, taxReliefLabel, PROGRAM_LIST } from '../engine/programs.js';
import { ROAD_WORKS } from '../data/roads.data.js';
import {
  playerQuarters, legalDescription, ACRES_PER_QUARTER, quarterById,
  distanceFromYard, roadFor, forageAcres,
} from '../engine/land.js';
import { CROPS, cropsAvailable, WHEAT_VARIETIES } from '../data/crops.data.js';
import { EQUIPMENT, equipmentAvailable } from '../data/equipment.data.js';
import { TECHNOLOGIES } from '../data/tech.data.js';
import { LIVESTOCK, LIVESTOCK_PRICING } from '../data/livestock.data.js';
import { cropPrice, FIRST_YEAR } from '../data/prices.data.js';
import { operator, age, fullName, heirCandidates, TRAITS, isAlive } from '../engine/family.js';
import { storageCapacity, interpAnchors } from '../engine/market.js';
import { quarterPurchasePrice } from '../engine/turn.js';
import { esc, USE_COLOURS } from './map.js';
import { money, qty, pct } from './format.js';

// ---------------------------------------------------------------------------
// What needs your attention this year
// ---------------------------------------------------------------------------

/**
 * The short list that makes a quiet year one click and a hard year slow.
 * Ordered most-pressing first; each item says what it is and what to do.
 */
export function attentionItems(state) {
  const items = [];
  const sum = farmSummary(state);
  const cap = croppableAcres(state);
  const op = operator(state);

  // --- money in trouble ---
  const service = debtService(state);
  const lastYear = state.ledger[state.ledger.length - 1];
  if (lastYear?.settle?.solvency?.insolvent) {
    const s = lastYear.settle.solvency;
    items.push({
      kind: 'urgent',
      text: `The farm is in distress — ${s.years} year${s.years > 1 ? 's' : ''} of ${s.grace + 1} before the lender can act. ` +
        `Debt is ${money(totalDebt(state))} and this year's service is ${money(service.total)}.`,
    });
  } else if (service.total > 0 && lastYear) {
    const gross = (lastYear.income?.total || 0);
    if (gross > 0 && service.total > gross * 0.4) {
      items.push({
        kind: 'urgent',
        text: `Debt service of ${money(service.total)} is more than two-fifths of what the farm grossed last year. ` +
          'That is the shape trouble takes.',
      });
    }
  }

  // --- no power, no farm ---
  // Existential and easy to miss: an ox dies of old age, draft power goes to
  // zero, every implement on the place becomes an ornament, and the farm then
  // does nothing — quietly — for as many years as the player lets it.
  const draft = draftPower(state);
  const needsDraft = ['till', 'seed', 'harvest']
    .map((op) => bestImplement(state, op))
    .filter((i) => i && !i.byHand)
    .reduce((m, i) => Math.max(m, i.draftNeeded || 0), 0);
  if (needsDraft > 0 && draft < needsDraft * 0.75) {
    items.push({
      kind: 'urgent',
      text: draft <= 0
        ? 'There is no draft power on the place. Nothing can be pulled and no sod can be broken, ' +
          'and the farm will do very little until there is a team in the barn. Buy one under Buy & sell.'
        : `Draft power is ${draft.toFixed(1)} horse and the implements want ${needsDraft.toFixed(1)}. ` +
          'Everything is working at part speed.',
    });
  }

  const breakCap = breakableAcres(state);
  if (breakCap.acres < 1 && sum.acresOwned > sum.acresBroken + 5) {
    items.push({
      kind: 'urgent',
      text: 'Nothing on the place will turn native sod this year, so the unbroken acres stay unbroken.',
    });
  }

  // --- broken ground growing nothing ---
  const idleBroken = playerQuarters(state.quarters)
    .filter((q) => q.brokenAcres > 1 && (q.use === 'idle' || !q.use))
    .reduce((t, q) => t + q.brokenAcres, 0);
  if (idleBroken > 1) {
    items.push({
      kind: 'urgent',
      text: `${Math.round(idleBroken)} broken acres have no crop assigned and will grow nothing. ` +
        'Set them under Fields below.',
    });
  }

  // --- capacity: land you own and cannot work ---
  const unbroken = sum.acresOwned - sum.acresBroken;
  if (sum.acresBroken > cap.acres * 1.12) {
    items.push({
      kind: 'urgent',
      text: `${Math.round(sum.acresBroken)} acres are broken but the outfit can only work ` +
        `${Math.round(cap.acres)} of them. The ${cap.bottleneck} is the constraint — the rest will not get seeded.`,
    });
  } else if (unbroken > 40 && cap.acres > sum.acresBroken * 1.15) {
    items.push({
      kind: 'opportunity',
      text: `The outfit could work ${Math.round(cap.acres)} acres and only ${Math.round(sum.acresBroken)} are broken. ` +
        `There are ${Math.round(unbroken)} acres of sod left to turn.`,
    });
  }

  // --- winter feed ---
  const feed = feedRequired(state);
  const grazed = grazingCapacity(state);
  const hayNeeded = Math.max(0, feed.hay - grazed * 0.6);
  const hayOnHand = state.granary.hay || 0;
  const stockUnits = Object.values(state.livestock).reduce((a, b) => a + b, 0);
  if (stockUnits > 0 && hayNeeded > hayOnHand * 1.1 + 0.5) {
    items.push({
      kind: 'urgent',
      text: `Winter feed is short: ${qty(hayNeeded, 'tons')} of hay wanted and ${qty(hayOnHand, 'tons')} in the stack. ` +
        'Put more acres to hay or the stock goes in November.',
    });
  }

  // --- land coming up ---
  const forSale = state.quarters.filter((q) => q.forSale && q.owner !== 'player');
  for (const q of forSale.slice(0, 2)) {
    items.push({
      kind: 'opportunity',
      text: `${legalDescription(q, state.townshipLabel)} is for sale — ${q.ownerName} is quitting. ` +
        `They want about ${money(quarterPurchasePrice(state, q))}.`,
    });
  }
  const open = state.quarters.find((q) => !q.owner && q.tenure === 'homestead');
  if (open) {
    items.push({
      kind: 'opportunity',
      text: `${legalDescription(open, state.townshipLabel)} is still open for homestead entry — ` +
        'ten dollars, three years’ residence and thirty acres broken.',
    });
  }

  // --- new things in the world this year ---
  //
  // NOT IN THE FIRST YEAR. "New this year" means the world changed, and in
  // 1875 nothing has: everything on the list has simply always existed. Left
  // unguarded this announced the plow, the scythe, the flail, the wagon, the
  // oxen and everything else in one go — ten cards of noise as the player's
  // very first look at the game, burying the two decisions that actually
  // needed making. Anything available at the start belongs in Buy & sell,
  // where it can be read at leisure.
  if (state.year > (state.startYear ?? FIRST_YEAR)) {
    for (const e of Object.values(EQUIPMENT)) {
      if (e.from !== state.year) continue;
      items.push({ kind: 'era', text: `New this year: the ${e.name.toLowerCase()}. ${e.note}` });
    }
    for (const t of Object.values(TECHNOLOGIES)) {
      if (t.from !== state.year) continue;
      items.push({ kind: 'era', text: `New this year: ${t.name.toLowerCase()}. ${t.note}` });
    }
  }
  for (const c of Object.values(CROPS)) {
    if (c.from === state.year && state.year > 1875) {
      items.push({ kind: 'era', text: `${c.name} can be grown here now. ${c.note}` });
    }
    if (c.to === state.year && state.year < 2000) {
      items.push({ kind: 'urgent', text: `This is the last year there is a market for ${c.name.toLowerCase()}.` });
    }
  }
  const better = WHEAT_VARIETIES.filter((v) => v.from <= state.year).pop();
  if (better && better.id !== state.wheatVariety) {
    items.push({
      kind: 'opportunity',
      text: `${better.name} seed is available and you are still sowing ${currentVariety(state).name}. ${better.note}`,
    });
  }

  // --- the family ---
  if (op) {
    const a = age(state.year, op);
    if (a >= 58 && !state.family.will) {
      const heirs = heirCandidates(state).filter((h) => h.id !== op.id);
      items.push({
        kind: heirs.length ? 'urgent' : 'era',
        text: heirs.length
          ? `${fullName(op)} is ${a} and there is no will. Without one, an estate divides among all the ` +
            'children and the land can be sold to pay them out.'
          : `${fullName(op)} is ${a} and there is nobody in the family to take the farm on.`,
      });
    }
  }
  const comingOfAge = state.family.members.filter(
    (m) => isAlive(m) && !m.away && age(state.year, m) === 18
  );
  for (const m of comingOfAge) {
    items.push({
      kind: 'era',
      text: m.wantsFarm
        ? `${fullName(m)} is eighteen and means to stay on the farm.`
        : `${fullName(m)} is eighteen and does not want to farm.`,
    });
  }

  return items;
}

export function renderAttention(state) {
  const items = attentionItems(state);
  if (!items.length) {
    return `<div class="empty">Nothing is asking for a decision this year. The crop plan carries ` +
      `forward from last year and the farm will work as it worked. Press <em>Work the year</em>.</div>`;
  }
  return `<ul class="attn">${items
    .map((i) => `<li class="${i.kind}">${esc(i.text)}</li>`)
    .join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// Plan panel
// ---------------------------------------------------------------------------

export function renderPlan(state, draft) {
  const owned = playerQuarters(state.quarters);
  const cap = croppableAcres(state);
  const sum = farmSummary(state);
  const available = cropsAvailable(state.year).filter((c) => c.id !== 'bush');
  const out = [];

  out.push('<section><h3>The season ahead</h3>');
  const breakable = breakableAcres(state);
  out.push(row('Acres the outfit can crop', `${Math.round(cap.acres)} ac`));
  out.push(row('Limited by', cap.bottleneck));
  out.push(row('Sod it can break', `${Math.round(breakable.acres)} ac`));
  out.push(`<div class="row"><span class="k">Working with</span></div>
            <div style="font-size:.8rem;color:var(--ink-2);margin:-2px 0 6px">${implementSummary(state)}</div>`);

  // What the distance to the fields is costing. Automatic, but visible — the
  // player never assigns a trip, and they can always see what the scattering
  // of their land takes off the season.
  const log = fieldLogistics(state);
  if (log.totalDays > 0.3) {
    out.push(row('Days lost on the road', `${log.totalDays.toFixed(1)} days`));
    if (log.worst && log.worst.total > 0.3) {
      out.push(
        `<div style="font-size:.78rem;color:var(--ink-3);margin:-2px 0 6px">` +
          `Furthest is ${esc(log.worst.quarter)} ${log.worst.section} — ${log.worst.miles} mi ` +
          `on ${esc(log.worst.road)}, ${log.worst.total.toFixed(1)} days of travel. ` +
          `Travelling at ${log.speed.toFixed(0)} mph.</div>`
      );
    }
    if (log.breakupDays > 0.3) {
      out.push(
        `<div style="font-size:.78rem;color:var(--alarm);margin:-2px 0 6px">` +
          `${log.breakupDays.toFixed(1)} of those days are spring breakup — the road will not ` +
          `carry a load until it dries.</div>`
      );
    }
  }
  out.push(row('Draft power', `${draftPower(state).toFixed(1)} horse`));
  out.push(row('Hands available', labourForce(state).units.toFixed(1)));
  out.push('</section>');

  // --- fields ---
  out.push('<section><h3>Fields</h3>');
  const forageOnly = available.filter((cc) => cc.category === 'forage' || cc.id === 'idle');
  if (!owned.length) {
    out.push('<div class="empty">You hold no land. File on an open quarter to start.</div>');
  } else {
    // Grain needs the plow, but hay does not — slough and native grass fed
    // stock long before anything was broken, so a quarter with nothing
    // broken on it still gets a row, just with grain off the menu. Gating the
    // whole list on `acresBroken >= 1` used to leave a settler's first spring
    // with nowhere to even ASK for hay, on the one quarter that had it.
    out.push('<div class="fields">');
    for (const q of owned) {
      const broken = q.brokenAcres >= 1;
      const use = draft.fieldUse[q.id] ?? q.use;
      const c = CROPS[use];
      const expected = c?.yieldBase
        ? yieldPerAcre(state, q, use, neutralConditions())
        : 0;
      const acresShown = c?.category === 'forage' ? Math.round(forageAcres(q)) : Math.round(q.brokenAcres);
      const options = broken ? available : forageOnly;
      out.push(
        `<div class="field">
           <div>
             <div class="nm">${esc(legalDescription(q, state.townshipLabel))}
               <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${USE_COLOURS[use] || '#888'};margin-left:4px"></span>
             </div>
             <div class="meta">${acresShown} ac${broken ? '' : ' unbroken'} &middot; ${esc(CROPS[q.use] ? soilShort(q) : '')}
               &middot; fertility ${pct(q.fertility)}${
                 expected > 0 ? ` &middot; expect ${expected.toFixed(1)} ${c.unit}/ac in an average year` : ''
               }${(() => {
                 const miles = distanceFromYard(state, q);
                 if (miles <= 0) return ' &middot; at the yard';
                 const loss = 1 - timelinessFactor(state, q);
                 return ` &middot; ${miles} mi out` +
                   (loss > 0.03 ? `, costing it ${Math.round(loss * 100)}%` : '');
               })()}</div>
             ${!broken ? '<div class="meta" style="color:var(--ink-3)">Nothing is broken here yet — wild hay and grazing only, until it is.</div>' : ''}
           </div>
           <select data-field="${q.id}">
             ${options
               .map((cc) => `<option value="${cc.id}"${cc.id === use ? ' selected' : ''}>${esc(cc.name)}</option>`)
               .join('')}
           </select>
         </div>`
      );
    }
    out.push('</div>');
    const planned = owned
      .filter((q) => q.brokenAcres >= 1)
      .filter((q) => !['idle', 'pasture', 'hay', 'bush', 'fallow'].includes(draft.fieldUse[q.id] ?? q.use))
      .reduce((s, q) => s + q.brokenAcres, 0);
    if (planned > cap.acres + 0.5) {
      out.push(
        `<div class="empty" style="border-color:var(--alarm);color:var(--alarm)">` +
          `${Math.round(planned)} acres are planned and the outfit can seed ${Math.round(cap.acres)}. ` +
          `About ${Math.round(planned - cap.acres)} acres will not get in the ground.</div>`
      );
    }
  }
  out.push('</section>');

  // --- breaking ---
  const withSod = owned.filter((q) => q.brokenAcres < ACRES_PER_QUARTER - 1);
  out.push('<section><h3>Breaking</h3>');
  if (!withSod.length) {
    out.push('<div class="empty">Every acre you own is broken. More land is the only way to grow now.</div>');
  } else if (breakable.acres < 1) {
    out.push(
      `<div class="empty">There are ${Math.round(sum.acresOwned - sum.acresBroken)} acres of sod left, ` +
        'but the outfit cannot turn any of it this year. Breaking takes a plow and a team.</div>'
    );
  } else {
    out.push(
      `<div style="font-size:.8rem;color:var(--ink-3);margin-bottom:6px">` +
        `About ${Math.round(breakable.acres)} acres is a season\u2019s breaking with what you have. ` +
        `This is already filled in.</div>`
    );
    out.push('<div class="fields">');
    for (const q of withSod) {
      const room = Math.round(ACRES_PER_QUARTER - q.brokenAcres);
      out.push(
        `<div class="field">
           <div><div class="nm">${esc(legalDescription(q, state.townshipLabel))}</div>
             <div class="meta">${room} ac of sod left${q.owner === 'player' ? '' : ' (not yours)'}</div></div>
           <input type="number" min="0" max="${room}" step="5" value="${draft.breakAcres[q.id] ?? 0}"
                  data-break="${q.id}" style="width:74px" />
         </div>`
      );
    }
    out.push('</div>');
  }
  out.push('</section>');
  return out.join('');
}

function soilShort(q) {
  return q.soil;
}

/**
 * What the farm works with, named by job.
 *
 * Asks seasonCapacity, not bestImplement: the engine falls back to hand work
 * when there is no implement (or when the implement has no team to pull it),
 * and bestImplement does not know that. Reporting "nothing" for a job the farm
 * will in fact do by hand is the display disagreeing with the resolution.
 */
function implementSummary(state) {
  const jobs = { till: 'tillage', seed: 'seeding', harvest: 'harvest' };
  return Object.entries(jobs)
    .map(([op, label]) => {
      const cap = seasonCapacity(state, op, 1);
      const name = !cap.implement ? 'nothing'
        : cap.byHand ? 'by hand'
        : cap.implement.name.toLowerCase();
      return `${label}: ${name}`;
    })
    .join(' &middot; ');
}

// ---------------------------------------------------------------------------
// Market / buy panel
// ---------------------------------------------------------------------------

export function renderMarket(state, draft) {
  const out = [];
  const cash = state.cash;

  out.push('<section><h3>Machinery for sale</h3>');
  const machines = equipmentAvailable(state.year)
    .filter((e) => ['till', 'seed', 'harvest', 'swath', 'thresh'].includes(e.operation) || e.category === 'power')
    .filter((e) => !state.equipment.some((i) => i.type === e.id));
  if (!machines.length) {
    out.push(`<div class="empty">You already own one of everything on the market in ${state.year}.</div>`);
  } else {
    for (const e of machines.slice(0, 9)) {
      const price = equipmentPrice(state, e);
      const gain = croppableAcres(state, e.id).acres - croppableAcres(state).acres;
      const picked = (draft.buyEquipment || []).some((b) => b.type === e.id);
      out.push(
        `<div class="field${picked ? ' sel' : ''}">
           <div><div class="nm">${esc(e.name)}</div>
             <div class="meta">${money(price)}${gain > 0.5 ? ` &middot; +${Math.round(gain)} acres you could crop` : ''}
               ${e.note ? `<br>${esc(e.note)}` : ''}</div></div>
           <button class="btn sm" data-buy-equip="${e.id}" ${price > cash ? 'disabled' : ''}>
             ${price > cash ? 'too dear' : picked ? 'ordered' : 'buy'}</button>
         </div>`
      );
    }
  }
  out.push('</section>');

  out.push('<section><h3>Livestock</h3>');
  const stock = Object.values(LIVESTOCK).filter((l) => state.year >= l.from && state.year <= l.to);
  for (const l of stock) {
    const price = interpAnchors(LIVESTOCK_PRICING[l.id], state.year);
    const have = state.livestock[l.id] || 0;
    out.push(
      `<div class="field">
         <div><div class="nm">${esc(l.name)} <span class="pill">${have} head</span></div>
           <div class="meta">${money(price)} each &middot; ${esc(l.note)}</div></div>
         <div style="display:flex;gap:4px">
           <button class="btn sm" data-buy-stock="${l.id}" ${price > cash ? 'disabled' : ''}>buy</button>
           <button class="btn sm" data-sell-stock="${l.id}" ${have < 1 ? 'disabled' : ''}>sell</button>
         </div>
       </div>`
    );
  }
  out.push('</section>');

  out.push('<section><h3>Land</h3>');
  const buyable = state.quarters
    .filter((q) => q.owner !== 'player')
    .filter((q) => !q.owner || q.forSale || q.owner === 'railway' || q.owner === 'school')
    .map((q) => ({ q, price: q.owner ? quarterPurchasePrice(state, q) : 10 }));
  if (!buyable.length) {
    out.push(
      '<div class="empty">Nothing in the district is for sale. Land comes up when a neighbour quits, ' +
        'which happens in the bad years and almost never in the good ones.</div>'
    );
  } else {
    for (const { q, price } of buyable) {
      const free = !q.owner;
      out.push(
        `<div class="field">
           <div><div class="nm">${esc(legalDescription(q, state.townshipLabel))}</div>
             <div class="meta">${free ? 'Open for homestead entry &middot; $10 filing fee' :
               `${esc(q.ownerName || 'held')} &middot; ${money(price)}`}</div></div>
           <button class="btn sm" data-${free ? 'file' : 'buy-land'}="${q.id}" ${price > cash ? 'disabled' : ''}>
             ${price > cash ? 'too dear' : free ? 'file' : 'buy'}</button>
         </div>`
      );
    }
  }
  out.push('</section>');

  // --- government programs -------------------------------------------------
  out.push('<section><h3>Government programs</h3>');
  const offers = offeredPrograms(state, { yieldRatio: state.yearYieldRatio ?? 1 });
  if (!offers.length) {
    out.push(
      `<div class="empty">There is nothing on offer in ${state.year}. The large farm programs ` +
        'arrive after the thirties; before that a farmer in trouble had the municipality, ' +
        'the neighbours, and not much else.</div>'
    );
  } else {
    for (const { program: p, ok, reason } of offers) {
      const joined = isEnrolled(state, p.id);
      out.push(
        `<div class="field${joined ? ' sel' : ''}">
           <div><div class="nm">${esc(p.name)}${joined ? ' <span class="pill good">taken up</span>' : ''}</div>
             <div class="meta">${p.cost ? `your share ${money(p.cost * (1 - (p.costShare ?? 0)))}` : ''}
               ${p.premiumPerAcre ? `${money(p.premiumPerAcre)}/ac a year` : ''}
               ${!ok ? ` &middot; <span style="color:var(--ink-3)">${esc(reason)}</span>` : ''}
               <br>${esc(p.note)}</div></div>
           <button class="btn sm" data-program="${p.id}" ${!ok || joined ? 'disabled' : ''}>
             ${joined ? 'in' : 'take up'}</button>
         </div>`
      );
    }
  }
  // Money that simply arrives is worth saying out loud, since the player never
  // decides about it and would otherwise never learn it exists.
  const autoNow = PROGRAM_LIST.filter(
    (p) => p.kind === 'automatic' && state.year >= p.from && state.year <= p.to
  );
  if (autoNow.length) {
    out.push(
      `<div style="font-size:.78rem;color:var(--ink-3);margin-top:6px">In force this year without asking: ` +
        autoNow.map((p) => esc(p.name)).join(', ') + '.</div>'
    );
  }
  const relief = taxReliefLabel(state);
  if (relief) {
    out.push(`<div style="font-size:.78rem;color:var(--good);margin-top:4px">${esc(relief)}.</div>`);
  }
  out.push('</section>');

  // --- roads ----------------------------------------------------------------
  out.push('<section><h3>Roads</h3>');
  const roadable = playerQuarters(state.quarters)
    .filter((q) => distanceFromYard(state, q) > 0 && (q.roadImprovement || 0) < 2)
    .map((q) => ({ q, loss: 1 - timelinessFactor(state, q) }))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 5);
  if (!roadable.length) {
    out.push(
      '<div class="empty">Nothing to improve. Either everything you hold is at the yard, ' +
        'or you have already done what can be done to the roads that serve it.</div>'
    );
  } else {
    for (const { q, loss } of roadable) {
      const gravel = state.year >= ROAD_WORKS.gravelPetition.from;
      const spec = gravel ? ROAD_WORKS.gravelPetition : ROAD_WORKS.approach;
      out.push(
        `<div class="field">
           <div><div class="nm">${esc(legalDescription(q, state.townshipLabel))}</div>
             <div class="meta">${distanceFromYard(state, q)} mi on ${esc(roadFor(state, q).short)}
               ${loss > 0.03 ? `&middot; losing ${Math.round(loss * 100)}% of this field` : ''}
               <br>${esc(spec.note)}</div></div>
           <button class="btn sm" data-road="${q.id}" data-roadkind="${spec.id}">
             ${money(spec.cost)}</button>
         </div>`
      );
    }
  }
  out.push('</section>');

  out.push('<section><h3>Technology</h3>');
  const techs = Object.values(TECHNOLOGIES)
    .filter((t) => state.year >= t.from && !state.technologies.includes(t.id) && !t.automatic);
  if (!techs.length) {
    out.push(
      `<div class="empty">Nothing new to take up. Technology arrives on its own schedule — ` +
        `there is nothing available in ${state.year} that this farm has not already got.</div>`
    );
  } else {
    for (const t of techs.slice(0, 8)) {
      const blocked = (t.requires && !state.technologies.includes(t.requires))
        ? `needs ${TECHNOLOGIES[t.requires].name}`
        : (t.requiresImplement && !state.equipment.some((i) => i.type === t.requiresImplement))
          ? `needs a ${EQUIPMENT[t.requiresImplement].name.toLowerCase()}`
          : null;
      out.push(
        `<div class="field">
           <div><div class="nm">${esc(t.name)}</div>
             <div class="meta">${t.costPerAcre ? `${money(t.costPerAcre)}/ac` : t.cost ? money(t.cost) : 'no cost'}
               ${blocked ? ` &middot; <span style="color:var(--alarm)">${esc(blocked)}</span>` : ''}
               <br>${esc(t.note)}</div></div>
           <button class="btn sm" data-tech="${t.id}" ${blocked ? 'disabled' : ''}>take up</button>
         </div>`
      );
    }
  }
  out.push('</section>');
  return out.join('');
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export function renderBooks(state) {
  const out = [];
  const last = state.ledger[state.ledger.length - 1];

  out.push('<section><h3>What the farm is worth</h3>');
  out.push(row('Land', money(landValue(state))));
  out.push(row('Machinery', money(equipmentValue(state))));
  out.push(row('Livestock', money(livestockValue(state))));
  out.push(row('Grain in store', money(granaryValue(state))));
  out.push(row('Cash', money(state.cash)));
  out.push(row('Debt', `-${money(totalDebt(state))}`));
  out.push(row('Net worth', money(netWorth(state)), 'total'));
  out.push('</section>');

  out.push('<section><h3>Credit</h3>');
  if (!state.debts.length) {
    out.push('<div class="empty">The farm owes nothing. That is rarer than it sounds and worth keeping.</div>');
  } else {
    for (const d of state.debts) {
      out.push(row(`${d.sourceName} (${(d.rate * 100).toFixed(1)}%)`, money(d.principal)));
    }
    out.push(row('This year’s service', money(debtService(state).total), 'total'));
  }
  out.push(row('Could still borrow', money(creditLimit(state))));
  out.push(row('At about', `${(borrowingRate(state) * 100).toFixed(1)}%`));
  out.push('</section>');

  out.push('<section><h3>In the granary</h3>');
  const grain = Object.entries(state.granary).filter(([, v]) => v > 0.5);
  if (!grain.length) {
    out.push('<div class="empty">The bins are empty. They fill at harvest and empty at the elevator.</div>');
  } else {
    for (const [id, amount] of grain) {
      const c = CROPS[id];
      const sellable = c && state.year >= c.from && state.year <= c.to && !c.feedOnly;
      out.push(row(
        c?.name || id,
        `${qty(amount, c?.unit || '')}${sellable ? ` @ ${money(cropPrice(id, state.year))}` : ' (feed)'}`
      ));
    }
    const cap = storageCapacity(state);
    const stored = grain.reduce((s, [, v]) => s + v, 0);
    out.push(row('Storage', `${qty(stored, 'bu')} of ${qty(cap, 'bu')}`, stored > cap ? 'total' : ''));
    if (stored > cap) {
      out.push('<div class="empty" style="border-color:var(--alarm);color:var(--alarm)">' +
        'More grain than bins. What will not fit goes outside and much of it will not be worth selling.</div>');
    }
  }
  out.push('</section>');

  if (last) {
    out.push('<section><h3>Last year’s account</h3>');
    out.push('<table class="ledger"><tbody>');
    for (const [k, v] of Object.entries(last.income)) {
      if (k === 'total' || !(v > 0.5)) continue;
      out.push(`<tr><td>${esc(label(k))}</td><td class="n" style="color:var(--good)">${money(v)}</td></tr>`);
    }
    for (const [k, v] of Object.entries(last.expenses)) {
      if (k === 'total' || !(v > 0.5)) continue;
      out.push(`<tr><td>${esc(label(k))}</td><td class="n" style="color:var(--alarm)">-${money(v)}</td></tr>`);
    }
    const net = (last.income.total || 0) - (last.expenses.total || 0);
    out.push(`<tr><td><strong>Net</strong></td><td class="n"><strong>${net < 0 ? '-' : ''}${money(Math.abs(net))}</strong></td></tr>`);
    out.push('</tbody></table></section>');
  }
  return out.join('');
}

const LABELS = {
  grain: 'Grain sold', livestock: 'Livestock and produce', offFarmWork: 'Wages off the farm',
  offFarmRegional: 'Fishing and other income', borrowed: 'Borrowed', emergencyCredit: 'Carried on credit',
  landSale: 'Land sold', machinerySale: 'Machinery sold', livestockSale: 'Stock sold',
  forcedStockSale: 'Stock sold to pay bills', forcedLandSale: 'Land sold to pay bills',
  dowry: 'Came with the marriage', programPayment: 'Government payment',
  seed: 'Seed', inputs: 'Fertilizer and chemical', living: 'The household', wages: 'Hired help',
  upkeep: 'Machinery upkeep', taxes: 'Municipal taxes', interest: 'Interest', principal: 'Principal',
  machinery: 'Machinery bought', landPurchase: 'Land bought', landFees: 'Filing fees',
  breaking: 'Breaking sod', improvements: 'Improvements', livestockPurchase: 'Stock bought',
  customThreshing: 'Custom threshing', misfortune: 'Damage and repairs', legal: 'Solicitor',
  debtPrepayment: 'Paid off debt',
};
function label(k) { return LABELS[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase(); }

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export function renderFamily(state) {
  const out = [];
  const op = operator(state);
  const living = state.family.members.filter(isAlive);

  out.push(`<section><h3>The ${esc(state.family.surname)}s &middot; generation ${state.family.generation}</h3>`);
  if (op) {
    out.push(
      `<div style="margin-bottom:10px"><strong>${esc(fullName(op))}</strong>, ${age(state.year, op)}, works the farm.<br>` +
        `<span class="meta" style="font-size:.8rem;color:var(--ink-3)">${op.traits
          .map((t) => esc(TRAITS[t]?.name || t)).join(' &middot; ')}</span></div>`
    );
  }
  if (state.family.will) {
    const h = state.family.members.find((m) => m.id === state.family.will.heirId);
    out.push(`<div class="pill good">Will drawn ${state.family.will.yearWritten}${h ? `, naming ${esc(fullName(h))}` : ''}</div>`);
  } else {
    out.push('<div class="pill warn">No will. An estate with no will divides among all the children.</div>');
  }
  out.push('</section>');

  out.push('<section><h3>At home</h3>');
  const here = living.filter((m) => !m.away);
  if (!here.length) {
    out.push('<div class="empty">Nobody is left on the place.</div>');
  } else {
    for (const m of here) {
      const a = age(state.year, m);
      const role = m.id === state.family.operatorId ? 'operates the farm'
        : m.role === 'spouse' ? 'married in'
        : m.role === 'retired' ? 'retired'
        : a < 14 ? 'a child'
        : m.wantsFarm === true ? 'means to farm'
        : m.wantsFarm === false ? 'does not want the farm'
        : 'at home';
      out.push(row(`${esc(fullName(m))}, ${a}`, esc(role)));
    }
  }
  out.push('</section>');

  const away = living.filter((m) => m.away);
  if (away.length) {
    out.push('<section><h3>Gone from the farm</h3>');
    for (const m of away) out.push(row(esc(fullName(m)), esc(m.awayReason || 'left')));
    out.push('</section>');
  }

  const dead = state.family.members.filter((m) => m.deathYear);
  if (dead.length) {
    out.push('<section><h3>Buried</h3>');
    for (const m of dead.slice(-8)) {
      out.push(row(esc(fullName(m)), `${m.birthYear}–${m.deathYear}`));
    }
    out.push('</section>');
  }

  // Writing a will is cheap and almost nobody thinks of it in time.
  const heirs = heirCandidates(state).filter((h) => h.id !== state.family.operatorId);
  out.push('<section><h3>The will</h3>');
  if (!heirs.length) {
    out.push('<div class="empty">There is nobody old enough in the family to name. A will needs an heir.</div>');
  } else {
    out.push('<div class="fields">');
    for (const h of heirs.slice(0, 6)) {
      out.push(
        `<div class="field"><div><div class="nm">${esc(fullName(h))}</div>
           <div class="meta">${age(state.year, h)} &middot; ${h.traits.map((t) => esc(TRAITS[t]?.name || t)).join(', ')}</div></div>
           <button class="btn sm" data-will="${h.id}">name as heir</button></div>`
      );
    }
    out.push('</div>');
  }
  out.push('</section>');
  return out.join('');
}

// ---------------------------------------------------------------------------

function row(k, v, cls = '') {
  return `<div class="row ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}

export { row };
