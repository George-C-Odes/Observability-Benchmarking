# Observability Benchmarking Agent Kit

This directory is a Microsoft Agent Package Manager (APM) project containing portable, repository-specific agent primitives.

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
