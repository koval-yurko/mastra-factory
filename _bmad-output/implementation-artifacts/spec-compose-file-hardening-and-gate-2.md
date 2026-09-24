---
title: 'Pin the compose project name, bound db:up, and put docker-compose.yml under the gate (DW-14, DW-16, DW-17) — re-drive after worktree rollback'
type: 'chore'
created: '2026-09-24'
status: 'done'
baseline_revision: 'e657db023ce490c6cc6ef34125bcc7f8edd9c23f'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      No `[verify].commands` entry may run a mutating `docker compose` subcommand — above all
      `down -v` from a worktree — and nothing enforces that rule; pinning the project name is
      exactly what made it load-bearing.
    evidence: |-
      Carried forward from the previous attempt of this bundle and re-confirmed here. Before the
      pin, a worktree's Compose commands addressed a directory-scoped project, so a `down -v` there
      was inert; after it, `POSTGRES_PASSWORD=x docker compose config` from this worktree resolves
      to project `mastra-factory`, and `docker volume ls` shows
      `mastra-factory_mastracode-web-pgdata` is the only volume on this host — AGENTS.md:31 records
      it as the only copy of projects, work items, sessions, memory and tokens, with no backups.
      Grepping all 52 command bodies, only indices 27, 48, 49 and 51 invoke `compose` and all four
      call `config` only; none of them reads `.bmad-loop/policy.toml`, so the rule exists only as
      prose in the comment block.
      Not patched here because the fix is not trivial: a guard that reads its own array and rejects
      a mutating `docker compose` subcommand would match its own text and every sibling guard's
      explanatory message, so it needs a self-exclusion rule this file has no precedent for.
      Smallest fix: append a guard that parses `[verify].commands` and asserts no entry other than
      itself matches a mutating `docker compose` subcommand, anchoring on the executed command
      rather than on message prose.
    location: >-
      .bmad-loop/policy.toml [verify].commands (the rule is stated in the guard-50 comment paragraph)
    severity: medium
  - summary: >-
      DW-16's mirror half is not merely unaddressed — guard 52 now makes
      `container_name: mastracode-web-db` a gate-enforced requirement, so the per-project
      namespacing the ledger wanted restored is pinned in place rather than left open.
    evidence: |-
      `docker-compose.yml:24` still pins `container_name`, and `docker ps` on this host shows the
      live container carrying it. Pinning the project name does not change this: `container_name`
      opts the service out of the project prefix entirely, which is the opposite of what `name:`
      restores for the volume. Guard 52's new `container_name` arm now asserts that exact value,
      so removing it is a two-file change rather than a one-line one.
      Explicitly pre-existing and out of this bundle's scope: DW-16's own ledger text says "both the
      unpinned project name and container_name predate this story" and names its smallest fix as
      `name: mastra-factory` alone.
      Smallest fix: drop `container_name`, relax guard 52's arm to the resolved `<project>-app-db-1`
      form, and update the `docker inspect`/`docker exec`/`docker stop` command lines in README.md
      and ops/README.md in the same change.
    location: docker-compose.yml:24 (container_name) / .bmad-loop/policy.toml guard 52 / README.md / ops/README.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** Three ledger entries are still open against `docker-compose.yml`. It pins no project
name, so Compose derives one from the checkout directory basename and the data volume's real name
follows it — reproduced live in this worktree today: `docker compose config` resolves `name` to
`dw-compose-file-hardening-and-gate` and the volume to
`dw-compose-file-hardening-and-gate_mastracode-web-pgdata`, while the only volume on this host is
`mastra-factory_mastracode-web-pgdata`, which AGENTS.md:31 records as the only copy of projects,
work items, sessions, memory and tokens, with no backups (DW-16). `package.json:10` `db:up` is
`docker compose up -d --wait` with no `--wait-timeout`, which Compose documents as wait-forever
(DW-17). And no `[verify].commands` entry parses or executes the file, so all 48 of them produce
byte-identical results whether it is correct or gibberish (DW-14).

**Approach:** This is a **re-drive**. Dev attempts 1-2 of this same story produced, reviewed (26
findings across four lenses, triaged) and gate-verified the full change; the orchestrator then
rolled this worktree back to HEAD on run-resume, discarding the working tree but preserving the
result as commit `e0952a5` on branch `attempt-preserve/20260924-110221-aeed-e0952a5a`, whose parent
is exactly this worktree's HEAD `e657db0`. So: restore that reviewed change verbatim into the
working tree, then independently re-verify it here from scratch — full gate run plus a
both-ways break matrix — rather than trusting the preserved commit.

## Boundaries & Constraints

**Always:**
- The restored working tree must be byte-identical to `e0952a5` for the five product paths
  (`docker-compose.yml`, `package.json`, `README.md`, `ops/README.md`, `.bmad-loop/policy.toml`).
  That commit is the reviewed artifact; re-deriving it by hand would discard the review.
- `name: mastra-factory` must reproduce the project name the running deployment already uses.
  Measured on this host right now: the live container `mastracode-web-db` is `Up (healthy)` and the
  only volume is `mastra-factory_mastracode-web-pgdata`. The change must be a no-op for existing
  data — no rename, no new volume, no operator migration step.
- `[verify].commands` stays **append-only**: the 48 existing entries keep their exact bytes and
  exact indices, four are appended at indices 48-51 (guards 49-52 in the file's 1-based comment
  numbering). Prove it with a TOML parser against `HEAD:.bmad-loop/policy.toml`, not by eye.
- Every new guard must be re-verified **both ways in this worktree**: passing on the restored tree,
  and failing while naming the offender on a deliberate break, with every break reverted.
- The Compose-invoking guards must supply their own throwaway `POSTGRES_PASSWORD`.
  `docker-compose.yml:35` uses required interpolation (`:?`) and `.env` is gitignored and absent from
  every story worktree, so without one they would fail on a correct file.
- Guard 28 — the one pre-existing command that opens `docker-compose.yml` — must be re-checked
  explicitly and stay green.

**Never:**
- Do not edit, reorder, re-point or delete any existing `[verify].commands` entry, and do not
  renumber any guard in the comment block.
- Do not run `docker compose up`, `down`, or any other mutating subcommand. Once `name:` is pinned
  this worktree addresses the live project, so a stray `down -v` destroys the only copy of the data.
  Read-only `config` calls only.
- Do not change `container_name`, `ports`, the healthcheck, the `restart` policy, the declared volume
  name `mastracode-web-pgdata`, or the `db:down` script.
- Do not edit `_bmad-output/implementation-artifacts/deferred-work.md` or `sprint-status.yaml`; the
  orchestrator owns both.
- Do not merge, cherry-pick-commit, or otherwise create a commit from
  `attempt-preserve/20260924-110221-aeed-e0952a5a` — restore file contents into the working tree
  only, leaving the branch and HEAD untouched.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Restored tree | Worktree after restore | All 52 commands exit 0 | No error expected |
| `docker-compose.yml` made unparseable (bad indent, unknown top-level key) | worktree root | Guard 49 exits 1, printing Compose's own diagnostic | — |
| `docker-compose.yml` parseable but service-less | worktree root | Guard 52 exits 1 — `app-db` does not resolve | — |
| `name: mastra-factory` deleted or changed | `docker-compose.yml` | Guard 50 exits 1, naming the project name found, the volume it would produce, and `COMPOSE_PROJECT_NAME` as a possible cause | — |
| Volume renamed off `mastracode-web-pgdata` | `docker-compose.yml` | Guard 50 exits 1, naming the resolved volume set found | — |
| Published port inverted to `54329:5432`, or healthcheck `POSTGRES_USER` default drifted from `environment` | `docker-compose.yml` | Guard 52 exits 1 — DW-14's two verbatim drifts | — |
| `--wait-timeout` dropped from `db:up`, set to `0`, non-integer, or below the derived healthcheck floor | `package.json` | Guard 51/52 exits 1, printing the script found | — |
| `db:down` acquires `-v`/`--volumes`, or `db:up` chains a `docker compose down` | `package.json` | Guard 51 exits 1 | — |
| `POSTGRES_PASSWORD` unset, no `.env` (every story worktree) | environment | Guards 49/50/52 exit 0 — each supplies its own throwaway value | — |
| Docker daemon not running | host | Guards 49/50/52 exit 0 — `config` is a local parse | — |
| `docker` absent from `PATH` and `/opt/homebrew/bin`, or present without a working `compose` plugin | host | The Compose guards exit 1 saying the file is *unverified, not satisfied*, naming the plugin and the symlink fix | Never a vacuous pass |
| `package.json` unreadable, invalid JSON, or `null` | repo root | Guard 51 prints its own "unreadable or not valid JSON" message | Never an uncaught exception |

</intent-contract>

## Code Map

**The restore source — read this first:**
- `e0952a5` on `attempt-preserve/20260924-110221-aeed-e0952a5a` -- the reviewed change. `git
  rev-parse e0952a5^` is `e657db023ce490c6cc6ef34125bcc7f8edd9c23f`, identical to this worktree's
  HEAD, so its diff applies exactly. Touches six paths: the five product files below plus
  `_bmad-output/implementation-artifacts/spec-compose-file-hardening-and-gate.md` (the previous
  attempt's spec — gitignored here, already on disk, **not** part of the restore).
- `_bmad-output/implementation-artifacts/spec-compose-file-hardening-and-gate.md` -- the previous
  attempt's spec, `status: done`, with its full **Review Triage Log** (26 findings: 13 patched,
  2 deferred, 3 rejected), **Design Notes** and **Auto Run Result**. Carried forward as context; its
  two `deferred:` frontmatter entries (the unenforced "no mutating `docker compose` in
  `[verify].commands`" rule; DW-16's `container_name` mirror half) are still open and still out of
  scope here.

**What the restore lands (all five already reviewed; verify, do not redesign):**
- `docker-compose.yml` -- 58 lines today. Line 9 is the usage comment quoting `db:up`'s command
  string; `services:` is line 18. The restore inserts the `name: mastra-factory` block with its
  rationale comment above `services:` and updates line 9. Read-only elsewhere: `:24`
  `container_name`, `:27` `restart: unless-stopped`, `:31` `'127.0.0.1:54329:5432'`, `:35`
  `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?…}`, `:40`/`:58` the named volume.
- `package.json:10` -- `"db:up"` gains `--wait-timeout 120`. `:11` `db:down`, `:15` `start` (the only
  script AD-11/NFR10 binds), `check`, `build` all untouched.
- `.bmad-loop/policy.toml` -- `[verify]` starts at line 28; the comment block runs to line 1486;
  `commands = [` is line 1487, `]` is line 1536, one command per line, 48 entries at 0-based indices
  0-47. The restore appends four entries and extends the comment block with four numbered paragraphs
  in the established voice.
- `.bmad-loop/policy.toml:1515` (guard 28) -- the only pre-existing command that opens
  `docker-compose.yml`; it greps `[$][{][A-Za-z_][A-Za-z0-9_]*` out of it to reconcile keys against
  `.env.schema`. A top-level `name:` adds no `${…}`, so its key set is unchanged — re-check anyway.
- `.bmad-loop/policy.toml:1530` (guard 43), `:1535` (guard 48) -- the `node -e` + `try/catch`
  `package.json` parse shape guard 51 mirrors. `:1491` (guard 4) -- the stdin-accumulate idiom guards
  50 and 52 reuse for `docker compose config --format json`. All read-only.
- `ops/README.md:182-192` -- `### If npm run db:up never returns`, rewritten by the restore into
  `### If npm run db:up exits non-zero`, split by container state (`health: starting` vs
  `Restarting`). `:199-204` teardown gains the widened-blast-radius warning. Other sections are read
  by guards 15-18, 25 and 28 — confirm via the full gate run, not by inspection.
- `README.md:197-204` -- the `db:up` instruction gains the 120s note, and the `docker compose down -v`
  sentence is marked repo-global rather than local.
- `AGENTS.md:30-31` -- "there are no backups, and the Postgres volume is the only copy of projects,
  work items, sessions, memory and tokens." The stake DW-16 names. Read-only.

**Measured on this host during planning (re-confirmed, not inherited):**
- `/opt/homebrew/bin/{docker,colima,docker-compose}` all present — Docker 29.8.1, Compose 5.5.1.
  DW-14's stated precondition is met.
- `POSTGRES_PASSWORD=x docker compose config --format json` in this worktree: `name` is
  `dw-compose-file-hardening-and-gate`, volume `dw-compose-file-hardening-and-gate_mastracode-web-pgdata`.
  DW-16 reproduced live.
- `docker volume ls`: exactly one volume, `mastra-factory_mastracode-web-pgdata`.
  `docker ps`: `mastracode-web-db` `Up 18 hours (healthy)`.

## Tasks & Acceptance

**Execution:**
- `docker-compose.yml`, `package.json`, `README.md`, `ops/README.md`, `.bmad-loop/policy.toml` --
  restore all five from `e0952a5` into the working tree with a path-scoped checkout (no commit, no
  merge, no HEAD movement), then confirm `git diff e0952a5 -- <those five paths>` is empty --
  closes DW-14, DW-16 and DW-17 with the already-reviewed artifact.
- `.bmad-loop/policy.toml` -- prove append-only mechanically: parse `HEAD:.bmad-loop/policy.toml` and
  the working copy with a TOML parser, assert the 48-entry prefix is byte-identical and in the same
  order and that exactly four entries were appended -- the gate array is orchestrator surface and a
  silent rewrite would delete guards enforced nowhere else.
- Full gate -- run all 52 `[verify].commands` in order from the worktree root after `npm ci`, and
  confirm every one exits 0, guard 28 included -- the restored guards have never been executed in
  this worktree instance.
- Break matrix -- apply each I/O-matrix break one at a time, confirm the affected guard exits 1
  naming the offender, and revert it, ending with `git status --porcelain` listing only this story's
  paths -- a guard that cannot fail is the vacuous pass DW-14 is a complaint about.

**Acceptance Criteria:**
- Given the restored tree, when `git diff e0952a5 -- docker-compose.yml package.json README.md
  ops/README.md .bmad-loop/policy.toml` is run, then it produces no output.
- Given the restored tree, when every entry of `[verify].commands` is run in order from the worktree
  root, then all 52 exit 0.
- Given `docker compose config --format json` is run in this worktree after the restore, when its
  `name` and `volumes` are read, then `name` is `mastra-factory` and the volume resolves to
  `mastra-factory_mastracode-web-pgdata` — the names the live container and volume already carry, so
  no existing data is orphaned.
- Given `docker volume ls` and `docker inspect mastracode-web-db` before and after the whole run,
  when compared, then the volume set is unchanged and the container is still `healthy` — no Compose
  command in this story mutates anything.
- Given `git status --porcelain` once verification is done, when read, then it lists exactly the five
  product paths (this spec is gitignored and does not appear).

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass

- verdicts: 35 findings — high 0, medium 19, low 14, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind-hunter) Guard 52 never reads the app-db service's volume MOUNT, so
    drifting the target to `/var/lib/postgresql/data` leaves the top-level volume declared and all
    52 commands green while PGDATA lands outside the named volume — reproduced: g49/g50/g51/g52 all
    rc=0. Patched: guard 52 gained a whole-list mount arm (exactly one, type `volume`, source
    `mastracode-web-pgdata`, target `/var/lib/postgresql`); re-verified failing on the drifted
    target, on a bind mount and on a second mount.
  - `[low]` `[patch]` (blind-hunter) The derived floor was `start_period + interval * retries` and
    omitted `timeout`, which each probe can consume before the interval resumes, so
    `--wait-timeout 60` passed a 55s floor while the worst case to a verdict is 80s — reproduced
    with 60 set consistently in all three flag sites: g51 rc=0, g52 rc=0. Patched: the floor is now
    `start_period + retries * (interval + timeout)`, moving today's value 55 → 80; 60 now fails, 81
    passes.
  - `[medium]` `[patch]` (blind-hunter) The healthcheck/environment agreement compared
    `undefined !== undefined`, so deleting `-U` from the probe AND `POSTGRES_USER` from
    `environment:` passed — reproduced: g52 rc=0. Patched: both sides must be non-empty strings
    before comparing, with the guard's own message when either is absent.
  - `[low]` `[patch]` (blind-hunter) Guard 50's arm (a) used `grep -qxE` and rejected
    `name: "mastra-factory"` and `name: mastra-factory # pinned`, both of which Compose resolves
    correctly — reproduced: g50 rc=1 on the quoted form, with a message telling the maintainer to
    restore a key that is already correct. Patched: optional quoting and a trailing `#` comment are
    accepted; both spellings now pass and a changed or deleted key still fails.
  - `[medium]` `[patch]` (blind-hunter) The `db:down` volumes ban was exact-token, so
    `docker compose down --volumes=true` passed — reproduced: g51 rc=0. Patched: `-v` exactly or
    any token starting `--volumes`.
  - `[medium]` `[patch]` (blind-hunter) Only `db:up` and `db:down` were scanned, so a new
    `"db:reset": "docker compose down -v"` was entirely unguarded — reproduced: g51 rc=0. Patched:
    guard 51 sweeps every value in `scripts` for a volume-removing compose teardown and names the
    offending key.
  - `[low]` `[patch]` (blind-hunter) The guard-51 comment paragraph cited `ops/README.md` as saying
    "about two minutes" in a heading; that string appears nowhere in the repo — verified by grep
    over `ops/README.md`, `README.md`, `docker-compose.yml` and `.bmad-loop/policy.toml`. Patched:
    the false citation is gone, replaced by the restatements that genuinely stay hand-maintained.
  - `[medium]` `[patch]` (blind-hunter) `README.md`'s "waits up to 120 seconds", added by this same
    change, sat outside guard 51's reconciliation set — reproduced: the three flag sites moved to
    600 with README.md left at 120 and g51 rc=0. Patched: a prose matcher on
    `waits up to <N> seconds` reconciled against `scripts["db:up"]`.
  - `[medium]` `[patch]` (blind-hunter) Nothing asserted that `POSTGRES_PASSWORD` keeps its
    `${…:?}` required form, which all three Compose guards depend on and which docker-compose.yml:33
    calls mandatory; rewriting it to `${POSTGRES_PASSWORD:-committedpw}` shipped a committed
    credential green — reproduced: g49/g50/g52 all rc=0. Patched: guard 49 asserts the set of
    `:?`-interpolated keys is exactly `POSTGRES_PASSWORD`, placed before the `config -q` call so a
    second required key self-reports rather than being blamed on the file.
  - `[low]` `[patch]` (blind-hunter) `dur()` read one digit run plus one unit, so the valid compound
    duration `interval: 1m30s` yielded `NaN` and the guard blamed a correct healthcheck — reproduced:
    g52 rc=1 with "states no floor this guard can derive". Patched: every `<digits><unit>` group is
    summed; re-verified `start_period: 1m0s` (floor 110) passes and `1m30s` (floor 140) fails on the
    floor, which is the right reason.
  - `[low]` `[patch]` (blind-hunter) Guard 52 assumed the `CMD-SHELL` healthcheck form; the valid
    exec form made it report "probes role undefined" against a correct healthcheck. Patched:
    `test[0]` must be `CMD-SHELL`, with its own message naming the form — verified failing on
    `['CMD', …]`.
  - `[low]` `[reject]` (blind-hunter) Guards 49, 50 and 52 each re-resolve the binary, each probe
    `compose version`, and 50 and 52 each run a full `config --format json` — six process spawns per
    gate run, with the preamble duplicated three times. Rejected: `[verify].commands` entries are
    independent shell strings by construction and the array has no shared-preamble mechanism, so the
    fix is not a direct correction but a new indirection; measured cost is ~1s of the gate's total
    runtime, and the three guards are independently valuable.
  - `[medium]` `[patch]` (edge-case) `db:down` spelled `--volumes=true` or clustered escapes the
    token match — same root cause as the blind-hunter row above; patched together.
  - `[medium]` `[patch]` (edge-case) `db:up` chaining a down not spelled literally
    `docker compose down` — `docker compose -f docker-compose.yml down -v && …` and the legacy
    `docker-compose down -v && …` both passed (reproduced: g51 rc=0 for each). Patched: detection
    finds `docker compose`/`docker-compose`, steps over global flags consuming their values, then
    checks the subcommand; both now fail.
  - `[medium]` `[patch]` (edge-case) app-db's `volumes:` mount removed while the top-level volume
    stays declared — same root cause as the blind-hunter mount row; patched together.
  - `[medium]` `[patch]` (edge-case) The published-port arm ignored `protocol`, so
    `'127.0.0.1:54329:5432/udp'` matched host_ip/published/target and passed with the database
    unreachable — reproduced: g52 rc=0. Patched: protocol must be `tcp`, absent read as `tcp`.
  - `[low]` `[patch]` (edge-case) `dur()` on compound or numeric durations — same root cause as the
    blind-hunter row above; patched together.
  - `[medium]` `[patch]` (edge-case) `README.md`'s new prose free to drift — same root cause as the
    blind-hunter row above; patched together.
  - `[medium]` `[patch]` (edge-case) `ops/README.md:164-168` tells the operator to change the ports
    entry to `'54329:5432'` as a provisional loopback diagnostic, and guard 52 now fails on exactly
    that spelling — reproduced: g52 rc=1 while the documented diagnostic is applied, with no note
    anywhere that the gate goes red. Patched: that checkpoint now says the gate fails for as long as
    the diagnostic is applied and the entry must be reverted before running it.
  - `[medium]` `[patch]` (edge-case) `POSTGRES_PASSWORD`'s `:?` replaced by a defaulted `:-` form —
    same root cause as the blind-hunter row above; patched together.
  - `[low]` `[patch]` (edge-case) The "about two minutes" citation names prose that does not exist —
    same root cause as the blind-hunter row above; patched together.
  - `[medium]` `[patch]` (verification-gap) The app-db volume mount target is unverified; the only
    thing catching a deleted mount is Compose pruning the unreferenced top-level volume — same root
    cause as the blind-hunter mount row; patched together.
  - `[medium]` `[patch]` (verification-gap) `README.md`'s "120 seconds" is outside the agreement
    check this change introduces — same root cause as the blind-hunter row above; patched together.
  - `[medium]` `[patch]` (verification-gap) The healthcheck's TCP probe target is unverified though
    docker-compose.yml:53-56 records it as load-bearing: reducing the probe to
    `pg_isready -U … -d …` passed — reproduced: g52 rc=0, and a socket probe reports healthy before
    5432 is listening. Patched: guard 52 asserts the resolved probe carries `-h 127.0.0.1` and
    `-p 5432`.
  - `[medium]` `[patch]` (verification-gap) Only the image TAG shape was checked, never the
    repository, so `postgres:18` passed — reproduced: g52 rc=0 — shipping an image with no `vector`
    extension that docker-compose.yml:31-33 says agent memory needs. Patched: guard 52 asserts the
    resolved repository is `pgvector/pgvector`.
  - `[medium]` `[patch]` (verification-gap) The documented `'54329:5432'` diagnostic now turns the
    gate red with no note — same root cause as the edge-case row above; patched together.
  - `[low]` `[patch]` (verification-gap) Guard 51's `occ()` advanced past only spaces, tabs and `=`,
    so a hand-wrap putting `--wait-timeout` and `120` on separate lines in `ops/README.md` failed a
    correct document with `states --wait-timeout [""]` — reproduced: g51 rc=1. Patched: the scanner
    crosses a newline; the wrapped form now passes.
  - `[low]` `[patch]` (verification-gap) The "about two minutes" citation is not in the repo — same
    root cause as the blind-hunter row above; patched together.
  - `[low]` `[reject]` (intent-alignment) The intent's DW-17 rationale (a crash loop `--wait` never
    ends) is falsified by the measurement this change records, so ledger text and code disagree
    about why the bound is needed. Rejected as out of scope: the intent states verbatim "Do NOT edit
    the deferred-work ledger; the orchestrator records resolution", so the only fix the finding
    admits is forbidden by the intent itself. The measured behaviour is already restated in the
    guard message, the comment block and both operator documents.
  - `[low]` `[defer]` (intent-alignment) DW-16's `container_name` mirror half is not merely
    unaddressed — guard 52 now pins that exact value, so the concern is locked in by the gate rather
    than left open. Deferred below with its smallest fix; the ledger names it pre-existing and scopes
    its own fix to `name:` alone.
  - `[false]` (intent-alignment) The intent names three files while the diff reaches six, and
    `ops/README.md` prose is now a gated surface. Checked: no bad outcome is named, and the
    reconciliation is what closes the drift the ledger's own harm requires — the two prose files
    restate values the change falsifies, so leaving them stale would be the defect.
  - `[false]` (intent-alignment) The gate's checks and the repo's `src/` test surface are disjoint,
    so nothing here is reachable from `npm test` or `tsc`. Checked: that is DW-14's premise verbatim
    ("docker-compose.yml is outside both the compiler's and the runner's scope"), and
    `[verify].commands` is the surface the ledger entry names as the fix location. Not a defect.
  - `[low]` `[reject]` (intent-alignment) The gate now hard-requires a `docker` binary with a working
    `compose` plugin and is no longer host-independent. Rejected: deliberate and recorded in the
    comment block — the alternative is the silent skip DW-14 is a complaint about; there is no CI in
    this repo, and `/opt/homebrew/bin` is already baked into `ops/factory-start.sh` and both plists.
    No harm reachable today.
  - `[low]` `[reject]` (intent-alignment) English restatements of the bound stay outside what the
    gate reads. Rejected: the `120` half is now patched (README.md's prose joined the reconciliation
    set), and the remaining item is `ops/README.md`'s derived-floor sentence, whose English form
    cannot be reconciled mechanically without a brittle phrase match. The gap is disclosed in the
    comment block rather than closed.
  - `[medium]` `[defer]` (intent-alignment) Nothing prevents a future `[verify].commands` entry from
    running a mutating Compose subcommand against the now-pinned project. Deferred below: the fix is
    a self-excluding guard this file has no precedent for.

### 2026-09-24 — Review pass (follow-up)

- verdicts: 37 findings — high 0, medium 14, low 18, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind-hunter) Guard 51's `docker compose down` detection misses a global
    flag placed BETWEEN `docker` and `compose` — the earlier fix stepped over flags only after the
    `compose` word. Reproduced: `"db:reset": "docker --context default compose down -v"` → g51 rc=0.
    Patched with the tokenizer rewrite below; that spelling now fails naming the script.
  - `[medium]` `[patch]` (blind-hunter) Only `docker compose down -v` was banned, not the operation.
    Reproduced: `"db:reset": "docker volume rm mastra-factory_mastracode-web-pgdata"` → g51 rc=0, and
    the same for `docker volume prune` and `docker system prune --volumes`. Patched: guard 51's
    script sweep now also refuses `docker volume rm|prune` and `docker system prune`, naming the key;
    all three fail, `docker compose down` and `docker compose logs app-db` still pass.
  - `[low]` `[patch]` (blind-hunter) Guard 52 rejected a digest-pinned image and blamed the wrong
    thing. Reproduced: `pgvector/pgvector@sha256:<64 hex>` → g52 rc=1 with "image repository is
    `pgvector/pgvector@sha256`", while guard 46 asks for exactly that pin on the sandbox Dockerfile.
    Patched: the digest is stripped before repo/tag are derived and accepted in place of a tag;
    the correct digest form now passes and `postgres@sha256:…` still fails on the repository.
  - `[false]` (blind-hunter) Guard 49's required-key grep matches `:?` only, so Compose's `${VAR?msg}`
    form is invisible and the shared dependency goes unexplained. Refuted by measurement: that form
    is not a vacuous pass — g49, g50 and g52 all exit 1, and Compose's own diagnostic, printed
    through by the guard, names `EXTRA_KEY` explicitly. The cause is named, not hidden. Recorded in
    the guard-49 comment paragraph anyway.
  - `[medium]` `[patch]` (blind-hunter) Nothing bounded the service set; everything reads `app-db` by
    key. Reproduced: a second `cache: {image: redis:7, ports: ['6379:6379']}` service → all four
    guards rc=0, against FR37/AD-12 which make the absence of a redis service a requirement. Patched:
    guard 52 asserts the resolved service set is exactly `["app-db"]`.
  - `[medium]` `[patch]` (blind-hunter) The named volume's `driver`/`driver_opts` were never read, so
    a `type none` / `o bind` / `device <path>` block relocated the data while keeping the resolved
    name and guard 52's mount arm satisfied. Reproduced: all four guards rc=0. Patched: guard 50
    requires the default `local` driver and no `driver_opts`.
  - `[low]` `[patch]` (blind-hunter) Guard 50's `.env` arm failed on ANY `COMPOSE_PROJECT_NAME`,
    `=mastra-factory` included, which overrides nothing — a red gate on a correct machine, and `.env`
    is the file README.md tells the operator to write. Reproduced: g50 rc=1 on the harmless value.
    Patched: the arm reads the value (quoted or bare) and fails only when it differs; `=someother`
    still fails.
  - `[low]` `[patch]` (blind-hunter) `policy.toml`'s own comment block restates the bound ("80 seconds
    today", "120 sits above 80") and guard 51 structurally cannot scan it, because its own prose
    quotes `--wait-timeout` at 0, 15, 60, 120 and 600 deliberately; the disclosure paragraph named
    only `ops/README.md`'s two sentences. Patched: the disclosure now names this file's own numbers
    as hand-maintained too.
  - `[low]` `[reject]` (blind-hunter) The image tag is checked for shape and repository but not for a
    major version, so `pgvector/pgvector:pg17` passes all four (reproduced) while guard 52 pins a
    mount target the comment ties to postgres 18+. Rejected: a deliberate major downgrade is not
    something a developer meets in everyday use, and the fix is a new version-pinning arm that must
    be bumped on every legitimate upgrade — added complexity, not a direct correction.
  - `[low]` `[reject]` (blind-hunter) DW-17 is closed on ledger text this change measured to be
    false. Carried: logged last pass as `[low]` `[reject]`, and the code still reads as that row
    describes — the intent's Never list forbids editing `deferred-work.md`, so the only fix the
    finding admits is out of bounds. The measured behaviour is restated in the guard message, the
    comment block and both operator documents.
  - `[low]` `[defer]` (blind-hunter) DW-16 is marked done although its `container_name` half is
    untouched and now gate-pinned. Carried: logged last pass as `[low]` `[defer]` and already in this
    spec's `deferred` list (ledger DW-86); the code still reads as that row describes. The `status:
    done` flip itself is orchestrator bookkeeping this run may not touch.
  - `[low]` `[reject]` (blind-hunter) DW-85's ledger `reason` is truncated mid-sentence and lost its
    "Smallest fix" clause. Rejected as out of scope: the intent's Never list says the orchestrator
    owns `deferred-work.md`. The complete text, smallest fix included, is intact in this spec's
    `deferred` frontmatter, which is where the ledger entry was transcribed from.
  - `[low]` `[reject]` (blind-hunter) The spec's acceptance criteria still assert `git diff e0952a5`
    is empty and that the spec is gitignored, neither of which holds. Rejected: the only fix is to
    edit this build's spec. The departure is recorded under `## Auto Run Result` instead.
  - `[low]` `[patch]` (blind-hunter) Guard 52's `unq()` stripped double quotes only, so the valid
    probe spelling `-U '${POSTGRES_USER:-factory}'` failed a correct healthcheck. Reproduced: g52
    rc=1 with `probes role "'factory'"`. Patched: single quotes are stripped too; a genuinely drifted
    role still fails.
  - `[low]` `[reject]` (blind-hunter) `ops/README.md`'s `Restarting` bullet tells the operator to run
    `npm run db:down` without the blast-radius warning that lives in Teardown; and guard 49 runs its
    required-key grep before `config -q`. Rejected: in the `Restarting` path stopping the live
    container IS the intended action, and `db:down` is gate-enforced to carry no `-v`, so no bad
    outcome follows; the grep ordering is deliberate and recorded — both orders exit 1, only the
    message differs.
  - `[medium]` `[patch]` (edge-case) `network_mode: host` makes the `ports:` mapping inert while
    Compose still resolves it, so guard 52's port arm read `127.0.0.1:54329` out of a mapping the
    engine ignores. Reproduced: all four guards rc=0. Patched: guard 52 rejects any `network_mode` on
    app-db.
  - `[false]` (edge-case) A second required key in the `${VAR?err}` form escapes guard 49 and leaves
    the cause unnamed — same claim as the blind-hunter row above, refuted the same way: measured, all
    three Compose guards exit 1 and Compose's diagnostic names the variable.
  - `[low]` `[patch]` (edge-case) `dur()` read digits only, so the valid `interval: 1.5s` made guard
    52 report "states no floor this guard can derive". Reproduced. Patched: a single decimal point is
    accepted; `1m30s` still parses to 90 and still fails the floor for the right reason.
  - `[medium]` `[patch]` (edge-case) `-v` glued to a shell operator escaped the volumes ban.
    Reproduced: `"db:down": "docker compose down -v&&echo done"` → g51 rc=0. Patched together with
    the tokenizer rewrite below.
  - `[medium]` `[patch]` (edge-case) A compose teardown one quote deep escaped detection.
    Reproduced: `"db:reset": "sh -c \"docker compose down -v\""` → g51 rc=0. Patched together with
    the tokenizer rewrite below.
  - `[medium]` `[patch]` (edge-case) Direct volume removal (`docker volume rm|prune`,
    `docker system prune`) unguarded — same root cause as the blind-hunter row above; patched
    together.
  - `[low]` `[patch]` (edge-case) A digest-pinned image is rejected — same root cause as the
    blind-hunter row above; patched together.
  - `[low]` `[patch]` (edge-case) A `--wait-timeout` mentioned in prose with no number after it read
    as the empty value and failed a correct document. Reproduced: appending "a bare `--wait-timeout`
    is not enough" to `ops/README.md` → g51 rc=1 with `states --wait-timeout [""]`. Patched:
    valueless mentions are ignored; a drifted value (600 vs 120) still fails.
  - `[low]` `[patch]` (edge-case) Single-quoted probe arguments — same root cause as the blind-hunter
    row above; patched together.
  - `[low]` `[patch]` (edge-case) The rewritten `### If npm run db:up exits non-zero` section dropped
    the old "never returns" guidance, leaving an operator whose `db:up` hangs before the health wait
    (image pull stall, unresponsive engine — neither bounded by `--wait-timeout`) with no documented
    path. Patched: a third bullet restores it.
  - `[medium]` `[patch]` (edge-case) The I/O matrix claims `db:down` acquiring `-v` makes guard 51
    exit 1, and the glued spelling disproves it — same root cause as the `-v&&` row above; patched
    together.
  - `[false]` (edge-case) Guard 49's required-key arm does not make a second required key self-report
    — third filing of the same claim, refuted the same way.
  - `[medium]` `[patch]` (verification-gap) Guards 49/50/52 passed `-f docker-compose.yml`, which
    disables the automatic merge of `docker-compose.override.yml` and ignores `COMPOSE_FILE`, so they
    read a project no operator command resolves. Reproduced: an override carrying
    `name: someother-project` and a second `'54329:5432'` port left all four guards at rc=0 while
    `docker compose config` without `-f` resolved the other project and published 54329 on every
    interface. Patched: `-f` dropped from all three, so they resolve exactly what `npm run db:up`
    resolves; that override now fails g50 and g52, and a benign override still passes.
  - `[medium]` `[patch]` (verification-gap) Nothing asserted the RESOLVED `POSTGRES_PASSWORD`. Guard
    49 proves the `:?` form is spelled in the file, never which key it is assigned to. Reproduced:
    renaming the mapping key to `PGPASSWORD:` left all four guards at rc=0 while the entrypoint would
    refuse a fresh `initdb`. Patched: guard 52 requires a non-empty resolved `POSTGRES_PASSWORD`.
  - `[medium]` `[patch]` (verification-gap) The service set is the one collection not compared as a
    whole — same root cause as the blind-hunter row above; patched together.
  - `[low]` `[patch]` (verification-gap) `occ()` now fails a valueless prose mention — same root
    cause as the edge-case row above; patched together.
  - `[medium]` `[patch]` (verification-gap) `volDown` misses a clustered short flag (`-vt 10`) —
    same root cause as the tokenizer rewrite; patched together and verified failing.
  - `[low]` `[reject]` (intent-alignment) Byte-identity with `e0952a5` no longer holds for
    `.bmad-loop/policy.toml` and `ops/README.md`, and the spec's acceptance criteria and Design Notes
    still assert it. Rejected: the only fix is to edit this build's spec. Recorded under
    `## Auto Run Result` instead — the departure is the patches from two review passes, which the
    intent's own "independently re-verify from scratch" clause licenses.
  - `[false]` (intent-alignment) The guards assert roughly a dozen constraints the I/O matrix has no
    row for. Checked: no bad outcome is named, and each constraint that actually misfires on a
    correct file is filed separately above and patched. A matrix that is a floor rather than a
    ceiling is not a defect.
  - `[medium]` `[patch]` (intent-alignment) `ops/README.md`'s `'54329:5432'` loopback diagnostic
    collides with guard 52, adding an operator procedural step. Carried: logged last pass as
    `[medium]` `[patch]` and already applied — the checkpoint says the gate fails until the entry is
    reverted, and the code still reads as that row describes.
  - `[low]` `[reject]` (intent-alignment) The matrix names guard 52 for the service-less file while
    guard 49 is what trips. Rejected: the only fix is to edit this build's spec, and the gate still
    exits 1 as the row requires.
  - `[false]` (intent-alignment) The break matrix is durable only as prose; nothing re-runs a break.
    Checked: the intent scopes both-ways verification to this run ("re-verified both ways in this
    worktree"), not to a delivered harness, and that verification was performed and recorded. No bad
    outcome at the cited location.

## Design Notes

Why restore rather than re-implement: the previous attempt's output is not a draft, it is a
reviewed artifact — four review lenses produced 26 findings and 13 of them were patched into these
exact bytes (the compose-plugin probe, guard 50's vacuity in a checkout already named
`mastra-factory`, `COMPOSE_PROJECT_NAME` as an override, the derived `--wait-timeout` floor, the two
DW-14 drifts closed by guard 52, and DW-17's crash-loop claim restated on measurement). Re-deriving
those by hand would silently drop most of them. The verification burden stays here in full: the
restore is trusted for *content*, never for *correctness*.

Why the four guards and not the one DW-14 asks for: DW-14's smallest fix is `docker compose config
-q`, which only proves the file parses. Its stated *harm* is that inverting the publish to
`'54329:5432'` or letting the healthcheck's `${POSTGRES_USER:-factory}` drift from `environment`
exits 0 everywhere. Guard 52 is what closes that; guards 50 and 51 close DW-16 and DW-17.

Why `mastra-factory` and no other spelling: it is the name the deployment already runs under. Any
other value would be a live migration of the only copy of the data, which this change must not be.

A side effect worth restating: once the project name is pinned, *every* checkout — including each
story worktree under `.bmad-loop/runs/` — addresses the same Compose project. That is exactly DW-16's
intent, and it is also why nothing in this story may run a mutating Compose subcommand.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exit 0 (a fresh worktree has no `node_modules`).
- `git diff e0952a5 -- docker-compose.yml package.json README.md ops/README.md .bmad-loop/policy.toml`
  -- expected: empty.
- Parse `HEAD:.bmad-loop/policy.toml` and the working copy with a TOML parser and compare
  `[verify].commands` -- expected: 48-entry prefix identical and in order, four appended.
- Run all 52 `[verify].commands` in order from the worktree root -- expected: every one exits 0.
- `POSTGRES_PASSWORD=x docker compose config --format json` -- expected: `name` is `mastra-factory`,
  `volumes` is `{"mastracode-web-pgdata":{"name":"mastra-factory_mastracode-web-pgdata"}}`.
- `node -e` read of `package.json` `scripts["db:up"]` -- expected: `docker compose up -d --wait
  --wait-timeout 120`.
- For each I/O-matrix break row: apply the break, run the affected guard, confirm exit 1 and the
  offender named, then revert -- expected: exit 1, then a clean revert.
- `git status --porcelain` -- expected: only this story's five paths once testing is done.

**Manual checks (if no CLI):**
- `docker volume ls` and `docker inspect --format '{{.State.Health.Status}}' mastracode-web-db`
  before and after -- expected: unchanged, still exactly `mastra-factory_mastracode-web-pgdata`, and
  still `healthy`.

## Auto Run Result

Status: done

**Implemented change.** `docker-compose.yml` pins `name: mastra-factory`, `package.json`'s `db:up`
carries `--wait-timeout 120`, and the file is under the verify gate for the first time: four `sh -c`
guards at `[verify].commands` indices 48-51 (guards 49-52 in the file's 1-based comment numbering),
taking the gate from 48 to 52 commands, with a matching numbered comment block. Closes DW-14, DW-16
(project-name half) and DW-17.

The pin reproduces the name the deployment already runs under, so nothing migrated: before the change
this worktree resolved to project `dw-compose-file-hardening-and-gate`; after it, `name` is
`mastra-factory` and the volume is `mastra-factory_mastracode-web-pgdata`, which is what
`docker volume ls` already carried. Measured before and after this run: one volume,
`mastra-factory_mastracode-web-pgdata`, and `mastracode-web-db` `healthy`. No mutating Compose
subcommand was run at any point — read-only `config` only.

**This session was a follow-up review pass** on the already-committed work (`c057a9e`). It found and
closed 14 further defects in the four new guards, most of them guards passing on breaks they were
written to catch.

**Files changed** (this pass; the run as a whole also produced `docker-compose.yml`, `package.json`
and `README.md`, unchanged here):
- `.bmad-loop/policy.toml` -- guards 49/50/52 now resolve the project WITHOUT `-f`, so they read what
  `npm run db:up` reads (override files and `COMPOSE_FILE` included); guard 50 reads the volume
  driver and accepts a `COMPOSE_PROJECT_NAME` that names the same project; guard 51's teardown
  detection was rewritten (quotes, shell operators, global flags on both sides of `compose`,
  clustered short flags) and now also bans direct volume removal; guard 52 bounds the service set,
  rejects `network_mode`, requires a resolved `POSTGRES_PASSWORD`, accepts digest pins, single-quoted
  probe arguments and fractional durations. Comment block extended with a numbered addendum per guard.
- `ops/README.md` -- a third bullet restores guidance for a `db:up` that hangs before the health wait.
- `_bmad-output/implementation-artifacts/spec-compose-file-hardening-and-gate-2.md` -- this spec
  (process artifact, not product).

**Review findings: 37 findings across four layers — high 0, medium 14, low 18, false 5,
maybe-false 0.** Patched: 14 entries — 7 medium, 7 low. Carried from the previous pass: 3 (1 patch
already applied, 1 reject, 1 defer). Rejected: 6. False: 5. Newly deferred: none.
- Rejected, with reasons: the unpinned image major version (`pg17` passes) — a deliberate downgrade is
  not everyday use and the fix adds an arm to bump on every upgrade; the `Restarting` bullet's missing
  blast-radius warning and guard 49's grep ordering — no bad outcome follows from either; DW-85's
  truncated ledger `reason` and DW-17's falsified ledger text — the intent's Never list gives
  `deferred-work.md` to the orchestrator, and DW-85's full text survives in this spec's `deferred`
  frontmatter; the spec's stale byte-identity acceptance criteria and the matrix's guard attribution
  for the service-less file — both fixes are edits to this build's spec.
- False, with refutations: three filings of "the `${VAR?msg}` required form escapes guard 49" —
  measured, all three Compose guards still exit 1 and Compose's own diagnostic names the variable, so
  the cause is not hidden; "the guards assert constraints the matrix has no row for" — no bad outcome
  named, and each constraint that misfires is filed and patched separately; "the break matrix is only
  prose" — the intent scopes both-ways verification to this run, and it was performed.

**Departure from the byte-identity acceptance criterion, disclosed.** The spec's first Always bullet
and its first acceptance criterion require the tree to match `e0952a5` for the five product paths.
That held at implementation time and is deliberately superseded: two review passes patched
`.bmad-loop/policy.toml` (+254/-42 vs `e0952a5`) and `ops/README.md` (+12/-2).
`docker-compose.yml`, `package.json` and `README.md` are still byte-identical to `e0952a5`. The
intent's own "independently re-verify it here from scratch — rather than trusting the preserved
commit" is what licenses this; re-verification found the preserved guards vacuous on many of their
own break rows, and leaving them that way would have shipped exactly the vacuous pass DW-14 is a
complaint about. The spec's Acceptance Criteria and Design Notes are left unamended because triage
rejects findings whose fix is to edit this build's spec.

**Verification performed** (all in this worktree, after `npm ci --no-audit --no-fund`):
- All 52 `[verify].commands` run in order from the worktree root: 0 failures, guard 28 included.
- Append-only proved with a TOML parser against `e657db0:.bmad-loop/policy.toml`: the 48-entry prefix
  is byte-identical and in the same order; exactly four entries appended.
- `docker compose config --format json`: `name` is `mastra-factory`, volumes are
  `{"mastracode-web-pgdata":{"name":"mastra-factory_mastracode-web-pgdata"}}`, services are
  `["app-db"]`.
- `package.json` `scripts["db:up"]` is `docker compose up -d --wait --wait-timeout 120`.
- Break matrix re-run both ways in an isolated scratch copy of the five product files, 24 rows: each
  new or widened arm fails naming the offender on its break, and every benign spelling
  (`docker compose down`, `docker compose logs app-db`, a benign override, `COMPOSE_PROJECT_NAME=mastra-factory`
  quoted and bare, single-quoted probe arguments, `interval: 1.5s`, a digest-pinned
  `pgvector/pgvector`) passes. No break was ever applied to the worktree itself.
- `docker volume ls` / `docker inspect` before and after: unchanged, still one volume, still healthy.

**Residual risks.**
- The two entries in `deferred` remain open: `[verify].commands` still has no guard preventing a
  future entry from running a mutating `docker compose` subcommand against the now-pinned project
  (the self-exclusion problem), and DW-16's `container_name` half is now gate-pinned rather than
  relaxed.
- Guard 51's detectors are string analysis over `scripts` values, not a shell parser. Seven evasion
  spellings were closed and verified; an adversarially constructed eighth (command substitution, a
  variable holding the subcommand) would still pass. The ban is a guardrail against drift, not a
  sandbox.
- The three Compose guards now hard-require a working `docker` with the `compose` plugin, as recorded
  in the comment block. Dropping `-f` additionally means a stray `docker-compose.override.yml` or a
  `COMPOSE_FILE` in `.env` turns the gate red — which is the intended reading, but it is a new way for
  a local-only file to fail the gate.
- The English restatement of the derived floor in `ops/README.md`, and this file's own comment-block
  numbers, stay hand-maintained; that is disclosed in the guard-51 paragraph rather than closed.

