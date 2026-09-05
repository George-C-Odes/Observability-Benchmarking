---
description: "Run focused validation for the current working-tree change"
---

# Validate Current Change

Inspect changed paths, select the cheapest reliable checks from `AGENTS.md`, and run them. Broaden validation only when shared contracts or multiple subsystems changed.

Before finishing:

- inspect generated-file drift and unexpected artifacts;
- distinguish failures caused by the change from environment or pre-existing failures;
- report every command run with its outcome;
- list skipped checks and residual risks explicitly;
- do not modify unrelated files solely to make validation pass.
