# Dependabot Dev Auto-Merge Design

## Goal

Route future Dependabot patch and minor updates into a `dev` integration branch and enable GitHub auto-merge only after the repository's required checks pass. Keep major updates and the `main` promotion path manual.

## Current problem

The repository has no remote `dev` branch, although Dependabot is configured to target it. The existing workflow only accepts `github.actor == 'dependabot[bot]'` and only runs when the PR already targets `dev`. PR #1 is authored by `app/dependabot`, targets `main`, and currently has failing audit checks.

## Design

Update `.github/workflows/dependabot-auto-merge.yml` to run on Dependabot pull-request lifecycle events: `opened`, `synchronize`, and `reopened`. Gate the job on the pull-request author's login, accepting both `dependabot[bot]` and `app/dependabot`. If the PR targets another branch, retarget it to `dev`. Fetch Dependabot metadata, and for patch/minor version updates rebase the PR branch on `dev` and enable squash auto-merge. Major updates remain visible but are not auto-merged.

Keep the workflow on `pull_request_target` because it needs write permission to edit and merge Dependabot PRs, and do not check out or execute PR-controlled code. Pin the metadata action to the repository's existing SHA-pinning convention.

Create `dev` from the current `main` tip and push it. Retarget PR #1 to `dev` after the workflow change is available. Do not bypass failed CI or merge PR #1 manually; the existing required checks remain the safety gate.

## Testing

Add a Vitest YAML-structure test covering accepted Dependabot identities, event types, retargeting, metadata update-type gating, branch refresh ordering, and squash auto-merge. Run the focused test, the full test suite, and the project build before remote operations.

## Error handling and safety

The workflow is intentionally a no-op for non-Dependabot pull requests and major updates. GitHub's auto-merge remains pending when required checks fail, so a failed audit cannot be silently bypassed. Retargeting and branch refresh are idempotent across `synchronize` and `reopened` events.
