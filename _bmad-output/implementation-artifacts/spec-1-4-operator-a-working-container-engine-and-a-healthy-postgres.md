---
title: 'Story 1.4: [operator] A working container engine and a healthy Postgres'
type: 'chore'
created: '2026-09-23'
status: done
baseline_revision: '89598f39533e487abed809e4d02bc359b4a4c892'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
operator_actions:
  - >-
    Install the engine and tools on the Factory host:
    `brew install colima docker docker-compose gh`.
  - >-
    If `docker compose version` reports an unknown command after that install, link the CLI plugin:
    `mkdir -p ~/.docker/cli-plugins && ln -sfn
    /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose`.
  - >-
    Start the VM:
    `colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs`.
  - >-
    Point Docker clients at the socket in the shell used for the remaining steps:
    `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`.
  - >-
    Checkpoint 1 — confirm the engine answers:
    `test -S "$HOME/.colima/default/docker.sock" && docker info >/dev/null && echo ok` prints `ok`.
  - >-
    Set `POSTGRES_PASSWORD` in `.env` at the repository root (see `README.md` for what the value must
    contain); every `docker compose` command aborts until it is set.
  - >-
    Bring up the datastore from the repository root: `npm run db:up`.
  - >-
    Checkpoint 2 — confirm the container is healthy on the expected image:
    `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db` prints `healthy` and
    `docker inspect --format '{{.Config.Image}}' mastracode-web-db` prints `pgvector/pgvector:pg18`.
  - >-
    Checkpoint 3 (DW-15) — confirm the host reaches the published port: `nc -z 127.0.0.1 54329` succeeds.
    Report the result either way. If it fails while checkpoint 2 passes, Lima is not forwarding guest
    loopback: change the `ports` entry in `docker-compose.yml` to `'54329:5432'`, re-run `npm run db:up`,
    and report which binding was needed — treating that change as provisional, since the bare form
    publishes on every interface inside the VM and gives up the loopback-only guarantee
    `docker-compose.yml` calls mandatory.
  - >-
    Checkpoint 4 — confirm the database exists:
    `docker exec mastracode-web-db psql -U factory -d mastracode_web -c '\conninfo'` reports a connection
    to `mastracode_web` (substitute the role and database names set in `.env` if the defaults were changed).
  - >-
    Report (DW-17) whether `npm run db:up` ever produced no output and failed to return; that is the
    predicted hang on a container the restart policy keeps crash-looping, and it has never been observed.
  - >-
    Once checkpoints 1–4 hold, close the story with
    `bmad-loop confirm 1-4-operator-a-working-container-engine-and-a-healthy-postgres`.
deferred:
  - summary: >-
      The `# @public` annotation on `DOCKER_HOST` is load-bearing for the production log, and no gate
      command observes it — a third instance of the condition DW-18 already records for
      `POSTGRES_USER` and `POSTGRES_DB`.
    evidence: |-
      `.env.schema`'s header is `@defaultSensitive=true`, so without `# @public` the key resolves as
      sensitive and `varlock run -- mastra start` masks it in non-TTY stdout — the deployment's only
      diagnostic surface, and the surface carrying the "cannot connect to the Docker daemon at …" error
      `ops/README.md` teaches the operator to read. Reproduced in a scratch schema: with the annotation
      `varlock run` printed the socket path, without it the value came back masked. Deleting the line
      leaves all five `[verify].commands` green — `tsc` is scoped to `src/**/*`, vitest to `--dir src`,
      and neither path guard nor `npm ci` parses `.env.schema`.
      Smallest fix: a vitest file under `src/` that shells out to
      `node_modules/.bin/varlock load --format json-full` and asserts `isSensitive === false` for all
      three `@public` keys — it would run inside `npm test`, the repo's own gate.
      Not done here: this story's intent forbids editing `src/` and `package.json`. The in-scope action
      is to widen DW-18 to name `DOCKER_HOST` alongside the other two, so the eventual fix covers all
      three rather than re-opening for this key later.
    location: >-
      .env.schema (DOCKER_HOST @public) / test surface
    severity: medium
  - summary: >-
      `ops/README.md` is not the sole committed source for `DOCKER_HOST`'s value: `docs/Self-hosting
      research.md` states the same two spellings, and this story sets that file read-only.
    evidence: |-
      §7.2 line 387 carries `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`, §7.3 line
      420 the absolute launchd spelling, and §8 line 476 the export again. AD-6 gives the owning
      subject's README the "what the value must contain" half, so two documents can now drift about the
      same key. Nothing checks either way.
      Not done here: the intent sets `docs/` read-only because its section numbers are stable anchors
      cited across the spec and stories. Making `docs/` link out rather than restate is Story 5.3's
      work (FR32), and Story 5.2 audits key ownership.
    location: >-
      docs/Self-hosting research.md §7.2 / §7.3 / §8 vs ops/README.md
    severity: low
  - summary: >-
      Nothing compares `.env.schema` and `.env.example`, so a key added to one and not the other is
      invisible to every gate command.
    evidence: |-
      NFR18 requires the example file to mirror the schema shape-for-shape, and this change hand-mirrored
      an eleven-line comment block plus the key into both. The five `[verify].commands` never parse
      either file, so a one-sided edit ships green. Pre-existing: both files and the mirroring convention
      predate this story.
      Smallest fix: a check asserting the set of key names in `.env.example` (commented out) equals the
      set declared in `.env.schema`.
    location: >-
      .env.schema / .env.example
    severity: low
---

<intent-contract>

## Intent

**Problem:** The host has no container engine — `docker`, `colima` and `docker-compose` are all absent
(verified; only `cloudflared` is installed). So the hardened `docker-compose.yml` Story 1.3 landed has never
been executed, the single datastore everything from Epic 2 onward depends on does not exist, and no committed
file tells the operator how to get either. `DOCKER_HOST`, the variable that points every Docker client at
Colima's socket, is named in `docs/Self-hosting research.md` §7/§8 but is declared nowhere and owned by no
README.

**Approach:** Installing software and starting a VM cannot be done from a story worktree, so this story commits
the procedure and parks. Create `ops/README.md` as the owning subject README for `DOCKER_HOST` and the
bring-up procedure by command, declare `DOCKER_HOST` in `.env.schema` (mirrored in `.env.example`) so the only
list of keys still holds, then finalize at `awaiting-operator` with the install, start and checkpoint commands
enumerated in `operator_actions:`.

## Boundaries & Constraints

**Always:**
- `ops/README.md` owns `DOCKER_HOST`: what the value must contain and how to obtain it (AD-6). It states the
  bring-up procedure by command, and the commands match `docs/Self-hosting research.md` §8 step 1–2 and the
  story's acceptance criteria exactly — `brew install colima docker docker-compose gh`, the
  `~/.docker/cli-plugins` symlink fallback, and
  `colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs`.
- `.env.schema` is the only list of keys (AD-6 / NFR7): a key this story starts asking the operator to set is
  declared there and mirrored, commented out and shape-only, in `.env.example` (NFR18).
- `ops/` is a **seeded** spine directory (`ARCHITECTURE-SPINE.md` Structural Seed; AGENTS.md already cites
  `ops/*.sh` and `ops/factory-start.sh`), so creating it executes the spine rather than changing it. Only
  `ops/README.md` is created here.
- Secrets never enter the repo. `DOCKER_HOST` is a local socket path, not a credential.
- The story finalizes at `status: awaiting-operator` with a non-empty `operator_actions:` list, never `done`
  and never `blocked`. Completion is `bmad-loop confirm 1-4-operator-a-working-container-engine-and-a-healthy-postgres`.

**Never:**
- Never restate the halves other files own: `.env.schema` keeps required/optional, sensitivity and `@public`;
  `README.md` keeps what the three `POSTGRES_*` values must contain and how to choose them. `ops/README.md`
  links to them and states the *precondition* (`POSTGRES_PASSWORD` must be in `.env` before `npm run db:up`)
  without re-deriving it.
- Never edit `docker-compose.yml`, `package.json`, `README.md`, `AGENTS.md`, `docs/Self-hosting research.md`,
  `src/`, `tsconfig.json`, or `.bmad-loop/policy.toml`. `db:up`/`db:down` command strings are pinned
  (AD-11 / NFR10); the research doc's section numbers are stable anchors; policy.toml is gitignored
  orchestrator surface that does not exist in this worktree's parent checkout contract.
- Never add `ops/launchagents/`, `ops/newsyslog/`, `ops/factory-start.sh` or `ops/install.sh` — those are
  Epic 4 artifacts, and `ops/README.md` must not document supervision variables that nothing sets yet.
- Never run `brew`, `colima`, `docker` or `docker compose`, and never attempt to install anything. There is no
  engine on this machine and a story worktree cannot create one.
- Never add a root-level file or any root directory other than the seeded `ops/`.

</intent-contract>

## Code Map

- `ops/README.md` -- **to create**; the whole story's committable centre. Nothing exists under `ops/` today
  (verified: no such directory). Content comes from `docs/Self-hosting research.md` §8 lines 470–481 (step 1
  engine + tools, step 2 Postgres, with both checkpoints) and §7.1 lines 361–367 (the Colima flags, identical
  to §8's) plus §7.2 line 387 (`export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"` — "dockerode
  reads this") and §7.3 line 420 (the plist sets the same key as an absolute literal,
  `unix:///Users/koval/.colima/default/docker.sock`, because launchd does not expand `$HOME`).
- `.env.schema` -- header lines 4–5 are `@defaultRequired=false` / `@defaultSensitive=true`, so a new key is
  optional and sensitive unless annotated. Line 217 opens the
  `# Local Postgres (docker-compose.yml)` block (keys at 225–228, `POSTGRES_USER`/`POSTGRES_DB` carry
  `# @public`); line 231 opens `# GitHub projects`. Insert a `Container engine (ops/README.md)` block between
  them, declaring `DOCKER_HOST` with `# @public` and **no** `@type` annotation — `unix://…` is not an HTTP URL
  and `@type=url` would risk rejecting it.
- `.env.example` -- the same two anchors, commented out: the Local Postgres block is lines 188–198 and
  `# GitHub projects` opens at line 200. `.env.example` carries **no** varlock annotations (verified: the
  `@public` on `POSTGRES_USER`/`POSTGRES_DB` appears only in `.env.schema`), so mirror prose + `# DOCKER_HOST=`
  only.
- `README.md` -- **read-only**. Lines 53–63 are the owning passage for `POSTGRES_USER`/`POSTGRES_PASSWORD`/
  `POSTGRES_DB`, including `openssl rand -hex 32`, the first-init-only semantics, and the recovery paths when
  `POSTGRES_PASSWORD` goes missing. Link to it; do not copy it.
- `docker-compose.yml` -- **read-only**, and the thing the operator brings up. `app-db`:
  `image: pgvector/pgvector:pg18`, `container_name: mastracode-web-db`, `restart: unless-stopped`, publish
  `127.0.0.1:54329:5432`, `${POSTGRES_PASSWORD:?…}` with no default, TCP healthcheck with a 30 s
  `start_period`. These are the facts the checkpoints assert.
- `package.json` -- **read-only**. `db:up` = `docker compose up -d --wait`, `db:down` = `docker compose down`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- **read-only**. DW-15 asks for exactly one
  observation this bring-up can supply (does Lima forward guest loopback `54329` to host loopback?) and names
  the fallback (revert the `ports` entry to `'54329:5432'`). DW-17 predicts `npm run db:up` hangs rather than
  errors on a container that never reaches healthy. Both belong in the operator checkpoint list.
- Host facts (verified in this worktree): `docker`, `colima`, `docker-compose` and `gh` are all absent;
  `cloudflared` is at `/opt/homebrew/bin/cloudflared`; `pg_isready` and `psql` are **not** installed, so a
  host-side reachability probe must use `nc` (`/usr/bin/nc`), not `pg_isready`.
- Verified behaviour: with `DOCKER_HOST` exported in the parent shell and declared but unset in a schema,
  `varlock run -- node -e 'console.log(process.env.DOCKER_HOST)'` printed the inherited value. Declaring the
  key therefore does not strip the plist's `DOCKER_HOST` from the Factory process in Epic 4.

## Tasks & Acceptance

**Execution:**
- `ops/README.md` -- create the operator-plane README for the container engine: a `DOCKER_HOST` section
  (what the value must contain — a `unix://` URL at an absolute path to Colima's socket, `$HOME`-expanded for
  a shell and spelled absolutely for launchd — and how to obtain it: it is the socket `colima start` creates),
  then the bring-up procedure as runnable commands in order (install, cli-plugin symlink fallback, `colima
  start` with the five flags, `export DOCKER_HOST`, `docker info`, then `npm run db:up`), then the checkpoints
  with the exact expected result. State the `POSTGRES_PASSWORD`-in-`.env` precondition and link `README.md`
  for the values themselves -- this is the file the story's acceptance criteria name, and AD-6's "how to
  obtain it" half has no other home.
- `.env.schema` -- add a `Container engine (ops/README.md)` block declaring `DOCKER_HOST`, `# @public`, no
  `@type` -- the only list of keys must include a key the repo now asks the operator to set, and redacting a
  socket path would corrupt Docker errors in the deployment's only diagnostic surface.
- `.env.example` -- mirror the block commented out, shape only, no varlock annotations -- NFR18.
- `_bmad-output/implementation-artifacts/spec-1-4-…-postgres.md` -- finalize this spec to
  `status: awaiting-operator` with a non-empty `operator_actions:` list and an `## Auto Run Result` section.

**Acceptance Criteria:**
- Given AD-6 assigns `ops/README.md` ownership of `DOCKER_HOST`, when `ops/README.md` is read, then it states
  what the value must contain and how to obtain it, and it is the only committed file that does so.
- Given the story's install criterion, when `ops/README.md` is read, then it contains
  `brew install colima docker docker-compose gh`, the `~/.docker/cli-plugins/docker-compose` symlink fallback
  for when `docker compose` is not found, and `colima start --cpu 12 --memory 32 --disk 200 --vm-type vz
  --mount-type virtiofs`, and a `docker info` checkpoint against `~/.colima/default/docker.sock`.
- Given the story's datastore criterion, when `ops/README.md` is read, then it gives `npm run db:up` as the
  bring-up command and checkpoints that the container reports healthy on `127.0.0.1:54329` with database
  `mastracode_web` on the `pgvector/pgvector:pg18` image — and the host-side probe it names is one that exists
  on this machine (`nc`), not `pg_isready`.
- Given `.env.schema` is the only list of keys (AD-6 / NFR7), when it is diffed against `baseline_revision`,
  then `DOCKER_HOST` is declared exactly once with `# @public`; and when `.env.example` is diffed, then the
  same key appears commented out with no value and no annotations.
- Given secrets never enter the repo (NFR18), when the full diff against `baseline_revision` is read, then no
  added line contains a usable password, key or token.
- Given no two documents may own the same half (AD-6), when `ops/README.md` is read, then it neither states
  whether any key is required/optional/sensitive nor re-derives how to choose `POSTGRES_USER`,
  `POSTGRES_PASSWORD` or `POSTGRES_DB` — it links `README.md` and `.env.schema` for those.
- Given the read-only set, when
  `git diff --stat {baseline_revision} -- src package.json package-lock.json tsconfig.json docker-compose.yml
  AGENTS.md README.md 'docs/'` runs, then it produces no output.
- Given the verify gate, when `npm ci --no-audit --no-fund`, `npm run check`, both path guards and `npm test`
  run in order in a worktree with no `node_modules/`, then every one exits 0.
- Given installing software and starting a VM are outside a story worktree, when the session finishes, then
  the spec's frontmatter reads `status: awaiting-operator` with a non-empty `operator_actions:` list carrying
  the install, start and checkpoint commands, and the Auto Run Result reports the same status.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 30 findings — high 0, medium 11, low 13, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` Spec frontmatter reads `in-review` while its own AC and Auto Run Result require `awaiting-operator` — the diff was captured mid-review; the workflow mandates `in-review` for the duration of the review step and writes the terminal status at finalize, which this pass did.
  - `[medium]` `[patch]` `.env.example` now invites `DOCKER_HOST` in `.env`, but nothing says what `.env` reaches — verified: the `docker` CLI never reads `.env`, so an operator who only sets it there finds bare `docker` commands unchanged. Patched: a `Setting it in .env instead` paragraph in `ops/README.md` naming what it reaches (server via varlock, Compose) and what it does not.
  - `[low]` `[patch]` `.env` does not shell-expand, so `unix://$HOME/…` stays literal there — same silent failure the section already warns about for launchd. Patched in the same paragraph, plus a one-line caution in `.env.example`.
  - `[medium]` `[patch]` Checkpoint 3's `'54329:5432'` fallback abandons the loopback-only publish `docker-compose.yml` calls mandatory, with no warning — verified against that file's own comment. Patched: the fallback now states the exposure and is marked provisional/report-only, mirrored into the matching `operator_actions:` item.
  - `[low]` `[patch]` `docker context inspect --format '{{.Endpoints.docker.Host}}'` prints the current context's stored endpoint, which `DOCKER_HOST` overrides when set, so it cannot confirm the socket in force. Patched: command deleted, `echo "$DOCKER_HOST"` kept.
  - `[medium]` `[patch]` The shared rationale claimed the CLI and Compose "fail with cannot connect to the Docker daemon" without `DOCKER_HOST` — false: `colima start` creates and activates a `colima` docker context. A normative file asserting it would make an operator distrust the doc the moment `docker info` works without the export. Patched in all three files.
  - `[low]` `[patch]` The same paragraph asserted in the present tense that the server makes dockerode calls; verified no `@mastra/docker`/dockerode dependency exists in `package.json`. Patched to future tense in the same rewrite.
  - `[false]` `[reject]` `ln -sfn /opt/homebrew/...` hardcodes the Apple-silicon Homebrew prefix — this file documents one known host (AD-12, single machine), verified Apple silicon (`/opt/homebrew/bin/cloudflared` present), and the path is the one `docs/Self-hosting research.md` §8 pins. The Intel outcome is unreachable here.
  - `[low]` `[reject]` No host-capacity precondition for `--cpu 12 --memory 32 --disk 200`, and no note that the flags are creation-time only — the values are the architecture spine's, fixed for this machine (§7.1 plist repeats them verbatim), and macOS 26 satisfies `--vm-type vz`. Adding capacity guidance and a resize procedure is more than a direct correction for a path the operator is unlikely to take.
  - `[medium]` `[patch]` Nothing starts Colima at login yet, so `restart: unless-stopped` does not bring Postgres back after a reboot the way `docker-compose.yml`'s comment implies — verified: the LaunchAgents are Epic 4. Patched: one sentence at teardown requiring `colima start` after a reboot until they exist.
  - `[low]` `[reject]` `ops/README.md` has no entry point from the root README, "report the result" names no destination, and `operator_actions:` duplicates the checkpoints — `.env.schema` and `.env.example` both name the file, `README.md` is read-only in this story, the reporting destination is the human running `bmad-loop confirm`, and a non-empty imperative `operator_actions:` is required by the dispatch contract, so the duplication is the format, not a defect.
  - `[false]` `[reject]` Intel/custom Homebrew prefix makes the symlink dangle — same refutation as the blind-hunter row above; one known Apple-silicon host.
  - `[low]` `[reject]` Host under 12 cores / 32 GB / 200 GB, or macOS below 13 for `--vm-type vz` — unreachable on the documented host; same refutation as the capacity row above.
  - `[medium]` `[patch]` `'54329:5432'` fallback binds every interface, contradicting the loopback-only rule — same defect as the checkpoint-3 row; patched by the same change.
  - `[low]` `[patch]` Checkpoint 2 has no branch for a container that is unhealthy or absent; `docker inspect` on a missing container errors with "No such object". Patched: a line pointing at `docker compose ps` and `docker compose logs app-db` for any status other than `healthy`.
  - `[low]` `[reject]` Port 54329 could already be bound by a leftover container or another Postgres — no engine has ever run on this host and `psql`/`pg_isready` are absent, so nothing is holding it; a pre-flight `lsof` step adds ceremony for a path the operator is unlikely to meet.
  - `[medium]` `[patch]` Operator sets `DOCKER_HOST` in `.env` instead of exporting it and bare `docker` still fails — same defect as the `.env`-reach row; patched by the same paragraph.
  - `[low]` `[patch]` Teardown in a fresh shell has no export, so `npm run db:down` looks unreachable — root cause was the false "clients fail without `DOCKER_HOST`" claim; the corrected rationale resolves it, since Compose resolves the colima context.
  - `[medium]` `[patch]` `ops/README.md:12-15` claim that the CLI and Compose fail without the variable is contradicted by colima's own docker context — same defect as the rationale row; patched by the same rewrite.
  - `[medium]` `[patch]` `.env.schema` repeated the same false rationale as the reason the key exists — patched in the same rewrite; the schema comment now gives the context/dockerode split and keeps only its own sensitivity half.
  - `[false]` `[reject]` Frontmatter `status: 'in-review'` contradicts the AC — same refutation as the first row: transient review-step state, finalized to `awaiting-operator`.
  - `[medium]` `[defer]` The `# @public` on `DOCKER_HOST` is load-bearing for the production log and no gate command observes it — filed pre-verified by the verification-gap layer, and reproduced: deleting the annotation leaves all five `[verify].commands` green while `varlock run` masks the socket path. This is a third instance of open DW-18; the fix (a vitest file shelling out to `varlock load`) edits `src/` and `package.json`, which this story's intent forbids. Deferred item 1.
  - `[low]` `[defer]` The AC's "only committed file that does so" cannot hold: `docs/Self-hosting research.md` §7.2/§7.3/§8 state the same `DOCKER_HOST` spellings, and this story sets `docs/` read-only because its section numbers are stable anchors. Making `ops/README.md` sole is Story 5.3's "docs/ links out" work (FR32). Deferred item 2.
  - `[low]` `[defer]` Nothing compares `.env.schema` and `.env.example`, so a key added to one and not the other is invisible to every gate command — pre-existing (both files predate this story); this change hand-mirrors an eleven-line block into both. Deferred item 3.
  - `[medium]` `[defer]` The only machine-checkable behaviour change (`@public` sensitivity) has zero automated coverage — same defect as the `@public` row; deferred as item 1.
  - `[low]` `[patch]` Checkpoint 1's context command cannot answer which socket is in force — same defect as the `docker context inspect` row; patched by the same deletion.
  - `[low]` `[patch]` The checkpoints prove three disjoint things and `nc -z` is weaker than DW-15's `pg_isready` probe — verified true; `pg_isready`/`psql` are absent from the host, so no stronger host-side probe exists without adding a dependency. Patched to the extent it can be: checkpoint 3 now says `nc -z` proves only a listener and points at checkpoint 4 for the server itself.
  - `[medium]` `[patch]` The checkpoint-3 fallback instructs an operator edit that reverses Story 1.3's hardening and escapes both review and the gate — same defect as the fallback row; patched by the same provisional/report-only framing.
  - `[false]` `[reject]` The `.env.schema`/`.env.example` edits exceed the literal AC — the epic's own constraint requires any key whose presence changes to be reflected in the schema, and Story 1.3 set the precedent with `POSTGRES_*` (Compose-only keys, declared anyway). Not a deviation.
  - `[false]` `[reject]` Frontmatter and narrative disagree on status — same refutation as the two rows above; the auditor itself noted the working copy holds `awaiting-operator`.

## Design Notes

**Why `DOCKER_HOST` is declared even though the acceptance criteria only name `ops/README.md`.** The epic's
own constraint is that any key whose *presence* changes must be reflected in `.env.schema`. Before this story
no committed file asked anyone to set `DOCKER_HOST`; after it, `ops/README.md` does. Story 1.3 set the
precedent in the same shape: `POSTGRES_*` are read by Compose and never by the server, and they were declared
anyway. The hazard worth ruling out was varlock stripping an inherited value — `varlock run` was observed
passing an exported `DOCKER_HOST` through to the child with the key declared and unset in the schema, so the
Epic 4 plist keeps working.

**Why `# @public` and no `@type`.** The file header is `@defaultSensitive=true`, so an unannotated
`DOCKER_HOST` would be masked in every `npm run start` log — and `varlock run` applies its find/replace to
non-TTY stdout, which is the deployment's only diagnostic surface. A masked socket path turns "cannot connect
to the Docker daemon at …" into an unreadable error. It is a local filesystem path, not a credential.
`@type=url` is omitted deliberately: the value is a `unix://` URL and the annotation's validator is not known
to accept that scheme here.

**Why the checkpoint list carries DW-15 and DW-17.** Story 1.3 hardened the publish to `127.0.0.1:54329:5432`
and added `restart: unless-stopped` without an engine to observe either. This bring-up is the first and only
chance to settle both cheaply: `nc -z 127.0.0.1 54329` answers whether Lima forwards guest loopback to host
loopback (if it fails, the recorded fallback is reverting the `ports` entry to `'54329:5432'`), and a
`npm run db:up` that produces no output rather than an error is DW-17 confirmed.

## Verification

**Commands:**
- `test -f ops/README.md && git ls-files --error-unmatch ops/README.md` -- expected: exits 0 (file created and
  staged/committed, not untracked)
- `grep -c '^DOCKER_HOST=' .env.schema` -- expected: `1`; and `grep -B1 '^DOCKER_HOST=' .env.schema` shows
  `# @public`
- `grep -c '^# DOCKER_HOST=$' .env.example` -- expected: `1`
- `node_modules/.bin/varlock load --format json-full` -- expected: exits 0 (the schema still parses with the
  new key; runs with no `.env` present)
- `git diff --stat 89598f39533e487abed809e4d02bc359b4a4c892 -- src package.json package-lock.json tsconfig.json docker-compose.yml AGENTS.md README.md 'docs/'`
  -- expected: no output
- `git diff 89598f39533e487abed809e4d02bc359b4a4c892 -- ops .env.schema .env.example | grep '^+'` -- expected:
  no line carries a usable password, key or token
- `npm ci --no-audit --no-fund` -- expected: exits 0 with no `node_modules/` present
- `npm run check` -- expected: exits 0
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected:
  exits 0 (a `.md` file under `ops/` is invisible to this guard)
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: exits 0
- `npm test` -- expected: exits 0, all tests passing

**Manual checks (if no CLI):**
- No container engine exists on this machine, so every runtime claim in `ops/README.md` is unexecutable here.
  Read it against `docs/Self-hosting research.md` §8 lines 470–481 and confirm each command matches
  character-for-character in flags and order, and that the two checkpoints are the ones the story's acceptance
  criteria state (`docker info` succeeds; the container is healthy on `127.0.0.1:54329` with `mastracode_web`
  on `pgvector/pgvector:pg18`).
- Read `ops/README.md` against `README.md` lines 53–63 and confirm no sentence re-derives how to choose a
  `POSTGRES_*` value, and against `.env.schema` and confirm no sentence states required/optional or
  sensitivity.

## Auto Run Result

Status: awaiting-operator

**Summary.** The committable half of this story is in: `ops/` now exists with a single `README.md` that owns
`DOCKER_HOST` per AD-6 — what the value must contain (a `unix://` URL at the absolute path of the running
Colima profile's socket, `$HOME`-expanded for a shell and spelled out in full for `launchd`, which does not
expand it) and how to obtain it (`colima start` creates it; nothing is generated or requested). The same file
states the bring-up procedure as runnable commands in the order `docs/Self-hosting research.md` §8 steps 1–2
give them — `brew install colima docker docker-compose gh`, the `~/.docker/cli-plugins/docker-compose` symlink
fallback, `colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs`, the
`DOCKER_HOST` export, `docker info`, then `npm run db:up` — followed by four checkpoints with their exact
expected results. `.env.schema` declares `DOCKER_HOST` once under a new `Container engine (ops/README.md)`
block, marked `# @public` with no `@type`, and `.env.example` mirrors it commented out and annotation-free.

The two runtime halves — installing software and starting a VM — cannot be done from a story worktree, and
there is no container engine on this host (`docker`, `colima`, `docker-compose` and `gh` are all absent;
only `cloudflared` is installed). The story therefore parks at `awaiting-operator` with those steps and the
checkpoints enumerated in `operator_actions:`, per the epic's third acceptance criterion. Completion is
`bmad-loop confirm 1-4-operator-a-working-container-engine-and-a-healthy-postgres`.

**Files changed** (against `89598f39533e487abed809e4d02bc359b4a4c892`):
- `ops/README.md` — created. `DOCKER_HOST` ownership, the precondition, the bring-up commands, and
  checkpoints 1–4 plus the `db:up`-never-returns diagnosis and a teardown block.
- `.env.schema` — `Container engine (ops/README.md)` block added between the Local Postgres and GitHub
  projects blocks; `DOCKER_HOST` declared `# @public`.
- `.env.example` — the same block mirrored, commented out, no value and no varlock annotations.
- `_bmad-output/implementation-artifacts/spec-…-postgres.md` — this spec, finalized.

**Verification run.**
- `test -f ops/README.md && git ls-files --error-unmatch ops/README.md` — 0; the file is tracked, not
  untracked.
- `grep -c '^DOCKER_HOST=' .env.schema` — `1`, and the preceding line is `# @public`.
- `grep -c '^# DOCKER_HOST=$' .env.example` — `1`.
- `node_modules/.bin/varlock load --format json-full` — 0 with no `.env` present; the resolved item reports
  `isSensitive: false`, so the `@public` annotation took effect and the socket path will not be masked in
  `npm run start`'s output.
- `git diff --stat {baseline} -- src package.json package-lock.json tsconfig.json docker-compose.yml
  AGENTS.md README.md 'docs/'` — no output.
- Added lines under `ops/`, `.env.schema` and `.env.example` scanned for password/secret/token assignments
  and long base64-shaped literals — no match.
- `npm ci --no-audit --no-fund` in a worktree with `node_modules/` removed — 0.
- `npm run check` — 0. Both path guards — 0. `npm test` — 0, 18/18 passing.

**What was not verified, and cannot be here.** Every runtime claim in `ops/README.md` is unexecutable on this
machine — the whole point of the story. The commands were checked character-for-character against
`docs/Self-hosting research.md` §8 lines 470–481 (flags and order) and §7.2/§7.3 for the two `DOCKER_HOST`
spellings, but nothing has run them. The host-side probe is `nc` (`/usr/bin/nc`, present) rather than
`pg_isready`, which is not installed here and exists only inside the container.

**Deferred items this bring-up is asked to settle.** Checkpoint 3 answers DW-15 (does Lima forward guest
loopback `54329` to host loopback?) and carries the recorded fallback — revert `ports` to `'54329:5432'`.
The "if `npm run db:up` never returns" note answers DW-17 (a container the restart policy keeps crash-looping
gives `--wait` nothing to end on, so the command hangs instead of erroring). Both are in `operator_actions:`
as observations to report; neither is fixed here, since the fixes land in files this story may not edit.

**This pass's findings** — 30 findings from four layers: high 0, medium 11, low 13, false 6, maybe-false 0.
Grouped by root cause, seven entries were patched (at entry verdict: 4 medium, 3 low; 0 high):
- `[medium]` The shared rationale in `ops/README.md`, `.env.schema` and `.env.example` claimed the `docker`
  CLI and Compose fail without `DOCKER_HOST`. `colima start` creates and activates a `colima` docker
  context, so both resolve the socket without it. Rewritten in all three: the context covers the CLI and
  Compose; `DOCKER_HOST` covers the consumers that do not read contexts (dockerode, once the Docker sandbox
  lands, and anything `launchd` starts) and overrides the context when set. The same rewrite dropped a
  present-tense dockerode claim for a dependency `package.json` does not carry yet.
- `[medium]` `.env` was an unaddressed third place to set the value, created by this very change adding
  `# DOCKER_HOST=` to `.env.example`. A paragraph now states what `.env` reaches (the server via varlock,
  and Compose) and what it does not (a bare `docker` command), and that the path must be written out in full
  there because nothing expands `$HOME` in `.env`.
- `[medium]` Checkpoint 3's `'54329:5432'` fallback gave up the loopback-only publish `docker-compose.yml`
  calls mandatory, silently. It now says so and is marked provisional and report-only, mirrored into the
  matching `operator_actions:` item.
- `[medium]` Nothing starts Colima at login until the Epic 4 LaunchAgents exist, so `restart: unless-stopped`
  cannot bring Postgres back after a reboot on its own. One sentence at teardown now says to run
  `colima start` first.
- `[low]` `docker context inspect --format '{{.Endpoints.docker.Host}}'` cannot report which socket
  `DOCKER_HOST` selected; deleted in favour of `echo "$DOCKER_HOST"`.
- `[low]` Checkpoint 2 had no branch for an unhealthy or absent container; it now points at
  `docker compose ps` and `docker compose logs app-db`.
- `[low]` Checkpoint 3 overclaimed: `nc -z` proves a listener, not that Postgres answers. Said plainly, with
  checkpoint 4 named as what confirms the server.

Rejected (6 false, 3 low) with reasons recorded per row in the triage log: the mid-review `status: in-review`
snapshot (twice more as duplicates), the Apple-silicon Homebrew prefix (one documented host, verified), the
host-capacity and `--vm-type vz` preconditions (values are the spine's for this machine), a port-54329
collision (no engine has ever run here), the missing root-README entry point and reporting destination
(`.env.schema`/`.env.example` both name the file; `README.md` is read-only here), and the claim that the
`.env.schema`/`.env.example` edits exceed the AC (the epic's own key-presence constraint requires them, with
Story 1.3's `POSTGRES_*` precedent).

**Deferred (3 new).** Item 1 — the `# @public` on `DOCKER_HOST` is load-bearing for the production log and no
gate command observes it, a third instance of open DW-18, closable only by a test under `src/` this story may
not add. Item 2 — `docs/Self-hosting research.md` §7.2/§7.3/§8 still state the same `DOCKER_HOST` spellings,
so `ops/README.md` is not yet the sole source; `docs/` is read-only here and Story 5.3 owns it. Item 3 —
nothing compares `.env.schema` against `.env.example`, so a one-sided key edit ships green.

**Deferred items this bring-up is asked to settle.** Checkpoint 3 answers DW-15 (does Lima forward guest
loopback `54329` to host loopback?) and carries the recorded fallback. The "if `npm run db:up` never returns"
note answers DW-17. Both are in `operator_actions:` as observations to report; neither is fixed here, since
the fixes land in files this story may not edit.

**Follow-up review recommended: true.** Four `medium` entries were patched on a first pass. The specific
unverified risk is that the corrected rationale is itself reasoned from documentation, not observed: no
container engine exists on this host, so "`colima start` creates and activates a docker context, and the CLI
and Compose resolve the socket without `DOCKER_HOST`" — now asserted in three committed files, one of them
the only list of keys — has never been executed. If it is wrong in the other direction, the bring-up
procedure understates what the export is for.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Install the engine and tools on the Factory host: `brew install colima docker docker-compose gh`.
- If `docker compose version` reports an unknown command after that install, link the CLI plugin: `mkdir -p ~/.docker/cli-plugins && ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose`.
- Start the VM: `colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs`.
- Point Docker clients at the socket in the shell used for the remaining steps: `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`.
- Checkpoint 1 — confirm the engine answers: `test -S "$HOME/.colima/default/docker.sock" && docker info >/dev/null && echo ok` prints `ok`.
- Set `POSTGRES_PASSWORD` in `.env` at the repository root (see `README.md` for what the value must contain); every `docker compose` command aborts until it is set.
- Bring up the datastore from the repository root: `npm run db:up`.
- Checkpoint 2 — confirm the container is healthy on the expected image: `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db` prints `healthy` and `docker inspect --format '{{.Config.Image}}' mastracode-web-db` prints `pgvector/pgvector:pg18`.
- Checkpoint 3 (DW-15) — confirm the host reaches the published port: `nc -z 127.0.0.1 54329` succeeds. Report the result either way. If it fails while checkpoint 2 passes, Lima is not forwarding guest loopback: change the `ports` entry in `docker-compose.yml` to `'54329:5432'`, re-run `npm run db:up`, and report which binding was needed — treating that change as provisional, since the bare form publishes on every interface inside the VM and gives up the loopback-only guarantee `docker-compose.yml` calls mandatory.
- Checkpoint 4 — confirm the database exists: `docker exec mastracode-web-db psql -U factory -d mastracode_web -c '\conninfo'` reports a connection to `mastracode_web` (substitute the role and database names set in `.env` if the defaults were changed).
- Report (DW-17) whether `npm run db:up` ever produced no output and failed to return; that is the predicted hang on a container the restart policy keeps crash-looping, and it has never been observed.
- Once checkpoints 1–4 hold, close the story with `bmad-loop confirm 1-4-operator-a-working-container-engine-and-a-healthy-postgres`.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
