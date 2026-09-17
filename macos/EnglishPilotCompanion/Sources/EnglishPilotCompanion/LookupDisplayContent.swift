import Foundation

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
