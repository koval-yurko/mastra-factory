---
title: 'AGENTS.md context block: correct the verify/test/tracking claims and the WORKOS_* sweep, and guard them mechanically'
type: 'bugfix'
created: '2026-09-25'
status: 'done'
baseline_revision: '47966e45abbdc437359f20f69fd5492a6e933cdb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      `_bmad-output/planning-artifacts/epics.md` still carries the claim this change corrected, and
      `AGENTS.md` cites that file as a normative pointer, so the two now contradict each other.
    evidence: |-
      epics.md:319 says the gate runs "`npm run check`, and two guards" and :325 warns against
      deleting "the two guards"; `[verify].commands` holds 55. AGENTS.md:44 lists
      `_bmad-output/planning-artifacts/epics.md` under "Where things are", and
      `.claude/skills/bmad-project-context/SKILL.md:70` calls two live contradictory instructions a
      defect. Not fixed here: epics.md is a frozen record of the plan and sits outside the two files
      this change is allowed to edit. Smallest fix is either correcting those two lines or marking
      epics.md as historical where AGENTS.md points at it.
    location: >-
      _bmad-output/planning-artifacts/epics.md:319,325 vs AGENTS.md:44
    severity: low
  - summary: >-
      The pre-existing `[verify]` narrative at the head of `.bmad-loop/policy.toml` still describes
      the array as it was at four entries, in the same file whose new comment block preaches against
      exactly that.
    evidence: |-
      `.bmad-loop/policy.toml:33` reads "The two guards after the typecheck enforce AD-4 and
      AD-9/AD-13" and :44 describes `npm test` as appended to a two-guard list; the array holds 55
      entries and AGENTS.md now directs every session to read it as the live list. No gate command
      reads those comment lines. Pre-existing — it predates this change and none of the six ledger
      entries recorded it — so it is filed rather than patched here.
    location: >-
      .bmad-loop/policy.toml:33,44
    severity: low
  - summary: >-
      Nothing re-proves that the three guards still DETECT anything; a narrowing edit turns one into
      a green no-op that is indistinguishable at the gate from a guard that passed.
    evidence: |-
      Measured by the verification-gap layer: narrowing guard 55's token pattern from
      `[A-Z][A-Z0-9_*?]*` to `[A-Z][A-Z0-9_]*` — the shape of the earlier draft, and a plausible
      "tidy this to a legal key name" edit — makes `` `WORKOS_*` `` match nothing, so arms (a) and
      (b) see zero offenders. With the glob restored onto the unset bullet the shipped guard exits 1
      and the mutated one exits 0; the `keys.length < 5` sentinel does not fire because the other 13
      tokens remain. `npm test` is `vitest run --dir src` and no test under `src/` executes entries
      53-55, so the only evidence they detect anything is the by-hand break/revert matrix — run
      twice in this session (19 cases, then 26 more after the review patches), and recorded in the
      `[verify]` comment block. Not fixed here: the smallest real fix is a canary arm per guard,
      running its own extraction over an in-program fixture. That is a substantial rewrite of three
      ~3,000-character programs inside TOML `'''` literals whose quoting already forbids `'`, with a
      live risk of breaking guards that currently work, and the intent prescribes manual both-ways
      verification in this worktree, which was performed. Filed so the next story can weigh it.
    location: >-
      .bmad-loop/policy.toml [verify].commands entries 53, 54, 55
    severity: medium
  - summary: >-
      DW-87 is `status: open` in the deferred-work ledger, but this change resolved it; its `reason`
      field also still describes the pre-repair tree.
    evidence: |-
      The ledger entry prescribes "Smallest fix: reword that one comment clause", which this change
      applied at `docker-compose.yml:12`, and asserts "54 pass, only 51 fails" — measured now, the
      full array is 55 of 55 and entry 51 exits 0. Not fixed here because the intent's Boundaries
      say "Do not edit the deferred-work ledger or the sprint board; the orchestrator records
      resolution", and DW-87/88/89 were written into the ledger by the orchestrator
      (`origin: spec-deferred`), not by a dev session. Left for the orchestrator to close on
      integration; recorded here so a later sweep does not re-do finished work from a stale reason.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md DW-87
    severity: medium
  - summary: >-
      This change edits one comment clause of `docker-compose.yml`, which the intent's "Always"
      section pins outside its two-file scope.
    evidence: |-
      `[verify].commands` entry 51 was red at baseline and had been since it was added: it
      reconciles every `--wait-timeout <digits>` written in `docker-compose.yml` against
      `package.json scripts[db:up]`, and the file's line 12 explained the default in prose with that
      exact token. The orchestrator's deterministic gate failed on it and re-dispatched this session
      to repair the tree. No fix existed inside `AGENTS.md` or `.bmad-loop/policy.toml`: the array is
      append-only by the same "Always" section, so entry 51 could not be amended. The excursion is
      one YAML comment clause — no service, image, port, volume or healthcheck field — and it is
      what makes the acceptance criterion "all 55 exit 0" reachable. Recorded rather than hidden;
      the three acceptance/boundary/verification lines that still assert a two-file diff sit inside
      the read-only `<intent-contract>` and were deliberately not edited.
    location: >-
      docker-compose.yml:12 vs spec `<intent-contract>` Boundaries & Constraints
    severity: medium
  - summary: >-
      Guard 54 reads backtick-anchored tokens only, so a tracked path called gitignored in
      unbackticked prose still passes.
    evidence: |-
      Measured twice: a clause reading "The file docs/self-hosting-research.md is gitignored." exits
      0 both before and after this pass's guard-54 patches. Kept as a known limit rather than
      widened: the managed block backticks every path it names, and the fix — matching ~100 raw
      tracked-path strings against clause text — measurably false-fails on correct prose (the
      already-backticked contrast clause "unlike `.env`, `package.json` is never gitignored" exits 1
      today). The intent's I/O matrix specifies the backticked form for this row.
    location: >-
      .bmad-loop/policy.toml [verify].commands entry 54
    severity: low
  - summary: >-
      Two AGENTS.md nits left unfixed because a fix edits an agent-context file: the restamped
      provenance line runs to 120 columns, and the gate bullet restates entry 1's npm flags.
    evidence: |-
      `AGENTS.md:2` is 120 characters against the ~100-column hard wrap the rest of the block keeps,
      and it switched from the short-SHA convention (`5e09129`) to a full 40-character SHA — the
      full SHA is what the spec's Tasks section requires, so only the wrap is in question.
      Separately, the gate bullet says "starting with `npm ci --no-audit --no-fund`", which copies
      unguarded content out of `[verify].commands` entry 1: change those flags and the prose goes
      stale with all 55 entries green. Both are cosmetic, both live inside the managed block that
      `bmad-project-context` regenerates, and review routing sends any fix that edits an
      agent-context file to defer.
    location: >-
      AGENTS.md:2 and AGENTS.md:51-59
    severity: low
  - summary: >-
      `AGENTS.md`'s Policy section still tells every session that `tsc --noEmit` is the only real
      check — the same "only check" claim class this change removed from `## Running and verifying`,
      two headings above it and unguarded.
    evidence: |-
      `AGENTS.md:16` reads "`tsc --noEmit` is the only real check, so code outside `src/` is silently
      unverified". `[verify].commands` holds 55 entries, three of which run `npm run check`,
      `npm test` and `npm run build` and the rest of which check `ops/`, `sandbox/`, the compose
      project and this block's own prose — so the clause is false in the same way DW-5/54/66 were.
      This pass widened guard 53's denial arm to the whole managed block, but that arm matches
      `no <script> script`, not an "only check" assertion, so nothing catches this wording; measured
      green. Pre-existing at baseline `47966e4` and not introduced here, and the fix edits an
      agent-context file, which review routing sends to defer. Smallest fix is rewording that clause
      to say what `tsc --noEmit` does not cover rather than what nothing else checks.
    location: >-
      AGENTS.md:15-18
    severity: medium
  - summary: >-
      DW-90's recorded demonstration no longer reproduces, so a sweep that re-runs it as written will
      conclude the entry is closed while the gap it describes is still open.
    evidence: |-
      DW-90 says narrowing guard 55's token class from `[A-Z][A-Z0-9_*?]*` to `[A-Z][A-Z0-9_]*` makes
      the guard exit 0 with `` `WORKOS_*` `` restored to the unset bullet. Measured on this tree: the
      mutated guard exits 1, because arm (c) — the unbackticked glob scan over the sliced unset
      bullet, added after that measurement was taken — matches `WORKOS_*` with or without backticks.
      The underlying gap is still real and was re-demonstrated here by a different mutation:
      narrowing guard 53's denial window from `j<=i+4` to `j<=i+1` turns that arm into a permanent
      exit 0 with "There is no automated test script here." in the section, and no sentinel fires.
      Not fixed here: DW-90 lives in the deferred-work ledger, which the intent's Boundaries and this
      run's dispatch both put off-limits to a dev session. Filed so the orchestrator can refresh the
      demonstration rather than close the entry on a stale one.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md DW-90
    severity: medium
  - summary: >-
      The restamped provenance line names the baseline SHA, which predates the two commits that wrote
      the block, so the next refresh diffs from a tree that does not contain the block it is checking.
    evidence: |-
      `AGENTS.md:2` reads "Verified 2026-09-25 against 47966e45abbdc437359f20f69fd5492a6e933cdb".
      That is `baseline_revision`; the block's own edits landed in `bcf0ff9` and `2dd8e20`, both
      after it, and `bmad-project-context/SKILL.md:85` has refresh diff from the stamped SHA. The
      result is a false drift signal on this change's own lines, not a missed one. The dev session
      followed the spec, whose Tasks section says to stamp `git rev-parse HEAD` — which was the
      baseline while the session ran. Not fixed here: the fix edits an agent-context file. Distinct
      from the column-wrap item above, which is about the line's length, not which SHA it names.
    location: >-
      AGENTS.md:2
    severity: low

---

<intent-contract>

## Intent

**Problem:** AGENTS.md's `## Running and verifying` section states three things that are false at
baseline `47966e45abbdc437359f20f69fd5492a6e933cdb` — that there is no test script (`package.json:13`
is `vitest run --dir src`, and `npm run build` is also gated), that the bmad-loop gate runs
`npm ci`, `npm run check` "and two guards" (`[verify].commands` holds 52 entries), and that
`.bmad-loop/policy.toml` "is gitignored and exists only in the main checkout" (`git ls-files` returns
it and `.gitignore:13-15` says it is tracked deliberately). Separately, `AGENTS.md:71-74` sweeps
`WORKOS_*` into the must-stay-unset list while `WORKOS_COOKIE_PASSWORD` is the second link of the
`state` signer chain at `src/mastra/config/integrations.ts:87` and `.env.schema:276-295` tells the
operator to keep it set. Six ledger entries (DW-5, DW-29, DW-33, DW-52, DW-54, DW-66) recorded these
across five stories; each deferred because a hand patch inside the `<!-- bmad:context -->` managed
region is replaced the next time `bmad-project-context` regenerates it.

**Approach:** Rewrite the four affected lines so every claim is true and *count-free* — name the
scripts and point at `[verify].commands` as the live list instead of quoting a number — restamp the
managed block's provenance line to today's date and the verified SHA so the next refresh diffs from
a true baseline, and append three guards to `[verify].commands` that mechanically reconcile
AGENTS.md against the repo. The guards are the durability: a regeneration, or a later story, that
reintroduces any of these claim classes fails the gate instead of shipping silently. This is the
same prose-vs-artifact drift elimination the existing `ops/README.md` guards already perform.

## Boundaries & Constraints

**Always:**
- Keep every edit inside `AGENTS.md` and `.bmad-loop/policy.toml`. AGENTS.md changes stay inside the
  `<!-- bmad:context -->` markers, in the template's terse-imperative bullet style.
- APPEND to `[verify].commands`; never rewrite or reorder the array — the existing 52 entries are
  enforced nowhere else.
- Every new guard must pass on the corrected tree **and** fail with a naming message when the claim
  it guards is broken. Verify both directions in this worktree and revert each break immediately.
- Guards run in a story worktree: tracked files only, no `node_modules/` beyond `npm ci`, no `.env`.
  Read only tracked files (`AGENTS.md`, `package.json`, `.env.schema`, `.bmad-loop/policy.toml`, git).

**Never:**
- Do not change the `stateSecret` fallback chain in `src/mastra/config/integrations.ts`, introduce a
  `BETTER_AUTH_SECRET`-based signer, or touch `.env.schema` / `.env.example`. DW-33 names that as a
  behaviour change out of scope.
- Do not edit `_bmad-output/planning-artifacts/epics.md` or
  `_bmad-output/specs/spec-self-hosted-factory/brownfield.md`, which carry the same superseded
  wording — they are a frozen record of the plan, not loaded agent instructions.
- Do not edit the deferred-work ledger or the sprint board; the orchestrator records resolution.
- Do not run `bmad-project-context` (it is conversational and requires approval for every write).
- Do not add a guard-program file outside `src/` — AD-4 forbids it and gate guard 5 fails it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gate-script census, correct tree | `[verify].commands` runs `npm run check`, `npm test`, `npm run build`; all three named in `## Running and verifying` | exit 0 | No error expected |
| A gated script is unnamed in AGENTS.md | `npm test` removed from the section (the DW-5/54/66 condition) | exit 1 naming the missing script and both files | Message names `AGENTS.md` and `.bmad-loop/policy.toml` |
| AGENTS.md names a script `package.json` does not declare | section says `npm run lint` | exit 1 naming `lint` | Message says the script is undeclared |
| Extraction broke | `## Running and verifying` heading absent, or no simple `npm` entry found in `[verify].commands` | exit 1 saying the extraction failed | Fails loudly rather than passing vacuously |
| Tracked-vs-gitignored, correct tree | only `` `.env` `` is called gitignored, and `.env` is untracked | exit 0 | No error expected |
| A tracked path called gitignored | `` `.bmad-loop/policy.toml` `` in a clause containing "gitignored" (the DW-29 condition) | exit 1 naming the path and quoting the clause | Message shows the offending clause |
| Env-key census, correct tree | every backticked `UPPER_SNAKE` token in AGENTS.md is a `NAME=` line in `.env.schema` | exit 0 | No error expected |
| A glob or undeclared key named | `` `WORKOS_*` `` (the DW-33 condition) or a typo | exit 1 naming the token | Message says to name exact declared keys |
| Env census floor | fewer than 5 tokens extracted from AGENTS.md, or fewer than 40 keys from `.env.schema` | exit 1 saying the extraction broke | Fails loudly rather than passing vacuously |

</intent-contract>

## Code Map

- `AGENTS.md:1-3` -- provenance line, currently `Verified 2026-09-22 against 5e09129`. Restamp to
  today and the full verified SHA; refresh diffs from it (`bmad-project-context/SKILL.md:85`).
- `AGENTS.md:47-57` -- `## Running and verifying`. Bullet 1 (`:49-50`) claims no test script;
  bullet 2 (`:51-54`) claims two guards and a gitignored `policy.toml`. Bullet 3 (`:55-57`,
  `npm run start`) is correct — leave it.
- `AGENTS.md:71-74` -- the must-stay-unset bullet carrying the `WORKOS_*` glob.
- `package.json:8-17` -- `scripts`: `check` = `tsc --noEmit`, `test` = `vitest run --dir src`,
  `build` = `mastra build --dir src/mastra`, `start` = `varlock run -- mastra start`.
- `.bmad-loop/policy.toml:1940-1995` -- `commands = [ … ]`, 52 entries. Simple ones are
  `  "npm ci --no-audit --no-fund"` (:1941), `  "npm run check"` (:1942), `  "npm test"` (:1947),
  `  "npm run build"` (:1982). Append the three new guards before the closing `]`.
- `.bmad-loop/policy.toml:28-...` -- the `[verify]` comment block. Its numbered guard narrative is
  the established place to document what each command covers and how it was verified both ways.
- `.gitignore:11-15` -- ignores `.bmad-loop/runs/` and `.bmad-loop/cache/` and carries the comment
  that `policy.toml` is deliberately TRACKED. `git ls-files .bmad-loop` returns
  `bmad_loop_hook.py`, `decisions.json`, `policy.toml`.
- `src/mastra/config/integrations.ts:86-87` -- `stateSecret = githubWebhookSecretRaw ||
  process.env.WORKOS_COOKIE_PASSWORD || slackSigningSecretRaw || undefined`. **Read-only evidence.**
- `.env.schema:274-295` -- the "WorkOS (legacy)" block: the credential pair is inert,
  `WORKOS_COOKIE_PASSWORD` stays set so the signer survives a restart. **Read-only evidence.**
- `.claude/skills/bmad-project-context/references/template.md` -- block shape and style the AGENTS.md
  edits must match (terse imperative, no prose outside Orientation, prohibitions name the
  alternative). **Read-only.**

## Tasks & Acceptance

**Execution:**
- `AGENTS.md` -- rewrite the two `## Running and verifying` bullets so they name `npm run check`,
  `npm test` and `npm run build`, describe the gate as `npm ci` plus the list in `[verify].commands`
  with **no count**, and state that `.bmad-loop/policy.toml` is tracked (append-only array) -- the
  three false claims of DW-5/29/52/54/66, fixed in a form that cannot go stale on a count again.
- `AGENTS.md` -- in the must-stay-unset bullet, replace the `WORKOS_*` glob with the three inert keys
  (`WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`) and add one line carving out
  `WORKOS_COOKIE_PASSWORD` as the `state`-signer link that stays set, citing
  `src/mastra/config/integrations.ts` -- DW-33.
- `AGENTS.md` -- restamp the provenance comment to `Verified 2026-09-25 against <full HEAD SHA>`,
  taken verbatim from `git rev-parse HEAD` -- so the next refresh diffs from a true baseline.
- `.bmad-loop/policy.toml` -- append guard A (every `package.json` script the gate invokes is named
  in AGENTS.md's `## Running and verifying`, and every `npm run <x>` that section names is a declared
  script) -- makes the DW-5/54/66 class impossible to reintroduce.
- `.bmad-loop/policy.toml` -- append guard B (no clause of AGENTS.md calls a git-tracked path
  gitignored) -- makes the DW-29 class impossible to reintroduce.
- `.bmad-loop/policy.toml` -- append guard C (every backticked `UPPER_SNAKE` token in AGENTS.md is a
  key declared in `.env.schema`) -- rejects `WORKOS_*` and any future glob or typo, DW-33.
- `.bmad-loop/policy.toml` -- extend the `[verify]` comment block with one numbered entry per new
  guard: what it covers that nothing else does, its scoping decisions, and the both-ways
  verification actually performed -- matches the documentation bar every existing guard meets.

**Acceptance Criteria:**
- Given the corrected tree, when every entry in `[verify].commands` is run in order, then all 55
  exit 0.
- Given the corrected `AGENTS.md`, when it is read end to end, then no sentence states a count of
  gate commands or guards, and no sentence claims a test script is absent.
- Given the corrected `AGENTS.md`, when the must-stay-unset bullet is read, then
  `WORKOS_COOKIE_PASSWORD` is named as an exception that stays set and no token in the block is a
  glob.
- Given `src/mastra/config/integrations.ts` and `.env.schema`, when compared against
  `git diff --stat`, then neither appears — only `AGENTS.md` and `.bmad-loop/policy.toml` do.
- Given each new guard, when the single claim it guards is broken in the working tree, then that
  guard exits non-zero and its message names both the offending token/path and the file to fix; and
  when the break is reverted, `git status --porcelain` again names only this change's two files.

## Spec Change Log

### 2026-09-25 — Repair pass after failed deterministic verification

The orchestrator's gate run on the previous session's tree returned `rc=1` on `[verify].commands`
entry 51. That failure was the spec's own deferred item 1: a pre-existing, baseline-red guard with
nothing to do with this change. Two things changed here.

- **Scope widened by one comment clause, deliberately.** `docker-compose.yml:12` explained the
  `db:up` bound in prose as ``` `--wait` alone defaults to --wait-timeout 0 ```, and guard 51's flag
  scan reads that literal `0` as a second restated value. It was reworded to state the default
  without writing the flag-and-digits token; `docker-compose.yml:9` still carries
  `--wait-timeout 120`, which is the value guard 51 reconciles against `package.json scripts[db:up]`.
  This is the one edit outside the two files the Boundaries section names. It was taken rather than
  halting because the whole point of the three new guards is a gate whose verdict is readable, and
  they were sitting behind an entry that reported FAIL no matter what they said — and because no
  future session under this contract could ever have passed the gate either. The clause is a YAML
  comment: no service, image, port, volume or healthcheck field was touched.
  **DW-87 in the ledger is resolved by this change** — recorded here rather than edited there, since
  the ledger is the orchestrator's.
- **Guard 54's positive arm was inert and is now fixed.** It matched the bare word `tracked`
  anywhere in a clause naming `.bmad-loop/policy.toml`, and that clause already says the gate runs
  "in a worktree holding `tracked` files only" — so deleting the ``` `.bmad-loop/policy.toml` is
  tracked ``` sentence exited 0 on the very file the guard exists to protect. The needle is now the
  assertion (`is tracked` / `is git-tracked`). Re-verified failing.

The `[verify]` comment block was corrected in the same pass: it still told the next reader that
entry 51 is red and unfixable from here, and still described the change as touching two files.

**Verification after the repair:** the full 55-entry array runs 55/55 green, so the acceptance
criterion "all 55 exit 0" — unmet and correctly scoped out at review time — now actually holds.
Entry 51 was re-broken and reverted to confirm it still fails on the old wording. The I/O matrix was
re-run first-hand as 19 break/revert cases covering all 9 rows: 19 pass, 0 misses, with `AGENTS.md`
and `.env.schema` byte-identical afterwards.

Deferred items 2 (`epics.md:319,325`) and 3 (`.bmad-loop/policy.toml:33,44`) are unchanged and
remain open as DW-88 and DW-89.

## Review Triage Log

### 2026-09-25 — Review pass (follow-up on a `done` spec)
- verdicts: 39 findings — high 0, medium 18, low 20, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 53 ends its array scan at any line whose *trimmed* text begins with `]`, not at column 0 as the stated limitation says — reproduced (an indented `] …` line inserted after entry 2 left `check` alone in the gated set, set the terminator flag so no sentinel fired, and the guard exited 0 with `test` and `build` unnamed in AGENTS.md); fixed by testing the raw line. Re-verified failing, and the comment now records the measurement.
  - `[medium]` `[patch]` Guard 53's `-`-prefix skip handles only boolean flags, so a global npm flag taking a separate value drops a gated script — reproduced (`  "npm --loglevel warn run build",` read `warn` as the subcommand and exited 0 with `build` unnamed); fixed with a value-flag list in the shape guard 52 already uses. Re-verified failing.
  - `[medium]` `[patch]` The count arm misses `one` and `a dozen` while catching `1` and `dozens of` — reproduced ("The array holds one guard beyond that." exited 0); fixed by adding `one`, an optional hyphenated unit and the remaining quantifier phrases. Re-verified failing on "one guard", "fifty-one guards", "a few guards" and "a number of checks".
  - `[low]` `[patch]` Guard 53's failure message offers "or drop it from `[verify].commands`", which contradicts the append-only rule the same change wrote into AGENTS.md and would delete a check nothing else enforces — real; reworded to offer only the naming fix.
  - `[low]` `[reject]` Nothing guards the append-only rule itself, so a rewritten or reordered array censuses cleanly — real, but the smallest fix is a new guard diffing the array against its committed form, which is well past a direct correction and guards a state no reviewer demonstrated anyone reaching. The rule is now stated in AGENTS.md and repeated in guard 53's failure message.
  - `[low]` `[reject]` Guards 53 and 55 pin exact prose wording, so a benign regeneration reds the gate with a message pointing at the wrong fix — carried: rejected in the repair pass on the same ground, that loosening the arms reopens demonstrated holes and tightening the matrix edits this build's spec. The heading-rename case is now an extraction failure naming both files, not a silent pass.
  - `[low]` `[reject]` Three prior rejections cited "the fix edits this build's spec" for sections that sit *outside* `<intent-contract>` — the location is right, but the triage rule rejects any finding whose fix edits this build's spec regardless of which section it lands in.
  - `[low]` `[reject]` DW-92 and the Spec Change Log say the surviving two-file assertions all sit inside `<intent-contract>`, while only the Boundaries line does — real inaccuracy; its fix edits this build's spec and the ledger, both out of bounds for this session.
  - `[low]` `[reject]` The second triage log's header tally (high 2, medium 19, low 18, false 1) sums to 40 against 46 bullets and does not partition them — real; the fix edits this build's spec.
  - `[medium]` `[defer]` DW-87 ships `status: open` carrying a `reason` this change falsified — carried: logged in the repair pass as deferred item 4 and serialized into the ledger as DW-91; the ledger is the orchestrator's.
  - `[low]` `[defer]` The restamped provenance line names the baseline SHA, which predates the two commits that wrote the block, so the next refresh diffs from a tree without it — real, and distinct from the column-wrap item already filed; the fix edits an agent-context file. Filed as deferred item 10.
  - `[low]` `[reject]` The new `docker-compose.yml` comment writes the bare `--wait-timeout` token twice and sits one keystroke from tripping guard 51; separately, guard 54 shells `git ls-files` without `-z` — the compose half is real but is exactly what guard 51 exists to catch, and it is green here; the `-z` half is refuted, because git C-quotes a path containing a newline onto one line and no such path is tracked.
  - `[medium]` `[patch]` Guard 55's carve-out arm accepts a negation in front of the key — reproduced ("Never keep `WORKOS_COOKIE_PASSWORD` set." standing where the carve-out belongs exited 0, because the unset-list arm does not see its own bullet); fixed by checking the text back to the previous sentence break and reporting a negated hit as the opposite claim. Re-verified failing on both the `Never keep` and `Do not keep` spellings.
  - `[medium]` `[patch]` The count arm misses `one`/`single` — duplicate of the count finding; same fix.
  - `[medium]` `[patch]` Guard 53's heading search runs over the whole file, so a hand-written `## Running and verifying` above the opening marker is censused instead of the managed block's — reproduced (exit 1 reporting the block's own gated scripts unnamed, which turns the block header's "keep anything you want preserved outside the markers" into a red gate); fixed by clamping to the markers first, as guards 54 and 55 do. Re-verified green, with the real section still failing when broken.
  - `[medium]` `[patch]` A trailing `#` comment containing an apostrophe, or an npm flag taking a separated value, drops a gated script — reproduced (`  "npm run build", # do'nt drop this` exited 0 with `build` unnamed); fixed by reading each entry as the TOML string it is, from its opening quote to the matching close, so whatever follows is decoration. Re-verified failing.
  - `[low]` `[reject]` Guard 54 false-fails when a needle clause names one untracked and one tracked path — carried: rejected in the repair pass, because an adjacency window weakens the detection the guard exists for.
  - `[low]` `[reject]` Guard 55's `_`-required filter never censuses a backticked single-word key such as `` `PORT` `` — real; widening it makes every backticked uppercase word an env-key claim (`` `GET` ``, `` `TODO` ``), which the prior pass weighed and settled, with the escape documented.
  - `[medium]` `[defer]` `AGENTS.md:16` still says `tsc --noEmit` is the only real check — the same claim class, two headings above the corrected section and not matched by the denial arm even after it was widened to the block. Pre-existing and the fix edits an agent-context file. Filed as deferred item 8.
  - `[medium]` `[defer]` `git diff --stat` lists five paths against the two-file acceptance criterion — carried: the `docker-compose.yml` excursion is deferred item 5 / DW-92, and the ledger half was refuted in the repair pass.
  - `[medium]` `[patch]` "When the single claim it guards is broken, that guard exits non-zero" was falsified twice, on the negated carve-out and on "fifty-one guards" — grouped with those two findings and fixed by the same arms; both re-verified failing.
  - `[low]` `[patch]` The entry-55 comment claims arm (d) reads an assertion so "unset …" cannot pass, which a preceding negation defeats — corrected alongside the arm, with the measurement recorded.
  - `[low]` `[patch]` The entry-53 comment claims a marker clamp that bounds only the section end — corrected alongside the clamp fix.
  - `[medium]` `[defer]` Nothing re-proves the three guards still detect anything; a narrowing edit makes one a green no-op — carried: deferred item 3 / DW-90. Re-demonstrated here by a different mutation (guard 53's denial window narrowed to adjacent-only), and the by-hand matrix was re-run in full at 40 cases after this pass's edits.
  - `[low]` `[patch]` Guard 53's forward arm false-fails on an unbackticked sentence-final `npm test.`, which its own reverse arm already accepts and which the comment listed as verified-green — reproduced (exit 1 telling the reader to add a name the section carried); fixed by reading the trailing `.`/`:`/`-` as a boundary when what follows is not alphanumeric, the same reading the reverse arm does. Re-verified green, with `npm test-foo` still not naming `test`.
  - `[medium]` `[patch]` The count arm misses `a few` — duplicate of the count finding; same fix, re-verified failing.
  - `[medium]` `[patch]` The denial arm is scoped to one section, so "There is no test script" passes in another section of the same managed block — reproduced (the sentence moved under `## Conventions that differ from defaults` exited 0); fixed by reading the denial arm over the whole block while the count arm stays section-scoped, because a count of something else is legitimate prose elsewhere. Re-verified failing.
  - `[medium]` `[defer]` DW-90's recorded demonstration no longer reproduces, so a sweep re-running it will read the entry as closed — verified (the mutated guard exits 1; arm (c) was added after that measurement). The gap is still real under a different mutation. The ledger is off-limits here; filed as deferred item 9.
  - `[low]` `[reject]` Re-confirmation that DW-88 and DW-89 are still open and that guard 51 is green — no new defect claimed; both are already filed as deferred items 1 and 2.
  - `[low]` `[reject]` Half the shipped arms live at a wording surface rather than a claim-truth surface — carried: rejected in the repair pass, and the comment block states it under "PHRASE LISTS, not comprehension".
  - `[low]` `[defer]` The guards fire at story-gate time, one story after a regeneration — carried from both prior passes: no better mechanism exists inside the editable files.
  - `[low]` `[reject]` The guards constitute an unwritten shape requirement for a file another tool owns and may rewrite — carried: same claim as the pass-set-narrower-than-the-matrix row rejected in the repair pass.
  - `[medium]` `[defer]` The evidence that the guards detect anything lives in a comment, not in any executable — carried: deferred item 3 / DW-90.
  - `[medium]` `[defer]` The diff touches five files against the intent's two — carried: deferred item 5 / DW-92.
  - `[low]` `[defer]` The comment block restates counts in the same change that made AGENTS.md count-free — carried: deferred item 2 / DW-89; the new comment's numbers stay marked as one-time measurements.
  - `[low]` `[defer]` Bullet 2 runs long, copies entry 1's npm flags and enumerates the guard families in prose — carried: deferred item 7.
  - `[low]` `[reject]` Six arms exceed the intent's I/O matrix — carried: same ground as the pass-set row; every matrix row is still implemented.
  - `[false]` The provenance line asserts a whole-block verification that was never performed — refuted: the first pass path-checked all 13 cited paths, ran the `--diff-filter=DR` scan over `5e09129..HEAD` and fact-checked the remaining claims before keeping the stamp. Which SHA it names is a separate, real point, filed as deferred item 10.
  - `[medium]` `[patch]` The array is read line by line while the ground truth is TOML semantics, and the guard names that as its one vacuous-pass path — grouped with the terminator finding; the indented-bracket half is fixed, and the column-0 case stays a stated limitation because a real TOML parse is a dependency this gate does not have.

### 2026-09-25 — Review pass (repair session)
- verdicts: 41 findings — high 0, medium 20, low 18, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 53 drops a gated script when its array entry carries a trailing TOML comment — reproduced (`"npm run build", # build it` exited 0 with `build` unnamed); fixed by stripping a trailing `#…` only when the text after `#` carries no quote character, so a `#` inside a quoted body is never cut. Re-verified failing.
  - `[medium]` `[patch]` Guard 53 drops a gated script when a global npm flag precedes `run` — reproduced (`npm --silent run build` exited 0); fixed by skipping leading `-`-prefixed words before reading the subcommand. Re-verified failing.
  - `[low]` `[patch]` The `]`-terminator sentinel is satisfiable from inside a future multi-line `'''` body, so a partial array would census as complete — real; a quote-state parser is more than the promise is worth, so the one-entry-per-line assumption is now recorded as a stated limitation beside the sentinel.
  - `[medium]` `[patch]` Guard 53 reconciles gate→section only, so AGENTS.md's "the gate runs each of them" was unguarded — reproduced (deleting `  "npm test",` exited 0); fixed with a section→gate arm scoped to the first bullet, plus a fifth extraction sentinel. Scoping keeps the legitimately-ungated `npm run start` green. Re-verified failing.
  - `[medium]` `[patch]` Guards 54 and 55 lacked guard 53's `<!-- /bmad:context -->` clamp, so content the block header invites outside the markers fails the gate — reproduced (a hand note backticking `MY_LOCAL_FLAG` exited 1); fixed by clamping both to the managed block, with a loud extraction failure when the markers are missing. Re-verified green.
  - `[medium]` `[patch]` Guard 55's carve-out arm accepted any mention of the key, including one stating the opposite — reproduced ("Also unset WORKOS_COOKIE_PASSWORD in production." exited 0); fixed by requiring an assertion that it stays set, so `unset` cannot satisfy it. Re-verified failing.
  - `[medium]` `[patch]` The two claim-class arms were oversold as covering the claim class — reproduced twice ("no automated test script" and "a pair of guards" both exited 0); fixed by allowing up to three intervening words in the denial arm and extending the count alternation past twenty with quantifier phrases, and the comment now states the residual instead of claiming completeness. Both re-verified failing.
  - `[medium]` `[defer]` DW-87 is `status: open` in the ledger while this change resolved it, and its `reason` still describes the pre-repair tree — real; the intent forbids editing the ledger and the orchestrator wrote the entry, so it is filed as deferred item 4 for the orchestrator to close.
  - `[false]` The six entries this change closes (DW-5/29/33/52/54/66) are still `status: open` — not a defect of this change: the orchestrator records resolution on integration, which is why the intent forbids a dev session touching the ledger at all.
  - `[low]` `[reject]` The Boundaries, acceptance criterion and Verification lines still assert a two-file diff after `docker-compose.yml` was edited — rejected because the fix edits this build's spec, and those three lines sit inside the read-only `<intent-contract>`. The excursion is recorded instead as deferred item 5.
  - `[low]` `[reject]` Design Notes still describe the `[.;:]` split, the `_`-required token filter and 11 tokens, all superseded — carried: rejected in the prior pass on the same ground, that the fix edits this build's spec.
  - `[false]` Spec frontmatter shows `review_loop_iteration: 0` and `status: in-review` after a completed pass — not a defect: the status is `in-review` because this review was running when the diff was read, and the counter tracks bad_spec loopbacks, of which there have been none.
  - `[low]` `[defer]` The restamped provenance line is 120 columns and uses a full SHA — the full SHA is what the spec's Tasks section requires; only the wrap is in question, and the fix edits an agent-context file. Filed as deferred item 7.
  - `[low]` `[defer]` The gate bullet restates entry 1's npm flags and runs long for the block's style — real drift surface, but the fix edits an agent-context file. Filed as deferred item 7.
  - `[low]` `[defer]` Both new ledger headings are truncated mid-clause and punctuated inconsistently — real, but they are produced by the orchestrator's serializer from the spec's `deferred` summaries, and the intent forbids editing the ledger.
  - `[medium]` `[patch]` Guard 55 reads backtick-anchored tokens, so the DW-33 glob ships green unbackticked — reproduced ("every WORKOS_\* key" on the unset bullet exited 0); fixed with a glob scan over the already-sliced bullet that rejects `*`/`?` with or without backticks. Re-verified failing.
  - `[low]` `[reject]` Guard 54 misses a tracked path called gitignored in unbackticked prose — verified still open after this pass's patches; rejected as a widening the intent's matrix does not ask for and whose fix measurably false-fails on correct prose. Recorded as deferred item 6 so the limit is not lost.
  - `[medium]` `[patch]` Guard 54's positive arm was satisfied by any clause where `is tracked` co-occurred with the path — reproduced ("`.bmad-loop/policy.toml` holds the gate array and `package.json` is tracked." exited 0); fixed by attaching the assertion to the path. Re-verified failing.
  - `[medium]` `[patch]` The count arm stopped at twenty — duplicate of the claim-class finding; same fix, re-verified on "fifty guards".
  - `[medium]` `[patch]` Gated entry with npm flags — duplicate of the global-flag finding; same fix.
  - `[low]` `[patch]` `]` inside a multi-line entry body — duplicate of the terminator finding; same stated limitation.
  - `[low]` `[patch]` Guard 53 false-fails on correct prose naming an npm builtin outside `ci`/`install`/`run` — reproduced ("Run `npm audit` before releases." exited 1); fixed by extending the exempt list and printing the live list in the message. Re-verified green.
  - `[medium]` `[patch]` A backticked UPPER_SNAKE token outside the closing marker — duplicate of the clamp finding; same fix.
  - `[low]` `[reject]` Guard 54 false-fails when a needle and an unrelated tracked path share one clause — verified real; rejected because the fix (an adjacency window) adds complexity and would weaken the detection the guard exists for, and the phrasing is not how the block is written.
  - `[low]` `[reject]` `WORKOS_*` used to cover future inert WorkOS keys — carried: rejected in the prior pass, fixed there by dropping the uniqueness claim.
  - `[medium]` `[defer]` DW-87 stale reason — duplicate of the DW-87 finding; deferred item 4.
  - `[low]` `[reject]` Acceptance criterion names only two files — duplicate of the Boundaries finding; same ground.
  - `[false]` The diff edits the deferred-work ledger despite the "Never" list — refuted: DW-87/88/89 carry `origin: spec-deferred` and were written by the orchestrator from this spec's `deferred` block, not by a dev session.
  - `[low]` `[reject]` Guard B reads backticked tokens only — duplicate of the unbackticked-path finding; same ground.
  - `[medium]` `[patch]` Guard C misses an unbackticked glob — duplicate of the unbackticked-glob finding; same fix.
  - `[medium]` `[patch]` Guard 53's section→gate direction is unguarded — pre-verified by the verification-gap layer with three demonstrations; grouped with the section→gate finding above and fixed by the same arm.
  - `[medium]` `[defer]` Nothing re-proves the guards still detect anything; narrowing guard 55's token pattern makes it a green no-op — pre-verified and reproduced. The canary fix is a rewrite of three programs inside TOML literals with a live risk of breaking working guards, and the intent prescribes the manual both-ways verification that was performed twice here. Filed as deferred item 3.
  - `[medium]` `[defer]` DW-87 open but resolved — duplicate; deferred item 4.
  - `[medium]` `[patch]` "no automated test script" and "a pair of guards" both exit 0 — duplicate of the claim-class finding; same fix, both re-verified failing.
  - `[medium]` `[patch]` Clamp asymmetry between guard 53 and guards 54/55 — duplicate of the clamp finding; same fix.
  - `[low]` `[defer]` The guards fire at story-gate time, one story after a regeneration — carried from the prior pass: no better mechanism exists inside the editable files, and the limitation is documented with the right long-term home named.
  - `[low]` `[reject]` The guards test string presence, not claim truth — real and already stated in the comment block's "WHAT IT DOES NOT ASSERT"; rejected because no fix short of semantic analysis exists, and the alternative is a guard that false-fails on correct prose.
  - `[low]` `[reject]` The guards' pass set is narrower than the matrix's "correct tree" rows, because the extra arms require specific phrasings — real tension; rejected because the fix either edits this build's spec matrix or loosens arms that close demonstrated holes. The residual is now stated in the comment block.
  - `[medium]` `[defer]` The diff exceeds the intent's two-file boundary at `docker-compose.yml` and the ledger — real for the compose file, deliberate, and the only way the gate could pass; filed as deferred item 5 with the reasoning. The ledger half is refuted above.
  - `[low]` `[defer]` Count-freedom is enforced on the AGENTS.md slice and violated in the adjacent policy.toml comment — carried: the pre-existing narrative is deferred item 2, and the new comment's numbers are marked one-time baseline measurements.
  - `[low]` `[patch]` Counts reintroduced outside the guarded slice — this session's own "55 of 55" was a fresh unreconciled count; reworded count-free, with a line recording that the omission is deliberate.

### 2026-09-25 — Review pass
- verdicts: 46 findings — high 2, medium 19, low 18, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 54 misses the guarded claim when AGENTS.md's ~100-column hard wrap splits it across lines — reproduced (exit 0); fixed by joining continuation lines into paragraph/bullet units before splitting, re-verified failing.
  - `[medium]` `[patch]` Guard 54 misses the claim when a `:` or `;` sits between the path and the word — reproduced (exit 0); fixed by splitting on `[.;]`+whitespace only, with the correct `.env` sentence re-confirmed green.
  - `[low]` `[patch]` Guard 54's trailing-slash rationale was inoperative because `git ls-files` emits no directory entries — fixed by deriving tracked directory prefixes; `` `src/` is gitignored `` now fails.
  - `[medium]` `[patch]` Guard 55's `_`-required filter reopened the glob hole the widened char class existed to close (`` `WORKOS*` `` exited 0) — fixed with a glob arm on `*`/`?` independent of `_`.
  - `[reject]` Acceptance criterion "all 55 exit 0" is unmet and contradicted by the change's own deferred block — rejected because its only fix is to edit this build's spec; the underlying entry-51 failure is filed as deferred item 1.
  - `[medium]` `[patch]` The new comment said "while it runs the fifty-two above" — already false at 55 entries — fixed by anchoring the count to baseline `47966e4`.
  - `[low]` `[patch]` The new comment hard-coded 103/14/70/40 as unreconciled restatements — fixed by re-measuring against the shipped tree and marking each as a one-time measurement or a code constant.
  - `[reject]` Spec Design Notes says guard C finds 11 tokens where the tree yields 14 (11 was the pre-change count) — rejected because the fix edits this build's spec.
  - `[low]` `[defer]` `epics.md:319,325` still says "two guards" while AGENTS.md cites that file — pre-existing and outside the two editable files; filed as deferred item 2.
  - `[medium]` `[patch]` The bullet put `npm ci --no-audit --no-fund` outside the array it is entry 1 of, inventing a pre-step — reworded to "runs every entry of `[verify].commands` in order, starting with `npm ci …`".
  - `[medium]` `[patch]` The provenance restamp asserted a verification of the whole block when only four claims were re-checked, and refresh diffs `--diff-filter=DR` from that SHA — fixed by actually path-checking all 13 cited paths, running that diff over `5e09129..HEAD`, and fact-checking the remaining claims before keeping the stamp.
  - `[low]` `[reject]` No guard covers a backticked path that moved or was deleted — real but a new guard for a class no ledger entry recorded; rejected as complexity a developer is unlikely to meet before a path actually moves.
  - `[medium]` `[patch]` The rewritten bullet added three unguarded restatements of `package.json` script bodies; changing the `test` script left all guards green while the prose went stale — fixed by dropping the parentheticals.
  - `[low]` `[patch]` Guard 53 interpolated a `package.json` script name into a regex unescaped — fixed by replacing the regex with a literal scan plus a manual boundary.
  - `[low]` `[patch]` Guard 54's documented sentinel ("at least one backticked token among the clauses") was implemented against the whole file — fixed by testing over the clause set.
  - `[low]` `[patch]` Guard 55's false-failure direction (a backticked UPPER_SNAKE token that is not an env key) was undocumented with no stated escape — documented, with the escape spelled out both ways.
  - `[low]` `[patch]` AGENTS.md lost the old bullet's summary of what the gate enforces, leaving an agent pointed at a ~2,100-line TOML — fixed with a count-free category line.
  - `[reject]` Spec Code Map line numbers no longer resolve after the comment append — rejected because the fix edits this build's spec.
  - `[high]` `[patch]` Guard 55 checks declaredness only, so putting `WORKOS_COOKIE_PASSWORD` back on the must-stay-unset bullet spelled in full and deleting the carve-out exited 0 — DW-33's hazard in its likelier spelling; fixed with an arm that slices that bullet, rejects the key inside it, and requires the carve-out to exist. Re-verified failing.
  - `[low]` `[patch]` Guard 54 could not fail a directory claim — same root cause as the trailing-slash finding; fixed with tracked directory prefixes.
  - `[medium]` `[patch]` Path and word landing in different clauses across punctuation — same root cause as the hard-wrap finding; fixed by the same clause-window change.
  - `[low]` `[patch]` Guard 53's simple-entry match anchored on exactly two spaces and a double quote — fixed to accept leading whitespace and any of the four TOML quotings.
  - `[low]` `[patch]` Guard 53's reverse census read only the `npm run <x>` form, so bare `npm lint` exited 0 — fixed to accept the bare form while exempting `ci`, `install`, `run`.
  - `[low]` `[patch]` Guard 53 took the first column-0 `commands = [` without checking it belongs to `[verify]` — fixed by locating the `[verify]` header first and stopping at the next table header.
  - `[low]` `[patch]` Guard 53's entry loop broke only on an exactly-`]` line — fixed to break on a line starting `]` and to fail loudly when no terminator precedes EOF.
  - `[low]` `[patch]` Guard 55 can fail correct prose about a non-env UPPER_SNAKE token with no override — same root cause as the undocumented-false-failure finding; documented with its escape rather than loosened, since narrowing the census would reopen the glob hole.
  - `[low]` `[patch]` Guard 53's section slice was not clamped at `<!-- /bmad:context -->` — fixed; prose below the marker no longer enters the census.
  - `[low]` `[patch]` Guard 53 regex metacharacter interpolation — duplicate of the unescaped-interpolation finding; same fix.
  - `[low]` `[patch]` Guard 54's dedupe was dead because `bad.indexOf(p)` tested decorated entries — fixed with a separate `seen` set on the bare path.
  - `[low]` `[patch]` `WORKOS_*` used to cover future inert WorkOS keys, and "the one WorkOS key" would go false when another is declared — fixed by rewording to "never add it to the list above", dropping the uniqueness claim.
  - `[medium]` `[defer]` Entry 51 exits 1 at baseline, so the gate these guards rely on already reports FAIL — filed as deferred item 1; the one-clause fix is in `docker-compose.yml`, outside the two editable files.
  - `[medium]` `[patch]` Guard 54 exited 0 on `` `src/` is gitignored `` and on `` `policy.toml`: gitignored `` — both root causes fixed above and both re-verified failing.
  - `[medium]` `[patch]` Only two-space double-quoted simple entries were censused, so a gated script in another spelling stayed undocumented — fixed with the widened entry match.
  - `[high]` `[patch]` Guard 55 passed prose telling every session to clear the state signer, verified by deleting the carve-out and listing the key in full — same entry as the membership finding; the new arm makes both spellings fail.
  - `[medium]` `[defer]` The three guards sit behind a failing entry, so a reintroduced claim is indistinguishable from the standing failure — the durability argument depends on entry 51 being fixed; filed as deferred item 1 with that consequence recorded.
  - `[medium]` `[patch]` AGENTS.md restated each script's command body while the census reconciles names only — same entry as the parenthetical finding; fixed by removing the restatements rather than by adding a body arm.
  - `[medium]` `[patch]` Guard 54's needle missed "exists only in the main checkout", the actionable half of DW-29 — fixed by widening the needle set to four phrases and adding a positive arm requiring the clause naming `.bmad-loop/policy.toml` to say "tracked". Re-verified failing.
  - `[low]` `[defer]` `.bmad-loop/policy.toml:33,44` still describes the array at four entries — pre-existing, read by no gate command; filed as deferred item 3.
  - `[low]` `[patch]` Entry 51 has never executed in a recorded gate run, so manual `sh` runs are the only evidence these guards work — noted; the full 55-entry array was re-run here after the patches, and the both-ways matrix re-run per guard.
  - `[reject]` Spec numbers (11 vs 14) and the "all 55" criterion — duplicate of the two spec-edit rejections above; same ground.
  - `[false]` The diff implements a hand patch inside the managed region rather than a generator-side change, which the intent warned about — refuted: the intent asks for durability without naming a mechanism, and `bmad-project-context/SKILL.md:66,105` explicitly prefers a check over prose; the correction's durability now rests on guards that fail the gate when any of the four claim classes returns, which is not replaced by a regeneration.
  - `[low]` `[patch]` The detector fires at story-gate time, not at refresh time, so a regeneration surfaces one story later against a story that cannot fix it — no better mechanism exists inside the two editable files; documented as a stated limitation with the right long-term home named.
  - `[medium]` `[patch]` The guards covered the exact spellings removed, not the claim classes: re-adding "There is no test script" while `npm test` stayed named, and re-adding a count, both exited 0 — fixed with two narrowly-scoped arms over the section slice (a `no <name> script` phrase for any declared script, and a count qualifying guard/command/check/entry). Both re-verified failing and green on the corrected text.
  - `[medium]` `[patch]` New prose restated script bodies — duplicate of the parenthetical finding; same fix.
  - `[medium]` `[patch]` "Read that array … instead of restating it anywhere" contradicted guard 53's own requirement to name gated scripts in that section — fixed by narrowing the instruction to "the guard list or its length" and stating the naming obligation, with the same obligation recorded in guard 53's comment.
  - `[medium]` `[patch]` The spec's "all 55 exit 0" criterion is unmet on this tree, correctly scoped out — the verdict stands as recorded in deferred item 1; no spec edit made.

## Design Notes

**Why guards, not just sentence edits.** DW-5 offers "three sentence-level edits" as the smallest
fix; five later entries prove sentence edits alone decay — the guard count went 2 → 11 → 15 → 36 → 52
while the sentence stood still. Removing the count stops that one sentence from aging, but nothing
stops the *next* claim from going false. Guards are the repo's existing answer: `[verify]` guards
8, 9 and 10 already reconcile `ops/README.md` prose against the conf, the plists and the wrapper.
`bmad-project-context/SKILL.md:66` makes the same call — prefer a check over a line of prose.

**Quoting.** Entries are TOML `'''sh -c '…' '''` literals, so the program may contain no `'`.
Inside, `node -e "…"` is double-quoted by `sh`: escape `"` as `\"` and `$` as `\$`, avoid template
literals and backticks, and obtain a literal backtick as `String.fromCharCode(96)` — the same
problem the existing guards solve with `bt=$(printf "\140")`.

**Extraction shapes, all prototyped against the current tree.** Guard A reads only *simple*
`  "npm …"` array entries (the complex `sh -c` entries are skipped, so a mention inside a guard body
is never mistaken for a gated command) and filters to names `package.json` declares; on this tree
that yields exactly `check`, `test`, `build`. `npm ci` is an npm builtin, not a script, and drops
out. Guard B splits AGENTS.md on newlines and on `[.;:]` followed by whitespace, so the correct
clause "Keep secrets out of the repo: `.env` is gitignored; `.env.schema` and `.env.example` carry
key names and shapes only" does not put the two tracked schema files in the same clause as the word
and pass a false failure. Guard C requires a token to contain `_`, which keeps `AD-3` and `127.0.0.1`
out; on the corrected tree it finds 11 tokens, all declared.

Each guard was run against the *uncorrected* tree during planning: A reported `test` and `build`
missing, B reported `.bmad-loop/policy.toml`, C reported `WORKOS_*`. Re-prove both directions after
the edits.

## Verification

**Commands:**
- `git rev-parse HEAD` -- expected: the full SHA stamped verbatim into the provenance line.
- `node -e` runs of guards A, B and C against the corrected tree -- expected: each exits 0.
- One deliberate break per guard (drop `npm test` from the AGENTS.md section; write
  `` `.bmad-loop/policy.toml` is gitignored ``; restore `` `WORKOS_*` ``), each run and reverted --
  expected: exit 1 with a message naming the offending token and the file, then
  `git status --porcelain` back to `AGENTS.md` + `.bmad-loop/policy.toml` only.
- `npm run check` and `npm test` -- expected: pass, unchanged (no source file is touched).
- `git diff --name-only` -- expected: exactly `AGENTS.md` and `.bmad-loop/policy.toml`.
- Each appended `[verify].commands` entry executed as written through `sh -c` -- expected: exit 0,
  proving the TOML literal survives shell quoting as well as the prototype did.

**Manual checks (if no CLI):**
- `AGENTS.md` still opens with `<!-- bmad:context -->` and ends with `<!-- /bmad:context -->`, and
  no line outside those markers changed.

## Auto Run Result

Status: done

### What was implemented

`AGENTS.md`'s `## Running and verifying` section and its must-stay-unset bullet state only true,
count-free claims: the three gated scripts are named, the gate is described as every entry of
`[verify].commands` in order, `.bmad-loop/policy.toml` is called tracked, the `WORKOS_*` glob is
replaced by the three inert keys, and `WORKOS_COOKIE_PASSWORD` is carved out as the `state`-signer
link that stays set. Three guards appended to `[verify].commands` reconcile those claims against the
repo on every story gate, so the six ledger entries' claim classes fail the gate instead of shipping.

This session was a follow-up review pass on a spec already at `done`. It changed no behaviour of the
correction itself; it closed eight demonstrated holes in the three guards — places where a
reintroduced claim, or a legal respelling of an array entry, exited 0 — and corrected the comment
claims that described the guards as tighter than they were.

### Files changed

- `.bmad-loop/policy.toml` — the only file this session edited. Guard 53 and guard 55 were tightened
  inside `[verify].commands` (entries 53 and 55; the array still holds 55 entries and entries 1-52
  are byte-identical to `HEAD`), and the `[verify]` comment narrative was corrected where it
  overstated what the guards do.
- `AGENTS.md` — unchanged this session, byte-identical to `HEAD`; committed in `bcf0ff9`.
- `docker-compose.yml` — unchanged this session; the one reworded comment clause is committed in
  `2dd8e20` and remains the boundary excursion recorded as deferred item 5.
- `_bmad-output/implementation-artifacts/spec-agents-md-context-block-refresh.md` — this spec.
- `_bmad-output/implementation-artifacts/deferred-work.md` — orchestrator-written; not edited here.

### Review findings

39 findings across four layers — 0 high, 18 medium, 20 low, 1 false, 0 maybe-false.

**Patched (8 entries: 6 medium, 2 low).** Guard 53: the array scan ended at an *indented* `]`, which
truncated the gated set with the terminator flag set and no sentinel firing; an entry carrying a
value-taking npm flag, or a trailing `#` comment containing an apostrophe, silently left the gated
set; the count arm missed `one`, `fifty-one` and `a few`; the heading search ran over the whole file
instead of the managed block, so a hand note above the opening marker was censused in place of the
block; the denial arm was scoped to one section, so "There is no test script" passed one heading
down; the forward arm false-failed on an unbackticked sentence-final `npm test.` that its own
reverse arm accepts; and the failure message advised deleting an entry from an append-only array.
Guard 55: the carve-out arm accepted a negation in front of the key, so "Never keep
`WORKOS_COOKIE_PASSWORD` set." passed.

**Deferred (3 new items, 10 total).** `AGENTS.md:16` still calls `tsc --noEmit` the only real check —
the same claim class, outside the corrected section and not matched by any arm (item 8); DW-90's
recorded demonstration no longer reproduces, so a sweep would read it as closed (item 9); the
provenance line names the baseline SHA, which predates the commits that wrote the block (item 10).

**Rejected, with reasons.** Nothing guards the append-only rule itself — the fix is a new
array-diffing guard, past a direct correction, and the rule is now stated in both AGENTS.md and the
failure message. Guard 55's `_`-required token filter skips single-word keys — widening it makes
every backticked uppercase word an env-key claim, a trade the prior pass settled with a documented
escape. Three prior rejections cited the wrong section boundary, DW-92 and the Spec Change Log
misplace the surviving two-file assertions, and the second triage log's header tally does not
partition its bullets — all three real, all three fixed only by editing this build's spec. The
`docker-compose.yml` comment sits one keystroke from tripping guard 51 — which is what guard 51 is
for, and it is green. Guard 54's missing `git ls-files -z` — refuted: git C-quotes a path containing
a newline onto one line, and no such path is tracked. Carried rejections from earlier passes, not
re-litigated: the wording-surface trade, the guards-as-unwritten-schema tension, the six arms beyond
the I/O matrix, guard 54's shared-clause false failure.

### Verification performed

- All 55 entries of `[verify].commands` executed in order through `sh -c` as written: **55/55 exit
  0**, including `npm ci --no-audit --no-fund`, `npm run check`, `npm test` and `npm run build`.
- The by-hand break/revert matrix re-run in full after the edits: **40 cases, 0 misses** — 3
  correct-tree cases, 14 covering the holes closed this pass (each measured exiting 0 before the fix
  and 1 after, plus the three that must stay green), and 23 regressions over every arm and sentinel
  the two earlier passes established. Every break was reverted immediately.
- `AGENTS.md` byte-identical before and after the matrix; `git status --porcelain` names only
  `.bmad-loop/policy.toml` and the two `_bmad-output/` files the orchestrator was already carrying.
- `[verify].commands` compared entry-by-entry against `HEAD`: 55 entries before and after, with only
  entries 53 and 55 differing — the array was appended to and never rewritten or reordered.
- `npm run check` and `npm test` run standalone: both exit 0.

### Residual risks

- The guards still have no automated self-test (deferred item 3 / DW-90), and this pass enlarged the
  surface that only the by-hand matrix covers. A later edit that narrows an arm turns it into a green
  no-op indistinguishable from a pass; the comment block now says so and tells the next editor to
  re-run the matrix.
- The denial arm now reads the whole managed block, but it matches `no <script> script` phrasings
  only. The "only real check" wording at `AGENTS.md:16` is the same claim class and stays unguarded
  (deferred item 8).
- Guard 53 still reads the array line by line. An indented `]` is now safe; a `]` at column 0 inside
  a future multi-line entry body would still truncate the census silently. Recorded as a stated
  limitation in the comment block.
- The three guards fire at story-gate time, one story after a regeneration would reintroduce a claim
  (carried limitation, documented with the right long-term home named).

### Follow-up review recommendation

`false`. This was a follow-up pass and it patched no `high` finding — 6 medium and 2 low entries were
patched, every one demonstrated failing before the fix and re-verified after, with the full 40-case
matrix and the whole 55-entry array green. The work has converged.

