# Mastra Factory

An open source environment for building software with coding agents: connect a repository, turn issues into plans, implementations and reviewed pull requests.

Created with [`npm create factory`](https://www.npmjs.com/package/create-factory). This project is the Factory Server and its configuration — keep it separate from the repository agents change. [Documentation](https://factory.mastra.ai/) · [overview video](https://youtu.be/iMA-Xkhj7fU).

This deployment signs you in itself: `/signin` is served by this same process, and accounts, sessions and organizations are rows in this deployment's own Postgres. Nothing leaves the machine to authenticate, and there are no callback URLs to register. The auth tables are created on the first sign-in request.

## Start the Factory Server

Six steps, in order. Do not move past a step whose checkpoint fails. A container engine must be running with `DOCKER_HOST` exported — `ops/README.md` owns both.

### 1 — Compose `.env`

Copy `.env.example` to `.env` and fill these seven. `.env.schema` declares every key this deployment reads and `.env.example` documents each one; only what is non-obvious is repeated here.

```dotenv
MASTRA_HOST=127.0.0.1
PORT=4111
MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111
DATABASE_URL=postgres://factory:<POSTGRES_PASSWORD>@127.0.0.1:54329/mastracode_web
BETTER_AUTH_SECRET=<openssl rand -base64 32>
FACTORY_CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>
FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1
```

```bash
openssl rand -base64 32    # run twice — the two secrets must differ
```

What will not announce itself:

- **`MASTRA_HOST`** — the literal `127.0.0.1`. Unset binds every interface including the LAN; `localhost` is not equivalent. Step 2 checks what actually bound.
- **`MASTRACODE_PUBLIC_URL`** — the only origin sign-in trusts. It must agree with the two values above. `ops/README.md` moves it to the public origin behind the tunnel.
- **`DATABASE_URL`** — not optional: the server runs as `NODE_ENV=production`, so there is no file-database fallback and boot stops with `DATABASE_URL is required outside local development and tests.` The role needs table-creation rights, because the auth tables are DDL'd on the first sign-in request.
- **`BETTER_AUTH_SECRET`** — unset, blank or **misspelled** does not fail the boot. The server falls back to the platform provider and `/signin` shows a single **Sign in with Mastra Platform** button with no email/password form. That button is the only symptom.
- **`FACTORY_CREDENTIAL_ENCRYPTION_KEY`** — must be 43 standard-base64 characters followed by `=`, as `openssl rand -base64 32` emits. A base64url (`-`, `_`) or unpadded spelling is rejected even though it decodes to 32 bytes — that sentence is the boot error verbatim. Carrying such a key from an older deployment: **rewrite the spelling, never regenerate** — `-`→`+`, `_`→`/`, pad to 44 with `=` — the bytes are unchanged and stored credentials stay readable. See step 5 before saving any credential.

Four keys must stay **unset**: `MASTRACODE_AUTH_DISABLED` (drops authentication *and* credential encryption — every stored secret becomes plaintext), `MASTRACODE_ALLOWED_ORIGINS` (cross-site cookies the browser drops over HTTP — sign-in appears to succeed and keeps no session), `MASTRA_SHARED_API_URL` (hands identity back to the platform, beating `BETTER_AUTH_SECRET`), `BETTER_AUTH_TRUSTED_ORIGINS` (widens what may post credentials here).

`npm run dev` loads `.env`, then `.env.local`, then `.env.development`, later winning; an exported shell variable beats all three, silently. Files are read once at startup, relative to the working directory.

### 2 — Start the database and the server

```bash
npm ci                                                                 # when the dependency tree moved
npm run db:up
docker inspect --format '{{.State.Health.Status}}' mastracode-web-db   # expect: healthy
npm run dev
lsof -nP -iTCP:4111 -sTCP:LISTEN                                       # expect: 127.0.0.1:4111
```

`*:4111` means `MASTRA_HOST` never reached the server — stop and fix step 1. Do not start the server before the health check passes; `ops/README.md` covers a database that will not come up.

Then open **`http://127.0.0.1:4111/signin`** by typing it. `npm run dev` always prints `http://localhost:4111` whatever it bound, and that origin is refused with `403` and one server log line: `Invalid origin: http://localhost:4111`.

### 3 — Create the account

Registration is closed in committed code — the literal `signUpEnabled: false` in `src/mastra/config/auth.ts`, not a key in `.env`. Creating the first account means opening that window and closing it again. Only ever do this on the loopback `npm run dev` path, never on an instance reachable from the internet.

1. Set `signUpEnabled: true` (keep the field — deleting it also reopens registration, since the package default is `true`). **Do not commit or stash while it stands**: `npm test` and the verify gate both go red, and a commit inside this window ships open registration.
1. Save; `npm run dev` rebundles and prints `[Mastra Dev] - ✅ Restarting server...`. If that line does not appear, restart it yourself.
1. Reload `/signin`, choose **New here? Sign up**, fill Name / Email / Password (8+ characters), submit. You are signed in and onboarding starts — read step 5 before saving a provider key.
1. Set the field back to `false` as soon as the account exists, wait for the restart line, then `git diff --exit-code src/mastra/config/auth.ts`.

Create your account, and only yours. Then prove registration is closed — the missing sign-up toggle is a hint, not proof, because the page also hides it when it cannot read auth state:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:4111/auth/api/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'
```

Only **`400` with `EMAIL_PASSWORD_SIGN_UP_DISABLED`** passes. Everything else is inconclusive: `000` nothing is listening (back to step 2); `404` self-managed sign-in was never selected (see `BETTER_AUTH_SECRET`); `503 auth_unavailable` the auth migrations failed (step 4); `200` registration is still open **and the probe just created a real account** — delete it, restore the field, probe again:

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c \
  "DELETE FROM \"user\" WHERE email = 'probe@example.invalid';"
```

If a foreign key refuses, delete that user's `"session"` and `"account"` rows first.

### 4 — Checkpoint: the organization

Org-scoped features (GitHub connect, projects) need a personal organization, created on the first authenticated request a browser makes — not by sign-up. `psql` exists only inside the container:

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c \
  'SELECT o.slug, o.name, m.role, u.email FROM "member" m JOIN "organization" o ON o.id = m."organizationId" JOIN "user" u ON u.id = m."userId";'
```

Expect one row: `personal-<user id>`, `<email>'s org`, `owner`. Every identifier is double-quoted deliberately — the auth tables are camelCase and case-sensitive, and `user` unquoted means the session user.

Empty **after** loading the app in a browser is a failed bootstrap: it swallows its error, so the only record is `[BetterAuth] Failed to bootstrap personal organization for user` in the server log, and the app shows `organization_required`.

`503 {"error":"auth_unavailable"}` on sign-in reads like a bad secret but means the auth migrations could not run — `[BetterAuth] Failed to run auth schema migrations; auth stays unavailable until this succeeds.` Check the database is reachable at `DATABASE_URL` before suspecting table-creation rights.

### 5 — The credential-encryption rule

`FACTORY_CREDENTIAL_ENCRYPTION_KEY` must be in force **before the first credential is stored** — any provider key, GitHub token or OAuth token. Nothing refuses the write without it: the server warns twice at boot and persists the secret as readable plaintext.

Setting the key later is worse than doing nothing. The next boot sweeps and encrypts unencrypted rows, but re-encodes what the plaintext writer stored, leaving an unusable string — and the secret was on disk in the clear until then. Treat any credential saved before the key as exposed: rotate at the provider, delete the stored copy, save again. Encrypted values start with `mastra:factory-secret:v1:`; plaintext rows are readable JSON.

Copy the key to a password manager before using it. `.env` is gitignored and is the only copy on disk; losing it loses every credential encrypted under it.

### 6 — Where agent sessions run

```dotenv
FACTORY_SANDBOX_PROVIDER=docker
FACTORY_SANDBOX_IMAGE=factory-sandbox:<YYYY-MM-DD>
MASTRACODE_MAX_SANDBOXES=3
```

`sandbox/README.md` owns all three — building the image, the tag history, and sizing the cap against this host. Set them before the first session (they can go in step 1's block).

With `FACTORY_SANDBOX_PROVIDER` unset nothing stops or warns: sessions run as the server process on **this host**, and a stray `MASTRA_PROJECT_ID` or `E2B_API_KEY` sends them to someone else's VM instead. `docker` is checked ahead of both. `FACTORY_SANDBOX_IMAGE` has no default — blank refuses the first session, and a tag that is not `factory-sandbox:<date>` refuses the *boot*, naming the key.

```bash
grep -E '^(FACTORY_SANDBOX_PROVIDER|FACTORY_SANDBOX_IMAGE|MASTRACODE_MAX_SANDBOXES)=' .env
docker images factory-sandbox
docker ps --filter label=mastra.sandbox=true    # once the first session is open
```

Restart the server after writing them — `.env` is read once at startup.

## Run your first issue

1. **Settings → Work Intake → GitHub issues**: enable **Sync GitHub issues** and select your repository. Each teammate chooses their own sources.
1. Create a small issue in that repository.
1. Find it in **Work → Intake**, select **Investigate**, and open the session.

Continue with the [issue-to-pull-request walkthrough](https://factory.mastra.ai/#create-your-first-pull-request).

## Configure your Factory

Model providers and issue sources are configured in the UI; server settings live in `.env` and need a restart.

| Configuration | What you can change |
| --- | --- |
| [Models](https://factory.mastra.ai/configure/models) | Provider access, credentials, default model |
| [GitHub](https://factory.mastra.ai/configure/github) | Repository access and personal issue intake |
| [Linear](https://factory.mastra.ai/configure/linear) | Workspace connection, project selection, routing |
| [Slack](https://factory.mastra.ai/configure/slack) | App setup, account linking, starting sessions |
| [Storage](https://factory.mastra.ai/configure/storage) | The database connection or storage adapter |
| [Sandboxes](https://factory.mastra.ai/configure/sandboxes) | Platform, local execution, or another provider |

The bundled Postgres (pgvector, published on `127.0.0.1:54329` only) reads three values from `.env`: `POSTGRES_PASSWORD` — no default, every `docker compose` command fails until it is set; generate it with `openssl rand -hex 32`, because `/`, `$` and `#` break both the connection URL and Compose interpolation. `POSTGRES_USER` (`factory`) and `POSTGRES_DB` (`mastracode_web`) keep their defaults here. All three apply **only** when the data volume is first initialized; changing one later renames nothing.

```bash
npm run db:up      # waits up to 120s for healthy, then exits non-zero
npm run db:down
```

**`docker compose down -v` deletes the database.** `docker-compose.yml` pins `name: mastra-factory`, so every checkout and worktree addresses the same stack and the same volume — from any directory that command destroys the one copy of projects, work items, sessions, memory and tokens. If `POSTGRES_PASSWORD` goes missing after the first start, no Compose command runs at all while the container keeps holding the port; put any value back, or `docker stop mastracode-web-db && docker rm mastracode-web-db`.

Sandboxes: `FACTORY_SANDBOX_PROVIDER=docker` runs each session in its own container (what this deployment uses — step 6 above); `local` runs commands as the server process with no isolation. Either beats the Mastra platform sandbox variables. Neither affects sign-in.

### Environment keys

`.env.schema` is the only list of keys and is what validates them; `.env.example` carries a comment per key. Two things live here because `.env.example` defers to this file for them: the exact format of `FACTORY_CREDENTIAL_ENCRYPTION_KEY` and the command that generates it (step 1), and the rule about when it must be in force (step 5). Keys owned elsewhere: `apps/github/README.md`, `apps/linear/README.md`, `apps/slack/README.md`, `sandbox/README.md`, `ops/README.md`. Non-obvious runtime behaviour is in `docs/self-hosting-research.md` §11.

## Deploy

```bash
npm run deploy                    # to your Mastra platform project
npm run build && npm run start    # self-hosted, as a persistent service
```

Self-hosting needs persistent storage, `MASTRACODE_PUBLIC_URL` on the public HTTPS origin, and provider credentials in the deployment environment. See [Deployment](https://factory.mastra.ai/deployment). On this host those two commands are run by `launchd` — see below.

## Production mode on this host

Two LaunchAgents own the deployment: `ai.mastra.colima` runs the container engine, and `ai.mastra.factory` runs `ops/factory-start.sh`, which waits for the Docker socket then execs `npm run start` (`varlock run -- mastra start`), serving the build in `.mastra/output`. `ops/README.md` owns those files and the first bootstrap. Every command below names the **Factory** agent only — restarting Colima would take the database and every session container with it.

`launchctl list` reports the pid of `npm run start`; the process on `4111` is a `node index.mjs` further down the chain (`caffeinate` → `factory-start.sh` → `npm` → `varlock` → `mastra start` → `node`). Both are correct and never the same number.

### Logs

`launchd` writes to four files and nowhere else. `out.log` is the wrapper's `[factory] …` lines plus server stdout; `err.log` is its stderr; `colima.log` and `colima.err.log` are the engine's — and a `--foreground` Colima puts most output in the `.err` one.

```bash
tail -f ~/Library/Logs/mastra-factory/out.log
tail -n 200 ~/Library/Logs/mastra-factory/err.log
bzgrep -h 'pattern' ~/Library/Logs/mastra-factory/out.log.*.bz2   # rotated: 7 × 10 MB, bzip2'd
launchctl list | grep ai.mastra                                   # live pid + 0 = running
launchctl print gui/$(id -u)/ai.mastra.factory                    # state, runs, last exit code
```

- **`out.log` at zero bytes while the server is plainly serving** is the rotation trap, not a quiet server: `newsyslog` renames, `launchd` keeps the old descriptor. Fix with `launchctl kickstart -k` on the job that owns the file — the Factory one does not reopen Colima's two.
- **Nothing in any of the four files** means launchd never spawned the job; ask launchd itself. `-` pid with `78` is `EX_CONFIG`, a refused plist. A pid that changes each time is a crash loop on the 30-second throttle.
- **`Command failed with exit code 1` / `command [mastra start] failed` at the end of `out.log`** is what a `bootout` leaves behind — varlock reporting the terminated child. Not a start failure.

### Rebuild: stop, build, start

The bundler empties `.mastra/` unconditionally, and its only guard reads `mastra dev`'s lock file — it knows nothing about a `mastra start` server. Building against the live server deletes the SPA it serves from under it, and any exit inside that window puts `KeepAlive` into an `Output directory … does not exist` loop. `npm run start` never builds, so building first and restarting later is the same outage moved.

```bash
docker ps --filter label=mastra.sandbox=true            # 0 — stopping abandons live sessions

launchctl bootout gui/$(id -u)/ai.mastra.factory        # 1 — engine, database and tunnel stay up

npm ci                                                  # 2 — only when package-lock.json moved
npm run build                                           #     this is the outage; tunnel answers 502

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.factory.plist   # 3
launchctl kickstart gui/$(id -u)/ai.mastra.factory      #     bootstrap does not always spawn it
```

**`bootout`, not `stop` or `kill`** — the agent is `KeepAlive`, so anything that merely ends the process gets it restarted within the throttle. On a job already out it prints `No such process` and changes nothing.

**`bootstrap` registers; it does not reliably start.** `RunAtLoad` can be deferred, and when it is, the job never runs to write a log line — the only record is the system log:

```bash
log show --last 10m --predicate 'process == "launchd" AND eventMessage CONTAINS "mastra"' --info --style compact
# launchd: [gui/501 [100017]:] pending spawn, domain in on-demand-only mode: ai.mastra.factory
```

The signature is a job that has **never run**: `-` pid with `0` beside it, and `runs = 0`, `last exit code = (never exited)` in `launchctl print`. The plist, the build and `.env` are all fine in this state — `npm run start` by hand works, which is what makes it confusing. `kickstart` is an explicit demand and starts it; it is harmless on a job that did spawn.

Nothing else needs re-placing: the plists are symlinks into `ops/launchagents/`. Re-run `ops/install.sh` only after changing a supervision artifact — and `ops/newsyslog/ai.mastra.factory.conf` is picked up *only* that way, being copied rather than linked.

### A `.env` change needs no build

Nothing from `.env` is baked into `.mastra/output`; the values are read at startup.

```bash
launchctl kickstart -k gui/$(id -u)/ai.mastra.factory
```

That covers a credential, a sandbox key, anything `.env` owns. It is **not** enough for `src/mastra/`, `package.json`, `package-lock.json` or `tsconfig.json` — a server restarted without a rebuild serves the old code and reports nothing.

### Checkpoints

```bash
launchctl list | grep ai.mastra.factory             # a live pid, and 0
lsof -nP -iTCP:4111 -sTCP:LISTEN                    # 127.0.0.1:4111
cat .mastra/build-manifest.json                     # buildTime is from this rebuild
tail -n 40 ~/Library/Logs/mastra-factory/err.log    # nothing repeating every 30 seconds
find src package.json package-lock.json tsconfig.json -newer .mastra/build-manifest.json
```

`buildTime` is the only record that separates a restart from a rebuild — `mastra start` checks nothing about a build's age. The `find` is the other direction, source left unbuilt; no output is the pass. It reads mtimes, so a `git checkout` or `npm ci` makes it over-report, never under-report.

Session containers outlive a restart while the in-flight count does not, so restarting with three up admits three more. Remove the finished ones: `docker ps --filter label=mastra.sandbox=true`, then `docker rm -f`.

## Traces, logs and Studio

`src/mastra/observability.ts` and `src/mastra/logger.ts` are picked up by file-system routing, not imported by the entry. Every agent run, model call and tool call is traced with its full input and output: prompts, repository code, tool results. The traces are stored in this machine's own storage, and nothing is exported to Mastra Platform.

The spans are stored only when the Mastra Code app data directory (`~/Library/Application Support/mastracode` on macOS) holds a `settings.json` with `{"observability":{"localTracing":true}}`. That makes the server attach `observability.duckdb` next to it. Without it, the server logs `MastraStorageExporter unavailable` once and records nothing. DuckDB has a single writer, so a Mastra Code CLI using the same directory at the same time locks one of them out.

`mastra factory dev` does not serve Studio, because the Factory UI owns `/`. Run it as its own UI against this server with `npx mastra studio -p 3000 -h 127.0.0.1 -s 4111`, then open `http://127.0.0.1:3000` and use **Observability → Traces / Logs / Metrics**.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the local Factory Server with its UI and API |
| `npm run check` | Typecheck |
| `npm test` | `vitest run --dir src` |
| `npm run build` | Build server and UI into `.mastra/output` |
| `npm run start` | Run the production build (never builds) |
| `npm run deploy` | Build and deploy to Mastra platform |
| `npm run db:up` / `db:down` | Start or stop the local PostgreSQL service |

## Troubleshooting

- **Runtime:** match `engines.node` in `package.json`.
- **Sign-in:** `403 Invalid origin`, `503 auth_unavailable`, `organization_required`, a **Sign in with Mastra Platform** button, or a plaintext-credential warning at boot — all diagnosed in steps 1–5 above.
- **No way to create an account:** that is registration working as intended; step 3 opens and closes it deliberately.
- **Sessions:** errors naming `FACTORY_SANDBOX_IMAGE` or `MASTRACODE_MAX_SANDBOXES`, a Docker Hub pull failure, or a checkout on this host instead of in a container — `sandbox/README.md`, with step 6 as the configuration behind them.
- **Production logs / `bootstrap` left nothing running / a change that did not take effect:** "Production mode on this host" above.
- **Port changes:** set `PORT`, update `MASTRACODE_PUBLIC_URL`, and update callback URLs for apps you manage.
- **Missing issues:** check repository access and **Work Intake** selections.

See [Troubleshooting](https://factory.mastra.ai/troubleshooting) or [Environment variables](https://factory.mastra.ai/reference/configuration).

## License

Apache-2.0
