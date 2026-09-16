import Foundation
import XCTest
@testable import EnglishPilotCompanion

@MainActor
final class EnglishPilotProcessTests: XCTestCase {
    func testLocalResponseIsDecodedAndAppliedToLookupStore() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.output(Self.localResponseJSON(requestId: request.requestId)))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )

        await process.lookup(request)

        guard case .ready(let response) = store.state.local else {
            return XCTFail("Expected the local response to be ready.")
        }
        XCTAssertEqual(response.requestId, request.requestId)
        XCTAssertEqual(response.result?.translation, "工作流程")
    }

    func testFailedEnrichmentPreservesLocalResultAndPublishesAgentError() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.output(Self.localResponseJSON(requestId: request.requestId))),
            .success(EnglishPilotProcessOutput(
                stdout: Data("not json".utf8),
                stderr: Data("agent failed".utf8),
                terminationStatus: 1
            ))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner,
            enrichmentBackend: .codex
        )

        await process.lookup(request)

        guard case .ready(let local) = store.state.local else {
            return XCTFail("The local result must remain available.")
        }
        XCTAssertEqual(local.result?.translation, "工作流程")
        guard case .error(let agentError) = store.state.agent else {
            return XCTFail("Expected an agent-stage error.")
        }
        XCTAssertEqual(agentError.code, "AGENT_PROCESS_FAILED")
    }

    func testStructuredLocalErrorEnvelopePreservesCliCodeAndMessageOnNonzeroExit() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.output(Self.localErrorJSON(
                requestId: request.requestId,
                code: "MISSING_REQUEST_FIELD",
                message: "The request is missing source."
            ), status: 1))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )

        let result = await process.lookup(request)

        XCTAssertEqual(
            result,
            .failed(
                request: request,
                error: TranslationError(
                    code: "MISSING_REQUEST_FIELD",
                    message: "The request is missing source."
                )
            )
        )
        XCTAssertEqual(
            store.state.local,
            .error(TranslationError(
                code: "MISSING_REQUEST_FIELD",
                message: "The request is missing source."
            ))
        )
    }

    func testNonzeroReadyEnvelopeIsTreatedAsProcessFailure() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(EnglishPilotProcessOutput(
                stdout: Data(Self.localResponseJSON(requestId: request.requestId).utf8),
                stderr: Data("unexpected failure".utf8),
                terminationStatus: 1
            ))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )

        let result = await process.lookup(request)

        XCTAssertEqual(
            result,
            .failed(
                request: request,
                error: TranslationError(
                    code: "LOCAL_PROCESS_FAILED",
                    message: "unexpected failure"
                )
            )
        )
        XCTAssertEqual(
            store.state.local,
            .error(TranslationError(
                code: "LOCAL_PROCESS_FAILED",
                message: "unexpected failure"
            ))
        )
    }

    func testStructuredAgentErrorPreservesLocalResultAndCliError() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.output(Self.localResponseJSON(requestId: request.requestId))),
            .success(Self.output(Self.agentErrorJSON(
                requestId: request.requestId,
                code: "UNSAFE_AGENT_BACKEND",
                message: "Claude translation enrichment is disabled."
            ), status: 1))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner,
            enrichmentBackend: .claude
        )

        let result = await process.lookup(request)

        XCTAssertEqual(result, .completed(request))
        guard case .ready(let local) = store.state.local else {
            return XCTFail("The local result must remain available.")
        }
        XCTAssertEqual(local.result?.translation, "工作流程")
        XCTAssertEqual(
            store.state.agent,
            .error(TranslationError(
                code: "UNSAFE_AGENT_BACKEND",
                message: "Claude translation enrichment is disabled."
            ))
        )
    }

    func testLookupReportsLaunchFailureInsteadOfReturningSuccess() async throws {
        let store = LookupStore()
        let runner = ScriptedProcessRunner(outputs: [
            .failure(EnglishPilotProcessRunnerError.launchFailed("executable missing"))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/missing/english-pilot"),
            store: store,
            runner: runner
        )

        let result = await process.lookup(text: "workflow")

        guard case .failed(let request, let error) = result else {
            return XCTFail("A launch failure must be reported as a failed lookup.")
        }
        XCTAssertNotNil(request)
        XCTAssertEqual(error.code, "LOCAL_PROCESS_LAUNCH_FAILED")
        XCTAssertEqual(error.message, "executable missing")
        XCTAssertEqual(store.state.local, .error(error))
    }

    func testLookupReportsCancellationWithoutPublishingGenericProcessError() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(blocksUntilTerminated: true)
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )
        let lookupTask = Task { await process.lookup(request) }

        try await runner.waitForCommandCount(1)
        process.cancel()
        let result = await lookupTask.value

        XCTAssertEqual(result, .cancelled(request: request))
        XCTAssertEqual(store.state.local, .loading)
        XCTAssertEqual(runner.terminationCount, 1)
    }

    func testCancellingCallerTaskTerminatesLookupProcess() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(blocksUntilTerminated: true)
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )
        let lookupTask = Task { await process.lookup(request) }

        try await runner.waitForCommandCount(1)
        lookupTask.cancel()
        let result = await lookupTask.value

        XCTAssertEqual(result, .cancelled(request: request))
        XCTAssertEqual(store.state.local, .loading)
        XCTAssertEqual(runner.terminationCount, 1)
    }

    func testCancellationBeforeRunnerLaunchDoesNotInvokeRunner() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(blocksBeforeLaunch: true)
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )
        let lookupTask = Task { await process.lookup(request) }
        try await runner.waitForLaunchGate()
        process.cancel()
        runner.releaseLaunch()

        let result = await lookupTask.value

        XCTAssertEqual(result, .cancelled(request: request))
        XCTAssertTrue(runner.commands.isEmpty)
        XCTAssertEqual(store.state.local, .loading)
    }

    func testStaleInFlightResponseCannotReplaceNewerLookup() async throws {
        let store = LookupStore()
        let runner = ScriptedProcessRunner(ignoresTermination: true)
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )
        let firstTask = Task { await process.lookup(text: "first") }
        try await runner.waitForCommandCount(1)
        let secondTask = Task { await process.lookup(text: "second") }
        try await runner.waitForCommandCount(2)

        runner.complete(
            commandIndex: 1,
            with: Self.output(Self.localResponseJSON(
                requestId: try XCTUnwrap(store.currentRequestId)
            ))
        )
        _ = await secondTask.value
        let secondRequestId = try XCTUnwrap(store.currentRequestId)

        runner.complete(
            commandIndex: 0,
            with: Self.output(Self.localResponseJSON(requestId: "stale-first"))
        )
        _ = await firstTask.value

        XCTAssertEqual(store.currentRequestId, secondRequestId)
        guard case .ready(let local) = store.state.local else {
            return XCTFail("The second lookup must remain visible.")
        }
        XCTAssertEqual(local.requestId, secondRequestId)
    }

    func testSystemRunnerDrainsLargeStdoutAndStderrConcurrently() async throws {
        let command = EnglishPilotProcessCommand(
            executableURL: URL(fileURLWithPath: "/bin/sh"),
            arguments: [
                "-c",
                "i=0; while [ \"$i\" -lt 20000 ]; do printf x; printf y >&2; i=$((i + 1)); done"
            ],
            stdin: Data()
        )

        let output = try await SystemEnglishPilotProcessRunner().run(command)

        XCTAssertEqual(output.terminationStatus, 0)
        XCTAssertEqual(output.stdout.count, 20_000)
        XCTAssertEqual(output.stderr.count, 20_000)
    }

    func testStaleResponseIsRejectedWhenASecondLookupBegins() throws {
        let store = LookupStore()
        let first = try XCTUnwrap(try store.begin(text: "first").get())
        let second = try XCTUnwrap(try store.begin(text: "second").get())
        let response = try Self.decodeLocalResponse(Self.localResponseJSON(requestId: first.requestId))

        store.applyLocalResponse(response, request: first)

        XCTAssertEqual(store.currentRequestId, second.requestId)
        XCTAssertEqual(store.state.local, .loading)
    }

    func testLocalCommandUsesDirectArgumentsAndRequestJSONOnStdin() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "a phrase").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.output(Self.localResponseJSON(requestId: request.requestId)))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )

        await process.lookup(request)

        let commands = runner.commands
        let command = try XCTUnwrap(commands.first)
        XCTAssertEqual(command.executableURL.path, "/opt/english-pilot")
        XCTAssertEqual(command.arguments, ["translate", "--request-json", "--json"])
        let input = try JSONDecoder().decode(TranslationRequest.self, from: command.stdin)
        XCTAssertEqual(input, TranslationRequest(
            requestId: request.requestId,
            text: "a phrase",
            source: "ghostty"
        ))
    }

    func testEnrichmentCommandUsesSameRequestIDAndSelectedBackend() async throws {
        let store = LookupStore()
        let request = try XCTUnwrap(try store.begin(text: "workflow").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.output(Self.localResponseJSON(requestId: request.requestId))),
            .success(Self.output(Self.agentResponseJSON(requestId: request.requestId)))
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner,
            enrichmentBackend: .claude
        )

        await process.lookup(request)

        let commands = runner.commands
        XCTAssertEqual(commands.count, 2)
        XCTAssertEqual(
            commands[1].arguments,
            ["translate", "enrich", "--request-json", "--backend", "claude", "--json"]
        )
        let input = try JSONDecoder().decode(TranslationRequest.self, from: commands[1].stdin)
        XCTAssertEqual(input.requestId, request.requestId)
        XCTAssertEqual(input.source, "ghostty")
    }

    func testStartingAnotherLookupTerminatesOlderRunnerProcesses() async throws {
        let store = LookupStore()
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.failedOutput),
            .success(Self.failedOutput)
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )

        _ = await process.lookup(text: "first")
        _ = await process.lookup(text: "second")

        let terminationCount = runner.terminationCount
        XCTAssertEqual(terminationCount, 2)
    }

    func testDirectRequestLookupTerminatesOlderRunnerProcesses() async throws {
        let store = LookupStore()
        let first = try XCTUnwrap(try store.begin(text: "first").get())
        let runner = ScriptedProcessRunner(outputs: [
            .success(Self.failedOutput),
            .success(Self.failedOutput)
        ])
        let process = EnglishPilotProcess(
            executableURL: URL(fileURLWithPath: "/opt/english-pilot"),
            store: store,
            runner: runner
        )

        _ = await process.lookup(first)
        let second = try XCTUnwrap(try store.begin(text: "second").get())
        _ = await process.lookup(second)

        XCTAssertEqual(runner.terminationCount, 2)
    }

    private static func output(
        _ json: String,
        status: Int32 = 0
    ) -> EnglishPilotProcessOutput {
        EnglishPilotProcessOutput(
            stdout: Data(json.utf8),
            stderr: Data(),
            terminationStatus: status
        )
    }

    private static let failedOutput = EnglishPilotProcessOutput(
        stdout: Data(),
        stderr: Data("failed".utf8),
        terminationStatus: 1
    )

    private static func decodeLocalResponse(_ json: String) throws -> TranslationStageResponse {
        try JSONDecoder().decode(TranslationStageResponse.self, from: Data(json.utf8))
    }

    private static func localResponseJSON(requestId: String) -> String {
        """
        {"requestId":"\(requestId)","source":"ghostty","stage":"local","status":"ready","result":{"original":"workflow","normalized":"workflow","kind":"word","translation":"工作流程","explanation":"Local glossary entry.","examples":[],"collocations":[],"ipa":[],"lesson":{"suggested":"workflow","scene":"Ghostty translation lookup","pattern":"Reuse the selected expression.","tags":["ghostty-lookup"],"worthRecording":true}}}
        """
    }

    private static func agentResponseJSON(requestId: String) -> String {
        """
        {"requestId":"\(requestId)","source":"ghostty","stage":"agent","status":"ready","result":{"translation":"工作流程","explanation":"A sequence of work.","examples":[],"collocations":[]}}
        """
    }

    private static func localErrorJSON(
        requestId: String,
        code: String,
        message: String
    ) -> String {
        """
        {"requestId":"\(requestId)","source":"ghostty","stage":"local","status":"error","error":{"code":"\(code)","message":"\(message)"}}
        """
    }

    private static func agentErrorJSON(
        requestId: String,
        code: String,
        message: String
    ) -> String {
        """
        {"requestId":"\(requestId)","source":"ghostty","stage":"agent","status":"error","error":{"code":"\(code)","message":"\(message)"}}
        """
    }
}

private final class ScriptedProcessRunner: EnglishPilotProcessRunning, @unchecked Sendable {
    private let lock = NSLock()
    private var recordedCommands: [EnglishPilotProcessCommand] = []
    private var recordedTerminationCount = 0
    private var outputs: [Result<EnglishPilotProcessOutput, Error>]
    private var blockedContinuations: [Int: CheckedContinuation<EnglishPilotProcessOutput, Error>] = [:]
    private var blockedUntilTerminated: Bool
    private var ignoresTermination: Bool
    private var launchGate: DispatchSemaphore?
    private var launchGateEntered = DispatchSemaphore(value: 0)
    private var launchCancelled = false

    init(
        outputs: [Result<EnglishPilotProcessOutput, Error>] = [],
        blocksUntilTerminated: Bool = false,
        blocksBeforeLaunch: Bool = false,
        ignoresTermination: Bool = false
    ) {
        self.outputs = outputs
        self.blockedUntilTerminated = blocksUntilTerminated
        self.ignoresTermination = ignoresTermination
        self.launchGate = blocksBeforeLaunch ? DispatchSemaphore(value: 0) : nil
    }

    var commands: [EnglishPilotProcessCommand] {
        lock.lock()
        defer { lock.unlock() }
        return recordedCommands
    }

    var terminationCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return recordedTerminationCount
    }

    func run(_ command: EnglishPilotProcessCommand) async throws -> EnglishPilotProcessOutput {
        lock.lock()
        if let launchGate {
            launchGateEntered.signal()
            lock.unlock()
            launchGate.wait()
            lock.lock()
            self.launchGate = nil
            guard !launchCancelled else {
                lock.unlock()
                throw CancellationError()
            }
        }
        recordedCommands.append(command)
        let commandIndex = recordedCommands.count - 1
        if blockedUntilTerminated {
            lock.unlock()
            return try await withTaskCancellationHandler(operation: {
                try await withCheckedThrowingContinuation { continuation in
                    lock.lock()
                    blockedContinuations[commandIndex] = continuation
                    lock.unlock()
                }
            }, onCancel: {
                cancel(commandIndex)
            })
        }
        guard !outputs.isEmpty else {
            lock.unlock()
            throw TestRunnerError.noOutput
        }
        let output = outputs.removeFirst()
        lock.unlock()
        return try output.get()
    }

    func terminateAll() {
        lock.lock()
        recordedTerminationCount += 1
        if launchGate != nil {
            launchCancelled = true
        }
        let continuations = ignoresTermination ? [] : Array(blockedContinuations.values)
        if !ignoresTermination {
            blockedContinuations.removeAll()
        }
        lock.unlock()
        continuations.forEach { $0.resume(throwing: CancellationError()) }
    }

    func complete(commandIndex: Int, with output: EnglishPilotProcessOutput) {
        lock.lock()
        let continuation = blockedContinuations.removeValue(forKey: commandIndex)
        lock.unlock()
        continuation?.resume(returning: output)
    }

    func releaseLaunch() {
        lock.lock()
        let launchGate = self.launchGate
        lock.unlock()
        launchGate?.signal()
    }

    func waitForLaunchGate() async throws {
        launchGateEntered.wait()
    }

    func waitForCommandCount(_ count: Int) async throws {
        for _ in 0..<100 {
            if commands.count >= count {
                return
            }
            try await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTFail("Timed out waiting for \(count) runner commands.")
    }

    private func cancel(_ commandIndex: Int) {
        lock.lock()
        let continuation = blockedContinuations.removeValue(forKey: commandIndex)
        lock.unlock()
        continuation?.resume(throwing: CancellationError())
    }
}

private enum TestRunnerError: Error {
    case noOutput
}
