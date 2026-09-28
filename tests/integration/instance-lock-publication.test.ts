import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it.each(['write', 'publish', 'published'])(
  'keeps exactly one production daemon owner across the %s boundary',
  async (boundary) => {
    const home = mkdtempSync(join(tmpdir(), 'ep-publish-'));
    const release = join(home, 'release');
    const children: ChildProcess[] = [];
    const start = (kind: string) => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !/^(GIT_|FEISHU_|LARK_|WECHAT_|ENGLISH_PILOT_)/.test(key)),
      );
      const child = fork(new URL('../fixtures/lock-daemon-worker.mjs', import.meta.url), [kind, home, release], {
        env: { ...env, ENGLISH_PILOT_HOME: home, ENGLISH_PILOT_TRANSLATE_AGENT: 'off' },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      children.push(child);
      let errors = '';
      child.stderr!.on('data', (data) => {
        errors += String(data);
      });
      const events: Array<{ event: string; name?: string }> = [];
      child.on('message', (message) => events.push(message as (typeof events)[number]));
      return { child, events, errors: () => errors };
    };
    const wait = async (worker: ReturnType<typeof start>, names: string[]) => {
      const deadline = Date.now() + 6000;
      while (!worker.events.some((event) => names.includes(event.event))) {
        if (worker.child.exitCode !== null || worker.child.signalCode !== null) throw new Error(worker.errors());
        if (Date.now() > deadline) throw new Error(`Missing ${names.join('/')} boundary: ${worker.errors()}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    try {
      const owner = start(boundary);
      await wait(owner, ['boundary']); // Mandatory: a missing hook never counts as passing.
      const contender = start('contender');
      await wait(contender, ['ready', 'rejected']);
      const published = boundary === 'published';
      expect(contender.events.some((event) => event.event === 'ready')).toBe(!published);
      if (published)
        expect(contender.events).toContainEqual(
          expect.objectContaining({ event: 'rejected', name: 'InstanceLockHeldError' }),
        );
      const lock = join(home, 'run', '.instance.lock');
      const before = readFileSync(lock, 'utf8');
      writeFileSync(release, 'resume');
      await wait(owner, ['ready', 'rejected']);
      if (!published)
        expect(owner.events).toContainEqual(
          expect.objectContaining({ event: 'rejected', name: 'InstanceLockHeldError' }),
        );
      expect(owner.events.some((event) => event.event === 'ready')).toBe(published);
      expect(readFileSync(lock, 'utf8')).toBe(before);
      const status = await import('../../src/adapters/control/client.js');
      const winner = published ? owner : contender;
      expect((await status.createControlClient(join(home, 'run', 'english-pilot.sock')).status()).pid).toBe(
        winner.child.pid,
      );
      winner.child.kill('SIGTERM');
      await wait(winner, ['closed']);
      expect(existsSync(lock)).toBe(false);
      expect(existsSync(join(home, 'run', '.running'))).toBe(false);
      expect(existsSync(join(home, 'run', 'english-pilot.sock'))).toBe(false);
    } finally {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
      await Promise.all(
        children.map((child) =>
          child.exitCode !== null || child.signalCode !== null ? undefined : once(child, 'exit'),
        ),
      );
      rmSync(home, { recursive: true, force: true });
    }
  },
  20_000,
);
