# README rendering

The README renderer exists to keep repeated version values in sync with the repository's existing source of truth: `compose/.env`.

It currently reads the repo's custom env format:

```dotenv
SPRING_BOOT_VERSION: 4.2.0
```

Note that this is **not** standard dotenv `KEY=value` syntax. The renderer is intentionally built for this repository's `KEY: VALUE` format.

## Commands

Run from the repository root.

### Generate the default README set from the manifest

```powershell
node .\scripts\readmes\render-readmes.mjs
```

### Check the default README set from the manifest

```powershell
node .\scripts\readmes\render-readmes.mjs --check
```

### Generate one README

```powershell
node .\scripts\readmes\render-readmes.mjs .\services\README.template.md
```

### Check that a generated README is up to date

```powershell
node .\scripts\readmes\render-readmes.mjs --check .\services\README.template.md
```

### Generate multiple README files in one run

```powershell
node .\scripts\readmes\render-readmes.mjs .\services\README.template.md .\some\other\README.template.md
```

### Use an explicit env file path

```powershell
node .\scripts\readmes\render-readmes.mjs --env .\compose\.env .\services\README.template.md
```

### Use an explicit manifest file path

```powershell
node .\scripts\readmes\render-readmes.mjs --manifest .\scripts\readmes\render-readmes.manifest.json
```

### Use an absolute template path

```powershell
node .\scripts\readmes\render-readmes.mjs "\absolute\path\to\your\Observability-Benchmarking\services\README.template.md"
```

## Default templates

The [manifest](../readmes/render-readmes.manifest.json) lists the default templates under `defaultTemplatePaths`. Explicit template arguments override the manifest for that run.

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

A few placeholders are read from repository pins instead of the env: documented GitHub Actions versions come
from their workflows and wrappers, and `{{DOCKER_CLI_VERSION}}` comes from `ARG IMAGE_DOCKER_CLI` in
`utils/orchestrator/Dockerfile`. Renovate relays updates to these pins as described in [the versions guide](versions.md#renovate-pr-synchronization).

## How to extend this for more README files

To add another generated README:

1. Create a new template file ending in `.template.md`
2. Replace repeated values with placeholders such as `{{SOME_VERSION}}`
3. Make sure the placeholder exists in `compose/.env`
4. Add the template path to `scripts/readmes/render-readmes.manifest.json` if it should be part of the default generated set
5. Run the renderer with either the explicit template path or the manifest-driven default command
6. Commit the manifest change, template, and generated output file

Example:

```powershell
node .\scripts\readmes\render-readmes.mjs .\services\README.template.md .\docs\some-page.template.md
```

## Recommended workflow for adding a new template

1. Copy the current README to a sibling `.template.md` file
2. Replace repeated literals with placeholders
3. Add the new template path to `scripts/readmes/render-readmes.manifest.json` if it belongs in the default set
4. Generate the output README
5. Run the check mode
6. Review the diff before committing

Example:

```powershell
node .\scripts\readmes\render-readmes.mjs .\path\to\README.template.md
node .\scripts\readmes\render-readmes.mjs --check .\path\to\README.template.md
```

## How path resolution works

- Relative template paths are resolved from the repository root
- Absolute template paths also work
- By default, the env source is `compose/.env`
- By default, the template list source is `scripts/readmes/render-readmes.manifest.json`
- `--env` can point to another env file when needed
- `--manifest` can point to another manifest file when needed

This means templates can live at any directory depth in the project as long as you pass the correct path.

## Testing

Run the renderer tests from the repository root:

```powershell
node --test scripts/readmes/render-readmes.test.mjs
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
node --test scripts/versions/sync-*.test.mjs scripts/readmes/render-readmes.test.mjs scripts/versions/renovate-framework-sync.test.mjs
```

## Important caveats

- `render-readmes.mjs` reads the generated output file during `--check`; if that output file does not exist yet, the check will fail
- The script does not currently scan the repository automatically for templates; it uses either explicit CLI paths or the manifest default list
- Only placeholders you explicitly add to a template are substituted
- Literal GitHub Actions expressions such as `${{ matrix.service.name }}` are safe because the renderer only substitutes uppercase `{{PLACEHOLDER}}` tokens
- Existing Jekyll/Liquid expressions in docs such as `{{ '/images/...' | relative_url }}` are also safe because they do not match the renderer's uppercase-only placeholder pattern
