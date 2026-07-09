# EnglishPilot Manual

This is the detailed command and behavior reference. The project landing page is [README.md](../README.md).

EnglishPilot is an English-dominant conversation gate, coaching assistant, and review system for AI workflows.

The current mainline is scoped around three entry points:

- Claude Code and Codex hook adapters for blocking prompts that exceed the configured Chinese/non-English ratio.
- Local CLI for checking text, configuration, review, and diagnostics.
- MCP server for agent-side coaching, review tools, and daily review packs.
- A managed daemon for Feishu/Lark and WeChat long-connection channels, with launchd/systemd service helpers.

Obsidian/Markdown export and Voice/STT helpers are implemented but parked outside the current mainline while the product shape is reconsidered.

The installer target registry currently marks Claude Code and Codex as supported. Cursor and Gemini CLI are listed as planned targets so future host support has a stable place to land without pretending those installers exist today.

## Install

Recommended packaged install or update:

```bash
curl -fsSL https://raw.githubusercontent.com/OctopusGarage/english-pilot/main/install.sh | bash
```

Npm install after publishing:

```bash
npm install -g english-pilot
english-pilot setup --yes
```

Voice transcription setup is documented in [Voice STT Install](voice-stt-install.md). Apple Silicon Macs should use `mlx-whisper`; Intel Macs should start with `whisper.cpp`.

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm test
npm run project-health
node dist/src/bin/english-pilot.js check --text "I want to create a new project" --json
node dist/src/bin/english-pilot.js hook claude --stdin
node dist/src/bin/english-pilot.js hook codex --stdin
node dist/src/bin/english-pilot.js setup --yes --agent codex --cwd /path/to/workspace --json
node dist/src/bin/english-pilot.js install targets --json
node dist/src/bin/english-pilot.js install claude --dry-run
node dist/src/bin/english-pilot.js install claude --yes
node dist/src/bin/english-pilot.js uninstall claude --yes
node dist/src/bin/english-pilot.js install codex --dry-run
node dist/src/bin/english-pilot.js install codex --yes
node dist/src/bin/english-pilot.js uninstall codex --yes
node dist/src/bin/english-pilot.js serve --mcp
node dist/src/bin/english-pilot.js run --dry-run --json
node dist/src/bin/english-pilot.js run
node dist/src/bin/english-pilot.js daemon status --json
node dist/src/bin/english-pilot.js service install --dry-run --json
node dist/src/bin/english-pilot.js service install
node dist/src/bin/english-pilot.js service install-dev
node dist/src/bin/english-pilot.js service status
node dist/src/bin/english-pilot.js service logs
node dist/src/bin/english-pilot.js service restart
node dist/src/bin/english-pilot.js service uninstall
node dist/src/bin/english-pilot.js config get
node dist/src/bin/english-pilot.js config profiles --json
node dist/src/bin/english-pilot.js config profile-status --json
node dist/src/bin/english-pilot.js config progression-suggestion --json
node dist/src/bin/english-pilot.js config progression-apply --yes --json
node dist/src/bin/english-pilot.js config use force --json
node dist/src/bin/english-pilot.js config set externalAgentBackend claude
node dist/src/bin/english-pilot.js config set externalAgentBackend codex
node dist/src/bin/english-pilot.js config set externalAgentCwd /path/to/workspace
node dist/src/bin/english-pilot.js agent doctor --json
node dist/src/bin/english-pilot.js agent run --text "Reply to this channel message." --backend claude --dry-run --json
node dist/src/bin/english-pilot.js agent run --text "Reply to this channel message." --backend codex --cwd /path/to/workspace --dry-run --json
node dist/src/bin/english-pilot.js eval smoke --json
node dist/src/bin/english-pilot.js eval prompts
node dist/src/bin/english-pilot.js eval agent --backend codex --case channel-weather --dry-run --json
node dist/src/bin/english-pilot.js review --json
node dist/src/bin/english-pilot.js review due --json
node dist/src/bin/english-pilot.js review upcoming --days 7 --json
node dist/src/bin/english-pilot.js review mark <id> easy
node dist/src/bin/english-pilot.js review update <id> --suggested "Align this implementation with the reference project."
node dist/src/bin/english-pilot.js review remove <id>
node dist/src/bin/english-pilot.js review cleanup --json
node dist/src/bin/english-pilot.js review cleanup --yes --json
node dist/src/bin/english-pilot.js coach --text "这个 threshold 后续支持调整强度" --record --json
node dist/src/bin/english-pilot.js coach context --json
node dist/src/bin/english-pilot.js coach templates --json
node dist/src/bin/english-pilot.js coach templates --scene debugging --json
node dist/src/bin/english-pilot.js coach templates --scene debugging --record --json
node dist/src/bin/english-pilot.js pronounce --text "threshold workflow" --json
node dist/src/bin/english-pilot.js voice providers --json
node dist/src/bin/english-pilot.js voice stt-policy --json
node dist/src/bin/english-pilot.js voice stt-contract --json
node dist/src/bin/english-pilot.js voice stt-validate --response-json '{"transcript":"I want to create a new project.","words":[{"word":"project","confidence":0.86}]}' --json
node dist/src/bin/english-pilot.js voice stt-assess-provider --provider-name acme-stt --response-json '{"payload":{"alternatives":[]}}' --record --json
node dist/src/bin/english-pilot.js voice stt-assessment-history --provider-name acme-stt --json
node dist/src/bin/english-pilot.js voice stt-provider-contract-draft --provider-name acme-stt --json
node dist/src/bin/english-pilot.js voice stt-wrapper-template --json
node dist/src/bin/english-pilot.js voice preflight --provider manual --json
node dist/src/bin/english-pilot.js voice transcribe --provider local-whisper --audio ./sample.wav --json
node dist/src/bin/english-pilot.js voice practice --provider local-whisper --audio ./sample.wav --target "I want to create a new project." --feedback "Add to before create." --json
node dist/src/bin/english-pilot.js voice record --transcript "I want create new project" --target "I want to create a new project." --feedback "Add to before create." --json
node dist/src/bin/english-pilot.js daily --json
node dist/src/bin/english-pilot.js daily start --json
node dist/src/bin/english-pilot.js daily answer <id> --json
node dist/src/bin/english-pilot.js daily check <id> --answer "I reproduced the issue with Codex hook." --json
node dist/src/bin/english-pilot.js daily mark <id> easy
node dist/src/bin/english-pilot.js daily pack --write
node dist/src/bin/english-pilot.js glossary add vectorize --ipa "/ˈvektəraɪz/" --meaning "向量化" --tag ml
node dist/src/bin/english-pilot.js glossary add 飞书知识库同步区 --meaning "Feishu knowledge base" --allow-term
node dist/src/bin/english-pilot.js glossary list --json
node dist/src/bin/english-pilot.js glossary remove vectorize
node dist/src/bin/english-pilot.js stats --json
node dist/src/bin/english-pilot.js export markdown
node dist/src/bin/english-pilot.js export obsidian --write --dir ~/Documents/Obsidian/EnglishPilot
node dist/src/bin/english-pilot.js handoff external-validation --write --dir ~/.english-pilot/external-validation --json
node dist/src/bin/english-pilot.js handoff external-validation --verify --dir ~/.english-pilot/external-validation --json
node dist/src/bin/english-pilot.js feishu setup
node dist/src/bin/english-pilot.js feishu doctor --json
node dist/src/bin/english-pilot.js feishu start --dry-run --json
node dist/src/bin/english-pilot.js feishu start
node dist/src/bin/english-pilot.js wechat setup
node dist/src/bin/english-pilot.js wechat doctor --json
node dist/src/bin/english-pilot.js wechat accounts --json
node dist/src/bin/english-pilot.js wechat start --dry-run --json
node dist/src/bin/english-pilot.js wechat start
node dist/src/bin/english-pilot.js integrations targets --json
node dist/src/bin/english-pilot.js integrations message-coaching --target feishu --text "我想创建一个 new project，用来辅助英语学习。" --record --json
node dist/src/bin/english-pilot.js integrations deliver --target obsidian --dir ~/Documents/Obsidian/EnglishPilot/Daily --write --json
node dist/src/bin/english-pilot.js doctor --json
node dist/src/bin/english-pilot.js doctor --write --dir ~/.english-pilot/diagnostics --json
node dist/src/bin/english-pilot.js status --json
node dist/src/bin/english-pilot.js roadmap --json
node dist/src/bin/english-pilot.js roadmap --target feishu --json
node dist/src/bin/english-pilot.js roadmap next --target feishu --json
node dist/src/bin/english-pilot.js roadmap next --target feishu --write --dir ~/.english-pilot/roadmap-next --json
node dist/src/bin/english-pilot.js roadmap --write --dir ~/.english-pilot/roadmap --json
```

## Feishu/Lark Long Connection

Feishu/Lark runs as a long-connection bot integration.

1. Build or install the CLI.
2. Run `english-pilot feishu setup` and scan the QR code with Feishu/Lark.
3. Confirm the generated file with `english-pilot feishu doctor`.
4. Preview startup with `english-pilot feishu start --dry-run --json`.
5. Run `english-pilot run` for the unified daemon, or install it with `english-pilot service install`.

The setup command writes `~/.english-pilot/feishu.env` with `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_ALLOWED_OPEN_IDS`, `FEISHU_DOMAIN`, and `FEISHU_REPLY_MODE`. Runtime environment variables override the file. The allowlist is fail-closed: messages from unknown `open_id` senders are ignored.

Incoming Feishu messages use the same EnglishPilot prompt-assessment pipeline as hooks and CLI checks. The channel adds daemon-controlled delivery: `FEISHU_REPLY_MODE=silent|violation|always`. Over-limit messages can receive a copyable English rewrite reply, and useful short expressions are recorded into the normal review queue for daily practice. If an allowed message is teachable and a local agent backend is configured, the daemon adds an `<english_pilot_coaching>` instruction to the same Claude/Codex turn so the agent can append one compact `English note` after the main reply.

If `externalAgentBackend` is set to `claude` or `codex`, allowed Feishu messages are handed to the local AgentRunner after the threshold check. Claude runs through `claude -p`; Codex runs through `codex exec`. The generated prompt separates channel metadata from user text, and the reply is sent back through the long-connection channel.

Feishu/Lark conversations automatically resume the last successful local agent session for the same channel scope and cwd. Claude resumes with `--resume <sessionId>`; Codex resumes with `exec ... resume --json <threadId> -`. Voice/audio messages are downloaded from the Feishu message resource API, transcribed with the configured local Whisper provider, then sent through the same threshold and AgentRunner flow as text.

Send `/new` in Feishu/Lark to clear the active session for the current chat scope. The next message starts a fresh Claude/Codex conversation.

`english-pilot feishu start` remains available for focused channel testing. Long-term usage should prefer the unified daemon so Feishu and WeChat share one process, one instance lock, one control socket, and one service lifecycle.

## WeChat Long Connection

WeChat runs as a QR-login long-connection channel.

1. Run `english-pilot wechat setup` and scan the QR code with WeChat.
2. Confirm saved accounts with `english-pilot wechat accounts --json`.
3. Confirm readiness with `english-pilot wechat doctor --json`.
4. Preview startup with `english-pilot wechat start --dry-run --json`.
5. Run `english-pilot run` for the unified daemon, or install it with `english-pilot service install`.

The setup command stores QR-login account credentials under `~/.english-pilot/wechat/accounts/` with best-effort `0600` permissions. The scanned owner user is allowed automatically; add `WECHAT_ALLOWED_USERS` for additional senders. Incoming WeChat messages use the same EnglishPilot prompt-assessment pipeline as hooks, CLI checks, and Feishu. The channel adds daemon-controlled delivery: `WECHAT_REPLY_MODE=silent|violation|always`. Over-limit messages can receive a copyable English rewrite reply, and useful expressions are recorded into the normal review queue. If an allowed message is teachable and a local agent backend is configured, the daemon adds an `<english_pilot_coaching>` instruction to the same Claude/Codex turn so the agent can append one compact `English note` after the main reply.

If `externalAgentBackend` is set to `claude` or `codex`, allowed WeChat messages are handed to the same local AgentRunner used by Feishu and CLI. The WeChat reply keeps the saved long-connection context token when one is available.

Allowed Feishu and WeChat messages send a short processing acknowledgement before invoking Claude/Codex, because the current channel adapters do not expose a native typing indicator. The default text is `Received. Working on it...`. Disable it with `WECHAT_PROCESSING_ACK=off` or `FEISHU_PROCESSING_ACK=off`; customize it with `WECHAT_PROCESSING_ACK_TEXT` or `FEISHU_PROCESSING_ACK_TEXT`.

WeChat conversations automatically resume the last successful local agent thread for the same account, chat, sender, and cwd. Voice messages that already include a `voice_item.text` transcript are treated as voice input and routed to the same AgentRunner flow. The long-connection monitor catches transient update failures, backs off, and continues polling; session-expired responses trigger a refresh notification attempt plus setup guidance in logs.

Send `/new` in WeChat to clear the active session for the current conversation scope. The next message starts a fresh Claude/Codex conversation.

`english-pilot wechat start` remains available for focused channel testing. Long-term usage should prefer the unified daemon.

## Managed Daemon

The daemon owns external long-connection channels. Hook, MCP, and one-shot CLI usage do not require it.

```bash
node dist/src/bin/english-pilot.js run --dry-run --json
node dist/src/bin/english-pilot.js run
node dist/src/bin/english-pilot.js daemon status --json
node dist/src/bin/english-pilot.js service install
node dist/src/bin/english-pilot.js service install-dev
node dist/src/bin/english-pilot.js service status
node dist/src/bin/english-pilot.js service logs
node dist/src/bin/english-pilot.js service restart
```

`run` starts one process that loads configured Feishu/Lark and WeChat channels, writes a running marker, holds an instance lock, and exposes a local Unix control socket at `~/.english-pilot/run/english-pilot.sock`. `daemon status` reads the running daemon through that socket when available and falls back to local marker inspection when it is stopped.

`service install` registers the built `dist` daemon with launchd on macOS or a user systemd service on Linux. On macOS, `service install-dev` installs a launchd service that points at this checkout and runs `npm run build` on each service start before launching the daemon. Use it while developing or testing local channel code; after code changes, run `english-pilot service restart` to pick up the latest checkout. The service command is explicit; installing hooks or MCP servers does not automatically register a background process.

Service runs can load environment variables from `~/.english-pilot/env`. This is the recommended place for background-only values such as `WHISPER_COMMAND`, `CLOUD_STT_PROVIDER`, `CLOUD_STT_API_KEY`, `CLOUD_STT_ENDPOINT`, `WECHAT_PROCESSING_ACK`, and `FEISHU_PROCESSING_ACK`. The file uses shell syntax:

```bash
WHISPER_COMMAND=/absolute/path/to/english-pilot-stt-wrapper.py
WECHAT_PROCESSING_ACK=on
WECHAT_PROCESSING_ACK_TEXT="Received. Working on it..."
```

Restart the service after editing this file.

## Development Gates

Local commits use Husky pre-commit gates:

- `lint-staged` lints/formats staged TS/JS files and formats staged JSON/Markdown/YAML files.
- `npm run lint` blocks ESLint violations.
- `npm run secrets:staged` blocks staged secrets with gitleaks.
- `npm run typecheck` and `npm test` block broken TypeScript or tests.

Run `npm run project-health` before larger changes. It runs lint, typecheck, coverage-gated tests, build, deterministic smoke eval, dependency-cruiser, and knip. Run `npm run verify` for the same project-health gate plus full-history gitleaks. GitHub Actions also runs CI on Ubuntu/macOS, a dedicated `project-health.yml` workflow with coverage artifact upload, and a separate full-history gitleaks workflow on `main` pull requests and pushes.

`install targets` lists both supported and planned host targets. Planned targets return a clear "not supported yet" message if used with `install` or `uninstall`.

`integrations targets` lists supported, planned, and deferred channel integrations. Feishu/Lark long-connection coaching and WeChat long-connection coaching are the current mainline integration targets. Obsidian Markdown export/delivery and voice practice are marked deferred.

`integrations daily-pack --target <target>` builds a channel-neutral daily review payload for a target. Feishu/Lark returns `payload-only` because delivery is handled by the long-connection monitor; WeChat returns a message-delivery payload but does not send network messages by itself.

`integrations credential-policy --target feishu` or `--target wechat` reports the first-version credential storage policy. EnglishPilot uses environment variables only, reads them at runtime, and does not persist integration secrets.

`integrations delivery-mode --target feishu` reports the Feishu/Lark long-connection bot policy. `integrations delivery-mode --target wechat` reports the WeChat QR-login long-connection policy.

`integrations dry-run --target feishu` or `--target wechat` previews a daily review delivery. Feishu/Lark reports the required long-connection env vars and a `payload-only` daily pack. WeChat includes a long-connection `messagePreview` for the QR-login channel. It does not perform network calls.

`integrations preflight --target feishu` or `--target wechat` checks required credential environment variables without network calls.

`integrations account-guide --target wechat` returns the QR-login setup checklist, official references, and troubleshooting notes. Use `wechat setup`, `wechat doctor`, and `wechat start` for WeChat long-connection setup.

`integrations account-validate --target wechat` runs the executable validation playbook: preflight, dry-run, send-readiness, and final network-send stage. It does not perform the network-send stage unless `--send` is present. With `--send`, it uses the same env-only credentials and sender as `integrations send`, then reports each stage and any blockers. Add `--record` to persist a sanitized validation summary.

`integrations validation-history --target wechat` lists sanitized account validation records saved from `account-validate --record`. Records include stages, blockers, delivery target API, and sanitized provider response metadata, but never persist integration credentials or tokens.

`integrations message-coaching --target feishu|wechat --text "..."` builds the offline payload future message adapters need: threshold analysis, copyable rewrite when blocked, and a reviewable lesson suggestion when useful. It does not send network messages. Add `--record` to store the suggested lesson as a normal review item tagged with `integration-message` and the target channel.

`integrations event-coaching --target feishu|wechat --event-json <json>` normalizes an inbound platform message event, extracts the text, then runs the same message-coaching workflow. Feishu supports `event.message.content` containing either text JSON or a plain string. WeChat supports JSON fields such as `Content`, `MsgId`, and `FromUserName`. Add `--record` to store the lesson in the review queue.

`integrations deliver --target obsidian --dir <path>` remains available as a deferred local helper. It previews the daily review delivery path and payload without writing files. Add `--write` to write the daily review pack for a date to `<path>/YYYY-MM-DD.md`. This stays offline, returns `wouldSend: false`, and never sends network messages.

`doctor` includes Feishu/Lark and WeChat long-connection preflight, voice provider preflight summaries, and recorded cloud STT provider assessment history. Add `--write --dir <path>` to export the diagnostic report as Markdown. Missing optional integration credentials, voice-provider configuration, or provider sample evidence does not make overall doctor status fail.

`status --json` returns a machine-readable overview of supported hooks, CLI commands, MCP tools, storage backends, integrations, deferred surfaces, planned work, and open decisions.

`handoff external-validation [--target feishu|wechat|cloud-stt] [--write|--verify] [--dir <path>]` bundles the local roadmap handoff, doctor diagnostics, evidence checklist, next commands, Feishu/Lark and WeChat long-connection account guides, and cloud-STT generic contract/wrapper/assessment snapshots under one directory. It writes human-readable Markdown plus machine-readable JSON snapshots, including a root `manifest.json`, `evidence/evidence-checklist.md|json`, `commands/next-commands.md|json`, `integration-runbooks/<target>-account-guide.md|json`, `voice-stt/generic-json-contract.md|json`, `voice-stt/wrapper-template.md|json`, `voice-stt/assessment-history.md|json`, and `voice-stt/english-pilot-stt-wrapper.py` for cloud-STT workstreams. If an incompatible STT provider assessment has been recorded, the cloud-STT bundle also includes `voice-stt/provider-contract-draft.md|json` for the latest provider that needs a provider-specific adapter.

The external-validation verifier checks that the bundle manifest is consistent, every expected file is present and non-empty, and JSON snapshots parse cleanly.

`roadmap --json` returns the remaining external or conditional roadmap items with blockers, required evidence, evidence already recorded locally, per-evidence action commands, and next commands. Add `--target feishu|wechat|cloud-stt` to focus on one remaining workstream. Feishu/Lark and WeChat roadmap items describe long-connection onboarding; cloud-STT roadmap items describe provider contract validation. `roadmap next [--target ...]` returns only the next missing evidence command plus prerequisites such as required env vars or STT sample inputs, preparation commands to run before recording evidence, and env-var readiness as present/missing without printing secret values. `roadmap env-template [--target ...]` prints empty shell export and `.env` templates for the required external setup variables without secret values.

External Feishu, WeChat, or future CLI chat messages use an explicit local agent backend before invoking AI work. Active conversation tokens are stored locally under `~/.english-pilot/agent-sessions.json` and are reused only when backend and cwd still match. See `docs/agent-runtime-design.md` for the implemented `claude -p` / `codex exec` adapter and the MCP vs skill+CLI decision.

`eval smoke` runs a deterministic local smoke suite in a temporary EnglishPilot home directory. It checks blocking with copyable rewrites, force-mode coaching for awkward mixed-language prompts, Feishu/WeChat `<english_pilot_coaching>` injection, and Codex dry-run command construction without invoking Codex. `eval prompts` prints ready-to-use Claude/Codex prompt fixtures for manual or future real-agent evals. `npm run project-health` runs this smoke suite after build.

`eval agent --backend claude|codex --case channel-weather` runs the opt-in AI-backed eval. It sends the channel-weather prompt fixture to the selected local agent and judges whether the output contains the main reply plus `English note`, the better weather phrase, `Why`, and IPA. Add `--dry-run` to verify command construction without invoking the model. This eval is intentionally not part of `project-health` because it depends on local agent credentials, model availability, and runtime behavior.

The MCP server exposes the same integration, voice-practice, status, roadmap, config-profile, method-template, daily-check, coaching-context, and diagnostic helpers through `english_status`, `english_roadmap`, `english_roadmap_next`, `english_roadmap_env_template`, `english_external_validation_bundle`, `english_external_validation_bundle_verify`, `english_config_profiles`, `english_config_use`, `english_config_profile_status`, `english_config_progression_suggestion`, `english_config_progression_apply`, `english_method_templates`, `english_record_method_template`, `english_daily_check`, `english_coaching_context`, `english_integration_targets`, `english_integration_credential_policy`, `english_integration_delivery_mode`, `english_integration_daily_pack`, `english_integration_dry_run`, `english_integration_preflight`, `english_integration_send_readiness`, `english_integration_send`, `english_integration_account_guide`, `english_integration_account_validate`, `english_integration_validation_history`, `english_integration_message_coaching`, `english_integration_event_coaching`, `english_integration_deliver`, `english_record_voice_practice`, `english_voice_providers`, `english_voice_stt_policy`, `english_voice_stt_contract`, `english_voice_stt_validate`, `english_voice_stt_assess_provider`, `english_voice_stt_assessment_history`, `english_voice_stt_provider_contract_draft`, `english_voice_stt_wrapper_template`, `english_voice_preflight`, `english_voice_transcribe`, `english_voice_practice_from_audio`, and `english_doctor`. `english_roadmap` accepts optional `target: "feishu" | "wechat" | "cloud-stt"` and can write a Markdown handoff when `write: true` is passed with an optional `directory`; `english_roadmap_next` returns the next missing evidence command for the same optional target and can write a focused Markdown handoff with `write: true`; `english_roadmap_env_template` returns empty shell export and `.env` templates for the same optional target. `english_external_validation_bundle` accepts the same optional target and writes the combined Markdown and JSON handoff only when `write: true` is passed; `english_external_validation_bundle_verify` verifies an existing handoff without writing. `english_doctor` can also write a Markdown diagnostic report with `write: true`. `english_integration_deliver` currently supports Obsidian Markdown only and writes only when `write: true` is passed.

Review queue maintenance is also exposed through MCP: `english_update_review_item` corrects one item by id, `english_remove_review_item` removes one item by id, and `english_review_cleanup` previews likely noisy records unless `confirm: true` is passed.

Review scheduling uses local SM-2-style state on each learning item: `ease`, `reviewCount`, `lapseCount`, and `intervalDays`. New items start at the next day. Marking `easy` graduates the item to a longer interval, `hard` keeps it close while lowering ease, and `again` records a lapse and makes it due again the same day for relearning.

## Default Policy

- Allow up to 30% Chinese/non-English narrative text.
- Use `config profiles` and `config use beginner|balanced|strict|force` to switch learning intensity without hand-editing individual thresholds.
- Use `config profile-status` to see whether the current settings still match a built-in profile or have become a custom profile.
- Use `config progression-suggestion` to get a read-only profile recommendation from recent prompt history.
- Set `ratioProgression=scheduled` and run `config progression-apply --yes` from a scheduler to apply safe tighten/relax recommendations. Without `--yes`, `progression-apply` is a dry run.
- `config set` validates ratio ranges, enum values, and non-negative count settings before saving.
- `config get` and `doctor` validate the persisted config file too, so manual edits to `~/.english-pilot/config.json` fail fast with an actionable error.
- `ratioProgression` supports `manual` and `scheduled`; scheduled mode only changes config through the explicit progression-apply entry point.
- Treat `targetChineseRatio` as the coaching target: mixed prompts at or below the target are allowed silently, while prompts above the target but below `maxChineseRatio` are allowed with coaching. In `force` mode, short ignored fragments and common awkward-English patterns can also trigger coaching without counting toward blocking.
- Ignore code blocks, inline code, URLs, and simple XML/HTML tags.
- Block prompts that exceed the threshold and provide a copyable English rewrite suggestion by default. Set `blockWithRewrite=false` to keep blocking without returning a rewrite.
- Worthwhile short mixed-language learning prompts are recorded for review by default. Long business prompts, multi-section task instructions, and noisy generic rewrites are not auto-recorded. Set `recordAllowedPrompts=false` to keep prompt checks and coaching without automatically adding review items.
- Rewrite suggestions use built-in work-pattern rules first. If `rewriteBackend=argos` and `argosPython` point to a local Argos-compatible Python environment, blocked prompts can use that local translator before falling back to the generic rewrite:

```bash
node dist/src/bin/english-pilot.js config set rewriteBackend argos
node dist/src/bin/english-pilot.js config set argosPython /path/to/argos/python
node dist/src/bin/english-pilot.js config set rewriteTimeoutMs 8000
node dist/src/bin/english-pilot.js doctor --json
```

## Local Files

EnglishPilot stores local state under `~/.english-pilot` by default. The default storage backend is SQLite at `~/.english-pilot/english-pilot.sqlite`; `storage=jsonl` is available as a fallback. Learning items include review scheduling metadata and are migrated with default values when older local records are read. Personal glossary entries are stored at `~/.english-pilot/glossary.json`. Sanitized integration validation records are stored at `~/.english-pilot/integration-validations.jsonl`. Tests and scripted runs can override this with `ENGLISH_PILOT_HOME`.

The managed runtime also uses:

- `~/.english-pilot/logs/daemon.log` for JSONL daemon events.
- `~/.english-pilot/logs/launchd.out.log` and `~/.english-pilot/logs/launchd.err.log` on macOS service runs.
- `~/.english-pilot/run/english-pilot.sock` for the local daemon control socket.
- `~/.english-pilot/run/.instance.lock` to prevent duplicate long-connection daemons.
- `~/.english-pilot/run/.running` to detect unclean restarts.

Use `english-pilot daemon status` or `english-pilot doctor` to find the active daemon log path. The JSONL daemon log includes stable event names such as `wechat.channel.running`, `wechat.stream.start`, `wechat.getupdates.retry`, `wechat.getupdates.recovered`, `wechat.session.expired`, and `wechat.message.received`. When WeChat or Feishu appears silent, first check whether the channel is running, whether inbound messages are arriving, whether the local Claude/Codex agent failed, and whether reply sending failed.

Claude installation writes:

- `~/.claude/hooks/english-pilot.sh`
- `~/.claude.json` with `mcpServers["english-pilot"]`
- Hook and MCP commands use the current absolute Node executable and built `english-pilot.js` path when installed from this project, avoiding PATH-dependent hook failures.

Codex installation writes:

- `~/.codex/hooks.json` with a `UserPromptSubmit` command hook that runs `english-pilot hook codex --stdin`
- `~/.codex/config.toml` with `mcp_servers.english-pilot`
- `~/.codex/AGENTS.md` with managed EnglishPilot guidance for final-response teaching notes
- `[hooks] enabled = true` in `~/.codex/config.toml`, so the installed hook is not silently disabled.

Codex may require reviewing and trusting the hook with `/hooks` before a non-managed command hook runs.

The Codex hook enforces blocking before the prompt reaches the model. Final-response coaching is installed as MCP plus AGENTS guidance: Codex should complete the main task first, then append one short teaching note when the allowed prompt has Chinese fragments, awkward English, or an obvious phrasing improvement. In `force` mode this is intended to be high-frequency, not opportunistic.

```text
English note: "原句" -> "A more natural English version."; Why: one practical rule; IPA: key word /IPA/ when useful.
```

## Learning Loop

`coach` extracts a reusable lesson from a real prompt: suggested English, scene, key phrases, IPA, sentence pattern, and a retrieval-practice prompt. Use `--record` when the item is worth reviewing later. `coach context` returns structured coaching guidance plus the current intensity, cooldown, and daily-cap state; in `force` mode it tells agents to append compact teaching notes much more aggressively. `coach templates` lists practical workplace-English templates for common scenes such as asking for help, clarifying requirements, debugging, reporting blockers, proposing next steps, and summarizing verified results. Add `--scene <id> --record` to store one template as a normal review item. `pronounce` returns IPA plus word-stress hints for known work-English words.

`voice providers` lists supported voice input providers. `manual` transcript review, `local-whisper` command transcription, and `cloud-stt` generic JSON transcription are supported now. Local Whisper remains the default offline path.

`voice stt-policy` reports the first-version speech-to-text provider policy. Local Whisper is the default offline provider. Cloud STT is supported through a generic JSON adapter when `CLOUD_STT_PROVIDER=generic-json`, `CLOUD_STT_API_KEY`, and `CLOUD_STT_ENDPOINT` are configured.

`voice stt-contract` reports the generic JSON speech-to-text contract used by both cloud STT and local wrapper scripts that print JSON. It includes the request body sent to `CLOUD_STT_ENDPOINT`, accepted response fields such as `transcript`, `text`, `words[].confidence`, and `words[].phonemes[].phoneme`, the normalized EnglishPilot output fields, and a sample response.

`voice stt-validate --response-json <json>` or `voice stt-validate --response-json-file <path>` validates a generic JSON speech-to-text response locally without calling a cloud provider. It reports whether EnglishPilot can parse a transcript, word count, phoneme count, normalized word/phoneme fields, and blockers such as a missing `transcript`, `text`, or `segments[].text`.

`voice stt-assess-provider --provider-name <name> --response-json <json>` or `voice stt-assess-provider --provider-name <name> --response-json-file <path>` checks whether a concrete cloud STT provider sample can satisfy the generic JSON contract. Add `--record` to save local evidence in `~/.english-pilot/voice-stt-assessments.jsonl`; incompatible samples make the provider-specific cloud STT roadmap item `evidence_ready`.

`voice stt-assessment-history [--provider-name <name>]` lists recorded cloud STT provider assessment evidence. Use it before designing a provider-specific adapter so the implementation is based on a concrete incompatible sample instead of assumptions.

`voice stt-provider-contract-draft --provider-name <name>` turns recorded provider assessment evidence into a provider-specific contract draft. If no assessment exists yet, it returns the exact assessment command to run. If the latest sample fails the generic JSON contract, it returns the adapter strategy, normalized fields, proposed files, acceptance criteria, and next commands for implementing a real adapter without guessing provider behavior.

`voice stt-wrapper-template` returns a copyable Python wrapper template for local STT commands. Set `UPSTREAM_STT_COMMAND` to your real speech-to-text executable, set `WHISPER_COMMAND` to the generated wrapper, and EnglishPilot can consume either upstream JSON with `transcript`/`text`/`segments` or plain-text stdout wrapped as `{"transcript":"..."}`.

`voice preflight --provider <provider>` checks voice provider configuration without network calls. `manual` requires no configuration, `local-whisper` checks that `WHISPER_COMMAND` is configured, exists, and is executable, and `cloud-stt` checks `CLOUD_STT_PROVIDER`, `CLOUD_STT_API_KEY`, and `CLOUD_STT_ENDPOINT`.

`voice transcribe --provider local-whisper --audio <path>` runs the configured local `WHISPER_COMMAND` with the audio path as its argument and reads the transcript from stdout. `voice transcribe --provider cloud-stt --audio <path>` posts base64 audio to `CLOUD_STT_ENDPOINT` with `Authorization: Bearer $CLOUD_STT_API_KEY`; the API key is not stored or returned. Plain-text local stdout is treated as the transcript. JSON output/responses are supported when they contain `text` or `transcript`, plus optional `words` entries with `word`, `start`/`end`, `confidence`, and nested `phonemes`. Root-level or segment-level `phonemes` with a `word` field are also attached to the matching word. Timing and confidence fields are normalized to `startSeconds`, `endSeconds`, and `confidence`.

Recommended local STT installs are documented in [Voice STT Install](voice-stt-install.md): use `mlx-whisper` on Apple Silicon Macs and `whisper.cpp` on Intel Macs.

`voice practice --provider local-whisper|cloud-stt --audio <path> --target "..."` transcribes the audio, compares it with the target sentence, and records a normal review item with `voice-practice` tags and IPA from the target sentence. If `--feedback` is omitted, EnglishPilot generates feedback from the transcript/target comparison, including missing or extra words, common grammar focus notes such as `want to + verb`, pronunciation focus words with IPA, word-level scoring, and phoneme-level scoring when the transcription provider returns confidence or timing values.

`voice record` records a voice-practice result from a transcript, target sentence, and optional feedback. It stores the result as a normal review item with `voice-practice` tags and IPA from the target sentence. When feedback is omitted, it uses the same transcript/target feedback generator as `voice practice`.

`daily` returns recorded items as retrieval prompts for daily review. `review due` shows full learning items due by a date, while `review upcoming --days N` groups the next review load by date. `daily start` shows only due items and hides answers; `daily answer <id>` reveals the suggested expression and IPA; `daily check <id> --answer "..."` compares your recall attempt with the target expression and returns local word-level feedback; `daily mark <id> again|hard|easy` schedules the next review. `review update <id> --suggested "..."` corrects a retained item without losing its review metadata and refreshes IPA from the new suggested sentence; it also supports `--original`, `--scene`, `--pattern`, and repeated `--tag`. `review remove <id>` removes one bad review item, and `review cleanup` previews likely noisy historical items such as generic fallback rewrites, duplicate items, or long task instructions; add `--yes` to delete the previewed candidates. `daily pack` builds a Markdown pack of due items, and `daily pack --write` stores it under `~/.english-pilot/reviews/YYYY-MM-DD.md` for daily reading or later Feishu/Obsidian export. `export obsidian --write --dir <path>` writes an Obsidian index plus one Markdown note per learning item. Repeated lessons are deduplicated by normalized original or suggested text.

`glossary` stores personal terms, IPA, meanings, and tags. Lesson extraction checks the glossary first, so custom terms like `vectorize /ˈvektəraɪz/` become key phrases and pronunciation bites. Use `--allow-term` for proper nouns or product terms that may stay in Chinese inside English-leading prompts; it does not bypass the English-leading rule.

See `PROJECT_PLAN.md` for the roadmap and learning-method notes.
