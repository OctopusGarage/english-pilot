# Install

Recommended install or update:

```bash
curl -fsSL https://raw.githubusercontent.com/OctopusGarage/english-pilot/main/install.sh | bash
```

Pin a release:

```bash
curl -fsSL https://raw.githubusercontent.com/OctopusGarage/english-pilot/main/install.sh |
  ENGLISH_PILOT_VERSION=vX.Y.Z bash
```

Install from npm after the npm package is published:

```bash
npm install -g @octopusgarage/english-pilot
english-pilot setup --yes
```

Then connect channels or agent hooks:

```bash
english-pilot install codex --yes
english-pilot install claude --yes
english-pilot wechat setup
english-pilot service install
```

Runtime state lives under `~/.english-pilot`. The release installer puts the app under `~/.english-pilot/app` and creates `~/.local/bin/english-pilot`.

Voice transcription is optional. For Feishu/Lark audio messages, configure `WHISPER_COMMAND` in `~/.english-pilot/.env`; Apple Silicon Macs should use `mlx-whisper`, while Intel Macs should start with `whisper.cpp`. See [docs/voice-stt-install.md](docs/voice-stt-install.md).
