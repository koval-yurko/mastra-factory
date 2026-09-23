---
title: 'Story 5.2: Every subject owns its keys, and .env.schema is the only key list'
type: 'chore'
created: '2026-09-23'
status: 'done'
baseline_revision: '9caddf0354b0eaeffe9cd468376c158236c30403'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      No gate command resolves `.env.schema` against the environment the deployment actually boots
      with, so a future type, pattern or `@required` tightening on a key supplied through the process
      environment rather than through `.env` ships green and stops the server at launchd boot.
    evidence: |-
      Demonstrated by the verification-gap layer: adding `@type=enum("development", "test")` to the
      new `NODE_ENV` declaration left all 30 commands at exit 0, while
      `NODE_ENV=production npx varlock run -- node -e 'console.log(1)'` exited 1 with
      `Resolved config/env did not pass validation`. The gate runs with no `.env` and with none of the
      plists' `EnvironmentVariables` exported, so no declared key ever resolves to a value — entries 2
      and 3 assert only that the schema parses and that three keys carry `@public`, and the new
      guard 4 reconciles key *names* without resolving a value. Pre-existing in kind rather than
      caused here: `DOCKER_HOST` has been declared and plist-supplied since Story 4.2 with the same
      exposure; this story adds `NODE_ENV` to the same class. Nothing in the tree carries such a
      constraint today, so the failure needs a future edit to become real. Smallest fix: one more
      gate command that reads each `ops/launchagents/*.plist` `EnvironmentVariables` pair with
      `plutil -extract … json`, exports them, and then runs `varlock load --format json`.
    location: >-
      .bmad-loop/policy.toml [verify].commands vs ops/launchagents/ai.mastra.factory.plist
    severity: low
  - summary: >-
      The schema-completeness guard reads literal `process.env.KEY` and `process.env["KEY"]` only, so
      the four configuration keys read through `process.env[key]` over an array literal are invisible
      to it and a fifth added the same way would never be required to reach `.env.schema`.
    evidence: |-
      `src/mastra/index.ts:576-578` is
      `['MASTRA_PLATFORM_ACCESS_TOKEN', 'MASTRA_PLATFORM_SECRET_KEY'].some(key => Boolean(process.env[key]?.trim()))`
      and `['MASTRA_ENVIRONMENT_ID', 'MASTRA_PROJECT_ID'].every(...)`. These select the Platform
      sandbox, so they are deployment configuration, not the sandbox-inherited host variables at
      `:255-275` that the guard is correctly blind to. Confirmed: adding `'MASTRA_ZZUNDECLARED'` to
      that array left all 30 commands at exit 0, while the same name written as
      `process.env.MASTRA_ZZUNDECLARED` trips the guard naming file and line. All four keys are
      declared today, so nothing is currently unclaimed. Not closed here because reading a name out of
      an array literal needs a parser rather than a grep, which is a new mechanism rather than a
      direct correction; the guard's comment now names the gap and the four keys instead of claiming
      coverage it does not have. Smallest fix: an AST-based extraction, or a convention that every
      such array is annotated with a comment the guard can read.
    location: >-
      src/mastra/index.ts:576-578 vs .bmad-loop/policy.toml [verify].commands index 25
    severity: low
  - summary: >-
      Nothing asserts that `package.json`'s `start` script keeps invoking the server through
      `varlock run --`, which is the single path on which `.env.schema` is applied at all, so dropping
      that prefix makes every declaration, type and marking this story added inert with the whole gate
      green.
    evidence: |-
      `package.json:15` is `"start": "varlock run -- mastra start"`. Demonstrated by rewriting it to
      `"start": "mastra start"`: all 30 `[verify].commands` stayed at exit 0. The policy comment leans
      on that invocation twice when it explains why a bare `@required` cannot be used, and both
      `ops/README.md` and `README.md` tell the operator the schema is what validates the environment —
      none of which survives the prefix being removed. Deferred rather than patched because it is
      pre-existing, not caused here: `varlock run --` has been the only application point since long
      before this story, with no guard over it, and this change adds eleven declarations to a mechanism
      that was already unprotected. Smallest fix: one more gate command asserting that the `start`
      script in `package.json` contains `varlock run --`, with a message saying that without it the
      schema is never read.
    location: >-
      package.json:15 vs .bmad-loop/policy.toml [verify].commands
    severity: medium
---

<intent-contract>

## Intent

**Problem:** AD-6 splits environment truth by nature — `.env.schema` is the only list of keys and
owns validation/type/marking; the owning subject README owns what a value must contain and how to
obtain it. Neither half is checked, and the audit finds both broken. Six keys first-party code reads
(`NODE_ENV`, `REDIS_URL`, `E2B_API_KEY`, `MASTRACODE_AUTH_DISABLED`,
`MASTRACODE_GITHUB_AUTHORIZED_BOTS`, `MASTRACODE_DISPATCH_MAX_IN_FLIGHT`) are declared nowhere, plus
five more that READMEs document (`BETTER_AUTH_TRUSTED_ORIGINS` and the four
`MASTRACODE_LINEAR_*RECONCILE*` keys, which `apps/linear/README.md:342,366` explicitly routes to
"the env-key audit"). No README states which keys it owns, so ownership exists only as prose in five
opening paragraphs; `README.md` and `ops/README.md` both fully document `MASTRA_HOST`, `PORT` and
`MASTRACODE_PUBLIC_URL`; `.env.schema` gives provider-console navigation for Slack and GitHub; two
READMEs restate schema validation and `@public`; and no README points at the §11 trap table at all.

**Approach:** Make ownership a written, total partition instead of prose. Give each of the five
operator-plane subject READMEs — and `README.md`, the residual owner for keys with no subject
directory — a `## Keys this subject owns` table, together covering the `.env.schema` key set exactly
once. Declare the eleven undeclared keys in `.env.schema` and mirror them into `.env.example`. Move
the two crossed halves back: console navigation out of the schema, `@required`/`@public`/pattern
restatements out of the READMEs. Then convert each rule into a `[verify].commands` guard, deriving
the owned sets from the six READMEs the way Story 5.1's root guard derives root from AD-3.

## Boundaries & Constraints

**Always:** Read the tree through `git ls-files`, so the operator's `.env` is out of view by
construction. Append to `[verify].commands`, never rewrite or reorder an existing entry. Every new
guard fails with a message naming the offending key and the fix, asserts its extraction range
terminated on its closing anchor, and carries a sentinel proving the extraction was non-empty.
Declaring a key must change no behaviour: no unconditional `@required` (the gate runs with no
`.env`), no new default value. Verified in this worktree: `varlock run` neither strips undeclared
variables nor blanks a declared-but-unset one inherited from the process environment, so the eleven
new declarations are additive — validation, marking and generated types only.

**Never:** Do not edit `docs/Self-hosting research.md` — §11 is referenced, never copied, and its
section numbers are stable citation anchors (Story 5.3 owns that file and its rename). Do not edit
`AGENTS.md` (managed block). Do not move, rename or delete any file. Do not add a key to
`.env.schema` that nothing reads and no README owns, and do not remove one. Do not resolve a
duplicate by deleting the operator guidance — move it to the owner. Do not restrict a key's type to
forbid a value the code still accepts (`MASTRACODE_AUTH_DISABLED` is declared, not fenced off).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Settled state | current tree after this story | all five new guards exit 0 | No error expected |
| Key owned by two READMEs | add a `` `PORT` `` row to `sandbox/README.md`'s owned table | ownership guard exits 1 | message names `PORT` and both files |
| Key owned by nobody | delete the `` `DOCKER_HOST` `` row from `ops/README.md` | ownership guard exits 1 | message names `DOCKER_HOST` and says which README must claim it |
| Owned key not declared | add a `` `NEW_KEY` `` row to `apps/slack/README.md` | ownership guard exits 1 | message names `NEW_KEY` and cites `.env.schema` as the only key list |
| Owned-keys section missing or renamed | drop the heading from `sandbox/README.md` | ownership guard exits 1 | message names the file and the required heading |
| §11 reference dropped | remove the trap-table line from `ops/README.md`'s section | ownership guard exits 1 | message names the file and cites AC4 |
| Code reads an undeclared key | add `process.env.FOO` to `src/mastra/index.ts` | schema-completeness guard exits 1 | message names `FOO` and its read site |
| Schema and example diverge | add a key to `.env.schema` only | mirror guard exits 1 | message names the key and the side missing it |
| Deployment sets an undeclared key | add `BAR` to the factory plist `EnvironmentVariables` | deployment-set guard exits 1 | message names `BAR`, the plist, and the recorded carve-out list |
| `.env` force-added | `git add -f .env` | secret guard exits 1 | message names `.env` and says secrets never enter the repo |
| Real credential committed | a live `xoxb-` token in any tracked non-vendored file | secret guard exits 1 | message names file, line and the matched shape |

</intent-contract>

## Code Map

- `.env.schema` (475 lines, 59 keys) — declarations at column 0, `KEY=`; only two carry values
  (`FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID=v1` :109, `MASTRACODE_SANDBOX_WORKDIR=/workspace` :441).
  Header `@defaultRequired=false`, `@defaultSensitive=true` (:4-5), so `# @public` is the marking the
  existing gate entry 3 checks. **Console navigation to remove** (AC2): :63-64, :70, :75 (Slack
  console paths), :76-79 (Slack redirect-URL registration), :331-333 (GitHub "Settings → GitHub Apps
  → your app → General"); **generation how-to to move to `README.md`**: :102-103 and :229-230
  (`openssl rand -base64 32`).
- `.env.example` (420 lines) — identical key set, same order, same two values; every other key
  commented `# KEY=`. Verified by `comm` both ways: no divergence today.
- `src/mastra/index.ts` (636 lines) — 36 literal `process.env.KEY` reads. Undeclared: `REDIS_URL`
  :108 (pub/sub; rationale :102-111), `MASTRACODE_GITHUB_AUTHORIZED_BOTS` :233 (extra reviewer bot
  logins; nowhere documented), `E2B_API_KEY` :490 (cloud fallback; :459-463 records that the `docker`
  branch is evaluated first precisely so a stray value cannot move work off this host), `NODE_ENV`
  :524, `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` :588 (per-process background-dispatch cap),
  `MASTRACODE_AUTH_DISABLED` :163. Host vars forwarded into local sandboxes (:255-269
  `LOCAL_SANDBOX_ENV_KEYS`) are read via `process.env[key]` — a literal-read guard cannot see them,
  which is correct: they are inherited, not configured.
- `README.md` (271 lines) — **the duplication**: ":39-41" bullets under "What each value must contain
  and how to obtain it:" fully document `MASTRA_HOST`, `PORT`, `MASTRACODE_PUBLIC_URL`, which
  `ops/README.md:193-255` also fully documents. :51 declares a phase split ("`ops/README.md` is the
  record … once the deployment is public") — two records, not one. Sole record for `DATABASE_URL`
  :42, `BETTER_AUTH_SECRET` :43, `FACTORY_CREDENTIAL_*` :44-45,144-148, `POSTGRES_*` :196-198, and the
  four "must stay unset" keys :47. :162,:220 already defer `FACTORY_SANDBOX_*` cleanly ("not restated
  here") — the pattern to copy. :47 claims `MASTRACODE_AUTH_DISABLED` is "deliberately declared in
  neither `.env.schema` nor `.env.example`" — this story reverses that; the sentence must be updated.
- `ops/README.md` (1268 lines) — scope sentence :5-7, deferrals :9-11. Full `##` sections:
  `DOCKER_HOST` :13-53, `MASTRA_HOST` :193-221, `PORT` :223-235, `MASTRACODE_PUBLIC_URL` :237-255.
  **NFR7 restatements to remove**: :208 ("carries no `@required`"), :212 ("What the declaration buys
  is validation and `@public`"), :215 ("`@public` keeps the configured value legible"). Plist
  `EnvironmentVariables` documented :536 (`NODE_ENV=production`), `PATH` :499-534, `NODE_BIN` :527-529.
- `sandbox/README.md` (292 lines) — scope :3-6, deferral :8-10. Sections at :43,56,69,86,98,135.
  **NFR7 restatement to remove**: :101-104 ("fails the pattern `.env.schema` declares … pass
  validation"). Does not yet mention `MASTRACODE_LOCAL_SANDBOX_ROOT` (`.env.schema:445`) or
  `E2B_API_KEY` beyond a passing :50.
- `apps/github/README.md` (532) scope :5-6, sections :243,251,282,289,298,310, reconcile pair
  :352-383. `apps/linear/README.md` (518) scope :5-6, sections :313,321, and the four sweep keys as a
  table at :349-352 with :342 stating "none of them is declared in `.env.schema`" and :366-367 routing
  the decision here. `apps/slack/README.md` (441) scope :5-7, sections :218,235,248,254,269.
- `docs/Self-hosting research.md` — §11 "Environment variables — traps only" heading :676, rows
  :683-698, sixteen keys. **Read-only here.** No README references it today; `apps/*/README.md:8-9`
  and `sandbox/README.md:13` cite §4.1/§2.1 only.
- `.bmad-loop/policy.toml` — `[verify]` :28, comment block :29-365, `commands = [` :366, 24 entries
  :367-390, `]` :391. Entry form: one physical line, two-space indent, TOML literal `'''sh -c '…' '''`
  (note the space before the closing `'''`); no literal `'` inside — synthesize with
  `q=$(printf "\47")`, backtick with `b=$(printf "\140")`. **Entry 19 (:386) is the pattern to copy**:
  resolve the source document, `sed -n "/anchor/,/next-anchor/p"`, assert the slice's last line is the
  closing anchor, extract table cells with `grep -oE "^[[:space:]]*[|] $b[^$b]+$b [|]"`, sentinel-check
  non-emptiness, then compare inside `while IFS= read -r x` loops with `grep -qxF -e "$x"`. Env-related
  entries today: 2 (`npx varlock load --format json`) and 3 (`json-full`; asserts `MASTRA_HOST`,
  `PORT`, `DOCKER_HOST` are `isSensitive === false`). Comment :55-80 records the binding constraint:
  the gate runs with **no `.env`**, so a bare `@required` anywhere fails every story worktree.
  Append-only is stated at :44-45 and :342-343.
- `…/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md` — AD-6 at :123-131
  (names github/sandbox/ops owners; silent on keys with no subject directory and on where the
  restatement line falls). AD-3 :54-103 is machine input for guard 19 and must keep its bullet order
  and its `### AD-4` terminator — **do not disturb**. Seed comment :304 "owns DOCKER_HOST +
  supervision vars (AD-6)"; conventions row :249.
- Pre-verified, no change needed: `.gitignore:3-6` ignores `.env`/`.env.*` with `!.env.example`,
  `!.env.schema` negations; `git ls-files .env` is empty; a credential-shape scan over every tracked
  non-vendored file (`xox[baprs]-`, `ghp_`, `github_pat_`, `sk-`, `lin_api_`, `AKIA`, `MII…`) returns
  zero matches — every placeholder uses `...` or `<angle brackets>`, and `docker-compose.yml:34-35`
  gives `POSTGRES_PASSWORD` no default on purpose.

## Tasks & Acceptance

**Execution:**

- `.env.schema` + `.env.example` — declare the eleven missing keys in the section that matches their
  owner, each with a comment saying what the key selects and pointing at its owning README; mirror
  every addition into `.env.example` at the same position, commented, so the two key lists stay
  identical in content and order. Keys: `NODE_ENV`, `REDIS_URL`, `MASTRACODE_DISPATCH_MAX_IN_FLIGHT`,
  `E2B_API_KEY`, `MASTRACODE_GITHUB_AUTHORIZED_BOTS`, `MASTRACODE_AUTH_DISABLED`,
  `BETTER_AUTH_TRUSTED_ORIGINS`, `MASTRACODE_LINEAR_ISSUE_RECONCILE_ENABLED`,
  `MASTRACODE_LINEAR_RECONCILE_ENABLED`, `MASTRACODE_LINEAR_ISSUE_RECONCILE_INTERVAL_MS`,
  `MASTRACODE_LINEAR_RECONCILE_INTERVAL_MS`. None gets an unconditional `@required` or a default.
  Then delete the provider-console navigation and the `openssl` how-to listed in the Code Map,
  replacing each with one sentence naming the owning README. — NFR7 makes the schema the only key
  list and the README the only place that says how to obtain a value; both halves are currently on
  the wrong side of that line.
- `apps/github/README.md`, `apps/linear/README.md`, `apps/slack/README.md`, `sandbox/README.md`,
  `ops/README.md` — add a `## Keys this subject owns` section: a table whose first cell is one
  backticked key name, a one-clause "what it must contain", and a pointer to the `##` section in the
  same file that is its full record (or `must stay unset`). Follow it with one line stating that
  `.env.schema` declares and validates these keys and that `docs/Self-hosting research.md` §11 is the
  home for trap behaviour, referenced rather than copied. Add short records for the keys each subject
  now owns but does not yet document: `NODE_ENV` and `REDIS_URL` (ops), `E2B_API_KEY` and
  `MASTRACODE_LOCAL_SANDBOX_ROOT` (sandbox), `MASTRACODE_GITHUB_AUTHORIZED_BOTS` (github); linear's
  four sweep keys already have a table at :349-352 — drop the "not declared in `.env.schema`"
  disclaimer at :342 and :366-367, which this story resolves. In `ops/README.md` state that `PATH` and
  `NODE_BIN` are process-environment settings the plist and wrapper make, not `.env` keys, under a
  literal `Not .env keys:` line the deployment-set guard reads as its carve-out list. Remove the NFR7
  restatements at `ops/README.md:208,212,215` and `sandbox/README.md:101-104`, keeping the
  operator-facing consequence and dropping the schema mechanism. — FR31 asks each subject to state
  which keys it feeds; today that is one prose sentence per file with nothing checking it.
- `README.md` — add `## Keys this file owns` in the same form, claiming every declared key with no
  operator-plane subject directory. Replace the three `MASTRA_HOST` / `PORT` / `MASTRACODE_PUBLIC_URL`
  bullets at :39-41 with short pointers carrying the first-bring-up value and naming `ops/README.md`
  as the record, and rewrite :51 so the split is by owner rather than by phase; migrate to
  `ops/README.md` anything in those bullets that file does not already say. Correct :47's claim that
  `MASTRACODE_AUTH_DISABLED` is declared nowhere, keeping this file as the record for why it must stay
  unset. — a key documented in full by two READMEs is exactly what AC1 forbids, and AD-6 gives
  supervision-facing keys to `ops/`.
- `…/ARCHITECTURE-SPINE.md` — amend AD-6 to name `README.md` as the residual owner for keys with no
  operator-plane subject directory, to state that the six owned-keys sections together cover the
  `.env.schema` key set exactly once, and to draw the restatement line precisely: a README may
  describe an operator-visible failure but may not name `@required`, `@public`, `@sensitive` or a
  declared type/pattern. Do not touch AD-3. — Story 5.1's precedent: when the audit finds the spine
  written short, amend it deliberately and record it rather than leaving the gate self-certifying.
- `.bmad-loop/policy.toml` — append five guards (24 → 29) and extend the comment block with a new
  numbered group describing them, including the note that `docs/Self-hosting research.md` is referenced
  by path in guard 1 and must be updated when Story 5.3 renames it. Guards: (1) ownership partition —
  slice each of the six `## Keys this … owns` sections to the next `## `, assert each range terminated
  and each extraction non-empty, assert every section carries the §11 reference, then assert the six
  key sets are pairwise disjoint and their union equals the `.env.schema` key set in both directions;
  (2) every literal `process.env.KEY` in `src/**` is declared in `.env.schema`; (3) `.env.schema` and
  `.env.example` declare the same keys in the same order; (4) every plist `EnvironmentVariables` key
  and every `docker-compose.yml` `${KEY}` is declared in `.env.schema`, except the carve-outs derived
  from `ops/README.md`'s `Not .env keys:` line; (5) `.env` is absent from the index and no tracked
  non-vendored file matches a credential shape. — an audit that is not a gate command is a one-time
  observation; this is the same conversion Story 5.1 made for layout.

**Acceptance Criteria:**

- Given AD-6 assigns every key one owning subject, when the gate runs, then the six owned-keys
  sections are pairwise disjoint and their union is exactly the `.env.schema` key set, and adding a
  key to a second README, dropping it from every README, or naming a key no schema declares each
  fails the gate naming that key and both sides.
- Given FR31 requires each operator-plane subject README to state which keys it feeds, when the five
  subject READMEs are read, then each carries a `## Keys this subject owns` table, the ownership the
  epic assigns holds (`apps/github/` → `GITHUB_APP_*`, `apps/linear/` → `LINEAR_*`, `apps/slack/` →
  `SLACK_APP_*` + `MASTRACODE_CHANNELS_PUBLIC_URL`, `sandbox/` → `FACTORY_SANDBOX_*` +
  `MASTRACODE_SANDBOX_WORKDIR`, `ops/` → `DOCKER_HOST` + the supervision-facing keys), and removing or
  renaming any of the six headings fails the gate naming the file.
- Given `.env.schema` is the only list of keys, when the gate runs, then every environment key
  first-party code reads, every key the plists and `docker-compose.yml` set, and every key an owning
  README claims is declared there, and introducing an undeclared read, an undeclared deployment-set
  key or an unmirrored declaration fails the gate naming the key and its site.
- Given neither side restates the other's half, when the six READMEs are read, then none names
  `@required`, `@public`, `@sensitive` or a declared type/pattern, and `.env.schema` gives no
  provider-console navigation and no credential-generation command — each instead pointing at the
  other file.
- Given the §11 trap table is the home for non-obvious behaviour, when the owned-keys sections are
  read, then each references `docs/Self-hosting research.md` §11 rather than copying it, the gate
  fails if a reference is dropped, and that document is byte-identical to its state before this story.
- Given secrets never enter the repo, when the gate runs, then `.env` is absent from the index and no
  tracked non-vendored file matches a credential shape, and `git add -f .env` or a committed live
  token fails the gate naming the offender.
- Given declaring a key must change no behaviour, when the eleven additions are made, then
  `npx varlock load --format json` still exits 0 with no `.env` present, none of the new declarations
  carries an unconditional `@required` or a default value, and `npm run check` and `npm test` stay
  clean.
- Given `[verify].commands` is append-only, when the diff is read, then the 24 pre-existing entries are
  byte-identical and in the same order, no file has been moved, renamed or deleted, and
  `docs/Self-hosting research.md` and `AGENTS.md` are untouched.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 46 findings — high 0, medium 16, low 27, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` The guard-2 comment claims the only invisible reads are `LOCAL_SANDBOX_ENV_KEYS`
    host variables — false: `src/mastra/index.ts:576-578` reads four Platform *configuration* keys via
    `process.env[key]` over array literals; comment corrected to name that second class, guard widened to
    the bracketed string-literal form, and the array-literal gap deferred with its fix.
  - `[medium]` `[patch]` Guard 1's `sed` range consumes a second `## Keys this … owns` heading as its own
    terminator, so only the first section per file is extracted — confirmed: a second section mid-file in
    `sandbox/README.md` claiming `PORT` (owned by ops) exited 0; fixed by asserting exactly one such
    heading per file, naming the file and the count.
  - `[medium]` `[patch]` Guard 5's PEM shape demands base64 immediately after the header, so the
    `\n`-escaped single-line PEM `apps/github/README.md` tells the operator to produce passes — confirmed
    exit 0; fixed by allowing up to four non-base64 characters before the body, re-verified that the
    `...`-truncated placeholders still do not match.
  - `[medium]` `[patch]` `README.md:42` still documented `NODE_ENV` in full while the new
    `ops/README.md` `## NODE_ENV` section says the same — the two-records state AC1 forbids, newly created
    by this change; the root bullet is now a pointer keeping only "leave it unset for this procedure".
  - `[low]` `[patch]` The three ops-owned bullets still sat under the heading "What each value must
    contain and how to obtain it" and carried format constraints; heading reworded to "Where each value
    comes from" and the bullets reduced to this bring-up's value plus a pointer.
  - `[medium]` `[patch]` AC4's restatement rule was the one criterion with no guard — confirmed by
    re-adding `openssl rand -base64 32` to `.env.schema`, console navigation to `SLACK_APP_BOT_TOKEN`, and
    an `@required`/`@public` sentence to `ops/README.md`, each leaving all 29 commands green; fixed with a
    new guard 6 (29 → 30) asserting both directions and reporting file, line and offending token.
  - `[low]` `[patch]` Five hand-counted totals ("Nine keys", "these nine", …) that guard 1 never reads —
    the failure class this story closes; numerals dropped in favour of the table.
  - `[low]` `[patch]` AD-6's `Rule:` bullet still enumerated three of the six owners and gave `ops/` only
    `DOCKER_HOST` — stale normative text; the enumeration now points at the six owned-keys tables.
  - `[medium]` `[patch]` Guard 4's per-plist extraction used `plutil … 2>/dev/null` with only a whole-set
    sentinel — confirmed: stripping `EnvironmentVariables` from the colima plist exited 0; fixed so a
    `plutil` error fails as itself and a plist contributing zero keys fails naming that plist.
  - `[medium]` `[patch]` Guard 4 read the plists and Compose but not `ops/*.sh`, which sets `PATH` (:21)
    and `DOCKER_HOST` (:26) and is why `NODE_BIN` is on the carve-out line — confirmed: `export
    MASTRACODE_ZZUND=1` in the wrapper passed every guard; fixed by collecting `export KEY=` from `ops/*.sh`
    through the same carve-out filter.
  - `[low]` `[patch]` The `Not .env keys:` line is column-0 machine input with no signal beside it — one
    sentence added recording that the gate reads it and the form it must keep (the AD-3 precedent). The
    same finding's other half — nothing asserts the carve-outs are genuinely process-environment settings
    — is rejected below.
  - `[low]` `[patch]` The new `MASTRACODE_GITHUB_AUTHORIZED_BOTS` section carried no
    `node_modules/@mastra/factory/…` citation although `apps/github/README.md:15-17` requires one, never
    named the defaults it called "the whole trusted set", and overstated the case requirement — verified
    against `webhook.js:287` (`coderabbitai[bot]`, `devin-ai-integration[bot]`) and `:296-303` (entries are
    trimmed and lower-cased against a lower-cased sender); all three corrected.
  - `[low]` `[patch]` Guard 3's example-side extractor matched prose — confirmed: a comment line
    `# NODE_ENV=development wins over that default` produced a phantom key and a "different ORDER" message
    pointing at nothing; fixed by requiring the assignment to run to end of line with no space after `=`.
  - `[low]` `[patch]` Orphan ~54-character line at `sandbox/README.md:125` inside a paragraph wrapped at
    ~100 columns — reflowed.
  - `[medium]` `[patch]` Guard 5's prefix list omitted `xapp-`, `ghu_` and `ghr_` — confirmed exit 0 for a
    Slack app-level token; added.
  - `[low]` `[patch]` The `MASTRACODE_AUTH_DISABLED` comment had already drifted between `.env.schema`
    ("declared here") and `.env.example` ("listed here") — made byte-identical.
  - `[medium]` `[patch]` (edge-case layer) PEM shape unmatched — same finding and same fix as above.
  - `[medium]` `[patch]` (edge-case layer) `xapp-`/`ghu_`/`ghr_` missing — same finding and same fix.
  - `[medium]` `[patch]` Guard 5 asserted only `.env` absent from the index while `.gitignore:3-6` ignores
    the whole `.env.*` family and `npm run dev` also loads `.env.local`/`.env.development` — confirmed:
    `git add -f .env.local` with a password in it exited 0; fixed with a listing filter over the family.
  - `[low]` `[patch]` Guard 2 could not see `process.env["KEY"]` — confirmed; regex widened, and a bracket
    read of `ZZ_BRACKET_PROBE` now fails naming file and line.
  - `[low]` `[patch]` Guard 2's globs omitted `src/*.mts`, `src/*.cts`, `src/*.jsx` — added.
  - `[low]` `[patch]` Guard 2 lacked the `core.quotePath=false` that guard 5 already uses, so a non-ASCII
    src filename would arrive C-quoted and be skipped — added.
  - `[low]` `[reject]` Compose bare `$KEY` and `$${KEY}` escapes are unhandled — real, but
    `docker-compose.yml` uses `${KEY}` throughout, the state was never demonstrated reachable, and handling
    `$$` correctly is a new escape-aware parser rather than a direct correction.
  - `[low]` `[patch]` Guard 1's row regex demanded exactly one space around the backticked cell, so a
    column-aligning formatter would make every row vanish and a doubly-claimed key pass — the coupling
    Story 5.1 patched in its own table grep; made whitespace-tolerant and re-verified with a padded `PORT`
    row still catching the duplicate.
  - `[low]` `[reject]` Derive the six owner paths from AD-3 instead of hard-coding them — rejected: AD-3's
    root directory closed set contains directories that are not owned-keys subjects (`docs/`, `src/`,
    `.claude/`), so it is not the right source, and no seventh subject exists. The comment that
    *claimed* the list was derived is patched below.
  - `[low]` `[patch]` (edge-case layer) `# IDENT=` prose in `.env.example` — same finding and same fix.
  - `[low]` `[reject]` Nothing checks that a key uncommented in `.env.example` corresponds to one carrying
    a value in `.env.schema` — real, but the only two uncommented example lines are exactly the two schema
    lines with values, and the fix adds an assertion for a state never demonstrated.
  - `[low]` `[patch]` A duplicate key name on one side reported as "same keys in a different ORDER",
    misdirecting the fix — duplicates are now detected per side first, with their own message.
  - `[medium]` `[patch]` (edge-case layer) The restatement rule has no guard — same finding and same fix
    as the new guard 6.
  - `[low]` `[patch]` (edge-case claim) The guard-2 comment's blind-spot rationale is untrue — same
    finding and same fix as the first row.
  - `[low]` `[patch]` (edge-case claim) The comment claims the partition is "derived the way guard 19's
    root sets are derived from AD-3" while `r` is a literal list — confirmed; corrected to say it is a
    literal list and why AD-3 cannot supply it.
  - `[medium]` `[patch]` (edge-case claim) The secret-guard acceptance criterion overclaims what the shape
    list catches — same finding and same fix as the PEM and prefix rows.
  - `[low]` `[defer]` No command resolves the schema against the boot environment, so a future constraint
    on a plist-supplied key ships green and fails at launchd — pre-existing in kind (`DOCKER_HOST` has had
    the same exposure since Story 4.2) and needs a future edit to become real; ledger carries the fix.
  - `[medium]` `[patch]` (gap layer) The restatement rule is enforced only by hand — same finding and same
    fix as guard 6.
  - `[medium]` `[patch]` (gap layer) Guard 4 does not read the start wrapper — same finding and same fix.
  - `[low]` `[defer]` Guard 2 cannot see `process.env[key]` over an array literal — filed by the gap layer
    as defer and deferred: all four keys are declared today, and reading a name out of an array literal
    needs a parser rather than a grep.
  - `[low]` `[reject]` Guard 1 does not verify that the section each table row names as its "Full record"
    exists — real, but the third column is prose of several shapes ("the `DOCKER_HOST` section below",
    "Start the Factory Server step 1") with no uniform mechanical target; the fix is a new extraction
    mechanism, not a correction.
  - `[low]` `[reject]` The carve-out list is unconstrained — the change documents this as the deliberate
    trade-off (exempting a key means writing down why, in the file that owns the deployment); the missing
    *signal* that the line is machine input was the patchable half and is fixed above.
  - `[false]` `[reject]` `README.md` as residual owner is an invention the AC's surface cannot
    accommodate — refuted at the intent level: AC1's "every key has exactly one owning subject" is a
    totality claim, AD-3 closes the operator-plane subject set so a new directory is not available, and
    most declared keys have no subject. The residual owner is the only branch left, and it is recorded in
    AD-6 with a dated attribution rather than assumed.
  - `[false]` `[reject]` AC2's key set was substituted for a superset — refuted: the AC's literal set is
    the untracked `.env`, invisible to any gate; guard 4 checks every key the *committed* deployment
    artifacts set (plists, Compose, and now `ops/*.sh`), which is the visible whole of that set, and
    guard 2 adds the read set one step earlier. The substitution is stated in Design Notes, not silent.
  - `[false]` `[reject]` AC3's "key names and shapes only" points away from the added prose — refuted:
    the clause constrains *values*, which is why it is paired with "`.env` is gitignored" and "no committed
    file contains a real credential"; both env files have always carried explanatory comments, and AD-6
    gives the schema validation and marking, which is what those comments explain.
  - `[low]` `[reject]` AC4 is exercised as a substring, not as non-duplication — real and structural: no
    command can decide whether a README paragraph restates a trap table row. The spec's Design Notes drew
    that line (no verbatim copy; deeper subject-specific operator guidance stays), a signature check
    confirms no §11 row is reproduced verbatim, and §11 has no `NODE_ENV` row for the new section to
    duplicate.
  - `[low]` `[patch]` Two new file-to-gate couplings (the carve-out line; the §11 path) — the carve-out
    half is patched above. The §11 forward dependency is rejected: it is deliberate, recorded in both the
    policy comment and Design Notes, and is the mechanism that makes Story 5.3's own "repo-wide search for
    the old path comes back empty" criterion enforceable.
  - `[low]` `[reject]` Guard 1 asserts nothing about the second column, so a table of correct key names
    with empty middle cells is green — real, but "what the value must contain" is irreducibly editorial;
    checking it mechanically is a new mechanism, and an empty-cell table was never demonstrated.

### 2026-09-24 — Review pass (follow-up)
- verdicts: 49 findings — high 0, medium 17, low 25, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Guard 3 extracts `KEY=[^ ]*$` while guards 1/2/4 use bare `^KEY=`, so a
    declaration whose value contains a space is invisible to the mirror check — confirmed: `ZZ_SPACED=a b`
    in `.env.schema` left guard 3 at exit 0. Not fixed: the end-of-line anchor was added last pass to kill a
    demonstrated phantom-key bug (`# NODE_ENV=development wins over that default`), no declared key has a
    spaced value, and loosening it risks that regression for a state never shown reachable.
  - `[medium]` `[patch]` Guard 1 mandates a `docs/Self-hosting research.md` §11 reference but never asserts
    that file exists, so the forward dependency on Story 5.3 only fires in one direction — confirmed:
    renaming the document left all six guards green and six READMEs citing a dead path. Fixed with a
    `test -f` in guard 1, message naming Story 5.3; re-verified the rename now fails guard 1.
  - `[medium]` `[patch]` Guard 6 detects provider-console navigation only when written with `→` —
    confirmed: `Basic Information > App Credentials` in `.env.schema` exited 0. Fixed by adding a
    word-`>`-word scan (zero matches in either env file today); re-verified it now fails.
  - `[low]` `[patch]` `NODE_BIN` is `readonly`, never exported and absent from both plists, so no guard-4
    collector can ever emit it, yet `ops/README.md` listed it beside `PATH` as a process-environment setting
    the wrapper makes and put it on the machine-read carve-out line — an unfalsifiable entry that would
    pre-exempt the name if it ever became a real key. Fixed: dropped from the carve-out line, described
    correctly as a shell constant, and guard 4's vacuity message no longer names it.
  - `[false]` `[reject]` `.env.schema` and `.env.example` drifted on the new
    `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` comment ("declared here" vs "declared for it") — refuted: that
    difference is the deliberate convention, since "here" is true only in the file that declares. The real
    defect is the opposite instance and is patched below.
  - `[medium]` `[patch]` `.env.example` is outside every restatement guard although this story stripped the
    same `openssl` how-to and Slack console paths from it — confirmed: re-adding
    `openssl rand -base64 32` to `.env.example` left all 30 commands green. Fixed: guard 6 now runs its
    generation and navigation scans over both env files.
  - `[low]` `[reject]` The spec's Tasks, Acceptance and Verification still say "five guards (24 → 29)" while
    the tree has six and 30 — real, but the only fix is to edit this build's spec, which triage does not do.
  - `[low]` `[reject]` Both new `deferred-work.md` entries are truncated mid-sentence, losing the recorded
    smallest fix — real, but the deferred-work ledger is orchestrator-owned; this session must not rewrite
    its entries. The full text stands in this spec's `deferred` frontmatter.
  - `[false]` `[reject]` Spec frontmatter contradicts its body and `sprint-status.yaml` — refuted:
    `status: in-review` is this pass's own transient state, set at the top of the review step and written
    back to `done` at finalization, and the board is orchestrator bookkeeping outside this session's write
    surface.
  - `[low]` `[reject]` Guard 1's duplicate diagnostic greps whole files, so it can name a README that does
    not claim the key — checked every backticked-first-cell row outside the six owned sections: only
    `apps/linear/README.md:370-373`, whose four keys that file also legitimately claims. The misdirection is
    unreachable today, and an over-inclusive failure message is cosmetic.
  - `[low]` `[reject]` Nothing pins a credential's sensitivity, so `# @public` above `E2B_API_KEY` ships
    green — confirmed exit 0. Pre-existing for all 59 keys (only entry 3 pins three keys as non-sensitive),
    the fix needs a curated credential list rather than a correction, and marking a secret public is a
    deliberate edit, not an accident.
  - `[medium]` `[defer]` Nothing guards that `package.json`'s `start` keeps `varlock run --`, the single
    path on which `.env.schema` applies — confirmed: removing it left all 30 commands green. Pre-existing:
    that invocation has been the only application point, unguarded, since long before this story. Ledger
    carries the one-command fix.
  - `[medium]` `[patch]` Guard 5 has no shape for the two secrets `README.md` tells the operator to
    generate — confirmed: a committed `BETTER_AUTH_SECRET=<44-char base64>` exited 0. Fixed by matching
    those two names against a long base64 value. `e2b_` was not added: nothing in the tree documents that
    prefix, and asserting an unverified shape is worse than omitting it.
  - `[low]` `[patch]` The six new sections break the ~100-column wrap of the five subject READMEs (148/153
    and 111 characters against a p95 of 104) — the class reflowed last pass at `sandbox/README.md:125`.
    Reflowed in all five; `README.md` is unwrapped throughout by convention and was left alone.
  - `[low]` `[reject]` Each of the six READMEs hand-enumerates the other five owners in prose no guard
    reads — real, but that prose is reader orientation, not the authority: AD-6 makes the six tables
    normative and the guard reads them, so a stale sentence misleads without breaking a rule, and making a
    guard parse it is a new mechanism.
  - `[medium]` `[patch]` Guard 5's PEM shape cannot reach the body of a conventional multi-line PEM,
    because grep is line-based — confirmed: a committed four-line RSA key exited 0, which is the format a
    downloaded GitHub App key actually has. Fixed with a whole-line 60+ base64 shape (zero matches in the
    tree today); re-verified it now fails.
  - `[medium]` `[patch]` Guard 5's env-file filter is anchored at repo root, so a nested gitignored env file
    is unchecked — confirmed: `git add -f apps/.env` with a password in it exited 0. Fixed by anchoring at
    any path segment; re-verified.
  - `[low]` `[reject]` Guard 2 cannot see `const { KEY } = process.env` or `process.env?.KEY` — confirmed
    green, but no such form exists anywhere under `src/` (36 literal reads, zero destructuring), and the fix
    adds a new prohibition branch rather than widening a regex. The non-literal-read class is already in the
    ledger.
  - `[medium]` `[patch]` Guard 6 catches a restated pattern only when it carries a sigil, so the
    `sandbox/README.md` sentence this story removed ("fails the pattern `.env.schema` declares … `varlock
    load`") can be pasted back green — confirmed exit 0. Fixed by adding that wording to the alternation;
    verified zero false positives across the six READMEs, and `apps/github/README.md`'s allowed "passes
    validation" deliberately left off the list.
  - `[medium]` `[patch]` Console navigation written with `>` rather than `→` is undetected — same finding
    and same fix as the third row.
  - `[low]` `[patch]` Guard 6's generator list omits several ordinary spellings — `head -c 32 /dev/random |
    base64` passed. Added `/dev/random`, `uuidgen` and `pwgen`; `base64` alone was rejected as a term
    because `.env.schema:132,134` use it legitimately in prose.
  - `[medium]` `[patch]` `.env.example` can regain console navigation or a generation how-to unnoticed —
    same finding and same fix as the `.env.example` row above.
  - `[medium]` `[patch]` Guard 4 extracts every ALL-CAPS word from the `Not .env keys:` line, so a name
    written in the prose after the list silently exempts a real deployment-set key — confirmed: with
    `MASTRACODE_ZZPROBE` in the factory plist and "MASTRACODE_ZZPROBE is not one." appended to that line,
    all 30 commands exited 0. Fixed to read backticked names only, which is the form `ops/README.md:44`
    already states as the rule; re-verified.
  - `[low]` `[reject]` `export FOO=1 BAR=2` hides every key after the first — confirmed the second name is
    invisible, but both `ops/*.sh` exports are single-assignment, the line still fails on the first
    undeclared key, and the fix restructures the extractor rather than correcting it.
  - `[low]` `[reject]` `carried` Compose bare `$KEY` and `$${KEY}` escapes are unhandled — same claim and
    same location as the row rejected in the previous pass, and `docker-compose.yml` still uses `${KEY}`
    throughout.
  - `[low]` `[reject]` A declared key with a space in its value vanishes from guard 3 — same finding and
    same disposition as the first row.
  - `[low]` `[reject]` A key claimed twice inside one README reports as "more than one README" and names one
    file — real but misdirection only; the duplicate is still caught and the fix adds a same-file counting
    pass for a state never demonstrated.
  - `[low]` `[reject]` A §11 reference written without backticks fails the gate, because the guard's pattern
    spends an any-character on the backtick — confirmed. Rejected: the repo backticks paths throughout, so
    the false positive needs a deviation from convention, and splitting the grep trades it for a looser path
    match.
  - `[low]` `[reject]` The spec claims five guards while six shipped — same finding and same disposition as
    the spec-count row above.
  - `[low]` `[patch]` The spec's "every new guard carries a sentinel proving the extraction was non-empty"
    is untrue of guard 6, which extracts nothing and only tested `-f` — so an emptied `.env.schema` or
    README would pass it vacuously. Fixed: guard 6 now requires all eight files it opens to be non-empty.
  - `[medium]` `[patch]` Guard 1 checks disjointness and totality but never which subject owns a key, so
    AC2's assigned mapping is unverified — confirmed: moving the `SLACK_APP_BOT_TOKEN` row out of
    `apps/slack/README.md` into `README.md`'s residual table left the partition total and all 30 commands
    green. Fixed with a prefix rule (`GITHUB_APP_`, `LINEAR_`, `SLACK_APP_`, `FACTORY_SANDBOX_`) inside the
    section slice, recorded in AD-6 with a dated attribution so the gate is not self-certifying; re-verified.
  - `[false]` `[reject]` "Read the tree through `git ls-files`" is claimed while four guards read fixed
    paths — refuted: that boundary exists so the operator's `.env` stays out of view, and `.env` is both
    untracked and gitignored (guard 5 asserts it). The fixed paths are seeded, committed artifacts.
  - `[medium]` `[patch]` The restatement guard matches only the four sigils, so the `sandbox/README.md`
    removal can return green — same finding and same fix as the wording row above.
  - `[medium]` `[patch]` `.env.example` is outside every restatement guard — same finding and same fix.
  - `[medium]` `[patch]` Nothing asserts the trap-table document exists — same finding and same fix as the
    second row.
  - `[medium]` `[patch]` The owner-to-key mapping is unverified — same finding and same fix as the prefix
    rule above.
  - `[false]` `[reject]` (gap layer control) `varlock run` passes inherited values through unchanged and
    leaves a declared-but-unset key absent rather than blank — a confirmation of the change's load-bearing
    additive claim, not a defect.
  - `[low]` `[patch]` (gap layer) The new sections introduce 148- and 111-character lines into files that
    wrap at ~100 — same finding and same fix as the reflow row.
  - `[low]` `[patch]` (gap layer) `.env.example` says `MASTRACODE_AUTH_DISABLED` "is declared here" in a
    file that declares nothing — the byte-identical fix of the previous pass copied the schema's wording
    into a file where it is false, while the sibling `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` comment handles it
    correctly. Reworded to name `.env.schema`, following that sibling.
  - `[low]` `[reject]` `carried` Guard 1 never reads the second or third table column, so blank
    "what it must contain" cells and a "Full record" pointing at a section that does not exist both pass —
    same claims and same locations as two rows rejected in the previous pass; the columns are irreducibly
    editorial and prose of several shapes.
  - `[low]` `[reject]` Cross-README duplication is caught only when both files *claim* the key: a second
    full `## MASTRA_HOST` record in `README.md` with no table row passes — confirmed. Structural: no command
    can decide whether a paragraph is a second record, which is why the story fixed the instances and made
    the checkable property the table partition.
  - `[medium]` `[patch]` The restatement line is enforced as a token list rather than as the rule — same
    finding and same fix as the wording, `>`-navigation and generator-list rows.
  - `[false]` `[reject]` The new `.env.schema` comments reproduce the README half for `NODE_ENV`,
    `E2B_API_KEY` and `MASTRACODE_AUTH_DISABLED` — refuted: AD-6 gives the schema validation, typing and
    marking, and each of those comments exists to explain why the key carries no pattern or enum. The
    READMEs remain the only record for what a value must contain and how to obtain one, so there is no
    competing definition — AD-6's stated harm.
  - `[low]` `[reject]` `carried` The carve-out list is an unconstrained escape hatch — same claim and same
    location as the row rejected in the previous pass; documented there as the deliberate trade-off. The
    extraction bug beside it was the patchable half and is fixed above.
  - `[false]` `[reject]` "Every key the deployment sets" is replaced by two proxies — refuted as a defect:
    the substitution is stated in both Design Notes and the policy comment, and its two residues are already
    ledger entries.
  - `[low]` `[reject]` The owner list exists in three unreconciled places — same finding and same
    disposition as the README-enumeration row.
  - `[low]` `[patch]` Guard 6 satisfies neither half of the spec's guard-construction rule and has no
    matrix row — the sentinel half is patched above; the matrix half is rejected, since its only fix is to
    edit this build's spec.
  - `[false]` `[reject]` `README.md` uses `## Keys this file owns` while the Approach names
    `## Keys this subject owns` — refuted: the variant is recorded in AD-6 and accommodated by the guard's
    regex, so it is a deliberate widening, not drift.
  - `[low]` `[patch]` The `PORT` bullet's dev-path symptom ("every request then arrives on an origin
    sign-in does not trust") was dropped rather than migrated: `ops/README.md`'s `PORT` section gives only
    the tunnel/`502` symptom, which does not exist during `README.md`'s loopback bring-up — the Boundaries
    forbid resolving a duplicate by deleting operator guidance. Restored into the owning section, scoped to
    before the tunnel exists.

## Design Notes

**Why `README.md` is the sixth owner.** AC1 requires every key to have exactly one owning subject,
but the operator-plane subject set is closed — AD-3 enumerates the root directories, so inventing an
`auth/` or `db/` subject to house `BETTER_AUTH_SECRET` would be a spine change this story is not
chartered to make. Most declared keys (database, credential encryption, platform, WorkOS, model
providers, Postgres) have no subject directory and are already documented in `README.md`, which
AD-3 keeps at root because forges render it there. Naming it the residual owner is the only reading
that makes the partition total without moving a file, and it is recorded in AD-6 rather than assumed.

**The restatement line, drawn explicitly.** "No README restates validation" cannot mean "no README
may describe a failure the operator will see" — that would gut FR31's "what the operator must do".
The line this story draws, and writes into AD-6: a README may say *what goes wrong and what the
operator sees*; it may not name the schema's own mechanism (`@required`, `@public`, `@sensitive`, a
declared type or pattern). `sandbox/README.md:101-104` and `ops/README.md:208-215` cross it by naming
the mechanism; `apps/github/README.md:127` ("env validation names the first key left empty") does not.

**Why the guard reads `process.env.KEY` and not the whole key population.** AC2's own wording is
"every key the deployment sets", but the deployment's `.env` is untracked and invisible to the gate.
What the gate can see and what actually matters is the same set one step earlier: a key first-party
code reads is a key the deployment may have to set. Literal reads are greppable; the dynamic reads at
`src/mastra/index.ts:255-275` are host variables inherited into sandboxes, never configured here, so
their invisibility to the guard is correct rather than a gap.

**Declaring `MASTRACODE_AUTH_DISABLED` rather than hiding it.** `README.md:47` keeps it out of the
schema so it is not advertised, and calls itself "the only warning about it". That trades NFR7's
"only list of keys" for obscurity, and loses: the key still works, and the one place an operator looks
for keys does not mention it. Declared with a comment saying it must stay unset and why, the warning
lands where it is read. Its type is deliberately left unrestricted — fencing it off with an enum
would refuse a boot the code still supports, which is a behaviour change this story is not making.

**A deliberate forward dependency on Story 5.3.** Guard 1 asserts each owned-keys section references
`docs/Self-hosting research.md` §11 by path, so 5.3's rename must update `policy.toml` and the six
READMEs in the same change. That is already 5.3's stated criterion ("a repo-wide search for the old
path comes back empty"), and a gate that fails loudly on the old path is the mechanism that enforces it.

## Verification

**Commands:**
- `sh -c` each of the five new `[verify].commands` entries from the repo root — expected: all exit 0.
- Negative pass, each reverted immediately: add a `` `PORT` `` row to `sandbox/README.md`'s table;
  delete the `` `DOCKER_HOST` `` row from `ops/README.md`'s; add a `` `NEW_KEY` `` row;
  rename one `## Keys this subject owns` heading; delete a §11 reference; add `process.env.FOO` to
  `src/mastra/index.ts`; add a key to `.env.schema` only; add `BAR` to the factory plist's
  `EnvironmentVariables`; `git add -f .env`; write a fake `xoxb-` token into a tracked file —
  expected: exactly the guard that owns each case exits 1 naming the offender, and the other four
  still exit 0.
- `npx varlock load --format json` with no `.env` — expected: exit 0. Then
  `npx varlock load --format json-full` — expected: the eleven new keys present, none required, and
  entry 3's three `@public` keys unchanged.
- `npm ci && npm run check && npm test` — expected: clean, clean, 59 tests passing.
- All 29 `[verify].commands` in order on the final tree — expected: every one exits 0.
- Append-only check: compare the first 24 `commands` entries against `9caddf0` byte for byte —
  expected: identical and in the same order (`9caddf0354b0eaeffe9cd468376c158236c30403`).
- `git diff --stat` and `git status --porcelain` before finalising — expected: no deletions, no
  renames; `docs/Self-hosting research.md`, `AGENTS.md` and `src/` unchanged.

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** Follow-up review pass over the already-implemented story. No code was re-derived; the
change is the same one, with nine patched entries applied to it. The first pass had converted AD-6's
split into six `[verify].commands` guards; this pass found that four of the six were narrower than
the rule they claimed to enforce and closed the gaps: guard 6 read only one of the two env files and
matched restatement by sigil and navigation by arrow alone, guard 5's credential shapes could not
reach a conventional multi-line PEM or a nested env file, guard 4's carve-out extraction read any
ALL-CAPS word from a prose line, and guard 1 asserted ownership was disjoint and total without ever
saying *which* subject owns a key. Every one was demonstrated green before the fix and failing after.
Two documentation defects the first pass created were also corrected — a carve-out entry for a name
that is not an environment variable, and an operator symptom dropped rather than migrated.

**Files changed this pass** (six; no deletions, no renames, no moves; `src/`,
`docs/Self-hosting research.md` and `AGENTS.md` untouched):
- `.bmad-loop/policy.toml` — guards 1, 4, 5 and 6 widened (entries 25, 28, 29, 30); the comment block
  updated to record each widening and the negatives that motivated it. The 24 pre-existing entries are
  byte-identical to `9caddf0` and in the same order; the entry count stays 30.
- `…/ARCHITECTURE-SPINE.md` — AD-6 records the prefix-family ownership rule with a dated attribution,
  and why it is not the per-key enumeration AD-6 declines. AD-3 untouched.
- `ops/README.md` — `NODE_BIN` removed from the machine-read carve-out line and described correctly as
  a `readonly` shell constant; the `PORT` section regains the loopback bring-up symptom; two lines
  reflowed.
- `sandbox/README.md`, `apps/slack/README.md`, `apps/github/README.md`, `apps/linear/README.md` — two
  over-long lines each reflowed to the files' ~100-column wrap.
- `.env.example` — the `MASTRACODE_AUTH_DISABLED` comment no longer says the key is "declared here" in
  a file that declares nothing.

**Review findings breakdown.** 49 findings from four layers — high 0, medium 17, low 25, false 7,
maybe-false 0. Grouped into nine patched entries (5 medium, 4 low), one deferred, and the rest
rejected.

Patched entries: guard 6 narrower than the restatement rule and blind to `.env.example` (medium);
guard 1 never asserted the trap-table document exists (medium); ownership disjoint and total but
unattributed (medium); guard 5's shape list and env-file filter (medium); guard 4's carve-out
extraction (medium); the dead `NODE_BIN` carve-out (low); `.env.example`'s "declared here" (low); the
wrap regressions (low); the dropped `PORT` dev-path symptom (low).

Deferred: nothing asserts that `package.json`'s `start` keeps `varlock run --`, the single path on
which `.env.schema` is applied — demonstrated green with the prefix removed, but pre-existing rather
than caused here, and recorded with its one-command fix.

Rejected, each with its recorded reason: guard 3's spaced-value blind spot and its two restatements
(the end-of-line anchor fixes a demonstrated phantom-key bug and no key has a spaced value); the
spec's stale "five guards / 29" count and its restatement (the only fix edits this build's spec);
the truncated `deferred-work.md` entries (orchestrator-owned; full text is in this spec's frontmatter);
the frontmatter/board "contradiction" (transient review state plus orchestrator bookkeeping); guard 1's
whole-file duplicate diagnostic (misdirection unreachable — checked every same-shape row outside the
six sections); unpinned credential sensitivity (pre-existing for all 59 keys; needs a curated list);
the six READMEs' owner enumerations and the three-places owner list (orientation prose, not the
authority); destructuring `process.env` reads (no such form under `src/`; adds a branch); multi-key
`export` lines (both wrapper exports are single-assignment); Compose `$$`/bare-`$` escapes (carried
from the previous pass); same-file duplicate claims and unbackticked §11 references (misdirection and
a convention-deviation false positive); guard 1's unread second and third columns (carried, twice);
cross-README duplication as a class (no command can decide whether a paragraph is a second record);
the `.env.schema` comments said to reproduce the README half (AD-6 gives the schema its own
validation rationale); the deployment-set proxy substitution (stated, with both residues already in
the ledger); the `## Keys this file owns` heading variant (recorded in AD-6); the carve-out list being
unconstrained (carried); the `git ls-files` boundary (about `.env` visibility, which holds); and
guard 6's missing matrix row (fix edits this build's spec). `e2b_` was deliberately not added to the
credential shapes: nothing documents that prefix, and an unverified shape is worse than none.

**Follow-up review recommendation:** `false`. This is a follow-up pass and it patched no `high` entry
— the highest was `medium`, five of them. The work has converged.

**Verification performed** (all from the repo root, on the final tree):
- All 30 `[verify].commands` in order, including `npm ci`: every one exit 0.
- Append-only: the first 24 `commands` entries diff clean against
  `9caddf0354b0eaeffe9cd468376c158236c30403`, byte for byte and in order.
- The spec's original ten-row negative matrix, each edit reverted immediately: exactly the owning
  guard fails in every row (25 ×5, 26, 25+27, 28, 29, 29) and the others stay green.
- Ten new negatives for this pass's fixes, each reverted: trap-table rename → 25; sigil-free pattern
  restatement → 30; `openssl` in `.env.example` → 30; `>`-navigation in either env file → 30; nested
  `apps/.env` force-added → 29; conventional multi-line PEM → 29; committed generated
  `BETTER_AUTH_SECRET` → 29; plist key exempted by a prose ALL-CAPS word → 28; `SLACK_APP_*` row moved
  to `README.md` → 25. Each was confirmed green *before* its fix.
- `npx varlock load --format json` with no `.env`: exit 0. `json-full`: all eleven added keys present,
  none required, none carrying a value; `MASTRA_HOST`, `PORT`, `DOCKER_HOST` still `isSensitive: false`.
- `npm ci`, `npm run check` (tsc clean), `npm test`: 59 tests passing.
- `git diff --diff-filter=DR` against the baseline is empty; `docs/Self-hosting research.md`,
  `AGENTS.md` and `src/` are unchanged.
- Zero false positives verified for every widened pattern before adding it: `fails the pattern` and
  `varlock load` across all six READMEs, `/dev/random|uuidgen|pwgen` and word-`>`-word across both env
  files, and the 60+ base64 line shape across every tracked non-vendored file.

**Residual risks.**
- Guard 6 remains a blacklist. It is wider than it was in four directions, but no list of forbidden
  spellings can be complete: a restatement phrased in words none of its terms cover still passes. The
  checkable property is the partition; this guard is a net, not a proof.
- The three ledger entries stand unclosed: the schema is never resolved against a boot environment,
  guard 2 cannot read a key name out of an array literal, and nothing protects the `varlock run --`
  invocation the whole mechanism depends on.
- The prefix rule pins four families. Keys outside them — the residual set `README.md` owns, and
  `MASTRACODE_*` generally — are still only checked for disjointness and totality, so one of those can
  move between owner tables with the gate green.
