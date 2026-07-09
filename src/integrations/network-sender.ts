import type { IntegrationSendReadiness } from './send-readiness.js';

type SendTargetApi = 'deprecated-network-send';

export interface IntegrationNetworkDeliveryResult {
  target: IntegrationSendReadiness['target'];
  operation: 'daily-review-delivery';
  delivered: true;
  wouldSend: true;
  network: true;
  targetApi: SendTargetApi;
  auth: {
    credentialPolicy: 'environment';
    storedSecrets: false;
  };
  providerResponse: Record<string, unknown>;
}

export interface SendDailyReviewIntegrationInput {
  readiness: IntegrationSendReadiness;
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}

export type IntegrationFetch = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<IntegrationHttpResponse>;

export interface IntegrationHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export async function sendDailyReviewIntegration(
  input: SendDailyReviewIntegrationInput,
): Promise<IntegrationNetworkDeliveryResult> {
  if (!input.readiness.ready) {
    throw new Error(`Integration is not ready to send: ${input.readiness.blockers.join('; ')}`);
  }
  throw new Error(
    'Integration send is deprecated for WeChat. Use `english-pilot wechat start` for the QR-login long-connection channel.',
  );
}
