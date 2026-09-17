import { describe, expect, it, vi } from 'vitest';
import { performLocalTranslationLookup } from '../../src/core/translation-lookup.js';

describe('performLocalTranslationLookup', () => {
  it('builds a local stage response and records a worthy learning item through one interface', () => {
    const recordLearningItem = vi.fn((item) => ({ id: 'item-1', ...item }));

    const response = performLocalTranslationLookup(
      {
        requestId: 'request-1',
        text: 'exacerbates',
        source: 'ghostty',
      },
      {
        glossary: [],
        record: true,
        recordLearningItem,
      },
    );

    expect(response).toMatchObject({
      requestId: 'request-1',
      source: 'ghostty',
      stage: 'local',
      status: 'ready',
      recorded: true,
      result: {
        original: 'exacerbates',
        translation: '使恶化；加剧',
      },
      item: {
        id: 'item-1',
        original: 'exacerbates',
        tags: expect.arrayContaining(['ghostty-lookup']),
      },
    });
    expect(recordLearningItem).toHaveBeenCalledOnce();
  });

  it('does not record unworthy local learning items', () => {
    const recordLearningItem = vi.fn();

    const response = performLocalTranslationLookup(
      {
        requestId: 'request-2',
        text: 'hello',
        source: 'cli',
      },
      {
        glossary: [],
        record: true,
        recordLearningItem,
      },
    );

    expect(response.recorded).toBe(false);
    expect(response).not.toHaveProperty('item');
    expect(recordLearningItem).not.toHaveBeenCalled();
  });
});
