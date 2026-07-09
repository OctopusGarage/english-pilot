import type { DailyReviewPack } from '../core/lesson.js';
import type { IntegrationTarget } from './targets.js';

export interface DailyReviewIntegrationPayload {
  target: IntegrationTarget;
  delivery: {
    supported: boolean;
    mode: 'export' | 'message' | 'payload-only';
  };
  pack: {
    date: string;
    itemCount: number;
    title: string;
    markdown: string;
    items: DailyReviewPack['items'];
  };
}

export function buildDailyReviewIntegrationPayload(
  target: IntegrationTarget,
  pack: DailyReviewPack,
): DailyReviewIntegrationPayload {
  return {
    target,
    delivery: {
      supported: target.id === 'obsidian' || target.id === 'wechat',
      mode: deliveryModeForTarget(target),
    },
    pack: {
      date: pack.date,
      itemCount: pack.items.length,
      title: `EnglishPilot Daily Review - ${pack.date}`,
      markdown: pack.markdown,
      items: pack.items,
    },
  };
}

function deliveryModeForTarget(target: IntegrationTarget): 'export' | 'message' | 'payload-only' {
  if (target.id === 'obsidian') return 'export';
  if (target.id === 'wechat') return 'message';
  return 'payload-only';
}
