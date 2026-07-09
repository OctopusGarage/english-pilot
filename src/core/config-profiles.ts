import type { EnglishPilotConfig } from './types.js';
import { loadConfig, saveConfig } from './config.js';

export type ConfigProfileId = 'beginner' | 'balanced' | 'strict' | 'force';

export interface ConfigProfile {
  id: ConfigProfileId;
  label: string;
  description: string;
  maxChineseRatio: number;
  targetChineseRatio: number;
  coachingIntensity: EnglishPilotConfig['coachingIntensity'];
  coachingCooldownMinutes: number;
  maxInlineCoachingPerDay: number;
}

export interface ConfigProfileDifference {
  key: keyof Pick<
    EnglishPilotConfig,
    | 'maxChineseRatio'
    | 'targetChineseRatio'
    | 'coachingIntensity'
    | 'coachingCooldownMinutes'
    | 'maxInlineCoachingPerDay'
  >;
  actual: string | number;
  expected: string | number;
}

export interface ConfigProfileStatus {
  activeProfile: ConfigProfile | null;
  nearestProfile: ConfigProfile;
  differences: ConfigProfileDifference[];
}

export const configProfiles: ConfigProfile[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Allow more Chinese while building the habit of English-leading prompts.',
    maxChineseRatio: 0.5,
    targetChineseRatio: 0.2,
    coachingIntensity: 'low',
    coachingCooldownMinutes: 20,
    maxInlineCoachingPerDay: 4,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default first-version balance: English-dominant prompts with occasional coaching.',
    maxChineseRatio: 0.3,
    targetChineseRatio: 0.1,
    coachingIntensity: 'medium',
    coachingCooldownMinutes: 10,
    maxInlineCoachingPerDay: 8,
  },
  {
    id: 'strict',
    label: 'Strict',
    description: 'Push toward English-first prompts with more frequent coaching opportunities.',
    maxChineseRatio: 0.1,
    targetChineseRatio: 0.03,
    coachingIntensity: 'high',
    coachingCooldownMinutes: 0,
    maxInlineCoachingPerDay: 12,
  },
  {
    id: 'force',
    label: 'Force',
    description:
      'Maximum coaching pressure: allow only English-first prompts and surface a teaching note whenever useful.',
    maxChineseRatio: 0.1,
    targetChineseRatio: 0,
    coachingIntensity: 'force',
    coachingCooldownMinutes: 0,
    maxInlineCoachingPerDay: 999,
  },
];

export function findConfigProfile(id: string | undefined): ConfigProfile | undefined {
  return configProfiles.find((profile) => profile.id === id);
}

export function applyConfigProfile(profile: ConfigProfile): EnglishPilotConfig {
  const current = loadConfig();
  const next: EnglishPilotConfig = {
    ...current,
    maxChineseRatio: profile.maxChineseRatio,
    targetChineseRatio: profile.targetChineseRatio,
    coachingIntensity: profile.coachingIntensity,
    coachingCooldownMinutes: profile.coachingCooldownMinutes,
    maxInlineCoachingPerDay: profile.maxInlineCoachingPerDay,
  };
  saveConfig(next);
  return next;
}

export function buildConfigProfileStatus(config = loadConfig()): ConfigProfileStatus {
  const scored = configProfiles
    .map((profile) => ({
      profile,
      differences: differencesForProfile(config, profile),
    }))
    .sort((left, right) => left.differences.length - right.differences.length);
  const nearest = scored[0];
  return {
    activeProfile: nearest.differences.length === 0 ? nearest.profile : null,
    nearestProfile: nearest.profile,
    differences: nearest.differences,
  };
}

export function formatConfigProfiles(profiles: ConfigProfile[]): string {
  return (
    profiles
      .map((profile) =>
        [
          `${profile.id} - ${profile.label}`,
          `  ${profile.description}`,
          `  maxChineseRatio: ${profile.maxChineseRatio}`,
          `  targetChineseRatio: ${profile.targetChineseRatio}`,
          `  coachingIntensity: ${profile.coachingIntensity}`,
          `  coachingCooldownMinutes: ${profile.coachingCooldownMinutes}`,
          `  maxInlineCoachingPerDay: ${profile.maxInlineCoachingPerDay}`,
        ].join('\n'),
      )
      .join('\n\n') + '\n'
  );
}

export function formatConfigProfileStatus(status: ConfigProfileStatus): string {
  return [
    `Active profile: ${status.activeProfile ? status.activeProfile.id : 'custom'}`,
    `Nearest profile: ${status.nearestProfile.id}`,
    'Differences:',
    ...(status.differences.length > 0
      ? status.differences.map(
          (difference) => `- ${difference.key}: actual ${difference.actual}, expected ${difference.expected}`,
        )
      : ['- none']),
    '',
  ].join('\n');
}

function differencesForProfile(config: EnglishPilotConfig, profile: ConfigProfile): ConfigProfileDifference[] {
  const keys: ConfigProfileDifference['key'][] = [
    'maxChineseRatio',
    'targetChineseRatio',
    'coachingIntensity',
    'coachingCooldownMinutes',
    'maxInlineCoachingPerDay',
  ];
  return keys
    .filter((key) => config[key] !== profile[key])
    .map((key) => ({
      key,
      actual: config[key],
      expected: profile[key],
    }));
}
