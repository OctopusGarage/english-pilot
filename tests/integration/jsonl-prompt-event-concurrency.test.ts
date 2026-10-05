import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync), appendFileSync: vi.fn(fs.appendFileSync) };
});

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
const previousHome = process.env.ENGLISH_PILOT_HOME;
const home = fs.mkdtempSync(join(tmpdir(), 'ep-jsonl-concurrency-'));

afterEach(() => {
  if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
  else process.env.ENGLISH_PILOT_HOME = previousHome;
  fs.rmSync(home, { recursive: true, force: true });
});

it('keeps a prompt event written by another process immediately before its own write', () => {
  process.env.ENGLISH_PILOT_HOME = home;
  fs.writeFileSync(join(home, 'config.json'), JSON.stringify({ storage: 'jsonl' }));
  const eventPath = join(home, 'prompt-events.jsonl');
  const competingEvent = {
    id: 'competing',
    createdAt: new Date().toISOString(),
    source: 'cli',
    text: 'Another process checked this prompt.',
    decision: 'ALLOW',
    nonEnglishRatio: 0,
    englishCount: 6,
    nonEnglishCount: 0,
    reason: 'English prompt',
  };
  let injected = false;
  const injectBeforeWrite = (path: fs.PathOrFileDescriptor) => {
    if (path !== eventPath || injected) return;
    injected = true;
    actualFs.appendFileSync(eventPath, `${JSON.stringify(competingEvent)}\n`);
  };
  vi.mocked(fs.writeFileSync).mockImplementation((path, data, options) => {
    injectBeforeWrite(path);
    return actualFs.writeFileSync(path, data, options);
  });
  vi.mocked(fs.appendFileSync).mockImplementation((path, data, options) => {
    injectBeforeWrite(path);
    return actualFs.appendFileSync(path, data, options);
  });

  const check = runCli(['check', '--text', 'This is a clear English sentence.', '--json']);
  const events = fs
    .readFileSync(eventPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { id: string; text: string });

  expect(check.exitCode).toBe(0);
  expect(injected).toBe(true);
  expect(events.map(({ text }) => text)).toEqual([
    'Another process checked this prompt.',
    'This is a clear English sentence.',
  ]);
});
