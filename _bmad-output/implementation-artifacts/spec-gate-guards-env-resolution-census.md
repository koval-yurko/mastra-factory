---
title: 'Gate guards for reverse sensitivity, plist env resolution and computed-key reads (DW-61, DW-62, DW-79)'
type: 'chore'
created: '2026-09-25'
status: 'done'
baseline_revision: 'b0ee682cc80945608990573cf6d92945ee2ad6f1'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Guard 26's array-literal arm and guard 41's sixth spelling see SINGLE-LINE
      literals only, so an undeclared key in a literal wrapped across lines is
      still invisible to both.
    evidence: |-
      Measured in this worktree: adding

        const ZZ_EXTRA = [
          'MASTRA_ZZUNDECLARED_ONE',
        ];
        export const zzHas = ZZ_EXTRA.some(key => Boolean(process.env[key]));

      to `src/mastra/config/sandbox.ts` leaves guards 26 and 41 — and every other
      entry of `[verify].commands` — at exit 0, while the same key added to the
      single-line literal at `:288` fails guard 26 naming `file:line:token`. Both
      arms join quoted tokens to the computed index BY LINE NUMBER, which is what
      keeps the `LOCAL_SANDBOX_ENV_KEYS` host-variable sweep correctly invisible
      and what leaves this class open. Prettier wraps such a literal the moment it
      exceeds the print width, so the shape is reachable without anyone choosing
      it. Not closed here for the reason DW-62's own ledger text gives: reading
      array elements across lines needs a parser rather than a grep, which is a
      new mechanism rather than a direct correction. The guard's comment now
      scopes itself to single-line literals and states this residual instead of
      claiming the class is closed. Smallest fix: an AST-based extraction, or a
      multi-line join in the per-file scan that is bounded by the enclosing
      brackets.
    location: >-
      .bmad-loop/policy.toml [verify].commands guards 26 and 41
    severity: low
  - summary: >-
      Entry 63 resolves .env.schema against the LaunchAgent PLISTS only, but
      launchd runs ops/factory-start.sh, which exports its own pairs on top —
      so a declared key the wrapper sets is value-checked by nothing.
    evidence: |-
      Measured in this worktree: adding

        export MASTRACODE_MAX_SANDBOXES=abc

      to `ops/factory-start.sh` after line 26 leaves ALL 63 entries of
      `[verify].commands` at exit 0, while
      `env MASTRACODE_MAX_SANDBOXES=abc npx varlock load --format json` exits 1 —
      i.e. the next `launchctl kickstart` fails in exactly the way DW-61
      describes. Entry 28 reconciles the wrapper's exported key NAMES against
      `.env.schema` but never resolves a value; entry 63 only overlays plist
      pairs. The wrapper also wins over the plist for keys both set:
      `ops/factory-start.sh:26` is `export DOCKER_HOST="unix://$DOCKER_SOCKET"`,
      one of the only two pairs entry 63 value-checks (the two happen to agree
      in value on this host, so nothing fails today). Not closed here because
      the wrapper's values are shell expressions that need the script's prologue
      RUN to resolve — a new mechanism rather than a wider grep — and because
      DW-61's own smallest-fix text named only the plists, so this is a residual
      of the ledger entry rather than a miss against its letter. Entry 63's
      comment and its failure message now say plainly that the environment they
      build is what launchd hands the job BEFORE the wrapper runs, and name this
      gap. Smallest fix: overlay the literal `export KEY=value` pairs entry 28
      already greps out of `ops/*.sh`, value-checking only those whose value
      carries no unexpanded `$`; or run the wrapper's prologue in a subshell and
      diff the resulting environment.
    location: >-
      .bmad-loop/policy.toml [verify].commands entry 63; ops/factory-start.sh:21-26
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Three measured holes in what `.bmad-loop/policy.toml` `[verify].commands` can see. (1) The sensitivity census runs one direction only — guards 4 and 44 assert `isSensitive === false` for five keys that must stay public, and nothing asserts a key that must stay masked still is, so a `# @public` line above `POSTGRES_PASSWORD` or a one-character edit to `.env.schema`'s `@defaultSensitive=true` header ships green (DW-79). (2) No command resolves `.env.schema` against the environment the deployment actually boots with: the gate runs with no `.env` and none of `ops/launchagents/*.plist`'s `EnvironmentVariables` exported, so a future `@type`/`@required` tightening on a plist-supplied key (`DOCKER_HOST`, `NODE_ENV`) passes the gate and fails the boot (DW-61). (3) The two schema-completeness censuses extract only literal `process.env.KEY` and `process.env["KEY"]`, so a key read through `process.env[key]` over an array literal — how the four Platform keys are read — is invisible to both (DW-62).

**Approach:** Append two new entries to the end of `[verify].commands` (a reverse-sensitivity census and a plist-environment resolution census) and strengthen two existing census guards in place with the computed-key spelling guard 38 already carries. Every assertion is additive; no existing assertion is removed or weakened, and no entry is inserted, so no guard is renumbered.

## Boundaries & Constraints

**Always:** Append new entries at the array's end; edit guards 26 and 41 in place (strengthening only). Keep one entry per line — guard 53's census is line-based. Prove every new or changed guard BOTH ways: green on the clean tree, and red with a named message on a deliberate break that is reverted immediately. Keep the numbered comment block above the array in step with what each guard does and does not assert, including the claims this change makes false. Derive key sets from `.env.schema` or from the plists wherever a hand-written list would go stale.

**Never:** Do not edit `.env.schema`, `ops/launchagents/*.plist`, `docker-compose.yml`, or any file under `src/` as part of the deliverable (temporary break-test edits must be reverted). Do not renumber or delete an existing entry. Do not touch `_bmad-output/implementation-artifacts/deferred-work.md` or the sprint board. Do not replace the plist's `PATH` when exporting its pairs — it would repoint the `node`/`npx` that runs the check.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reverse census, clean tree | `.env.schema` as committed | New sensitivity guard exits 0 | No error expected |
| `# @public` added above `POSTGRES_PASSWORD` | one inserted line at `.env.schema:332` | exit 1 naming `POSTGRES_PASSWORD` and the `# @public` line as the cause | message distinguishes public-leak from absent declaration |
| Header flipped to `@defaultSensitive=false` | `.env.schema:5` edited | exit 1 naming the header and at least one header-inherited key | header named as the likely single cause |
| `# @sensitive` added above a header-inherited key | `.env.schema` annotation block edited | exit 1: the key has left the class that pins the header | message says to keep it header-inherited or move it to the explicit list |
| Declaration deleted | `POSTGRES_PASSWORD=` removed | exit 1 with the absent-declaration message, not the masked-key one | two distinct branches |
| Schema deleted / emptied / unparseable | no or broken `.env.schema` | exit 1 naming `.env.schema`, not the keys | file test, then `varlock load` exit code, then `JSON.parse` backstop |
| Plist resolution, clean tree | both plists as committed | New resolution guard exits 0; `DOCKER_HOST` and `NODE_ENV` resolve to the plist values | No error expected |
| `@type` tightening on a plist key | `# @type=enum("development", "test")` above `NODE_ENV=` | exit 1 naming the plist, the key and varlock's own error text | `varlock load` exits 1 and reports `errors.configItems` |
| Plist carries a key `.env.schema` does not declare | new pair in `EnvironmentVariables` | pair is still exported; only declared keys are value-checked (guard 29 owns the declaration rule) | no false failure |
| Plist with no `EnvironmentVariables` | `plutil -extract` exits non-zero | that plist is skipped, the census continues | vacuity floor still applies |
| Computed-key census, clean tree | `src/mastra/config/sandbox.ts:288-289` | guards 26 and 41 exit 0; the four Platform keys are seen | No error expected |
| Undeclared key in an array literal | `'MASTRA_ZZUNDECLARED'` added to the literal at `:288` | guard 26 exits 1 naming `file:line:'KEY'` | declared-key check is the existing `sk` set |
| Declared key gains a second read via the literal | a key with one literal read added to `:288` | guard 41 exits 1 with its at-most-one message | existing message path |
| Extraction silently stops matching | patterns edited | both guards exit 1 on their own probe line before censusing | self-probe, not a tree sentinel |

</intent-contract>

## Code Map

- `.bmad-loop/policy.toml` -- the only deliverable file. `[verify].commands` is the array at `:2775-2837`, one entry per line, 61 entries at `:2776-2836`; guard N is line `2775+N`.
- `.bmad-loop/policy.toml:2779` -- guard 4: `npx varlock load --format json-full` piped into `node -e`, asserting `isSensitive === false` for `MASTRA_HOST`, `PORT`, `DOCKER_HOST`. The pipeline shape to mirror.
- `.bmad-loop/policy.toml:2819` -- guard 44: the same for `POSTGRES_USER`, `POSTGRES_DB`, plus the ordered defences worth copying verbatim — schema non-empty, then `varlock load` exit code, then `JSON.parse`, then absent-vs-masked as two messages.
- `.bmad-loop/policy.toml:2801` -- guard 26, the schema-completeness census. Extraction is `e="process[.]env[.][A-Za-z_]…|process[.]env[[][\"$q][A-Za-z_]…"`, then `k=${x##*[!A-Za-z0-9_]}` against `sk` (keys grepped as `^NAME=` out of `.env.schema`). Add the computed-key arm after the existing `o=` check; do not rewrite the existing arm.
- `.bmad-loop/policy.toml:2813` -- guard 38. Carries the pattern to port, verbatim: `pa="[\"$q$bt]$k[\"$q$bt].*process[.]env([?][.])?[[]"`, added as a fifth `-e` to its `grep -onE`.
- `.bmad-loop/policy.toml:2816` -- guard 41, the whole-plane census. Key set derived from `.env.schema` with a floor of 40; patterns `pd`/`pb`/`pe`/`ps`. Add `pa` and a fifth `-e`.
- `.bmad-loop/policy.toml:437-459` -- guard 26's comment block; `:1008-1035` guard 38's (already describes the sixth spelling); `:1129-1158` guard 41's, which currently claims the sixth spelling "is deliberately NOT used here … it would … fail a correct tree" — MEASURED FALSE on this tree (see Design Notes), so it must be rewritten, not left; `:1318-1355` guard 44's.
- `.env.schema:5` -- `# @defaultSensitive=true`, the header the reverse census pins. `:91,96,104,127,135,256` are the only six explicit `# @sensitive` annotations (`SLACK_APP_SIGNING_SECRET`, `SLACK_APP_BOT_TOKEN`, `SLACK_APP_CLIENT_SECRET`, `FACTORY_CREDENTIAL_ENCRYPTION_KEY`, `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS`, `BETTER_AUTH_SECRET`); every other masked key is masked BY the header. `POSTGRES_PASSWORD=` is at `:332`.
- `ops/launchagents/ai.mastra.factory.plist` -- `EnvironmentVariables` = `PATH`, `DOCKER_HOST`, `NODE_ENV`. `ops/launchagents/ai.mastra.colima.plist` -- `PATH` only. Read them with `plutil -extract EnvironmentVariables json -o - "$p"` (measured: valid JSON on stdout, exit 0).
- `src/mastra/config/sandbox.ts:288-289` -- read-only. The two array-literal lines: `['MASTRA_PLATFORM_ACCESS_TOKEN', 'MASTRA_PLATFORM_SECRET_KEY'].some(key => Boolean(process.env[key]?.trim()))` and the `['MASTRA_ENVIRONMENT_ID', 'MASTRA_PROJECT_ID'].every(…)` beside it. `:56` is `const value = process.env[key];` with its key names lines away — the host-variable sweep that must stay invisible.
- `_bmad-output/implementation-artifacts/spec-gate-guards-artifact-invariants.md` -- the previous sweep; its Verification section documents the `smol-toml` runner used to execute every entry in order.

## Tasks & Acceptance

**Execution:**
- `.bmad-loop/policy.toml` -- append entry 62, the REVERSE SENSITIVITY CENSUS: guard 44's ordered defences, then for two hand-written classes assert `isSensitive === true` — header-inherited secrets (at least `POSTGRES_PASSWORD`, `DATABASE_URL`, `GITHUB_APP_PRIVATE_KEY`, `WORKOS_COOKIE_PASSWORD`) and explicitly annotated ones (at least `BETTER_AUTH_SECRET`, `FACTORY_CREDENTIAL_ENCRYPTION_KEY`) — plus an assertion that no header-inherited key has acquired its own `# @sensitive` line, which is what keeps the header pinned -- closes DW-79.
- `.bmad-loop/policy.toml` -- append entry 63, the PLIST ENVIRONMENT RESOLUTION CENSUS: for each `ops/launchagents/*.plist`, extract `EnvironmentVariables` with `plutil`, export every pair except `PATH`, run `npx varlock load --format json-full`, require exit 0, and require each pair whose key `.env.schema` declares to resolve to that value (to a defined value when the key is sensitive). Floor it so it cannot pass vacuously -- closes DW-61.
- `.bmad-loop/policy.toml` -- strengthen guard 26 in place: append a computed-key arm that, on lines matching `process[.]env([?][.])?[[][[:space:]]*[A-Za-z_]` with whole-line comments blanked, extracts quoted `[A-Z][A-Z0-9_]+` tokens and checks each against `sk`, guarded by a self-probe rather than a tree sentinel -- closes the guard-26 half of DW-62.
- `.bmad-loop/policy.toml` -- strengthen guard 41 in place: add guard 38's `pa` verbatim and a fifth `-e "$pa"` -- closes the guard-41 half of DW-62.
- `.bmad-loop/policy.toml` -- update the numbered comment block: two new numbered entries for 62 and 63 in the established style (what is asserted, why this shape, what it does NOT assert, and the recorded both-ways matrix); rewrite guard 41's "deliberately NOT used here" paragraph and guard 26's "array-literal reads are a known gap" paragraph, both of which this change makes false; correct guard 44's comment where it implies the census runs only in the public direction -- the comments are the only documentation these guards have.

**Acceptance Criteria:**
- Given the tree as committed, when every entry of `[verify].commands` is run in order through `/bin/sh -c`, then all 63 exit 0.
- Given a break from each row of the I/O matrix applied one at a time, when the affected entry is run, then it exits 1 and its message names the file and the offending key or value, and `git status --porcelain` names only `.bmad-loop/policy.toml` and this spec after the break is reverted.
- Given the four Platform keys read through the array literal at `src/mastra/config/sandbox.ts:288-289`, when guards 26 and 41 run, then both see all four as reads and both still exit 0.
- Given `src/mastra/config/sandbox.ts:56`'s host-variable sweep, whose key names sit lines away from its `process.env[key]`, when guards 26 and 41 run, then neither counts any of `LOCAL_SANDBOX_ENV_KEYS` as a read.
- Given no `.env` file and no exported plist variables, when entry 63 runs, then it still resolves `DOCKER_HOST` and `NODE_ENV` to the values `ops/launchagents/ai.mastra.factory.plist` supplies.
- Given the comment block above the array, when it is read after this change, then no paragraph claims a gap this change closed, and every statement about guards 26, 41, 44, 62 and 63 matches what those entries do.

## Spec Change Log

- 2026-09-25, during implementation: two measurements refined entry 62's and entry 63's failure MESSAGES; no assertion in the spec changed. (1) An EXPLICITLY annotated key cannot be unmasked by one edit. Adding `# @public` beside a `# @sensitive` line makes varlock reject the definition outright (`decorator @public is incompatible with @sensitive`, exit 1), and deleting the `# @sensitive` line alone leaves the key masked by the header — correctly leaving entry 62 green. The explicit-class message therefore names the two real paths (replace one line with the other, or delete it while the header is no longer `@defaultSensitive=true`) instead of "a `# @public` line was added above it". The I/O matrix row for the explicit class is exercised by REPLACING line 256.
- 2026-09-25, during implementation: entry 63's value-EQUALITY branch is a backstop with no demonstrated break on this varlock. Measured: varlock does not trim (`NODE_ENV="  production  "` resolves with its spaces), does not coerce a numeric string to a number, and a schema default never overrides `process.env`; the observable failure of a tightening is a non-zero exit, which the guard reports with `errors.configItems`. The branch is kept and the comment block says plainly that it is unexercised rather than claiming a verified break.
- 2026-09-25, matrix test audit: the last I/O matrix row asks for BOTH census guards to fail on their own probe line. Guard 26 had one; guard 41 relied on its pre-existing forty-key floor, which cannot see a pattern that stopped matching — the key set stays whole and every count merely falls to zero, which at-most-one accepts. A self-probe was added to guard 41. Its first form held a second copy of the pattern and was measured GREEN with the census copy replaced by one matching nothing, so the pattern is now emitted once by a `pf()` helper that both the census and the probe call; the text it emits is guard 38's `pa` character for character. Measured after: guard 41 exits 0 on the clean tree, exits 1 naming the probe when the helper's pattern is mangled, and the full array is 63/63.

- 2026-09-25, review round 1: entry 62's subject is now DERIVED, not the six hand-written keys the spec's Tasks named as a floor ("at least"). Measured: 22 keys resolve masked on this tree, so a six-key list left 16 secrets uncovered and `# @public` above `ANTHROPIC_API_KEY` shipped green. The arm is a naming convention over `.env.schema` NAMES (`_SECRET`/`_SECRETS`/`_PASSWORD`/`_TOKEN`/`_KEY`/`_KEYS` — 18 keys, zero false positives), the four masked keys the convention cannot reach (`DATABASE_URL`, `APP_DATABASE_URL`, `REDIS_URL`, `MASTRA_DB_PATH`) joined the header-inherited list, and a completeness arm requires every masked key to be covered by one of the three. The convention reads names only, never `isSensitive`, so it is not circular.
- 2026-09-25, review round 1: entry 63 resolves against the boot environment rather than the ambient one. Measured: with the plist pairs merely overlaid on the gate's own environment, a stray `MASTRACODE_MAX_SANDBOXES=abc` in the caller's shell made the entry exit 1 blaming `ai.mastra.factory.plist`. The child environment is now this process's, minus every key `.env.schema` declares (`PATH` excepted), plus the plist pairs.
- 2026-09-25, review round 1: guard 41's `pa` was narrowed to require a COMPUTED index, but the double-count it was said to fix does NOT reproduce — `grep` is leftmost-longest, so the bracketed-literal pattern consumes the quoted name first and the count is 1 with either spelling (measured both ways). The narrowing is kept because the pattern should mean what the guard's own message says and because leftmost-longest is a `grep` detail this guard should not rest on; the comment records the non-reproduction rather than claiming a break.
- 2026-09-25, review round 1: guard 26's array-literal arm covers SINGLE-LINE literals only. Measured: a literal wrapped across lines, read by a `.some(key => process.env[key])` further down, leaves guards 26 and 41 at exit 0. The comment states this residual and keeps it separate from the `LOCAL_SANDBOX_ENV_KEYS` host-variable case, which is invisible by design.
- 2026-09-25, review round 1 (applied during triage verification): entry 62 still held the seven header-inherited key names twice — a shell `hk=` for the annotation walk and a `const hi=[…]` literal for the `isSensitive` assertion — and the two halves assert different things about the same keys, so a drift would leave the walk pinning fewer keys than the census asserts with nothing reporting it. The shell `hk=` is now set before the pipe and passed to the `node -e` half as an argument; the node half reads `process.argv[3]`. The explicit list stays inside the node half because nothing else reads it. Measured after: entry 62 exits 0 clean and exits 1 on `# @public` above `POSTGRES_PASSWORD`, `REDIS_URL` and `MASTRA_DB_PATH`, on `# @sensitive` above `POSTGRES_PASSWORD`, and on the flipped header; full array 63/63.

- 2026-09-25, follow-up review pass: guard 26's computed-key arm now takes tokens only from BRACKETED GROUPS in the truncated prefix, not from the whole prefix. The round-1 truncation fixed tokens AFTER the index and left the near side open: measured, `mode === 'DRY_RUN' && Boolean(process.env[key])` under `src/` made guard 26 exit 1 at `sandbox.ts:301:'DRY_RUN'` and tell the author to declare `DRY_RUN` — a gate failing a correct tree. Measured after: green on that line, still red on `'MASTRA_ZZUNDECLARED'` added to the literal at `sandbox.ts:288`, and the `cscan()` probe fails when the bracket pattern is mangled.
- 2026-09-25, follow-up review pass: entry 62's annotation walk accepts `# @sensitive=` as well as the bare decorator. Measured: varlock honours `# @sensitive=true`, and with the bare-only test `# @sensitive=true` above `POSTGRES_PASSWORD` took the key out of the header-pinned class with entry 62 at exit 0. Measured after: exit 1 with the header-pin message.
- 2026-09-25, follow-up review pass: entry 62's explicit list names all six annotated keys rather than two. Coverage never depended on it — the other four are convention-matched — but the MESSAGE did: `# @sensitive` above `SLACK_APP_BOT_TOKEN` replaced by `# @public` produced the "MISNAMED — rename it" advice, which is wrong for a key carrying an explicit annotation. Measured after: the explicit-class message.
- 2026-09-25, follow-up review pass: entry 62's completeness message names `# @public` as the fix for a key that is genuinely public. With `@defaultSensitive=true`, any newly declared unannotated key resolves masked, so the arm fires on a plain knob and previously offered only two wrong fixes.

## Review Triage Log

### 2026-09-25 — Follow-up review pass

- verdicts: 40 findings — high 0, medium 8, low 30, false 2, maybe-false 0
- findings:
  - `[medium]` `[defer]` blind-hunter: entry 63 misses `ops/factory-start.sh`, so it is not resolving the boot environment it claims to — confirmed (`ops/factory-start.sh:26` is `export DOCKER_HOST="unix://$DOCKER_SOCKET"`, which overrides the plist pair; the two agree in value on this host so nothing fails today). Deferred: the wrapper's values are shell expressions needing the prologue RUN. The comment/message overclaim ("what launchd gives the job") was corrected in place.
  - `[low]` `[patch]` blind-hunter: entry 62 resolves against the gate's ambient environment and reports caller pollution as a broken schema — confirmed by measurement (`MASTRACODE_MAX_SANDBOXES=abc` made entry 62 print "the schema itself is broken"). Graded low because entry 3 runs the same load and fails first from inside the gate. Patched: the message names both causes and points at entry 3.
  - `[low]` `[patch]` blind-hunter: the stated justification for entry 62's third assertion is measurably false now that the derived arm exists — confirmed (12 of the 18 convention-matched keys carry no annotation of their own, so a flipped header fires the derived arm whatever the seven do). Patched: the rationale is rewritten to the reason that survives — a key with its own annotation has left the class the header-inherited list claims it is in.
  - `[low]` `[patch]` blind-hunter: guard 26's truncation makes a second array literal on the same line invisible and the residual paragraph omits it — confirmed. Patched: stated as shape (c) in the "WHAT IT STILL DOES NOT SEE" paragraph.
  - `[low]` `[patch]` blind-hunter: guard 41's self-probe is the pattern-only form guard 26's bullet argues against — confirmed for the probe, but the WIRING has its own control the comment never credited: the exactly-one arm over three keys drops to 0 if the pipeline stops matching. Patched: a paragraph states what the probe does and does not cover, and why it is pattern-shaped.
  - `[low]` `[reject]` blind-hunter: the Spec Change Log contradicts the policy comment on whether guard 41's pattern equals guard 38's — real, and its fix is to edit this build's spec change log, which triage does not do.
  - `[low]` `[reject]` blind-hunter: every line citation in the spec's Code Map is stale (the array moved to `:3092`) — real; the fix edits this build's spec.
  - `[low]` `[reject]` blind-hunter: the I/O matrix has no row for the derived, completeness or explicit arms — real; the fix edits this build's spec, and those arms are exercised in the comment's recorded matrix and again in this pass.
  - `[low]` `[reject]` blind-hunter: the diff touches `deferred-work.md` although the spec's Never forbids it — real as written; the ledger is the sweep orchestrator's bookkeeping and this session is instructed not to modify it, so it is out of this story's reach in both directions.
  - `[low]` `[reject]` blind-hunter: neither new entry's vacuity floor is exercised in its both-ways list — real; rejected as negligible, the floors are single integer comparisons over counts the same guard prints in its own message, and the completeness arm (62) is what the comment already credits for catching a broken derivation.
  - `[low]` `[patch]` blind-hunter: both node halves read `.env.schema` unguarded and entry 63 has no regular-file check, so a directory yields a raw `EISDIR` — real; patched with `test -f` alongside `test -s`, matching entry 62.
  - `[low]` `[reject]` blind-hunter: DW-62 is closed against a stale location and DW-108's `reason:` drops its Smallest-fix clause — real, and both live in `deferred-work.md`, which the intent's Never and this session's instructions put outside reach.
  - `[false]` `[reject]` blind-hunter: the spec's `review_loop_iteration: 0` / `status: in-review` contradict a body recording completed passes — refuted: both are the workflow's own state for this follow-up pass, written by step-01 and step-04, not a drifted record.
  - `[medium]` `[patch]` edge-case: guard 26's `cscan` reads a quoted uppercase non-key literal before a computed index as an env key — confirmed by measurement (`'DRY_RUN'`, exit 1 on a correct tree). Patched: tokens are taken only from bracketed groups, which makes the arm mean the array-literal read its message describes.
  - `[low]` `[patch]` edge-case: the `sed` truncation cuts at the FIRST computed index, dropping a later literal's tokens — same root cause as the blind-hunter row; recorded in the residual paragraph.
  - `[medium]` `[patch]` edge-case: a header-inherited key annotated `# @sensitive=true` escapes the walk — CONFIRMED by measurement (varlock honours the spelling; entry 62 exited 0). Patched: the case arm accepts `"# @sensitive"|"# @sensitive="*` and the message names both spellings.
  - `[low]` `[patch]` edge-case: entry 62's `ex` list names 2 of the 6 explicitly annotated keys, so four get the convention message — confirmed; patched by completing the list.
  - `[low]` `[reject]` edge-case: any trimmed line containing `=` resets `blk`, so a decorator separated from its declaration by such a line escapes — real in principle; no such shape exists in `.env.schema` (decorators sit directly above declarations) and the fix is a parser-shaped change to the walk.
  - `[low]` `[reject]` edge-case: a non-identifier `EnvironmentVariables` key is silently neither exported nor checked — real; launchd environment keys are identifiers in practice and the fix adds a branch for a state nobody meets.
  - `[low]` `[patch]` edge-case: entry 63 never inspects `r.error` for the `npx` spawn, so an unspawnable `npx` is reported as "exited null against the environment <plist> supplies" — real; patched with an explicit branch, mirroring the `plutil` `x.error` patch from round 1.
  - `[low]` `[reject]` edge-case: the `n<2` vacuity floor is a total across plists rather than per-plist — real in principle; only two plists exist and the colima one contributes zero pairs, so the floor already requires the factory plist. Fix adds per-plist bookkeeping for a state no tree reaches.
  - `[low]` `[reject]` edge-case: guard 41's `pa` counts a quoted declared key sharing a line with a computed index as a read — carried from round 1 (`[low] [reject]`, test-teardown form); the code still reads as that row describes, so its verdict and route stand.
  - `[low]` `[reject]` edge-case (claim): guard 41's `pa` is not guard 38's text "verbatim" as the spec's Tasks say — real and already recorded in the guard's own comment ("ONE CHANGE WAS MADE TO THE TEXT GUARD 38 CARRIES"); the remaining fix edits this build's spec.
  - `[medium]` `[defer]` verification-gap: no entry resolves `.env.schema` against `ops/factory-start.sh`'s exports, the second env-setting site in the boot chain (filed pre-verified: `export MASTRACODE_MAX_SANDBOXES=abc` in that script left all 63 entries green while `varlock load` with that value exits 1) — grouped with the blind-hunter row and deferred with the smallest fix recorded.
  - `[low]` `[patch]` verification-gap: the recorded residual is narrower than the measured one — a SINGLE-LINE literal whose read sits on another line is also invisible (filed pre-verified) — confirmed. Patched: the residual is now stated as "quoted tokens are only seen on the physical line that carries the computed index", with all three invisible shapes named.
  - `[medium]` `[patch]` verification-gap (other): guard 26's arm reports non-env string literals as undeclared keys — same root cause as the edge-case row; patched by the bracket restriction.
  - `[low]` `[patch]` verification-gap (other): entry 63's comment credits guard 29 with the declaration rule; it is guard 28 — confirmed (entry 29 is the tracked-`.env`/credential-shape scan). Patched.
  - `[low]` `[reject]` verification-gap (other): the spec's triage log says `plutil -lint` is entry 4; it is entry 8 — real (confirmed: `.bmad-loop/policy.toml:3100`), and the substance of that rejection stands since entry 8 still runs first. The fix edits this build's spec.
  - `[medium]` `[patch]` intent-alignment: the completeness arm fires on a plainly non-secret new key and offers two fixes, neither of them the right one — confirmed (`@defaultSensitive=true` masks any unannotated declaration). Patched: the message names `# @public` first.
  - `[low]` `[patch]` intent-alignment: the explicit list names two of six — same root cause as the edge-case row; patched together.
  - `[low]` `[reject]` intent-alignment: the annotation walk covers 7 of the 16 header-inherited keys, so nine can take an annotation unreported — real in principle; rejected because the header pin is over-determined by the derived arm (12 unannotated convention-matched keys), so the walk's job is keeping the seven-name list honest about itself, which is what the corrected rationale now says.
  - `[low]` `[patch]` intent-alignment: entry 63 controls the process environment but not the `.env` files varlock reads, so a developer checkout with a `.env` resolves differently from boot — confirmed, and the plist pairs still win for their own keys (measured). Patched: stated in the comment as the second of two named gaps.
  - `[low]` `[patch]` intent-alignment: the `if (k !== "PATH") delete en[k]` exception is inert because `.env.schema` declares no `PATH`, while the comment presents it as the protection — confirmed. Patched: the comment says it is defensive only and names the plist-side filter as what does the work.
  - `[medium]` `[patch]` intent-alignment: guard 26's check is at the physical-line level while the intent's class is any array-literal read — grouped with the bracket-restriction patch, which narrows the arm onto literals; the remaining width is the residual paragraph's shapes (a)-(c).
  - `[low]` `[reject]` intent-alignment: the Approach says "the computed-key spelling guard 38 already carries" while guard 41's copy was narrowed to require a computed index — grouped with the edge-case `verbatim` row; the divergence is deliberate, documented in the guard's comment, and the remaining fix edits this build's spec.
  - `[low]` `[reject]` intent-alignment: the matrix row "Declared key gains a second read via the literal" reads as if any declared key would fire — real as wording; the behaviour is correct and the fix edits this build's spec.
  - `[medium]` `[reject]` intent-alignment: the multi-line-literal residual — carried from round 1, where it was patched (claim) and deferred (widening); the code and comment still read as that row describes, so it is neither patched nor deferred again.
  - `[low]` `[reject]` intent-alignment: the value-equality branch ships with no both-ways proof — carried from round 1 (`[low] [reject]`); the guard's comment still declares it, so the verdict stands.
  - `[false]` `[reject]` intent-alignment: the proof surface is prose rather than an artifact — carried from round 1 (`[false] [reject]`, DW-90 already records it).
  - `[low]` `[reject]` intent-alignment: `deferred-work.md` is modified although the Never list names it — grouped with the blind-hunter row; out of this session's reach.

### 2026-09-25 — Review pass

- verdicts: 44 findings — high 0, medium 6, low 25, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: entry 62 pinned 6 of the ~22 keys varlock masks, so `# @public` above any other secret shipped green — confirmed (measured: `# @public` above `ANTHROPIC_API_KEY` left entry 62 and every other command at exit 0). Patched: a derived arm now requires every declared key whose NAME ends in `_SECRET`/`_SECRETS`/`_PASSWORD`/`_TOKEN`/`_KEY`/`_KEYS` to resolve masked (18 keys, zero false positives measured), the hand-written list gained the four masked keys the convention cannot reach, and a completeness arm fails on any masked key no arm covers.
  - `[low]` `[patch]` blind-hunter: entry 62's key sets are hand-written and `hk` was written twice in two languages — confirmed for the duplication half; the derived arm above removes the staleness, and the remaining seven-name list is now written once in shell and passed into the `node -e` half as an argument.
  - `[medium]` `[patch]` blind-hunter: entry 62's annotation walk ran before `varlock load`, breaking the ordered defences it claims to inherit — confirmed by measurement (a schema both unparseable and carrying `# @sensitive` above `POSTGRES_PASSWORD` reported the key-level annotation error, not the broken schema). Patched: the walk now runs after the `varlock load` exit-0 check and after the header lookup.
  - `[medium]` `[patch]` blind-hunter: entry 62's annotation walk had no positive control, so a walk that stops matching passes silently — real; patched with a saw-list that fails naming any header-inherited declaration the walk never reached.
  - `[low]` `[patch]` blind-hunter: entry 63's comment credits a non-zero `plutil` exit for skipping the colima plist — confirmed false by measurement (`plutil -extract EnvironmentVariables json -o -` exits 0 on that plist and prints `{"PATH":…}`); patched: the comment now says the plist drops out at the `PATH` filter.
  - `[low]` `[patch]` blind-hunter: entry 63 conflated a `plutil` spawn failure with "no EnvironmentVariables" — real; patched by checking `x.error` separately and stating the macOS dependency.
  - `[medium]` `[patch]` blind-hunter: entry 63's "the gate runs with no `.env`" premise was not enforced; the child env was the gate's full ambient environment — confirmed (a stray `MASTRACODE_MAX_SANDBOXES=abc` made entry 63 exit 1 blaming the plist). Patched: every key `.env.schema` declares is deleted from the inherited copy before the plist pairs are overlaid; measured green again with that pollution present.
  - `[low]` `[patch]` blind-hunter: entry 63's masked-key branch dropped the value comparison although the fact of a mismatch can be reported without the value — real; patched to compare and report without printing either side.
  - `[medium]` `[patch]` blind-hunter: the census self-probes validated the patterns, not the wiring — confirmed for guard 26 (replacing the comment-blanking `sed` with `s,.*,,` left the guard at exit 0 with the probe green). Patched: guard 26's per-file scan is a `cscan()` function and the probe runs a synthetic line through it via `/dev/stdin`.
  - `[medium]` `[patch]` blind-hunter: guard 26's new arm extracted any quoted SCREAMING_SNAKE token anywhere on the line, so `process.env[key] ?? "NOT_SET"` would be reported as an undeclared key — real; patched by truncating each candidate line at its computed index and taking tokens only from the part before it.
  - `[false]` `[reject]` blind-hunter: "a single line carrying both spellings double-counts in guard 41" — refuted by measurement. `Boolean(process.env["POSTGRES_USER"]) && Boolean(process.env[zzKey])` on one line counts 1, not 2, on both the pre-change and post-change guard: `grep` is leftmost-longest, so the bracketed-literal pattern consumes the quoted name and `pa` cannot match it again. The narrowing was kept anyway (it aligns 41 with 26) and the comment records the non-reproduction instead of an unearned "measured" claim.
  - `[low]` `[patch]` blind-hunter: entry 62 hardcoded `.env.schema line 5` in its messages — real; patched to locate the `# @defaultSensitive=` line and print what it found.
  - `[false]` `[reject]` blind-hunter: "the in-place strengthenings are documented twice" — partly refuted: guard 26's numbered block already ends in a pointer at its bullet rather than restating it. The guard-41 half was real and was patched under the last row below.
  - `[low]` `[reject]` blind-hunter: the spec artifact's Code Map still describes the pre-change array, its change log references a matrix row that does not exist, and `context:` is empty — rejected under the rule that a finding whose fix is to edit this build's spec is not actionable here.
  - `[medium]` `[patch]` edge-case: a quoted non-env uppercase literal sharing a line with a computed index is read as a key — same defect as the blind-hunter row above; patched by the line truncation.
  - `[low]` `[patch]` edge-case: a trailing `//` comment on a candidate line is still scanned — same defect; the truncation removes anything after the computed index, which is where such a comment sits.
  - `[low]` `[reject]` edge-case: a test teardown naming a declared key on the same line as `delete process.env[k]` would count as a read in guard 41 — real in principle, no such line on this tree, and the proposed fix is a `*.test.ts` carve-out, which is added complexity for a defect nobody meets in everyday use.
  - `[low]` `[reject]` edge-case: `pa` is order-sensitive (the quoted token must precede the index) — real, and deliberately kept: making it order-agnostic would widen guard 41 onto exactly the trailing-token class the guard-26 truncation was just narrowed to exclude, and the two censuses would then disagree in the other direction.
  - `[low]` `[patch]` edge-case: both probe lines used single quotes only, so a broken `$dq` or `$bt` would pass the probe — real; patched, each probe now exercises all three quote styles and requires a hit from each.
  - `[low]` `[patch]` edge-case: `case "$l" in *@sensitive*)` is a substring match — real; patched to a match on a line that is exactly `# @sensitive` with trailing blanks trimmed.
  - `[false]` `[reject]` edge-case: "an indented `# @sensitive` silently unpins the header" — not established: measured, varlock did not resolve a key whose only decorator was indented, so a column-0-only reading matches what varlock itself honours. Trimming the leading whitespace would make the guard stricter than the tool it is checking.
  - `[low]` `[patch]` edge-case: a final line with no trailing newline is dropped by the read loop — real (no such line today; `.env.schema` ends `VITE_REACT_GRAB=\n`); patched with `while IFS= read -r l || [ -n "$l" ]`.
  - `[low]` `[patch]` edge-case: a `plutil` spawn failure is swallowed by the skip branch — same defect as the blind-hunter row; patched together with it.
  - `[low]` `[patch]` edge-case: a sensitive plist value of `""` is reported as the schema discarding it — real; patched, only `undefined`/`null` now count as no value.
  - `[low]` `[patch]` edge-case: a non-string `EnvironmentVariables` value becomes `"[object Object]"` — real; patched with an explicit type check naming the plist and the key.
  - `[medium]` `[patch]` edge-case (claim): "THAT GAP IS CLOSED" holds only for single-line literals — confirmed by measurement (a wrapped literal of undeclared keys leaves guards 26 and 41 at exit 0). Patched: the comment now scopes the arm to single-line literals and states the residual; the widening itself is deferred below.
  - `[low]` `[patch]` edge-case (claim): the colima-skip explanation is wrong — same as the blind-hunter row; patched.
  - `[low]` `[patch]` edge-case (claim): the "plist with no EnvironmentVariables" row describes a state an earlier guard hard-fails first — real; the comment now says so instead of listing it as a live skip path.
  - `[medium]` `[patch]` edge-case (claim): the ordered defences are violated by the annotation walk — same as the blind-hunter row; patched.
  - `[medium]` `[patch]` edge-case (claim): entry 63 resolves against the gate's environment, not the boot environment — same as the blind-hunter row; patched.
  - `[medium]` `[patch]` verification-gap: entry 62 pins 6 of 22 masked keys (filed pre-verified, with `# @public` above `ANTHROPIC_API_KEY` measured green on all 58 commands) — patched by the derived + completeness arms; its proposed derivation from resolved sensitivity was not used because it would be circular, so the derivation is on the key NAME.
  - `[medium]` `[patch]` verification-gap: guard 26's arm passes vacuously when the per-file pipeline stops producing candidates — patched with the `cscan()` + `/dev/stdin` probe, which is the pipeline-probe form the finding preferred over a tree sentinel.
  - `[medium]` `[patch]` `[defer]` verification-gap: the "gap is closed" claim over-reaches for multi-line literals — the claim is patched; widening the extraction is deferred below, as the finding itself proposed.
  - `[low]` `[patch]` verification-gap (other): the colima-skip comment — patched with the rows above.
  - `[false]` `[reject]` verification-gap (other): "entry 63 silently skips an unparseable plist" — refuted as a hole: `plutil -lint ops/launchagents/*.plist` is entry 4 of the same array and fails first. The comment now records that dependency.
  - `[low]` `[reject]` verification-gap (other): guards 38 and 41 carry two character-identical copies of `pa` — real and unavoidable: each array entry is an independent `/bin/sh` process, so no definition can be shared across them. Guard 41's copy is now emitted by a helper that its own probe also calls, which is the most that is available.
  - `[medium]` `[patch]` intent-alignment: the check is at the physical-line level while the intent's class is any array-literal read — same as the multi-line finding; the claim is patched and the widening deferred.
  - `[low]` `[patch]` intent-alignment: token extraction is line-scoped rather than array-scoped — narrowed by the truncation patch and now stated as such in the comment.
  - `[false]` `[reject]` intent-alignment: "the third arm imposes a constraint the intent did not license" (adding `# @sensitive` above `POSTGRES_PASSWORD` now fails) — refuted: the intent asks for a pin that "also pins the header", and a key that takes its own annotation stops pinning it. The behaviour is the requirement, and the message names both ways out.
  - `[medium]` `[patch]` intent-alignment: the reverse census mirrors the narrowness it was written to complain about — same as the coverage finding; patched by the derived and completeness arms, which take the count from 6 of 22 to all 22.
  - `[medium]` `[patch]` intent-alignment: entry 63's environment is the gate's ∪ the plist rather than the plist's — same as the ambient-environment finding; patched.
  - `[low]` `[reject]` intent-alignment: the value-equality branch ships with no both-ways proof — real and already declared in the guard's own comment; no edit was found on this varlock that makes a plist-supplied key resolve to a different value, so there is nothing to prove it with. Masked keys are now compared too, which widens the branch without making it demonstrable.
  - `[false]` `[reject]` intent-alignment: "the proof surface is prose, not an artifact" — not this change's defect: DW-90 already records that nothing under `src/` executes these guards, and the comment block says so. Filing it again would duplicate an open ledger entry.
  - `[false]` `[reject]` intent-alignment: "scope the intent did not open" (rewriting guard 41's and guard 44's comments) — refuted: the intent requires proving each guard both ways, and guard 41's comment asserted the change was impossible. Leaving a measured-false paragraph standing beside the code that refutes it is the defect, not the fix.

## Design Notes

**Guard 41's comment is measured false and must be rewritten, not worked around.** It says the sixth spelling "would read declared names out of the `vi.stubEnv` calls and key-name arrays throughout the `config/*.test.ts` suites and fail a correct tree." Measured in this worktree by running guard 41 with `pa` and a fifth `-e` spliced in: exit 0. `pa` requires the quoted name and `process.env[` on the SAME line, and every `process.env[` in the test suites (`auth.test.ts:47`, `factory.test.ts:82`, `sandbox.test.ts:40`, `index.test.ts:74`) is a bare `delete process.env[key];` with no quoted token on the line.

**Why guard 26 needs a different shape from guard 41.** Guard 41 tests known keys one at a time, so `pa` can interpolate `$k`. Guard 26 discovers unknown keys, so it must extract tokens instead. Measured working shape (run standalone from the repo root; found exactly the four Platform keys, all declared, exit 0):

```sh
ci="process[.]env([?][.])?[[][[:space:]]*[A-Za-z_]"; tq="[$dq$q$bt][A-Z][A-Z0-9_]+[$dq$q$bt]"
b=$(sed -E "s,^[[:space:]]*(//|[*]|/[*]).*,," "$p")            # no `--`: BSD sed reads it as a filename
cl=$(printf "%s\n" "$b" | grep -nE "$ci" | cut -d: -f1)        # computed index only — a quoted index is the existing arm's
tk=$(printf "%s\n" "$b" | grep -onE "$tq")                     # every quoted SCREAMING_SNAKE token, with its line
for n in $cl; do printf "%s\n" "$tk" | grep "^$n:" | sed "s|^|$p:|"; done
```

Requiring a letter or `_` after `[` is what keeps `process.env["KEY"]` out of this arm: that spelling is already the existing arm's, and double-counting it would push declared keys to two reads in guard 41.

**Self-probe instead of a tree sentinel.** Both existing sentinels in guard 26 assert the tree has reads. For the new arm the same shape would hard-require `src/` to keep an array-literal read forever. Instead run the extraction against a synthetic line — `['ZZ_PROBE_A', 'ZZ_PROBE_B'].every(k => process.env[k])` must yield one computed-index line and two tokens — so a broken pattern fails loudly without pinning the tree's shape.

**`varlock load` validates.** Measured: with `# @type=enum("development", "test")` above `NODE_ENV=`, `NODE_ENV=production npx varlock load --format json-full` exits 1 and its JSON carries `errors.configItems.NODE_ENV`; `--format json` and `varlock run` exit 1 too. So entry 63 needs no `varlock run` and can name the failing key from `errors`. Reverted immediately; `git status --porcelain` was empty afterwards.

**Why `PATH` is excluded from the export.** The factory plist's `PATH` is `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`. Exporting it replaces the search path the gate's own `npx` resolves through. It is the process's search path, not configuration, and `.env.schema` does not declare it.

## Verification

**Commands:**
- Every entry of `.bmad-loop/policy.toml` `[verify].commands`, extracted with `smol-toml` and run in order through `/bin/sh -c` from the repo root -- expected: 63/63 exit 0 on the settled tree. `npm ci` (entry 1), `npm test` (7) and `npm run build` (42) run as part of it.
- `npm run check` -- expected: exit 0 (no TypeScript is touched).
- `git status --porcelain` -- expected: `.bmad-loop/policy.toml` and this spec only, after every break has been reverted.

**Manual checks (if no CLI):**
- The both-ways matrix: every row of the I/O matrix applied one at a time, each break's exit code and message captured, each break reverted before the next is applied, with `git status --porcelain` confirmed between rows.

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** `.bmad-loop/policy.toml` `[verify].commands` gained two entries and two in-place strengthenings, closing DW-79 (reverse sensitivity census), DW-61 (plist environment resolution census) and DW-62 (computed-key reads in guards 26 and 41). A follow-up review pass over the settled tree found and fixed twelve defects in that work — the load-bearing one being that guard 26's new arm could fail a CORRECT tree, and that an alternative decorator spelling walked straight past entry 62's header-pin assertion.

**Files changed.**
- `.bmad-loop/policy.toml` — the only product file. Entries 62 and 63 appended; guards 26 and 41 strengthened in place; the numbered comment block above the array extended and, where this change made it false, rewritten.
- `_bmad-output/implementation-artifacts/spec-gate-guards-env-resolution-census.md` — this spec.
- `_bmad-output/implementation-artifacts/deferred-work.md` — modified by the sweep orchestrator, not by this story; left untouched here.

**Review findings — follow-up pass.** 40 findings across four layers: high 0, medium 8, low 30, false 2, maybe-false 0. Grouped into 15 entries: 12 patched (3 medium, 9 low), 1 deferred (medium), and the rest rejected.

Patched (medium):
- Guard 26 read a quoted SCREAMING_SNAKE literal that is not an env key as one, whenever it sat before a computed index. Measured failing a correct tree at `sandbox.ts:301:'DRY_RUN'`. Tokens are now taken only from bracketed groups, which narrows the arm onto the array-literal read its message describes.
- Entry 62's annotation walk tested only the bare `# @sensitive`; varlock also honours `# @sensitive=true`, and that spelling took `POSTGRES_PASSWORD` out of the header-pinned class with the entry green.
- Entry 62's completeness arm told the author of a plainly public new key to rename it or list it in the guard, never mentioning `# @public`.

Patched (low): entry 62's explicit list completed to all six annotated keys (message class, not coverage); entry 62's broken-schema message now names ambient pollution as the other cause and points at entry 3; entry 62's third-assertion rationale rewritten after the derived arm made it false; the guard-26 residual restated as physical-line scoped, naming all three invisible shapes; guard 41's probe scope stated honestly, crediting the exactly-one arm with the wiring control; entry 63 given `test -f` alongside `test -s`; entry 63's `npx` spawn failure reported as itself; entry 63's comment corrected on guard 28-vs-29, on the inert `PATH` delete-side exception, and on the `.env`-on-disk caveat.

Deferred: entry 63 resolves the schema against the plists only, while `ops/factory-start.sh` exports its own pairs on top at boot and wins for any key both set. Measured: `export MASTRACODE_MAX_SANDBOXES=abc` in that script leaves all 63 entries green while the next `launchctl kickstart` would fail. Recorded in `deferred` with the smallest fix.

Rejected, with reasons: nine findings whose only fix is to edit this build's spec (stale Code Map line citations, the missing I/O matrix rows for the derived/completeness/explicit arms, the change-log contradiction on "character for character", the `entry 4` vs `entry 8` citation, the ambiguous matrix-row wording, the `verbatim` divergence in two rows, and the `review_loop_iteration`/`status` observation, which is refuted outright — those are the workflow's own state). Three findings live in `deferred-work.md`, which the intent's Never and this session's instructions put out of reach. Five low findings were rejected as defects nobody meets in everyday use whose fixes add branches: the `blk`-reset shape, a non-identifier plist key, the cross-plist `n<2` floor, the unexercised vacuity floors, and the 7-of-16 coverage of the annotation walk (the header pin is over-determined by the derived arm). Four rows were carried from round 1 unchanged — guard 41's `pa` on a declared key beside a computed index, the value-equality branch's missing both-ways proof, the prose proof surface, and the multi-line-literal residual — because the code still reads as those rows describe.

**Verification performed.**
- All 63 entries of `[verify].commands`, extracted with `smol-toml` and run in order through `/bin/sh -c` from the repo root: 63/63 exit 0 on the settled tree, `npm ci`, `npm test` and `npm run build` included.
- `npm run check` (`tsc --noEmit`): exit 0.
- Break tests, each applied alone and reverted immediately, with `git status --porcelain` confirmed between them: `'DRY_RUN'` line under `src/` → entry 26 exit 0 (was 1); `'MASTRA_ZZUNDECLARED'` in the literal at `sandbox.ts:288` → entry 26 exit 1 naming `file:line:token`; `# @sensitive=true` above `POSTGRES_PASSWORD` → entry 62 exit 1 with the header-pin message (was 0); `# @sensitive` above `SLACK_APP_BOT_TOKEN` replaced by `# @public` → entry 62 exit 1 with the EXPLICIT-class message (was the convention one); `# @public` above `ANTHROPIC_API_KEY` → entry 62 exit 1 via the derived arm; a masked `ZZ_NEW_CREDENTIAL=` → entry 62 exit 1 with the completeness message now naming `# @public`; `MASTRACODE_MAX_SANDBOXES=abc` in the calling shell → entry 62 exit 1 naming both causes; `# @type=enum("development", "test")` above `NODE_ENV=` → entry 63 exit 1 with varlock's `errors.configItems` text; guard 26's bracket pattern mangled → entry 26 exit 1 on its own probe.
- `git status --porcelain` after every revert: `.bmad-loop/policy.toml`, this spec, and the orchestrator's `deferred-work.md` only.

**Follow-up review recommendation:** `false`. This was a follow-up pass and it patched no `high`, so the work has converged; patch volume is not grounds on a follow-up pass.

**Residual risks.**
- The deferred wrapper gap above: nothing resolves `.env.schema` against `ops/factory-start.sh`'s exports, so DW-61's class is narrowed rather than closed.
- DW-108's ledger text scopes the guard-26/41 residual to literals "wrapped across lines"; the measured class is wider (any join of tokens to index across physical lines, plus a second literal after an earlier index on one line). The policy comment now carries the accurate statement; the ledger entry is the orchestrator's and was not edited.
- Entry 63's value-equality branch is still a backstop with no demonstrated break on this varlock, and its comment says so.
- Nothing under `src/` executes any of these guards (DW-90), so the only proof that a break still fires is re-running it.

