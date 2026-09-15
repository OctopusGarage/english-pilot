import { describe, expect, it } from 'vitest';
import { buildAssistantEnglishNoteFormatGuidance } from '../../src/core/assistant-note-format.js';

describe('buildAssistantEnglishNoteFormatGuidance', () => {
  it('builds compact guidance', () => {
    const guidance = buildAssistantEnglishNoteFormatGuidance('compact');

    expect(guidance).toContain('English note: "original phrase" -> "more natural English"');
    expect(guidance).toContain('1-3 short lines');
    expect(guidance).not.toContain('Useful patterns:');
  });

  it('builds rich guidance', () => {
    const guidance = buildAssistantEnglishNoteFormatGuidance('rich');

    expect(guidance).toContain('Rich English Note');
    expect(guidance).toContain('English note:\nOriginal:');
    expect(guidance).toContain('Original: "fix this problem"');
    expect(guidance).toContain('Better: "fix this issue" / "resolve this startup issue"');
    expect(guidance).toContain('Useful patterns:');
    expect(guidance).toContain('Collocations: startup issue');
    expect(guidance).toContain('Common mistake:');
  });

  it('builds lesson guidance', () => {
    const guidance = buildAssistantEnglishNoteFormatGuidance('lesson');

    expect(guidance).toContain('Mini lesson');
    expect(guidance).toContain('English note:\nOriginal:');
    expect(guidance).toContain('Original:');
    expect(guidance).toContain('Practice sentence:');
  });
});
