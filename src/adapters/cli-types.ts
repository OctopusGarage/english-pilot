import type { IntegrationFetch } from '../integrations/network-sender.js';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}
