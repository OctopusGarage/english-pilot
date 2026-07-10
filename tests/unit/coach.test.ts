import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { suggestRewrite } from '../../src/core/coach.js';

describe('suggestRewrite', () => {
  let previousBackend: string | undefined;
  let previousPython: string | undefined;
  let previousTimeout: string | undefined;
  let home: string;

  beforeEach(() => {
    previousBackend = process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    previousPython = process.env.ARGOS_TRANSLATE_PYTHON;
    previousTimeout = process.env.ENGLISH_PILOT_REWRITE_TIMEOUT_MS;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-coach-'));
  });

  afterEach(() => {
    restoreEnv('ENGLISH_PILOT_REWRITE_BACKEND', previousBackend);
    restoreEnv('ARGOS_TRANSLATE_PYTHON', previousPython);
    restoreEnv('ENGLISH_PILOT_REWRITE_TIMEOUT_MS', previousTimeout);
    rmSync(home, { recursive: true, force: true });
  });

  it('rewrites inaccessible URL prompts into a copyable English sentence', () => {
    expect(suggestRewrite('访问不了：  http://localhost:60806')).toBe('I cannot access http://localhost:60806.');
  });

  it('uses a configured local Argos-compatible translator before the generic fallback', () => {
    const fakePython = join(home, 'fake-python');
    writeFileSync(fakePython, '#!/bin/sh\ncat >/dev/null\nprintf "I cannot open the local page"\n', 'utf8');
    chmodSync(fakePython, 0o755);
    process.env.ENGLISH_PILOT_REWRITE_BACKEND = 'argos';
    process.env.ARGOS_TRANSLATE_PYTHON = fakePython;

    expect(suggestRewrite('这个页面加载不出来')).toBe('I cannot open the local page.');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
