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
