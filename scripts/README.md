# Scripts

This directory contains small repository-level helper scripts.

## Current scripts

- `render-readmes.mjs` - renders generated README files from `.template.md` sources using values from `compose/.env`
- `render-readmes.test.mjs` - lightweight tests for the README rendering logic
- `render-readmes.manifest.json` - default list of README templates rendered when no explicit template paths are passed
- `sync-build-img-runs.mjs` - synchronizes IntelliJ `[build-img]` run configuration versions from `compose/.env`
- `sync-build-img-runs.test.mjs` - tests version synchronization across the build configurations
- `sync-java-pom-versions.mjs` - synchronizes Java service framework properties from `compose/.env`
- `sync-java-pom-versions.test.mjs` - tests POM version mapping, preservation, validation, and check mode
- `sync-dockerfile-versions.mjs` - synchronizes service Dockerfile framework/runtime ARG defaults from `compose/.env`
- `sync-dockerfile-versions.test.mjs` - tests Dockerfile default mapping, preservation, validation, and check mode

## Dockerfile versions

After changing versions in `compose/.env`, synchronize all 19 service Dockerfiles:

```powershell
node scripts/sync-dockerfile-versions.mjs
node scripts/sync-dockerfile-versions.mjs --check
node --test scripts/sync-dockerfile-versions.test.mjs
```

In IntelliJ, run **[gen] Sync Dockerfile Versions**, or **[doc] Render Updates** to synchronize POMs, Dockerfiles, documentation, and build image configurations together.

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
| `services/java/helidon/README.template.md`                | `services/java/helidon/README.md`                | Shared Helidon guide; module READMEs link to its generated framework version   |
| `services/java/micronaut/README.template.md`              | `services/java/micronaut/README.md`              | Shared Micronaut guide; module READMEs link to its generated framework version |
| `services/java/quarkus/jvm/README.template.md`            | `services/java/quarkus/jvm/README.md`            | Quarkus JVM service                                                            |
| `services/java/quarkus/native/README.template.md`         | `services/java/quarkus/native/README.md`         | Quarkus native service                                                         |
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
