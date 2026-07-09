# EnglishPilot Context

EnglishPilot helps a learner keep normal AI and chat workflows English-dominant. It does this without turning every work message into a separate English lesson.

## Domain Language

- **Language gate**: the policy check that decides whether a user prompt or channel message is blocked, allowed silently, or allowed with coaching.
- **Prompt assessment**: the full local decision around a message: sanitize narrative text, calculate non-English ratio, detect teachable signals, choose rewrite/coaching behavior, and optionally record learning evidence.
- **Coaching note**: a compact teaching addendum with a better expression, a practical rule, and optional IPA. It must not interrupt the main task.
- **Force mode**: the high-intensity learning profile. It keeps the language gate strict and asks agents to add coaching notes for short Chinese fragments, awkward English, or clear everyday improvements.
- **Learning item**: a reusable expression stored for review, including original text, suggested text, scene, pattern, tags, IPA, and review schedule state.
- **Review pack**: the daily or due set of learning items prepared for retrieval practice.
- **Channel runtime**: the shared flow for external chat channels: normalize message, process `/new`, run the language gate, continue the local agent session, and send a reply.
- **Channel adapter**: a Feishu or WeChat implementation that connects to the provider, normalizes inbound events, and sends outbound text through provider-specific mechanics.
- **External agent session**: the persisted mapping from a channel conversation scope to a Claude session id or Codex thread id.
- **Voice transcript**: text derived from an inbound voice message before it enters the same language gate and agent-session flow as text messages.
- **MCP tool surface**: the set of tools exposed to AI agents for analysis, rewrite, coaching context, review, config, diagnostics, integrations, and voice.

## Architectural Intent

- The language gate should stay deterministic and local. It may use configured local rewrite help, but blocking cannot depend on a remote model.
- Hooks enforce input blocking. Final-response teaching notes rely on host guidance and MCP because command hooks cannot directly rewrite the assistant's completed message.
- External channels use long connections and local agent execution. They should feel like normal chat entry points, not separate webhook-era integrations.
- MCP is the primary agent-facing interface. CLI commands remain for humans, hooks, daemon/service control, and scripts.
- Channel behavior should concentrate in the channel runtime. Feishu and WeChat should remain adapters at that seam.
- Review and coaching artifacts are local-first and stored under the EnglishPilot home directory.
