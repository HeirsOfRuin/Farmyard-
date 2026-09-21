// Batch runner: plays full games headless and reports what happened.
//
// THE MOST IMPORTANT THING IN THIS FILE is assertProgress(). A harness that
// drives a "full campaign" through an engine that silently refuses to advance
// will report PASS on every assertion downstream, because it is comparing two
// games that were never played. So every run is checked for actual movement —
// years elapsed, acres worked, harvests taken — and every report prints those
// QUANTITIES rather than a verdict, because a number can be eyeballed for
// "wait, that's wrong" and a green tick cannot.
//
// Usage:
//   node sim/run.js --runs=100 --tier=settler --background=ontario [--verbose]

import { newGame, STATUS } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';
import { farmSummary, netWorth, totalDebt } from '../src/engine/derive.js';
import { playerQuarters, ACRES_PER_QUARTER } from '../src/engine/land.js';
import { makePlan } from './bot.js';
import { FIRST_YEAR, LAST_YEAR, CENTENNIAL_YEAR } from '../src/data/prices.data.js';

export class ProgressError extends Error {}

/**
 * The one-line check that separates a safety net from a decoration.
 * Every harness that claims to simulate progress must prove progress happened.
 */
export function assertProgress(result, { minYears = 5 } = {}) {
  const { yearsPlayed, peakAcresBroken, harvestsTaken, endYear, status, outcome } = result;

  // A run that ended early because the GAME ended — the founder died before
  // there was anyone to hand the farm to — is a real outcome, not a broken
  // harness. Only an engine that stopped advancing while the run was still
  // live is a harness failure. Conflating the two hides both: it reports
  // correctness failures for balance problems, and it would let a genuinely
  // stuck engine hide behind "well, some farms fail early".
  const endedLegitimately = status && status !== 'active' && outcome;

  if (yearsPlayed < minYears && !endedLegitimately) {
    throw new ProgressError(
      `Run advanced only ${yearsPlayed} year(s) (${FIRST_YEAR}->${endYear}) and is still active. ` +
        'The engine is not advancing; every downstream number is meaningless.'
    );
  }
  if (yearsPlayed >= minYears) {
    if (peakAcresBroken <= 0) {
      throw new ProgressError(
        `Run played ${yearsPlayed} years but never broke a single acre. ` +
          'The farm never started; this is not a game being played.'
      );
    }
    if (harvestsTaken === 0) {
      throw new ProgressError(
        `Run played ${yearsPlayed} years and broke ${Math.round(peakAcresBroken)} acres ` +
          'but took no harvest in any year. Nothing is reaching the granary.'
      );
    }
  }
  return true;
}

/** Play one full game with the reference bot. */
export function playRun({ seed, difficulty = 'settler', background = 'ontario', botOpts = {}, trace = false }) {
  const state = newGame({ seed, difficulty, background });
  const timeline = [];

  let yearsPlayed = 0;
  let peakAcresBroken = 0;
  let peakAcresOwned = ACRES_PER_QUARTER;
  let harvestsTaken = 0;
  let totalBushels = 0;
  let acresLostToCapacity = 0;
  let peakNetWorth = netWorth(state);
  let peakDebt = 0;
  let generationsSeen = 1;
  let reachedCentennial = false;
  let acresAt1975 = 0;
  let acresAt2000 = 0;

  while (state.status === STATUS.ACTIVE) {
    const plan = makePlan(state, botOpts);
    const yearBefore = state.year;
    const { record } = runYear(state, plan);
    if (!record) break;
    if (state.year === yearBefore && state.status === STATUS.ACTIVE) {
      throw new ProgressError(`Year ${yearBefore} did not advance the clock.`);
    }
    yearsPlayed++;

    const sum = record.closing.summary;
    peakAcresBroken = Math.max(peakAcresBroken, sum.acresBroken);
    peakAcresOwned = Math.max(peakAcresOwned, sum.acresOwned);
    peakNetWorth = Math.max(peakNetWorth, record.closing.netWorth);
    peakDebt = Math.max(peakDebt, record.closing.debt);
    generationsSeen = Math.max(generationsSeen, sum.generation);
    acresLostToCapacity += record.harvest.acresLost || 0;

    const bushels = Object.values(record.harvest.totals || {}).reduce((s, v) => s + v, 0);
    if (bushels > 0) { harvestsTaken++; totalBushels += bushels; }

    if (record.year === CENTENNIAL_YEAR) {
      reachedCentennial = true;
      acresAt1975 = sum.acresOwned;
    }
    if (record.year === LAST_YEAR) acresAt2000 = sum.acresOwned;

    if (trace) {
      timeline.push({
        year: record.year,
        acres: sum.acresOwned,
        broken: Math.round(sum.acresBroken),
        cash: Math.round(record.closing.cash),
        debt: Math.round(record.closing.debt),
        worth: Math.round(record.closing.netWorth),
        bushels: Math.round(bushels),
        gen: sum.generation,
        events: (record.season.events || []).map((e) => e.name).join(', '),
      });
    }
  }

  const finalSum = farmSummary(state);
  return {
    seed, difficulty, background,
    status: state.status,
    outcome: state.outcome,
    endYear: state.year,
    yearsPlayed,
    peakAcresBroken,
    peakAcresOwned,
    harvestsTaken,
    totalBushels,
    acresLostToCapacity,
    peakNetWorth,
    peakDebt,
    finalNetWorth: netWorth(state),
    finalAcres: finalSum.acresOwned,
    acresAt1975,
    acresAt2000,
    generations: generationsSeen,
    reachedCentennial: reachedCentennial && state.flags.centennialEarned,
    survivedTo1975: state.outcome ? state.outcome.year >= CENTENNIAL_YEAR : state.year >= CENTENNIAL_YEAR,
    centennialEarned: state.flags.centennialEarned,
    ruinYear: state.status === STATUS.RUINED ? state.outcome.year : null,
    lineEndedYear: state.status === STATUS.LINE_ENDED ? state.outcome.year : null,
    timeline,
    ledgerLength: state.ledger.length,
  };
}

/** Play N runs and aggregate. */
export function playBatch({ runs = 100, difficulty = 'settler', background = 'ontario', seed0 = 1, botOpts = {} }) {
  const results = [];
  const failures = [];
  for (let i = 0; i < runs; i++) {
    try {
      const r = playRun({ seed: seed0 + i, difficulty, background, botOpts });
      assertProgress(r);
      results.push(r);
    } catch (err) {
      failures.push({ seed: seed0 + i, error: err.message, kind: err.constructor.name });
    }
  }
  return { results, failures, ...aggregate(results) };
}

export function aggregate(results) {
  if (!results.length) return { n: 0 };
  const n = results.length;
  const pick = (f) => results.map(f).filter((v) => v != null && !Number.isNaN(v));
  return {
    n,
    centennialRate: results.filter((r) => r.centennialEarned).length / n,
    ruinRate: results.filter((r) => r.status === STATUS.RUINED).length / n,
    lineEndRate: results.filter((r) => r.status === STATUS.LINE_ENDED).length / n,
    completeRate: results.filter((r) => r.status === STATUS.COMPLETE).length / n,
    medianYearsPlayed: median(pick((r) => r.yearsPlayed)),
    medianAcres2000: median(pick((r) => (r.status === STATUS.COMPLETE ? r.acresAt2000 : null))),
    medianFinalAcres: median(pick((r) => r.finalAcres)),
    medianPeakAcres: median(pick((r) => r.peakAcresOwned)),
    medianRuinYear: median(pick((r) => r.ruinYear)),
    medianGenerations: median(pick((r) => r.generations)),
    // Only completed runs. Averaging generations over runs that ended in 1890
    // and runs that reached 2000 produces a number that describes neither.
    medianGenerationsCompleted: median(
      results.filter((r) => r.status === STATUS.COMPLETE).map((r) => r.generations)
    ),
    // Runs over before the farm was ever established. Not a bug, but if this
    // is high the opening is too punishing to be worth playing.
    earlyEndRate: results.filter((r) => r.yearsPlayed < 5).length / n,
    stillbornRate: results.filter((r) => r.yearsPlayed < 3).length / n,
    medianNetWorth: median(pick((r) => r.finalNetWorth)),
    // A second axis the survival rate ignores. A strategy can lower the odds of
    // holding the land and still be the right one — that is a trade, not a bug,
    // and reporting only the survival rate hides which it is.
    meanNetWorth: results.reduce((s, r) => s + (r.finalNetWorth || 0), 0) / n,
    meanBushels: results.reduce((s, r) => s + (r.totalBushels || 0), 0) / n,
    medianHarvests: median(pick((r) => r.harvestsTaken)),
    medianBushels: median(pick((r) => r.totalBushels)),
    totalAcresLostToCapacity: pick((r) => r.acresLostToCapacity).reduce((a, b) => a + b, 0),
  };
}

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function fmtPct(v) { return v == null ? '  -  ' : (v * 100).toFixed(1).padStart(5) + '%'; }
export function fmtNum(v, w = 7) { return v == null ? '-'.padStart(w) : Math.round(v).toLocaleString().padStart(w); }

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const runs = parseInt(args.runs || '50', 10);
  const difficulty = args.tier || 'settler';
  const background = args.background || 'ontario';
  const seed0 = parseInt(args.seed || '1', 10);

  if (args.trace) {
    // A single traced run, printed year by year. This is the view that catches
    // "the farm never grew" in ten seconds of reading.
    const r = playRun({ seed: seed0, difficulty, background, trace: true });
    assertProgress(r);
    console.log(`\nTraced run — seed ${seed0}, ${difficulty}, ${background}\n`);
    console.log('year  acres broken    cash    debt     worth  bushels gen  events');
    for (const t of r.timeline) {
      if (parseInt(args.trace, 10) > 1 || t.year % 5 === 0 || t.events) {
        console.log(
          String(t.year).padEnd(6) + String(t.acres).padStart(5) + String(t.broken).padStart(7) +
          fmtNum(t.cash, 8) + fmtNum(t.debt, 8) + fmtNum(t.worth, 10) + fmtNum(t.bushels, 8) +
          String(t.gen).padStart(4) + '  ' + t.events.slice(0, 44)
        );
      }
    }
    console.log(`\noutcome: ${r.status} in ${r.endYear} — ${r.outcome?.reason || 'reached the end'}`);
    console.log(`years played ${r.yearsPlayed}, harvests ${r.harvestsTaken}, peak acres ${r.peakAcresOwned}, generations ${r.generations}`);
    return;
  }

  const t0 = Date.now();
  const batch = playBatch({ runs, difficulty, background, seed0 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n${runs} runs — ${difficulty} / ${background} — ${secs}s\n`);
  if (batch.failures.length) {
    console.log(`!! ${batch.failures.length} run(s) failed the progress check:`);
    for (const f of batch.failures.slice(0, 5)) console.log(`   seed ${f.seed}: ${f.error}`);
    console.log();
  }
  // Quantities, not verdicts.
  console.log(`  runs completing the progress check   ${batch.n}/${runs}`);
  console.log(`  median years played                  ${fmtNum(batch.medianYearsPlayed, 6)}`);
  console.log(`  median harvests taken                ${fmtNum(batch.medianHarvests, 6)}`);
  console.log(`  median bushels over the run          ${fmtNum(batch.medianBushels, 6)}`);
  console.log(`  median generations (runs to 2000)    ${fmtNum(batch.medianGenerationsCompleted, 6)}`);
  console.log(`  runs over inside 5 years             ${fmtPct(batch.earlyEndRate)}`);
  console.log();
  console.log(`  reached 1975 with the plaque         ${fmtPct(batch.centennialRate)}`);
  console.log(`  lost the farm (foreclosure/estate)   ${fmtPct(batch.ruinRate)}`);
  console.log(`  line ended (no heir)                 ${fmtPct(batch.lineEndRate)}`);
  console.log(`  still farming in 2000                ${fmtPct(batch.completeRate)}`);
  console.log();
  console.log(`  median acres, 2000                   ${fmtNum(batch.medianAcres2000, 6)}`);
  console.log(`  median peak acres                    ${fmtNum(batch.medianPeakAcres, 6)}`);
  console.log(`  median year of ruin                  ${batch.medianRuinYear ?? '   -'}`);
  console.log(`  acres lost to harvest capacity       ${fmtNum(batch.totalAcresLostToCapacity, 6)}`);
  console.log();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
