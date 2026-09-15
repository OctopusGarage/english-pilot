# Rich English Note Design

## Summary

EnglishPilot should make final-response English coaching more useful for study. The current tail note is clear but too small: it usually corrects one phrase and gives one reason. The new default should be a **Rich English Note**: still appended after the main answer, but with enough examples, collocations, and contrastive guidance to be reusable in programming conversations.

## Goals

- Keep the main coding answer first.
- Make the English note richer by default without turning it into a long lesson.
- Bias examples toward software-engineering communication.
- Preserve the existing compact note behavior as a configurable option.
- Allow a deeper lesson style for explicit study-heavy use.
- Keep Stop-hook review recording compatible with old and new note formats.

## Non-Goals

- Do not generate the note inside the hook process itself.
- Do not require a hosted LLM or network call.
- Do not make every assistant response long.
- Do not change the PromptSubmit blocking policy.

## Name And Config

Use **Rich English Note** as the user-facing behavior name.

Add this config field:

```ts
assistantEnglishNoteDepth: 'compact' | 'rich' | 'lesson';
```

Default:

```ts
assistantEnglishNoteDepth: 'rich';
```

Meanings:

- `compact`: the current one-to-three-line format.
- `rich`: five to eight lines with correction, reason, examples, collocations, common mistake, and optional IPA.
- `lesson`: a longer study block for explicit learning sessions.

## Rich Output Shape

For `rich`, the assistant-facing instruction should ask for this shape:

```text
English note:
Original: "fix this problem"
Better: "fix this issue" / "resolve this startup issue"
Why: In engineering conversations, "issue" is more precise than "problem" when discussing bugs, failures, tickets, or startup errors.
Useful patterns:
- "The MCP client failed during the startup handshake."
- "This issue belongs at the config boundary, not the runtime path."
Collocations: startup issue, handshake failure, config mismatch, reproduce the issue, verify the fix
Common mistake: Use "problem" for general trouble; use "issue" for bugs, tickets, incidents, and engineering discussions.
IPA: issue /ˈɪʃuː/ or /ˈɪsjuː/
```

The `IPA` line remains optional. The assistant may omit sections that do not add value, but `Original`, `Better`, and `Why` should normally be present.

## Data Flow

`english_coaching_context` and `english-pilot coach context` already provide assistant-facing guidance. The richer note should be implemented by changing that context, not by generating content in EnglishPilot itself.

Flow:

1. Load config.
2. Build domain reference as today.
3. Build note-format guidance from `assistantEnglishNoteDepth`.
4. Include that guidance in `finalResponseInstruction`.
5. Codex or Claude follows the instruction when composing the final answer.
6. Stop hook records the final English note if the assistant includes one.

## Parser Compatibility

`extractLastAssistantEnglishNote` should parse both formats:

Existing compact format:

```text
English note: "fix this problem" -> "fix this issue"
Why: use issue for engineering bugs and failures.
IPA: issue /ˈɪʃuː/
```

New rich format:

```text
English note:
Original: "fix this problem"
Better: "fix this issue"
Why: use issue for engineering bugs and failures.
IPA: issue /ˈɪʃuː/
```

Storage can keep the current `AssistantEnglishNote` shape:

- `original`: from `Original` or compact left side.
- `suggested`: from `Better` or compact right side.
- `why`: from `Why`.
- `ipa`: from `IPA`.

Useful patterns, collocations, and common mistake are teaching material for the user-facing tail note. They do not need separate storage fields in this iteration.

## Error Handling

- If `assistantEnglishNoteDepth` is invalid, config validation should reject it.
- If the assistant returns malformed rich-note text, Stop-hook parsing should ignore it instead of throwing.
- If `IPA` is absent or unparsable, the note should still record original, suggested, and why.
- If domain-reference files are missing, the existing fallback examples still apply.

## Testing

Add focused tests for:

- Default config includes `assistantEnglishNoteDepth: "rich"`.
- Config can set `assistantEnglishNoteDepth` to `compact`, `rich`, and `lesson`.
- Invalid depth is rejected.
- Coaching context for `rich` includes the richer section guidance.
- Coaching context for `compact` keeps the short format guidance.
- Stop hook records the existing compact format.
- Stop hook records the new rich `Original` / `Better` format.
- Malformed rich notes do not create review items.

## Rollout

This is a backward-compatible local change. Existing Codex and Claude hooks continue to start the same command. After implementation, rebuild and reinstall the Codex/Claude integration only if the installed `dist` entrypoint or generated guidance needs refreshing.
