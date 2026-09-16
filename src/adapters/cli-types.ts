import type { IntegrationFetch } from '../integrations/network-sender.js';
import type { runExternalAgent } from '../agent/runner.js';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
  runAgent?: typeof runExternalAgent;
}
