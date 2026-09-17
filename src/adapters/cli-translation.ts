import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractExternalAgentReplyText,
  formatExternalAgentRunResult,
  runExternalAgent,
  type ExternalAgentBackend,
  type ExternalAgentRunResult,
} from '../agent/runner.js';
import { loadConfig } from '../core/config.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { performLocalTranslationLookup } from '../core/translation-lookup.js';
import {
  buildTranslationEnrichmentPrompt,
  parseTranslationEnrichment,
  TRANSLATION_ENRICHMENT_LIMITS,
  TranslationEnrichmentError,
  type TranslationEnrichmentErrorCode,
  type TranslationEnrichmentStageResponse,
} from '../core/translation-enrichment.js';
import { type TranslationRequest, type TranslationStageResponse } from '../core/translation-result.js';
import { recordLearningItem } from '../storage/repository.js';
import type { CliResult } from './cli-types.js';
import { getFlagValue, isRecord } from './cli-args.js';

type TranslationErrorCode =
  | 'INVALID_REQUEST_JSON'
  | 'MISSING_REQUEST_FIELD'
  | 'EMPTY_SELECTION'
  | 'MISSING_INPUT_MODE'
  | 'INVALID_INPUT_MODE'
  | 'TRANSLATION_REQUEST_JSON_TOO_LARGE'
  | 'INVALID_REQUEST_FIELD_TYPE'
  | 'TRANSLATION_ERROR'
  | 'TRANSLATION_REQUEST_FIELD_TOO_LARGE';

class TranslationCliError extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message: string,
    readonly metadata: { requestId?: string; source?: string } = {},
  ) {
    super(message);
  }
}

const TRANSLATION_AGENT_ENV_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'CODEX_HOME',
  'NODE_PATH',
] as const;

export function runTranslate(args: string[], stdin: string): CliResult {
  if (args[0] === 'enrich') {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Use runCliAsync for `english-pilot translate enrich`.\n',
    };
  }
  const json = args.includes('--json');
  let request: TranslationRequest | undefined;
  try {
    request = readRequest(args, stdin);
    const response = performLocalTranslationLookup(request, {
      glossary: listGlossaryEntries(),
      record: args.includes('--record'),
      recordLearningItem,
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(response)}\n` : formatTranslation(response),
      stderr: '',
    };
  } catch (error) {
    const failure = toTranslationError(error, request);
    if (json) {
      return {
        exitCode: 1,
        stdout: `${JSON.stringify({
          ...(failure.metadata.requestId ? { requestId: failure.metadata.requestId } : {}),
          ...(failure.metadata.source ? { source: failure.metadata.source } : {}),
          stage: 'local',
          status: 'error',
          error: {
            code: failure.code,
            message: failure.message,
          },
        })}\n`,
        stderr: '',
      };
    }
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${failure.message}\n`,
    };
  }
}

export async function runTranslateAsync(
  args: string[],
  stdin: string,
  runAgent: typeof runExternalAgent = runExternalAgent,
): Promise<CliResult> {
  const json = args.includes('--json');
  let request: TranslationRequest | undefined;
  let enrichmentCwd: string | undefined;
  let agentResult: ExternalAgentRunResult | undefined;
  let childTerminated = false;
  const cleanupEnrichmentCwd = () => {
    if (enrichmentCwd) {
      rmSync(enrichmentCwd, { recursive: true, force: true });
      enrichmentCwd = undefined;
    }
  };
  try {
    request = readRequest(args, stdin, true);
    const backend = parseExternalAgentBackend(getFlagValue(args, '--backend'));
    if (backend === 'claude') {
      throw new TranslationEnrichmentCliError(
        'UNSAFE_AGENT_BACKEND',
        'Claude translation enrichment is disabled because its current adapter requires bypassPermissions.',
      );
    }
    const config = loadConfig();
    enrichmentCwd = mkdtempSync(join(tmpdir(), 'english-pilot-translation-enrichment-'));
    const codexBinary = process.env.ENGLISH_PILOT_CODEX_BINARY?.trim() || config.externalAgentCodexBinary;
    agentResult = await runAgent({
      config: {
        ...config,
        externalAgentCodexBinary: codexBinary,
        externalAgentCodexSandbox: 'read-only',
      },
      prompt: buildTranslationEnrichmentPrompt(request.text, request.context),
      backend,
      cwd: enrichmentCwd,
      spawnEnv: buildTranslationAgentEnv(),
      codexShellEnvironmentPolicy: 'none',
      maxOutputBytes: TRANSLATION_ENRICHMENT_LIMITS.agentOutput,
      waitForChildCloseAfterTermination: true,
      onChildTermination: () => {
        childTerminated = true;
        cleanupEnrichmentCwd();
      },
      dryRun: args.includes('--dry-run'),
    });

    if (agentResult.dryRun) {
      cleanupEnrichmentCwd();
      return {
        exitCode: 0,
        stdout: json
          ? `${JSON.stringify({
              requestId: request.requestId,
              source: request.source,
              stage: 'agent',
              status: 'loading',
              dryRun: true,
              invocation: agentResult,
            })}\n`
          : formatEnrichmentDryRun(request, agentResult),
        stderr: '',
      };
    }

    const outputSize = Buffer.byteLength(agentResult.stdout, 'utf8') + Buffer.byteLength(agentResult.stderr, 'utf8');
    if (agentResult.outputLimitExceeded || outputSize > TRANSLATION_ENRICHMENT_LIMITS.agentOutput) {
      throw new TranslationEnrichmentCliError(
        'TRANSLATION_AGENT_OUTPUT_TOO_LARGE',
        `Translation agent output exceeds the ${TRANSLATION_ENRICHMENT_LIMITS.agentOutput}-byte limit.`,
      );
    }

    if (agentResult.exitCode !== 0) {
      throw new TranslationEnrichmentCliError(
        'AGENT_FAILURE',
        agentResult.stderr.trim() || `External agent exited with code ${agentResult.exitCode ?? 'unknown'}.`,
      );
    }

    const enrichment = parseTranslationEnrichment(extractExternalAgentReplyText(agentResult));
    const response: TranslationEnrichmentStageResponse = {
      requestId: request.requestId,
      source: request.source,
      stage: 'agent',
      status: 'ready',
      result: enrichment,
    };
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(response)}\n` : formatEnrichment(response),
      stderr: '',
    };
  } catch (error) {
    const failure = toTranslationEnrichmentError(error, request);
    if (json) {
      return {
        exitCode: 1,
        stdout: `${JSON.stringify({
          ...(failure.metadata.requestId ? { requestId: failure.metadata.requestId } : {}),
          ...(failure.metadata.source ? { source: failure.metadata.source } : {}),
          stage: 'agent',
          status: 'error',
          error: {
            code: failure.code,
            message: failure.message,
          },
        })}\n`,
        stderr: '',
      };
    }
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${failure.message}\n`,
    };
  } finally {
    if (runAgent !== runExternalAgent || childTerminated || agentResult?.dryRun) cleanupEnrichmentCwd();
  }
}

function buildTranslationAgentEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const key of TRANSLATION_AGENT_ENV_KEYS) {
    if (env[key] !== undefined) sanitized[key] = env[key];
  }
  return sanitized;
}

function readRequest(args: string[], stdin: string, enforceEnrichmentLimits = false): TranslationRequest {
  if (enforceEnrichmentLimits) {
    const inputModes = ['--text', '--stdin', '--request-json'].filter((flag) => args.includes(flag));
    if (inputModes.length === 0) {
      throw new TranslationCliError(
        'MISSING_INPUT_MODE',
        'Translation enrichment requires exactly one input mode: --text, --stdin, or --request-json.',
      );
    }
    if (inputModes.length > 1) {
      throw new TranslationCliError(
        'INVALID_INPUT_MODE',
        'Translation enrichment accepts exactly one input mode: --text, --stdin, or --request-json.',
      );
    }
  }
  if (args.includes('--request-json')) {
    if (enforceEnrichmentLimits && Buffer.byteLength(stdin, 'utf8') > TRANSLATION_ENRICHMENT_LIMITS.requestJson) {
      throw new TranslationCliError(
        'TRANSLATION_REQUEST_JSON_TOO_LARGE',
        `Translation request JSON exceeds the ${TRANSLATION_ENRICHMENT_LIMITS.requestJson}-byte limit.`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdin) as unknown;
    } catch {
      throw new TranslationCliError('INVALID_REQUEST_JSON', 'Translation request JSON is invalid.');
    }
    const requestId =
      isRecord(parsed) && typeof parsed.requestId === 'string' && parsed.requestId.trim()
        ? parsed.requestId
        : undefined;
    const text = isRecord(parsed) && typeof parsed.text === 'string' ? parsed.text : undefined;
    const source =
      isRecord(parsed) && typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source : undefined;
    if (enforceEnrichmentLimits && isRecord(parsed)) {
      const typedFields = ['requestId', 'text', 'source', 'context'] as const;
      for (const field of typedFields) {
        if (field in parsed && typeof parsed[field] !== 'string') {
          throw new TranslationCliError(
            'INVALID_REQUEST_FIELD_TYPE',
            `Translation request JSON field "${field}" must be a string.`,
            safeRequestMetadata(requestId, source),
          );
        }
      }
    }
    if (!requestId || !text?.trim() || !source) {
      throw new TranslationCliError(
        'MISSING_REQUEST_FIELD',
        'Translation request JSON must include non-empty requestId, text, and source.',
        safeRequestMetadata(requestId, source),
      );
    }
    const context = isRecord(parsed) && typeof parsed.context === 'string' ? parsed.context : undefined;
    const metadata = safeRequestMetadata(requestId, source);
    validateTranslationRequestFieldSize('requestId', requestId, TRANSLATION_ENRICHMENT_LIMITS.requestId, metadata);
    validateTranslationRequestFieldSize('source', source, TRANSLATION_ENRICHMENT_LIMITS.source, metadata);
    if (enforceEnrichmentLimits) {
      validateTranslationRequestFieldSize('text', text, TRANSLATION_ENRICHMENT_LIMITS.selectedText, metadata);
      if (context !== undefined) {
        validateTranslationRequestFieldSize('context', context, TRANSLATION_ENRICHMENT_LIMITS.context, metadata);
      }
    }
    return {
      requestId,
      text,
      source,
      ...(context !== undefined ? { context } : {}),
    };
  }

  const text = args.includes('--stdin')
    ? stdin
    : enforceEnrichmentLimits
      ? getExplicitText(args)
      : (getFlagValue(args, '--text') ?? args.filter((arg) => !arg.startsWith('--')).join(' '));
  const requestId = randomUUID();
  if (enforceEnrichmentLimits) {
    validateTranslationRequestFieldSize(
      'text',
      text,
      TRANSLATION_ENRICHMENT_LIMITS.selectedText,
      safeRequestMetadata(requestId, 'cli'),
    );
  }
  if (!text.trim()) {
    throw new TranslationCliError('EMPTY_SELECTION', 'Selected text must not be empty.', {
      requestId,
      source: 'cli',
    });
  }
  return { requestId, text, source: 'cli' };
}

function getExplicitText(args: string[]): string {
  const index = args.indexOf('--text');
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : '';
}

function toTranslationError(error: unknown, request?: TranslationRequest): TranslationCliError {
  if (error instanceof TranslationCliError) return error;
  if (error instanceof Error && error.message === 'Selected text must not be empty.') {
    return new TranslationCliError('EMPTY_SELECTION', error.message, {
      requestId: request?.requestId,
      source: request?.source,
    });
  }
  return new TranslationCliError('TRANSLATION_ERROR', error instanceof Error ? error.message : String(error), {
    requestId: request?.requestId,
    source: request?.source,
  });
}

type TranslationEnrichmentCliErrorCode =
  | 'MISSING_BACKEND'
  | 'UNSAFE_AGENT_BACKEND'
  | 'AGENT_FAILURE'
  | 'TRANSLATION_AGENT_OUTPUT_TOO_LARGE'
  | TranslationEnrichmentErrorCode
  | TranslationErrorCode
  | 'TRANSLATION_ENRICHMENT_ERROR';

class TranslationEnrichmentCliError extends Error {
  constructor(
    readonly code: TranslationEnrichmentCliErrorCode,
    message: string,
    readonly metadata: { requestId?: string; source?: string } = {},
  ) {
    super(message);
  }
}

function parseExternalAgentBackend(value: string | undefined): ExternalAgentBackend {
  if (value === 'claude' || value === 'codex') return value;
  throw new TranslationEnrichmentCliError(
    'MISSING_BACKEND',
    'Translation enrichment requires --backend claude or --backend codex.',
  );
}

function toTranslationEnrichmentError(error: unknown, request?: TranslationRequest): TranslationEnrichmentCliError {
  const requestMetadata = {
    ...(request?.requestId ? { requestId: request.requestId } : {}),
    ...(request?.source ? { source: request.source } : {}),
  };
  if (error instanceof TranslationCliError) {
    return new TranslationEnrichmentCliError(error.code, error.message, {
      ...requestMetadata,
      ...error.metadata,
    });
  }
  if (error instanceof TranslationEnrichmentCliError) {
    return new TranslationEnrichmentCliError(error.code, error.message, {
      ...requestMetadata,
      ...error.metadata,
    });
  }
  if (error instanceof TranslationEnrichmentError) {
    return new TranslationEnrichmentCliError(error.code, error.message, requestMetadata);
  }
  return new TranslationEnrichmentCliError(
    'TRANSLATION_ENRICHMENT_ERROR',
    error instanceof Error ? error.message : String(error),
    requestMetadata,
  );
}

function validateTranslationRequestFieldSize(
  field: string,
  value: string,
  maxLength: number,
  metadata: { requestId?: string; source?: string } = {},
): void {
  if (value.length > maxLength) {
    throw new TranslationCliError(
      'TRANSLATION_REQUEST_FIELD_TOO_LARGE',
      `Translation request field "${field}" exceeds the ${maxLength}-character limit.`,
      metadata,
    );
  }
}

function safeRequestMetadata(requestId?: string, source?: string): { requestId?: string; source?: string } {
  return {
    ...(requestId && requestId.length <= TRANSLATION_ENRICHMENT_LIMITS.requestId ? { requestId } : {}),
    ...(source && source.length <= TRANSLATION_ENRICHMENT_LIMITS.source ? { source } : {}),
  };
}

function formatEnrichmentDryRun(request: TranslationRequest, result: ExternalAgentRunResult): string {
  return [
    `Request: ${request.requestId}`,
    `Source: ${request.source}`,
    'Stage: agent',
    'Status: loading',
    formatExternalAgentRunResult(result),
  ].join('\n');
}

function formatEnrichment(response: TranslationEnrichmentStageResponse): string {
  if (!response.result) return 'No agent enrichment result.\n';
  return [
    response.result.translation,
    ...(response.result.partOfSpeech ? [`Part of speech: ${response.result.partOfSpeech}`] : []),
    `Explanation: ${response.result.explanation}`,
    ...(response.result.examples?.length ? [`Examples: ${response.result.examples.join('; ')}`] : []),
    ...(response.result.collocations?.length ? [`Collocations: ${response.result.collocations.join('; ')}`] : []),
    '',
  ].join('\n');
}

function formatTranslation(response: TranslationStageResponse): string {
  const result = response.result;
  if (!result) return 'No local translation result.\n';
  return [
    result.original,
    `Source: ${response.source}`,
    `Kind: ${result.kind}`,
    ...(result.translation ? [`Translation: ${result.translation}`] : ['Translation: unavailable locally']),
    ...(result.pronunciation ? [`Pronunciation: ${result.pronunciation}`] : []),
    `Explanation: ${result.explanation}`,
    '',
  ].join('\n');
}
