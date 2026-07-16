# Deploy mac2015 Design

## Goal

Add a project-local deployment workflow that installs the current EnglishPilot checkout on `ys-aquria@mac2015.local` and leaves a verified daemon running under the `ys-aquria` account.

## Deployment Source

The local checkout is authoritative. The deploy command builds the project and creates an npm tarball with `npm pack`, so committed and uncommitted package content is deployed using the same artifact layout as a registry release. The tarball is copied to a temporary remote path and installed globally with the remote user's npm.

The workflow does not require a Git checkout, Git credentials, pnpm, or TypeScript tooling on mac2015.

## Interface

Create `scripts/deploy-mac2015.sh` with two modes:

- `status` is the default and performs read-only remote inspection.
- `deploy` builds and packages locally, transfers the tarball, installs it remotely, restarts the runtime, and verifies it.

Environment overrides provide `ENGLISH_PILOT_REMOTE`, `SSH_OPTS`, and remote temporary-directory customization without requiring script edits. The default remote is `ys-aquria@mac2015.local`.

Create `.claude/commands/deploy-mac2015.md` as the agent-facing command contract. It documents the modes, invocation, expected report, fallback lifecycle warning, and secret-handling constraints.

## Remote Runtime Lifecycle

The deployment preserves all user-scoped state under `~/.english-pilot`, including channel credentials, logs, learning history, and voice tooling.

The remote script discovers Node and npm from the login path, NVM, FNM, Homebrew, or `/usr/local`. It records the installed version and live daemon PID before installation. After global installation it stops a live EnglishPilot daemon identified by the runtime lock only when the PID belongs to an EnglishPilot process.

When the user's GUI launchd domain and `com.octopusgarage.english-pilot` service are available, the workflow restarts that managed service. Otherwise it starts `english-pilot run` as a detached process, writes to `~/.english-pilot/logs/manual-daemon.log`, and reports that detached mode has no reboot or crash auto-restart guarantee.

The fallback loads `~/.english-pilot/.env` without printing it. It never outputs channel configuration or credential values.

## Verification and Reporting

Both modes report the remote hostname and user, installed package version, daemon PID, runtime status, launchd availability, WeChat doctor summary, and local-whisper voice preflight. Deploy additionally reports the local package version, generated artifact, before/after installed versions, stopped PID, selected lifecycle mode, and verified new PID.

Deployment fails if the npm build or pack fails, SSH/SCP fails, global installation fails, a managed service restart fails, or no live daemon PID appears before the verification deadline. Optional channel and voice diagnostics are reported but do not fail deployment because channel credentials and local voice dependencies may be intentionally absent.

Temporary local and remote artifacts are removed with shell traps.

## Testing

Extend `tests/eval/project-agent-commands.test.ts` first to require the new Claude command, executable deploy script, default remote, `status`/`deploy` modes, local `npm pack`, remote install, detached fallback, lifecycle warning, and verification fields. Run the focused test to observe the expected failure before creating implementation files.

After implementation, run the focused command-contract test, shellcheck, build, and deterministic smoke suites. Finally run `status`, then `deploy`, then a fresh `status` against mac2015 and independently confirm that the verified PID is live and belongs to EnglishPilot.

## Non-goals

- Publishing a new npm registry version.
- Creating or maintaining a remote source checkout.
- Changing channel credentials, `.env`, learning history, or voice models.
- Making detached mode equivalent to launchd-managed lifecycle behavior.
