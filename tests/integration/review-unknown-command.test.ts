import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';

it('fails an unknown review subcommand instead of reporting the review queue', () => {
  const previousHome = process.env.ENGLISH_PILOT_HOME;
  const home = mkdtempSync(join(tmpdir(), 'ep-review-command-'));
  process.env.ENGLISH_PILOT_HOME = home;
  try {
    writeFileSync(join(home, 'config.json'), JSON.stringify({ storage: 'jsonl' }));

    const result = runCli(['review', 'makr']);

    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: 'Unknown review command: makr\n' });
  } finally {
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});
