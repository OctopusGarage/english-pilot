import Foundation
import XCTest
@testable import EnglishPilotCompanion

@MainActor
final class LookupStoreTests: XCTestCase {
    func testNewRequestInvalidatesOlderRequest() throws {
        let store = LookupStore()
        let first = try XCTUnwrap(try? store.begin(text: "first").get())
        let second = try XCTUnwrap(try? store.begin(text: "second").get())

        XCTAssertFalse(store.accepts(request: first))
        XCTAssertTrue(store.accepts(request: second))
        XCTAssertEqual(store.currentRequestId, second.requestId)
        XCTAssertEqual(store.selectedText, "second")
    }

    func testAcceptsRequestIdInspectsOnlyCurrentRequestId() throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try? store.begin(text: "workflow").get())
        let sameIdDifferentText = LookupRequest(
            requestId: request.requestId,
            text: "different selection"
        )

        XCTAssertTrue(store.accepts(requestId: request.requestId))
        XCTAssertFalse(store.accepts(requestId: "different-request"))
        XCTAssertFalse(store.accepts(request: sameIdDifferentText))
    }

    func testBeginGeneratesUUIDAndReplacesCurrentState() throws {
        let store = LookupStore()

        let request = try XCTUnwrap(try? store.begin(text: "workflow").get())

        XCTAssertNotNil(UUID(uuidString: request.requestId))
        XCTAssertEqual(store.currentRequestId, request.requestId)
        XCTAssertEqual(store.selectedText, "workflow")
        XCTAssertEqual(store.state.local, .loading)
        XCTAssertEqual(store.state.agent, .idle)
    }

    func testLookupStateTracksElapsedWaitingTime() throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try? store.begin(text: "workflow").get())

        store.updateElapsedTime(1.25)

        XCTAssertEqual(store.state.elapsedSeconds, 1.25)
        XCTAssertEqual(store.state.timingLabel, "Waiting 1.3s")

        store.applyLocalResponse(Self.localReadyResponse(requestId: request.requestId), request: request)

        XCTAssertEqual(store.state.timingLabel, "Ready in 1.3s")
    }

    func testInitialStateHasNoRequestAndNoResponse() {
        let store = LookupStore()

        XCTAssertNil(store.currentRequestId)
        XCTAssertNil(store.selectedText)
        XCTAssertEqual(store.state.local, .idle)
        XCTAssertEqual(store.state.agent, .idle)
    }

    func testApplyingLocalReadyResponseTransitionsLocalStateToReady() throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try? store.begin(text: "workflow").get())
        let response = Self.localReadyResponse(requestId: request.requestId)

        store.applyLocalResponse(response, request: request)

        XCTAssertEqual(store.state.local, .ready(response))
        XCTAssertEqual(store.state.agent, .idle)
        XCTAssertEqual(store.currentRequestId, request.requestId)
    }

    func testApplyingAgentResponsesTransitionsAgentState() throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try? store.begin(text: "workflow").get())
        let loading = Self.agentLoadingResponse(requestId: request.requestId)
        let error = TranslationError(code: "AGENT_FAILED", message: "Agent failed.")
        let failed = Self.agentErrorResponse(error: error)

        store.applyAgentResponse(loading, request: request)
        XCTAssertEqual(store.state.agent, .loading)

        store.applyAgentResponse(failed, request: request)
        XCTAssertEqual(store.state.agent, .error(error))
        XCTAssertEqual(store.state.local, .loading)
    }

    func testStaleResponsesDoNotChangeCurrentState() throws {
        let store = LookupStore()
        let first = try XCTUnwrap(try? store.begin(text: "first").get())
        let second = try XCTUnwrap(try? store.begin(text: "second").get())
        let localResponse = Self.localReadyResponse(requestId: first.requestId)
        let agentResponse = Self.agentLoadingResponse(requestId: first.requestId)

        store.applyLocalResponse(localResponse, request: first)
        store.applyAgentResponse(agentResponse, request: first)

        XCTAssertEqual(store.state, LookupState(
            requestId: second.requestId,
            selectedText: "second",
            local: .loading,
            agent: .idle
        ))
    }

    func testConflictingEmbeddedRequestIdDoesNotChangeCompleteState() throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try? store.begin(text: "workflow").get())
        let agentResponse = Self.agentLoadingResponse(requestId: request.requestId)
        store.applyAgentResponse(agentResponse, request: request)
        let before = store.state
        let conflictingResponse = Self.localReadyResponse(requestId: "different-request")

        store.applyLocalResponse(conflictingResponse, request: request)

        XCTAssertEqual(store.state, before)
    }

    func testSameRequestIdWithDifferentTextIsRejectedByBothResponsePaths() throws {
        let store = LookupStore()
        let beginResult = store.begin(text: "workflow")
        Self.assertSendable(beginResult)
        let request = try XCTUnwrap(try? beginResult.get())
        let mismatchedRequest = LookupRequest(
            requestId: request.requestId,
            text: "different selection"
        )
        let before = store.state

        XCTAssertFalse(store.accepts(request: mismatchedRequest))

        store.applyLocalResponse(
            Self.localReadyResponse(requestId: request.requestId),
            request: mismatchedRequest
        )
        store.applyAgentResponse(
            Self.agentLoadingResponse(requestId: request.requestId),
            request: mismatchedRequest
        )

        XCTAssertEqual(store.state, before)
    }

    func testResponsesCanCrossIntoMainActorApplicationMethods() async throws {
        let localError = TranslationError(
            code: "LOCAL_FAILED",
            message: "Local lookup failed."
        )
        let agentError = TranslationError(
            code: "AGENT_FAILED",
            message: "Agent lookup failed."
        )
        let local = TranslationStageResponse(status: .error, error: localError)
        let agent = TranslationEnrichmentStageResponse(status: .error, error: agentError)
        Self.assertSendable(local)
        Self.assertSendable(agent)

        let applied = await applyResponsesOnMainActor(
            local: local,
            agent: agent
        )

        XCTAssertTrue(applied)
    }

    func testStaleErrorWithoutEmbeddedRequestIdDoesNotChangeCompleteState() throws {
        let store = LookupStore()
        let first = try XCTUnwrap(try? store.begin(text: "first").get())
        let second = try XCTUnwrap(try? store.begin(text: "second").get())
        let localResponse = Self.localReadyResponse(requestId: second.requestId)
        store.applyLocalResponse(localResponse, request: second)
        let before = store.state
        let staleError = Self.agentErrorResponse(
            error: TranslationError(code: "AGENT_FAILED", message: "Agent failed.")
        )

        store.applyAgentResponse(staleError, request: first)

        XCTAssertEqual(store.state, before)
    }

    func testEmptySelectionSetsExplicitErrorWithoutReturningRequest() {
        let expectedError = TranslationError(
            code: "EMPTY_SELECTION",
            message: "Selected text must not be empty."
        )

        for text in ["", " \n\t "] {
            let store = LookupStore()
            let result = store.begin(text: text)

            XCTAssertEqual(store.state.local, .error(expectedError))
            XCTAssertEqual(store.state.agent, .idle)
            XCTAssertNil(store.currentRequestId)
            XCTAssertNil(store.selectedText)
            guard case .failure(let error) = result else {
                return XCTFail("Blank text must not return a LookupRequest.")
            }
            XCTAssertEqual(error, expectedError)
        }
    }

    func testBlankBeginClearsRequestAndRejectsLateResponseFromPriorRequest() throws {
        let store = LookupStore()
        let previousRequest = try XCTUnwrap(try? store.begin(text: "previous").get())
        let expectedError = TranslationError(
            code: "EMPTY_SELECTION",
            message: "Selected text must not be empty."
        )

        let result = store.begin(text: " \n\t ")

        guard case .failure(let error) = result else {
            return XCTFail("Blank text must not return a LookupRequest.")
        }
        XCTAssertEqual(error, expectedError)
        XCTAssertNil(store.currentRequestId)
        XCTAssertNil(store.selectedText)
        XCTAssertEqual(store.state.local, .error(expectedError))
        XCTAssertEqual(store.state.agent, .idle)

        let lateResponse = Self.agentErrorResponse(
            error: TranslationError(code: "LATE_ERROR", message: "Late response.")
        )
        store.applyAgentResponse(lateResponse, request: previousRequest)

        XCTAssertEqual(store.state.local, .error(expectedError))
        XCTAssertEqual(store.state.agent, .idle)
    }

    func testSentenceDisplayLabelsIpaAsKeyPronunciation() {
        let lesson = TranslationLesson(
            suggested: "local lookup finished quickly",
            scene: "debugging",
            pattern: "Describe what happened.",
            tags: ["debugging"],
            worthRecording: false
        )
        let result = LocalTranslationResult(
            original: "local lookup finished quickly",
            normalized: "local lookup finished quickly",
            kind: .sentence,
            pronunciation: "/ˈloʊkl/",
            explanation: "A sentence about lookup behavior.",
            examples: [],
            collocations: [],
            ipa: [PronunciationEntry(word: "local", ipa: "/ˈloʊkl/")],
            lesson: lesson
        )

        let content = LookupDisplayContent(
            selectedText: result.original,
            localResult: result,
            enrichment: nil,
            localError: nil,
            agentError: nil
        )

        XCTAssertEqual(content.pronunciationRows, [("Key pronunciation", "local /ˈloʊkl/")])
    }

    private static func assertSendable<T: Sendable>(_ value: T) {}

    private static func localReadyResponse(requestId: String) -> TranslationStageResponse {
        let lesson = TranslationLesson(
            suggested: "workflow",
            scene: "Ghostty translation lookup",
            pattern: "Reuse the selected expression.",
            tags: ["ghostty-lookup"],
            worthRecording: true
        )
        let result = LocalTranslationResult(
            original: "workflow",
            normalized: "workflow",
            kind: .word,
            translation: "工作流程",
            explanation: "A sequence of work.",
            examples: [],
            collocations: [],
            ipa: [],
            lesson: lesson
        )
        return TranslationStageResponse(
            requestId: requestId,
            source: "ghostty",
            status: .ready,
            result: result
        )
    }

    private static func agentLoadingResponse(requestId: String) -> TranslationEnrichmentStageResponse {
        TranslationEnrichmentStageResponse(
            requestId: requestId,
            source: "ghostty",
            status: .loading
        )
    }

    private static func agentErrorResponse(error: TranslationError) -> TranslationEnrichmentStageResponse {
        TranslationEnrichmentStageResponse(
            status: .error,
            error: error
        )
    }
}

private func applyResponsesOnMainActor(
    local: TranslationStageResponse,
    agent: TranslationEnrichmentStageResponse
) async -> Bool {
    await MainActor.run {
        let store = LookupStore()
        let request = try! store.begin(text: "workflow").get()
        store.applyLocalResponse(local, request: request)
        store.applyAgentResponse(agent, request: request)
        guard case .error(let appliedLocalError) = store.state.local,
              case .error(let appliedAgentError) = store.state.agent else {
            return false
        }
        return appliedLocalError == local.error
            && appliedAgentError == agent.error
    }
}
