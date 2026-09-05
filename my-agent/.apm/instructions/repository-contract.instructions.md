---
description: "Apply repository routing, benchmark fairness, security, and generated-file contracts"
applyTo: "**"
---

# Repository Contract

1. Read the root `AGENTS.md` first and load only the task recipe needed from `docs/AGENT_IMPLEMENTATION_MAP.md`.
2. Check the working tree before editing and preserve unrelated user changes.
3. Keep comparable benchmark targets equivalent in endpoint behavior, telemetry signals, service identity, and Compose resources.
4. Keep benchmark services thin; reserve architectural layering for the dashboard and orchestrator.
5. Treat orchestrator command execution, path handling, authentication, and proxying as security-sensitive.
6. Edit a `*.template.md` source when one exists, then run `node scripts/render-readmes.mjs`.
7. Keep runtime containers non-root and multi-stage, and keep GitHub Actions pinned to full commit SHAs.
8. Run the cheapest relevant checks first. State exactly what ran and what remains unverified.
