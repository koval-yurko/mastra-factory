# Mastra Factory — Self-Hosted 24/7 Server

**Date:** 2026-09-22 · **Revision:** v6
**Host:** this machine (Apple M4 Max, 16 cores, 48 GiB, macOS 26.6.1)
**Project:** `/Users/koval/dev/test/mastra-factory` (scaffolded from `npm create factory`)
**Public origin:** `https://factory.kovalchuk.win` → `http://127.0.0.1:4111`

**Target:** one build, no phases — Better Auth + own GitHub App + own Linear app + own Slack app, 24/7 on this
machine, **zero dependency on Mastra's infrastructure**. Nothing installed yet except `cloudflared`; no `.env`
written. Ready to execute §8.

> Facts marked **[verified]** were read out of the shipped packages (`@mastra/factory@0.15.0`,
> `@mastra/auth-better-auth@1.1.5`, `@mastra/docker@0.8.0`, `@mastra/core`/`server`/`deployer@1.67.0`,
> `@mastra/pg@1.25.0`, `@mastra/code-sdk@1.7.2`, `varlock@1.20.0`), not the docs. The published documentation
> is thin and contradicts itself; trust the packages and this repo's `.env.schema` / `src/mastra/index.ts`.

---

## 0. Decisions

| Decision | Notes |
|---|---|
| **Colima `--vm-type vz`** | Apple's Virtualization.framework + a Docker socket. Apple's own `container` speaks XPC, not the Docker API — `dockerode` can't connect, and `@mastra/apple-container` has no `SandboxProcessManager` |
| **`@mastra/docker` sandboxes**, 10 GiB / 4 cores, max 3 | needs an `index.ts` edit + a custom image (§2) |
| **Postgres 18 + pgvector** in a container | mandatory — `index.ts:233` throws without `DATABASE_URL` outside dev/test. Also holds the Better Auth tables |
| **Better Auth**, deferred-instance mode | the only fully self-hosted provider that supplies the orgs GitHub/Linear require (§3) |
| **Cloudflare Tunnel** → `https://factory.kovalchuk.win` | §4 |
| **LaunchAgents**, no auto-login, FileVault on | §7 |
| **Own GitHub / Linear / Slack apps** | §5, §6 |
| **Node v24.19.0** | satisfies every `engines` field — installed ✅ |
| **Single process, no Redis** | workers are in-process async loops **[verified]**; `REDIS_URL` only earns its keep with multiple replicas. Delete the `redis` service from `docker-compose.yml` |
| **No backups** | accepted risk, §9 |

| Runtime config | |
|---|---|
| `MASTRACODE_PUBLIC_URL` | `https://factory.kovalchuk.win` — source of truth for every OAuth callback **and** Better Auth's `baseURL` |
| Tunnel target | `http://127.0.0.1:4111`, plain HTTP |
| `PORT` / `MASTRA_HOST` | `4111` / `127.0.0.1` (the default binds **all** interfaces) |

**Must stay unset**, or something silently reaches back to Mastra or a cloud:
`MASTRA_SHARED_API_URL` (highest-precedence auth path — defers identity to `platform.mastra.ai` with only a
warning, `index.ts:135-140`) · `MASTRA_PLATFORM_ACCESS_TOKEN` / `_SECRET_KEY` / `MASTRA_PROJECT_ID` /
`MASTRA_ENVIRONMENT_ID` (together they switch sandboxes to Platform VMs, `index.ts:283-285`) · `E2B_API_KEY` ·
`SANDBOX_PROVIDER` · `WORKOS_*` · `MASTRA_LICENSE_KEY` (not needed — §3.1). The `DockerSandbox` branch goes
**ahead** of the platform/E2B chain, so even a stray var can't move sandboxes off this machine.

---

## 1. Architecture

```
                    ┌──────────────── this machine, 24/7 ──────────────────────┐
  Internet          │  LaunchDaemon: cloudflared ──┐                           │
  ────────┐         │                              ▼                           │
  GitHub  │webhook  │   ┌─────────────────────────────────┐  ┌──────────────┐  │
  Linear  ├─────────┼──▶│ Factory Server (one Node 24)    │─▶│ Postgres 18  │  │
  Slack   │ OAuth   │   │ mastra start · UI + API · :4111 │  │ + pgvector   │  │
  Browser │◀── TLS ─┼──▶│ in-process workers, no Redis    │  │ app + auth   │  │
  ────────┘ stream  │   └───────────────┬─────────────────┘  │ (container)  │  │
                    │                   │ dockerode          └──────────────┘  │
                    │                   ▼ → docker.sock                        │
                    │   ┌─────────────────────────────────┐                    │
                    │   │ DockerSandbox — 1 per session   │                    │
                    │   │ custom image: git + gh + tools  │                    │
                    │   │ git clone happens INSIDE here   │                    │
                    │   └─────────────────────────────────┘                    │
                    └──────────────────────────────────────────────────────────┘
                                        │
                                        ▼  Anthropic / OpenAI APIs
```

One process serves UI and API, so a single hostname covers everything and `MASTRACODE_ALLOWED_ORIGINS` stays
empty. **Repos are never cloned onto the host** — `integrations/github/sandbox.d.ts` **[verified]**: *"the repo
is cloned **inside** the session's sandbox."* So `git` and `gh` must exist in the image, not on the Mac.

---

## 2. Sandboxes — Docker

`@mastra/docker@0.8.0` (core peer `>=1.67.0` — exactly our version): one long-lived container per session,
`docker exec` for commands, label-based reconnection by session id, and a real `DockerProcessManager`
**[verified]** for setup commands and LSP sessions.

```bash
colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs
```

Colima's socket is `~/.colima/default/docker.sock`; `dockerode` reads `DOCKER_HOST`, so set it explicitly (§7)
rather than relying on a `/var/run/docker.sock` symlink.

### 2.1 The image

`node:22-slim` ships no `git` and no `gh`, and Factory has explicit `'git-missing'` / `'gh-missing'` error
codes **[verified]** — it fails at first use.

```dockerfile
# factory-sandbox.Dockerfile
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl gnupg openssh-client less \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# generic toolchain — no specific target repo yet
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-pip python3-venv ripgrep jq unzip \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /workspace
CMD ["sleep", "infinity"]
```

```bash
docker build --platform linux/arm64 -f factory-sandbox.Dockerfile -t factory-sandbox:2026-09-22 .
```

Tag by date and point `FACTORY_SANDBOX_IMAGE` at it, so a bad image is an env-var rollback. A package the
target repo needs but the image lacks shows up as a failing setup command — extend the toolchain layer and
retag.

### 2.2 The code change

Factory's sandbox slot is `(ctx: FactorySandboxContext) => MastraSandbox` **[verified]**, so any
`MastraSandbox` is accepted. Add ahead of the existing provider chain (`src/mastra/index.ts:291-314`):

```ts
import { DockerSandbox } from '@mastra/docker';

const CPU_PERIOD = 100_000;   // Docker's default CFS period (µs)

// …inside `sandbox: ctx => { … }`
if (process.env.FACTORY_SANDBOX_PROVIDER?.trim() === 'docker') {
  const memoryGiB = Number(process.env.FACTORY_SANDBOX_MEMORY_GIB) || 10;
  const cpus = Number(process.env.FACTORY_SANDBOX_CPUS) || 4;

  return new DockerSandbox({
    id: ctx.sessionId,                       // Factory requires id-keyed getOrCreate on start()
    image: process.env.FACTORY_SANDBOX_IMAGE ?? 'factory-sandbox:2026-09-22',
    workingDirectory: process.env.MASTRACODE_SANDBOX_WORKDIR ?? '/workspace',
    memory: memoryGiB * 1024 ** 3,           // hard cap — OOM-kills the container, not the host
    cpuPeriod: CPU_PERIOD,
    cpuQuota: cpus * CPU_PERIOD,             // 4 cores → 400000/100000
    pidsLimit: 4096,                         // fork-bomb guard; too low breaks `docker exec`
    timeout: 15 * 60_000,                    // default is 300_000; installs take minutes
  });
}
```

Every option name exists on `DockerSandboxOptions` **[verified]**. `workingDirectory` is the base-class option
(the package's own `workingDir` is deprecated and loses to it); `init` (tini as PID 1) defaults to true, which
`pidsLimit` depends on; `memory`/`cpuQuota` are hard ceilings, unlike the relative-weight `cpuShares`.

**`FACTORY_SANDBOX_PROVIDER=docker` does nothing until this edit exists** — the template only tests
`=== 'local'` and anything else falls through to `LocalSandbox`. The entry now diverges from upstream: keep the
diff small and commented.

### 2.3 Capacity and lifecycle

| Layer | Cores | Memory |
|---|---|---|
| macOS + Factory server | ~4 | ~12 GiB |
| Colima VM | **12** | **32 GiB** |
| └ Postgres | ~1 | ~2 GiB |
| └ 3 sandboxes | 3 × 4 | 3 × 10 GiB |

`MASTRACODE_MAX_SANDBOXES=3`. Caps are ceilings, not reservations, so mild overcommit is fine — raise the count
only alongside the VM or a lower `FACTORY_SANDBOX_MEMORY_GIB`. Past the cap Factory returns an actionable error
instead of thrashing.

Containers are long-lived and reconnected by session id, never torn down per command, and each holds a checkout
plus `node_modules` — so the 200 GiB VM disk is the real constraint over months. Prune idle containers carrying
Mastra's ownership label weekly.

---

## 3. Auth — Better Auth

`@mastra/auth-better-auth@1.1.5`, from first boot. There is no interim provider: Factory's tenant is
`(orgId, userId)` and the integrations are org-scoped — *"the org owns the GitHub App installation and
connected projects"*, and *"callers gate org-scoped GitHub features on its presence"* **[verified]**. Orgs come
from `IOrganizationsProvider`, which `SimpleAuth` and plain JWT do not implement, so neither can ever reach
GitHub connect or Linear intake. Neither is wired in this template anyway (the chain is platform → WorkOS →
nothing, `index.ts:130-143`). WorkOS would work with zero code change but is hosted SaaS identity — out of
scope here.

### 3.1 What the provider gives us **[verified in package]**

`MastraAuthBetterAuth` implements `IUserProvider, ICredentialsProvider, IOrganizationsProvider, IAuthInit,
IAuthHttpHandler` — every capability Factory composes against.

- **Deferred mode lands in our Postgres.** Factory calls `auth.init({ database: storage.authDatabase?.() })`
  (`factory.js:264`); `PgFactoryStorage.authDatabase()` returns `{ dialect: 'postgres', pool }` (`@mastra/pg`
  `index.js:23560`), handed straight to `betterAuth()`. One connection string, one set of migrations, run
  lazily behind a once-per-process latch.
- The instance it builds: `basePath:'/auth/api'`, `baseURL: ctx.publicUrl`, `emailAndPassword: { enabled:true,
  disableSignUp: !signUpEnabled }`, `plugins: [organization()]` — **don't** add the organization plugin
  yourself.
- **`ensureOrganization(userId)`** bootstraps a personal org on first login: *"≥1 membership → oldest org id;
  0 → create a personal org with an idempotent slug derived from the user id."* `isOrganizationAdmin` resolves
  `owner`/`admin`, so org-admin mutations work.
- **The SPA already has the form.** `factory/dist/auth.js:366`: *"`IAuthHttpHandler` → `ALL /auth/api/*` proxy
  to the provider's own HTTP surface — what the SPA's email/password form posts to"*; `/auth/login` just
  redirects to `/signin`. No SSO, no OAuth redirect URI to register anywhere.
- **The EE licence doesn't apply.** The gate lives in `@mastra/core/auth/ee` + `@mastra/server` and throws only
  when `server.rbac`/`fga` or Agent Builder are configured — Factory configures none. Sole artifact:
  `buildCapabilities()` returns `login: null` in production without `MASTRA_LICENSE_KEY`, so **Mastra Studio's**
  login UI comes up empty. Factory's own `/signin` is unaffected — don't mistake it for a broken deployment.

### 3.2 Wiring

Replaces the WorkOS branch in `src/mastra/index.ts`:

```ts
import { MastraAuthBetterAuth } from '@mastra/auth-better-auth';

const auth = new MastraAuthBetterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,   // the package never reads env itself
  signUpEnabled: false,                      // see below
});
```

`BETTER_AUTH_SECRET` is the only env var — **`BETTER_AUTH_URL` is not read by anything**; `baseURL` comes from
`MASTRACODE_PUBLIC_URL` **[verified]**. The package peer-depends on `hono@^4`, which isn't a direct dependency
here, so expect an unmet-peer warning; it already depends on `better-auth@^1.6.23`, so don't install a second
copy.

### 3.3 Three gotchas

⚠️ **`signUpEnabled` defaults to `true`** — on a public origin, anyone who finds the host can register. Create
your account while still on loopback (§8 step 6), then flip to `false`. The single most important setting here.

⚠️ **`ensureOrganization` is best-effort** — *"any failure is swallowed and leaves the user no-org."* A failed
bootstrap looks like "GitHub connect isn't there", not like an error. Check the org tables first.

❌ **Never `MASTRACODE_AUTH_DISABLED=1`** on a public origin: undocumented, and `index.ts:144` makes it disable
credential encryption as a side effect.

---

## 4. Ingress — Cloudflare Tunnel

```bash
sudo cloudflared service install <TOKEN>     # Zero Trust → Networks → Tunnels
# Public Hostname: factory / kovalchuk.win → HTTP → 127.0.0.1:4111
```

Confirm the `kovalchuk.win` zone is **Active** first, and keep auto-renew on — an expired domain breaks every
callback at once. `cloudflared` needs outbound **7844** only: no inbound ports, no forwarding, no static IP. It
runs as a LaunchDaemon from boot while Factory's agent starts at login, so expect harmless 502s in that window.

**The origin leg is plain HTTP on loopback.** From `@mastra/deployer` `dist/server/index.js:4710-4723`
**[verified]**: `isHttpsEnabled` requires `MASTRA_HTTPS_KEY` + `_CERT` (don't), and
`bindHost = serverOptions?.host ?? process.env.MASTRA_HOST` — unset means **all interfaces**, which is why
`MASTRA_HOST=127.0.0.1` matters. Use `127.0.0.1`, not `localhost`: once bound to IPv4 loopback, `localhost` may
resolve to `::1` and refuse connections with nothing obviously wrong.

### 4.1 URL registry

Every path below was read out of the packages **[verified]** — none of it is guesswork.

| Provider | Field | Value |
|---|---|---|
| Cloudflare | Public Hostname → URL | `127.0.0.1:4111` (type HTTP) |
| Better Auth | *(none)* | email+password; surface is `/auth/api/*`, derived from `MASTRACODE_PUBLIC_URL` |
| GitHub App | Callback URL **and** Setup URL | `https://factory.kovalchuk.win/auth/github/callback` |
| GitHub App | Webhook URL | `https://factory.kovalchuk.win/web/github/webhook` — `registerApiRoute("/web/github/webhook")`, `integrations/github/routes.js:291` |
| Linear | Redirect URL | `https://factory.kovalchuk.win/auth/linear/callback` |
| Slack | Events **and** Interactivity | `https://factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook` |
| Slack | OAuth redirect | `https://factory.kovalchuk.win/connect/slack/oidc/callback` |

The Slack path is `` `/api/agent-controllers/${controller.id}` `` + `` `/channels/${platform}/webhook` ``
(core `channels-*.js:78`, `agent-*.js:21362`), and the controller is `new AgentController({ id: 'mastra-code' })`
(`@mastra/code-sdk` `index.js:636`) — correct even though Factory registers it on Mastra under the key `code`.
Core skips platforms a provider manages itself, so confirm with one test delivery.

`MASTRACODE_PUBLIC_URL` must be the **public** URL. Pointing it at loopback silently produces OAuth callbacks
that send the browser somewhere only the server can reach.

---

## 5. Own GitHub App

Cross-referencing Mastra's own consent screen (2026-09-21) against the API calls actually present in
`@mastra/factory@0.15.0` **[verified]**:

| Permission | Used by | Grant |
|---|---|---|
| Contents | clone, commit, push (`withInstallToken`, `materializeRepo`) | **R+W** |
| Pull requests | `pulls.create/update/merge/list`, `createReview`, `submitReview`, `dismissReview`, `createReviewComment`, `createReplyForReviewComment`, `requestReviewers`, `removeRequestedReviewers` | **R+W** |
| Issues | `issues.get/listForRepo/update`, `createComment`, `updateComment`, `deleteComment`, `addLabels`, `removeLabel` | **R+W** |
| Metadata | `repos.get` | **R** (mandatory for all Apps) |
| Commit statuses | `status` webhook handled | R |
| Administration | `repos.getCollaboratorPermissionLevel` — no write calls found | R (broadest grant; tighten first) |
| Checks | CI signal on PRs | R |
| Actions, Artifact metadata | CI runs / artifacts | skip unless agents read CI or touch `.github/workflows/` |
| Dependabot alerts, Security events | advisory intake | skip |

Widen on a 403 — GitHub names the missing permission. Changing permissions later forces installations to
re-approve: a narrow start costs a consent round-trip, not a rebuild.

**Webhook events:** `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issues`,
`issue_comment`, `push` — all confirmed by explicit `event === "…"` dispatch **[verified]**. Also enable
`installation`, `status`, `label`, `repository`.

**Config:** all five of `GITHUB_APP_ID`, `_PRIVATE_KEY` (PEM, escaped `\n`), `_CLIENT_ID`, `_CLIENT_SECRET`,
`_SLUG` — or the integration stays silently inert by design. `GITHUB_APP_WEBHOOK_SECRET` must be stable
forever; it is also the primary OAuth-state signer (fallbacks: `WORKOS_COOKIE_PASSWORD` →
`SLACK_APP_SIGNING_SECRET`; none set ⇒ random per process ⇒ OAuth breaks across restarts). Leave
`MASTRACODE_GITHUB_RECONCILE_ENABLED` on — the 5-min sweep is the only merge-state writer when webhooks can't
land.

---

## 6. Linear + Slack

**Linear.** Own OAuth app, redirect `https://factory.kovalchuk.win/auth/linear/callback`.
`LINEAR_CLIENT_ID` + `LINEAR_CLIENT_SECRET` are **all-or-nothing — one alone is a boot error**, and the
integration also needs auth, a database and an org. Scopes from Mastra's consent screen: `read`, `write`,
`issues:create`, `comments:create`, **`app:mentionable`** — the last is easily missed and without it Factory
can't be @-mentioned inside Linear. Read/write is workspace-wide; Linear has no per-project narrowing at the
OAuth layer, so scoping happens in Factory's intake selection.

**Slack.** Own app from the Factory manifest.

| Setting | Value |
|---|---|
| Events + Interactivity | `…/api/agent-controllers/mastra-code/channels/slack/webhook` |
| OAuth redirect | `…/connect/slack/oidc/callback` |
| Bot events | `app_mention`, `message.channels`, `message.groups`, `message.im`, `message.mpim` |
| Extras | bot user + App Home messages tab; enable OpenID Connect for account linking |

Env: `SLACK_APP_SIGNING_SECRET` (master switch — unset means no Slack integration is constructed),
`SLACK_APP_BOT_TOKEN` (`xoxb-`; without it Slack can reach you but you can't reply), `SLACK_APP_CLIENT_ID`,
`SLACK_APP_CLIENT_SECRET`, `MASTRACODE_CHANNELS_PUBLIC_URL`.

---

## 7. Supervision — LaunchAgents

Agents, not daemons: Colima runs inside a user login session, so a daemon would start before any session exists
and Factory would crash-loop with no Docker socket. `UserName=koval` doesn't help — it changes the uid, not the
session. Any logout kills Factory, so disable fast user switching.

### 7.1 Colima — `~/Library/LaunchAgents/ai.mastra.colima.plist`

`--foreground` keeps launchd supervising the VM instead of watching a wrapper exit.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key>            <string>ai.mastra.colima</string>
  <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/colima</string><string>start</string>
      <string>--cpu</string><string>12</string>
      <string>--memory</string><string>32</string>
      <string>--disk</string><string>200</string>
      <string>--vm-type</string><string>vz</string>
      <string>--mount-type</string><string>virtiofs</string>
      <string>--foreground</string>
    </array>
  <key>EnvironmentVariables</key>
    <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key>        <true/>
  <key>KeepAlive</key>        <true/>
  <key>ThrottleInterval</key> <integer>30</integer>
  <key>StandardOutPath</key>  <string>/Users/koval/Library/Logs/mastra-factory/colima.log</string>
  <key>StandardErrorPath</key><string>/Users/koval/Library/Logs/mastra-factory/colima.err.log</string>
</dict></plist>
```

### 7.2 Wait-for-socket wrapper — `~/bin/factory-start.sh` (`chmod +x`)

launchd has no dependency ordering, so Factory waits for Docker itself.

```bash
#!/bin/zsh
set -eu
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"   # dockerode reads this

for _ in {1..120}; do                                           # up to 10 minutes
  if [ -S "$HOME/.colima/default/docker.sock" ] && docker info >/dev/null 2>&1; then break; fi
  sleep 5
done

if ! docker info >/dev/null 2>&1; then
  print -u2 "[factory] docker socket not ready after 10m — exiting for launchd to retry"
  exit 1
fi

cd /Users/koval/dev/test/mastra-factory
exec npm run start
```

### 7.3 Factory — `~/Library/LaunchAgents/ai.mastra.factory.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key>               <string>ai.mastra.factory</string>
  <key>WorkingDirectory</key>    <string>/Users/koval/dev/test/mastra-factory</string>
  <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/caffeinate</string><string>-dimsu</string>
      <string>/Users/koval/bin/factory-start.sh</string>
    </array>
  <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
      <key>NODE_ENV</key>    <string>production</string>
      <key>DOCKER_HOST</key> <string>unix:///Users/koval/.colima/default/docker.sock</string>
    </dict>
  <key>RunAtLoad</key>        <true/>
  <key>KeepAlive</key>        <true/>
  <key>ThrottleInterval</key> <integer>30</integer>
  <key>ProcessType</key>      <string>Interactive</string>
  <key>StandardOutPath</key>  <string>/Users/koval/Library/Logs/mastra-factory/out.log</string>
  <key>StandardErrorPath</key><string>/Users/koval/Library/Logs/mastra-factory/err.log</string>
</dict></plist>
```

`PATH` must be explicit (a LaunchAgent inherits a minimal one and won't find `node`/`docker`/`git`);
`ProcessType: Interactive` avoids the throttled default that would give agent work low CPU/IO priority;
`ThrottleInterval: 30` keeps a bad `.env` from a tight crash-loop. `mkdir -p ~/Library/Logs/mastra-factory`
first — launchd does **not** create the log directory and the agent won't spawn without it.

### 7.4 Log rotation and power

`/etc/newsyslog.d/ai.mastra.factory.conf` (root-owned, 644) — launchd never rotates:

```
# logfilename                                       [owner:group]  mode  count  size   when  flags
/Users/koval/Library/Logs/mastra-factory/out.log    koval:staff    644   7      10240  *     NJ
/Users/koval/Library/Logs/mastra-factory/err.log    koval:staff    644   7      10240  *     NJ
/Users/koval/Library/Logs/mastra-factory/colima.log koval:staff    644   7      10240  *     NJ
```

`N` = no process to signal, `J` = bzip2; 7 generations of 10 MB. Dry-run with `sudo newsyslog -nvv`.

```bash
sudo pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0
```

### 7.5 FileVault is on — the cost

**This machine cannot recover from an unplanned reboot without a human at the keyboard.** Until someone
authenticates at the pre-boot screen there is no session, no agents, no daemons, no SSH, no Screen Sharing.
Remote recovery is impossible by design, and auto-login is unavailable (macOS disables it under FileVault).
Power cuts are largely neutralised — it's a laptop, the battery is a UPS. macOS auto-updates are preventable:
patch deliberately. Planned reboots are fine via `sudo fdesetup authrestart` (`-delayminutes -1` arms the key
and waits). **The residual risk is a kernel panic or hardware fault — that one needs physical access.**
Accepted.

---

## 8. Build order

One pass, loopback first, public last. Each step has a checkpoint; don't move on until it holds.

```bash
# 1 — engine + tools
brew install colima docker docker-compose gh
#     docker-compose is a CLI plugin — if `docker compose` isn't found:
#     mkdir -p ~/.docker/cli-plugins && \
#       ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
# ✔ `docker info` succeeds

# 2 — Postgres: first drop the redis service, add `restart: unless-stopped`, change user/pass
npm run db:up
# ✔ container healthy on 127.0.0.1:54329   (image pgvector/pgvector:pg18, db mastracode_web)

# 3 — deps (keep devDependencies — the mastra CLI and varlock are runtime deps of `npm start`)
npm install
npm install @mastra/docker
npm install @mastra/auth-better-auth          # peer hono@^4 — add `hono` if npm insists
# ✔ no unmet peers left

# 4 — sandbox image
docker build --platform linux/arm64 -f factory-sandbox.Dockerfile -t factory-sandbox:2026-09-22 .
# ✔ `docker run --rm factory-sandbox:2026-09-22 sh -c 'git --version && gh --version'`

# 5 — code: DockerSandbox branch (§2.2) + Better Auth (§3.2)
npm run check
# ✔ tsc clean

# 6 — .env on LOOPBACK (MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111), signUpEnabled:true
npm run dev                                   # `dev` bypasses varlock; `start` is the varlock path
# ✔ /signin renders, you create THE account, an org exists, a session opens a Docker sandbox

# 7 — close registration: signUpEnabled:false, restart
# ✔ the sign-up form is gone and POST /auth/api/sign-up/email is refused

# 8 — tunnel (zone Active first), then switch .env to the public URL + MASTRA_HOST
sudo cloudflared service install <TOKEN>
npm run build && npm run start                # production path: varlock + NODE_ENV=production
# ✔ sign-in works over HTTPS

# 9 — own GitHub App (§5): register every URL from §4.1, install it, connect a repo
# ✔ a delivery lands on /web/github/webhook and one issue reaches a merged PR

# 10 — Linear, then Slack (§6)
# ✔ an issue routed from each source

# 11 — only once all of the above works by hand: LaunchAgents (§7)
mkdir -p ~/Library/Logs/mastra-factory
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.factory.plist
sudo pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0
# ✔ survives `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` and a full logout→login
```

### `.env` target state

```dotenv
NODE_ENV=production
PORT=4111
MASTRA_HOST=127.0.0.1
MASTRACODE_PUBLIC_URL=https://factory.kovalchuk.win
MASTRACODE_CHANNELS_PUBLIC_URL=https://factory.kovalchuk.win

DATABASE_URL=postgres://factory:<strong-pw>@127.0.0.1:54329/mastracode_web

FACTORY_CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>   # else credentials persist as PLAINTEXT
FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1

FACTORY_SANDBOX_PROVIDER=docker            # only meaningful AFTER the index.ts edit
FACTORY_SANDBOX_IMAGE=factory-sandbox:2026-09-22
FACTORY_SANDBOX_MEMORY_GIB=10
FACTORY_SANDBOX_CPUS=4
MASTRACODE_SANDBOX_WORKDIR=/workspace
MASTRACODE_MAX_SANDBOXES=3
MASTRACODE_DISPATCH_MAX_IN_FLIGHT=3

# auth — MASTRA_SHARED_API_URL must stay UNSET or it silently wins.
# BETTER_AUTH_URL is NOT read by anything — baseURL comes from MASTRACODE_PUBLIC_URL.
BETTER_AUTH_SECRET=<openssl rand -base64 32>

GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_SLUG=
GITHUB_APP_WEBHOOK_SECRET=<stable random>

LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=

SLACK_APP_SIGNING_SECRET=
SLACK_APP_BOT_TOKEN=
SLACK_APP_CLIENT_ID=
SLACK_APP_CLIENT_SECRET=

ANTHROPIC_API_KEY=
```

**Keys absent from `.env.schema` still reach the process.** `varlock run` builds the child env as
`{ ...process.env, ...resolvedEnv }` (`run.command-*.mjs:158-162`) **[verified]**, confirmed by experiment.
Declaring a key only adds validation, `@public` (undeclared keys default to *sensitive*, so varlock redacts
their values in the server's own stdout) and generated types. Undeclared here: `MASTRA_HOST`, `PORT`,
`NODE_ENV`, the three `FACTORY_SANDBOX_*`, `MASTRACODE_DISPATCH_MAX_IN_FLIGHT`, `BETTER_AUTH_SECRET`.

---

## 9. Backups — none

No dumps, no schedule, no off-machine copy. Projects, work items, sessions, agent memory, integration tokens
and auth/org tables all live in one Postgres volume on this disk, and that volume is the only copy. Disk loss,
a bad storage migration on a dependency bump, or an accidental `docker compose down -v` are all unrecoverable —
so treat every dependency bump as one-way and read the changelog first.

Two things are worth keeping off the machine anyway, because they're keys rather than backups:
`FACTORY_CREDENTIAL_ENCRYPTION_KEY` (+ `_KEY_ID`) in a password manager — without it the DB survives but every
stored credential and OAuth token is undecryptable ciphertext — and the GitHub App private key +
`GITHUB_APP_WEBHOOK_SECRET`, which are regenerable but only at the cost of re-registering.

If this is ever revisited: the host has no `pg_dump` (no `libpq`, Postgres is in a container), so it's
`docker compose exec -T app-db pg_dump -U factory -Fc mastracode_web > ~/factory-$(date +%F).dump`. A dump
without the encryption key is worthless — store them together or not at all.

---

## 10. Risks

| Risk | Severity | Status |
|---|---|---|
| `signUpEnabled` defaults true ⇒ open public registration | **High** | create the account on loopback, flip to `false` before the tunnel (§3.3) |
| No backups — disk loss, bad migration or `down -v` is unrecoverable | **High** | ✅ accepted (§9) |
| Losing `FACTORY_CREDENTIAL_ENCRYPTION_KEY` ⇒ credentials unreadable with the DB intact | **High** | key in a password manager (§9) |
| No unattended recovery from a panic/hardware reboot | **High** | ✅ accepted — battery covers power loss, `authrestart` covers planned reboots (§7.5) |
| `ensureOrganization` failures are swallowed ⇒ silent no-org | Medium | first place to look if GitHub connect is missing (§3.3) |
| `src/mastra/index.ts` diverges from the template | Medium | keep the diff small + commented |
| Container/disk accumulation over months | Medium | `MASTRACODE_MAX_SANDBOXES=3` + weekly prune (§2.3) |
| Colima socket absent at LaunchAgent start | Medium | ✅ wait-for-socket wrapper + `DOCKER_HOST` (§7.2) |
| Sandbox image lacks a package the target repo needs | Medium | expected with a generic image; one-line fix + retag |
| Domain expiry breaks every callback | Medium | keep auto-renew on |
| Mastra Studio shows no login UI in production | Low | cosmetic EE-gate artifact; Factory's `/signin` is fine (§3.1) |
| Docs ≠ source (undocumented `MASTRACODE_AUTH_DISABLED`, polling defaults) | Low | trust `.env.schema` + `index.ts` |

---

## 11. Environment variables — traps only

The full catalogue is `.env.schema`; §8 has the target `.env`. These are the ones whose behaviour isn't
obvious:

| Var | Trap |
|---|---|
| `MASTRA_SHARED_API_URL` | ⛔ highest precedence — silently defers identity to Mastra's platform, warning only |
| `BETTER_AUTH_URL` | ❌ read by nothing; `baseURL` comes from `MASTRACODE_PUBLIC_URL` |
| `MASTRACODE_AUTH_DISABLED` | ⛔ undocumented; also disables credential encryption |
| `MASTRA_HOST` | unset ⇒ binds **all** interfaces, LAN included |
| `MASTRACODE_PUBLIC_URL` | loopback value ⇒ OAuth callbacks the browser can't reach |
| `FACTORY_CREDENTIAL_ENCRYPTION_KEY` | unset ⇒ provider keys and OAuth tokens persist as plaintext (warns on boot) |
| `GITHUB_APP_WEBHOOK_SECRET` | unset (with no `WORKOS_COOKIE_PASSWORD`/`SLACK_APP_SIGNING_SECRET`) ⇒ random per process ⇒ OAuth breaks across restarts |
| `GITHUB_APP_*` | all five, or the integration is silently inert |
| `LINEAR_CLIENT_ID` / `_SECRET` | all-or-nothing; one alone is a boot error |
| `SLACK_APP_SIGNING_SECRET` | master switch — unset means no Slack integration is constructed at all |
| `SLACK_APP_BOT_TOKEN` | without it Slack can reach you but you can't reply |
| `FACTORY_SANDBOX_PROVIDER` | `docker` is inert until the §2.2 edit; unrecognised values fall through to `LocalSandbox` |
| `DOCKER_HOST` | dockerode needs it pointed at Colima's socket (§7.2) |
| `MASTRA_HTTPS_KEY` / `_CERT` | only if the server itself serves TLS — don't; TLS is Cloudflare's job |
| `MASTRACODE_ALLOWED_ORIGINS` | non-empty also flips Better Auth to cross-site cookies |
| `APP_DATABASE_URL` | deprecated alias for `DATABASE_URL`, warns |
