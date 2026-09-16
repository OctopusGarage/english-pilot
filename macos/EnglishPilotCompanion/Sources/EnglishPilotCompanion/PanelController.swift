import AppKit
import SwiftUI

@MainActor
public final class PanelController: NSObject, NSWindowDelegate {
    private let store: LookupStore
    private let executableURL: URL
    private let runner: any EnglishPilotProcessRunning
    private var panel: NSPanel?

    public init(
        store: LookupStore,
        executableURL: URL,
        runner: any EnglishPilotProcessRunning = SystemEnglishPilotProcessRunner()
    ) {
        self.store = store
        self.executableURL = executableURL
        self.runner = runner
    }

    public func show() {
        let panel = existingOrCreatePanel()
        panel.contentView = NSHostingView(rootView: LookupView(
            store: store,
            actions: LookupViewActions(
                copyResult: { [weak self] in self?.copyResult() },
                recordForReview: { [weak self] in self?.recordForReview() },
                close: { [weak self] in self?.close() }
            )
        ))
        position(panel)
        panel.orderFrontRegardless()
    }

    public func close() {
        panel?.orderOut(nil)
    }

    private func existingOrCreatePanel() -> NSPanel {
        if let panel {
            return panel
        }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 640),
            styleMask: [.titled, .closable, .utilityWindow, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.title = "EnglishPilot"
        panel.delegate = self
        self.panel = panel
        return panel
    }

    private func copyResult() {
        let display = LookupDisplayContent(state: store.state)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(display.formattedResult, forType: .string)
    }

    private func recordForReview() {
        guard let request = recordableRequest() else {
            return
        }

        let executableURL = self.executableURL
        let runner = self.runner
        Task.detached {
            do {
                let stdin = try JSONEncoder().encode(request)
                _ = try await runner.run(EnglishPilotProcessCommand(
                    executableURL: executableURL,
                    arguments: ["translate", "--request-json", "--record", "--json"],
                    stdin: stdin
                ))
            } catch is CancellationError {
                return
            } catch {
                return
            }
        }
    }

    private func recordableRequest() -> TranslationRequest? {
        guard let text = store.selectedText,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return TranslationRequest(
            requestId: store.currentRequestId ?? UUID().uuidString,
            text: text,
            source: "ghostty"
        )
    }

    private func position(_ panel: NSPanel) {
        let visibleFrame = activeScreen().visibleFrame
        let size = panel.frame.size
        let origin = NSPoint(
            x: visibleFrame.midX - size.width / 2,
            y: visibleFrame.midY - size.height / 2
        )
        panel.setFrameOrigin(origin)
    }

    private func activeScreen() -> NSScreen {
        let mouseLocation = NSEvent.mouseLocation
        return NSScreen.screens.first { $0.frame.contains(mouseLocation) }
            ?? NSScreen.main
            ?? NSScreen.screens.first
            ?? NSScreen()
    }

    public func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }
}
