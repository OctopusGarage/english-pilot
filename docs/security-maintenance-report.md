# Security maintenance evidence

WorkOrder: `1793015040000-rw-eval-20261024-ep-security-native-security-maintenance`.
Final focused round: 2 of 2. Starting commit: `a31758cb0743af783d6d7bedad5ada32253e1d10`.
PR target: `eval/ralphworks-20261024-baseline`. No merge or retarget is authorized.

## Scope and pre-mutation review

The exact assigned git root and branch were verified at the start of each round.
The repository guidance, package scripts, CI workflows and security definitions
were read. No `.codegraph` directory exists. No comparison worktree, evaluator
artifact or bot lifecycle state was accessed. Only the current native agent was
used for assessment and review; no model API, SDK or delegated model review ran.

Round 2 preflight passed: lockfile present, pnpm available, frozen offline install
successful, node_modules present, and individual tsc/vitest/eslint/prettier binary
checks successful. Commands with potentially long execution use explicit Perl
alarm timeouts (30–600 seconds); CI polling is bounded separately.

## Findings, source, reachability and disposition

Round 1 independently reproduced an audit total of 13 advisories: 3 high,
7 moderate and 3 low, rather than the originally reported 2/3/2. Round 1 made no
changes. Its dismissal of the unbounded Zod array path was incorrect and is
superseded by the following round 2 evidence.

| Source and severity                                                                                                                                                    | Affected path and reachability                                                                                                                                                                                                                                                | Decision before source edits                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), high, Zod <4.6.6                                                                             | `src/adapters/mcp-tools-learning.ts`: three optional tags arrays feed SDK `validateToolInput` through `src/adapters/mcp-stdio.ts`. Invalid elements accumulate issues even without a length constraint. A bounded real MCP client/server reproduction confirms amplification. | Actionable risk 75/100: local stdio requires access through the host/agent, so this is not an unauthenticated network service; nevertheless a malformed generated/tool request can consume the MCP process memory and amplify error output. Fix the actual parser without rejecting valid tag lengths. |
| pnpm audit, Vite 8.3.0: high GHSA-587h-7wmj-h5pm; moderate GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg; low GHSA-9jrq-w75r-8gcw | Vitest development dependency. Windows/editor and exposed dev-server prerequisites were not established in this macOS/Linux CLI project.                                                                                                                                      | Confirmed vulnerable installed version; safe supply-chain patch to 8.3.3 under the round 2 maintenance policy. Do not invent production reachability.                                                                                                                                                  |
| [ip-address advisory](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5), moderate                                                                                     | SDK > express-rate-limit > ip-address 10.7.3, quadratic zone regex. No attacker address validator route found in this stdio-only app.                                                                                                                                         | Safe supply-chain patch to 10.7.4.                                                                                                                                                                                                                                                                     |
| [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828), high                                                                                        | SDK > Express > body-parser 2.3.0; compressed body decoder error. No HTTP server transport is installed by the app.                                                                                                                                                           | Minimum compatible security release is 2.4.0, a minor rather than patch version; retained Express 5.2.1 and SDK 1.32.1. Reviewed official release and runtime contract; update only this package under compatible parent range.                                                                        |
| fast-uri advisories GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr (moderate), GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp (low)                                                | AJV schema processing, including development tooling. No application URL authorization/rendering route established.                                                                                                                                                           | Safe supply-chain security patch 3.1.8 to 3.1.9.                                                                                                                                                                                                                                                       |

Official release/fix material inspected before selecting versions:

- [Zod 4.6.6](https://github.com/colinhacks/zod/releases/tag/v4.6.6),
  [4.6.7](https://github.com/colinhacks/zod/releases/tag/v4.6.7), and
  [array size-gate fix](https://github.com/colinhacks/zod/commit/a0ebf97).
- [Vite 8.3.3](https://github.com/vitejs/vite/releases/tag/v8.3.3).
- [body-parser 2.4.0](https://github.com/expressjs/body-parser/releases/tag/v2.4.0).
- [ip-address 10.7.4](https://github.com/beaugunderson/ip-address/releases/tag/v10.7.4)
  and its detailed advisory (the compare page was unavailable).
- [fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9).

## Bounded reproduction and smallest plan

Before dependency or source edits, Node under a 30-second timeout called the
installed SDK's actual `validateToolInput` with 20,000 invalid numeric tags:
about 115 ms, 12.8 MB heap increase, 948,981 error-message characters. A linked
SDK `Client` / `InMemoryTransport` / production `createMcpServer` tool call then
confirmed the request boundary: `english_notes_history` returned `isError: true`,
969,034 serialized response characters, about 104 ms. This was a bounded
amplification demonstration, not an intentional out-of-memory crash.

Acceptance targets recorded before implementation:

1. Keep all 59 published tool definitions and JSON input schemas identical.
2. Preserve omitted, empty, duplicate, empty-string and arbitrarily long valid
   string tag arrays; reject malformed arrays before per-element issue creation.
3. Reject 20,000 invalid tags with a response under 1,000 characters, without
   reflecting invalid input, and leave the MCP connection usable.
4. Upgrade only advisory-affected packages; preserve SDK, Express, Vitest and
   unrelated dependency versions; do not suppress audit or alter gates.
5. Run unchanged verify, format checks, deterministic CLI/MCP and both backend
   dry-run evals, plus CI matrix checks. Record baseline failures honestly.

The new six-case integration regression was run red before the precheck. Even
Zod 4.6.7's default v4 parser returned 1,269,034–1,269,041 characters for each of
the three malformed calls. This confirms that the upstream size-bound fix alone
does not protect an array with no bound.

## Implementation and compatibility

`package.json` now requires Zod ^4.6.7. The registry reports no v3 release newer
than 3.25.76, hence no released v3 backport was found. SDK 1.32.1 declares
`^3.25 || ^4.0` compatibility. Trying the default v4 API changed advertised
integer bounds and object schemas, and could reject previously accepted large
integer inputs. The five MCP definition/type imports therefore explicitly use
the supported `zod/v3` compatibility export in the patched package. No broader
application migration is performed.

Important limit: the bundled v3 array parser is not itself backported by that
package upgrade. The three reachable string-array schemas are protected by a
shared preprocessing guard. It scans until the first non-string (including a
sparse slot), emits one constant validation issue, and aborts before parsing
elements. Valid arrays retain the original Zod parser and have no new cap.
Future array schemas must receive equivalent scrutiny; audit zero alone does
not prove all compatibility parser paths safe.

The lockfile contains only Zod, Vite, body-parser, ip-address and fast-uri version
changes plus their peer-context references; the normal mandatory staged Prettier formatter also reformats the touched lockfile. Incidental Rolldown/oxc refreshes
were removed. No permanent override or new direct transitive dependency was
introduced. A bounded frozen install verifies lockfile consistency.

After the guard, the same numeric-tag MCP reproduction returns 227 characters.
All 59 normalized serialized tool definitions compare equal to the pre-edit
snapshot, including descriptions, names and input schemas. The permanent tests
exercise all three tools at the real SDK request boundary and validate accepted
tag variants directly, including 20,000 valid strings and sparse invalid arrays.

## Round 1 broad review and residuals

- GitHub APIs returned 16 open Dependabot alerts, zero open code-scanning alerts;
  some alert versions were stale relative to this branch. Secret scanning API
  returned HTTP 404 with secret scanning disabled. Latest available main CodeQL
  analysis had zero results, not evidence of a candidate-branch analysis.
- Feishu/WeChat sender allowlists and early envelope rejection were inspected.
  Local state/credential/control socket modes and account path normalization
  were reviewed. No confirmed authorization or traversal defect was selected.
- Local agent and speech commands use executable/argument spawning without a
  shell. Configured executables and cloud endpoints remain trusted local
  configuration. Existing enrichment sandbox and redaction contracts remain.
- Export/daily output paths are explicit operator inputs. Provider error logging
  was considered, but no reproducible credential disclosure was established.
- CI action SHAs and token scopes were inspected. Dependabot automation does
  not check out untrusted head code in a privileged context. No actionable
  supply-chain workflow defect was established.
- No HTTP webhook/CORS transport was found. No new SSRF, command execution,
  upload, parsing, sensitive logging or credential leak was confirmed.
- Trusted local stdio and unbounded JSON transport/valid input resource use are
  remaining constraints. This fix bounds invalid-tag issue amplification; it
  does not promise constant memory for arbitrarily large valid JSON requests.

## Verification and native review

Final local results are recorded below. Round 1 baseline: verify failed at
audit (13 advisories), project-health passed 633 tests in 53 files; deterministic
8-case smoke, 59-tool MCP smoke and four backend/case dry-runs passed. Full format
check failed on four existing files: two Ghostty plan Markdown files, `knip.json`
and `pnpm-lock.yaml`. No baseline formatting cleanup is in scope.

During round 2 red testing, a mistakenly broad pnpm test invocation also ran the
whole suite concurrently with a second narrow run; two timing-sensitive instance
publication tests failed. A subsequent isolated run of that file plus the new
security regression passed all nine tests. The required full gate subsequently passed without concurrent competing test suites.

Native evaluator-style review question: does the change remove confirmed risk
without altering accepted MCP inputs or weakening security gates?
Conclusion: yes for the reproduced invalid-tag amplification; dependency
maintenance removes the reported installed vulnerable versions. Evidence:
red-to-green regression, unchanged 59-tool schema snapshot, fixed-version audit,
explicit compatibility imports and limited dependency graph changes.
Uncertainty: local stdio is still a trust boundary, compatibility v3 internals
still require guards, and remote Linux/macOS matrix results must be checked.
Next step: publish the verified commit and inspect the authorized PR and terminal CI. No merge is performed.

### Final local acceptance

- Fresh supervisor `pnpm run verify` passed under a 600-second timeout: full-history
  gitleaks (62 commits, zero findings), audit (zero vulnerabilities), ESLint,
  shellcheck, portable fixtures, typecheck, 639 tests across 54 files, coverage,
  build, all eight smoke cases, 59-tool MCP smoke, dependency-cruiser and knip.
- Coverage: statements 84.45%, branches 71.17%, functions 88.30%, lines 87.15%.
  The generated coverage badge was restored to avoid unrelated generated changes.
- The final deterministic eval suite passed all eight smoke cases, MCP stdio smoke and all four backend/case dry-runs. It runs both Claude and Codex in dry-run mode; it does
  not invoke a model provider. Remote Linux/macOS workflow results are recorded
  in the PR and supervisor summary after publication.
- Repository-wide Prettier initially reproduced four baseline failures. The
  touched lockfile is formatted with the normal commit hooks; the three untouched
  baseline files are deferred. No required workflow or threshold was weakened.
- Linux systemd validation cannot run on this macOS host because
  systemd-analyze is unavailable; the unchanged Ubuntu CI job covers that gate.
- Native worker review and supervisor diff review found no regression in accepted
  tag values, schema contracts, credentials, persistence, scheduler state or
  notifications. Only the three tag schemas validate string collections; other
  exposed records use unknown-valued entries without per-value issue generation.
- The worker stopped with a model-capacity error after local verification.
  A bounded continuation/control recovery was not consumed before its deadline.
  The active supervisor recovered the reviewed work in the same isolated
  worktree for final verification, commit and PR publication, without adding
  another security round or calling a model-provider API.
