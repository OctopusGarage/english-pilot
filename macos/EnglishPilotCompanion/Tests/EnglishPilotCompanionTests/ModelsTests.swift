import XCTest
@testable import EnglishPilotCompanion

final class ModelsTests: XCTestCase {
    func testDecodesSharedLocalReadyContractFixture() throws {
        let data = try Self.contractFixture(named: "local-ready.json")
        let response = try JSONDecoder().decode(TranslationStageResponse.self, from: data)

        XCTAssertEqual(response.requestId, "fixture-local-ready")
        XCTAssertEqual(response.source, "ghostty")
        XCTAssertEqual(response.stage, .local)
        XCTAssertEqual(response.status, .ready)
        XCTAssertEqual(response.result?.translation, "工作流程")
        XCTAssertEqual(response.result?.ipa, [
            PronunciationEntry(word: "workflow", ipa: "/ˈwɝːkfloʊ/")
        ])
    }

    func testDecodesSharedAgentReadyContractFixture() throws {
        let data = try Self.contractFixture(named: "agent-ready.json")
        let response = try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: data)

        XCTAssertEqual(response.requestId, "fixture-agent-ready")
        XCTAssertEqual(response.source, "ghostty")
        XCTAssertEqual(response.stage, .agent)
        XCTAssertEqual(response.status, .ready)
        XCTAssertEqual(response.result?.translation, "工作流程")
        XCTAssertEqual(response.result?.partOfSpeech, "noun")
        XCTAssertEqual(response.result?.examples, ["This workflow keeps translation lookup fast."])
    }

    func testDecodesLocalResponse() throws {
        let data = Data(#"{"requestId":"r1","source":"ghostty","stage":"local","status":"ready","result":{"original":"workflow","normalized":"workflow","kind":"word","translation":"工作流程","explanation":"Local glossary entry.","examples":[],"collocations":[],"ipa":[],"lesson":{"suggested":"workflow","scene":"Ghostty translation lookup","pattern":"Reuse the selected expression.","tags":["ghostty-lookup","word"],"worthRecording":true}}}"#.utf8)
        let response = try JSONDecoder().decode(TranslationStageResponse.self, from: data)

        XCTAssertEqual(response.requestId, "r1")
        XCTAssertEqual(response.source, "ghostty")
        XCTAssertEqual(response.stage, .local)
        XCTAssertEqual(response.result?.translation, "工作流程")
    }

    func testDecodesLocalErrorResponse() throws {
        let data = Data(#"{"requestId":"r2","source":"ghostty","stage":"local","status":"error","error":{"code":"EMPTY_SELECTION","message":"Selected text must not be empty."}}"#.utf8)

        let response = try JSONDecoder().decode(TranslationStageResponse.self, from: data)

        XCTAssertEqual(response.requestId, "r2")
        XCTAssertEqual(response.source, "ghostty")
        XCTAssertEqual(response.status, .error)
        XCTAssertEqual(response.error?.code, "EMPTY_SELECTION")
        XCTAssertNil(response.result)
    }

    func testDecodesLocalErrorResponseWithoutMetadata() throws {
        let data = Data(#"{"stage":"local","status":"error","error":{"code":"EMPTY_SELECTION","message":"Selected text must not be empty."}}"#.utf8)

        let response = try JSONDecoder().decode(TranslationStageResponse.self, from: data)

        XCTAssertNil(response.requestId)
        XCTAssertNil(response.source)
        XCTAssertEqual(response.status, .error)
    }

    func testDecodesAgentReadyResponseAndNormalizesOmittedOptionalArrays() throws {
        let data = Data(#"{"requestId":"r3","source":"ghostty","stage":"agent","status":"ready","result":{"translation":"工作流程","explanation":"A sequence of work.","futureField":true}}"#.utf8)

        let response = try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: data)

        XCTAssertEqual(response.requestId, "r3")
        XCTAssertEqual(response.source, "ghostty")
        XCTAssertEqual(response.stage, .agent)
        XCTAssertEqual(response.result?.translation, "工作流程")
        XCTAssertEqual(response.result?.examples, [])
        XCTAssertEqual(response.result?.collocations, [])
    }

    func testDecodesAgentLoadingResponseWithoutResultOrError() throws {
        let data = Data(#"{"requestId":"r4","source":"ghostty","stage":"agent","status":"loading","dryRun":true,"invocation":{"backend":"codex"}}"#.utf8)

        let response = try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: data)

        XCTAssertEqual(response.stage, .agent)
        XCTAssertEqual(response.status, .loading)
        XCTAssertEqual(response.dryRun, true)
        XCTAssertNil(response.result)
        XCTAssertNil(response.error)
    }

    func testDecodesAgentErrorResponseWithoutMetadata() throws {
        let data = Data(#"{"stage":"agent","status":"error","error":{"code":"MALFORMED_AGENT_OUTPUT","message":"Agent output was invalid."}}"#.utf8)

        let response = try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: data)

        XCTAssertNil(response.requestId)
        XCTAssertNil(response.source)
        XCTAssertEqual(response.status, .error)
        XCTAssertEqual(response.error?.code, "MALFORMED_AGENT_OUTPUT")
    }

    func testRejectsMissingMetadataForLoadingAndReadyResponses() {
        let invalidLocalResponses = [
            #"{"stage":"local","status":"loading"}"#,
            #"{"stage":"local","status":"ready","result":{"original":"workflow","normalized":"workflow","kind":"word","translation":"工作流程","explanation":"Local glossary entry.","examples":[],"collocations":[],"ipa":[],"lesson":{"suggested":"workflow","scene":"Ghostty translation lookup","pattern":"Reuse the selected expression.","tags":["ghostty-lookup","word"],"worthRecording":true}}}"#,
        ]
        let invalidAgentResponses = [
            #"{"stage":"agent","status":"loading"}"#,
            #"{"stage":"agent","status":"ready","result":{"translation":"工作流程","explanation":"A sequence of work.","examples":[],"collocations":[]}}"#,
        ]

        for payload in invalidLocalResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
        for payload in invalidAgentResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testRejectsEmptyAndOversizedMetadataForLoadingAndReadyResponses() {
        let oversizedMetadata = String(repeating: "x", count: 129)
        let invalidLocalResponses = [
            #"{"requestId":"","source":"ghostty","stage":"local","status":"loading"}"#,
            #"{"requestId":"r1","source":"   ","stage":"local","status":"loading"}"#,
            #"{"requestId":""# + oversizedMetadata + #"" ,"source":"ghostty","stage":"local","status":"loading"}"#,
            #"{"requestId":"r1","source":""# + oversizedMetadata + #"" ,"stage":"local","status":"loading"}"#,
        ]
        let invalidAgentResponses = [
            #"{"requestId":"","source":"ghostty","stage":"agent","status":"loading"}"#,
            #"{"requestId":"r1","source":"   ","stage":"agent","status":"loading"}"#,
            #"{"requestId":""# + oversizedMetadata + #"" ,"source":"ghostty","stage":"agent","status":"loading"}"#,
            #"{"requestId":"r1","source":""# + oversizedMetadata + #"" ,"stage":"agent","status":"loading"}"#,
        ]

        for payload in invalidLocalResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
        for payload in invalidAgentResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testRejectsExplicitNullMetadataForErrorResponses() {
        let invalidLocalResponses = [
            #"{"requestId":null,"stage":"local","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"source":null,"stage":"local","status":"error","error":{"code":"E","message":"failed"}}"#,
        ]
        let invalidAgentResponses = [
            #"{"requestId":null,"stage":"agent","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"source":null,"stage":"agent","status":"error","error":{"code":"E","message":"failed"}}"#,
        ]

        for payload in invalidLocalResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
        for payload in invalidAgentResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testRejectsEmptyAndOversizedMetadataForErrorResponses() {
        let oversizedMetadata = String(repeating: "x", count: 129)
        let invalidLocalResponses = [
            #"{"requestId":"","stage":"local","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"source":"   ","stage":"local","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"requestId":""# + oversizedMetadata + #"" ,"stage":"local","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"source":""# + oversizedMetadata + #"" ,"stage":"local","status":"error","error":{"code":"E","message":"failed"}}"#,
        ]
        let invalidAgentResponses = [
            #"{"requestId":"","stage":"agent","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"source":"   ","stage":"agent","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"requestId":""# + oversizedMetadata + #"" ,"stage":"agent","status":"error","error":{"code":"E","message":"failed"}}"#,
            #"{"source":""# + oversizedMetadata + #"" ,"stage":"agent","status":"error","error":{"code":"E","message":"failed"}}"#,
        ]

        for payload in invalidLocalResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
        for payload in invalidAgentResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testIgnoresUnknownFields() throws {
        let data = Data(#"{"requestId":"r5","source":"ghostty","stage":"local","status":"error","error":{"code":"E","message":"failed","futureErrorField":true},"futureResponseField":{"version":2}}"#.utf8)

        let response = try JSONDecoder().decode(TranslationStageResponse.self, from: data)

        XCTAssertEqual(response.error?.message, "failed")
    }

    func testRejectsInvalidResponseCombinations() {
        let invalidResponses = [
            #"{"source":"ghostty","stage":"local","status":"ready","result":{}}"#,
            #"{"requestId":"r6","stage":"local","status":"ready","result":{}}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"local","status":"ready"}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"local","status":"ready","error":{"code":"E","message":"failed"}}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"local","status":"error"}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"local","status":"error","result":{}}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"local","status":"loading","result":{}}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"local","status":"loading","error":{"code":"E","message":"failed"}}"#,
            #"{"requestId":"r6","source":"ghostty","stage":"agent","status":"ready","result":{}}"#,
        ]

        for payload in invalidResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testRejectsInvalidAgentResponseCombinations() {
        let invalidResponses = [
            #"{"requestId":"r7","source":"ghostty","stage":"local","status":"loading"}"#,
            #"{"requestId":"r7","source":"ghostty","stage":"agent","status":"ready"}"#,
            #"{"requestId":"r7","source":"ghostty","stage":"agent","status":"ready","error":{"code":"E","message":"failed"}}"#,
            #"{"requestId":"r7","source":"ghostty","stage":"agent","status":"error"}"#,
            #"{"requestId":"r7","source":"ghostty","stage":"agent","status":"error","result":{"translation":"x","explanation":"y"}}"#,
            #"{"requestId":"r7","source":"ghostty","stage":"agent","status":"loading","result":{"translation":"x","explanation":"y"}}"#,
            #"{"requestId":"r7","source":"ghostty","stage":"agent","status":"loading","error":{"code":"E","message":"failed"}}"#,
        ]

        for payload in invalidResponses {
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                payload
            )
        }
    }

    func testRejectsEmptyRequiredTranslationEnrichmentStrings() {
        let invalidResults = [
            #"{"translation":"","explanation":"valid"}"#,
            #"{"translation":"   ","explanation":"valid"}"#,
            #"{"translation":"valid","explanation":""}"#,
            #"{"translation":"valid","explanation":" \t"}"#,
            #"{"translation":"valid","explanation":"valid","partOfSpeech":""}"#,
            #"{"translation":"valid","explanation":"valid","examples":[""]}"#,
            #"{"translation":"valid","explanation":"valid","collocations":["  "]}"#,
        ]

        for result in invalidResults {
            let payload = #"{"requestId":"r8","source":"ghostty","stage":"agent","status":"ready","result":"# + result + "}"
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                result
            )
        }
    }

    func testRejectsOversizedTranslationEnrichmentFields() {
        let invalidResults = [
            #"{"translation":""# + String(repeating: "x", count: 2_001) + #"","explanation":"valid"}"#,
            #"{"translation":"valid","explanation":""# + String(repeating: "x", count: 4_001) + #""}"#,
            #"{"translation":"valid","explanation":"valid","partOfSpeech":""# + String(repeating: "x", count: 129) + #""}"#,
        ]

        for result in invalidResults {
            let payload = #"{"requestId":"r9","source":"ghostty","stage":"agent","status":"ready","result":"# + result + "}"
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                result
            )
        }
    }

    private static func contractFixture(named name: String) throws -> Data {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 {
            url.deleteLastPathComponent()
        }
        url.appendPathComponent("tests/fixtures/translation-contract")
        url.appendPathComponent(name)
        return try Data(contentsOf: url)
    }

    func testRejectsOversizedTranslationEnrichmentListsAndItems() {
        let tooManyExamples = (0..<9).map { _ in #""example""# }.joined(separator: ",")
        let tooManyCollocations = (0..<9).map { _ in #""collocation""# }.joined(separator: ",")
        let oversizedExample = String(repeating: "x", count: 501)
        let oversizedCollocation = String(repeating: "x", count: 501)
        let invalidResults = [
            #"{"translation":"valid","explanation":"valid","examples":["# + tooManyExamples + #"]}"#,
            #"{"translation":"valid","explanation":"valid","collocations":["# + tooManyCollocations + #"]}"#,
            #"{"translation":"valid","explanation":"valid","examples":["# + oversizedExample + #"]}"#,
            #"{"translation":"valid","explanation":"valid","collocations":["# + oversizedCollocation + #"]}"#,
        ]

        for result in invalidResults {
            let payload = #"{"requestId":"r10","source":"ghostty","stage":"agent","status":"ready","result":"# + result + "}"
            XCTAssertThrowsError(
                try JSONDecoder().decode(TranslationEnrichmentStageResponse.self, from: Data(payload.utf8)),
                result
            )
        }
    }
}
