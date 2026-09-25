---
title: 'Narrow the build-output ignore rule to src/mastra/public/factory/'
type: 'chore'
created: '2026-09-26'
status: 'done'
baseline_revision: 'db8563ef486ddebff4f970f7240934ce2c1141fe'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      `mastra build` no longer copies the Factory UI into `src/mastra/public/factory/`, so a deploy
      build may ship without the Factory SPA.
    evidence: |-
      `node_modules/mastra/dist/index.js:1265` calls `buildFactoryUI()` only when
      `analyzeEntryProjectType(src/mastra/index.ts)` returns `'factory'`, which
      `node_modules/@mastra/deployer/dist/build-JNlRQOvG.js:200` grants only when the entry file
      itself imports AND constructs `MastraFactory`. Story 5.6 / AD-8 moved that construction into
      `src/mastra/config/factory.ts`, so the entry names `MastraFactory` only in comments and the
      project type resolves to `undefined`. Measured here: two successive `npm run build` runs
      logged `Copying public files` / `Done copying public files` with no "Copying Factory UI" line,
      exited 0, and left `src/mastra/public/` absent. `buildFactoryUI` (index.js:1062) is the only
      writer into `src/mastra/public/` in the toolchain; the other two `join(mastraDir, "public")`
      sites (:4761, :4773) pass it to `startServer` as a read-side `publicDir`. What is unsettled is
      the consequence: whether the served deployment actually needs that SPA at that path.
    location: >-
      src/mastra/index.ts / node_modules/mastra/dist/index.js:1265
    severity: medium
  - summary: >-
      Nothing in `[verify].commands` asserts the two `git check-ignore` outcomes, so a future
      `.gitignore` edit can silently re-shadow the documented skill-override location.
    evidence: |-
      All 63 entries of the `commands` array at `.bmad-loop/policy.toml:3205` were enumerated and
      run: none probes `src/mastra/public/factory/` or `src/mastra/public/factory-skills/`. The only
      `git check-ignore` call in the file is inside the AD-3 root guard (line 3225), which filters to
      root-level entries, so a rule nested under `src/mastra/` cannot move it. The AGENTS.md
      tracked-path guard (line 3259) keys off `git ls-files`, and nothing under `src/mastra/public`
      is tracked. Reverting line 8 to `src/mastra/public/` therefore leaves all 63 entries green.
      Fix is an append of one `sh -c` guard running both probes with their expected exit codes; held
      back here because DW-4 specifies the smallest fix as the `.gitignore` edit alone and the gate
      file is orchestrator-owned.
    location: >-
      .bmad-loop/policy.toml [verify].commands
    severity: medium
  - summary: >-
      No gate entry observes the working tree after `npm run build`, so build output landing on a
      now-uncovered path under `src/mastra/public/` would ship green.
    evidence: |-
      `npm run build` is entry 42 (`.bmad-loop/policy.toml:3247`). The only two
      `git status --porcelain` entries in the array are path-scoped to `.agents/skills` (3211) and
      `skills-lock.json` (3229), and both run before the build — `.bmad-loop/policy.toml:1191` says
      so itself. Narrowing the ignore rule removes the parent-directory cover that used to absorb any
      future change to the copy target, so the gap matters more after this change than before it.
      Fix is an append of `sh -c 'git status --porcelain | grep . && exit 1 || exit 0'` directly
      after entry 42 — the assertion this spec's Verification section runs by hand but never
      installs.
    location: >-
      .bmad-loop/policy.toml:3247
    severity: medium
  - summary: >-
      `.bmad-loop/policy.toml:1191` still says `src/mastra/public/` is gitignored; after this change
      only `src/mastra/public/factory/` is.
    evidence: |-
      The comment records, as the measured reason `npm run build` leaves the tree clean, that
      "`.mastra/` … and `src/mastra/public/` are both gitignored". The substantive claim still holds
      (measured again here), but the stated reason is now one segment too wide, and a future agent
      reading it could conclude the whole subtree is covered and skip adding cover for a new build
      output path. One-word correction; left alone because the spec forbids touching the
      orchestrator-owned policy file.
    location: >-
      .bmad-loop/policy.toml:1191
    severity: low
---

<intent-contract>

## Intent

**Problem:** `.gitignore:8` is the bare `src/mastra/public/`, which keeps the 24 files `mastra build` writes into `src/mastra/public/factory/` out of the working tree but also ignores `src/mastra/public/factory-skills/<skill-name>/SKILL.md` — the first-party skill-override location AGENTS.md documents, which has to stay committable.

**Approach:** Replace that one rule with the exact path `src/mastra/public/factory/`, then prove both halves: the build output stays ignored and a path under `src/mastra/public/factory-skills/` is no longer ignored.

## Boundaries & Constraints

**Always:** Keep the replacement rule a directory rule ending in `/` anchored at the repository root, so it matches only the build-output subtree. Keep `npm run build` tree-clean: after a successful build, `git status --porcelain` must be empty. Keep the rest of `.gitignore` byte-identical, including the tracked-`policy.toml` comment block.

**Never:** Do not widen the rule back toward `src/mastra/public/`, do not add a negation (`!`) line to carve `factory-skills/` back out, do not commit any build output, do not create placeholder files under `src/mastra/public/factory-skills/` to "prove" committability, and do not touch `.bmad-loop/policy.toml`, the deferred-work ledger, or the sprint board.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build output stays ignored | `git check-ignore -v src/mastra/public/factory/index.html` | Exit 0, matching `.gitignore:8:src/mastra/public/factory/` | No error expected |
| Override path becomes committable | `git check-ignore -v src/mastra/public/factory-skills/x/SKILL.md` | Exit 1, no output — no rule matches | No error expected |
| Real build leaves tree clean | `npm run build` on a clean tree | `git status --porcelain` empty afterwards | Non-empty output means the build writes outside `src/mastra/public/factory/` and `.mastra/`; report the offending paths rather than re-widening the rule |

</intent-contract>

## Code Map

- `.gitignore:8` -- the single line to change; currently `src/mastra/public/`, introduced in `f6bd1767214d921c700cd0d650978833d771de4c`. Confirmed today that it is the rule matching *both* `src/mastra/public/factory/index.html` and `src/mastra/public/factory-skills/x/SKILL.md`.
- `AGENTS.md:25-26` -- documents `src/mastra/public/factory-skills/<skill-name>/SKILL.md` as the repo-local skill-override location (the reason the rule must not cover it). Read-only here.
- `src/mastra/public/` -- does not exist at HEAD in this worktree; nothing under it is tracked (`git ls-files src/mastra/public` is empty). **Correction, measured at this baseline:** `mastra build` no longer materialises `src/mastra/public/factory/`. The Factory UI copy step is gated on `analyzeEntryProjectType(src/mastra/index.ts) === 'factory'`, which requires the entry file itself to construct `MastraFactory`; Story 5.6 / AD-8 moved that construction into `src/mastra/config/factory.ts`, so the step never runs. Two successive `npm run build` runs here logged `Copying public files` / `Done copying public files` (no "Copying Factory UI"), exited 0, and left `src/mastra/public/` absent with `git status --porcelain` byte-identical before and after. The rule is therefore forward-compatible cover, not cover for output that exists today.
- `.bmad-loop/policy.toml:1191` -- records that `npm run build` leaves the tree clean *because* `.mastra/` and `src/mastra/public/` are gitignored. This narrowing is exactly the change that could invalidate that note, which is why the real build must be re-run. Read-only; `[verify].commands` is append-only and needs no entry here.
- `.bmad-loop/policy.toml:3225` -- AD-3 root closed-set / root-allowlist guard. It counts "tracked and untracked-but-not-ignored" entries **at repository root only**; `src` is already in the closed set, so a rule change nested under `src/mastra/` cannot add or remove a root entry. No guard in `[verify].commands` parses `.gitignore` itself.
- `.bmad-loop/policy.toml:3259` -- tracked-path guard: fails when AGENTS.md calls a *git-tracked* path gitignored. Nothing under `src/mastra/public/` is tracked, so it is unaffected either way.
- `.bmad-loop/policy.toml:3247` -- `npm run build` is entry 42 in `[verify].commands`; the full gate therefore exercises the build that materialises the directory.

## Tasks & Acceptance

**Execution:**
- `.gitignore` -- replace the line `src/mastra/public/` with `src/mastra/public/factory/`, leaving line position and every other line untouched -- the build output is what needs ignoring; the parent directory also swallows the documented skill-override location.

**Acceptance Criteria:**
- Given the edited `.gitignore`, when `git check-ignore -v src/mastra/public/factory/index.html` runs, then it exits 0 and names `src/mastra/public/factory/` as the matching rule.
- Given the edited `.gitignore`, when `git check-ignore -v src/mastra/public/factory-skills/x/SKILL.md` runs, then it exits 1 and prints nothing.
- Given the working tree before a build, when `npm run build` completes successfully, then `git status --porcelain` is byte-identical to its pre-build value — the build contributes nothing to the tree. (Amended: the original wording also required `src/mastra/public/factory/` to exist afterwards. It does not at this baseline, for the reason recorded in the Code Map and Spec Change Log; that is a pre-existing defect in the build path, not something this change causes or can fix.)
- Given the change, when `git diff -- .gitignore` is inspected, then exactly one line differs and no other file in the repository is modified.
- Given the change, when the full `[verify].commands` gate is run end to end (including `npm ci`, `npm run check`, `npm test`, and `npm run build`), then every command exits 0.

## Spec Change Log

- 2026-09-26 (implementation) -- The Code Map claim that `mastra build` materialises `src/mastra/public/factory/` ("Copying Factory UI…") is **stale at this baseline**, and so is the second half of acceptance criterion 3. `mastra/dist/index.js:1265` calls `buildFactoryUI()` only when `analyzeEntryProjectType(src/mastra/index.ts)` returns `'factory'`, which requires the entry file itself to import and construct `MastraFactory`. Story 5.6 / AD-8 moved that construction out of `src/mastra/index.ts` into `src/mastra/config/factory.ts`, so the entry no longer names `MastraFactory`, the project type comes back `undefined`, and the Factory UI copy step never runs. A real `npm run build` at this baseline therefore logs `Copying public files` / `Done copying public files` and leaves `src/mastra/public/` non-existent. The other half of criterion 3 — `git status --porcelain` empty after a successful build — was verified and holds. No rule was widened and no placeholder file was created; the narrowed rule is verified by `git check-ignore` on both paths instead, which is the part of the intent that is actually testable today.

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 21 findings — high 0, medium 3, low 4, false 5, maybe-false 0 (plus 9 descriptive/grouped rows carrying their group's verdict)
- findings:
  - `[low]` `[reject]` blind-hunter: the spec's Intent paragraph still says "the 24 files `mastra build` writes into `src/mastra/public/factory/`" while the Code Map and Change Log say the build writes nothing there — the claim is genuinely stale, but it is inherited verbatim from the DW-4 ledger entry and its only fix is editing this build's spec, which triage rejects; the correction is already recorded twice in the same file.
  - `[medium]` `[defer]` blind-hunter: the Factory-UI regression is diagnosed and then dropped with no carrier — verified real (`node_modules/mastra/dist/index.js:1265` gates `buildFactoryUI()` on a project type the refactored entry no longer produces); now carried as `deferred` item 1.
  - `[medium]` `[defer]` blind-hunter: nothing enforces the post-build clean tree the change is premised on — verified by enumerating all 63 gate entries; the two `git status --porcelain` guards are path-scoped and run before entry 42. Carried as `deferred` item 3.
  - `[low]` `[defer]` blind-hunter: `.bmad-loop/policy.toml:1191` is left factually false by the narrowing — verified; carried as `deferred` item 4. Not rejected despite being `low` because the fix is a direct one-word correction, and it routes to defer because it edits an orchestrator-owned rules file.
  - `[false]` `[reject]` blind-hunter: acceptance criterion 4 ("no other file in the repository is modified") is self-contradicting because the spec artifact ships in the same change — refuted: the artifact is *added*, not modified; unscoped `git status --porcelain` shows exactly ` M .gitignore` plus the untracked spec, so the criterion holds as written and was checked unscoped, not only by the path-scoped `git diff --stat`.
  - `[false]` `[reject]` blind-hunter: the `Never` clause bans `src/mastra/public/*` + a negation and so leaves other build byproducts under `src/mastra/public/` unignored, citing the `Copying public files` step as a writer — refuted: `copyPublic()` *reads* `src/mastra/public` into the deployment output (`node_modules/mastra/dist/index.js:1056` comment), and `buildFactoryUI` (`:1062`) is the only writer into that directory in the toolchain; the other two `join(mastraDir, "public")` sites (`:4761`, `:4773`) pass it to `startServer` as a read-side `publicDir`. No unignored write path exists.
  - `[low]` `[reject]` blind-hunter: the Verification section hard-codes `.gitignore:8:` in the expected `git check-ignore` output — true and cosmetic, but its only fix is editing this build's spec, which triage rejects.
  - `[false]` `[reject]` blind-hunter: two Verification bullets expect a non-zero exit inside a section whose contract is "every command exits 0", and the Review Triage Log heading ships empty — refuted: each bullet carries its own expected exit, and "every command exits 0" is attached solely to the `[verify].commands` gate bullet; the empty heading is template structure this very pass fills.
  - `[false]` `[reject]` edge-case-hunter: `npm run dev` runs the server with cwd `src/mastra/public`, so dev-server runtime files would now dirty the tree — refuted: `node_modules/mastra/dist/index.js:4761` and `:4773` pass `join(mastraDir, "public")` to `startServer` as `publicDir`, a static-serve directory, not a cwd and not a write target; dev output goes to `.mastra/`, which stays ignored.
  - `[low]` `[defer]` edge-case-hunter: `.bmad-loop/policy.toml:1191` asserts `src/mastra/public/` is gitignored — same root cause as the blind-hunter row above; grouped, carried as `deferred` item 4.
  - `[low]` `[reject]` edge-case-hunter: the spec's Intent line asserts 24 files the build does not write — same root cause as the first blind-hunter row; grouped, rejected for the same reason (fix edits this build's spec).
  - `[medium]` `[defer]` verification-gap (pre-verified): the narrowed ignore rule is asserted nowhere in the only automated gate the repo has — reverting line 8 leaves all 63 entries green. Filed disposition was `patch` (append one `sh -c` guard); routed to defer instead because DW-4 names the `.gitignore` edit as the smallest fix and the gate file is orchestrator-owned, so installing a permanent 64th gate entry exceeds what the intent asks for. Carried as `deferred` item 2 with the exact fix recorded.
  - `[medium]` `[defer]` verification-gap (pre-verified): acceptance criterion 3's tree-clean property has no gate entry observing it after `npm run build` — same reasoning and same routing as the row above; carried as `deferred` item 3.
  - `[low]` `[defer]` verification-gap other: `.bmad-loop/policy.toml:1191` now records a false rationale — same root cause; grouped, carried as `deferred` item 4.
  - `[medium]` `[defer]` verification-gap other: the Factory-UI copy step never runs, so the new rule is forward-compatible cover rather than a fix for observable output — same root cause as blind-hunter's regression row; grouped, carried as `deferred` item 1.
  - `[low]` `[reject]` intent-alignment (a): `git check-ignore` proves the rule matches a path string, not that a build produces that path, so both acceptance checks run against paths that exist nowhere — true as stated, but the observation half was supplied outside the check-ignore probes: `npm run build` was run twice end to end, exited 0, and left `git status --porcelain` byte-identical. Nothing further to fix.
  - `[medium]` `[defer]` intent-alignment (b): DW-4's harm statement is stale at this baseline and the correction lives only in this spec artifact — same root cause as the regression row; grouped, carried as `deferred` item 1. The ledger itself is orchestrator-owned and deliberately untouched.
  - `[medium]` `[defer]` intent-alignment (c): committability is asserted at the rule level, never at the file level, and nothing would fail if the rule were widened back — same root cause as the gate-assertion gap; grouped, carried as `deferred` item 2.
  - `[medium]` `[defer]` intent-alignment (d): `npm run build` as verification now proves a weaker proposition than the intent assumed — same root cause as the regression row; grouped, carried as `deferred` item 1.
  - `[low]` `[defer]` intent-alignment (e): `.bmad-loop/policy.toml:1191` is literally stale and untouched — same root cause; grouped, carried as `deferred` item 4.
  - `[false]` `[reject]` intent-alignment (f): the spec artifact is added while AC4 says no other file is modified — refuted by the layer itself ("added, not modified — a wording nuance, not a violation"); same refutation as the blind-hunter row.

## Auto Run Result

Status: done
Blocking condition: none

**Summary.** `.gitignore:8` changed from the bare `src/mastra/public/` to the exact path `src/mastra/public/factory/`. The build output stays ignored; `src/mastra/public/factory-skills/<skill-name>/SKILL.md` — the first-party skill-override location `AGENTS.md:25-26` documents — is committable again. One line, nothing else.

**Files changed.**
- `.gitignore` — line 8 narrowed from `src/mastra/public/` to `src/mastra/public/factory/`; every other line byte-identical, including the tracked-`policy.toml` comment block.
- `_bmad-output/implementation-artifacts/spec-dw-4-gitignore-factory-build-output.md` — this spec (new).

**Review findings.** 21 findings across four layers. 0 patches applied. 4 entries deferred (recorded in frontmatter `deferred`): the dead Factory-UI copy step, the missing gate assertion for the two `check-ignore` outcomes, the missing post-build clean-tree assertion, and the stale `policy.toml:1191` rationale. Rejected: the stale Intent-paragraph claim and the hard-coded `.gitignore:8` line number in the Verification section (both `low`, both fixable only by editing this build's spec); AC4 being self-contradicting (`false` — the artifact is added, not modified, and unscoped `git status --porcelain` confirms nothing else is modified); the banned negation-rule alternative leaving other byproducts unignored (`false` — `copyPublic()` reads `src/mastra/public`, `buildFactoryUI` at `mastra/dist/index.js:1062` is its only writer); the non-zero-exit Verification bullets and empty triage heading (`false` — per-bullet expectations, and the heading is what this pass fills); `npm run dev` dirtying the tree (`false` — `publicDir` is a static-serve directory passed to `startServer`, not a cwd or write target); and intent-alignment (a) and (f) as noted above.

**Follow-up review recommendation: false.** No entry was patched this pass, so there is no unverified patch risk to name.

**Verification performed.**
- `git check-ignore -v src/mastra/public/factory/index.html` → exit 0, `.gitignore:8:src/mastra/public/factory/`.
- `git check-ignore -v src/mastra/public/factory-skills/x/SKILL.md` → exit 1, no output.
- `git diff --stat -- .gitignore` → `1 file changed, 1 insertion(+), 1 deletion(-)`.
- `npm run build` run twice, exit 0 both times; `git status --porcelain` captured before and after the second run and `diff`ed — byte-identical, so the build contributes nothing to the tree. Neither run logged "Copying Factory UI", and `src/mastra/public/` does not exist afterwards.
- Full `[verify].commands` gate, all 63 entries parsed from `.bmad-loop/policy.toml` with `tomllib` and run in order: **63/63 exit 0**, including `npm ci`, `npm run check`, `npm test`, `npm run build` (entry 42), and all 59 guard scripts.

**Residual risks.**
- The rule is forward-compatible cover, not a fix for output that exists today: at this baseline nothing writes into `src/mastra/public/factory/`, because the Factory-UI copy step is unreachable from the current entry file. DW-4's original symptom is currently unreproducible. That is `deferred` item 1 and is the finding most worth acting on.
- No automated check pins either half of this change. A future `.gitignore` edit can re-shadow the override location, and build output landing on a different path under `src/mastra/public/` would not be observed by the gate. Both are `deferred` items 2 and 3, each with the exact append recorded.

## Verification

**Commands:**
- `git check-ignore -v src/mastra/public/factory/index.html` -- expected: exit 0, output `.gitignore:8:src/mastra/public/factory/	src/mastra/public/factory/index.html`
- `git check-ignore -v src/mastra/public/factory-skills/x/SKILL.md` -- expected: exit 1, no output
- `git diff --stat -- .gitignore` -- expected: `1 file changed, 1 insertion(+), 1 deletion(-)`
- `npm run build` then `git status --porcelain` -- expected: build exits 0; status prints nothing
- Full `[verify].commands` gate from `.bmad-loop/policy.toml` -- expected: every command exits 0
