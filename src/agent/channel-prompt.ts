export interface ExternalChannelAgentPromptInput {
  channel: 'feishu' | 'wechat' | 'cli';
  text: string;
  metadata: Record<string, unknown>;
}

export function buildExternalChannelAgentPrompt(input: ExternalChannelAgentPromptInput): string {
  const context = JSON.stringify({
    channel: input.channel,
    ...input.metadata,
  });
  return [
    '<english_pilot_context>',
    escapeXmlText(context),
    '</english_pilot_context>',
    '',
    '<user_input>',
    escapeXmlText(input.text),
    '</user_input>',
    '',
  ].join('\n');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
