---
title: 'Story 5.4: A config module with recorded provenance, holding storage, vector and pubsub'
type: 'refactor'
created: '2026-09-24'
status: 'done'
baseline_revision: 'b321370641fba95e5f26ae1c2efdfe012857e6c5'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `AGENTS.md`'s "Running and verifying" section carries three false claims, two of them in ways
      that would mislead the next story: it says there is no test script, that the verify gate runs
      two guards, and that `.bmad-loop/policy.toml` is gitignored.
    evidence: |-
      `AGENTS.md:47-48` reads "There is no test script, so it is the only automated check until a
      story adds one" while `package.json:13` has `"test": "vitest run --dir src"` and three test
      files now run. `AGENTS.md:49-51` says the gate runs `npm ci`, `npm run check` "and two
      guards" — `[verify].commands` holds 36 entries. `AGENTS.md:53` says `policy.toml` "is
      gitignored and exists only in the main checkout" — it is tracked, and `.gitignore:13-15`
      carries a comment saying so deliberately. All three are false at baseline `b321370`, so this
      story did not introduce them; and the block is a `<!-- bmad:context -->` managed region,
      which step-04 routes to defer.
    location: >-
      AGENTS.md:47-53
    severity: medium
  - summary: >-
      `REDIS_URL` is the one key in the new config modules that is not trimmed, so a
      whitespace-only value constructs a real `RedisStreamsPubSub` on a blank URL at module load.
    evidence: |-
      `src/mastra/config/pubsub.ts:17` is `const redisUrl = process.env.REDIS_URL` with no
      `?.trim()`, while `config/database-url.ts` trims both its keys and every integration key in
      the entry is trimmed. `apps/github/README.md:454` and `apps/linear/README.md:415` make
      "blank, whitespace, or empty-quoted" the canonical `.env` failure shape, so the value is
      reachable. Verified pre-existing: the same untrimmed read is at baseline `b321370`
      (`src/mastra/index.ts:108`), so this story only moved it — and the Always clause required the
      move to be behaviour-preserving. Today's behaviour is now pinned explicitly in
      `src/mastra/config/infrastructure.test.ts`, so adding the trim would be a visible, deliberate
      edit. Note `index.test.ts`'s own docstring: a `REDIS_URL` the boot acts on makes it dial a
      Redis that need not exist, and the gate hangs rather than fails.
    location: >-
      src/mastra/config/pubsub.ts:17
    severity: medium
  - summary: >-
      Three `src/mastra/index.ts:N` citations in `_bmad-output/planning-artifacts/epics.md`, and
      nine in `_bmad-output/implementation-artifacts/deferred-work.md`, name lines the entry no
      longer holds.
    evidence: |-
      `epics.md:303` cites `src/mastra/index.ts:45` for `positiveInt`, `:308` cites `:52` for
      `decodeCredentialEncryptionKey`, `:314` cites `:204` for `localSandboxEnv`. All three were
      ALREADY stale at baseline `b321370` — the functions sat at `:50`, `:64` and `:272` there —
      and this story shifted them again, to `:57`, `:71` and `:259`. `deferred-work.md` carries
      `index.ts` anchors in DW-25 (`:576-578`, now `:527-529`), DW-54 (`:69-86`), and six more.
      Not repaired here: the intent's Never clause forbids rewriting anything under
      `_bmad-output/`, and the deferred-work ledger is the orchestrator's to edit. Settling this
      needs a pass that owns both files at once.
    location: >-
      _bmad-output/planning-artifacts/epics.md:303,308,314
    severity: low
  - summary: >-
      `ops/README.md` and `.env.schema` both describe `REDIS_URL` as "unset keeps the in-process
      bus" without noting that a whitespace-only value is not unset and does construct a client.
    evidence: |-
      Same root cause as the untrimmed-`REDIS_URL` entry above: `config/pubsub.ts:17` does not
      trim, so `REDIS_URL="   "` builds a `RedisStreamsPubSub` on a blank target while the
      identically padded `DATABASE_URL` reads as absent. The operator-facing text says only
      "Unset keeps the in-process bus". Not repaired here for two reasons: the intent's Never
      clause forbids editing `.env.schema`, and documenting the asymmetry would enshrine as
      intended a behaviour the entry above records as a defect. Both should move together — add
      the `?.trim()` and leave the docs saying what they already say.
    location: >-
      ops/README.md (REDIS_URL section), .env.schema
    severity: low
  - summary: >-
      The comment above `storage,` in the entry's `new MastraFactory({ … })` call says the factory
      falls back to "default storage resolution" when no database is configured, which never
      happens — `config/storage.ts` always hands it a concrete instance.
    evidence: |-
      `src/mastra/index.ts` factory call, the paragraph ending "Unset (bare local dev) → default
      storage resolution applies (local libSQL file)". `config/storage.ts:20-30` constructs
      `LibSQLFactoryStorage` on that branch, so the factory's own resolution is never reached.
      Verified pre-existing and byte-identical at baseline `b321370:src/mastra/index.ts:593` —
      the inline block there also always produced an instance, so this story neither introduced
      nor worsened it. Left alone because the Always clause makes this story a behaviour-
      preserving move and the comment is the entry's, not a moved concern's; `config/README.md`'s
      "a concern moves with the comments that explain it" is what will collect it, in the story
      that next edits this call.
    location: >-
      src/mastra/index.ts (new MastraFactory call, storage property comment)
    severity: low
---

<intent-contract>

## Intent

**Problem:** `src/mastra/index.ts` is 636 lines of unextracted construction forked from `npm create
factory`, and nothing in the repo records what it was forked from — so reconciling with a future
Mastra template update is archaeology, not a three-way diff (AD-8 / FR35). The three upstream
infrastructure concerns (storage, vector, pubsub) sit inline in the entry, and three of the four
keys they read are read twice each (`DATABASE_URL` and `APP_DATABASE_URL` at `:517` *and* `:518`,
`NODE_ENV` twice at `:524`), against AD-7's one-read-site rule.

**Approach:** Create `src/mastra/config/` with a `README.md` recording the fork point, and move the
three concerns into it as per-concern modules — `database-url.ts` (the single read site for the
connection string and the runtime-mode gate the storage branch turns on), `storage.ts`, `vector.ts`,
`pubsub.ts`. The entry imports the constructed values and keeps its literal `new Mastra(...)`.
Re-pin every `src/mastra/index.ts:N` citation the removal shifts, and append three `[verify].commands`
guards the way Stories 5.1–5.3 did.

## Boundaries & Constraints

**Always:** Behaviour-preserving — the same instances with the same options, the same warning and
error texts, and the same relative order among the three concerns (pubsub first, then storage, then
vector) via import order. Each of `DATABASE_URL`, `APP_DATABASE_URL`, `NODE_ENV` and `REDIS_URL` is
read at exactly ONE `process.env.X` location in `src/` after the change (AD-7/NFR8), with consumers
receiving the parsed value by module export. `src/mastra/index.ts` keeps its literal
`new Mastra(...)` and its `export const mastra` (AD-2/NFR1). Relative imports stay extensionless
(`./config/storage`), matching `index.test.ts`'s `./index` — `moduleResolution: "bundler"`.
`[verify].commands` is append-only: the 33 existing entries stay byte-identical and in order, three
are appended (34–36), and each gets a numbered paragraph in the comment block. Every claim this
change falsifies is repaired in the same commit, so the gate is never red mid-story.

**Never:** Do not touch auth, integrations or the sandbox branch — they are Story 5.5, and AD-8
forbids a partial state: a concern not yet started stays entirely in the entry, untouched. Do not
delete `REDIS_URL`/`RedisStreamsPubSub` or any ruled-out package; extraction is a move, not a
cleanup. Do not add or remove an environment key, and do not edit `.env.schema`, `.env.example`,
`package.json`, `package-lock.json`, `tsconfig.json`, `docker-compose.yml`, or any of the twelve
seeded operational artifacts. Do not give `src/mastra/config/README.md` a
`## Keys this … owns` heading or any key table — AD-6's owner set is exactly six READMEs and
`.env.schema` is the only key list. Do not add a root directory, do not widen
`tsconfig.json`'s `include`, and do not renumber a section in `docs/self-hosting-research.md`. Do
not rewrite history under `_bmad/`, `_bmad-output/`, `.claude/`, `.agents/`, or touch
`sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Settled state | tree after this story | all 36 `[verify].commands` exit 0 | No error expected |
| Postgres configured | `DATABASE_URL=postgres://…` | `PgFactoryStorage` + `PgVector`, both on that URL | No error expected |
| Bare local dev | no URL, `NODE_ENV=test` | `LibSQLFactoryStorage` at `file:${getDatabasePath()}`, `vector` undefined | No error expected |
| Legacy alias only | `APP_DATABASE_URL` set, `DATABASE_URL` unset | same Postgres pair, plus the deprecation warning, text unchanged | warns once, does not throw |
| No URL in production | both unset, `NODE_ENV` unset | boot fails | throws `DATABASE_URL is required outside local development and tests.` |
| Redis configured | `REDIS_URL=redis://u:p@h:6379` | `RedisStreamsPubSub`, log naming `redis://h:6379` only | unparseable URL logs the generic target |
| Provenance drifts | bump `@mastra/factory` in `package.json` without editing the README | guard 34 exits 1 | message names both versions and the README |
| A concern creeps back | re-add `new PgVector(` to the entry | guard 35 exits 1 | message names the constructor and the entry |
| A key regains a second read | add `process.env.REDIS_URL` anywhere in `src/` | guard 35 exits 1 | message names the key and every read site |
| Entry construction moved out | replace `new Mastra(` with a re-export | guard 36 exits 1 | message names AD-2 and `checkConfigExport` |

</intent-contract>

## Code Map

- `src/mastra/index.ts` (636 lines) — **the file to shrink.** Module docstring `:1-18` — `:4-7`
  claims "This module is the ONE place deployment env is read … (pubsub, storage, vector)", which
  this change falsifies. **Moves out:** imports `:23` (`LibSQLFactoryStorage`), `:24`
  (`PgVector, PgFactoryStorage`), `:29` (`RedisStreamsPubSub`), `:30` (`getDatabasePath`), `:31`
  (`DEFAULT_RETENTION`); the pubsub block `:102-120` (comment, `const redisUrl` read, ternary,
  redaction log); the database block `:506-540` (comment, `databaseUrl` with its DOUBLE reads of
  both keys at `:517-518`, the deprecation warning `:518-523`, `localDevelopmentMode` with its
  DOUBLE `NODE_ENV` read `:524`, the production throw `:525-527`, `storage` `:529-539`, `vector`
  `:540`). **Stays:** everything else, including `positiveInt` `:50-55` (used by
  `dockerSandboxOptions` and `dispatcher.maxInFlight` `:588`), `credentialEncryption` `:70-100`,
  `selectAuth` `:162-207`, the GitHub/Linear/Slack integration blocks, `selectSandbox` `:454-504`,
  `stateSecret` `:548-552`, `hasPlatformSandboxEnv` `:576-578`, the `new MastraFactory({…})` call
  `:579-617` (whose `storage` / `vector` / `pubsub` shorthand properties `:594-596` become the
  imported bindings), `await factory.prepare()` `:619`, the literal `new Mastra(...)` `:626-631`,
  `await factory.finalize()` `:636`.
- `src/mastra/index.test.ts` (936 lines) — imports only helpers that stay (`positiveInt`,
  `decodeCredentialEncryptionKey`, `dockerSandboxOptions`, `liveDockerSandboxes`,
  `localSandboxEnv`, `selectAuth`, `selectSandbox`, and `mastra` at `:931`), so **no import
  changes are required** and no test moves. Two comments become imprecise and need rewording, not
  rewriting: the preamble `:14-21` ("every variable the entry consults") and `ENTRY_ENV_EXACT`
  `:52-57`, whose `REDIS_URL`/`DATABASE_URL`/`APP_DATABASE_URL` entries are still required (the
  entry imports the config modules, so the boot still reads them) but are no longer read *in* the
  entry. The sweep at `:59-63`, `NODE_ENV = 'test'` at `:74` and `MASTRA_DB_PATH` at `:78` all
  still work unchanged, because they run before `await import('./index')` at `:103`.
- **New — `src/mastra/config/`.** Path fixed by AD-8's *Binds* and by the structural seed
  `ARCHITECTURE-SPINE.md:307-309` (`config/  # local deltas + template provenance (AD-8)`,
  `README.md  # forked-from version record — REQUIRED`). No module-naming convention is stated
  anywhere for files inside it. Already covered by `tsconfig.json:25-27` (`include: ["src/**/*"]`)
  and by `vitest run --dir src`; `src` is already in the AD-3 root closed set, so guard 20 is
  unaffected.
- **Provenance facts** (verified): `package.json:25` pins `"@mastra/factory": "0.15.0"`; the fork
  commit is `5a2eb7222f99c44ecd68276d2a3d3d1759e1b4c2` "Create project from template"
  (2026-09-20), which introduced `src/mastra/index.ts` at 366 lines and pinned the SAME
  `@mastra/factory` 0.15.0; the scaffold is `npm create factory` (npm package `create-factory`),
  recorded at `README.md:5` and `docs/self-hosting-research.md:5`. No template repo URL, git ref or
  `create-factory` version exists anywhere in the repo — `git show 5a2eb72:src/mastra/index.ts` is
  the only retrievable base.
- **Citations into the entry that this change shifts** (every anchor below line 102 moves): 
  `apps/github/README.md:157` (`:222-223`), `:350` (`:548-551`), `:352` (`:616`), `:454`
  (`:217-223`); `apps/linear/README.md:65` (`:244-247`), `:145` (`:242-243`), `:159` (`:548-552`),
  `:161` (`:616`), `:261` (`:607`), `:415` (`:240-243`); `apps/slack/README.md:172` and `:343`
  (`:558-560`), `:395` (`:567`); `.bmad-loop/policy.toml:438` (`:576-578`);
  `docs/self-hosting-research.md:110` (`:291-314`), plus the bare-`index.ts` anchors at `:25`
  (`index.ts:233` — the `DATABASE_URL` throw, which this story moves to another FILE), `:42`
  (`:135-140`), `:43` (`:283-285`), `:170` (`:130-143`), `:223` (`:144`). The last five are
  **already stale at baseline** and this change shifts them again.
- **Prose this change falsifies:** `AGENTS.md:35` "Deployment entry, and the only first-party
  source today: `src/mastra/index.ts`" (a `<!-- bmad:context -->` managed block — Story 5.3
  already edited inside it).
- `.bmad-loop/policy.toml` (942 lines, tracked — `.gitignore:13-15` says so deliberately).
  `[verify]` `:28`, comment block `:29-728`, `commands = [` `:729`, 33 entries `:730-762`, `]`
  `:763`. Entry form: one physical line, two-space indent, TOML literal `'''sh -c '…' '''` (note
  the space before the closing `'''`), trailing comma on every entry; no literal `'` inside —
  synthesize with `q=$(printf "\47")`, backtick `b=$(printf "\140")`. Append-only is stated at
  `:44-45`, `:345-346`, `:421-423` and `:728`. Guards to leave alone but not to duplicate:
  **5** (`:734`, no `.ts` outside `src/` — new files under `src/mastra/config/` pass),
  **20** (`:749`, root closed set — keys on the FIRST path segment, so `src` is already admitted),
  **21** (`:750`, `tsconfig.json` include frozen), **25** (`:754`) and **30** (`:759`), which
  hard-code the six owned-keys READMEs as `r="README.md ops/README.md sandbox/README.md
  apps/github/README.md apps/linear/README.md apps/slack/README.md"` — a seventh README is invisible
  to them, **26** (`:755`, every literal `process.env` read under `src/` is declared in
  `.env.schema`; its git pathspec `"src/*.ts"` crosses `/`, so the new modules are scanned), **31**
  (`:760`, sweeps every tracked non-`_bmad-output` file for the old research-doc filename — the new
  files must cite `docs/self-hosting-research.md` only), **29** (`:758`, credential-shape scan — the
  new README must show no credential-shaped literal). House style for a guard: `test -f` the
  subjects with a `missing $f` message, assert every extraction non-empty ("would pass vacuously"),
  then the assertions, each `echo`ing the offender and the AD/AC it enforces.
- **Key ownership, unchanged by this story** (`ops/README.md:26-27` owns `NODE_ENV` and
  `REDIS_URL`; `README.md:230`, `:242`, `:243` own `DATABASE_URL`, `APP_DATABASE_URL`,
  `MASTRA_DB_PATH`). `MASTRA_DB_PATH` has no first-party read site — `getDatabasePath()` reads it
  inside `@mastra/code-sdk` — and that stays true after the move.
- **Out of scope, verified:** `.env.schema`/`.env.example` key sets and order are untouched (no key
  added or removed); `README.md:84/:88/:91`, `ops/README.md:220`, `.env.schema:231`,
  `.env.example:201` all cite `signUpEnabled: false` in `src/mastra/index.ts`, which is still true
  until Story 5.5; `.mastra-project.json` records no template information.

## Tasks & Acceptance

**Execution:**

- `src/mastra/config/README.md` — new. Record the provenance AD-8/FR35 requires: the template
  origin (`npm create factory` / the npm package `create-factory`, materialised by commit
  `5a2eb7222f99c44ecd68276d2a3d3d1759e1b4c2`, with `git show 5a2eb72:src/mastra/index.ts` named as
  the retrievable three-way-diff base), the `@mastra/factory` version at that fork (`0.15.0`) and
  the version installed today (`0.15.0`, `package.json`), a sentence stating the record MUST be
  updated on every reconciliation, the rule that extraction is total per concern, the current
  module layout, and the reconciliation procedure. State plainly that no upstream template repo,
  ref or `create-factory` version is recorded anywhere — the fork commit is the base. No key table,
  no `## Keys this … owns` heading, no credential-shaped example values. — FR35: the record is what
  makes full extraction payable.
- `src/mastra/config/database-url.ts` — new. The single read site for `DATABASE_URL`,
  `APP_DATABASE_URL` and `NODE_ENV`: read each key once into a local, export the resolved
  `databaseUrl`, keep the deprecation warning and the production throw with their texts byte-identical.
  — AD-7: the entry reads all three twice today, so collapsing the duplicates is part of the move,
  and both `storage` and `vector` need the same parsed value.
- `src/mastra/config/storage.ts`, `src/mastra/config/vector.ts`, `src/mastra/config/pubsub.ts` — new,
  one per concern. Each imports what it constructs and exports the constructed value; `storage` and
  `vector` take `databaseUrl` by import, `pubsub` owns the single `REDIS_URL` read. Carry the
  existing explanatory comments with the code they explain. — AD-8: extraction is total per concern,
  and each becomes its own module.
- `src/mastra/index.ts` — delete the five moved imports, the pubsub block and the database block;
  import `pubsub`, `storage`, `vector` from `./config/…` in that order so the three keep their
  relative evaluation order; rewrite the docstring's "ONE place deployment env is read" paragraph to
  say the entry now assembles the factory from `./config/` and points at
  `src/mastra/config/README.md`. Change nothing else — the factory call keeps its shorthand
  properties, and the literal `new Mastra(...)` stays. — AD-2: the deployer's `checkConfigExport`
  inspects this file's source.
- `src/mastra/index.test.ts` — reword the preamble and the `ENTRY_ENV_EXACT` comment so they say the
  boot reads these keys through the entry's config modules; keep the list and the sweep exactly as
  they are. No import changes, no test moves. — the AC's "its test moves or its import is updated in
  the same change" is conditional on a helper relocating; none does here, and the gate must stay
  green across the commit.
- `AGENTS.md`, `apps/github/README.md`, `apps/linear/README.md`, `apps/slack/README.md`,
  `docs/self-hosting-research.md`, `.bmad-loop/policy.toml` — repair `AGENTS.md:35`, and re-pin every
  `src/mastra/index.ts:N` / `index.ts:N` anchor the Code Map enumerates to the line it names after
  the edit, repointing the ones whose code moved at the new file. Change nothing else in these files
  and do not renumber a research-document section. — a citation that no longer resolves is the harm
  AD-5 names, and this change is what moves them.
- `.bmad-loop/policy.toml` — append guards 34, 35 and 36 (33 → 36) with a new numbered group in the
  comment block, leaving the 33 existing entries byte-identical and in order. (34) provenance:
  `src/mastra/config/README.md` is tracked, regular and non-empty, names `create-factory`, names a
  40-hex fork commit that resolves and whose `src/mastra/index.ts` blob exists, and records an
  `@mastra/factory` version equal to the one `package.json` pins, plus the must-update-on-every-
  reconciliation sentence. (35) total extraction: the entry carries no `PgFactoryStorage`,
  `LibSQLFactoryStorage`, `PgVector` or `RedisStreamsPubSub` mention and no read of the four moved
  keys; each concern exists as its own module under `src/mastra/config/`; and each of the four keys
  has exactly one literal `process.env` read across all of `src/`. (36) entry indivisibility: the
  entry contains a literal `new Mastra(` and `export const mastra`, and no other file under `src/`
  re-exports or constructs it. — an audit that is not a gate command is a one-time observation;
  Stories 5.1–5.3 made the same conversion.

**Acceptance Criteria:**

- Given AD-8 makes the provenance record the thing that keeps full extraction payable, when
  `src/mastra/config/README.md` is read, then it records the `@mastra/factory` version and the
  template origin the entry was forked from and states it must be updated on every reconciliation,
  and bumping `@mastra/factory` in `package.json` without editing it fails the gate naming both
  versions.
- Given extraction is total per concern and never partial, when the entry is read, then no storage,
  vector or pubsub construction remains in it, each of the three is its own module under
  `src/mastra/config/`, auth, integrations and the sandbox branch are untouched, and re-adding one
  of the four constructors to the entry fails the gate naming it.
- Given AD-7 puts each key at exactly one read site, when the gate runs, then `DATABASE_URL`,
  `APP_DATABASE_URL`, `NODE_ENV` and `REDIS_URL` each have exactly one literal `process.env` read
  across `src/`, every consumer takes the parsed value by module export, and adding a second read of
  any of them fails the gate naming the key and the sites.
- Given the entry must stay indivisible, when this story lands, then `src/mastra/index.ts` still
  contains the literal `new Mastra(...)` and exports `mastra`, `npm run check` is clean, `npm test`
  passes with no import change in `src/mastra/index.test.ts`, and replacing the literal with a
  re-export fails the gate.
- Given the change must be behaviour-preserving, when the settled tree is compared to
  `b321370641fba95e5f26ae1c2efdfe012857e6c5`, then the warning and error texts, the constructor
  options (`id`, `retention`, `connectionString`, `url`) and the Redis redaction log are unchanged,
  the three concerns evaluate in their original relative order, and `git diff --stat` shows no change
  to `.env.schema`, `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`,
  `docker-compose.yml` or any seeded operational artifact.
- Given a citation that no longer resolves is the harm AD-5 names, when the commit is read, then
  every `src/mastra/index.ts:N` anchor the Code Map enumerates names the line it claims in the new
  tree, `AGENTS.md:35` no longer calls the entry the only first-party source, and no first-party file
  asserts that the entry is where storage, vector or pubsub is constructed.
- Given `[verify].commands` is append-only, when the diff is read, then the 33 pre-existing entries
  are byte-identical and in the same order, guards 34–36 are appended after them, and all 36 exit 0.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 29 findings — high 0, medium 10, low 15, false 4, maybe-false 0
- findings:
  - `[medium]` `[defer]` `AGENTS.md`'s "Running and verifying" section says there is no test
    script, that the gate runs two guards, and that `policy.toml` is gitignored — all three
    confirmed false, and all three confirmed false at baseline `b321370` too. Recorded in
    `deferred`; the fix edits an agent-context managed block.
  - `[medium]` `[patch]` Guard 35's one-read-site census was anchored on `process.env.KEY`, so a
    second read written as `process.env["REDIS_URL"]` or `const { NODE_ENV } = process.env` passed
    with the gate green — reproduced here, both forms. The census now matches bracket access with
    either quote style and a destructuring binding off `process.env`; all five spellings were
    re-verified failing, and the comment block now names what stays invisible (computed keys,
    aliases, a multi-line binding) the way guard 26 names its own.
  - `[low]` `[patch]` Guard 36 missed `export default mastra`, and its `export *` arm only fired on
    a path containing `index` — confirmed: a second file re-exporting the instance as a default
    exited 0. Both added; the star arm is now unconditional, which the comment records as
    deliberately over-broad.
  - `[medium]` `[patch]` Guard 36 failed a CORRECT tree: `export const mastra: Mastra = new
    Mastra({` — legal, typechecking, accepted by `checkConfigExport` — exited 1 with the message
    "does not export const mastra". Both patterns now tolerate a type annotation, and the combined
    one joins the next line so a break after `=` is fine; both forms re-verified passing.
  - `[low]` `[patch]` Guard 34 required exactly one 40-hex id in the WHOLE record, so the
    reconciliation history its own must-update sentence asks for tripped it — confirmed. The fork
    id is now read off the `Fork commit` line; a `## Reconciliation history` line naming another
    commit re-verified passing, a second `Fork commit` line still failing.
  - `[low]` `[patch]` Guard 34 compared the DECLARED range, not the installed version, and rejected
    a legitimate prerelease — confirmed both ways: `"^0.15.0"` exited 0 against a record saying
    `0.15.0`, and `0.16.0-rc.1` with the record updated to match exited 1. Both extractions now
    accept a `-prerelease`/`+build` suffix, and `package.json` must pin an exact version, so
    declared and installed cannot diverge.
  - `[low]` `[patch]` `config/database-url.ts`'s comment said "every test below reuses the local"
    in a production module with no tests below it — corrected to name the real consumers.
  - `[low]` `[patch]` The new comment block's "verified legitimate case" named "`NODE_ENV === `
    comparisons in `config/database-url.ts`" — confirmed absent: the module reads once into a local
    and compares the local. The paragraph now says plainly that no read in the tree needs the `==`
    half and why it is carried anyway.
  - `[medium]` `[defer]` `REDIS_URL` is the one key here that is not trimmed, so a whitespace-only
    value constructs on a blank URL — confirmed, and confirmed pre-existing at baseline. Recorded
    in `deferred`; the behaviour-preserving Always clause excludes the fix from this story. The
    test half of the finding (a name reading "unset or blank" over a loop of `[undefined, '']`) was
    patched: renamed to "unset or empty", with a row pinning today's whitespace behaviour.
  - `[low]` `[reject]` Nothing pins the three imports' ORDER, which the entry comment and the
    config README call load-bearing — real, but those texts state the consequence exactly, and it
    is the sequence of three boot log lines; the fix adds a gate assertion for a cosmetic outcome.
  - `[low]` `[reject]` Guard 34 does not compare the README's module-layout table against the
    modules actually present — real, but Story 5.6's AC already owns "reflects the final module
    layout", and the fix is a new table-versus-filesystem assertion rather than a correction.
  - `[low]` `[patch]` Three prose claims in `docs/self-hosting-research.md` survived the move:
    `:15` and `:604` name the entry as the record for keys that now live in `config/`, and `:598`'s
    risk row still gave "keep the diff small + commented" as the mitigation for a divergence this
    story deliberately widens. All three repointed; no section renumbered, no fence touched.
  - `[low]` `[patch]` The story created the repo's first `src/mastra/config/database-url.ts:40-42`
    citation and left the range unguarded, in a document where five such ranges had already gone
    stale — the range is dropped; the file is 44 lines and the path alone is unambiguous.
  - `[low]` `[patch]` Neither operator-facing string was pinned whole, although the AC demands the
    texts be unchanged: the deprecation warning's entire second sentence could be deleted green.
    Both now compared with `toBe` against full constants, the error caught by hand rather than
    through `rejects.toThrow`'s substring match.
  - `[low]` `[patch]` One new comment line ran to ~100 columns against the block's ~80 norm —
    re-wrapped; the widest line in the new block is now 82, inside the file's 79-84 range.
  - `[medium]` `[patch]` (edge-case layer) `config/README.md` called the fork commit "the first
    commit in this repository" — confirmed wrong: the root commit is `6808436` "Initial commit",
    carrying a one-line README and no entry file, so a reconciler following the sentence lands on
    a commit where `git show 6808436:src/mastra/index.ts` resolves to nothing. Corrected to the
    second commit, naming the root commit and what it holds.
  - `[low]` `[patch]` (edge-case layer) Guard 34 rejected a prerelease pin — same finding and same
    fix as the declared-versus-installed row.
  - `[medium]` `[patch]` (edge-case layer) Guard 35's census missed bracket access and
    destructuring — same finding and same fix as the census row.
  - `[medium]` `[patch]` (edge-case layer) The entry could stop passing `pubsub` or `vector` to
    `MastraFactory` with everything green — same finding and same fix as the verification-gap row
    below.
  - `[medium]` `[defer]` (edge-case layer) `pubsub.ts` does not trim `REDIS_URL` — same finding and
    same routing as the untrimmed-key row.
  - `[low]` `[patch]` (edge-case layer) The "unset or blank" test covered only `[undefined, '']` —
    same finding and same fix as the untrimmed-key row's test half.
  - `[low]` `[reject]` (edge-case layer) Moving the `DATABASE_URL` throw to import time changes
    which fatal misconfiguration is named first when the credential key is also malformed — real,
    but both are fatal and reported in turn, nothing pinned either order before, and the spec's
    Design Notes already record the reordering as inherent to extraction.
  - `[low]` `[patch]` (edge-case layer) The comment's `NODE_ENV === ` claim — same finding and same
    fix as the comment-accuracy row.
  - `[medium]` `[patch]` (gap layer) The constructed `vector` and `pubsub` never reach
    `MastraFactory` in any check — arrives pre-verified and reproduced here: turning two imports
    into bare side-effect imports and deleting the `vector,` and `pubsub,` shorthand left `tsc`,
    all 75 tests and all 36 guards green while the deployment silently ran on the default vector
    mount and the in-process event bus. The module boundary is what made "side effects run, value
    discarded" reachable. Guard 35 now requires, per concern, the named import from
    `./config/<module>` and the binding as a property inside the factory call; both severances
    re-verified failing. A boot-level test was the layer's suggestion and was not taken: observing
    the slots needs `prepare()`/`finalize()` with a pubsub in place, and the only pubsub here dials
    Redis — the comment records that and that this is a source-shape assertion.
  - `[medium]` `[patch]` (gap layer) Guard 35's census saw dot notation only — same finding and
    same fix as the census row; the layer's own demonstrations matched ours.
  - `[low]` `[patch]` (gap layer, other) The comment's `NODE_ENV === ` claim — same finding and
    same fix.
  - `[false]` `[reject]` (intent-alignment layer) The human-dependency triage is recorded at the
    wrong altitude — in `config/README.md`'s provenance prose rather than in frontmatter. Refuted:
    the intent's `awaiting-operator` branch fires only when the ACs contain a human-only action,
    and Story 5.4's do not — `epics.md:1067-1097` carries none of the "parks at awaiting-operator"
    clauses the epic gives Stories 2.x/3.x/4.x. A negative triage has no frontmatter to record;
    the README paragraph is a statement about the codebase and is correct as such.
  - `[false]` `[reject]` (intent-alignment layer) `in-review` is outside the intent's vocabulary,
    so the diff's status may be a non-terminal value where a terminal one was demanded. Refuted:
    the intent's clause governs the FINAL frontmatter, and the diff the layer read was taken
    mid-run, before this section existed. The finalized value is `done`.
  - `[false]` `[reject]` (intent-alignment layer) "complete every part an agent CAN do, commit it,
    then finalize" is unobservable because the change was uncommitted. Refuted: the commit is the
    last step of this pass, after the triage log and the Auto Run Result are written; an
    uncommitted working tree mid-review is the expected state, not a deviation.
  - `[false]` `[reject]` (intent-alignment layer) The change adds tests although
    `ARCHITECTURE-SPINE.md:383` deferred tests for `src/mastra/config/` — the layer files this as
    "neither aligned nor misaligned" with the intent, and it is not a defect: the spine's deferral
    was conditioned on `config/` holding nothing worth asserting on, and four I/O-matrix rows
    turned out to be observable nowhere else.

### 2026-09-24 — Review pass (follow-up)
- verdicts: 29 findings — high 0, medium 8, low 17, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 35's factory-binding check matched any line in the call block at any
    indentation, so a `storage,` moved inside the nested `platform: { … }` object passed —
    reproduced here, exit 0 on a tree where the factory never receives storage. Grouped with the two
    rows below: one root cause, the per-line regex. The call's top-level properties (two-space
    indent, comments dropped, split on commas, trimmed) are now extracted first and each binding must
    appear among them as a bare token; re-verified failing.
  - `[medium]` `[patch]` The census was anchored so that a backtick-quoted bracket read,
    ``process.env[`REDIS_URL`]``, was invisible — reproduced with the guard green and two live read
    sites. Backticks added to the bracket pattern's quote class; re-verified failing, and the three
    older spellings re-verified still failing.
  - `[low]` `[patch]` The census sweeps `src/` only while its message claims coverage of "first-party
    code" — true, but the blind-spot paragraph was written to state every limit and omitted this one.
    The paragraph now names the scope and why it is complete today (guard 5 forbids first-party
    `.ts`/`.js` outside `src/`).
  - `[low]` `[reject]` The `DATABASE_URL` throw moved to import time, so it now precedes
    `selectAuth()` and the credential-encryption warning — `carried` from the previous pass, where
    the same claim was verified and rejected; the code still reads as that row describes. The
    finding's second half, that three documents deny the change, is refuted: the only "without
    changing it" text in the tree is `infrastructure.test.ts:189` and it is about the `REDIS_URL`
    trim, `vector.ts:8`'s "exactly as before extraction" is about the empty vector slot and is true,
    and the entry's import comment states the new sequence explicitly.
  - `[low]` `[defer]` Citations in `epics.md` and `deferred-work.md` were not re-pinned — confirmed,
    and confirmed already stale at baseline (`epics.md:303` cited `:45` when the function sat at
    `:50`). Recorded in `deferred`; the intent's Never clause forbids rewriting `_bmad-output/`, and
    the ledger is the orchestrator's.
  - `[low]` `[reject]` Nothing guards `path:NN` citations as a class — real, and it is why the row
    above exists. Rejected on the same ground as the previous pass's module-layout row: the fix is a
    new citation-checking mechanism, not a correction, and the story that adds it should own it.
  - `[low]` `[reject]` Guard 34 does not compare the README's module-layout table against the modules
    present — `carried` from the previous pass; Story 5.6's AC already owns "reflects the final
    module layout" and the code still reads as that row describes.
  - `[low]` `[patch]` The guard-34 comment justifies reading the fork id off the `Fork commit` line
    so the record "can grow the reconciliation history its own must-update sentence asks for", but
    the README's procedure had no step creating one — confirmed. Step 7 and a `## Reconciliation
    history` section with a format line added; guard 34 re-verified passing.
  - `[low]` `[defer]` `ops/README.md` and `.env.schema` describe `REDIS_URL` as "unset keeps the
    in-process bus" without noting that whitespace is not unset — confirmed, and it is the
    documentation half of the already-deferred untrimmed-key defect. Recorded in `deferred`:
    `.env.schema` is in the Never list, and documenting the asymmetry would enshrine a bug.
  - `[low]` `[patch]` `database-url.ts:27`'s trailing `|| undefined` is unreachable — both operands
    were already normalized to `string | undefined` two lines above. Deleted; `tsc` and all tests
    still green.
  - `[false]` `[reject]` `loadPubsub` stubs one key where `loadStorage` stubs three, against the
    file's stated hermeticity rule. Refuted: the rule is about keys the module under test reads, and
    `pubsub.ts` reads exactly one, `REDIS_URL`, which is stubbed. No case is configured by an
    inherited value; the concern is contingent on a coupling that does not exist.
  - `[low]` `[defer]` The entry's factory-call comment says "default storage resolution applies" for
    the no-database branch, which `config/storage.ts` never lets happen — confirmed, and confirmed
    byte-identical at baseline `b321370:src/mastra/index.ts:593`. Recorded in `deferred`.
  - `[low]` `[reject]` Nothing pins the three imports' order — `carried` from the previous pass; the
    texts still state the consequence exactly and the outcome is the sequence of three boot log lines.
  - `[medium]` `[patch]` (edge-case layer) A factory property written `vector: undefined` satisfied
    the binding check while discarding the imported value — reproduced, exit 0. Same root cause and
    same fix as the nested-property row; re-verified failing.
  - `[medium]` `[patch]` (edge-case layer) Guard 36 missed a named re-export spread across lines: a
    second file holding `export {` / `  mastra,` / `};` exited 0, where the single-line form
    correctly exits 1 — reproduced. The `export { … mastra … }` arm now also runs over the file with
    newlines squeezed; the multi-line form and an aliased multi-line form both re-verified failing,
    and an unrelated multi-line `export { helper as h }` re-verified passing.
  - `[low]` `[reject]` (edge-case layer) The `DATABASE_URL` error now wins over the credential-key
    error when both are misconfigured — `carried`, same row as the ordering finding above.
  - `[medium]` `[patch]` (edge-case layer) A line that is wholly a comment naming
    `process.env.DATABASE_URL` turned the census red on a CORRECT tree — reproduced, exit 1 naming a
    comment as a second read site. Lines whose first non-space characters are `//`, `*` or `/*` are
    now blanked before the patterns run; deliberately narrow, so a `//` inside a string literal
    cannot truncate a line and hide a real read. Both a line comment and a JSDoc body re-verified
    passing.
  - `[medium]` `[patch]` (edge-case layer) Restatement of the multi-line `export { mastra }` gap with
    its own reproduction — same finding, same fix as the guard-36 row.
  - `[low]` `[defer]` (edge-case layer) `epics.md` still cites `:45`, `:52`, `:204` — same finding
    and same routing as the citation row.
  - `[medium]` `[patch]` (verification-gap layer, other) `process.env?.REDIS_URL` escaped the census
    — reproduced. Optional chaining is now tolerated in front of both the dot and the bracket form;
    `process.env?.REDIS_URL` and `process.env?.["REDIS_URL"]` both re-verified failing.
  - `[medium]` `[patch]` (verification-gap layer, other) The binding check FAILED a correct tree:
    with `storage, vector, pubsub,` reformatted onto one line it reported that pubsub never reaches
    the factory — reproduced, and this repository pins no formatter. Same root cause and same fix as
    the two binding rows; the reformatted call re-verified passing, and the comment's claim that a
    reformatted call "fails as a broken extraction rather than passing vacuously" is gone.
  - `[false]` `[reject]` (verification-gap layer, other) The read/write discriminator counts
    `process.env.X ??= 'v'` as a read. Refuted: `??=` and `||=` genuinely read the key before
    deciding whether to assign, so counting the site is correct rather than a misclassification.
  - `[low]` `[reject]` (verification-gap layer, other) The boot-order change, filed by that layer as
    explicitly not a gap — `carried`, same row as the ordering finding above.
  - `[low]` `[reject]` (intent-alignment layer) The I/O matrix's rows are boot outcomes while the
    tests assert against stub classes, so the acceptance surface moved. Real as a description, but
    the omitted stronger check is already covered: `tsc` fails when `storage` is dropped from the
    factory call, guard 35 covers `vector` and `pubsub`, and `index.test.ts` boots the real libSQL
    arm. Adding a boot-level assertion is new test surface for a path already enforced twice.
  - `[low]` `[reject]` (intent-alignment layer) The cross-concern boot order changed and nothing
    watches it — `carried`, same row as the ordering finding above.
  - `[low]` `[patch]` (intent-alignment layer) The "Legacy alias only" matrix row spans resolution
    and construction, and no test put the alias in front of a backend: `loadStorage` stubbed
    `APP_DATABASE_URL` to `undefined` on every case — confirmed. `loadStorage` now takes the alias
    and a new case asserts the Postgres pair rides it, both on the same connection string.
  - `[low]` `[reject]` (intent-alignment layer) The four guard-failure matrix rows are evidenced by a
    prose claim in the comment block rather than by anything that re-runs. Real, and the claim is
    accurate — every case in it was re-run by hand this pass. Rejected because the fix is a
    guard-testing mechanism this repository does not have, which is a story rather than a correction.
  - `[false]` `[reject]` (intent-alignment layer) `infrastructure.test.ts` says the trim asymmetry
    "is recorded as deferred work" while the ledger entry sits uncommitted. Refuted: the record
    exists in this spec's `deferred` frontmatter and in `deferred-work.md`; an uncommitted ledger
    mid-run is the orchestrator's bookkeeping, which this story is forbidden to write.
  - `[false]` `[reject]` (intent-alignment layer) The `## Module layout` table may be the "key table"
    the Never clause forbids. Refuted: AD-6's owner test is a `## Keys this subject owns` heading over
    a table whose first cell is a backticked KEY; every first cell here is a module filename, the
    README says outright that it carries no key table, and the owner-partition guards 25 and 30 pass
    untouched.

## Design Notes

**Why a fourth module, `database-url.ts`.** `storage` and `vector` both need the same connection
string, and AD-7 allows exactly one read of `DATABASE_URL`. Exporting it from `storage.ts` would
make `vector.ts` import the storage concern to get a string, so the key's read site would live inside
one of its two consumers. A module whose whole job is "resolve the connection string once, and refuse
to boot without one outside dev/test" keeps each concern module a pure construction site and puts the
`NODE_ENV` gate — which is about the database requirement, not about storage — where it belongs.
AD-8 fixes one module per *concern*; it does not forbid a shared parsed-value module, and the epic's
own words are "consumers receive the parsed value by argument or module export".

**Evaluation order changes, and that is inherent.** ES module imports are evaluated before any
statement in the importing module, so the `REDIS_URL` log, the `APP_DATABASE_URL` warning and the
`DATABASE_URL` throw now all happen before the entry's body — that is, before `selectAuth()` and
before the credential-encryption warning, which previously came first. Import order preserves the
order *among* the three concerns (pubsub, then storage, then vector, as today). Nothing observes the
cross-concern order: `index.test.ts` installs its `console.warn` spies inside tests, long after module
load, and the throw is fatal in both orderings. This is the only behavioural difference and is
recorded here rather than worked around, because the alternative — lazy getters — would move
construction out of the modules AD-8 puts it in.

**Tests for `src/mastra/config/`, after all.** The spine listed these as deferred
(`ARCHITECTURE-SPINE.md:383`) on the ground that `config/` held nothing but construction from env.
That reasoning does not survive this story's own I/O matrix: four of its rows — the Postgres pair,
the deprecated-alias warning, the production refusal to boot without a database, and the credential
redaction in the Redis log — are behaviour no gate command can observe and no existing test reaches,
because `index.test.ts` only ever boots the no-database, no-Redis arms. `database-url.test.ts` and
`infrastructure.test.ts` cover exactly those rows, the latter stubbing the four backend packages so
the options are readable and so the suite cannot dial a Redis that need not exist. Each assertion was
mutation-checked: reversing the key precedence, treating an unset `NODE_ENV` as development, dropping
`retention` from the libSQL arm and logging the raw `REDIS_URL` each turn the suite red. What the gate
still owns, because no test can see it, is that the entry no longer constructs any of the three
concerns and that each moved key is read once — guards 35 and 36.

**Why the one-read-site guard is scoped to four keys.** A repo-wide uniqueness check would fail
today: `MASTRACODE_PUBLIC_URL` is read three times (`:567`, `:568`, `:607`),
`SLACK_APP_SIGNING_SECRET` twice (`:551`, `:558`) and `GITHUB_APP_WEBHOOK_SECRET` twice (`:230`,
`:549`) — all inside the integrations concern Story 5.5 moves. The epic assigns the full re-audit to
Story 5.6 ("re-audits the one-read-site rule across the finished code plane"), so this guard covers
exactly the keys this story is responsible for, and says so in its comment.

## Verification

**Commands:**
- All 36 `[verify].commands` in order, including `npm ci`, `npm run check`, `npm test` and
  `npx varlock load --format json` — expected: every one exits 0.
- `sh -c` each of the three new entries from the repo root — expected: exit 0.
- Negative pass, each reverted immediately: bump `@mastra/factory` in `package.json`; paste
  `new PgVector(` back into the entry; add a second `process.env.REDIS_URL` under `src/`; delete a
  config module; replace the entry's `new Mastra(` with a re-export — expected: exactly the guard
  that owns each case exits 1 naming the offender, and the other two exit 0.
- Append-only check: compare the first 33 `commands` entries against
  `b321370641fba95e5f26ae1c2efdfe012857e6c5` — expected: byte-identical and in order.
- `git grep -n -E "process[.]env[.](DATABASE_URL|APP_DATABASE_URL|NODE_ENV|REDIS_URL)" -- src` —
  expected: exactly four lines, all under `src/mastra/config/`.
- `git grep -n -E "PgFactoryStorage|LibSQLFactoryStorage|PgVector|RedisStreamsPubSub" -- src/mastra/index.ts`
  — expected: no output.
- `git diff --stat b321370641fba95e5f26ae1c2efdfe012857e6c5` — expected: no change to `.env.schema`,
  `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `docker-compose.yml`,
  `apps/slack/manifest.yaml`, `ops/`, `sandbox/` or `.gitignore`.
- Boot smoke: `npm test` already imports the entry twice (`index.test.ts:103` and `:931`), so the
  libSQL branch and the full `prepare()`/`finalize()` boot are exercised by the gate itself; a green
  run is the evidence that the extracted modules still construct.

**Manual checks (if no CLI):**
- Read each new module against the block it replaced at `b321370`: same constructor, same options,
  same comment text, same message strings — a diff of moved lines only.
- Re-read each re-pinned citation against the new `src/mastra/index.ts`: the named line is the line
  the sentence describes.


## Auto Run Result

Status: done (follow-up review pass over the committed Story 5.4 change, `a13456a`)

**Implemented change.** The story itself was already implemented and committed. This pass re-reviewed
the whole diff against `b321370641fba95e5f26ae1c2efdfe012857e6c5` with four independent layers and
applied six patches, all of them to the three guards this story added and to the record and tests
around them. Nothing about the extraction itself changed: the four config modules construct the same
instances with the same options, the entry keeps its literal `new Mastra(...)`, and the four moved
keys are still read at exactly one site each.

**Files changed in this pass:**

- `.bmad-loop/policy.toml` — guard 35's factory-binding check rewritten to extract the call's
  top-level properties and require each binding as a bare token there; its one-read-site census
  widened to backtick-quoted brackets and optional chaining, and narrowed to skip comment-only lines;
  guard 36's `export { … mastra … }` arm also run over the file with newlines squeezed. Comment block
  updated to describe all three, including the two correct trees an earlier draft rejected.
- `src/mastra/config/database-url.ts` — dropped the unreachable trailing `|| undefined`.
- `src/mastra/config/infrastructure.test.ts` — `loadStorage` now takes `APP_DATABASE_URL`, and a new
  case pins that the deprecated alias reaches both Postgres backends on the same connection string.
- `src/mastra/config/README.md` — reconciliation procedure step 7 and a `## Reconciliation history`
  section, the history the guard-34 comment was already shaped around.
- `_bmad-output/implementation-artifacts/spec-...md` — this pass's triage log, three deferred items,
  and this section.

**Review findings breakdown.** 29 findings across four layers — high 0, medium 8, low 17, false 4,
maybe-false 0.

- *Patched* (13 rows, 8 grouped entries): the binding check's three defects (nested property passed,
  `vector: undefined` passed, one-line reformat failed a correct tree); the census's three (backtick
  brackets and optional chaining invisible, comment-only line red on a correct tree); guard 36's
  multi-line named re-export; the census scope note; the README's missing reconciliation-history
  step; the dead `|| undefined`; the untested legacy-alias-to-backend join.
- *Deferred* (4 rows, 3 entries): stale `index.ts:N` citations in `epics.md` and `deferred-work.md`
  (already stale at baseline; the intent forbids rewriting `_bmad-output/`); the `REDIS_URL`
  whitespace asymmetry missing from `ops/README.md`/`.env.schema` (documentation half of the
  already-deferred untrimmed-key defect); the entry's inaccurate "default storage resolution applies"
  comment (byte-identical at baseline).
- *Rejected* (12 rows): five carried from the previous pass with their verdicts intact — the boot-
  order/error-precedence change (four separate filings) and the unpinned import order and unguarded
  module-layout table. Four refuted outright: `loadPubsub`'s hermeticity (it stubs the only key
  `pubsub.ts` reads), `??=` counted as a read (it is one), the uncommitted ledger (the record exists;
  committing it is the orchestrator's step), and the `## Module layout` table as a forbidden key table
  (AD-6's test is a heading over backticked key names; every first cell here is a filename). Three
  rejected as new mechanisms rather than corrections: a citation-checking guard, a guard-testing
  harness, and a boot-level assertion for a path `tsc` and guard 35 already enforce.

**Follow-up review recommendation: false.** This is a follow-up pass, so the bar is a patched `high`;
none was found, and none of the 29 findings graded above `medium`. The medium patches were all
guard-precision fixes verified by mutation in both directions.

**Verification performed:**

- All 36 `[verify].commands` extracted from `policy.toml` and run in order from the repo root —
  every one exit 0, including `npm ci`, `npm run check`, `npx varlock load --format json` and
  `npm test`.
- `tsc --noEmit` clean; `vitest run --dir src` → 3 files, 76 tests passing (75 before, +1 for the
  legacy-alias case).
- Guard 35 negative pass, each mutation reverted immediately: `vector: undefined`, `storage,` nested
  in `platform`, a deleted `pubsub,` property, a bare side-effect import, and `new PgVector(` pasted
  back into the entry — all exit 1 naming the offender. Positive pass: the one-line reformatted
  factory call now exits 0.
- Census pass with a tracked probe file: all seven read spellings (dot, three bracket quote styles,
  both optional-chaining forms, destructuring) exit 1 naming the key and every site; a line comment
  and a JSDoc body naming a key exit 0.
- Guard 36: single-line, multi-line and aliased multi-line `export { mastra }` plus
  `export default mastra` all exit 1; an unrelated multi-line `export { helper as h }` exits 0.
- Append-only: the first 33 `commands` entries extracted from both `b321370` and the current tree and
  compared byte for byte — identical and in the same order; 33 → 36.
- `git grep -n -E "process[.]env[?]?[.](DATABASE_URL|APP_DATABASE_URL|NODE_ENV|REDIS_URL)" -- src` →
  four reads, all under `src/mastra/config/`, plus `index.test.ts:83`, which is an assignment.
- `git grep -E "PgFactoryStorage|LibSQLFactoryStorage|PgVector|RedisStreamsPubSub" -- src/mastra/index.ts`
  → no output.
- `git diff --stat b321370 --` over `.env.schema`, `.env.example`, `package.json`,
  `package-lock.json`, `tsconfig.json`, `docker-compose.yml`, `apps/slack/manifest.yaml`, `ops/`,
  `sandbox/`, `.gitignore` → empty.

**Residual risks.**

- The binding check is still a source-shape assertion. It now reads the call's top-level properties
  rather than any line in the block, so nesting and rebinding are caught, but it cannot see that the
  property's value is the binding the import introduced — a shadowing rebind above the call would
  pass. The boot-level check remains unavailable for the reason the comment block records: observing
  the slots needs `prepare()`/`finalize()` with a pubsub in place, and the only pubsub here dials
  Redis.
- The census's comment stripping is narrow on purpose. A key-naming comment that trails code on the
  same line is still scanned and will read as a read site; that is the deliberate trade against a
  `//` inside a string literal truncating a line and hiding a real one. The blind-spot paragraph
  names it.
- The three deferred items are unchanged behaviour, not new risk: the untrimmed `REDIS_URL`, the
  stale `_bmad-output/` citations and the entry's inaccurate storage comment are all pre-existing at
  `b321370` and all excluded from this story by the intent's own Never clause.
