# Ghostty Translation Companion Design

**Date:** 2026-09-15

## Goal

Allow a user to select an English word, phrase, or sentence in Ghostty, press a
macOS keyboard shortcut, and see an EnglishPilot learning result in a small
floating window that stays above other windows.

The first user experience is macOS plus Ghostty. The translation request and
result interfaces must remain reusable by the EnglishPilot CLI, MCP clients,
and future terminal integrations.

## Decisions

- Use a macOS SwiftUI companion for shortcut handling, selection capture, and
  the floating window.
- Keep language analysis, learning data, and optional agent enrichment in the
  existing TypeScript EnglishPilot project.
- Start with a configurable `Cmd+Shift+D` shortcut.
- Support both selection capture through the macOS clipboard and
  Ghostty-provided selection-file/stdin integration. Clipboard capture is the
  fallback path when the file/stdin path is unavailable.
- Return a learning result rather than translation alone.
- Show the local result as soon as it is available, then update the same
  window with optional Claude/Codex enrichment.
- Keep the window visible above other windows until it is closed or replaced by
  another lookup.
- Do not modify Ghostty source code.

Ghostty provides configurable keybindings and supports writing the current
selection to a file, including copying the resulting file path. The integration
therefore uses a small macOS bridge rather than assuming Ghostty can directly
launch an arbitrary external process from a keybinding.

## Architecture

```text
Ghostty
  -> macOS shortcut / bridge
  -> SwiftUI companion
       -> EnglishPilot CLI or local request process
       -> local learning result
       -> optional agent enrichment
  -> SwiftUI floating window
```

### macOS companion

The companion owns:

- Global shortcut registration.
- Selection capture and input-source fallback.
- Request IDs and current-window state.
- Launching or communicating with the EnglishPilot request process.
- Rendering loading, local-result, enrichment, and error states.
- Always-on-top window behavior.
- Replacing the current result when a new lookup starts.

The companion should use native macOS APIs for the window and shortcut path.
The UI is a small constrained reading surface, not a general-purpose
dictionary application.

### EnglishPilot request surface

EnglishPilot owns:

- Input validation and normalization.
- Word, phrase, and sentence classification.
- Local translation and coaching result generation.
- Optional Claude/Codex enrichment.
- Existing configuration and local learning storage.
- Recording a lookup for review when the user requests it or when the existing
  policy calls for it.

The request surface must be independent from SwiftUI implementation details.
The initial integration may be a CLI command; the JSON contract is the
boundary that allows another client to be added later.

### Existing core

The implementation should reuse the existing analysis, coaching, pronunciation,
learning-card, configuration, and storage modules wherever their behavior
matches this feature. Any new adapter should translate the existing domain
result into the companion's stable response shape instead of duplicating
language policy.

## Request and response contract

The request is JSON:

```json
{
  "requestId": "request-uuid",
  "text": "This exacerbates the problem.",
  "source": "ghostty",
  "context": ""
}
```

Required fields:

- `requestId`: client-generated identifier used to correlate progressive
  responses.
- `text`: selected text.
- `source`: integration identifier, initially `ghostty`.

Optional fields:

- `context`: nearby text, when it can be captured without making the request
  unnecessarily large.

The result is JSON and supports progressive stages:

```json
{
  "requestId": "request-uuid",
  "stage": "local",
  "status": "ready",
  "result": {
    "original": "exacerbates",
    "normalized": "exacerbate",
    "translation": "使恶化；加剧",
    "pronunciation": "/ɪɡˈzæsərbeɪt/",
    "partOfSpeech": "verb",
    "explanation": "To make an existing problem or situation worse.",
    "examples": [],
    "collocations": []
  }
}
```

Supported stages:

- `local`: the immediately available EnglishPilot result.
- `agent`: optional enriched result from a configured local Claude/Codex
  process.

The response status must distinguish at least `loading`, `ready`, and `error`.
Errors should include a user-readable message and, where useful, a stable
machine-readable error code. Agent failure must not invalidate a ready local
result.

## User flow

1. The user selects a word, phrase, or sentence in Ghostty.
2. The user presses the configured shortcut.
3. The companion captures the selection.
4. The companion validates that the captured text is non-empty and opens or
   reuses the floating window with a loading state.
5. EnglishPilot returns the local learning result.
6. The companion renders the local result immediately.
7. If enrichment is enabled, the companion displays a short enrichment-loading
   state and updates the same window when the agent response arrives.
8. The window remains above other windows until the user closes it or starts
   another lookup.

The result surface includes:

- Original selected text.
- Normalized word or phrase when applicable.
- Chinese translation.
- IPA pronunciation when available.
- Part of speech for vocabulary.
- Short explanation.
- Example sentences.
- Useful collocations where available.
- Close control.
- Copy-result control.
- Optional record-for-review control.

Long sentences use a constrained, scrollable layout. A new lookup replaces
the current result in the existing window rather than creating a second
window.

## Input capture

The companion supports two input paths:

1. A Ghostty selection-file/stdin path configured through the integration
   bridge.
2. Clipboard capture as a fallback, using macOS accessibility-assisted copy
   when required.

Clipboard state should be preserved and restored when practical so the lookup
does not unexpectedly replace the user's clipboard contents. If no reliable
selection is available, the companion reports that no text was selected rather
than translating stale clipboard contents without an explicit fallback result.

The setup experience should install or document the bridge configuration and
shortcut. It must not require changes to Ghostty source code.

## Error and concurrency behavior

- Empty selection: show `No text selected`.
- Clipboard unavailable or unchanged: try the configured file/stdin path, then
  show a capture error if it also fails.
- Invalid or oversized input: show a validation error without invoking the
  agent.
- Local analysis failure: show the selected text and a retryable error.
- Agent timeout or process failure: keep the local result and mark enrichment
  unavailable.
- A newer lookup supersedes an older one. Every agent response must be matched
  by `requestId`; stale responses cannot overwrite the current window.
- Closing the companion must not make the CLI request surface unusable.
- The first version does not require the EnglishPilot daemon or external
  channel credentials.

## Testing strategy

### EnglishPilot tests

- Unit tests for word, phrase, and sentence normalization/classification.
- Unit tests for the JSON request and progressive response contract.
- CLI integration tests for stdin, selection-file, JSON, invalid input, and
  agent-disabled paths.
- Tests proving agent failure preserves a successful local result.
- Tests proving stale request IDs cannot overwrite a newer result.
- Tests for optional learning-item recording and existing storage behavior.

### macOS companion tests

- Shortcut invocation starts one lookup.
- Selection capture chooses the configured primary path and uses the fallback
  path when necessary.
- The window enters loading, local-ready, enrichment-ready, and error states.
- A new lookup replaces the current result.
- The window remains above other windows until closed.
- Copy-result and record-for-review actions send the expected requests.

### Manual integration smoke test

On macOS with Ghostty:

1. Select a vocabulary word and press the shortcut.
2. Confirm the floating window appears quickly.
3. Confirm translation, pronunciation, part of speech, and explanation render.
4. Select a phrase and confirm the same window is replaced.
5. Select a sentence and confirm the constrained layout is readable.
6. Confirm optional enrichment updates the existing result.
7. Simulate agent failure and confirm the local result remains visible.

## Scope boundaries

Included:

- macOS SwiftUI companion.
- Ghostty selection-trigger integration.
- Reusable EnglishPilot JSON request/result surface.
- Local learning result plus optional local-agent enrichment.
- Pinned floating-window behavior.
- Focused automated and manual tests.

Not included in the first version:

- A cross-platform desktop GUI.
- A full dictionary database or standalone dictionary product.
- Direct modification of Ghostty.
- Automatic translation of every terminal selection without a shortcut.
- Cloud-only translation as a required dependency.
- A long-running streaming protocol beyond the progressive local/agent result
  lifecycle needed by the companion.
