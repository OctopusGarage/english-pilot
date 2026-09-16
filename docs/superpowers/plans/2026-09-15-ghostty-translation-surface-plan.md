# Ghostty Translation Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable EnglishPilot JSON lookup surface that accepts selected
text and returns a local learning result suitable for the macOS Ghostty
companion.

**Architecture:** Add a small core result model and a CLI adapter. The adapter
reuses `extractLesson`, `lookupPronunciations`, `listGlossaryEntries`, and the
existing learning-item recorder. The CLI emits one deterministic `local` JSON
response; the companion invokes a dedicated `translate enrich` wrapper for
the progressive `agent` stage.

**Tech Stack:** TypeScript, Node.js 22, existing EnglishPilot core and CLI
adapters, Vitest, pnpm.

---

## File Map

- Create `src/core/translation-result.ts` for request/result types and local
  result construction.
- Create `src/adapters/cli-translation.ts` for `translate` argument parsing
  and JSON/human output.
- Modify `src/adapters/cli.ts` to dispatch `translate`.
- Modify `src/adapters/cli-help.ts` to document the command.
- Modify `src/core/types.ts` only if the result contract needs a shared source
  discriminator; keep the contract local unless another module consumes it.
- Create `tests/unit/translation-result.test.ts` for pure result shaping.
- Modify `tests/integration/cli.test.ts` for command and input behavior.
- Modify `docs/manual.md` and `README.md` for the public command contract.

### Task 1: Define the lookup contract

**Files:**
- Create: `src/core/translation-result.ts`
- Test: `tests/unit/translation-result.test.ts`

- [ ] **Step 1: Write failing tests for word, phrase, and sentence shaping**

```typescript
import { describe, expect, it } from 'vitest';
import { buildLocalTranslationResult } from '../../src/core/translation-result.js';

describe('buildLocalTranslationResult', () => {
  it('normalizes a known glossary word and exposes its IPA and meaning', () => {
    const result = buildLocalTranslationResult('workflow', [
      {
        term: 'workflow',
        ipa: '/ˈwɝːkfloʊ/',
        meaning: '工作流程',
        tags: ['software-engineering'],
        allowTerm: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(result).toMatchObject({
      original: 'workflow',
      normalized: 'workflow',
      translation: '工作流程',
      pronunciation: '/ˈwɝːkfloʊ/',
    });
    expect(result.kind).toBe('word');
  });

  it('classifies a multiword selection as a phrase', () => {
    const result = buildLocalTranslationResult('make the failure path explicit', []);

    expect(result.kind).toBe('phrase');
    expect(result.original).toBe('make the failure path explicit');
    expect(result.explanation).toContain('EnglishPilot');
  });

  it('classifies terminal prose with sentence punctuation as a sentence', () => {
    const result = buildLocalTranslationResult('The command failed to start.', []);

    expect(result.kind).toBe('sentence');
    expect(result.examples).toEqual([]);
    expect(result.collocations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- --run tests/unit/translation-result.test.ts`

Expected: FAIL because `src/core/translation-result.ts` does not exist.

- [ ] **Step 3: Implement the stable types and local builder**

```typescript
import type { GlossaryEntry } from './glossary.js';
import { lookupPronunciations } from './pronunciation.js';

export type TranslationSelectionKind = 'word' | 'phrase' | 'sentence';

export interface TranslationRequest {
  requestId: string;
  text: string;
  source: string;
  context?: string;
}

export interface LocalTranslationResult {
  original: string;
  normalized: string;
  kind: TranslationSelectionKind;
  translation?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  explanation: string;
  examples: string[];
  collocations: string[];
  ipa: Array<{ word: string; ipa: string }>;
  lesson: {
    suggested: string;
    scene: string;
    pattern: string;
    tags: string[];
    worthRecording: boolean;
  };
}

export interface TranslationStageResponse {
  requestId: string;
  stage: 'local' | 'agent';
  status: 'loading' | 'ready' | 'error';
  result?: LocalTranslationResult;
  error?: {
    code: string;
    message: string;
  };
}

export function buildLocalTranslationResult(text: string, glossary: GlossaryEntry[]): LocalTranslationResult {
  const original = text.trim().replace(/\s+/g, ' ');
  if (!original) throw new Error('Selected text must not be empty.');

  const normalized = normalizeSelection(original);
  const kind = classifySelection(original);
  const matchingGlossary = glossary.find((entry) => entry.term.toLowerCase() === normalized.toLowerCase());
  const pronunciations = lookupPronunciations(original);

  return {
    original,
    normalized,
    kind,
    ...(matchingGlossary?.meaning ? { translation: matchingGlossary.meaning } : {}),
    ...(matchingGlossary?.ipa
      ? { pronunciation: matchingGlossary.ipa }
      : pronunciations.entries[0]?.ipa
        ? { pronunciation: pronunciations.entries[0].ipa }
        : {}),
    ...(kind === 'word' ? { partOfSpeech: inferPartOfSpeech(normalized) } : {}),
    explanation: matchingGlossary?.meaning
      ? `Local glossary entry for "${normalized}".`
      : 'EnglishPilot prepared a local learning result; richer translation can be added by agent enrichment.',
    examples: [],
    collocations: [],
    ipa: pronunciations.entries.map(({ word, ipa }) => ({ word, ipa })),
    lesson: {
      suggested: original,
      scene: 'Ghostty translation lookup',
      pattern: 'Reuse the selected English expression in a complete workplace sentence.',
      tags: ['ghostty-lookup', kind],
      worthRecording: kind !== 'sentence' || original.length <= 180,
    },
  };
}

function classifySelection(text: string): TranslationSelectionKind {
  if (/[.!?]$/.test(text) || text.split(/[.!?]+/).filter(Boolean).length > 1) return 'sentence';
  return text.split(/\s+/).length === 1 ? 'word' : 'phrase';
}

function normalizeSelection(text: string): string {
  return text.replace(/^[("'`]+|[)"'`,.!?]+$/g, '').trim().toLowerCase();
}

function inferPartOfSpeech(text: string): string | undefined {
  if (!/^[a-z]+$/i.test(text)) return undefined;
  return undefined;
}
```

Use `undefined` for part of speech until the project has a reliable local
part-of-speech source. Do not invent a guess from suffixes; the agent stage can
add it later.

- [ ] **Step 4: Run the focused unit test**

Run: `pnpm test -- --run tests/unit/translation-result.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/core/translation-result.ts tests/unit/translation-result.test.ts
git commit -m "feat: define translation lookup result contract"
```

### Task 2: Add the local `translate` CLI command

**Files:**
- Create: `src/adapters/cli-translation.ts`
- Modify: `src/adapters/cli.ts`
- Modify: `src/adapters/cli-help.ts`
- Modify: `tests/integration/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Add these cases to `tests/integration/cli.test.ts`:

```typescript
it('returns a local translation stage from stdin', () => {
  const result = runCli(['translate', '--stdin', '--json'], 'workflow');

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    requestId: expect.any(String),
    stage: 'local',
    status: 'ready',
    result: {
      original: 'workflow',
      kind: 'word',
      ipa: expect.any(Array),
    },
  });
});

it('accepts a JSON request and preserves requestId and source', () => {
  const result = runCli(
    ['translate', '--request-json', '--json'],
    JSON.stringify({
      requestId: 'ghostty-1',
      text: 'make the failure path explicit',
      source: 'ghostty',
    }),
  );

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    requestId: 'ghostty-1',
    stage: 'local',
    status: 'ready',
    result: {
      kind: 'phrase',
    },
  });
});

it('rejects empty selection without reading stale clipboard data', () => {
  const result = runCli(['translate', '--stdin', '--json'], '   ');

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Selected text must not be empty');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm test -- --run tests/integration/cli.test.ts`

Expected: FAIL because `translate` is currently an unknown command.

- [ ] **Step 3: Implement argument parsing and dispatch**

Create `src/adapters/cli-translation.ts` with these behaviors:

```typescript
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { listGlossaryEntries } from '../core/glossary.js';
import {
  buildLocalTranslationResult,
  type TranslationRequest,
  type TranslationStageResponse,
} from '../core/translation-result.js';
import type { CliResult } from './cli-types.js';
import { getFlagValue, isRecord } from './cli-args.js';

export function runTranslate(args: string[], stdin: string): CliResult {
  try {
    const request = readRequest(args, stdin);
    const result: TranslationStageResponse = {
      requestId: request.requestId,
      stage: 'local',
      status: 'ready',
      result: buildLocalTranslationResult(request.text, listGlossaryEntries()),
    };
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(result)}\n` : formatTranslation(result),
      stderr: '',
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}

function readRequest(args: string[], stdin: string): TranslationRequest {
  if (args.includes('--request-json')) {
    const parsed = JSON.parse(stdin) as unknown;
    if (!isRecord(parsed) || typeof parsed.text !== 'string' || !parsed.text.trim()) {
      throw new Error('Translation request JSON must include non-empty text.');
    }
    return {
      requestId: typeof parsed.requestId === 'string' && parsed.requestId.trim() ? parsed.requestId : randomUUID(),
      text: parsed.text,
      source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source : 'cli',
      ...(typeof parsed.context === 'string' ? { context: parsed.context } : {}),
    };
  }

  const text = args.includes('--stdin') ? stdin : getFlagValue(args, '--text') ?? args.filter((arg) => !arg.startsWith('--')).join(' ');
  if (!text.trim()) throw new Error('Selected text must not be empty.');
  return { requestId: randomUUID(), text, source: 'cli' };
}

function formatTranslation(response: TranslationStageResponse): string {
  const result = response.result;
  if (!result) return 'No local translation result.\n';
  return [
    result.original,
    `Kind: ${result.kind}`,
    ...(result.translation ? [`Translation: ${result.translation}`] : ['Translation: unavailable locally']),
    ...(result.pronunciation ? [`Pronunciation: ${result.pronunciation}`] : []),
    `Explanation: ${result.explanation}`,
    '',
  ].join('\n');
}
```

Add the dispatch in `src/adapters/cli.ts`:

```typescript
import { runTranslate } from './cli-translation.js';
// ...
if (command === 'translate') return runTranslate(args, stdin);
```

Add this line to `src/adapters/cli-help.ts` near the language commands:

```typescript
'  english-pilot translate --text "..." [--json] | --stdin [--json] | --request-json [--json]',
```

- [ ] **Step 4: Run the focused tests**

Run: `pnpm test -- --run tests/integration/cli.test.ts`

Expected: PASS for the new translation cases.

- [ ] **Step 5: Commit the CLI surface**

```bash
git add src/adapters/cli-translation.ts src/adapters/cli.ts src/adapters/cli-help.ts tests/integration/cli.test.ts
git commit -m "feat: add local translation lookup command"
```

### Task 3: Add optional learning-item recording

**Files:**
- Modify: `src/adapters/cli-translation.ts`
- Modify: `src/core/translation-result.ts`
- Modify: `tests/integration/cli.test.ts`

- [ ] **Step 1: Write the failing recording test**

```typescript
it('records a lookup when requested', () => {
  const result = runCli(['translate', '--text', 'workflow', '--record', '--json']);
  const review = runCli(['review', '--json']);

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    recorded: true,
    item: {
      original: 'workflow',
      tags: expect.arrayContaining(['ghostty-lookup']),
    },
  });
  expect(JSON.parse(review.stdout)).toContainEqual(
    expect.objectContaining({
      original: 'workflow',
    }),
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- --run tests/integration/cli.test.ts`

Expected: FAIL because `--record` is not handled.

- [ ] **Step 3: Implement recording through the existing repository**

In `runTranslate`, call `recordLearningItem` only when `--record` is present.
Build the draft from `result.lesson`, `result.ipa`, and the selected text.
Return `recorded: false` when the result is not recordable, and include the
created item only when recording succeeds.

Do not record automatically for every Ghostty lookup. The companion's button
will invoke this explicit CLI path.

- [ ] **Step 4: Run the focused integration test**

Run: `pnpm test -- --run tests/integration/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit recording behavior**

```bash
git add src/adapters/cli-translation.ts src/core/translation-result.ts tests/integration/cli.test.ts
git commit -m "feat: allow explicit translation review recording"
```

### Task 4: Define the enrichment prompt and response adapter

**Files:**
- Create: `src/core/translation-enrichment.ts`
- Create: `tests/unit/translation-enrichment.test.ts`
- Modify: `src/adapters/cli-translation.ts`
- Modify: `tests/integration/cli.test.ts`

- [ ] **Step 1: Write failing prompt and parser tests**

```typescript
import { describe, expect, it } from 'vitest';
import { buildTranslationEnrichmentPrompt, parseTranslationEnrichment } from '../../src/core/translation-enrichment.js';

describe('translation enrichment', () => {
  it('requests strict JSON for a selected expression', () => {
    const prompt = buildTranslationEnrichmentPrompt('exacerbates', 'workflow discussion');

    expect(prompt).toContain('exacerbates');
    expect(prompt).toContain('"translation"');
    expect(prompt).toContain('Return JSON only');
  });

  it('parses a valid agent result', () => {
    expect(
      parseTranslationEnrichment('{"translation":"使恶化","partOfSpeech":"verb","explanation":"make worse"}'),
    ).toEqual({
      translation: '使恶化',
      partOfSpeech: 'verb',
      explanation: 'make worse',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- --run tests/unit/translation-enrichment.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict prompt construction and defensive parsing**

The parser must:

- Accept a JSON object only.
- Require non-empty `translation` and `explanation`.
- Accept optional `partOfSpeech`, `examples`, and `collocations`.
- Reject fenced Markdown and malformed JSON with a stable error.
- Never execute arbitrary text returned by the agent.

The enrichment type should be:

```typescript
export interface TranslationEnrichment {
  translation: string;
  partOfSpeech?: string;
  explanation: string;
  examples?: string[];
  collocations?: string[];
}
```

- [ ] **Step 4: Add an async CLI mode for agent enrichment**

Add `english-pilot translate enrich --text "..." --backend claude|codex
--json`, implemented through `runCliAsync`. Reuse `runExternalAgent` and
`extractExternalAgentReplyText`. Return:

```typescript
{
  requestId: "...",
  stage: "agent",
  status: "ready",
  result: {
    translation: "...",
    partOfSpeech: "...",
    explanation: "...",
    examples: [],
    collocations: []
  }
}
```

On agent failure, return exit code `1` and a structured `error` object. The
Swift companion will keep the already-rendered local result.

- [ ] **Step 5: Run the CLI enrichment tests**

Run: `pnpm test -- --run tests/unit/translation-enrichment.test.ts tests/integration/cli.test.ts`

Expected: PASS, including a dry-run agent invocation that does not require a
real Claude or Codex process.

- [ ] **Step 6: Commit enrichment**

```bash
git add src/core/translation-enrichment.ts src/adapters/cli-translation.ts src/adapters/cli.ts tests/unit/translation-enrichment.test.ts tests/integration/cli.test.ts
git commit -m "feat: add translation agent enrichment"
```

### Task 5: Document and verify the reusable surface

**Files:**
- Modify: `README.md`
- Modify: `docs/manual.md`
- Modify: `tests/eval/smoke-eval.test.ts` only if a deterministic smoke case is
  added.

- [ ] **Step 1: Document the command and contract**

Document these exact examples:

```bash
english-pilot translate --text "workflow" --json
printf '%s' "make the failure path explicit" | english-pilot translate --stdin --json
english-pilot translate --request-json --json <<'JSON'
{"requestId":"ghostty-1","text":"workflow","source":"ghostty"}
JSON
english-pilot translate enrich --text "workflow" --backend codex --dry-run --json
```

Explain that local glossary meaning is returned immediately when available and
agent enrichment is optional. Explain that the companion uses `requestId` to
discard stale enrichment responses.

- [ ] **Step 2: Run the focused and project checks**

Run:

```bash
pnpm test -- --run tests/unit/translation-result.test.ts tests/unit/translation-enrichment.test.ts tests/integration/cli.test.ts
pnpm run typecheck
pnpm run build
pnpm run smoke:json
pnpm run smoke:mcp-stdio
```

Expected: all commands exit with status `0`; smoke JSON has `"passed": true`.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/manual.md
git commit -m "docs: document translation lookup surface"
```
