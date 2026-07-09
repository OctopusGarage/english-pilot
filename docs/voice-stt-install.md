# Voice STT Install

EnglishPilot does not bundle a speech-to-text model. It calls a local command through this stable contract:

```bash
$WHISPER_COMMAND <audio-path>
```

The command must be executable, accept the audio path as its first argument, and print either plain transcript text or JSON containing `transcript` / `text` / `segments[].text` to stdout.

## Channel Behavior

- Feishu/Lark voice messages are downloaded, transcribed with `WHISPER_COMMAND`, then routed through the same language gate and Claude/Codex agent flow as text.
- WeChat voice messages are treated as voice input when the long-connection event already contains `voice_item.text`. Raw WeChat audio download plus local Whisper transcription is not implemented yet.

## Recommendation

| Host                              | Recommended STT           | Why                                                                                        |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Apple Silicon Mac, M1/M2/M3/M4/M5 | `mlx-whisper`             | Best fit for Apple Silicon; this is the same direction used by `tmux-claude-bot`.          |
| Intel Mac                         | `whisper.cpp`             | Simple Homebrew install, works without Apple MLX, and avoids heavier Python runtime setup. |
| Intel Mac, advanced               | `faster-whisper` CPU int8 | Better Python integration, but heavier setup than `whisper.cpp`.                           |

`tmux-claude-bot` uses `mlx-whisper==0.4.3`, a project-managed `.venv`, `ffmpeg`, language selection, and an end-to-end smoke test. EnglishPilot currently keeps the runtime interface more generic with `WHISPER_COMMAND`, so the wrapper below is the integration point.

## Apple Silicon: mlx-whisper

Install dependencies:

```bash
brew install ffmpeg
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Create the local STT environment:

```bash
mkdir -p ~/.english-pilot/stt
uv venv ~/.english-pilot/stt/mlx
uv pip install --python ~/.english-pilot/stt/mlx/bin/python mlx-whisper==0.4.3
```

Create the wrapper:

```bash
mkdir -p ~/.english-pilot/bin
cat > ~/.english-pilot/bin/stt-mlx-whisper <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

AUDIO="$1"
OUTDIR="$(mktemp -d "${TMPDIR:-/tmp}/english-pilot-stt.XXXXXX")"
trap 'rm -rf "$OUTDIR"' EXIT

MODEL="${WHISPER_MODEL:-mlx-community/whisper-large-v3-turbo}"
LANG="${WHISPER_LANGUAGE:-zh}"

"$HOME/.english-pilot/stt/mlx/bin/mlx_whisper" "$AUDIO" \
  --model "$MODEL" \
  --language "$LANG" \
  --output-format txt \
  --output-dir "$OUTDIR" >/dev/null

TXT="$(find "$OUTDIR" -name '*.txt' -print -quit)"
if [ -z "$TXT" ]; then
  echo "mlx-whisper produced no transcript" >&2
  exit 1
fi
cat "$TXT"
EOF

chmod +x ~/.english-pilot/bin/stt-mlx-whisper
```

Configure the daemon environment:

```bash
{
  printf 'WHISPER_COMMAND=%s\n' "$HOME/.english-pilot/bin/stt-mlx-whisper"
  printf 'WHISPER_LANGUAGE=zh\n'
  printf 'WHISPER_MODEL=mlx-community/whisper-large-v3-turbo\n'
} >> ~/.english-pilot/.env
```

Use `WHISPER_LANGUAGE=en` for English-only practice, `zh` for Mandarin, or `auto` when mixed-language detection is more important than predictable Chinese recognition.

## Intel Mac: whisper.cpp

Install dependencies:

```bash
brew install whisper-cpp ffmpeg
```

Download a model. Start with `small`; use `base` for speed or `medium` for better accuracy:

```bash
mkdir -p ~/.english-pilot/models
curl -L -o ~/.english-pilot/models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

Create the wrapper:

```bash
mkdir -p ~/.english-pilot/bin
cat > ~/.english-pilot/bin/stt-whisper-cpp <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

AUDIO="$1"
MODEL="${WHISPER_MODEL:-$HOME/.english-pilot/models/ggml-small.bin}"
LANG="${WHISPER_LANGUAGE:-zh}"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/english-pilot-stt.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

WHISPER_BIN="$(command -v whisper-cpp || command -v whisper-cli || true)"
if [ -z "$WHISPER_BIN" ]; then
  echo "whisper.cpp binary not found. Try: brew install whisper-cpp" >&2
  exit 1
fi

WAV="$WORKDIR/input.wav"
OUT="$WORKDIR/out"

ffmpeg -y -i "$AUDIO" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV" >/dev/null 2>&1

"$WHISPER_BIN" -m "$MODEL" -f "$WAV" \
  --language "$LANG" \
  --output-txt \
  --output-file "$OUT" >/dev/null 2>&1

cat "$OUT.txt"
EOF

chmod +x ~/.english-pilot/bin/stt-whisper-cpp
```

Configure the daemon environment:

```bash
{
  printf 'WHISPER_COMMAND=%s\n' "$HOME/.english-pilot/bin/stt-whisper-cpp"
  printf 'WHISPER_LANGUAGE=zh\n'
} >> ~/.english-pilot/.env
```

## Verify

Run preflight:

```bash
set -a
. ~/.english-pilot/.env
set +a
english-pilot voice preflight --provider local-whisper --json
```

Transcribe a sample file:

```bash
english-pilot voice transcribe --provider local-whisper --audio ./sample.wav --json
```

Restart the daemon so launchd/systemd reloads `~/.english-pilot/.env`:

```bash
english-pilot service restart
english-pilot daemon status --json
```

Check logs if a channel appears silent:

```bash
english-pilot service logs
english-pilot doctor --json
```

## Future Installer Shape

The intended packaged experience is:

```bash
english-pilot voice install
```

That command should detect the host, install `mlx-whisper` on Apple Silicon or `whisper.cpp` on Intel Mac, create the wrapper, write `~/.english-pilot/.env`, run a smoke test, and print the restart command. Until that command exists, use the manual steps above.
