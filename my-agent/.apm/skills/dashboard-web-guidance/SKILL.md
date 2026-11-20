---
name: dashboard-web-guidance
description: "Look up web platform patterns and browser support for HTML, CSS, accessibility, and client-side behavior in the Next.js dashboard. Use for frontend changes under utils/nextjs-dash/."
---

# Dashboard Web Guidance

Use GoogleChrome Modern Web Guidance before choosing a browser API or UI pattern for the dashboard. Use the existing dashboard instructions for MUI components, theme tokens, and project conventions. Keep backend API, infrastructure, and tooling tasks on their normal repository routes.

This skill follows [Modern Web Guidance v1.0.1](https://github.com/GoogleChrome/modern-web-guidance/blob/64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65/skills/modern-web-guidance/SKILL.md) and uses the corresponding npm CLI release. Use Node.js 22 or newer.

1. Search with a short English phrase for the browser behavior you need, such as `accessible modal dialog` or `accessible sortable table`. Keep application details out of the query.
2. Retrieve the specific guide from the search results. Try one more concrete search if the first has no relevant match.
3. Check browser support and fallback guidance against the dashboard requirements. If a guide requires an Origin Trial, use a supported pattern unless the project has explicitly opted in. Verify the resulting behavior with the focused dashboard checks and identify the guides that informed the change.

```sh
npx --yes --ignore-scripts modern-web-guidance@1.0.1 search "accessible modal dialog"
npx --yes --ignore-scripts modern-web-guidance@1.0.1 retrieve "<guide-id>"
```

On Windows, use `npx.cmd` if PowerShell blocks the script shim. After the package has been cached, add `--offline` if network access is unavailable. If the pinned tool is unavailable, use the existing dashboard guidance and record that the lookup was skipped.
