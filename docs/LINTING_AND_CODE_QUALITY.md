# Linting and Code Quality

This document describes the code quality and linting setup for the Observability-Benchmarking project.

## JVM Quality Configuration

### Overview
This repository currently uses two scoped JVM quality setups:

- **Java service modules under `services/java/**`** continue to use [Checkstyle](https://checkstyle.org/) to enforce consistent coding standards based on the Google Java Style Guide plus project-specific adjustments.
- **`utils/orchestrator`** now uses a module-local quality stack made up of Spotless, PMD/CPD, SpotBugs + FindSecBugs, and a custom public-API Javadoc checker.

### Versions
- **Java services (`services/java/**`)**
  - **maven-checkstyle-plugin**: 3.6.0
  - **checkstyle**: 12.2.0
- **Orchestrator (`utils/orchestrator`)**
  - **spotless-maven-plugin**: 3.10.4
  - **google-java-format**: 2.0.0
  - **maven-pmd-plugin**: 3.28.0 with PMD 7.29.0
  - **spotbugs-maven-plugin**: 4.10.5.0 with FindSecBugs 1.14.0
  - **exec-maven-plugin**: 3.6.3 (for the custom Javadoc checker)

### Configuration Files
The JVM codebases currently covered by the repository's quality tooling use scoped configuration files per area:
- **`services/java/checkstyle.xml`**: Main Checkstyle configuration for Java services under `services/java/**`
- **`services/java/checkstyle-suppressions.xml`**: Suppressions for the Java services tree
- **`utils/orchestrator/quality/CompactConstructorJavadocParamCheck.java`**: Validates public-API Javadoc tag completeness that PMD does not express declaratively
- **`utils/orchestrator/quality/pmd-rules.xml`**: Main PMD ruleset for orchestrator production code
- **`utils/orchestrator/quality/pmd-fqcn-rules.xml`**: Additional PMD pass for unnecessary fully-qualified names in test code
- **`utils/orchestrator/quality/pmd-test-rules.xml`**: Test-source PMD maintainability rules
- **`utils/orchestrator/quality/spotbugs-exclude.xml`**: Reviewed SpotBugs false-positive exclusions

Individual Maven modules reference these scoped files via relative paths in their `pom.xml` files.

### Running the JVM quality checks

To run the relevant quality checks on a specific module from the repository root:

```bash
# For Quarkus JVM module
mvn -f services/java/quarkus/jvm/pom.xml checkstyle:check

# For Spring JVM Netty module
mvn -f services/java/spring/jvm/netty/pom.xml checkstyle:check

# For the orchestrator validate lane (custom Javadoc checker + Spotless + PMD/CPD)
mvn -f utils/orchestrator/pom.xml validate

# For the orchestrator full quality lane (tests + JaCoCo + SpotBugs too)
mvn -f utils/orchestrator/pom.xml verify
```

The Java-service Checkstyle plugin and the orchestrator quality stack are both wired into the Maven lifecycle, so they run as part of normal builds:

```bash
mvn -f services/java/quarkus/jvm/pom.xml validate
mvn -f utils/orchestrator/pom.xml validate
```

For `services/java/**`, any Checkstyle violation still fails the build. For `utils/orchestrator`, any Spotless, PMD/CPD, custom Javadoc-check, or SpotBugs violation fails the build.

### Key Rules Enforced

#### Naming Conventions
- Class names: PascalCase
- Method names: camelCase
- Constants: UPPER_SNAKE_CASE
- Variables: camelCase

#### Code Style
- Maximum line length: 120 characters
- Indentation: four spaces (no tabs)
- Braces are required for all control structures
- Proper whitespace around operators and keywords

#### Javadoc Requirements
- Public classes must have Javadoc comments
- Public methods must have Javadoc comments
- For the orchestrator, documented public methods, records, compact constructors, and public constants are additionally checked for required `@param` / `@return` tags by `utils/orchestrator/quality/CompactConstructorJavadocParamCheck.java`

#### Import Organization
- No wildcard imports (*) in production JVM code
- No unused imports
- No illegal imports (e.g., sun.* packages)

### Suppressions / reviewed carve-outs

- Java services continue to use their Checkstyle suppressions file for reviewed exceptions.
- The orchestrator quality setup keeps reviewed PMD suppressions narrow and code-local, while reviewed SpotBugs false positives live in `utils/orchestrator/quality/spotbugs-exclude.xml`.

## Qodana Configuration (JVM Static Analysis)

### GitHub Actions Node Runtime Migration Convention
This repository sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at **workflow-level `env:`** in each workflow file so JavaScript-based actions are exercised on Node 24 ahead of GitHub's default runtime migration. The env var is not repeated at job or step level.

The convention is applied in:

- `.github/workflows/qodana_code_quality.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/django_python_quality.yml`
- `.github/workflows/nextjs_dash_quality.yml`
- `.github/workflows/go_quality.yml`

Each occurrence is annotated with `# TODO(node24-migration)` so they can be found and removed once GitHub's default runtime moves to Node 24.

If GitHub still prints a warning saying an action targets Node 20 but is being forced to run on Node 24, that confirms the opt-in is active. The warning should disappear only after the action publisher updates the action metadata to native Node 24 support.

### Overview
This repository also includes a [Qodana](https://www.jetbrains.com/qodana/) setup for deeper JVM static analysis based on IntelliJ inspections. Qodana complements the repository's Maven-side JVM quality gates rather than replacing them:

- **Checkstyle** focuses on formatting, conventions, and structural style rules for `services/java/**`.
- **Spotless / PMD / SpotBugs** provide the equivalent Maven-side style, maintainability, and bug-finding checks for `utils/orchestrator`.
- **Qodana** adds semantic inspections such as probable bugs, API misuse, dead code, and framework-specific warnings.

The current GitHub Actions workflow intentionally limits Qodana to these paths only:
- `services/java/**`
- `utils/orchestrator/**`

That makes it a safe first step for adoption without expanding analysis to the rest of the repository.

### Current GitHub Actions Scope
The workflow in `.github/workflows/qodana_code_quality.yml` runs Qodana in a small matrix:

- `services/java`
- `utils/orchestrator`

It keeps the repository root as the Qodana project so the shared root `qodana.yaml` is applied, then limits each job with `--only-directory`.

The shared root `qodana.yaml` pins the JVM linter image (`jetbrains/qodana-jvm-community:2026.2`) so both the action's initial pull step and the later scoped scan step resolve the same linter in this otherwise mixed-language repository. The workflow uploads two artifacts per matrix entry:

- **`qodana-results-<scope>`** — the full results archive (SARIF, logs) produced by the Qodana action's built-in `upload-result` option. Note: the Qodana action pre-zips this artifact internally, so it cannot be consumed directly by `actions/download-artifact@v4+`.
- **`qodana-report-<scope>`** — the HTML report directory, uploaded by an explicit `actions/upload-artifact@v7.0.2` step. This is what the Pages workflow downloads to host the report.

The workflow also sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow scope so GitHub-hosted JavaScript actions are exercised on Node 24 ahead of GitHub's runtime migration.

GitHub will print an informational warning in the **Complete job** phase similar to:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: JetBrains/qodana-action@v2026.2.2.

This warning **confirms the opt-in is working** — the action targets Node 20 in its published metadata, but our `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` setting successfully forces it to run on Node 24. The warning is purely informational and will disappear only after JetBrains republishes the action with native Node 24 support in its action metadata. No action is required on our side.

It is triggered on:
- manual dispatch
- pull requests touching the scoped paths or Qodana config
- pushes to configured branches touching the scoped paths or Qodana config

### Hosted Qodana Report on GitHub Pages
The Qodana job summary suggests a third option for viewing the detailed HTML report: **Host Qodana report at GitHub Pages**. This repository now implements that option in a safe first-pass way.

How it works:
- the existing GitHub Pages workflow still builds the documentation site from `docs/`
- the Pages workflow builds the Jekyll site explicitly with Bundler using `docs/Gemfile`, which avoids the earlier `github-pages` gem compatibility warning from `actions/jekyll-build-pages`
- after a **successful** `Qodana` workflow run on `main`, the Pages workflow runs again via `workflow_run`
- it checks out the exact analyzed commit (`head_sha`) from that Qodana run
- it downloads the uploaded Qodana HTML report artifacts for both matrix entries:
  - `qodana-report-services-java`
  - `qodana-report-orchestrator`
- the HTML report is uploaded as a separate `actions/upload-artifact@v7.0.2` step in the Qodana workflow, ensuring compatibility with `actions/download-artifact@v8.0.2` in the Pages workflow (the Qodana action's built-in `upload-result` pre-zips files, making them unusable by `download-artifact@v4+`)
- it copies those artifacts into the built Pages site under:
  - `quality/services-java/`
  - `quality/orchestrator/`
- versioned scripts handle report resolution, message generation, logging, and HTML assembly under `scripts/pages/` for easier testing and review
- it also creates a small landing page at `quality/index.html`
- each scope URL (`quality/services-java/` and `quality/orchestrator/`) now always has its own landing page: if a nested Qodana HTML entrypoint is found it redirects there, otherwise it explains that the hosted report is unavailable for that scope/run
- during the Pages build, the workflow logs the resolved Qodana run ID, commit SHA, and a final per-artifact status (`available`, `unavailable`, `download failed`, or `undetermined`) for easier troubleshooting in the Actions UI

Why this is a good first implementation:
- it does **not** change the committed documentation sources under `docs/`
- it does **not** interfere with the normal Jekyll documentation site
- it publishes the report for the exact commit Qodana analyzed
- it keeps the Qodana hosting logic entirely inside GitHub Actions

Important behavior:
- only Qodana runs on `main` are published to GitHub Pages
- pull request Qodana runs are **not** published publicly
- if a push to `main` does not trigger the Qodana workflow, the previously published Pages-hosted Qodana report remains in place until the next successful `main` Qodana run refreshes it
- if the Pages workflow resolves a Qodana run but one or both artifacts are missing or cannot be retrieved, the documentation site still deploys and the hosted Qodana landing page explains what was unavailable

The Pages workflow sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow scope so GitHub-hosted JavaScript actions are exercised on Node 24 ahead of GitHub's runtime migration. All actions are pinned to full commit SHAs for supply-chain hardening (with version comments). The remaining official Pages actions still in use (`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, and `actions/deploy-pages@v5.0.1`) are still published upstream with Node 20 metadata today, so GitHub may continue to print informational migration warnings for them until those actions are republished by their maintainers.

Expected URL shape:

```text
https://<owner>.github.io/<repo>/quality/
https://<owner>.github.io/<repo>/quality/services-java/
https://<owner>.github.io/<repo>/quality/orchestrator/
```

If your repository uses a custom GitHub Pages domain, replace the `github.io/<repo>` part with that domain's base URL.

### Quality Gate
The current `qodana.yaml` uses a hardened gate covering the three most actionable severities:

```yaml
failureConditions:
  severityThresholds:
    critical: 0
    high: 0
    moderate: 0
```

This means the Qodana job will fail if it finds at least one **critical**, **high**, or **moderate** issue in the scoped JVM code.

Why this works well:
- it catches the most impactful findings without drowning the team in low-severity noise
- it still protects against the most serious findings
- it gives the team room to tighten further (e.g., adding `info` or `low`) once the current thresholds are reliably green

### Baseline Strategy
The workflow now supports a low-risk, per-scope baseline strategy for the same two JVM scopes:

- `.qodana/baseline/services-java.sarif.json`
- `.qodana/baseline/orchestrator.sarif.json`

How it works:
- each matrix job always analyzes only its scoped directory
- if the matching baseline file exists, the workflow adds `--baseline=<file>` for that scope
- if the baseline file does not exist, the scan still runs normally without a baseline

Why this is a safe rollout strategy:
- baseline files are plain SARIF and can be reviewed in pull requests
- there is no dependency on cross-run artifact fetching or external services
- you can adopt baselines one scope at a time instead of flipping the whole repository at once
- the existing `critical: 0` gate stays in place, so the baseline strategy reduces historical noise without changing the overall safety posture

The baseline directory is tracked intentionally, while local Qodana working output under `.qodana/` is ignored by Git.

### Testing Qodana Locally

#### Prerequisites
- Docker installed locally
- enough memory for a JVM analysis container
- for Maven sanity checks outside the container, a local JDK matching the repository target (`Java 25`)

Before running Qodana, it is useful to confirm the affected Maven projects still import and validate cleanly:

```bash
mvn -f services/java/quarkus/jvm/pom.xml -DskipTests validate
mvn -f utils/orchestrator/pom.xml -DskipTests validate
```

Run the same Qodana linter image locally from the repository root.

**Bash / zsh:**

```bash
mkdir -p .qodana/services-java .qodana/orchestrator

docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/services-java":/data/results \
  jetbrains/qodana-jvm-community:2026.2 \
  --project-dir=/data/project \
  --only-directory=services/java \
  --results-dir=/data/results

docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/orchestrator":/data/results \
  jetbrains/qodana-jvm-community:2026.2 \
  --project-dir=/data/project \
  --only-directory=utils/orchestrator \
  --results-dir=/data/results
```

**PowerShell:**

```powershell
New-Item -ItemType Directory -Force .qodana/services-java, .qodana/orchestrator | Out-Null

docker run --rm `
  -v "${PWD}:/data/project" `
  -v "${PWD}/.qodana/services-java:/data/results" `
  jetbrains/qodana-jvm-community:2026.2 `
  --project-dir=/data/project `
  --only-directory=services/java `
  --results-dir=/data/results

docker run --rm `
  -v "${PWD}:/data/project" `
  -v "${PWD}/.qodana/orchestrator:/data/results" `
  jetbrains/qodana-jvm-community:2026.2 `
  --project-dir=/data/project `
  --only-directory=utils/orchestrator `
  --results-dir=/data/results
```

Notes:
- Local scans automatically use the repository's `qodana.yaml` because the project root is mounted as `/data/project`.
- In CI, the workflow relies on the root `qodana.yaml` linter pin so the action's pull and scan phases stay aligned, while the workflow arguments only scope the directory and optional baseline.
- A non-zero container exit code means the configured quality gate was violated.
- A `QODANA_TOKEN` is not required for local scans unless you later decide to upload results to Qodana Cloud.
- Results and logs are written under `.qodana/` in the example commands above.

### Creating or Refreshing a Baseline
The safest baseline workflow is to generate a candidate SARIF, review it, and only then promote it into `.qodana/baseline/`.

Local candidate flow:

```bash
# services/java candidate
mkdir -p .qodana/baseline-candidates/services-java
docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/baseline-candidates/services-java":/data/results \
  jetbrains/qodana-jvm-community:2026.2 \
  --project-dir=/data/project \
  --only-directory=services/java \
  --results-dir=/data/results

# orchestrator candidate
mkdir -p .qodana/baseline-candidates/orchestrator
docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/baseline-candidates/orchestrator":/data/results \
  jetbrains/qodana-jvm-community:2026.2 \
  --project-dir=/data/project \
  --only-directory=utils/orchestrator \
  --results-dir=/data/results
```

Then:
1. inspect the generated SARIF in the chosen results directory
2. decide whether the findings represent accepted historical debt for that scope
3. copy the reviewed SARIF into `.qodana/baseline/services-java.sarif.json` or `.qodana/baseline/orchestrator.sarif.json`
4. commit the baseline file in a pull request

CI candidate flow:
1. run the Qodana workflow manually or from a branch touching the scoped paths
2. download the uploaded Qodana results artifact for the relevant matrix entry
3. review the SARIF from that artifact
4. promote the reviewed SARIF into the matching file under `.qodana/baseline/`

Because the workflow only adds `--baseline` when the reviewed file exists, you can roll this out gradually and safely.

### What Qodana Offers This Repository
For the currently scoped JVM code, Qodana can provide:

- PR annotations for actionable issues directly in changed code
- IntelliJ-based inspections that go beyond formatting/style rules
- consistent static analysis across many Java frameworks in this repository
- uploaded result artifacts for later review even when annotations are disabled or truncated
- a public Pages-hosted HTML report for the latest successful `main` analysis of each scoped area

### Worthwhile Next Updates After This First Pass
Once the workflow has run a few times and the issue signal is understood, the next worthwhile improvements would be:

1. tighten the gate further (e.g., add `info` or `low` thresholds) if the findings at those severities are manageable
2. refresh or shrink the reviewed baseline files as historical findings are fixed
3. add module-specific follow-up exclusions only where Qodana proves noisy, rather than disabling broad inspections up front
4. consider separate documentation or workflow expansion for other languages only after the JVM path proves useful

## Ruff Configuration (Python)

### Overview
Python services (Django) use [Ruff](https://docs.astral.sh/ruff/) as a fast, all-in-one linter and formatter, enforcing PEP 8 and import ordering.

The CI workflow runs both `ruff check` (lint) and `ruff format --check` (formatting verification) on all Django paths.

### Qodana Python Community (Django Static Analysis)

In addition to Ruff, the Django CI workflow runs [Qodana Python Community](https://www.jetbrains.com/qodana/) (`jetbrains/qodana-python-community:2026.2`) for deeper static analysis based on PyCharm Community inspections. This complements Ruff:

- **Ruff** covers PEP 8, import ordering, formatting, security (`S`), bugbear (`B`), and async (`ASYNC`) checks.
- **Qodana Python Community** adds semantic inspections such as type mismatches, unreachable code, unused variables, and general Python best-practice warnings.

The scan uses a dedicated configuration at `services/python/django/qodana.yaml` because the root `qodana.yaml` pins the JVM linter (`jetbrains/qodana-jvm-community:2026.2`). The Python config has its own linter pin and quality gate, and reuses the shared Python CI installer and hash inventory through read-only mounts outside the analysis root.

#### How the Qodana Python Scan Works

The `qodana` job in `.github/workflows/django_python_quality.yml` runs independently of the `common` checks so lint failures do not hide semantic diagnostics:

1. Checks out the repository without persisted credentials and sets up Python.
2. Invokes `scripts/run-qodana-python.py`, using the Community image tag and digest from `services/python/django/qodana.yaml` (maintained by Renovate):
   - The Django source root and intermediate directories are validated before copying; symlink/junction redirection is rejected. Only a disposable Django copy is opened at `/data/workspace/services/python/django`; host IDE metadata, virtualenvs, caches, build output, and `.env` files are omitted.
   - Docker runs as the caller's non-root UID/GID with `--cap-drop=ALL` and `--security-opt=no-new-privileges`.
   - No host Git directories, config, object database, or `.git` pointer are mounted/copied. The host collects only the revision, attached branch, and sanitized network repository URI and adds them to exported SARIF after analysis. URL userinfo, query strings, and fragments are stripped; local/unsupported remote URLs are omitted. Git integration is unavailable inside Qodana, so its native report/logs may lack Git metadata; exported SARIF receives the sanitized provenance without altering findings or invocation status.
   - Shared requirements and installer are mounted read-only at `/opt/python-ci/requirements` and `/opt/python-ci/installer`.
3. Before analysis, the `bootstrap` command in `qodana.yaml` installs the project dependencies (`django`, `opentelemetry-*`, `gunicorn`, `cachetools`, and the local `obbench-django-common` package) so that Qodana can resolve imports and perform accurate type inference. Without a bootstrap, every third-party import would produce unresolved-reference false positives not visible in the IDE.
4. Runs `scripts/qodana-python-report.py` even after scan failure, writes inspection-count diagnostics, and verifies required inspections remain enabled.
5. Always attempts HTML upload as `qodana-report-django-python` and logs/SARIF/summary upload as `qodana-diagnostics-django-python`, unless cancelled.

The workflow uses `docker run` directly instead of the `JetBrains/qodana-action` because the action's internal image-pull phase reads the root `qodana.yaml` (which pins the JVM linter). Running the container directly is explicit and avoids image conflicts.

**Why the bootstrap is critical:** Qodana needs installed dependencies to resolve imports accurately. Its bootstrap uses the same hash inventory as the Django checks and Snyk, with `--require-hashes --only-binary :all:` for third-party packages and local build tools. The common package is built from a temporary copy with `--no-deps --no-build-isolation --no-index`, so builds cannot fetch unverified dependencies or leave build artifacts in the checkout. Pyroscope requirements remain filtered out of this analysis-only environment. Missing shared files, hashes, or compatible wheels fail the bootstrap; there is no unhashed fallback.

**Python version mismatch:** The analyzer's bundled Python can be older than the project's declared `requires-python >= 3.13`. The bootstrap sets `PIP_IGNORE_REQUIRES_PYTHON=1` only in this analysis environment. Packages are installed for import resolution and type inference; the Django runtime tests continue using Python 3.13.

#### Quality Gate

The Python `qodana.yaml` uses the same hardened gate as the JVM config:

```yaml
failureConditions:
  severityThresholds:
    critical: 0
    high: 0
    moderate: 0
```

#### Community Inspection Hardening and Enforcement

The `qodana.recommended` profile is extended with:

- `PyUnresolvedReferencesInspection`
- `PyTypeCheckerInspection`
- `PyArgumentListInspection`
- `PyDataclassInspection`
- `PyCompatibilityInspection`, targeting Python 3.13
- `PyMissingTypeHintsInspection`, scoped to shared production code, excluding tests

Some of these are deliberately disabled by JetBrains' recommended profile because dynamic Python can produce false positives. Review findings and use only narrow, explained suppressions. Do not globally disable correctness checks or baseline new findings blindly.

The compatibility inspection stores versions in a legacy JDOM list. The bootstrap copies repository-managed `quality/Project_Default.xml` and `quality/profiles_settings.xml` into the disposable project's inspection settings so the recommended profile inherits Python 3.13 targeting; scalar YAML overrides are silently ignored for this option. The runner explicitly sets `QODANA_PYTHON_PATH` to the bundled interpreter, ensuring SDK/import resolution is available.

The job has no `continue-on-error`: scanner failures, quality-gate violations, and coverage regressions block workflow success. The inspection-summary helper reads enabled flags from SARIF, requires at least 112 enabled inspections (the reviewed 106 plus six additions), and checks mandatory rule IDs. Missing or malformed SARIF fails closed while still producing summary diagnostics. Updating the image/profile requires reviewing this coverage contract.

Artifact uploads use `always() && !cancelled()`, so enforcing the gate does not prevent retaining reports after failure. Pages accepts completed successful or failed Django runs so failed-run findings remain visible in the hosted report without weakening the gate.

#### Hosted Qodana Python Report on GitHub Pages

The Qodana Python HTML report is published to GitHub Pages alongside the JVM and Next.js reports:

```text
https://george-c-odes.github.io/Observability-Benchmarking/quality/django-python/
```

The Pages workflow triggers on completed successful or failed `Django Python Quality` runs on `main`, downloads the `qodana-report-django-python` artifact, and copies it into the site under `quality/django-python/`. It does not skip a newer failed scan in favor of an older successful report. If the selected run has no usable artifact, the site reports that unavailability.

#### Testing Qodana Python Locally

**Bash / zsh:**

```bash
temp_root="${RUNNER_TEMP:-$(python3 -c 'import tempfile; print(tempfile.gettempdir())')}"
results="$temp_root/qodana-python/results"
scan_status=0
python3 scripts/run-qodana-python.py --results-dir "$results" || scan_status=$?
coverage_status=0
python3 scripts/qodana-python-report.py "$results" || coverage_status=$?
test "$scan_status" -eq 0 && test "$coverage_status" -eq 0
```

**PowerShell:**

```powershell
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { python -c "import tempfile; print(tempfile.gettempdir())" }
$results = Join-Path $tempRoot 'qodana-python/results'
python scripts/run-qodana-python.py --results-dir "$results"
$scanExit = $LASTEXITCODE
python scripts/qodana-python-report.py "$results"
$coverageExit = $LASTEXITCODE
if ($scanExit -ne 0 -or $coverageExit -ne 0) { throw "Qodana failed; inspect $results/scan.log and the report." }
```

Notes:
- The `bootstrap` command in `services/python/django/qodana.yaml` runs automatically inside the container before analysis, installing Django and other dependencies so imports resolve correctly.
- A non-zero scanner exit code indicates a quality-gate violation or scanner/bootstrap failure. A non-zero summary exit code indicates failed analysis or missing inspection coverage.
- A `QODANA_TOKEN` is not required for local scans with the community linter.
- Use `RUNNER_TEMP/qodana-python/results` (OS temp locally) for both helpers. Reusing a non-empty results directory is rejected; archive or remove prior results before another scan. The selected workspace and launcher environment must be trusted; see `docs/SECURITY.md` for the trust boundary.
- Run helper tests with `python -m unittest discover -s scripts -p test_qodana_python.py -v`.

### Configuration
Each Django module has its own Ruff configuration in a local `pyproject.toml`
(for example, under `services/python/django/gunicorn/common/`, `.../WSGI/`, and
`.../ASGI/`). These configurations are kept aligned so that, in practice, the
same settings are applied when linting `common`, `WSGI`, and `ASGI`:
- **Target version**: Python 3.13
- **Line length**: 100 characters
- **Rules**: `E` (pycodestyle errors), `F` (Pyflakes), `I` (isort import ordering), `S` (security), `B` (bugbear), `ASYNC` (async correctness)
- **Narrow exceptions**: `S104` for intentional container-interface binding in infrastructure configuration; `S108` for Gunicorn's owned, mode-0700 tmpfs heartbeat directory and its verification test. These preserve benchmark behavior, not blanket exemptions for application code or tests.

### Running Ruff

```bash
# Check all Django Python paths
cd services/python/django/gunicorn/WSGI
python -m ruff --version
python -m ruff check .
python -m ruff format --check .

cd services/python/django/gunicorn/ASGI
python -m ruff --version
python -m ruff check .
python -m ruff format --check .

cd services/python/django/gunicorn/common
python -m ruff --version
python -m ruff check .
python -m ruff format --check .
```

### Additional Django quality checks

The Django CI workflow also performs syntax validation and Django system checks.
The workflow prints the Ruff version before each lint/format step for visibility:

```bash
# Shared package syntax check
cd services/python/django/gunicorn/common
python -m compileall src
python -m ruff --version

# Runtime module syntax + Django checks
cd ../WSGI
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff --version
python manage.py check

cd ../ASGI
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff --version
python manage.py check
```

For full CI parity, run the shared test suite from each module as documented in
`docs/TESTING.md`.

Ruff is also available as an IDE plugin for real-time feedback.

## golangci-lint Configuration (Go Services)

### Overview
Both Go modules — `services/go/enhanced` and `services/go/simple` — use [golangci-lint](https://golangci-lint.run/) as an aggregated Go linter running multiple analyzers in parallel. Each module keeps its own configuration file:

- `services/go/enhanced/.golangci.yml`
- `services/go/simple/.golangci.yml`

### Enabled Linters
- **govet** — reports suspicious constructs (e.g., Printf calls with mismatched format strings)
- **errcheck** — checks that error return values are used
- **staticcheck** — advanced static analysis (SA, S, ST checks)
- **ineffassign** — detects assignments to existing variables that are never read
- **revive** — extensible linter replacing golint
- **gocritic** — opinionated collection of checks not covered elsewhere
- **unused** — detects unused constants, variables, functions, and types
- **gosec** — security-oriented checks (SQL injection, hardcoded credentials, etc.)
- **unconvert** — removes unnecessary type conversions

### Formatters
- **gofmt** — enforces standard Go formatting
- **goimports** — enforces import grouping and ordering
Test files (`_test.go`) have relaxed rules: `errcheck` and `gosec` are excluded.

### GitHub Actions Workflow
The workflow in `.github/workflows/go_quality.yml` covers both Go modules in parallel jobs:

**Enhanced** (`quality` job) — full quality pipeline:

1. **go mod tidy verification** — ensures `go.mod` / `go.sum` stay tidy
2. **go vet** — built-in Go analysis
3. **golangci-lint run** — aggregated lint with `.golangci.yml` configuration
4. **go test** — unit tests with race detector (`-race`)
5. **go build** — compilation smoke test
6. **govulncheck** — non-blocking vulnerability scan for visibility in CI

**Simple** (`quality-simple` job) — full quality pipeline:

1. **go mod tidy verification** — ensures `go.mod` / `go.sum` stay tidy
2. **go vet** — built-in Go analysis
3. **golangci-lint run** — aggregated lint with `.golangci.yml` configuration
4. **go test** — unit tests with race detector (`-race`)
5. **go build** — compilation smoke test
6. **govulncheck** — non-blocking vulnerability scan for visibility in CI

The workflow is triggered on:
- manual dispatch
- pull requests touching `services/go/**`
- pushes to `main` touching `services/go/**`
- a weekly scheduled run (Monday at 06:00 UTC)

### Hosted Quality Reports on GitHub Pages
After each run, both Go jobs use the `golangci-lint run` step, configured via `.golangci.yml` `output.formats`, to write a `golangci-lint-report.json` file. That JSON is then consumed by `scripts/pages/generate-go-quality-report.mjs` (using shared utilities from `scripts/pages/report-helpers.mjs`) to generate self-contained HTML quality reports.

Uploaded artifacts:

- `quality-report-go` → enhanced module
- `quality-report-go-simple` → simple module

Expected URLs:

```text
https://george-c-odes.github.io/Observability-Benchmarking/quality/go/
https://george-c-odes.github.io/Observability-Benchmarking/quality/go-simple/
```

The report includes:
- Summary cards (overall pass/fail, error/warning counts)
- Per-linter issue breakdown table
- Per-file findings table with severity, linter name, message, and line/column
- Metadata (commit SHA, workflow run, tool versions, timestamp)
- Dark mode support via `prefers-color-scheme`

### Running golangci-lint Locally

```bash
cd services/go/enhanced
golangci-lint run
go vet ./...
go test ./... -race
go build ./cmd/server

cd ../simple
golangci-lint run
go vet ./...
go test ./... -race
go build ./cmd/server
```

> **Note:** The `.golangci.yml` `output.formats` section already writes both human-readable text to stdout and a JSON report to `golangci-lint-report.json` in a single pass. No extra CLI flags are needed.

Or use the provided Makefile targets:

```bash
cd services/go/enhanced
make lint
make test
make coverage

cd ../simple
make lint
make test
make coverage
```

### Pages Integration for the Go Quality Report

The Pages workflow resolves the Go quality report source independently of other report sources:

- When triggered by the `Go Quality` workflow, the triggering run is used for the Go report and the latest successful runs for Qodana, Next.js, and Django Python are resolved via API
- When triggered by any other workflow or by push/manual dispatch, the latest successful `Go Quality` run on `main` is resolved via API

Scripts involved:
- `scripts/pages/resolve-source.sh` — generic parameterized resolver for any quality workflow run (accepts `RESOLVE_WORKFLOW_NAME`, `RESOLVE_WORKFLOW_FILE`, and `RESOLVE_ACCEPTED` env vars)
- `scripts/pages/generate-go-quality-report.mjs` — generates the HTML report from golangci-lint JSON output
- `scripts/pages/report-helpers.mjs` — shared module providing HTML escaping, CSS theming, metadata assembly, and report output helpers used by all three report generators
- `scripts/pages/assemble-quality-pages.sh` — assembles all quality report scopes (Qodana JVM, Django Python, Go, Next.js, CodeQL) into the Pages site

## CodeQL Configuration (Security & Quality Analysis)

### Overview

This project uses [GitHub CodeQL](https://codeql.github.com/) for automated security vulnerability detection and code quality analysis across all major languages in the repository. CodeQL is a free semantic code analysis engine that identifies CWE patterns, injection flaws, data-flow vulnerabilities, and more.

### Languages Scanned

| Language                | Build Mode | Coverage                                           |
|-------------------------|------------|----------------------------------------------------|
| `java-kotlin`           | manual     | `services/java/**/jvm/**`, `utils/orchestrator/**` |
| `python`                | none       | `services/python/**`                               |
| `go`                    | manual     | `services/go/**`                                   |
| `javascript-typescript` | none       | `utils/nextjs-dash/**`                             |

### Java Build Details

The `java-kotlin` analysis compiles **12 JVM modules** (11 services and orchestrator) using `manual` build mode.
Six native-image modules (`quarkus/native`, `spring/native/*`, `helidon/*/native`, `micronaut/native`) are
**deliberately excluded** — they are very slow, resource-heavy, and duplicate the source of their JVM counterparts
(CodeQL already sees that code via the JVM builds).

**Checkstyle enforcement**: Every module is compiled with checkstyle enforced as fatal
(`failsOnError=true`, `failOnViolation=true`, `violationSeverity=warning`), matching the
orchestrator module's configuration.

**Incremental builds**: On `push` and `pull_request` events, only modules whose source tree
actually changed are compiled. A `git diff` against the previous commit (push) or PR base (pull request)
maps changed files to the owning module directory. Shared configuration changes
(`services/java/checkstyle*.xml`, `.github/workflows/codeql.yml`) trigger a full rebuild of all
affected modules. On `schedule` and `workflow_dispatch`, all 12 modules are always built.

**Maven caching**: The `setup-java` action caches `~/.m2/repository` keyed on the JVM module
`pom.xml` files, mirroring the dependency-warming strategy used in the Dockerfiles
(`mvn dependency:go-offline` with `--mount=type=cache`).

### Workflow

The CodeQL workflow (`.github/workflows/codeql.yml`) runs:

- **On push** to `main` (path-scoped to source directories)
- **On pull request** (path-scoped to source directories)
- **On schedule** — weekly full scan (Monday at 05:30 UTC) to catch newly published CWE patterns and updated query packs
- **On manual dispatch** via `workflow_dispatch`

Each language is analyzed in a separate matrix job. Results are:

1. **Uploaded as SARIF** to GitHub's Security tab (Code Scanning alerts)
2. **Combined into an HTML report** and published to GitHub Pages at [`quality/codeql/`](https://george-c-odes.github.io/Observability-Benchmarking/quality/codeql/)

The report is always published, even when CodeQL finds security issues, so the hosted page remains current.

### Hosted Report

The latest CodeQL report is published at:

> **[https://george-c-odes.github.io/Observability-Benchmarking/quality/codeql/](https://george-c-odes.github.io/Observability-Benchmarking/quality/codeql/)**

The report includes:
- Overall pass/fail status
- Findings by language breakdown
- Findings by CodeQL rule breakdown
- Detailed findings table with a file, location, severity, language, rule, and message

The HTML report is generated by `scripts/pages/generate-codeql-report.mjs` (using shared utilities from `scripts/pages/report-helpers.mjs`) from the SARIF output of each language's CodeQL analysis. The Pages workflow downloads the `quality-report-codeql` artifact and copies it into the site under `quality/codeql/`.

### Running CodeQL Locally

You can run CodeQL locally using the [CodeQL CLI](https://codeql.github.com/docs/codeql-cli/):

```bash
# Install the CodeQL CLI (see https://codeql.github.com/docs/codeql-cli/getting-started-with-the-codeql-cli/)

# Create a CodeQL database for a specific language
codeql database create codeql-db --language=java-kotlin --source-root=.

# Run the analysis
codeql database analyze codeql-db --format=sarif-latest --output=results.sarif

# View results
cat results.sarif | python3 -m json.tool
```

### Action Versions

- **CodeQL Action**: `github/codeql-action@9b3254085494b55a0f7c4c2b3d2d52cc712ce370` (# v4.39.1, SHA-pinned)
- **Query packs**: default (automatically updated by GitHub)

## Code Quality Standards

### Next.js Dashboard (Oxlint + Oxfmt + TypeScript 7)

#### Overview

The `utils/nextjs-dash` module (Next.js / React / TypeScript) has its own quality gates enforced by a dedicated GitHub Actions workflow (`.github/workflows/nextjs_dash_quality.yml`):

1. **Oxfmt 0.75.0** — verifies deterministic formatting with `oxfmt --check .`.
2. **Oxlint 1.90.0** — checks the module root with warnings denied.
3. **TypeScript 7.0.2** — runs the native strict checker through the supported `tsc --noEmit` command.
4. **Vitest 5.0.5** — runs separate Node and jsdom suites.
5. **Production build** — runs `next build` as a smoke test for import and configuration regressions.

The CI workflow runs for matching pushes and pull requests, weekly, and on manual dispatch.

#### Oxlint and Oxfmt Configuration

`utils/nextjs-dash/.oxlintrc.json` enables Oxlint's native `nextjs`, `react`,
`typescript`, `import`, and `jsx-a11y` plugins. It preserves the dashboard's
Next.js core-web-vitals, React Hooks, TypeScript correctness, import, and
accessibility checks. Overrides provide browser globals to application code,
Node globals to API routes, libraries, scripts, and config files, and both
environments plus Vitest globals to tests. Generated output, dependencies,
coverage, reports, and local temporary files are ignored.

Both the config and `npm run lint` deny warnings. Unused disable directives are
reported as errors, so CI remains a zero-warning gate.

`utils/nextjs-dash/.oxfmtrc.json` fixes the formatter conventions at two-space
indentation, semicolons, single quotes in JavaScript and TypeScript, trailing
commas in multiline constructs, a 100-column print width, and LF endings.
Import sorting and `package.json` sorting remain disabled. `npm run format`
writes changes, while `npm run format:check` only verifies the current tree.

#### TypeScript Configuration

`utils/nextjs-dash/tsconfig.json` enables strict mode with these key settings:

- `"strict": true`
- `"noEmit": true`
- `"target": "ES2020"`
- `"moduleResolution": "bundler"`
- `"jsx": "react-jsx"`

The `npm run typecheck` script runs `tsc --noEmit` to catch type errors without producing output files. With `typescript@7.0.2`, `tsc` invokes the stable native checker.

#### Running Quality Checks Locally

```bash
cd utils/nextjs-dash
npm ci

# Individual checks
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test:node
npm run test:dom
npm run test:fast
npm run test:coverage
npm run build

# Report generator validation (run from utils/nextjs-dash)
node --test ../../scripts/pages/generate-nextjs-quality-report.test.mjs
```

#### Qodana JS — Not Currently Active (Licensing)

A module-local Qodana configuration exists at `utils/nextjs-dash/qodana.yaml` pinning `jetbrains/qodana-js:2026.2`. However, unlike the JVM scopes which use the free `jetbrains/qodana-jvm-community` image, JetBrains does **not** publish a community edition of the JavaScript/TypeScript linter. The `jetbrains/qodana-js` image requires a paid [Qodana Cloud](https://www.jetbrains.com/qodana/) subscription and a valid `QODANA_TOKEN`.

Because this repository currently uses the free community JVM linter, the JS scope is **not** included in the Qodana CI workflow. The configuration file is kept in the repository so it can be activated by adding a `nextjs-dash` matrix entry to `.github/workflows/qodana_code_quality.yml` once a Qodana Cloud license covering JavaScript analysis is available. When re-enabling, the Qodana action does not support a `linter` input — you must add a `docker pull jetbrains/qodana-js:2026.2` step before the scan to ensure the image is available (the action's internal pull phase only reads the root `qodana.yaml`).

#### Free Alternative — Hosted Oxlint, Oxfmt, and TypeScript 7 Quality Report

Since there is no free Qodana community linter for JavaScript/TypeScript, this repository generates a **self-contained HTML quality report** from the same Oxfmt, Oxlint, and TypeScript 7 checks used by the module and CI:

- **Oxfmt** — records the non-mutating format check and its exit status
- **Oxlint** — runs the native Next.js, React, TypeScript, import, and accessibility rules from `.oxlintrc.json`, with warnings denied
- **TypeScript 7** — runs the native strict checker through `tsc --noEmit`

How it works:

1. The `Next.js Dashboard Quality` workflow (`.github/workflows/nextjs_dash_quality.yml`) runs formatting, lint, typecheck, split tests, report-generator tests, and the production build as separate gates
2. After the quality gates, it captures Oxfmt output, Oxlint JSON, and TypeScript diagnostics even when an earlier gate failed
3. A Node.js script (`scripts/pages/generate-nextjs-quality-report.mjs`) produces a polished, self-contained HTML report from those results, using shared utilities from `scripts/pages/report-helpers.mjs` (HTML escaping, CSS theming, metadata assembly)
4. The report is uploaded as a `quality-report-nextjs-dash` artifact
5. The Pages workflow downloads the artifact and publishes it alongside the Qodana JVM reports

Oxlint 1.82 emits one JSON object with a `diagnostics` array and run metadata
such as `number_of_files`. Each diagnostic supplies a string `severity`, `code`,
`message`, `filename`, and source positions under `labels[].span`. The report
normalizes Windows and POSIX paths and displays severity, rule ID, message,
line, column, and span length. TypeScript diagnostics come from the tool-neutral
`typescript-output.txt` file and retain multiline messages. Oxfmt output is read
from `oxfmt-output.txt`, including the explicit exit-code marker written by CI.
Missing, malformed, or structurally invalid inputs produce visible report
warnings and a failed overall verdict.

The report includes:
- Summary cards for the overall verdict, Oxfmt, Oxlint errors/warnings, and TypeScript 7 diagnostics
- Per-file Oxlint findings with severity, rule ID, message, and source position
- Oxfmt output and TypeScript multiline diagnostics
- Metadata (commit SHA, workflow run, tool versions, timestamp)
- Dark mode support via `prefers-color-scheme`

Expected URL:

```text
https://george-c-odes.github.io/Observability-Benchmarking/quality/nextjs-dash/
```

The landing page at `quality/` now links to all seven scopes:
- `quality/services-java/` — Qodana JVM (IntelliJ inspections)
- `quality/orchestrator/` — Qodana JVM (IntelliJ inspections)
- `quality/django-python/` — Qodana Python Community (PyCharm inspections)
- `quality/go/` — golangci-lint (aggregated Go static analysis)
- `quality/go-simple/` — golangci-lint (aggregated Go static analysis)
- `quality/nextjs-dash/` — Oxlint + Oxfmt + TypeScript 7 (free alternative)
- `quality/codeql/` — CodeQL (semantic security and quality analysis)

The report is always generated (even when earlier quality steps fail) so that the hosted report captures the current state of the code. Live Next.js reports use successful runs on `main`. Qodana, Django Python Quality, Go Quality, and CodeQL also accept failed runs because they retain available reports after quality-gate failures (`if: always() && !cancelled()`). All these workflows accept success or failure in shared non-main staging; cancelled/skipped runs are not selected.

#### Pages Integration for the Next.js Quality Report

The Pages workflow resolves the Next.js quality report source independently of the Qodana source:

- A matching `workflow_run` supplies its triggering run when its branch, conclusion, and source repository satisfy the requested scope's policy.
- Other report sources, and all sources for push/manual dispatch, use the latest completed API run with an accepted conclusion in the requested branch scope.
- Live sources use `main`; shared staging uses non-main branches. Django accepts success or failure in both scopes, so a failed main scan can refresh its own live report or be selected during another workflow's Pages publish.

Missing or unusable selected artifacts produce an unavailable report status rather than silently substituting an older successful scan.

The Pages publisher always checks out `main` for the site, scripts, and local actions,
with persisted Git credentials disabled. Report revisions are metadata only; their
source code is never executed by the publisher. Both triggering runs and API-selected
runs must have a source repository matching this repository, so fork reports are
excluded from live and staging publishing. The build job has read permissions only;
`pages: write` and `id-token: write` are reserved for the deployment job.

Manual dispatch refreshes both `/quality/` and `/stage/quality/` using the same
report-selection rules as automatic publishing. The former `source_ref` input has
been removed: publishing branch reports does not require checking out branch code.
Run the resolver regression tests with `node --test scripts/pages/resolve-source.test.mjs`.

Scripts involved:
- `scripts/pages/resolve-source.sh` — generic parameterized resolver; each Pages step supplies `RESOLVE_WORKFLOW_NAME`, `RESOLVE_WORKFLOW_FILE`, and `RESOLVE_ACCEPTED` (Qodana, Django Python Quality, Go Quality, and CodeQL accept `success,failure`; Next.js accepts `success` live and `success,failure` in staging)
- `scripts/pages/report-helpers.mjs` — shared module providing HTML escaping, CSS theming, metadata assembly, and report output helpers used by all three report generators
- `scripts/pages/assemble-quality-pages.sh` — assembles all quality report scopes (Qodana JVM, Django Python, Go, Next.js, CodeQL) into the Pages site

### Documentation
All public classes and methods should include:
1. **Class-level Javadoc**: Describing the purpose and responsibility of the class
2. **Method-level Javadoc**: Describing what the method does, its parameters, return value, and any exceptions thrown
3. **Inline comments**: For complex logic that may not be immediately obvious

### Best Practices Applied

#### Security
- No hardcoded credentials or secrets in source code
- Sensitive data should be externalized to environment variables
- Use proper file permissions in Dockerfiles
- Run containers as non-root users (UID 1001)

#### Performance
- Efficient use of caching (Caffeine cache with appropriate size limits)
- Proper thread pool configuration
- Memory management with explicit heap settings

#### Maintainability
- Single Responsibility Principle for classes
- Dependency Injection for better testability
- Clear separation of concerns (config, rest, etc.)

## Integration with CI/CD

### Framework version consistency and Renovate

`compose/.env` is the source of truth for benchmark framework/runtime versions. Renovate updates its
active version values through custom managers instead of independently updating the generated POM,
Go, Docker, or Django copies. The **Framework Version Sync** workflow runs trusted base-branch
synchronizers and adds generated manifests, verified Django locks, IDE build configurations, and
documentation to the same Renovate PR before merge. The normal service quality workflows then test
that generated commit. Unrelated dependency updates and Docker/action digest maintenance remain enabled.

The **Framework Version Consistency** workflow tests the synchronization logic and checks all managed
outputs against the env on PRs and `main`, including Docker hash projection freshness. Make its check
required in branch protection. Major-upgrade dashboard approval and existing service quality gates
remain unchanged; consistency checks do not establish framework API compatibility.

For manual updates, run `node scripts/sync-framework-versions.mjs`, then the same command with `--check`.
Actual Django version changes require a Linux Python/pip-tools compiler environment; up-to-date checks
do not fetch dependencies. Automatic PR publication requires the repository secret `RENOVATE_SYNC_TOKEN`
so generated commits trigger CI instead of being suppressed by `GITHUB_TOKEN`.
See [framework synchronization and one-time Renovate setup](../scripts/README.md#framework-versions-and-renovate).

### Language quality gates

Checkstyle remains fatal for the Java service modules, and the orchestrator's Spotless / PMD / SpotBugs / custom-Javadoc stack is also enforced as fatal during Maven builds.

Qodana is stricter: the GitHub Actions workflow for `services/java/**` and `utils/orchestrator/**` fails on **critical**, **high**, or **moderate** Qodana findings.

The Django Python quality workflow (`.github/workflows/django_python_quality.yml`) enforces Ruff lint and format checks, Django system checks, and unit tests — plus a Qodana Python Community scan that applies the same severity gate (`critical: 0`, `high: 0`, `moderate: 0`).

A separate Django coverage workflow (`.github/workflows/django_python_coverage.yml`) runs the same shared test suite under `coverage.py` for both runtime modules, writes GitHub Step Summary coverage tables, publishes HTML/XML artifacts, and uploads `coverage.xml` reports to Codecov with the `python-django-platform` and `python-django-reactive` flags.

The Next.js dashboard has its own quality workflow (`.github/workflows/nextjs_dash_quality.yml`) that enforces Oxfmt checking, zero-warning Oxlint, TypeScript 7 native strict-mode checking, Vitest 5 Node and DOM suites, report-generator tests, and a production build smoke test on every matching push and pull request.

The Go quality workflow (`.github/workflows/go_quality.yml`) now covers both Go modules — `services/go/enhanced` and `services/go/simple` — with the same full pipeline: dependency download, `go mod tidy` verification, `go vet`, `golangci-lint run`, unit tests with race detection, a build smoke test, and a non-blocking `govulncheck` scan. Both jobs also generate Pages-hosted HTML quality report artifacts (`quality-report-go` and `quality-report-go-simple`).

GitHub CodeQL (`.github/workflows/codeql.yml`) provides automated security vulnerability detection across all four languages (Java/Kotlin, Python, Go, JavaScript/TypeScript) on every push, PR, and weekly schedule. SARIF results are uploaded to GitHub's Security tab, and a combined HTML report is published to GitHub Pages.

When a reviewed per-scope SARIF baseline is committed under `.qodana/baseline/`, the workflow automatically uses it for that scope to filter acknowledged historical findings while still reporting new ones.

## Customizing Rules

To customize the JVM quality rules or Qodana for your needs:

1. Edit `services/java/checkstyle.xml` for service-module Checkstyle changes, or the relevant files under `utils/orchestrator/quality/` for orchestrator quality changes
2. Add reviewed suppressions to `services/java/checkstyle-suppressions.xml` for service modules, or to `utils/orchestrator/quality/spotbugs-exclude.xml` / narrow code-local PMD suppressions for orchestrator exceptions
3. Update the relevant plugin versions in `pom.xml` if newer Checkstyle, Spotless, PMD, or SpotBugs features are needed
4. Adjust `qodana.yaml` if you want to change the inspection profile or quality gate thresholds
5. Update `.github/workflows/qodana_code_quality.yml` if you want Qodana to cover more paths

## Tools and Plugins

### IDE Integration

#### IntelliJ IDEA
1. For Java service modules, install the Checkstyle-IDEA plugin and point it at `services/java/checkstyle.xml`
2. For the orchestrator, rely on Maven goals (`validate`, `verify`) plus IntelliJ's built-in inspections / Qodana preview rather than a Checkstyle file

#### Eclipse
1. For Java service modules, install the Checkstyle Plug-in and select `services/java/checkstyle.xml`
2. For the orchestrator, use Maven run configurations for `validate` / `verify` and your IDE's built-in Java inspection support

#### VS Code
1. For Java service modules, install the Checkstyle for Java extension and configure `services/java/checkstyle.xml`
2. For the orchestrator, run `mvn -f utils/orchestrator/pom.xml validate` / `verify` from the integrated terminal or tasks

## Metrics

Representative JVM quality reports can be found at:
- `target/checkstyle-result.xml` for the Checkstyle-based Java service modules
- `utils/orchestrator/target/pmd.xml`, `utils/orchestrator/target/pmd-test-maintainability/pmd.xml`, and `utils/orchestrator/target/spotbugsXml.xml` for orchestrator PMD / SpotBugs runs
- Maven console output for all scoped quality lanes

## Future Improvements

Potential enhancements to the code quality setup:
- Expand the orchestrator-style Spotless / PMD / SpotBugs stack to additional JVM modules when ready
- Add SonarQube for comprehensive code quality metrics
- Tighten the orchestrator PMD / SpotBugs reviewed suppressions over time as code is refactored
- Tighten the Qodana gate further once the current thresholds are reliably green (for example, add `info` or `low` severity thresholds)

## References

- [Checkstyle Documentation](https://checkstyle.org/)
- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- [Maven Checkstyle Plugin](https://maven.apache.org/plugins/maven-checkstyle-plugin/)
- [Qodana Documentation](https://www.jetbrains.com/help/qodana/qodana-yaml.html)
- [Qodana Python Community Linter](https://www.jetbrains.com/help/qodana/qodana-python-community.html)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [Oxlint Documentation](https://oxc.rs/docs/guide/usage/linter)
- [Oxlint Configuration](https://oxc.rs/docs/guide/usage/linter/config)
- [Oxfmt Configuration](https://oxc.rs/docs/guide/usage/formatter/config)
- [TypeScript 7 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Vitest Documentation](https://vitest.dev/)
- [Vitest Migration Guide](https://vitest.dev/guide/migration/)
- [golangci-lint Documentation](https://golangci-lint.run/)
- [golangci-lint GitHub Action](https://github.com/golangci/golangci-lint-action)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [CodeQL CLI Getting Started](https://codeql.github.com/docs/codeql-cli/getting-started-with-the-codeql-cli/)
- [CodeQL GitHub Action](https://github.com/github/codeql-action)
- [SARIF Specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
