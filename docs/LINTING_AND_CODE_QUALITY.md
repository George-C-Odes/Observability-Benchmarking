# Linting and Code Quality

This document describes the code quality and linting setup for the Observability-Benchmarking project.

## Checkstyle Configuration

### Overview
This project uses [Checkstyle](https://checkstyle.org/) to enforce consistent coding standards across all Java code. The configuration is based on the Google Java Style Guide with some customizations for this project.

### Versions
- **maven-checkstyle-plugin**: 3.6.0
- **checkstyle**: 12.2.0

### Configuration Files
The Java codebases currently covered by the repository's quality tooling use shared Checkstyle files per scoped area:
- **`services/java/checkstyle.xml`**: Main Checkstyle configuration for Java services under `services/java/**`
- **`services/java/checkstyle-suppressions.xml`**: Suppressions for the Java services tree
- **`utils/orchestrator/checkstyle.xml`**: Main Checkstyle configuration for the orchestrator
- **`utils/orchestrator/checkstyle-suppressions.xml`**: Suppressions for the orchestrator

Individual Maven modules reference these shared files via relative paths in their `pom.xml` files.

### Running Checkstyle

To run Checkstyle on a specific module from the repository root:

```bash
# For Quarkus JVM module
mvn -f services/java/quarkus/jvm/pom.xml checkstyle:check

# For Spring JVM Netty module
mvn -f services/java/spring/jvm/netty/pom.xml checkstyle:check

# For the orchestrator
mvn -f utils/orchestrator/pom.xml checkstyle:check
```

Checkstyle is also automatically executed during the Maven `validate` phase, so it runs as part of the build:

```bash
mvn -f services/java/quarkus/jvm/pom.xml validate
mvn -f utils/orchestrator/pom.xml validate
```

At the moment, the Checkstyle plugin is configured in these Maven modules with `failsOnError=false` and `failOnViolation=false`, so it reports issues during `validate` without failing the build.

### Key Rules Enforced

#### Naming Conventions
- Class names: PascalCase
- Method names: camelCase
- Constants: UPPER_SNAKE_CASE
- Variables: camelCase

#### Code Style
- Maximum line length: 120 characters
- Indentation: four spaces (no tabs)
- Braces required for all control structures
- Proper whitespace around operators and keywords

#### Javadoc Requirements
- Public classes must have Javadoc comments
- Public methods must have Javadoc comments
- Javadoc must include descriptions for parameters and return values (where applicable)

#### Import Organization
- No wildcard imports (*)
- No unused imports
- No illegal imports (e.g., sun.* packages)

### Suppressions

The following items are suppressed from Checkstyle checks:
- Generated code in `target/` directories
- Test files (for certain Javadoc requirements)
- Spring Boot Application main classes (utility class constructor check)

## Qodana Configuration (JVM Static Analysis)

### GitHub Actions Node Runtime Migration Convention
This repository sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at **workflow-level `env:`** in each workflow file so JavaScript-based actions are exercised on Node 24 ahead of GitHub's default runtime migration. The env var is not repeated at job or step level.

The convention is applied in:

- `.github/workflows/qodana_code_quality.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/django_python_quality.yml`
- `.github/workflows/nextjs_dash_quality.yml`
- `.github/workflows/go_enhanced_quality.yml`

Each occurrence is annotated with `# TODO(node24-migration)` so they can be found and removed once GitHub's default runtime moves to Node 24.

If GitHub still prints a warning saying an action targets Node 20 but is being forced to run on Node 24, that confirms the opt-in is active. The warning should disappear only after the action publisher updates the action metadata to native Node 24 support.

### Overview
This repository also includes a [Qodana](https://www.jetbrains.com/qodana/) setup for deeper JVM static analysis based on IntelliJ inspections. Qodana complements Checkstyle rather than replacing it:

- **Checkstyle** focuses on formatting, conventions, and structural style rules.
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

The shared root `qodana.yaml` pins the JVM linter image (`jetbrains/qodana-jvm-community:2025.3`) so both the action's initial pull step and the later scoped scan step resolve the same linter in this otherwise mixed-language repository. The workflow uploads two artifacts per matrix entry:

- **`qodana-results-<scope>`** — the full results archive (SARIF, logs) produced by the Qodana action's built-in `upload-result` option. Note: the Qodana action pre-zips this artifact internally, so it cannot be consumed directly by `actions/download-artifact@v4+`.
- **`qodana-report-<scope>`** — the HTML report directory, uploaded by an explicit `actions/upload-artifact@v7` step. This is what the Pages workflow downloads to host the report.

The workflow also sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow scope so GitHub-hosted JavaScript actions are exercised on Node 24 ahead of GitHub's runtime migration.

GitHub will print an informational warning in the **Complete job** phase similar to:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: JetBrains/qodana-action@v2025.3.2.

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
- the HTML report is uploaded as a separate `actions/upload-artifact@v7` step in the Qodana workflow, ensuring compatibility with `actions/download-artifact@v8` in the Pages workflow (the Qodana action's built-in `upload-result` pre-zips files, making them unusable by `download-artifact@v4+`)
- it copies those artifacts into the built Pages site under:
  - `qodana/services-java/`
  - `qodana/orchestrator/`
- versioned scripts handle report resolution, message generation, logging, and HTML assembly under `scripts/pages/` for easier testing and review
- it also creates a small landing page at `qodana/index.html`
- each scope URL (`qodana/services-java/` and `qodana/orchestrator/`) now always has its own landing page: if a nested Qodana HTML entrypoint is found it redirects there, otherwise it explains that the hosted report is unavailable for that scope/run
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

The Pages workflow sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow scope so GitHub-hosted JavaScript actions are exercised on Node 24 ahead of GitHub's runtime migration. All actions are pinned to full commit SHAs for supply-chain hardening (with version comments). The remaining official Pages actions still in use (`actions/configure-pages@v6`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v5`) are still published upstream with Node 20 metadata today, so GitHub may continue to print informational migration warnings for them until those actions are republished by their maintainers.

Expected URL shape:

```text
https://<owner>.github.io/<repo>/qodana/
https://<owner>.github.io/<repo>/qodana/services-java/
https://<owner>.github.io/<repo>/qodana/orchestrator/
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
  jetbrains/qodana-jvm-community:2025.3 \
  --project-dir=/data/project \
  --only-directory=services/java \
  --results-dir=/data/results

docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/orchestrator":/data/results \
  jetbrains/qodana-jvm-community:2025.3 \
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
  jetbrains/qodana-jvm-community:2025.3 `
  --project-dir=/data/project `
  --only-directory=services/java `
  --results-dir=/data/results

docker run --rm `
  -v "${PWD}:/data/project" `
  -v "${PWD}/.qodana/orchestrator:/data/results" `
  jetbrains/qodana-jvm-community:2025.3 `
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
  jetbrains/qodana-jvm-community:2025.3 \
  --project-dir=/data/project \
  --only-directory=services/java \
  --results-dir=/data/results

# orchestrator candidate
mkdir -p .qodana/baseline-candidates/orchestrator
docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/baseline-candidates/orchestrator":/data/results \
  jetbrains/qodana-jvm-community:2025.3 \
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

In addition to Ruff, the Django CI workflow runs [Qodana Python Community](https://www.jetbrains.com/qodana/) (`jetbrains/qodana-python-community:2025.3`) for deeper static analysis based on PyCharm Community inspections. This complements Ruff:

- **Ruff** focuses on PEP 8, import ordering, and formatting.
- **Qodana Python Community** adds semantic inspections such as type mismatches, unreachable code, unused variables, and general Python best-practice warnings.

The scan uses a dedicated configuration at `services/python/django/qodana.yaml` because the root `qodana.yaml` pins the JVM linter (`jetbrains/qodana-jvm-community:2025.3`). The Python config is self-contained with its own linter pin and quality gate.

#### How the Qodana Python Scan Works

The `qodana` job in `.github/workflows/django_python_quality.yml` runs after the `common` checks pass:

1. Checks out the repository.
2. Runs `docker run jetbrains/qodana-python-community:2025.3` with:
   - `--project-dir=/data/project` — repository root
   - `--config=/data/project/services/python/django/qodana.yaml` — Python-specific config
   - `--only-directory=services/python/django` — scopes analysis to Django code only
3. Before analysis, the `bootstrap` command in `qodana.yaml` installs the project dependencies (`django`, `opentelemetry-*`, `gunicorn`, `cachetools`, and the local `obbench-django-common` package) so that Qodana can resolve imports and perform accurate type inference. Without bootstrap, every third-party import would produce unresolved-reference false positives not visible in the IDE.
4. Uploads the HTML report directory as `qodana-report-django-python`.

The workflow uses `docker run` directly instead of the `JetBrains/qodana-action` because the action's internal image-pull phase reads the root `qodana.yaml` (which pins the JVM linter). Running the container directly is explicit and avoids image conflicts.

**Why the bootstrap is critical:** Qodana runs in an isolated Docker container with no pre-installed project dependencies. The IDE resolves imports via the configured Python interpreter and virtualenv. Without matching dependencies in the Qodana container, the linter cannot resolve `from django.http import ...`, `from opentelemetry.trace import ...`, etc., and reports them as errors — these are false positives. The `bootstrap` section in `services/python/django/qodana.yaml` installs the same packages the IDE sees, bringing CI findings in line with local IDE inspections. Any requirement line containing `pyroscope` is filtered out (so both `pyroscope-io` and `pyroscope-otel` are skipped) because these agents require a Rust build toolchain not available in the Qodana container; the application handles their absence gracefully at runtime.

**Python version mismatch:** The Qodana Python Community 2025.3 container ships Python 3.12, while the project declares `requires-python >= 3.13`. The bootstrap uses `--ignore-requires-python` so pip installs the packages despite the version mismatch. The packages are only needed for Qodana's import resolution and type inference, not for execution.

#### Quality Gate

The Python `qodana.yaml` uses the same hardened gate as the JVM config:

```yaml
failureConditions:
  severityThresholds:
    critical: 0
    high: 0
    moderate: 0
```

#### Soft Gate Strategy (Initial Rollout)

The `qodana` job uses `continue-on-error: true` at the job level. This means:

- When the quality gate is violated, the **job** is marked as neutral (yellow, allowed failure) in the Actions UI — findings remain visible.
- The **workflow** still succeeds, so the HTML report artifact is uploaded and the Pages deployment can download and host it.
- The `modules` job (Ruff lint, format, Django checks, unit tests) is unaffected — it still gates the workflow independently.

This is a safe initial rollout pattern: the Qodana report is published for visibility while the existing Ruff and test gates remain strict. Once the Qodana findings are fixed or acknowledged via a reviewed SARIF baseline, `continue-on-error` can be removed to promote the Qodana gate to a hard gate.

#### Hosted Qodana Python Report on GitHub Pages

The Qodana Python HTML report is published to GitHub Pages alongside the JVM and Next.js reports:

```text
https://george-c-odes.github.io/Observability-Benchmarking/qodana/django-python/
```

The Pages workflow triggers on successful `Django Python Quality` runs on `main`, downloads the `qodana-report-django-python` artifact, and copies it into the site under `qodana/django-python/`.

#### Testing Qodana Python Locally

**Bash / zsh:**

```bash
mkdir -p .qodana/django-python

docker run --rm \
  -v "$PWD":/data/project \
  -v "$PWD/.qodana/django-python":/data/results \
  jetbrains/qodana-python-community:2025.3 \
  --project-dir=/data/project \
  --config=/data/project/services/python/django/qodana.yaml \
  --only-directory=services/python/django \
  --results-dir=/data/results
```

**PowerShell:**

```powershell
New-Item -ItemType Directory -Force .qodana/django-python | Out-Null

docker run --rm `
  -v "${PWD}:/data/project" `
  -v "${PWD}/.qodana/django-python:/data/results" `
  jetbrains/qodana-python-community:2025.3 `
  --project-dir=/data/project `
  --config=/data/project/services/python/django/qodana.yaml `
  --only-directory=services/python/django `
  --results-dir=/data/results
```

Notes:
- The `bootstrap` command in `services/python/django/qodana.yaml` runs automatically inside the container before analysis, installing Django and other dependencies so imports resolve correctly.
- A non-zero container exit code means the configured quality gate was violated.
- A `QODANA_TOKEN` is not required for local scans with the community linter.
- Results and logs are written under `.qodana/django-python/` in the example commands above.

### Configuration
Each Django module has its own Ruff configuration in a local `pyproject.toml`
(for example, under `services/python/django/gunicorn/common/`, `.../WSGI/`, and
`.../ASGI/`). These configurations are kept aligned so that, in practice, the
same settings are applied when linting `common`, `WSGI`, and `ASGI`:
- **Target version**: Python 3.13
- **Line length**: 100 characters
- **Rules**: `E` (pycodestyle errors), `F` (Pyflakes), `I` (isort import ordering)

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

## golangci-lint Configuration (Go Enhanced Service)

### Overview
The Go Enhanced service (`services/go/enhanced`) uses [golangci-lint](https://golangci-lint.run/) as an aggregated Go linter running dozens of analyzers in parallel. The configuration lives in `services/go/enhanced/.golangci.yml`.

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
The workflow in `.github/workflows/go_enhanced_quality.yml` performs:

1. **go vet** — built-in Go analysis
2. **golangci-lint run** — aggregated lint with `.golangci.yml` configuration
3. **go test** — unit tests with race detector (`-race`)
4. **go build** — compilation smoke test

The workflow is triggered on:
- manual dispatch
- pull requests touching `services/go/enhanced/**`
- pushes to `main` touching `services/go/enhanced/**`

### Hosted Quality Report on GitHub Pages
After each run, the workflow uses the `golangci-lint run` step, configured via `.golangci.yml` `output.formats`, to write a `golangci-lint-report.json` file, which is then consumed by `scripts/pages/generate-go-quality-report.mjs` to generate a self-contained HTML quality report. The report is uploaded as a `quality-report-go-enhanced` artifact and published to GitHub Pages by the Pages workflow.

Expected URL:

```text
https://george-c-odes.github.io/Observability-Benchmarking/qodana/go-enhanced/
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

# Run lint
golangci-lint run

# Run lint with JSON output (same as CI) and write the report file
golangci-lint run --out-format=json > golangci-lint-report.json

# Run all quality checks matching CI
go vet ./...
golangci-lint run
go test ./... -race
go build ./cmd/server
```

Or use the provided Makefile targets:

```bash
cd services/go/enhanced
make lint
make test
```

### Pages Integration for the Go Enhanced Quality Report

The Pages workflow resolves the Go Enhanced quality report source independently from other report sources:

- When triggered by the `Go Enhanced Quality` workflow, the triggering run is used for the Go report and the latest successful runs for Qodana, Next.js, and Django Python are resolved via API
- When triggered by any other workflow or by push/manual dispatch, the latest successful `Go Enhanced Quality` run on `main` is resolved via API

Scripts involved:
- `scripts/pages/resolve-go-enhanced-quality-source.sh` — resolves the Go Enhanced Quality workflow run to fetch the report artifact from
- `scripts/pages/generate-go-quality-report.mjs` — generates the HTML report from golangci-lint JSON output
- `scripts/pages/assemble-qodana-pages.sh` — extended to handle the `go-enhanced` scope alongside existing scopes

## Code Quality Standards

### Next.js Dashboard (ESLint + TypeScript)

#### Overview

The `utils/nextjs-dash` module (Next.js / React / TypeScript) has its own quality gates enforced by a dedicated GitHub Actions workflow (`.github/workflows/nextjs_dash_quality.yml`):

1. **ESLint** — flat-config format (`eslint.config.mjs`), `--max-warnings=0` so any warning is treated as a CI failure.
2. **TypeScript strict mode** — `tsc --noEmit` with `"strict": true` in `tsconfig.json`.
3. **Vitest** — dual-environment test suite (Node for API/lib code, jsdom for React components/hooks).
4. **Production build** — `next build` as a smoke test to catch import/config regressions.

The CI workflow is triggered on pushes to `main` and pull requests touching `utils/nextjs-dash/**`.

#### ESLint Configuration

The module uses ESLint v9 flat config in `utils/nextjs-dash/eslint.config.mjs`:

- **Base**: `@eslint/js` recommended rules + `typescript-eslint` recommended
- **Next.js**: `@next/eslint-plugin-next` (recommended and core-web-vitals)
- **React**: `eslint-plugin-react-hooks` recommended rules
- **Server files** (`app/api/**`, `lib/**`, config files): Node globals enabled, `@typescript-eslint/no-require-imports` relaxed
- **Ignores**: `.next/`, `node_modules/`, `dist/`, `out/`, `coverage/`, `build/`

The `--max-warnings=0` flag ensures no warnings are tolerated in CI.

#### TypeScript Configuration

`utils/nextjs-dash/tsconfig.json` enables strict mode with these key settings:

- `"strict": true`
- `"noEmit": true`
- `"target": "ES2020"`
- `"moduleResolution": "bundler"`
- `"jsx": "react-jsx"`

The `npm run typecheck` script runs `tsc --noEmit` to catch type errors without producing output files.

#### Running Quality Checks Locally

```bash
cd utils/nextjs-dash
npm install

# Individual checks
npm run lint
npm run typecheck
npm run test:node
npm run test:dom

# Quick one-liner matching CI
npm -s run lint ; npm -s run typecheck ; npm -s test ; npm -s run build
```

#### Qodana JS — Not Currently Active (Licensing)

A module-local Qodana configuration exists at `utils/nextjs-dash/qodana.yaml` pinning `jetbrains/qodana-js:2025.3`. However, unlike the JVM scopes which use the free `jetbrains/qodana-jvm-community` image, JetBrains does **not** publish a community edition of the JavaScript/TypeScript linter. The `jetbrains/qodana-js` image requires a paid [Qodana Cloud](https://www.jetbrains.com/qodana/) subscription and a valid `QODANA_TOKEN`.

Because this repository currently uses the free community JVM linter, the JS scope is **not** included in the Qodana CI workflow. The configuration file is kept in the repository so it can be activated by adding a `nextjs-dash` matrix entry to `.github/workflows/qodana_code_quality.yml` once a Qodana Cloud license covering JavaScript analysis is available. When re-enabling, the Qodana action does not support a `linter` input — you must add a `docker pull jetbrains/qodana-js:2025.3` step before the scan to ensure the image is available (the action's internal pull phase only reads the root `qodana.yaml`).

#### Free Alternative — Hosted ESLint + TypeScript Quality Report

Since there is no free Qodana community linter for JavaScript/TypeScript, this repository generates a **self-contained HTML quality report** from ESLint and TypeScript strict-mode analysis as the free, open-source equivalent. This covers the same inspections your JetBrains IDE performs for JS/TS:

- **ESLint** — the same rules configured in `eslint.config.mjs` (recommended + typescript-eslint + Next.js + React Hooks)
- **TypeScript strict mode** — `tsc --noEmit` with `"strict": true`, identical to the IDE's type checking

How it works:

1. The `Next.js Dashboard Quality` workflow (`.github/workflows/nextjs_dash_quality.yml`) runs the normal quality gates (lint, typecheck, tests, build)
2. After the quality gates, it generates ESLint JSON output and TypeScript diagnostics
3. A Node.js script (`scripts/pages/generate-nextjs-quality-report.mjs`) produces a polished, self-contained HTML report from those results
4. The report is uploaded as a `quality-report-nextjs-dash` artifact
5. The Pages workflow downloads the artifact and publishes it alongside the Qodana JVM reports

The report includes:
- Summary cards (overall pass/fail, ESLint errors/warnings, TypeScript diagnostics)
- Per-file ESLint findings table with severity, rule ID, message, and line/column
- TypeScript diagnostics block
- Metadata (commit SHA, workflow run, tool versions, timestamp)
- Dark mode support via `prefers-color-scheme`

Expected URL:

```text
https://george-c-odes.github.io/Observability-Benchmarking/qodana/nextjs-dash/
```

The landing page at `qodana/` now links to all five scopes:
- `qodana/services-java/` — Qodana JVM (IntelliJ inspections)
- `qodana/orchestrator/` — Qodana JVM (IntelliJ inspections)
- `qodana/nextjs-dash/` — ESLint + TypeScript (free alternative)
- `qodana/django-python/` — Qodana Python Community (PyCharm inspections)
- `qodana/go-enhanced/` — golangci-lint (aggregated Go static analysis)

The report is always generated (even when earlier quality steps fail) so that the hosted report captures the current state of the code. However, only reports from **successful** workflow runs on `main` are published to GitHub Pages, matching the Qodana publishing behavior.

#### Pages Integration for the Next.js Quality Report

The Pages workflow resolves the Next.js quality report source independently from the Qodana source:

- When triggered by the `Next.js Dashboard Quality` workflow, the triggering run is used for the Next.js report and the latest successful Qodana, Django Python Quality, and Go Enhanced Quality runs are resolved via API
- When triggered by the `Qodana` workflow, the triggering run is used for Qodana reports and the latest successful Next.js, Django Python Quality, and Go Enhanced Quality runs are resolved via API
- When triggered by the `Django Python Quality` workflow, the triggering run is used for the Django Python report and the latest successful Qodana, Next.js, and Go Enhanced Quality runs are resolved via API
- When triggered by the `Go Enhanced Quality` workflow, the triggering run is used for the Go report and the latest successful Qodana, Next.js, and Django Python Quality runs are resolved via API
- When triggered by push or manual dispatch, the latest successful run for **all** workflows is resolved via API

This ensures every Pages deployment gets the freshest available version of all reports.

Scripts involved:
- `scripts/pages/resolve-nextjs-quality-source.sh` — resolves the Next.js quality workflow run to fetch the report artifact from
- `scripts/pages/resolve-django-python-quality-source.sh` — resolves the Django Python quality workflow run to fetch the Qodana Python report artifact from
- `scripts/pages/resolve-go-enhanced-quality-source.sh` — resolves the Go Enhanced Quality workflow run to fetch the golangci-lint report artifact from
- `scripts/pages/assemble-qodana-pages.sh` — extended to handle the `nextjs-dash`, `django-python`, and `go-enhanced` scopes alongside the existing Qodana JVM scopes

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

Checkstyle violations are currently reported but do not fail Maven builds by default. This allows for gradual adoption and prevents blocking legitimate changes.

Qodana is stricter: the GitHub Actions workflow for `services/java/**` and `utils/orchestrator/**` fails on **critical**, **high**, or **moderate** Qodana findings.

The Django Python quality workflow (`.github/workflows/django_python_quality.yml`) enforces Ruff lint and format checks, Django system checks, and unit tests — plus a Qodana Python Community scan that applies the same severity gate (`critical: 0`, `high: 0`, `moderate: 0`).

The Next.js dashboard has its own quality workflow (`.github/workflows/nextjs_dash_quality.yml`) that enforces ESLint (`--max-warnings=0`), TypeScript strict-mode typecheck, Vitest tests, and a production build smoke test on every push and PR.

The Go Enhanced service has its own quality workflow (`.github/workflows/go_enhanced_quality.yml`) that enforces `go vet`, `golangci-lint run` (with govet, staticcheck, errcheck, gosec, revive, and more), unit tests with race detection, and a build smoke test on every push and PR.

When a reviewed per-scope SARIF baseline is committed under `.qodana/baseline/`, the workflow automatically uses it for that scope to filter acknowledged historical findings while still reporting new ones.

To make Checkstyle violations fail the build, update the plugin configuration in `pom.xml`:
```xml
<configuration>
    <failsOnError>true</failsOnError>
    <failOnViolation>true</failOnViolation>
</configuration>
```

## Customizing Rules

To customize Checkstyle or Qodana rules for your needs:

1. Edit `services/java/checkstyle.xml` or `utils/orchestrator/checkstyle.xml`, depending on the scoped JVM codebase you want to tune
2. Add suppressions to the matching `checkstyle-suppressions.xml` file for specific exceptions
3. Update the plugin version in `pom.xml` if newer Checkstyle features are needed
4. Adjust `qodana.yaml` if you want to change the inspection profile or quality gate thresholds
5. Update `.github/workflows/qodana_code_quality.yml` if you want Qodana to cover more paths

## Tools and Plugins

### IDE Integration

#### IntelliJ IDEA
1. Install the Checkstyle-IDEA plugin
2. Go to Settings → Tools → Checkstyle
3. Add `services/java/checkstyle.xml` or `utils/orchestrator/checkstyle.xml`, depending on the codebase you are editing
4. Enable real-time scanning

#### Eclipse
1. Install the Checkstyle Plug-in
2. Right-click project → Properties → Checkstyle
3. Select `services/java/checkstyle.xml` or `utils/orchestrator/checkstyle.xml`, depending on the codebase you are editing
4. Enable Checkstyle for the project

#### VS Code
1. Install the Checkstyle for Java extension
2. Configure the extension to use `services/java/checkstyle.xml` or `utils/orchestrator/checkstyle.xml`, depending on the codebase you are editing

## Metrics

The Checkstyle plugin generates reports that can be found at:
- `target/checkstyle-result.xml` (XML format)
- Maven console output (human-readable format)

## Future Improvements

Potential enhancements to the code quality setup:
- Add PMD for additional static analysis
- Integrate SpotBugs for bug detection
- Add SonarQube for comprehensive code quality metrics
- Implement code coverage requirements with JaCoCo
- Add automated code formatting with Spotless or Google Java Format
- Tighten the Qodana gate further once the current thresholds are reliably green (for example, add `info` or `low` severity thresholds)

## References

- [Checkstyle Documentation](https://checkstyle.org/)
- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- [Maven Checkstyle Plugin](https://maven.apache.org/plugins/maven-checkstyle-plugin/)
- [Qodana Documentation](https://www.jetbrains.com/help/qodana/qodana-yaml.html)
- [Qodana Python Community Linter](https://www.jetbrains.com/help/qodana/qodana-python-community.html)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [ESLint Documentation](https://eslint.org/docs/latest/)
- [typescript-eslint](https://typescript-eslint.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Next.js ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint)
- [golangci-lint Documentation](https://golangci-lint.run/)
- [golangci-lint GitHub Action](https://github.com/golangci/golangci-lint-action)
