# Shared CI setup and coverage summaries

`.github/actions/setup-nextjs` reuses the shared Node setup and installs the exact npm version from the
dashboard's `package.json` `packageManager` field. Both npm installation and `npm ci` disable lifecycle
scripts. Its steps stop on failure. Workflow path filters include the dashboard setup and its nested Node action.

Go Quality uses one matrix pipeline with independent legs (`fail-fast: false`). Matrix entries retain the
existing check display names, module caches, report titles, and `quality-report-go` / `quality-report-go-simple`
artifact names; Pages still downloads those exact names.

`coverage-thresholds.json` defines independent hard thresholds for all 18 application modules.
Java (including the orchestrator), the dashboard, and Python require 90% lines and 90% branches.
Go requires 90% statements; native Go coverage does not measure branches or lines.
`coverage_gate.py <module> [<module> ...]` enforces this policy in each module job without
third-party dependencies. Missing/malformed reports, invalid counts/configuration, and
under-covered modules exit nonzero. No manual coverage override remains. See
[the coverage policy](../../docs/TESTING.md#hard-per-module-gates) for module scope and local commands.

The gate confines config and report reads to the selected workspace after resolving symlinks
and junctions. `--root` may select this checkout or a directory inside it; `--config` and
`--report` must resolve inside that workspace. Absolute in-workspace paths remain supported,
including a Django runtime report used to check the shared package. Run the helper in an
isolated checkout: these pre-read checks do not protect against concurrent hostile filesystem
changes or make a modified copy of the executable trustworthy.

`coverage_summary.py` renders format-specific tables independently of policy. It accepts the
standard JaCoCo external DTD declaration without fetching it and rejects entity definitions.
Go function detail uses a fixed argument list without a shell and a 30-second timeout.
Existing artifact names and Codecov flags are preserved; uploads run after gate failures.

`sync_coverage_thresholds.py` renders native JaCoCo checks and the dashboard's local
policy from the JSON source; `--check` rejects drift. `django_coverage.py` provides
portable local collection and gating for the Django Make targets. Go Make targets
use the shared checker; dashboard npm builds use its module-local Node counterpart.
See the coverage policy for local build commands and prerequisites.

The unconditional Framework Version Consistency workflow checks synchronization and runs the contract suites:

```powershell
node --test scripts/ci/github-actions.test.mjs
python -m unittest discover -s scripts/coverage -p "test_coverage*.py" -v
python -m unittest discover -s scripts/coverage -p test_local_coverage.py -v
node --test utils/nextjs-dash/scripts/coverage-gate.test.mjs
```
