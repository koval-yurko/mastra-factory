---
title: 'Gate guards for four unenforced artifact invariants (DW-57, DW-80, DW-81, DW-83)'
type: 'chore'
created: '2026-09-25'
status: 'done'
baseline_revision: '2b9d7e2dc3e3dd1a6633378c62732f83d0d9e20a'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      AD-4's "or other program source" category is still unenforced for
      non-TypeScript/JavaScript languages — guard 5 is an extension filter, not a
      category rule.
    evidence: |-
      Measured in this worktree: a tracked `ops/probe.py` passes guard 5 and every
      other command in `[verify].commands` (61/61 green). The widening this change
      made closes the eight-extension TypeScript/JavaScript family only, which is
      the fix DW-57's ledger text prescribed; AD-4's rule text enumerates four
      extensions and then says "or other program source", with an `ops/*.sh`
      carve-out. Closing the category needs either a language-agnostic rule or
      AD-3-style derivation from the spine, and the extension list cannot express
      it. Recorded in the guard's own comment block as a stated limit.
    location: >-
      .bmad-loop/policy.toml [verify].commands guard 5
    severity: low
  - summary: >-
      No gate command reads the `cd "$REPO_ROOT"` line in ops/factory-start.sh, so
      the wrapper can still be pointed at another manifest without touching its
      exec line.
    evidence: |-
      Measured: rewriting `ops/factory-start.sh:129` from `cd "$REPO_ROOT"` to
      `cd /tmp` leaves all 61 commands green. npm then resolves whatever
      package.json is nearest that directory, so `npm run start` never reaches
      this repository's `varlock run --` prefix — the same bypass new entry 61
      closes on the exec line, one line above it. The baked-repo-root guard pins
      the `readonly REPO_ROOT=` literal against ops/install.sh and the plist, but
      nothing asserts that the `cd` actually uses it. AD-11 names "must work with
      the repo root as cwd" as part of the same rule. Smallest fix: one arm on the
      wrapper asserting the last `cd` before the exec is `"$REPO_ROOT"`.
    location: >-
      ops/factory-start.sh:129
    severity: medium
  - summary: >-
      Only one key's VALUE is reconciled between .env.schema and .env.example; the
      parity guard compares key names and order only, so every other default can
      drift in the file the operator deploys from.
    evidence: |-
      The schema/example parity guard strips values with `sed "s/=.*$//"` and
      compares key names and order, so a drifted value in `.env.example` is
      invisible to it. This change added a value comparison for
      `MASTRACODE_SANDBOX_WORKDIR` alone, because that is the key DW-80 named.
      Measured before that arm existed: setting `.env.example`'s copy to `/srv`
      left all 61 commands green, and `.env.example` is the file the operator
      copies to `.env`, so its value is the one that wins at runtime. Every other
      defaulted key in that file has the same exposure. Smallest fix: extend the
      parity guard to compare values for keys whose schema declaration carries a
      non-empty default, rather than one key at a time.
    location: >-
      .bmad-loop/policy.toml [verify].commands (the .env.schema/.env.example
      parity guard) / .env.example
    severity: low
  - summary: >-
      `sandbox/README.md` is a fifth copy of the sandbox workdir and guard 46
      cites it as the binding it protects, but nothing reconciles it.
    evidence: |-
      Guard 46's own messages say `sandbox/README.md` "ties
      MASTRACODE_SANDBOX_WORKDIR to it by sight", and that README writes
      `/workspace` in prose at :54 and :167-:169. The guard reconciles the four
      machine-readable copies and cannot read the fifth: it is documentation, not
      a declaration, so an arm for it would be a grep for a path substring in
      English. Pre-existing — the README predates this change, and guard 30
      already polices what may and may not appear in the six READMEs without
      touching values. Measured: rewriting every `/workspace` in that file to
      `/srv` leaves all 61 commands green. The boundary is now stated in guard 46's
      comment block rather than left to be rediscovered. Smallest fix: one arm
      requiring the README to carry the `wd` guard 46 already extracted, at least
      once, accepting that it asserts presence rather than absence of drift.
    location: >-
      sandbox/README.md:54,167-169 / .bmad-loop/policy.toml [verify].commands
      guard 46
    severity: low
---

<intent-contract>

## Intent

**Problem:** Four invariants this repository states in prose are enforced by no command in `.bmad-loop/policy.toml` `[verify].commands`: AD-4's ban on first-party program source outside `src/` is filtered to exactly four extensions, so a tracked `.tsx`/`.jsx`/`.mts`/`.cts` outside `src/` is invisible to the gate *and* to `tsc` (`tsconfig.json` is `include: ["src/**/*"]`); the sandbox working directory is written in three tracked places and only the Dockerfile's copy is pinned; the sandbox image's entire reason to exist — carrying `git` and `gh` — is asserted nowhere, so the GitHub CLI install block can be deleted with every command green; and the production chain LaunchAgent → `ops/factory-start.sh` → `exec npm run start` is gated only on its `package.json` half, so rewriting that `exec` line to `mastra start` bypasses varlock entirely.

**Approach:** Widen the one `git ls-files` pathspec in guard 5; extend guard 46, which already holds the Dockerfile `WORKDIR` in a variable, to reconcile the two other tracked copies against it; and append two new guards at the very end of the array — one over `sandbox/factory-sandbox.Dockerfile`'s apt package lists, one over `ops/factory-start.sh`'s `exec` line.

## Boundaries & Constraints

**Always:** Append new entries at the END of `[verify].commands`; the comment block names existing guards by number, so an insertion renumbers them. Every new or changed guard is proved both ways by hand — passing on the clean tree, failing and naming the offender on a deliberate break that is reverted immediately. Every guard that greps a file first proves the file exists, is non-empty and is a regular file, so an absence-of-match arm can never pass vacuously; and every extraction that comes back empty is a loud failure, not a pass. Keep the guard prose above the array in step with what the array now asserts.

**Never:** Do not delete, reorder, weaken or narrow any existing assertion — the two in-place edits are strictly additive. Do not change `sandbox/factory-sandbox.Dockerfile`, `.env.schema`, `src/mastra/config/sandbox.ts`, `ops/factory-start.sh`, `tsconfig.json` or AD-4's text: the invariants already hold on the clean tree and this change only makes them checkable. Do not edit `AGENTS.md` (guard 53 forbids stating a gate-command count there) and do not touch the deferred-work ledger or the sprint board.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean tree | Repository as committed | All four guards exit 0 | No error expected |
| Stray `.tsx` outside `src/` | A tracked/intent-to-add `probe.tsx` at root | Guard 5 prints the path and exits 1 | Path named in output |
| Workdir drift | `MASTRACODE_SANDBOX_WORKDIR=/srv` in `.env.schema`, Dockerfile unchanged | Guard 46 exits 1 naming both values and both files | Both sides printed |
| Workdir drift in code | `DEFAULT_SANDBOX_WORKDIR = '/srv'` in `src/mastra/config/sandbox.ts` | Guard 46 exits 1 naming both values and both files | Both sides printed |
| `gh` block deleted | Dockerfile lines 5–9 removed | New Dockerfile-package guard exits 1 naming `gh` | Missing package named |
| Wrapper bypasses npm | `ops/factory-start.sh:130` becomes `exec mastra start` | New wrapper guard exits 1 naming the offending line | Line and reason printed |
| Subject missing/unreadable | Dockerfile or wrapper absent, empty, a directory or a symlink to one | Guard exits 1 as an extraction failure | Never a vacuous pass |

</intent-contract>

## Code Map

- `.bmad-loop/policy.toml` -- the only file this change edits. `[verify]` table at :28; the guard-numbering prose that must stay in step at :33–:38 ("No first-party .ts/.js/.mjs/.cjs outside src/"); `commands = [` at :2393, entries at :2394–:2452 (59 entries, 1-based numbering — line = 2393 + N). Guard 5 = :2398 (`git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/"`). Guard 46 = :2439 (Dockerfile one-`WORKDIR`/pinned-`FROM`; already computes `wd` and compares it to `/workspace`). Guard 45 = :2438, guard 48 = :2441 (`package.json` `scripts.start` contains `varlock run --`). New guards land at :2453 as entries 60 and 61.
- `sandbox/factory-sandbox.Dockerfile` -- READ-ONLY subject. `FROM node:22-bookworm-slim` :1; RUN at :3–:10 installs `git ca-certificates curl gnupg openssh-client less` then adds the GitHub CLI apt source and installs `gh` (:9); second RUN :13–:15; `WORKDIR /workspace` :18. Uses `\` line continuations, so package tokens must be read after joining them.
- `.env.schema` -- READ-ONLY subject. `MASTRACODE_SANDBOX_WORKDIR=/workspace` at :514 (declared at column 0; the ledger's `:499` is stale).
- `src/mastra/config/sandbox.ts` -- READ-ONLY subject. `const DEFAULT_SANDBOX_WORKDIR = '/workspace';` at :90 (single-quoted, trailing `;`).
- `ops/factory-start.sh` -- READ-ONLY subject. Exactly one `exec` line, `exec npm run start` at :130, preceded by `cd "$REPO_ROOT"`.
- Reuse pointers inside `[verify].commands`: guard 46 (:2439) for the `grep -n` + `sed -E` + `tr -d "\042\047\015"` single-value extraction idiom and its count-must-be-1 arms; guard 59 (:2446) for the `node -e` idiom with `\"` escaping and `String.fromCharCode` where a literal quote is impossible; guard 47 (:2440) for `q=$(printf "\47")`. A TOML `'''sh -c '…' '''` entry cannot contain a literal `'` inside the shell string, and a `\\` inside the inner `node -e "…"` collapses to one backslash — build backslashes with `String.fromCharCode(92)` rather than escaping them.
- Verified read-only evidence: the widened pathspec returns nothing on the clean tree (`git ls-files "*.ts" "*.tsx" "*.js" "*.jsx" "*.mjs" "*.cjs" "*.mts" "*.cts" | grep -v "^src/"` → empty); all three workdir copies read `/workspace`; no existing entry greps the wrapper's `exec` line or the Dockerfile's package lists.

## Tasks & Acceptance

**Execution:**
- `.bmad-loop/policy.toml` :2398 -- add `"*.tsx" "*.jsx" "*.mts" "*.cts"` to guard 5's single `git ls-files` invocation, leaving the four existing globs and the `grep -v "^src/"` arm untouched -- closes DW-57: AD-4 bans "other program source" and `tsc` cannot see any of these outside `src/`.
- `.bmad-loop/policy.toml` :33–:38 -- update the guard prose that enumerates the four extensions so it names the widened set -- the comment is what the next reader treats as the guard's contract.
- `.bmad-loop/policy.toml` :2439 -- extend guard 46 with two arms that reconcile `.env.schema`'s `MASTRACODE_SANDBOX_WORKDIR=` default and `src/mastra/config/sandbox.ts`'s `DEFAULT_SANDBOX_WORKDIR` against the `wd` it already extracted, each preceded by its own non-empty/regular-file check and a "declared exactly once" count -- closes DW-80: changing one copy alone leaves the container mounting a path the server does not use.
- `.bmad-loop/policy.toml` :2453 -- append entry 60, a guard that joins the Dockerfile's `\` continuations, collects the package tokens of every `apt-get install` invocation, fails as an extraction failure if none is found, and requires both `git` and `gh` among them -- closes DW-81.
- `.bmad-loop/policy.toml` :2453 -- append entry 61, a guard that requires `ops/factory-start.sh` to carry exactly one `exec` line whose command is `npm` (bare, or with leading flags) invoking the `start` script, accepting `npm run start` and `npm start` -- closes DW-83: guard 48 pins only the `package.json` half of the chain.
- `.bmad-loop/policy.toml` -- add a comment block ahead of the array documenting the two new guards by number, the two in-place widenings, and the both-ways matrix actually run -- matches how guards 43–48 and 53–55 are recorded there.

**Acceptance Criteria:**
- Given the repository as committed, when every entry of `[verify].commands` is run in order, then every entry exits 0.
- Given a tracked `.tsx`, `.jsx`, `.mts` or `.cts` file outside `src/`, when guard 5 runs, then it exits 1 and prints that path.
- Given `.env.schema`'s `MASTRACODE_SANDBOX_WORKDIR` default changed to a value the Dockerfile's `WORKDIR` does not carry, when guard 46 runs, then it exits 1 naming both values and both files.
- Given `DEFAULT_SANDBOX_WORKDIR` in `src/mastra/config/sandbox.ts` changed to a value the Dockerfile's `WORKDIR` does not carry, when guard 46 runs, then it exits 1 naming both values and both files.
- Given the GitHub CLI install block deleted from `sandbox/factory-sandbox.Dockerfile`, when entry 60 runs, then it exits 1 and names `gh` as the missing package.
- Given `ops/factory-start.sh:130` rewritten to `exec mastra start`, when entry 61 runs, then it exits 1 and prints the offending `exec` line.
- Given any subject file of a new or extended guard is missing, empty, or not a regular file, when that guard runs, then it exits 1 naming the file rather than passing vacuously.
- Given the finished change, when `git status --porcelain` is inspected, then `.bmad-loop/policy.toml` is the only modified repository file besides this spec.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 30 findings — high 0, medium 18, low 12, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: guard 5 omits `-c core.quotePath=false`, so a legal non-ASCII path under `src/` is quoted and escapes `grep -v "^src/"` — reproduced: staging `src/café.ts` made the guard exit 1 printing `"src/caf\303\251.ts"`; patched to `git -c core.quotePath=false ls-files`, re-measured passing on that file and still failing on `ops/sub/probe.tsx`.
  - `[medium]` `[patch]` blind-hunter: `.env.example:453` is a fourth tracked copy of the sandbox workdir and it is the copy the operator deploys from — reproduced: setting it to `/srv` left all 61 commands green; patched with a fourth arm in guard 46 and the prose corrected from "three" to "four".
  - `[medium]` `[patch]` blind-hunter: guard 46's `sandbox.ts` arm is anchored `^const`, so `export const DEFAULT_SANDBOX_WORKDIR` fails as "found 0" — reproduced; patched to accept an optional `export` and an optional type annotation.
  - `[medium]` `[patch]` blind-hunter: neither new value extraction drops a trailing comment, so an agreeing value is reported as drift — reproduced for both `= /workspace # clone path` (varlock accepts it, measured) and `= '/workspace'; // clone path`; patched with whitespace truncation plus trailing-`;` strip.
  - `[low]` `[reject]` blind-hunter: the new arms sit between guard 46's `wd` extraction and its `FROM` pin, so a missing `.env.schema` now short-circuits the base-image check — no assertion is lost: the only trees on which the `FROM` arm is skipped are trees where guard 46 already exits 1, so the gate is red either way, and the fix's only effect is which message prints first.
  - `[medium]` `[patch]` blind-hunter: entry 60 censuses comment lines, so commenting out the `gh` install passes — reproduced: rc=0 with the `gh` line commented and with the whole first `RUN` layer commented, both of which Docker drops so the image loses `gh`; patched to skip `#` lines before the continuation join and to anchor the `apt-get … install` match at its segment start.
  - `[medium]` `[patch]` blind-hunter: entry 61 rejects a quoted command path — reproduced: `exec "$NODE_BIN/npm" run start` and `exec '/usr/bin/npm' run start` both rc=1 while the wrapper's own style quotes; patched with `tr -d "\042\047\015"` on the extracted command.
  - `[medium]` `[patch]` blind-hunter: entry 61 green-lights `exec npm --prefix /elsewhere run start` — reproduced rc=0, and that line runs another package's `start` script, skipping this repo's `varlock run --`; patched to reject `--prefix`, `--workspace`, `-w` and `--include-workspace-root` outright, in both spellings, before the value-consuming strip.
  - `[low]` `[patch]` blind-hunter: the new comment hard-codes "all fifty-nine other commands" — the arithmetic claim is refuted (guard 48 plus 59 others is exactly the 60 entries the array holds besides entry 61), but the hard-coded count is the rot pattern guard 53 rejects in AGENTS.md; patched to point at the array instead of counting it.
  - `[low]` `[patch]` blind-hunter: "The last eleven guards cover ops/" is stale now that entry 61 is a twelfth `ops/` guard at the array's end, and "the same set guard 35 sweeps" undercounts — patched: the paragraph now says first eleven of twelve and names guards 26, 35, 36, 38, 39 and 41.
  - `[low]` `[reject]` blind-hunter: the spec's Code Map line offsets are invalidated by this change's own comment insertion — the claim is true, but the Code Map records the baseline the implementer worked from and the only fix is to edit this build's spec, which triage rejects; the comment block addresses guards by number for this reason.
  - `[low]` `[patch]` blind-hunter: guard 46's remediation text names three files, but a coordinated edit still fails entry 7 because `src/mastra/config/sandbox.test.ts` pins the literal — patched: all three mismatch messages now name that file and its four sites. The finding's other half (add an acceptance criterion for the negative case) is rejected: its fix edits this build's spec, and the negative case was measured in this pass regardless.
  - `[medium]` `[patch]` edge-case-hunter: same `core.quotePath` defect as the first row — grouped with it; patched and re-measured.
  - `[medium]` `[patch]` edge-case-hunter: guard 5 had no non-vacuous sentinel, so an empty `git ls-files` listing passes — the change edits that exact invocation and the file's own standard forbids a census that can pass on nothing; patched with a `test -n` sentinel that names the pathspec, re-measured failing on a pathspec that matches nothing.
  - `[medium]` `[patch]` edge-case-hunter: inline comment or trailing whitespace after either new declaration — grouped with the extraction-hygiene row above; patched.
  - `[medium]` `[patch]` edge-case-hunter: `export const` or a type annotation on `DEFAULT_SANDBOX_WORKDIR` — grouped with the `export const` row above; patched, including the annotated spelling.
  - `[medium]` `[patch]` edge-case-hunter: Dockerfile comment line carrying an `apt-get install` — grouped with the entry 60 row above; patched.
  - `[low]` `[patch]` edge-case-hunter: a redirection-only `exec` is counted as a second exec — reproduced: adding `exec >>"$HOME/log" 2>&1` gave rc=1 "found 2" and called a log redirect "a second server"; patched to count only exec lines whose first token is not a redirection, re-measured passing for `>>`, `2>&1`, `2>>`, `</dev/null` and `3>&1` while a second command exec still fails.
  - `[medium]` `[patch]` edge-case-hunter: the claim "ALL THREE TRACKED COPIES" is false — grouped with the `.env.example` row above; the prose now says four and the arm reads the fourth.
  - `[low]` `[patch]` edge-case-hunter: entry 60's stated rule is wider than its check — reproduced: installing `gh` by tarball exits 1, so the "deliberately does not assert" paragraph read as a tolerant blind spot when the behaviour is a deliberate failure; patched to state plainly that an apt install is the required mechanism.
  - `[medium]` `[patch]` verification-gap (pre-verified): entry 60's comment-line census lets an image with neither `git` nor `gh` pass, and no other command reads the Dockerfile's package lists — grouped with the entry 60 row; patched, with the commented-out cases added to the recorded matrix.
  - `[medium]` `[patch]` verification-gap (pre-verified): entry 61 steps over `--prefix`/`--workspace` and their values, so an exec running a different package's `start` script passes, and entry 48 still passes because the root manifest is untouched — grouped with the package-root row; patched.
  - `[medium]` `[patch]` verification-gap other: entry 61 rejects a correct quoted npm path — grouped with the quoted-path row; patched.
  - `[low]` `[patch]` verification-gap other: the edited `ops/` paragraph still claims "the last eleven guards" — grouped with the prose row; patched.
  - `[medium]` `[patch]` intent-alignment (a): entry 60 is wrong in both directions — false negative on a commented-out install, false positive on a non-apt install; both reproduced, both addressed (census fix for the first, honest prose for the second).
  - `[medium]` `[defer]` intent-alignment (b): entry 61 pins the exec token, not the whole chain. The `--prefix` half was patched. The `cd "$REPO_ROOT"` half is real and unasserted — measured: `cd /tmp` leaves all 61 green — and is deferred as a separate invariant the intent did not name. The over-strictness half (an early-exit `exec /usr/bin/true` guarded by a `DRY_RUN` branch fails the exactly-one-exec count) is rejected: that count is a deliberate, stated assertion for a launchd wrapper, and the one spelling that was a genuine false failure — a redirection-only exec — is patched.
  - `[low]` `[patch]` intent-alignment (c): guard 46 reconciles tracked defaults while an untracked `.env` still overrides them — true, and outside every gate's reach since `.env` is gitignored; the only actionable step was to name the boundary, which the comment block now does.
  - `[low]` `[patch]` intent-alignment (d): the new prose called the eight extensions "the eight first-party source extensions AD-4 admits" when AD-4 enumerates four and then says "or other program source", and a tracked `ops/probe.py` passes — reproduced; the prose now states what the widening does and does not close, and the residual category gap is recorded in `deferred`.
  - `[low]` `[patch]` intent-alignment (e): the change installs a strengthen-in-place reading of append-only without reconciling with the earlier item that decided the identical widen-versus-append question the other way — patched with a paragraph naming that item, explaining why its case was a weakening wearing a widening, and stating the shared rule: an entry may be strengthened in place only when the old assertion survives the edit verbatim.
  - `[low]` `[reject]` intent-alignment (f): the both-ways proof is narrative, not an executable regression — true and already ledgered as DW-90, which the new comment block re-states; building a harness for these entries is far beyond a direct correction and is not this change.

### 2026-09-25 — Review pass (follow-up)
- verdicts: 36 findings — high 0, medium 6, low 25, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` blind-hunter: guard 46's three mismatch messages said "all four tracked copies move in one edit" and then listed three copies plus `sandbox.test.ts`, omitting the Dockerfile `WORKDIR` — the reference value, and the one that may be wrong — so a maintainer following the message edits everything except the offending copy; and "move" was never available, because the arm above hard-pins `wd` to `/workspace`. Patched: each message now names all four including `$d WORKDIR`, says they must all READ `/workspace`, and says the fix is to bring the odd one back.
  - `[low]` `[patch]` blind-hunter: the "four sites" count for `sandbox.test.ts` is five — verified, `/workspace` is asserted at :175, :192, :266, :269 and :272. Patched by removing the count from all three messages and from the comment block rather than correcting it, since a count in prose is the rot guard 53 rejects.
  - `[low]` `[patch]` blind-hunter: the remediation was impossible under guard 46's own `test "$wd" = "/workspace"` arm — grouped with the first row; the messages now state the pin instead of implying a coordinated move.
  - `[medium]` `[patch]` blind-hunter: guard 46's `.env.example` arm read column 0 only, and the parity guard's own remediation asks for a mirrored key "commented out", so the blessed spelling was the unguarded one — reproduced: `# MASTRACODE_SANDBOX_WORKDIR=/srv` left all 61 commands green, one `#` away from the value that wins at runtime. Patched to `^(# )?KEY=`, re-measured failing on the commented drift and still passing on `# KEY=` empty, `# KEY=/workspace`, and the key deleted.
  - `[low]` `[defer]` blind-hunter: `sandbox/README.md` writes `/workspace` in prose and guard 46 cites it as the binding it protects, but nothing reconciles it — measured: rewriting every `/workspace` there to `/srv` leaves all 61 green. Pre-existing and unreadable by a declaration-shaped arm; deferred, with the boundary now stated in guard 46's comment block.
  - `[low]` `[reject]` blind-hunter: the duplication root cause is untouched and the fix is to make `sandbox.test.ts` import `DEFAULT_SANDBOX_WORKDIR` — the intent's Never forbids changing `src/mastra/config/sandbox.ts` and its last acceptance criterion names `.bmad-loop/policy.toml` as the only modified file, so the intent itself excludes this.
  - `[low]` `[patch]` blind-hunter: the rewritten `ops/` paragraph replaced one stale count with another — measured, 22 entries read `ops/` paths (8-19, 23, 25, 28, 30, 32, 49-52, 61), not twelve. Patched by removing the total and recording the refuted number as the reason not to state one.
  - `[low]` `[patch]` blind-hunter: entry 60's message said "with apt" while the regex matched `apt-get` alone, so `apt install -y git gh` on a Debian base was told to do what it had just done — reproduced rc=1. Patched: the matcher now accepts `apt`, `apt-get` and either by absolute path, and the message names both commands. Re-measured passing on `apt install` and `/usr/bin/apt-get install`.
  - `[low]` `[reject]` blind-hunter: entry 61 rejects the `env`/`VAR=value` prefixes entry 60 steps over (`exec env NODE_ENV=production npm start` → rc=1) — real, but the strictness is deliberate for a single launchd boot line, the failure message names every accepted spelling, and widening the prefix would have to reject `npm_config_prefix=…` in the same breath, which is the bypass this guard exists for wearing an assignment. The boundary is now stated in the comment block.
  - `[false]` `[reject]` blind-hunter: "the npm that is checked is not the npm that runs" — refuted at `ops/factory-start.sh:21`, which exports `PATH=$NODE_BIN:…` with the pinned bin first, so the bare `exec npm` resolves to exactly the binary the `:122` preflight tested.
  - `[medium]` `[defer]` blind-hunter: `carried` — `cd "$REPO_ROOT"` at `ops/factory-start.sh:129` is unasserted and defeats entry 61 from the line above it. Logged and deferred in the previous pass; the code still reads as that row describes, so the row is carried and not deferred again.
  - `[false]` `[reject]` blind-hunter: the spec's Never ("do not touch the deferred-work ledger") and its last acceptance criterion versus a diff that edits `deferred-work.md` — refuted: commit `cf7dc7c` contains `.bmad-loop/policy.toml` and this spec only; the ledger modification is the orchestrator's sweep bookkeeping, layered on afterwards, which this workflow is forbidden to author or revert. The change honoured the constraint by writing frontmatter `deferred`, which is the hand-off channel.
  - `[low]` `[reject]` blind-hunter: the I/O matrix, the acceptance criteria and "the six break cases" were never extended for what the review passes added — its fix is to edit this build's spec.
  - `[low]` `[reject]` blind-hunter: entry 60's census pushes redirection tokens (`>`, `/dev/null`) into the list it prints — the membership test for `git`/`gh` is unaffected and the pollution appears only inside a failure message; filtering them adds a branch for a diagnostic nicety.
  - `[medium]` `[patch]` edge-case-hunter: entry 61 green-lit `-C`, npm's own short alias for `--prefix` — confirmed at `@npmcli/config/lib/definitions/definitions.js:1811` (`short: 'C'` on `prefix`), and reproduced rc=0 for the attached-value `exec npm -C/elsewhere run start`, which reaches another manifest and skips `varlock run --`. Patched with an unterminated `-C` test so every spelling is rejected; re-measured failing on `-C/elsewhere`, `-C /elsewhere` and `-C=/elsewhere` while all the legitimate forms still pass.
  - `[low]` `[patch]` edge-case-hunter: entry 60 stepped over an `ONBUILD` prefix, so a Dockerfile whose only install is `ONBUILD RUN apt-get install -y git gh` passed while the image it builds carries neither tool — reproduced rc=0. `ONBUILD RUN` runs in a child image, unlike the `ONBUILD COPY` guard 45 tolerates. Patched by deleting the prefix acceptance; re-measured failing as an extraction failure with the reason named.
  - `[false]` `[reject]` edge-case-hunter: `export KEY=/srv` or an indented `KEY=/srv` in `.env.example` passes guard 46 — true of guard 46 alone, but refuted as a gate blind spot: the parity guard extracts `^(# )?KEY=` at column 0 too, so both spellings make the key vanish from its census and it exits 1. Measured, both spellings. Recorded in the comment block as covered elsewhere.
  - `[low]` `[reject]` edge-case-hunter: guard 5's `core.quotePath=false` still leaves a path containing `"`, `\` or a control character C-quoted, so it would escape `grep -v "^src/"` — real, but no such filename exists or plausibly will in a TypeScript repo that must also check out on case-insensitive macOS, and the fix replaces the whole extraction with a `-z`/`tr` pipeline that would need the full break matrix re-proved.
  - `[low]` `[patch]` edge-case-hunter: a backtick template literal on `DEFAULT_SANDBOX_WORKDIR` was reported as drift against a Dockerfile that agreed with it — reproduced. Patched by adding `\140` to the code-side `tr -d` set; re-measured passing on the backticked spelling and still failing on `/srv`.
  - `[low]` `[reject]` edge-case-hunter: a formatter-wrapped declaration (`=` and the value on separate lines) fails as an extraction failure on a correct file — real, but it fails LOUDLY, which is the standard this file's own guards are held to, and reading it needs a whole-file cross-line match rather than a direct correction.
  - `[low]` `[patch]` edge-case-hunter: the "four sites" count — grouped with the second row; patched.
  - `[low]` `[patch]` edge-case-hunter: the comment says the line below the `exec` is `cd "$REPO_ROOT"` — verified wrong: the `exec` is `:130`, the file's last line, and the `cd` is `:129` above it. Patched, naming both line numbers.
  - `[false]` `[reject]` edge-case-hunter: the ledger/acceptance contradiction — grouped with the blind-hunter row above and refuted the same way.
  - `[low]` `[reject]` edge-case-hunter: the intent says the workdir is written in "three tracked places" while the guard reads four — true as a description, but reading a fourth copy is more coverage, not a defect, and the only fix is to edit this build's spec.
  - `[medium]` `[patch]` verification-gap (pre-verified): entry 60 was the one new extraction that did not unquote, so `apt-get install -y "git" "gh"` reported BOTH tools missing on a file that installs both — an append-only false failure, the same class patched for entry 61 last pass. Patched with the array's own unquoting step; re-measured passing on the double- and single-quoted lists.
  - `[low]` `[patch]` verification-gap other: entry 60 censuses installs, never removals — a later `apt-get purge -y gh` exits 0. Patched in prose only: the "deliberately does not assert" paragraph now names the boundary, because reconstructing the image's end state is a different guard, not a direct correction.
  - `[low]` `[patch]` verification-gap other: entry 60 failed as an extraction failure on `apt install`, `/usr/bin/apt-get install` and the BuildKit heredoc form — the first two are patched and re-measured passing; the heredoc stays a loud failure and is now stated as such, since reading it needs a real parser rather than a line join.
  - `[low]` `[patch]` verification-gap other: guard 46's trailing-comment justification cites a spelling the parity guard already forbids — confirmed by measurement: `MASTRACODE_SANDBOX_WORKDIR=/workspace # clone path` makes the parity guard exit 1, because it extracts declarations with a space-free `^KEY=[^ ]*$` pattern. Patched: the comment now says the truncation is defence in depth on the dotenv side and load-bearing on the code side.
  - `[low]` `[patch]` verification-gap other: the two factual slips around entry 61's unquoting — grouped with the `cd` row; patched.
  - `[low]` `[patch]` verification-gap other: the stale "four sites" count — grouped with the second row; patched.
  - `[medium]` `[patch]` intent-alignment (a): `carried` — entry 60 asserts at the Dockerfile-text surface while the invariant lives at the built-image surface, wrong in both directions. Logged and patched in the previous pass (census fix for the false negative, stated policy for the tarball false positive); the code still reads as that row describes, so the row is carried.
  - `[medium]` `[defer]` intent-alignment (b): `carried` — entry 61 pins the exec token, not the whole chain; the `cd "$REPO_ROOT"` half is deferred. Same row as the blind-hunter carry above.
  - `[low]` `[reject]` intent-alignment (c): guard 5 closes the gate half of the stated problem and not the `tsc` half, and the intent's own break scenario (a root `probe.tsx`) was already caught by the root-allowlist guard — the `tsc` half is excluded by the intent's Never (`tsconfig.json` untouched), and the AD-4 category gap is already in `deferred`.
  - `[low]` `[patch]` intent-alignment (d): guard 46's first error message still described the entry as asserting "its one WORKDIR and its one explicitly tagged FROM" after the entry grew three reconciliation arms — patched to name the reconciliation. The finding's other two halves are not: reading four copies rather than the intent's three is more coverage and its fix edits this build's spec, and the new arms sitting upstream of the `FROM` pin is the `carried` reject from the previous pass, whose refutation still holds.
  - `[false]` `[reject]` intent-alignment (e): the Never clause about the ledger crossed by the diff — refuted as above.
  - `[low]` `[reject]` intent-alignment (f): `carried` — the both-ways proof is narrative, not an executable regression. Logged and rejected in the previous pass on DW-90, which the comment block re-states.

## Design Notes

Append-only has one admitted exception and it is not deletion: no assertion is ever removed or weakened, but a guard may be re-pointed or strengthened in place. Guard 5's widened pathspec and guard 46's extra arms are strictly additive and renumber nothing, so they are edited where they are; the two genuinely new subjects are appended at the end instead of beside their kin, because an insertion would renumber guard 42 and the guards the comment block names by number.

Shape of the extraction idiom to reuse for the workdir arms (guard 46 already computes `wd` this way):

```sh
el=$(grep -nE "^MASTRACODE_SANDBOX_WORKDIR=" "$s"); en=$(printf "%s\n" "$el" | grep -c .)
test "$en" = "1" || { echo "$s must declare it exactly once, found $en: $el"; exit 1; }
ev=$(printf "%s\n" "$el" | sed -E "s/^[0-9]+:MASTRACODE_SANDBOX_WORKDIR=//" | tr -d "\042\047\015")
test "$ev" = "$wd" || { echo "$s says $ev, $d WORKDIR says $wd"; exit 1; }
```

Break tests for guard 5 need a *tracked* file: `git add -N probe.tsx` is enough for `git ls-files` to report it, and `git rm --cached` plus `rm` reverts it. Run each break, capture the exit code and message, revert immediately, and confirm `git status --porcelain` returns to naming only this change's own files.

## Verification

**Commands:**
- Every entry of `.bmad-loop/policy.toml` `[verify].commands`, in order -- expected: all exit 0 on the clean tree.
- `npm run check` -- expected: exit 0 (unchanged; no TypeScript is touched).
- `git status --porcelain` -- expected: `.bmad-loop/policy.toml` plus this spec only, after every break has been reverted.

**Manual checks (if no CLI):**
- The both-ways matrix: for each of the six break cases in the I/O matrix, the guard exits 1 with a message naming the offending file and value, and the break is reverted before the next one is applied.

## Auto Run Result

Status: done

**Implemented change.** Four invariants the repository stated in prose and no gate command asserted are now enforced by `.bmad-loop/policy.toml` `[verify].commands`, which grew from 59 to 61 entries. Guard 5 was strengthened in place: `git -c core.quotePath=false ls-files` over eight extensions (`*.ts *.tsx *.mts *.cts *.js *.jsx *.mjs *.cjs`) instead of four, with a non-vacuous sentinel on the listing and every offending path printed (DW-57). Guard 46 was strengthened in place: it already extracted the Dockerfile's one `WORKDIR` into a variable, and now reconciles the three other tracked copies of that path against it — `.env.schema`'s `MASTRACODE_SANDBOX_WORKDIR=` default, `.env.example`'s copy (declared or commented out), and `src/mastra/config/sandbox.ts`'s `DEFAULT_SANDBOX_WORKDIR` (DW-80). Entry 60 is new: it joins the Dockerfile's `\` continuations, drops comment lines, and requires `git` and `gh` among the operands of its `apt-get`/`apt` install segments (DW-81). Entry 61 is new: `ops/factory-start.sh` must carry exactly one command `exec` line, and it must run the `npm` `start` script — rejecting every package-root-redirecting option, `-C` included (DW-83). No first-party code, Dockerfile, schema, wrapper or architecture text was edited; all four invariants already held, and this change only makes them checkable.

**Files changed.**
- `.bmad-loop/policy.toml` — the only repository file touched: two guards strengthened in place, two appended at the array's end, and the comment blocks above the array brought in step (what each guard does and does not assert, the append-only reconciliation, the recorded both-ways matrix).
- `_bmad-output/implementation-artifacts/spec-gate-guards-artifact-invariants.md` — this spec.

**Review findings (first pass).** 30 findings, 0 high / 18 medium / 12 low. Seven grouped entries patched (five medium, two low), three deferred, four rejected — recorded in the first Review Triage Log entry above.

**Review findings (follow-up pass).** 36 findings across four layers: 0 high, 6 medium, 25 low, 5 false, 0 maybe-false. Patched this pass: 3 medium and 15 low entries, all in `.bmad-loop/policy.toml`. The three medium ones were real bypasses or append-only false failures the first pass left: guard 46's `.env.example` arm read column 0 only while the parity guard's own remediation asks for a key mirrored *commented out*, so `# MASTRACODE_SANDBOX_WORKDIR=/srv` was green one `#` away from the value that wins at runtime; entry 61 green-lit `-C`, npm's documented short alias for `--prefix`, in the attached-value spelling that reaches another manifest; and entry 60 was the one new extraction that did not unquote, so a Dockerfile installing `"git" "gh"` was told it installed neither. The low patches were entry 60's `ONBUILD` false pass and its `apt`/absolute-path false failures, guard 46's backtick-literal false failure, and a set of prose and remediation-message corrections (the Dockerfile missing from the "four tracked copies" list, the impossible "move in one edit" advice, the `sandbox.test.ts` "four sites" count that is five, the `ops/` paragraph's "twelve" that is 22, and the comment that put `cd "$REPO_ROOT"` below the `exec` rather than above it). One finding was deferred: `sandbox/README.md` is a fifth, prose-only copy of the workdir. Twelve were rejected — five as `false` (the bare-`npm`-versus-`$NODE_BIN` claim, refuted by the wrapper's own `export PATH=$NODE_BIN:…` at `:21`; the `export`/indented `.env.example` spellings, refuted by measuring the parity guard red on both; and three restatements of a ledger/acceptance contradiction, refuted because commit `cf7dc7c` contains only `.bmad-loop/policy.toml` and this spec, the `deferred-work.md` edit being the orchestrator's own sweep bookkeeping) and seven as `low` not worth their fix (guard 5's remaining C-quoting of `"`/`\`/newline paths; a formatter-wrapped declaration that fails loudly by design; redirection tokens polluting entry 60's printed census; entry 61's deliberate rejection of an `env`/`VAR=` prefix, whose widening would have to reject `npm_config_prefix=` in the same breath; the `sandbox.test.ts` duplication refactor and the intent's "three tracked places" wording and the un-extended I/O matrix, each of whose fix edits the intent or this build's spec). Four rows were `carried` from the first pass unchanged: entry 60's surface offset, the deferred `cd "$REPO_ROOT"` half of entry 61, guard 46's new arms sitting upstream of its `FROM` pin, and the absence of an executable regression (DW-90).

**Follow-up review recommended: false.** This was the follow-up pass and it patched no `high`; the work has converged. Patched counts, by entry verdict: high 0, medium 3, low 15.

**Verification performed.**
- Every entry of `[verify].commands`, extracted with `smol-toml` and run in order through `/bin/sh -c`: 61/61 exit 0 on the settled tree, re-run after this pass's patches and again after the `sandbox/README.md` measurement. `npm ci` and `npm run build` are entries 1 and 42 and ran as part of it. `npm run check` exits 0.
- Both-ways matrix for every patch in this pass, each break reverted immediately. Entry 60: now passes on a double-quoted and a single-quoted package list, on `apt install -y git gh`, and on `/usr/bin/apt-get install -y git gh`; now fails as an extraction failure when the only install is an `ONBUILD RUN`; still fails naming `gh` when it is dropped from the list, and still fails as an extraction failure when the only `apt-get install` is an argument to `echo`. Entry 61: now fails on `-C/elsewhere`, `-C /elsewhere` and `-C=/elsewhere`; still fails on `exec mastra start` and `--prefix /elsewhere`; still passes `npm run start`, `npm start`, `npm run-script start`, `npm --loglevel warn run start`, a quoted path form, and a trailing `# boot`. Guard 46: now fails naming both values and both files on `.env.example`'s commented copy at `/srv` and on an `export const … : string = '/srv'`; now passes a backticked `/workspace`; still passes `# KEY=` empty, `# KEY=/workspace` and the key deleted; still fails on `.env.schema`, `.env.example` and `src/mastra/config/sandbox.ts` moved to `/srv`.
- Two claims refuted by measurement rather than by reading: `export MASTRACODE_SANDBOX_WORKDIR=/srv` and an indented copy in `.env.example` leave guard 46 at 0 but make the schema/example parity guard exit 1, so the gate is red either way; and a trailing `# clone path` on the `.env.schema` declaration also makes that parity guard exit 1, which is why guard 46's comment now calls its own comment-truncation defence in depth on the dotenv side and load-bearing only on the code side.
- `git status --porcelain` names only `.bmad-loop/policy.toml` and this spec, plus the `deferred-work.md` the orchestrator modified around this change; every subject file is byte-identical to the index after the break matrix.

**Residual risks.** The guards read tracked text, not built artifacts or resolved configuration: entry 60 asserts that the Dockerfile apt-installs `git` and `gh`, not that the image carries them, and it reads installs rather than the image's end state (a later `apt-get purge -y gh` is not seen); guard 46 reconciles four tracked declarations, and an untracked `.env` still overrides all of them at runtime, as does the prose copy in `sandbox/README.md`; entry 61 pins the exec line, not the LaunchAgent's `WorkingDirectory` or the wrapper's `cd`. Each of those boundaries is now stated in the comment block instead of being left to be rediscovered, and the closable ones are in `deferred`. Nothing under `src/` executes any of these entries (DW-90), so the false-failure envelope is still only as wide as the spellings measured by hand — roughly ninety across the two passes now, including every legitimate form a reviewer proposed. `Artifact only` does not apply to this session: `.bmad-loop/policy.toml` is deliberately tracked and `_bmad-output/implementation-artifacts/` is tracked as well, so the deliverables are ordinary committed changes.

