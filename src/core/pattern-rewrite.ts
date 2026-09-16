export function suggestPatternRewrite(original: string): string | undefined {
  const normalized = original.trim().replace(/\s+/g, ' ');
  const weatherQuestion = normalized.match(
    /^(?:what(?:'s| is)|how(?:'s| is))\s+the\s+weather\s+(?:about|in|at|for)\s+(.+?)[?？]?$/i,
  );
  if (weatherQuestion?.[1]) {
    return `What's the weather like in ${normalizePlaceName(weatherQuestion[1])}?`;
  }

  const inaccessibleUrl = normalized.match(
    /(?:访问不了|打不开|无法访问|无法打开|进不去)[：:\s]*(https?:\/\/[^\s，。！？]+)/,
  );
  if (inaccessibleUrl?.[1]) {
    return `I cannot access ${trimTrailingSentencePunctuation(inaccessibleUrl[1])}.`;
  }

  if (/创建一个|new project/i.test(original)) {
    return 'I want to create a new project to help me learn and use English during my normal AI conversations.';
  }

  if (/提交\s*(并|和|然后)?\s*推送/.test(normalized)) {
    return 'Commit and push the changes.';
  }

  if (/设计|优化/.test(original)) {
    return 'Let us think through how to design and refine this.';
  }

  return undefined;
}

function normalizePlaceName(value: string): string {
  const trimmed = value.trim().replace(/[，。！？,.!?]+$/u, '');
  const knownPlaces: Record<string, string> = {
    广州: 'Guangzhou',
    深圳: 'Shenzhen',
    北京: 'Beijing',
    上海: 'Shanghai',
    杭州: 'Hangzhou',
    香港: 'Hong Kong',
  };
  return knownPlaces[trimmed] ?? trimmed;
}

function trimTrailingSentencePunctuation(value: string): string {
  return value.replace(/[，。！？,.!?]+$/u, '');
}
