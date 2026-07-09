export type InstallerTargetId = 'claude' | 'codex' | 'cursor' | 'gemini';
export type InstallerTargetStatus = 'supported' | 'planned';

export interface InstallerTarget {
  id: InstallerTargetId;
  label: string;
  supportsInstall: boolean;
  supportsUninstall: boolean;
  status: InstallerTargetStatus;
}

export const installerTargets: InstallerTarget[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    supportsInstall: true,
    supportsUninstall: true,
    status: 'supported',
  },
  {
    id: 'codex',
    label: 'Codex',
    supportsInstall: true,
    supportsUninstall: true,
    status: 'supported',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    supportsInstall: false,
    supportsUninstall: false,
    status: 'planned',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    supportsInstall: false,
    supportsUninstall: false,
    status: 'planned',
  },
];

export function listInstallerTargets(): InstallerTarget[] {
  return [...installerTargets];
}

export function isInstallerTargetId(value: string | undefined): value is InstallerTargetId {
  return findInstallerTarget(value) !== undefined;
}

export function findInstallerTarget(value: string | undefined): InstallerTarget | undefined {
  return installerTargets.find((target) => target.id === value);
}

export function formatInstallerTargets(targets = listInstallerTargets()): string {
  return targets.map((target) => `${target.id} - ${target.label} (${target.status})`).join('\n') + '\n';
}
