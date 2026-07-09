import { integrationsMcpToolDefinitions } from './mcp-tools-integrations.js';
import { learningMcpToolDefinitions } from './mcp-tools-learning.js';
import { projectMcpToolDefinitions } from './mcp-tools-project.js';
import { voiceMcpToolDefinitions } from './mcp-tools-voice.js';
import type { McpToolDefinition } from './mcp-tool-types.js';

export type { McpToolDefinition } from './mcp-tool-types.js';

const unorderedMcpToolDefinitions = [
  ...learningMcpToolDefinitions,
  ...projectMcpToolDefinitions,
  ...integrationsMcpToolDefinitions,
  ...voiceMcpToolDefinitions,
] as const satisfies readonly McpToolDefinition[];

const mcpToolDefinitionOrder = [
  'english_analyze_text',
  'english_status',
  'english_roadmap',
  'english_roadmap_next',
  'english_roadmap_env_template',
  'english_external_validation_bundle',
  'english_external_validation_bundle_verify',
  'english_config_profiles',
  'english_config_use',
  'english_config_profile_status',
  'english_config_progression_suggestion',
  'english_config_progression_apply',
  'english_rewrite_text',
  'english_pronounce_text',
  'english_method_templates',
  'english_extract_lesson',
  'english_record_learning_item',
  'english_record_method_template',
  'english_review_queue',
  'english_review_due',
  'english_review_upcoming',
  'english_daily_review',
  'english_daily_check',
  'english_daily_pack',
  'english_mark_review',
  'english_update_review_item',
  'english_remove_review_item',
  'english_review_cleanup',
  'english_integration_targets',
  'english_integration_credential_policy',
  'english_integration_delivery_mode',
  'english_integration_daily_pack',
  'english_integration_dry_run',
  'english_integration_preflight',
  'english_integration_send_readiness',
  'english_integration_send',
  'english_integration_account_guide',
  'english_integration_account_validate',
  'english_integration_validation_history',
  'english_integration_message_coaching',
  'english_integration_event_coaching',
  'english_integration_deliver',
  'english_record_voice_practice',
  'english_doctor',
  'english_voice_providers',
  'english_voice_stt_policy',
  'english_voice_stt_contract',
  'english_voice_stt_validate',
  'english_voice_stt_assess_provider',
  'english_voice_stt_assessment_history',
  'english_voice_stt_provider_contract_draft',
  'english_voice_stt_wrapper_template',
  'english_voice_preflight',
  'english_voice_transcribe',
  'english_voice_practice_from_audio',
  'english_coaching_context',
] as const;

export const mcpToolDefinitions = mcpToolDefinitionOrder.map((name) => {
  const definition = unorderedMcpToolDefinitions.find((tool) => tool.name === name);
  if (!definition) throw new Error(`Missing MCP tool definition: ${name}`);
  return definition;
});

export type EnglishPilotMcpToolName = (typeof mcpToolDefinitions)[number]['name'];
export type EnglishPilotMcpToolDefinition = (typeof mcpToolDefinitions)[number];

export const mcpToolNames = mcpToolDefinitions.map((tool) => tool.name) as EnglishPilotMcpToolName[];

export function listMcpToolDefinitions(): readonly EnglishPilotMcpToolDefinition[] {
  return mcpToolDefinitions;
}

export function listMcpTools(): EnglishPilotMcpToolName[] {
  return [...mcpToolNames];
}
