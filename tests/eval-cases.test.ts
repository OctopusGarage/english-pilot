import { describe, expect, it } from 'vitest';
import { getAgentEvalPrompt, listEvalPromptFixtures } from '../src/eval/cases.js';

describe('eval case catalog', () => {
  it('builds shared agent prompt fixtures for the channel weather case', () => {
    const prompts = listEvalPromptFixtures();

    expect(prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agent.claude_channel_weather', command: 'claude -p' }),
        expect.objectContaining({ id: 'agent.codex_channel_weather', command: 'codex exec --json -' }),
      ]),
    );
    expect(getAgentEvalPrompt('claude', 'channel-weather')).toContain('<english_pilot_coaching>');
    expect(getAgentEvalPrompt('codex', 'channel-weather')).toContain('What is the weather like in Guangzhou?');
  });

  it('rejects unknown eval cases at the catalog seam', () => {
    expect(() => getAgentEvalPrompt('claude', 'unknown' as never)).toThrow('Unknown agent eval case: unknown');
  });
});
