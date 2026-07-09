import { describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';
import { handleMcpToolCall } from '../src/adapters/mcp-server.js';

describe('pronunciation provider', () => {
  it('returns IPA and stress hints from the CLI', () => {
    const result = runCli(['pronounce', '--text', 'threshold workflow', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      entries: [
        {
          word: 'threshold',
          ipa: '/ˈθreʃhoʊld/',
          stress: 'THRESH-hold',
        },
        {
          word: 'workflow',
          ipa: '/ˈwɝːkfloʊ/',
          stress: 'WORK-flow',
        },
      ],
    });
  });

  it('returns unknown words separately from the MCP tool', () => {
    const result = handleMcpToolCall('english_pronounce_text', {
      text: 'threshold foobarbaz',
    });

    expect(result).toMatchObject({
      entries: [
        {
          word: 'threshold',
          ipa: '/ˈθreʃhoʊld/',
          stress: 'THRESH-hold',
        },
      ],
      unknown: ['foobarbaz'],
    });
  });
});
