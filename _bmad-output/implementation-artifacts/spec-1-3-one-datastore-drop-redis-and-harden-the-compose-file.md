---
title: 'Story 1.3: One datastore — drop Redis and harden the compose file'
type: 'chore'
created: '2026-09-23'
status: 'done'
baseline_revision: 'c216822f4804bc21d3cff5dda8420d920bc2964e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Nothing in the repo can execute or even parse docker-compose.yml, so every property this story
      adds — the loopback publish, the required-password guard, the TCP healthcheck — ships behind no
      mechanical check.
    evidence: |-
      The five [verify].commands are npm ci, npm run check (tsc, include: ["src/**/*"]), two git path
      guards and npm test (vitest run --dir src). None parses YAML or invokes Compose, and
      docker-compose.yml is outside both the compiler's and the runner's scope: the gate produces
      byte-identical results before and after this change. Inverting the publish back to '54329:5432',
      or letting the healthcheck's ${POSTGRES_USER:-factory} drift from environment's, still exits 0
      everywhere. No container engine exists on this machine (docker, colima, docker-compose all
      absent — verified), so `docker compose config` could not be run here either.
      Smallest fix: add `docker compose config -q` to [verify].commands once Story 1.4 lands an
      engine. Not done here: this story explicitly forbids requiring an engine, and [verify].commands
      is orchestrator surface.
    location: >-
      .bmad-loop/policy.toml [verify].commands / docker-compose.yml
    severity: medium
  - summary: >-
      The loopback-only publish 127.0.0.1:54329:5432 assumes Colima/Lima forwards a guest-loopback
      port to host loopback; that was reasoned from documentation, never observed.
    evidence: |-
      Story 1.4's checkpoint is "the container reports healthy on 127.0.0.1:54329". The previous
      binding ('54329:5432') published on every interface inside the VM, which Lima certainly
      forwards; the new one narrows it. If Lima's default port-forward rules do not cover guest
      127.0.0.1, `npm run db:up` succeeds while the host cannot reach 54329, and Story 1.4 blocks on a
      change this story made for hardening rather than for any acceptance criterion.
      What would settle it: on the Story 1.4 host, after `npm run db:up`, run
      `pg_isready -h 127.0.0.1 -p 54329`. If it fails, revert the ports entry to '54329:5432'.
    location: >-
      docker-compose.yml ports
    severity: medium (unverified)
  - summary: >-
      docker-compose.yml pins no project name, so the data volume's real name follows the checkout
      directory — moving or renaming the repo silently creates a new empty volume, and there are no
      backups.
    evidence: |-
      Compose derives the project name from the directory basename when no top-level `name:` is set,
      and prefixes named volumes with it: the volume is mastra-factory_mastracode-web-pgdata, not
      mastracode-web-pgdata. AGENTS.md records that "the Postgres volume is the only copy of projects,
      work items, sessions, memory and tokens", so a rename that orphans it is unrecoverable. The
      fixed `container_name: mastracode-web-db` has the mirror problem: it defeats per-project
      namespacing, and now that restart: unless-stopped is set, a container started from a
      since-deleted directory survives reboots while holding both the name and port 54329.
      Smallest fix: add `name: mastra-factory` at the top of docker-compose.yml.
      Pre-existing: both the unpinned project name and container_name predate this story.
    location: >-
      docker-compose.yml
    severity: medium
  - summary: >-
      `npm run db:up` is `docker compose up -d --wait` with no `--wait-timeout`, so now that
      `restart: unless-stopped` keeps a failing container out of the exited state, a container that
      never reaches healthy makes the command block indefinitely instead of erroring.
    evidence: |-
      Compose's `--wait` defaults to `--wait-timeout 0`, meaning wait forever, and it ends early on a
      container that exits. Before this story a container that failed to initialize exited and `--wait`
      reported that failure; with `restart: unless-stopped` (added here) it crash-loops instead, so the
      loop never terminates and `npm run db:up` produces no output. Reachable through a POSTGRES_USER or
      POSTGRES_DB value the entrypoint rejects at initdb. Reasoned from Compose's documented flag
      semantics, not observed — no container engine exists on this machine.
      What would settle it: on the Story 1.4 host, set POSTGRES_USER to a value initdb rejects and run
      `npm run db:up`; if it hangs, the claim holds.
      Smallest fix: `docker compose up -d --wait --wait-timeout 120` in package.json `db:up`.
      Not done here: the intent pins `db:up` and `db:down` to their exact command strings (AD-11 /
      NFR10), so changing one is outside this story.
    location: >-
      package.json db:up / docker-compose.yml restart policy
    severity: medium
  - summary: >-
      The two `# @public` annotations in .env.schema are load-bearing for the production log yet no
      check in the repo asserts they are still there, even though varlock can be run today.
    evidence: |-
      `npm run start` is `varlock run -- mastra start`, which builds a find/replace over every sensitive
      value and applies it to non-TTY stdout. `POSTGRES_USER` and `POSTGRES_DB` inherit
      `@defaultSensitive=true` from the file header, so without `# @public` the literals `factory` and
      `mastracode_web` are masked throughout the deployment's only diagnostic surface — the defect this
      build found and patched. Deleting either annotation leaves `npm ci`, `npm run check`, both path
      guards and `npm test` all exiting 0: tsc is scoped to `src/**/*`, vitest runs `--dir src`, and
      neither parses .env.schema.
      Unlike the docker-compose gap above, this one is closable without a container engine: varlock is
      an installed devDependency and `varlock load` exits 0 in this worktree with no `.env` present.
      Smallest fix: a check that runs `node_modules/.bin/varlock load --format json-full
      --filter="POSTGRES_*"` and asserts `POSTGRES_USER.isSensitive === false`,
      `POSTGRES_DB.isSensitive === false`, `POSTGRES_PASSWORD.isSensitive === true` — which would also
      catch a .env.schema that stops parsing, which nothing notices today.
      Not done here: the intent contract states this story ships file-state assertions and no test rows,
      and a varlock-spawning test adds a new dependency to the verify gate that the intent does not
      sanction.
    location: >-
      .env.schema (POSTGRES_USER / POSTGRES_DB @public) / test surface
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `docker-compose.yml` still describes two stateful services. The `redis` service backs
`RedisStreamsPubSub`, which AD-12 (single machine, single process, in-process workers) means this deployment
will never use, and four committed files still instruct the operator to set `REDIS_URL`. The database service
carries the template's `user`/`pass` defaults, binds every interface, and has no restart policy, so Postgres
does not come back with the host.

**Approach:** Delete the `redis` service and every committed instruction to set `REDIS_URL`; give `app-db` a
`restart: unless-stopped` policy, a loopback-only port publish, and operator-owned credentials — user default
`factory`, password required from the environment so no credential is committed — keeping the database name,
port and image exactly as documented so the `DATABASE_URL` shape holds.

## Boundaries & Constraints

**Always:**
- `POSTGRES_DB` stays `mastracode_web`, the published host port stays `54329`, and the image stays
  `pgvector/pgvector:pg18` — `docs/Self-hosting research.md` §8 step 2 checkpoints exactly this, and §8's
  `.env` target state is `postgres://factory:<strong-pw>@127.0.0.1:54329/mastracode_web`.
- The compose user default is `factory`, matching §8's `DATABASE_URL` and §9's
  `docker compose exec -T app-db pg_dump -U factory`.
- Secrets never enter the repo (NFR18 / AGENTS.md "Policy"): the password is supplied by the operator via
  `.env` (which Compose loads automatically and `.gitignore` excludes), never defaulted in a tracked file.
- `.env.schema` is the only list of keys (AD-6 / NFR7): every key whose presence or shape changes here is
  reflected there, and `README.md` — the owning subject's README for the root compose file — states what the
  values must contain and how to choose them without restating validation, `@public` or sensitivity.
- `start`, `check`, `build`, `db:up` and `db:down` keep their names and command strings (AD-11 / NFR10).

**Never:**
- Never remove `@mastra/redis-streams` from `package.json`, and never touch the `REDIS_URL` branch in
  `src/mastra/index.ts`. SPEC.md records that the ruled-out packages stay installed and that the guarantee
  rests on the key staying unset; FR37 is "the server boots with `REDIS_URL` unset", not "the code path is
  deleted". Extraction of config out of the entry is Epic 5.
- Never touch `src/mastra/index.test.ts` — its `REDIS_URL` sweep keeps an inherited variable from hanging the
  verify gate (Story 1.2), and removing it would weaken the gate.
- Never edit `AGENTS.md`, `docs/Self-hosting research.md`, or anything under `_bmad-output/` other than this
  spec — the research doc is a historical record whose section numbers are stable anchors, and AGENTS.md
  corrections are already on the deferred ledger.
- Never add a root directory or a new root-level file; never add `ops/` here (that is Story 1.4).
- Never start a container or run `docker compose` — no engine exists on this machine until Story 1.4.

There is deliberately no I/O & Edge-Case Matrix: this story changes only declarative configuration and prose.
Every runtime behaviour it configures — the container starting, the database answering on `127.0.0.1:54329`,
the restart policy surviving a host reboot — needs a container engine, and none exists on this machine until
Story 1.4, which owns those checkpoints. Nothing here is reachable from `tsc` or `vitest`, so the acceptance
criteria below are file-state assertions, not test rows.

</intent-contract>

## Code Map

- `docker-compose.yml` -- the whole story's centre. Lines 8-9 and 14 are the Redis prose plus
  `export REDIS_URL=redis://localhost:63799`; lines 41-52 are the `redis` service. There is **no** volume,
  network or `depends_on` entry referencing redis (`volumes:` at line 54 holds only
  `mastracode-web-pgdata`, and no `networks:` key exists) — verified, so deleting the service block and the
  header prose is the complete removal. `app-db`: `ports` line 26 is `'54329:5432'` (binds 0.0.0.0);
  `environment` lines 28-30 default to `user`/`pass`/`mastracode_web`; the healthcheck at line 36 repeats the
  `user` default; there is no `restart:` key. Line 17 claims the defaults match `src/web/.env.example`, a path
  that does not exist in this repo.
- `.env.schema` -- lines 285-292: the `Distributed event bus (optional)` block plus `REDIS_URL=`. Delete the
  block. Lines 193-198: the `Application database` header restates `pnpm db:up` / `pnpm --dir mastracode/web`
  (monorepo leftovers — this repo is npm, one package) and `postgres://user:pass@localhost:54329/...`, the
  credentials being replaced. `@defaultRequired=false` and `@defaultSensitive=true` at lines 4-5 mean a newly
  declared key is optional and sensitive unless annotated, so the three `POSTGRES_*` keys need no annotation.
  `docs/Self-hosting research.md` §8 records **[verified]** that `varlock run` builds the child env as
  `{ ...process.env, ...resolvedEnv }`, so declaring a key adds validation, `@public` marking and generated
  types only — it never gates whether Compose sees the value.
- `.env.example` -- the same two places, commented-out: lines 249-256 (event-bus block + `# REDIS_URL=`) and
  lines 163-175 (`Application database` header + `# DATABASE_URL=`). Mirror `.env.schema` key-for-key.
- `README.md` -- line 53 ("The generated `docker-compose.yml` contains the connection settings") and line 95
  ("Start or stop the optional local PostgreSQL and Redis services"). This is the owning README for the root
  compose file, so it takes the "what it must contain / how to choose it" half for `POSTGRES_*`.
- `src/mastra/index.ts` -- **read-only**. Lines 28, 99-116 construct `RedisStreamsPubSub` only when
  `process.env.REDIS_URL` is set; unset is already the no-Redis path.
- `src/mastra/index.test.ts` -- **read-only**. Line 41 sweeps `REDIS_URL` before importing the entry.
- `package.json` -- **read-only**. `db:up` is `docker compose up -d --wait`, `db:down` is
  `docker compose down`; `@mastra/redis-streams@0.4.3` stays.
- `tsconfig.json` -- **read-only**; `include: ["src/**/*"]`, so none of this story's files are typechecked.
  `npm run check` proves only that nothing was broken, not that anything here is right.

## Tasks & Acceptance

**Execution:**
- `docker-compose.yml` -- delete the `redis` service and rewrite the header comment (no Redis prose, no
  `export REDIS_URL` line, no `src/web/.env.example` reference); on `app-db` add `restart: unless-stopped`,
  publish `127.0.0.1:54329:5432`, change the user default to `factory` in both `environment` and the
  `healthcheck`, and make the password `${POSTGRES_PASSWORD:?...}` with a message naming `.env` -- one
  stateful service, operator-owned credentials, and Postgres returns with the host.
- `.env.schema` -- delete the event-bus block and `REDIS_URL`; add a `Local Postgres (docker-compose.yml)`
  block declaring `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; correct the `Application database`
  header's stale `pnpm`/monorepo sentence and its credential shape -- the only list of keys must match the
  keys the deployment now uses (AD-6), and no committed file may ask for `REDIS_URL`.
- `.env.example` -- mirror both `.env.schema` edits, commented out, with placeholder shapes only -- NFR18.
- `README.md` -- drop "and Redis" from the scripts table; replace the compose sentence with the `POSTGRES_*`
  ownership passage (what each value must contain, how to choose the password, that it is read from `.env`,
  and that it fixes the role only when the volume is first created) -- AD-6's other half.

**Acceptance Criteria:**
- Given AD-12 fixes the topology at one process, when `docker-compose.yml` is read, then `services:` has
  exactly one key (`app-db`), the string `redis` appears nowhere in the file, and `volumes:` still holds only
  `mastracode-web-pgdata`.
- Given its absence is the configured state (FR37), when
  `git grep -n REDIS_URL -- ':(exclude)_bmad-output' ':(exclude)docs'` runs, then the only hits are the
  read-only `src/mastra/index.ts` branch and the `src/mastra/index.test.ts` sweep — no `.env.schema`,
  `.env.example`, `README.md` or `docker-compose.yml` hit remains. (`_bmad-output/` is planning and
  orchestrator record; `docs/Self-hosting research.md:31` names the key only to say it stays unset and the
  service is deleted — neither instructs anyone to set it, and both are out of this story's write scope.)
- Given the datastore must survive a host restart unattended (FR38), when `app-db` is read, then it carries
  `restart: unless-stopped`.
- Given the documented `DATABASE_URL` shape must still hold, when `app-db` is read, then the image is
  `pgvector/pgvector:pg18`, the database default is `mastracode_web`, and the host port is `54329`, published
  on `127.0.0.1`.
- Given the template shipped `user`/`pass`, when `app-db`'s `environment` and `healthcheck` are read, then the
  user default is `factory` in both, and the password has no default at all — it is
  `${POSTGRES_PASSWORD:?<message>}`, whose message names the variable and points at `.env`, so an unset
  password stops bring-up with a legible error instead of creating a database with a published credential.
- Given secrets never enter the repo (NFR18), when the full diff against `baseline_revision` is read, then no
  added line contains a usable password, key or token.
- Given `.env.schema` is the only list of keys (AD-6 / NFR7), when it is diffed against `baseline_revision`,
  then `REDIS_URL` is gone and `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` are declared; and when
  `README.md` is read, then it states what those values must contain without restating required/optional,
  sensitivity or `@public`.
- Given the verify gate, when `npm ci --no-audit --no-fund`, `npm run check`, both path guards and `npm test`
  run in order in a worktree with no `node_modules/`, then every one exits 0.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 31 findings — high 0, medium 13, low 11, false 6, maybe-false 1
- findings:
  - `[low]` `[patch]` blind-hunter: the healthcheck had no `start_period`, so a first-ever `initdb`
    had only `interval × retries` ≈ 25 s before the container was marked unhealthy and
    `docker compose up -d --wait` failed. Verified against the shipped values (5 s / 5 s / 5).
    Patched — `start_period: 30s` added.
  - `[medium]` `[patch]` blind-hunter: `pg_isready` with no `-h` probes the Unix socket, and the
    postgres entrypoint runs a temporary socket-only server (`listen_addresses=''`) during `initdb`,
    so `--wait` could report healthy before 5432 listened. Patched — the probe is now
    `-h 127.0.0.1 -p 5432`, which the temporary server does not answer.
  - `[medium]` `[patch]` blind-hunter: `openssl rand -base64 24` emits `/`, `+` and `=`; a `/` in the
    userinfo of the `postgres://factory:<password>@…` URL the same paragraph prescribes makes that URL
    invalid, and `$`/`#` break Compose interpolation and varlock's dotenv parse respectively. Verified
    (`new URL("postgres://factory:ab/cd@h/db")` throws). Patched — the README now recommends
    `openssl rand -hex 32` and says why.
  - `[low]` `[patch]` blind-hunter: the README told the operator to "delete the
    `mastracode-web-pgdata` volume", but Compose prefixes named volumes with the project name, so no
    volume by that bare name exists. Patched — the reset instruction is now `docker compose down -v`,
    which needs no volume name. (The underlying unpinned project name is filed as deferred item 3.)
  - `[medium]` `[patch]` blind-hunter: `${POSTGRES_PASSWORD:?…}` is evaluated whenever Compose loads
    the project model, so `down`, `ps`, `logs` and `config` abort too — while four committed files
    claimed only bring-up fails, and the README's own recovery path is a teardown. Patched — the
    wording is corrected in `docker-compose.yml` (header and `:?` message), `.env.schema`,
    `.env.example` and `README.md`.
  - `[false]` `[reject]` blind-hunter: `REDIS_URL` was removed from `.env.schema` while
    `src/mastra/index.ts:105` still branches on it, violating AD-6 in the other direction. Refuted as
    a defect — the story's acceptance criteria require exactly this ("no committed file instructs
    anyone to set `REDIS_URL` — its absence is the configured state"), and the verification-gap layer
    confirmed empirically that an existing `.env` still setting the key loads fine (varlock lists it
    as an undeclared item and exits 0). Re-declaring it would undo the AC.
  - `[low]` `[defer]` blind-hunter: the fixed `container_name` defeats per-project namespacing, and
    now that `restart: unless-stopped` is set, a container from a since-deleted directory survives
    reboots holding both the name and port 54329. Verified; `container_name` is pre-existing. Same
    root cause as the unpinned project name — deferred item 3.
  - `[low]` `[patch]` blind-hunter: the README told the operator to run `npm run db:up` before the
    bullets explaining `POSTGRES_PASSWORD` has no default, so reading top-to-bottom the first command
    run is the one that errors; and nothing told a fresh operator to create `.env` from
    `.env.example`. Patched — the passage now starts with copying `.env.example` and setting the
    values, then runs `db:up`.
  - `[medium]` `[patch]` blind-hunter: the three new schema keys carry no annotations, so
    `POSTGRES_USER`/`POSTGRES_DB` inherit `@defaultSensitive=true`, and `POSTGRES_USER` is
    interpolated unquoted into a `CMD-SHELL` healthcheck. Both halves verified and patched — see the
    redaction row under verification-gap, and the quoting row below.
  - `[low]` `[reject]` blind-hunter: the compose header is half-rewritten — template prose about
    GitHub schema migrations and `APP_DATABASE_URL` survives under the new first line. Checked: both
    surviving sentences are still factually true (`APP_DATABASE_URL` is still honoured, and
    `.env.schema` still declares it), so the complaint is stylistic with no named harm, and renaming
    the `mastracode-web-*` identifiers would change container and volume names — far more than a
    direct correction.
  - `[low]` `[reject]` blind-hunter: the spec's acceptance criteria cover the `.env.schema` diff but
    not `.env.example` mirroring it or the README scripts row. True, but the fix is to edit this
    build's spec, which triage rejects by rule.
  - `[low]` `[reject]` blind-hunter: the spec's structural check uses `python3 -c "import yaml…"` and
    PyYAML is not a dependency of this repo. Verified: the system `python3` raises
    `ModuleNotFoundError`. Rejected because the fix edits this build's spec — and the check did run,
    via `uv run --with pyyaml`, both before and after the patches.
  - `[medium]` `[patch]` edge-case: `docker compose down` also interpolates the required variable, so
    an operator without `.env` cannot tear the stack down. Same claim as the blind-hunter row; same
    fix.
  - `[low]` `[patch]` edge-case: Compose prefixes the volume name with the project name, so the
    documented reset fails. Same claim as the blind-hunter row; same fix.
  - `[medium]` `[patch]` edge-case: `openssl rand -base64 24` output containing `/` breaks the
    documented `DATABASE_URL`. Same claim as the blind-hunter row; same fix.
  - `[medium]` `[patch]` edge-case: a password containing `$` or `#` is expanded by Compose and
    truncated by varlock, so the server's password silently diverges from the database's. Same root
    cause as the generator row — `openssl rand -hex 32` emits neither character.
  - `[low]` `[reject]` edge-case: a pre-existing `pgdata` volume initialized with the old `user` role
    would make `pg_isready` report ready while the `factory` role does not exist, so `db:up --wait`
    succeeds and the app's authentication fails. The mechanism is real (`pg_isready` does not
    authenticate), but no container engine has ever run on this machine — `brownfield.md` records
    "nothing is installed yet except `cloudflared`" — so no such volume can exist, and the proposed
    fix (replacing the probe with an authenticating `psql` call) is more than a direct correction.
    The README already states that the values apply only at first initialization.
  - `[low]` `[patch]` edge-case: `${POSTGRES_USER:-factory}` and `${POSTGRES_DB:-…}` are interpolated
    unquoted into the `CMD-SHELL` healthcheck, so a value with a space word-splits while the README
    promises "any valid PostgreSQL identifier works". Patched — both are now double-quoted;
    `POSTGRES_USER='my user'` expands to a single `-U "my user"` argument.
  - `[medium]` `[patch]` verification-gap: `POSTGRES_USER` and `POSTGRES_DB` inherit
    `@defaultSensitive=true`, and `npm run start` is `varlock run -- mastra start`, which builds a
    case-sensitive find/replace over every sensitive value and applies it to non-TTY stdout — so the
    literals `factory` and `mastracode_web` get masked throughout the production log file, the
    deployment's only diagnostic surface. Arrived pre-verified and reproduced here against the
    shipped schema: `[Factory] boot: fa▒▒▒▒▒-sandbox, db ma▒▒▒▒▒, …`. Patched — `# @public` on both
    keys; re-run prints the line intact while the password is still redacted. (This contradicts the
    spec's Design Note arguing the opposite; the note is left as the record of what was tried.)
  - `[medium]` `[defer]` verification-gap: the compose file's new interpolation and publish rules are
    reachable by no check in this repo — the gate is byte-identical before and after. Arrived
    pre-verified with a filed disposition of `defer`; routed as filed (deferred item 1), since
    closing it means adding the engine dependency this story forbids.
  - `[medium]` `[patch]` verification-gap (other): the README's `openssl rand -base64 24` produces a
    password that cannot be expressed in the URL the README prescribes — four of six sample runs
    contained `/` or `+`. Same claim as the blind-hunter row; same fix.
  - `[medium]` `[patch]` verification-gap (other): `${POSTGRES_PASSWORD:?…}` gates every Compose
    command, not just `up`, leaving a `restart: unless-stopped` container with no working documented
    stop command. Same claim as the blind-hunter row; same fix.
  - `[false]` `[reject]` verification-gap (other): filed by the layer itself as "not a problem" —
    removing `REDIS_URL` from `.env.schema` does not break an existing `.env` that still sets it
    (`varlock load` exits 0 and lists it as undeclared). Logged because it was reported; no defect.
  - `[medium]` `[defer]` intent-alignment (§3.1): the verify gate produces byte-identical results
    before and after this change, and the one mechanically checkable part — `docker compose config` —
    never ran. Same root cause as the verification-gap `defer` row; deferred item 1.
  - `[false]` `[reject]` intent-alignment (§3.2): `factory` is itself now a published default
    username, so "the user and password are non-default" is satisfied by two different rules within
    one clause. Refuted — `docs/Self-hosting research.md` fixes the username as `factory` in both §8's
    `DATABASE_URL` target state and §9's `pg_dump -U factory`, so this is the specified value, not an
    oversight; and a role name is not a credential.
  - `[medium]` `[patch]` intent-alignment (§3.3): `${VAR:?err}` reaches `down`, `ps` and `logs`, a
    precondition the acceptance criteria never asked for. Same claim as the blind-hunter row; same
    fix.
  - `[false]` `[reject]` intent-alignment (§3.4): declaring Compose-only keys widens what
    "`.env.schema` is the only list of keys" governs. Refuted as a defect — the acceptance criterion
    is literally "when any key's presence or shape changes in this story, `.env.schema` is updated",
    and `.env` has two readers. The one concrete harm this reading predicted (varlock and Compose
    disagreeing on a value) is filed and fixed as the redaction and generator rows.
  - `[low]` `[patch]` intent-alignment (§3.5): the same explanation existed in four committed places
    — `.env.schema`, `.env.example`, the compose header and the README — and the schema blocks carried
    the "what the value must contain" half that AD-6 assigns to the owning README. Patched — both
    schema blocks are trimmed to which process reads the keys and a pointer to README.md.
  - `[maybe-false]` `[defer]` intent-alignment (§3.6): the loopback publish is an unrequested change
    whose Colima justification is asserted from the research doc, not observed. Could not be settled
    here — no container engine exists on this machine. Deferred item 2 records what would settle it
    (`pg_isready -h 127.0.0.1 -p 54329` on the Story 1.4 host) and the revert if it fails.
  - `[false]` `[reject]` intent-alignment (§3.7): under a stricter reading the repo still ships an
    import of `@mastra/redis-streams`, a live `process.env.REDIS_URL` branch and a log line describing
    what setting the key does. Refuted as a defect — `SPEC.md` states the ruled-out packages stay
    installed and that the guarantee rests on the key staying unset, and FR37 is "the server boots
    with `REDIS_URL` unset", not "the code path is deleted". The layer itself records this boundary as
    inherited from planning.
  - `[false]` `[reject]` intent-alignment (§3.8): flagged that the `awaiting-operator` branch of the
    invocation prompt is not triggered. Correct and not a defect — no acceptance criterion here needs
    a human acting outside the repo; the human dependency is a container engine for *verification*,
    which the story routes to Story 1.4 and which deferred items 1 and 2 record.

### 2026-09-23 — Review pass (follow-up)

- verdicts: 32 findings — high 0, medium 7, low 19, false 5, maybe-false 1
- findings:
  - `[low]` `[reject]` blind-hunter: DW-2 in `deferred-work.md` is still `status: open` although this
    story removed exactly the prose it files. Verified — the `pnpm`/monorepo/`user:pass` text is gone
    from `.env.schema` and `.env.example`, so the entry no longer reproduces. Rejected: the deferred-work
    ledger is orchestrator-owned and the intent forbids editing anything under `_bmad-output/` other than
    this spec; closing DW-2 is the orchestrator's call, not this story's.
  - `[low]` `[reject]` blind-hunter: DW-15 is the only ledger entry with no `severity:` field, because
    `medium (unverified)` is not a bare enum value and was dropped in transcription. Verified. Rejected —
    orchestrator-owned ledger, same reason as the row above.
  - `[low]` `[reject]` blind-hunter: DW-14's heading is truncated mid-clause ("…ships behind no").
    Verified. Rejected — orchestrator-owned ledger.
  - `[low]` `[reject]` blind-hunter: `sprint-status.yaml` flips the story to `done` but leaves
    `epic-1: backlog` and a stale `last_updated`. Verified. Rejected — the invocation states
    `sprint-status.yaml` is orchestrator-owned and must never be written by this workflow.
  - `[false]` `[reject]` blind-hunter: the spec's frontmatter says `status: in-review` while
    `sprint-status.yaml` says `done`. Refuted — `in-review` is the state this review step sets on entry
    and rewrites to `done` at finalize; the diff was staged mid-pass, so the reviewer read a transient
    value, not a contradiction.
  - `[low]` `[reject]` blind-hunter: the Design Note "`POSTGRES_*` are declared but not `@public`" is now
    false, and the Colima note states as settled what deferred item 2 files as unobserved. Both true.
    Rejected by rule — the fix edits this build's spec. The previous pass already recorded that the
    `@public` note is left deliberately as the record of what was tried.
  - `[medium]` `[defer]` blind-hunter: `restart: unless-stopped` plus `docker compose up -d --wait` with
    no `--wait-timeout` turns a failed first start from an error into an indefinite hang. Mechanism
    confirmed from Compose's documented defaults (`--wait-timeout 0` = forever) and reachable via a
    POSTGRES_USER that initdb rejects; not observed — no engine here. Deferred (item 4): the fix edits
    `db:up`'s command string, which the intent pins under AD-11 / NFR10.
  - `[low]` `[patch]` blind-hunter: `README.md` promised "any valid PostgreSQL identifier works" for
    `POSTGRES_USER`, but the value passes through Compose's `.env` interpolation (which eats `$`) and a
    double-quoted `CMD-SHELL` healthcheck (which a `"` breaks). Patched — the bullet now says to keep the
    value to letters, digits and underscores, and why.
  - `[low]` `[patch]` blind-hunter: the README never tells the operator how to recover once a compose
    command is refused, and its Troubleshooting section does not mention the new hard failure. Grouped
    with the edge-case row below; patched together.
  - `[low]` `[reject]` blind-hunter: `.env.example`'s Local Postgres block omits the `factory` /
    `mastracode_web` defaults its placeholder URL depends on, and formats the one mandatory key like the
    two optional ones. Rejected — the previous pass deliberately trimmed "what the value must contain"
    out of both env blocks so `README.md` owns it (AD-6), and the block's own header already states that
    every compose command aborts until `POSTGRES_PASSWORD` is set. Re-adding the values would undo an
    intent-mandated patch.
  - `[low]` `[reject]` blind-hunter: nothing warns that rotating `POSTGRES_PASSWORD` in `.env` locks the
    app out, and nothing suggests a `pg_dump` before `docker compose down -v`. Rejected — the README
    already states the values apply only at first initialization and that changing one later
    re-passwords nothing, which is the same fact; `ALTER ROLE` recovery and backup procedure are §9
    operational content that the intent routes away from this story.
  - `[medium]` `[defer]` edge-case: `npm run db:up` blocks forever on a crash-looping container because
    no `--wait-timeout` is set. Same claim as the blind-hunter row; deferred as item 4.
  - `[medium]` `[patch]` edge-case: if `POSTGRES_PASSWORD` is removed from `.env` after the first start,
    every compose command aborts while `restart: unless-stopped` keeps the container coming back and
    holding port 54329 — with no documented escape hatch. Verified against the shipped file: the `:?`
    guard is evaluated on every command and the restart policy is new in this story. Patched — the
    README now says to put any value back to regain control, or to stop the container directly with
    `docker stop mastracode-web-db && docker rm mastracode-web-db`.
  - `[low]` `[patch]` edge-case: a `"`, backtick or `$(` in `POSTGRES_USER`/`POSTGRES_DB` breaks the
    `CMD-SHELL` string. Real but operator-self-inflicted through their own `.env`, with no privilege
    boundary crossed. Patched as documentation (the README now bounds the value) rather than by
    rewriting the healthcheck to exec form, which cannot be validated without an engine.
  - `[low]` `[patch]` edge-case: the README over-promises the `POSTGRES_USER` value space. Same claim as
    the blind-hunter row; same fix.
  - `[false]` `[reject]` edge-case: an existing `.env` whose `DATABASE_URL` uses `localhost` or a LAN
    address breaks once the publish narrows to `127.0.0.1`. Refuted — no deployment exists to regress
    (no container engine has ever run on this machine), and the only committed source of that URL was
    the stale `postgres://user:pass@localhost:54329/...` prose, which this same diff replaces with
    `127.0.0.1`.
  - `[low]` `[reject]` edge-case: DW-14's heading is truncated. Same claim as the blind-hunter row;
    rejected for the same reason.
  - `[low]` `[reject]` edge-case: DW-15 carries no `severity:`. Same claim as the blind-hunter row;
    rejected for the same reason.
  - `[low]` `[reject]` edge-case: a pre-existing `.env` still setting `REDIS_URL` would make the entry
    dial a Redis container that no longer exists. Rejected — no `.env` and no deployment exists yet
    (`brownfield.md` records nothing installed but `cloudflared`), and the fix is upgrade-note prose for
    an upgrade path with no users.
  - `[false]` `[reject]` edge-case: the diff modifies `_bmad-output/deferred-work.md` and
    `sprint-status.yaml` despite the intent's "never edit anything under `_bmad-output/` other than this
    spec". Refuted — both are orchestrator bookkeeping written outside this workflow; the invocation
    explicitly assigns their ownership to the orchestrator and forbids this session from touching them.
  - `[medium]` `[defer]` verification-gap: the two `# @public` annotations are load-bearing for the
    production log and nothing asserts they survive a future edit — the gate is byte-identical with or
    without them. Arrived pre-verified (the layer reproduced both the masked and unmasked log lines) and
    filed `patch` because `varlock load` is runnable here. Routed to defer (item 5) instead: the intent
    contract states this story ships file-state assertions and no test rows, so adding a
    varlock-spawning test to the verify gate is surface the intent does not sanction. The settle path is
    recorded verbatim on the deferred item.
  - `[medium]` `[defer]` `carried` verification-gap: no check in the repo can reach any property this
    story adds to `docker-compose.yml`. Carried from the 2026-09-23 pass — same claim, same location,
    and the gate still reads as that row describes. Already deferred as item 1 / DW-14; not re-filed.
  - `[low]` `[reject]` verification-gap (other): DW-2 is still open though this story completed it. Same
    claim as the blind-hunter row; rejected for the same reason.
  - `[low]` `[reject]` verification-gap (other): DW-14's ledger title is truncated. Same claim as the
    blind-hunter row; rejected for the same reason.
  - `[medium]` `[defer]` `carried` intent-alignment: the verified surface and the changed surface do not
    intersect at all — none of the five `[verify].commands` parses YAML, dotenv or Markdown. Carried from
    the 2026-09-23 pass; deferred item 1 / DW-14.
  - `[low]` `[reject]` `carried` intent-alignment: the spec's structural check needs PyYAML, which the
    repo does not declare. Carried from the 2026-09-23 pass, which rejected it because the fix edits this
    build's spec; the check did run again this pass via `uv run --with pyyaml` and returned
    `['app-db'] ['mastracode-web-pgdata'] None`.
  - `[false]` `[reject]` intent-alignment: `.env.schema` records `POSTGRES_PASSWORD` as optional (it
    inherits `@defaultRequired=false`) while `docker-compose.yml` hard-requires it, so the canonical key
    list does not mirror the key's shape. Refuted — the two consumers genuinely differ: varlock resolves
    the environment for `mastra start`, which never reads `POSTGRES_PASSWORD`, so marking it `@required`
    would make the server refuse to boot against an external or managed database that has no local
    Compose stack. Optional-for-varlock and required-for-Compose is the correct pair, not a mismatch.
  - `[medium]` `[patch]` `carried` intent-alignment: `${POSTGRES_PASSWORD:?…}` reaches `down`, `ps` and
    `logs`, not just `up`, so AD-11's `db:down` keeps its command string but not its behaviour. Carried
    from the 2026-09-23 pass, which patched the wording across all four committed files; the files still
    read as that row describes. Not re-patched.
  - `[low]` `[reject]` intent-alignment: the shipped Design Notes argue against `@public` while the
    shipped schema marks both keys `@public`. Same claim as the blind-hunter row; rejected by rule — the
    fix edits this build's spec.
  - `[maybe-false]` `[defer]` `carried` intent-alignment: the loopback publish's effect on a Lima guest
    is asserted from documentation, not observed. Carried from the 2026-09-23 pass; deferred item 2 /
    DW-15, which records the settling command and the revert.
  - `[false]` `[reject]` intent-alignment: the diff edits `_bmad-output/` files the intent puts out of
    scope. Same claim as the edge-case row; refuted for the same reason.
  - `[low]` `[reject]` intent-alignment: the Intent's "four committed files still instruct the operator
    to set `REDIS_URL`" overcounts — three carried an instruction, and the fourth naming the key is
    `docs/Self-hosting research.md`, which is out of write scope and says only that it stays unset.
    Correct observation; rejected by rule — the fix edits this build's spec.

## Design Notes

**Why the password is required rather than re-defaulted.** `docs/Self-hosting research.md` §8 writes the
target as `postgres://factory:<strong-pw>@...` — a placeholder, meaning the operator chooses it. A literal
default in a tracked file would be a published credential and a "non-default" only in the narrowest sense, so
`${POSTGRES_PASSWORD:?...}` is used instead: nothing is committed, and the failure when it is unset is a named,
actionable Compose error rather than a silently weak database. The cost is that `npm run db:up` and
`npm run db:down` now need `POSTGRES_PASSWORD` in `.env`; Story 1.4 owns recording that precondition in
`ops/README.md`, and this spec's Auto Run Result states it for hand-off.

**Why loopback publishing.** AGENTS.md already requires `MASTRA_HOST=127.0.0.1` because "unset binds every
interface including the LAN", and §8's checkpoint is phrased as `127.0.0.1:54329`. Publishing
`127.0.0.1:54329:5432` applies the same posture to the store on a host that will later sit behind a public
tunnel. Colima/Lima forwards guest loopback ports to host loopback, so the documented checkpoint is unchanged.

**`POSTGRES_*` are declared but not `@public`.** They are Compose-interpolation keys, not values the server
reads. Leaving them at the file's `@defaultSensitive=true` keeps varlock redacting them from stdout and keeps
them out of anything a `@public` marking might expose.

## Verification

**Commands:**
- `python3 -c "import yaml,sys; d=yaml.safe_load(open('docker-compose.yml')); print(sorted(d['services']), sorted(d.get('volumes') or {}), d.get('networks'))"`
  -- expected: `['app-db'] ['mastracode-web-pgdata'] None`
- `grep -rn -i redis docker-compose.yml .env.schema .env.example README.md` -- expected: no output, exit 1
- `git grep -n REDIS_URL -- ':(exclude)_bmad-output' ':(exclude)docs'` -- expected: hits only in
  `src/mastra/index.ts` and `src/mastra/index.test.ts`
- `git diff --stat c216822f4804bc21d3cff5dda8420d920bc2964e -- src package.json package-lock.json tsconfig.json AGENTS.md 'docs/'`
  -- expected: no output (read-only files untouched)
- `npm ci --no-audit --no-fund` -- expected: exits 0 with no `node_modules/` present
- `npm run check` -- expected: exits 0
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected: exits 0
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: exits 0
- `npm test` -- expected: exits 0, all tests passing

**Manual checks (if no CLI):**
- No container engine exists on this machine (`docker`, `colima`, `docker-compose` are all absent —
  verified), so `docker compose config` cannot validate interpolation here. Instead read `app-db` and confirm
  by eye: `restart: unless-stopped`, `127.0.0.1:54329:5432`, `${POSTGRES_USER:-factory}` in both
  `environment` and `healthcheck`, `${POSTGRES_PASSWORD:?...}`, `${POSTGRES_DB:-mastracode_web}`. Compose's
  own bring-up is Story 1.4's checkpoint.

## Auto Run Result

Status: done

**Summary.** `docker-compose.yml` now describes one stateful service. The `redis` service and every committed
instruction to set `REDIS_URL` are gone; `app-db` carries `restart: unless-stopped`, publishes
`127.0.0.1:54329:5432`, defaults its user to `factory`, takes its password only from the environment
(`${POSTGRES_PASSWORD:?…}`, no committed default), and probes over TCP with a 30 s `start_period`. The image,
database name and host port are unchanged, so the documented `DATABASE_URL` shape holds. `.env.schema` drops
`REDIS_URL` and declares the three `POSTGRES_*` keys (`POSTGRES_USER` and `POSTGRES_DB` marked `# @public` so
varlock does not redact them from the production log); `.env.example` mirrors it; `README.md` owns the
"what the values must contain" half.

**Files changed** (against `c216822f4804bc21d3cff5dda8420d920bc2964e`):
- `docker-compose.yml` — redis service and its prose deleted; `app-db` given the restart policy, loopback
  publish, operator-owned credentials and a TCP healthcheck.
- `.env.schema` — event-bus block and `REDIS_URL` removed; `Local Postgres (docker-compose.yml)` block added;
  stale `pnpm`/monorepo/`user:pass` prose corrected.
- `.env.example` — the same two edits, commented out, placeholders only.
- `README.md` — scripts row drops "and Redis"; the `POSTGRES_*` ownership passage added, then narrowed and
  extended by this pass's two patches.
- `_bmad-output/implementation-artifacts/spec-…-compose-file.md` — this spec.

**This pass's findings** — 32 findings from four layers: high 0, medium 7, low 19, false 5, maybe-false 1.
- Patched (2 entries, at entry verdict: 1 medium, 1 low; 0 high):
  - `[medium]` No documented recovery when `POSTGRES_PASSWORD` goes missing after the first start —
    every compose command is refused while `restart: unless-stopped` keeps the container holding port
    54329. `README.md` now gives both escape hatches.
  - `[low]` `README.md` promised "any valid PostgreSQL identifier" for `POSTGRES_USER` while the value
    passes through Compose's `.env` interpolation and a double-quoted `CMD-SHELL` probe. The bullet now
    bounds the value and says why.
- Deferred (2 new): item 4 — `db:up` has no `--wait-timeout`, so the new restart policy can turn a failed
  first start into an indefinite hang, and the fix edits a command string the intent pins; item 5 — the two
  `# @public` annotations are load-bearing yet unpinned by any check, closable with a `varlock load`
  assertion once a test surface is sanctioned.
- Carried unchanged from the first pass: the verify-gate unreachability of `docker-compose.yml` (item 1 /
  DW-14), the unobserved Lima loopback forwarding (item 2 / DW-15), and the already-patched
  `${POSTGRES_PASSWORD:?…}`-reaches-every-command row.
- Rejected, with the recorded reason on each row in the triage log above: four findings about
  orchestrator-owned files (`deferred-work.md` DW-2/DW-14/DW-15, `sprint-status.yaml`) — real observations,
  but the invocation assigns those files to the orchestrator and the intent forbids editing `_bmad-output/`;
  five findings whose fix edits this build's spec (Design Notes superseded by the `@public` patch, the
  missing `.env.example`/README acceptance criteria, the PyYAML dependency, the "four committed files"
  overcount); and five refutations — the transient `in-review` status, the `localhost` `DATABASE_URL`
  regression and the stale-`REDIS_URL` `.env` (no deployment exists to regress), the `_bmad-output` write
  boundary, and the `.env.schema`-optional-vs-Compose-required "mismatch" (marking the key `@required`
  would stop the server booting against an external database it does not need the key for).

**Verification performed** (after the patches, in this worktree):
- `uv run --with pyyaml python3 -c "…yaml.safe_load('docker-compose.yml')…"` → `['app-db']
  ['mastracode-web-pgdata'] None` — one service, one volume, no networks.
- `grep -rn -i redis docker-compose.yml .env.schema .env.example README.md` → no output, exit 1.
- `git grep -n REDIS_URL -- ':(exclude)_bmad-output' ':(exclude)docs'` → hits only in `src/mastra/index.ts`
  (the read-only branch) and `src/mastra/index.test.ts` (the sweep).
- `git diff --stat <baseline> -- src package.json package-lock.json tsconfig.json AGENTS.md 'docs/'` → empty.
- `npm ci --no-audit --no-fund` → exit 0. `npm run check` → exit 0. `npm test` → exit 0, 18/18 passing.
- Both path guards → exit 0.
- Manual: `app-db` read by eye — `restart: unless-stopped`, `'127.0.0.1:54329:5432'`,
  `${POSTGRES_USER:-factory}` in `environment` and in the healthcheck, `${POSTGRES_PASSWORD:?…}`,
  `${POSTGRES_DB:-mastracode_web}`, `pgvector/pgvector:pg18`.

**Residual risks.** Everything this story configures is unreachable by the verify gate, so its correctness
rests on the file text alone until Story 1.4 lands a container engine (deferred items 1 and 5). Whether Lima
forwards a guest-loopback publish to the host is still unobserved (item 2), as is whether a failed first
start hangs `db:up` (item 4). `npm run db:up` and `npm run db:down` now require `POSTGRES_PASSWORD` in `.env`
— Story 1.4 owns recording that precondition in `ops/README.md`.

Follow-up review recommended: false — this follow-up pass patched no `high`, so the work has converged.

