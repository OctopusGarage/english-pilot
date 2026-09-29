import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';

describe('runtime state permissions', () => {
  let previousHome: string | undefined;
  let previousUmask: number;
  let directory: string;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    previousUmask = process.umask(0o022);
    directory = mkdtempSync(join(tmpdir(), 'english-pilot-permissions-'));
    home = join(directory, 'state');
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    process.umask(previousUmask);
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates a private home and config file through config set', () => {
    expect(runCli(['config', 'set', 'maxChineseRatio', '0.25']).exitCode).toBe(0);

    expect(mode(home)).toBe(0o700);
    expect(mode(join(home, 'config.json'))).toBe(0o600);
  });

  it('tightens an existing home and config file on update', () => {
    mkdirSync(home, { mode: 0o755 });
    writeFileSync(join(home, 'config.json'), '{}\n', { mode: 0o644 });
    chmodSync(home, 0o755);

    expect(runCli(['config', 'set', 'maxChineseRatio', '0.25']).exitCode).toBe(0);

    expect(mode(home)).toBe(0o700);
    expect(mode(join(home, 'config.json'))).toBe(0o600);
  });

  it('creates private JSONL prompt storage and tightens an existing file', () => {
    expect(runCli(['config', 'set', 'storage', 'jsonl']).exitCode).toBe(0);
    expect(runCli(['check', '--text', 'A private prompt.']).exitCode).toBe(0);
    const path = join(home, 'prompt-events.jsonl');
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(['check', '--text', 'Another private prompt.']).exitCode).toBe(0);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it('creates private SQLite storage and tightens an existing database', () => {
    expect(runCli(['check', '--text', 'A private prompt.']).exitCode).toBe(0);
    const path = join(home, 'english-pilot.sqlite');
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(['check', '--text', 'Another private prompt.']).exitCode).toBe(0);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });
});

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}
