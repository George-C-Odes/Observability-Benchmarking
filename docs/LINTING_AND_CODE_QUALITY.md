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
- Indentation: 4 spaces (no tabs)
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

The shared root `qodana.yaml` pins the JVM linter image (`jetbrains/qodana-jvm-community:2025.3`) so both the action's initial pull step and the later scoped scan step resolve the same linter in this otherwise mixed-language repository. The workflow also uploads separate report artifacts per matrix entry (`qodana-report-services-java` and `qodana-report-orchestrator`) to avoid cross-job artifact name collisions.

The workflow also sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow, job, and Qodana action-step scope so the GitHub-hosted JavaScript action runtime is exercised under Node 24 ahead of GitHub's forced migration. This lets the team catch Qodana action compatibility issues before the Node 20 fallback disappears.

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
- after a **successful** `Qodana` workflow run on `main`, the Pages workflow runs again via `workflow_run`
- it checks out the exact analyzed commit (`head_sha`) from that Qodana run
- it downloads the uploaded Qodana artifacts for both matrix entries:
  - `qodana-report-services-java`
  - `qodana-report-orchestrator`
- it copies those artifacts into the built Pages site under:
  - `qodana/services-java/`
  - `qodana/orchestrator/`
- it also creates a small landing page at `qodana/index.html`
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

The Pages workflow also sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` so GitHub-hosted JavaScript actions such as `actions/configure-pages@v5` and `actions/download-artifact@v5` are exercised on Node 24 ahead of GitHub's runtime migration. As with the Qodana workflow, GitHub may still print an informational warning saying those actions target Node 20 but are being forced to run on Node 24 until the upstream action metadata is updated.

Expected URL shape:

```text
https://<owner>.github.io/<repo>/qodana/
https://<owner>.github.io/<repo>/qodana/services-java/
https://<owner>.github.io/<repo>/qodana/orchestrator/
```

If your repository uses a custom GitHub Pages domain, replace the `github.io/<repo>` part with that domain's base URL.

### Minimal Quality Gate
The current `qodana.yaml` uses a conservative first-pass gate:

```yaml
failureConditions:
  severityThresholds:
    critical: 0
```

This means the Qodana job will fail only if it finds at least one **critical** issue in the scoped JVM code.

Why this is a good first step:
- it avoids blocking the repository on older low-severity noise before the workflow has been proven in CI
- it still protects against the most serious findings
- it gives the team time to observe the signal quality before tightening thresholds further

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

1. raise the gate from `critical` only to additional severities if the findings are manageable
2. refresh or shrink the reviewed baseline files as historical findings are fixed
3. add module-specific follow-up exclusions only where Qodana proves noisy, rather than disabling broad inspections up front
4. consider separate documentation or workflow expansion for other languages only after the JVM path proves useful

## Ruff Configuration (Python)

### Overview
Python services (Django) use [Ruff](https://docs.astral.sh/ruff/) as a fast, all-in-one linter and formatter, enforcing PEP 8 and import ordering.

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
python -m ruff check .

cd services/python/django/gunicorn/ASGI
python -m ruff check .

cd services/python/django/gunicorn/common
python -m ruff check .
```

### Additional Django quality checks

The Django CI workflow also performs syntax validation and Django system checks:

```bash
# Shared package syntax check
cd services/python/django/gunicorn/common
python -m compileall src

# Runtime module syntax + Django checks
cd ../WSGI
python -m compileall manage.py hello_project gunicorn.conf.py
python manage.py check

cd ../ASGI
python -m compileall manage.py hello_project gunicorn.conf.py
python manage.py check
```

For full CI parity, run the shared test suite from each module as documented in
`docs/TESTING.md`.

Ruff is also available as an IDE plugin for real-time feedback.

## Code Quality Standards

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

Qodana is stricter, but only in a very narrow way for now: the GitHub Actions workflow for `services/java/**` and `utils/orchestrator/**` fails on **critical** Qodana findings only.

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
- Tighten the Qodana gate after several clean runs (for example, add non-critical severity thresholds)

## References

- [Checkstyle Documentation](https://checkstyle.org/)
- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- [Maven Checkstyle Plugin](https://maven.apache.org/plugins/maven-checkstyle-plugin/)
- [Qodana Documentation](https://www.jetbrains.com/help/qodana/qodana-yaml.html)
