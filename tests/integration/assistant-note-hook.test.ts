import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { listLearningItems } from '../../src/storage/repository.js';

describe('assistant Stop hook learning notes', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-stop-hook-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('records the final English note from a Claude Stop hook payload', () => {
    const result = runCli(
      ['hook', 'claude', '--stdin'],
      JSON.stringify({
        hook_event_name: 'Stop',
        last_assistant_message: [
          'Done.',
          '',
          'English note: “check if there hava some wrong judge or seriously strict rule”',
          '-> “Check whether there are any mistaken judgments or overly strict rules, then optimize and fix them.”',
          'Why: use noun judgments, not judge; “overly strict” is the natural phrase.',
          'IPA: judgment /ˈdʒʌdʒmənt/.',
        ].join('\n'),
      }),
    );

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(listLearningItems()).toEqual([
      expect.objectContaining({
        original: 'check if there hava some wrong judge or seriously strict rule',
        suggested: 'Check whether there are any mistaken judgments or overly strict rules, then optimize and fix them.',
        pattern: 'use noun judgments, not judge; "overly strict" is the natural phrase.',
        scene: 'Claude assistant English note',
        tags: ['assistant-note', 'claude'],
        ipa: [{ word: 'judgment', ipa: '/ˈdʒʌdʒmənt/' }],
      }),
    ]);
  });

  it('ignores Stop hook payloads without a parseable English note', () => {
    const result = runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        hook_event_name: 'Stop',
        last_assistant_message: 'Done without a learning note.',
      }),
    );

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(listLearningItems()).toEqual([]);
  });
});
