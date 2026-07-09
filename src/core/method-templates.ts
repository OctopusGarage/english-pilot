export interface MethodTemplate {
  id: string;
  scene: string;
  whenToUse: string;
  pattern: string;
  example: string;
  ipa: Array<{ word: string; ipa: string }>;
  tags: string[];
}

export interface MethodTemplateLearningItemDraft {
  original: string;
  suggested: string;
  scene: string;
  tags: string[];
  pattern: string;
  ipa: Array<{ word: string; ipa: string }>;
}

const METHOD_TEMPLATES: MethodTemplate[] = [
  {
    id: 'ask-for-help',
    scene: 'asking for help',
    whenToUse: 'Use when you want another person or agent to inspect, explain, or fix something with you.',
    pattern: 'Could you help me + verb phrase?',
    example: 'Could you help me debug this hook failure?',
    ipa: [
      { word: 'debug', ipa: '/ˌdiːˈbʌɡ/' },
      { word: 'failure', ipa: '/ˈfeɪljər/' },
    ],
    tags: ['collaboration', 'request'],
  },
  {
    id: 'clarify-requirement',
    scene: 'clarifying a requirement',
    whenToUse: 'Use when a requirement, threshold, or decision is still ambiguous.',
    pattern: 'Could you clarify + question word/noun clause?',
    example: 'Could you clarify whether the 30% threshold should count code snippets?',
    ipa: [
      { word: 'clarify', ipa: '/ˈklerəfaɪ/' },
      { word: 'threshold', ipa: '/ˈθreʃhoʊld/' },
    ],
    tags: ['requirements', 'question'],
  },
  {
    id: 'debugging',
    scene: 'debugging',
    whenToUse: 'Use when reporting what you reproduced, observed, and narrowed down.',
    pattern: 'I reproduced + issue, and found that + cause.',
    example: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
    ipa: [
      { word: 'reproduced', ipa: '/ˌriːprəˈduːst/' },
      { word: 'issue', ipa: '/ˈɪʃuː/' },
    ],
    tags: ['debugging', 'diagnosis'],
  },
  {
    id: 'report-a-blocker',
    scene: 'reporting a blocker',
    whenToUse: 'Use when progress depends on a missing decision, credential, account, or external setup.',
    pattern: 'I am blocked by + noun phrase.',
    example: 'I am blocked by the Feishu delivery mode decision.',
    ipa: [
      { word: 'blocked', ipa: '/blɑːkt/' },
      { word: 'delivery', ipa: '/dɪˈlɪvəri/' },
    ],
    tags: ['status', 'blocker'],
  },
  {
    id: 'propose-next-step',
    scene: 'proposing the next step',
    whenToUse: 'Use when suggesting a small, concrete slice of work.',
    pattern: 'The next useful slice is to + verb phrase.',
    example: 'The next useful slice is to add a reusable template catalog for workplace English.',
    ipa: [
      { word: 'useful', ipa: '/ˈjuːsfəl/' },
      { word: 'catalog', ipa: '/ˈkætəlɔːɡ/' },
    ],
    tags: ['planning', 'execution'],
  },
  {
    id: 'summarize-result',
    scene: 'summarizing a result',
    whenToUse: 'Use when closing a task with evidence and next actions.',
    pattern: 'I changed + thing, and verified it with + command/evidence.',
    example: 'I changed the MCP tool list and verified it with npm test.',
    ipa: [
      { word: 'verified', ipa: '/ˈverəfaɪd/' },
      { word: 'evidence', ipa: '/ˈevɪdəns/' },
    ],
    tags: ['summary', 'verification'],
  },
];

export function listMethodTemplates(scene?: string): MethodTemplate[] {
  if (!scene) return METHOD_TEMPLATES;
  const normalized = scene.toLowerCase();
  return METHOD_TEMPLATES.filter((template) => {
    return template.id === normalized || template.scene.toLowerCase() === normalized;
  });
}

export function findMethodTemplate(id: string): MethodTemplate | undefined {
  const normalized = id.toLowerCase();
  return METHOD_TEMPLATES.find((template) => template.id === normalized);
}

export function buildMethodTemplateLearningItem(template: MethodTemplate): MethodTemplateLearningItemDraft {
  return {
    original: `Method template: ${template.id}`,
    suggested: template.example,
    scene: template.scene,
    tags: ['method-template', ...template.tags],
    pattern: template.pattern,
    ipa: template.ipa,
  };
}
