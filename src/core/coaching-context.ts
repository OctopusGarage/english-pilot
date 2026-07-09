import type { EnglishPilotConfig } from './types.js';
import type { PromptEvent } from '../storage/repository.js';

export type InlineCoachingDecisionReason = 'available' | 'intensity-low' | 'daily-cap-reached' | 'cooldown-active';

export interface CoachingContext {
  guidance: string;
  finalResponseInstruction: string;
  cadence: string;
  policy: {
    intensity: EnglishPilotConfig['coachingIntensity'];
    cooldownMinutes: number;
    maxInlineCoachingPerDay: number;
  };
  today: {
    date: string;
    coachingShown: number;
    remaining: number;
  };
  cooldown: {
    active: boolean;
    lastShownAt?: string;
    until?: string;
  };
  decision: {
    shouldOfferInlineCoaching: boolean;
    reason: InlineCoachingDecisionReason;
  };
}

export function buildCoachingContext(input: {
  config: EnglishPilotConfig;
  promptEvents: PromptEvent[];
  now?: Date;
}): CoachingContext {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const coachingEvents = input.promptEvents.filter((event) => event.coachingShown);
  const todayCoachingShown = coachingEvents.filter((event) => event.createdAt.slice(0, 10) === today).length;
  const remaining = Math.max(0, input.config.maxInlineCoachingPerDay - todayCoachingShown);
  const lastCoachingEvent = [...coachingEvents].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const cooldownUntil = buildCooldownUntil(lastCoachingEvent, input.config.coachingCooldownMinutes);
  const cooldownActive = cooldownUntil !== undefined && cooldownUntil.getTime() > now.getTime();
  const forceMode = input.config.coachingIntensity === 'force';
  const reason = decideInlineCoaching({
    intensity: input.config.coachingIntensity,
    remaining,
    cooldownActive,
  });

  return {
    guidance: [
      "Do not derail the user's main task.",
      forceMode
        ? 'Force mode is enabled: append one concise English note whenever the prompt has Chinese fragments, non-native phrasing, or a clearly better everyday expression.'
        : 'When useful, add at most one short English note.',
      'Prefer practical workplace English, brief teaching rationale, and reusable expressions.',
    ].join(' '),
    finalResponseInstruction: [
      'Finish the main task first.',
      forceMode
        ? 'For the latest allowed user prompt, append one concise note if it contains any Chinese fragment, awkward English, or obvious phrasing improvement:'
        : 'If the latest allowed user prompt contains Chinese or awkward English, append one concise note:',
      'English note: "original phrase" -> "more natural English"; Why: one practical rule; IPA: key word /IPA/ when useful.',
    ].join(' '),
    cadence: [
      forceMode
        ? 'Force mode bypasses cooldown and daily-cap intent for teachable user prompts; keep the note compact and professional.'
        : 'Respect the configured coaching intensity, cooldown, and daily cap.',
      'Skip only when there is no meaningful wording improvement.',
    ].join(' '),
    policy: {
      intensity: input.config.coachingIntensity,
      cooldownMinutes: input.config.coachingCooldownMinutes,
      maxInlineCoachingPerDay: input.config.maxInlineCoachingPerDay,
    },
    today: {
      date: today,
      coachingShown: todayCoachingShown,
      remaining,
    },
    cooldown: {
      active: cooldownActive,
      ...(lastCoachingEvent ? { lastShownAt: lastCoachingEvent.createdAt } : {}),
      ...(cooldownActive && cooldownUntil ? { until: cooldownUntil.toISOString() } : {}),
    },
    decision: {
      shouldOfferInlineCoaching: reason === 'available',
      reason,
    },
  };
}

function decideInlineCoaching(input: {
  intensity: EnglishPilotConfig['coachingIntensity'];
  remaining: number;
  cooldownActive: boolean;
}): InlineCoachingDecisionReason {
  if (input.intensity === 'low') return 'intensity-low';
  if (input.remaining <= 0) return 'daily-cap-reached';
  if (input.cooldownActive) return 'cooldown-active';
  return 'available';
}

function buildCooldownUntil(event: PromptEvent | undefined, cooldownMinutes: number): Date | undefined {
  if (!event || cooldownMinutes <= 0) return undefined;
  return new Date(new Date(event.createdAt).getTime() + cooldownMinutes * 60 * 1000);
}
