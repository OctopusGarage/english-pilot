# EnglishPilot Project Plan

EnglishPilot helps users keep normal AI work moving while gradually shifting prompts and review habits toward English.

## Product Principles

- Enforce only when the prompt exceeds the configured Chinese/non-English ratio.
- Keep coaching low-disruption: finish the user's main task first, then add at most one useful English note when appropriate.
- Record reusable expressions separately so learning can happen through daily review instead of interrupting every conversation.
- Prefer practical workplace English: configuration, debugging, planning, product discussion, review, and collaboration phrases.
- Keep every host or channel integration behind a registry entry before adding installer or delivery behavior.

## Current Supported Surfaces

- CLI: check, hook, install, config, config intensity profiles/status/progression suggestions/scheduled apply, coach, structured coaching context, method templates, review, review item update/removal/cleanup, daily, glossary, pronounce, stats, export, doctor, status, roadmap with target filtering and next-action summaries, integration target listing, offline and recordable integration message coaching, Feishu long-connection setup/doctor/start, WeChat QR-login long-connection setup/doctor/accounts/logout/start, unified daemon `run`, daemon status, service management, and WeChat account guides.
- Hooks: Claude Code and Codex prompt gates.
- Installers: Claude and Codex installers use absolute Node/script commands when run from a built checkout; Codex installation also enables the root `[hooks]` switch.
- MCP: status, roadmap with target filtering and next-action summaries, external-validation bundle write/verify, analysis, config intensity profiles/status/progression suggestions/scheduled apply, rewrite, pronunciation, method templates, lesson extraction, review queues, daily packs, review marking/update/removal/cleanup, coaching context, integration target listing, integration payload/dry-run/readiness/network-delivery/account-guide/account-validation/history/message-coaching/event-coaching helpers, and diagnostics.
- Storage: local SQLite by default under `~/.english-pilot`, with JSONL fallback.
- Parked implemented surfaces: Obsidian/Markdown export-delivery and Voice/STT remain in the codebase for later product review, but they are not part of the current mainline.

## Learning Method

- Gate: enforce an English-dominant prompt threshold with configurable intensity. `maxChineseRatio` blocks over-limit prompts; `targetChineseRatio` decides when allowed prompts should receive coaching instead of staying silent.
- Intensity: `config profiles` exposes beginner, balanced, and strict presets; `config use <profile>` adjusts the threshold, target ratio, coaching intensity, cooldown, and daily note cap together; `config profile-status` reports whether current settings still match a built-in profile.
- Progression suggestions: `config progression-suggestion` and `english_config_progression_suggestion` read recent prompt history and recommend collecting more data, tightening, relaxing, or keeping the current profile. They return a copyable `config use <profile>` command.
- Scheduled progression: `ratioProgression=scheduled` opts into scheduled profile changes through `config progression-apply --yes` or `english_config_progression_apply` with `apply: true`; without the explicit apply flag, the command is a dry run.
- Config safety: saved config files are validated on load, so manual edits to `~/.english-pilot/config.json` are rejected by `config get`, `doctor`, and runtime readers instead of silently changing policy behavior.
- Rewrite: blocked prompts include a copyable English starting point when `blockWithRewrite` is enabled.
- Notice: allowed prompts may receive one short final-response note when it will not derail the task.
- Cadence: `coach context` and `english_coaching_context` expose the current intensity, cooldown, daily cap, and next-note decision so agents can avoid over-coaching.
- Record: worthwhile short phrases become structured learning items with scene, key phrases, IPA, sentence pattern, and retrieval prompt; allowed-prompt auto-recording respects `recordAllowedPrompts`, while long business prompts and obvious generic fallback rewrites are kept out of the review queue.
- Template: common work scenes have reusable English patterns, examples, IPA, and tags for optional study; selected templates can be recorded into the normal review queue.
- Review: daily prompts hide the answer first, optionally check the user's recall attempt with local word-level feedback, then reveal the suggested expression and pronunciation details.
- Spaced repetition: review items keep SM-2-style local scheduling state (`ease`, `reviewCount`, `lapseCount`, `intervalDays`). `easy` increases ease and interval, `hard` lowers ease and keeps the next review close, and `again` records a lapse and makes the item due again the same day.
- Review maintenance: `review update <id>` corrects retained items without losing scheduling metadata and refreshes IPA when the suggested sentence changes, `review remove <id>` deletes one bad item, and `review cleanup` previews likely noisy or duplicate historical records before `review cleanup --yes` removes them.
- Personalize: glossary entries preserve project-specific terms, IPA, meanings, and allowed proper nouns.

## Integration Roadmap

Supported now:

- `feishu`: QR onboarding plus long-connection bot monitoring. `feishu setup` writes `~/.english-pilot/feishu.env`, `feishu doctor` validates credentials and allowlist, and `feishu start` listens for inbound messages, replies with copyable English rewrites when messages exceed the threshold, and records useful review items.
- `wechat`: QR-login long-connection bot monitoring. `wechat setup` stores account credentials under `~/.english-pilot/wechat/accounts/`, `wechat doctor` validates local account state and allowlist, `wechat accounts` lists saved accounts without tokens, `wechat logout <accountId>` removes local credentials, and `wechat start` listens for inbound direct messages, replies with copyable English rewrites when messages exceed the threshold, and records useful review items.
- Unified daemon runtime: `run` starts configured Feishu/Lark and WeChat long-connection channels in one process, writes `~/.english-pilot/run/.running`, holds `~/.english-pilot/run/.instance.lock`, emits JSONL logs under `~/.english-pilot/logs/daemon.log`, and exposes the local control socket `~/.english-pilot/run/english-pilot.sock`.
- Service management: `service install|uninstall|status|restart|logs|pause|resume` wraps launchd on macOS and user systemd on Linux. Service installation is explicit and separate from Claude/Codex hook or MCP installation.
- Generic daily review payloads: `integrations daily-pack --target <target>` produces a channel-neutral payload for supported or planned targets without sending network messages.
- Feishu/Lark daily review dry run: `integrations dry-run --target feishu` previews credential names and payload content without network calls; Feishu delivery is `payload-only` because active interaction runs through `feishu start`.
- WeChat daily review dry run: `integrations dry-run --target wechat` uses the same payload contract and does not perform network calls.
- Feishu/WeChat message preview contracts: daily-review dry runs include target-specific long-connection `messagePreview` content, delivery mode labels, and credential-policy metadata without building provider HTTP request previews.
- Integration delivery mode policy: Feishu/Lark and WeChat both use dedicated long-connection bot channels.
- Integration credential preflight: `integrations preflight --target feishu|wechat` checks required credential environment variables without network calls.
- Integration credential policy: first-version integration secrets are environment variables only; EnglishPilot reads them at runtime and does not persist them.
- WeChat account guide: `integrations account-guide --target wechat` points to `wechat setup`, `wechat doctor`, and `wechat start`, plus Tencent/OpenClaw references and allowlist troubleshooting.
- Integration message coaching payloads: `integrations message-coaching --target feishu|wechat --text "..."` produces threshold analysis, blocked-message rewrite, and reviewable lesson suggestions without sending network messages.
- Recordable integration message coaching: `integrations message-coaching --target feishu|wechat --text "..." --record` stores worthwhile message lessons in the normal review queue with `integration-message` and channel tags. MCP exposes the same workflow through `english_integration_message_coaching` with `record: true`.
- Inbound event coaching: `integrations event-coaching --target feishu|wechat --event-json <json> [--record]` normalizes Feishu/WeChat inbound message payloads into text, sender, and message metadata, then reuses the message-coaching workflow without storing the raw platform event.
- Roadmap evidence continuation: Feishu/Lark and WeChat roadmap items focus on long-connection onboarding and hardening; cloud-STT roadmap items include provider evidence inspection plus `handoff external-validation --write` and `--verify` in `nextCommands`. `roadmap next` and `english_roadmap_next` return the next missing evidence command, prerequisites, preflight commands, and env-var readiness checks that show present/missing without printing secret values for focused continuation and can write a compact Markdown handoff.
- Doctor integration summaries: `doctor` reports Claude/Codex hook and MCP installation health, Codex hook-enable state, daemon runtime paths and unclean-restart marker state, Feishu/Lark and WeChat long-connection preflight, plus voice provider preflight summaries, without failing the whole report for missing optional integration credentials or external validation evidence. Add `--write --dir <path>` or MCP `write: true` to export a Markdown diagnostic handoff.
- MCP parity for integration, diagnostics, config-profile, and method-template helpers: agents can call `english_config_profiles`, `english_config_use`, `english_config_profile_status`, `english_config_progression_suggestion`, `english_config_progression_apply`, `english_method_templates`, `english_record_method_template`, `english_roadmap_next`, `english_integration_daily_pack`, `english_integration_dry_run`, `english_integration_preflight`, `english_integration_send_readiness`, `english_integration_send`, `english_integration_account_guide`, `english_integration_account_validate`, `english_integration_validation_history`, `english_integration_message_coaching`, `english_integration_event_coaching`, `english_external_validation_bundle`, `english_external_validation_bundle_verify`, and `english_doctor`; write-capable tools remain read-only unless explicit `write: true` or `--write` is provided.
- External validation handoff bundle: `handoff external-validation [--target feishu|wechat|cloud-stt] [--write|--verify] [--dir <path>]`, `english_external_validation_bundle`, and `english_external_validation_bundle_verify` bundle or verify roadmap, doctor diagnostics, evidence checklist, next commands, Feishu/Lark and WeChat long-connection account guides, and cloud-STT generic contract/wrapper/assessment snapshots under one directory. The bundle includes Markdown files for human review, JSON snapshots for automated consumers, `evidence/evidence-checklist.md|json`, `commands/next-commands.md|json`, `integration-runbooks/<target>-account-guide.md|json`, `voice-stt/generic-json-contract.md|json`, `voice-stt/wrapper-template.md|json`, `voice-stt/assessment-history.md|json`, `voice-stt/english-pilot-stt-wrapper.py`, conditional `voice-stt/provider-contract-draft.md|json` files when incompatible provider evidence exists, and a root `manifest.json` listing every generated file.
- External validation verifier: `handoff external-validation --verify` and `english_external_validation_bundle_verify` check manifest consistency, expected file presence, non-empty generated files, and JSON parse validity.
- Roadmap diagnostics: `roadmap --json` and `english_roadmap` list remaining external or conditional roadmap items, blockers, required evidence, evidence already recorded locally, per-evidence action commands, and next commands for Feishu/Lark long-connection onboarding, WeChat QR-login long-connection onboarding, and provider-specific cloud STT contracts. Use `roadmap --target feishu|wechat|cloud-stt --json` or `english_roadmap` with optional `target` to focus on one workstream; use `roadmap next --target ... --json` or `english_roadmap_next` for the next missing evidence command only. Add `--write --dir <path>` or MCP `write: true` to export either the full roadmap or the focused next-action Markdown handoff for manual validation work.
- External AgentRunner: `agent doctor` and `agent run` expose the process-facing runtime for external channels. Feishu/Lark and WeChat allowed messages call Claude through `claude -p` or Codex through `codex exec` only after `externalAgentBackend` is explicitly configured; Claude/Codex interactive sessions continue to use MCP naturally. Successful channel runs persist active Claude `sessionId` or Codex `threadId` in `~/.english-pilot/agent-sessions.json` and resume only when backend and cwd still match.
- Channel voice-to-agent routing: Feishu/Lark audio message resources are downloaded through the message-resource API, transcribed through the local Whisper provider, then sent through the normal threshold and AgentRunner flow. WeChat voice messages with `voice_item.text` transcripts use the same flow and mark prompt metadata with `inputKind: "voice"`.
- WeChat long-connection stability: the account monitor catches transient `getupdates` failures, backs off, continues polling, preserves cursors, and attempts a refresh notification when the provider reports an expired session.

Parked:

- `obsidian`: implemented Markdown export/delivery is parked until the review product shape is clear.
- `voice`: general STT practice and pronunciation-feedback helpers are parked until the voice learning flow is redesigned; channel voice-to-agent routing is supported.

Planned:

- `feishu`: add richer long-connection operations such as proactive review prompts, group policy controls, and voice attachments after the QR setup path is stable.
- `wechat`: add optional proactive review prompts after the long-running channel is stable.
- `external-agent-runtime`: add manual resume/history selection only if automatic active-session resume is insufficient.

Use `english-pilot integrations targets --json` or the MCP tool `english_integration_targets` as the source of truth for integration status.

Use `english-pilot status --json` or the MCP tool `english_status` as the source of truth for the whole first-version capability overview.

Use `english-pilot roadmap --json`, `english-pilot roadmap --target feishu|wechat|cloud-stt --json`, `english-pilot roadmap next --target feishu|wechat|cloud-stt --json`, `english-pilot roadmap next --target feishu|wechat|cloud-stt --write --dir <path> --json`, `english-pilot roadmap --write --dir <path> --json`, or the MCP tools `english_roadmap` and `english_roadmap_next` as the source of truth for remaining external or conditional roadmap work.

## Next Implementation Slices

- Add provider-specific cloud STT contracts only if a real provider cannot satisfy the supported generic JSON contract.

## Resolved First-Version Decisions

- Speech-to-text provider: first-version default is local command transcription through `WHISPER_COMMAND`; cloud speech-to-text is opt-in through `CLOUD_STT_PROVIDER=generic-json`.
- Cloud voice input configuration: `cloud-stt` currently expects `CLOUD_STT_PROVIDER`, `CLOUD_STT_API_KEY`, and `CLOUD_STT_ENDPOINT`; provider-specific contracts can be added later if needed.
- Feishu/Lark delivery mode: current mode is QR onboarding plus long-connection bot monitoring; revisit document/wiki write only if real delivery needs a different channel.
- WeChat delivery mode: current mode is QR-login plus long-connection bot monitoring; revisit proactive review delivery only after the long-running channel is stable.
- Credential storage: first-version policy is environment variables only; config-file or OS-keychain storage can be revisited if real delivery needs it.
- Ratio progression: first-version policy supports manual adjustment through `config profiles`, `config progression-suggestion`, and `config use <profile>`, plus opt-in scheduled application through `ratioProgression=scheduled` and `config progression-apply --yes`.

## Acceptance Criteria For Real Integrations

- Real delivery commands must keep `dry-run` behavior and prove `wouldSend: false` in tests.
- Real delivery must have explicit credential checks and return actionable missing-credential messages.
- Network-sending paths must be isolated from payload builders so daily review payload tests remain offline.
- Voice input must store the transcript, target sentence, IPA, and feedback as reviewable items just like `voice record`.
