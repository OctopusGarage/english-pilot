import { z } from 'zod';
import type { McpToolDefinition } from './mcp-tool-types.js';

export const integrationsMcpToolDefinitions = [
  {
    name: 'english_integration_targets',
    description: 'List supported, planned, and deferred EnglishPilot channel integration targets.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_integration_credential_policy',
    description: 'Return the first-version credential storage policy for an EnglishPilot integration target.',
    inputSchema: {
      target: z.enum(['obsidian', 'feishu', 'wechat', 'voice']),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_delivery_mode',
    description: 'Return the first-version delivery mode policy for an EnglishPilot integration target.',
    inputSchema: {
      target: z.enum(['obsidian', 'feishu', 'wechat', 'voice']),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_daily_pack',
    description: 'Build a channel-neutral daily review payload for an EnglishPilot integration target.',
    inputSchema: {
      target: z.enum(['obsidian', 'feishu', 'wechat', 'voice']),
      date: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_dry_run',
    description: 'Preview an EnglishPilot daily review integration delivery without sending network messages.',
    inputSchema: {
      target: z.enum(['obsidian', 'feishu', 'wechat', 'voice']),
      date: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_preflight',
    description: 'Check required integration credentials without sending network messages.',
    inputSchema: {
      target: z.enum(['obsidian', 'feishu', 'wechat', 'voice']),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_send_readiness',
    description: 'Check WeChat delivery readiness without sending network messages.',
    inputSchema: {
      target: z.literal('wechat'),
      date: z.string().optional(),
      confirmSend: z.boolean().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_send',
    description:
      'Send a daily review pack to WeChat using environment credentials. Requires send: true and can require prior account validation history.',
    inputSchema: {
      target: z.literal('wechat'),
      date: z.string().optional(),
      send: z.boolean(),
      requireValidation: z.boolean().optional(),
    },
    mode: 'async',
  },

  {
    name: 'english_integration_account_guide',
    description:
      'Return WeChat account validation commands, required environment variables, docs, and troubleshooting.',
    inputSchema: {
      target: z.literal('wechat'),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_account_validate',
    description:
      'Run the WeChat account validation playbook. It sends only when send is true and records history only when record is true.',
    inputSchema: {
      target: z.literal('wechat'),
      date: z.string().optional(),
      send: z.boolean().optional(),
      record: z.boolean().optional(),
    },
    mode: 'async',
  },

  {
    name: 'english_integration_validation_history',
    description: 'Return sanitized WeChat account validation history recorded by EnglishPilot.',
    inputSchema: {
      target: z.literal('wechat').optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_message_coaching',
    description:
      'Build a channel-neutral coaching payload for an incoming Feishu/WeChat-style message and optionally record a review item.',
    inputSchema: {
      target: z.enum(['obsidian', 'feishu', 'wechat', 'voice']),
      text: z.string(),
      record: z.boolean().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_event_coaching',
    description:
      'Normalize an inbound Feishu/WeChat message event, build coaching feedback, and optionally record a review item.',
    inputSchema: {
      target: z.enum(['feishu', 'wechat']),
      event: z.record(z.string(), z.unknown()),
      record: z.boolean().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_integration_deliver',
    description:
      'Deliver a daily review pack to a supported offline integration target. Currently supports Obsidian Markdown only.',
    inputSchema: {
      target: z.literal('obsidian'),
      date: z.string().optional(),
      directory: z.string(),
      write: z.boolean().optional(),
    },
    mode: 'sync',
  },
] as const satisfies readonly McpToolDefinition[];
