# Sonar CI coverage and shared configuration

`.github/workflows/sonar.yml` runs the reusable Java, Go, Django and dashboard coverage workflows on
every PR, main push, merge group and weekly run. Manual runs can also select only the dashboard to
refresh its Pages report. Existing hard coverage gates and
Codecov uploads remain in their module jobs. The coordinator downloads only `sonar-inputs-*` artifacts
from its own run, then runs one repository-wide Sonar analysis after every producer succeeds.
Merge groups run the coverage gates only; fork and Dependabot PRs also run tests without a token-backed scan.

`sonar-coverage.mjs stage MODULE` copies reports, Java classes/test classes and dependency JARs to a
fixed `.sonar/inputs` tree, recording `GITHUB_SHA` for each module. Go and LCOV paths become repository-relative.
`prepare` requires every policy module's reports and matching revision, plus Java bytecode/libraries,
before writing `.sonar/analysis.properties`. It merges the authored `sonar-project.properties` with
the shared `.sonarcloud.properties` scope, encoding and synchronized Python version. Java test classification
is added explicitly for the CLI scanner. Production source remains in scope for static analysis.
Keep `sonar.coverage.exclusions` in `sonar-project.properties` aligned with the shared paths in
`codecov.yml`. These paths cover duplicate shims, thin framework and tool launchers, static files,
the PowerShell package bootstrap, the docs navigation script that depends on browser layout, and the
checker exercised from isolated temporary copies. Tests of the isolated checker still run in CI.

The scan job measures Node and Python tooling under `scripts/` and selected tooling elsewhere,
including the dashboard's coverage gate, direct orchestrator SSE smoke, integration result validation
and Django lock generation. The Python run measures CLI subprocesses and combines their data before
exporting Cobertura XML. Sonar imports the tooling reports alongside the dashboard and Django reports.
Codecov receives the same tooling reports under the `ci-tooling` flag.
Regression checks: `node --test scripts/coverage/sonar-coverage.test.mjs` and `npm run check --prefix scripts/quality`.

Before the first CI scan, configure the repository `SONAR_TOKEN` secret and turn off **Administration >
Analysis Method > Automatic Analysis** in SonarQube Cloud. Automatic analysis cannot import coverage and
conflicts with CI analysis. The scanner waits for the quality gate; a failed gate fails the scan job.
Confirm the analyzed revision and all four coverage importers in the first hosted run; local fixtures
do not establish that Sonar has accepted coverage. Qodana configuration does not control Sonar.

The following background describes the original automatic-analysis settings retained in the shared file:

- `PYTHON_VERSION` in the colon-style `compose/.env` remains authoritative. The existing framework synchronizer
  relays a stable X.Y.Z runtime pin to Sonar's accepted **X.Y** language version (for example, 3.13.18 becomes 3.13).
  Patch-only updates leave the language version unchanged. CI's drift check and guarded Renovate publication include
  this file; only the Python setting is generated, and other analysis settings remain authored.
- `sonar.sourceEncoding=UTF-8` makes the intended source encoding explicit without converting files or excluding
  production code. A strict local UTF-8 audit of tracked files, excluding PNG/ICO binaries, found no decoding failures
  during the 2026-11-01 investigation. This does **not** identify or clear the remote encoding warning: retrieve the
  scanner's named file/line and analysis revision, check the bytes at that revision and any generated/vendor input,
  then convert a confirmed non-UTF-8 text file or correct the specific scope error. Do not change encoding globally
  to hide malformed bytes or add broad source exclusions without evidence.
- The 2026-11-02 follow-up also audited the **committed HEAD blobs**, not just working files: no invalid UTF-8,
  replacement characters (U+FFFD), or text NULs were found, excluding PNG/ICO binaries. The warning still appeared
  in the matching remote scan. The supplied **scanner context** confirms UTF-8 and the test settings, but is a
  property dump, not the runtime log identifying the affected file. SonarSource confirms that automatic-analysis
  runtime logs are provider-hosted and unavailable to users; the warning's "check the scanner logs" instruction is
  misleading for this analysis method. See [SonarSource's explanation](https://community.sonarsource.com/t/188330/2).
- SonarSource also confirmed a scanner-engine behavior change that reports binary assets as UTF-8 encoding
  warnings, and recommends explicit binary exclusions. They identified PNGs and fonts in another automatic-analysis
  project's logs. See [the scanner-engine explanation](https://community.sonarsource.com/t/185002/6) and
  [the automatic-analysis example](https://community.sonarsource.com/t/189294/3). Our audit of revision
  `d5b4125093b7869e9cf0fc688e88358e1ceb826d` found **959 valid UTF-8 text blobs and 24 signature-verified PNG/ICO
  images**. `.sonarcloud.properties` now excludes only `**/*.png,**/*.ico`; SVGs, production source and text configuration
  stay in scope. No binary image is converted to text, no whole directory is excluded, and UTF-8 remains enabled.
  The CI regression checks each excluded image's signature, strictly decodes all other tracked working files,
  rejects unexpected literal replacement characters/NULs, and verifies Python synchronization preserves the exclusions.
  Intentional replacement-character test fixtures should use a language escape rather than a literal U+FFFD.

This is a supported, narrowly scoped correction consistent with the local evidence, not proof of this project's
exact provider-side file diagnostics. The next fresh scan must confirm whether the warning clears. If it remains,
request SonarSource's file/line/byte diagnostics using project `George-C-Odes_Observability-Benchmarking`, PR 424,
analysis `d5d0f36d-ad89-4d1f-bc76-8b921fbee63e`, and background task `AaGZNyEgcL3MZz6g6MJi` (the pre-exclusion
analysis), plus the latest IDs after the change. Do not broaden exclusions or change source encoding speculatively.

Automatic analysis reads the additional configuration from the **default branch**; verify remaining warnings after
the configuration reaches that branch and Sonar performs a fresh analysis. Merely creating this file locally does
not update the remote project, and automatic analysis does not execute the env-relay script itself.

## Sonar request-forgery triage

On 2026-11-01 the public Sonar API for PR 424 confirmed that `jssecurity:S7044` was fixed but `jssecurity:S8476`
(issue `AaGY1oYFDeJydjxQPt0K`) remained open on the source matching revision
`689eb81e0f1aed75581a1711e75625e17c475ffc`. The remaining flow carries `readCommit`'s returned tree SHA through
the `updateRef` branch into `fetch`. That reported path is rejected at runtime: a tree SHA is not a `renovate/`
branch ref. The real `readTree` call requires a full SHA, and the legitimate ref path already uses validation and
`encodeURIComponent`. Operations, methods, origin and endpoint prefixes are fixed; redirects are rejected.

The request-boundary regression now exercises that exact SHA-to-ref path, malformed response identifiers, and
plain/encoded traversal, separator, query, fragment and newline injection with **zero subsequent requests**.
Valid nested refs and publication bodies remain covered. These tests run in **Framework Version Consistency** on
every PR; make that check required in branch protection for enforcement beyond agent guidance.

The 2026-11-02 follow-up verified that Sonar's complete scanned client matched the working source at
`cb3386bef19c82ffacf8463c1a3c343a5b0ae420`; the same issue and flow persisted at line 150 in analysis
`ae749881-5549-4931-985e-27cc11a08e80`. Moving the line had not fixed or dismissed it.

After reviewing the trade-off, the user explicitly authorized a **local line-wide suppression** on 2026-11-02.
The shared `fetch` call now has a `NOSONAR` comment and the verified rationale above it. JavaScript's documented
form suppresses **all issues on that line**, not just S8476; this can also hide a future traversal finding at the
shared sink. This accepted exception is not a template for new clients. Request-boundary tests remain active,
and callers, resource scope, validation, encoding or redirect-policy changes require re-review/removal.

No remote issue status was manually changed, no rule was disabled globally, and no production file was excluded.
The 2026-11-02 analysis `d5d0f36d-ad89-4d1f-bc76-8b921fbee63e` now reports **zero open/confirmed issues** and
one encoding warning, consistent with the authorized suppression taking effect. This is suppression, not a new
runtime security fix; the shared-line trade-off still applies. An
issue-specific false-positive disposition remains the narrower alternative. See
[JavaScript inline suppression](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/languages/javascript-typescript-css)
and apply the request-safety completion gate in `my-agent/.apm/skills/ci-report-safety/SKILL.md` for future clients.

## Sonar test classification

The Python-version warning disappeared in the follow-up screenshot, but a **different** warning appeared:
SonarPython detected test code without `sonar.tests`. `.sonarcloud.properties` now defines literal test candidate
roots and scoped `sonar.test.inclusions` for Python regressions, Django's test package, Node `.test.mjs` files,
Go `_test.go` files, dashboard `__tests__`, and test-only setup/helpers. Shared directories are candidate roots,
not blanket test classifications: production scripts, integration result handling, Django lock tooling and runtime
code, Go servers, and dashboard application files remain source. Correctly classified tests are exempt from
duplication checks; production synchronizers remain in scope.

Current Sonar automatic-analysis documentation lists `sonar.tests` and `sonar.test.inclusions` as supported
optional settings; the documented **Java-specific** restriction is not a restriction for all languages.
Java retains automatic Maven/Gradle `src/main` and `src/test` classification. Do not replace the monorepo source
inventory with a Python-only `sonar.sources`, exclude shared directories wholesale, or use wildcard candidate
roots. Inclusion patterns are separate from literal roots. The regression test checks all tracked non-Java test
paths, production examples and actual Java source paths, and confirms the Python relay preserves these settings.

The supplied 2026-11-02 scanner context confirms these settings were applied, and its warning list no longer
includes the Python-version or Python-test warning. The inventory checks still do not substitute for scanner
execution; verify future changes in the remote scan. For CI-based
analysis use `sonar-project.properties`; automatic analysis uses `.sonarcloud.properties`. See
[Sonar's analysis scope documentation](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/excluding-files-based-on-patterns)
and [automatic analysis configuration](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis).
