import qrcode from 'qrcode-terminal';
import { defaultWeChatBaseUrl, saveWeChatAccount, type WeChatAccount } from './state.js';
import { getWeChatQrStatus, startWeChatQrLogin } from './api.js';

export interface WeChatOnboardingResult {
  account?: WeChatAccount;
  connected: boolean;
  message: string;
}

export async function runWeChatOnboarding(
  input: {
    fetch?: typeof fetch;
    timeoutMs?: number;
    pollIntervalMs?: number;
    log?: (line: string) => void;
  } = {},
): Promise<WeChatOnboardingResult> {
  const log = input.log ?? console.error;
  const baseUrl = defaultWeChatBaseUrl();
  const qr = await startWeChatQrLogin({ baseUrl, fetch: input.fetch });
  if (!qr.qrcode || !qr.qrcodeUrl) {
    return { connected: false, message: 'WeChat QR login did not return a QR code.' };
  }
  log('Scan this QR code with WeChat to connect EnglishPilot:');
  log(qr.qrcodeUrl);
  qrcode.generate(qr.qrcodeUrl, { small: true }, (code) => log(code));

  const deadline = Date.now() + (input.timeoutMs ?? 480_000);
  let currentBaseUrl = baseUrl;
  while (Date.now() < deadline) {
    const status = await getWeChatQrStatus({
      baseUrl: currentBaseUrl,
      qrcode: qr.qrcode,
      fetch: input.fetch,
    });
    if (status.status === 'scaned') {
      log('Scanned. Confirm the login in WeChat.');
    }
    if (status.status === 'scaned_but_redirect' && status.redirectHost) {
      currentBaseUrl = `https://${status.redirectHost}`;
    }
    if (status.status === 'confirmed' && status.accountId && status.token) {
      const account = saveWeChatAccount({
        accountId: status.accountId,
        token: status.token,
        baseUrl: status.baseUrl || currentBaseUrl,
        userId: status.userId,
      });
      return {
        connected: true,
        account,
        message: `Connected WeChat account ${account.accountId}.`,
      };
    }
    if (status.status === 'expired') {
      return { connected: false, message: 'WeChat QR code expired. Run setup again.' };
    }
    await sleep(input.pollIntervalMs ?? 1000);
  }
  return { connected: false, message: 'WeChat QR login timed out.' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
