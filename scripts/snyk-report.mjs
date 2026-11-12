const severities = ['critical', 'high', 'medium', 'low', 'unknown'];
const labels = { code: 'Snyk Code', test: 'Snyk Open Source', monitor: 'Snyk Monitor' };
const rank = (severity) => severities.includes(severity) ? severities.indexOf(severity) : severities.length - 1;
const counts = () => Object.fromEntries(severities.map((severity) => [severity, 0]));

function text(value, limit = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
}

function cell(value) {
  return text(value).replace(/[&<>|`*_[\]\\]/g, (character) => `&#${character.codePointAt(0)};`);
}

function commandData(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function severityOf(rule, result, dependency) {
  const severity = dependency?.severityWithCritical || dependency?.severity;
  if (severities.includes(severity)) return severity;
  const score = Number(rule?.properties?.['security-severity']);
  if (Number.isFinite(score) && score > 0 && score <= 10) {
    return score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
  }
  return { error: 'high', warning: 'medium', note: 'low' }[result.level] || 'unknown';
}

function mergeDependencyIssue(previous, issue) {
  const preferred = !previous || rank(issue.severityWithCritical || issue.severity)
    < rank(previous.severityWithCritical || previous.severity) ? issue : previous;
  return { ...preferred, fixedIn: [...new Set([
    ...(Array.isArray(previous?.fixedIn) ? previous.fixedIn : []),
    ...(Array.isArray(issue.fixedIn) ? issue.fixedIn : []),
  ])] };
}

function indexDependencyIssues(dependencies) {
  const dependencyIssues = new Map();
  for (const project of Array.isArray(dependencies) ? dependencies : [dependencies]) {
    for (const issue of Array.isArray(project?.vulnerabilities) ? project.vulnerabilities : []) {
      if (typeof issue?.id !== 'string') continue;
      dependencyIssues.set(issue.id, mergeDependencyIssue(dependencyIssues.get(issue.id), issue));
    }
  }
  return dependencyIssues;
}

function countCoverage(coverageEntries) {
  let filesScanned = 0;
  let filesNotAnalyzed = 0;
  for (const coverage of coverageEntries) {
    if (Number.isInteger(coverage.files) && coverage.files >= 0) {
      if (coverage.isSupported) filesScanned += coverage.files;
      else filesNotAnalyzed += coverage.files;
    }
  }
  return { filesScanned, filesNotAnalyzed };
}

function recordResult(run, result, rulesById, dependencyIssues, issues, projects, bySeverity) {
  const rules = run.tool.driver.rules || [];
  const rule = rulesById.get(result.ruleId || result.rule?.id) || rules[result.ruleIndex ?? result.rule?.index];
  const id = result.ruleId || result.rule?.id || rule?.id || 'Unspecified rule';
  const dependency = dependencyIssues.get(id);
  const severity = severityOf(rule, result, dependency);
  let issue = issues.get(id);
  if (!issue) {
    issue = { id, severity, title: dependency?.title || rule?.shortDescription?.text || result.message?.text || id,
      package: dependency?.packageName || dependency?.name || '',
      fixedIn: new Set(), occurrences: 0, files: new Set() };
    issues.set(id, issue);
  }
  if (rank(severity) < rank(issue.severity)) issue.severity = severity;
  for (const version of dependency?.fixedIn || []) issue.fixedIn.add(text(version, 60));
  issue.occurrences += 1;
  bySeverity[severity] += 1;
  const location = result.locations?.[0]?.physicalLocation?.artifactLocation;
  const uri = location?.uri || run.artifacts?.[location?.index]?.location?.uri || '(location unavailable)';
  issue.files.add(uri);
  if (!projects.has(uri)) projects.set(uri, { file: uri, occurrences: 0, bySeverity: counts() });
  const project = projects.get(uri);
  project.occurrences += 1;
  project.bySeverity[severity] += 1;
}

function compareProjects(a, b) {
  for (const severity of severities) {
    const difference = b.bySeverity[severity] - a.bySeverity[severity];
    if (difference) return difference;
  }
  return a.file.localeCompare(b.file);
}

// Count SARIF results (the same occurrences uploaded to Code Scanning), not
// every transitive dependency path in test.json. JSON only enriches the details.
export function summarizeSarif(sarif, dependencies) {
  if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    throw new Error('No valid SARIF 2.1.0 overview is available');
  }
  const dependencyIssues = indexDependencyIssues(dependencies);
  const issues = new Map();
  const projects = new Map();
  const bySeverity = counts();
  let total = 0;
  let filesScanned = 0;
  let filesNotAnalyzed = 0;
  for (const run of sarif.runs) {
    if (!Array.isArray(run.results) || !run.tool?.driver) throw new Error('Incomplete SARIF overview data');
    const rules = run.tool.driver.rules || [];
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    const coverage = countCoverage(run.properties?.coverage || []);
    filesScanned += coverage.filesScanned;
    filesNotAnalyzed += coverage.filesNotAnalyzed;
    for (const result of run.results) {
      recordResult(run, result, rulesById, dependencyIssues, issues, projects, bySeverity);
      total += 1;
    }
  }
  const uniqueBySeverity = counts();
  for (const issue of issues.values()) uniqueBySeverity[issue.severity] += 1;
  return {
    total, unique: issues.size, bySeverity, uniqueBySeverity, projectsScanned: sarif.runs.length,
    filesScanned, filesNotAnalyzed,
    issues: [...issues.values()].sort((a, b) => rank(a.severity) - rank(b.severity)
      || b.occurrences - a.occurrences || a.id.localeCompare(b.id)),
    projects: [...projects.values()].sort(compareProjects),
  };
}

function appendSeverityTable(rows, overview) {
  rows.push('', '| Severity | Unique issues | Occurrences |', '| --- | ---: | ---: |');
  for (const severity of severities) {
    if (severity !== 'unknown' || overview.bySeverity.unknown) {
      rows.push(`| ${severity} | ${overview.uniqueBySeverity[severity]} | ${overview.bySeverity[severity]} |`);
    }
  }
  rows.push('', 'Unique issues are deduplicated by rule/vulnerability ID; occurrences count SARIF results, not dependency paths.', '');
}

function appendAffectedFiles(rows, overview) {
  rows.push('#### Most affected files (up to 10)', '', '| File | Critical | High | Medium | Low | Unknown | Occurrences |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const project of overview.projects.slice(0, 10)) {
    rows.push(`| ${cell(project.file)} | ${severities.map((severity) => project.bySeverity[severity]).join(' | ')} | ${project.occurrences} |`);
  }
  if (overview.projects.length > 10) rows.push('', `${overview.projects.length - 10} additional affected files are in Code Scanning and the artifact.`);
}

function appendPriorityIssues(rows, mode, overview) {
  rows.push('', '#### Highest-priority issues (up to 10)', '', '| Severity | Issue | Package | Affected files | Reported fixed versions |',
    '| --- | --- | --- | ---: | --- |');
  for (const issue of overview.issues.slice(0, 10)) {
    const id = cell(issue.id);
    const link = mode === 'test' && issue.id.startsWith('SNYK-')
      ? `[${id}](https://security.snyk.io/vuln/${encodeURIComponent(issue.id)})` : id;
    rows.push(`| ${issue.severity} | ${link}: ${cell(issue.title)} | ${cell(issue.package) || '—'} | ${issue.files.size} | ${cell([...issue.fixedIn].join(', ')) || 'Not reported'} |`);
  }
  if (overview.unique > 10) rows.push('', `${overview.unique - 10} additional unique issues are in Code Scanning and the artifact.`);
  if (mode === 'test') rows.push('', 'Fixed versions apply to the vulnerable package; transitive dependencies may require a parent/framework upgrade.');
}

function appendOverview(rows, mode, overview, totals) {
  rows.push(totals);
  if (mode === 'test') rows.push(`Dependency projects reported: **${overview.projectsScanned}**.`);
  if (mode === 'code' && (overview.filesScanned || overview.filesNotAnalyzed)) {
    rows.push(`Files analyzed: **${overview.filesScanned}**; files not analyzed: **${overview.filesNotAnalyzed}**.`);
  }
  appendSeverityTable(rows, overview);
  if (overview.projects.length) {
    appendAffectedFiles(rows, overview);
    appendPriorityIssues(rows, mode, overview);
  }
}

function renderIssueAnnotation(issue) {
  return `${issue.severity.toUpperCase()} ${text(issue.id, 100)}: ${text(issue.title, 120)}; ${issue.files.size} affected files${issue.package ? `; ${text(issue.package, 100)}` : ''}${issue.fixedIn.size ? `; fixed in ${text([...issue.fixedIn].join(', '), 80)}` : ''}.`;
}

function renderAnnotation(mode, result, label, overview, totals) {
  if (result === 'clean') return '';

  const message = [result === 'findings'
    ? `Snyk ${mode} reported security findings: ${totals}`
    : `Snyk ${mode} failed to complete; coverage is incomplete. ${overview ? `Partial overview: ${totals}` : totals}`];
  if (overview) {
    message.push(severities.map((severity) => `${severity}: ${overview.bySeverity[severity]}`).join('; '));
    for (const issue of overview.issues.slice(0, 3)) {
      message.push(renderIssueAnnotation(issue));
    }
    if (overview.unique > 3) message.push(`${overview.unique - 3} more unique issues; see the job summary for the breakdown.`);
  }
  message.push('See the job summary, Security → Code scanning, and the snyk-results artifact.');
  const level = result === 'findings' ? 'warning' : 'error';
  return `::${level} title=${label} — ${result === 'findings' ? 'findings overview' : 'scan incomplete'}::${commandData(message.join('\n'))}\n`;
}

export function renderScanReport(mode, result, exitCode, overview, overviewError = '') {
  const label = labels[mode];
  if (!label) throw new Error(`Unknown Snyk report mode: ${mode}`);
  const rows = [`### ${label}`, '', `Result: **${result}** (exit code ${exitCode}).`, ''];
  const totals = overview
    ? `${overview.unique} unique issues; ${overview.total} occurrences across ${overview.projects.length} affected files.`
    : 'Issue counts unavailable; see retained scan diagnostics.';
  if (result === 'error') rows.push('**Scan incomplete: any counts below are partial, not a clean bill of health.**', '');
  if (overview) {
    appendOverview(rows, mode, overview, totals);
  } else if (mode !== 'monitor') {
    rows.push(`Overview unavailable: ${cell(overviewError || 'No SARIF report was produced.')}`, '');
  }
  if (overview && overviewError) rows.push('', cell(overviewError), '');
  rows.push('', 'Full findings: **Security → Code scanning**. Raw reports and logs: **snyk-results** artifact.', '');
  return { summary: `${rows.join('\n')}\n`, annotation: renderAnnotation(mode, result, label, overview, totals) };
}
