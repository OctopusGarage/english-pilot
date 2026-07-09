# EnglishPilot Context

EnglishPilot helps a learner keep normal AI and chat workflows English-dominant. It does this without turning every work message into a separate English lesson.

## Domain Language

- **Language gate**: the policy check that decides whether a user prompt or channel message is blocked, allowed silently, or allowed with coaching.
- **Prompt assessment**: the full local decision around a message: sanitize narrative text, calculate non-English ratio, detect teachable signals, choose rewrite/coaching behavior, and optionally record learning evidence.
- **Coaching note**: a compact teaching addendum with a better expression, a practical rule, and optional IPA. It must not interrupt the main task.
- **Force mode**: the high-intensity learning profile. It keeps the language gate strict and asks agents to add coaching notes for short Chinese fragments, awkward English, or clear everyday improvements.
- **Learning item**: a reusable expression stored for review, including original text, suggested text, scene, pattern, tags, IPA, and review schedule state.
- **Review pack**: the daily or due set of learning items prepared for retrieval practice.
- **Channel runtime**: the shared flow for external chat channels: normalize message, process `/new`, run prompt assessment, apply the channel reply mode, continue the local agent session, and send a reply.
- **Channel adapter**: a Feishu or WeChat implementation that connects to the provider, normalizes inbound events, and sends outbound text through provider-specific mechanics.
- **External agent session**: the persisted mapping from a channel conversation scope to a Claude session id or Codex thread id.
- **Voice transcript**: text derived from an inbound voice message before it enters the same language gate and agent-session flow as text messages.
- **MCP tool surface**: the set of tools exposed to AI agents for analysis, rewrite, coaching context, review, config, diagnostics, integrations, and voice.
- **Smoke eval**: a deterministic local eval that runs in a temporary EnglishPilot home and verifies the gate, force-mode coaching, channel coaching injection, and agent dry-run command construction.
- **Eval case catalog**: the source of truth for reusable eval prompts, case ids, awkward input examples, expected coaching notes, and backend-specific prompt fixtures used by smoke evals and AI-backed agent evals.

## Architectural Intent

- The language gate should stay deterministic and local. It may use configured local rewrite help, but blocking cannot depend on a remote model.
- Hooks enforce input blocking. Final-response teaching notes rely on host guidance and MCP because command hooks cannot directly rewrite the assistant's completed message.
- External channels use long connections and local agent execution. The daemon owns lifecycle, reply policy, session continuity, and outbound delivery.
- Channel coaching uses the same prompt-assessment pipeline as hooks and CLI. The channel-specific part is delivery control: `silent`, `violation`, or `always`, channel tags, review-item recording, and an optional `<english_pilot_coaching>` instruction in the same Claude/Codex turn.
- MCP is the primary agent-facing interface. CLI commands remain for humans, hooks, daemon/service control, and scripts.
- Channel behavior should concentrate in the channel runtime. Feishu and WeChat should remain adapters at that seam.
- Review and coaching artifacts are local-first and stored under the EnglishPilot home directory.
- Smoke evals must avoid real channel credentials, network calls, and real Claude/Codex execution unless an explicit future opt-in mode is added.
- Eval cases should live behind the eval case catalog so deterministic smoke evals and AI-backed agent evals share fixtures without depending on each other's runners.
