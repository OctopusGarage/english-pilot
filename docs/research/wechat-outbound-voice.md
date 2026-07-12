# WeChat outbound native voice messages

Date: 2026-07-12

## Question

Does the public WeChat/iLink/OpenClaw bot channel support outbound native WeChat
voice bubbles via `sendmessage` with `type: 3` / `voice_item`?

## Short Answer

No public source found confirms that normal WeChat/iLink/OpenClaw bot accounts
can reliably send outbound native voice bubbles. Public protocol shapes expose
voice item types, but the current official Tencent OpenClaw Weixin plugin does
not ship a high-level outbound voice path; its media router sends `audio/*` as a
generic file attachment.

## Public Evidence

- OpenClaw's channel overview says text is supported everywhere, while media and
  reactions vary by channel. The WeChat page says the WeChat integration is an
  external `@tencent-weixin/openclaw-weixin` plugin maintained by the Tencent
  Weixin team, and that direct chats and media are supported, but it does not
  specifically claim outbound native voice-bubble support.
  Sources: [OpenClaw channels](https://docs.openclaw.ai/channels),
  [OpenClaw WeChat docs](https://docs.openclaw.ai/channels/wechat).

- The official Tencent package source exposes protocol constants for voice:
  `UploadMediaType.VOICE = 4`, `MessageItemType.VOICE = 3`, and `VoiceItem`
  fields such as `media`, `encode_type`, `sample_rate`, `bits_per_sample`,
  `playtime`, and `text`.
  Source: [`src/api/types.ts`](https://github.com/Tencent/openclaw-weixin/blob/main/src/api/types.ts#L24-L127).

- The official README's backend protocol section also lists `MessageItem`
  `type: 3` as `VOICE`, describes `voice_item` as SILK encoded, and says media
  types are transferred via CDN with AES-128-ECB encryption. This documents the
  protocol shape and upload flow, not a verified client-visible outbound voice
  bubble.
  Source: [`README.md`](https://github.com/Tencent/openclaw-weixin/blob/main/README.md#message-structure).

- The shipped media-send path in `@tencent-weixin/openclaw-weixin@2.4.6` routes
  `video/*` to video upload/send, `image/*` to image upload/send, and every
  other MIME type to file upload/send. That means common audio MIME types fall
  through to file attachment behavior in the official high-level media API.
  Source: [`src/messaging/send-media.ts`](https://github.com/Tencent/openclaw-weixin/blob/main/src/messaging/send-media.ts#L8-L71).

- The official upload helpers in `@tencent-weixin/openclaw-weixin@2.4.6` expose
  image, video, and file attachment upload helpers. No public
  `uploadVoiceToWeixin()` helper is present in that file.
  Source: [`src/cdn/upload.ts`](https://github.com/Tencent/openclaw-weixin/blob/main/src/cdn/upload.ts#L124-L168).

- The official send helpers expose text, image, video, generic item, and file
  attachment sending. The file send helper constructs a `MessageItemType.FILE`
  payload; no public `sendVoiceMessageWeixin()` helper is present in the file.
  Source: [`src/messaging/send.ts`](https://github.com/Tencent/openclaw-weixin/blob/main/src/messaging/send.ts#L22-L293).

- The official package does implement inbound/download handling for voice media:
  when an incoming item is `MessageItemType.VOICE`, it downloads/decrypts the
  media and attempts SILK-to-WAV transcoding. This supports the distinction that
  inbound voice handling exists even though outbound native voice sending is not
  exposed as a high-level SDK path.
  Source: [`src/media/media-download.ts`](https://github.com/Tencent/openclaw-weixin/blob/main/src/media/media-download.ts#L71-L99).

- Public issue reports in the Tencent plugin repo describe attempts to send
  outbound `VOICE` items. One report says API calls could be accepted but the
  WeChat client did not show a native voice bubble across MP3, Ogg/Opus, and
  SILK tests, and asks the Tencent team to confirm whether normal bot accounts
  support outbound native voice. Another report describes SILK and MP3 attempts
  returning API success while no message arrived in the WeChat client. Both
  issues are public reports, not official confirmation.
  Sources:
  [Tencent/openclaw-weixin#215](https://github.com/Tencent/openclaw-weixin/issues/215),
  [Tencent/openclaw-weixin#91](https://github.com/Tencent/openclaw-weixin/issues/91).

- A public protocol reference for another iLink SDK also documents
  `media_type=4` for voice upload and `MessageItem.type=3` / `voice_item`, but
  it likewise documents the protocol fields rather than proving that outbound
  native voice bubbles render for normal bot accounts.
  Source: [epiral/weixin-bot `PROTOCOL.md`](https://github.com/epiral/weixin-bot/blob/main/PROTOCOL.md#message-types).

## EnglishPilot Probe

On 2026-07-12, EnglishPilot ran a live probe against a QR-login iLink bot
account without recording secrets, account IDs, recipient IDs, or local media
paths in this note:

- A `voice_item` payload without uploaded media was rejected by
  `ilink/bot/sendmessage` with `{"ret":-2}`.
- Short MP3 and AMR-NB clips were uploaded through the public iLink media flow:
  `getuploadurl` returned an upload URL, CDN upload returned HTTP 200, and the
  CDN response included `x-encrypted-param`.
- Sending those uploaded media references as `type: 3` / `voice_item` still
  returned `{"ret":-2}` from `ilink/bot/sendmessage`, including several
  `aes_key` / `encrypt_type` variants.

This probe confirms the distinction that matters for EnglishPilot: media upload
can succeed while native voice-message delivery is still rejected by
`sendmessage`.

## Confidence

Confidence is high that outbound native voice bubbles are not publicly supported
by the current official high-level OpenClaw Weixin SDK path. Confidence is
moderate that normal iLink/OpenClaw bot accounts cannot rely on manual
`sendmessage` `voice_item` payloads today, because public test reports show
accepted or attempted requests that do not render as native voice bubbles and
EnglishPilot's live probe observed `{"ret":-2}` from `sendmessage` after
successful CDN upload.

This is not proof that Tencent has no private/internal permission, undocumented
field combination, or future backend rollout that enables the feature. Re-check
the current `@tencent-weixin/openclaw-weixin` source, official docs, and the
Tencent issue tracker before revisiting this conclusion.

## Practical Guidance

Treat outbound native WeChat voice bubbles as unavailable for EnglishPilot until
one of these becomes true:

- Tencent/OpenClaw documents outbound native voice support for normal bot
  accounts.
- The official plugin ships a `sendVoiceMessageWeixin`-style path and routes
  `audio/*` through it.
- A fresh end-to-end test confirms that `sendmessage` with `type: 3` /
  `voice_item` renders as a playable native WeChat voice bubble in the client.

Sending audio as a normal file attachment is a separate capability and should
not be described as WeChat native voice-message support.
