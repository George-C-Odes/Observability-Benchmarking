# Scripts

This directory contains small repository-level helper scripts.

## Current scripts

- `render-readmes.mjs` - renders generated README files from `.template.md` sources using values from `compose/.env`
- `render-readmes.test.mjs` - lightweight tests for the README rendering logic
- `render-readmes.manifest.json` - default list of README templates rendered when no explicit template paths are passed

## Pages scripts (`pages/`)

The `pages/` subdirectory contains scripts used by the GitHub Pages deployment workflow to resolve quality-report artifacts, generate HTML reports, and assemble them into the published site.

| Script                               | Purpose                                                                                                                                                                                                                                                                                                                                           |
|--------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `resolve-source.sh`                  | Generic parameterized resolver for quality-report workflow run artifacts. Accepts `RESOLVE_WORKFLOW_NAME`, `RESOLVE_WORKFLOW_FILE`, and `RESOLVE_ACCEPTED` env vars. Replaces the five near-identical `resolve-*-source.sh` scripts that existed previously.                                                                                      |
| `inspect-qodana-artifacts.sh`        | Inspects available Qodana artifacts for the resolved workflow run.                                                                                                                                                                                                                                                                                |
| `report-helpers.mjs`                 | Shared module exporting HTML escaping (`esc`), status icons (`statusIcon`), path shortening (`shortPath`), optional file reading (`readOptionalFile`), metadata assembly (`buildMetaParts`, `renderMeta`), CSS theming (`themeCSS`), HTML page shell (`htmlPage`), and report writing (`writeReport`). Used by all three report generators below. |
| `generate-go-quality-report.mjs`     | Generates a self-contained HTML quality report from golangci-lint JSON output.                                                                                                                                                                                                                                                                    |
| `generate-nextjs-quality-report.mjs` | Generates a self-contained HTML quality report from ESLint JSON and TypeScript diagnostics.                                                                                                                                                                                                                                                       |
| `generate-codeql-report.mjs`         | Generates a self-contained HTML quality report from CodeQL SARIF output across all analyzed languages.                                                                                                                                                                                                                                            |
| `assemble-quality-pages.sh`          | Resolves per-scope report statuses, generates human-readable messages, and assembles all quality report scopes (Qodana JVM, Django Python, Go, Next.js, CodeQL) into the Pages site under `_site/quality/`.                                                                                                                                       |

The three HTML report generators (`generate-go-quality-report.mjs`, `generate-nextjs-quality-report.mjs`, `generate-codeql-report.mjs`) all import from `report-helpers.mjs` to share common HTML helpers, CSS theming, metadata assembly, and file output logic. Each generator retains its own report-specific logic (SARIF parsing, linter breakdown tables, TSC diagnostics, etc.).

## README rendering

The README renderer exists to keep repeated version values in sync with the repository's existing source of truth: `compose/.env`.

It currently reads the repo's custom env format:

```dotenv
SPRING_BOOT_VERSION: 4.0.5
QUARKUS_VERSION: 3.34.1
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

| Template                                                | Output                                         | Notes                           |
|---------------------------------------------------------|------------------------------------------------|---------------------------------|
| `README.template.md`                                    | `README.md`                                    | Root project README             |
| `docs/architecture.template.md`                         | `docs/architecture.md`                         | Architecture guide              |
| `docs/benchmarking.template.md`                         | `docs/benchmarking.md`                         | Benchmarking guide              |
| `docs/TESTING.template.md`                              | `docs/TESTING.md`                              | Testing guide documentation     |
| `docs/tools-technologies.template.md`                   | `docs/tools-technologies.md`                   | Tools and technologies overview |
| `integration-tests/README.template.md`                  | `integration-tests/README.md`                  | Integration test documentation  |
| `services/README.template.md`                           | `services/README.md`                           | Services overview               |
| `services/java/quarkus/jvm/README.template.md`          | `services/java/quarkus/jvm/README.md`          | Quarkus JVM service             |
| `services/java/quarkus/native/README.template.md`       | `services/java/quarkus/native/README.md`       | Quarkus native service          |
| `services/java/spring/jvm/netty/README.template.md`     | `services/java/spring/jvm/netty/README.md`     | Spring JVM Netty service        |
| `services/java/spring/jvm/tomcat/README.template.md`    | `services/java/spring/jvm/tomcat/README.md`    | Spring JVM Tomcat service       |
| `services/java/spring/native/netty/README.template.md`  | `services/java/spring/native/netty/README.md`  | Spring native Netty service     |
| `services/java/spring/native/tomcat/README.template.md` | `services/java/spring/native/tomcat/README.md` | Spring native Tomcat service    |

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

