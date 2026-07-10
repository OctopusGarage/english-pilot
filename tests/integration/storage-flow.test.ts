import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { recordLearningItem } from '../../src/storage/repository.js';

describe('local learning storage flow', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-storage-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('records a learning item when check sees mixed-language text', () => {
    const original = '我想创建一个 new project，用来辅助英语学习。';
    const check = runCli(['check', '--text', original, '--json']);
    const review = runCli(['review', '--json']);

    expect(check.exitCode).toBe(2);
    expect(JSON.parse(review.stdout)).toMatchObject([
      {
        original,
        suggested: expect.stringContaining('create a new project'),
        ipa: expect.arrayContaining([expect.objectContaining({ word: 'create', ipa: '/kriˈeɪt/' })]),
      },
    ]);
  });

  it('does not auto-record long business prompts with incidental Chinese text', () => {
    const original = [
      'You are a spec compliance reviewer for Task 5 only. Do not edit files.',
      'Review the implementation and verify that the article keeps the sentence “从 L3 到 L4 的跨越是一个从被动到自主的分水岭”.',
      'Then run npm check and report exact file paths, command output, and the final commit SHA.',
    ].join('\n');
    const check = runCli(['check', '--text', original, '--json']);
    const review = runCli(['review', '--json']);
    const stats = runCli(['stats', '--json']);

    expect(check.exitCode).toBe(0);
    expect(JSON.parse(check.stdout)).not.toHaveProperty('coachingNote');
    expect(JSON.parse(review.stdout)).toEqual([]);
    expect(JSON.parse(stats.stdout)).toMatchObject({
      promptEvents: 1,
      learningItems: 0,
    });
  });

  it('records prompt events for stats', () => {
    runCli(['check', '--text', 'I want to create a new project.', '--json']);
    runCli(['check', '--text', '我想创建一个 new project，用来辅助英语学习。', '--json']);

    const stats = runCli(['stats', '--json']);

    expect(JSON.parse(stats.stdout)).toMatchObject({
      promptEvents: 2,
      blockedPrompts: 1,
      learningItems: 1,
    });
  });

  it('exports learning items as markdown cards', () => {
    const original = '我想创建一个 new project，用来辅助英语学习。';
    runCli(['check', '--text', original, '--json']);

    const exported = runCli(['export', 'markdown']);

    expect(exported.exitCode).toBe(0);
    expect(exported.stdout).toContain('## ');
    expect(exported.stdout).toContain(`Original: ${original}`);
    expect(exported.stdout).toContain('Suggested:');
    expect(exported.stdout).toContain('IPA:');
    expect(exported.stdout).toContain('- create /kriˈeɪt/');
    expect(exported.stdout).toContain('Pattern:');
  });

  it('writes learning items as Obsidian notes with an index', () => {
    const original = '我想创建一个 new project，用来辅助英语学习。';
    const exportDir = join(home, 'obsidian-export');
    runCli(['check', '--text', original, '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const exported = runCli(['export', 'obsidian', '--dir', exportDir, '--write']);
    const indexPath = join(exportDir, 'EnglishPilot Index.md');
    const notePath = join(exportDir, `EnglishPilot - ${item.id}.md`);

    expect(exported.exitCode).toBe(0);
    expect(exported.stdout).toBe(`Wrote Obsidian export: ${exportDir}\n`);
    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(notePath)).toBe(true);
    expect(readFileSync(indexPath, 'utf8')).toContain(`[[EnglishPilot - ${item.id}]]`);
    expect(readFileSync(notePath, 'utf8')).toContain('tags:');
    expect(readFileSync(notePath, 'utf8')).toContain('- english-pilot');
    expect(readFileSync(notePath, 'utf8')).toContain(`Original: ${original}`);
    expect(readFileSync(notePath, 'utf8')).toContain('Suggested:');
    expect(readFileSync(notePath, 'utf8')).toContain('- create /kriˈeɪt/');
  });

  it('marks review outcomes and updates scheduling metadata', () => {
    const original =
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.';
    runCli(['check', '--text', original, '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const marked = runCli(['review', 'mark', item.id, 'easy']);
    const [updated] = JSON.parse(runCli(['review', '--json']).stdout);

    expect(marked.exitCode).toBe(0);
    expect(marked.stdout).toContain(`Marked ${item.id} as easy`);
    expect(updated.ease).toBeGreaterThan(item.ease);
    expect(updated.reviewCount).toBe(1);
    expect(updated.lapseCount).toBe(0);
    expect(updated.intervalDays).toBe(4);
    expect(updated.lastReviewedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(updated.nextReviewAt).not.toBe(item.nextReviewAt);
  });

  it('removes a learning item from the review queue', () => {
    const original = '我想创建一个 new project，用来辅助英语学习。';
    runCli(['check', '--text', original, '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const removed = runCli(['review', 'remove', item.id]);
    const missing = runCli(['review', 'remove', item.id]);
    const review = runCli(['review', '--json']);

    expect(removed).toEqual({
      exitCode: 0,
      stdout: `Removed learning item: ${item.id}\n`,
      stderr: '',
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toBe(`Learning item not found: ${item.id}\n`);
    expect(JSON.parse(review.stdout)).toEqual([]);
  });

  it('updates a learning item in the review queue', () => {
    const original = '参考~/work/reference-service 一样对齐处理';
    runCli(['coach', '--text', original, '--record', '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const updated = runCli([
      'review',
      'update',
      item.id,
      '--suggested',
      'Align this implementation with ~/work/reference-service.',
      '--scene',
      'implementation guidance',
      '--pattern',
      'Align this implementation with + reference project.',
      '--tag',
      'implementation',
      '--json',
    ]);
    const [reviewItem] = JSON.parse(runCli(['review', '--json']).stdout);

    expect(updated.exitCode).toBe(0);
    expect(JSON.parse(updated.stdout)).toMatchObject({
      item: {
        id: item.id,
        original,
        suggested: 'Align this implementation with ~/work/reference-service.',
        scene: 'implementation guidance',
        tags: ['implementation'],
        pattern: 'Align this implementation with + reference project.',
        ipa: expect.arrayContaining([
          { word: 'align', ipa: '/əˈlaɪn/' },
          { word: 'implementation', ipa: '/ˌɪmplɪmenˈteɪʃn/' },
        ]),
      },
    });
    expect(reviewItem.suggested).toBe('Align this implementation with ~/work/reference-service.');
  });

  it('previews and confirms cleanup of likely noisy review items', () => {
    const noisy = recordLearningItem({
      original: [
        'You are a spec compliance reviewer for Task 5 only. Do not edit files.',
        'Review the implementation in this worktree: /workspace/project',
        'Spec to check:',
        '- Keep the sentence “从 L3 到 L4 的跨越是一个从被动到自主的分水岭”.',
        '- Run npm run check and npm run build.',
      ].join('\n'),
      suggested: 'Please rewrite this mainly in English while preserving the original intent.',
    });
    const useful = recordLearningItem({
      original: '我想创建一个 new project，用来辅助英语学习。',
      suggested: 'I want to create a new project to help me learn and use English during my normal AI conversations.',
    });

    const preview = runCli(['review', 'cleanup', '--json']);
    const beforeDelete = runCli(['review', '--json']);
    const deleted = runCli(['review', 'cleanup', '--yes', '--json']);
    const afterDelete = runCli(['review', '--json']);

    expect(JSON.parse(preview.stdout)).toMatchObject({
      mode: 'preview',
      candidateCount: 1,
      candidates: [
        {
          id: noisy.id,
          reasons: expect.arrayContaining([
            'generic rewrite fallback',
            'multi-section prompt',
            'task/review instruction prompt',
          ]),
        },
      ],
    });
    expect(JSON.parse(beforeDelete.stdout).map((item: { id: string }) => item.id)).toEqual([noisy.id, useful.id]);
    expect(JSON.parse(deleted.stdout)).toMatchObject({
      mode: 'delete',
      candidateCount: 1,
      removedCount: 1,
      removed: [noisy.id],
    });
    expect(JSON.parse(afterDelete.stdout).map((item: { id: string }) => item.id)).toEqual([useful.id]);
  });

  it('lists due and upcoming review schedule items', () => {
    const today = new Date().toISOString().slice(0, 10);
    runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);
    runCli([
      'coach',
      '--text',
      'I want to design and refine this workflow for pronunciation practice.',
      '--record',
      '--json',
    ]);
    const items = JSON.parse(runCli(['review', '--json']).stdout);
    const dueItem = items.find((item: { suggested: string }) => item.suggested.includes('threshold'));
    const upcomingItem = items.find((item: { original: string }) => item.original.includes('pronunciation practice'));
    runCli(['review', 'mark', dueItem.id, 'again']);

    const due = runCli(['review', 'due', '--date', today, '--json']);
    const upcoming = runCli(['review', 'upcoming', '--date', today, '--days', '5', '--json']);

    expect(due.exitCode).toBe(0);
    expect(JSON.parse(due.stdout)).toMatchObject({
      date: today,
      items: [
        {
          id: dueItem.id,
          suggested: expect.stringContaining('threshold'),
        },
      ],
    });
    expect(JSON.parse(due.stdout).items.some((item: { id: string }) => item.id === upcomingItem.id)).toBe(false);
    expect(upcoming.exitCode).toBe(0);
    expect(JSON.parse(upcoming.stdout)).toMatchObject({
      date: today,
      days: 5,
      groups: expect.arrayContaining([
        {
          date: today,
          count: 1,
          items: [expect.objectContaining({ id: dueItem.id })],
        },
        {
          date: upcomingItem.nextReviewAt,
          count: 1,
          items: [expect.objectContaining({ id: upcomingItem.id })],
        },
      ]),
    });
  });

  it('deduplicates repeated learning items', () => {
    const original = '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.';
    runCli(['coach', '--text', original, '--record', '--json']);
    runCli(['coach', '--text', original, '--record', '--json']);

    const review = runCli(['review', '--json']);

    expect(JSON.parse(review.stdout)).toHaveLength(1);
  });

  it('runs a due-only daily review flow with hidden answers', () => {
    const original = '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.';
    runCli(['coach', '--text', original, '--record', '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const notDue = runCli(['daily', 'start', '--json']);
    runCli(['daily', 'mark', item.id, 'again']);
    const due = runCli(['daily', 'start', '--json']);
    const answer = runCli(['daily', 'answer', item.id, '--json']);
    const marked = runCli(['daily', 'mark', item.id, 'easy']);

    expect(JSON.parse(notDue.stdout)).toEqual({ items: [] });
    expect(JSON.parse(due.stdout)).toMatchObject({
      items: [
        {
          id: item.id,
          reviewPrompt: expect.stringContaining('How would you say'),
        },
      ],
    });
    expect(JSON.parse(due.stdout).items[0].suggested).toBeUndefined();
    expect(JSON.parse(answer.stdout)).toMatchObject({
      item: {
        id: item.id,
        suggested: expect.stringContaining('threshold'),
        ipa: expect.arrayContaining([{ word: 'threshold', ipa: '/ˈθreʃhoʊld/' }]),
      },
    });
    expect(marked.stdout).toContain(`Marked ${item.id} as easy`);
  });

  it('builds a daily review pack and writes it to disk', () => {
    const original = '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.';
    const today = new Date().toISOString().slice(0, 10);
    runCli(['coach', '--text', original, '--record', '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);
    runCli(['daily', 'mark', item.id, 'again']);

    const markdown = runCli(['daily', 'pack', '--date', today]);
    const json = runCli(['daily', 'pack', '--date', today, '--json']);
    const written = runCli(['daily', 'pack', '--date', today, '--write']);
    const expectedPath = join(home, 'reviews', `${today}.md`);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain(`# EnglishPilot Daily Review - ${today}`);
    expect(markdown.stdout).toContain('Review prompt:');
    expect(markdown.stdout).toContain('Answer: This threshold should support adjustable intensity later');
    expect(markdown.stdout).toContain('- threshold /ˈθreʃhoʊld/');
    expect(JSON.parse(json.stdout)).toMatchObject({
      date: today,
      items: [
        {
          id: item.id,
          suggested: expect.stringContaining('threshold'),
        },
      ],
      markdown: expect.stringContaining(`# EnglishPilot Daily Review - ${today}`),
    });
    expect(written.stdout).toBe(`Wrote daily review pack: ${expectedPath}\n`);
    expect(existsSync(expectedPath)).toBe(true);
    expect(readFileSync(expectedPath, 'utf8')).toContain('Original: 这个 threshold 后续支持调整强度');
  });
});
