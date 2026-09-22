# Mastra Factory

Mastra Factory is an open source environment for building software with coding agents. Connect your repository to turn issues into plans, implementations, and reviewed pull requests.

Created with [`npm create factory`](https://www.npmjs.com/package/create-factory). This project contains the Factory Server and its configuration. Keep it separate from the repository you want agents to change.

Read the [documentation](https://factory.mastra.ai/) or [watch the Mastra Factory overview](https://youtu.be/iMA-Xkhj7fU).

## Start the Factory Server

This deployment signs you in itself. The form lives at `/signin` on this same server — one process serves the Factory UI, the API and sign-in — and the accounts, sessions and organizations behind it are rows in this deployment's own Postgres, the same `DATABASE_URL` the application tables use. No request leaves this machine to authenticate: there is no redirect to Mastra platform or to any other identity provider, and there are no callback URLs to register anywhere. The auth tables are created on the first sign-in request, so there is no migration step to run first.

The six steps below are the first bring-up, in order. Do not move past a step whose checkpoint does not hold.

**Before you start:** a container engine running on this machine, with `DOCKER_HOST` exported in the shell you use for every command here. `ops/README.md` owns that value and the engine bring-up; `docker info` exiting 0 is the precondition for step 2's database and for step 4's `docker exec`.

### 1 — Compose `.env`

The first start needs these seven values in `.env` at the repository root. Copy `.env.example` to `.env` if you have not already. Every `<…>` is a placeholder to fill in; none of them has a usable default.

```dotenv
MASTRA_HOST=127.0.0.1
PORT=4111
MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111
DATABASE_URL=postgres://factory:<POSTGRES_PASSWORD>@127.0.0.1:54329/mastracode_web
BETTER_AUTH_SECRET=<openssl rand -base64 32>
FACTORY_CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>
FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1
```

Generate the two secrets with separate runs of the same command — they protect different things and must not be the same string:

```bash
openssl rand -base64 32
```

What each value must contain and how to obtain it:

- `MASTRA_HOST` — the literal `127.0.0.1`. This is the address the server's socket binds to, and it is the one value that keeps this deployment off the network — the authenticated API, the sessions it issues, the credentials it stores, Studio, and step 3's sign-up window for as long as that is open. Nothing derives it from anything else: unset, the bind address is undefined and the server listens on **every** interface, this machine's LAN address included, and nothing logs that it did. This is the only key that moves the socket — `HOST` changes the URL in the startup banner and nothing else, so setting that instead buys a reassuring message over a wide-open port. Step 2 checks what actually got bound. Write the address, not the name `localhost`: the value is handed to the listener unchanged, and a name goes through the resolver, which commonly answers `::1` first — leaving the server on IPv6 loopback while the browser origin below names IPv4. There is nothing to obtain; it is a constant for a single-machine deployment.
- `PORT` — `4111`, pinned. The browser origin, `MASTRACODE_PUBLIC_URL` and the port the server actually listens on all have to agree. Unset, `npm run dev` scans 4111–4131 and silently takes 4112 when 4111 is busy; every request then arrives on an origin sign-in does not trust, with nothing saying why. Pinned, a busy port fails loudly with `EADDRINUSE`, which is the failure you want.
- `MASTRACODE_PUBLIC_URL` — exactly `http://127.0.0.1:4111`: scheme, host and port, no path and no trailing slash. This is the origin the browser uses, and with the keys below left unset it is the **only** origin sign-in trusts — the trusted-origin list is seeded from this value. It has to match `MASTRA_HOST` and `PORT` character for character; `localhost` and `127.0.0.1` are not interchangeable here.
- `DATABASE_URL` — the connection string for this deployment's Postgres, agreeing with the three `POSTGRES_*` values described under "Configure your Factory" below, which also covers starting the service with `npm run db:up`; note the constraint on `POSTGRES_PASSWORD` there, because a password containing `/`, `$` or `#` breaks this URL as well as Compose. Two extra requirements apply on this path. The role in it needs table-creation rights on the schema, because the auth tables are created by DDL on the first sign-in request rather than at deploy time. And it is not optional: `npm run dev` defaults the server to `NODE_ENV=production`, so the local-development file-database fallback is unreachable and boot stops with `DATABASE_URL is required outside local development and tests.` Leave `NODE_ENV` unset for this procedure — a `NODE_ENV=development` line in `.env` wins over that default, which makes `DATABASE_URL` optional again and silently moves all storage to a local file, where step 4's query finds nothing and reads as a failed bootstrap.
- `BETTER_AUTH_SECRET` — 32 or more random characters; it signs this deployment's session cookies. Generate it with the command above. Keep it stable: changing it invalidates every existing session. This key is also the switch for self-managed sign-in, and an unset, blank or **misspelled** one does not fail the boot — the server falls through to the platform-backed default provider, and `/signin` then shows a single **Sign in with Mastra Platform** button with no email/password form. That button is how this mistake announces itself; there is no error to find.
- `FACTORY_CREDENTIAL_ENCRYPTION_KEY` — base64 of 32 random bytes, from a second run of the command above. It encrypts stored provider credentials at rest. A value that decodes to any other length stops the boot with `FACTORY_CREDENTIAL_ENCRYPTION_KEY must contain base64-encoded 32-byte keys.` Read step 5 before you save your first credential.
- `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID` — `v1`. The identifier recorded alongside new ciphertext; change it only when rotating the key. `.env.example` already ships this one set, so there is usually nothing to do.

Four keys must stay **unset**. `MASTRACODE_AUTH_DISABLED`: set to `1` it turns authentication off entirely — and because credential encryption is only configured when authentication is on, it also drops encryption, so every stored credential is written as plaintext no matter what `FACTORY_CREDENTIAL_ENCRYPTION_KEY` says. It is deliberately declared in neither `.env.schema` nor `.env.example`; this is the only warning about it. `MASTRACODE_ALLOWED_ORIGINS`: any non-empty value puts sign-in in cross-site mode, where session cookies are issued `SameSite=None; Secure` and a browser drops them over plain HTTP — sign-in then appears to succeed and keeps no session. `MASTRA_SHARED_API_URL`: set, it takes precedence over `BETTER_AUTH_SECRET` and hands identity back to a platform API, which is exactly what this deployment does not do. `BETTER_AUTH_TRUSTED_ORIGINS`: a comma-separated list appended to the trusted origins above, widening what may post credentials to this server.

How `.env` reaches the server, since three things can defeat the values above without saying so. `npm run dev` loads `.env`, then `.env.local`, then `.env.development`, with later files winning — so a stale `.env.local` silently overrides what you just wrote. A key already exported in your shell beats all three files, and nothing logs that it did. And the files are read once at startup, relative to the directory the command runs in, so every edit needs the dev server stopped and started again.

`MASTRA_HOST` and `PORT` are not declared in `.env.schema`; Story 3.2 is what declares them. They still reach the server under `npm run dev`, which is the path this procedure uses.

### 2 — Start the database and the server

Run these from the repository root — `.env` is resolved against the directory the command runs in:

```bash
npm ci        # whenever the dependency tree has moved since your last install
npm run db:up
docker inspect --format '{{.State.Health.Status}}' mastracode-web-db   # expect: healthy
npm run dev
```

Run `npm ci` first if this checkout has pulled changes since it was last installed — self-managed sign-in and the Docker sandbox each arrived with their own package, and a tree missing them cannot even import the auth provider it is asked to start. Do not start the server until the health check prints `healthy`: everything below needs the database the first sign-in request creates its tables in. `ops/README.md` covers what to do when it does not.

Once the server is up, confirm what the socket actually bound — this is the check that the whole deployment, step 3's sign-up window included, stays on this machine:

```bash
lsof -nP -iTCP:4111 -sTCP:LISTEN
```

Expected: `127.0.0.1:4111`. A `*:4111` means `MASTRA_HOST` did not reach the server: this deployment is listening on every interface, this machine's LAN address included, and step 3 would open its sign-up window there too. Stop the server and fix step 1 before going further.

Then open this URL in the browser:

```
http://127.0.0.1:4111/signin
```

Type it; do not click the one in the banner. `npm run dev` always prints `http://localhost:4111` regardless of the address it bound, and opening that instead is the trap this section exists for: the page loads, then the sign-in request carries an origin that is not trusted, is refused with `403`, and the only explanation is a server log line reading `Invalid origin: http://localhost:4111`.

### 3 — Create the account

`/signin` shows **Welcome back** over an email and password form, and underneath it the line **Account creation is managed by your administrator.** Registration is closed on this deployment: sign-up is disabled in committed code — the literal `signUpEnabled: false` in `src/mastra/index.ts` — not by anything in `.env`, so there is no key to set and no value to change here. Creating the first account means opening that window on purpose and closing it again.

This procedure belongs to the `npm run dev` path in step 2, where step 1's loopback bind is what keeps the open window on this machine. On a built or deployed instance — `npm run build` and `npm run start`, or `npm run deploy`, both under "Deploy" below — the source edit changes nothing until a rebuild, and there is no loopback bind to protect the window at all. Never open it on a deployment that is reachable from the internet.

1. In `src/mastra/index.ts`, find `signUpEnabled: false` in the `MastraAuthBetterAuth` options and change it to `signUpEnabled: true`. Leave the field in place — deleting it reopens registration too, because the package default is `true`, but leaves nothing to put back. Do not commit or stash this edit while it stands: `npm test` goes red on the test named `closes registration: a self-managed provider never allows sign-up` for exactly as long as the field says `true`, which is that test doing its job, and a commit made inside this window ships open registration in tracked source.
1. Saving the file is what opens the window — you do not restart anything. `npm run dev` watches the source, rebundles on save and respawns the server itself; watch its output for `[Mastra Dev] - ✅ Restarting server...`. If that line does not appear, stop the dev server and start it again before going on. Registration is open from that restart until you restore the field below, and step 1's loopback bind is the only thing keeping that window off the network.
1. Reload `/signin`. A **New here? Sign up** toggle now appears where that line was. Choose it — it adds a required **Name** field above **Email** and **Password** — fill in all three, the password at least 8 characters or the request comes back rejected, and submit **Create account**. That creates the account and signs you in, and the browser goes straight on into onboarding, which asks for the repository agents should change and for a model provider — read step 5 before you save that provider's API key.
1. Close the window as soon as the account exists; do not wait until onboarding is finished. Set the field back to `signUpEnabled: false`, save, and wait for the same restart line. The restart costs you nothing here — the account is a database row and your session is a cookie, so both survive it and onboarding picks up where it left off. Then confirm nothing was left behind: `git diff --exit-code src/mastra/index.ts` must print no output.

Create your account, and only yours.

Checkpoint, with the field back at `false` and the server restarted. `/signin` should again show **Account creation is managed by your administrator.** and no sign-up toggle — but read that as a hint, not as proof. The page hides the toggle only when `/auth/me` answers `signUpDisabled: true`, so a visible toggle can equally mean the page could not read auth state at all. The probe below is the authoritative check:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:4111/auth/api/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'
```

Exactly one outcome passes: **`400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED` in the body.** Every other result is inconclusive — it has not shown registration is closed — so do not move on from one:

- `000` — nothing answered at that address; `-s` hides the connection error. The server is not running, or not on this port. Back to step 2.
- `404` — the path is wrong, or self-managed sign-in was never selected, so `/auth/api` is not mounted at all. See `BETTER_AUTH_SECRET` in step 1.
- `503` with `auth_unavailable` — the auth schema migrations failed; step 4 below diagnoses it. Nothing about sign-up has been tested yet.
- `200` — registration is still open, and the probe has just created a real second account. The field is still `true`, or the file was saved and the rebuild never ran. Delete that account, then restore the field, wait for the restart line, and probe again:

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c \
  "DELETE FROM \"user\" WHERE email = 'probe@example.invalid';"
```

`"user"` is double-quoted for the same reason as in step 4 — unquoted it means the session user, not the table — and the role and database names come from your `.env` if you did not keep the defaults. If a foreign key refuses the delete, remove that account's rows in `"session"` and `"account"` first, matched on its `"userId"`.

### 4 — Checkpoint: the organization

Every signed-in user needs a personal organization — the org-scoped features (GitHub connect, projects) have nothing to attach to without one. It is created on the first authenticated request the browser makes, not by the sign-up itself, so an account created with `curl` alone has rows in `"user"` and none in `"organization"`: that is not yet a failure, it just means no browser has loaded the app under that account.

`psql` is not installed on this host; it exists only inside the database container:

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c \
  'SELECT o.slug, o.name, m.role, u.email FROM "member" m JOIN "organization" o ON o.id = m."organizationId" JOIN "user" u ON u.id = m."userId";'
```

Expected: exactly one row — slug `personal-<your user id>`, name `<your email>'s org`, role `owner`, and your email address. Substitute the role and database names from your `.env` if you did not keep the defaults.

Every identifier in that statement is double-quoted on purpose. The auth tables are created with camelCase, case-sensitive names, so `"organizationId"` unquoted would be folded to `organizationid` and not found — and `user` is a reserved word in PostgreSQL, where unquoted it means the session user rather than the table.

An empty result **after** you have loaded the app in the browser is a failed bootstrap to investigate, never expected state. The bootstrap is best-effort: it swallows its error and leaves you without an organization rather than refusing the sign-in, so the only record is a server log line. Grep the server output for:

```
[BetterAuth] Failed to bootstrap personal organization for user
```

You will see `organization_required` in the app until it succeeds.

One failure nearby looks like a different problem than it is: sign-in requests answered with `503 {"error":"auth_unavailable"}` read like a bad `BETTER_AUTH_SECRET`, but mean the auth schema migrations could not run. The server log says `[BetterAuth] Failed to run auth schema migrations; auth stays unavailable until this succeeds.` — and that one line covers every reason the migration failed. Check first that the database is running and reachable at the address in `DATABASE_URL` (step 2's health check); only then suspect the role's right to create tables.

### 5 — The credential-encryption rule

`FACTORY_CREDENTIAL_ENCRYPTION_KEY` has to be in `.env` and in force **before** the first credential is stored — the first model-provider API key saved from Settings, and equally any custom-provider key, GitHub token or integration OAuth token. Nothing refuses the write when the key is missing: the server warns twice at boot and then persists those secrets as readable plaintext in the database.

Setting the key afterwards does not repair what is already there, and what it does instead is worse than doing nothing. The next boot does sweep the stored credentials and encrypt every row that is not already encrypted — but the plaintext writer stored the value in a form that sweep re-encodes a second time, so the row comes back as an unusable string and the credential stops working. Either way the secret sat on disk in the clear until then. If a credential was saved before the key was in place, treat it as exposed — rotate it at the provider, delete the stored copy, and save the new one with the key in force. Encrypted values are recognizable by the literal prefix `mastra:factory-secret:v1:`; a plaintext row is readable JSON.

Copy the key somewhere off this machine before you use it — a password manager, never this repository. `.env` is gitignored and is the only copy on disk, so losing this machine loses the key and every credential encrypted with it at the same time, and the stored credentials are unreadable without it. Preserve it across restarts and deployments.

### 6 — Where agent sessions run

Add these three to `.env` before opening the first session, then restart the server:

```dotenv
FACTORY_SANDBOX_PROVIDER=docker
FACTORY_SANDBOX_IMAGE=factory-sandbox:<YYYY-MM-DD>
MASTRACODE_MAX_SANDBOXES=3
```

These can equally go into step 1's block, alongside the seven values there, which saves the restart — they are a separate step only because they are the first ones that need an image to exist, and nothing before this point uses them.

`sandbox/README.md` is where each of these values comes from — it covers building the image the second line names, the tag history the date comes from, and how the third number is chosen against this host's memory. It is not restated here; the point of this step is that the keys have to be set at all.

With `FACTORY_SANDBOX_PROVIDER` unset the server does not stop, warn, or ask. It falls through to running sessions as the server process on **this host**, which means the agent's checkout, its `node_modules` and every command it runs land on this machine's filesystem rather than inside a container — and with a stray `MASTRA_PROJECT_ID` or `E2B_API_KEY` in `.env` it goes further and runs them on someone else's VM instead. Set to `docker`, it is checked ahead of both, so this is structural rather than a matter of keeping `.env` tidy.

`FACTORY_SANDBOX_IMAGE` has no default: with the provider set to `docker` and this blank, the first session refuses to start and the error names the key. `MASTRACODE_MAX_SANDBOXES` caps how many session containers this server process runs at once; the session past it is refused with an error naming the key, which is the intended behaviour on a host sized for three and not a fault to work around.

Checkpoint: `grep -E '^(FACTORY_SANDBOX_PROVIDER|FACTORY_SANDBOX_IMAGE|MASTRACODE_MAX_SANDBOXES)=' .env` prints all three lines with values filled in, `docker images factory-sandbox` lists the tag the second one names, and the server has been started again since you wrote them — `.env` is read once at startup, so a server still running from step 2 does not have them.

The first session is what proves this end to end, and that happens in "Run your first issue" below: once one is open, `docker ps --filter label=mastra.sandbox=true` should list a container for it, with the repository checkout inside that container rather than anywhere on this host.

## Run your first issue

1. Open **Settings → Work Intake → GitHub issues**. Enable **Sync GitHub issues** and select your repository. Each teammate chooses their own issue sources.
1. Create a small GitHub issue, such as adding contribution guidance to the repository's README.
1. Find the issue in **Work → Intake**, select **Investigate**, and open its session to follow the agent's work.

Continue with the [issue-to-pull-request walkthrough](https://factory.mastra.ai/#create-your-first-pull-request) to review a plan and take the change through implementation and pull request review.

## Configure your Factory

Choose authentication, storage, and sandboxes independently. Model providers and issue sources are configured through the Factory UI. Server settings live in `.env`; restart the server after changing them.

| Configuration                                              | What you can change                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Models](https://factory.mastra.ai/configure/models)       | Provider access, personal or organization credentials, and the default model. |
| [GitHub](https://factory.mastra.ai/configure/github)       | Repository access and personal issue intake.                                  |
| [Linear](https://factory.mastra.ai/configure/linear)       | Workspace connection, project selection, and routing issues to a Factory.     |
| [Slack](https://factory.mastra.ai/configure/slack)         | App setup, account linking, and starting sessions from Slack.                 |
| [Auth](https://factory.mastra.ai/configure/auth)           | This deployment's own sign-in — see "Start the Factory Server" above.         |
| [Storage](https://factory.mastra.ai/configure/storage)     | The database connection or Factory storage adapter.                           |
| [Sandboxes](https://factory.mastra.ai/configure/sandboxes) | Mastra platform, local execution, or another Mastra sandbox provider.         |

The generated server uses `DATABASE_URL` for PostgreSQL with pgvector. To use the included local PostgreSQL service, start from `.env` — copy `.env.example` to `.env` if you have not already — and set the three values `docker-compose.yml` reads from it:

- `POSTGRES_PASSWORD` — the database role's password. There is no default, and Compose reads `docker-compose.yml` for every command, so `npm run db:up`, `npm run db:down` and any other `docker compose` call stop with an error naming the variable until you set it. Generate a long random value with `openssl rand -hex 32` rather than choosing a memorable one; hex output stays safe in the connection URL below, in `.env`, and in Compose's own interpolation, which characters like `/`, `$` and `#` do not. Keep it only in `.env`.
- `POSTGRES_USER` — the role the database is created with. Defaults to `factory`. Keep it to letters, digits and underscores: Compose expands a `$` while reading `.env`, and a `"` breaks the health check command the value is interpolated into.
- `POSTGRES_DB` — the database name. Defaults to `mastracode_web`.

Then run `npm run db:up` and set `DATABASE_URL` in the same `.env` to match the three values in use, for example `postgres://factory:<password>@127.0.0.1:54329/mastracode_web`. The service publishes port `54329` on loopback only, so nothing else on the network can reach it.

The container applies all three values only when it initializes an empty data volume, so they fix the role, password, and database name at the first `npm run db:up` and are ignored on every later start. Changing one afterwards does not rename or re-password anything. To start over, run `docker compose down -v` — this deletes the database's contents — then `npm run db:up` again.

If `POSTGRES_PASSWORD` goes missing from `.env` after the first start, no `docker compose` command runs — `npm run db:down` included — while the container keeps restarting and holding port `54329`. Put any value back in `.env` to regain control of it (the running database keeps the password it was created with, so `DATABASE_URL` still needs the original), or stop it directly with `docker stop mastracode-web-db && docker rm mastracode-web-db`.

Mastra platform sandboxes use `MASTRA_PLATFORM_ACCESS_TOKEN` or `MASTRA_PLATFORM_SECRET_KEY`, together with `MASTRA_PROJECT_ID` and `MASTRA_ENVIRONMENT_ID`. Two overrides in `.env` keep sessions on the Factory Server's machine instead, and either one wins over the platform variables above:

```dotenv
FACTORY_SANDBOX_PROVIDER=docker
```

runs each session in its own container on the Docker engine that machine talks to — the isolated option, and the one this deployment is built for. It needs a container image to run; `sandbox/README.md` covers building one and the values that configure it.

```dotenv
FACTORY_SANDBOX_PROVIDER=local
```

runs commands directly as the server process instead, with no isolation between sessions. Install Git and your repository's build tools on that machine.

For this deployment the procedure is step 6 of "Start the Factory Server" above, not a choice between these two: `docker` is the value it sets, an unset key puts the agent's checkout on this host rather than in a container, and a third key — `MASTRACODE_MAX_SANDBOXES` — caps how many session containers run at once. `sandbox/README.md` owns all three values.

Neither affects sign-in: this deployment authenticates against its own database, as "Start the Factory Server" describes, and storage is the `DATABASE_URL` Postgres. The separate `SANDBOX_PROVIDER` setting selects the backend used by Mastra platform sandboxes.

## Deploy

### Mastra platform

Deploy the Factory Server to your Mastra platform project:

```bash
npm run deploy
```

The CLI reports the deployed Factory URL. See [Deployment](https://factory.mastra.ai/deployment) for environment configuration and deployment options.

### Self-host

Run Factory as a persistent Node.js service on a virtual machine or in a container. Configure persistent storage and set `MASTRACODE_PUBLIC_URL` to the public HTTPS origin. Supply your provider credentials through the deployment environment, then build and start the server:

```bash
npm run build
npm run start
```

Keep the generated project's CLI dependencies installed for these commands. You can use Mastra platform services while hosting the Factory Server elsewhere. See [self-hosting](https://factory.mastra.ai/deployment#self-host) for runtime requirements and setup steps.

## Scripts

| Script                              | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `npm run dev`                       | Start the local Factory Server with its UI and API.  |
| `npm run check`                     | Typecheck the Factory Server.                        |
| `npm run build`                     | Build the server and Factory UI in `.mastra/output`. |
| `npm run start`                     | Run the production build.                            |
| `npm run deploy`                    | Build and deploy to Mastra platform.                 |
| `npm run db:up` / `npm run db:down` | Start or stop the optional local PostgreSQL service. |

## Troubleshooting

- **Runtime:** Use a Node.js version that matches `engines.node` in this project's `package.json`.
- **Sign-in:** A `403` with `Invalid origin` in the log, a `503 {"error":"auth_unavailable"}`, `organization_required` in the app, a **Sign in with Mastra Platform** button where the email/password form should be, or a boot warning about credentials being stored as plaintext — each is diagnosed in the numbered steps under "Start the Factory Server" above.
- **No way to create an account:** **Account creation is managed by your administrator.** on `/signin` with no sign-up toggle, or a `400` `EMAIL_PASSWORD_SIGN_UP_DISABLED` from `/auth/api/sign-up/email`, is registration working as intended — it is closed in committed code, not by anything in `.env`. Step 3 above is the procedure for opening it deliberately and closing it again.
- **Sessions:** A session that will not start with an error naming `FACTORY_SANDBOX_IMAGE` or `MASTRACODE_MAX_SANDBOXES`, a pull failure against Docker Hub for a `factory-sandbox:` tag, or a checkout appearing on this host instead of in a container — each is diagnosed in `sandbox/README.md`, and step 6 above is the configuration all of them depend on.
- **Port changes:** Set `PORT` and update `MASTRACODE_PUBLIC_URL` to match. Update callback URLs for any auth or integration apps you manage.
- **Missing issues:** Check repository access and your **Work Intake** selections. See [intake troubleshooting](https://factory.mastra.ai/troubleshooting#intake-is-empty).

See [Troubleshooting](https://factory.mastra.ai/troubleshooting) for sign-in, provider access, and sandbox errors, or [Environment variables](https://factory.mastra.ai/reference/configuration) for server settings.

## License

Apache-2.0
