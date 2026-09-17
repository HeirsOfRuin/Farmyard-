// Do the difficulty tiers actually differ?
//
// difficulty.data.js CLAIMS four differences between the tiers. This file
// measures them. A difference that exists only in the menu copy is not a
// difference, and if one cannot be shown here it should come out of the data
// rather than stay as a promise to the player.
//
// Two traps in the technique itself, both worth naming because both are easy:
//
//   SAMPLE SIZE. With n runs, one run is worth 100/n points of any rate. A
//   delta smaller than about three runs' worth is noise, and reading it as a
//   result is how a beneficial subsystem gets recorded as harmful. The noise
//   floor is printed alongside every comparison so it cannot be ignored.
//
//   ATTRIBUTION. An ablation locates something, it does not explain it. If
//   removing a subsystem changes nothing, that may mean the subsystem is
//   decoration — or that the reference bot never used it well. Those need
//   different follow-ups and this file does not pretend to distinguish them.
//
// Usage: node sim/verify-tiers.js [--runs=300] [--background=ontario]

import { playBatch, median, fmtPct, fmtNum } from './run.js';
import { DIFFICULTY_LIST, CLAIMED_DIFFERENCES } from '../src/data/difficulty.data.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const METRIC_LABEL = {
  centennialRate: 'reached 1975 with the plaque',
  completeRate: 'still farming in 2000',
  medianAcres2000: 'median acres in 2000',
  medianYearsPlayed: 'median years the line lasted',
  ruinRate: 'lost the farm',
  medianRuinYear: 'median year of ruin',
};

function fmtMetric(metric, v) {
  if (v == null) return '    —';
  if (metric.endsWith('Rate')) return fmtPct(v);
  if (metric === 'medianRuinYear') return String(Math.round(v)).padStart(6);
  return fmtNum(v, 6);
}

export function verifyTiers({ runs = 300, background = 'ontario', quiet = false } = {}) {
  const results = {};
  const t0 = Date.now();

  for (const d of DIFFICULTY_LIST) {
    results[d.id] = playBatch({ runs, difficulty: d.id, background, seed0: 1 });
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // One run is worth this much of any rate; anything smaller is noise.
  const runWorth = 100 / runs;
  const noiseFloor = runWorth * 3;

  const lines = [];
  lines.push('');
  lines.push(`Tier verification — ${runs} seeded runs per tier, ${background}, ${secs}s`);
  lines.push(`One run is worth ${runWorth.toFixed(2)} points; treat any gap under ` +
    `${noiseFloor.toFixed(1)} points as noise.`);
  lines.push('');

  const header = 'metric'.padEnd(34) + DIFFICULTY_LIST.map((d) => d.name.padStart(13)).join('');
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const claim of CLAIMED_DIFFERENCES) {
    const row = (METRIC_LABEL[claim.metric] || claim.metric).padEnd(34);
    const vals = DIFFICULTY_LIST.map((d) => results[d.id][claim.metric]);
    lines.push(row + vals.map((v) => fmtMetric(claim.metric, v).padStart(13)).join(''));
  }

  lines.push('');
  lines.push('supporting figures'.padEnd(34) + DIFFICULTY_LIST.map((d) => d.name.padStart(13)).join(''));
  lines.push('-'.repeat(header.length));
  for (const [key, label] of [
    ['completeRate', 'still farming in 2000'],
    ['ruinRate', 'lost the farm (confounded)'],
    ['lineEndRate', 'line ended (no heir)'],
    ['medianGenerationsCompleted', 'generations (runs to 2000)'],
    ['earlyEndRate', 'over inside 5 years'],
  ]) {
    const row = label.padEnd(34);
    lines.push(row + DIFFICULTY_LIST.map((d) => {
      const v = results[d.id][key];
      return (key.endsWith('Rate') ? fmtPct(v) : fmtNum(v, 6)).padStart(13);
    }).join(''));
  }

  // --- does each claim hold? ---
  lines.push('');
  lines.push('Claimed differences, checked:');
  const failures = [];
  for (const claim of CLAIMED_DIFFERENCES) {
    const series = DIFFICULTY_LIST.map((d) => ({ name: d.name, v: results[d.id][claim.metric] }));
    const usable = series.filter((s) => s.v != null);
    if (usable.length < 2) {
      lines.push(`  ?  ${claim.label}: not enough data to judge`);
      continue;
    }
    // Easiest tier first; 'desc' means it should fall across the tiers.
    let ok = true;
    let noisy = false;
    for (let i = 1; i < usable.length; i++) {
      const prev = usable[i - 1].v;
      const cur = usable[i].v;
      // Rates are stored as FRACTIONS (0.48), so a gap has to be scaled to
      // points before it is compared with a floor expressed in points.
      // Without this an 86% -> 48% difference read as 0.38 points and got
      // dismissed as noise — the measurement instrument lying about the
      // measurement.
      const gapPts = claim.metric.endsWith('Rate')
        ? Math.abs(cur - prev) * 100
        : (Math.abs(cur - prev) / Math.max(1, Math.abs(prev))) * 100;
      if (gapPts < noiseFloor) {
        noisy = true;
        continue; // too small to call either way; not a failure
      }
      if (claim.direction === 'desc' && cur > prev) ok = false;
      if (claim.direction === 'asc' && cur < prev) ok = false;
    }
    const detail = usable.map((s) => `${s.name} ${fmtMetric(claim.metric, s.v).trim()}`).join('  ->  ');
    if (!ok) {
      failures.push(claim.label);
      lines.push(`  NO ${claim.label}: ${detail}  — does not move the way the tier copy says`);
    } else if (noisy) {
      lines.push(`  ~  ${claim.label}: ${detail}  — right direction, but inside the noise floor`);
    } else {
      lines.push(`  OK ${claim.label}: ${detail}`);
    }
  }

  const harnessFailures = DIFFICULTY_LIST
    .map((d) => ({ d, f: results[d.id].failures.length }))
    .filter((x) => x.f > 0);
  if (harnessFailures.length) {
    lines.push('');
    for (const { d, f } of harnessFailures) {
      lines.push(`  !! ${d.name}: ${f} run(s) failed the progress check`);
    }
  }

  lines.push('');
  if (!quiet) console.log(lines.join('\n'));
  return { results, failures, noiseFloor, text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Ablations: turn one subsystem off and diff against the baseline.
// ---------------------------------------------------------------------------

const ABLATIONS = [
  { id: 'noMechanize', label: 'never upgrades machinery' },
  { id: 'noCredit', label: 'never borrows' },
  { id: 'noLivestock', label: 'keeps no livestock' },
  { id: 'noTech', label: 'adopts no technology' },
  { id: 'noExpand', label: 'never buys land' },
  { id: 'noWill', label: 'never writes a will' },
  { id: 'noDiversify', label: 'grows only wheat' },
];

export function runAblations({ runs = 200, difficulty = 'settler', background = 'ontario' } = {}) {
  const base = playBatch({ runs, difficulty, background, seed0: 1 });
  const runWorth = 100 / runs;
  const noise = runWorth * 3;

  const lines = [];
  lines.push('');
  lines.push(`Ablations — ${runs} runs each, ${difficulty}, same seeds throughout`);
  lines.push(`Noise floor ${noise.toFixed(1)} points. A second axis is shown because a`);
  lines.push('metric moving is not evidence a subsystem helped.');
  lines.push('');
  lines.push('variant'.padEnd(30) + 'centennial'.padStart(12) + 'delta'.padStart(9) +
    'acres 2000'.padStart(12) + 'delta'.padStart(9));
  lines.push('-'.repeat(72));
  lines.push('baseline'.padEnd(30) + fmtPct(base.centennialRate).padStart(12) + ''.padStart(9) +
    fmtNum(base.medianAcres2000, 10).padStart(12) + ''.padStart(9));

  for (const ab of ABLATIONS) {
    const r = playBatch({ runs, difficulty, background, seed0: 1, botOpts: { [ab.id]: true } });
    const dCent = (r.centennialRate - base.centennialRate) * 100;
    const dAcres = (r.medianAcres2000 ?? 0) - (base.medianAcres2000 ?? 0);
    const mark = Math.abs(dCent) < noise ? ' ~' : '';
    lines.push(
      ab.label.padEnd(30) +
      fmtPct(r.centennialRate).padStart(12) +
      `${dCent >= 0 ? '+' : ''}${dCent.toFixed(1)}${mark}`.padStart(9) +
      fmtNum(r.medianAcres2000, 10).padStart(12) +
      `${dAcres >= 0 ? '+' : ''}${Math.round(dAcres)}`.padStart(9)
    );
  }
  lines.push('');
  lines.push('~ marks a change inside the noise floor: not a result.');
  console.log(lines.join('\n'));
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const runs = parseInt(args.runs || '300', 10);
  const background = args.background || 'ontario';
  if (args.ablate) {
    runAblations({ runs: parseInt(args.runs || '200', 10), background });
    return;
  }
  const { failures } = verifyTiers({ runs, background });
  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
