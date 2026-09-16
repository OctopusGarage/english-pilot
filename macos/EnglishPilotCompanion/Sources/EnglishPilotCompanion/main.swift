import AppKit
import Carbon
import Foundation

@MainActor
final class EnglishPilotCompanionApp: NSObject, NSApplicationDelegate {
    private static let hotKeySignature = OSType(0x45504C54) // EPLT
    private static let hotKeyID = UInt32(1)

    private let store = LookupStore()
    private var panelController: PanelController?
    private var process: EnglishPilotProcess?
    private var selectionCapture: SelectionCapture?
    private var statusItem: NSStatusItem?
    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var lookupTask: Task<Void, Never>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        void(notification)
        let executableURL = resolveEnglishPilotExecutableURL()
        let backend = resolveEnrichmentBackend()
        let environment = resolveProcessEnvironment()
        let process = EnglishPilotProcess(
            executableURL: executableURL,
            store: store,
            enrichmentBackend: backend,
            environment: environment
        )
        self.process = process
        self.selectionCapture = SelectionCapture(selectionFileURL: resolveSelectionFileURL())
        self.panelController = PanelController(
            store: store,
            executableURL: executableURL
        )
        configureStatusItem()
        registerHotKey()
    }

    func applicationWillTerminate(_ notification: Notification) {
        void(notification)
        lookupTask?.cancel()
        process?.cancel()
        unregisterHotKey()
    }

    private func configureStatusItem() {
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "EP"

        let menu = NSMenu()
        menu.addItem(NSMenuItem(
            title: "Translate Selection (Cmd+Shift+D)",
            action: #selector(runLookupFromMenu),
            keyEquivalent: ""
        ))
        menu.addItem(NSMenuItem(
            title: "Open Accessibility Settings",
            action: #selector(openAccessibilitySettings),
            keyEquivalent: ""
        ))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(
            title: "Quit EnglishPilot Companion",
            action: #selector(quit),
            keyEquivalent: "q"
        ))
        for item in menu.items {
            item.target = self
        }
        statusItem.menu = menu
        self.statusItem = statusItem
    }

    @objc private func runLookupFromMenu() {
        runLookup()
    }

    @objc private func openAccessibilitySettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else {
            return
        }
        NSWorkspace.shared.open(url)
    }

    @objc private func quit() {
        NSApplication.shared.terminate(nil)
    }

    private func registerHotKey() {
        if ProcessInfo.processInfo.environment["ENGLISH_PILOT_TRANSLATE_HOTKEY"] != nil {
            NSLog("ENGLISH_PILOT_TRANSLATE_HOTKEY is reserved for future configuration; using Cmd+Shift+D.")
        }

        let eventHotKeyIdentifier = EventHotKeyID(
            signature: Self.hotKeySignature,
            id: Self.hotKeyID
        )
        let modifierFlags = UInt32(cmdKey | shiftKey)
        let keyCode = UInt32(kVK_ANSI_D)
        let registerStatus = RegisterEventHotKey(
            keyCode,
            modifierFlags,
            eventHotKeyIdentifier,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
        guard registerStatus == noErr else {
            NSLog("Failed to register EnglishPilot hotkey Cmd+Shift+D: \(registerStatus)")
            return
        }

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let selfPointer = Unmanaged.passUnretained(self).toOpaque()
        let handlerStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let event, let userData else {
                    return noErr
                }
                var eventHotKeyID = EventHotKeyID()
                let status = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &eventHotKeyID
                )
                guard status == noErr,
                      eventHotKeyID.signature == EnglishPilotCompanionApp.hotKeySignature,
                      eventHotKeyID.id == EnglishPilotCompanionApp.hotKeyID else {
                    return noErr
                }
                let app = Unmanaged<EnglishPilotCompanionApp>
                    .fromOpaque(userData)
                    .takeUnretainedValue()
                Task { @MainActor in
                    app.runLookup()
                }
                return noErr
            },
            1,
            &eventType,
            selfPointer,
            &hotKeyHandler
        )
        if handlerStatus != noErr {
            NSLog("Failed to install EnglishPilot hotkey handler: \(handlerStatus)")
        }
    }

    private func unregisterHotKey() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
        }
        if let hotKeyHandler {
            RemoveEventHandler(hotKeyHandler)
        }
    }

    private func runLookup() {
        lookupTask?.cancel()
        process?.cancel()
        lookupTask = Task { @MainActor [weak self] in
            guard let self else {
                return
            }
            await self.performLookup()
        }
    }

    private func performLookup() async {
        guard let selectionCapture, let process, let panelController else {
            return
        }

        do {
            let selectedText = try await selectionCapture.readSelection()
            let requestResult = store.begin(text: selectedText)
            switch requestResult {
            case .success(let request):
                panelController.show()
                _ = await process.lookup(request)
            case .failure(let error):
                showCaptureError(error)
            }
        } catch is CancellationError {
            return
        } catch let error as SelectionCaptureError {
            showCaptureError(translationError(for: error))
        } catch {
            showCaptureError(TranslationError(
                code: "SELECTION_CAPTURE_FAILED",
                message: error.localizedDescription
            ))
        }
    }

    private func showCaptureError(_ error: TranslationError) {
        let label = error.code == "NO_SELECTION" ? "No text selected" : "Selection capture failed"
        switch store.begin(text: label) {
        case .success(let request):
            store.applyLocalResponse(
                TranslationStageResponse(status: .error, error: error),
                request: request
            )
        case .failure:
            break
        }
        panelController?.show()
    }

    private func translationError(for error: SelectionCaptureError) -> TranslationError {
        let code: String
        switch error {
        case .noSelection:
            code = "NO_SELECTION"
        case .fileReadFailed:
            code = "SELECTION_FILE_READ_FAILED"
        case .clipboardReadFailed:
            code = "CLIPBOARD_READ_FAILED"
        case .clipboardSnapshotFailed:
            code = "CLIPBOARD_SNAPSHOT_FAILED"
        case .accessibilityUnavailable:
            code = "ACCESSIBILITY_UNAVAILABLE"
        case .copyFailed:
            code = "SELECTION_COPY_FAILED"
        case .restorationFailed:
            code = "CLIPBOARD_RESTORATION_FAILED"
        }
        return TranslationError(code: code, message: error.description)
    }
}

private func resolveEnglishPilotExecutableURL() -> URL {
    let environment = ProcessInfo.processInfo.environment
    if let configured = environment["ENGLISH_PILOT_BINARY"], !configured.isEmpty {
        return URL(fileURLWithPath: configured)
    }
    if let bundledCLI = Bundle.main.resourceURL?.appendingPathComponent("dist/src/bin/english-pilot.js"),
       FileManager.default.isExecutableFile(atPath: bundledCLI.path) {
        return bundledCLI
    }
    return URL(fileURLWithPath: "/usr/local/bin/english-pilot")
}

private func resolveSelectionFileURL() -> URL? {
    let environment = ProcessInfo.processInfo.environment
    guard let path = environment["ENGLISH_PILOT_SELECTION_FILE"], !path.isEmpty else {
        return nil
    }
    return URL(fileURLWithPath: path)
}

private func resolveEnrichmentBackend() -> EnglishPilotBackend? {
    switch ProcessInfo.processInfo.environment["ENGLISH_PILOT_TRANSLATE_AGENT"]?.lowercased() {
    case "claude":
        return .claude
    case "codex":
        return .codex
    case "off", "none", "false", "0":
        return nil
    default:
        return .codex
    }
}

private func resolveProcessEnvironment() -> [String: String] {
    var environment: [String: String] = [:]
    if let codexBinary = resolveCodexBinaryPath() {
        environment["ENGLISH_PILOT_CODEX_BINARY"] = codexBinary
    }
    return environment
}

private func resolveCodexBinaryPath() -> String? {
    let processEnvironment = ProcessInfo.processInfo.environment
    if let configured = processEnvironment["ENGLISH_PILOT_CODEX_BINARY"], !configured.isEmpty {
        return configured
    }
    if let resourceURL = Bundle.main.resourceURL?.appendingPathComponent("codex-path.txt"),
       let value = try? String(contentsOf: resourceURL, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines),
       !value.isEmpty {
        return value
    }
    return nil
}

private func void<T>(_ value: T) {
    _ = value
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = EnglishPilotCompanionApp()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    app.run()
    _ = delegate
}
