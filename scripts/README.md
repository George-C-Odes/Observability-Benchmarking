# Scripts

This directory contains small repository-level helper scripts.

## Current scripts

- `sync-framework-versions.mjs` - runs every env-driven synchronizer and README renderer, including orchestrator Quarkus and the shared Python CI version
- `sync-framework-versions.test.mjs` - tests canonical inventories, Python defaults, and generated output scope
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

The synchronizers keep their format-specific transformations and inventories separate. Each reads and validates its
entire inventory before passing the proposed changes to the shared check/write handler. Check mode never writes;
normal mode writes only changed files. This validation guarantee does not provide rollback if a filesystem write fails.

## Framework versions and Renovate

`compose/.env` is authoritative for the twelve active `*_VERSION` values. Renovate's custom regex managers
read this repository's colon-style syntax, ignore commented-out alternatives, and update the env value rather
than independently changing its generated copies. Maven lookups use the actual service coordinates, including
the Zoomba Spark fork, Micronaut **core** BOM, and Pekko **HTTP** (not its separately versioned core libraries).
Framework major upgrades still require Dependency Dashboard approval; automerge remains disabled. Stable
registry releases still age for three days, except vulnerability alerts. Unrelated libraries, plugins, action pins,
Docker digests, and independent tool versions remain managed normally.

### One command for manual changes

After editing the env, run the same command used by **[doc] Render Updates** and Renovate:

```powershell
node scripts/sync-framework-versions.mjs
node scripts/sync-framework-versions.mjs --check
```

This relays versions to Java service POMs, the orchestrator's Quarkus POM, Go directives/toolchains, service
Dockerfile ARG defaults, IntelliJ build image arguments/tags, Django requirement inputs and locks, the shared
Python CI default, and manifest-listed documentation. Direct builds retain literal defaults. Individual
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

### Sonar test classification

The repository currently contains an IDE SonarQube Cloud binding in `.sonarlint/connectedMode.json`, but no checked-in
Sonar scanner workflow or analysis properties. In the existing project's analysis configuration, ensure that
`**/*.test.mjs` is included in the test scope, retaining the patterns for other languages and existing tests.
Correctly classified test files are exempt from duplication checks; production synchronizers should stay in scope.

For a CLI-based scanner, `sonar.tests` must include the directories containing the tests and
`sonar.test.inclusions` must include `**/*.test.mjs`. Test inclusion patterns also exclude those files from the source
scope. A `sonar-project.properties` file is ignored by automatic analysis, which uses `.sonarcloud.properties` and
supports a limited set of settings instead. Confirm the project's analysis method and verify the next analysis before
changing its scope. See [Sonar's analysis scope documentation](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/excluding-files-based-on-patterns)
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

Change these versions in `compose/.env`, then synchronize; POMs keep literal values so direct Maven builds and IDE imports need no environment setup. Synchronization is explicit, so editing `.env` alone does not change a POM. Existing Docker builds continue passing version overrides through Maven `-D` arguments.

Only the mapped property values are updated. Formatting, comments, dependency references, and other versions (including `pekko.core.version` and Micronaut integration versions) are preserved. The orchestrator POM is outside this inventory. Missing files, missing or duplicate property declarations, and missing or invalid env versions fail validation before any POM is written. Unchanged POMs are not rewritten.

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
node .\scripts\render-readmes.test.mjs
```

The tests currently cover:

- parsing the repo's colon-style env format
- ignoring commented-out values such as `#SPRING_BOOT_VERSION: ...`
- handling values containing additional colons, such as Windows paths and image tags
- manifest loading and default template fallback behavior
- placeholder rendering
- GitHub Actions `${{ ... }}` expressions staying intact next to README placeholders
- `.template.md` -> output path derivation

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
