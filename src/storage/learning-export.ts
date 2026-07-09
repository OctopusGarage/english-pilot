import type { LearningItem } from '../core/learning-card.js';

export interface ObsidianExportFile {
  path: string;
  content: string;
}

export function formatLearningItemsMarkdown(items: LearningItem[]): string {
  return items
    .map((item) =>
      [
        `## ${item.createdAt}`,
        '',
        `Scene: ${item.scene ?? 'general English practice'}`,
        `Original: ${item.original}`,
        `Suggested: ${item.suggested}`,
        '',
        'IPA:',
        ...(item.ipa ?? []).map((entry) => `- ${entry.word} ${entry.ipa}`),
        '',
        'Pattern:',
        item.pattern ?? 'Use English as the main sentence structure.',
        '',
        'Review:',
        `next: ${item.nextReviewAt}`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

export function formatLearningItemsObsidianFiles(items: LearningItem[]): ObsidianExportFile[] {
  const index = [
    '# EnglishPilot Index',
    '',
    ...items.map((item) => `- [[EnglishPilot - ${item.id}]] - ${item.scene ?? 'general English practice'}`),
    '',
  ].join('\n');
  return [
    { path: 'EnglishPilot Index.md', content: index },
    ...items.map((item) => ({
      path: `EnglishPilot - ${item.id}.md`,
      content: formatObsidianLearningItem(item),
    })),
  ];
}

function formatObsidianLearningItem(item: LearningItem): string {
  const tags = ['english-pilot', ...(item.tags ?? [])].map((tag) => tag.replace(/\s+/g, '-').toLowerCase());
  return [
    '---',
    'tags:',
    ...[...new Set(tags)].map((tag) => `- ${tag}`),
    `created: ${item.createdAt}`,
    `next_review: ${item.nextReviewAt}`,
    '---',
    '',
    `# EnglishPilot - ${item.id}`,
    '',
    `Scene: ${item.scene ?? 'general English practice'}`,
    `Original: ${item.original}`,
    `Suggested: ${item.suggested}`,
    '',
    'IPA:',
    ...((item.ipa ?? []).length > 0 ? (item.ipa ?? []).map((entry) => `- ${entry.word} ${entry.ipa}`) : ['- none']),
    '',
    'Pattern:',
    item.pattern ?? 'Use English as the main sentence structure.',
    '',
    'Review:',
    `next: ${item.nextReviewAt}`,
    '',
  ].join('\n');
}
