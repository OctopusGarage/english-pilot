import {
  extractExternalAgentReplyText,
  runExternalAgent,
  type ExternalAgentBackend,
  type ExternalAgentRunResult,
} from '../agent/runner.js';
import { loadConfig } from '../core/config.js';
import type { EnglishPilotConfig } from '../core/types.js';
import { getAgentEvalCase, type AgentEvalAssertion, type AgentEvalCaseId } from './agent-eval-cases.js';
export type { AgentEvalAssertion, AgentEvalCaseId } from './agent-eval-cases.js';

export interface AgentEvalReport {
  operation: 'english-pilot-agent-eval';
  backend: ExternalAgentBackend;
  caseId: AgentEvalCaseId;
  dryRun: boolean;
  passed: boolean;
  prompt: string;
  run: ExternalAgentRunResult;
  replyText?: string;
  assertions: AgentEvalAssertion[];
}

export async function runAgentEval(input: {
  backend: ExternalAgentBackend;
  caseId?: AgentEvalCaseId;
  cwd?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  config?: EnglishPilotConfig;
  runAgent?: typeof runExternalAgent;
}): Promise<AgentEvalReport> {
  const caseId = input.caseId ?? 'channel-weather';
  const testCase = getAgentEvalCase(caseId);
  const prompt = testCase.buildPrompt(input.backend);
  const config = input.config ?? loadConfig();
  const dryRun = input.dryRun === true;
  const run = await (input.runAgent ?? runExternalAgent)({
    config,
    prompt,
    backend: input.backend,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    dryRun,
  });
  const replyText = dryRun ? undefined : extractExternalAgentReplyText(run);
  const assertions = dryRun ? testCase.dryRunAssertions(run) : testCase.replyAssertions(run, replyText ?? '');
  return {
    operation: 'english-pilot-agent-eval',
    backend: input.backend,
    caseId,
    dryRun,
    passed: assertions.every((assertion) => assertion.passed),
    prompt,
    run,
    ...(replyText ? { replyText } : {}),
    assertions,
  };
}

export function formatAgentEvalReport(report: AgentEvalReport): string {
  return [
    `EnglishPilot agent eval: ${report.passed ? 'passed' : 'failed'}`,
    `Backend: ${report.backend}`,
    `Case: ${report.caseId}`,
    `Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    ...report.assertions.map((item) => `${item.passed ? 'PASS' : 'FAIL'} ${item.id} - ${item.summary}`),
    ...(report.replyText ? ['', report.replyText.trim()] : []),
    '',
  ].join('\n');
}
