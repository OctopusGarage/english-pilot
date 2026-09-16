# Ghostty macOS Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native macOS SwiftUI companion that captures selected
Ghostty text with a global shortcut and displays a pinned EnglishPilot
learning window with progressive local and agent results.

**Architecture:** Create an independent Swift Package executable under
`macos/EnglishPilotCompanion`. The app registers a Carbon global hotkey,
captures the current selection through Accessibility-assisted copy with a
clipboard/file fallback, invokes the EnglishPilot binary, and renders one
always-on-top `NSPanel`. It communicates with the TypeScript surface only
through JSON and does not import Node code.

**Tech Stack:** Swift 5.9+, macOS AppKit, SwiftUI, Carbon Event Manager,
ApplicationServices Accessibility APIs, `Process`, `NSPasteboard`, XCTest.

---

## File Map

- Create `macos/EnglishPilotCompanion/Package.swift` for the executable
  package.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/main.swift`
  for app startup and global application state.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/Models.swift`
  for JSON request/result models.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/SelectionCapture.swift`
  for clipboard and Accessibility capture.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/EnglishPilotProcess.swift`
  for CLI process invocation and JSON decoding.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/LookupStore.swift`
  for request IDs and stale-response suppression.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/LookupView.swift`
  for the SwiftUI result surface.
- Create `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/PanelController.swift`
  for the pinned `NSPanel`.
- Create `macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/LookupStoreTests.swift`
  for concurrency behavior.
- Create `macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/ModelsTests.swift`
  for JSON decoding.
- Create `scripts/install-ghostty-companion.sh` for local build/install and
  Ghostty configuration guidance.
- Modify `.gitignore` only if the local Swift build directory needs exclusion.
- Modify `README.md` and `docs/manual.md` with macOS companion setup.

### Task 1: Create the Swift package and JSON models

**Files:**
- Create: `macos/EnglishPilotCompanion/Package.swift`
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/Models.swift`
- Create: `macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/ModelsTests.swift`

- [ ] **Step 1: Add the package manifest**

Use an executable target and XCTest target:

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "EnglishPilotCompanion",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "EnglishPilotCompanion", targets: ["EnglishPilotCompanion"])
    ],
    targets: [
        .executableTarget(name: "EnglishPilotCompanion"),
        .testTarget(name: "EnglishPilotCompanionTests", dependencies: ["EnglishPilotCompanion"])
    ]
)
```

- [ ] **Step 2: Write failing decoding tests**

```swift
import XCTest
@testable import EnglishPilotCompanion

final class ModelsTests: XCTestCase {
    func testDecodesLocalResponse() throws {
        let data = Data(#"{"requestId":"r1","stage":"local","status":"ready","result":{"original":"workflow","normalized":"workflow","kind":"word","translation":"工作流程","explanation":"Local glossary entry.","examples":[],"collocations":[],"ipa":[],"lesson":{"suggested":"workflow","scene":"Ghostty translation lookup","pattern":"Reuse the selected expression.","tags":["ghostty-lookup","word"],"worthRecording":true}}}"#.utf8)
        let response = try JSONDecoder().decode(TranslationStageResponse.self, from: data)

        XCTAssertEqual(response.requestId, "r1")
        XCTAssertEqual(response.stage, .local)
        XCTAssertEqual(response.result?.translation, "工作流程")
    }
}
```

- [ ] **Step 3: Implement Codable models**

Define `TranslationStageResponse`, `LocalTranslationResult`, `TranslationRequest`,
`TranslationEnrichment`, and their enums with `Codable`.

Use optional properties for `translation`, `pronunciation`, and
`partOfSpeech`. Keep the JSON keys identical to the TypeScript contract.

- [ ] **Step 4: Run the package tests**

Run: `swift test --package-path macos/EnglishPilotCompanion`

Expected: PASS.

- [ ] **Step 5: Commit the package boundary**

```bash
git add macos/EnglishPilotCompanion/Package.swift macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/Models.swift macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/ModelsTests.swift
git commit -m "feat: scaffold macOS translation companion"
```

### Task 2: Implement request identity and stale-response suppression

**Files:**
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/LookupStore.swift`
- Create: `macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/LookupStoreTests.swift`

- [ ] **Step 1: Write failing concurrency tests**

```swift
import XCTest
@testable import EnglishPilotCompanion

final class LookupStoreTests: XCTestCase {
    func testNewRequestInvalidatesOlderRequest() {
        let store = LookupStore()
        let first = store.begin(text: "first")
        let second = store.begin(text: "second")

        XCTAssertFalse(store.accepts(requestId: first.requestId))
        XCTAssertTrue(store.accepts(requestId: second.requestId))
    }
}
```

- [ ] **Step 2: Implement `LookupStore`**

The store must:

- Generate UUID request IDs.
- Keep the current request ID and selected text.
- Expose `begin(text:)`.
- Expose `accepts(requestId:)`.
- Expose the current response state for SwiftUI observation.
- Replace the current state when a new lookup starts.

- [ ] **Step 3: Run the focused test**

Run: `swift test --package-path macos/EnglishPilotCompanion --filter LookupStoreTests`

Expected: PASS.

- [ ] **Step 4: Commit request identity**

```bash
git add macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/LookupStore.swift macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/LookupStoreTests.swift
git commit -m "feat: suppress stale companion lookups"
```

### Task 3: Add selection capture

**Files:**
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/SelectionCapture.swift`
- Create: `macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/SelectionCaptureTests.swift`

- [ ] **Step 1: Write capture-path tests around injectable providers**

Define a `PasteboardReading` protocol and test:

```swift
func testUsesSelectionFileBeforeClipboard() throws {
    let capture = SelectionCapture(
        selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
        fileReader: { _ in "workflow" },
        clipboardReader: { "stale clipboard" }
    )

    XCTAssertEqual(try capture.readSelection(), "workflow")
}
```

- [ ] **Step 2: Implement file-first capture**

`SelectionCapture` must:

- Read a configured selection file when present.
- Trim whitespace and reject empty contents.
- Fall back to the clipboard when the file is absent or empty.
- Return a typed error for no selection.
- Avoid treating an unchanged clipboard as a valid selection when the
  Accessibility copy operation was requested but did not change the clipboard.

- [ ] **Step 3: Implement Accessibility-assisted copy**

Use `AXUIElementCreateSystemWide`, locate the focused UI element, and post
Command-C through `CGEvent` when the file path is unavailable. Save the
general pasteboard contents before copying and restore them after reading when
the restore operation succeeds.

Document that the user must grant Accessibility permission to the companion.
Do not silently read arbitrary clipboard text when there is no evidence of a
fresh selection.

- [ ] **Step 4: Run tests**

Run: `swift test --package-path macos/EnglishPilotCompanion --filter SelectionCaptureTests`

Expected: PASS for injected file/clipboard paths. Accessibility behavior is
covered by the manual macOS smoke test.

- [ ] **Step 5: Commit selection capture**

```bash
git add macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/SelectionCapture.swift macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/SelectionCaptureTests.swift
git commit -m "feat: capture Ghostty selections for lookup"
```

### Task 4: Implement EnglishPilot process invocation

**Files:**
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/EnglishPilotProcess.swift`
- Create: `macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/EnglishPilotProcessTests.swift`

- [ ] **Step 1: Write process-decoding tests with an injectable runner**

Test that a local JSON response decodes and that a failed enrichment process
returns an error without changing the local response.

- [ ] **Step 2: Implement local lookup**

Invoke the configured EnglishPilot binary with:

```text
translate --request-json --json
```

Write this JSON request to stdin:

```json
{"requestId":"...","text":"...","source":"ghostty"}
```

Decode the single local response and publish it to `LookupStore`.

- [ ] **Step 3: Implement optional enrichment**

Invoke:

```text
translate enrich --request-json --backend <claude|codex> --json
```

Use the same request ID. Only apply the response when
`LookupStore.accepts(requestId:)` is true. If the process exits nonzero or
returns malformed JSON, publish an agent-stage error while leaving the local
result intact.

- [ ] **Step 4: Add cancellation**

Keep the current `Process` handles in the process adapter. Terminate older
processes when a new lookup begins, but still rely on request IDs because a
process can finish during termination.

- [ ] **Step 5: Run tests**

Run: `swift test --package-path macos/EnglishPilotCompanion --filter EnglishPilotProcessTests`

Expected: PASS.

- [ ] **Step 6: Commit process integration**

```bash
git add macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/EnglishPilotProcess.swift macos/EnglishPilotCompanion/Tests/EnglishPilotCompanionTests/EnglishPilotProcessTests.swift
git commit -m "feat: connect macOS companion to EnglishPilot CLI"
```

### Task 5: Build the pinned SwiftUI window

**Files:**
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/LookupView.swift`
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/PanelController.swift`

- [ ] **Step 1: Implement the result view**

Render these sections in order:

1. Original selection.
2. Normalized text and kind.
3. Translation or “Translation pending enrichment”.
4. Pronunciation and part of speech when present.
5. Explanation.
6. Examples and collocations when non-empty.
7. Buttons for copy result, record for review, and close.

Use a fixed width between 360 and 520 points and a maximum height of 640
points. Put long content in a `ScrollView`. Keep buttons icon-plus-label
where the action is not obvious, and use system symbols for close/copy.

- [ ] **Step 2: Implement `NSPanel` behavior**

Configure the panel as:

```swift
panel.level = .floating
panel.hidesOnDeactivate = false
panel.isReleasedWhenClosed = false
panel.styleMask = [.titled, .closable, .utilityWindow, .nonactivatingPanel]
```

Center the panel near the active display's visible frame. Reuse one panel for
all lookups. Closing the panel must not terminate the companion process.

- [ ] **Step 3: Add action callbacks**

The copy action writes the formatted result to `NSPasteboard`.
The record action invokes:

```text
translate --request-json --record --json
```

The close action orders the panel out.

- [ ] **Step 4: Build the package**

Run: `swift build --package-path macos/EnglishPilotCompanion`

Expected: PASS.

- [ ] **Step 5: Commit the window**

```bash
git add macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/LookupView.swift macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/PanelController.swift
git commit -m "feat: add pinned translation result window"
```

### Task 6: Add the global shortcut and app lifecycle

**Files:**
- Create: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/main.swift`
- Modify: `macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/SelectionCapture.swift`

- [ ] **Step 1: Register the default `Cmd+Shift+D` Carbon hotkey**

Use `RegisterEventHotKey` with Command plus Shift and the virtual key code
for `D`. Read `ENGLISH_PILOT_TRANSLATE_HOTKEY` as an optional future
configuration value, but keep the first implementation fixed to
`Cmd+Shift+D` and document it.

- [ ] **Step 2: Connect the event to the lookup coordinator**

On hotkey:

1. Capture selection.
2. Begin a new `LookupStore` request.
3. Show the panel with loading state.
4. Invoke local lookup.
5. Start enrichment only when `ENGLISH_PILOT_TRANSLATE_AGENT` is `claude` or
   `codex`.

On capture failure, show `No text selected` or the typed capture error in the
same panel.

- [ ] **Step 3: Keep the process alive**

Create an `NSApplication` accessory app with a menu item for Quit and a menu
item for “Open Accessibility Settings”. The app must not appear as a normal
Dock application unless the user changes the app policy.

- [ ] **Step 4: Build and run the package**

Run:

```bash
swift build --package-path macos/EnglishPilotCompanion
ENGLISH_PILOT_BINARY="$(pwd)/dist/src/bin/english-pilot.js" swift run --package-path macos/EnglishPilotCompanion
```

Expected: the companion stays running and exposes the menu bar item. The
JavaScript binary path must be resolved through Node in the final launcher;
the command above is only a development smoke check.

- [ ] **Step 5: Commit lifecycle and shortcut**

```bash
git add macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/main.swift macos/EnglishPilotCompanion/Sources/EnglishPilotCompanion/SelectionCapture.swift
git commit -m "feat: trigger translation companion from global shortcut"
```

### Task 7: Add installer and Ghostty setup

**Files:**
- Create: `scripts/install-ghostty-companion.sh`
- Modify: `README.md`
- Modify: `docs/manual.md`
- Modify: `.gitignore` if Swift build output is not already excluded.

- [ ] **Step 1: Implement the installer**

The script must:

- Require macOS.
- Run `swift build -c release --package-path macos/EnglishPilotCompanion`.
- Install the release executable under
  `~/Library/Application Support/EnglishPilot/EnglishPilotCompanion`.
- Write a launcher script that resolves the installed EnglishPilot CLI.
- Print the Accessibility permission path and Ghostty shortcut setup.
- Exit nonzero if Swift is missing or the build fails.

- [ ] **Step 2: Document Ghostty configuration**

Document the recommended flow:

1. Build/install the companion.
2. Start it once.
3. Grant Accessibility permission in
   `System Settings -> Privacy & Security -> Accessibility`.
4. Configure or use `Cmd+Shift+D`.
5. Optionally set `ENGLISH_PILOT_TRANSLATE_AGENT=claude|codex`.

If Ghostty selection-file integration is added, document the exact file path
environment variable and keep clipboard capture as the fallback.

- [ ] **Step 3: Add script validation**

Run:

```bash
shellcheck --severity=warning scripts/install-ghostty-companion.sh
```

Expected: PASS.

- [ ] **Step 4: Commit installation documentation**

```bash
git add scripts/install-ghostty-companion.sh README.md docs/manual.md .gitignore
git commit -m "feat: add macOS companion installation flow"
```

### Task 8: Run end-to-end verification

**Files:**
- No new files.

- [ ] **Step 1: Run TypeScript verification**

```bash
pnpm run typecheck
pnpm test -- --run tests/unit/translation-result.test.ts tests/unit/translation-enrichment.test.ts tests/integration/cli.test.ts
pnpm run build
pnpm run smoke:json
pnpm run smoke:mcp-stdio
```

Expected: all commands pass and smoke JSON reports `"passed": true`.

- [ ] **Step 2: Run Swift verification**

```bash
swift test --package-path macos/EnglishPilotCompanion
swift build -c release --package-path macos/EnglishPilotCompanion
```

Expected: all tests pass and the release executable builds.

- [ ] **Step 3: Run the manual Ghostty smoke test**

On macOS:

1. Select `workflow` in Ghostty and press `Cmd+Shift+D`.
2. Confirm the floating window appears with a local result.
3. Select `make the failure path explicit` and confirm the same window updates.
4. Select a sentence and confirm scrolling instead of window growth.
5. Enable an agent backend and confirm the same request updates in place.
6. Start a second lookup before the first enrichment completes and confirm the
   older response cannot overwrite the newer result.
7. Close the window and verify the menu bar companion remains running.

- [ ] **Step 4: Record final verification**

Add the exact commands and outcomes to the implementation PR or change note.
Do not claim the feature is complete until both the TypeScript and Swift
verification commands pass and the manual Ghostty flow succeeds.
