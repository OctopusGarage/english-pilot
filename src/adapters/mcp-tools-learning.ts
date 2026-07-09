import { z } from 'zod';
import type { McpToolDefinition } from './mcp-tool-types.js';

export const learningMcpToolDefinitions = [
  {
    name: 'english_analyze_text',
    description: 'Analyze whether text follows the EnglishPilot English-dominant policy.',
    inputSchema: { text: z.string() },
    mode: 'sync',
  },

  {
    name: 'english_rewrite_text',
    description: 'Rewrite mixed-language text into English while preserving intent.',
    inputSchema: { text: z.string() },
    mode: 'sync',
  },

  {
    name: 'english_pronounce_text',
    description: 'Return IPA and word-stress hints for known English words in text.',
    inputSchema: { text: z.string() },
    mode: 'sync',
  },

  {
    name: 'english_method_templates',
    description: 'Return practical workplace-English method templates with examples and IPA.',
    inputSchema: {
      scene: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_extract_lesson',
    description: 'Extract a reusable English lesson with key phrases, IPA, scene, and retrieval prompt.',
    inputSchema: { text: z.string() },
    mode: 'sync',
  },

  {
    name: 'english_record_learning_item',
    description: 'Record a reusable English learning item.',
    inputSchema: {
      original: z.string(),
      suggested: z.string(),
      scene: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_record_method_template',
    description: 'Record one practical workplace-English method template as a reviewable learning item.',
    inputSchema: {
      id: z.string(),
    },
    mode: 'sync',
  },

  {
    name: 'english_review_queue',
    description: 'Return EnglishPilot learning items due for review.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_review_due',
    description: 'Return full EnglishPilot learning items due by a date.',
    inputSchema: {
      date: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_review_upcoming',
    description: 'Return future EnglishPilot review load grouped by date.',
    inputSchema: {
      date: z.string().optional(),
      days: z.number().int().positive().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_daily_review',
    description: 'Return daily English retrieval-practice prompts.',
    inputSchema: {},
    mode: 'sync',
  },

  {
    name: 'english_daily_check',
    description: 'Compare a user daily-review answer with the target expression and return local word-level feedback.',
    inputSchema: {
      id: z.string(),
      answer: z.string(),
    },
    mode: 'sync',
  },

  {
    name: 'english_daily_pack',
    description: 'Return a Markdown daily review pack for due EnglishPilot learning items.',
    inputSchema: {
      date: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_mark_review',
    description: 'Mark an EnglishPilot review item as again, hard, or easy.',
    inputSchema: {
      id: z.string(),
      outcome: z.enum(['again', 'hard', 'easy']),
    },
    mode: 'sync',
  },

  {
    name: 'english_update_review_item',
    description: 'Update one EnglishPilot review item by id.',
    inputSchema: {
      id: z.string(),
      original: z.string().optional(),
      suggested: z.string().optional(),
      scene: z.string().optional(),
      pattern: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_remove_review_item',
    description: 'Remove one EnglishPilot review item by id.',
    inputSchema: {
      id: z.string(),
    },
    mode: 'sync',
  },

  {
    name: 'english_review_cleanup',
    description: 'Preview or confirm removal of likely noisy EnglishPilot review items.',
    inputSchema: {
      confirm: z.boolean().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_record_voice_practice',
    description: 'Record a voice-practice transcript, target sentence, and feedback as a reviewable learning item.',
    inputSchema: {
      transcript: z.string(),
      target: z.string(),
      feedback: z.string().optional(),
    },
    mode: 'sync',
  },

  {
    name: 'english_coaching_context',
    description: 'Return structured low-disruption English coaching instructions, cooldown state, and daily-cap state.',
    inputSchema: {},
    mode: 'sync',
  },
] as const satisfies readonly McpToolDefinition[];
