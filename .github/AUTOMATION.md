# GitHub automation

Keep this guide named `AUTOMATION.md`: GitHub gives `.github/README.md` precedence
over the repository's root `README.md` on its landing page.

## Responsibilities and execution

Workflows own triggers, job dependencies, permissions and deployment. Composite
actions own tool setup, locked installation, caching and uploads. Tested scripts
own report selection, diagnostics capture and quality policy. Keep those boundaries
explicit rather than introducing a universal workflow with conditional behavior.

- **Workflow Quality** runs on every PR and merge queue: actionlint 1.7.12,
  ShellCheck 0.11.0, hash-locked zizmor 1.32.0, workflow contracts and Pages/API
  boundary tests. Its `Workflow policy` check can be required without path skips.
- **Framework Version Consistency** checks generated versions and coverage policy.
- **SonarQube Cloud** coordinates reusable Java, Go, Django and dashboard jobs on
  every PR, main push, merge group and weekly/manual run. Each module tests once,
  retains its hard gate and Codecov upload, and publishes revision-stamped Sonar
  inputs. One dependent scan imports all coverage plus Java bytecode/libraries.
  No coverage from an older run is reused. Merge groups run coverage gates only;
  forks and Dependabot run tests without the secret-backed scan. `SONAR_TOKEN`
  is exposed only to the scanner step. Disable Sonar Automatic Analysis before
  enabling this workflow; CI waits for the Sonar quality gate.
- **Go Coverage / Django Python Coverage** own the only race-enabled Go and Django
  test executions per variant, including weekly runs. Quality workflows own lint,
  format, static analysis and builds. Django system checks run inside its default
  test runner during coverage, without a second management-command invocation.
- **Java Coverage / CodeQL** share the JVM inventory derived from
  `scripts/coverage/coverage-thresholds.json` via `scripts/coverage/java-modules.mjs`. Qodana discovers
  Maven modules, including native projects, under its configured source tree.
  Java Coverage owns the orchestrator's complete Maven quality profile; CodeQL and
  Qodana compile its symbols with that profile disabled. CodeQL retains its service
  Checkstyle pass and compiles every JVM module for security extraction.
- **Java Qodana** starts on every PR and merge group, then selects affected scopes
  with a bounded local Git diff. Unchanged scopes keep their existing successful
  check names without downloading or running the analyzer. Source, POM, resources
  and scanner configuration remain analysis inputs; Markdown alone under either
  source tree does not.
  Missing diff evidence selects both scopes. Main, manual and weekly runs analyze
  both scopes to retain complete paired Pages reports. A skipped PR scope has no
  fresh report artifact; report availability must not be interpreted as coverage.
  Each scan filters the IDE Maven import inventory to its selected scope, verifying
  that every scoped POM remains present. Other IDE settings and inspection thresholds
  remain intact. Bootstrap uses Maven bundled in the digest-pinned analyzer image,
  avoiding an additional wrapper JAR download.
- **Next.js Dashboard Quality** captures diagnostics and exit status during each
  original check, then collects coverage and builds once. Failed or missing checker
  execution cannot produce a passing quality report.

PR concurrency cancels superseded runs. Main scans, Renovate synchronization and
Pages publishing finish their active run. Language matrices retain `fail-fast: false`.

Go/Django quality and PMD use the shared
`workflow-scope` action inside merge-group jobs. It reuses each workflow's existing
positive `push.paths` globs; unsupported rules or unavailable Git diffs run all checks.
Unrelated groups retain job names while skipping tool installation, execution and
uploads. PR path filtering remains unchanged for these workflows. CodeQL retains all
language categories on every triggered run. Coverage workflows are reusable
producers without path filters, so their retained scope action conservatively
runs all checks, including on documentation-only merge groups. The dashboard's
Pages report is now collected from the SonarQube Cloud coordinator run.
To refresh just that report, choose **Actions > SonarQube Cloud > Run workflow**
and select **Run dashboard quality and refresh its Pages report only**. Select
`main` for the live report or a repository branch for the staging report.

### Django jobs

The Django pipeline has four independent jobs: one Ruff/helper job, two runtime
coverage jobs, and Qodana. The retained `Django common checks` job now checks all
three source trees using their own Ruff configurations and installs Ruff once.
The former `Django module checks (django-platform)` and
`Django module checks (django-reactive)` jobs are retired; remove those names from
any custom required-check settings. Qodana artifact names remain unchanged.
Reusable workflow checks gain caller prefixes (`java /`, `go /`, `python /`,
`dashboard /`); update custom required-check rules to the names displayed by the
first coordinator run. `Sonar analysis and coverage` is the new dependent scan check.

Coverage installs no Ruff, and the quality job installs no Django runtime.
Framework Version Consistency owns the dependency-lock freshness check; the common
quality job owns its projection tests. Ruff validates syntax, so CI no longer
performs overlapping `compileall` passes. Failed lint does not suppress formatting
or helper diagnostics after a successful tool install.

### On-demand Codex reviews

For general code review, comment `@codex review` on the pull request. The
connected GitHub integration posts its review on the PR and uses the requester's
included Codex allowance. For manual reviews on your PRs, set the repository's
**Review** policy to **Follow personal preferences** and keep your personal
**Automatic review** off. Keep **Use credits for reviews** off to stay within
the included allowance. See the [Codex GitHub review guide](https://learn.chatgpt.com/docs/third-party/github).

#### Codex Security scan

Add `codex-security` to request a security scan. The label launches a separate
GitHub Actions job with its own API credentials.

1. Create a dedicated project key in the [OpenAI API platform](https://platform.openai.com/api-keys).
   Enable API billing and ensure that the project can use `gpt-5.6-sol`, the default
   model in the pinned Action release. The Marketplace Action uses API billing,
   which is separate from ChatGPT Plus. See the [pinned Action guide](https://github.com/openai/codex-security/blob/02c70601a70dde2d1c9c9867d4ead298370890d1/github-action/README.md).
2. In this repository, open **Settings > Secrets and variables > Actions > New
   repository secret**. Save the API key as `CODEX_SECURITY_API_KEY`.
3. Create the `codex-security` label under **Issues > Labels > New label**. Once
   the workflow is on `main`, apply the label to an open PR from a trusted
   contributor's branch in this repository targeting `main`. Forks and Dependabot
   PRs are skipped. To scan an updated revision, remove and reapply the label.

Open **Actions > Codex Security** for the result for the revision that was labeled.
High and critical findings fail the scan job, as do execution errors. The check is
on demand and should stay optional in branch protection. The Action uses a $5
estimated stop threshold per scan. In-flight requests can exceed it.

The job summary shows findings and is visible to readers of this public repository.
Detailed logs, inline annotations, and downloadable scan artifacts are disabled.

## Caches and pins

The cache composite centralizes the upstream action SHA. Maven, Go, pip and npm
caches remain selected by their setup actions. Next.js caches only `.next/cache`,
keyed by OS, architecture, Node, lockfile, configuration and source. No credentials,
complete dependency installs or security-analysis databases are added to caches.

Snyk CLI is explicitly version-pinned; the Checkov and Semgrep scanner images are
digest-pinned in their local Docker actions; the JVM Qodana image is digest-pinned in
both configuration fields. Update both image fields together. Validator archives
have checked-in SHA-256 digests in `scripts/ci/install-workflow-tools.sh`; zizmor's
standalone wheel hashes are in `requirements/workflow-lint.txt`. Refresh hashes
from official release metadata when upgrading. Renovate owns routine dependency
version PRs, including grouped CodeQL action pins. Dependabot's version PR limit is
zero for every configured ecosystem; its separate security-update channel remains
available. Existing Renovate vulnerability alerts are also retained.

PMD caches its downloaded ZIP by version, digest, OS and architecture. Cached bytes
are checked against SHA-256 before extraction on every run. Installation is bounded
to six minutes; analysis has a separate five-minute limit within a fifteen-minute job.

Java Qodana caches have separate service/orchestrator namespaces, keyed by OS,
architecture, analyzer/profile, scoped IDE inventory and Maven descriptors. Their restore
prefix omits the branch ref so PRs can find compatible default-branch caches;
only default-branch runs save them. The first run after a key change is cold.
See [the workflow review](WORKFLOW_REVIEW.md) for measured Java startup costs,
remaining priorities and rollout checks.

Django and Snyk pip cache keys enumerate their consumed inputs, excluding unrelated
workflow-validator and documentation changes. Python Qodana checks out only one
commit except for merge-group routing; its provenance helper needs no history.
Its analyzer remains isolated with
fresh caches: reviewed run [43743627995](https://github.com/George-C-Odes/Observability-Benchmarking/actions/runs/43743627995)
spent about 20 seconds pulling the image and about 9 seconds bootstrapping packages,
with project opening/indexing dominating the remainder. Persistent scanner caching
needs a measured cold/warm comparison including cache-transfer cost and image,
inspection-profile and dependency invalidation before adoption. Runtime virtualenvs
cannot be reused for the analyzer's different Python environment.

## Pages publication

`scripts/pages/report-catalog.json` maps five producers to seven stable report
URLs. All producers accept success and failure in live and staging. The workflow
selects one trusted main commit for every job; branch artifacts are data and are
never executed by the publisher. Fork sources are excluded. Report collection
runs in parallel with the documentation build, with at most five concurrent jobs.
Qodana has one collection entry per scan scope, allowing services and orchestrator
reports to retain independent run IDs, commits and download outcomes.

Compiled Jekyll output is cached by documentation and build-workflow content.
Only docs/publisher changes trigger a direct push rebuild; completed quality
workflows still refresh reports. Short-lived collection artifacts feed a single
assembly and deployment stage. The assembly records availability, conclusion,
run ID and analyzed SHA, and rejects report symlinks.

The resolver selects the newest-created eligible scan for each report, not the run
that most recently finished or triggered Pages. For Qodana it skips a run only when
the matching job explicitly records an unaffected scope and a skipped scan. Failed
scans, failed startup and missing scope evidence never fall back to older green
reports. Legacy jobs without scope routing remain eligible. The resolver checks at
most five pages of 100 runs and five pages of jobs per candidate; a shared four-minute
lookup deadline bounds the complete selection including retries.
API errors and lookup-limit exhaustion are explicit unavailable states, never
clean assessments. Requests have fixed repository-scoped operations, component
validation/encoding, redirect rejection, 20-second attempt deadlines and up to
three transient retries. Missing artifacts do not select older green reports.

The two `dangerous-triggers` zizmor exceptions are local to Pages' `workflow_run`
and Renovate's `pull_request_target`. Their comments explain trusted-source
checkout and publication constraints. Reassess them if execution refs, token
scope, artifact handling or version-only publication change. No audit rule is
disabled globally.

## Claude Code Review

**Claude Code Review** (`claude_review.yml`) runs Claude Opus 5.5 on demand only,
never on push or synchronize, and is not a required check. It authenticates with
the `CLAUDE_CODE_OAUTH_TOKEN` secret and the installed Claude GitHub App, so its
usage counts against that Claude subscription.

- Request a review by adding the `claude-review` label to a same-repository PR,
  including Renovate and Dependabot PRs. Claude posts inline `[P0-P3]` findings
  and a progress-tracked summary comment, then the job removes the label. Add it
  again for a fresh review.
- The workflow triggers only on `labeled`. Comment and review triggers were removed:
  GitHub cannot filter those events by author or text, so every bot comment
  registered a skipped run. Other labels still register a skipped run, which costs
  no runner time.
- The review applies `.github/skills/code-review/SKILL.md` as staged from `main`,
  so a PR cannot rewrite the rubric it is reviewed against.
- Fork PRs are skipped, and the action checks that the labeller has write access.
- The job is read-only. The app token is requested with `contents: read`, the
  session uses `--permission-mode default` with an explicit allowlist (read tools,
  inline comments, `gh pr diff/view`), and edit and git write tools are denied.
  `git diff/log/show` stay off the allowlist because their `--output` option can
  write files that later steps execute. The prompt directs Claude to `gh pr diff`,
  because the action's built-in instructions suggest `git diff`.
  `workflow-policy.test.mjs` enforces these settings.
- Each run logs two expected warnings. The action reports the two `gh` Bash rules,
  because it cannot verify custom rules, and on bot-authored PRs it notes that
  commands that run checkout code are denied. Keep `restrict_untrusted_prs` at its
  default.

## Repository settings and rollout

Repository rulesets, secret values and environment approvals live in GitHub,
not these files. Deploy and observe the new workflows before requiring a new
check, so an unavailable check cannot block every PR.

1. Require `Workflow policy` and the existing framework consistency check.
2. Inspect existing required language checks before changing them. A workflow
   skipped by `paths` remains pending if required: retain path-aware rules or move
   routing inside an always-triggered workflow before requiring those checks
   globally. Merge-queue triggers are enabled in all PR validation workflows.
3. Retain protected main, reviewed workflow changes, least-privilege Actions
   defaults, fork-run approval policy and the protected `github-pages` environment.
4. Confirm required scanner secrets are configured. An absent Snyk token remains
   an explicit skip; findings remain non-blocking by the existing project policy.
5. Confirm `RENOVATE_SYNC_TOKEN` is repository-scoped with only the documented
   publication permissions; it remains restricted to the publication step.

No ruleset, secret, environment or repository setting is changed by editing this
directory. Fresh hosted scans and cache timing/hit measurements are required to
confirm production behavior and quantify performance changes.
