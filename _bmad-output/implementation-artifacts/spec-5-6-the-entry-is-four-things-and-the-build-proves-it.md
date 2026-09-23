---
title: 'Story 5.6: The entry is four things, and the build proves it'
type: 'refactor'
created: '2026-09-24'
status: 'done'
baseline_revision: '8b1fd1c51609df543688b51fcd91b8af66be20a5'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The concern import order inside `src/mastra/config/factory.ts` carries the boot's evaluation
      order — which diagnostic an operator sees first when several things are wrong — and no test
      or guard reads it, so an organize-imports pass would change it silently.
    evidence: |-
      Hoisting `import { auth, secretEncryption } from './auth'` above `./pubsub` in
      `config/factory.ts` leaves 120/120 tests and all 42 gate commands green. Verified
      pre-existing: the identical import block sat in `src/mastra/index.ts` at baseline
      `8b1fd1c` with exactly the same absence of cover, and Story 5.5's review logged and
      rejected the same finding against the entry. `config/factory.ts:26-35`,
      `config/README.md:78-86` and five module docstrings all assert the coupling holds. The
      cheap close is a case in `config/factory.test.ts` that stubs `REDIS_URL` plus a Slack group
      that throws and asserts the ordered `console.log` / `console.warn` / throw sequence.
    location: >-
      src/mastra/config/factory.ts:36-43
    severity: low
  - summary: >-
      A `MASTRACODE_PUBLIC_URL` that is present but empty or whitespace-only becomes the
      deployment's public origin, because the value is exported raw and `@mastra/factory` reaches
      for its `http://localhost:4111` default with `??` rather than on falsiness.
    evidence: |-
      `src/mastra/config/public-url.ts:19` exports `process.env.MASTRACODE_PUBLIC_URL` untrimmed;
      `node_modules/@mastra/factory/dist/factory.js:180` uses `??`, so `''` is a configured
      origin and OAuth redirect URLs are built against it. Verified pre-existing and
      semantically identical at baseline `8b1fd1c`: `src/mastra/index.ts:78` was
      `publicUrl: process.env.MASTRACODE_PUBLIC_URL,` and `config/integrations.ts:92` read the
      same key raw. This story's Always clause required the collapse to be behaviour-preserving,
      and adding `?.trim() || undefined` is a deliberate behaviour change that
      `apps/slack/README.md:395`'s present-and-empty operator control would have to be
      re-reconciled against.
    location: >-
      src/mastra/config/public-url.ts:19
    severity: low
  - summary: >-
      The Slack integration's `uiOrigin` slot — the origin every account-link redirect is built
      against — is asserted nowhere under `src/`, so severing it from the one
      `MASTRACODE_PUBLIC_URL` read leaves the whole gate green.
    evidence: |-
      Changing `integrations.ts:103` to `uiOrigin: undefined` keeps `tsc` clean (the slot is
      `uiOrigin?: string`), 121/121 tests passing and all 42 gate commands at exit 0: guard 41
      counts read sites, guards 35/37 parse the factory call's property list, and
      `SlackIntegration.diagnostics()` returns only booleans, so no public member exposes the
      value. Verified pre-existing: `uiOrigin: publicUrl` sat at
      `config/integrations.ts:108` at baseline `8b1fd1c` with exactly the same absence of cover
      (`git grep uiOrigin 8b1fd1c -- src` returns that one line). The consequence if it is
      severed is that Slack redirects resolve against the API origin instead of the SPA origin.
      The cheap close is not cheap here: the house style in `integrations.test.ts` deliberately
      does not stub integration packages, so observing the value means either capturing the
      `SlackIntegration` constructor argument or driving its connect route.
    location: >-
      src/mastra/config/integrations.ts:103
    severity: medium
  - summary: >-
      Four test suites now carry their own hand-maintained environment-sweep prefix list, and a
      prefix added to one does not reach the others — a case can inherit an ambient value it never
      mentions.
    evidence: |-
      `src/mastra/index.test.ts:42,70`, `config/auth.test.ts:38,43`, `config/sandbox.test.ts:30,36`
      and now `config/factory.test.ts:77,78` each declare their own `*_ENV_PREFIXES` /
      `*_ENV_EXACT` pair; `factory.test.ts`'s comment asserts it is "the same list" as
      `../index.test.ts` and nothing enforces that. Verified pre-existing: three of the four
      suites carried their own copies at baseline `8b1fd1c`, so the new file follows the house
      pattern rather than introducing it. The fix — exporting one pair from a shared module and
      importing it in all four — is a test-infrastructure refactor across suites this story does
      not otherwise touch.
    location: >-
      src/mastra/config/factory.test.ts:77
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 5.5 left `src/mastra/index.ts` at 107 lines still holding one concern the epic
says must not be there: the assembly itself. `factoryConfigVersion` `:48`, the whole
`new MastraFactory({…})` call `:50-88`, and the three keys only that call reads —
`MASTRACODE_DISPATCH_MAX_IN_FLIGHT` `:59`, `MASTRACODE_PUBLIC_URL` `:78`,
`MASTRACODE_ALLOWED_ORIGINS` `:81` — are environment reading and instance construction in the file
FR34/AD-8 reduce to imports, `prepare()`, the literal `new Mastra(...)` and `finalize()`.
`MASTRACODE_PUBLIC_URL` is consequently read twice (`:78` and `config/integrations.ts:92`), the one
key AD-7/NFR8 still loses on, deliberately deferred to this story by guard 38's own message. And
nothing mechanical asserts the four-thing shape: guard 36 only asks that `new Mastra(` and
`export const mastra` be present, so any amount of extra construction could return to the entry
unnoticed.

**Approach:** Add `src/mastra/config/factory.ts` holding `factoryConfigVersion` and the literal
`new MastraFactory({…})` call with its three key reads, and `src/mastra/config/public-url.ts` for
the one read of `MASTRACODE_PUBLIC_URL` that both `integrations.ts` and the factory call need — the
same shared-value shape `database-url.ts` and `positive-int.ts` already set. Reduce the entry to
two imports and the three remaining statements. Re-point guards 35 and 37 at the file that now
holds the factory call, and append guards 40 (the entry is exactly four things) and 41 (whole-plane
census: no key declared in `.env.schema` is read twice under `src/`).

## Boundaries & Constraints

**Always:** Behaviour-preserving — the same `MastraFactory` options with the same values, the same
warning and error texts byte-identical, and the same relative evaluation order among concerns
(pubsub → storage → vector → auth → integrations; `sandbox` and the shared-value modules have no
load-time side effect) preserved by the import order inside `config/factory.ts`. The entry keeps
its literal `new Mastra(...)` and its `export const mastra` (AD-2/NFR1), and `npm run build` must
still succeed — `checkConfigExport` inspects the entry's source. The `new MastraFactory({…})` block
keeps its shape wherever it lives: top-level properties at two-space indent, `platform:` closed by a
two-space-indented `},`, the call closed by a column-0 `});` — guards 35 and 37 parse it. After the
change every key declared in `.env.schema` has AT MOST one literal `process.env` read across `src/`,
and `MASTRACODE_PUBLIC_URL`, `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and `MASTRACODE_ALLOWED_ORIGINS`
have exactly one, under `src/mastra/config/` (AD-7/NFR8). Relative imports stay extensionless. Every
claim this change falsifies is repaired in the same commit, so the gate is never red mid-story.
`[verify].commands` stays 41 entries in order: 36 of the 39 existing entries byte-identical, guards
35, 37 and 38 edited only where they name the file the factory call lives in, no assertion removed
or weakened, and guards 40–41 appended with a numbered paragraph each in the comment block.

**Never:** Do not change what any `MastraFactory` option evaluates to, do not add or remove an
environment key, and do not edit `.env.schema`/`.env.example` at all — no sentence in either names
the entry. Do not re-export `mastra`, construct it in a helper, or let any file under `src/` other
than the entry contain `new Mastra(` — guard 36 is unchanged and still owns that. Do not create a
barrel (`export * from` fails guard 36), do not add a root directory, do not widen `tsconfig.json`'s
`include`, and do not renumber a section in `docs/self-hosting-research.md`. Do not delete or
disable `@mastra/e2b`, `@mastra/platform-workspace`, `WORKOS_COOKIE_PASSWORD` or any ruled-out
package or fallback; do not touch the deferred items carried in `spec-5-5-*.md` (the raw
`SyntaxError` on a malformed previous-keys blob, the uncapped sandbox knobs, untrimmed
`SLACK_APP_BOT_TOKEN`, the unpinned `E2B_API_KEY` trim) — extraction is a move, not a cleanup. Do
not edit `package.json`, `package-lock.json`, `docker-compose.yml`, `apps/slack/manifest.yaml`, or
any of the twelve seeded operational artifacts. Do not repair `AGENTS.md`'s gate-description
sentences (DW-5/DW-29/DW-52) or the ~71 stale `src/mastra/index.ts:N` anchors under `_bmad-output/`
(DW filed) — only claims THIS change falsifies. Do not give any new file a `## Keys this … owns`
heading or key table — AD-6's owner set is exactly six READMEs. Do not rewrite anything under
`_bmad/`, `_bmad-output/`, `.claude/`, `.agents/`, or touch `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Settled state | tree after this story | all 41 `[verify].commands` exit 0, `npm run build` succeeds | No error expected |
| Deployer check | `npm run build` | `checkConfigExport` finds `mastra` built by the literal `new Mastra(` in the entry | build fails otherwise |
| Config version | any env | the factory receives `configVersion: 'mastracode-web-v1'` | No error expected |
| Dispatcher unset | `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` unset | `dispatcher.maxInFlight` is `undefined` (factory default) | No error expected |
| Dispatcher invalid | `MASTRACODE_DISPATCH_MAX_IN_FLIGHT='0'` / `'x'` / `'-3'` | `maxInFlight` is `undefined`, exactly as `positiveInt` returns today | No error expected |
| Origins unset | `MASTRACODE_ALLOWED_ORIGINS` unset | `allowedOrigins` is `[]` | No error expected |
| Origins listed | `' a.example , , b.example '` | `['a.example', 'b.example']` — split, trimmed, empties dropped | No error expected |
| Public URL one site | `MASTRACODE_PUBLIC_URL='https://u'` | the factory's `publicUrl` AND Slack's `uiOrigin`/`oidcRedirectBaseUrl` fallback both come from the single read in `config/public-url.ts` | No error expected |
| Public URL unset | `MASTRACODE_PUBLIC_URL` unset | `publicUrl` is `undefined`; Slack's `oidcRedirectBaseUrl` is `MASTRACODE_CHANNELS_PUBLIC_URL ?? undefined` — unchanged | No error expected |
| App slug passed | `GITHUB_APP_SLUG='s'` | the factory's `platform.githubAppSlug` is `'s'`, still nested, never top-level | No error expected |
| A statement creeps back | add `const x = 1;` at the entry's top level | guard 40 exits 1 | message names the offending statement |
| Env read creeps back | add `process.env.ANYTHING` to the entry | guard 40 exits 1 | message names the entry and AD-8 |
| Construction creeps back | add `new MastraFactory(` back to the entry | guard 40 exits 1 (and 35/37 report the split) | message names the constructor |
| A key regains a second read | add a second `process.env.MASTRACODE_PUBLIC_URL` under `src/` | guard 41 exits 1 | message names the key and every read site |
| Factory call moved again | delete `new MastraFactory({` from `config/factory.ts` | guards 35 and 37 exit 1 | message names the file they expect it in |

</intent-contract>

## Code Map

- `src/mastra/index.ts` (107 lines) — **the file to reduce to four things.** Module docstring
  `:1-26` (`:4-13` describes the entry as assembling factory config and self-flags the
  `MASTRACODE_PUBLIC_URL` exception this story settles; `:19-25` on `checkConfigExport` STAYS).
  **Moves out:** the import of `MastraFactory` `:29`, the concern-import block and its comment
  `:30-46`, `factoryConfigVersion` `:48`, and the whole `export const factory = new MastraFactory({`
  … `});` call `:50-88` — including `dispatcher` `:56-60` (reads
  `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` at `:59`), `platform: { githubAppSlug }` `:68-75`,
  `publicUrl:` `:76-78`, `allowedOrigins:` `:79-84` and `stateSecret` `:85-87`, with every comment
  intact. **Stays:** `import { Mastra } from '@mastra/core/mastra';` `:28`,
  `const preparedArgs = await factory.prepare();` `:90`, the comment `:92-96` and
  `export const mastra = new Mastra({…});` `:97-102`, the comment `:104-106` and
  `await factory.finalize();` `:107`. **Gains:** `import { factory } from './config/factory';`.
  Nothing imports `factory` or `factoryConfigVersion` from this file — `index.test.ts:107`/`:149`
  destructure only `{ mastra }` — so both exports simply move.
- `src/mastra/config/integrations.ts` — `:92` `const publicUrl = process.env.MASTRACODE_PUBLIC_URL;`
  becomes an import from `./public-url`. Comments that must be repaired because this story makes
  them false: `:6-9` ("Imported as finished values by `src/mastra/index.ts`. Import order in the
  entry…"), `:20-23` ("the factory call's own `publicUrl:` read stays in the entry until Story 5.6
  moves that call"), `:89-91` ("stays in `src/mastra/index.ts`; Story 5.6 … is where the key reaches
  a single site"). Consumers `:100-110` are untouched.
- **Module docstrings that name the entry as their importer** and are falsified because the importer
  is now `config/factory.ts`: `config/auth.ts:5` and `:94`, `config/pubsub.ts:4-6`,
  `config/storage.ts:4`, `config/vector.ts:10`, `config/sandbox.ts:5-6` and `:292`,
  `config/positive-int.ts:8-10` (the "a module here cannot take it from the entry — that is a cycle"
  rationale is now historical: `dispatcher.maxInFlight` lands in this same directory) and `:22`,
  `config/sandbox.test.ts:600-601`, `config/integrations.test.ts:26-28`, `:152-153`, `:193`.
- `src/mastra/config/README.md` (151 lines) — `## Module layout` `:45` with its table `:47-56`
  (8 rows; two to add), the `database-url.ts`/`positive-int.ts` shared-value rationale `:58-65`, the
  import-order paragraph `:67-78` (that order now lives in `factory.ts`, not the entry), `:54`'s "the
  third is the factory call in the entry, which Story 5.6 moves", `## Tests here` `:80` through
  `:124` (the closing paragraph `:120-124` summarises what the gate asserts instead of tests), and
  `## Reconciliation procedure` `:126-145` (step 3 `:131-133` and step 5 `:137-141` still name the
  entry correctly; step 6 `:143-144` already says to update the module layout), then
  `## Reconciliation history` `:147-151`. Guard 34 requires
  `create-factory`, exactly one `Fork commit` line with one resolvable 40-hex id, the literal
  `MUST be updated on every reconciliation`, and one `at fork:` / one `installed today:` semver each
  matching `package.json`'s exact pin (`0.15.0`) — reword around those, never through them.
- `.bmad-loop/policy.toml` (1281 lines) — `[verify]` `:28`, comment block `:29-1061`,
  `commands = [` `:1062`, 39 entries `:1063-1101` (guard N is line `1062+N`), `]` `:1102`. Entry
  form: one physical line, two-space indent, TOML literal `'''sh -c '…' '''` (note the space before
  the closing `'''`), trailing comma on every entry; no literal `'` inside — synthesize with
  `q=$(printf "\47")`, backtick `b=$(printf "\140")`. **Guards this story must edit, and only where
  they name a path:** **35** (`:1097`) and **37** (`:1099`) both do
  `b=$(sed -n "/new MastraFactory({/,/^});$/p" "$e")` with `e=src/mastra/index.ts` and then require
  the ENTRY to import each binding from `./config/<module>` — both hard-fail on an empty match the
  moment the call leaves the entry; give each a second variable for the file that holds the call,
  keep their `$e`-is-free-of-these-constructors halves on the entry, and change the import-path
  expectation from `./config/$m` to `./$m`. **38** (`:1100`) passes mechanically (its 33-key census
  excludes `MASTRACODE_PUBLIC_URL`) but its failure message asserts "the third is the factory call in
  src/mastra/index.ts … Story 5.6 moves that call" — message text only. **Guards to leave alone but
  satisfy:** **5** (`:1067`), **20** (`:1082`, root closed set), **21** (`:1083`, `include` frozen),
  **25**/**30** (`:1087`/`:1092`, the six owned-keys READMEs), **26** (`:1088`, every literal
  `process.env` read under `src/` is declared in `.env.schema`), **34** (`:1096`, provenance),
  **36** (`:1098`, entry indivisibility — `new MastraFactory(` does NOT match its
  `new Mastra[[:space:]]*[(]` scan, verified), **39** (`:1101`). Prose comments `:1013-1017` and
  `:1060-1061` forward-reference this story and go stale with it.
- **Citations to re-pin:** `AGENTS.md:35-36` ("now reduced to the `new MastraFactory({…})` call and
  the literal `new Mastra(...)`") and `:37-39`; `AGENTS.md:59-61` (the `checkConfigExport` rule)
  STAYS TRUE; `docs/self-hosting-research.md:15` (enumerates what `src/mastra/config/` holds);
  `apps/github/README.md:352` and `apps/linear/README.md:162` (both cite `src/mastra/index.ts:85`
  for `stateSecret`); `apps/linear/README.md:262` (cites `src/mastra/index.ts:76` for
  `publicUrl`). The three line anchors are ALREADY off by two at baseline (`:85` and `:76` are
  comment lines; the code is at `:87` and `:78`) — re-pin them at the new file and its real lines.
- **Verified STILL TRUE, do not touch:** every `MASTRACODE_PUBLIC_URL` /
  `MASTRACODE_ALLOWED_ORIGINS` / `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` mention in `README.md`,
  `.env.schema`, `.env.example`, `ops/README.md`, `apps/slack/README.md` (`:302`, `:394-395` cite
  `config/integrations.ts:107`, untouched) and `docs/self-hosting-research.md:601`, `:607` — all
  describe runtime behaviour, not where the code sits; `package.json:9,14` and `tsconfig.json:26`
  are directory-level; `config/README.md:3,14,16,17,31,130,132,137` are git-history or still-true.
- **Baseline census, measured** (guard-38 spellings, whole-comment lines blanked, assignments
  excluded, across every tracked `src/**.ts`): of the 70 keys declared in `.env.schema`, exactly one
  — `MASTRACODE_PUBLIC_URL` — has 2 read sites; 40 have exactly 1; the rest have 0 (read by packages
  or tooling, not first-party). `MASTRA_DB_PATH`'s single site is `src/mastra/index.test.ts:115`, a
  test, so a whole-plane guard must require at-most-one everywhere and under-`config/` only for the
  three keys this story moves.

## Tasks & Acceptance

**Execution:**

- `src/mastra/config/public-url.ts` — new. The single read of `MASTRACODE_PUBLIC_URL`, exported raw
  (no trim — the entry and `integrations.ts` both read it raw today and this move is
  behaviour-preserving), with a docstring saying why it is its own module. — its two consumers are
  in different concerns (`integrations.ts` and the factory call); exporting it from `integrations.ts`
  would make the assembly depend on the integrations concern for a value that is not theirs, which is
  exactly the argument `config/README.md:62-68` already records for `database-url.ts`.
- `src/mastra/config/factory.ts` — new. Move `factoryConfigVersion` and the entire
  `export const factory = new MastraFactory({…});` call verbatim, with every comment. Import the six
  concerns in the order `pubsub`, `storage`, `vector`, `auth`, `integrations`, `sandbox`, then
  `positive-int` and `public-url`, so the boot's log/warning/throw sequence is byte-for-byte what it
  is today. Replace `process.env.MASTRACODE_PUBLIC_URL` with the imported `publicUrl`; keep the
  `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and `MASTRACODE_ALLOWED_ORIGINS` reads inline, unchanged.
  Keep the call's shape: two-space top-level properties, nested `platform:` closed by `  },`, call
  closed by a column-0 `});`. — AD-8/FR34: the factory call is environment reading and instance
  construction, and the entry may hold neither.
- `src/mastra/index.ts` — reduce to `import { Mastra } …`, `import { factory } from './config/factory'`,
  the `prepare()` statement, the `new Mastra(…)` export and `finalize()`, rewriting the docstring to
  describe the four-thing shape and drop the `MASTRACODE_PUBLIC_URL` exception, keeping the
  `checkConfigExport` paragraph. Change nothing else. — FR34/AD-2: this file's source is what the
  deployer's Babel plugin reads.
- `src/mastra/config/factory.test.ts` — new coverage; nothing tests the factory call today. Mock
  `@mastra/factory` with `importOriginal` spread and a capturing `MastraFactory` class so
  `createFactorySecretEncryption` stays real for `auth.ts`, then assert the captured config: the
  `configVersion` literal, `publicUrl` from the single read, `allowedOrigins` for unset / listed /
  whitespace-and-empty-item inputs, `dispatcher.maxInFlight` for unset / valid / invalid, and
  `platform.githubAppSlug` nested rather than top-level. Follow the house style set by
  `config/infrastructure.test.ts`: the prefix sweep before the dynamic import, `vi.stubEnv` only,
  `vi.resetModules()` per case, `afterEach` with `vi.unstubAllEnvs()` + `vi.restoreAllMocks()`. —
  every one of these values is a slot a typo silently empties; `tsc` types them all as optional.
- `src/mastra/config/integrations.ts` — replace the `MASTRACODE_PUBLIC_URL` read at `:92` with an
  import of `publicUrl` from `./public-url`, and repair the three comment blocks (`:6-9`, `:20-23`,
  `:89-91`) that place the third read in the entry and name Story 5.6 as future work. Change no
  behaviour. — AD-7/NFR8: this is the key's second site, and the whole point of the story.
- `src/mastra/config/{auth,pubsub,storage,vector,sandbox,positive-int}.ts`,
  `src/mastra/config/{sandbox,integrations}.test.ts` — repair every docstring sentence naming
  `src/mastra/index.ts` as the importer, the place import order is fixed, or the consumer of
  `positiveInt`. Comments only; no code. — AD-5's harm is a reference that no longer resolves, and
  after this change the entry imports exactly one module.
- `src/mastra/index.test.ts` — keep the sweep, `ENTRY_ENV_PREFIXES`/`ENTRY_ENV_EXACT`, the boot
  assertion and the auth-wiring test as they are; reword only the preamble comments that describe
  what the entry itself reads. — the boot still reaches every swept key, now through
  `config/factory.ts`.
- `src/mastra/config/README.md` — add `factory.ts` and `public-url.ts` rows to `## Module layout`,
  correct `:54`'s claim about the third `MASTRACODE_PUBLIC_URL` read, extend the shared-value
  paragraph to cover `public-url.ts` and retire `positive-int.ts`'s now-historical cycle argument,
  move the import-order paragraph from "the entry" to `factory.ts`, name the new suite under
  `## Tests here`, and add guards 40–41 to the gate summary at `:121-124`. Leave the provenance
  block, both version lines and the `Fork commit` line untouched. — FR35 and guard 34's own message:
  the module layout is updated on the commit a concern moves.
- `AGENTS.md`, `docs/self-hosting-research.md:15`, `apps/github/README.md:352`,
  `apps/linear/README.md:162,262` — repair the claims this change falsifies and re-pin the three
  stale line anchors at `src/mastra/config/factory.ts` and its real lines. Change nothing else in
  these files; renumber no research-document section; leave every `Non-normative` marker in place. —
  AD-5.
- `.bmad-loop/policy.toml` — edit guards 35 and 37 to read the `new MastraFactory({…})` call and the
  per-binding imports out of `src/mastra/config/factory.ts` while keeping their entry-is-clean halves
  on the entry, and update guard 38's message clause naming where the third `MASTRACODE_PUBLIC_URL`
  read lives; then append (40) **the entry is four things**: with comments and blank lines removed,
  every top-level statement in `src/mastra/index.ts` is one of an `import`, one
  `const … = await factory.prepare();`, one `export const mastra … = new Mastra(` block, one
  `await factory.finalize();` — anything else fails naming it — plus zero `process.env` occurrences
  and no `new X(` other than `new Mastra(`, and the entry importing `factory` by name from
  `./config/factory`; and (41) **whole-plane census**: for every key declared in `.env.schema`, at
  most one literal read site across `src/` (guard 38's five spellings, whole-comment lines blanked,
  assignments excluded), and exactly one — under `src/mastra/config/` — for `MASTRACODE_PUBLIC_URL`,
  `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and `MASTRACODE_ALLOWED_ORIGINS`. Add a numbered paragraph for
  each in the comment block. — an audit that is not a gate command is a one-time observation;
  Stories 5.1–5.5 made the same conversion, and guard 41 is what makes AD-7 self-maintaining instead
  of a hand-written key list that goes stale when a key is added.

**Acceptance Criteria:**

- Given FR34/AD-8 reduce the entry to four things, when `src/mastra/index.ts` is read, then its only
  top-level statements are two imports, the `factory.prepare()` call, the
  `export const mastra = new Mastra({…})` literal and `factory.finalize()`; it contains no
  `process.env` and constructs nothing but that `Mastra`; and adding any other top-level statement,
  env read or constructor to it fails the gate naming the offender.
- Given the deployer's `checkConfigExport` inspects the entry's source (AD-2/NFR1), when
  `npm run build` runs, then it succeeds, `mastra` is still exported from the entry built by a
  literal `new Mastra(` there, and no other file under `src/` constructs or re-exports it.
- Given AD-7/NFR8 now spans the whole finished code plane, when the gate runs, then every key
  declared in `.env.schema` has at most one literal `process.env` read across `src/`,
  `MASTRACODE_PUBLIC_URL` has exactly one — in `src/mastra/config/public-url.ts`, feeding both the
  factory call and the Slack integration — and adding a second read of any declared key fails the
  gate naming the key and its sites.
- Given the change must be behaviour-preserving, when the settled tree is compared to
  `8b1fd1c51609df543688b51fcd91b8af66be20a5`, then every `MastraFactory` option evaluates to the
  same value, the concerns evaluate in their original relative order, every warning and error text is
  unchanged, and `git diff --stat` shows no change to `package.json`, `package-lock.json`,
  `tsconfig.json`, `docker-compose.yml`, `apps/slack/manifest.yaml`, `.env.schema` or `.env.example`.
- Given the factory call is the last concern to move, when `src/mastra/config/README.md` is read,
  then `## Module layout` lists `factory.ts` and `public-url.ts` alongside the eight existing
  modules, the import-order paragraph names the file that now fixes that order, the provenance block
  and both `@mastra/factory` version lines are unchanged, and guard 34 exits 0.
- Given a citation that no longer resolves is the harm AD-5 names, when the commit is read, then no
  first-party file claims the entry builds the factory, reads an environment key, or is where
  `stateSecret`/`publicUrl` are wired, and every re-pinned anchor names the line it claims in the new
  tree.
- Given `[verify].commands` may lose no coverage, when the diff is read, then the array holds 41
  entries in order, 36 of the pre-existing 39 are byte-identical, guards 35/37/38 differ only in
  which file they read the factory call from and in their message text, and all 41 exit 0.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 24 findings — high 0, medium 6, low 15, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` `config/README.md:110` still said `integrations.test.ts` is "the only one
    here that is not a relocation" while the paragraph this story added at `:125` says
    `factory.test.ts` is "the second". Confirmed — a direct self-contradiction four paragraphs
    apart. Now reads "the first of the two here that are not relocations"; the paragraph was
    refilled at the file's own width.
  - `[low]` `[patch]` `public-url.ts` was the one module named nowhere in `## Tests here`, while
    `:96` promises every module here is covered by a suite in this directory. Confirmed. The
    `factory.test.ts` paragraph's `publicUrl` case now says it is the only cover that module has.
  - `[low]` `[patch]` Reconciliation step 4 still routed upstream hunks to "the entry for a
    concern still in it" — impossible after this story, and guard 40 rejects it. Confirmed; the
    spec's Code Map had audited steps 3, 5 and 6 and skipped 4. Step 4 now sends every concern
    hunk, and the factory call, to this directory.
  - `[low]` `[patch]` The gate-summary rewrite dropped "each moved key is read exactly once across
    `src/`" and replaced it only with guard 41's at-most-one sentence, understating guards 35 and
    38 for the 37 keys they pin exactly. Confirmed. Both halves are now stated.
  - `[medium]` `[patch]` Guard 41 checked only `grep -q "^$c/"` for the three moved keys while its
    own failure message names a home per key. Reproduced: moving the `MASTRACODE_PUBLIC_URL` read
    into `config/storage.ts` behind a re-export left all 41 commands green. The arm now resolves
    the expected module per key and greps `^$hm:`. Re-verified: the same move now exits 1 naming
    `config/public-url.ts`.
  - `[medium]` `[patch]` Nothing asserted `config/public-url.ts` exists, so it could be deleted
    with its read inlined into one consumer and imported by the other. Grouped with the row above
    — same root cause, and the per-key home check closes it: the file must hold that read.
  - `[low]` `[defer]` The concern import order in `config/factory.ts` is called load-bearing by
    six artifacts and pinned by nothing. Confirmed by reordering. Recorded in `deferred`;
    pre-existing — the same block had the same absence of cover in the entry at baseline.
  - `[low]` `[patch]` `factory.test.ts`'s sweep comment claimed every variable the graph consults
    is covered by its prefixes or exact list, while `NODE_ENV` is consulted by `./database-url`
    and is in neither. Confirmed. The sentence now excepts it and names where it is stubbed.
  - `[false]` `[reject]` `expect(config.configVersion).toBe(factoryConfigVersion)` adds no
    coverage. Refuted: the line above pins the literal, this one pins that the EXPORTED constant
    and the value the slot actually received agree — a call site hardcoding the string while the
    export drifts fails this assertion and passes the other.
  - `[low]` `[reject]` `stateSecret` and seven other bindings are never read back from the
    captured config; only guard-source parsing covers them. Confirmed as described. Rejected:
    guard 37 requires each by name AND as a bare top-level token and was mutation-verified in both
    directions — the verification-gap layer independently re-confirmed that dropping `stateSecret`
    exits 1 — and the fix is new assertions for behaviour this story did not change. Story 5.5's
    review rejected the same claim on the same evidence.
  - `[low]` `[patch]` `positive-int.ts`'s opening sentence kept the mutual-import/cycle argument
    that the rest of the same paragraph retires — `./factory` imports `./sandbox` one-directionally,
    so there is no cycle. Confirmed. The opening now states the filing argument the paragraph
    actually makes.
  - `[false]` `[reject]` `apps/linear/README.md:262-265` left ragged by the re-pin. Refuted: that
    paragraph was already refilled before the review diff was taken and now runs 80/95/80 against
    its own neighbours at 73–95. The one short line at `:165` (80) is byte-identical at baseline
    `8b1fd1c`.
  - `[low]` `[reject]` Guard 40's named-import check is single-line, so a formatter that wraps the
    `factory` import across lines fails a correct entry. Confirmed as described. Rejected: the
    repo has no formatter, every import under `src/` is one line, and guards 35 and 37 carry the
    identical single-line assumption — the fix restructures the grep to match a convention nothing
    in this repo produces.
  - `[low]` `[patch]` Guard 40 fails on a legal trailing comment: `await factory.finalize(); // boot`
    exits 1 claiming the entry grew a statement. Reproduced. The three statement patterns now end
    `[[:space:]]*(//.*)?$`; comments are not stripped, so a `//` inside a string is untouched.
    Re-verified both ways: the trailing comment exits 0, `; const x = 1;` still exits 1.
  - `[medium]` `[patch]` Guard 40's env scan matched only `process[.]env`, so
    `process['env'].MASTRACODE_PUBLIC_URL` inside the `new Mastra({ … })` block exited 0 on guards
    40 and 41 both. Reproduced. Guard 40 — whose job is that one file reads no environment at all
    — now also matches `process` indexed by a quoted `env` in any of the three quote styles.
    Guard 41 was left alone deliberately: its spelling set is the documented one guards 26, 35 and
    38 share, and widening it in one place would leave four censuses disagreeing.
  - `[low]` `[defer]` A present-but-empty `MASTRACODE_PUBLIC_URL` becomes the public origin,
    because the export is raw and the factory defaults with `??`. Confirmed, and confirmed
    semantically identical at baseline. Recorded in `deferred`; trimming is a behaviour change the
    Always clause excludes.
  - `[low]` `[reject]` Guard 41's key-count floor of forty would let an extraction that yields
    40–69 of the 70 declared keys pass while silently skipping the rest. Confirmed as described.
    Rejected: the proposed fix — comparing against the schema's non-comment line count — is wrong
    for this file's shape (decorators and prose are non-comment lines), and any tighter numeric
    floor is brittle against a legitimately added or removed key.
  - `[low]` `[defer]` (verification-gap layer, pre-verified) The concern evaluation order moved
    into `config/factory.ts` and nothing verifies it. Same root cause and same demonstration as
    the import-order row above; grouped with it, and the layer's own filed disposition is defer
    for the same reason — the order was equally unverified at baseline.
  - `[medium]` `[patch]` (intent-alignment layer) The claim's surface is program structure and the
    only recurring proof added is regex-over-source-text; the build — the one surface that reads
    the entry through the real toolchain — received no artifact. Grouped with the row below.
  - `[medium]` `[patch]` (intent-alignment layer) `npm run build` is named by the story title, by
    FR36 and by AC2, and was the one acceptance criterion with no entry in `[verify].commands`:
    every story confirmed it by hand. Confirmed — the array held no build. `npm run build` is
    appended as entry 42 with its own numbered paragraph. While writing that paragraph the
    implementer tested and DISPROVED the obvious rationale: `checkConfigExport` is more permissive
    than guard 36, not less (a `new Mastra(` in a template literal builds, and so does
    `export { built as mastra }`). The paragraph records that negative result and gives the
    rationale that does hold — the build is the only command that bundles the entry and its whole
    `config/` graph through `@mastra/deployer`, resolving the one relative import this story's
    shape now concentrates everything behind. Demonstrated: misspelling `./config/factory` fails
    entry 42 with `Could not resolve "./config/factorry"` while `tsc`, `vitest` and guards 1–41
    are unaffected.
  - `[low]` `[reject]` (intent-alignment layer) The new tests exercise the moved code rather than
    the reduced entry; the property the title names is asserted only by guard 40. Confirmed as
    described. Rejected: guard 40 is the intended mechanism for a source-shape property no runtime
    test can observe, it was mutation-verified against six distinct regressions, and the build
    half of the complaint is closed by entry 42 above.
  - `[medium]` `[patch]` (intent-alignment layer) Guard 41 asserts a directory while AC3 names
    `config/public-url.ts`. Same finding and same fix as the per-key-home row above; grouped.
  - `[low]` `[reject]` (intent-alignment layer) Guard 40's coverage is lexical: a second statement
    appended to an allowed line, an indented top-level statement, or a construction spelled
    without `new Ident(`. The first third is refuted — the patterns are `$`-anchored and
    `const preparedArgs = await factory.prepare(); const x = 1;` exits 1, verified. The other two
    are real and rejected: nobody indents a module-scope statement, `Reflect.construct` in an
    entry is adversarial rather than everyday, and both fixes rework the column-0 filter that
    keeps the `new Mastra({ … })` literal legal.
  - `[false]` `[reject]` (intent-alignment layer) Roughly half the non-policy diff is prose
    re-pinning the intent never asked for. Refuted as a defect: AD-5 makes a citation that no
    longer resolves the harm, and this story's own acceptance criterion requires every anchor to
    name the line it claims — the mass is the obligation, not drift. The layer files it as
    descriptive.

### 2026-09-24 — Review pass (follow-up)
- verdicts: 34 findings — high 0, medium 4, low 25, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Guard 40 counts each of the three statements once but never compares their
    line numbers, so `await factory.finalize();` hoisted above the `new Mastra(...)` passes.
    Confirmed — that tree exits 0 on guards 36 and 40. Rejected: the reordered boot also passes
    `tsc`, all 121 tests and `npm run build` (the finalize half still completes), so no bad
    outcome was demonstrated; nothing reorders a module's statements the way tooling reorders
    imports; and the fix adds a fourth comparison arm to the guard. The guard's prose no longer
    implies an order check beyond the counts.
  - `[low]` `[reject]` Guard 40's named-import check is single-line, so a `factory` import wrapped
    across lines fails a correct entry — and with the wrong message. `carried` from the first
    pass, which rejected the same claim at the same location: no formatter exists here, every
    import under `src/` is one line, and guards 35 and 37 share the assumption. Re-measured after
    this pass's anchor patch: the wrapped form is accepted by the top-level filter and still fails
    on the `il` grep, i.e. unchanged behaviour.
  - `[low]` `[patch]` Guard 41's census cannot see `process["env"].KEY`, so a second read of a
    declared key outside the entry passes the whole-plane check. Reproduced: appending
    `process["env"].MASTRACODE_PUBLIC_URL` to `config/storage.ts` left guard 41 at exit 0 while
    the literal spelling exits 1. The first pass left this deliberately on the grounds that guard
    40 covers the spelling — but guard 40 only reads the entry. A fourth spelling was added to
    guard 41's per-key loop and named in its message. Re-verified both ways: the bracket read of
    `MASTRACODE_PUBLIC_URL` now exits 1 naming `config/public-url.ts`, and a bracket read of
    `LINEAR_CLIENT_SECRET` — a key with no hand-written list behind it — exits 1 too.
  - `[false]` `[reject]` Nothing pins that the entry has exactly one relative import, so the
    four-thing shape is re-openable one import at a time. Refuted: FR34's first admitted thing is
    "imports", plural — the entry holding a second import of a `config/` module is inside the
    shape, not outside it — and no row of the I/O matrix names an import count. Guard 40 permits
    imports by design.
  - `[low]` `[patch]` The entry-42 paragraph justified itself with "the `git status --porcelain`
    guards above stay green after it runs". Confirmed a non-sequitur: those are entries 6 and 24,
    both of which run BEFORE 42 and are path-scoped to `.agents/skills` and `skills-lock.json`,
    so neither could see anything the build writes. The paragraph now states the tree-cleanliness
    fact about the whole tree and separates it from those two entries.
  - `[low]` `[patch]` The same paragraph records neither what the build costs nor how it can fail
    without a source defect. Confirmed: it runs a second dependency install of its own inside
    `.mastra/output`, needs the registry, and `[verify]` has no per-command timeout. Grouped with
    the row above — same paragraph, same omission of what running it actually does. Both are now
    written down, including the per-worktree disk cost.
  - `[low]` `[patch]` The paragraph's demonstration named a misspelled `./config/factory` import as
    what guard 42 catches, but `npm run check` (entry 2) reports it first. Reproduced:
    `tsc` fails with `TS2307: Cannot find module './config/factorry'` at `src/mastra/index.ts(25,25)`,
    so the gate never reaches 42 on that tree. The example now says so and names what only the
    build sees — a graph `tsc` accepts and the bundler does not.
  - `[low]` `[patch]` `config/README.md` claimed "Each module exports the finished instance, value
    or slot … and `factory.ts` imports it", which is false for `database-url.ts` — `storage.ts`
    and `vector.ts` take that one directly. Confirmed against `factory.ts`'s import block. The
    sentence now names the exception.
  - `[low]` `[patch]` The README's gate-summary paragraph said "Two further guards close the shape
    this directory ends in" and never mentioned `npm run build`, the third thing this story added
    to the gate and the only check that puts this directory through `@mastra/deployer`. Confirmed
    (`grep -n "npm run build" src/mastra/config/README.md` returned nothing). Added.
  - `[low]` `[reject]` `AGENTS.md:51` still describes the gate as `npm ci`, `npm run check` "and
    two guards". Confirmed stale. Rejected as out of scope: the intent's Never clause names this
    exact repair — "Do not repair `AGENTS.md`'s gate-description sentences (DW-5/DW-29/DW-52)" —
    and the ledger already carries it.
  - `[low]` `[patch]` `docs/self-hosting-research.md:608` still told the reader to trust
    `src/mastra/index.ts` for key truth, while the near-identical note at `:15` was re-pointed by
    this change. Confirmed: after this story the entry reads no key at all. The row now names
    `.env.schema` and `config/` only. No section was renumbered.
  - `[low]` `[patch]` `infrastructure.test.ts`'s comment hedged to "almost every other read in
    this directory uses `?.trim()`" without naming an exception, while the new `public-url.ts` is
    itself a raw read in that directory. Confirmed. Measured every `process.env` read under
    `config/` before rewording — the enumeration first drafted was wrong (`auth.ts:54` and
    `database-url.ts:40` are raw too), so the comment now states the real distinction: pubsub's
    untrimmed read is the one that is an oversight rather than a decision.
  - `[low]` `[patch]` `factory.test.ts` and the README claimed the `publicUrl` case proves the one
    read reaches both consumers and that a drifted second read "would leave both halves
    typechecking". Confirmed overstated: `SlackIntegration.diagnostics()` returns booleans
    (`oidcConfigured` is `Boolean(clientId && clientSecret && oidcRedirectBaseUrl)`), so the case
    observes only that the fallback arm fired. Grouped with the intent layer's identical
    observation. Both places now say what the case can see and name guard 41 as what actually
    rules out drift.
  - `[low]` `[reject]` `stateSecret` and seven other bindings are never read back from the captured
    config; only guard-source parsing covers them. `carried` from the first pass, which rejected
    the same claim at the same location on mutation-verified guard 37.
  - `[low]` `[reject]` Guard 41's key-count floor of forty sits far below the seventy keys
    `.env.schema` declares. `carried` from the first pass, which rejected the same claim on the
    same location: the proposed schema-line-count comparison is wrong for this file's shape and a
    tighter numeric floor is brittle against a legitimately added or removed key.
  - `[low]` `[defer]` Four suites now carry duplicate hand-maintained env-sweep lists with a
    comment asserting sameness and nothing enforcing it. Confirmed. Recorded in `deferred`;
    pre-existing — three of the four carried their own copies at baseline `8b1fd1c`, so the new
    file follows the house pattern, and unifying them is a cross-suite refactor.
  - `[medium]` `[patch]` Guard 40's whitelist branches for `import …`, `} from …` and
    `export const mastra …` were not end-anchored, so a second top-level statement appended to one
    of them was read as part of it. Reproduced:
    `import { factory } from './config/factory'; let extraState = { calls: 0 }; extraState.calls++;`
    exited 0 on all 42 commands. The first pass refuted this class on the `prepare()` line alone,
    which was anchored. All three branches now end at end-of-line while still admitting a
    multi-line import's opening line and the `new Mastra({` that opens a literal. Re-verified: the
    appended statement exits 1, a statement appended after `});` exits 1, the multi-line import is
    still accepted by the filter, and the settled tree exits 0.
  - `[medium]` `[patch]` Guard 40's constructor scan could not cross type arguments, so
    `new PinoLogger<string>({ … })` inside the `new Mastra({ … })` block exited 0 while the
    non-generic form exits 1. Reproduced. Generic constructor calls are everyday TypeScript, not
    the `Reflect.construct` case the first pass rejected as adversarial. The scan now admits an
    optional `<…>` between the name and the parenthesis. Re-verified both ways.
  - `[low]` `[reject]` A trailing line comment that spells `process.env` or `new Foo(` makes guard
    40 exit 1 on a correct tree, claiming the entry reads the environment. Reproduced. Rejected:
    the entry's house style puts every comment on its own line, and the obvious fix is unsafe —
    stripping `//.*` before those two scans would blank the read in
    `someUrl: 'http://' + process.env.K` inside the `new Mastra({ … })` literal, turning a
    false alarm into a hole. A quote-aware strip is added complexity for an edit nobody makes.
  - `[low]` `[patch]` Guard 41's census misses `process["env"].KEY` and an aliased
    `const e = process.env; e.KEY`. Both reproduced. The bracket half is the row patched above.
    The alias half is rejected: the intent's Always clause and AC3 both scope the census to a
    "literal `process.env` read", and catching an alias needs a new assertion over assignment
    statements rather than another spelling.
  - `[low]` `[reject]` Entry 42 has no failure message of its own, so an offline gate run fails
    with a bare network error. Confirmed — it is the only entry after `npm ci` that needs the
    registry. Rejected: entry 1 already makes the whole gate network-dependent, and the fix wraps
    the one plain command in a shell that swallows and reorders npm's own output. The cost and the
    network dependency are now recorded in the comment instead.
  - `[low]` `[reject]` The spec says `[verify].commands` "stays 41 entries" while the array holds
    42. Confirmed: 42 now, 39 at baseline. Rejected — the only fix is to edit this build's spec,
    which triage excludes, and the substantive constraints were re-measured and all hold: 36
    entries byte-identical and in place, exactly three differing (35, 37, 38), 40–42 appended, no
    assertion removed. The first pass's triage log already records entry 42's addition and why.
  - `[low]` `[patch]` `config/factory.ts` and the README both said `./public-url` is imported
    after the concerns, in the one comment whose stated job is recording evaluation order.
    Confirmed: `integrations.ts:29` imports it, so it evaluates between `./auth` and `./sandbox`.
    Harmless today — it has no load-time side effect — and both places now say its position
    decides nothing and name where it is really reached.
  - `[medium]` `[defer]` (verification-gap layer, pre-verified) The Slack `uiOrigin` slot is
    asserted nowhere under `src/`; setting it to `undefined` keeps `tsc`, 121 tests and all 42
    commands green. Recorded in `deferred`. Pre-existing: `uiOrigin: publicUrl` sat unasserted at
    baseline `8b1fd1c` (`git grep uiOrigin 8b1fd1c -- src` returns that one line), and the house
    style here deliberately does not stub integration packages, so observing the value is not a
    small edit. The documentation that overstated its cover is patched in the row above.
  - `[medium]` `[patch]` (verification-gap layer, pre-verified) `public-url.ts` documents its raw,
    untrimmed export as load-bearing and nothing pinned it: adding `?.trim()` kept 120/120 tests
    and guard 41 green while flipping the public origin and unmounting the Slack OIDC routes. A
    whitespace-only case was added to `factory.test.ts`, modelled on
    `infrastructure.test.ts:199`'s precedent for `REDIS_URL`. Mutation-verified: with the trim
    applied that one case now fails and nothing else does.
  - `[low]` `[reject]` (verification-gap layer, Other findings) `expect(config.publicUrl).toBeUndefined()`
    also passes when the slot is absent from the captured config entirely. True as described, but
    no bad outcome follows: the layer verified that deleting `publicUrl,` from `factory.ts` fails
    the positive case at `:145`, so a dropped slot cannot ship. The fix is cosmetic.
  - `[low]` `[reject]` (intent-alignment layer) The gate ships 42 entries where the contract's
    arithmetic says 41; the build asserts at the bundler surface, runs last, and adds a network
    install. Grouped with the count row above and rejected for the same reason. The surface and
    cost observations are descriptive and were written into the entry-42 paragraph as part of the
    patches above.
  - `[low]` `[patch]` (intent-alignment layer) The matrix expects a `new MastraFactory(` pasted
    back into the entry to be reported by guards 35/37 as well as 40, and the policy comment
    asserted "both still fail on a constructor pasted back into the entry". Reproduced: with a
    whole `new MastraFactory({ … })` in the entry, 35 and 37 exit 0 and only 40 fails; 35 does
    fail on a pasted *concern* constructor. Guard 40 catching it once is the right split — 35 and
    37 exist to prove each concern reaches a slot of the one call — so the comment was corrected
    rather than the guards, and it now says which constructor each sees.
  - `[false]` `[reject]` (intent-alignment layer) Guard 41 pins a module per key where the
    contract says only "under `src/mastra/config/`". Refuted as a defect: AC3 names
    `config/public-url.ts` explicitly, and the per-key home was the first pass's own patch for a
    medium finding. Strictly stronger than asked is not a divergence to repair.
  - `[false]` `[reject]` (intent-alignment layer) Guard 40 pins statement multiplicity and the
    form of the entry's import, neither of which the matrix names. Refuted as a defect: both fall
    inside AC1's "the entry is exactly four things", and no bad outcome follows from a guard
    asserting more than a matrix row spells out.
  - `[low]` `[reject]` (intent-alignment layer) Guard 40's filter is column-0 lines, so an
    indented module-scope statement is invisible. `carried` from the first pass, which rejected
    the same claim at the same location: nobody indents a module-scope statement, and the fix
    reworks the column-0 filter that keeps the `new Mastra({ … })` literal legal.
  - `[false]` `[reject]` (intent-alignment layer) The entry's export surface shrank — it no longer
    exports `factory` or `factoryConfigVersion` — inside a change framed as behaviour-preserving.
    Refuted as a defect: the Code Map established and `git grep` re-confirms that nothing in the
    repo imports either binding from the entry, so the two exports moved rather than disappeared,
    which is what an extraction is.
  - `[low]` `[reject]` (intent-alignment layer) The new tests exercise values while the shape
    claim rests entirely on shell guards. `carried` from the first pass, which rejected the same
    claim: guard 40 is the intended mechanism for a source-shape property no runtime test can
    observe. Its `publicUrl`-origin half is the patched documentation row above.
  - `[false]` `[reject]` (intent-alignment layer) `_bmad-output/` is modified in the working tree,
    so "do not touch `sprint-status.yaml`" is unverifiable from the diff. Refuted as a defect: the
    reviewed diff deliberately excludes `_bmad-output/` so the spec reaches the edge-case layer
    alone, and those three files are the orchestrator's own bookkeeping — this run wrote only the
    spec.

## Design Notes

**Why `public-url.ts` and not an export from `integrations.ts`.** After this story the factory call
lives in `config/factory.ts`, which imports `config/integrations.ts` — so integrations cannot import
the value back without a cycle, and factory importing `publicUrl` from integrations would file a
value that belongs to neither concern under one of them. `config/README.md:62-68` already argues
exactly this for `database-url.ts` (storage and vector) and `positive-int.ts` (sandbox and the
dispatcher knob). A third shared-value module is the established answer, not a new pattern.

**Why the factory call is a module and not a fifth "concern".** AD-8 says one module per concern;
the `MastraFactory` call is the assembly of all of them. It still has to move, because FR34 admits
only four things in the entry and a `new MastraFactory({…})` is both environment reading and
instance construction. `config/factory.ts` is where it goes and the README's layout table says so.

**Why guards 35 and 37 are edited rather than superseded.** Both begin by extracting
`sed -n "/new MastraFactory({/,/^});$/p"` from `src/mastra/index.ts` and treat an empty result as a
hard failure, so the moment the call moves they fail for the right reason at the wrong file. Their
assertions — each concern's constructors live in its module, the entry names none of them, each
binding is imported BY NAME and passed as a bare top-level token — are all still exactly what must
hold; only the file holding the call changed. Re-pointing them preserves every assertion, and
`policy.toml:422-423` records the precedent: Story 5.3 edited guard 25's three literals when the
document they named was renamed, which is the same shape of edit. Appending replacements instead
would leave two guards that fail on a correct tree.

**Why guard 41 derives its keys from `.env.schema`.** Guards 35 and 38 carry hand-written lists of 4
and 33 keys — the keys their stories moved. The epic's criterion for this story is "a search for
each environment key used by the deployment returns exactly one read site", which is a statement
about the whole plane, and a fourth hand-written list would go stale the next time a key is added.
`.env.schema` is already the only list of keys (AD-6) and guard 26 already ties every first-party
read to it, so deriving from it closes the loop. It asserts at-most-one rather than exactly-one
because most declared keys are read by packages or tooling and never by first-party code, and
`MASTRA_DB_PATH`'s only site is a test; the exactly-one half is pinned per-key by guards 35, 38 and
41's own three-key arm.

**Testing the factory call.** The call must stay a literal object argument — guards 35 and 37 parse
its top-level properties — so the config cannot be extracted to a named export and asserted
directly. `vi.mock('@mastra/factory', importOriginal)` spreading the real module and swapping only
`MastraFactory` for a capturing class keeps `createFactorySecretEncryption` real for `auth.ts` while
making every slot readable. `vi.resetModules()` re-evaluates the whole graph including
`public-url.ts`, which is what lets a stubbed `MASTRACODE_PUBLIC_URL` reach both consumers in one
case.

## Verification

**Commands:**
- All 41 `[verify].commands` in order from the repo root, including `npm ci`, `npm run check`,
  `npm test` and `npx varlock load --format json` — expected: every one exits 0.
- `npm run build` — expected: exit 0, ending "Build successful". Confirmed working at baseline
  `8b1fd1c` before the change, so a failure after it is this story's. Afterwards confirm
  `git status --porcelain` is still empty (the build writes only into ignored paths).
- Negative pass, each reverted immediately: add `const x = 1;` to the entry's top level; add
  `process.env.MASTRACODE_PUBLIC_URL` to the entry; paste `new MastraFactory(` back into the entry;
  add a second `process.env.MASTRACODE_ALLOWED_ORIGINS` under `src/`; delete
  `new MastraFactory({` from `config/factory.ts`; hoist `githubAppSlug` to the call's top level —
  expected: exactly the guard that owns each case exits 1 naming the offender, and the others exit 0.
- Coverage-preservation check: extract the 39 `commands` entries from
  `8b1fd1c51609df543688b51fcd91b8af66be20a5` and from the current tree and diff — expected: 36
  byte-identical and in the same order, and the three that differ (35, 37, 38) differ only in the
  path they read the factory call from and in message text; 40 and 41 appended after them.
- `git grep -n -E "process[.]env" -- src` — expected: no hit in `src/mastra/index.ts`; every
  declared key at one site; `MASTRACODE_PUBLIC_URL` only in `src/mastra/config/public-url.ts`.
- `npx vitest run --dir src` — expected: 111 existing tests still pass, none deleted, plus the new
  `config/factory.test.ts` cases.
- Mutation pass on every new assertion, each reverted immediately: drop `configVersion`, swap
  `publicUrl` for `undefined`, replace `.filter(Boolean)` in `allowedOrigins`, move `githubAppSlug`
  to the top level — expected: each fails at least one new test that was green before.

**Manual checks (if no CLI):**
- Read `config/factory.ts` against `src/mastra/index.ts` at `8b1fd1c`: same options, same comments,
  same order, a diff of moved lines only.
- Re-read each re-pinned citation against the new tree: the named line is the line the sentence
  describes, and the named file is the file the reader must open.

## Auto Run Result

Status: done

**Human-dependency triage: none owed.** Story 5.6's acceptance criteria are entirely in-repo and
mechanically checkable — the entry's statement shape, `npm run check`, `npm run build`, the
whole-plane key census, and `src/mastra/config/README.md` reflecting the final module layout.
`epics.md:1136-1165` carries none of the "parks at awaiting-operator" clauses the epic gives
Stories 2.x/3.x/4.x, and nothing here needs a domain, a DNS record, an API key or a vendor console.
So the terminal status is `done`, not `awaiting-operator`. `sprint-status.yaml` was neither read as
authority nor written by this run.

**Implemented change.** The last thing in `src/mastra/index.ts` that was not one of its four things
— the assembly — moved out. `factoryConfigVersion` and the whole literal `new MastraFactory({…})`
call, with the three keys only that call reads, are now `src/mastra/config/factory.ts`; the entry
went from 107 lines to 44 and holds exactly two imports, `factory.prepare()`, the literal
`new Mastra(...)` and `factory.finalize()`, reading no environment key and constructing nothing
else. `MASTRACODE_PUBLIC_URL` — the one key AD-7 still lost on — now has a single read in
`src/mastra/config/public-url.ts`, taken from there by both the Slack integration and the factory
call. Every key declared in `.env.schema` is read at most once across `src/`.

**Files changed:**

- `src/mastra/config/factory.ts` — new. The assembly: the `configVersion` literal and the literal
  `new MastraFactory({…})` call moved verbatim, with the concern imports in the order that fixes
  the boot sequence. Single read site for `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and
  `MASTRACODE_ALLOWED_ORIGINS`.
- `src/mastra/config/public-url.ts` — new. The single read of `MASTRACODE_PUBLIC_URL`, raw; the
  third shared-value module, beside `database-url.ts` and `positive-int.ts`.
- `src/mastra/config/factory.test.ts` — new coverage; the factory call was never tested while it
  sat in the entry. Ten cases over `configVersion`, `publicUrl` (including a whitespace-only value
  passed through raw), `allowedOrigins`, `dispatcher.maxInFlight` and the nested
  `platform.githubAppSlug`, with a file-scoped `testTimeout` because whichever case runs first pays
  the graph's cold transform.
- `src/mastra/index.ts` — 107 → 44 lines.
- `src/mastra/config/integrations.ts` — its `MASTRACODE_PUBLIC_URL` read became an import; three
  comment blocks that placed the third read in the entry repaired.
- `src/mastra/config/{auth,pubsub,storage,vector,sandbox,positive-int}.ts`,
  `src/mastra/config/{sandbox,integrations,infrastructure}.test.ts`, `src/mastra/index.test.ts` —
  every docstring naming the entry as the importer, or as where import order is fixed, re-pointed
  at `./factory`.
- `.bmad-loop/policy.toml` — 39 → 42 entries. Guards 35 and 37 re-pointed at the file that now
  holds the factory call (every assertion intact); guard 38's message clause rewritten; guard 40
  (the entry is four things) and guard 41 (whole-plane census derived from `.env.schema`) appended,
  plus `npm run build` as entry 42.
- `src/mastra/config/README.md` — two new module-layout rows, the shared-value and import-order
  paragraphs moved to `factory.ts`, the new suite, the reconciliation procedure, and the gate
  summary extended to guards 40–42.
- `AGENTS.md`, `docs/self-hosting-research.md`, `apps/{github,linear,slack}/README.md` — every
  claim this change falsified repaired and every shifted line anchor re-pinned.

**Review findings breakdown — this follow-up pass.** 34 findings across four layers: high 0,
medium 4, low 25, false 5, maybe-false 0.

- *Patched* (13 entries; medium 3, low 10). The three medium ones all made a new guard weaker than
  it reads: guard 40's `import`, `} from` and `export const mastra` whitelist branches were not
  end-anchored, so `import { factory } from './config/factory'; let extraState = { calls: 0 };`
  passed all 42 commands; its constructor scan could not cross type arguments, so
  `new PinoLogger<string>(` passed where the non-generic form fails; and `public-url.ts`'s
  documented raw, untrimmed export was pinned by nothing, so adding `?.trim()` stayed green while
  flipping the public origin and unmounting the Slack OIDC routes. The ten low ones: guard 41's
  census gaining the `process["env"].KEY` spelling; the entry-42 paragraph's false
  `git status --porcelain` reasoning and its silence on the build's second install and disk cost;
  its misspelled-import example, which `tsc` catches first; the claim that guards 35/37 still catch
  a `new MastraFactory(` pasted back into the entry; the README's "`factory.ts` imports it" claim,
  false for `database-url.ts`; the README gate summary omitting `npm run build`; the
  `./public-url` evaluation-order claim in `factory.ts` and the README; the research doc's risk row
  still routing key truth through the entry; and `infrastructure.test.ts`'s unexplained "almost
  every other read" hedge.
- *Deferred* (2 entries, both verified pre-existing at `8b1fd1c`): the Slack `uiOrigin` slot is
  asserted nowhere under `src/` (medium), and four suites carry duplicate env-sweep lists (low).
- *Rejected* (19 rows). Five refuted outright: an import count is not outside FR34's "imports";
  guard 41 naming a module per key and guard 40 pinning multiplicity are stronger than the contract,
  not divergent from it; the entry's two moved exports have no importer anywhere; and the
  `_bmad-output/` working-tree changes are the orchestrator's, deliberately outside the reviewed
  diff. Four carried from the first pass unchanged (the single-line import grep, the unasserted
  bindings covered by guard 37, guard 41's key floor, indented module-scope statements, the
  guards-vs-tests surface split). The rest rejected as low: guard 40's missing statement-order
  check (the reordered boot passes `tsc`, 121 tests and the build, so no harm was shown); the
  trailing-comment false alarm (the obvious fix would hide
  `'http://' + process.env.K` inside the `new Mastra` literal); aliased env reads (outside the
  intent's "literal read"); entry 42's missing offline message (entry 1 already needs the
  registry); the 41-vs-42 count (the only fix edits this build's spec); and
  `toBeUndefined()`'s weakness (a dropped slot is caught by the positive case).

**Follow-up review recommendation: false.** This is a follow-up pass and it patched no `high`
entry — three `medium` and ten `low` — so by the convergence rule patch volume is not grounds for
another pass. Every patch was re-verified in both directions in this worktree and the whole gate
was re-run afterwards. Patched counts by verdict: medium 3, low 10.

**Verification performed:**

- All 42 `[verify].commands` parsed out of `policy.toml` with the repo's own `smol-toml` and run in
  order from the repo root after the patches — every one exit 0, including `npm ci`,
  `npm run check`, `npm test`, `npx varlock load --format json` and `npm run build`. Run twice more
  back to back after the last edit; both clean.
- **One gate flake found and fixed during this pass, outside the layers' findings.** The first
  `npm test` re-run after a full gate failed entry 7: `factory.test.ts`'s first case timed out at
  5157ms. Measured rather than guessed — whichever case runs first in that file pays the cold
  transform of the whole `./factory` graph plus `@mastra/factory`, 862ms warm, the slowest case in
  the repo and about 2.3× the next (`integrations.test.ts` at 386ms); every other case in the file
  is 1–2ms. Vitest's 5s default left too little headroom for that at entry 7, which the gate runs
  a few commands after `npm ci`. `vi.setConfig({ testTimeout: 30_000 })` now applies to the file
  rather than to whichever case is first today. Verified the ceiling is real: an 8-second sleep
  injected into that case passes, where the 5s default would have failed it. 121/121 pass in ~1.3s
  otherwise, and `tsc` is clean.
- `npx vitest run --dir src` → 8 files, 121 tests passing (111 before this story; 10 added, none
  deleted). `git status --porcelain` after the build shows only this story's own edits — no
  build residue.
- Patch mutation pass, each reverted immediately and the tree confirmed clean: a statement appended
  to the entry's import line and another appended after the `new Mastra({…})` literal's `});` →
  guard 40 exits 1 (both exited 0 before); `new PinoLogger<string>(` inside the literal → exits 1;
  a multi-line `factory` import → still accepted by the top-level filter, unchanged;
  `process["env"].MASTRACODE_PUBLIC_URL` and `process["env"].LINEAR_CLIENT_SECRET` added to
  `config/storage.ts` → guard 41 exits 1 naming the key and both sites (both exited 0 before);
  `?.trim()` added to `public-url.ts` → exactly the new whitespace-only case fails, 120 others
  pass.
- Claims re-measured rather than taken on trust: the two `git status --porcelain` entries are 6 and
  24 and both path-scoped; `tsc` reports `TS2307` on a misspelled `./config/factory`; `uiOrigin`
  appears once under `src/` at baseline and once now, unasserted in both;
  `integrations.ts:29` imports `./public-url`; every `process.env` read under `config/` was listed
  before rewording the trim comment.
- Coverage preservation re-checked after the patches: 39 entries at `8b1fd1c` and 42 now, with 36
  byte-identical and in the same position, exactly three differing (35, 37, 38) and 40–42
  appended. No assertion was removed or weakened; the three guard edits in this pass only add
  spellings, add anchors and correct message text.

**Residual risks.**

- Entry 42's cold-start and offline behaviour is still untested: it runs a second dependency
  install of its own and is the only entry after `npm ci` that needs the registry. It also runs
  last, after the root closed-set guard, so a future deployer version writing an artifact outside
  the gitignored `.mastra/` and `src/mastra/public/` would be staged by the orchestrator rather
  than caught. Both facts are now written into the policy comment.
- Guard 40 is regex over source text, not a parse. After this pass it end-anchors every allowed
  top-level line and sees generic constructors, but an indented module-scope statement and a
  construction spelled without `new Ident(` remain outside it, and a trailing line comment that
  spells `process.env` still trips it — each judged and recorded above rather than fixed.
- Guard 41 now carries four read spellings where guards 26, 35 and 38 carry the original set, so
  the four censuses no longer agree exactly. The widening is strictly additive and was verified not
  to fire on the `vi.stubEnv` calls and key-name arrays across the `config/*.test.ts` suites.
- Guards 35, 37 and 40 parse source shape with `sed` and `grep` and do not blank comments inside
  the ranges they extract, so a comment under `src/` that literally spells `new MastraFactory({` or
  `new Mastra(` can be read as code.
- The Slack `uiOrigin` gap and the empty-`MASTRACODE_PUBLIC_URL` behaviour are recorded as
  deferred; both are unchanged from `8b1fd1c`, and the second is now at least pinned by a test, so
  changing it is a visible edit.

