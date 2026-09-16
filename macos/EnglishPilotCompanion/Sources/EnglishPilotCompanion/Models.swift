import Foundation

public enum TranslationSelectionKind: String, Codable, Sendable {
    case word
    case phrase
    case sentence
}

public enum TranslationStage: String, Codable, Sendable {
    case local
    case agent
}

public enum TranslationStatus: String, Codable, Sendable {
    case loading
    case ready
    case error
}

public struct TranslationRequest: Codable, Equatable, Sendable {
    public let requestId: String
    public let text: String
    public let source: String
    public let context: String?

    public init(requestId: String, text: String, source: String, context: String? = nil) {
        self.requestId = requestId
        self.text = text
        self.source = source
        self.context = context
    }
}

public struct TranslationError: Codable, Equatable, Sendable {
    public let code: String
    public let message: String

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

public struct TranslationLesson: Codable, Equatable, Sendable {
    public let suggested: String
    public let scene: String
    public let pattern: String
    public let tags: [String]
    public let worthRecording: Bool

    public init(
        suggested: String,
        scene: String,
        pattern: String,
        tags: [String],
        worthRecording: Bool
    ) {
        self.suggested = suggested
        self.scene = scene
        self.pattern = pattern
        self.tags = tags
        self.worthRecording = worthRecording
    }
}

public struct PronunciationEntry: Codable, Equatable, Sendable {
    public let word: String
    public let ipa: String

    public init(word: String, ipa: String) {
        self.word = word
        self.ipa = ipa
    }
}

public struct LocalTranslationResult: Codable, Equatable, Sendable {
    public let original: String
    public let normalized: String
    public let kind: TranslationSelectionKind
    public let translation: String?
    public let pronunciation: String?
    public let partOfSpeech: String?
    public let explanation: String
    public let examples: [String]
    public let collocations: [String]
    public let ipa: [PronunciationEntry]
    public let lesson: TranslationLesson

    public init(
        original: String,
        normalized: String,
        kind: TranslationSelectionKind,
        translation: String? = nil,
        pronunciation: String? = nil,
        partOfSpeech: String? = nil,
        explanation: String,
        examples: [String],
        collocations: [String],
        ipa: [PronunciationEntry],
        lesson: TranslationLesson
    ) {
        self.original = original
        self.normalized = normalized
        self.kind = kind
        self.translation = translation
        self.pronunciation = pronunciation
        self.partOfSpeech = partOfSpeech
        self.explanation = explanation
        self.examples = examples
        self.collocations = collocations
        self.ipa = ipa
        self.lesson = lesson
    }
}

public struct TranslationEnrichment: Codable, Equatable, Sendable {
    public let translation: String
    public let partOfSpeech: String?
    public let explanation: String
    public let examples: [String]
    public let collocations: [String]

    public init(
        translation: String,
        partOfSpeech: String? = nil,
        explanation: String,
        examples: [String] = [],
        collocations: [String] = []
    ) {
        self.translation = translation
        self.partOfSpeech = partOfSpeech
        self.explanation = explanation
        self.examples = examples
        self.collocations = collocations
    }

    private enum CodingKeys: String, CodingKey {
        case translation
        case partOfSpeech
        case explanation
        case examples
        case collocations
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.translation = try decodeRequiredField(
            .translation,
            from: container,
            maxLength: 2_000
        )
        self.partOfSpeech = try decodeOptionalField(
            .partOfSpeech,
            from: container,
            maxLength: 128
        )
        self.explanation = try decodeRequiredField(
            .explanation,
            from: container,
            maxLength: 4_000
        )
        self.examples = try decodeList(.examples, from: container)
        self.collocations = try decodeList(.collocations, from: container)
    }
}

public struct TranslationStageResponse: Codable, Equatable, Sendable {
    public let requestId: String?
    public let source: String?
    public let stage: TranslationStage
    public let status: TranslationStatus
    public let result: LocalTranslationResult?
    public let error: TranslationError?

    public init(
        requestId: String? = nil,
        source: String? = nil,
        stage: TranslationStage = .local,
        status: TranslationStatus,
        result: LocalTranslationResult? = nil,
        error: TranslationError? = nil
    ) {
        precondition(stage == .local, "Local translation responses must use stage local.")
        precondition(
            status == .error || (requestId != nil && source != nil),
            "Loading and ready responses require requestId and source."
        )
        precondition(
            isValidMetadata(requestId) && isValidMetadata(source),
            "Translation response metadata must be non-empty strings of at most 128 characters."
        )
        precondition(
            isValid(status: status, result: result, error: error),
            "Local translation response fields do not match status."
        )
        self.requestId = requestId
        self.source = source
        self.stage = stage
        self.status = status
        self.result = result
        self.error = error
    }

    private enum CodingKeys: String, CodingKey {
        case requestId
        case source
        case stage
        case status
        case result
        case error
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let stage = try container.decode(TranslationStage.self, forKey: .stage)
        guard stage == .local else {
            throw DecodingError.dataCorruptedError(
                forKey: .stage,
                in: container,
                debugDescription: "Local translation responses must use stage local."
            )
        }

        let status = try container.decode(TranslationStatus.self, forKey: .status)
        let requestId = try decodeMetadata(.requestId, for: status, from: container)
        let source = try decodeMetadata(.source, for: status, from: container)
        let result: LocalTranslationResult?
        let error: TranslationError?
        switch status {
        case .loading:
            try validateAbsent([.result, .error], in: container, status: status)
            result = nil
            error = nil
        case .ready:
            try validateAbsent([.error], in: container, status: status)
            result = try container.decode(LocalTranslationResult.self, forKey: .result)
            error = nil
        case .error:
            try validateAbsent([.result], in: container, status: status)
            result = nil
            error = try container.decode(TranslationError.self, forKey: .error)
        }

        self.requestId = requestId
        self.source = source
        self.stage = stage
        self.status = status
        self.result = result
        self.error = error
    }
}

public struct TranslationEnrichmentStageResponse: Codable, Equatable, Sendable {
    public let requestId: String?
    public let source: String?
    public let stage: TranslationStage
    public let status: TranslationStatus
    public let result: TranslationEnrichment?
    public let error: TranslationError?
    public let dryRun: Bool?
    public let invocation: JSONValue?

    public init(
        requestId: String? = nil,
        source: String? = nil,
        stage: TranslationStage = .agent,
        status: TranslationStatus,
        result: TranslationEnrichment? = nil,
        error: TranslationError? = nil,
        dryRun: Bool? = nil,
        invocation: JSONValue? = nil
    ) {
        precondition(stage == .agent, "Translation enrichment responses must use stage agent.")
        precondition(
            status == .error || (requestId != nil && source != nil),
            "Loading and ready responses require requestId and source."
        )
        precondition(
            isValidMetadata(requestId) && isValidMetadata(source),
            "Translation response metadata must be non-empty strings of at most 128 characters."
        )
        precondition(
            isValid(status: status, result: result, error: error),
            "Translation enrichment response fields do not match status."
        )
        self.requestId = requestId
        self.source = source
        self.stage = stage
        self.status = status
        self.result = result
        self.error = error
        self.dryRun = dryRun
        self.invocation = invocation
    }

    private enum CodingKeys: String, CodingKey {
        case requestId
        case source
        case stage
        case status
        case result
        case error
        case dryRun
        case invocation
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let stage = try container.decode(TranslationStage.self, forKey: .stage)
        guard stage == .agent else {
            throw DecodingError.dataCorruptedError(
                forKey: .stage,
                in: container,
                debugDescription: "Translation enrichment responses must use stage agent."
            )
        }

        let status = try container.decode(TranslationStatus.self, forKey: .status)
        let requestId = try decodeMetadata(.requestId, for: status, from: container)
        let source = try decodeMetadata(.source, for: status, from: container)
        let result: TranslationEnrichment?
        let error: TranslationError?
        switch status {
        case .loading:
            try validateAbsent([.result, .error], in: container, status: status)
            result = nil
            error = nil
        case .ready:
            try validateAbsent([.error], in: container, status: status)
            result = try container.decode(TranslationEnrichment.self, forKey: .result)
            error = nil
        case .error:
            try validateAbsent([.result], in: container, status: status)
            result = nil
            error = try container.decode(TranslationError.self, forKey: .error)
        }

        self.requestId = requestId
        self.source = source
        self.stage = stage
        self.status = status
        self.result = result
        self.error = error
        self.dryRun = try container.decodeIfPresent(Bool.self, forKey: .dryRun)
        self.invocation = try container.decodeIfPresent(JSONValue.self, forKey: .invocation)
    }
}

private func decodeRequiredField<Key: CodingKey>(
    _ key: Key,
    from container: KeyedDecodingContainer<Key>,
    maxLength: Int
) throws -> String {
    let value = try container.decode(String.self, forKey: key)
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: container,
            debugDescription: "\(key.stringValue) must be a non-empty string."
        )
    }
    try validateLength(value, key: key, maxLength: maxLength, in: container)
    return value.trimmingCharacters(in: .whitespacesAndNewlines)
}

private func decodeOptionalField<Key: CodingKey>(
    _ key: Key,
    from container: KeyedDecodingContainer<Key>,
    maxLength: Int
) throws -> String? {
    guard container.contains(key) else {
        return nil
    }
    let value = try container.decode(String.self, forKey: key)
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: container,
            debugDescription: "\(key.stringValue) must be a non-empty string."
        )
    }
    try validateLength(value, key: key, maxLength: maxLength, in: container)
    return value.trimmingCharacters(in: .whitespacesAndNewlines)
}

private func decodeList<Key: CodingKey>(
    _ key: Key,
    from container: KeyedDecodingContainer<Key>
) throws -> [String] {
    guard container.contains(key) else {
        return []
    }
    let values = try container.decode([String].self, forKey: key)
    guard values.count <= 8 else {
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: container,
            debugDescription: "\(key.stringValue) exceeds the 8-item limit."
        )
    }

    return try values.map { value in
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "\(key.stringValue) items must be non-empty strings."
            )
        }
        guard value.utf16.count <= 500 else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "\(key.stringValue) items exceed the 500-character limit."
            )
        }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private func validateLength<Key: CodingKey>(
    _ value: String,
    key: Key,
    maxLength: Int,
    in container: KeyedDecodingContainer<Key>
) throws {
    guard value.utf16.count <= maxLength else {
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: container,
            debugDescription: "\(key.stringValue) exceeds the \(maxLength)-character limit."
        )
    }
}

private func decodeMetadata<Key: CodingKey>(
    _ key: Key,
    for status: TranslationStatus,
    from container: KeyedDecodingContainer<Key>
) throws -> String? {
    if status == .error {
        return try decodeOptionalField(key, from: container, maxLength: 128)
    }
    return try decodeRequiredField(key, from: container, maxLength: 128)
}

private func isValidMetadata(_ value: String?) -> Bool {
    guard let value else {
        return true
    }
    return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && value.utf16.count <= 128
}

private func validateAbsent<Key: CodingKey>(
    _ keys: [Key],
    in container: KeyedDecodingContainer<Key>,
    status: TranslationStatus
) throws {
    for key in keys where container.contains(key) {
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: container,
            debugDescription: "Status \(status.rawValue) must not include \(key.stringValue)."
        )
    }
}

private func isValid(
    status: TranslationStatus,
    result: LocalTranslationResult?,
    error: TranslationError?
) -> Bool {
    switch status {
    case .loading:
        return result == nil && error == nil
    case .ready:
        return result != nil && error == nil
    case .error:
        return result == nil && error != nil
    }
}

private func isValid(
    status: TranslationStatus,
    result: TranslationEnrichment?,
    error: TranslationError?
) -> Bool {
    switch status {
    case .loading:
        return result == nil && error == nil
    case .ready:
        return result != nil && error == nil
    case .error:
        return result == nil && error != nil
    }
}

public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null:
            try container.encodeNil()
        case .bool(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        }
    }
}
