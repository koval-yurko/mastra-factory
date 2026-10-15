# Mastra Factory

A self-hosted [Mastra Factory](https://factory.mastra.ai/): connect a repository, turn issues into plans, implementations and reviewed pull requests. One Mac, own Postgres, own Docker sandboxes, own GitHub/Linear/Slack apps, own sign-in — nothing depends on Mastra's platform.

| Where | What |
| --- | --- |
| `src/mastra/` | The Factory Server and its configuration (`config/README.md`) |
| `src/build/` | The post-build step of `npm run build` |
| `ops/` | Host: Docker engine, Postgres, tunnel, LaunchAgents, release scripts (`ops/README.md`) |
| `actions-runner/` | GitHub Actions runner that deploys every push to `main` (`actions-runner/README.md`) |
| `releases/` | Stored builds and database dumps (gitignored) |
| `apps/`, `sandbox/` | GitHub, Linear, Slack apps; the session container image |
| `docs/` | Design records: `self-hosting-research.md`, `ci-deploy-research.md` |

## How you work with this repo

- **Change code** on a branch, merge into `main`. **A push to `main` is the deploy**: the runner builds, tests, stores the build in `releases/` and restarts the server on it. A failed health check switches back by itself.
- **Change `.env`** (or AWS Parameter Store): restart the server — `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`. No build needed.
- **Run locally**: stop the service, run your build, start the service again (below). Never build in the repo root while the service runs from it.
- **Never** run `git clean -x` (deletes `releases/` and the runner) or `docker compose down -v` (deletes the database — the only copy).

## Start the Factory Server

First bring-up on a new machine. Steps in order; do not pass a failing checkpoint. Before step 1: Docker engine and Postgres — `ops/README.md` ("Bring-up").

### 1 — Compose `.env`

```bash
cp .env.example .env && chmod 600 .env
openssl rand -base64 32    # run twice: BETTER_AUTH_SECRET and FACTORY_CREDENTIAL_ENCRYPTION_KEY must differ
openssl rand -hex 32       # POSTGRES_PASSWORD (no / $ #)
```

```dotenv
MASTRA_HOST=127.0.0.1
PORT=4111
MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111
DATABASE_URL=postgres://factory:<POSTGRES_PASSWORD>@127.0.0.1:54329/mastracode_web
BETTER_AUTH_SECRET=<openssl rand -base64 32>
FACTORY_CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>
FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1
```

- `MASTRA_HOST` — the literal `127.0.0.1`. Unset binds every interface; `localhost` is not the same.
- `BETTER_AUTH_SECRET` — if unset or misspelled, the boot does not fail: `/signin` shows only **Sign in with Mastra Platform**.
- `FACTORY_CREDENTIAL_ENCRYPTION_KEY` — 43 standard-base64 characters and `=`, as `openssl rand -base64 32` prints. Must be set **before the first credential is saved** (step 5). Keep a copy in a password manager.
- Keep unset: `MASTRACODE_AUTH_DISABLED`, `MASTRACODE_ALLOWED_ORIGINS`, `MASTRA_SHARED_API_URL` (and the rest of the list in `AGENTS.md`).

### 2 — Start the database and the server

```bash
npm ci
npm run db:up
docker inspect --format '{{.State.Health.Status}}' mastracode-web-db   # healthy
npm run dev
lsof -nP -iTCP:4111 -sTCP:LISTEN                                       # 127.0.0.1:4111, not *:4111
```

Open **`http://127.0.0.1:4111/signin`** by typing it — `localhost` is refused with `403 Invalid origin`.

### 3 — Create the account

Registration is closed in code (`signUpEnabled: false` in `src/mastra/config/auth.ts`). Open it once, on loopback only:

1. Set `signUpEnabled: true`. Do not commit while it is set.
2. Wait for `[Mastra Dev] - ✅ Restarting server...`, then sign up at `/signin` (**New here? Sign up**).
3. Set it back to `false`, then `git diff --exit-code src/mastra/config/auth.ts`.

Prove registration is closed:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:4111/auth/api/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'
```

Only **`400` with `EMAIL_PASSWORD_SIGN_UP_DISABLED`** passes. `200` means registration is open and the probe made a real account — delete it, close registration, probe again:

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c \
  "DELETE FROM \"user\" WHERE email = 'probe@example.invalid';"
```

### 4 — Checkpoint: the organization

Load the app in the browser once, then:

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c \
  'SELECT o.slug, m.role, u.email FROM "member" m JOIN "organization" o ON o.id = m."organizationId" JOIN "user" u ON u.id = m."userId";'
```

Expect one row: `personal-<user id>`, `owner`, your email. Empty means the bootstrap failed — look for `[BetterAuth] Failed to bootstrap personal organization` in the server log. `503 auth_unavailable` at sign-in means the auth migrations could not run: check `DATABASE_URL`.

### 5 — The credential-encryption rule

`FACTORY_CREDENTIAL_ENCRYPTION_KEY` must be in force before any provider key or token is saved. Without it the server only warns and stores the secret as plaintext; adding the key later does not repair those rows. Treat anything saved before it as exposed: rotate it and save it again. Encrypted values start with `mastra:factory-secret:v1:`.

### 6 — Where agent sessions run

```dotenv
FACTORY_SANDBOX_PROVIDER=docker
MASTRACODE_MAX_SANDBOXES=10
```

Images, ceilings and per-project secrets live in `sandbox/` and in Parameter Store; the image pipeline builds the images on each deploy — `sandbox/README.md`. Unset `FACTORY_SANDBOX_PROVIDER` runs sessions on this host with no isolation.

Then go to production: `ops/README.md` ("Supervision — LaunchAgents"), then `actions-runner/README.md` ("Install").

## Configure your Factory

Models, issue sources and Slack are configured in the UI; server settings live in `.env` and need a restart.

| Topic | Record |
| --- | --- |
| Models, GitHub, Linear, Slack, storage, sandboxes | [factory.mastra.ai/configure](https://factory.mastra.ai/configure/models) |
| GitHub / Linear / Slack app keys | `apps/github/README.md`, `apps/linear/README.md`, `apps/slack/README.md` |
| Sandbox keys | `sandbox/README.md` |
| Server, origin, Docker and tunnel keys | `ops/README.md` |
| Every key, with a comment | `src/mastra/config/env.ts` (`envSpecs`) and `.env.example` |

Postgres (pgvector, `127.0.0.1:54329` only) reads `POSTGRES_PASSWORD` (required, `openssl rand -hex 32`), `POSTGRES_USER` (`factory`) and `POSTGRES_DB` (`mastracode_web`) from `.env`, only when the data volume is first created.

### Values from AWS Parameter Store

With `FACTORY_SSM_PARAMETER_PATH` set, the server loads every parameter under that path at boot (recursive, SecureStrings decrypted, key = last name segment). A non-blank value in `.env` wins.

| Key (in `.env` only) | Value |
| --- | --- |
| `FACTORY_SSM_PARAMETER_PATH` | e.g. `/mastra-factory`; unset = off, no AWS call |
| `AWS_SECRETS_MANAGER_REGION` | e.g. `eu-central-1` |
| `AWS_SECRETS_MANAGER_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Both or neither (neither = AWS default credential chain) |

- **System** keys stay in `.env`; **additional** keys (app secrets and credentials) go to Parameter Store — the two groups in `env.ts` and `.env.example`. Remove a key from `.env` once it is in Parameter Store.
- Keys only dependencies read (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MASTRA_HOST`, `PORT`) must stay in `.env`.
- A failed load stops the boot. A change takes effect at the next restart.
- The Code Agent gets a `parameter_store` tool (`list`, `get`, `put`, `delete`) under the path; `put`/`delete` need write access.

## Production mode on this host

Three LaunchAgents: `ai.mastra.colima` (Docker engine), `ai.mastra.factory` (the server: `ops/factory-start.sh` → `npm run start:release` → `releases/current`), `ai.mastra.runner` (the CI runner). Set-up: `ops/README.md`, `actions-runner/README.md`.

```bash
launchctl list | grep ai.mastra                           # pid and 0 = running
launchctl kickstart -k gui/$(id -u)/ai.mastra.factory     # restart the server (e.g. after a .env change)
tail -f ~/Library/Logs/mastra-factory/out.log             # server; err.log, runner.log, colima.err.log beside it
```

### Deploy, rollback and local mode

A push to `main` deploys: build and tests on the runner, release stored as `releases/<UTC-timestamp>-<sha7>/`, wait until no Factory session is running or parked, `pg_dump` into the release, switch `releases/current`, restart, 60 s health check (switches back on failure). The newest 5 releases are kept, plus `current`, `previous` and pinned ones.

```bash
ops/deploy.sh --list              # releases; * current, - previous
ops/deploy.sh <id>                # activate a stored release
ops/rollback.sh                   # back to previous (no build, no new dump)
ops/rollback.sh <id>              # back to any stored release
ops/rollback.sh --with-db         # back to previous AND its database (asks to confirm; newer data is lost)
ops/deploy.sh --pin <id>          # never prune it
tail -n 5 releases/deploy.log     # last deploys and rollbacks
```

From GitHub: Actions > deploy > Run workflow, with a release id, activates that release.

**Local run** — the local server and the service share port 4111, `.env` and the database, so only one runs at a time:

```bash
ops/local-mode.sh on              # HOLD deploys, wait for idle work, stop the service
npm run build && npm run start    # or npm run dev
ops/local-mode.sh off             # start releases/current again, clear HOLD
ops/local-mode.sh status
```

While `releases/HOLD` exists a push still builds and stores a release, but does not deploy it.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Local server with UI and API, rebuilds on save |
| `npm run build` | `mastra build`, then add the Factory UI, `src/mastra/public/` (skill overrides) and the sandbox catalog to `.mastra/output` |
| `npm run start` | Run the local build in `.mastra/output` |
| `npm run start:release` | Run `releases/current` — what the Factory LaunchAgent starts |
| `npm run check` / `npm test` | Typecheck / `vitest run --dir src` |
| `npm run studio` | Studio at `http://127.0.0.1:3000` against the server on 4111 |
| `npm run db:up` / `db:down` | Start / stop Postgres (the volume survives `db:down`) |
| `npm run sandbox:build` | Build the missing sandbox images on this engine (`sandbox/README.md`) |

## Traces and Studio

Traces are stored only when `~/Library/Application Support/mastracode/settings.json` holds `{"observability":{"localTracing":true}}`. Stop the server before editing it — a running server writes the file back:

```bash
D="$HOME/Library/Application Support/mastracode"
launchctl bootout gui/$(id -u)/ai.mastra.factory
jq '.observability.localTracing = true' "$D/settings.json" > "$D/s.tmp" && mv "$D/s.tmp" "$D/settings.json"
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/ai.mastra.factory.plist"
```

Then `npm run studio` and open **Observability**. Studio agent pages need `MASTRA_STUDIO_FALLBACK_MODEL` (`provider/model`).

## Troubleshooting

- **Sign-in:** `403 Invalid origin`, `503 auth_unavailable`, `organization_required`, or only a **Sign in with Mastra Platform** button — steps 1–4.
- **Sessions:** errors naming `sandbox-catalog.json`, a sandbox secret, or a checkout on this host — `sandbox/README.md`.
- **Server down / crash loop:** `~/Library/Logs/mastra-factory/err.log`; `ops/README.md` ("Supervision checkpoints").
- **Deploy failed:** the Actions log, then `releases/deploy.log`; runner problems — `actions-runner/README.md` ("Troubleshooting").
- More: [Troubleshooting](https://factory.mastra.ai/troubleshooting), [Environment variables](https://factory.mastra.ai/reference/configuration).

## License

Apache-2.0
