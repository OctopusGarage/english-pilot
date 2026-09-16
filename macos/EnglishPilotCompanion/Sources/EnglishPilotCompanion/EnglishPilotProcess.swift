import Foundation

public struct EnglishPilotProcessCommand: Equatable, Sendable {
    public let executableURL: URL
    public let arguments: [String]
    public let stdin: Data
    public let environment: [String: String]

    public init(
        executableURL: URL,
        arguments: [String],
        stdin: Data,
        environment: [String: String] = [:]
    ) {
        self.executableURL = executableURL
        self.arguments = arguments
        self.stdin = stdin
        self.environment = environment
    }
}

public struct EnglishPilotProcessOutput: Sendable {
    public let stdout: Data
    public let stderr: Data
    public let terminationStatus: Int32

    public init(stdout: Data, stderr: Data, terminationStatus: Int32) {
        self.stdout = stdout
        self.stderr = stderr
        self.terminationStatus = terminationStatus
    }
}

public protocol EnglishPilotProcessRunning: Sendable {
    func run(_ command: EnglishPilotProcessCommand) async throws -> EnglishPilotProcessOutput
    func terminateAll()
}

public enum EnglishPilotBackend: String, Sendable {
    case claude
    case codex
}

public enum EnglishPilotLookupResult: Equatable, Sendable {
    case completed(LookupRequest)
    case failed(request: LookupRequest?, error: TranslationError)
    case cancelled(request: LookupRequest?)
}

public enum EnglishPilotProcessRunnerError: Error, Sendable {
    case launchFailed(String)
    case stdinFailed(String)
}

public enum EnglishPilotProcessError: Error, Sendable {
    case launchFailure(stage: TranslationStage, message: String)
    case stdinFailure(stage: TranslationStage, message: String)
    case nonZeroExit(stage: TranslationStage, status: Int32, stderr: String)
    case malformedOutput(stage: TranslationStage, message: String)
}

public final class SystemEnglishPilotProcessRunner: EnglishPilotProcessRunning, @unchecked Sendable {
    private let lock = NSLock()
    private var currentProcesses: [ObjectIdentifier: ProcessRunState] = [:]

    public init() {}

    public func run(_ command: EnglishPilotProcessCommand) async throws -> EnglishPilotProcessOutput {
        let state = ProcessRunState()
        register(state)
        defer { unregister(state) }

        return try await withTaskCancellationHandler(operation: {
            try Task.checkCancellation()
            return try await state.run(command)
        }, onCancel: {
            state.cancel()
        })
    }

    public func terminateAll() {
        lock.lock()
        let states = Array(currentProcesses.values)
        lock.unlock()
        states.forEach { $0.cancel() }
    }

    private func register(_ state: ProcessRunState) {
        lock.lock()
        currentProcesses[ObjectIdentifier(state)] = state
        lock.unlock()
    }

    private func unregister(_ state: ProcessRunState) {
        lock.lock()
        currentProcesses.removeValue(forKey: ObjectIdentifier(state))
        lock.unlock()
    }
}

private final class ProcessRunState: @unchecked Sendable {
    private let lock = NSLock()
    private var process: Process?
    private var cancellationRequested = false

    func run(_ command: EnglishPilotProcessCommand) async throws -> EnglishPilotProcessOutput {
        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        let process = Process()
        process.executableURL = command.executableURL
        process.arguments = command.arguments
        if !command.environment.isEmpty {
            process.environment = ProcessInfo.processInfo.environment.merging(command.environment) { _, new in new }
        }
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        do {
            try launch(process)
        } catch {
            throw error
        }

        let stdoutTask = Task.detached {
            stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        }
        let stderrTask = Task.detached {
            stderrPipe.fileHandleForReading.readDataToEndOfFile()
        }

        do {
            stdinPipe.fileHandleForWriting.write(command.stdin)
            try stdinPipe.fileHandleForWriting.close()
        } catch {
            cancel()
            process.waitUntilExit()
            _ = await stdoutTask.value
            _ = await stderrTask.value
            throw EnglishPilotProcessRunnerError.stdinFailed(error.localizedDescription)
        }

        process.waitUntilExit()
        let stdout = await stdoutTask.value
        let stderr = await stderrTask.value

        let wasCancelled = finish()
        if wasCancelled || Task.isCancelled {
            throw CancellationError()
        }
        return EnglishPilotProcessOutput(
            stdout: stdout,
            stderr: stderr,
            terminationStatus: process.terminationStatus
        )
    }

    func cancel() {
        lock.lock()
        cancellationRequested = true
        let process = self.process
        lock.unlock()
        if let process, process.isRunning {
            process.terminate()
        }
    }

    private func launch(_ process: Process) throws {
        lock.lock()
        defer { lock.unlock() }
        guard !cancellationRequested, !Task.isCancelled else {
            throw CancellationError()
        }
        self.process = process
        do {
            try process.run()
        } catch {
            self.process = nil
            throw EnglishPilotProcessRunnerError.launchFailed(error.localizedDescription)
        }
    }

    private func finish() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        let wasCancelled = cancellationRequested
        self.process = nil
        return wasCancelled
    }
}

@MainActor
public final class EnglishPilotProcess {
    private let executableURL: URL
    private let store: LookupStore
    private let runner: any EnglishPilotProcessRunning
    private let enrichmentBackend: EnglishPilotBackend?
    private let environment: [String: String]
    private var activeOperationID: UUID?
    private var activeTask: Task<EnglishPilotLookupResult, Never>?

    public init(
        executableURL: URL,
        store: LookupStore,
        runner: any EnglishPilotProcessRunning = SystemEnglishPilotProcessRunner(),
        enrichmentBackend: EnglishPilotBackend? = nil,
        environment: [String: String] = [:]
    ) {
        self.executableURL = executableURL
        self.store = store
        self.runner = runner
        self.enrichmentBackend = enrichmentBackend
        self.environment = environment
    }

    /// Completes only after the local lookup has finished. Enrichment is optional
    /// and its failure is represented in `LookupStore.state.agent`.
    @discardableResult
    public func lookup(text: String) async -> EnglishPilotLookupResult {
        terminateOlderProcesses()
        let result = store.begin(text: text)
        guard case .success(let request) = result else {
            guard case .failure(let error) = result else {
                return .failed(request: nil, error: TranslationError(
                    code: "LOOKUP_FAILED",
                    message: "Unable to create lookup request."
                ))
            }
            return .failed(request: nil, error: error)
        }
        return await lookup(request, replacingActive: false)
    }

    @discardableResult
    public func lookup(_ request: LookupRequest) async -> EnglishPilotLookupResult {
        await lookup(request, replacingActive: true)
    }

    private func lookup(
        _ request: LookupRequest,
        replacingActive: Bool
    ) async -> EnglishPilotLookupResult {
        if replacingActive {
            terminateOlderProcesses()
        }
        let operationID = UUID()
        activeOperationID = operationID
        let task = Task { @MainActor [weak self] in
            guard let self else {
                return EnglishPilotLookupResult.cancelled(request: request)
            }
            return await self.performLookup(request)
        }
        activeTask = task
        let result = await withTaskCancellationHandler(operation: {
            await task.value
        }, onCancel: { [runner] in
            task.cancel()
            runner.terminateAll()
            Task { @MainActor [weak self] in
                if self?.activeOperationID == operationID {
                    self?.activeOperationID = nil
                    self?.activeTask = nil
                }
            }
        })
        if activeOperationID == operationID {
            activeOperationID = nil
            activeTask = nil
        }
        return result
    }

    public func cancel() {
        activeTask?.cancel()
        activeOperationID = nil
        activeTask = nil
        runner.terminateAll()
    }

    private func performLookup(_ request: LookupRequest) async -> EnglishPilotLookupResult {
        do {
            try Task.checkCancellation()
            guard store.accepts(request: request) else {
                return .completed(request)
            }

            let output = try await runner.run(
                command(for: request, arguments: ["translate", "--request-json", "--json"])
            )
            try Task.checkCancellation()
            let response = try decodeLocalResponse(from: output)
            store.applyLocalResponse(response, request: request)

            if response.status == .error, let error = response.error {
                return .failed(request: request, error: error)
            }
            guard response.status == .ready, store.accepts(request: request) else {
                return .completed(request)
            }
            if let enrichmentBackend {
                await enrich(request: request, backend: enrichmentBackend)
            }
            return .completed(request)
        } catch is CancellationError {
            return .cancelled(request: request)
        } catch let error as EnglishPilotProcessError {
            let translationError = translationError(for: error)
            applyLocalError(error, request: request)
            return .failed(request: request, error: translationError)
        } catch let error as EnglishPilotProcessRunnerError {
            let processError = processError(for: error, stage: .local)
            let translationError = translationError(for: processError)
            applyLocalError(processError, request: request)
            return .failed(request: request, error: translationError)
        } catch {
            let processError = EnglishPilotProcessError.malformedOutput(
                stage: .local,
                message: error.localizedDescription
            )
            let translationError = translationError(for: processError)
            applyLocalError(processError, request: request)
            return .failed(request: request, error: translationError)
        }
    }

    private func enrich(request: LookupRequest, backend: EnglishPilotBackend) async {
        guard !Task.isCancelled, store.accepts(request: request) else {
            return
        }

        store.applyAgentResponse(
            TranslationEnrichmentStageResponse(
                requestId: request.requestId,
                source: "ghostty",
                status: .loading
            ),
            request: request
        )

        do {
            try Task.checkCancellation()
            let output = try await runner.run(
                command(
                    for: request,
                    arguments: [
                        "translate",
                        "enrich",
                        "--request-json",
                        "--backend",
                        backend.rawValue,
                        "--json"
                    ]
                )
            )
            try Task.checkCancellation()
            let response = try decodeAgentResponse(from: output)
            guard store.accepts(request: request) else {
                return
            }
            store.applyAgentResponse(response, request: request)
        } catch is CancellationError {
            return
        } catch let error as EnglishPilotProcessError {
            applyAgentError(error, request: request)
        } catch let error as EnglishPilotProcessRunnerError {
            applyAgentError(processError(for: error, stage: .agent), request: request)
        } catch {
            applyAgentError(
                .malformedOutput(stage: .agent, message: error.localizedDescription),
                request: request
            )
        }
    }

    private func terminateOlderProcesses() {
        activeTask?.cancel()
        activeOperationID = nil
        activeTask = nil
        runner.terminateAll()
    }

    private func command(
        for request: LookupRequest,
        arguments: [String]
    ) throws -> EnglishPilotProcessCommand {
        let stdin = try JSONEncoder().encode(
            TranslationRequest(
                requestId: request.requestId,
                text: request.text,
                source: "ghostty"
            )
        )
        return EnglishPilotProcessCommand(
            executableURL: executableURL,
            arguments: arguments,
            stdin: stdin,
            environment: environment
        )
    }

    private func decodeLocalResponse(
        from output: EnglishPilotProcessOutput
    ) throws -> TranslationStageResponse {
        do {
            let response = try JSONDecoder().decode(TranslationStageResponse.self, from: output.stdout)
            if output.terminationStatus != 0, response.status != .error {
                throw EnglishPilotProcessError.nonZeroExit(
                    stage: .local,
                    status: output.terminationStatus,
                    stderr: String(decoding: output.stderr, as: UTF8.self)
                )
            }
            return response
        } catch {
            if let processError = error as? EnglishPilotProcessError {
                throw processError
            }
            guard output.terminationStatus != 0 else {
                throw EnglishPilotProcessError.malformedOutput(
                    stage: .local,
                    message: error.localizedDescription
                )
            }
            throw EnglishPilotProcessError.nonZeroExit(
                stage: .local,
                status: output.terminationStatus,
                stderr: String(decoding: output.stderr, as: UTF8.self)
            )
        }
    }

    private func decodeAgentResponse(
        from output: EnglishPilotProcessOutput
    ) throws -> TranslationEnrichmentStageResponse {
        do {
            let response = try JSONDecoder().decode(
                TranslationEnrichmentStageResponse.self,
                from: output.stdout
            )
            if output.terminationStatus != 0, response.status != .error {
                throw EnglishPilotProcessError.nonZeroExit(
                    stage: .agent,
                    status: output.terminationStatus,
                    stderr: String(decoding: output.stderr, as: UTF8.self)
                )
            }
            return response
        } catch {
            if let processError = error as? EnglishPilotProcessError {
                throw processError
            }
            guard output.terminationStatus != 0 else {
                throw EnglishPilotProcessError.malformedOutput(
                    stage: .agent,
                    message: error.localizedDescription
                )
            }
            throw EnglishPilotProcessError.nonZeroExit(
                stage: .agent,
                status: output.terminationStatus,
                stderr: String(decoding: output.stderr, as: UTF8.self)
            )
        }
    }

    private func processError(
        for error: EnglishPilotProcessRunnerError,
        stage: TranslationStage
    ) -> EnglishPilotProcessError {
        switch error {
        case .launchFailed(let message):
            return .launchFailure(stage: stage, message: message)
        case .stdinFailed(let message):
            return .stdinFailure(stage: stage, message: message)
        }
    }

    private func applyLocalError(_ error: EnglishPilotProcessError, request: LookupRequest) {
        guard store.accepts(request: request) else {
            return
        }
        store.applyLocalResponse(
            TranslationStageResponse(
                status: .error,
                error: translationError(for: error)
            ),
            request: request
        )
    }

    private func applyAgentError(_ error: EnglishPilotProcessError, request: LookupRequest) {
        guard store.accepts(request: request) else {
            return
        }
        store.applyAgentResponse(
            TranslationEnrichmentStageResponse(
                status: .error,
                error: translationError(for: error)
            ),
            request: request
        )
    }

    private func translationError(for error: EnglishPilotProcessError) -> TranslationError {
        switch error {
        case .launchFailure(let stage, let message):
            return TranslationError(
                code: "\(stage.rawValue.uppercased())_PROCESS_LAUNCH_FAILED",
                message: message
            )
        case .stdinFailure(let stage, let message):
            return TranslationError(
                code: "\(stage.rawValue.uppercased())_PROCESS_STDIN_FAILED",
                message: message
            )
        case .nonZeroExit(let stage, let status, let stderr):
            let code = stage == .local ? "LOCAL_PROCESS_FAILED" : "AGENT_PROCESS_FAILED"
            let detail = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            let message = detail.isEmpty
                ? "\(stage.rawValue.capitalized) process exited with status \(status)."
                : detail
            return TranslationError(code: code, message: message)
        case .malformedOutput(let stage, let message):
            let code = stage == .local ? "MALFORMED_LOCAL_OUTPUT" : "MALFORMED_AGENT_OUTPUT"
            return TranslationError(code: code, message: message)
        }
    }
}
