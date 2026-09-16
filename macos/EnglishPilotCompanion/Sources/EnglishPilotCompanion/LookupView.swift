import SwiftUI

struct LookupViewActions: Sendable {
    var copyResult: @MainActor @Sendable () -> Void
    var recordForReview: @MainActor @Sendable () -> Void
    var close: @MainActor @Sendable () -> Void

    static let noop = LookupViewActions(
        copyResult: {},
        recordForReview: {},
        close: {}
    )
}

public struct LookupResultFormatter {
    public static func formattedResult(
        selectedText: String?,
        localResult: LocalTranslationResult?,
        enrichment: TranslationEnrichment?
    ) -> String {
        let content = LookupDisplayContent(
            selectedText: selectedText,
            localResult: localResult,
            enrichment: enrichment,
            localError: nil,
            agentError: nil
        )
        return content.formattedResult
    }
}

public struct LookupView: View {
    @ObservedObject private var store: LookupStore
    @State private var timerNow = Date()
    private let actions: LookupViewActions
    private let elapsedTimer = Timer.publish(every: 0.2, on: .main, in: .common).autoconnect()

    init(store: LookupStore, actions: LookupViewActions = .noop) {
        self.store = store
        self.actions = actions
    }

    public var body: some View {
        let content = LookupDisplayContent(state: store.state, now: timerNow)

        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    section("Original", content.original)
                    normalizedSection(content)
                    section("Translation", content.translation)
                    if let timingMessage = content.timingMessage {
                        Text(timingMessage)
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    if !content.pronunciationRows.isEmpty {
                        keyValueSection(content.pronunciationRows)
                    }

                    section("Explanation", content.explanation)

                    if !content.examples.isEmpty {
                        listSection("Examples", content.examples)
                    }

                    if !content.collocations.isEmpty {
                        listSection("Collocations", content.collocations)
                    }

                    if let error = content.statusMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
            }
            Divider()
            actionBar
        }
        .frame(width: 440)
        .frame(minWidth: 360, maxWidth: 520, maxHeight: 640)
        .background(Color(nsColor: .windowBackgroundColor))
        .onReceive(elapsedTimer) { now in
            timerNow = now
        }
    }

    private var header: some View {
        HStack {
            Text("EnglishPilot")
                .font(.headline)
            Spacer()
            Button(action: actions.close) {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
            .help("Close")
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button(action: actions.copyResult) {
                Label("Copy", systemImage: "doc.on.doc")
            }
            Button(action: actions.recordForReview) {
                Label("Record for Review", systemImage: "tray.and.arrow.down")
            }
            Spacer()
            Button("Close", action: actions.close)
                .keyboardShortcut(.cancelAction)
        }
        .padding(14)
    }

    private func normalizedSection(_ content: LookupDisplayContent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Normalized")
                .font(.caption)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text("\(content.normalized) · \(content.kind)")
                .font(.body)
                .textSelection(.enabled)
        }
    }

    private func section(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(text)
                .font(title == "Translation" ? .title3.weight(.semibold) : .body)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func keyValueSection(_ rows: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(rows, id: \.0) { label, value in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(width: 96, alignment: .leading)
                    Text(value)
                        .font(.body)
                        .textSelection(.enabled)
                }
            }
        }
    }

    private func listSection(_ title: String, _ values: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            ForEach(values, id: \.self) { value in
                Text("• \(value)")
                    .font(.body)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct LookupDisplayContent {
    let original: String
    let normalized: String
    let kind: String
    let translation: String
    let pronunciationRows: [(String, String)]
    let explanation: String
    let examples: [String]
    let collocations: [String]
    let statusMessage: String?
    let timingMessage: String?

    init(state: LookupState, now: Date? = nil) {
        let localResult: LocalTranslationResult?
        let localError: TranslationError?
        switch state.local {
        case .ready(let response):
            localResult = response.result
            localError = nil
        case .error(let error):
            localResult = nil
            localError = error
        case .idle, .loading:
            localResult = nil
            localError = nil
        }

        let enrichment: TranslationEnrichment?
        let agentError: TranslationError?
        let agentLoading: Bool
        let agentIdle: Bool
        switch state.agent {
        case .ready(let response):
            enrichment = response.result
            agentError = nil
            agentLoading = false
            agentIdle = false
        case .error(let error):
            enrichment = nil
            agentError = error
            agentLoading = false
            agentIdle = false
        case .loading:
            enrichment = nil
            agentError = nil
            agentLoading = true
            agentIdle = false
        case .idle:
            enrichment = nil
            agentError = nil
            agentLoading = false
            agentIdle = true
        }

        let missingLocalTranslation = localResult != nil
            && nonEmpty(localResult?.translation) == nil
            && enrichment == nil
            && agentIdle
        let timingMessage = state.timingLabel(now: now)
            ?? (missingLocalTranslation ? state.elapsedLabel(now: now) : nil)

        self.init(
            selectedText: state.selectedText,
            localResult: localResult,
            enrichment: enrichment,
            localError: localError,
            agentError: agentError,
            agentLoading: agentLoading,
            agentIdle: agentIdle,
            timingMessage: timingMessage
        )
    }

    init(
        selectedText: String?,
        localResult: LocalTranslationResult?,
        enrichment: TranslationEnrichment?,
        localError: TranslationError?,
        agentError: TranslationError?,
        agentLoading: Bool = false,
        agentIdle: Bool = true,
        timingMessage: String? = nil
    ) {
        original = nonEmpty(localResult?.original) ?? nonEmpty(selectedText) ?? "No text selected"
        normalized = nonEmpty(localResult?.normalized) ?? original
        kind = localResult?.kind.rawValue ?? "selection"
        translation = nonEmpty(enrichment?.translation)
            ?? nonEmpty(localResult?.translation)
            ?? (agentLoading ? "Translation pending enrichment" : "No local translation available")
        explanation = nonEmpty(enrichment?.explanation)
            ?? nonEmpty(localResult?.explanation)
            ?? localError?.message
            ?? "Looking up the selected text."
        examples = enrichment?.examples.isEmpty == false
            ? enrichment?.examples ?? []
            : localResult?.examples ?? []
        collocations = enrichment?.collocations.isEmpty == false
            ? enrichment?.collocations ?? []
            : localResult?.collocations ?? []

        var rows: [(String, String)] = []
        if localResult?.kind == .word {
            if let pronunciation = nonEmpty(localResult?.pronunciation) {
                rows.append(("Pronunciation", pronunciation))
            } else if let ipa = localResult?.ipa.first {
                rows.append(("Pronunciation", ipa.ipa))
            }
        } else if let ipa = localResult?.ipa.first {
            rows.append(("Key pronunciation", "\(ipa.word) \(ipa.ipa)"))
        }
        if let partOfSpeech = nonEmpty(enrichment?.partOfSpeech) ?? nonEmpty(localResult?.partOfSpeech) {
            rows.append(("Part of speech", partOfSpeech))
        }
        pronunciationRows = rows

        let missingLocalTranslation = localResult != nil
            && nonEmpty(localResult?.translation) == nil
            && enrichment == nil
            && agentIdle

        if let localError {
            statusMessage = "\(localError.code): \(localError.message)"
        } else if let agentError {
            statusMessage = "\(agentError.code): \(agentError.message)"
        } else if missingLocalTranslation {
            statusMessage = "No enrichment is running. Launch with ENGLISH_PILOT_TRANSLATE_AGENT=codex for arbitrary phrase translation."
        } else {
            statusMessage = nil
        }
        self.timingMessage = timingMessage
    }

    var formattedResult: String {
        var lines = [
            "Original: \(original)",
            "Normalized: \(normalized) (\(kind))",
            "Translation: \(translation)"
        ]

        for row in pronunciationRows {
            lines.append("\(row.0): \(row.1)")
        }

        lines.append("Explanation: \(explanation)")
        appendList(title: "Examples", values: examples, to: &lines)
        appendList(title: "Collocations", values: collocations, to: &lines)
        return lines.joined(separator: "\n")
    }
}

private func appendList(title: String, values: [String], to lines: inout [String]) {
    guard !values.isEmpty else {
        return
    }
    lines.append("\(title):")
    lines.append(contentsOf: values.map { "- \($0)" })
}

private func nonEmpty(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
        return nil
    }
    return trimmed
}
