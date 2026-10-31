const severities = ['critical', 'high', 'medium', 'low', 'unknown'];
const labels = { code: 'Snyk Code', test: 'Snyk Open Source', monitor: 'Snyk Monitor' };
const rank = (severity) => severities.includes(severity) ? severities.indexOf(severity) : severities.length - 1;
const counts = () => Object.fromEntries(severities.map((severity) => [severity, 0]));

function text(value, limit = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
}

function cell(value) {
  return text(value).replace(/[&<>|`*_[\]\\]/g, (character) => `&#${character.charCodeAt(0)};`);
}

function commandData(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
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

// Count SARIF results (the same occurrences uploaded to Code Scanning), not
// every transitive dependency path in test.json. JSON only enriches the details.
export function summarizeSarif(sarif, dependencies) {
  if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    throw new Error('No valid SARIF 2.1.0 overview is available');
  }
  const dependencyIssues = new Map();
  for (const project of Array.isArray(dependencies) ? dependencies : [dependencies]) {
    for (const issue of Array.isArray(project?.vulnerabilities) ? project.vulnerabilities : []) {
      if (typeof issue?.id !== 'string') continue;
      const previous = dependencyIssues.get(issue.id);
      const preferred = !previous || rank(issue.severityWithCritical || issue.severity)
        < rank(previous.severityWithCritical || previous.severity) ? issue : previous;
      dependencyIssues.set(issue.id, { ...preferred, fixedIn: [...new Set([
        ...(Array.isArray(previous?.fixedIn) ? previous.fixedIn : []),
        ...(Array.isArray(issue.fixedIn) ? issue.fixedIn : []),
      ])] });
    }
  }
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
    for (const coverage of run.properties?.coverage || []) {
      if (Number.isInteger(coverage.files) && coverage.files >= 0) {
        if (coverage.isSupported) filesScanned += coverage.files;
        else filesNotAnalyzed += coverage.files;
      }
    }
    for (const result of run.results) {
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
      total += 1;
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
  }
  const uniqueBySeverity = counts();
  for (const issue of issues.values()) uniqueBySeverity[issue.severity] += 1;
  return {
    total, unique: issues.size, bySeverity, uniqueBySeverity, projectsScanned: sarif.runs.length,
    filesScanned, filesNotAnalyzed,
    issues: [...issues.values()].sort((a, b) => rank(a.severity) - rank(b.severity)
      || b.occurrences - a.occurrences || a.id.localeCompare(b.id)),
    projects: [...projects.values()].sort((a, b) => {
      for (const severity of severities) {
        const difference = b.bySeverity[severity] - a.bySeverity[severity];
        if (difference) return difference;
      }
      return a.file.localeCompare(b.file);
    }),
  };
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
    rows.push(totals);
    if (mode === 'test') rows.push(`Dependency projects reported: **${overview.projectsScanned}**.`);
    if (mode === 'code' && (overview.filesScanned || overview.filesNotAnalyzed)) {
      rows.push(`Files analyzed: **${overview.filesScanned}**; files not analyzed: **${overview.filesNotAnalyzed}**.`);
    }
    rows.push('', '| Severity | Unique issues | Occurrences |', '| --- | ---: | ---: |');
    for (const severity of severities) {
      if (severity !== 'unknown' || overview.bySeverity.unknown) {
        rows.push(`| ${severity} | ${overview.uniqueBySeverity[severity]} | ${overview.bySeverity[severity]} |`);
      }
    }
    rows.push('', 'Unique issues are deduplicated by rule/vulnerability ID; occurrences count SARIF results, not dependency paths.', '');
    if (overview.projects.length) {
      rows.push('#### Most affected files (up to 10)', '', '| File | Critical | High | Medium | Low | Unknown | Occurrences |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
      for (const project of overview.projects.slice(0, 10)) {
        rows.push(`| ${cell(project.file)} | ${severities.map((severity) => project.bySeverity[severity]).join(' | ')} | ${project.occurrences} |`);
      }
      if (overview.projects.length > 10) rows.push('', `${overview.projects.length - 10} additional affected files are in Code Scanning and the artifact.`);
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
  } else if (mode !== 'monitor') {
    rows.push(`Overview unavailable: ${cell(overviewError || 'No SARIF report was produced.')}`, '');
  }
  if (overview && overviewError) rows.push('', cell(overviewError), '');
  rows.push('', 'Full findings: **Security → Code scanning**. Raw reports and logs: **snyk-results** artifact.', '');
  let annotation = '';
  if (result !== 'clean') {
    const message = [result === 'findings'
      ? `Snyk ${mode} reported security findings: ${totals}`
      : `Snyk ${mode} failed to complete; coverage is incomplete. ${overview ? `Partial overview: ${totals}` : totals}`];
    if (overview) {
      message.push(severities.map((severity) => `${severity}: ${overview.bySeverity[severity]}`).join('; '));
      for (const issue of overview.issues.slice(0, 3)) {
        message.push(`${issue.severity.toUpperCase()} ${text(issue.id, 100)}: ${text(issue.title, 120)}; ${issue.files.size} affected files${issue.package ? `; ${text(issue.package, 100)}` : ''}${issue.fixedIn.size ? `; fixed in ${text([...issue.fixedIn].join(', '), 80)}` : ''}.`);
      }
      if (overview.unique > 3) message.push(`${overview.unique - 3} more unique issues; see the job summary for the breakdown.`);
    }
    message.push('See the job summary, Security → Code scanning, and the snyk-results artifact.');
    annotation = `::error title=${label} — ${result === 'findings' ? 'findings overview' : 'scan incomplete'}::${commandData(message.join('\n'))}\n`;
  }
  return { summary: `${rows.join('\n')}\n`, annotation };
}
