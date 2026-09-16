import Combine
import Foundation

extension TranslationError: Error {}

public struct LookupRequest: Equatable, Sendable {
    public let requestId: String
    public let text: String

    init(requestId: String, text: String) {
        self.requestId = requestId
        self.text = text
    }
}

public enum LocalLookupState: Equatable {
    case idle
    case loading
    case ready(TranslationStageResponse)
    case error(TranslationError)
}

public enum AgentLookupState: Equatable {
    case idle
    case loading
    case ready(TranslationEnrichmentStageResponse)
    case error(TranslationError)
}

public struct LookupState: Equatable {
    public let requestId: String?
    public let selectedText: String?
    public let local: LocalLookupState
    public let agent: AgentLookupState
    public let startedAt: Date?
    public let elapsedSeconds: Double

    public init(
        requestId: String? = nil,
        selectedText: String? = nil,
        local: LocalLookupState = .idle,
        agent: AgentLookupState = .idle,
        startedAt: Date? = nil,
        elapsedSeconds: Double = 0
    ) {
        self.requestId = requestId
        self.selectedText = selectedText
        self.local = local
        self.agent = agent
        self.startedAt = startedAt
        self.elapsedSeconds = elapsedSeconds
    }

    public var isTimingActive: Bool {
        local == .loading || agent == .loading
    }

    public var timingLabel: String? {
        timingLabel(now: nil)
    }

    public func timingLabel(now: Date?) -> String? {
        guard elapsedSeconds > 0 || isTimingActive else {
            return nil
        }
        let elapsedSeconds = liveElapsedSeconds(now: now)
        let elapsed = Self.formatElapsed(elapsedSeconds)
        if agent == .loading {
            return "Enriching \(elapsed)"
        }
        if local == .loading {
            return "Waiting \(elapsed)"
        }
        if case .error = local {
            return "Failed after \(elapsed)"
        }
        if case .error = agent {
            return "Enrichment failed after \(elapsed)"
        }
        return "Ready in \(elapsed)"
    }

    public func elapsedLabel(now: Date?) -> String? {
        guard startedAt != nil || elapsedSeconds > 0 else {
            return nil
        }
        return "Elapsed \(Self.formatElapsed(liveElapsedSeconds(now: now, requireActive: false)))"
    }

    private func liveElapsedSeconds(now: Date?, requireActive: Bool = true) -> Double {
        guard (!requireActive || isTimingActive), let now, let startedAt else {
            return elapsedSeconds
        }
        return max(elapsedSeconds, now.timeIntervalSince(startedAt))
    }

    private static func formatElapsed(_ seconds: Double) -> String {
        "\(String(format: "%.1f", max(0, seconds)))s"
    }
}

@MainActor
public final class LookupStore: ObservableObject {
    @Published public private(set) var state = LookupState()

    public var currentRequestId: String? {
        state.requestId
    }

    public var selectedText: String? {
        state.selectedText
    }

    public func accepts(requestId: String) -> Bool {
        state.requestId == requestId
    }

    @discardableResult
    public func begin(text: String) -> Result<LookupRequest, TranslationError> {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let error = TranslationError(
                code: "EMPTY_SELECTION",
                message: "Selected text must not be empty."
            )
            state = LookupState(local: .error(error))
            return .failure(error)
        }

        let request = LookupRequest(requestId: UUID().uuidString, text: text)
        let now = Date()
        state = LookupState(
            requestId: request.requestId,
            selectedText: request.text,
            local: .loading,
            agent: .idle,
            startedAt: now,
            elapsedSeconds: 0
        )
        return .success(request)
    }

    public func accepts(request: LookupRequest) -> Bool {
        state.requestId == request.requestId
            && state.selectedText == request.text
    }

    public func applyLocalResponse(
        _ response: TranslationStageResponse,
        request: LookupRequest
    ) {
        guard accepts(response: response, request: request) else {
            return
        }

        let elapsed = elapsedSecondsUntilNow()
        state = LookupState(
            requestId: state.requestId,
            selectedText: state.selectedText,
            local: localState(for: response),
            agent: state.agent,
            startedAt: state.startedAt,
            elapsedSeconds: elapsed
        )
    }

    public func applyAgentResponse(
        _ response: TranslationEnrichmentStageResponse,
        request: LookupRequest
    ) {
        guard accepts(response: response, request: request) else {
            return
        }

        let nextAgentState = agentState(for: response)
        let elapsed = nextAgentState == .loading ? state.elapsedSeconds : elapsedSecondsUntilNow()
        state = LookupState(
            requestId: state.requestId,
            selectedText: state.selectedText,
            local: state.local,
            agent: nextAgentState,
            startedAt: state.startedAt,
            elapsedSeconds: elapsed
        )
    }

    public func refreshElapsedTime(now: Date = Date()) {
        guard state.isTimingActive, let startedAt = state.startedAt else {
            return
        }
        updateElapsedTime(now.timeIntervalSince(startedAt))
    }

    public func updateElapsedTime(_ elapsedSeconds: Double) {
        state = LookupState(
            requestId: state.requestId,
            selectedText: state.selectedText,
            local: state.local,
            agent: state.agent,
            startedAt: state.startedAt,
            elapsedSeconds: elapsedSeconds
        )
    }

    private func elapsedSecondsUntilNow() -> Double {
        guard let startedAt = state.startedAt else {
            return state.elapsedSeconds
        }
        return max(state.elapsedSeconds, Date().timeIntervalSince(startedAt))
    }

    private func accepts(
        response: TranslationStageResponse,
        request: LookupRequest
    ) -> Bool {
        accepts(request: request)
            && (response.requestId == nil || response.requestId == request.requestId)
    }

    private func accepts(
        response: TranslationEnrichmentStageResponse,
        request: LookupRequest
    ) -> Bool {
        accepts(request: request)
            && (response.requestId == nil || response.requestId == request.requestId)
    }

    private func localState(for response: TranslationStageResponse) -> LocalLookupState {
        switch response.status {
        case .loading:
            return .loading
        case .ready:
            return .ready(response)
        case .error:
            guard let error = response.error else {
                return .idle
            }
            return .error(error)
        }
    }

    private func agentState(
        for response: TranslationEnrichmentStageResponse
    ) -> AgentLookupState {
        switch response.status {
        case .loading:
            return .loading
        case .ready:
            return .ready(response)
        case .error:
            guard let error = response.error else {
                return .idle
            }
            return .error(error)
        }
    }
}
