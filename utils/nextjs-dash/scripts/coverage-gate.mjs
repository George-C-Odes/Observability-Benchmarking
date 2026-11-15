import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = fileURLToPath(new URL('../', import.meta.url));

function counters(data) {
  return Object.fromEntries(
    ['lines', 'branches'].map((metric) => {
      const { covered, total } = data[metric];
      if (
        !Number.isSafeInteger(covered) ||
        !Number.isSafeInteger(total) ||
        covered < 0 ||
        total < covered
      ) {
        throw new Error(`Invalid ${metric} counters`);
      }
      return [metric, { covered, total }];
    }),
  );
}

function addReportTotals(report, summary, names, environment, totals) {
  for (const metric of ['lines', 'branches']) {
    let covered = 0n;
    let total = 0n;
    for (const name of names) {
      const values = counters(report[name])[metric];
      covered += BigInt(values.covered);
      total += BigInt(values.total);
    }
    if (covered !== BigInt(summary[metric].covered) || total !== BigInt(summary[metric].total)) {
      throw new Error(`Inconsistent ${environment} ${metric} totals`);
    }
    totals[metric].covered += covered;
    totals[metric].total += total;
  }
}

export function checkCoverage(root = moduleRoot) {
  const policy = JSON.parse(readFileSync(path.join(root, 'coverage-policy.json'), 'utf8'));
  const totals = { lines: { covered: 0n, total: 0n }, branches: { covered: 0n, total: 0n } };
  const files = new Set();
  for (const environment of ['node', 'dom']) {
    const report = JSON.parse(
      readFileSync(path.join(root, 'coverage', environment, 'coverage-summary.json'), 'utf8'),
    );
    const summary = counters(report.total);
    const names = Object.keys(report).filter((name) => name !== 'total');
    if (!summary.lines.total || !names.length || names.some((name) => files.has(name))) {
      throw new Error(`Empty or overlapping ${environment} coverage`);
    }
    for (const name of names) files.add(name);
    addReportTotals(report, summary, names, environment, totals);
  }
  let passed = true;
  for (const metric of ['lines', 'branches']) {
    const minimum = policy.thresholds[metric];
    if (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum < 0 || minimum > 100) {
      throw new Error(`Invalid ${metric} threshold`);
    }
    const { covered, total } = totals[metric];
    // Convert the configured decimal percentage to an exact rational number.
    const [mantissa, exponent = '0'] = String(minimum).split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const places = fraction.length - Number(exponent);
    const scale = 10n ** BigInt(Math.max(places, 0));
    const limit = BigInt(whole + fraction) * 10n ** BigInt(Math.max(-places, 0));
    const ok = total === 0n ? metric === 'branches' : covered * 100n * scale >= total * limit;
    console.log(`${metric}: ${covered}/${total}, minimum ${minimum}%: ${ok ? 'PASS' : 'FAIL'}`);
    passed &&= ok;
  }
  return passed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = checkCoverage() ? 0 : 1;
  } catch (error) {
    console.error(`Coverage gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
