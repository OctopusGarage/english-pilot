import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(__dirname, '..');

type PackageManifest = {
  devDependencies: Record<string, string>;
};

type PackageLock = {
  packages: Record<string, { version?: string }>;
};

type Workflow = {
  on: {
    pull_request_target: {
      types: string[];
    };
  };
  jobs: {
    'auto-merge': {
      if?: string;
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
    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.devDependencies.yaml).toBe('^2.9.0');
  });

  it('locks the MCP SDK at the audited safe release', () => {
    const lockfile = JSON.parse(
      readFileSync(join(root, 'package-lock.json'), 'utf8'),
    ) as PackageLock;

    expect(lockfile.packages['node_modules/@modelcontextprotocol/sdk']?.version).toBe('1.30.0');
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
    const merge = steps.find((step) => step.name === 'Enable auto-merge into dev');

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
      stepNames.indexOf('Enable auto-merge into dev'),
    );
    expect(merge?.run).toContain('gh pr merge --auto --squash "$PR_URL"');
  });
});
