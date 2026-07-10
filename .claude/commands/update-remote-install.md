---
description: Update a remote EnglishPilot npm installation over SSH
argument-hint: '<user@host> [version]'
allowed-tools: Bash, Read
---

Update an already-installed remote EnglishPilot service. Use this for machines
like `ys-aquria@mac2015.local` where EnglishPilot is installed globally through
npm and runs as a managed launchd/systemd service.

Reference: `docs/manual.md` and `scripts/update-remote-install.sh`.

Argument: `$ARGUMENTS`

Defaults:

- If `$ARGUMENTS` is empty, use `ys-aquria@mac2015.local latest`.
- If only a host is provided, use that host and `latest`.
- If a version is provided, pass it through exactly, for example `0.1.1`.

Do this:

1. Run:

   ```bash
   scripts/update-remote-install.sh <user@host> <version>
   ```

   When the target requires a specific SSH identity, set `SSH_OPTS`, for example:

   ```bash
   SSH_OPTS="-o BatchMode=yes -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o IdentityAgent=none -o IdentitiesOnly=yes -i $HOME/.ssh/id_rsa -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa" \
     scripts/update-remote-install.sh ys-aquria@mac2015.local latest
   ```

2. Report:

   - remote host and user;
   - package version before and after;
   - service restart/status result;
   - daemon process pid;
   - WeChat doctor result;
   - voice preflight result.

3. If SSH fails:

   - verify the exact remote username;
   - test `ssh <user@host> whoami`;
   - avoid installing under a different user just because that user can SSH in.

4. If package install succeeds but the old daemon keeps running:

   - check `~/.english-pilot/logs/launchd.err.log` for `already running with pid`;
   - use the fixed service restart behavior when available;
   - otherwise manually terminate the old EnglishPilot daemon pid and let the
     service manager restart it.

5. Keep the final report concise. Do not print secrets from `.env` or channel
   account files.
