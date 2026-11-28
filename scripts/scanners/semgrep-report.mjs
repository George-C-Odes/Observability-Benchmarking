import { appendFileSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Fixed report location below the workspace; the scanner action writes it.
export const REPORT_DIRECTORY = 'semgrep-results';
export const REPORT_FILE = 'semgrep.sarif';
const levels = ['error', 'warning', 'note', 'none'];
const ANNOTATION_LIMIT = 10;
const TABLE_LIMIT = 25;

function text(value, limit = 200) {
  let result = '';
  for (const character of String(value ?? '').slice(0, limit)) {
    const code = character.codePointAt(0);
    result += code < 0x20 || code === 0x7f ? ' ' : character;
  }
  return result;
}

function cell(value, limit = 200) {
  return text(value, limit).replace(/[&<>|`*_[\]\\]/g, (character) => `&#${character.codePointAt(0)};`);
}

function commandData(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function commandProperty(value) {
  return commandData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

// Annotate only plain workspace-relative paths; anything else stays in the table.
export function safeRelativePath(uri) {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 300) return '';
  if (!/^[\w./@+-]+$/.test(uri) || uri.startsWith('/')) return '';
  return uri.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ? '' : uri;
}

function isSuppressed(result) {
  const suppressions = Array.isArray(result.suppressions) ? result.suppressions : [];
  return suppressions.some((suppression) => suppression?.status === undefined || suppression?.status === 'accepted');
}

function levelOf(result, rule) {
  const level = result.level ?? rule?.defaultConfiguration?.level ?? 'warning';
  return levels.includes(level) ? level : 'warning';
}

function locationOf(result, run) {
  const physical = result.locations?.[0]?.physicalLocation;
  const artifact = physical?.artifactLocation;
  const uri = artifact?.uri ?? run.artifacts?.[artifact?.index]?.location?.uri ?? '';
  const line = Number.isInteger(physical?.region?.startLine) && physical.region.startLine > 0
    ? physical.region.startLine : 0;
  return { uri: String(uri), line };
}

function invocationFailures(run) {
  const invocations = Array.isArray(run.invocations) ? run.invocations : [];
  return invocations.filter((invocation) => invocation?.executionSuccessful === false).length;
}

function ruleIndex(run) {
  const rules = Array.isArray(run.tool.driver.rules) ? run.tool.driver.rules : [];
  return { rules, byId: new Map(rules.map((rule) => [rule?.id, rule])) };
}

function toFinding(result, run, index) {
  const rule = index.byId.get(result.ruleId) ?? index.rules[result.ruleIndex];
  const ruleId = String(result.ruleId ?? rule?.id ?? 'unspecified-rule');
  return {
    ruleId,
    level: levelOf(result, rule),
    message: result.message?.text ?? rule?.shortDescription?.text ?? ruleId,
    ...locationOf(result, run),
  };
}

const levelRank = (level) => levels.indexOf(level);

function compareFindings(a, b) {
  return levelRank(a.level) - levelRank(b.level)
    || a.uri.localeCompare(b.uri) || a.line - b.line || a.ruleId.localeCompare(b.ruleId);
}

// Every unsuppressed SARIF result is a finding. On pull requests semgrep ci
// writes only findings new relative to the merge base; full scans write all.
export function summarizeSarif(sarif) {
  if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    throw new Error('No valid SARIF 2.1.0 report is available');
  }
  const findings = [];
  let suppressed = 0;
  let failedInvocations = 0;
  for (const run of sarif.runs) {
    if (!Array.isArray(run?.results) || !run.tool?.driver) throw new Error('Incomplete SARIF run data');
    failedInvocations += invocationFailures(run);
    const index = ruleIndex(run);
    for (const result of run.results) {
      if (isSuppressed(result)) suppressed += 1;
      else findings.push(toFinding(result, run, index));
    }
  }
  const byLevel = Object.fromEntries(levels.map((level) => [level, 0]));
  for (const finding of findings) byLevel[finding.level] += 1;
  return {
    findings: findings.toSorted(compareFindings),
    rules: new Set(findings.map((finding) => finding.ruleId)).size,
    byLevel, suppressed, failedInvocations,
  };
}

export function gateResult(scanOutcome, overview) {
  if (!overview || scanOutcome !== 'success' || overview.failedInvocations > 0) {
    return overview?.findings.length ? 'findings-incomplete' : 'error';
  }
  return overview.findings.length ? 'findings' : 'clean';
}

function location(finding) {
  return finding.line ? `${finding.uri}:${finding.line}` : finding.uri || '(location unavailable)';
}

function appendFindings(rows, overview) {
  rows.push('', '| Level | Count |', '| --- | ---: |');
  for (const level of levels) {
    if (overview.byLevel[level]) rows.push(`| ${level} | ${overview.byLevel[level]} |`);
  }
  rows.push('', `#### Findings (up to ${TABLE_LIMIT})`, '', '| Level | Rule | Location | Message |', '| --- | --- | --- | --- |');
  for (const finding of overview.findings.slice(0, TABLE_LIMIT)) {
    rows.push(`| ${finding.level} | ${cell(finding.ruleId, 150)} | ${cell(location(finding), 200)} | ${cell(finding.message, 200)} |`);
  }
  if (overview.findings.length > TABLE_LIMIT) {
    rows.push('', `${overview.findings.length - TABLE_LIMIT} additional findings are in Code Scanning and the semgrep-results artifact.`);
  }
}

const verdicts = {
  clean: '**Passed:** the scan completed without findings.',
  findings: '**Failed:** Semgrep reported findings. Fix them, or triage them in Semgrep AppSec Platform.',
  'findings-incomplete': '**Failed:** Semgrep reported findings and the scan did not complete; the list below is partial.',
  error: '**Failed:** the scan did not complete or produced no valid report; this is not a clean result.',
};

function renderSummary(result, scanOutcome, overview, overviewError) {
  const rows = ['### Semgrep findings', '', verdicts[result], '', `Scan step outcome: **${cell(scanOutcome || 'not completed', 40)}**.`];
  if (overview) {
    rows.push(`Findings: **${overview.findings.length}** from **${overview.rules}** rules; suppressed in source: **${overview.suppressed}**.`);
    if (overview.failedInvocations) rows.push(`Failed scanner invocations: **${overview.failedInvocations}**.`);
    if (overview.findings.length) appendFindings(rows, overview);
  } else {
    rows.push('', `Report unavailable: ${cell(overviewError || 'No SARIF report was produced.')}`);
  }
  rows.push('', 'Full findings: **Security → Code scanning** (category `semgrep`). Raw report: **semgrep-results** artifact.', '');
  return `${rows.join('\n')}\n`;
}

function renderAnnotation(finding) {
  const file = safeRelativePath(finding.uri);
  const properties = [file && `file=${commandProperty(file)}`, file && finding.line && `line=${finding.line}`,
    `title=${commandProperty(`Semgrep ${text(finding.ruleId, 120)}`)}`].filter(Boolean).join(',');
  return `::error ${properties}::${commandData(text(finding.message, 300))}\n`;
}

function renderAnnotations(result, overview) {
  if (result === 'clean') return '';
  if (!overview) return '::error title=Semgrep scan incomplete::No valid Semgrep report is available; see the job summary and semgrep-results artifact.\n';
  const annotations = overview.findings.slice(0, ANNOTATION_LIMIT).map(renderAnnotation);
  if (overview.findings.length > ANNOTATION_LIMIT) {
    annotations.push(`::error title=Semgrep findings::${overview.findings.length - ANNOTATION_LIMIT} more findings; see the job summary.\n`);
  }
  if (result !== 'findings') {
    annotations.push('::error title=Semgrep scan incomplete::The scan did not complete; findings may be partial.\n');
  }
  return annotations.join('');
}

export function renderReport(scanOutcome, overview, overviewError = '') {
  const result = gateResult(scanOutcome, overview);
  return { result, summary: renderSummary(result, scanOutcome, overview, overviewError),
    annotations: renderAnnotations(result, overview) };
}

// Reject symlinked report paths so the gate reads only the scanner's output.
export function readReport(workingDirectory) {
  const directory = path.join(workingDirectory, REPORT_DIRECTORY);
  const file = path.join(directory, REPORT_FILE);
  if (!lstatSync(directory).isDirectory()) throw new Error(`${REPORT_DIRECTORY} is not a regular directory`);
  if (!lstatSync(file).isFile()) throw new Error(`${REPORT_DIRECTORY}/${REPORT_FILE} is not a regular file`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function loadOverview(workingDirectory) {
  try {
    return { overview: summarizeSarif(readReport(workingDirectory)), overviewError: '' };
  } catch (error) {
    return { overview: undefined, overviewError: error.code === 'ENOENT' ? 'No SARIF report was produced.' : error.message };
  }
}

export function runGate({
  workingDirectory = process.cwd(),
  scanOutcome = process.env.SCAN_OUTCOME,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
  stdout = process.stdout,
} = {}) {
  const { overview, overviewError } = loadOverview(workingDirectory);
  const report = renderReport(scanOutcome, overview, overviewError);
  if (summaryPath) appendFileSync(summaryPath, report.summary);
  stdout.write(report.annotations);
  stdout.write(`Semgrep gate result: ${report.result}.\n`);
  return { result: report.result, exitCode: { clean: 0, findings: 1 }[report.result] ?? 2 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = runGate().exitCode;
  } catch (error) {
    console.error(`::error title=Semgrep gate::${commandData(error.message)}`);
    process.exitCode = 2;
  }
}
