# Reviewed Sonar exceptions

The user authorized suppression of the four original findings on 2026-11-15.
Each exception is limited to the specific finding reviewed below.

## Evidence and scope

SonarCloud PR 495 analysis `7ce39255-d402-43ea-a764-66c61764b266`, reported at
2026-11-15 19:20:13 +02:00, analyzed PR commit
`440d8b5eb8bc5664f7d55061b35063f8ee69d16d`. The local reviewed revision was
`2701f7ed09b9ea2e5a4804140e7012c8103ff71f`; the reported source lines and their
controls were also retrieved from SonarCloud and matched the local files.
All four issues were OPEN at review time. The older complexity/control-character
findings and the original S8707 instance `AaHgHqsKSajQlY95NHUW` were CLOSED;
the status-write instance below is a new finding, not evidence that an earlier
suppression failed.

Static triage verdict: **not actionable**, with high confidence, for each of:

| Issue | Rule | Reported location | Why the claimed boundary crossing is prevented |
| --- | --- | --- | --- |
| `AaHgHqsYSajQlY95NHUZ` | `githubactions:S7631` | `pages.yml:166`, build checkout | Current-repository literal main; inventory revision verified before local actions or assembly. |
| `AaHgOf8qSajQlY95OU8H` | `jssecurity:S8707` | `capture-check.mjs:78`, status write | CLI operation is allowlisted before I/O; output root comes from the trusted module, not CLI/cwd/environment. |
| `AaHgHqsYSajQlY95NHUX` | `githubactions:S7631` | `pages.yml:62`, docs checkout | Current-repository literal main; inventory revision verified before cache or Jekyll execution. |
| `AaHgHqsYSajQlY95NHUY` | `githubactions:S7631` | `pages.yml:117`, collect checkout | Current-repository literal main; inventory revision verified before report lookup and local actions. |

Locations above identify the pre-suppression scan; comments can shift line numbers.
[Issue collection](https://sonarcloud.io/project/issues?id=George-C-Odes_Observability-Benchmarking&pullRequest=495).
No root or path-scoped SECURITY.md applied to these files. The execution model
is established by AGENTS.md, the CI/report safety skill and the actual callers.

## Checkout flow

The rule links the three checkouts to the privileged `workflow_run` trigger.
However, none selects `repository` or `ref` from that event: all use the current
repository and literal `refs/heads/main`, with credentials not persisted. The
inventory rejects fork-origin runs, and its trusted checkout commit is compared
with each downstream checkout before repository code or local actions execute.
A changed main revision fails closed. Execution jobs have read-only permissions;
Pages deployment permissions exist only in a separate job without checkout.
Producer reports are downloaded into data directories and copied, not executed.

This exception concerns fork-code execution at these checkouts. It does not
assert that report HTML is trusted or that all artifact-handling risks are absent.
Re-review if repository/ref selection, event guards, revision checks, permissions,
local action ordering, cache trust, or artifact execution behavior changes.

## Renovate APM publication checkout

The user authorized suppressing verified false positives on 2026-11-23.
[SonarCloud issue `AaIJkD9Mb1EEQTancyi_`](https://sonarcloud.io/project/issues?id=George-C-Odes_Observability-Benchmarking&issues=AaIJkD9Mb1EEQTancyi_&open=AaIJkD9Mb1EEQTancyi_&pullRequest=558)
was open on PR 558 at analyzed commit `af44de2bb14a8bac6e023cf620f93cc7f92b9197`.
`githubactions:S7631` links `pull_request_target` to the `publish-apm` checkout
at the original line 199. The checkout uses the current repository and literal
`refs/heads/main`, with credential persistence disabled. The next step checks
the actual commit against the PR base SHA and aborts before running local actions
or repository scripts if they differ.

The publication job depends on generation for a same-repository Renovate PR.
It revalidates the open PR, base and head independently before using the existing
scoped publication token. The generated lockfile enters as data and can only be
published at the fixed lockfile path. `workflow-policy.test.mjs` checks the
checkout inputs, revision verification, and separate generation and publication
jobs. Reassess this exception if the trigger, checkout source, revision checks,
job credentials, or use of generation outputs changes.

The same-line YAML `NOSONAR` applies to all Sonar findings on this one checkout
line. A fresh PR analysis is required to confirm clearance.

## CLI flow

The reported path is `process.argv[2] -> mode -> statusPath -> writeFileSync`.
`Object.hasOwn(checks, mode)` throws for every CLI string except `format`, `lint`
and `typecheck`, before any filesystem access or checker invocation. These select
only `format-status.json`, `lint-status.json` or `typecheck-status.json` under the
module-derived dashboard directory. `checkedPath` enforces containment and rejects
symlinks, junctions, hard links and special files before output writes.

The supported launcher uses an isolated trusted workspace, not an elevated
service sharing writable storage with hostile processes. Pre-I/O checks do not
claim race resistance under concurrent hostile filesystem mutation. Re-review
if callers accept non-CLI objects, operations/roots become configurable, checks
change, or workspace isolation no longer holds.

## Suppression mechanics and validation

The directives use same-line `NOSONAR` comments. Their scope is **all Sonar
findings on each annotated line**, including other current or future rules;
writing S7631/S8707 in the explanation does not narrow that scope. The remaining
file contents stay analyzed, and the local ESLint/SonarJS gate stays enabled.

Syntax references:

- SonarSource's [YAML visitor](https://github.com/SonarSource/sonar-iac/blob/master/iac-common/src/main/java/org/sonar/iac/common/yaml/visitors/YamlNoSonarVisitor.java),
  [line filter](https://github.com/SonarSource/sonar-iac/blob/master/iac-common/src/main/java/org/sonar/iac/common/extension/visitors/NoSonarVisitor.java)
  and [tests](https://github.com/SonarSource/sonar-iac/blob/master/iac-common/src/test/java/org/sonar/iac/common/yaml/visitors/YamlNoSonarVisitorTest.java).
- SonarSource's [JavaScript clarification](https://community.sonarsource.com/t/help-needed-how-does-nosonar-comment-work-in-js-ts-files/151620/7):
  Sonar directives do not disable ESLint rules.

Keep `scripts/ci/workflow-policy.test.mjs` and `scripts/capture-check.test.mjs`
enforced in Workflow Quality. They protect trusted checkout refs/revision wiring,
malicious mode rejection, exact valid operations, redirected roots/package bins,
output links and failure evidence. Run the report-script lint gate and actionlint
when revisiting these exceptions. Tests establish runtime contracts, not analyzer
suppression behavior. A new matching SonarCloud analysis must confirm the four
issues are no longer reported; until then remote clearance remains pending.
