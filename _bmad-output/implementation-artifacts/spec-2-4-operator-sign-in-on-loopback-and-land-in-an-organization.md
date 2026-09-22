---
title: 'Story 2.4: [operator] Sign in on loopback and land in an organization'
type: 'chore'
created: '2026-09-23'
status: done
baseline_revision: '9e9478fe2755232c6fa422c87f3abb2a178f565c'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `MASTRA_HOST` and `PORT` appear in neither `.env.schema` nor `.env.example`, so "copy
      `.env.example` to `.env`" cannot produce two of the seven values the first sign-in needs, and
      `.env.example`'s header still tells the reader every value is optional.
    evidence: |-
      `grep -nE 'MASTRA_HOST|^PORT' .env.schema .env.example` returns nothing, while `README.md`'s
      step 1 now requires both. `.env.example:2-3` reads "every value is optional — features light up
      as their variables are set", which is false for these two on the loopback path: unset,
      `MASTRA_HOST` puts the open sign-up form on every interface and an unset `PORT` lets the CLI
      drift off the origin `MASTRACODE_PUBLIC_URL` names. `AGENTS.md:61-63` makes `.env.schema` the
      only list of keys, so an undeclared key the committed procedure requires is off-list by the
      repo's own rule.
      Not done here: `epics.md:681-684` is Story 3.2's acceptance criterion verbatim — "`MASTRA_HOST`
      and `PORT` are declared in `.env.schema` rather than left undeclared … and their values are
      marked `@public`". Declaring them in this story would take that criterion. Verified this session
      that the gap is inert for the path this story documents: `varlock load --format json` against a
      `.env` carrying both keys exits 0 and passes both through, and `npm run dev` never consults the
      schema at all.
    location: >-
      .env.schema / .env.example vs README.md "Start the Factory Server" step 1
    severity: low
operator_actions:
  - >-
    Precondition — Story 1.4's engine steps must already be done and holding: Colima running,
    `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"` in the shell you use, and
    `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db` reporting `healthy`.
    Nothing below can work without a reachable Postgres. See `ops/README.md`.
  - >-
    Compose `.env` at the repository root with the seven values README.md's "Start the Factory Server"
    step 1 lists: `MASTRA_HOST=127.0.0.1`, `PORT=4111`,
    `MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111`, `DATABASE_URL` matching the `POSTGRES_*` values the
    container was created with, `BETTER_AUTH_SECRET` and `FACTORY_CREDENTIAL_ENCRYPTION_KEY` from two
    separate runs of `openssl rand -base64 32`, and `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1`. Today
    only the three `POSTGRES_*` values and the two `.env.example` defaults are set, so all five of the
    others are new. Leave `NODE_ENV`, `MASTRACODE_AUTH_DISABLED`, `MASTRACODE_ALLOWED_ORIGINS`,
    `MASTRA_SHARED_API_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` unset — each one breaks sign-in or
    credential encryption silently, and README step 1 says how. Also check for a stale `.env.local` or
    `.env.development`, and for any of these keys already exported in your shell: both beat `.env`
    with nothing logged. Copy `FACTORY_CREDENTIAL_ENCRYPTION_KEY` into a password manager off this
    machine before using it.
  - >-
    Install and start, from the repository root: `npm ci` (the main checkout's `node_modules` predates
    Stories 2.2 and 2.3, so the auth provider is not installed there yet), then `npm run db:up` and
    `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db` (expect `healthy`), then
    `npm run dev`. Once it is up, confirm the bind with `lsof -nP -iTCP:4111 -sTCP:LISTEN`: it must
    show `127.0.0.1:4111`, not `*:4111`. `*` means `MASTRA_HOST` did not reach the server and the open
    sign-up form is on every interface — stop, fix `.env`, restart.
  - >-
    Checkpoint 1 — sign in. Open `http://127.0.0.1:4111/signin` by typing it; the banner prints
    `http://localhost:4111`, and using that origin produces a `403` with `Invalid origin:
    http://localhost:4111` in the server log. Expected: the heading "Welcome back" over an
    email/password form with a "New here? Sign up" toggle. A single "Sign in with Mastra Platform"
    button instead means `BETTER_AUTH_SECRET` did not reach the server (typo or blank) — fix `.env`
    and restart rather than proceeding. Use the toggle, which adds a required "Name" field above
    "Email" and "Password"; the password must be at least 8 characters. Then "Create account". Create
    exactly one account, yours: registration stays open until Story 2.6 closes it.
  - >-
    Checkpoint 2 — the organization. After the app has loaded in the browser, run
    `docker exec mastracode-web-db psql -U factory -d mastracode_web -c 'SELECT o.slug, o.name, m.role,
    u.email FROM "member" m JOIN "organization" o ON o.id = m."organizationId" JOIN "user" u ON u.id =
    m."userId";'` (substituting the role and database names in use). Expected: exactly one row — slug
    `personal-<user id>`, name `<your email>'s org`, role `owner`. An empty result after a browser
    session is a failed bootstrap to investigate, never expected state: grep the server output for
    `[BetterAuth] Failed to bootstrap personal organization for user`. If sign-in requests returned
    `503 {"error":"auth_unavailable"}`, look instead for `[BetterAuth] Failed to run auth schema
    migrations` — that one line covers every migration failure and is not a bad secret. Confirm the
    database is running and reachable at the address in `DATABASE_URL` first; only then suspect the
    role's right to create tables.
  - >-
    Before saving any model-provider API key, confirm `FACTORY_CREDENTIAL_ENCRYPTION_KEY` was in `.env`
    at the boot you are using. Nothing refuses the write when it is missing; the credential is stored
    as readable plaintext. Setting the key later does not repair the row — the next boot re-encrypts
    it, but double-encodes what the plaintext writer stored, so the credential stops working and the
    secret was on disk in the clear either way. Rotate it at the provider, delete the stored copy, and
    save it again with the key in force.
  - >-
    Report back: whether `/signin` showed the email/password form, the organization row the SQL
    returned (or the log line it did not), and any value you had to change from the README's `.env`
    block — especially if `DATABASE_URL` or the port differed from what step 1 assumes.
---

<intent-contract>

## Intent

**Problem:** Story 2.3 wired `MastraAuthBetterAuth`, but nothing committed tells the operator how to
actually reach it. `README.md:27` still says "open the local URL printed by the server and sign in through
Mastra platform" — false since 2.3. Worse, every input the first sign-in needs is either unset or wrong in
the machine's `.env` (only `POSTGRES_USER`/`_PASSWORD`/`_DB` carry values), and four separate traps sit
between `npm run dev` and a signed-in operator holding an organization: `mastra factory dev` forces
`NODE_ENV=production` into the child, so an unset `DATABASE_URL` aborts boot; an unset `MASTRA_HOST` binds
**all** interfaces, so the open sign-up form would be LAN-reachable during the one window it is open;
Better Auth trusts only the `MASTRACODE_PUBLIC_URL` origin while the CLI prints `http://localhost:4111`;
and the personal organization is not created by the sign-up POST at all, so a `curl`-only account looks
like a bootstrap failure.

**Approach:** The only agent-executable part of this story is committed operator documentation. Rewrite
`README.md`'s "Start the Factory Server" section into this deployment's actual first-sign-in procedure —
the `.env` values the first `npm run dev` needs and what each must contain, the exact browser origin, the
sign-up affordance the SPA renders while `signUpEnabled: true`, the organization checkpoint with
copy-pasteable SQL, and the credential-encryption rule and its one-way hazard. Then park the story at
`awaiting-operator` with those steps and their checkpoints in `operator_actions:`.

## Boundaries & Constraints

**Always:**
- `README.md` is the owning subject README for `MASTRACODE_PUBLIC_URL`, `DATABASE_URL`,
  `BETTER_AUTH_SECRET` and the `FACTORY_CREDENTIAL_ENCRYPTION_*` group — it already owns the three
  `POSTGRES_*` values (`README.md:39-79`) and already carries the credential-key prose
  (`README.md:13-19`). It states **what a value must contain and how to obtain it**; `.env.schema` keeps
  validation, `@public`/`@sensitive` marking and the key list (AD-6 / NFR7). Neither restates the other.
- The `.env` composition this story documents is the loopback subset of the contract's `.env` target
  state (`docs/Self-hosting research.md:526-548`): `MASTRA_HOST=127.0.0.1`, `PORT=4111`,
  `MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111`, `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `FACTORY_CREDENTIAL_ENCRYPTION_KEY`, `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID`.
- Every value in committed text is a placeholder or a generation command, never a real secret (NFR18).
- The organization checkpoint runs through the container (`docker exec mastracode-web-db psql …`), because
  `psql` is not installed on the host — the precedent `ops/README.md:113-117` sets.
- All SQL identifiers Better Auth creates are quoted camelCase (`"user"`, `"member"`,
  `"organization"`, `"userId"`, `"organizationId"`), so every statement in the README must quote them.
- A missing organization is a failed bootstrap to investigate, never expected state — the README names the
  exact `console.warn` to grep for.

**Never:**
- Never declare `MASTRA_HOST` or `PORT` in `.env.schema` or `.env.example`: Story 3.2's acceptance
  criterion is that *it* declares both (`epics.md:681-684`). This story only tells the operator to set
  them in `.env`, which `npm run dev` reads through plain `dotenv` with no schema in the path.
- Never edit `src/`, `package.json`, `package-lock.json`, `.env.schema`, `.env.example`,
  `docker-compose.yml`, `tsconfig.json`, `sandbox/`, `ops/`, `docs/`, `AGENTS.md`,
  `.bmad-loop/policy.toml` or `sprint-status.yaml`. No code changes this story, so no new tests: there is
  no new behaviour to pin and the entry is untouched.
- Never flip `signUpEnabled` — Story 2.6 owns that, and this story is the window in which it must still be
  `true`.
- Never start the server, create the account, or open a database connection from this session: there is no
  `.env`, no `node_modules` and no engine in a story worktree. Those are operator actions.
- Never set `MASTRACODE_ALLOWED_ORIGINS`: a non-empty value puts Better Auth in cross-site mode
  (`SameSite=None; Secure`), which a browser drops over plain HTTP, so sign-in would appear to succeed and
  keep no session.
- Never instruct `npm run start`, `npm run build` or `varlock run` — `MASTRA_HOST` and `PORT` are
  undeclared until Story 3.2, and the contract's production path is that story's.

</intent-contract>

## Operator-observable states

Not an I/O matrix: no first-party code changes here, so none of these is a unit under test. Each row is a
state of the *running deployment* — reachable only with a real `.env`, a live engine and a browser — and
together they are the failure surface the rewritten README section has to cover. Every claim below was
read out of the installed packages in this worktree after `npm ci`; the anchors are in the Code Map.

| Scenario | Input / State | What the operator sees | Where it surfaces |
|----------|--------------|---------------------------|----------------|
| First sign-in, happy path | `.env` carries all seven values; `npm run dev` from the repo root; browser at `http://127.0.0.1:4111/signin` | "Welcome back" with an email/password form and a **New here? Sign up** toggle; **Create account** posts `/auth/api/sign-up/email`; the SPA's follow-up `GET /auth/me` creates the personal org | No error expected |
| `DATABASE_URL` unset | everything else set | boot aborts | `DATABASE_URL is required outside local development and tests.` — `mastra factory dev` forces `NODE_ENV=production` into the child, so the bare-dev libSQL arm is unreachable |
| `BETTER_AUTH_SECRET` unset or blank | `.env` otherwise complete | `/signin` shows a single **Sign in with Mastra Platform** button, no email/password form | No throw: `selectAuth()` falls through to the platform-backed default provider (`src/mastra/index.ts:162-201`). A typo in the key name lands here silently |
| Browser opens `http://localhost:4111` | server bound to `127.0.0.1`, `MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111` | sign-in is refused `403` | Server log: `Invalid origin: http://localhost:4111` — the only trusted origin is the `baseURL` origin |
| Port drifts off 4111 | `PORT` unset and 4111 already in use | the CLI silently picks 4112-4131; every request then arrives on an untrusted origin | Avoided by pinning `PORT=4111`, which fails loudly with `EADDRINUSE` instead |
| `MASTRA_HOST` unset | `npm run dev` | the server binds **every** interface, LAN included, while sign-up is open | No error — nothing reports it. `bindHost` is `undefined`, passed straight to `server.listen` |
| Account created by `curl` only | sign-up POST succeeds, no browser request follows | rows in `"user"`/`"account"`/`"session"`, **zero** rows in `"organization"`/`"member"` | Not a bootstrap failure: the org is created by `ensureUserOrg`, which only runs on `/auth/me` or a gated request |
| Org bootstrap genuinely fails | first authenticated request made, `"member"` still empty | the user sees `organization_required` | Server log: `[BetterAuth] Failed to bootstrap personal organization for user <id>. …` — investigate, do not accept |
| Auth migrations cannot run | `DATABASE_URL` role lacks `CREATE` on the schema | `/signin` posts return `503 {"error":"auth_unavailable"}`, which reads like a bad secret | Server log: `[BetterAuth] Failed to run auth schema migrations; auth stays unavailable until this succeeds.` |
| Credential key unset at first credential | a provider API key saved from Settings → Models | the key is persisted as readable plaintext in `model_provider_credentials.data` | Two `console.warn`s at boot only (`src/mastra/index.ts:72-79`, `@mastra/factory/dist/factory.js:188`); nothing refuses the write |
| Credential key wrong length | `FACTORY_CREDENTIAL_ENCRYPTION_KEY` decodes to ≠ 32 bytes | boot aborts | `FACTORY_CREDENTIAL_ENCRYPTION_KEY must contain base64-encoded 32-byte keys.` (`src/mastra/index.ts:64-67`) |

## Code Map

- `README.md` -- **the whole change.** `## Start the Factory Server` spans lines 9-29 and is the only
  section rewritten. `:11` is installer prose about `npm create factory`. `:13-19` is the existing
  credential-key paragraph (generate with `openssl rand -base64 32`, keep a protected backup) — fold it
  into the new procedure rather than duplicating it. `:21-25` is `npm run dev`. **`:27` is the false
  sentence**: "open the local URL printed by the server and sign in through Mastra platform". `:29` sends
  the reader to hosted docs for "alternative authentication". Downstream sections to leave alone:
  `## Run your first issue` (31-37), `## Configure your Factory` (39-79, which already owns the
  `POSTGRES_*` and `FACTORY_SANDBOX_PROVIDER` prose and states the `DATABASE_URL` shape at `:77`),
  `## Deploy` (81-103), `## Scripts` (104-113), `## Troubleshooting` (115-121).
- `ops/README.md` -- **read-only precedent.** The house style for an operator procedure: a "What the value
  must contain / How to obtain it" pair per key, a numbered bring-up, then numbered checkpoints each with
  its command and its expected output. `:113-117` is the `docker exec mastracode-web-db psql …` form
  (`psql` exists only inside the container). `:78-84` is the "Before you start" preconditions block.
- `sandbox/README.md` -- **read-only precedent.** Same shape, one `##` heading per env key it owns.
- `.env.schema` -- **read-only, must not be edited.** Already carries the Better Auth section (168-193:
  open registration, lazy first-use DDL and the table-creation right it needs, best-effort org bootstrap,
  the `MASTRACODE_ALLOWED_ORIGINS` cross-site trap) and the credential-encryption section (77-96, with
  `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1` as the only defaulted assignment). The README states values and
  commands; it does not restate this file's validation or marking.
- `src/mastra/index.ts` -- **read-only, the observable behaviour.** `:64-67` the base64/32-byte throw.
  `:70-100` `credentialEncryption()`: `:71` the one `FACTORY_CREDENTIAL_ENCRYPTION_KEY` read, `:72-79` the
  plaintext warning, `:90` `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID` defaulting to `'v1'`. `:162-201`
  `selectAuth()`; `:170` the one `BETTER_AUTH_SECRET` read, trimmed, blank → fall through. `:204`
  `secretEncryption`. `:418` `databaseUrl`; `:425-428` **`throw new Error('DATABASE_URL is required
  outside local development and tests.')` whenever `NODE_ENV` is neither `development` nor `test`**;
  `:430-439` Postgres vs libSQL storage. `:508` `publicUrl: process.env.MASTRACODE_PUBLIC_URL`.
- `node_modules/mastra/dist/index.js` -- **read-only, the dev-server contract.** `:4286-4297`
  `getEnvFiles()` → `.env`, `.env.local`, `.env.development` (later wins), resolved against `cwd`, all via
  `dotenv.parse` — no varlock, no schema. `:4407-4432` `createEnvironmentState`: a key already in the
  shell environment **wins over `.env`**. `:4707-4715` `portToUse = serverOptions?.port ?? process.env.PORT`,
  and only when that is missing or `NaN` does it scan **4111-4131** for a free port; `hostToUse` is
  `HOST ?? "localhost"` and is **display only**. `:4498-4514` the child's env, where `:4502` forces
  `PORT` and `NODE_ENV: env.get("NODE_ENV") ?? "production"` — the reason `DATABASE_URL` is mandatory
  under `npm run dev`. `:4157-4168` the printed banner, which always says `http://localhost:<port>`.
- `node_modules/@mastra/deployer/dist/server/index.js` -- **read-only, the binding.** `:4715`
  `const bindHost = serverOptions?.host ?? process.env.MASTRA_HOST;` `:4716` `const host = bindHost ??
  "localhost"` is log text only; `:4724` `hostname: bindHost` goes straight to `server.listen`, so
  `undefined` means every interface. The entry passes no literal `server:` key to `new Mastra(...)`
  (`src/mastra/index.ts:527-532`) and `factory.prepare()`'s server config carries no host or port, so
  `MASTRA_HOST` is the only lever.
- `node_modules/@mastra/auth-better-auth/dist/index.js` -- **read-only, verified after `npm ci` in this
  worktree.** `:475-502` `init()` builds `betterAuth({ database, secret, basePath: '/auth/api',
  baseURL: ctx.publicUrl, emailAndPassword: { enabled: true, disableSignUp: false },
  plugins: [organization()] })` — **no `schema`, `modelName` or `usePlural` override**, so table names are
  the defaults, and `trustedOrigins` is passed only when `allowedOrigins` is non-empty. `:505-521`
  `#ensureDbReady()` — lazy migrations, `:518` the migration-failure warning, `:529-534` the `503
  auth_unavailable` it produces. `:593-671` `ensureOrganization`: `:601` returns the oldest existing
  membership and creates nothing; `:606-611` `name` = `` `<email>'s org` ``, `metadata` =
  `{"mastraPersonalOrg":"true"}`, `slug` = `personal-<userId>`; `:644-652` the `member` row with
  `role: 'owner'`; `:668` the exact bootstrap-failure warning.
- `node_modules/@mastra/auth-better-auth/node_modules/better-auth/dist/context/helpers.mjs:74` --
  **read-only.** `trustedOrigins.push(new URL(baseURL).origin)` — with `MASTRACODE_ALLOWED_ORIGINS` unset
  the *only* trusted origin is `MASTRACODE_PUBLIC_URL`'s. `api/middlewares/origin-check.mjs` `validateOrigin`
  logs `Invalid origin: <origin>` and throws `INVALID_ORIGIN` (403) for any cookie-bearing non-GET from
  elsewhere — which is why `localhost` and `127.0.0.1` are not interchangeable here.
- `node_modules/@mastra/auth-better-auth/node_modules/better-auth` schema -- **read-only.** Core tables
  `user`, `session`, `account`, `verification`; organization plugin adds `organization`, `member`,
  `invitation` plus `session.activeOrganizationId`. The Kysely `PostgresDialect` is built with no
  `CamelCasePlugin` and no `schemaName`, so every identifier lands **quoted, case-sensitive**: `"user"`,
  `"member"."organizationId"`, `"organization"."slug"`.
- `node_modules/@mastra/factory/dist/auth.js` -- **read-only.** `:178-187` `ensureUserOrg` → the provider's
  `ensureOrganization`. Call sites: `:301` inside `GET /auth/me`, `:544` inside the route gate, `:270` for
  public routes that resolve a user — **never** the `/auth/api/*` proxy at `:375-381`, so a sign-up POST
  alone creates no org. `:289-294` `/auth/me` reports `provider` and omits `signUpDisabled` entirely while
  sign-up is enabled. `:536-537` `/login` redirects to `/signin`, and `/signin` plus `/assets/*` are the
  unauthenticated allow-list.
- `node_modules/mastra/dist/factory/assets/index-DbZ8psQ5.js` -- **read-only, the SPA.** `:1341`
  `path:"/signin"`. `:1340` renders the email/password form only when `provider === "better-auth"`, with
  the heading **Welcome back**; the ghost toggle **New here? Sign up** / **Have an account? Sign in** is
  rendered only while `signUpDisabled` is falsy, and the sign-up submit reads **Create account**. Once
  Story 2.6 lands, that toggle is replaced by *Account creation is managed by your administrator.*
- `node_modules/@mastra/factory/dist/factory.js` -- **read-only.** `:188` the second plaintext-credential
  warning, `:189` `createPlaintextFactorySecretEncryption()` as the silent fallback. Encrypted values carry
  the literal prefix `mastra:factory-secret:v1:`; plaintext rows are the readable JSON.
- **Machine state observed this session** (the reason several steps below are not optional): the operator's
  `.env` at the main checkout assigns only `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — plus the
  two values `.env.example` ships uncommented (`FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1`,
  `MASTRACODE_SANDBOX_WORKDIR=/workspace`). `DATABASE_URL`, `MASTRACODE_PUBLIC_URL`, `BETTER_AUTH_SECRET`,
  `FACTORY_CREDENTIAL_ENCRYPTION_KEY`, `MASTRA_HOST`, `PORT` and `DOCKER_HOST` are all unset. That
  checkout's `node_modules` also predates Stories 2.2 and 2.3 — neither `@mastra/docker` nor
  `@mastra/auth-better-auth` is installed there — so `npm ci` has to run before the first `npm run dev` or
  the entry cannot even import its auth provider.
- Baseline revision `9e9478fe2755232c6fa422c87f3abb2a178f565c`; tree clean at start.

## Tasks & Acceptance

**Execution:**
- `README.md` -- rewrite `## Start the Factory Server` (lines 9-29) as this deployment's first-sign-in
  procedure, keeping the existing heading and the surrounding sections untouched. It must carry, in order:
  (1) one paragraph replacing `:27`'s platform claim — sign-in is this deployment's own, served at
  `/signin` from tables in its own Postgres, with no redirect anywhere; (2) a `.env` block of the seven
  loopback values with placeholders and the `openssl rand -base64 32` generation command, stating for each
  what it must contain and how to obtain it, why `MASTRA_HOST` is the literal `127.0.0.1` rather than
  `localhost`, why `PORT` is pinned, that `MASTRACODE_ALLOWED_ORIGINS` and `MASTRA_SHARED_API_URL` stay
  unset, and that `MASTRA_HOST`/`PORT` are not in `.env.schema` yet so this is the `npm run dev` path
  only; (3) the start step, including `npm ci` when the tree has moved and the instruction to open
  `http://127.0.0.1:4111/signin` even though the banner prints `localhost`; (4) the account step naming the
  **New here? Sign up** toggle and the **Create account** submit, and that this is the single account
  because registration is open until it is closed in a later change; (5) the organization checkpoint with
  the `docker exec … psql` SQL, the expected one-org result, and the exact warning to grep for when it is
  empty, plus the note that the org appears on the first authenticated request rather than on sign-up;
  (6) the credential-encryption rule — key set before the first credential is stored, escrowed off the
  machine, and the one-way hazard of enabling it after plaintext rows exist -- because `README.md:27` is
  actively false after Story 2.3, and every other fact above is invisible from the repository yet decides
  whether the first sign-in works at all.

**Acceptance Criteria:**
- Given `README.md:27` claims sign-in goes through Mastra platform, when the committed `README.md` is
  read, then no sentence says this deployment signs in through Mastra platform or points the reader at
  hosted docs to configure "alternative authentication", and the sign-in path named is `/signin` against
  this deployment's own Postgres.
- Given the operator must compose `.env` before the first start, when the rewritten section is read, then
  `MASTRA_HOST`, `PORT`, `MASTRACODE_PUBLIC_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `FACTORY_CREDENTIAL_ENCRYPTION_KEY` and `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID` each appear with what the
  value must contain and how to obtain it, and `MASTRA_HOST` is the literal `127.0.0.1` with the reason
  that an unset value binds every interface.
- Given Story 3.2 owns declaring the ingress keys (`epics.md:681-684`), when `.env.schema` and
  `.env.example` are diffed against `9e9478f`, then neither file changed, and `MASTRA_HOST` and `PORT` are
  declared in neither.
- Given this story changes no behaviour, when the diff against `9e9478f` is read, then `README.md` is the
  only file changed apart from this spec, and nothing under `src/`, `package.json`, `package-lock.json`,
  `sandbox/`, `ops/`, `docs/`, `AGENTS.md`, `docker-compose.yml` or `.bmad-loop/` is touched.
- Given `ensureOrganization` is best-effort and swallows every failure, when the organization checkpoint is
  read, then it states that exactly one organization is expected, gives SQL whose identifiers are quoted
  camelCase, and names an empty result a failed bootstrap to investigate with the log line to grep for —
  never expected state.
- Given the org is created by `ensureUserOrg` on `/auth/me` or a gated request and never by the
  `/auth/api/*` proxy, when the checkpoint is read, then it says the organization appears after the first
  authenticated browser request, so an empty table immediately after a non-browser sign-up is not yet a
  failure.
- Given credentials must never be stored unencrypted (NFR14), when the credential-encryption text is read,
  then it requires the key to be set before the first credential is stored, requires it to be copied
  somewhere outside this machine, and states that enabling it after plaintext rows already exist does not
  repair them.
- Given secrets never enter the repo (NFR18), when the full diff against `9e9478f` is read, then no added
  line carries a usable password, key, token or connection string with a real password in it, and `.env`
  stays gitignored.
- Given registration must still be open for this story (NFR13), when the diff is read, then
  `signUpEnabled: true` in `src/mastra/index.ts` is unchanged and the README describes a visible sign-up
  affordance rather than a closed one.
- Given the verify gate, when `npm ci --no-audit --no-fund`, `npm run check`, `npx varlock load --format
  json`, both path guards and `npm test` run in order in a worktree with no `node_modules/`, then every one
  exits 0 and the 46 existing tests still pass.
- Given the sign-in, the account creation and the organization check all require a running server, a
  running engine and a real `.env`, when this session finishes its committable work, then the story parks
  at `awaiting-operator` with the `.env` composition, the start step and both checkpoints enumerated in
  `operator_actions:`.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 30 findings — high 0, medium 15, low 15, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `README.md:101` claims there is no re-encryption pass over plaintext credential rows — Refuted by the code: `ModelCredentialsStorage.init()` reads every `model_provider_credentials` row and `#migrateCredential` re-encrypts whenever `decrypt()` reports `needsReencryption` (`@mastra/factory/dist/storage/domains/credentials/base.js:95-98,109-115`), and `secret-encryption.js:46-50` reports exactly that for any value without the `mastra:factory-secret:v1:` prefix. Because the plaintext writer stored `JSON.stringify(value)` (`:71-73`) and `encrypt` stringifies again (`:37`), the sweep double-encodes and the row returns as a string, not a credential. Patched: step 5 now states the real mechanism and keeps the rotate/delete/re-save advice.
  - `[low]` `[patch]` Step 3 said "enter an email address and a password", omitting the required Name field and the password minimum — Verified in the shipped SPA: the `r==="sign-up"` branch renders a `required` Name input (placeholder "Ada Lovelace") above Email and Password, and better-auth rejects under 8 characters (`create-context.mjs:186`, `api/routes/sign-up.mjs:152-156`). Patched: all three fields and the minimum are named.
  - `[medium]` `[patch]` The numbered bring-up reaches `npm run dev` with no step that starts Postgres and no engine precondition — Verified: the only `npm run db:up` reference was a forward pointer inside the `DATABASE_URL` bullet aimed at a section 90 lines later. Grouped with the two edge-case rows and the verification-gap row below. Patched: a "Before you start" engine/`DOCKER_HOST` line plus `npm run db:up` and the `docker inspect … Health.Status` check as explicit parts of step 2.
  - `[medium]` `[patch]` `MASTRACODE_AUTH_DISABLED` missing from the must-stay-unset list — Verified: `src/mastra/index.ts:163` returns `null` for the string `1`, and `:204` (`auth === null ? undefined : credentialEncryption()`) then drops credential encryption with it, so every credential persists as plaintext regardless of the key — directly against this story's NFR14 criterion. It is declared in neither env file, so the README is the only possible warning site. Patched: added as a fourth must-stay-unset key with both consequences.
  - `[low]` `[patch]` The varlock paragraph asserted an unverified consequence, and the Self-host section still instructs `npm run start` — Verified against the tool: `varlock load --format json` against a `.env` carrying `MASTRA_HOST` and `PORT` exits 0 and passes both through, so "reads `.env` through the schema" does not imply varlock cannot see them. Patched: the unverified consequence is gone; the Story 3.2 pointer and the "use `npm run dev`" instruction stay.
  - `[medium]` `[patch]` No checkpoint proves the loopback bind, and the `HOST` banner trap was unstated — Verified: `bindHost` comes only from `MASTRA_HOST` (`@mastra/deployer/dist/server/index.js:4715`) while the banner comes from `HOST` (`mastra/dist/index.js:4709`), so a reassuring message over a wide-open socket is reachable. Patched: an `lsof -nP -iTCP:4111 -sTCP:LISTEN` checkpoint expecting `127.0.0.1:4111`, plus the `HOST`-is-cosmetic clause.
  - `[medium]` `[patch]` Step 4's `docker exec` had unstated prerequisites and no link to `ops/README.md` — Same root cause as the missing-database row above; grouped with it. Patched by the same "Before you start" block, which names the engine, `DOCKER_HOST` and `ops/README.md`.
  - `[medium]` `[patch]` `.env` precedence facts omitted — Verified: `mastra/dist/index.js:4286-4297` loads `.env`, `.env.local`, `.env.development` with later winning, and `:4407-4432` skips any key already in the shell environment, logging nothing. Grouped with the restart-after-edit and stale-file rows below. Patched: a paragraph stating all three, including that files are read once at startup relative to cwd.
  - `[medium]` `[patch]` The rest of `README.md` still pointed at platform sign-in, contradicting the new opening — Verified at the "Configure your Factory" Auth row and at "With either, authentication and storage can continue to use Mastra platform." An operator reading either could set `MASTRA_SHARED_API_URL` and silently lose self-managed sign-in. Grouped with the edge-case claim row below. Patched: both corrected; the rest of those sections untouched.
  - `[low]` `[patch]` Troubleshooting gained no entry for any new failure mode — Verified: the three existing bullets are unrelated and the section's only sign-in pointer is a hosted-docs link. Patched: one **Sign-in:** bullet routing the five new symptoms back into the numbered steps.
  - `[low]` `[reject]` Step 3 hands the operator into onboarding without the sandbox configuration onboarding needs — Real but not worth a change here: `FACTORY_SANDBOX_PROVIDER=docker` and `FACTORY_SANDBOX_IMAGE` are Story 2.5's checkpoint, `sandbox/README.md` owns their values, and "Configure your Factory" already carries the docker block and links there.
  - `[low]` `[defer]` `.env.example` and `.env.schema` declare neither `MASTRA_HOST` nor `PORT`, so "copy `.env.example` to `.env`" cannot produce two of the seven required values — Real and deliberate: `epics.md:681-684` makes declaring both Story 3.2's acceptance criterion. Recorded in `deferred` with the evidence that the gap is inert for the `npm run dev` path this story documents.
  - `[low]` `[patch]` The `DATABASE_URL` sample embeds `<POSTGRES_PASSWORD>` without the constraint that makes it work — Verified: the section owning those values requires hex output precisely because `/`, `$` and `#` break both the URL and Compose interpolation. Grouped with the missing-cwd row. Patched: one clause added to the bullet.
  - `[low]` `[reject]` The removed text's hosted reference link and the `--no-platform` sentence were dropped without replacement — Both were platform-flow prose this story deliberately replaced; `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` and key rotation are documented in `.env.schema`, which owns that key list, and `npm create factory` scaffolding is not a step this deployment will ever run again.
  - `[low]` `[reject]` Spec frontmatter reads `in-review` while its own Approach requires `awaiting-operator`, and the observable-states table's evidence claim is stronger than what it verified — The status is workflow state written at each phase and set to `awaiting-operator` at finalize, not a defect; and the rest of the finding's fix is to edit this build's spec, which triage rejects by rule.
  - `[medium]` `[patch]` Step 2 runs `npm run dev` against a Postgres that was never started — Same root cause as the missing-database row; grouped with it and patched by the same change.
  - `[medium]` `[patch]` The step-1 block omits the three `POSTGRES_*` values `docker-compose.yml` requires — Same root cause; grouped. Patched by making `npm run db:up` a step and keeping the `DATABASE_URL` bullet's pointer at the section that owns those three values, rather than restating them (AD-6).
  - `[medium]` `[patch]` A stale `.env.local`/`.env.development` or an exported shell key silently overrides step 1 — Grouped with the `.env` precedence row; patched by the same paragraph.
  - `[medium]` `[patch]` A `NODE_ENV` line in `.env` wins over the dev server's production default — Verified: `NODE_ENV: env.get("NODE_ENV") ?? "production"` (`mastra/dist/index.js:4501`), so `NODE_ENV=development` makes `DATABASE_URL` optional and moves storage to a local file, where step 4's query reads as a failed bootstrap. Patched: "defaults the server to" plus an explicit leave-`NODE_ENV`-unset instruction.
  - `[medium]` `[patch]` `.env` edits need a server restart — Grouped with the `.env` precedence row; patched by the same paragraph.
  - `[low]` `[patch]` The 8-character password minimum is unmentioned — Same root cause as the Name-field row; grouped and patched together.
  - `[low]` `[patch]` `BETTER_AUTH_TRUSTED_ORIGINS` also feeds the trusted-origin list, so "nothing else" was false — Verified at `better-auth/dist/context/helpers.mjs:83-84`. Grouped with the varlock row. Patched: the claim is qualified and the key is listed as must-stay-unset.
  - `[low]` `[reject]` Sandbox selection falls through to the LOCAL provider when the docker keys are unset — Duplicate of the onboarding/sandbox row; rejected for the same reason.
  - `[low]` `[reject]` The removed onboarding sentence named **Manage GitHub connection** and the Factory-model selection — Rejected: this deployment has no GitHub App until Epic 3, so the affordance it named does nothing yet, and "Run your first issue" still covers intake.
  - `[low]` `[reject]` The `--no-platform` installer flag is no longer documented — Duplicate; rejected for the same reason.
  - `[low]` `[reject]` The stored-credential-encryption reference link was dropped — Duplicate; rejected for the same reason.
  - `[low]` `[patch]` Step 2 lost the working directory the removed text stated — Verified: `.env` filenames are resolved against `process.cwd()`. Grouped with the `DATABASE_URL` constraint row. Patched: step 2 now names the repository root and says why.
  - `[medium]` `[patch]` Untouched README text still points at platform sign-in, and the spec's literal-string greps pass while it does — Grouped with the self-contradiction row; patched together.
  - `[medium]` `[patch]` "forces `NODE_ENV=production`" is a default, not a forcing — Grouped with the `NODE_ENV` row; patched together.
  - `[medium]` `[patch]` (verification-gap layer, filed pre-verified) The bring-up has no database step, and `README.md`'s `503 auth_unavailable` paragraph attributes that symptom to a role without `CREATE` rights when a stopped container produces it identically — Verified independently: `#ensureDbReady` logs the one warning and answers 503 on any migration failure, unreachable host included (`@mastra/auth-better-auth/dist/index.js:505-534`). Grouped with the missing-database row; patched by the same change plus a rewrite of that paragraph to check reachability first. The layer reported **no verification gaps**.

Intent-alignment auditor filed no findings — its report is descriptive by instruction. It read the diff as implementing the runbook reading of the story (the procedure is the deliverable), recorded that the configuration-surface, executable-checkpoint and behavioural-hardening readings are each declined with a stated reason, and named the structural gap this story cannot close: the acceptance criteria live at the running-deployment surface while the diff lives at the prose surface, so the checkpoints' outcome arrives as an operator report rather than as an artifact in the repository.

## Design Notes

**Why `MASTRA_HOST` belongs in this story's `.env` even though Story 3.2 declares it.** This story's own
Given is that registration is exercised *while the deployment is still private*. Setting
`MASTRACODE_PUBLIC_URL` to a loopback URL does not bind the socket to loopback: `bindHost` is
`serverOptions?.host ?? process.env.MASTRA_HOST` and is handed to `server.listen` unchanged, so unset means
every interface — with an open sign-up form on it. `MASTRA_HOST=127.0.0.1` is already in the contract's
`.env` target state (`docs/Self-hosting research.md:528`) and in the SPEC's constraints, so instructing it
here applies a standing constraint rather than inventing scope. What this story must *not* do is declare
the key in `.env.schema`: that is verbatim Story 3.2's acceptance criterion. `npm run dev` reads `.env`
through `dotenv.parse` with no schema in the path, so an undeclared key reaches the server fine — and the
instruction stays scoped to `npm run dev` for exactly that reason.

**Why `DATABASE_URL` is not optional here.** The entry has a bare-dev libSQL arm, but `mastra factory dev`
spawns the server with `NODE_ENV: env.get("NODE_ENV") ?? "production"`, so `localDevelopmentMode` is false
and `src/mastra/index.ts:425-428` throws before storage is built. The operator's `.env` does not set it
today. Without it there would also be nothing to inspect: FR10's "auth tables in the same Postgres on the
same connection string" is only true on the `PgFactoryStorage` arm.

**Why the browser origin is pinned to `127.0.0.1`.** Better Auth's trusted-origin list is seeded from
`new URL(baseURL).origin` and nothing else while `MASTRACODE_ALLOWED_ORIGINS` is unset. The CLI banner
prints `http://localhost:4111` regardless of the bind address, so the obvious action — click the printed
link — produces a cookie-bearing POST from an origin that is not trusted, a `403 INVALID_ORIGIN`, and a
server log reading `Invalid origin: http://localhost:4111`. Pinning `PORT=4111` closes the same trap from
the other side: with `PORT` unset the CLI scans 4111-4131 and silently lands on 4112 when 4111 is busy,
which breaks the origin match with no error at all, whereas a pinned port fails loudly with `EADDRINUSE`.

**Why this story commits documentation and no code.** Everything it asserts is either already implemented
(Story 2.3's provider, the SPA's own sign-up form) or is a property of a running deployment that no
`[verify].commands` entry can observe. Adding a test would pin behaviour this story did not introduce, and
adding a key to `.env.schema` would take Story 3.2's criterion. The honest deliverable is the committed
procedure plus the parked checkpoints.

## Verification

**Commands:**
- `git diff 9e9478fe2755232c6fa422c87f3abb2a178f565c --stat` -- expected: `README.md` plus this spec only
- `git diff 9e9478fe2755232c6fa422c87f3abb2a178f565c -- .env.schema .env.example src package.json package-lock.json docs AGENTS.md ops sandbox docker-compose.yml tsconfig.json .bmad-loop` -- expected: empty
- `grep -n 'sign in through Mastra platform\|alternative authentication' README.md` -- expected: no match
- `grep -nE 'MASTRA_HOST|PORT=4111|MASTRACODE_PUBLIC_URL|DATABASE_URL|BETTER_AUTH_SECRET|FACTORY_CREDENTIAL_ENCRYPTION_KEY' README.md` -- expected: every key present
- `grep -nE 'MASTRA_HOST|^PORT' .env.schema .env.example` -- expected: no match
- `grep -n '"user"\|"member"\|"organization"' README.md` -- expected: the checkpoint SQL, identifiers quoted
- `grep -n 'signUpEnabled' src/mastra/index.ts` -- expected: still `signUpEnabled: true`
- `git diff 9e9478fe2755232c6fa422c87f3abb2a178f565c -- README.md | grep '^+'` -- expected: no line carries a
  usable password, key, token or a connection string with a real password
- `git check-ignore -v .env` -- expected: matched by `.gitignore`
- `npm ci --no-audit --no-fund` -- expected: exits 0 in a worktree with no `node_modules/`
- `npm run check` -- expected: exits 0
- `npx varlock load --format json` -- expected: exits 0 with no `.env` present
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected: 0
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: 0
- `npm test` -- expected: exits 0, 46/46 passing

**Manual checks (if no CLI):**
- Read the rewritten section against `node_modules/@mastra/auth-better-auth/dist/index.js:593-671` and
  confirm the organization name, slug and role it describes match what `ensureOrganization` actually
  writes, and that the warning text is quoted verbatim from `:668`.
- Read the SQL against the organization plugin's schema and confirm every identifier used exists and is
  quoted, since the Kysely Postgres dialect is built with no `CamelCasePlugin`.

## Auto Run Result

Status: awaiting-operator
Blocking condition: none — the story is complete as far as an agent can take it. Signing in, creating
the account and reading the organization tables all need a running server, a live engine and a real
`.env`, none of which exists in a story worktree.

**Implemented change.** Story 2.3 wired self-managed sign-in; nothing committed told the operator how
to reach it, and `README.md` still said to "sign in through Mastra platform". This story replaces
`README.md`'s `## Start the Factory Server` section with this deployment's actual first bring-up: a
preconditions line for the container engine, then five numbered steps — compose `.env`, start the
database and the server, create the account, check the organization, and the credential-encryption
rule — each with what its values must contain, how to obtain them, and a checkpoint. The procedure is
built from behaviour read out of the installed packages, not from the upstream template: the dev
server defaults the child to `NODE_ENV=production` so `DATABASE_URL` is mandatory; `MASTRA_HOST` is
the only key that moves the socket off every interface while the sign-up form is open; the trusted
origin is exactly `MASTRACODE_PUBLIC_URL`, so the `localhost` the banner prints is a `403`; and the
personal organization is created by the first authenticated request, not by the sign-up POST. No
first-party code changed.

**Files changed.**
- `README.md` — the whole change (99 insertions, 8 deletions). The rewritten `## Start the Factory
  Server` section; plus two corrections the rewrite exposed elsewhere in the same file — the
  "Configure your Factory" Auth row and the sandbox paragraph both still advertised Mastra platform
  sign-in — and one new **Sign-in:** bullet under Troubleshooting routing the five new failure
  symptoms back into the numbered steps.

**Why no code and no tests.** Everything this story asserts is either already implemented (Story 2.3's
provider, the SPA's own sign-up form) or is a property of a running deployment that no
`[verify].commands` entry can observe. Adding a test would pin behaviour this story did not introduce,
and declaring `MASTRA_HOST`/`PORT` in `.env.schema` would take Story 3.2's acceptance criterion
verbatim (`epics.md:681-684`) — that gap is recorded in `deferred` instead, with evidence that it is
inert for the `npm run dev` path this procedure uses.

**Review findings.** Four layers, **30 findings — high 0, medium 15, low 15, false 0, maybe-false 0**.
The verification-gap layer reported **no verification gaps** and independently re-verified the
section's load-bearing claims against the installed packages; the intent-alignment auditor filed no
findings. Ten grouped entries patched (**6 medium, 4 low**), one deferred, five rejected:
- Patched (medium): the false "no re-encryption pass" claim about plaintext credential rows — a later
  boot does sweep and re-encrypt them, and double-encodes what the plaintext writer stored, leaving an
  unusable credential; the bring-up reaching `npm run dev` with no database step, no engine
  precondition, and a `503 auth_unavailable` paragraph that blamed missing `CREATE` rights for a
  symptom a stopped container produces identically; `MASTRACODE_AUTH_DISABLED` missing from the
  must-stay-unset list, which also silently drops credential encryption; the three `.env` loading
  facts that can defeat step 1 without saying so, including a `NODE_ENV` line in `.env` beating the
  dev server's production default; the missing loopback-bind checkpoint and the `HOST`-banner trap;
  and the rest of the README still advertising platform sign-in.
- Patched (low): the sign-up form's required Name field and 8-character password minimum; an
  unverified claim that varlock cannot see undeclared keys (it exits 0 and passes them through) plus
  `BETTER_AUTH_TRUSTED_ORIGINS` also feeding the trusted-origin list; the missing working directory
  and the `POSTGRES_PASSWORD` character constraint behind the `DATABASE_URL` sample; and a
  Troubleshooting section that gained nothing from the new failure modes.
- Deferred: `MASTRA_HOST` and `PORT` are declared in neither env file, so "copy `.env.example` to
  `.env`" cannot produce two of the seven required values — Story 3.2 owns declaring them.
- Rejected: the sandbox/onboarding forward pointer (Story 2.5's checkpoint; `sandbox/README.md` owns
  those keys and "Configure your Factory" already links there) and its duplicate; the dropped
  `--no-platform` sentence and hosted credential-encryption link (platform-flow prose this story
  deliberately replaces; `.env.schema` owns the rotation keys) and its duplicate; the dropped
  **Manage GitHub connection** onboarding sentence (no GitHub App exists until Epic 3); and the spec's
  own `status:`/evidence wording, whose fix is to edit this build's spec.

**Follow-up review recommended: true.** First pass; six medium entries were patched, which crosses the
threshold on its own. The named residual risk: no gate command reads `README.md`, so the accuracy of
this procedure is pinned by nothing — this pass alone corrected six substantive inaccuracies in text
that had already been written confidently. A second pass should re-audit the claims this pass did not
independently re-derive, specifically the `lsof -nP -iTCP:4111 -sTCP:LISTEN` output shape on macOS,
the `EADDRINUSE` claim for a pinned busy port under `mastra factory dev`, and the absolute "always
prints `http://localhost:4111`" (the banner follows `HOST`, so it is only always-`localhost` while
`HOST` is unset). Patched counts by verdict: high 0, medium 6, low 4.

**Verification.** Every command in this spec's Verification block was re-run after the patches.
`npm run check` (`tsc --noEmit`) **0**; `npx varlock load --format json` **0** with no `.env` present;
both path guards **0**; `npm test` (`vitest run --dir src`) **0** with **46/46 passing** — unchanged,
as expected for a documentation-only change. `git diff 9e9478f --stat` is `README.md` alone (99+/8−),
and the diff restricted to `.env.schema`, `.env.example`, `src`, `package.json`, `package-lock.json`,
`docs`, `AGENTS.md`, `ops`, `sandbox`, `docker-compose.yml`, `tsconfig.json` and `.bmad-loop` is
empty. `signUpEnabled: true` is unchanged at `src/mastra/index.ts:189`. No match in `README.md` for
`sign in through Mastra platform`, `alternative authentication` or `can continue to use Mastra
platform`; no added line carries a usable secret or a password-bearing connection string; `.env` is
matched by `.gitignore`. Two claims were checked against the tools themselves rather than by reading:
`varlock load` was run against a scratch `.env` carrying `MASTRA_HOST` and `PORT`, and the
`ModelCredentialsStorage.init()` re-encryption path was traced through `secret-encryption.js`.

**Residual risks.**
- The procedure's correctness is pinned only by prose. Every behavioural claim in it is an assertion
  about vendored package internals at the versions in `package-lock.json`; a dependency bump moves
  that behaviour while every gate command stays green.
- The checkpoints' outcome is an operator report, not an artifact. Nothing in this repository will
  record that `/signin` rendered or that the organization row existed — which is why `operator_actions`
  ends with an explicit "report back" step.
- The `.env` composition instructs two keys the schema does not declare. Harmless on the `npm run dev`
  path proven this session, and closed by Story 3.2.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — Story 1.4's engine steps must already be done and holding: Colima running, `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"` in the shell you use, and `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db` reporting `healthy`. Nothing below can work without a reachable Postgres. See `ops/README.md`.
- Compose `.env` at the repository root with the seven values README.md's "Start the Factory Server" step 1 lists: `MASTRA_HOST=127.0.0.1`, `PORT=4111`, `MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111`, `DATABASE_URL` matching the `POSTGRES_*` values the container was created with, `BETTER_AUTH_SECRET` and `FACTORY_CREDENTIAL_ENCRYPTION_KEY` from two separate runs of `openssl rand -base64 32`, and `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1`. Today only the three `POSTGRES_*` values and the two `.env.example` defaults are set, so all five of the others are new. Leave `NODE_ENV`, `MASTRACODE_AUTH_DISABLED`, `MASTRACODE_ALLOWED_ORIGINS`, `MASTRA_SHARED_API_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` unset — each one breaks sign-in or credential encryption silently, and README step 1 says how. Also check for a stale `.env.local` or `.env.development`, and for any of these keys already exported in your shell: both beat `.env` with nothing logged. Copy `FACTORY_CREDENTIAL_ENCRYPTION_KEY` into a password manager off this machine before using it.
- Install and start, from the repository root: `npm ci` (the main checkout's `node_modules` predates Stories 2.2 and 2.3, so the auth provider is not installed there yet), then `npm run db:up` and `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db` (expect `healthy`), then `npm run dev`. Once it is up, confirm the bind with `lsof -nP -iTCP:4111 -sTCP:LISTEN`: it must show `127.0.0.1:4111`, not `*:4111`. `*` means `MASTRA_HOST` did not reach the server and the open sign-up form is on every interface — stop, fix `.env`, restart.
- Checkpoint 1 — sign in. Open `http://127.0.0.1:4111/signin` by typing it; the banner prints `http://localhost:4111`, and using that origin produces a `403` with `Invalid origin: http://localhost:4111` in the server log. Expected: the heading "Welcome back" over an email/password form with a "New here? Sign up" toggle. A single "Sign in with Mastra Platform" button instead means `BETTER_AUTH_SECRET` did not reach the server (typo or blank) — fix `.env` and restart rather than proceeding. Use the toggle, which adds a required "Name" field above "Email" and "Password"; the password must be at least 8 characters. Then "Create account". Create exactly one account, yours: registration stays open until Story 2.6 closes it.
- Checkpoint 2 — the organization. After the app has loaded in the browser, run `docker exec mastracode-web-db psql -U factory -d mastracode_web -c 'SELECT o.slug, o.name, m.role, u.email FROM "member" m JOIN "organization" o ON o.id = m."organizationId" JOIN "user" u ON u.id = m."userId";'` (substituting the role and database names in use). Expected: exactly one row — slug `personal-<user id>`, name `<your email>'s org`, role `owner`. An empty result after a browser session is a failed bootstrap to investigate, never expected state: grep the server output for `[BetterAuth] Failed to bootstrap personal organization for user`. If sign-in requests returned `503 {"error":"auth_unavailable"}`, look instead for `[BetterAuth] Failed to run auth schema migrations` — that one line covers every migration failure and is not a bad secret. Confirm the database is running and reachable at the address in `DATABASE_URL` first; only then suspect the role's right to create tables.
- Before saving any model-provider API key, confirm `FACTORY_CREDENTIAL_ENCRYPTION_KEY` was in `.env` at the boot you are using. Nothing refuses the write when it is missing; the credential is stored as readable plaintext. Setting the key later does not repair the row — the next boot re-encrypts it, but double-encodes what the plaintext writer stored, so the credential stops working and the secret was on disk in the clear either way. Rotate it at the provider, delete the stored copy, and save it again with the key in force.
- Report back: whether `/signin` showed the email/password form, the organization row the SQL returned (or the log line it did not), and any value you had to change from the README's `.env` block — especially if `DATABASE_URL` or the port differed from what step 1 assumes.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
