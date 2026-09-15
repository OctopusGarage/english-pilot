import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAssistantNoteDomainGuidance, loadAssistantNoteDomainReference } from '../../src/core/domain-reference.js';

describe('assistant note domain reference', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'english-pilot-domain-reference-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('extracts compact technology terms from reference files', () => {
    const termsPath = join(dir, 'terms.txt');
    const systemsPath = join(dir, 'systems.md');
    writeFileSync(
      termsPath,
      ['architecture: 架构; /ˈɑːrkɪtektʃər/; 名词', 'cache: 缓存; /kæʃ/; 名词', 'module: 模块; /ˈmɑːdʒuːl/; 名词'].join(
        '\n',
      ),
      'utf8',
    );
    writeFileSync(
      systemsPath,
      ['+ deterministic adj. 确定性的', '+ failure path 故障路径', '+ module boundary 模块边界'].join('\n'),
      'utf8',
    );

    const reference = loadAssistantNoteDomainReference({
      style: 'software-engineering',
      paths: [termsPath, systemsPath],
    });

    expect(reference).toMatchObject({
      style: 'software-engineering',
      available: true,
      terms: ['architecture', 'cache', 'module', 'deterministic', 'failure path', 'module boundary'],
      missingPaths: [],
    });
  });

  it('continues with built-in examples when files are missing', () => {
    const reference = loadAssistantNoteDomainReference({
      style: 'software-engineering',
      paths: [join(dir, 'missing.txt')],
    });

    expect(reference.available).toBe(false);
    expect(reference.terms).toEqual([]);
    expect(reference.missingPaths).toEqual([join(dir, 'missing.txt')]);
    expect(buildAssistantNoteDomainGuidance(reference)).toContain('make the failure path explicit');
  });

  it('records missing paths after the term cap is reached', () => {
    const fullPath = join(dir, 'full.txt');
    const missingPath = join(dir, 'missing-after-full.txt');
    writeFileSync(fullPath, Array.from({ length: 16 }, (_, index) => `term${index + 1}: example`).join('\n'), 'utf8');

    const reference = loadAssistantNoteDomainReference({
      style: 'software-engineering',
      paths: [fullPath, missingPath],
    });

    expect(reference.terms).toHaveLength(12);
    expect(reference.missingPaths).toEqual([missingPath]);
  });

  it('does not read later available files after the term cap is reached', async () => {
    const fullPath = join(dir, 'full.txt');
    const latePath = join(dir, 'late.txt');
    const readPaths: string[] = [];

    vi.resetModules();
    vi.doMock('node:fs', () => ({
      accessSync: () => undefined,
      constants: {
        R_OK: 4,
      },
      readFileSync: (path: string) => {
        readPaths.push(path);
        if (path === latePath) throw new Error('late file should not be read');
        return Array.from({ length: 16 }, (_, index) => `term${index + 1}: example`).join('\n');
      },
      statSync: () => ({
        isFile: () => true,
      }),
    }));

    try {
      const { loadAssistantNoteDomainReference: loadWithMockedFs } = await import('../../src/core/domain-reference.js');

      const reference = loadWithMockedFs({
        style: 'software-engineering',
        paths: [fullPath, latePath],
      });

      expect(reference.terms).toHaveLength(12);
      expect(reference.missingPaths).toEqual([]);
      expect(readPaths).toEqual([fullPath]);
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('records unreadable regular files after the term cap without reading their contents', async () => {
    const fullPath = join(dir, 'full.txt');
    const unreadablePath = join(dir, 'unreadable-after-full.txt');
    const readPaths: string[] = [];

    vi.resetModules();
    vi.doMock('node:fs', () => ({
      accessSync: (path: string) => {
        if (path === unreadablePath) throw new Error('permission denied');
      },
      constants: {
        R_OK: 4,
      },
      readFileSync: (path: string) => {
        readPaths.push(path);
        if (path === unreadablePath) throw new Error('unreadable file should not be read');
        return Array.from({ length: 16 }, (_, index) => `term${index + 1}: example`).join('\n');
      },
      statSync: () => ({
        isFile: () => true,
      }),
    }));

    try {
      const { loadAssistantNoteDomainReference: loadWithMockedFs } = await import('../../src/core/domain-reference.js');

      const reference = loadWithMockedFs({
        style: 'software-engineering',
        paths: [fullPath, unreadablePath],
      });

      expect(reference.terms).toHaveLength(12);
      expect(reference.missingPaths).toEqual([unreadablePath]);
      expect(readPaths).toEqual([fullPath]);
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('records directory paths as missing reference inputs without throwing', () => {
    const filePath = join(dir, 'terms.txt');
    const directoryPath = join(dir, 'reference-dir');
    writeFileSync(filePath, 'cache: 缓存', 'utf8');
    mkdirSync(directoryPath);

    const reference = loadAssistantNoteDomainReference({
      style: 'software-engineering',
      paths: [filePath, directoryPath],
    });

    expect(reference.terms).toEqual(['cache']);
    expect(reference.missingPaths).toEqual([directoryPath]);
  });

  it('returns neutral guidance for general style', () => {
    const reference = loadAssistantNoteDomainReference({
      style: 'general',
      paths: [],
    });

    expect(reference.available).toBe(false);
    expect(buildAssistantNoteDomainGuidance(reference)).toContain('Prefer practical workplace English');
    expect(buildAssistantNoteDomainGuidance(reference)).not.toContain('module boundary');
  });
});
