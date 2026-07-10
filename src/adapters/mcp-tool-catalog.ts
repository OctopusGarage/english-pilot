import type { IntegrationFetch } from '../integrations/network-sender.js';
import { handleIntegrationMcpTool, handleIntegrationMcpToolAsync } from './mcp-integration-tool-handlers.js';
import { handleLanguageMcpTool } from './mcp-language-tool-handlers.js';
import { handleLearningMcpTool } from './mcp-learning-tool-handlers.js';
import { handleProjectMcpTool } from './mcp-project-tool-handlers.js';
import type { McpToolDefinition, McpToolName } from './mcp-tool-types.js';
import { integrationsMcpToolDefinitions } from './mcp-tools-integrations.js';
import { learningMcpToolDefinitions } from './mcp-tools-learning.js';
import { projectMcpToolDefinitions } from './mcp-tools-project.js';
import { voiceMcpToolDefinitions } from './mcp-tools-voice.js';
import { handleVoiceMcpToolCall, handleVoiceMcpToolCallAsync } from './mcp-voice-tool-handlers.js';

export interface McpAsyncOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: IntegrationFetch;
}

type SyncMcpToolHandler = (name: McpToolName, args: Record<string, unknown>) => Record<string, unknown> | undefined;

type AsyncMcpToolHandler = (
  name: McpToolName,
  args: Record<string, unknown>,
  options: McpAsyncOptions,
) => Promise<Record<string, unknown> | undefined>;

interface McpToolGroup {
  definitions: readonly McpToolDefinition[];
}

interface McpToolCatalogPlanEntry {
  name: McpToolName;
  syncHandler: SyncMcpToolHandler;
  asyncHandler?: AsyncMcpToolHandler;
}

export interface McpToolCatalogEntry {
  definition: McpToolDefinition;
  invokeSync: (args: Record<string, unknown>) => Record<string, unknown>;
  invokeAsync: (args: Record<string, unknown>, options?: McpAsyncOptions) => Promise<Record<string, unknown>>;
}

const mcpToolGroups = [
  { definitions: learningMcpToolDefinitions },
  { definitions: projectMcpToolDefinitions },
  { definitions: integrationsMcpToolDefinitions },
  { definitions: voiceMcpToolDefinitions },
] as const satisfies readonly McpToolGroup[];

function handleProjectCatalogTool(name: McpToolName, args: Record<string, unknown>) {
  return handleProjectMcpTool(name, args, { toolNames: listMcpTools() });
}

const mcpToolCatalogPlan = [
  catalogTool('english_analyze_text', handleLanguageMcpTool),
  catalogTool('english_status', handleProjectCatalogTool),
  catalogTool('english_roadmap', handleProjectCatalogTool),
  catalogTool('english_roadmap_next', handleProjectCatalogTool),
  catalogTool('english_roadmap_env_template', handleProjectCatalogTool),
  catalogTool('english_external_validation_bundle', handleProjectCatalogTool),
  catalogTool('english_external_validation_bundle_verify', handleProjectCatalogTool),
  catalogTool('english_config_profiles', handleProjectCatalogTool),
  catalogTool('english_config_use', handleProjectCatalogTool),
  catalogTool('english_config_profile_status', handleProjectCatalogTool),
  catalogTool('english_config_progression_suggestion', handleProjectCatalogTool),
  catalogTool('english_config_progression_apply', handleProjectCatalogTool),
  catalogTool('english_rewrite_text', handleLanguageMcpTool),
  catalogTool('english_pronounce_text', handleLanguageMcpTool),
  catalogTool('english_method_templates', handleLearningMcpTool),
  catalogTool('english_extract_lesson', handleLearningMcpTool),
  catalogTool('english_record_learning_item', handleLearningMcpTool),
  catalogTool('english_record_method_template', handleLearningMcpTool),
  catalogTool('english_review_queue', handleLearningMcpTool),
  catalogTool('english_review_due', handleLearningMcpTool),
  catalogTool('english_review_upcoming', handleLearningMcpTool),
  catalogTool('english_daily_review', handleLearningMcpTool),
  catalogTool('english_daily_check', handleLearningMcpTool),
  catalogTool('english_daily_pack', handleLearningMcpTool),
  catalogTool('english_input_history', handleLearningMcpTool),
  catalogTool('english_notes_history', handleLearningMcpTool),
  catalogTool('english_learning_brief', handleLearningMcpTool),
  catalogTool('english_mark_review', handleLearningMcpTool),
  catalogTool('english_update_review_item', handleLearningMcpTool),
  catalogTool('english_remove_review_item', handleLearningMcpTool),
  catalogTool('english_review_cleanup', handleLearningMcpTool),
  catalogTool('english_integration_targets', handleIntegrationMcpTool),
  catalogTool('english_integration_credential_policy', handleIntegrationMcpTool),
  catalogTool('english_integration_delivery_mode', handleIntegrationMcpTool),
  catalogTool('english_integration_daily_pack', handleIntegrationMcpTool),
  catalogTool('english_integration_dry_run', handleIntegrationMcpTool),
  catalogTool('english_integration_preflight', handleIntegrationMcpTool),
  catalogTool('english_integration_send_readiness', handleIntegrationMcpTool),
  catalogTool('english_integration_send', handleIntegrationMcpTool, handleIntegrationMcpToolAsync),
  catalogTool('english_integration_account_guide', handleIntegrationMcpTool),
  catalogTool('english_integration_account_validate', handleIntegrationMcpTool, handleIntegrationMcpToolAsync),
  catalogTool('english_integration_validation_history', handleIntegrationMcpTool),
  catalogTool('english_integration_message_coaching', handleIntegrationMcpTool),
  catalogTool('english_integration_event_coaching', handleIntegrationMcpTool),
  catalogTool('english_integration_deliver', handleIntegrationMcpTool),
  catalogTool('english_record_voice_practice', handleVoiceMcpToolCall),
  catalogTool('english_doctor', handleProjectCatalogTool),
  catalogTool('english_voice_providers', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_policy', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_contract', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_validate', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_assess_provider', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_assessment_history', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_provider_contract_draft', handleVoiceMcpToolCall),
  catalogTool('english_voice_stt_wrapper_template', handleVoiceMcpToolCall),
  catalogTool('english_voice_preflight', handleVoiceMcpToolCall),
  catalogTool('english_voice_transcribe', handleVoiceMcpToolCall, handleVoiceMcpToolCallAsync),
  catalogTool('english_voice_practice_from_audio', handleVoiceMcpToolCall, handleVoiceMcpToolCallAsync),
  catalogTool('english_coaching_context', handleLanguageMcpTool),
] as const satisfies readonly McpToolCatalogPlanEntry[];

const mcpToolCatalogEntries = buildMcpToolCatalog();

export type EnglishPilotMcpToolName = (typeof mcpToolCatalogPlan)[number]['name'];
export type EnglishPilotMcpToolDefinition = (typeof mcpToolCatalogEntries)[number]['definition'];

export function listMcpToolDefinitions(): readonly EnglishPilotMcpToolDefinition[] {
  return mcpToolCatalogEntries.map((entry) => entry.definition);
}

export function listMcpTools(): EnglishPilotMcpToolName[] {
  return mcpToolCatalogPlan.map((entry) => entry.name);
}

export function getMcpToolCatalogEntry(name: McpToolName): McpToolCatalogEntry | undefined {
  return mcpToolCatalogEntries.find((entry) => entry.definition.name === name);
}

export function invokeMcpTool(name: EnglishPilotMcpToolName, args: Record<string, unknown>): Record<string, unknown> {
  const entry = getMcpToolCatalogEntry(name);
  if (!entry) throw new Error(`Unknown MCP tool: ${name}`);
  return entry.invokeSync(args);
}

export async function invokeMcpToolAsync(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
  options: McpAsyncOptions = {},
): Promise<Record<string, unknown>> {
  const entry = getMcpToolCatalogEntry(name);
  if (!entry) throw new Error(`Unknown MCP tool: ${name}`);
  return entry.invokeAsync(args, options);
}

function buildMcpToolCatalog(): McpToolCatalogEntry[] {
  const definitionByName = new Map<McpToolName, McpToolDefinition>();
  for (const group of mcpToolGroups) {
    for (const definition of group.definitions) {
      if (definitionByName.has(definition.name)) throw new Error(`Duplicate MCP tool definition: ${definition.name}`);
      definitionByName.set(definition.name, definition);
    }
  }

  return mcpToolCatalogPlan.map((plan) => {
    const definition = definitionByName.get(plan.name);
    if (!definition) throw new Error(`Missing MCP tool definition: ${plan.name}`);
    return {
      definition,
      invokeSync: (args) => invokeSyncHandler(plan.syncHandler, plan.name, args),
      invokeAsync: async (args, options = {}) => {
        if (definition.mode === 'async' && plan.asyncHandler) {
          const result = await plan.asyncHandler(plan.name, args, options);
          if (result) return result;
        }
        return invokeSyncHandler(plan.syncHandler, plan.name, args);
      },
    };
  });
}

function catalogTool<const Name extends McpToolName>(
  name: Name,
  syncHandler: SyncMcpToolHandler,
  asyncHandler?: AsyncMcpToolHandler,
): {
  name: Name;
  syncHandler: SyncMcpToolHandler;
  asyncHandler?: AsyncMcpToolHandler;
} {
  return {
    name,
    syncHandler,
    ...(asyncHandler ? { asyncHandler } : {}),
  };
}

function invokeSyncHandler(
  handler: SyncMcpToolHandler,
  name: McpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const result = handler(name, args);
  if (!result) throw new Error(`Unknown MCP tool: ${name}`);
  return result;
}
