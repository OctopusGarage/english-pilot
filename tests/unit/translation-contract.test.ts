import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TranslationEnrichmentStageResponse } from '../../src/core/translation-enrichment.js';
import type { TranslationStageResponse } from '../../src/core/translation-result.js';

const fixtureRoot = join(process.cwd(), 'tests/fixtures/translation-contract');

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8')) as unknown;
}

describe('translation contract fixtures', () => {
  it('keeps the local ready response shape stable', () => {
    const response = readFixture('local-ready.json') as TranslationStageResponse;

    expect(response).toMatchObject({
      requestId: 'fixture-local-ready',
      source: 'ghostty',
      stage: 'local',
      status: 'ready',
      result: {
        original: 'workflow',
        normalized: 'workflow',
        kind: 'word',
        translation: '工作流程',
      },
    });
  });

  it('keeps the agent ready response shape stable', () => {
    const response = readFixture('agent-ready.json') as TranslationEnrichmentStageResponse;

    expect(response).toMatchObject({
      requestId: 'fixture-agent-ready',
      source: 'ghostty',
      stage: 'agent',
      status: 'ready',
      result: {
        translation: '工作流程',
        explanation: 'A workflow is an ordered sequence of work.',
      },
    });
  });
});
