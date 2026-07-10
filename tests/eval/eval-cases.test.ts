import { describe, expect, it } from 'vitest';
import { getAgentEvalCase, getAgentEvalPrompt, listEvalPromptFixtures } from '../../src/eval/agent-eval-cases.js';

describe('eval case catalog', () => {
  it('builds shared agent prompt fixtures for the channel weather case', () => {
    const prompts = listEvalPromptFixtures();

    expect(prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agent.claude_channel_weather', command: 'claude -p' }),
        expect.objectContaining({ id: 'agent.codex_channel_weather', command: 'codex exec --json -' }),
        expect.objectContaining({ id: 'agent.claude_history_lesson', command: 'claude -p' }),
        expect.objectContaining({ id: 'agent.codex_history_lesson', command: 'codex exec --json -' }),
      ]),
    );
    expect(getAgentEvalPrompt('claude', 'channel-weather')).toContain('<english_pilot_coaching>');
    expect(getAgentEvalPrompt('codex', 'channel-weather')).toContain('What is the weather like in Guangzhou?');
    expect(getAgentEvalPrompt('claude', 'history-lesson')).toContain('<english_pilot_learning_brief>');
    expect(getAgentEvalPrompt('codex', 'history-lesson')).toContain('short English speech');
  });

  it('rejects unknown eval cases at the catalog seam', () => {
    expect(() => getAgentEvalPrompt('claude', 'unknown' as never)).toThrow('Unknown agent eval case: unknown');
  });

  it('keeps channel-weather assertions behind the case interface', () => {
    const testCase = getAgentEvalCase('channel-weather');
    const assertions = testCase.replyAssertions(
      {
        operation: 'external-agent-run',
        backend: 'claude',
        command: 'claude',
        args: ['-p'],
        cwd: '.',
        promptStdin: testCase.buildPrompt('claude'),
        dryRun: false,
        exitCode: 0,
        stdout: '',
        stderr: '',
      },
      [
        'English note: "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
        'Why: Use "What is the weather like in + place?" for local weather.',
        'IPA: weather /ˈweðər/',
      ].join('\n'),
    );

    expect(assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'contains_better_weather_phrase', passed: true }),
        expect.objectContaining({ id: 'contains_why', passed: true }),
        expect.objectContaining({ id: 'contains_ipa', passed: true }),
      ]),
    );
  });

  it('keeps history-lesson assertions behind the case interface', () => {
    const testCase = getAgentEvalCase('history-lesson');
    const assertions = testCase.replyAssertions(
      {
        operation: 'external-agent-run',
        backend: 'codex',
        command: 'codex',
        args: ['exec', '--json', '-'],
        cwd: '.',
        promptStdin: testCase.buildPrompt('codex'),
        dryRun: false,
        exitCode: 0,
        stdout: '',
        stderr: '',
      },
      [
        'Patterns: ask weather with "What is the weather like in Guangzhou?" and say "create a new project."',
        'Corrected expressions: Review all the docs, simplify them, and keep them clear.',
        'IPA: weather /ˈweðər/, simplify /ˈsɪmplɪfaɪ/.',
        'Practice speech: Today, I will create a new project and keep my writing clear.',
      ].join('\n'),
    );

    expect(assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'contains_history_weather_correction', passed: true }),
        expect.objectContaining({ id: 'contains_new_project_correction', passed: true }),
        expect.objectContaining({ id: 'contains_teaching_structure', passed: true }),
        expect.objectContaining({ id: 'contains_ipa', passed: true }),
        expect.objectContaining({ id: 'contains_practice_speech', passed: true }),
      ]),
    );
  });
});
