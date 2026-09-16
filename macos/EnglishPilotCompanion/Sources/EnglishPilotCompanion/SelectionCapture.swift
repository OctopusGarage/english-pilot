import Foundation

public struct ClipboardContents: Equatable, Sendable {
    public static let empty = ClipboardContents()

    public let items: [[String: Data]]

    public init(items: [[String: Data]] = []) {
        self.items = items
    }
}

public enum SelectionClipboardError: Error, Equatable, Sendable {
    case readFailed
    case snapshotFailed
    case restoreFailed
}

public enum AccessibilitySelectionCopyError: Error, Equatable, Sendable {
    case unavailable
    case copyFailed
}

public protocol SelectionFileProvider: Sendable {
    func readText(at url: URL) throws -> String?
}

public protocol SelectionClipboardProvider: Sendable {
    func readText() throws -> String?
    func captureContents() throws -> ClipboardContents
    func restoreContents(_ contents: ClipboardContents) throws
}

public protocol AccessibilitySelectionCopier: Sendable {
    func copyFocusedSelection() throws
}

public protocol SelectionCaptureSleeper: Sendable {
    func sleep() async throws
}

public enum SelectionCaptureError: Error, Equatable, CustomStringConvertible, Sendable {
    case noSelection
    case fileReadFailed
    case clipboardReadFailed
    case clipboardSnapshotFailed
    case accessibilityUnavailable
    case copyFailed
    case restorationFailed

    public var description: String {
        switch self {
        case .noSelection:
            return "No usable selection was found."
        case .fileReadFailed:
            return "The selection file could not be read."
        case .clipboardReadFailed:
            return "The clipboard could not be read."
        case .clipboardSnapshotFailed:
            return "The clipboard contents could not be saved."
        case .accessibilityUnavailable:
            return "Accessibility permission or the focused element was unavailable."
        case .copyFailed:
            return "The focused selection could not be copied."
        case .restorationFailed:
            return "The clipboard could not be restored."
        }
    }
}

public final class SelectionCapture: Sendable {
    private let worker: SelectionCaptureWorker

    public init(
        selectionFileURL: URL?,
        fileProvider: any SelectionFileProvider = LocalSelectionFileProvider(),
        clipboardProvider: any SelectionClipboardProvider = SystemSelectionClipboardProvider(),
        accessibilityCopier: any AccessibilitySelectionCopier = SystemAccessibilitySelectionCopier(),
        sleeper: any SelectionCaptureSleeper = TaskSelectionCaptureSleeper()
    ) {
        worker = SelectionCaptureWorker(
            selectionFileURL: selectionFileURL,
            fileProvider: fileProvider,
            clipboardProvider: clipboardProvider,
            accessibilityCopier: accessibilityCopier,
            sleeper: sleeper,
            gateEnrollmentHandler: {}
        )
    }

    public convenience init(
        selectionFileURL: URL?,
        fileReader: @escaping @Sendable (URL) -> String?,
        clipboardReader: @escaping @Sendable () -> String?
    ) {
        self.init(
            selectionFileURL: selectionFileURL,
            fileProvider: ClosureSelectionFileProvider(reader: fileReader),
            clipboardProvider: ClosureSelectionClipboardProvider(reader: clipboardReader),
            accessibilityCopier: SystemAccessibilitySelectionCopier()
        )
    }

#if DEBUG
    init(
        selectionFileURL: URL?,
        fileProvider: any SelectionFileProvider,
        clipboardProvider: any SelectionClipboardProvider,
        accessibilityCopier: any AccessibilitySelectionCopier,
        sleeper: any SelectionCaptureSleeper = TaskSelectionCaptureSleeper(),
        gateEnrollmentHandler: @escaping @Sendable () -> Void
    ) {
        worker = SelectionCaptureWorker(
            selectionFileURL: selectionFileURL,
            fileProvider: fileProvider,
            clipboardProvider: clipboardProvider,
            accessibilityCopier: accessibilityCopier,
            sleeper: sleeper,
            gateEnrollmentHandler: gateEnrollmentHandler
        )
    }
#endif

    public func readSelection(requestAccessibilityCopy: Bool = true) async throws -> String {
        try await worker.readSelection(requestAccessibilityCopy: requestAccessibilityCopy)
    }
}

private actor SelectionCaptureWorker {
    private static let copyPollingAttempts = 5
    private static let captureGate = SelectionCaptureGate()

    private let selectionFileURL: URL?
    private let fileProvider: any SelectionFileProvider
    private let clipboardProvider: any SelectionClipboardProvider
    private let accessibilityCopier: any AccessibilitySelectionCopier
    private let sleeper: any SelectionCaptureSleeper
    private let gateEnrollmentHandler: @Sendable () -> Void

    init(
        selectionFileURL: URL?,
        fileProvider: any SelectionFileProvider,
        clipboardProvider: any SelectionClipboardProvider,
        accessibilityCopier: any AccessibilitySelectionCopier,
        sleeper: any SelectionCaptureSleeper,
        gateEnrollmentHandler: @escaping @Sendable () -> Void
    ) {
        self.selectionFileURL = selectionFileURL
        self.fileProvider = fileProvider
        self.clipboardProvider = clipboardProvider
        self.accessibilityCopier = accessibilityCopier
        self.sleeper = sleeper
        self.gateEnrollmentHandler = gateEnrollmentHandler
    }

    func readSelection(requestAccessibilityCopy: Bool) async throws -> String {
        if let selectionFileURL {
            try Task.checkCancellation()
            do {
                let fileText = try fileProvider.readText(at: selectionFileURL)
                try Task.checkCancellation()
                if let selection = usableText(fileText) {
                    return selection
                }
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                throw SelectionCaptureError.fileReadFailed
            }
        }

        try await Self.captureGate.acquire(onEnqueued: gateEnrollmentHandler)
        do {
            let selection = try await performClipboardRead(
                requestAccessibilityCopy: requestAccessibilityCopy
            )
            await Self.captureGate.release()
            return selection
        } catch {
            await Self.captureGate.release()
            throw error
        }
    }

    private func performClipboardRead(requestAccessibilityCopy: Bool) async throws -> String {
        guard requestAccessibilityCopy else {
            return try clipboardSelection()
        }

        let previousClipboardText = try readClipboardText()
        let savedClipboard: ClipboardContents
        do {
            savedClipboard = try clipboardProvider.captureContents()
        } catch {
            throw SelectionCaptureError.clipboardSnapshotFailed
        }

        let result: Result<String, ClipboardCaptureOperationError>
        do {
            try Task.checkCancellation()
            do {
                try accessibilityCopier.copyFocusedSelection()
            } catch let error as AccessibilitySelectionCopyError {
                throw error
            } catch {
                throw AccessibilitySelectionCopyError.copyFailed
            }

            result = .success(
                try await pollForFreshClipboardText(previousClipboardText: previousClipboardText)
            )
        } catch is CancellationError {
            result = .failure(.cancelled)
        } catch let error as AccessibilitySelectionCopyError {
            result = .failure(.accessibility(error))
        } catch let error as SelectionCaptureError {
            result = .failure(.selection(error))
        } catch {
            result = .failure(.selection(.clipboardReadFailed))
        }

        do {
            try clipboardProvider.restoreContents(savedClipboard)
        } catch {
            throw SelectionCaptureError.restorationFailed
        }

        switch result {
        case let .success(selection):
            return selection
        case let .failure(.accessibility(error)):
            throw error.selectionCaptureError
        case let .failure(.selection(error)):
            throw error
        case .failure(.cancelled):
            throw CancellationError()
        }
    }

    private func clipboardSelection() throws -> String {
        guard let selection = try readClipboardText() else {
            throw SelectionCaptureError.noSelection
        }
        return selection
    }

    private func readClipboardText() throws -> String? {
        try Task.checkCancellation()
        do {
            let clipboardText = try clipboardProvider.readText()
            try Task.checkCancellation()
            return usableText(clipboardText)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw SelectionCaptureError.clipboardReadFailed
        }
    }

    private func pollForFreshClipboardText(
        previousClipboardText: String?
    ) async throws -> String {
        for attempt in 0..<Self.copyPollingAttempts {
            try Task.checkCancellation()
            if attempt > 0 {
                try await sleeper.sleep()
            }

            guard let copiedText = try readClipboardText() else {
                continue
            }
            if copiedText != previousClipboardText {
                return copiedText
            }
        }

        throw SelectionCaptureError.noSelection
    }

    private func usableText(_ text: String?) -> String? {
        guard let text else {
            return nil
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private enum ClipboardCaptureOperationError: Error {
    case accessibility(AccessibilitySelectionCopyError)
    case selection(SelectionCaptureError)
    case cancelled
}

private actor SelectionCaptureGate {
    private var isOccupied = false
    private var waiters: [(id: UUID, continuation: CheckedContinuation<Void, Error>)] = []

    func acquire(onEnqueued: @Sendable () -> Void) async throws {
        try Task.checkCancellation()
        if !isOccupied {
            isOccupied = true
            return
        }

        let id = UUID()
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Void, Error>) in
                if Task.isCancelled {
                    continuation.resume(throwing: CancellationError())
                } else {
                    waiters.append((id: id, continuation: continuation))
                    onEnqueued()
                }
            }
        }, onCancel: {
            Task {
                await self.cancelWaiter(id: id)
            }
        })
    }

    private func cancelWaiter(id: UUID) {
        guard let index = waiters.firstIndex(where: { $0.id == id }) else {
            return
        }
        let waiter = waiters.remove(at: index)
        waiter.continuation.resume(throwing: CancellationError())
    }

    func release() {
        if let waiter = waiters.first {
            waiters.removeFirst()
            waiter.continuation.resume()
        } else {
            isOccupied = false
        }
    }
}

private extension AccessibilitySelectionCopyError {
    var selectionCaptureError: SelectionCaptureError {
        switch self {
        case .unavailable:
            return .accessibilityUnavailable
        case .copyFailed:
            return .copyFailed
        }
    }
}

public struct TaskSelectionCaptureSleeper: SelectionCaptureSleeper {
    private let interval: TimeInterval

    public init(interval: TimeInterval = 0.02) {
        self.interval = interval
    }

    public func sleep() async throws {
        let nanoseconds = UInt64(max(0, interval) * 1_000_000_000)
        try await Task.sleep(nanoseconds: nanoseconds)
    }
}

@available(*, deprecated, renamed: "TaskSelectionCaptureSleeper")
public typealias ThreadSelectionCaptureSleeper = TaskSelectionCaptureSleeper

public struct LocalSelectionFileProvider: SelectionFileProvider {
    public init() {}

    public func readText(at url: URL) throws -> String? {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        return try String(contentsOf: url, encoding: .utf8)
    }
}

private struct ClosureSelectionFileProvider: SelectionFileProvider {
    let reader: @Sendable (URL) -> String?

    func readText(at url: URL) throws -> String? {
        reader(url)
    }
}

private struct ClosureSelectionClipboardProvider: SelectionClipboardProvider {
    let reader: @Sendable () -> String?

    func readText() throws -> String? {
        reader()
    }

    func captureContents() throws -> ClipboardContents {
        .empty
    }

    func restoreContents(_: ClipboardContents) throws {}
}

#if canImport(AppKit)
import AppKit

public struct SystemSelectionClipboardProvider: SelectionClipboardProvider {
    public init() {}

    public func readText() throws -> String? {
        NSPasteboard.general.string(forType: .string)
    }

    public func captureContents() throws -> ClipboardContents {
        let items: [[String: Data]] = NSPasteboard.general.pasteboardItems?.map { item in
            Dictionary(uniqueKeysWithValues: item.types.compactMap { type in
                guard let data = item.data(forType: type) else {
                    return nil
                }
                return (type.rawValue, data)
            })
        } ?? []
        return ClipboardContents(items: items)
    }

    public func restoreContents(_ contents: ClipboardContents) throws {
        let pasteboard = NSPasteboard.general
        let items = contents.items.map { representations in
            let item = NSPasteboardItem()
            for (rawType, data) in representations {
                item.setData(data, forType: NSPasteboard.PasteboardType(rawValue: rawType))
            }
            return item
        }

        if items.isEmpty {
            guard pasteboard.clearContents() != 0 else {
                throw SelectionClipboardError.restoreFailed
            }
            return
        }

        guard pasteboard.clearContents() != 0 else {
            throw SelectionClipboardError.restoreFailed
        }
        guard pasteboard.writeObjects(items) else {
            throw SelectionClipboardError.restoreFailed
        }
    }
}
#else
public struct SystemSelectionClipboardProvider: SelectionClipboardProvider {
    public init() {}

    public func readText() throws -> String? {
        nil
    }

    public func captureContents() throws -> ClipboardContents {
        .empty
    }

    public func restoreContents(_: ClipboardContents) throws {
        throw SelectionClipboardError.restoreFailed
    }
}
#endif

#if canImport(ApplicationServices) && canImport(CoreGraphics)
import ApplicationServices
import CoreGraphics

/// The companion needs Accessibility permission to inspect the focused element
/// and send Command-C to the frontmost application.
public struct SystemAccessibilitySelectionCopier: AccessibilitySelectionCopier {
    public init() {}

    public func copyFocusedSelection() throws {
        let systemWideElement = AXUIElementCreateSystemWide()
        var focusedElement: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(
            systemWideElement,
            kAXFocusedUIElementAttribute as CFString,
            &focusedElement
        )
        guard result == .success, focusedElement != nil else {
            throw AccessibilitySelectionCopyError.unavailable
        }

        guard let keyDown = CGEvent(
            keyboardEventSource: nil,
            virtualKey: 8,
            keyDown: true
        ),
        let keyUp = CGEvent(
            keyboardEventSource: nil,
            virtualKey: 8,
            keyDown: false
        ) else {
            throw AccessibilitySelectionCopyError.copyFailed
        }

        keyDown.flags = .maskCommand
        keyUp.flags = .maskCommand
        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)
    }
}
#else
public struct SystemAccessibilitySelectionCopier: AccessibilitySelectionCopier {
    public init() {}

    public func copyFocusedSelection() throws {
        throw AccessibilitySelectionCopyError.unavailable
    }
}
#endif
