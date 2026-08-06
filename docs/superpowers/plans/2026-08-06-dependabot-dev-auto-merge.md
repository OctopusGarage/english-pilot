# Dependabot Dev Auto-Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Dependabot patch/minor updates into `dev` and enable squash auto-merge only after required checks pass.

**Architecture:** A `pull_request_target` workflow authenticates only Dependabot-authored PRs, retargets them to `dev`, refreshes the branch, and enables GitHub auto-merge for patch/minor updates. YAML structure tests protect the event, identity, version-gating, and command ordering contract.

**Tech Stack:** GitHub Actions YAML, Dependabot, GitHub CLI, TypeScript, Vitest.

---

### Task 1: Add workflow contract tests

**Files:**

- Create: `tests/dependabot-auto-merge-workflow.test.ts`

- [ ] **Step 1: Write the test**

Assert that the workflow listens to `opened`, `synchronize`, and `reopened`; accepts both Dependabot logins; retargets non-`dev` PRs; fetches metadata; gates refresh and merge on `version-update:semver-patch` or `version-update:semver-minor`; and runs `gh pr update-branch` before `gh pr merge --auto --squash`.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --run tests/dependabot-auto-merge-workflow.test.ts`

Expected: FAIL because the current workflow does not expose the new event, identity, retarget, and version-gating contract.

### Task 2: Implement the Dependabot workflow and configuration

**Files:**

- Modify: `.github/workflows/dependabot-auto-merge.yml`
- Modify: `.github/dependabot.yml`

- [ ] **Step 1: Update the workflow**

Use `pull_request_target` lifecycle events, gate on `github.event.pull_request.user.login`, retarget to `dev`, fetch metadata with verification skips required for Dependabot app PRs, refresh patch/minor branches from `dev`, then enable squash auto-merge.

- [ ] **Step 2: Restrict Dependabot configuration to patch/minor auto-merge**

Ignore semver-major updates for npm and GitHub Actions while preserving weekly grouped patch/minor updates targeting `dev`.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- --run tests/dependabot-auto-merge-workflow.test.ts`

Expected: PASS.

### Task 3: Run repository verification

**Files:**

- No additional files.

- [ ] **Step 1: Build and run the full test suite**

Run: `npm run build && npm test`

Expected: exit code 0 with no failed tests.

- [ ] **Step 2: Run the repository smoke checks**

Run: `npm run smoke:json && npm run smoke:mcp-stdio`

Expected: the JSON report has `passed: true`, and MCP stdio smoke exits successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the intended design, plan, workflow, configuration, and test files are changed.

### Task 4: Publish the integration branch and retarget PR #1

**Files:**

- Remote branch: `dev`
- Remote pull request: `OctopusGarage/english-pilot#1`

- [ ] **Step 1: Create and push `dev` from the verified `main` tip**

Run: `git branch dev main && git push origin dev`

Expected: remote `origin/dev` points at the verified current `main` commit.

- [ ] **Step 2: Retarget PR #1**

Run: `gh pr edit 1 --repo OctopusGarage/english-pilot --base dev`

Expected: PR #1 base branch becomes `dev`; GitHub reruns required checks.

- [ ] **Step 3: Inspect the resulting PR state**

Run: `gh pr view 1 --repo OctopusGarage/english-pilot --json baseRefName,headRefName,mergeStateStatus,statusCheckRollup`

Expected: base is `dev`; auto-merge is not claimed until required checks pass.
