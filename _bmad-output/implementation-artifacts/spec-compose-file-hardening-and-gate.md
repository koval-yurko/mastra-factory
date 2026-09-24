---
title: 'Pin the Compose project name, bound db:up, and put docker-compose.yml under the gate (DW-14, DW-16, DW-17)'
type: 'chore'
created: '2026-09-24'
status: 'done'
baseline_revision: 'e657db023ce490c6cc6ef34125bcc7f8edd9c23f'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      DW-17's crash-loop claim is still reasoned from Compose's documented flag semantics and has
      never been observed, and this change makes the ledger's own settling experiment hazardous to
      run: with the project name pinned, feeding initdb a value it rejects now operates on the live
      production stack rather than a per-worktree throwaway.
    evidence: |-
      Nothing in this change starts a container: guards 49 and 50 use `docker compose config`, which
      resolves the model locally and needs no daemon (measured with the engine present). DW-17's
      recorded experiment is "set POSTGRES_USER to a value initdb rejects and run `npm run db:up`;
      if it hangs, the claim holds." After `name: mastra-factory`, that command addresses the volume
      `mastra-factory_mastracode-web-pgdata` and the container `mastracode-web-db`, both verified
      live and healthy on this host — and clearing the resulting crash loop requires
      `docker compose down -v`, which destroys the only copy of projects, work items, sessions,
      memory and tokens. So the bound `--wait-timeout 120` is gated as a STRING (guard 51) and
      unverified as a BEHAVIOUR, and `ops/README.md` now says so in those words.
      What would settle it: run the experiment against a throwaway stack — a copy of
      docker-compose.yml with a different `name:` and a different published port — on the Story 1.4
      host, and record whether the unbounded form hangs and whether 120s is above a cold initdb.
    location: >-
      package.json db:up / docker-compose.yml restart policy / ops/README.md "If `npm run db:up` hangs"
    severity: medium
  - summary: >-
      The gate asserts the project name Compose RESOLVES, never the volume that actually exists, and
      `container_name: mastracode-web-db` — DW-16's "mirror problem" — stays ungated and unchanged.
    evidence: |-
      Guard 49 reads `docker compose config --format json` only. It cannot distinguish "pinned to the
      name of the live volume" from "pinned to a name no volume has": no command in [verify].commands
      runs `docker volume ls`, and a gate that did would be asserting host state rather than tracked
      content. On this host the two happen to agree (`docker volume ls` shows
      mastra-factory_mastracode-web-pgdata), which is luck of the directory basename, not proof.
      Separately, the fixed `container_name` defeats per-project namespacing and, with
      `restart: unless-stopped`, lets a container started from a since-deleted directory survive
      reboots holding both the name and port 54329. DW-16 records both as pre-existing and names only
      the `name:` key as its smallest fix; renaming the container would also invalidate four
      copy-paste procedures in README.md (:60, :111, :124, :204). Mitigated by documentation here:
      README.md:203 and the docker-compose.yml comment now tell the operator to check
      `docker volume ls` for an older `<basename>_mastracode-web-pgdata` before concluding data is gone.
      Smallest fix: drop `container_name` and let Compose namespace it, updating those four procedures
      to `docker compose exec app-db …` in the same change.
    location: >-
      docker-compose.yml container_name / .bmad-loop/policy.toml [verify].commands guard 49
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `docker-compose.yml` pins no project name, so the data volume's real name follows the
checkout directory basename — verified in this worktree, where `docker compose config` resolves it to
`dw-compose-file-hardening-and-gate_mastracode-web-pgdata` rather than
`mastra-factory_mastracode-web-pgdata`, and AGENTS.md:31 records that volume as the only copy of
projects, work items, sessions, memory and tokens (DW-16). `npm run db:up` is `docker compose up -d
--wait` with no `--wait-timeout`, and Compose's `--wait` defaults to `--wait-timeout 0` (wait forever),
so the `restart: unless-stopped` added at docker-compose.yml:27 turns an initdb failure into a crash
loop that never ends (DW-17). And nothing in `[verify].commands` parses YAML or invokes Compose, so
every property Story 1.3 shipped — the loopback publish, the required-password guard, the TCP
healthcheck — ships behind no gate at all (DW-14).

**Approach:** Add a top-level `name: mastra-factory` to `docker-compose.yml`; give `db:up` an explicit
`--wait-timeout 120`; and append gate commands that run `docker compose config` and assert the resolved
model, now that `docker`, `colima` and `docker-compose` are all present on this host under
`/opt/homebrew/bin` — DW-14's stated precondition.

## Boundaries & Constraints

**Always:** `[verify].commands` is APPEND-ONLY — new guards go at the end of the array; never edit,
reorder or delete an existing element. The gate runs in a story worktree with no `.env`, and
`POSTGRES_PASSWORD` uses required interpolation (`:?`), so every Compose invocation in a guard must
supply a throwaway value and must not depend on an ambient `.env`. Keep `docker-compose.yml`'s header
comment truthful about the command strings `package.json` actually carries.

**Never:** Do not rename `container_name: mastracode-web-db` — the ledger's smallest fix for DW-16 is
the `name:` key alone, the container name is pre-existing, and README.md:60/111/124/204 address it by
that name. Do not change the `start` script (AD-11/NFR10 bind that name and the repo root; they do not
bind `db:up`'s body). Do not change the image, the published port `54329`, the mount target, the
healthcheck or the `restart` policy — this change pins them, it does not revise them. Do not touch
`.env.schema`, `.env.example` or the deferred-work ledger.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gate on the corrected tree | Story worktree, no `.env`, docker on PATH | All three new guards exit 0 | No error expected |
| Project name unpinned | `name: mastra-factory` deleted from `docker-compose.yml` | Parse guard exits 1 naming the resolved project and volume names | Message states the volume is the only copy of the data |
| Loopback publish inverted | `ports` reverted to `'54329:5432'` | Parse guard exits 1 — resolved `host_ip` is `0.0.0.0`, not `127.0.0.1` | Message names the found bind address |
| Required password removed | `${POSTGRES_PASSWORD}` without `:?` | Required-password guard exits 1 — `config` now succeeds with no password | Message states a committed/absent password would be silently accepted |
| Unbounded `db:up` | `db:up` back to `docker compose up -d --wait` | Script guard exits 1 naming the missing `--wait-timeout` | Message cites the crash-loop that never terminates |
| Header comment drifts | `docker-compose.yml` still quotes the old `db:up` body | Script guard exits 1 naming both sides | Message names the file and the script |
| No container engine | `docker` absent from PATH | Guards exit 1 saying so explicitly | Reported as missing engine, never as a compose-file fault |

</intent-contract>

## Code Map

- `docker-compose.yml` -- 59 lines. `services:` at :18, `app-db` at :19, `container_name` :24,
  `restart: unless-stopped` :27, `ports: ['127.0.0.1:54329:5432']` :28-31, `environment` :32-36
  (`POSTGRES_USER: ${POSTGRES_USER:-factory}`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?…}`,
  `POSTGRES_DB: ${POSTGRES_DB:-mastracode_web}`), `volumes` mount to `/var/lib/postgresql` :37-40,
  `healthcheck` :41-55, top-level `volumes:` :57-58. Header comment lines :8-10 quote the `db:up` /
  `db:down` command bodies verbatim — the only such copy in the repo (verified by
  `git grep "docker compose up"`). No top-level `name:` key exists.
- `package.json` -- `scripts.db:up` = `docker compose up -d --wait`, `scripts.db:down` =
  `docker compose down`. Confirmed no existing gate command pins either body: `[verify].commands`
  guard 48 (policy.toml:1535) pins `scripts.start` only.
- `.bmad-loop/policy.toml` -- tracked (mode 100644, not gitignored). `[verify]` at :28,
  `commands = [` at :1487, array closes at :1536 — 48 commands, one per line, indices 1488→1 … 1535→48.
  **Guard 28 is policy.toml:1515**: it greps `${KEY` interpolations out of `docker-compose.yml` and
  requires each to be declared in `.env.schema`. A literal `name: mastra-factory` introduces no `${}`,
  so guard 28 is unaffected — re-confirm it stays green after the edit.
- `_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md`
  -- AD-11 at :197 binds `npm run start` and the repo root only (read: `db:up` body is in scope).
  AD-12 at :208 requires the `redis` service be absent from `docker-compose.yml` — gated by nothing today.
- `AGENTS.md:31` -- "the Postgres volume is the only copy of projects, work items, sessions, memory and
  tokens". Read-only; this is the stake behind DW-16.
- `README.md` -- :59 (`npm run db:up`), :60/:111/:124/:204 (`mastracode-web-db` by name), :200 (port
  54329 on loopback), :319 (script table, names only — no command bodies). Read-only: none of these
  quotes a `db:up` command body, so none goes stale from this change.
- `_bmad-output/implementation-artifacts/spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
  -- the source story for all three ledger entries; its Design Notes carry the rationale for the
  properties the new gate command pins.

**Measured on this host (all re-runnable):**

- `docker` 29.8.1, `colima` 0.10.3, `docker-compose` 5.5.1, all on PATH under `/opt/homebrew/bin`.
- `docker compose config -q` with no `.env` exits **1**: `required variable POSTGRES_PASSWORD is
  missing a value`. With `POSTGRES_PASSWORD=x` it exits **0** — and needs no running daemon (Colima
  is not started).
- `POSTGRES_PASSWORD=x docker compose config` in this worktree emits `name:
  dw-compose-file-hardening-and-gate` and volume name
  `dw-compose-file-hardening-and-gate_mastracode-web-pgdata` — DW-16 reproduced directly.
- The same file with `name: mastra-factory` added, copied into an unrelated directory, emits `name:
  mastra-factory` and volume `mastra-factory_mastracode-web-pgdata`.
- `docker compose config --format json` is supported and emits `.name`, `.services["app-db"]`,
  `.volumes["mastracode-web-pgdata"].name`; ports resolve to
  `{"mode":"ingress","host_ip":"127.0.0.1","target":5432,"published":"54329","protocol":"tcp"}`.
- `--env-file /dev/null` is accepted and suppresses `.env` loading, so a guard is hermetic even if run
  from a checkout that has one.

## Tasks & Acceptance

**Execution:**

- `docker-compose.yml` -- add a top-level `name: mastra-factory` key immediately above `services:`
  (line 18), with a short comment saying Compose otherwise derives the project name from the directory
  basename and prefixes named volumes with it, and that AGENTS.md records this volume as the only copy
  of the data -- DW-16.
- `docker-compose.yml` -- update the header `Usage:` block (lines 8-10) so the quoted `db:up` body is
  `docker compose up -d --wait --wait-timeout 120`, and add one sentence saying the bound exists because
  `--wait` alone waits forever while `restart: unless-stopped` keeps a failing container out of the
  exited state -- keeps the file's own prose truthful and is the sync target of the third guard.
- `package.json` -- change `scripts.db:up` to `docker compose up -d --wait --wait-timeout 120`. Leave
  `db:down` and every other script byte-identical -- DW-17.
- `.bmad-loop/policy.toml` -- APPEND three guards to `[verify].commands` (after policy.toml:1535, before
  the closing `]` at :1536), following the existing `'''sh -c '…' '''` style and the surrounding
  comment convention (extend the comment block above the array explaining what each new guard covers and
  that it was verified both ways):
  1. **Parse + resolved model.** Fail with a named message if `docker` is not on PATH. Otherwise run
     `docker compose -f docker-compose.yml --env-file /dev/null config --format json` with a throwaway
     `POSTGRES_PASSWORD` and with `COMPOSE_PROJECT_NAME` unset, and pipe it through `node -e` to assert:
     `.name` is exactly `mastra-factory`; `.volumes["mastracode-web-pgdata"].name` is exactly
     `mastra-factory_mastracode-web-pgdata`; the service keys are exactly `["app-db"]` (AD-12: no
     `redis`); the one published port has `host_ip` `127.0.0.1`, `published` `54329`, `target` `5432`;
     `restart` is `unless-stopped`; the volume mount target is `/var/lib/postgresql`; the image matches
     `^pgvector/pgvector:`; and the healthcheck test string contains the resolved `POSTGRES_USER` and
     `POSTGRES_DB` values (so the healthcheck's defaults cannot drift from `environment`'s). Every
     failure message must name the value found. A non-zero exit or unparseable output from `docker
     compose` is reported as itself, never as a silent pass -- DW-14 + DW-16.
  2. **The required-password guard is really required.** With `POSTGRES_PASSWORD` unset and
     `--env-file /dev/null`, `docker compose -f docker-compose.yml config -q` must exit NON-zero. If it
     succeeds, fail saying the `:?` required interpolation is gone -- DW-14. This is the one negative
     test here; guard 1 cannot see it, because guard 1 supplies a password.
  3. **`db:up` is bounded, and the file's prose agrees with the manifest.** Read `package.json` with
     `node`: `scripts["db:up"]` must contain `--wait` and a `--wait-timeout <N>` with N a positive
     integer (assert the bound exists, not the literal 120) -- DW-17. Then, for each of `db:up` and
     `db:down`, extract from `docker-compose.yml`'s header the single `#   npm run <script>  # <body>`
     line and require `<body>` to equal `scripts[<script>]` exactly; require exactly one such line per
     script and fail loudly if an extraction comes back empty, so the guard cannot pass vacuously.

**Acceptance Criteria:**

- Given the corrected tree in a story worktree with no `.env` and `docker` on PATH, when every command
  in `[verify].commands` runs in order, then all of them exit 0 — including pre-existing guard 28
  (policy.toml:1515), which greps `docker-compose.yml` for `${KEY` interpolations.
- Given the corrected tree, when `docker compose config` is run from any directory the repo is checked
  out into, then the resolved project name is `mastra-factory` and the resolved volume name is
  `mastra-factory_mastracode-web-pgdata`, independent of the directory basename.
- Given the corrected tree, when `npm run db:up` is inspected, then it reads `docker compose up -d
  --wait --wait-timeout 120`, and `docker-compose.yml`'s header quotes that same string.
- Given `[verify].commands` before and after this change, when the two arrays are diffed, then the
  change is purely additive: the first 48 elements are byte-identical and three elements are appended.
- Given each of the six mutations in the I/O matrix applied one at a time to the corrected tree, when
  the new guards run, then the stated guard exits 1 with a message naming the offending value; and each
  guard exits 0 again once the mutation is reverted. Both directions must be executed, not reasoned.

## Spec Change Log

_No bad_spec loopback occurred; the spec was not amended._

## Review Triage Log

### 2026-09-24 — Review pass

- verdicts: 32 findings — high 1, medium 24, low 6, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: guard 51's `--wait` check is a substring match `--wait-timeout` alone satisfies — reproduced: `db:up` = `docker compose up -d --wait-timeout 120` exited 0; fixed to a whole-argument `/(^|\s)--wait(\s|$)/`, and the same mutation now exits 1.
  - `[medium]` `[patch]` blind-hunter: guard 49 unset only `COMPOSE_PROJECT_NAME`, so ambient `POSTGRES_USER`/`POSTGRES_DB` fed both sides of the drift check — reproduced: a drifted file exited 1 in a clean shell but 0 under `POSTGRES_USER=ops`; fixed with `-u POSTGRES_USER -u POSTGRES_DB`, and the "hermetic" comment corrected.
  - `[medium]` `[patch]` blind-hunter: nothing pinned the resolved `POSTGRES_USER`/`POSTGRES_DB`, only their mutual agreement, while README.md:25/111/124 and ops/README.md:174 hardcode `factory`/`mastracode_web` — fixed: guard 49 pins both values outright.
  - `[medium]` `[patch]` blind-hunter: the probe's TCP-ness was ungated though DW-14 names the TCP healthcheck verbatim — reproduced: dropping `-h 127.0.0.1 -p 5432` exited 0, as did `start_period: 0s`; fixed by asserting `pg_isready` over `-h 127.0.0.1 -p 5432` plus a positive `start_period`.
  - `[low]` `[patch]` blind-hunter: the image regex accepted `pgvector/pgvector:latest` — reproduced exit 0; fixed to require an explicit non-`latest` tag or an `@sha256:` digest, matching the sibling sandbox guard.
  - `[medium]` `[patch]` blind-hunter: AD-12's redis-absent rule was bypassable through `profiles:` — reproduced: a profiled `redis` left the resolved service list `[app-db]` and exited 0; fixed by resolving with `--profile "*"`.
  - `[low]` `[patch]` blind-hunter: `command -v docker` does not prove a Compose v2 plugin, and the resulting message named docker-compose.yml, contradicting the guard's own comment — reproduced with a stub `docker` that errors on `compose`; fixed by preflighting `docker compose version` in both guards.
  - `[medium]` `[patch]` blind-hunter: `ops/README.md:184` is a second copy of the `db:up` body, so the "only copy in the repo" claim was false and guard 51(b) left it free to re-drift — fixed: 51(b) reconciles that quotation too, and the claim is corrected in the comment and the failure messages.
  - `[high]` `[patch]` blind-hunter: pinning the project name makes every worktree address the live stack, so `docker compose down -v` — which README.md:202 prescribes as "start over" — now destroys the only copy of the data; confirmed on this host (volume `mastra-factory_mastracode-web-pgdata` and container `mastracode-web-db` live and healthy) — fixed by stating the hazard in README.md, the compose comment and ops/README.md.
  - `[medium]` `[patch]` blind-hunter: the `ops/README.md` rewrite hardened an unobserved prediction into fact, dropped the operator's next step and named no remedy — fixed: the "never observed here" honesty is restored, the logs step is back, and `down -v` is named as the remedy with the worktree caveat.
  - `[medium]` `[patch]` edge-case-hunter: same `--wait` substring gap as blind-hunter #1 — grouped; same fix and same re-measurement.
  - `[medium]` `[patch]` edge-case-hunter: `has()` matched a whole token anywhere in the probe rather than at its own flag — reproduced: `POSTGRES_DB: ${POSTGRES_DB:-factory}` exited 0 by satisfying the lookup on the probe's `-U "factory"` token; fixed by asserting each value at `-U` / `-d`.
  - `[medium]` `[patch]` edge-case-hunter: same ambient-environment gap as blind-hunter #2 — grouped; same fix.
  - `[low]` `[patch]` edge-case-hunter: the published port's protocol was unasserted — reproduced: `…:5432/udp` exited 0; fixed by asserting `tcp`.
  - `[medium]` `[patch]` edge-case-hunter: same `profiles:` bypass as blind-hunter #6 — grouped; same fix.
  - `[medium]` `[patch]` edge-case-hunter: same ungated TCP probe as blind-hunter #4 — grouped; same fix.
  - `[low]` `[patch]` edge-case-hunter: the data volume's read-only flag was unasserted — reproduced: `…/var/lib/postgresql:ro` exited 0; fixed by rejecting a read-only data mount.
  - `[medium]` `[patch]` edge-case-hunter: no migration note for a checkout whose volume was `<basename>_mastracode-web-pgdata` — fixed: README.md and the compose comment now say the first `db:up` after the pin lands on a new empty volume, and to check `docker volume ls` first.
  - `[medium]` `[patch]` edge-case-hunter: same deleted "record that it hung" instruction as blind-hunter #10 — grouped; same fix.
  - `[medium]` `[patch]` edge-case-hunter: same false "only copy of these command bodies" claim as blind-hunter #8 — grouped; same fix.
  - `[medium]` `[patch]` edge-case-hunter: the comment's "hermetic" claim is falsified by the ambient-environment gap — grouped with blind-hunter #2; the comment was rewritten.
  - `[medium]` `[patch]` edge-case-hunter: the comment's "the probe's defaults cannot drift" claim was narrowed, not closed, by whole-token matching — grouped with the flag-scoped fix; true after it.
  - `[medium]` `[patch]` edge-case-hunter: the comment claimed the TCP healthcheck is now gated when it was not — grouped with blind-hunter #4; true after the fix.
  - `[medium]` `[patch]` verification-gap: broken-verification gap — guard 51's `--wait` branch is unreachable for any script carrying `--wait-timeout`; filed pre-verified, reproduced independently here, fixed as above.
  - `[medium]` `[patch]` verification-gap: missing-adoption gap — `ops/README.md:184` is a second command-body site the new reconciliation did not cover; reproduced (retuning 120→300 in package.json and the compose header left all guards green); fixed as above.
  - `[low]` `[reject]` verification-gap (other): the spec's Code Map asserts the compose header is the only copy of the command bodies — true of the pre-change tree, falsified by this change. Rejected because its only fix is to edit this build's spec; the substance is fixed in code (guard 51(b) covers `ops/README.md`) and the stale line is named under Residual risks.
  - `[medium]` `[patch]` intent-alignment: of DW-14's three named properties the TCP healthcheck was still ungated — grouped with blind-hunter #4; measured and fixed.
  - `[medium]` `[defer]` intent-alignment: DW-17's expectation lives at the runtime surface while the change and its guard live at the string surface, so the engine's arrival was spent entirely on static resolution. Deferred — the ledger's settling experiment now runs against the live stack (deferred item 1); the prose overclaim it produced was patched.
  - `[medium]` `[defer]` intent-alignment: DW-16's stake is the stored volume, but the guard asserts the resolved name and `container_name` stays ungated. Deferred — a guard reading `docker volume ls` would assert host state rather than tracked content, and `container_name` is pre-existing (deferred item 2).
  - `[medium]` `[patch]` intent-alignment: guard 51(b) asserts an invariant no ledger entry names, and its stated justification is falsified by this same diff — grouped with blind-hunter #8; the justification is corrected and the guard extended to the second site.
  - `[low]` `[reject]` intent-alignment: the gate is now host-dependent — a checkout with no container engine fails it. Rejected: this deployment is one machine with an absolute repo root baked into three files (AD-11), DW-14's own smallest fix would hard-fail identically, and a conditional skip adds a branch whose silent-skip failure mode is worse than a loud one.
  - `[false]` `[reject]` intent-alignment: `ops/README.md` was edited outside the bundle's named surface. Refuted as a defect — line 184 quoted the old `db:up` body verbatim, so leaving it would have shipped a false statement this same diff created; the spec's Never list does not cover the file, and the edit is drift repair, not scope creep.

## Design Notes

Why `name:` and not `COMPOSE_PROJECT_NAME`: an env-var spelling would add a `${}` interpolation to
`docker-compose.yml`, which pre-existing guard 28 requires to be declared in `.env.schema` — a new key
for a value that must never vary. The literal key is also what the ledger names as the smallest fix.

Why the guards use `--env-file /dev/null` and unset `COMPOSE_PROJECT_NAME`: Compose auto-loads `.env`
from the project directory and `COMPOSE_PROJECT_NAME` overrides the file's `name:`. The gate normally
runs in a worktree with neither, but a guard that silently reads an operator's `.env` would assert
something other than what the tracked file says. `--env-file /dev/null` was confirmed accepted by
Compose 5.5.1 on this host.

Why guard 3 pins the presence of a positive `--wait-timeout` rather than the literal `120`: DW-17's
invariant is that a bound exists. Pinning the number would make a legitimate retune a gate failure.

`container_name: mastracode-web-db` is knowingly left alone. DW-16 notes it has "the mirror problem"
(it defeats per-project namespacing), but the ledger's smallest fix is the `name:` key, the
`container_name` predates Story 1.3, and four README.md procedures address the container by that exact
name. Renaming it is a documentation change this bundle did not ask for.

## Verification

**Commands:**

- `POSTGRES_PASSWORD=x docker compose --env-file /dev/null config --format json` -- expected: exit 0,
  `.name` = `mastra-factory`, `.volumes["mastracode-web-pgdata"].name` =
  `mastra-factory_mastracode-web-pgdata`.
- `env -u POSTGRES_PASSWORD docker compose --env-file /dev/null config -q` -- expected: exit 1 naming
  `POSTGRES_PASSWORD`.
- `node -e 'console.log(require("./package.json").scripts["db:up"])'` -- expected:
  `docker compose up -d --wait --wait-timeout 120`.
- `uv run --no-cache --python 3.12 python -c "import tomllib;print(len(tomllib.load(open('.bmad-loop/policy.toml','rb'))['verify']['commands']))"`
  -- expected: `51`, and the first 48 entries unchanged versus `git show HEAD:.bmad-loop/policy.toml`.
  (The host `python3` is 3.9 and has no `tomllib`; `uv` supplies 3.12. Measured: the array parses and
  holds **48** commands before this change — so the file must still parse as TOML after the append.)
- Run each of the three appended guards directly in this worktree, on the corrected tree and again with
  each I/O-matrix mutation applied and reverted -- expected: 0 on the corrected tree, 1 with a naming
  message under each mutation.
- `npm ci --no-audit --no-fund && npm run check && npm test && npm run build` -- expected: exit 0
  (unchanged; this bundle touches no TypeScript).
- Pre-existing guard 28 (`.bmad-loop/policy.toml:1515`) run verbatim -- expected: exit 0.

## Auto Run Result

Status: done

**Implemented change.** `docker-compose.yml` now pins `name: mastra-factory`, so the data volume
resolves to `mastra-factory_mastracode-web-pgdata` from any checkout path instead of following the
directory basename (DW-16). `npm run db:up` is bounded at `--wait-timeout 120` (DW-17). And
`[verify].commands` grew from 48 to 51 — three appended guards that resolve the compose file through
`docker compose config` and assert the model Story 1.3 shipped, which until now was behind no gate at
all (DW-14). The first 48 commands are byte-identical, asserted programmatically against
`git show e657db0:.bmad-loop/policy.toml`.

**Files changed**

- `docker-compose.yml` — top-level `name: mastra-factory` with the rationale and the cost of pinning;
  header `Usage:` block updated to the bounded `db:up` body.
- `package.json` — `scripts.db:up` → `docker compose up -d --wait --wait-timeout 120`; no other script
  byte changed.
- `.bmad-loop/policy.toml` — guards 49 (resolved compose model), 50 (the required-password
  interpolation is really required, a negative test) and 51 (`db:up` carries a positive bound, and both
  prose quotations of the command bodies match the manifest) appended, with the comment block extended.
- `ops/README.md` — the `db:up` troubleshooting section rewritten for the bounded behaviour while
  keeping it labelled as predicted-not-observed; the `down -v` remedy and the worktree hazard added;
  the provisional `'54329:5432'` diagnostic at :168 marked must-not-commit because guard 49 rejects it.
- `README.md` — the shared-stack hazard and the volume-migration note added under the "start over" step.

**Review findings.** 32 findings from four layers: high 1, medium 24, low 6, false 1, maybe-false 0.
Seven grouped entries were patched — guard 49's under-specified assertions (TCP probe, pinned
user/db, image `latest`, `profiles:` bypass, port protocol, read-only mount, flag-scoped value match),
guard 49's non-hermetic environment, the `docker compose version` preflight, guard 51's unreachable
`--wait` branch, the ungated second command-body copy in `ops/README.md`, the shared-stack data-loss
hazard, and the `ops/README.md` overclaim. Two entries deferred (frontmatter `deferred`): DW-17's
runtime claim is still unobserved and its settling experiment now targets the live stack; and the gate
asserts the resolved project name rather than the stored volume, with `container_name` left ungated.
Three findings rejected: the stale Code Map claim (its only fix edits this build's spec); the gate's
new host-dependence (`low` — intended, and a conditional skip fails more silently); and "ops/README.md
was edited outside the bundle" (`false` — it quoted the old command body verbatim, so the edit is drift
repair this same diff made necessary).

**Follow-up review recommended: true.** Patched entries by verdict: high 1, medium 5, low 1 — a
patched `high` on a first pass. The specific unverified risk: pinning the project name removes the
per-worktree isolation that previously made `docker compose down -v` harmless from a story worktree,
and the mitigation is documentation only — no guard can prevent that command from destroying
`mastra-factory_mastracode-web-pgdata`, which `AGENTS.md` records as the only copy of projects, work
items, sessions, memory and tokens, and for which no backup exists. Every agent and operator working
from a worktree is now one prescribed command away from that.

**Verification performed** (all re-run by the orchestrating session after the patches, not taken from
the implementer's report):

- Full `[verify].commands` suite, all 51 commands, in order: **exit 0**, including `npm ci`,
  `npm run check`, `npm test`, `npm run build` and pre-existing guard 28.
- `.bmad-loop/policy.toml` still parses as TOML; the array holds 51 entries and the first 48 are
  byte-identical to the baseline — asserted with `tomllib`, not by eye.
- Every I/O-matrix row executed **both ways** (mutation → exit 1 with a naming message; revert →
  exit 0): `name:` deleted, `ports` reverted to `'54329:5432'`, `:?` stripped from
  `POSTGRES_PASSWORD`, `db:up` unbounded, the compose header left stale, and `docker` off PATH for
  guards 49 and 50.
- Every review-cited bypass re-executed the same way and now caught: `--wait` dropped while
  `--wait-timeout` remains; drift under an ambient `POSTGRES_USER`; `POSTGRES_DB` retuned to `factory`;
  the probe stripped of `-h 127.0.0.1 -p 5432`; `start_period: 0s`; `image: pgvector/pgvector:latest`;
  `redis` behind `profiles: [cache]`; the port published `/udp`; the volume mounted `:ro`; a stub
  `docker` without the compose plugin; a `120`→`300` retune that leaves `ops/README.md` stale; and the
  `ops/README.md` quotation deleted outright.
- `POSTGRES_PASSWORD=x docker compose --env-file /dev/null config --format json` resolves
  `name: mastra-factory` and volume `mastra-factory_mastracode-web-pgdata`; the same file copied into
  an unrelated directory resolves identically, which is the DW-16 invariant.

**Residual risks.**

- The shared-stack hazard named above. Documentation-only mitigation by construction.
- `--wait-timeout 120` is gated as a string and unverified as a behaviour; see deferred item 1 for the
  experiment and why it was not run here.
- The `## Code Map` above still says the compose header is the only copy of the `db:up`/`db:down`
  command bodies. That was true of the pre-change tree and this change falsified it (`ops/README.md`
  carries the second copy). The claim was left standing because a finding whose only fix edits this
  build's spec is rejected by the review contract; the gate itself no longer relies on it — guard
  51(b) now reconciles both sites, and its failure messages state so.
- Guard 49 now pins `POSTGRES_USER`/`POSTGRES_DB` to `factory`/`mastracode_web`. An operator changing
  those defaults must update the guard and the four hardcoded copy-paste procedures in the same
  change. That coupling is deliberate — it is what the finding asked for — but it is new.
