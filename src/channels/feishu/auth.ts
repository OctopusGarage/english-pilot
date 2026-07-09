export function isFeishuSenderAllowed(senderId: string | undefined, allowedOpenIds: Set<string>): boolean {
  return typeof senderId === 'string' && senderId.length > 0 && allowedOpenIds.has(senderId);
}
