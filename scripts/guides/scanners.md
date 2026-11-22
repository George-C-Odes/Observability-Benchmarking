# Scanner helpers

## Snyk

Run the Snyk runner regression tests without credentials or an installed Snyk CLI:

```powershell
node --test scripts/scanners/snyk-scan.test.mjs scripts/scanners/snyk-report.test.mjs
```

The Snyk workflow runs these tests before scanning. Real scans require the Snyk CLI, `SNYK_TOKEN`, and installed
language/dependency prerequisites; see [Snyk scanning guidance](../../docs/SECURITY.md#snyk-automated-scanning).
The workflow gate regression test also requires Bash on `PATH`; it is skipped locally if Bash is unavailable.

Each scan adds an overview to the Actions job summary. Findings warning annotations include totals and up to three
highest-priority issues; the summary lists up to ten affected files and ten unique issues with reported fixed versions.
Unique issues are deduplicated by vulnerability/rule ID. Occurrences count SARIF results, not transitive dependency paths.
Dependency JSON enriches package, severity, and fix details; fixed versions do not guarantee a direct parent/framework upgrade.
Incomplete scans are marked partial, and missing reports are never displayed as zero findings. The final gate includes a
status table: findings are non-blocking warnings, while incomplete scans and monitor failures still fail the job.
GitHub Actions has no warning job conclusion, so findings-only runs have a successful check with warning annotations.
The workflow normalizes only the findings exit code to avoid automatic nonzero-exit error annotations for findings;
the standalone runner retains the original scan exit codes.

## Qodana Python reports

`qodana-python-report.py` accepts only `RUNNER_TEMP/qodana-python/results`; when `RUNNER_TEMP` is
unset, it uses the OS temporary directory as the root. The root comes from trusted runner/OS configuration,
not CLI input. The existing Django quality workflow already uses this location. Other directories and
symlink redirection of the results directory, its parents below the root, or report files are rejected
before reading or writing. Missing or malformed SARIF still produces failing diagnostic summaries.

Coverage passes only if every SARIF run contains a nonempty invocation list and every recorded
`executionSuccessful` flag is explicitly `true`, in addition to the required inspections and minimum
count. A successful invocation cannot hide a failed or incomplete one; JSON/Markdown diagnostics
remain available when the coverage gate fails.

The environment root is a trust assumption, not sanitized input: controlling both `RUNNER_TEMP` and
the CLI path can change the accepted location, and the OS temp fallback also uses environment values.
Do not launch this helper with elevated privileges or untrusted remote/agent-supplied environment
overrides. See the [environment trust boundary and scoped Snyk triage guidance](../../docs/SECURITY.md#qodana-report-environment-trust-boundary).

The scan runner validates `services/python/django` and each intermediate directory before copying
or reading its Qodana configuration, rejecting symlink/junction redirection outside the selected trusted
workspace. Descendant symlinks remain unsupported. No host Git files are mounted or copied, including
configuration, objects, refs, and `.git` pointers. The host collects three provenance scalars (revision,
attached branch, sanitized network remote URI) and adds them only to exported SARIF. Remote userinfo,
queries, and fragments are removed; local/unsupported URLs are omitted. Qodana's native HTML metadata
and logs may lack Git context; SARIF findings and execution flags are preserved. Provenance annotation
failure returns a nonzero status without skipping container removal or overwriting malformed evidence.

`run-qodana-python.py` bounds each Git call to 30 seconds, the complete scan (including silent or
continuous output) to 20 minutes, report export to five minutes, and container removal to one minute.
A timed-out scan kills its local Docker client, then still attempts report export and container removal.
Export failure or timeout also leaves removal enabled. Docker timeouts return a nonzero status (124 when
not superseded by an earlier scan failure), and diagnostics are retained in `scan.log`. A Git timeout
fails before starting Docker. The CI job's 30-minute timeout remains the outer safety limit; a stalled
daemon can prevent export/removal from succeeding even though the local commands are bounded.

For local scans and summaries, use the same directory for both helpers:

```powershell
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { python -c "import tempfile; print(tempfile.gettempdir())" }
$results = Join-Path $tempRoot 'qodana-python/results'
python scripts/scanners/run-qodana-python.py --results-dir $results
python scripts/scanners/qodana-python-report.py $results
```

Run the regression tests with `python -m unittest discover -s scripts/scanners -p test_qodana_python.py -v`.
Symlink tests are skipped on systems that do not permit creating symlinks.
