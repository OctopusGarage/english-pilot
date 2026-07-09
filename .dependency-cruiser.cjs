/**
 * Architecture guardrails for EnglishPilot.
 *
 * Runtime shape:
 *   src/adapters/*    CLI, MCP, hook, and local control adapters
 *   src/daemon/*      long-running Feishu/WeChat process orchestration
 *   src/channels/*    platform long-connection adapters
 *   src/agent/*       Claude/Codex process runner and session persistence
 *   src/core/*        policy, analysis, coaching, config, review, infra primitives
 *   src/integrations/* offline integration payloads and validation helpers
 *   src/storage/*     local persistence
 *
 * The important boundary is that core remains protocol-agnostic: it must not
 * import CLI/MCP hooks, channel adapters, or the daemon. The daemon may compose
 * channels and control adapters; adapters may call core and daemon entrypoints.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules harder to test and reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-protocol-agnostic',
      severity: 'error',
      comment: 'Core policy/review/config code must not depend on external channel or adapter runtime code.',
      from: { path: '^src/core' },
      to: { path: '^src/(adapters|channels|daemon)' },
    },
    {
      name: 'channels-do-not-depend-on-cli-or-mcp',
      severity: 'error',
      comment: 'Channel runtime code should be reusable without CLI, hook, or MCP adapter concerns.',
      from: { path: '^src/channels' },
      to: { path: '^src/adapters' },
    },
    {
      name: 'integrations-do-not-depend-on-runtime-adapters',
      severity: 'error',
      comment: 'Offline integration helpers must not import long-running channel, daemon, CLI, or MCP runtime code.',
      from: { path: '^src/integrations' },
      to: { path: '^src/(adapters|channels|daemon)' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules are often dead code; Knip also checks this from package entrypoints.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '^src/bin/',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node'],
    },
  },
};
