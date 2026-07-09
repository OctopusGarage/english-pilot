import { z } from 'zod';
import type { McpToolDefinition } from './mcp-tool-types.js';

export const projectMcpToolDefinitions = [
  {
    name: 'english_status',
    description:
      'Return the current EnglishPilot supported surfaces, deferred surfaces, planned work, and open decisions.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_roadmap',
    description:
      'Return remaining EnglishPilot roadmap items with blockers, evidence, and next commands, and optionally export them as Markdown.',
    inputSchema: {
      target: z.enum(['feishu', 'wechat', 'cloud-stt']).optional(),
      write: z.boolean().optional(),
      directory: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_roadmap_next',
    description: 'Return the next evidence command for each remaining EnglishPilot roadmap item.',
    inputSchema: {
      target: z.enum(['feishu', 'wechat', 'cloud-stt']).optional(),
      write: z.boolean().optional(),
      directory: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_roadmap_env_template',
    description:
      'Return empty shell export and .env templates for roadmap external setup variables without secret values.',
    inputSchema: {
      target: z.enum(['feishu', 'wechat', 'cloud-stt']).optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_external_validation_bundle',
    description: 'Preview or write a Markdown and JSON handoff bundle for remaining external validation work.',
    inputSchema: {
      target: z.enum(['feishu', 'wechat', 'cloud-stt']).optional(),
      write: z.boolean().optional(),
      directory: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_external_validation_bundle_verify',
    description:
      'Verify that an external validation handoff bundle exists, has a valid manifest, and contains every expected file.',
    inputSchema: {
      target: z.enum(['feishu', 'wechat', 'cloud-stt']).optional(),
      directory: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_config_profiles',
    description: 'Return beginner, balanced, strict, and force EnglishPilot learning intensity config profiles.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_config_use',
    description: 'Apply an EnglishPilot learning intensity config profile.',
    inputSchema: {
      profile: z.enum(['beginner', 'balanced', 'strict', 'force']),
    },
    mode: 'sync',
  },

  {
    name: 'english_config_profile_status',
    description: 'Return the current EnglishPilot learning intensity profile match and differences.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_config_progression_suggestion',
    description: 'Suggest a manual EnglishPilot learning intensity profile change from recent prompt history.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_config_progression_apply',
    description:
      'Preview or apply a scheduled EnglishPilot learning intensity profile change from recent prompt history.',
    inputSchema: {
      apply: z.boolean().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_doctor',
    description:
      'Return EnglishPilot local diagnostics, including config, storage, hook, MCP, rewrite, integration evidence, and voice status. Can optionally export Markdown.',
    inputSchema: {
      write: z.boolean().optional(),
      directory: z.string().optional(),
    },
    mode: 'sync',
  },
] as const satisfies readonly McpToolDefinition[];
