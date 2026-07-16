---
description: Deploy the current EnglishPilot checkout to mac2015
argument-hint: '[status|deploy]'
allowed-tools: Bash, Read
---

Deploy or inspect EnglishPilot on `ys-aquria@mac2015.local`.

Argument: `$ARGUMENTS`

- Empty argument runs the read-only `status` mode.
- `deploy` builds and packs the current local checkout, copies the npm tarball
  to mac2015, installs it globally for `ys-aquria`, and restarts EnglishPilot.
- Runtime state under `~/.english-pilot` is preserved.

Run:

```bash
scripts/deploy-mac2015.sh status
scripts/deploy-mac2015.sh deploy
```

Use `ENGLISH_PILOT_REMOTE` and `SSH_OPTS` when the SSH target or identity needs
an override.

Report the remote host/user, local and installed versions, stopped and verified
PIDs, deployment mode, runtime status, WeChat doctor, and voice preflight. When
detached fallback is used, include its log path and lifecycle warning. Never
print `.env`, channel credentials, or raw configuration files.
