# Scripts

This directory contains small repository-level helper scripts.

## Current scripts

- `image-tags.mjs` - shared framework/runtime image inventory and tag formatter
- `sync-image-tags.mjs` - generates Compose image tags and build names
- `sync-node-versions.mjs` - relays paired Node env pins to Docker and CI
- `sync-framework-versions.mjs` - runs every env-driven synchronizer and README renderer, including orchestrator Quarkus, the shared Python CI version, and Sonar's Python language version
- `sync-java-runtime-versions.mjs` - synchronizes manually managed Java/GraalVM runtime pins
- `sync-java-runtime-versions.test.mjs` - validates Java version propagation and Renovate exclusion
- `sync-framework-versions.test.mjs` - tests canonical inventories, Python CI/Sonar versions, and generated output scope
- `sync-django-versions.mjs` - pins Django inputs from the env and regenerates runtime/CI/Docker locks when the version changes
- `sync-django-versions.test.mjs` - offline tests for Django pinning and compiler/hash regeneration contracts
- `renovate-framework-sync.mjs` - validates Renovate PR data and publishes only trusted generated output without checking out PR code
- `renovate-framework-sync.test.mjs` - tests Renovate extraction, downstream exclusions, env-only edits, fork/mode guards, and repeat publication
- `render-readmes.mjs` - renders generated README files from `.template.md` sources using values from `compose/.env`
- `render-readmes.test.mjs` - lightweight tests for the README rendering logic
- `render-readmes.manifest.json` - default list of README templates rendered when no explicit template paths are passed
- `sync-build-img-runs.mjs` - synchronizes IntelliJ `[build-img]` run configuration versions from `compose/.env`
- `sync-build-img-runs.test.mjs` - tests version synchronization across the build configurations
- `sync-java-pom-versions.mjs` - synchronizes Java service framework properties from `compose/.env`
- `sync-java-pom-versions.test.mjs` - tests POM version mapping, preservation, validation, and check mode
- `sync-go-mod-versions.mjs` - synchronizes Go module versions from `compose/.env`, including CI tools
- `sync-go-mod-versions.test.mjs` - tests Go version propagation, preservation, validation, and check mode
- `sync-dockerfile-versions.mjs` - synchronizes service Dockerfile framework/runtime ARG defaults from `compose/.env`
- `sync-dockerfile-versions.test.mjs` - tests Dockerfile default mapping, preservation, validation, and check mode
- `sync-common.mjs` - shared synchronizer CLI, literal-version validation, file diagnostics, and check/write handling
- `sync-common.test.mjs` - CLI contract tests across all four synchronizers
- `test-helpers.mjs` - temporary-directory fixtures with guarded cleanup
- `snyk-scan.mjs` - runs Snyk Code, Open Source tests, or monitoring with retained logs/reports and distinct findings/error status
- `snyk-scan.test.mjs` - token-free tests for scan arguments, exit codes, report capture, and CI gate contracts
- `snyk-report.mjs` - builds safely escaped Actions annotations and Markdown overviews with severity counts, affected files, and reported fixes
- `snyk-report.test.mjs` - tests overview counts, severity ranking, display limits, missing reports, and output escaping
- `run-qodana-python.py` - runs isolated, unprivileged Django-only Qodana Python Community scans
- `qodana-python-report.py` - summarizes inspection coverage and fails closed on missing scan evidence
- `test_qodana_python.py` - tests scan isolation, coverage, and report path validation
- `github-actions.test.mjs` - tests action pin centralization, nested action triggers, dashboard setup, and Go report contracts
- `coverage_summary.py` - shared coverage tables and format-specific coverage.py, Go, JaCoCo, and Vitest summaries
- `test_coverage_summary.py` - tests coverage totals, failure/missing-report behavior, Java statuses, and XML entity rejection

The synchronizers keep their format-specific transformations and inventories separate. Each reads and validates its
entire inventory before passing the proposed changes to the shared check/write handler. Check mode never writes;
normal mode writes only changed files. This validation guarantee does not provide rollback if a filesystem write fails.

## Shared CI setup and coverage summaries

`.github/actions/setup-nextjs` reuses the shared Node setup and installs the exact npm version from the
dashboard's `package.json` `packageManager` field. Both npm installation and `npm ci` disable lifecycle
scripts. Its steps stop on failure. Workflow path filters include the dashboard setup and its nested Node action.

Go Quality uses one matrix pipeline with independent legs (`fail-fast: false`). Matrix entries retain the
existing check display names, module caches, report titles, and `quality-report-go` / `quality-report-go-simple`
artifact names; Pages still downloads those exact names.

Coverage workflows call `coverage_summary.py` with `python`, `go`, `java`, `java-combined`, or `nextjs`.
Each mode retains its workflow environment inputs and working directory. Shared tables do not replace
format-specific metrics or gates: missing reports after successful Python/Go tests or Java builds fail,
Java threshold violations remain reviewable through status artifacts, and missing Next.js reports remain
informational. Weighted totals sum counters rather than averaging percentages. The JaCoCo reader accepts
its standard external DTD declaration without fetching it and rejects entity definitions. Go's optional
function detail uses a fixed argument list without a shell and has a 30-second timeout; timeouts fail.

The unconditional Framework Version Consistency workflow runs both contract suites:

```powershell
node --test scripts/github-actions.test.mjs
python -m unittest discover -s scripts -p test_coverage_summary.py -v
```

## Framework versions and Renovate

`compose/.env` is authoritative for the framework/runtime `*_VERSION` values managed by Renovate. Renovate's custom regex managers
read this repository's colon-style syntax, ignore commented-out alternatives, and update the env value rather
than independently changing its generated copies. Maven lookups use the actual service coordinates, including
the Zoomba Spark fork, Micronaut **core** BOM, and Pekko **HTTP** (not its separately versioned core libraries).
Framework major upgrades still require Dependency Dashboard approval; automerge remains disabled. Stable
registry releases still age for three days, except vulnerability alerts. Unrelated libraries, plugins, action pins,
Docker digests, and independent tool versions remain managed normally.

### Image tags and Node upgrades

The shared formatter replaces `_latest` with a runtime line: Java images use
`<framework-version>-java<major>`, Django uses `<django-version>-python<major.minor>`,
and Go uses its full version without a suffix. The dashboard uses
`<next-version>-node<major>`; Next.js keeps its `package.json` source of truth.
The orchestrator uses its Quarkus version plus the Java major. `wrk2:latest` is unchanged.
Compose image/build-name values, IDE build configurations, and documentation are generated
by the combined command below. Run it after changing env pins or the dashboard's Next.js dependency.
Services, container names, resource settings and telemetry identities remain authored.

`NODE_MAJOR_VERSION` and `NODE_MINOR_PATCH_VERSION` form a single stable Node release.
Keep their active lines adjacent, major first: Renovate extracts the pair as one dependency
using its `node-version` datasource and updates both fields together. The existing guarded
workflow accepts only these version values, generates Docker/CI/docs/tags from trusted base
scripts, and commits the resulting files. Major upgrades retain Dependency Dashboard approval.
CI workflows inherit the synchronized setup-action defaults, with explicit caller overrides still supported.
Future Node upgrades do not need to rewrite workflow files or expand the sync token permissions.
Downstream Node Docker version updates are disabled; digest refreshes remain enabled.
When a Node release changes, the synchronizer drops a stale Docker digest rather than
carrying it to a different tag; Renovate can then pin the digest for the new tag.

### One command for manual changes

`JAVA_MAJOR_VERSION` and `JAVA_MINOR_PATCH_VERSION` also live in `compose/.env`.
`JAVA_MINOR_PATCH_VERSION` accepts two to four dot-separated numeric components, for example
`0.5`, `0.5.0`, or `0.5.0.3`. The full release prepends `JAVA_MAJOR_VERSION`.
Java and GraalVM upgrades are manual: these two pins are excluded from Renovate extraction and its
framework-upgrade validator. The combined sync relays them to compiler targets, native-image/SVM
versions, Docker defaults, CI Java selections, IDE settings, and documentation. Docker
`JAVA_MINOR_RELEASE` retains its leading dot, derived from the env minor.patch value. When the Java major changes,
the orchestrator Maven builder digest must be refreshed for the new tag.

After editing the env, run the same command used by **[doc] Render Updates** and Renovate:

```powershell
node scripts/sync-framework-versions.mjs
node scripts/sync-framework-versions.mjs --check
```

This relays versions to Java service POMs, the orchestrator's Quarkus POM, Go directives/toolchains, service
Dockerfile ARG defaults, IntelliJ build image arguments/tags, Django requirement inputs and locks, the shared
Python CI default, `sonar.python.version` in `.sonarcloud.properties`, and manifest-listed documentation. Direct builds retain literal defaults. Individual
synchronizers remain available; use the combined command for a complete update. `--env` selects another env
source and `--check` never writes or downloads dependencies. Changes do not run automatically just by editing
the env. The combined operation is not transactional: after a compiler or filesystem failure, inspect the diff,
resolve the error, rerun, and commit only after check mode passes.

Django's two `requirements.in` files use **exact** `DJANGO_VERSION` pins. If Django locks already match, no
compiler is needed. When Django changes, use **Linux**, Python matching `PYTHON_VERSION`, and pip-tools **7.6.2**
in a compiler virtualenv. The helper checks the compiler before updating inputs, resolves both runtime locks
with a targeted Django upgrade, then runs `.github/requirements/update-lock.sh` to regenerate the hash inventory
and Docker projections. Existing hashes are never relabeled for a different release, and there is no unhashed
runtime install fallback. Windows users must run a Django version change in a Linux environment/container;
Git Bash with Windows Python cannot compile the Pyroscope-containing inventory. See
[Python compiler setup](../.github/requirements/README.md#regenerate-or-upgrade-the-locks).

### Renovate PR synchronization

1. Renovate proposes an env update and labels the PR `framework-version`.
2. **Framework Version Sync** (`renovate_framework_sync.yml`) runs the **trusted base revision's** scripts.
   It accepts only open `renovate[bot]` PRs from this repository under `renovate/`, validates that the env changed
   only active framework values, and rejects changes outside the generated-file inventory. Branch files are
   Git API blobs, not executable code; symlinks, file-mode changes, and truncated trees are rejected.
3. The workflow synchronizes and checks all output, including hash projections, then adds the generated files
   to the same PR through the Git API. It never checks out the PR, executes its scripts, or force-updates a ref.
   Concurrent head changes fail safely; existing unrelated edits to generated files are not overwritten.
4. The generated commit triggers the normal path-scoped service checks. Repeat publication is a no-op.
   `gitIgnoredAuthors` matches the Actions bot author used by this helper so Renovate can refresh/rebase its PR.
5. **Framework Version Consistency** (`framework_versions.yml`) runs regression tests and read-only drift/hash
   checks on every PR and on `main`. Make its check required in branch protection to enforce the contract.

**One-time setup:** after merging this integration into the trusted base branch, add the Actions repository
secret **`RENOVATE_SYNC_TOKEN`**, using a repository-scoped fine-grained PAT (or supplied GitHub App token) with
**Contents: read/write** and **Pull requests: read**. Do not put the token in `compose/.env`. It is exposed only
to the publication step; checkout and preparation use the read-only `GITHUB_TOKEN` without persisted Git
credentials. There is deliberately no write-token fallback: commits made with `GITHUB_TOKEN` suppress normal
push/PR workflows, which would otherwise leave the generated service changes untested. A missing token fails
publication rather than merging an env-only update. Hosted Renovate does not execute repository-configured
`postUpgradeTasks`, so this workflow supplies the synchronization without requiring a self-hosted bot.

The env represents benchmark framework/runtime versions, not every tool/library in the monorepo. Other pins
(for example Pekko core, Micronaut integration modules, Java/Maven tooling, and dashboard dependencies) retain
their separate compatibility lifecycles. When adding another env-managed version, extend Renovate extraction,
its scoped downstream exclusions, the corresponding synchronizer/inventory, and regression tests together.

Run the synchronizer regression tests with:

```powershell
node --test scripts/sync-*.test.mjs scripts/render-readmes.test.mjs scripts/renovate-framework-sync.test.mjs
```

Run the Snyk runner regression tests without credentials or an installed Snyk CLI:

```powershell
node --test scripts/snyk-scan.test.mjs scripts/snyk-report.test.mjs
```

The Snyk workflow runs these tests before scanning. Real scans require the Snyk CLI, `SNYK_TOKEN`, and installed
language/dependency prerequisites; see [Snyk scanning guidance](../docs/SECURITY.md#snyk-automated-scanning).
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

### Qodana Python reports

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
overrides. See the [environment trust boundary and scoped Snyk triage guidance](../docs/SECURITY.md#qodana-report-environment-trust-boundary).

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
python scripts/run-qodana-python.py --results-dir $results
python scripts/qodana-python-report.py $results
```

Run the regression tests with `python -m unittest discover -s scripts -p test_qodana_python.py -v`.
Symlink tests are skipped on systems that do not permit creating symlinks.

### Sonar automatic-analysis configuration

The repository contains an IDE SonarQube Cloud binding in `.sonarlint/connectedMode.json` and an automatic-analysis
configuration in `.sonarcloud.properties`, but no Sonar scanner workflow. Sonar documents both
`sonar.python.version` and `sonar.sourceEncoding` as supported automatic-analysis properties. Confirm
**Administration > Analysis Method** in Sonar before switching methods; Qodana configuration does not control Sonar.

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

### Sonar request-forgery triage

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

### Sonar test classification

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

## Go module versions

After changing `GO_VERSION` in `compose/.env`, synchronize both benchmark modules and `.github/go-tools/go.mod`:

```powershell
node scripts/sync-go-mod-versions.mjs
node scripts/sync-go-mod-versions.mjs --check
node --test scripts/sync-go-mod-versions.test.mjs
```

In IntelliJ, run **[gen] Sync Go Module Versions**, or **[doc] Render Updates** to synchronize Java POMs, Go modules, Dockerfiles, build image configurations, and generated documentation together. Editing `.env` alone does not run synchronization.

The script sets each module's `go` directive to the full stable `GO_VERSION` (for example, `1.27.3`). It also aligns an existing standard `toolchain go...` pin, preserves `toolchain default`, and does not add a toolchain directive. Dependency versions, tool declarations, `go.sum`, comments, and formatting are preserved. Missing modules, missing or duplicate Go directives, unsupported toolchain declarations, and invalid env versions fail before any module is written. Unchanged modules are not rewritten.

The Go quality and coverage workflows already read service `go.mod` files through `go-version-file`, so the module update also relays the version to CI. The separate CI tools module uses the same Go version while retaining its own dependency lock. Go service READMEs use templates included in the default renderer manifest.

Paths resolve from the repository root. Use `--env path/to/.env` for an alternate source; `--check` reports drift with exit code 1 without writing. Extend `goModules` in the script when adding a module. The script does not invoke Go, download a toolchain, or run `go mod tidy`; review dependency compatibility separately when changing Go release lines.

## Dockerfile versions

After changing versions in `compose/.env`, synchronize all 19 service Dockerfiles:

```powershell
node scripts/sync-dockerfile-versions.mjs
node scripts/sync-dockerfile-versions.mjs --check
node --test scripts/sync-dockerfile-versions.test.mjs
```

In IntelliJ, run **[gen] Sync Dockerfile Versions**, or **[doc] Render Updates** to synchronize POMs, Go modules, Dockerfiles, documentation, and build image configurations together.

The script updates the Java framework `ARG ..._VERSION=...` defaults, `GO_VERSION` in both Go Dockerfiles, and `PYTHON_VERSION` in both Django Dockerfiles. Literal defaults keep direct Docker builds usable; Compose and IntelliJ can still override them with build arguments. Django itself is pinned in Python requirements, rather than a Dockerfile ARG.

Pekko has two independent build pins: `PEKKO_VERSION` for HTTP and `PEKKO_CORE_VERSION` for Core actor/stream/SLF4J modules. Both defaults are updated together in its single Dockerfile and passed through to Maven.

Only the listed framework/runtime defaults are managed. Other image and tooling pins (Java, Maven, OpenTelemetry agents, npm, YQ, and OS images), stage redeclarations, comments, and formatting are preserved. Missing files, missing or duplicate defaults, and missing or invalid env values fail validation before any Dockerfile is written. Unchanged files are not rewritten.

Paths resolve from the repository root. Use `--env path/to/.env` for an alternate source. Extend `dockerfileVersions` in the script when adding a service. Synchronization is explicit: rerun it after editing `.env`.

## Java service POM versions

After changing framework versions in `compose/.env`, update all 17 Java service POMs:

```powershell
node scripts/sync-java-pom-versions.mjs
```

In IntelliJ, run **[gen] Sync Java POM Versions** to execute the same command. The **[doc] Render Updates** run configuration also runs it before synchronizing Dockerfiles, rendering documentation, and refreshing build image configurations. After synchronization, reload Maven projects in IntelliJ to resolve the updated dependencies.

The script uses the README renderer's `KEY: VALUE` parser and manages these properties for every listed JVM and native variant:

| Env variable          | Maven property             | Variants                 |
|-----------------------|----------------------------|--------------------------|
| `SPRING_BOOT_VERSION` | `spring-boot.version`      | JVM/native, Netty/Tomcat |
| `QUARKUS_VERSION`     | `quarkus.platform.version` | JVM/native               |
| `MICRONAUT_VERSION`   | `micronaut.version`        | JVM/native               |
| `HELIDON_VERSION`     | `helidon.version`          | SE/MP, JVM/native        |
| `SPARK_VERSION`       | `spark-core.version`       | JVM                      |
| `JAVALIN_VERSION`     | `javalin.version`          | JVM                      |
| `DROPWIZARD_VERSION`  | `dropwizard.version`       | JVM                      |
| `VERTX_VERSION`       | `vertx.version`            | JVM                      |
| `PEKKO_VERSION`       | `pekko.version`            | JVM (HTTP version)       |
| `PEKKO_CORE_VERSION`  | `pekko.core.version`       | JVM (actor/stream/SLF4J) |

Change these versions in `compose/.env`, then synchronize; POMs keep literal values so direct Maven builds and IDE imports need no environment setup. Synchronization is explicit, so editing `.env` alone does not change a POM. Existing Docker builds continue passing version overrides through Maven `-D` arguments.

Only the mapped property values are updated. Formatting, comments, dependency references, and other versions (including Micronaut integration versions) are preserved. Multiple mapped properties in one POM are combined before writing, so both Pekko pins survive synchronization. The orchestrator POM is outside this inventory. Missing files, missing or duplicate property declarations, and missing or invalid env versions fail validation before any POM is written. Unchanged POMs are not rewritten.

Pekko HTTP and Core have independent release lines. Renovate tracks their env pins via `pekko-http_3` and `pekko-stream_3` respectively; direct Maven updates of the generated HTTP/stream/SLF4J pins are disabled. The synchronizer relays explicit values, not a compatibility calculation; review HTTP/Core compatibility when changing release lines. The Pekko service README is generated from a template containing both env placeholders.

Check for drift without writing files (exit code 1 when stale), use a different env file, or run the focused tests:

```powershell
node scripts/sync-java-pom-versions.mjs --check
node scripts/sync-java-pom-versions.mjs --env path/to/.env
node --test scripts/sync-java-pom-versions.test.mjs
```

Relative env paths resolve from the repository root. To add a Java service, extend `javaFrameworkVersions` in the script with its env key, property, and module path. The `--check` command can also be used in CI.

## Build image run configurations

After changing versions in `compose/.env`, refresh all `.run/[build-img]*.run.xml` configurations:

```powershell
node scripts/sync-build-img-runs.mjs
```

In IntelliJ, run **[gen] Sync Build Image Versions** to execute the same command.

The script uses the same `KEY: VALUE` env parser as the README renderer. It updates every `*_VERSION` build argument, the image tag, and the version in `BUILDKIT_BUILD_NAME`. Django image tags and build names use `DJANGO_VERSION`; their Python build arguments use `PYTHON_VERSION`.

Pekko image tags and build names continue to use the HTTP `PEKKO_VERSION`; both `PEKKO_VERSION` and `PEKKO_CORE_VERSION` are synchronized as independent build arguments.

Docker connections, build contexts, Dockerfile paths, variant arguments, and shared build names are preserved. The three utility images tagged `latest` and the cache-prune command have no env-driven versions and are left unchanged. Other run configuration prefixes are excluded.

The XML comment in each versioned configuration identifies this command. Change versions in the env file, then run the synchronizer; other configuration settings can still be edited in IntelliJ. Synchronization is explicit: editing the env file alone does not refresh the XML.

Check for stale versions without writing files, or run the focused tests:

```powershell
node scripts/sync-build-img-runs.mjs --check
node --test scripts/sync-build-img-runs.test.mjs
```

Paths are resolved from the repository root, so the script can be invoked from any working directory. Use `--env path/to/.env` to read an alternative env file. It validates the entire batch before writing, reports missing or invalid versions, and only writes changed files.

New build configurations are discovered automatically by filename. Their image version comes from their sole `*_VERSION` build argument. If a new image uses a different version for its tag (as Django does), or has multiple version arguments, add its tag variable to `imageVersionOverrides` in the script.

## Pages scripts (`pages/`)

The `pages/` subdirectory contains scripts used by the GitHub Pages deployment workflow to resolve quality-report artifacts, generate HTML reports, and assemble them into the published site.

| Script                               | Purpose                                                                                                                                                                                                                                                                                                                                                 |
|--------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `resolve-source.sh`                  | Generic parameterized resolver for quality-report workflow run artifacts. Accepts `RESOLVE_WORKFLOW_NAME`, `RESOLVE_WORKFLOW_FILE`, `RESOLVE_ACCEPTED`, and `RESOLVE_BRANCH_MODE` env vars so Pages can separately resolve live `main` reports and shared non-`main` staging reports, including failed staging runs that still uploaded HTML artifacts. |
| `inspect-qodana-artifacts.sh`        | Inspects available Qodana artifacts for the resolved workflow run.                                                                                                                                                                                                                                                                                      |
| `report-helpers.mjs`                 | Shared module exporting HTML escaping (`esc`), status icons (`statusIcon`), path shortening (`shortPath`), optional file reading (`readOptionalFile`), metadata assembly (`buildMetaParts`, `renderMeta`), CSS theming (`themeCSS`), HTML page shell (`htmlPage`), and report writing (`writeReport`). Used by all three report generators below.       |
| `generate-go-quality-report.mjs`     | Generates a self-contained HTML quality report from golangci-lint JSON output.                                                                                                                                                                                                                                                                          |
| `generate-nextjs-quality-report.mjs` | Generates a self-contained HTML quality report from Oxfmt, Oxlint JSON, and TypeScript 7 diagnostics.                                                                                                                                                                                                                                                   |
| `generate-codeql-report.mjs`         | Generates a self-contained HTML quality report from CodeQL SARIF output across all analyzed languages.                                                                                                                                                                                                                                                  |
| `assemble-quality-pages.sh`          | Resolves per-scope report statuses, generates human-readable messages, and assembles all quality report scopes (Qodana JVM, Django Python, Go, Next.js, CodeQL) into a configurable Pages subtree such as `_site/quality/` (live) or `_site/stage/quality/` (shared staging).                                                                           |

The three HTML report generators (`generate-go-quality-report.mjs`, `generate-nextjs-quality-report.mjs`, `generate-codeql-report.mjs`) all import from `report-helpers.mjs` to share common HTML helpers, CSS theming, metadata assembly, and file output logic. Each generator retains its own report-specific logic (SARIF parsing, linter breakdown tables, TSC diagnostics, etc.).

## README rendering

The README renderer exists to keep repeated version values in sync with the repository's existing source of truth: `compose/.env`.

It currently reads the repo's custom env format:

```dotenv
SPRING_BOOT_VERSION: 4.1.2
QUARKUS_VERSION: 3.40.1.1
```

Note that this is **not** standard dotenv `KEY=value` syntax. The renderer is intentionally built for this repository's `KEY: VALUE` format.

## How to run the renderer

Run from the repository root.

### Generate the default README set from the manifest

```powershell
node .\scripts\render-readmes.mjs
```

### Check the default README set from the manifest

```powershell
node .\scripts\render-readmes.mjs --check
```

### Generate one README

```powershell
node .\scripts\render-readmes.mjs .\services\README.template.md
```

### Check that a generated README is up to date

```powershell
node .\scripts\render-readmes.mjs --check .\services\README.template.md
```

### Generate multiple README files in one run

```powershell
node .\scripts\render-readmes.mjs .\services\README.template.md .\some\other\README.template.md
```

### Use an explicit env file path

```powershell
node .\scripts\render-readmes.mjs --env .\compose\.env .\services\README.template.md
```

### Use an explicit manifest file path

```powershell
node .\scripts\render-readmes.mjs --manifest .\scripts\render-readmes.manifest.json
```

### Use an absolute template path

```powershell
node .\scripts\render-readmes.mjs "\absolute\path\to\your\Observability-Benchmarking\services\README.template.md"
```

## Current README templates in use

At the moment, the active generated README inventory is:

| Template                                                  | Output                                           | Notes                                                                          |
|-----------------------------------------------------------|--------------------------------------------------|--------------------------------------------------------------------------------|
| `README.template.md`                                      | `README.md`                                      | Root project README                                                            |
| `docs/architecture.template.md`                           | `docs/architecture.md`                           | Architecture guide                                                             |
| `docs/benchmarking.template.md`                           | `docs/benchmarking.md`                           | Benchmarking guide                                                             |
| `docs/TESTING.template.md`                                | `docs/TESTING.md`                                | Testing guide documentation                                                    |
| `docs/tools-technologies.template.md`                     | `docs/tools-technologies.md`                     | Tools and technologies overview                                                |
| `integration-tests/README.template.md`                    | `integration-tests/README.md`                    | Integration test documentation                                                 |
| `services/README.template.md`                             | `services/README.md`                             | Services overview                                                              |
| `services/go/enhanced/README.template.md`                 | `services/go/enhanced/README.md`                 | Enhanced Go service; Go version from `compose/.env`                            |
| `services/go/simple/README.template.md`                   | `services/go/simple/README.md`                   | Simple Go service; Go version from `compose/.env`                              |
| `services/java/helidon/README.template.md`                | `services/java/helidon/README.md`                | Shared Helidon guide; module READMEs link to its generated framework version   |
| `services/java/javalin/jvm/README.template.md`            | `services/java/javalin/jvm/README.md`            | Javalin JVM service                                                            |
| `services/java/micronaut/README.template.md`              | `services/java/micronaut/README.md`              | Shared Micronaut guide; module READMEs link to its generated framework version |
| `services/java/quarkus/jvm/README.template.md`            | `services/java/quarkus/jvm/README.md`            | Quarkus JVM service                                                            |
| `services/java/quarkus/native/README.template.md`         | `services/java/quarkus/native/README.md`         | Quarkus native service                                                         |
| `services/java/spark/jvm/README.template.md`              | `services/java/spark/jvm/README.md`              | Spark JVM service                                                              |
| `services/java/spring/jvm/netty/README.template.md`       | `services/java/spring/jvm/netty/README.md`       | Spring JVM Netty service                                                       |
| `services/java/spring/jvm/tomcat/README.template.md`      | `services/java/spring/jvm/tomcat/README.md`      | Spring JVM Tomcat service                                                      |
| `services/java/spring/native/netty/README.template.md`    | `services/java/spring/native/netty/README.md`    | Spring native Netty service                                                    |
| `services/java/spring/native/tomcat/README.template.md`   | `services/java/spring/native/tomcat/README.md`   | Spring native Tomcat service                                                   |
| `services/python/django/README.template.md`               | `services/python/django/README.md`               | Shared Django guide; Python and Django versions from `compose/.env`            |
| `services/python/django/gunicorn/ASGI/README.template.md` | `services/python/django/gunicorn/ASGI/README.md` | Django reactive service                                                        |
| `services/python/django/gunicorn/WSGI/README.template.md` | `services/python/django/gunicorn/WSGI/README.md` | Django platform service                                                        |

The default list lives in `scripts/render-readmes.manifest.json` under `defaultTemplatePaths`.

At the moment, the default no-argument run renders every document listed above.

If you pass template paths on the command line, those explicit paths override the manifest for that run.

## Naming convention

Each template must use the `.template` infix before the file extension.

Examples:

- `README.template.md` -> `README.md`
- `docs/guide.template.md` -> `docs/guide.md`
- `services/java/quarkus/jvm/README.template.md` -> `services/java/quarkus/jvm/README.md`

If the file does not follow this convention, the script fails.

## Placeholder format

Placeholders inside templates use uppercase brace syntax:

```md
{{SPRING_BOOT_VERSION}}
{{QUARKUS_VERSION}}
{{GO_VERSION}}
```

If a placeholder is present in a template but missing from the env data, the script fails fast with an error.

## How to extend this for more README files

To add another generated README:

1. Create a new template file ending in `.template.md`
2. Replace repeated values with placeholders such as `{{SOME_VERSION}}`
3. Make sure the placeholder exists in `compose/.env`
4. Add the template path to `scripts/render-readmes.manifest.json` if it should be part of the default generated set
5. Run the renderer with either the explicit template path or the manifest-driven default command
6. Commit the manifest change, template, and generated output file

Example:

```powershell
node .\scripts\render-readmes.mjs .\services\README.template.md .\docs\some-page.template.md
```

## Recommended workflow for adding a new template

1. Copy the current README to a sibling `.template.md` file
2. Replace repeated literals with placeholders
3. Add the new template path to `scripts/render-readmes.manifest.json` if it belongs in the default set
4. Generate the output README
5. Run the check mode
6. Review the diff before committing

Example:

```powershell
node .\scripts\render-readmes.mjs .\path\to\README.template.md
node .\scripts\render-readmes.mjs --check .\path\to\README.template.md
```

## How path resolution works

- Relative template paths are resolved from the repository root
- Absolute template paths also work
- By default, the env source is `compose/.env`
- By default, the template list source is `scripts/render-readmes.manifest.json`
- `--env` can point to another env file when needed
- `--manifest` can point to another manifest file when needed

This means templates can live at any directory depth in the project as long as you pass the correct path.

## Testing

Run the renderer tests from the repository root:

```powershell
node --test scripts/render-readmes.test.mjs
```

The tests currently cover:

- parsing the repo's colon-style env format
- ignoring commented-out values such as `#SPRING_BOOT_VERSION: ...`
- handling values containing additional colons, such as Windows paths and image tags
- manifest loading and default template fallback behavior
- placeholder rendering
- GitHub Actions `${{ ... }}` expressions staying intact next to README placeholders
- `.template.md` -> output path derivation
- relative env and template paths using an isolated env fixture
- env-only upgrades (including four-component releases), stale-output rejection without writes, and successful regeneration

Keep renderer unit tests independent of the live release pins in `compose/.env`: write synthetic
versions to a temporary env file and assert those fixture values. Do not pair a read of the live env
with hard-coded current versions; Renovate updates the env without updating test expectations.
Tests that intentionally check repository consistency should derive expected versions from the
authoritative env instead.

The Framework Version Consistency workflow runs these tests on every pull request. To run its
version synchronization and Renovate routing test step locally:

```powershell
node --test scripts/sync-*.test.mjs scripts/render-readmes.test.mjs scripts/renovate-framework-sync.test.mjs
```

## Important caveats

- `render-readmes.mjs` reads the generated output file during `--check`; if that output file does not exist yet, the check will fail
- The script does not currently scan the repository automatically for templates; it uses either explicit CLI paths or the manifest default list
- Only placeholders you explicitly add to a template are substituted
- Literal GitHub Actions expressions such as `${{ matrix.service.name }}` are safe because the renderer only substitutes uppercase `{{PLACEHOLDER}}` tokens
- Existing Jekyll/Liquid expressions in docs such as `{{ '/images/...' | relative_url }}` are also safe because they do not match the renderer's uppercase-only placeholder pattern

## Future enhancement ideas

If the number of generated READMEs grows, the next step could be to add one of these:

- a richer manifest format with named template groups or per-template metadata
- an npm/package script wrapper for common render/check commands
- CI validation that runs `render-readmes.mjs --check` against the agreed template list
