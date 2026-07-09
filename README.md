<a id="readme-top"></a>

# EnglishPilot

[![CI](https://github.com/OctopusGarage/english-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/OctopusGarage/english-pilot/actions/workflows/ci.yml)
[![Project Health](https://github.com/OctopusGarage/english-pilot/actions/workflows/project-health.yml/badge.svg)](https://github.com/OctopusGarage/english-pilot/actions/workflows/project-health.yml)
[![Gitleaks](https://github.com/OctopusGarage/english-pilot/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/OctopusGarage/english-pilot/actions/workflows/gitleaks.yml)
[![CodeQL](https://github.com/OctopusGarage/english-pilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/OctopusGarage/english-pilot/actions/workflows/codeql.yml)
[![Coverage](badges/coverage.svg)](badges/coverage.svg)
[![version](https://img.shields.io/github/package-json/v/OctopusGarage/english-pilot)](https://github.com/OctopusGarage/english-pilot/releases/latest)
[![npm](https://img.shields.io/npm/v/english-pilot?logo=npm)](https://www.npmjs.com/package/english-pilot)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![platform: macOS | Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-000000?logo=linux&logoColor=white)](#prerequisites)
[![ESLint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)](https://eslint.org)
[![Prettier](https://img.shields.io/badge/format-Prettier-F7B93E?logo=prettier&logoColor=black)](https://prettier.io)

<p align="center">
  EnglishPilot is a local-first English learning gate for AI workflows: it blocks over-Chinese prompts, suggests copyable English rewrites, records useful lessons, and lets Claude Code / Codex / Feishu / WeChat share the same coaching and review loop.
  <br />
  <br />
  <a href="docs/manual.md"><strong>Read the manual »</strong></a>
  <br />
  <br />
  <a href="#features">Features</a>
  ·
  <a href="#getting-started">Getting Started</a>
  ·
  <a href="https://github.com/OctopusGarage/english-pilot/issues/new?template=bug_report.yml">Report Bug</a>
  ·
  <a href="https://github.com/OctopusGarage/english-pilot/issues/new?template=feature_request.yml">Request Feature</a>
</p>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#features">Features</a></li>
    <li><a href="#architecture">Architecture</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#first-run">First run</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#configuration">Configuration</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

## About The Project

EnglishPilot sits in front of prompts and chat messages. It keeps the main sentence structure in English while still allowing a controlled amount of Chinese during the learning transition.

It has two runtime modes:

- **Inline agent mode** — Claude Code / Codex hooks enforce the language gate; MCP exposes coaching, review, diagnostics, and roadmap tools to the running agent.
- **Managed channel mode** — a daemon maintains Feishu/Lark and WeChat long connections, checks incoming messages, optionally calls a configured local agent backend, and replies through the same channel.

The goal is not to replace English study time. It makes normal work conversations carry a small, steady English practice loop without interrupting the real task unless the prompt crosses the configured threshold.

### Built With

- **Language / runtime** — [TypeScript](https://www.typescriptlang.org/) on [Node.js](https://nodejs.org) 22.5+
- **Agent surfaces** — Claude Code hooks, Codex hooks, MCP stdio
- **Channels** — Feishu/Lark long connection, WeChat QR-login long connection
- **Storage** — SQLite by default, JSONL fallback for local state and evidence logs
- **Build & test** — Vitest, ESLint, Prettier, dependency-cruiser, knip, Stryker, gitleaks

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Features

- **English ratio gate** — blocks prompts above the configured Chinese/non-English threshold.
- **Copyable rewrite on block** — blocked messages include a practical English starting point.
- **Inline teaching notes** — allowed prompts can produce compact Better/Why/IPA coaching notes; `force` mode raises the frequency.
- **Reviewable learning items** — useful phrases are stored with scene, pattern, IPA, and spaced-review metadata.
- **Claude Code and Codex installers** — installs hooks, MCP config, and host guidance.
- **MCP tool surface** — exposes analysis, rewrite, review, config, roadmap, integration, voice, and diagnostic tools.
- **Feishu/Lark long connection** — QR-assisted setup, allowlist, threshold checks, `/new`, voice-to-text handoff, and local agent replies.
- **WeChat long connection** — QR-login account storage, allowlist, reconnect/session refresh handling, `/new`, and local agent replies.
- **Managed daemon** — one launchd/systemd service owns external channels, logs, instance locking, and a local control socket.
- **Quality gates** — CI on Ubuntu/macOS, project-health workflow, full-history gitleaks, CodeQL, coverage artifact, pre-commit and pre-push hooks.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Architecture

```text
        Claude Code / Codex                         Feishu / WeChat
      hooks + MCP stdio tools                    long-connection channels
                │                                           │
                ▼                                           ▼
       ┌─────────────────┐                       ┌─────────────────┐
       │ adapters/cli +  │                       │ channels/*      │
       │ adapters/mcp    │                       │ daemon runtime  │
       └────────┬────────┘                       └────────┬────────┘
                │                                           │
                └──────────────────┬────────────────────────┘
                                   ▼
                         ┌───────────────────┐
                         │ core language +   │
                         │ coaching policy   │
                         └────────┬──────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  storage/review            agent runner              diagnostics
  SQLite / JSONL            claude -p / codex exec     doctor / roadmap
```

**Key points:**

- **One policy, multiple adapters** — hooks, CLI, MCP, Feishu, and WeChat all use the same threshold and coaching pipeline.
- **External channels are daemon-owned** — Feishu and WeChat run as long connections with daemon-managed lifecycle, reply policy, and session continuity.
- **Same assessment, controlled delivery** — hooks, CLI, MCP, Feishu, and WeChat share one prompt-assessment pipeline; external channels add deterministic reply modes (`silent`, `violation`, `always`) because the daemon owns the outbound message.
- **AI work is explicit** — channel messages call a configured local backend (`claude -p` or `codex exec`) only after the language gate allows the message.
- **Conversation continuity is local** — per-channel Claude session IDs and Codex thread IDs are stored locally and can be reset with `/new`.

See [docs/agent-runtime-design.md](docs/agent-runtime-design.md) for the local agent runtime decision and [docs/manual.md](docs/manual.md) for the full command reference.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

- Node.js 22.5+
- macOS or Linux
- Claude Code CLI and/or Codex CLI when using external agent replies
- Feishu/Lark or WeChat credentials only when enabling those channels
- Optional: local Whisper command or cloud STT endpoint for voice transcription. See [Voice STT install](docs/voice-stt-install.md) for Apple Silicon and Intel Mac recommendations.

### Installation

Recommended install or update:

```bash
curl -fsSL https://raw.githubusercontent.com/OctopusGarage/english-pilot/main/install.sh | bash
```

Pin a release:

```bash
curl -fsSL https://raw.githubusercontent.com/OctopusGarage/english-pilot/main/install.sh |
  ENGLISH_PILOT_VERSION=vX.Y.Z bash
```

Or use npm after the package is published:

```bash
npm install -g english-pilot
english-pilot setup --yes
```

See [INSTALL.md](INSTALL.md) for the packaged install path. Source checkout is still the development path.

### First Run

Check a prompt:

```bash
english-pilot check --text "I want to create a new project" --json
```

Install Claude Code or Codex integration:

```bash
english-pilot install claude --yes
english-pilot install codex --yes
```

Start the MCP server:

```bash
english-pilot serve --mcp
```

Run local diagnostics:

```bash
english-pilot doctor --json
```

For background services, put service-only environment variables in `~/.english-pilot/env`, then restart the service:

```bash
WHISPER_COMMAND=/absolute/path/to/english-pilot-stt-wrapper.py
WECHAT_PROCESSING_ACK=on
```

For voice setup, use [docs/voice-stt-install.md](docs/voice-stt-install.md). The short version is: Apple Silicon Macs should use `mlx-whisper`; Intel Macs should start with `whisper.cpp`.

Run the deterministic local smoke eval:

```bash
english-pilot eval smoke --json
english-pilot eval prompts
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

### Hooks and MCP

Claude Code and Codex hooks enforce blocking. MCP exposes optional tools the agent can call naturally during a session.

```bash
english-pilot install claude --yes
english-pilot install codex --yes
english-pilot doctor --json
```

The hook blocks prompts over the configured Chinese/non-English ratio. MCP and host guidance handle final-response coaching notes after the main task is complete; `force` mode asks agents to attach a compact teaching note whenever the prompt has Chinese fragments, awkward English, or an obvious everyday improvement.

### Feishu/Lark

```bash
english-pilot feishu setup
english-pilot feishu doctor --json
english-pilot feishu start --dry-run --json
english-pilot run
```

Feishu/Lark uses a long connection. Incoming text and voice messages pass through the same language gate, then optionally continue the configured Claude/Codex conversation. Send `/new` to start a fresh local agent session for the current chat scope.

### WeChat

```bash
english-pilot wechat setup
english-pilot wechat accounts --json
english-pilot wechat doctor --json
english-pilot run
```

WeChat uses QR-login long connection state under `~/.english-pilot/wechat/accounts/`. The channel runtime handles reconnect/session refresh and uses `/new` to clear the active local agent thread. Feishu and WeChat send `Received. Working on it...` before long Claude/Codex turns; set `WECHAT_PROCESSING_ACK=off` or `FEISHU_PROCESSING_ACK=off` to disable it.

### Managed Service

```bash
english-pilot service install
english-pilot service install-dev
english-pilot service status
english-pilot service logs
english-pilot service restart
english-pilot service uninstall
```

`english-pilot run` starts the daemon in the foreground. `service install` registers the built `dist` daemon with launchd on macOS or a user systemd service on Linux. On macOS, `service install-dev` installs a launchd service that points at this checkout and rebuilds on each restart, so local code changes go live with `english-pilot service restart`.

Use `english-pilot daemon status` or `english-pilot doctor` to find `~/.english-pilot/logs/daemon.log`. It is JSONL and includes stable events for channel start, WeChat retry/recovery, session expiry, inbound messages, agent failures, and reply failures.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Configuration

Defaults:

- `maxChineseRatio`: `0.3`
- `targetChineseRatio`: coaching target below the hard block threshold
- `storage`: SQLite under `~/.english-pilot/english-pilot.sqlite`
- `rewriteBackend`: local rule-based fallback unless a local translator is configured

Common commands:

```bash
english-pilot config get
english-pilot config profiles --json
english-pilot config use beginner
english-pilot config use balanced
english-pilot config use force
english-pilot config set externalAgentBackend claude
english-pilot config set externalAgentBackend codex
english-pilot config set externalAgentCwd /path/to/workspace
```

Local state is stored under `~/.english-pilot` by default. Set `ENGLISH_PILOT_HOME` for tests or isolated runs.

`eval smoke` uses a temporary EnglishPilot home directory, so it does not modify real config, prompt history, or review data. It verifies the language gate, force-mode coaching, Feishu/WeChat coaching prompt injection, and Codex dry-run command construction.

For opt-in AI-backed checks, run:

```bash
node dist/src/bin/english-pilot.js eval agent --backend codex --case channel-weather --json
node dist/src/bin/english-pilot.js eval agent --backend claude --case channel-weather --dry-run --json
```

Non-dry-run agent eval can invoke the real local Claude/Codex process and is intentionally not part of `project-health`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run smoke
npm run project-health
npm run verify
```

Local and CI gates include:

- ESLint and Prettier
- TypeScript typecheck
- Vitest coverage
- deterministic smoke eval
- shellcheck for scripts
- dependency-cruiser
- knip
- gitleaks
- CodeQL
- weekly/on-demand mutation testing

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for roadmap context.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

MIT. See [LICENSE](LICENSE).

<p align="right">(<a href="#readme-top">back to top</a>)</p>
