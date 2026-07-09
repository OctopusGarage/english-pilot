import { join } from 'node:path';
import { getEnglishPilotHome } from '../core/config.js';
import {
  buildDailyReviewDeliveryDryRun,
  buildDailyReviewDeliveryPayload,
  buildDailyReviewDeliveryReadiness,
  runDailyReviewAccountValidation,
  runDailyReviewDeliverySend,
} from '../integrations/daily-review-delivery.js';
import { deliverObsidianDailyReview, formatDailyReviewDelivery } from '../integrations/deliver.js';
import { formatDailyReviewDryRun } from '../integrations/dry-run.js';
import { buildIntegrationAccountGuide, formatIntegrationAccountGuide } from '../integrations/account-guide.js';
import { formatIntegrationAccountValidation } from '../integrations/account-validation.js';
import {
  buildIntegrationCredentialPolicy,
  formatIntegrationCredentialPolicy,
} from '../integrations/credential-policy.js';
import {
  buildIntegrationDeliveryModePolicy,
  formatIntegrationDeliveryModePolicy,
} from '../integrations/delivery-mode.js';
import {
  buildIntegrationMessageCoachingPayload,
  buildIntegrationMessageLearningItem,
  formatIntegrationMessageCoaching,
} from '../integrations/message-coaching.js';
import { buildIntegrationEventCoaching } from '../integrations/message-events.js';
import { buildIntegrationPreflight } from '../integrations/preflight.js';
import { type IntegrationNetworkDeliveryResult } from '../integrations/network-sender.js';
import { formatIntegrationSendReadiness } from '../integrations/send-readiness.js';
import { findIntegrationTarget, formatIntegrationTargets, listIntegrationTargets } from '../integrations/targets.js';
import {
  type IntegrationValidationRequirement,
  formatIntegrationValidationHistory,
  listIntegrationValidationRecords,
} from '../integrations/validation-history.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { isDateKey } from '../core/review-schedule.js';
import { listLearningItems, recordLearningItem } from '../storage/repository.js';
import type { CliAsyncOptions, CliResult } from './cli-types.js';

export function runIntegrations(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'targets') {
    const targets = listIntegrationTargets();
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify({ targets }, null, 2)}\n` : formatIntegrationTargets(targets),
      stderr: '',
    };
  }
  if (subcommand === 'daily-pack') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    if (!target || !isDateKey(date)) {
      return usage('english-pilot integrations daily-pack --target <target> [--date YYYY-MM-DD] [--json]');
    }

    const payload = buildDailyReviewDeliveryPayload({
      target,
      date,
      items: listLearningItems(),
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(payload, null, 2)}\n` : payload.pack.markdown,
      stderr: '',
    };
  }
  if (subcommand === 'credential-policy') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    if (!target) return usage('english-pilot integrations credential-policy --target <target> [--json]');

    const policy = buildIntegrationCredentialPolicy(target);
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(policy, null, 2)}\n`
        : formatIntegrationCredentialPolicy(policy),
      stderr: '',
    };
  }
  if (subcommand === 'delivery-mode') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    if (!target) return usage('english-pilot integrations delivery-mode --target <target> [--json]');

    const policy = buildIntegrationDeliveryModePolicy(target);
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(policy, null, 2)}\n`
        : formatIntegrationDeliveryModePolicy(policy),
      stderr: '',
    };
  }
  if (subcommand === 'dry-run') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    if (!target || !isDateKey(date)) {
      return usage('english-pilot integrations dry-run --target <target> [--date YYYY-MM-DD] [--json]');
    }

    const dryRun = buildDailyReviewDeliveryDryRun({
      target,
      date,
      items: listLearningItems(),
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(dryRun, null, 2)}\n` : formatDailyReviewDryRun(dryRun),
      stderr: '',
    };
  }
  if (subcommand === 'preflight') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    if (!target) return usage('english-pilot integrations preflight --target <target> [--json]');

    const preflight = buildIntegrationPreflight(target);
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(preflight, null, 2)}\n`
        : formatIntegrationPreflight(preflight),
      stderr: '',
    };
  }
  if (subcommand === 'send-readiness') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    if (!target || target.id !== 'wechat' || !isDateKey(date)) {
      return usage(
        'english-pilot integrations send-readiness --target wechat [--date YYYY-MM-DD] [--confirm-send] [--json]',
      );
    }

    const readiness = buildDailyReviewDeliveryReadiness({
      target,
      date,
      items: listLearningItems(),
      confirmSend: args.includes('--confirm-send'),
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(readiness, null, 2)}\n`
        : formatIntegrationSendReadiness(readiness),
      stderr: '',
    };
  }
  if (subcommand === 'send') {
    return usage(
      'english-pilot integrations send --target wechat [--date YYYY-MM-DD] --send [--require-validation] [--json]',
    );
  }
  if (subcommand === 'account-guide') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    if (!target || target.id !== 'wechat') {
      return usage('english-pilot integrations account-guide --target wechat [--json]');
    }

    const guide = buildIntegrationAccountGuide(target);
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(guide, null, 2)}\n` : formatIntegrationAccountGuide(guide),
      stderr: '',
    };
  }
  if (subcommand === 'account-validate') {
    return usage(
      'english-pilot integrations account-validate --target wechat [--date YYYY-MM-DD] [--send] [--record] [--json]',
    );
  }
  if (subcommand === 'validation-history') {
    const targetValue = getFlagValue(args, '--target');
    const target = targetValue ? findIntegrationTarget(targetValue) : undefined;
    if (targetValue && (!target || target.id !== 'wechat')) {
      return usage('english-pilot integrations validation-history [--target wechat] [--json]');
    }

    const records = listIntegrationValidationRecords({
      target: target?.id === 'wechat' ? target.id : undefined,
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ records }, null, 2)}\n`
        : formatIntegrationValidationHistory(records),
      stderr: '',
    };
  }
  if (subcommand === 'message-coaching') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    const text = getFlagValue(args, '--text');
    if (!target || !text?.trim()) {
      return usage('english-pilot integrations message-coaching --target <target> --text "..." [--record] [--json]');
    }

    const payload = buildIntegrationMessageCoachingPayload(target, text, allowedGlossaryTerms());
    const draft = args.includes('--record') ? buildIntegrationMessageLearningItem(payload) : undefined;
    const item = draft ? recordLearningItem(draft) : undefined;
    const output = args.includes('--record')
      ? { ...payload, recorded: item !== undefined, ...(item ? { item } : {}) }
      : payload;
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(output, null, 2)}\n`
        : formatIntegrationMessageCoaching(payload),
      stderr: '',
    };
  }
  if (subcommand === 'event-coaching') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    const rawEvent = getFlagValue(args, '--event-json');
    if (!target || target.id !== 'wechat' || !rawEvent?.trim()) {
      return usage('english-pilot integrations event-coaching --target wechat --event-json <json> [--record] [--json]');
    }

    let event: unknown;
    try {
      event = JSON.parse(rawEvent) as unknown;
    } catch {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Invalid integration event JSON.\n',
      };
    }

    try {
      const result = buildIntegrationEventCoaching({
        target,
        event,
        allowedTerms: allowedGlossaryTerms(),
        record: args.includes('--record'),
        recordLearningItem,
      });
      return {
        exitCode: 0,
        stdout: args.includes('--json')
          ? `${JSON.stringify(result, null, 2)}\n`
          : formatIntegrationMessageCoaching(result.coaching),
        stderr: '',
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `${error instanceof Error ? error.message : String(error)}\n`,
      };
    }
  }
  if (subcommand === 'deliver') {
    const target = findIntegrationTarget(getFlagValue(args, '--target'));
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    const directory = getFlagValue(args, '--dir') ?? join(getEnglishPilotHome(), 'integrations', 'obsidian');
    const write = args.includes('--write');
    if (!target || target.id !== 'obsidian' || !isDateKey(date)) {
      return usage(
        'english-pilot integrations deliver --target obsidian [--date YYYY-MM-DD] [--dir <path>] [--write] [--json]',
      );
    }

    const payload = buildDailyReviewDeliveryPayload({ target, date, items: listLearningItems() });
    const result = deliverObsidianDailyReview(target, payload, directory, write);
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : formatDailyReviewDelivery(result),
      stderr: '',
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: [
      'Usage:',
      '  english-pilot integrations targets [--json]',
      '  english-pilot integrations daily-pack --target <target> [--date YYYY-MM-DD] [--json]',
      '  english-pilot integrations credential-policy --target <target> [--json]',
      '  english-pilot integrations delivery-mode --target <target> [--json]',
      '  english-pilot integrations dry-run --target <target> [--date YYYY-MM-DD] [--json]',
      '  english-pilot integrations preflight --target <target> [--json]',
      '  english-pilot integrations send-readiness --target wechat [--date YYYY-MM-DD] [--confirm-send] [--json]',
      '  english-pilot integrations send --target wechat [--date YYYY-MM-DD] --send [--require-validation] [--json]',
      '  english-pilot integrations account-guide --target wechat [--json]',
      '  english-pilot integrations account-validate --target wechat [--date YYYY-MM-DD] [--send] [--record] [--json]',
      '  english-pilot integrations validation-history [--target wechat] [--json]',
      '  english-pilot integrations message-coaching --target <target> --text "..." [--record] [--json]',
      '  english-pilot integrations event-coaching --target wechat --event-json <json> [--record] [--json]',
      '  english-pilot integrations deliver --target obsidian [--date YYYY-MM-DD] [--dir <path>] [--write] [--json]',
      '',
    ].join('\n'),
  };
}

export async function runIntegrationAccountValidate(args: string[], options: CliAsyncOptions): Promise<CliResult> {
  const target = findIntegrationTarget(getFlagValue(args, '--target'));
  const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
  if (!target || target.id !== 'wechat' || !isDateKey(date)) {
    return usage(
      'english-pilot integrations account-validate --target wechat [--date YYYY-MM-DD] [--send] [--record] [--json]',
    );
  }

  const result = await runDailyReviewAccountValidation({
    target,
    date,
    items: listLearningItems(),
    send: args.includes('--send'),
    env: options.env,
    fetch: options.fetch,
    record: args.includes('--record'),
  });
  return {
    exitCode: result.validated ? 0 : 1,
    stdout: args.includes('--json')
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatIntegrationAccountValidation(result),
    stderr: '',
  };
}

export async function runIntegrationSend(args: string[], options: CliAsyncOptions): Promise<CliResult> {
  const target = findIntegrationTarget(getFlagValue(args, '--target'));
  const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
  const send = args.includes('--send');
  if (!target || target.id !== 'wechat' || !isDateKey(date) || !send) {
    return usage(
      'english-pilot integrations send --target wechat [--date YYYY-MM-DD] --send [--require-validation] [--json]',
    );
  }

  const readiness = buildDailyReviewDeliveryReadiness({
    target,
    date,
    items: listLearningItems(),
    env: options.env ?? process.env,
    confirmSend: send,
  });
  if (!readiness.ready) {
    return {
      exitCode: 1,
      stdout: args.includes('--json')
        ? `${JSON.stringify(readiness, null, 2)}\n`
        : formatIntegrationSendReadiness(readiness),
      stderr: '',
    };
  }

  try {
    const result = await runDailyReviewDeliverySend({
      target,
      date,
      items: listLearningItems(),
      env: options.env,
      fetch: options.fetch,
      requireValidation: args.includes('--require-validation'),
    });
    if (!('delivered' in result)) {
      return {
        exitCode: 1,
        stdout: args.includes('--json')
          ? `${JSON.stringify(result, null, 2)}\n`
          : 'checks' in result
            ? formatIntegrationSendReadiness(result)
            : formatIntegrationValidationRequirement(result),
        stderr: '',
      };
    }
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatIntegrationNetworkDelivery(result),
      stderr: '',
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}

function formatIntegrationNetworkDelivery(result: IntegrationNetworkDeliveryResult): string {
  return [
    `Delivered EnglishPilot daily review pack to ${result.target.label}`,
    `Target API: ${result.targetApi}`,
    `Network: ${result.network ? 'yes' : 'no'}`,
    `Credential policy: ${result.auth.credentialPolicy}`,
    '',
  ].join('\n');
}

function formatIntegrationValidationRequirement(requirement: IntegrationValidationRequirement): string {
  return [
    `Account validation required for ${requirement.target.label}`,
    `Ready: ${requirement.ready ? 'yes' : 'no'}`,
    `Validated: ${requirement.validated ? 'yes' : 'no'}`,
    '',
    'Blockers',
    ...(requirement.blockers.length > 0 ? requirement.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
  ].join('\n');
}

function formatIntegrationPreflight(preflight: ReturnType<typeof buildIntegrationPreflight>): string {
  return [
    `Integration preflight: ${preflight.target.label}`,
    `Ready: ${preflight.ready ? 'yes' : 'no'}`,
    `Network: ${preflight.network ? 'yes' : 'no'}`,
    `Missing: ${preflight.missing.length > 0 ? preflight.missing.join(', ') : 'none'}`,
    '',
  ].join('\n');
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries().map((entry) => entry.term);
}

function usage(command: string): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Usage: ${command}\n`,
  };
}
