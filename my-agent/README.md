# Observability Benchmarking Agent Kit

This directory is a Microsoft Agent Package Manager (APM) project containing portable, repository-specific agent primitives.

Use APM CLI **0.35.1** for this package. Check the active executable with `apm --version` before refreshing or validating generated state.

## Source of truth

- `apm.yml` defines package metadata, targets, and dependencies.
- `.apm/` contains authored instructions, prompts, agents, and skills.
- `apm.lock.yaml` is generated dependency state.
- `apm_modules/` and platform deployment directories are generated and ignored.

Do not edit files under `apm_modules/`. Do not add generated deployments to this package as authored sources.

## Curated dependencies

The package installs only these skills from the MIT-licensed `github/awesome-copilot` catalog:

- `github-actions-hardening` for workflow trust boundaries, expression injection, token permissions, and action pinning.
- `security-review` for cross-language dependency, secret, injection, authentication, and data-flow review.

The catalog is pinned to an audited full commit SHA in `apm.yml`; `apm.lock.yaml` records file hashes. Review upstream changes before moving the pin. Generic Docker, framework, and browser-testing skills are intentionally excluded where they duplicate or conflict with repository-specific guidance.

## Repository-authored skills

- `.apm/skills/benchmark-integrity/SKILL.md` protects comparable endpoint, telemetry, and resource behavior.
- `.apm/skills/focused-validation/SKILL.md` selects failure-mode-appropriate checks and reports validation limits.
- `.apm/skills/ci-report-safety/SKILL.md` covers workflow context validity, scanner/helper trust boundaries, authenticated API URL/credential boundaries, subprocess deadlines, Git-data isolation, fail-closed reports, and scoped security-alert triage with fresh-scan confirmation.

The root router and repository contract load these only for matching tasks. They complement the pinned upstream skills with local contracts; do not manually copy them into generated deployments or edit upstream dependency sources. `includes: auto` discovers authored primitives without dependency pin changes, but adding or changing deployed primitives can require refreshed lockfile deployment records.

## Validate

Run from this directory:

```powershell
apm install --frozen
apm compile --validate
apm audit --ci --no-policy
apm pack --dry-run
```

After changing dependencies, regenerate the lockfile before validating:

```powershell
apm lock
apm install --frozen
```

After upgrading the APM CLI, run `apm install` to reconcile local deployment hashes, then rerun the validation sequence above. Keep the audited dependency commits pinned; `--update` and `--refresh` are for intentional upstream dependency changes.

APM preserves the CLI version recorded in an existing lockfile. To refresh that metadata, copy `apm.yml` and `.apm/` into a clean temporary directory and run `apm install` there. Compare the generated lockfile with this package's lockfile before copying it back: dependency commits, content hashes, and deployment paths must match the expected sources. Rerun the validation sequence in this directory. Keep the existing lockfile until the replacement is ready; removing it in place can cause APM to skip existing deployments as unmanaged files.

If `apm install --frozen` reports new local deployments missing from the lockfile, run `apm install` without `--update`/`--refresh`, inspect the generated lock diff for unchanged upstream pins, then rerun the full validation sequence. Preserve any locally modified deployments APM skips; do not use `--force` to bypass ownership or security checks. Record such skips, and validate the authored primitives in a clean temporary deployment if necessary.

To evaluate an upstream skill update, inspect the available refs and use `apm install --dry-run` before changing the pinned commit:

```powershell
apm view github/awesome-copilot versions
apm install github/awesome-copilot/skills/github-actions-hardening#<commit> --dry-run
apm install github/awesome-copilot/skills/security-review#<commit> --dry-run
```

Use an explicit target to preview placement without writing files:

```powershell
apm compile --dry-run --target copilot --verbose
```

## Design principles

1. Keep repository-wide routing concise in the root `AGENTS.md`.
2. Put reusable agent primitives in `.apm/` and avoid copying large repository documents into them.
3. Preserve benchmark parity across endpoints, telemetry, resources, and service identity.
4. Apply UI guidance only to the Next.js dashboard, not to benchmark services or infrastructure files.
5. Prefer focused validation for the changed subsystem and report commands that actually ran.
