// What is the farm actually worth?
//
// The batch runner reports a MEAN net worth across every run, and three
// quarters of those runs are foreclosures. Averaging a farm that reached 2000
// with 2,000 acres against one that lost everything in 1931 produces a number
// that describes neither. This tool reports the balance sheet of the farms
// that are STILL FARMING, broken into its parts, so the figure can be checked
// against what land and machinery in Manitoba were actually worth.
//
// Usage:
//   node sim/valuation.js --runs=200 [--tier=settler] [--at=2000]

import { newGame, STATUS } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';
import {
  farmSummary, netWorth, landValue, equipmentValue, livestockValue,
  granaryValue, totalDebt,
} from '../src/engine/derive.js';
import { playerQuarters, ACRES_PER_QUARTER } from '../src/engine/land.js';
import { makePlan } from './bot.js';
import { median, fmtNum, fmtPct } from './run.js';
import { LAST_YEAR, CENTENNIAL_YEAR, landPrice } from '../src/data/prices.data.js';

/** The balance sheet, as its parts, at whatever year the state is sitting on. */
export function balanceSheet(state) {
  const sum = farmSummary(state);
  const land = landValue(state);
  return {
    year: state.year,
    cash: state.cash,
    land,
    equipment: equipmentValue(state),
    livestock: livestockValue(state),
    granary: granaryValue(state),
    debt: totalDebt(state),
    worth: netWorth(state),
    acresOwned: sum.acresOwned,
    acresBroken: sum.acresBroken,
    // The number to check against reality: what the game thinks an acre of
    // this farm's land is worth, against the era's raw price per acre.
    perAcre: sum.acresOwned > 0 ? land / sum.acresOwned : 0,
    listPerAcre: landPrice(state.year),
  };
}

/** Play one run, snapshotting the balance sheet at the centennial and the end. */
export function playForValuation({ seed, difficulty = 'settler', background = 'ontario', botOpts = {} }) {
  const state = newGame({ seed, difficulty, background });
  let at1975 = null;
  while (state.status === STATUS.ACTIVE) {
    const plan = makePlan(state, botOpts);
    const { record } = runYear(state, plan);
    if (!record) break;
    if (record.year === CENTENNIAL_YEAR) at1975 = balanceSheet(state);
  }
  return {
    seed,
    status: state.status,
    endYear: state.year,
    centennial: state.flags.centennialEarned,
    at1975,
    atEnd: balanceSheet(state),
    survived: state.status === STATUS.COMPLETE,
  };
}

function summarise(label, sheets) {
  if (!sheets.length) { console.log(`${label}: none`); return; }
  const m = (f) => median(sheets.map(f));
  const mean = (f) => sheets.reduce((s, x) => s + f(x), 0) / sheets.length;
  console.log(`\n${label} — n=${sheets.length}`);
  console.log('                     median        mean');
  const row = (name, f) => console.log(
    '  ' + name.padEnd(18) + fmtNum(m(f), 10) + fmtNum(mean(f), 12)
  );
  row('acres owned', (x) => x.acresOwned);
  row('acres broken', (x) => x.acresBroken);
  row('land', (x) => x.land);
  row('equipment', (x) => x.equipment);
  row('livestock', (x) => x.livestock);
  row('granary', (x) => x.granary);
  row('cash', (x) => x.cash);
  row('debt', (x) => -x.debt);
  row('NET WORTH', (x) => x.worth);
  console.log('  ' + '$/acre (land)'.padEnd(18) + fmtNum(m((x) => x.perAcre), 10) +
    '   list ' + fmtNum(sheets[0].listPerAcre, 5));
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const mm = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (mm) out[mm[1]] = mm[2] === undefined ? true : mm[2];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const runs = parseInt(args.runs || '150', 10);
  const difficulty = args.tier || 'settler';
  const background = args.background || 'ontario';
  const seed0 = parseInt(args.seed || '1', 10);

  const t0 = Date.now();
  const all = [];
  for (let i = 0; i < runs; i++) {
    all.push(playForValuation({ seed: seed0 + i, difficulty, background }));
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const survivors = all.filter((r) => r.survived);
  const centennials = all.filter((r) => r.at1975);
  console.log(`\n${runs} runs — ${difficulty} / ${background} — ${secs}s`);
  console.log(`reached ${LAST_YEAR}: ${survivors.length} (${fmtPct(survivors.length / runs).trim()})   ` +
    `standing in ${CENTENNIAL_YEAR}: ${centennials.length} (${fmtPct(centennials.length / runs).trim()})`);

  summarise(`Standing in ${CENTENNIAL_YEAR}`, centennials.map((r) => r.at1975));
  summarise(`Still farming in ${LAST_YEAR}`, survivors.map((r) => r.atEnd));
  summarise('Every run, wherever it ended (the misleading average)', all.map((r) => r.atEnd));

  // The top end: a heavily growth-minded farm is not the median one.
  const top = [...survivors].sort((a, b) => b.atEnd.worth - a.atEnd.worth).slice(0, Math.max(1, Math.round(survivors.length * 0.25)));
  summarise(`Top quartile of ${LAST_YEAR} survivors (the growth-minded farm)`, top.map((r) => r.atEnd));
  console.log();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
