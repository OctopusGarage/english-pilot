import { findVoiceProvider } from '../core/voice-providers.js';
import { findIntegrationTarget } from '../integrations/targets.js';

export function requireIntegrationTarget(args: Record<string, unknown>) {
  const target = findIntegrationTarget(requireString(args, 'target'));
  if (!target) throw new Error('MCP argument target must be one of obsidian, feishu, wechat, or voice.');
  return target;
}

export function requireIntegrationMessageTarget(args: Record<string, unknown>) {
  const target = requireIntegrationTarget(args);
  if (target.id !== 'feishu' && target.id !== 'wechat') {
    throw new Error('MCP argument target must be feishu or wechat.');
  }
  return target;
}

export function requireVoiceProvider(args: Record<string, unknown>) {
  const provider = findVoiceProvider(requireString(args, 'provider'));
  if (!provider) throw new Error('MCP argument provider must be one of manual, local-whisper, or cloud-stt.');
  return provider;
}

export function requireReviewOutcome(args: Record<string, unknown>): 'again' | 'hard' | 'easy' {
  const value = args.outcome;
  if (value === 'again' || value === 'hard' || value === 'easy') return value;
  throw new Error('MCP argument outcome must be again, hard, or easy.');
}

export function requireText(args: Record<string, unknown>): string {
  return requireString(args, 'text');
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`MCP argument ${key} must be a non-empty string.`);
  }
  return value;
}

export function requireObject(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`MCP argument ${key} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

export function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

export function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
}
