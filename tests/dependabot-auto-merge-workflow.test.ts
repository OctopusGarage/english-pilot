import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(__dirname, '..');

type PackageManifest = {
  devDependencies: Record<string, string>;
};

type PnpmLock = {
  snapshots: Record<string, unknown>;
};

type Workflow = {
  permissions: Record<string, string>;
  on: {
    pull_request_target: {
      types: string[];
    };
  };
  jobs: {
    'auto-merge': {
      if?: string;
      'timeout-minutes'?: number;
      steps: Array<{
        name?: string;
        if?: string;
        run?: string;
        uses?: string;
        with?: Record<string, unknown>;
      }>;
    };
  };
};

const readWorkflow = (): Workflow =>
  parse(readFileSync(join(root, '.github/workflows/dependabot-auto-merge.yml'), 'utf8')) as Workflow;

describe('Dependabot auto-merge workflow', () => {
  it('declares the YAML parser used by workflow tests', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageManifest;

    expect(manifest.devDependencies.yaml).toBe('^2.9.0');
  });

  it('locks the MCP SDK at the audited safe release', () => {
    const lockfile = parse(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')) as PnpmLock;

    expect(Object.keys(lockfile.snapshots).some((key) => key.startsWith('@modelcontextprotocol/sdk@1.31.0'))).toBe(
      true,
    );
  });

  it('handles Dependabot pull-request lifecycle events and identities', () => {
    const workflow = readWorkflow();
    const job = workflow.jobs['auto-merge'];

    expect(workflow.on.pull_request_target.types).toEqual(['opened', 'synchronize', 'reopened']);
    expect(job.if).toContain("github.event.pull_request.user.login == 'dependabot[bot]'");
    expect(job.if).toContain("github.event.pull_request.user.login == 'app/dependabot'");
  });

  it('retargets to dev and gates refresh and merge on patch or minor updates', () => {
    const workflow = readWorkflow();
    const steps = workflow.jobs['auto-merge'].steps;
    const stepNames = steps.map((step) => step.name);
    const refresh = steps.find((step) => step.name === 'Refresh Dependabot branch from dev');
    const merge = steps.find((step) => step.name === 'Merge Dependabot PR after CI');

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Retarget Dependabot PR to dev',
          if: "github.event.pull_request.base.ref != 'dev'",
          run: expect.stringContaining('gh pr edit "$PR_URL" --base dev'),
        }),
        expect.objectContaining({
          name: 'Fetch Dependabot metadata',
          with: expect.objectContaining({
            'skip-commit-verification': 'true',
            'skip-verification': 'true',
          }),
        }),
      ]),
    );
    expect(refresh?.if).toContain('version-update:semver-patch');
    expect(refresh?.if).toContain('version-update:semver-minor');
    expect(merge?.if).toContain('version-update:semver-patch');
    expect(merge?.if).toContain('version-update:semver-minor');
    expect(stepNames.indexOf('Refresh Dependabot branch from dev')).toBeLessThan(
      stepNames.indexOf('Merge Dependabot PR after CI'),
    );
    expect(merge?.run).toContain('gh pr merge --squash --match-head-commit "$head_sha" "$PR_URL"');
  });

  it('waits for successful pull-request CI on the current head before merging', () => {
    const workflow = readWorkflow();
    const merge = workflow.jobs['auto-merge'].steps.find((step) => step.name === 'Merge Dependabot PR after CI');
    const script = merge?.run ?? '';

    expect(workflow.permissions.actions).toBe('read');
    expect(workflow.jobs['auto-merge']['timeout-minutes']).toBeGreaterThan(0);
    expect(script).toContain('--workflow ci.yml --event pull_request');
    expect(script).toContain('--commit "$head_sha"');
    expect(script).toContain('--branch "$head_branch"');
    expect(script).toContain('baseRefOid');
    expect(script).toContain('gh run view "$run_id"');
    expect(script).toContain('verify');
    expect(script).toContain('action_required');
    expect(script).toContain('gh pr merge --squash --match-head-commit "$head_sha" "$PR_URL"');
    expect(script.indexOf('gh run view "$run_id"')).toBeLessThan(script.indexOf('gh pr merge --squash'));
  });

  it.each(['success', 'missing', 'failure', 'action_required', 'jobs_failed', 'head_changed', 'base_changed'])(
    'merges only after a successful CI run and unchanged head and base (%s)',
    (scenario) => {
      const script = readWorkflow().jobs['auto-merge'].steps.find(
        (step) => step.name === 'Merge Dependabot PR after CI',
      )?.run;
      expect(script).toBeDefined();
      const temp = mkdtempSync(join(tmpdir(), 'dependabot-ci-'));
      const mergeLog = join(temp, 'merge.log');
      const countFile = join(temp, 'pr-views');
      const gh = join(temp, 'gh');
      const sleep = join(temp, 'sleep');
      try {
        writeFileSync(
          gh,
          `#!/bin/bash
case "$1 $2" in
  'pr view')
    count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
    count=$((count + 1))
    echo "$count" > "$COUNT_FILE"
    head=headsha
    base=baseoid
    if [[ "$SCENARIO" == head_changed && "$count" -ge 3 ]]; then head=changed; fi
    if [[ "$SCENARIO" == base_changed && "$count" -ge 2 ]]; then base=newbaseoid; fi
    if [[ "$*" == *baseRefOid* ]]; then
      printf '%s\\tdependabot/branch\\tdev\\t%s\\tOPEN\\n' "$head" "$base"
    else
      printf '%s\\tdependabot/branch\\tdev\\tOPEN\\n' "$head"
    fi ;;
  'run list')
    case "$SCENARIO" in
      missing) ;;
      failure) printf '123\\tcompleted\\tfailure\\n' ;;
      action_required) printf '123\\tcompleted\\taction_required\\n' ;;
      *) printf '123\\tcompleted\\tsuccess\\n' ;;
    esac ;;
  'run view')
    if [[ "$SCENARIO" == jobs_failed ]]; then echo false; else echo true; fi ;;
  'pr merge') printf '%s\\n' "$*" >> "$MERGE_LOG" ;;
  *) exit 2 ;;
esac
`,
        );
        writeFileSync(sleep, '#!/bin/sh\nexit 97\n');
        chmodSync(gh, 0o755);
        chmodSync(sleep, 0o755);
        const result = spawnSync('bash', ['-c', script ?? ''], {
          env: {
            ...process.env,
            PATH: `${temp}:${process.env.PATH ?? ''}`,
            SCENARIO: scenario,
            COUNT_FILE: countFile,
            MERGE_LOG: mergeLog,
            PR_URL: 'https://github.com/OctopusGarage/english-pilot/pull/55',
            GITHUB_REPOSITORY: 'OctopusGarage/english-pilot',
          },
          encoding: 'utf8',
          timeout: 3000,
        });
        const merged = readFileSync(mergeLog, { encoding: 'utf8', flag: 'a+' });
        if (scenario === 'success') {
          expect(result.status, result.stderr).toBe(0);
          expect(merged).toContain('--match-head-commit headsha');
        } else {
          expect(result.status).not.toBe(0);
          expect(merged).toBe('');
        }
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    },
  );
});
