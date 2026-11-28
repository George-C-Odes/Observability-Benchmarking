# Scripts

Use the task table to find a repository-level helper, its caller or source of truth, and its focused check. Run commands from the repository root.

| Task | Start with | Focused check |
| --- | --- | --- |
| Propagate framework, runtime, Docker, image tag, or IDE build pins | [sync-framework-versions.mjs](versions/sync-framework-versions.mjs), [compose/.env](../compose/.env), [version guide](guides/versions.md) | `node scripts/versions/sync-framework-versions.mjs --check` |
| Change the PMD version, CI archive lock, or its docs | [sync-pmd-version.mjs](versions/sync-pmd-version.mjs), [orchestrator POM](../utils/orchestrator/pom.xml), [pmd-lock.json](../.github/pmd-lock.json), [PMD relay](guides/versions.md#renovate-pr-synchronization) | `node --test scripts/versions/sync-pmd-version.test.mjs` |
| Change trusted Renovate synchronization | [renovate-framework-sync.mjs](versions/renovate-framework-sync.mjs), [workflow](../.github/workflows/renovate_framework_sync.yml), [generated-file contract](guides/versions.md#renovate-pr-synchronization) | `node --test scripts/versions/renovate-framework-sync.test.mjs` |
| Render or check generated docs | [render-readmes.mjs](readmes/render-readmes.mjs), [template manifest](readmes/render-readmes.manifest.json), [renderer guide](guides/readme-rendering.md) | `node scripts/readmes/render-readmes.mjs --check <template-path>` |
| Enforce or summarize module coverage | [coverage_gate.py](coverage/coverage_gate.py), [coverage-thresholds.json](coverage/coverage-thresholds.json), [coverage_summary.py](coverage/coverage_summary.py), [coverage guide](guides/coverage.md) | `python -m unittest discover -s scripts/coverage -p "test_coverage*.py"` |
| Sync native coverage policy or collect Django coverage locally | [sync_coverage_thresholds.py](coverage/sync_coverage_thresholds.py), [django_coverage.py](coverage/django_coverage.py), [coverage guide](guides/coverage.md) | `python scripts/coverage/sync_coverage_thresholds.py --check` or `python -m unittest discover -s scripts/coverage -p test_local_coverage.py` |
| Stage coverage or configure Sonar analysis | [sonar-coverage.mjs](coverage/sonar-coverage.mjs), [workflow](../.github/workflows/sonar.yml), [Sonar guide](guides/sonar.md) | `node --test scripts/coverage/sonar-coverage.test.mjs` |
| Run or summarize Django Qodana scans | [run-qodana-python.py](scanners/run-qodana-python.py), [report helper](scanners/qodana-python-report.py), [scanner guide](guides/scanners.md#qodana-python-reports) | `python -m unittest discover -s scripts/scanners -p test_qodana_python.py` |
| Change Qodana Maven project scope | [qodana-project.mjs](scanners/qodana-project.mjs), [qodana-scopes.mjs](scanners/qodana-scopes.mjs), [workflow](../.github/workflows/qodana_code_quality.yml) | `node --test scripts/scanners/qodana-project.test.mjs scripts/scanners/qodana-scopes.test.mjs` |
| Gate and summarize Semgrep findings | [semgrep-report.mjs](scanners/semgrep-report.mjs), [Semgrep guide](guides/scanners.md#semgrep) | `node --test scripts/scanners/semgrep-report.test.mjs` |
| Scan with Snyk or summarize findings | [snyk-scan.mjs](scanners/snyk-scan.mjs), [snyk-report.mjs](scanners/snyk-report.mjs), [Snyk guide](guides/scanners.md#snyk) | `node --test scripts/scanners/snyk-scan.test.mjs scripts/scanners/snyk-report.test.mjs` |
| Collect GitHub reports or render and publish Pages reports | [Pages script guide](pages/README.md), [report catalog](pages/report-catalog.json), [workflow](../.github/workflows/pages.yml) | Run the matching `scripts/pages/*.test.mjs` file |
| Find or install pinned CI tools and release assets | [install-workflow-tools.sh](ci/install-workflow-tools.sh), [github-release-asset.mjs](ci/github-release-asset.mjs), [CodeQL bundle](ci/codeql-bundle.mjs), [GitHub automation guide](../.github/AUTOMATION.md) | Run the matching asset or bundle `.test.mjs` file |
| Check workflow scope, action pins, or build policy | [workflow-scope.mjs](ci/workflow-scope.mjs), [workflow-action-versions.mjs](ci/workflow-action-versions.mjs), [Workflow Quality](../.github/workflows/workflow_quality.yml) | Start with `workflow-scope.test.mjs`, `github-actions.test.mjs`, `workflow-policy.test.mjs`, `dockerfile-policy.test.mjs`, or `java-agent-integrity.test.mjs` |
| Capture dashboard checker output | [capture-check.mjs](capture-check.mjs), [dashboard package scripts](../utils/nextjs-dash/package.json) | `node --test scripts/capture-check.test.mjs` |
| Upgrade APM and refresh generated agent deployments | [upgrade-apm.py](upgrade-apm.py), [APM CLI pin](apm-version.txt), [APM upgrade guide](../my-agent/README.md#upgrade-and-refresh) | `python -m unittest discover -s scripts -p test_upgrade_apm.py` |

## Find a script or its callers

- Use `git ls-files scripts` for the live inventory. Narrow by filename or to a group such as `git ls-files scripts/pages`.
- To trace an entry point, search its basename in tracked files. For example, `git grep -n -F 'sync-framework-versions.mjs' -- .github .run scripts` finds workflow and IDE callers and script references. Extend the search to Makefiles, manifests, module scripts, and generated doc templates when they call the helper.
- In CI work, start from the failing workflow step and open the named helper, its closest test, and the config it reads. Consult the [CI/report safety guide](../my-agent/.apm/skills/ci-report-safety/SKILL.md) for scanner, report, and authenticated API changes.
- Keep new helpers and their tests in the folder for the task they serve. Add a task row when a new entry point needs to be discoverable.
- When moving a script, trace imports and repository-root calculations alongside its callers. Review workflow path filters, test discovery, coverage and analysis scope, and any focused lint paths that refer to its old location.
- For JavaScript helper changes, run the matching tests and the pinned [script quality gate](quality/package.json) with `npm run check --prefix scripts/quality`. See the [CI validation recipe](../docs/AGENT_IMPLEMENTATION_MAP.md#work-on-ci-or-quality-reports) for tool setup and additional checks.

## Framework versions and Renovate

See the [version synchronization guide](guides/versions.md) for individual synchronizers, supported pins, and Renovate setup.

## Sonar CI coverage and shared configuration

See the [Sonar guide](guides/sonar.md) for coverage collection, analysis scope, and scanner diagnostics.
