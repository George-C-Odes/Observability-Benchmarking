---
description: "Apply accessible, operational UI standards to the Next.js dashboard"
applyTo: "utils/nextjs-dash/**/*.{ts,tsx,css}"
---

# Dashboard UI Standards

- Use MUI theme tokens and existing component variants instead of introducing hardcoded colors, typography, or spacing.
- Prefer semantic HTML and native controls; add ARIA only when native semantics are insufficient.
- Preserve visible keyboard focus, logical tab order, useful accessible names, and WCAG AA contrast.
- Keep pointer targets at least 44 by 44 CSS pixels where practical.
- Design mobile-first and verify narrow, intermediate, and desktop layouts.
- Keep the control plane operational and scan-friendly rather than decorative.
- Extend the nearest focused test for changed interactions, loading states, errors, and keyboard behavior.
