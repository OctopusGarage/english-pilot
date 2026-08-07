import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('check-portable-fixtures', () => {
  it('ignores a Git worktree pointer file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'english-pilot-portable-fixtures-'));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, '.git'),
      `gitdir: /${['Users', 'kingsonwu'].join('/')}/example/.git/worktrees/repository-review\n`,
    );

    const result = spawnSync('sh', [resolve('scripts/check-portable-fixtures.sh')], {
      cwd: directory,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
  });
});
