# Host infrastructure

What runs under the Factory Server on this Mac: the Docker engine (Colima) and Postgres, the
Cloudflare Tunnel, the LaunchAgents that keep it all running, and the scripts that deploy and roll
it back ("Scripts" below). The runner that calls those scripts is in `actions-runner/README.md`. The reasons behind the
setup are in `docs/self-hosting-research.md` §7 and `docs/ci-deploy-research.md`.

## Keys this subject owns

`src/mastra/config/env.ts` (`envSpecs`) is the list of keys. This file owns what these values must
contain; `README.md` owns the `POSTGRES_*` values, `apps/slack/README.md` owns
`MASTRACODE_CHANNELS_PUBLIC_URL`.

| Key | What the value must contain | Full record |
|---|---|---|
| `DOCKER_HOST` | a `unix://` URL naming the running Colima VM's socket | the `DOCKER_HOST` section below |
| `MASTRA_HOST` | the dotted loopback address the listener binds to | the `MASTRA_HOST` section below |
| `PORT` | the pinned port the server listens on | the `PORT` section below |
| `MASTRACODE_PUBLIC_URL` | the origin the browser reaches this deployment at | the `MASTRACODE_PUBLIC_URL` section below |
| `NODE_ENV` | the runtime mode this process runs as | the `NODE_ENV` section below |

Not .env keys: `PATH`.

`PATH` is set in the plists and in `ops/factory-start.sh`, never in `.env`. (The line above is read
by a check: keep it at column 0, starting `Not .env keys:`.)

## `DOCKER_HOST`

`unix://<absolute home>/.colima/default/docker.sock`. In a shell write `unix://$HOME/...`; in a plist
or in `.env` write the full path (`unix:///Users/koval/.colima/default/docker.sock`) — neither
expands `$HOME`. Nothing issues it: `colima start` creates the socket.

```bash
test -S "$HOME/.colima/default/docker.sock" && echo present
```

## `MASTRA_HOST`

The literal `127.0.0.1`. `localhost` may bind `::1`, and the tunnel then answers `502`; unset binds
every interface, LAN included, with no warning. Ingress checkpoint 1 shows what was bound.

## `PORT`

`4111`, pinned. It must match `MASTRACODE_PUBLIC_URL` (loopback form) and the tunnel target. Unset,
`npm run dev` moves to 4112 when 4111 is busy and nothing points there.

## `MASTRACODE_PUBLIC_URL`

With the tunnel: exactly `https://factory.kovalchuk.win` (no port, path or trailing slash). Before
the tunnel: `http://127.0.0.1:4111`. It is the only origin sign-in trusts and the base of every
provider callback URL — change it only together with the tunnel hostname and the callback URLs in
`apps/*/README.md`.

## `NODE_ENV`

`production`, set in `ops/launchagents/ai.mastra.factory.plist`. Keep it out of `.env`:
`development` or `test` there silently moves all data to a local libSQL file.

## Before you start

- Homebrew on the PATH (`/opt/homebrew/bin`).
- `.env` at the repo root with `POSTGRES_PASSWORD` set (`README.md`, step 1).

## Bring-up

```bash
# 1 — engine + tools
brew install colima docker docker-compose gh jq
#     if `docker compose` is not found:
#     mkdir -p ~/.docker/cli-plugins && \
#       ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"

# 2 — Postgres
npm run db:up
```

## Checkpoints

### 1 — the engine answers

```bash
docker info >/dev/null && echo ok            # not ok: colima status
```

### 2 — the container is healthy

```bash
docker inspect --format '{{.State.Health.Status}}' mastracode-web-db    # healthy
```

Not healthy: `docker compose ps` and `docker compose logs app-db`. `health: starting` after
`db:up` timed out — run `npm run db:up` again. `Restarting` — the logs name the bad
`POSTGRES_*` value; `npm run db:down`, fix `.env`, retry.

### 3 — the host can reach it on loopback

```bash
nc -z 127.0.0.1 54329 && echo reachable
```

### 4 — the database exists

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c '\conninfo'
```

## Teardown

```bash
npm run db:down        # the data volume survives
colima stop
```

`docker-compose.yml` pins `name: mastra-factory`: every checkout and worktree addresses the same
stack. **`docker compose down -v` from anywhere deletes the only copy of the database.**

## Ingress — Cloudflare Tunnel

`cloudflared` dials out to Cloudflare; requests come back to `127.0.0.1:4111`. No inbound port, no
router change. Preconditions: registration is closed (`README.md` step 3 probe gives `400`), and
the `kovalchuk.win` zone is Active with auto-renew on.

### Bringing the tunnel up

```bash
brew install cloudflared
 sudo cloudflared service install <TOKEN>     # leading space: keep the token out of history
```

`<TOKEN>`: Cloudflare Zero Trust > Networks > Tunnels > create tunnel. Then add a public hostname:
subdomain `factory`, domain `kovalchuk.win`, type **HTTP**, URL `127.0.0.1:4111`.

In `.env`, then restart the server:

```dotenv
MASTRA_HOST=127.0.0.1
PORT=4111
MASTRACODE_PUBLIC_URL=https://factory.kovalchuk.win
MASTRACODE_CHANNELS_PUBLIC_URL=https://factory.kovalchuk.win
```

Serve the production server behind the tunnel (the LaunchAgent), never `npm run dev` — it restarts
on every save and publishes Studio.

## Ingress checkpoints

### 1 — the socket is still bound to loopback

```bash
lsof -nP -iTCP:4111 -sTCP:LISTEN             # 127.0.0.1:4111 only; *:4111 or [::1]:4111 = fix MASTRA_HOST
```

### 2 — nothing of this deployment listens off loopback

```bash
sudo lsof -nP -iTCP -sTCP:LISTEN | grep -vE '127\.0\.0\.1|\[::1\]'   # no node, cloudflared, 4111 or 54329
```

### 3 — cloudflared is outbound-only, on 7844

```bash
sudo lsof -nP -i -a -c cloudflared           # outbound to port 7844; no LISTEN on a non-loopback address
```

No output: the daemon is not running (`sudo launchctl list | grep cloudflared`).

### 4 — HTTPS sign-in answers through the tunnel

```bash
dig +short factory.kovalchuk.win                                               # Cloudflare addresses
curl -sS -o /dev/null -w '%{http_code}\n' https://factory.kovalchuk.win/signin # 200
curl -s -w '\n%{http_code}\n' -X POST https://factory.kovalchuk.win/auth/api/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'   # 400 EMAIL_PASSWORD_SIGN_UP_DISABLED
```

`502`: nothing on `127.0.0.1:4111` (ingress checkpoint 1). `530` or `1033`: the tunnel is not
connected (ingress checkpoint 3). `200` on the sign-up probe: registration is open in public — do
the ingress teardown first.

### The window between boot and login

`cloudflared` starts at boot; the server starts only after login (it needs Colima's login session).
Until then the hostname answers `502`. That is expected.

## Ingress teardown

```bash
sudo cloudflared service uninstall
```

Then delete the `factory` public hostname and its DNS record in Cloudflare, set
`MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111`, remove `MASTRACODE_CHANNELS_PUBLIC_URL`, and restart.

## Scripts

Zsh, run from the repo root as the deployment user (never with `sudo`). Wrong arguments print
`usage:`. Releases live in `releases/<UTC-timestamp>-<sha7>/` (`output/`, `release.json`,
`db.dump`); `releases/current` is what runs, `releases/previous` the one before, and
`releases/deploy.log` is the history.

| Script | What it does | Who runs it | Commands |
| --- | --- | --- | --- |
| `deploy.sh` | Activates a stored release: waits until Factory is idle (no running or parked session; automation paused; up to 6 h, never forces), dumps the database into the release, switches `current`, restarts the server, checks `/health` for 60 s and switches back on failure, keeps the newest 5 releases (plus pinned). Does nothing while `HOLD` is set. | CI after every build of `main`; you, to go forward after a rollback or to activate a held release | `ops/deploy.sh --list` · `ops/deploy.sh <id>` · `ops/deploy.sh --pin <id>` / `--unpin <id>` |
| `rollback.sh` | Activates an older release the same way, without a build or a new dump. `--with-db` also restores the database from just before the current release (back to `previous` only); newer data is lost, so it asks you to type the id. | You | `ops/rollback.sh` (to previous) · `ops/rollback.sh <id>` · `ops/rollback.sh --with-db` |
| `local-mode.sh` | `on`: sets `HOLD` (CI still builds, but does not deploy), waits for idle work, stops the service. `off`: starts `releases/current`, checks health, clears `HOLD`. `status`: shows `HOLD`, the agent, the current release and what holds port 4111. | You, around a local `npm run build && npm run start` or `npm run dev` | `ops/local-mode.sh on` · `off` · `status` |
| `release-store.sh` | Copies a finished build (`.mastra/output`) into a new release folder as an APFS clone and writes `release.json`. Refuses a build without the Factory UI or `factory-skills/`. | CI, in its checkout after `npm run build`; not for daily use | `ops/release-store.sh <commit sha>` |
| `install.sh` | Creates `~/Library/Logs/mastra-factory/`, links the Colima, Factory and runner plists into `~/Library/LaunchAgents`, copies the log-rotation conf to `/etc/newsyslog.d/`. Starts nothing; safe to re-run. Refuses another checkout or an unregistered runner. | You, once at set-up, and after changing the newsyslog conf (asks for `sudo` itself) | `ops/install.sh` |
| `factory-start.sh` | Waits up to 10 min for the Docker engine, then starts `npm run start:release` (`releases/current`), or `npm run start` before the first release. Pins Node in `NODE_BIN`. | launchd (`ai.mastra.factory.plist`); never by hand | — (`grep '^\[factory\]' ~/Library/Logs/mastra-factory/out.log` shows what it started) |
| `release-lib.sh` | Shared code of the four release scripts: paths and limits at its top, Factory sign-in, idle check, `pg_dump`, link switch, health check, pruning. | Sourced by the scripts above; never run | `zsh -c 'source ops/release-lib.sh; factory_sign_in && echo token-ok'` (checks the deploy login) |

The release scripts need `FACTORY_DEPLOY_EMAIL` and `FACTORY_DEPLOY_PASSWORD` in `.env` (an account
that administers the Factory organization; `chmod 600 .env`), plus `jq`, `curl` and a running
Docker engine. A deploy never removes sandbox containers. After changing `NODE_BIN`, re-run
`actions-runner/register.sh` and restart both agents.

Before any activation (deploy or rollback), with `FACTORY_SANDBOX_PROVIDER=docker`, every sandbox
image that the release's `output/sandbox-catalog.json` names must exist on the engine, or the
activation stops and names the tag (`sandbox/README.md`, "The image check at deploy").

## Supervision — LaunchAgents

| File | Job |
| --- | --- |
| `launchagents/ai.mastra.colima.plist` | `colima start … --foreground` — the Docker engine |
| `launchagents/ai.mastra.factory.plist` | `caffeinate` + `factory-start.sh` — the server, `NODE_ENV=production` |
| `../actions-runner/ai.mastra.runner.plist` | the GitHub Actions runner (`actions-runner/README.md`) |
| `factory-start.sh` | The start wrapper ("Scripts" above) |
| `newsyslog/ai.mastra.factory.conf` | Rotates the six logs in `~/Library/Logs/mastra-factory/` (7 × 10 MB, bzip2) |
| `install.sh` | Places all of the above ("Scripts" above) |

They are agents, not daemons: Colima needs a login session, so everything starts at login and a
logout stops it. All plist paths are written out in full and baked to
`/Users/koval/dev/test/mastra-factory`; `install.sh` refuses any other checkout or `$HOME`.

### Bringing the agents up

Before: stop any Colima or server you started by hand (`colima stop`, Ctrl-C), make sure a build
exists (`npm run build`, until the first release), and register the runner
(`actions-runner/register.sh` — `install.sh` refuses without it).

```bash
ops/install.sh                                                                   # run as zsh, from the repo root
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.factory.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.runner.plist
launchctl kickstart gui/$(id -u)/ai.mastra.factory                               # bootstrap does not always start it
sudo pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0                    # stay awake on AC
sudo defaults write /Library/Preferences/.GlobalPreferences MultipleSessionEnabled -bool false
```

Re-run `ops/install.sh` after changing the newsyslog conf (it is copied, not linked). A changed
plist needs `bootout` and `bootstrap` of that agent.

Way back: `launchctl bootout gui/$(id -u)/ai.mastra.factory` (then `…runner`, `…colima`). To stop
it for good, also remove the links in `~/Library/LaunchAgents/` and
`/etc/newsyslog.d/ai.mastra.factory.conf`.

## Supervision checkpoints

```bash
# 1 — three agents, each with a pid and 0
launchctl list | grep ai.mastra
# 2 — Colima owns the VM
DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" docker info >/dev/null && echo ok
# 3 — the server serves, on loopback, from the release
lsof -nP -iTCP:4111 -sTCP:LISTEN
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4111/health      # 200
grep -F '[factory] starting release' ~/Library/Logs/mastra-factory/out.log | tail -n 1
# 4 — rotation is in force
ls -l /etc/newsyslog.d/ai.mastra.factory.conf && sudo newsyslog -nvv | grep mastra-factory
# 5 — the host stays awake
pmset -g custom; pmset -g | grep SleepDisabled                             # sleep 0, SleepDisabled 1
# 6 — one session only
defaults read /Library/Preferences/.GlobalPreferences MultipleSessionEnabled   # 0
```

Reading failures:

- `-` and `78` in `launchctl list`: launchd refused the plist. A pid that changes each time: a
  crash loop — read `err.log` (server), `runner.err.log` or `colima.err.log`.
- `err.log` repeats `Output directory … does not exist`: no build and no release.
- `[factory] docker not ready after 600s`: Colima is not up — checkpoint 2.
- `-` and `0` with `runs = 0` in `launchctl print gui/$(id -u)/<label>`: registered, never started —
  `launchctl kickstart gui/$(id -u)/<label>`.
- `out.log` at zero bytes while the server serves: rotation renamed the file under launchd's open
  handle — `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`.

## Recovery limits

- **A killed server** comes back by itself (`KeepAlive`, 30 s throttle). Test:
  `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`, then the pid changes and `/health` is 200.
- **A logout/login** brings all agents back after Colima starts (several minutes of `502`).
- **An unplanned reboot needs a person at the keyboard**: FileVault locks the disk until someone
  logs in. No remote recovery, no auto-login.
- **A planned restart:** `fdesetup supportsauthrestart` (expect `true`), then
  `sudo fdesetup authrestart` — it unlocks the disk once; log in to start the agents.
- **A kernel panic or hardware fault** is an accepted risk. The battery covers short power cuts.
