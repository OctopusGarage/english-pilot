export function getText(args: string[], stdin: string): string {
  if (args.includes('--stdin')) return stdin;

  const textFlagIndex = args.indexOf('--text');
  if (textFlagIndex >= 0) {
    return args[textFlagIndex + 1] ?? '';
  }

  return args.filter((arg) => arg !== '--json').join(' ');
}

export function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export function getRepeatedFlagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
