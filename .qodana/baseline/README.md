# Qodana baseline files

This directory stores reviewed Qodana SARIF baselines for the scoped JVM analysis workflow.

Current expected file names:

- `services-java.sarif.json`
- `orchestrator.sarif.json`

How the workflow uses them:

- The GitHub Actions Qodana matrix checks for the matching file for each scope.
- If the file exists, the workflow adds `--baseline=<file>` for that scope.
- If the file does not exist, the scan runs normally without a baseline.

Recommended refresh flow:

1. Run a scoped Qodana scan locally or from GitHub Actions.
2. Review the generated SARIF results carefully.
3. Promote the reviewed SARIF file into this directory using the expected file name.
4. Commit the updated baseline in a pull request so changes remain visible and reviewable.

Keep baselines intentionally small and reviewed. Refresh them when previously accepted findings are fixed or when legitimate historical issues need to be re-acknowledged after inspection profile upgrades.
