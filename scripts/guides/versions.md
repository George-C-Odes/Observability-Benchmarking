# Framework versions and Renovate

The synchronizers keep their format-specific transformations and inventories separate. Each reads and validates its
entire inventory before passing the proposed changes to the shared check/write handler. Check mode never writes;
normal mode writes only changed files. This validation guarantee does not provide rollback if a filesystem write fails.

`compose/.env` is authoritative for the framework/runtime `*_VERSION` values managed by Renovate. Renovate's custom regex managers
read this repository's colon-style syntax, ignore commented-out alternatives, and update the env value rather
than independently changing its generated copies. Maven lookups use the actual service coordinates, including
the Zoomba Spark fork, Micronaut **core** BOM, and Pekko **HTTP** (not its separately versioned core libraries).
Framework major upgrades still require Dependency Dashboard approval; automerge remains disabled. Stable
registry releases still age for three days, except vulnerability alerts. Unrelated libraries, plugins, action pins,
Docker digests, and independent tool versions remain managed normally.

`MAVEN_VERSION` also follows this relay. Change it in `compose/.env` and run
`node scripts/versions/sync-framework-versions.mjs` to update the build inputs and generated documentation.
The Maven Wrapper implementation version remains independently managed. Builder digests are preserved
when the Maven tag is unchanged; refresh the digest after changing the release before benchmarking.

## Image tags and Node upgrades

The shared formatter replaces `_latest` with a runtime line: Java images use
`<framework-version>-java<major>`, Django uses `<django-version>-python<major.minor>`,
and Go uses its full version without a suffix. The dashboard uses
`<next-version>-node<major>`; Next.js keeps its `package.json` source of truth.
The orchestrator uses its Quarkus version plus the Java major. `wrk2:latest` is unchanged.
Compose image/build-name values, IDE build configurations, and documentation are generated
by the combined command below. Run it after changing env pins or the dashboard's documented package pins.
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

## One command for manual changes

`JAVA_MAJOR_VERSION` and `JAVA_MINOR_PATCH_VERSION` also live in `compose/.env`.
`JAVA_MINOR_PATCH_VERSION` accepts two to four dot-separated numeric components, for example
`0.5`, `0.5.0`, or `0.5.0.3`. The full release prepends `JAVA_MAJOR_VERSION`.
Java and GraalVM upgrades are manual: these two pins are excluded from Renovate extraction and its
framework-upgrade validator. The combined sync relays them to compiler targets, native-image/SVM
versions, Docker defaults, CI Java selections, IDE settings, and documentation. Docker
`JAVA_MINOR_RELEASE` retains its leading dot, derived from the env minor.patch value. When the Java major changes,
the orchestrator Maven builder digest must be refreshed for the new tag.

After editing the env or dashboard package pins, run the same command used by **[doc] Render Updates** and Renovate:

```powershell
node scripts/versions/sync-framework-versions.mjs
node scripts/versions/sync-framework-versions.mjs --check
```

This relays versions to Java service POMs, the orchestrator's Quarkus POM, Go directives/toolchains, service
Dockerfile ARG defaults, IntelliJ build image arguments/tags, Django/Gunicorn requirement inputs and locks, the shared
Python CI default, `sonar.python.version` in `.sonarcloud.properties`, and manifest-listed documentation. Dashboard documentation reads exact `next`, `react`, `@mui/material`, `typescript`, `vitest`, `oxfmt`, and `oxlint` versions from `utils/nextjs-dash/package.json`; dashboard unit-test expectations and fixtures import that manifest directly. Direct builds retain literal defaults. Individual
synchronizers remain available; use the combined command for a complete update. `--env` selects another env
source and `--check` never writes or downloads dependencies. Changes do not run automatically just by editing
the env. The combined operation is not transactional: after a compiler or filesystem failure, inspect the diff,
resolve the error, rerun, and commit only after check mode passes.

Django's two `requirements.in` files use **exact** `DJANGO_VERSION` and `GUNICORN_VERSION` pins.
Renovate tracks Gunicorn through PyPI as a framework upgrade; independent requirement updates are disabled.
If both pins match the locks, no compiler is needed. When either changes, use **Linux**, Python matching `PYTHON_VERSION`, and pip-tools **7.6.2**
in a compiler virtualenv. The helper checks the compiler before updating inputs, resolves both runtime locks
with targeted upgrades for the changed framework packages, then runs `.github/requirements/update-lock.sh` to regenerate the hash inventory
and Docker projections. Existing hashes are never relabeled for a different release, and there is no unhashed
runtime install fallback. Windows users must run Django or Gunicorn version changes in a Linux environment/container;
Git Bash with Windows Python cannot compile the Pyroscope-containing inventory. See
[Python compiler setup](../../.github/requirements/README.md#regenerate-or-upgrade-the-locks).

## Renovate PR synchronization

Dashboard npm updates to `next`, `react`, `@mui/material`, `typescript`, `vitest`, `oxfmt`, or `oxlint`
receive the existing `nextjs-version` label. The trusted relay detects the changed documentation pins,
validates dependency-only manifest edits and the complete lockfile against independent npm regeneration,
then regenerates the documentation and image tags. A non-Next.js update retains the existing image tag.

Renovate adds `action-docs-version` to updates for the shared upload-artifact, download-artifact, and
CodeQL action wrappers. The relay accepts only full commit SHA pins and version comment changes in
those wrappers. It renders and publishes [the linting and code quality guide](../../docs/LINTING_AND_CODE_QUALITY.md)
from the trusted template, using the proposed pins as data. CodeQL subactions update as a group.

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
node --test scripts/versions/sync-*.test.mjs scripts/readmes/render-readmes.test.mjs scripts/versions/renovate-framework-sync.test.mjs
```

## Go module versions

After changing `GO_VERSION` in `compose/.env`, synchronize both benchmark modules and `.github/go-tools/go.mod`:

```powershell
node scripts/versions/sync-go-mod-versions.mjs
node scripts/versions/sync-go-mod-versions.mjs --check
node --test scripts/versions/sync-go-mod-versions.test.mjs
```

In IntelliJ, run **[gen] Sync Go Module Versions**, or **[doc] Render Updates** to synchronize Java POMs, Go modules, Dockerfiles, build image configurations, and generated documentation together. Editing `.env` alone does not run synchronization.

The script sets each module's `go` directive to the full stable `GO_VERSION` (for example, `1.27.3`). It also aligns an existing standard `toolchain go...` pin, preserves `toolchain default`, and does not add a toolchain directive. Dependency versions, tool declarations, `go.sum`, comments, and formatting are preserved. Missing modules, missing or duplicate Go directives, unsupported toolchain declarations, and invalid env versions fail before any module is written. Unchanged modules are not rewritten.

The Go quality and coverage workflows already read service `go.mod` files through `go-version-file`, so the module update also relays the version to CI. The separate CI tools module uses the same Go version while retaining its own dependency lock. Go service READMEs use templates included in the default renderer manifest.

Paths resolve from the repository root. Use `--env path/to/.env` for an alternate source; `--check` reports drift with exit code 1 without writing. Extend `goModules` in the script when adding a module. The script does not invoke Go, download a toolchain, or run `go mod tidy`; review dependency compatibility separately when changing Go release lines.

## Dockerfile versions

After changing versions in `compose/.env`, synchronize all 19 service Dockerfiles:

```powershell
node scripts/versions/sync-dockerfile-versions.mjs
node scripts/versions/sync-dockerfile-versions.mjs --check
node --test scripts/versions/sync-dockerfile-versions.test.mjs
```

In IntelliJ, run **[gen] Sync Dockerfile Versions**, or **[doc] Render Updates** to synchronize POMs, Go modules, Dockerfiles, documentation, and build image configurations together.

The script updates the Java framework `ARG ..._VERSION=...` defaults, `GO_VERSION` in both Go Dockerfiles, and `PYTHON_VERSION` in both Django Dockerfiles. Literal defaults keep direct Docker builds usable; Compose and IntelliJ can still override them with build arguments. Django and Gunicorn are pinned in Python requirements, rather than a Dockerfile ARG.

Pekko has two independent build pins: `PEKKO_VERSION` for HTTP and `PEKKO_CORE_VERSION` for Core actor/stream/SLF4J modules. Both defaults are updated together in its single Dockerfile and passed through to Maven.

Only the listed framework/runtime defaults are managed. Other image and tooling pins (Java, Maven, OpenTelemetry agents, npm, YQ, and OS images), stage redeclarations, comments, and formatting are preserved. Missing files, missing or duplicate defaults, and missing or invalid env values fail validation before any Dockerfile is written. Unchanged files are not rewritten.

Paths resolve from the repository root. Use `--env path/to/.env` for an alternate source. Extend `dockerfileVersions` in the script when adding a service. Synchronization is explicit: rerun it after editing `.env`.

## Java service POM versions

After changing framework versions in `compose/.env`, update all 17 Java service POMs:

```powershell
node scripts/versions/sync-java-pom-versions.mjs
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
node scripts/versions/sync-java-pom-versions.mjs --check
node scripts/versions/sync-java-pom-versions.mjs --env path/to/.env
node --test scripts/versions/sync-java-pom-versions.test.mjs
```

Relative env paths resolve from the repository root. To add a Java service, extend `javaFrameworkVersions` in the script with its env key, property, and module path. The `--check` command can also be used in CI.

## Build image run configurations

After changing versions in `compose/.env`, refresh all `.run/[build-img]*.run.xml` configurations:

```powershell
node scripts/versions/sync-build-img-runs.mjs
```

In IntelliJ, run **[gen] Sync Build Image Versions** to execute the same command.

The script uses the same `KEY: VALUE` env parser as the README renderer. It updates every `*_VERSION` build argument, the image tag, and the version in `BUILDKIT_BUILD_NAME`. Django image tags and build names use `DJANGO_VERSION`; their Python build arguments use `PYTHON_VERSION`.

Pekko image tags and build names continue to use the HTTP `PEKKO_VERSION`; both `PEKKO_VERSION` and `PEKKO_CORE_VERSION` are synchronized as independent build arguments.

Docker connections, build contexts, Dockerfile paths, variant arguments, and shared build names are preserved. The three utility images tagged `latest` and the cache-prune command have no env-driven versions and are left unchanged. Other run configuration prefixes are excluded.

The XML comment in each versioned configuration identifies this command. Change versions in the env file, then run the synchronizer; other configuration settings can still be edited in IntelliJ. Synchronization is explicit: editing the env file alone does not refresh the XML.

Check for stale versions without writing files, or run the focused tests:

```powershell
node scripts/versions/sync-build-img-runs.mjs --check
node --test scripts/versions/sync-build-img-runs.test.mjs
```

Paths are resolved from the repository root, so the script can be invoked from any working directory. Use `--env path/to/.env` to read an alternative env file. It validates the entire batch before writing, reports missing or invalid versions, and only writes changed files.

New build configurations are discovered automatically by filename. Their image version comes from their sole `*_VERSION` build argument. If a new image uses a different version for its tag (as Django does), or has multiple version arguments, add its tag variable to `imageVersionOverrides` in the script.
