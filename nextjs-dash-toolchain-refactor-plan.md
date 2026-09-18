# Next.js dashboard toolchain refactor plan

## Objective

Refactor `utils/nextjs-dash` to use the following exact toolchain while preserving application behavior, test coverage, benchmark-control semantics, and the existing quality-report publication flow:

| Capability    |                             Current |                      Target |
|---------------|------------------------------------:|----------------------------:|
| TypeScript    |                  `typescript@6.0.3` |          `typescript@7.0.2` |
| Unit tests    |                     `vitest@4.1.11` |              `vitest@5.0.0` |
| Coverage      |        `@vitest/coverage-v8@4.1.11` | `@vitest/coverage-v8@5.0.0` |
| Linting       | ESLint through `eslint-config-next` |             `oxlint@1.83.0` |
| Formatting    |      No module-owned formatter gate |              `oxfmt@0.68.0` |
| Type checking |    `tsc --noEmit` from TypeScript 6 | TypeScript 7 native checker |

Each phase below is intended to be a separate agent task and reviewable commit. An agent should read this entire phase, the phase's named files, the root `AGENTS.md`, and `docs/AGENT_IMPLEMENTATION_MAP.md` before changing anything. A phase starts from the accepted output of its prerequisites and must leave the repository in a state that the next phase can reproduce.

## Important TypeScript 7 / `tsgo` terminology decision

The stable `typescript@7.0.2` package is the Go/native TypeScript implementation formerly exposed as `tsgo`, but its published npm metadata exposes only the `tsc` binary. The stable TypeScript 7 announcement likewise says to invoke it as `tsc`. There is no standalone `tsgo` npm package, and `@typescript/native-preview@7.0.2` does not exist.

The recommended implementation is therefore:

```json
{
  "devDependencies": {
    "typescript": "7.0.2"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

This does introduce the native checker that was developed as `tsgo`, using its supported stable command name. Documentation should say “TypeScript 7 native checker (formerly `tsgo`)” once, and use `tsc` for copy-pasteable commands. Do not add a fake `tsgo` shim or combine stable 7.0.2 with an older native-preview snapshot. If a literal `tsgo` executable is a hard acceptance criterion, stop in Phase 0 and obtain a revised package/version requirement before implementation.

Primary references:

- [TypeScript 7 stable announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [TypeScript 7 beta and `tsgo` transition notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/)
- [Vitest 5 migration guide](https://vitest.dev/guide/migration/)
- [Oxlint ESLint migration guide](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)
- [Oxlint built-in plugins](https://oxc.rs/docs/guide/usage/linter/plugins)
- [Oxfmt configuration](https://oxc.rs/docs/guide/usage/formatter/config)

## Cross-phase guardrails

- Preserve unrelated working-tree changes. At plan-writing time, Git reports `utils/nextjs-dash/package-lock.json` as deleted from the index and present as an untracked file. Resolve ownership and intended contents before any dependency command rewrites it.
- Use npm `12.0.2`, matching `packageManager`, whenever regenerating `package-lock.json`.
- Pin the requested direct dependencies exactly; do not introduce `^` or `~` ranges for them.
- Keep Node at or above `22.12.0`. Vitest 5, Oxlint 1.82, and Oxfmt 0.67 require that floor; the Docker image at Node `26.9.0` already satisfies it.
- Keep Node/JSDOM test separation, coverage scopes, artifact names, Codecov flags, and dashboard runtime behavior unchanged unless a documented Vitest 5 incompatibility requires a narrow adjustment.
- Keep `typescript.ignoreBuildErrors: true` only while the explicit quality-stage type check remains mandatory before `next build`.
- Do not treat a green formatter/linter migration as proof of runtime correctness. Every phase that changes source must finish with type checking, the relevant tests, and a production build where specified.
- Generated Markdown must be changed through its `*.template.md` source and rendered with `node scripts/render-readmes.mjs`.

## Phase 0 — Reconcile the worktree and capture a reproducible baseline

**Purpose:** create a trustworthy before-state and remove ambiguity around existing user work.

**Prerequisites:** none.

**Read:** `utils/nextjs-dash/package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, all four `vitest.config*.ts` files, `Dockerfile`, `.github/workflows/nextjs_dash_quality.yml`, and `.github/workflows/nextjs_dash_coverage.yml`.

**Tasks:**

1. Inspect `git status`, the index entry, and the on-disk copy of `package-lock.json`. Preserve or checkpoint the existing lockfile work; do not normalize it as a side effect of this migration.
2. Use the Node/npm versions declared by the module (`Node >=22.12`, npm `12.0.2`) and perform a clean `npm ci` from the accepted lockfile.
3. Record the resolved versions of Node, npm, TypeScript, Vitest, Vite, ESLint, Next.js, and the coverage provider in an ignored `.tmp/migration-baseline/` note.
4. Run the current gates and record pass/fail, diagnostic counts, test counts, coverage summaries, build result, and approximate durations:

   ```bash
   npm run lint
   npm run typecheck
   npm run test:node
   npm run test:dom
   npm run test:coverage
   npm run build
   ```

5. Save an ESLint JSON report and an inventory of effective rules for representative client, server, and test files. This is the parity reference for Phase 3.
6. Search tests for state that Vitest 5 changes: mock calls created at module scope or in `beforeAll`, nested `vi.mock`/`vi.unmock`/`vi.hoisted`, and `-t` patterns that span suite/test boundaries.
7. Confirm the stable TypeScript 7 command decision above. If the acceptance criterion still requires the literal `tsgo` executable, stop here.

**Validation:** baseline commands are reproducible after a clean install, or every pre-existing failure is recorded with its exact command and diagnostics.

**Exit criteria / handoff:** accepted lockfile ownership is clear; baseline artifacts and known failures are recorded; the TypeScript CLI contract is settled. No production source change belongs in this phase.

## Phase 1 — Upgrade to TypeScript 7.0.2 and the native checker

**Purpose:** isolate compiler/configuration migration from linting and test-runner changes.

**Prerequisites:** Phase 0.

**Files:** `utils/nextjs-dash/package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, and only source/test files that TypeScript 7 proves incompatible.

**Tasks:**

1. Pin `typescript` to `7.0.2` and regenerate the lockfile with npm `12.0.2`.
2. Keep `typecheck` as `tsc --noEmit`, which now invokes the stable native TypeScript 7 compiler. Do not add `@typescript/native-preview`.
3. Run `tsc --showConfig` and `npm run typecheck`. Remove or replace compiler options only when TypeScript 7 rejects them; preserve `strict`, `noEmit`, `moduleResolution: bundler`, JSX mode, path aliasing, Next-generated type includes, and incremental checking unless evidence requires a change.
4. Check that `.next/types` and `.next/dev/types` inclusion behaves on both a clean tree and after `next build`. Avoid committing `tsconfig.tsbuildinfo` or `.next` output.
5. Update the explanatory comments in `next.config.ts` to identify the TypeScript 7 native checker and retain the explicit quality-gate rationale for `ignoreBuildErrors`.
6. Fix newly exposed type errors narrowly. Do not weaken strictness, expand `skipLibCheck`, add blanket casts, or suppress diagnostics merely to finish the upgrade.
7. Capture before/after type-check duration under comparable conditions. Treat performance as evidence, not as a pass criterion.

**Validation:**

```bash
npm ci
npm run typecheck
npm run test:fast
npm run build
```

Also assert that `node_modules/.bin/tsc --version` reports exactly `7.0.2` and that `package-lock.json` resolves the same version.

**Exit criteria / handoff:** TypeScript 7.0.2 performs the strict no-emit check, Next builds successfully, and no preview compiler dependency or command shim exists.

## Phase 2 — Upgrade Vitest and coverage to 5.0.0

**Purpose:** migrate test-runner semantics while the old lint gate is still available.

**Prerequisites:** Phase 1.

**Files:** `package.json`, `package-lock.json`, `vitest.config.shared.ts`, `vitest.config.node.ts`, `vitest.config.dom.ts`, `vitest.config.ts`, `vitest.setup.ts`, and affected tests only.

**Tasks:**

1. Pin both `vitest` and `@vitest/coverage-v8` to `5.0.0`; their versions must match exactly. Confirm the resolved Vite peer is at least `6.4.0` and Node is at least `22.12.0`.
2. Review every Vitest 5 migration item against this repository. The high-risk item here is `clearMocks`, now enabled by default. Prefer explicit `clearMocks: true` in the shared test options and repair tests that rely on cross-test call history instead of restoring the old leaky behavior.
3. Move any nested hoisted mock declarations to module scope; use `vi.doMock` only where runtime mocking is intentional. Update full-name `-t` patterns to the new `suite > test` form if any are scripted or documented.
4. Confirm the separate config-file approach remains valid. This module does not currently use inline `projects`, so do not redesign the suite around the new inheritance/shared-server behavior without a measured reason.
5. Keep the Node and JSDOM includes, shared alias, MUI `react-transition-group` resolution, worker settings, coverage includes/excludes, and report directories stable.
6. Compare test counts and coverage totals with Phase 0. Investigate missing tests or coverage shifts rather than accepting them as upgrade noise.

**Validation:**

```bash
npm run typecheck
npm run test:node
npm run test:dom
npm run test:coverage:node
npm run test:coverage:dom
npm run build
```

Run each non-watch suite twice to catch accidental shared state. Verify `coverage/node/coverage-summary.json`, `coverage/dom/coverage-summary.json`, and both LCOV files are produced.

**Exit criteria / handoff:** Vitest and the coverage provider resolve to 5.0.0, test counts remain accounted for, coverage artifacts retain their paths and formats, and mock-isolation changes are explicit.

## Phase 3 — Migrate ESLint rules to Oxlint, prove parity, then remove ESLint

**Purpose:** replace the linter without silently discarding the current Next.js and React safety rules.

**Prerequisites:** Phase 2 and the Phase 0 ESLint rule/output baseline.

**Files:** `package.json`, `package-lock.json`, `eslint.config.mjs`, new `.oxlintrc.json`, application/test files with valid findings, and inline suppression comments where necessary.

**Tasks:**

1. Add exact `oxlint@1.83.0` while temporarily retaining ESLint dependencies for comparison.
2. Generate a draft from `eslint.config.mjs` using the version-matched `@oxlint/migrate@1.83.0`. Treat generated configuration as input for review, not as an accepted result.
3. Prefer Oxlint's native `nextjs`, `react` (including React Hooks), and `typescript` plugins. Do not retain JavaScript ESLint plugins unless a required rule lacks a native equivalent and the exception is documented.
4. Recreate these current contracts in `.oxlintrc.json`:
   - Next.js core-web-vitals/recommended behavior;
   - React Hooks correctness checks;
   - TypeScript recommended correctness checks currently active through `eslint-config-next`;
   - browser globals for client files and Node globals for API routes, `lib`, and config files;
   - the server-side allowance corresponding to `@typescript-eslint/no-require-imports`;
   - ignores for `.next`, `node_modules`, `dist`, `out`, `coverage`, `.output`, `build`, generated reports, and local temporary artifacts;
   - zero-warning CI behavior via `--deny-warnings` or `options.denyWarnings: true`;
   - reporting of unused disable directives.
5. Preserve current lint scope (`.` from the module root) and explicitly inspect the effective config for a client component, an API route, a library file, a Vitest test, and each config file.
6. Run ESLint and Oxlint against the same commit and compare rule coverage and diagnostics. For each ESLint rule without a direct Oxlint equivalent, record whether it is replaced by an equivalent native rule, covered by TypeScript/build/tests, intentionally retired with rationale, or blocks the migration. The final state may not retain ESLint as a fallback.
7. Fix true positives in small, behavior-preserving changes. Avoid broad `allow` rules and file-wide suppressions. Oxlint honors ESLint disable comments, but convert touched suppressions to Oxlint syntax where practical and ensure each still names an active rule.
8. Change `npm run lint` to `oxlint --deny-warnings .` (or the equivalent config-owned warning policy).
9. Only after parity review passes, remove `eslint-config-next`, `eslint-plugin-react-hooks`, all now-unneeded transitive/direct ESLint packages, and `eslint.config.mjs`; regenerate and inspect the lockfile for unexpected remnants.
10. Do not automatically enable Oxlint type-aware linting. The old ESLint setup is not project/type-aware, and `npm run typecheck` already owns full compiler diagnostics. Type-aware Oxlint can be proposed separately if it adds reviewed rules and its extra `oxlint-tsgolint` dependency is intentionally accepted.

**Validation:**

```bash
npm run lint
npm run typecheck
npm run test:fast
npm run build
```

Also run `oxlint --print-config` on the representative files and use `npm ls eslint eslint-config-next eslint-plugin-react-hooks` to prove the old stack is absent or explain any unavoidable transitive copy.

**Exit criteria / handoff:** Oxlint is the only configured lint engine, warning policy remains fatal, important Next/React/TypeScript rules are accounted for, and the application gates remain green.

## Phase 4 — Introduce Oxfmt and land formatting as an isolated change

**Purpose:** add a deterministic write command and a non-mutating formatting gate without hiding semantic edits in formatter churn.

**Prerequisites:** Phase 3.

**Files:** `package.json`, `package-lock.json`, new `.oxfmtrc.json`, and files reformatted by the approved module scope.

**Tasks:**

1. Pin `oxfmt@0.68.0`.
2. Add scripts with clear behavior:

   ```json
   {
     "format": "oxfmt --write .",
     "format:check": "oxfmt --check ."
   }
   ```

3. Commit `.oxfmtrc.json` with explicit values rather than relying on changing defaults. Start from the module's observed conventions: two spaces, semicolons, single quotes for JS/TS, trailing commas in multiline constructs, and LF line endings (matching `.gitattributes`). Choose and record a print width. Disable import sorting and `package.json` sorting for the initial migration unless separately reviewed, so formatter adoption does not also reorder module boundaries or manifest fields.
4. Add ignores for generated/build/report directories and artifacts: `.next`, `node_modules`, `coverage`, `quality-report`, `.output`, `build`, `dist`, `out`, `tsconfig.tsbuildinfo`, and Vitest/quality JSON or text reports. Lockfiles are ignored by Oxfmt, but keep that behavior explicit in review notes.
5. Run the formatter once over the intended module scope and commit the result as a mechanical-only change. Inspect for changes to raw JavaScript strings in `PreHydrationScript.tsx` and `RuntimeConfigScript.tsx`, Markdown code blocks, YAML, JSON ordering, and fixture/snapshot content.
6. Do not mix lint/type/test fixes into the format-only commit. If formatting exposes a real issue, make the semantic fix before or after it in a separate commit.

**Validation:**

```bash
npm run format
git diff --check
npm run format:check
npm run lint
npm run typecheck
npm run test:fast
npm run build
```

Run `npm run format:check` a second time to prove idempotence.

**Exit criteria / handoff:** a fresh checkout passes the non-mutating format check, formatting is deterministic, and the format-only diff contains no intended behavior change.

## Phase 5 — Rewire Docker, CI, quality reports, and Pages integration

**Purpose:** make every automated consumer invoke and describe the new tools, including failure-path report generation.

**Prerequisites:** Phases 1–4.

**Files:**

- `utils/nextjs-dash/Dockerfile`
- `utils/nextjs-dash/.dockerignore`
- `utils/nextjs-dash/next.config.ts`
- `.github/workflows/nextjs_dash_quality.yml`
- `.github/workflows/nextjs_dash_coverage.yml`
- `scripts/pages/generate-nextjs-quality-report.mjs`
- `scripts/pages/assemble-quality-pages.sh`
- focused tests/fixtures for the report generator if present or added

**Tasks:**

1. Replace hard-coded Docker commands with module scripts so local, CI, and container gates cannot drift. The quality stage should run, in order, formatting check, Oxlint, TypeScript 7 native typecheck, Node tests, and DOM tests before writing the sentinel.
2. Preserve the multi-stage, non-root runtime image and builder dependency on `/tmp/.quality-ok`. Do not add toolchain packages to the final image.
3. In both dashboard workflows, make the Node floor explicit (`22.12.0` or a documented newer line) and use npm `12.0.2` consistently with `packageManager` and Docker before `npm ci`.
4. Update the quality workflow's version step and outputs to report Node, npm, Oxlint, Oxfmt, TypeScript 7, and Vitest. Rename step labels and environment variables away from ESLint/old-`tsc` terminology.
5. Add `npm run format:check` as a fatal CI step. Keep lint, typecheck, split tests, and production build as distinct steps so failures remain attributable.
6. Generate failure-path artifacts with the new tools:
   - `oxlint --format json` redirected to `oxlint-report.json` while preserving an empty/valid artifact on a clean run;
   - native TypeScript diagnostics redirected to a tool-neutral name such as `typescript-output.txt`;
   - optionally capture Oxfmt's list of differing files in `oxfmt-output.txt` so formatting failures appear in the hosted report.
7. Update `generate-nextjs-quality-report.mjs` for Oxlint's actual 1.82 JSON schema. First save clean and failing sample output; then parse paths, line/column spans, severity, rule IDs, messages, and summary counts. Do not assume ESLint's numeric-severity/per-file schema.
8. Add focused parser/report tests with clean output, warnings, errors, malformed/missing files, Windows and POSIX paths, and TypeScript multiline diagnostics. Ensure malformed inputs are visible as report-generation warnings rather than false “pass” results.
9. Rename report UI labels, CSS class names where useful, metadata variables, comments, and `.dockerignore` entries from ESLint to Oxlint and from implementation-specific `tsc` filenames to TypeScript 7. Include the Oxfmt gate in the overall verdict if its diagnostics are captured.
10. Update `assemble-quality-pages.sh` landing-page text and headings from “ESLint + TypeScript” to “Oxlint + Oxfmt + TypeScript 7”. Preserve artifact directory/name contracts unless there is a concrete reason to version them.
11. Confirm `.github/workflows/nextjs_dash_coverage.yml` still produces and uploads both Vitest 5 coverage artifacts and Codecov flags without changes to paths.
12. Preserve full-SHA action pinning and the workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` placement.

**Validation:**

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:node
npm run test:dom
npm run test:coverage
npm run build
node ../../scripts/pages/generate-nextjs-quality-report.mjs
```

Validate the generated HTML visually for both all-pass and seeded-failure fixtures. Build at least the Docker `quality` target and then the final image on Linux/Alpine so Oxlint/Oxfmt native optional dependencies and the lockfile are exercised in the actual container environment.

**Exit criteria / handoff:** local scripts, Docker, CI, report generation, Pages labels, and coverage all agree on tool names, versions, commands, and artifact locations; failure reports remain useful even when an earlier gate fails.

## Phase 6 — Update all user, contributor, and agent documentation

**Purpose:** remove stale versions/commands and make the new workflow discoverable.

**Prerequisites:** Phase 5, because documentation must describe the final implemented commands and report format.

**Files and required updates:**

1. `utils/nextjs-dash/README.md` (authored directly):
   - TypeScript 7.0.2, Vitest 5.0.0, Oxlint 1.83.0, and Oxfmt 0.68.0;
   - Node `22.12+` local prerequisite;
   - `format`, `format:check`, `lint`, `typecheck`, test, coverage, and build commands;
   - Docker quality-stage order and the stable native TypeScript command explanation;
   - Vitest 5 mock-reset behavior only if contributors need to account for it.
2. `README.template.md` and `docs/tools-technologies.template.md`:
   - update TypeScript and Vitest table versions;
   - replace the ESLint dashboard entry with Oxlint and add Oxfmt as the dashboard formatter;
   - describe TypeScript 7 as the native checker without advertising an unavailable `tsgo` executable.
3. `docs/TESTING.template.md`:
   - update the dashboard version block;
   - update quality-gate commands and comments;
   - document Vitest 5 and the deliberate `clearMocks` policy;
   - keep coverage paths, environments, artifacts, and Codecov flags synchronized with CI.
4. `docs/LINTING_AND_CODE_QUALITY.md` (not generated by the manifest):
   - rename the dashboard section and rewrite its config/rule/report descriptions;
   - replace every ESLint-specific report schema/detail with Oxlint/Oxfmt/TypeScript 7 behavior;
   - update references to official Oxc and TypeScript 7 documentation.
5. `AGENTS.md`, `docs/AGENT_IMPLEMENTATION_MAP.md`, and `.github/instructions/copilot-instructions.md`:
   - make `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run test:fast` the cheapest dashboard checks;
   - identify `.oxlintrc.json` and `.oxfmtrc.json` as the relevant configs;
   - remove stale ESLint and TypeScript 5/6 guidance;
   - keep these files concise and avoid duplicating the full migration rationale.
6. Any comments or human-readable labels in `next.config.ts`, `Dockerfile`, workflows, report scripts, and Pages assembly that still identify ESLint, old Vitest, or JavaScript TypeScript as the checker.

**Render and validation:**

```bash
node scripts/render-readmes.mjs
node scripts/render-readmes.test.mjs
```

Inspect the generated diffs for `README.md`, `docs/tools-technologies.md`, and `docs/TESTING.md`; do not edit those generated outputs directly. Then run a repository-wide, tracked-text search for `ESLint`, `eslint.config`, `eslint-report`, `tsc-output`, `TypeScript 6.0.3`, `TypeScript 5.9`, `Vitest 4`, and the old quality-page label. Classify every remaining hit as unrelated, historical, or stale; do not blindly replace unrelated ecosystem references.

**Exit criteria / handoff:** every command in documentation is executable, every displayed version matches the lockfile, generated docs match their templates, and agent instructions route future dashboard work through the new gates.

## Phase 7 — Clean-install, cross-platform, and final acceptance

**Purpose:** prove the migration from a consumer's perspective and prevent native-binary/lockfile surprises.

**Prerequisites:** Phases 1–6.

**Tasks:**

1. Inspect the final diff by concern: manifest/lockfile, TypeScript fixes, Vitest fixes, Oxlint config/fixes, format-only changes, CI/reporting, and documentation. Move mixed changes back to their owning commit where practical.
2. From a clean dependency state, use npm `12.0.2` and run:

   ```bash
   npm ci
   npm run format:check
   npm run lint
   npm run typecheck
   npm run test:fast
   npm run test
   npm run test:coverage
   npm run build
   ```

3. Verify exact resolved direct versions with `npm ls --depth=0` and inspect `package-lock.json` for `typescript@7.0.2`, `vitest@5.0.0`, `@vitest/coverage-v8@5.0.0`, `oxlint@1.83.0`, and `oxfmt@0.68.0`.
4. Verify the lockfile supports the developer platform and Docker's Linux Alpine/musl platform. Run the Docker quality target and final image build; confirm the final image still runs as the non-root `nodejs` user and passes its health check.
5. Regenerate docs one final time and require an empty diff from a second render.
6. Run report-generator tests and inspect an actual generated dashboard quality page. Confirm Pages assembly links it with the new label.
7. Run `git diff --check` and a final stale-reference search. Ensure no generated outputs (`.next`, coverage, reports, `tsconfig.tsbuildinfo`) entered the patch.
8. Compare test counts and coverage with Phase 0, explain any intentional difference, and record measured typecheck/lint/test duration changes in the PR description without turning timing into a flaky gate.

**Final acceptance checklist:**

- [ ] Exact requested direct versions are installed and locked.
- [ ] Stable TypeScript 7 native checking runs through the supported `tsc --noEmit` command.
- [ ] No preview TypeScript package or misleading `tsgo` shim exists.
- [ ] Vitest 5 runs both environments; coverage output and Codecov inputs are intact.
- [ ] Oxlint fully replaces the configured ESLint stack and fails on warnings.
- [ ] Oxfmt has write/check scripts, deterministic config, and a fatal CI check.
- [ ] Local scripts, Docker, CI, reports, Pages, and docs use consistent commands and names.
- [ ] Next.js production behavior, API routes, telemetry, Compose wiring, and benchmark fairness contracts are unchanged.
- [ ] Template-generated documentation passes its renderer test and contains no stale tool versions.
- [ ] Existing user changes, especially the pre-existing lockfile state, were preserved or intentionally incorporated.

## Suggested agent assignment and commit sequence

| Order | Agent task                                   | Suggested commit boundary                               | Depends on |
|------:|----------------------------------------------|---------------------------------------------------------|------------|
|     0 | Baseline and lockfile reconciliation         | Notes only or no commit                                 | —          |
|     1 | TypeScript 7 native compiler migration       | `build(nextjs-dash): upgrade to TypeScript 7`           | 0          |
|     2 | Vitest 5 migration                           | `test(nextjs-dash): upgrade to Vitest 5`                | 1          |
|     3 | Oxlint parity migration and ESLint removal   | `build(nextjs-dash): replace ESLint with Oxlint`        | 2          |
|     4 | Oxfmt config and mechanical formatting       | `style(nextjs-dash): adopt Oxfmt`                       | 3          |
|     5 | Docker, workflow, report, and Pages plumbing | `ci(nextjs-dash): run and report the new toolchain`     | 4          |
|     6 | Authored/template docs plus rendered outputs | `docs(nextjs-dash): document the new quality toolchain` | 5          |
|     7 | Acceptance verification                      | No code change unless a focused fix is needed           | 6          |

Phases 1–4 should remain sequential because they all change `package.json`, `package-lock.json`, and diagnostic behavior. Documentation discovery and report-schema fixture research can happen in parallel, but final documentation and report code must be based on the accepted commands and actual Oxlint 1.82 output rather than assumptions.
