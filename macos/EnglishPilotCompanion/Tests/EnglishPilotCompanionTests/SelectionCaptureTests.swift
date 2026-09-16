import Foundation
import XCTest
@testable import EnglishPilotCompanion

@MainActor
final class SelectionCaptureTests: XCTestCase {
    func testUsesSelectionFileBeforeClipboard() async throws {
        let capture = SelectionCapture(
            selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
            fileReader: { _ in "  workflow \n" },
            clipboardReader: { "stale clipboard" }
        )

        XCTAssertEqual(try await capture.readSelection(), "workflow")
    }

    func testFallsBackToClipboardWhenSelectionFileIsEmpty() async throws {
        let capture = SelectionCapture(
            selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
            fileReader: { _ in " \n\t " },
            clipboardReader: { "  clipboard text\n" }
        )

        XCTAssertEqual(
            try await capture.readSelection(requestAccessibilityCopy: false),
            "clipboard text"
        )
    }

    func testFallsBackToClipboardWhenSelectionFileIsAbsent() async throws {
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileReader: { _ in XCTFail("The absent file must not be read"); return nil },
            clipboardReader: { "  clipboard text\n" }
        )

        XCTAssertEqual(
            try await capture.readSelection(requestAccessibilityCopy: false),
            "clipboard text"
        )
    }

    func testThrowsNoSelectionWhenFileAndClipboardAreEmpty() async {
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileReader: { _ in nil },
            clipboardReader: { " \n" }
        )

        do {
            _ = try await capture.readSelection(requestAccessibilityCopy: false)
            XCTFail("Expected no selection")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .noSelection)
        }
    }

    func testThrowsFileReadFailureInsteadOfNoSelection() async {
        let capture = SelectionCapture(
            selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
            fileProvider: TestFileProvider(result: .failure(.readFailed)),
            clipboardProvider: TestClipboard(text: "clipboard", snapshot: .empty),
            accessibilityCopier: TestAccessibilityCopier()
        )

        do {
            _ = try await capture.readSelection(requestAccessibilityCopy: false)
            XCTFail("Expected a file read failure")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .fileReadFailed)
        }
    }

    func testCancellationBeforeSynchronousFileReadIsPreserved() async {
        let readRecorder = InvocationRecorder()
        let startSignal = AsyncSignal()
        let capture = SelectionCapture(
            selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
            fileProvider: TestFileProvider(result: .success("selection")) {
                readRecorder.record()
            },
            clipboardProvider: TestClipboard(text: "clipboard", snapshot: .empty),
            accessibilityCopier: TestAccessibilityCopier()
        )
        let task = Task {
            await startSignal.wait()
            return try await capture.readSelection()
        }
        task.cancel()
        await startSignal.signal()

        do {
            _ = try await task.value
            XCTFail("Expected the canceled file read to fail with CancellationError")
        } catch is CancellationError {
            // Expected.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }

        XCTAssertEqual(readRecorder.count, 0)
    }

    func testCancellationAfterSynchronousFileReadIsPreserved() async {
        let cancellation = CancellationTrigger()
        let capture = SelectionCapture(
            selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
            fileProvider: TestFileProvider(result: .success("selection")) {
                cancellation.fire()
            },
            clipboardProvider: TestClipboard(text: "clipboard", snapshot: .empty),
            accessibilityCopier: TestAccessibilityCopier()
        )
        let task = Task { try await capture.readSelection() }
        cancellation.set {
            task.cancel()
        }

        do {
            _ = try await task.value
            XCTFail("Expected the canceled file read to fail with CancellationError")
        } catch is CancellationError {
            // Expected.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    func testThrowsClipboardReadFailureInsteadOfNoSelection() async {
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: TestClipboard(
                text: nil,
                snapshot: .empty,
                readError: .readFailed
            ),
            accessibilityCopier: TestAccessibilityCopier()
        )

        do {
            _ = try await capture.readSelection(requestAccessibilityCopy: false)
            XCTFail("Expected a clipboard read failure")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .clipboardReadFailed)
        }
    }

    func testCancellationAfterDirectClipboardReadIsPreserved() async {
        let cancellation = CancellationTrigger()
        let startSignal = AsyncSignal()
        let clipboard = TestClipboard(
            text: "clipboard",
            snapshot: .empty,
            onRead: {
                cancellation.fire()
            }
        )
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier()
        )
        let task = Task {
            await startSignal.wait()
            try await capture.readSelection(requestAccessibilityCopy: false)
        }
        cancellation.set {
            task.cancel()
        }
        await startSignal.signal()

        do {
            _ = try await task.value
            XCTFail("Expected the canceled clipboard read to fail with CancellationError")
        } catch is CancellationError {
            // Expected.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    func testProviderCancellationDuringDirectClipboardReadIsPreserved() async {
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: TestClipboard(
                text: "clipboard",
                snapshot: .empty,
                readError: .cancellation
            ),
            accessibilityCopier: TestAccessibilityCopier()
        )

        do {
            _ = try await capture.readSelection(requestAccessibilityCopy: false)
            XCTFail("Expected the provider cancellation to be preserved")
        } catch is CancellationError {
            // Expected.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    func testThrowsClipboardSnapshotFailureInsteadOfNoSelection() async {
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: TestClipboard(
                text: "clipboard",
                snapshot: .empty,
                snapshotError: .snapshotFailed
            ),
            accessibilityCopier: TestAccessibilityCopier()
        )

        do {
            _ = try await capture.readSelection()
            XCTFail("Expected a clipboard snapshot failure")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .clipboardSnapshotFailed)
        }
    }

    func testAccessibilityCopyWaitsForClipboardChangeBeforeReadingFreshText() async throws {
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [["public.utf8-plain-text": Data("old clipboard".utf8)]])
        )
        let sleeper = TestSleeper {
            clipboard.text = "  fresh selection\n"
        }
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier(),
            sleeper: sleeper
        )

        XCTAssertEqual(try await capture.readSelection(), "fresh selection")
        XCTAssertEqual(sleeper.sleepCount, 1)
    }

    func testAccessibilityCopyRejectsUnchangedClipboardAfterPolling() async {
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [["public.utf8-plain-text": Data("old clipboard".utf8)]])
        )
        let sleeper = TestSleeper()
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier(),
            sleeper: sleeper
        )

        do {
            _ = try await capture.readSelection()
            XCTFail("Expected unchanged clipboard to be rejected")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .noSelection)
        }
        XCTAssertGreaterThan(sleeper.sleepCount, 0)
    }

    func testCancellationAfterFreshPollingClipboardReadIsPreserved() async {
        let cancellation = CancellationTrigger()
        let startSignal = AsyncSignal()
        let readCounter = InvocationRecorder()
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [[
                "public.utf8-plain-text": Data("old clipboard".utf8)
            ]]),
            onRead: {
                readCounter.record()
                if readCounter.count == 2 {
                    cancellation.fire()
                }
            },
            queuedTexts: ["old clipboard", "fresh selection"]
        )
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier(),
            sleeper: TestSleeper()
        )
        let task = Task {
            await startSignal.wait()
            try await capture.readSelection()
        }
        cancellation.set {
            task.cancel()
        }
        await startSignal.signal()

        do {
            _ = try await task.value
            XCTFail("Expected the canceled polling read to fail with CancellationError")
        } catch is CancellationError {
            // Expected.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }

        XCTAssertEqual(clipboard.restoreCount, 1)
        XCTAssertEqual(clipboard.text, "old clipboard")
    }

    func testAccessibilityUnavailableAndCopyFailuresRemainTyped() async {
        let unavailableCapture = makeCapture(copierError: .unavailable)
        do {
            _ = try await unavailableCapture.readSelection()
            XCTFail("Expected accessibility to be unavailable")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .accessibilityUnavailable)
        }

        let failedCapture = makeCapture(copierError: .copyFailed)
        do {
            _ = try await failedCapture.readSelection()
            XCTFail("Expected the copy to fail")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .copyFailed)
        }
    }

    func testRestoreFailureIsObservableAfterFreshSelection() async {
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [["public.utf8-plain-text": Data("old clipboard".utf8)]]),
            restoreError: .restoreFailed
        )
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier { _ in
                clipboard.text = "fresh selection"
            }
        )

        do {
            _ = try await capture.readSelection()
            XCTFail("Expected restoration to fail")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .restorationFailed)
        }
    }

    func testEmptyClipboardRestoreFailureIsObservable() async {
        let clipboard = TestClipboard(
            text: nil,
            snapshot: .empty,
            clearContentsError: true
        )
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier { _ in
                clipboard.text = "fresh selection"
            }
        )

        do {
            _ = try await capture.readSelection()
            XCTFail("Expected empty clipboard restoration to fail")
        } catch {
            XCTAssertEqual(error as? SelectionCaptureError, .restorationFailed)
        }
        XCTAssertEqual(clipboard.restoreCount, 1)
        XCTAssertEqual(clipboard.restoredContents, [.empty])
    }

    func testSnapshotAndRestoreOperationsDoNotOverlap() async throws {
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [[
                "public.utf8-plain-text": Data("old clipboard".utf8)
            ]])
        )
        let copier = TestAccessibilityCopier { copyNumber in
            clipboard.text = "fresh selection \(copyNumber)"
        }
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: copier
        )

        async let first = capture.readSelection()
        async let second = capture.readSelection()
        let results = try await (first, second)

        XCTAssertEqual(clipboard.maximumConcurrentSnapshotRestoreOperations, 1)
        XCTAssertEqual(Set([results.0, results.1]), ["fresh selection 1", "fresh selection 2"])
        XCTAssertEqual(clipboard.restoreCount, 2)
        XCTAssertEqual(
            clipboard.restoredContents,
            [
                clipboard.initialSnapshot,
                clipboard.initialSnapshot
            ]
        )
        XCTAssertEqual(clipboard.text, "old clipboard")
    }

    func testClipboardCaptureIsSerializedAcrossDistinctInstances() async throws {
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [[
                "public.utf8-plain-text": Data("old clipboard".utf8)
            ]]),
            snapshotFromCurrentText: true,
            queuedTexts: ["old clipboard", "old clipboard", "old clipboard"]
        )
        let firstSleeper = ControlledSleeper()
        let secondEnrolled = AsyncSignal()
        let firstCapture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier { _ in
                clipboard.text = "fresh selection 1"
            },
            sleeper: firstSleeper
        )
        let secondCopier = TestAccessibilityCopier { _ in
            clipboard.text = "fresh selection 2"
        }
        let secondCapture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: secondCopier,
            gateEnrollmentHandler: {
                Task { await secondEnrolled.signal() }
            }
        )

        let firstTask = Task { try await firstCapture.readSelection() }
        await firstSleeper.started.wait()
        let secondTask = Task { try await secondCapture.readSelection() }

        await secondEnrolled.wait()
        XCTAssertEqual(secondCopier.callCount, 0)

        await firstSleeper.release()
        _ = try await firstTask.value
        _ = try await secondTask.value

        XCTAssertEqual(
            clipboard.restoredContents,
            [clipboard.initialSnapshot, clipboard.initialSnapshot]
        )
        XCTAssertEqual(clipboard.text, "old clipboard")
    }

    func testCanceledQueuedCaptureDoesNotCopyAfterGateIsReleased() async throws {
        let firstSleeper = ControlledSleeper()
        let firstClipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [[
                "public.utf8-plain-text": Data("old clipboard".utf8)
            ]])
        )
        let firstCapture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: firstClipboard,
            accessibilityCopier: TestAccessibilityCopier(),
            sleeper: firstSleeper
        )
        let secondCopier = TestAccessibilityCopier()
        let secondClipboard = TestClipboard(
            text: "second clipboard",
            snapshot: ClipboardContents(items: [[
                "public.utf8-plain-text": Data("second clipboard".utf8)
            ]])
        )
        let secondEnrolled = AsyncSignal()
        let secondCapture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: secondClipboard,
            accessibilityCopier: secondCopier,
            gateEnrollmentHandler: {
                Task { await secondEnrolled.signal() }
            }
        )

        let firstTask = Task { try await firstCapture.readSelection() }
        await firstSleeper.started.wait()
        let secondTask = Task { try await secondCapture.readSelection() }

        await secondEnrolled.wait()
        secondTask.cancel()
        await firstSleeper.release()

        _ = await firstTask.result
        do {
            _ = try await secondTask.value
            XCTFail("Expected the queued capture to be canceled")
        } catch is CancellationError {
            // Expected.
        }
        XCTAssertEqual(secondCopier.callCount, 0)
        XCTAssertEqual(secondClipboard.restoreCount, 0)
        XCTAssertEqual(secondClipboard.text, "second clipboard")
        XCTAssertEqual(firstClipboard.text, "old clipboard")
        XCTAssertEqual(firstClipboard.restoreCount, 1)
    }

    func testCanceledPollingRestoresClipboardAndStopsFurtherReads() async throws {
        let sleeper = ControlledSleeper()
        let clipboard = TestClipboard(
            text: "old clipboard",
            snapshot: ClipboardContents(items: [[
                "public.utf8-plain-text": Data("old clipboard".utf8)
            ]])
        )
        let capture = SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: clipboard,
            accessibilityCopier: TestAccessibilityCopier(),
            sleeper: sleeper
        )

        let task = Task { try await capture.readSelection() }
        await sleeper.started.wait()
        let readsBeforeCancellation = clipboard.readCount

        task.cancel()

        do {
            _ = try await task.value
            XCTFail("Expected the polling capture to be canceled")
        } catch is CancellationError {
            // Expected.
        }

        XCTAssertEqual(clipboard.readCount, readsBeforeCancellation)
        XCTAssertEqual(clipboard.restoreCount, 1)
        XCTAssertEqual(clipboard.text, "old clipboard")
    }

    func testProviderWorkDoesNotRunOnMainActor() async throws {
        let recorder = ThreadRecorder()
        let capture = SelectionCapture(
            selectionFileURL: URL(fileURLWithPath: "/tmp/selection.txt"),
            fileProvider: TestFileProvider(result: .success("selection")) {
                recorder.record(isMainThread: Thread.isMainThread)
            },
            clipboardProvider: TestClipboard(
                text: "clipboard",
                snapshot: .empty
            ),
            accessibilityCopier: TestAccessibilityCopier()
        )

        XCTAssertEqual(try await capture.readSelection(), "selection")
        XCTAssertFalse(recorder.wasMainThread)
    }

    private func makeCapture(copierError: AccessibilitySelectionCopyError) -> SelectionCapture {
        SelectionCapture(
            selectionFileURL: nil,
            fileProvider: TestFileProvider(result: .success(nil)),
            clipboardProvider: TestClipboard(
                text: "old clipboard",
                snapshot: ClipboardContents(items: [["public.utf8-plain-text": Data("old clipboard".utf8)]])
            ),
            accessibilityCopier: TestAccessibilityCopier(error: copierError)
        )
    }
}

private enum TestProviderError: Error, Sendable {
    case readFailed
    case cancellation
    case snapshotFailed
    case restoreFailed
}

private struct TestFileProvider: SelectionFileProvider {
    let result: Result<String?, TestProviderError>
    let onRead: @Sendable () -> Void

    init(
        result: Result<String?, TestProviderError>,
        onRead: @escaping @Sendable () -> Void = {}
    ) {
        self.result = result
        self.onRead = onRead
    }

    func readText(at _: URL) throws -> String? {
        onRead()
        try result.get()
    }
}

private final class InvocationRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var count = 0

    func record() {
        lock.lock()
        count += 1
        lock.unlock()
    }
}

private final class CancellationTrigger: @unchecked Sendable {
    private let lock = NSLock()
    private var action: (@Sendable () -> Void)?

    func set(_ action: @escaping @Sendable () -> Void) {
        lock.lock()
        self.action = action
        lock.unlock()
    }

    func fire() {
        lock.lock()
        let action = self.action
        lock.unlock()
        action?()
    }
}

private final class TestClipboard: SelectionClipboardProvider, @unchecked Sendable {
    var text: String?
    let initialSnapshot: ClipboardContents
    let readError: TestProviderError?
    let snapshotError: TestProviderError?
    let restoreError: TestProviderError?
    let clearContentsError: Bool
    let snapshotFromCurrentText: Bool
    var queuedTexts: [String?]
    private(set) var snapshotRestoreOperations = 0
    private(set) var maximumConcurrentSnapshotRestoreOperations = 0
    private(set) var readCount = 0
    private(set) var restoreCount = 0
    private(set) var restoredContents: [ClipboardContents] = []

    init(
        text: String?,
        snapshot: ClipboardContents,
        readError: TestProviderError? = nil,
        snapshotError: TestProviderError? = nil,
        restoreError: TestProviderError? = nil,
        clearContentsError: Bool = false,
        snapshotFromCurrentText: Bool = false,
        queuedTexts: [String?] = [],
        onRead: @escaping @Sendable () -> Void = {}
    ) {
        self.text = text
        self.initialSnapshot = snapshot
        self.readError = readError
        self.snapshotError = snapshotError
        self.restoreError = restoreError
        self.clearContentsError = clearContentsError
        self.snapshotFromCurrentText = snapshotFromCurrentText
        self.queuedTexts = queuedTexts
        self.onRead = onRead
    }

    let onRead: @Sendable () -> Void

    func readText() throws -> String? {
        readCount += 1
        onRead()
        if let readError {
            switch readError {
            case .cancellation:
                throw CancellationError()
            default:
                break
            }
            throw readError
        }
        if !queuedTexts.isEmpty {
            return queuedTexts.removeFirst()
        }
        return text
    }

    func captureContents() throws -> ClipboardContents {
        beginSnapshotRestoreOperation()
        if let snapshotError {
            endSnapshotRestoreOperation()
            throw snapshotError
        }
        if snapshotFromCurrentText {
            return ClipboardContents(items: text.map {
                [["public.utf8-plain-text": Data($0.utf8)]]
            } ?? [])
        }
        return initialSnapshot
    }

    func restoreContents(_ contents: ClipboardContents) throws {
        defer { endSnapshotRestoreOperation() }
        restoreCount += 1
        restoredContents.append(contents)
        if let restoreError {
            throw restoreError
        }
        if contents.items.isEmpty {
            guard !clearContentsError else {
                throw TestProviderError.restoreFailed
            }
            text = nil
            return
        }
        text = contents.items.first?["public.utf8-plain-text"].flatMap {
            String(data: $0, encoding: .utf8)
        }
    }

    private func beginSnapshotRestoreOperation() {
        snapshotRestoreOperations += 1
        maximumConcurrentSnapshotRestoreOperations = max(
            maximumConcurrentSnapshotRestoreOperations,
            snapshotRestoreOperations
        )
    }

    private func endSnapshotRestoreOperation() {
        snapshotRestoreOperations -= 1
    }
}

private final class TestSleeper: SelectionCaptureSleeper, @unchecked Sendable {
    private let action: @Sendable () async throws -> Void
    private(set) var sleepCount = 0

    init(action: @escaping @Sendable () async throws -> Void = {}) {
        self.action = action
    }

    func sleep() async throws {
        sleepCount += 1
        try await action()
    }
}

private final class ControlledSleeper: SelectionCaptureSleeper, @unchecked Sendable {
    let started = AsyncSignal()
    let releaseSignal = AsyncSignal()

    func sleep() async throws {
        await started.signal()
        while !(await releaseSignal.isSignaled) {
            try await Task.sleep(nanoseconds: 1_000_000)
        }
    }

    func release() async {
        await releaseSignal.signal()
    }
}

private actor AsyncSignal {
    private var signaled = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    var isSignaled: Bool {
        signaled
    }

    func signal() {
        signaled = true
        let continuations = waiters
        waiters.removeAll()
        continuations.forEach { $0.resume() }
    }

    func wait() async {
        if signaled {
            return
        }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }
}

private final class ThreadRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var wasMainThread = false

    func record(isMainThread: Bool) {
        lock.lock()
        wasMainThread = isMainThread
        lock.unlock()
    }
}

private final class TestAccessibilityCopier: AccessibilitySelectionCopier, @unchecked Sendable {
    private let action: @Sendable (Int) -> Void
    private let error: AccessibilitySelectionCopyError?
    private(set) var callCount = 0

    init(
        error: AccessibilitySelectionCopyError? = nil,
        action: @escaping @Sendable (Int) -> Void = { _ in }
    ) {
        self.error = error
        self.action = action
    }

    func copyFocusedSelection() throws {
        if let error {
            throw error
        }
        callCount += 1
        action(callCount)
    }
}
