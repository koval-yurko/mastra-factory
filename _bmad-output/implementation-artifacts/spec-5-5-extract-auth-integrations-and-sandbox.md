---
title: 'Story 5.5: Extract auth, integrations and sandbox'
type: 'refactor'
created: '2026-09-24'
status: 'done'
baseline_revision: '4ba3bd43bc68cd3fb9ccc6c6016c2d4aefa48904'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      A malformed or whitespace-only `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` aborts the boot
      with a raw `SyntaxError` from `JSON.parse` that never names the key, instead of the shaped
      message the module carries for the wrong-type case.
    evidence: |-
      `src/mastra/config/auth.ts:55-56` reads the key into a local and parses it when truthy, so
      `'   '` or `'{oops'` reaches `JSON.parse` unguarded. Verified pre-existing and semantically
      identical at baseline `4ba3bd4` (`src/mastra/index.ts:88-90` was
      `process.env.X ? JSON.parse(process.env.X) : {}`), so this story only moved it — and the
      intent's Always clause required the move to be behaviour-preserving, with the double read
      collapsed and nothing else changed. The adjacent shape error
      (`must be a JSON object of key ids to base64 keys.`) is now pinned whole by
      `config/auth.test.ts`, so adding the `try`/`catch` would be a visible, deliberate edit
      against a test that already exists.
    location: >-
      src/mastra/config/auth.ts:55-56
    severity: medium
  - summary: >-
      A `FACTORY_SANDBOX_MEMORY_GIB` or `FACTORY_SANDBOX_CPUS` set to a very large safe integer
      passes `positiveInt` and is multiplied into a `memory`/`cpuQuota` outside any range Docker
      will accept, so every session container fails to create.
    evidence: |-
      `src/mastra/config/sandbox.ts:119-121` bounds the knobs only by `Number.isSafeInteger` and
      `> 0`, then multiplies by `1024 ** 3`. Verified pre-existing and byte-identical at baseline
      `4ba3bd4` (`src/mastra/index.ts:325-327`); `positive-int.test.ts` pins the parser's range
      behaviour unchanged. Capping the knobs is a behaviour change and a new ceiling constant,
      which `sandbox/README.md` would have to state — the story that adds the cap should own both.
    location: >-
      src/mastra/config/sandbox.ts:119-121
    severity: low
  - summary: >-
      `SLACK_APP_BOT_TOKEN` is the one Slack key read raw while `SLACK_APP_CLIENT_ID` and
      `SLACK_APP_CLIENT_SECRET` beside it are trimmed, and that asymmetry has no test.
    evidence: |-
      `src/mastra/config/integrations.ts:102` passes `process.env.SLACK_APP_BOT_TOKEN` straight
      through while `:103-104` use `?.trim()`. Verified pre-existing and byte-identical at
      baseline `4ba3bd4` (`src/mastra/index.ts:513-515`), so this story moved it without
      touching it. `SlackIntegration.diagnostics()` exposes `botTokenConfigured`, so the
      whitespace case is observable and a test is cheap — but the behaviour it would pin is
      unchanged behaviour, and the Always clause put untrimmed reads out of this story's reach.
    location: >-
      src/mastra/config/integrations.ts:102
    severity: low
  - summary: >-
      Two of the sandbox module's env reads are unpinned: `E2B_API_KEY`'s `.trim()` and
      `MASTRACODE_LOCAL_SANDBOX_ROOT`, which no test in `src/` stubs at all, leaving the
      `LocalSandbox` working-directory derivation entirely uncovered.
    evidence: |-
      `src/mastra/config/sandbox.ts:271` and `:280`. `E2B_API_KEY` is stubbed in eight places in
      `config/sandbox.test.ts` but never to a whitespace-only value, so dropping the `.trim()`
      leaves the suite green; `MASTRACODE_LOCAL_SANDBOX_ROOT` appears nowhere under `src/` outside
      the module. Verified pre-existing: `git show 4ba3bd4:src/mastra/index.test.ts` mentions
      `MASTRACODE_LOCAL_SANDBOX_ROOT` zero times, so the relocated blocks moved this gap intact
      rather than creating it. Every other trim in the module (image, provider, workdir) has a
      dedicated case; closing these two is new coverage for unchanged behaviour.
    location: >-
      src/mastra/config/sandbox.ts:271,280
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 5.4 moved the three upstream infrastructure concerns into `src/mastra/config/`, leaving
`src/mastra/index.ts` at 587 lines holding exactly the three concerns this project *modified* — the Better
Auth provider (Story 2.3, with `signUpEnabled: false` from Story 2.6), the GitHub/Linear/Slack integrations
(Epic 3), and the `DockerSandbox` branch and session cap (Stories 2.2/2.5). AD-8 requires the local deltas to
be extracted alongside upstream's, and four keys inside them are still read more than once:
`FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` at `:88` *and* `:89`, `GITHUB_APP_WEBHOOK_SECRET` at `:217`
*and* `:500`, `SLACK_APP_SIGNING_SECRET` at `:502` *and* `:509`, `MASTRACODE_PUBLIC_URL` at `:518`, `:519`
*and* `:558` — against AD-7's one-read-site rule.

**Approach:** Add `auth.ts`, `integrations.ts` and `sandbox.ts` to `src/mastra/config/`, each holding one
concern completely, plus `positive-int.ts` for the `positiveInt` parser that both the sandbox module and the
entry's dispatcher knob need (importing it from the entry would make the sandbox module depend on the file
that imports it). The entry keeps its literal `new Mastra(...)`, imports the finished values, and — for now —
keeps the `new MastraFactory({…})` call, `factoryConfigVersion`, `publicUrl`, `allowedOrigins` and
`dispatcher`, which are Story 5.6's reduction. Relocate the tests for every moved symbol into
`config/*.test.ts` beside their modules, and append three `[verify].commands` guards the way Stories 5.1–5.4
did.

## Boundaries & Constraints

**Always:** Behaviour-preserving — the same instances with the same options, the same warning and error texts
byte-identical, and the same relative evaluation order among concerns (pubsub → storage → vector → auth →
integrations; the sandbox module has no load-time side effect) via import order. `src/mastra/index.ts` keeps
its literal `new Mastra(...)` and its `export const mastra` (AD-2/NFR1), and the `new MastraFactory({…})`
block keeps its shape: top-level properties at two-space indent, closed by a column-0 `});` — guard 35 parses
it. `signUpEnabled: false` stays a literal in committed code with no environment key behind it (NFR13). In
`selectSandbox` the `FACTORY_SANDBOX_PROVIDER === 'docker'` branch stays ahead of the platform and E2B arms,
and the moved tests that pin that order move with it. Every key listed in the Code Map's census table is read
at exactly ONE `process.env` location across `src/` after the change, with consumers taking the parsed value
by argument or module export (AD-7/NFR8). All-or-nothing groups keep validating at construction and staying
`undefined` rather than throwing (NFR23). Relative imports stay extensionless (`./config/auth`). Every claim
this change falsifies is repaired in the same commit, so the gate is never red mid-story.
`[verify].commands` is append-only: the 36 existing entries stay byte-identical and in order, three are
appended (37–39), each with a numbered paragraph in the comment block.

**Never:** Do not move the `new MastraFactory({…})` call, `factoryConfigVersion`, `publicUrl`,
`allowedOrigins`, `dispatcher` or `preparedArgs` out of the entry — that is Story 5.6, and AD-8 forbids a
partial state for a concern that has not started. Do not collapse the entry's `publicUrl:` read of
`MASTRACODE_PUBLIC_URL` (`:558`) against the integrations module's read: that key ends this story at two
sites, which Story 5.6's whole-code-plane re-audit settles — say so in the guard's message rather than
widening this story. Do not delete or disable `@mastra/e2b`, `@mastra/platform-workspace`,
`WORKOS_COOKIE_PASSWORD` or any ruled-out package or fallback; extraction is a move, not a cleanup, so
untrimmed reads stay untrimmed and dead-looking branches stay. Do not add or remove an environment key, and
do not edit `.env.example`/`.env.schema` other than the one sentence in each that names
`src/mastra/index.ts` as where `signUpEnabled: false` lives. Do not edit `package.json`,
`package-lock.json`, `tsconfig.json`, `docker-compose.yml`, `apps/slack/manifest.yaml`, or any of the twelve
seeded operational artifacts except `sandbox/README.md`, `ops/README.md` and the three `apps/*/README.md`
where a citation must be re-pinned. Do not give any new file a `## Keys this … owns` heading or key table —
AD-6's owner set is exactly six READMEs. Do not add a root directory, do not widen `tsconfig.json`'s
`include`, do not create a barrel (`export * from` fails guard 36), and do not renumber a section in
`docs/self-hosting-research.md`. Do not rewrite anything under `_bmad/`, `_bmad-output/`, `.claude/`,
`.agents/`, or touch `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Settled state | tree after this story | all 39 `[verify].commands` exit 0 | No error expected |
| Auth disabled | `MASTRACODE_AUTH_DISABLED=1` | `auth === null`, and `secretEncryption` is `undefined` without reading an encryption key | No error expected |
| Platform deferral | `MASTRA_SHARED_API_URL` set, `BETTER_AUTH_SECRET` set | `auth === undefined`, warning text unchanged, emitted once | warns, does not throw |
| Self-managed sign-in | `BETTER_AUTH_SECRET=s` only | `MastraAuthBetterAuth` with `secret: 's'` and `signUpEnabled: false` | No error expected |
| Bad previous keys | `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS='[]'` | boot fails | throws `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of key ids to base64 keys.` |
| Partial GitHub group | four of the five `GITHUB_APP_*` set | `github === undefined`, nothing logged, boot continues | No error expected |
| Slack unconfigured | `SLACK_APP_SIGNING_SECRET` unset | `slack === undefined`, `integrations` omits it | No error expected |
| Signer fallback | only `SLACK_APP_SIGNING_SECRET` set | `stateSecret` is that value, from the module's single read of it | No error expected |
| Whitespace webhook secret | `GITHUB_APP_WEBHOOK_SECRET='   '` | `stateSecret` is that whitespace string (raw read wins the chain) while the GitHub integration's `webhookSecret` is `undefined` (trimmed) — both as today | No error expected |
| Docker wins | `FACTORY_SANDBOX_PROVIDER=docker` with the platform group also set | `DockerSandbox`, not `PlatformSandbox` | image unset → throws naming `FACTORY_SANDBOX_IMAGE` |
| Cap reached | `MASTRACODE_MAX_SANDBOXES=1`, one live session | new session refused, message unchanged | throws naming the key and the count |
| A concern creeps back | re-add `new SlackIntegration(` to the entry | guard 37 exits 1 | message names the constructor and the entry |
| A key regains a second read | add `process.env.BETTER_AUTH_SECRET` anywhere in `src/` | guard 38 exits 1 | message names the key and every read site |
| Sign-up reopened by env | replace the literal with `process.env.X === 'true'` | guard 39 exits 1 | message names NFR13 and `config/auth.ts` |
| Sandbox order reversed | move the docker branch below the platform arm | guard 39 exits 1 | message names Story 2.2's ordering guarantee |

</intent-contract>

## Code Map

- `src/mastra/index.ts` (587 lines) — **the file to shrink.** Module docstring `:1-21`; `:4-5` claims "the
  auth, integration and sandbox groups are read here", which this change falsifies. **Moves out:** imports
  `:23` (`homedir`), `:24` (`join`), `:26` (`LocalSandbox`), `:27` (`DockerSandbox`, `DockerSandboxOptions`),
  `:28` (`PlatformSandbox`, `createPlatformRepoTemplate`), `:29` (`E2BSandbox`, `createE2BRepoTemplate`),
  `:30` (`MastraAuthBetterAuth`), `:32-35` (the four integration imports), `:45` (`IMastraAuthProvider`),
  `:46` (`MastraSandbox`), `:47` (`FactorySandboxContext`), and `createFactorySecretEncryption` from the pair
  import at `:31` (`MastraFactory` stays). **Bodies that move:** `positiveInt` `:49-62`;
  `decodeCredentialEncryptionKey` `:64-75`; `credentialEncryption` `:77-107` (note the DOUBLE read of
  `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` at `:88-89`); `selectAuth` `:109-194` with its 86-line
  comment; `const auth` `:196` and `const secretEncryption` `:197`; the GitHub block `:199-222`; the Linear
  block `:224-235`; `LOCAL_SANDBOX_ENV_KEYS` `:237-256` (13 names) and `localSandboxEnv` `:258-266`; the
  docker constants and their comment `:268-296`; `dockerSandboxOptions` `:298-355`; `liveDockerSandboxes`
  `:357-374`; `admitDockerSession` `:376-423`; `selectSandbox` `:425-491`; `stateSecret` `:493-503`; the
  Slack block `:505-521`; `integrations` `:523`; `hasPlatformSandboxEnv` `:527-529` (the array-literal reads
  of the four Platform keys). **Stays:** `factoryConfigVersion` `:525`, the whole
  `new MastraFactory({…})` call `:530-568` (`auth`, `secretEncryption`, `integrations`, `stateSecret` and
  `platform.githubAppSlug` become imported bindings; `sandbox:` becomes the shorthand `sandbox,`),
  `await factory.prepare()` `:570`, the literal `new Mastra(...)` `:577-582`, `await factory.finalize()`
  `:587`.
- **Census — keys this story is responsible for**, with their current site(s) in `src/mastra/index.ts` and
  the module each lands in. Auth (`config/auth.ts`): `FACTORY_CREDENTIAL_ENCRYPTION_KEY` `:78`,
  `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` `:88` **and** `:89`, `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID`
  `:97`, `MASTRACODE_AUTH_DISABLED` `:150`, `BETTER_AUTH_SECRET` `:157`, `MASTRA_SHARED_API_URL` `:159`.
  Integrations (`config/integrations.ts`): `GITHUB_APP_ID` `:204`, `GITHUB_APP_PRIVATE_KEY` `:205`,
  `GITHUB_APP_CLIENT_ID` `:206`, `GITHUB_APP_CLIENT_SECRET` `:207`, `GITHUB_APP_SLUG` `:208`,
  `GITHUB_APP_WEBHOOK_SECRET` `:217` **and** `:500`, `MASTRACODE_GITHUB_AUTHORIZED_BOTS` `:220`,
  `LINEAR_CLIENT_ID` `:227`, `LINEAR_CLIENT_SECRET` `:228`, `WORKOS_COOKIE_PASSWORD` `:501` (untrimmed —
  keep it so), `SLACK_APP_SIGNING_SECRET` `:502` **and** `:509`, `SLACK_APP_BOT_TOKEN` `:513`,
  `SLACK_APP_CLIENT_ID` `:514`, `SLACK_APP_CLIENT_SECRET` `:515`, `MASTRACODE_CHANNELS_PUBLIC_URL` `:518`.
  Sandbox (`config/sandbox.ts`): `FACTORY_SANDBOX_IMAGE` `:317`, `FACTORY_SANDBOX_MEMORY_GIB` `:325`,
  `FACTORY_SANDBOX_CPUS` `:326`, `MASTRACODE_SANDBOX_WORKDIR` `:351`, `MASTRACODE_MAX_SANDBOXES` `:413`,
  `FACTORY_SANDBOX_PROVIDER` `:453`, `E2B_API_KEY` `:477`, `MASTRACODE_LOCAL_SANDBOX_ROOT` `:486`, and the
  four Platform keys read through array literals at `:528-529`. **Excluded on purpose:**
  `MASTRACODE_PUBLIC_URL` `:518`, `:519`, `:558` — the first two collapse into one read inside
  `integrations.ts`, the third is the factory call's and stays in the entry, so the key ends at two sites
  and Story 5.6's whole-plane re-audit settles it. `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` `:539` and
  `MASTRACODE_ALLOWED_ORIGINS` `:561` stay in the entry, already single reads.
- `src/mastra/index.test.ts` (945 lines) — preamble `:1-27`; static imports `:28-35` (the type-only
  `MastraSandbox` at `:35` is deliberate); `ENTRY_ENV_PREFIXES` `:41-50`; `ENTRY_ENV_EXACT` `:66`; the sweep
  `:68-72`; `NODE_ENV='test'` `:83`; `MASTRA_DB_PATH` `:87`; `afterAll` cleanup `:97-101`; the 8-symbol
  destructure of `await import('./index')` `:103-112`; deferred `@mastra/docker` `:115` and
  `@mastra/auth-better-auth` `:118`. **Blocks that move:** `positiveInt` `:169-214`;
  `decodeCredentialEncryptionKey` `:216-269`; `FORWARDED_KEYS`/`WITHHELD_KEYS` `:131-167` and
  `localSandboxEnv` `:271-309`; `dockerSandboxOptions` `:311-459`; `selectSandbox` `:461-552`; the cap block
  `:554-773`; `selectAuth` `:775-925`. **Stays:** the sweep machinery, the boot assertion `:120-129`
  (`MASTRA_DB_PATH` and `existsSync(dbPath)`), and the auth-wiring boot test `:926-944`
  (`vi.resetModules()`, `vi.stubEnv('BETTER_AUTH_SECRET')`, second `await import('./index')`, then
  `mastra.getServer()?.apiRoutes` for `/auth/api/*`) — that one is about the entry, not about `selectAuth`,
  and `BETTER_AUTH_SECRET` therefore stays required in `ENTRY_ENV_EXACT`.
- `src/mastra/config/` — existing house style for a config test, set by `database-url.test.ts` (139 lines)
  and `infrastructure.test.ts` (216 lines): a file-level comment arguing why no other check sees this
  behaviour; env only via `vi.stubEnv`, never assignment, so no key name appears as a literal
  `process.env` read (guard 38 counts those); a typed `load*(env)` helper that stubs every key the module
  reads — including to `undefined` — then `vi.resetModules()` and dynamic-imports the module; a top-level
  `afterEach` with `vi.unstubAllEnvs()` + `vi.restoreAllMocks()`; full operator-facing strings hoisted to
  consts and compared with `toBe`, load-time throws caught by hand rather than through `rejects.toThrow`.
  **Caveat for the moved blocks:** they rely on `index.test.ts`'s pre-import sweep, not on exhaustive
  stubbing, so each new test file needs the same prefix sweep in its preamble before its dynamic import, or
  an inherited `FACTORY_SANDBOX_MEMORY_GIB` silently configures a default-value case.
- `src/mastra/config/README.md` (110 lines) — `## Module layout` table `:45-57` (four rows), the
  `database-url.ts` rationale `:54-57`, the import-order paragraph `:59-62`, `## Tests here` `:67-83`, and
  the `## Reconciliation history` format line `:106-110`. Guard 34 requires `create-factory`, exactly one
  `Fork commit` line with one resolvable 40-hex id, the literal `MUST be updated on every reconciliation`,
  and one `at fork:` / one `installed today:` semver each matching `package.json`'s exact pin — reword
  around those, never through them.
- `.bmad-loop/policy.toml` (1165 lines) — `[verify]` `:28`, comment block `:29-948`, `commands = [` `:949`,
  36 entries `:950-985` (guard N is line `949+N`), `]` `:986`. Entry form: one physical line, two-space
  indent, TOML literal `'''sh -c '…' '''` (note the space before the closing `'''`), trailing comma on every
  entry including the last; no literal `'` inside — synthesize with `q=$(printf "\47")`, backtick
  `b=$(printf "\140")`, backslash `bs=$(printf "\134")`. Append-only is stated at `:44-45`, `:345-346`,
  `:422-423` and `:727-728`. **Guards to leave alone but satisfy:** **5** (`:954`, no `.ts` outside `src/`);
  **20** (`:969`, root closed set — counts untracked-but-unignored too); **21** (`:970`, `include` frozen);
  **25**/**30** (`:974`/`:979`, the six owned-keys READMEs, hard-coded — a seventh is invisible to them);
  **26** (`:975`, every literal `process.env` read under `src/` is declared in `.env.schema`); **29**
  (`:978`, credential-shape scan — note the `^[A-Za-z0-9+/]{60,}={0,2}$` arm, which any new 60-char
  base64-only line would trip); **31** (`:980`, sweeps new files for the old research-doc filename); **34**
  (`:983`, provenance); **35** (`:984`, which parses the factory call's top-level properties and requires
  `pubsub`/`storage`/`vector` as bare tokens there — reformatting or nesting that call fails it); **36**
  (`:985`, entry indivisibility, with an unconditional ban on `export * from` anywhere under `src/`). The
  comment block at `:869-874` and `:947-948` explicitly reserves the wider census for this story.
- **Citations that this change shifts or falsifies**, all currently ACCURATE and all to be re-pinned:
  `AGENTS.md:35` ("still holds auth, the integrations and the sandbox branch") and `:37-39`;
  `README.md:84`, `:88`, `:91` (the operator procedure for reopening sign-up — `:91`'s
  `git diff --exit-code src/mastra/index.ts` must name the file the operator actually edits);
  `ops/README.md:220`; `.env.schema:231` and `.env.example:201` (one sentence each, keys untouched);
  `sandbox/README.md:75`; `docs/self-hosting-research.md` `:15`, `:25`, `:43` (`:159-166`), `:44`
  (`:527-529`), `:111` (`:469-491`), `:113`, `:142`, `:171` (`:149-194`), `:199`, `:201`, `:224` (`:197`),
  `:524`, `:605`; `apps/github/README.md:157` (`:209-210`), `:350` (`:499-502`), `:352` (`:567`), `:454`
  (`:204-210`); `apps/linear/README.md:65` (`:231-234`), `:94` (`:34`), `:145` (`:229-230`), `:159`
  (`:499-503`), `:161` (`:567`), `:261` (`:558`), `:415` (`:227-230`); `apps/slack/README.md:172` and
  `:343` (`:509-511`), `:395` (`:518`); `.bmad-loop/policy.toml:438` (`:527-529`).
- **Already stale at baseline, and out of scope:** roughly 71 `src/mastra/index.ts:N` anchors under
  `_bmad-output/` (`epics.md:37,303,308,314`; `deferred-work.md` DW-3/6/11/13/25 and others; nine older
  story specs), two of which point past EOF. `deferred-work.md:539` already files exactly this. The Never
  clause forbids rewriting `_bmad-output/`; record them as deferred rather than repairing them.

## Tasks & Acceptance

**Execution:**

- `src/mastra/config/positive-int.ts` — new. Move `positiveInt` with its docstring, rewording the
  "Exported for `index.test.ts` only" line to name its real importers. — it is needed by `sandbox.ts` *and*
  by the entry's `dispatcher.maxInFlight`; importing it from the entry would make a config module depend on
  the file that imports it.
- `src/mastra/config/auth.ts` — new. Move `decodeCredentialEncryptionKey`, `credentialEncryption`,
  `selectAuth` with its full comment, and the two module-level statements, exporting `auth` and
  `secretEncryption`. Read `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` once into a local and use it for
  both the truthiness test and the `JSON.parse`. Keep `signUpEnabled: false` a literal with its comment
  intact. — AD-8: `secretEncryption` is not independently computable, its `auth === null` gate is an
  auth-policy consequence (`docs/self-hosting-research.md:224` describes it as a side effect of the auth
  chain), so leaving it in the entry would split the auth concern's decision logic across two files.
- `src/mastra/config/integrations.ts` — new. Move the GitHub, Linear and Slack blocks, `stateSecret` and the
  `integrations` array with their comments; export `integrations`, `stateSecret` and `githubAppSlug` (the
  entry's `platform: { githubAppSlug }` still needs it). Collapse the three double-read keys to one read
  each, and mind that the two halves of each pair do NOT agree on trimming: `GITHUB_APP_WEBHOOK_SECRET` is
  read trimmed at `:217` (`?.trim() || undefined`) and RAW at `:500`, `SLACK_APP_SIGNING_SECRET` raw at
  `:502` and trimmed at `:509`. So read each key once into a raw local and derive the trimmed value from it,
  never the reverse — a whitespace-only value is falsy after trimming but truthy in the `stateSecret` chain,
  and collapsing onto the trimmed read would silently change which secret signs `state`.
  `MASTRACODE_PUBLIC_URL`'s two integration reads are both raw and collapse into one local. — AD-7: three of
  these keys are read twice today, and both halves live inside the concern that is moving.
- `src/mastra/config/sandbox.ts` — new. Move `LOCAL_SANDBOX_ENV_KEYS`, `localSandboxEnv`, the docker
  constants, `dockerSandboxOptions`, `liveDockerSandboxes`, `admitDockerSession`, `selectSandbox` and
  `hasPlatformSandboxEnv`, keeping the `docker` branch first. Export the finished slot
  (`export const sandbox = (ctx: FactorySandboxContext): MastraSandbox => selectSandbox(ctx, hasPlatformSandboxEnv)`)
  alongside the symbols the tests need. — AD-8, and Story 2.2's ordering guarantee is what keeps agent work
  on this host while `@mastra/e2b` and `@mastra/platform-workspace` stay installed.
- `src/mastra/index.ts` — delete the moved imports and bodies; add the config imports after the existing
  three in the order `auth`, `integrations`, `sandbox` so the boot's warning/throw sequence is unchanged;
  replace the `sandbox:` arrow with the shorthand `sandbox,`; rewrite the docstring paragraph that says the
  auth, integration and sandbox groups are read here. Change nothing else — the factory call keeps its
  shape and the literal `new Mastra(...)` stays. — AD-2: the deployer's `checkConfigExport` inspects this
  file's source, and guard 35 parses the factory call's top-level properties.
- `src/mastra/config/auth.test.ts`, `src/mastra/config/integrations.test.ts`,
  `src/mastra/config/sandbox.test.ts`, `src/mastra/config/positive-int.test.ts` — new. Relocate the moved
  blocks from `index.test.ts` with their assertions byte-identical, adjusting only imports, the file-level
  preamble and the env-isolation preamble (each file needs the prefix sweep the blocks relied on, before its
  dynamic import). `integrations.test.ts` is new coverage, not a relocation — there is none today; pin the
  all-or-nothing groups, the `stateSecret` fallback chain and its untrimmed reads, and that a partial group
  leaves the integration `undefined` without throwing. — the epic requires a relocating helper's test to
  move in the same change, and NFR23's degrade-don't-block behaviour is asserted nowhere today.
- `src/mastra/index.test.ts` — drop the moved blocks and the 8-symbol destructure, keeping the preamble,
  `ENTRY_ENV_PREFIXES`/`ENTRY_ENV_EXACT` and the sweep exactly as they are (the boot still reaches every
  swept key through the config modules), the boot assertion, and the auth-wiring test — reworded so it reads
  as an entry test rather than a `selectAuth` test. Reword the preamble comments that call the moved helpers
  "the entry's", following the precedent already set at `:61-65` for the Story 5.4 keys. — the gate must
  stay green across the commit, never red on an import path.
- `AGENTS.md`, `README.md`, `ops/README.md`, `sandbox/README.md`, `.env.schema`, `.env.example`,
  `docs/self-hosting-research.md`, `apps/github/README.md`, `apps/linear/README.md`,
  `apps/slack/README.md`, `.bmad-loop/policy.toml:438` — re-pin every anchor the Code Map enumerates to the
  line it names after the edit, repointing the ones whose code moved at the new file, and repair the prose
  claims that place auth, `signUpEnabled: false`, the integrations or the sandbox branch in the entry.
  Change nothing else in these files, add or remove no key, renumber no research-document section, and leave
  every `Non-normative` marker in place. — a citation that no longer resolves is the harm AD-5 names, and
  `README.md:88`'s procedure would otherwise send an operator to the wrong file to reopen registration.
- `src/mastra/config/README.md` — extend `## Module layout` with the four new modules, update the
  import-order paragraph to the new sequence, and extend `## Tests here` to name the relocated suites and
  what each pins. Leave the provenance block, the two version lines and the `Fork commit` line untouched. —
  guard 34's own failure message says the module layout is updated when a concern moves, and this is the
  record AD-8 makes extraction payable with.
- `.bmad-loop/policy.toml` — append guards 37, 38 and 39 (36 → 39) with a new numbered group in the comment
  block, leaving the 36 existing entries byte-identical and in order. (37) **total extraction**: the entry
  carries no `MastraAuthBetterAuth`, `createFactorySecretEncryption`, `GithubIntegration`,
  `LinearIntegration`, `SlackIntegration`, `DockerSandbox`, `PlatformSandbox`, `E2BSandbox` or
  `LocalSandbox` mention; `auth.ts`, `integrations.ts` and `sandbox.ts` each exist non-empty under
  `src/mastra/config/` and construct what they own; and the entry imports each binding by name from
  `./config/<module>` and passes it as a bare top-level token of the `new MastraFactory({…})` call.
  (38) **one read site** for every key in the Code Map's census table, across all of `src/`, each inside
  `src/mastra/config/` — mirroring guard 35's census shape (dot, bracket with any of three quote styles,
  optional chaining, destructuring; whole-comment lines blanked; assignments excluded), with a message that
  names `MASTRACODE_PUBLIC_URL` as deliberately excluded and Story 5.6 as its owner. (39) **the two
  guarantees this move must not reverse**: `signUpEnabled: false` appears as a literal in
  `src/mastra/config/auth.ts` with no `process.env` on that line and no other `signUpEnabled` spelling
  anywhere under `src/`; and in `src/mastra/config/sandbox.ts` the `'docker'` comparison on
  `FACTORY_SANDBOX_PROVIDER` occurs at a lower line number than every `new PlatformSandbox(` and
  `new E2BSandbox(`. — an audit that is not a gate command is a one-time observation; Stories 5.1–5.4 made
  the same conversion.

**Acceptance Criteria:**

- Given AD-8 requires the local additions to be extracted alongside upstream's, when the entry is read, then
  the Better Auth provider, the credential encryption it gates, the three integrations with their signer
  secret, and the `DockerSandbox` branch with its session cap are each wholly absent from it and wholly
  present as one module under `src/mastra/config/`, and re-adding any of the nine moved constructors to the
  entry fails the gate naming it.
- Given Story 2.2's ordering guarantee is the only thing keeping sandboxes on this machine while
  `@mastra/e2b` and `@mastra/platform-workspace` remain installed, when the sandbox module is read and the
  suite runs, then the `docker` branch is evaluated ahead of the platform and E2B arms, a relocated test
  asserts a Docker sandbox is returned even with the platform group configured, and moving the branch below
  either arm fails the gate.
- Given `signUpEnabled` is `false` as of Story 2.6 and must never silently revert, when the auth module is
  read, then it is a literal `false` with no environment key behind it, no other spelling of `signUpEnabled`
  exists under `src/`, and replacing the literal with an environment expression fails the gate.
- Given AD-7 puts each key at exactly one read site, when the gate runs, then every key in the Code Map's
  census table has exactly one literal `process.env` read across `src/`, that read is under
  `src/mastra/config/`, every consumer takes the parsed value by argument or module export, and adding a
  second read of any of them fails the gate naming the key and the sites.
- Given unconfigured integrations must degrade rather than block boot (NFR23), when a group is partially
  configured, then the integration is left `undefined`, nothing is logged and nothing throws, and
  `integrations.test.ts` asserts that for each of the three groups.
- Given the entry must stay indivisible, when this story lands, then `src/mastra/index.ts` still contains the
  literal `new Mastra(...)` and exports `mastra`, `npm run check` is clean, `npm test` passes, and the
  `new MastraFactory({…})` call still parses as top-level properties closed by a column-0 `});` so guard 35
  is unaffected.
- Given the change must be behaviour-preserving, when the settled tree is compared to
  `4ba3bd43bc68cd3fb9ccc6c6016c2d4aefa48904`, then every warning and error text, every constructor option and
  every fallback chain is unchanged, the concerns evaluate in their original relative order, and
  `git diff --stat` shows no change to `package.json`, `package-lock.json`, `tsconfig.json`,
  `docker-compose.yml`, `apps/slack/manifest.yaml` or the key sets of `.env.schema`/`.env.example`.
- Given a citation that no longer resolves is the harm AD-5 names, when the commit is read, then every
  anchor the Code Map enumerates names the line it claims in the new tree, no first-party file asserts that
  the entry holds auth, the integrations or the sandbox branch, and `README.md`'s sign-up procedure names the
  file an operator must actually edit.
- Given `[verify].commands` is append-only, when the diff is read, then the 36 pre-existing entries are
  byte-identical and in the same order, guards 37–39 are appended after them, and all 39 exit 0.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 21 findings — high 0, medium 6, low 12, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 37 checked `githubAppSlug` only negatively — imported by name, and
    banned from the top level — so nothing asserted it was passed at all. Reproduced: deleting the
    whole `platform: { … githubAppSlug }` block from the entry left guard 37 exit 0 and `tsc`
    clean (no `noUnusedLocals`), which is the exact outcome the guard's own comment says it
    prevents. The arm now requires a `platform:` property, extracts that nested object in either
    its multi-line or one-line form, and requires `githubAppSlug` as a bare token among its
    properties. Re-verified: deleted block, `githubAppSlug: undefined`, and a top-level hoist all
    exit 1 naming the offender; the one-line `platform: { githubAppSlug },` form exits 0.
  - `[low]` `[patch]` `src/mastra/config/README.md:53` said `auth.ts` owns "the four
    `FACTORY_CREDENTIAL_ENCRYPTION_*` keys" — confirmed: `.env.schema` declares three and
    `auth.ts` reads three. Corrected to three. Grouped with the edge-case layer's identical row.
  - `[low]` `[patch]` The entry's module docstring kept "each key read at one site", which this
    story knowingly breaks for `MASTRACODE_PUBLIC_URL` — confirmed at `index.ts:76` and
    `config/integrations.ts:92`. Every other artifact names the exception; the file a reader opens
    first asserted the opposite. Reworded to state the exception and name Story 5.6.
  - `[low]` `[reject]` Nothing pins `MASTRACODE_PUBLIC_URL` at exactly two sites, so a third read
    added before Story 5.6 would pass. Real, and it is the deliberate exclusion the spec and guard
    38's message both record. Rejected: the fix special-cases one key with an expected count
    inside a census loop whose whole shape is "exactly one", and Story 5.6's re-audit — the very
    next story — is what settles the key.
  - `[medium]` `[patch]` The exported `sandbox` slot and `hasPlatformSandboxEnv` had zero
    coverage: the suite imported only `selectSandbox` and passed `platformSandboxConfigured`
    explicitly, so hard-coding it to `false` or swapping `.some`/`.every` left tsc, every test and
    every guard green — at the production call site of the epic's load-bearing guarantee, which
    extraction had just made testable for the first time. A new `describe('the exported sandbox
    slot')` block loads a fresh generation per case and pins the docker arm, the platform arm, the
    `.some` half of the credential pair and the `.every` half of the id pair. Mutation-verified in
    both directions.
  - `[medium]` `[patch]` The `MASTRACODE_PUBLIC_URL` collapse this story performed was unasserted:
    the only case setting either URL key checked `integrations.map(i => i.id)` and stopped.
    Grouped with the verification-gap layer's pre-verified row, same root cause. Two cases added
    through `SlackIntegration.diagnostics().oidcConfigured`. Re-verified here: dropping
    `?? publicUrl` from `integrations.ts:107` now fails exactly one test, where before it left all
    107 tests and all 39 guards green.
  - `[low]` `[defer]` `SLACK_APP_BOT_TOKEN` is read raw while its two siblings are trimmed, and
    the asymmetry is unpinned — confirmed, and confirmed byte-identical at baseline `4ba3bd4`.
    Recorded in `deferred`; the Always clause put untrimmed reads out of this story's reach.
  - `[low]` `[patch]` `integrations.test.ts`'s docstring claimed the module is "the only read site
    for all sixteen" while `MASTRACODE_PUBLIC_URL` is one of those sixteen and is deliberately
    read twice — confirmed. Now says fifteen of sixteen and names the exception.
  - `[low]` `[patch]` Twelve re-pinned citation lines ran 105–145 columns in paragraphs whose
    neighbours sit at 94–101 — confirmed; `sandbox/README.md:75-76` had been re-flowed correctly
    after the same kind of edit, which shows the intent. Every affected paragraph refilled at its
    file's own width (102 for `apps/*/README.md`, 110 for the research doc), no wording, anchor or
    section number changed. One further over-wide line at `apps/linear/README.md:94`, from the
    same cause and not on the list, was fixed with them.
  - `[low]` `[patch]` `auth.test.ts`'s file docstring and its `describe('selectAuth')` docstring
    restated the same two claims almost verbatim — confirmed. The describe block now says only
    what that suite adds.
  - `[low]` `[patch]` `index.test.ts`'s `DOCKER_HOST` comment justified the sweep with "a
    `DockerSandbox` constructed anywhere in this process", but every docker test moved to
    `config/sandbox.test.ts` — confirmed. The key stays swept; the comment now says why it still
    earns its place for a boot that builds no sandbox.
  - `[low]` `[patch]` `index.test.ts:36`'s vitest import lost the alphabetical order it had before
    the edit and that every sibling test file uses — confirmed. Restored.
  - `[low]` `[reject]` `auth.test.ts`'s top-level dynamic import emits an unsilenced
    plaintext-credentials warning on every run. Real, and confirmed in the vitest output.
    Rejected: the harm is one line of test-output noise, and the fix moves spy installation above
    a module-level `await import` with lifecycle consequences for `restoreAllMocks` — more than a
    direct correction, for a cosmetic outcome.
  - `[medium]` `[defer]` (edge-case layer) A whitespace-only or malformed
    `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` aborts the boot with a raw `SyntaxError` naming
    no key — confirmed, and confirmed semantically identical at baseline. Recorded in `deferred`;
    the behaviour-preserving Always clause excludes the fix.
  - `[low]` `[defer]` (edge-case layer) A very large safe-integer `FACTORY_SANDBOX_MEMORY_GIB` or
    `FACTORY_SANDBOX_CPUS` multiplies out of range — confirmed, and confirmed byte-identical at
    baseline. Recorded in `deferred`; capping needs a new ceiling constant and a `sandbox/README.md`
    sentence, which is a story rather than a correction.
  - `[low]` `[patch]` (edge-case layer) The `config/README.md` key miscount — same finding and
    same fix as the count row above.
  - `[medium]` `[patch]` (edge-case layer) `.env.schema` and `.env.example` still said "the entry
    builds the integration from a ternary over both values" above `LINEAR_CLIENT_ID` — confirmed
    false; the ternary is now `config/integrations.ts:67-68`. The spec's Never clause had admitted
    only the `signUpEnabled` sentence in those two files, and that line was drawn by the spec
    rather than by the intent, so the finding was kept and patched rather than deferred: one
    sentence in each now names the real file. Key sets verified byte-identical to baseline.
  - `[medium]` `[patch]` (verification-gap layer, pre-verified) The Slack `oidcRedirectBaseUrl`
    fallback left unpinned by the public-URL collapse — same finding and same fix as the
    `MASTRACODE_PUBLIC_URL` row above; the layer's own demonstration matched ours.
  - `[false]` `[reject]` (intent-alignment layer) Zero of the diff's tests and zero of the 39 gate
    commands assert anything the intent asks for, so the intent's surface and the change's surface
    do not overlap. Refuted as a defect: the intent's clauses are run-protocol constraints on this
    workflow — do not write `sprint-status.yaml`, do not use `blocked`, use `awaiting-operator`
    only for human-only ACs — and they are satisfied by what the run does, not by assertions code
    could carry. The layer files it as descriptive, and `sprint-status.yaml` appears in no hunk.
  - `[false]` `[reject]` (intent-alignment layer) The intent's status expectation is only
    partially observable because the diff showed `status: 'in-progress'`. Refuted: the clause
    governs the FINAL frontmatter, and the diff the layer read was a mid-run snapshot. The
    finalized value is `done`.
  - `[false]` `[reject]` (intent-alignment layer) No recorded deliberation on the human-action
    conditional, so Reading A is inferable only from absence. Refuted as a defect: the
    `awaiting-operator` branch fires only when the ACs contain a human-only action, and Story
    5.5's nine acceptance criteria are entirely in-repo and gate-checkable — `epics.md:1106-1134`
    carries none of the "parks at awaiting-operator" clauses the epic gives Stories 2.x/3.x/4.x. A
    negative triage has no frontmatter to record. The triage is now stated explicitly under
    `## Auto Run Result`, which is where the intent asks for the status.

### 2026-09-24 — Review pass (follow-up)
- verdicts: 29 findings — high 0, medium 4, low 13, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` The diff regresses the spec's status: `spec-5-5-*.md` shows
    `status: 'in-review'` while `sprint-status.yaml` shows `done`. Refuted: `in-review` is what
    THIS review step writes into the spec before staging its own diff, so the layer read a mid-run
    snapshot of a file the run finalizes to `done` at the end. `sprint-status.yaml` is the
    orchestrator's board, which this run is forbidden to write or revert.
  - `[false]` `[reject]` `## Auto Run Result` is missing although the triage log cites it.
    Refuted: the section was present at HEAD (`e801f80`) and was stripped from the working tree by
    the orchestrator before it re-dispatched this spec for a follow-up pass. This step's Finalize
    writes it fresh, which it now has.
  - `[false]` `[reject]` The prior triage row's closing claim "`sprint-status.yaml` appears in no
    hunk" is falsified by this diff, which touches it. Refuted as a defect: the hunk is the
    orchestrator's own bookkeeping write, made between the two passes and outside this run's
    authority — the invocation states the board is orchestrator-owned and must never be written or
    reverted here. Nothing in the change under review touched it.
  - `[low]` `[reject]` `deferred-work.md`'s DW-71 and DW-72 headings are truncated mid-sentence
    ("…instead of the shaped message the"). Confirmed. Rejected: the ledger is orchestrator-owned
    and this run is explicitly forbidden to modify its entries; the complete sentences are intact
    in this spec's `deferred:` frontmatter, which is where those titles were copied from.
  - `[low]` `[reject]` `## Spec Change Log` is empty although the prior pass knowingly patched past
    the Never clause's `.env.schema`/`.env.example` limit. Confirmed as an observation. Rejected on
    the standing rule that a finding whose fix is to edit this build's spec is not actionable; the
    prior triage row already records the deliberation and why the line was treated as spec-drawn
    rather than intent-drawn.
  - `[medium]` `[patch]` Only half of the `MASTRACODE_PUBLIC_URL` collapse was pinned. The prior
    pass pinned the `?? publicUrl` fallback arm; nothing observed which local fed which field.
    Reproduced: swapping `oidcRedirectBaseUrl` and `uiOrigin` — the exact slip a two-reads-into-one
    -local refactor invites, and invisible to `tsc` since both are `string | undefined` — left
    111/111 tests and all 39 guards green. Added a case pinning the channels-only arm through
    `diagnostics().oidcConfigured`. Re-verified: the swap now fails 2 tests.
  - `[medium]` `[patch]` The plaintext-credentials warning was never asserted to FIRE. All five
    `warn` assertions in `config/auth.test.ts` were `.not.toHaveBeenCalled()`, and the new
    `secretEncryption` block's comment leans on "with auth enabled and no key set this import
    warns" as an unasserted premise. Reproduced: deleting the whole `console.warn` block from
    `credentialEncryption()` left 111/111 green, so a deployment could silently persist
    model-provider keys and integration secrets as plaintext with the notice removed and the suite
    still passing. Added the positive baseline case; re-verified the deletion now fails 1 test.
  - `[low]` `[reject]` The Always clause's import-order guarantee has no witness — no test and none
    of guards 35/37/38/39 reads the order of the entry's import statements, so an organize-imports
    pass would reorder the boot sequence undetected. Confirmed. Rejected: the entire observable
    consequence is which boot diagnostic prints first when several are wrong — every failure still
    fails and every warning still warns — and the fix is a new source-shape assertion rather than a
    direct correction. `index.ts:30-37` and `config/README.md:66-75` both document the coupling.
  - `[low]` `[defer]` `E2B_API_KEY`'s `.trim()` and `MASTRACODE_LOCAL_SANDBOX_ROOT` are unpinned,
    the latter stubbed nowhere in `src/`. Confirmed, and confirmed pre-existing: baseline
    `index.test.ts` mentions the key zero times, so the relocated blocks carried the gap intact.
    Recorded in `deferred`.
  - `[low]` `[patch]` `MASTRACODE_CHANNELS_PUBLIC_URL` present-and-empty was documented but
    untested: `apps/slack/README.md:395` turns the `??`-vs-`||` distinction into an operator
    troubleshooting rule, and the suite only ever stubbed the key to a URL or to `undefined`.
    Grouped with the public-URL row above — same root cause, the Slack URL fields being observed
    only as a truthiness bit. Added the empty-value case; re-verified that changing `??` to `||`
    now fails 1 test.
  - `[low]` `[reject]` `previousKeys` is annotated `Record<string, unknown>` while the next line
    tests `!previousKeys`, `Array.isArray` and `typeof !== 'object'` — branches the declared type
    says are unreachable. Confirmed, and confirmed byte-identical at baseline `4ba3bd4`
    (`index.ts:89-91`). Rejected: typing the parse `unknown` and narrowing afterwards is a retype
    plus downstream narrowing, not a direct correction, and the behaviour-preserving Always clause
    puts it out of this story's reach.
  - `[false]` `[reject]` `config/README.md:76` says the file "deliberately carries no key table"
    while the new module-layout rows enumerate key families. Refuted: a module-layout table whose
    cells name key FAMILIES in prose is not a key table, and the sentence's subject —
    `.env.schema` as the only list of environment keys — remains true. The four pre-existing rows
    describe their keys the same way.
  - `[low]` `[patch]` `index.ts:36-37` claimed `./config/sandbox` "is last for readability" while
    `./config/positive-int` is actually imported last (`:44`), and `config/README.md:67` listed the
    import order as six modules omitting `positive-int` entirely. Confirmed both. Reworded to say
    sandbox is last of the concerns and that the shared parser follows them; the README paragraph
    was refilled at its own width (77–101, matching its 95–101 neighbours).
  - `[low]` `[reject]` Only `auth` of the six bindings has a runtime wiring test; the other five
    rest on guard 37's source parse. Grouped with the intent layer's identical observation.
    Confirmed as described. Rejected: guard 37 was mutation-verified in both directions last pass
    against exactly these deletions — including the nested `platform: { githubAppSlug }` case — and
    the verification-gap layer, which had the same evidence, explicitly declined to file it.
  - `[low]` `[patch]` `README.md`'s sign-up procedure named only `npm test` as going red while the
    field says `true`, but guard 39 — added by this story — fails on the same edit. Confirmed. The
    sentence now names the verify gate alongside the test.
  - `[medium]` `[defer]` (edge-case layer) `carried` — a whitespace-only or malformed
    `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` aborts the boot with a raw `SyntaxError` naming
    no key. Same location (`config/auth.ts:55-56`) and same claim as the row logged last pass, and
    the code still reads as that row describes. Prior verdict and route kept; already in
    `deferred`, not re-added.
  - `[false]` `[reject]` (edge-case layer) A previous-key id equal to the primary id leaves it
    undefined which key decrypts a credential. Refuted:
    `@mastra/factory/dist/secret-encryption.js:30` throws
    `[FactorySecretEncryption] Duplicate key id "<id>"` when an id repeats, so the collision fails
    loudly at construction rather than resolving ambiguously. An empty-string id is a distinct id
    and produces no ambiguity either.
  - `[low]` `[defer]` (edge-case layer) `carried` — a very large safe-integer
    `FACTORY_SANDBOX_MEMORY_GIB` or `FACTORY_SANDBOX_CPUS` multiplies out of Docker's range. Same
    location (`config/sandbox.ts:119-121`) and same claim as last pass, code unchanged. Prior
    verdict and route kept; already in `deferred`.
  - `[low]` `[defer]` (edge-case layer) `carried` — `SLACK_APP_BOT_TOKEN` is read raw while its two
    siblings are trimmed. Same location (`config/integrations.ts:102`) and same claim as last pass,
    code unchanged. Prior verdict and route kept; already in `deferred`. (This pass did add the
    missing assertion that the token reaches the integration at all — a separate gap from the
    untrimmed read, and the patch does not change the read.)
  - `[false]` `[reject]` (edge-case layer) `MASTRACODE_CHANNELS_PUBLIC_URL` present-and-empty keeps
    the empty value through `??` and silently unmounts the account-link routes. Refuted as a
    defect: that is documented, deliberate behaviour — `apps/slack/README.md:395` states the key
    "disables them only when it is present and empty" and contrasts it with merely unset — and the
    expression is byte-identical at baseline. The proposed `?.trim() ||` fix would delete the
    operator control. The missing TEST for it was filed separately and patched.
  - `[medium]` `[patch]` (verification-gap layer, pre-verified) Slack's two public-URL destinations
    are unverified, so the collapsed `publicUrl` local can feed the wrong field. Same finding, same
    root cause and same demonstration as the public-URL row above; grouped with it and patched by
    the same cases, plus the layer's `botToken` note, which became its own case after the existing
    "however few of them are set" case turned out to omit the token deliberately (it now pins the
    negative half). Re-verified: `botToken: undefined` fails 1 test.
  - `[low]` `[reject]` (intent-alignment layer) The "Docker wins" and "Cap reached" matrix rows are
    asserted at the argument surface (`platformSandboxConfigured` passed literally, an injected
    `Map`) rather than from environment through the exported slot. Confirmed as described.
    Rejected: the layer itself records that both mirror the pre-change structure and nothing
    regressed, and last pass's new `describe('the exported sandbox slot')` already added the
    env-surface arm for the docker branch.
  - `[low]` `[reject]` (intent-alignment layer) Five of six bindings are proven at the source-text
    surface rather than the booted-factory surface. Same claim as the wiring-test row above;
    grouped with it and rejected for the same reason.
  - `[false]` `[reject]` (intent-alignment layer) The matrix names `github === undefined` and
    `slack === undefined`, which are module-private and observable nowhere. Refuted as a defect:
    the layer states the tests are behaviourally equivalent, observing the same outcome through
    `integrations.length` and instance types. A private const is the correct shape for a value the
    module owns, and the matrix describes behaviour, not an export list.
  - `[false]` `[reject]` (intent-alignment layer) Package import order moved — the sandbox, auth
    and integration packages now load after `./config/pubsub` instead of before it. Refuted: the
    layer's own finding records that none of those modules constructs anything at import, so the
    reordering has no observable effect; the concern order the intent pins is preserved.
  - `[false]` `[reject]` (intent-alignment layer) "No load-time side effect" is true of effects but
    `hasPlatformSandboxEnv` reads four env keys at module evaluation. Refuted: the layer concedes
    the module has no side effect. A read is not a side effect, and the slot tests already
    `vi.resetModules()` for the env-bound value, which is the documented consequence.
  - `[false]` `[reject]` (intent-alignment layer) Test scope exceeds "relocate the tests" —
    `integrations.test.ts` and two new describe blocks are net-new coverage. Refuted as a defect:
    the intent's Always clause requires the all-or-nothing degrade behaviour (NFR23) to be
    asserted, and the Tasks section names `integrations.test.ts` as new coverage explicitly. More
    coverage for unchanged behaviour is not a defect.
  - `[false]` `[reject]` (intent-alignment layer) Doc edits exceed citation re-pinning — paragraphs
    were re-wrapped and two non-citation claims repaired. Refuted: the Always clause is "Every
    claim this change falsifies is repaired in the same commit", which is what both repairs are,
    and re-wrapping is the consequence of longer paths in re-pinned lines. No section was
    renumbered and no key set changed.
  - `[false]` `[reject]` (intent-alignment layer) `_bmad-output/` and `sprint-status.yaml` were
    written, which the Never list forbids. Refuted as a defect of the change: those hunks are the
    harness's own bookkeeping — this spec, the ledger and the board — written by the orchestrator
    between passes, not by the story. Same root cause as the two status rows above.

## Design Notes

**Why `positive-int.ts` is a fourth new module.** `positiveInt` has two consumers after this change:
`sandbox.ts` (the memory, CPU and max-sandboxes knobs) and the entry's `dispatcher.maxInFlight`, which is
Story 5.6's to move. A config module cannot import it from the entry — the entry imports the config modules,
so that is a cycle. Leaving a copy in each is duplication. A module whose whole job is one pure parser is the
same answer `database-url.ts` gave in Story 5.4 for the same shape of problem, and AD-8 fixes one module per
*concern* without forbidding a shared helper module.

**Why credential encryption travels with auth.** `secretEncryption` is `auth === null ? undefined :
credentialEncryption()`. The gate is not about encryption; it is the auth chain's decision that an explicitly
disabled deployment stores nothing encrypted — `docs/self-hosting-research.md:224` records it exactly that
way. Leaving `credentialEncryption` in the entry would mean the entry imports `auth` in order to re-derive an
auth-policy consequence, putting half of one concern's decision logic in each file, which is the state AD-8
names as the reason extraction must be total. `decodeCredentialEncryptionKey` is likewise tested beside
`selectAuth` today.

**Why `MASTRACODE_PUBLIC_URL` stays at two reads.** Its three reads split across two concerns: two feed the
Slack integration (`oidcRedirectBaseUrl`'s `??` fallback and `uiOrigin`), one is the factory call's
`publicUrl:`. Collapsing the integration pair is in scope and this story does it. Collapsing the third would
mean either moving the factory call — Story 5.6's work, and a partial state AD-8 forbids — or adding a
shared `public-url.ts` whose only remaining consumer after 5.6 would be the factory module. The epic assigns
"a search for each environment key returns exactly one read site" to Story 5.6, so the key is left at two
sites deliberately, and guard 38's message says so, the way guard 35's message reserved this story's keys.

**Order, and what observes it.** ES imports evaluate before the importing module's body, and the three 5.4
modules already run there. Adding `auth` and `integrations` after them keeps every observable side effect in
today's sequence: the Redis log, the deprecated-alias warning and the missing-`DATABASE_URL` throw, then the
auth warning and the credential-encryption warning, then any integration construction failure. `sandbox.ts`
has no load-time side effect — the module-level `liveDockerSandboxes` map and the constants are inert — so
its import position is free; put it last for readability. The relative order *within* the integrations
concern (GitHub, then Linear, then `stateSecret`, then Slack, then the array) is preserved by keeping the
statements in their current sequence inside the module, because `SlackIntegration` can throw at construction
and `stateSecret` reads keys those blocks also read.

**Test relocation, not rewrite.** The moved blocks assert against real packages (`sandbox.name` strings,
`toBeInstanceOf(MastraAuthBetterAuth)`), so the new files must not `vi.mock` those packages the way
`infrastructure.test.ts` mocks the backends. They also depend on `index.test.ts`'s pre-import sweep rather
than on exhaustive per-case stubbing, so each new file reproduces that sweep before its dynamic import; that
keeps the ~670 relocated lines byte-identical instead of turning a move into a rewrite. Two couplings to
preserve: the cap block reads the module-level `liveDockerSandboxes` that the `selectSandbox` block
populated, so both must import it from the same generation of the same module; and `instanceof` comparisons
must resolve their class in the same generation as the module under test, which is the hazard
`infrastructure.test.ts` documents.

## Verification

**Commands:**
- All 39 `[verify].commands` in order, including `npm ci`, `npm run check`, `npm test` and
  `npx varlock load --format json` — expected: every one exits 0.
- `sh -c` each of the three new entries from the repo root — expected: exit 0.
- Negative pass, each reverted immediately: paste `new SlackIntegration(` back into the entry; add a second
  `process.env.BETTER_AUTH_SECRET` under `src/`; change `signUpEnabled: false` to read an env var; move the
  docker branch below the platform arm; delete a config module — expected: exactly the guard that owns each
  case exits 1 naming the offender, and the other two exit 0. Also re-verify the census against the five
  read spellings guard 35's comment block enumerates (dot, three bracket quote styles, optional chaining,
  destructuring) and confirm a comment-only line naming a key exits 0.
- Append-only check: extract the first 36 `commands` entries from
  `4ba3bd43bc68cd3fb9ccc6c6016c2d4aefa48904` and from the current tree and compare byte for byte —
  expected: identical and in the same order.
- `git grep -n -E "process[.]env[?]?[.]" -- src` — expected: every key in the census table appears exactly
  once, under `src/mastra/config/`; `MASTRACODE_PUBLIC_URL` appears twice (`config/integrations.ts` and
  `src/mastra/index.ts`); the only other entry reads are `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` and
  `MASTRACODE_ALLOWED_ORIGINS`.
- `git grep -n -E "MastraAuthBetterAuth|createFactorySecretEncryption|GithubIntegration|LinearIntegration|SlackIntegration|DockerSandbox|PlatformSandbox|E2BSandbox|LocalSandbox" -- src/mastra/index.ts`
  — expected: no output.
- `git diff --stat 4ba3bd43bc68cd3fb9ccc6c6016c2d4aefa48904` — expected: no change to `package.json`,
  `package-lock.json`, `tsconfig.json`, `docker-compose.yml`, `apps/slack/manifest.yaml`, `ops/*.sh`,
  `ops/launchagents/`, `ops/newsyslog/`, `sandbox/factory-sandbox.Dockerfile` or `.gitignore`; `.env.schema`
  and `.env.example` change by one prose line each.
- `npx vitest run --dir src` — expected: the same assertions as at baseline, redistributed across
  `index.test.ts` and the six `config/*.test.ts` files, plus the new `integrations.test.ts` cases; total
  count ≥ 76 and no test deleted.

**Manual checks (if no CLI):**
- Read each new module against the block it replaced at `4ba3bd4`: same constructor, same options, same
  comment text, same message strings — a diff of moved lines only.
- Re-read each re-pinned citation against the new tree: the named line is the line the sentence describes,
  and the named file is the file the reader must open.

## Auto Run Result

Status: done

**Human-dependency triage: none owed.** Story 5.5's nine acceptance criteria are entirely in-repo and
gate-checkable — module placement, the one-read-site census, the `signUpEnabled: false` literal, the
docker-branch ordering, `npm run check`/`npm test`, citation resolution and the append-only `commands`
array. `epics.md:1106-1134` carries none of the "parks at awaiting-operator" clauses the epic gives
Stories 2.x/3.x/4.x, and nothing here needs a domain, a DNS record, an API key or a vendor console. So
the terminal status is `done`, not `awaiting-operator`. `sprint-status.yaml` was neither read as
authority nor written by this run.

**Implemented change.** The three concerns this project modified rather than inherited moved out of
`src/mastra/index.ts` into `src/mastra/config/`, completing what Story 5.4 began for the upstream three.
The entry went from 587 lines to 107: imports, `factoryConfigVersion`, the `new MastraFactory({…})` call,
`prepare()`, the literal `new Mastra(...)` and `finalize()`. Four keys inside the moved concerns were read
twice; each is now read once, and where the two halves disagreed on trimming the raw value is read once
and the trimmed value derived from it, never the reverse. `MASTRACODE_PUBLIC_URL` ends at two sites
deliberately, which guard 38's message records as Story 5.6's to settle.

**Files changed:**

- `src/mastra/config/auth.ts` — new. The provider chain, the credential encryption its `auth === null`
  gate drops, and the `signUpEnabled: false` literal. Single read site for six keys.
- `src/mastra/config/integrations.ts` — new. GitHub, Linear and Slack, the `stateSecret` signer chain and
  the app slug. Single read site for fifteen of sixteen keys.
- `src/mastra/config/sandbox.ts` — new. The docker branch ahead of the Platform and E2B arms, the
  container ceilings, the session cap, and the finished `sandbox` slot.
- `src/mastra/config/positive-int.ts` — new. The shared parser; a config module cannot take it from the
  entry, which imports this directory.
- `src/mastra/index.ts` — 587 → 107 lines; imports the six finished values, keeps the factory call's shape
  and the literal `new Mastra(...)`.
- `src/mastra/config/{auth,integrations,sandbox,positive-int}.test.ts` — new; three are relocations with
  assertions byte-identical, `integrations.test.ts` is new coverage.
- `src/mastra/index.test.ts` — 945 → 107 lines, keeping the env sweep, the boot assertion and the entry's
  auth-wiring test.
- `.bmad-loop/policy.toml` — guards 37–39 appended (36 → 39) with a new numbered comment group.
- `AGENTS.md`, `README.md`, `ops/README.md`, `sandbox/README.md`, `.env.schema`, `.env.example`,
  `docs/self-hosting-research.md`, `apps/{github,linear,slack}/README.md` — every anchor re-pinned and
  every prose claim placing these concerns in the entry repaired.
- `src/mastra/config/README.md` — four new module-layout rows, the new import order, the test inventory.

**Review findings breakdown — this follow-up pass.** 29 findings across four layers — high 0, medium 4,
low 13, false 12, maybe-false 0.

- *Patched* (5 rows, 4 entries; medium 2, low 2): the unpinned half of the `MASTRACODE_PUBLIC_URL`
  collapse, where swapping `oidcRedirectBaseUrl` and `uiOrigin` left everything green (grouped with the
  verification-gap layer's identical pre-verified finding and with the untested present-and-empty
  `MASTRACODE_CHANNELS_PUBLIC_URL` arm); the plaintext-credentials warning, which could be deleted
  entirely without failing a test; the entry comment and `config/README.md` both naming the wrong last
  import; and `README.md`'s sign-up procedure naming only `npm test` as going red when guard 39 now fails
  on the same edit.
- *Deferred* (1 new entry): `E2B_API_KEY`'s `.trim()` and `MASTRACODE_LOCAL_SANDBOX_ROOT` unpinned,
  verified pre-existing at baseline. Three entries carried unchanged from the first pass (the raw
  `SyntaxError` on a malformed previous-keys blob, the uncapped sandbox knobs, the untrimmed
  `SLACK_APP_BOT_TOKEN`) — re-reported by the edge-case layer, matched to their logged rows, and neither
  re-verified nor re-added.
- *Rejected* (19 rows): three status/bookkeeping rows refuted as mid-run or orchestrator-owned state
  (`in-review` is what this step writes before staging its own diff; `## Auto Run Result` was stripped by
  the orchestrator before re-dispatch; `sprint-status.yaml` is the board). The truncated DW-71/72 headings
  are real but in a ledger this run is forbidden to edit, with the full text intact in `deferred:`. The
  empty Spec Change Log would be fixed by editing this build's spec. The import-order guarantee has no
  witness, but its whole consequence is which boot diagnostic prints first. `previousKeys`'s over-narrow
  type annotation is byte-identical at baseline and needs a retype, not a correction. The `config/README`
  "key table" contradiction, the duplicate-key-id hazard (refuted at
  `@mastra/factory/dist/secret-encryption.js:30`, which throws), the present-and-empty channels URL (a
  documented operator control), and eight intent-alignment divergences were refuted outright.

**Follow-up review recommendation: false.** This was a follow-up pass and no `high` entry was patched, so
the work has converged; patch volume is not grounds. Patched counts by verdict: medium 2, low 2.

**Verification performed:**

- All 39 `[verify].commands` parsed out of `policy.toml` and run in order from the repo root — every one
  exit 0, including `npm ci`, `npm run check`, `npm test` and `npx varlock load --format json`. Run twice:
  once after the code/test patches and again after the `config/README.md` reflow.
- `npx vitest run --dir src` → 7 files, 111 tests passing (107 before this pass; 4 added, none deleted).
- Mutation pass on every new assertion, each reverted immediately and the tree confirmed clean by
  `git diff --stat`: deleting the whole `console.warn` block from `credentialEncryption()` → 1 failure
  (was 0); swapping the `oidcRedirectBaseUrl`/`uiOrigin` sources → 2 failures (was 0); `botToken:
  undefined` → 1 failure (was 0); `??` → `||` on the channels URL → 1 failure (was 0).
- Append-only re-checked mechanically: the `commands` entries extracted from `4ba3bd4` and from the
  current tree — 36 vs 39, and the first 36 byte-identical and in the same order.
- Re-pinned prose widths re-measured: the edited `config/README.md` paragraph now runs 77–101 characters
  against neighbours at 95–101, and the entry's comment block stays within its existing 71–82.
- The one deferred claim verified before recording: `MASTRACODE_LOCAL_SANDBOX_ROOT` appears nowhere under
  `src/` outside the module, and zero times in baseline `index.test.ts`.

**Residual risks.**

- Guard 37's nested-`platform:` parse remains a source-shape assertion. It handles the multi-line and
  one-line spellings and was mutation-checked in both directions last pass, but a spelling neither form
  anticipates would read as a broken extraction or pass. Unchanged by this pass, and no longer grounds for
  another review: the check has now survived two passes without a defect found in it.
- `MASTRACODE_PUBLIC_URL` ends this story at two read sites, deliberately and unguarded. A third read
  added under `src/` before Story 5.6 lands would pass every check.
- The entry's import ORDER carries the boot's evaluation order with nothing asserting it. Documented at
  `index.ts:30-39` and `config/README.md:66-75`, and rejected above because the only consequence is the
  sequence in which boot diagnostics appear — but an organize-imports pass would change it silently.
- Five of the six factory bindings are proven by guard 37's source parse rather than by a runtime test.
- The four deferred items are unchanged behaviour, not new risk: all were verified byte-identical or
  semantically identical at `4ba3bd4`.


