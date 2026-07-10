import type { EnglishPilotConfig } from './types.js';
import { buildConfigProfileStatus, configProfiles, type ConfigProfile } from './config-profiles.js';
import { saveConfig } from './config.js';
import type { PromptEvent } from '../storage/repository.js';

export type RatioProgressionAction = 'collect_more_data' | 'tighten' | 'relax' | 'keep';

export interface RatioProgressionRecommendation {
  action: RatioProgressionAction;
  profile: ConfigProfile | null;
  command: string | null;
  reason: string;
}

export interface RatioProgressionSuggestion {
  mode: EnglishPilotConfig['ratioProgression'];
  minimumEvents: number;
  recentEventLimit: number;
  eventCount: number;
  analyzedEvents: number;
  blockedPrompts: number;
  blockedRate: number;
  averageNonEnglishRatio: number;
  currentProfile: ConfigProfile | null;
  recommendation: RatioProgressionRecommendation;
}

export interface RatioProgressionApplyResult {
  mode: EnglishPilotConfig['ratioProgression'];
  dryRun: boolean;
  applied: boolean;
  blocker: string | null;
  targetProfile: ConfigProfile | null;
  suggestion: RatioProgressionSuggestion;
  config?: EnglishPilotConfig;
}

const MINIMUM_EVENTS = 5;
const RECENT_EVENT_LIMIT = 20;

export function buildRatioProgressionSuggestion(
  config: EnglishPilotConfig,
  promptEvents: PromptEvent[],
): RatioProgressionSuggestion {
  const recentEvents = promptEvents.slice(-RECENT_EVENT_LIMIT);
  const blockedPrompts = recentEvents.filter((event) => event.decision === 'BLOCK').length;
  const blockedRate = recentEvents.length === 0 ? 0 : blockedPrompts / recentEvents.length;
  const averageNonEnglishRatio =
    recentEvents.length === 0
      ? 0
      : recentEvents.reduce((sum, event) => sum + event.nonEnglishRatio, 0) / recentEvents.length;
  const currentProfile = buildConfigProfileStatus(config).activeProfile;
  const base = {
    mode: config.ratioProgression,
    minimumEvents: MINIMUM_EVENTS,
    recentEventLimit: RECENT_EVENT_LIMIT,
    eventCount: promptEvents.length,
    analyzedEvents: recentEvents.length,
    blockedPrompts,
    blockedRate,
    averageNonEnglishRatio,
    currentProfile,
  };

  if (recentEvents.length < MINIMUM_EVENTS) {
    return {
      ...base,
      recommendation: {
        action: 'collect_more_data',
        profile: null,
        command: null,
        reason: `Need at least ${MINIMUM_EVENTS} prompt events before suggesting a threshold change.`,
      },
    };
  }

  const beginner = requireProfile('beginner');
  const balanced = requireProfile('balanced');
  const strict = requireProfile('strict');

  if (blockedRate >= 0.4 && config.maxChineseRatio < beginner.maxChineseRatio) {
    return withProfile(
      base,
      'relax',
      beginner,
      'Frequent blocked prompts suggest the current threshold is too strict for now.',
    );
  }

  if (averageNonEnglishRatio <= strict.targetChineseRatio && config.maxChineseRatio > strict.maxChineseRatio) {
    return withProfile(base, 'tighten', strict, 'Recent prompts are consistently below the strict coaching target.');
  }

  if (averageNonEnglishRatio <= balanced.targetChineseRatio && config.maxChineseRatio > balanced.maxChineseRatio) {
    return withProfile(
      base,
      'tighten',
      balanced,
      'Recent prompts are consistently below the balanced coaching target.',
    );
  }

  return {
    ...base,
    recommendation: {
      action: 'keep',
      profile: currentProfile,
      command: null,
      reason: 'Current prompt history does not justify changing the learning intensity profile.',
    },
  };
}

export function applyRatioProgressionSuggestion(
  config: EnglishPilotConfig,
  promptEvents: PromptEvent[],
  options: { apply: boolean },
): RatioProgressionApplyResult {
  const suggestion = buildRatioProgressionSuggestion(config, promptEvents);
  const targetProfile = suggestion.recommendation.profile;
  const base = {
    mode: config.ratioProgression,
    dryRun: !options.apply,
    applied: false,
    targetProfile,
    suggestion,
  };

  if (config.ratioProgression !== 'scheduled') {
    return {
      ...base,
      blocker: 'ratioProgression is manual',
    };
  }

  if (
    !targetProfile ||
    (suggestion.recommendation.action !== 'tighten' && suggestion.recommendation.action !== 'relax')
  ) {
    return {
      ...base,
      blocker: `No applicable profile recommendation: ${suggestion.recommendation.action}`,
    };
  }

  if (!options.apply) {
    return {
      ...base,
      blocker: null,
    };
  }

  const nextConfig: EnglishPilotConfig = {
    ...config,
    gateMode: targetProfile.gateMode,
    maxChineseRatio: targetProfile.maxChineseRatio,
    targetChineseRatio: targetProfile.targetChineseRatio,
    coachingIntensity: targetProfile.coachingIntensity,
    coachingCooldownMinutes: targetProfile.coachingCooldownMinutes,
    maxInlineCoachingPerDay: targetProfile.maxInlineCoachingPerDay,
  };
  saveConfig(nextConfig);
  return {
    ...base,
    dryRun: false,
    applied: true,
    blocker: null,
    config: nextConfig,
  };
}

export function formatRatioProgressionSuggestion(suggestion: RatioProgressionSuggestion): string {
  const percent = Math.round(suggestion.averageNonEnglishRatio * 100);
  return [
    'Ratio progression suggestion',
    `Mode: ${suggestion.mode}`,
    `Events: ${suggestion.analyzedEvents}/${suggestion.minimumEvents} minimum (${suggestion.eventCount} total)`,
    `Average Chinese/non-English ratio: ${percent}%`,
    `Blocked prompts: ${suggestion.blockedPrompts} (${Math.round(suggestion.blockedRate * 100)}%)`,
    `Recommendation: ${suggestion.recommendation.action}`,
    `Profile: ${suggestion.recommendation.profile?.id ?? 'none'}`,
    `Command: ${suggestion.recommendation.command ?? 'none'}`,
    `Reason: ${suggestion.recommendation.reason}`,
    '',
  ].join('\n');
}

export function formatRatioProgressionApplyResult(result: RatioProgressionApplyResult): string {
  return [
    'Ratio progression apply',
    `Mode: ${result.mode}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Applied: ${result.applied ? 'yes' : 'no'}`,
    `Target profile: ${result.targetProfile?.id ?? 'none'}`,
    `Blocker: ${result.blocker ?? 'none'}`,
    `Recommendation: ${result.suggestion.recommendation.action}`,
    '',
  ].join('\n');
}

function withProfile(
  base: Omit<RatioProgressionSuggestion, 'recommendation'>,
  action: 'tighten' | 'relax',
  profile: ConfigProfile,
  reason: string,
): RatioProgressionSuggestion {
  return {
    ...base,
    recommendation: {
      action,
      profile,
      command: `english-pilot config use ${profile.id}`,
      reason,
    },
  };
}

function requireProfile(id: ConfigProfile['id']): ConfigProfile {
  const profile = configProfiles.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Missing config profile: ${id}`);
  return profile;
}
