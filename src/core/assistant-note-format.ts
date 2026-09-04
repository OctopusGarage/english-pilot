import type { EnglishPilotConfig } from './types.js';

export type AssistantEnglishNoteDepth = EnglishPilotConfig['assistantEnglishNoteDepth'];

export function buildAssistantEnglishNoteFormatGuidance(depth: AssistantEnglishNoteDepth): string {
  if (depth === 'compact') {
    return [
      'Use the compact English note format in 1-3 short lines:',
      'English note: "original phrase" -> "more natural English"; Why: one practical rule; IPA: key word /IPA/ when useful.',
    ].join(' ');
  }

  if (depth === 'lesson') {
    return [
      'Use a Mini lesson English note when the user clearly wants richer study material.',
      'Keep the main answer first, then write a focused study block:',
      'English note:',
      'Original: "user phrase"',
      'Better: "professional engineering sentence"',
      'Why: explain the practical workplace-English rule.',
      'Useful patterns: include 3 reusable software-engineering sentences.',
      'Collocations: include 5-8 natural word pairs from debugging, implementation, review, or architecture contexts.',
      'Common mistake: contrast the user phrase with the professional version.',
      'Practice sentence: give one copyable sentence the user can reuse.',
      'IPA: include 1-2 useful words when pronunciation helps.',
    ].join(' ');
  }

  return [
    'Use a Rich English Note by default: 5-8 useful lines, compact enough for a final response but rich enough for study.',
    'Use this shape:',
    'English note:',
    'Original: "fix this problem"',
    'Better: "fix this issue" / "resolve this startup issue"',
    'Why: In engineering conversations, "issue" is more precise than "problem" when discussing bugs, failures, tickets, or startup errors.',
    'Useful patterns:',
    '- "The MCP client failed during the startup handshake."',
    '- "This issue belongs at the config boundary, not the runtime path."',
    'Collocations: startup issue, handshake failure, config mismatch, reproduce the issue, verify the fix',
    'Common mistake: Use "problem" for general trouble; use "issue" for bugs, tickets, incidents, and engineering discussions.',
    'IPA: issue /ˈɪʃuː/ or /ˈɪsjuː/',
  ].join(' ');
}
