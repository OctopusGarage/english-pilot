import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
