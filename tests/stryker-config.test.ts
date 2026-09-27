import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface StrykerConfig {
  cleanTempDir?: boolean | 'always';
  plugins?: string[];
  vitest?: {
    configFile?: string;
  };
}

describe('Stryker configuration', () => {
  it('loads the Vitest runner explicitly under pnpm', () => {
    const config = readJson<StrykerConfig>('stryker.conf.json');

    expect(config.plugins).toContain('@stryker-mutator/vitest-runner');
  });

  it('uses a Vitest config that excludes thread-incompatible CLI tests', () => {
    const config = readJson<StrykerConfig>('stryker.conf.json');
    const configFile = config.vitest?.configFile;

    expect(configFile).toBe('vitest.stryker.config.mjs');
    expect(existsSync(configFile!)).toBe(true);

    const vitestConfig = readFileSync(configFile!, 'utf8');
    expect(vitestConfig).toContain("exclude: ['tests/integration/cli.test.ts']");
  });

  it('cleans generated sandboxes after failed mutation runs', () => {
    const config = readJson<StrykerConfig>('stryker.conf.json');

    expect(config.cleanTempDir).toBe('always');
  });
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
