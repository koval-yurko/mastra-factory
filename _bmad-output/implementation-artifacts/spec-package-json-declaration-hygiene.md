---
title: 'package.json declaration hygiene: drop the unused auth-workos root entry, declare an npm floor'
type: 'chore'
created: '2026-09-25'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: '1796009d52da7851dc2d214d4904f41b8b9533d5'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      The verify gate reads neither `engines` nor root `dependencies`, so the new
      `engines.npm` floor is asserted by nothing and can silently desync from the
      `packageManager` pin it was chosen to match.
    evidence: |-
      All 55 entries of `[verify].commands` were enumerated and scanned: the string
      `engines` appears zero times in `.bmad-loop/policy.toml`. The seven commands that
      read `package.json` (20, 34, 43, 48, 51, 52, 53) read only `scripts`,
      `@mastra/factory`'s pinned version, `packageManager` and `workspaces`. No vitest
      suite reads the manifest. So deleting `engines.npm` in a later change leaves the
      gate green, and — the sharper case — guard 43's own remediation text instructs an
      operator to bump `packageManager` and regenerate the lockfile, which desyncs the
      floor without any signal. The floor then admits an npm below the one the lockfile
      was produced by, which is the condition DW-84 added it to detect.
      Smallest fix: append one `sh -c` guard to `[verify].commands` (the array is
      append-only) asserting `engines.npm` equals `">=" + packageManager` with the `npm@`
      prefix and any `+sha512` suffix stripped. Not done here: this bundle's intent
      enumerates three edits (drop the dependency, add the floor, regenerate the lockfile)
      and DW-84 names the `engines` line as its *smallest fix*, so a new gate guard is
      outside what the intent asked for; guard work has been its own bundle before
      (`spec-verify-gate-blind-spots.md`).
    location: >-
      .bmad-loop/policy.toml [verify].commands / package.json engines.npm
    severity: medium
  - summary: >-
      SPEC.md:76's normative "the packages for the ruled-out paths stay installed" now
      rests solely on `@mastra/factory@0.15.0`'s own dependency edge, which nothing in
      this repo asserts.
    evidence: |-
      Before this change the root declaration was itself the pin: `npm ci` could not
      produce a tree lacking `@mastra/auth-workos`. After it, the only remaining edge is
      `packages["node_modules/@mastra/factory"].dependencies["@mastra/auth-workos"] ===
      "1.6.5"` — a third party's internal choice. A later `@mastra/factory` bump that
      drops or renames that dependency would violate a constraint SPEC.md marks normative
      and resolved, and every one of the 55 gate commands would still exit 0: none reads
      `dependencies`, none inspects `node_modules`, and no first-party module imports the
      package. The spec's own proof (`node -p "require('./node_modules/@mastra/auth-workos/package.json').version"`)
      is a one-shot verification command, not a gate entry, so it never runs again.
      Not closed here: the edge holds today at the pinned `@mastra/factory@0.15.0`, and
      AGENTS.md:30 already forces a deliberate one-way review at the next bump, which is
      the natural moment to either add a gate assertion or restore the root declaration.
      Closing it now would need the guard the entry above is already deferred for.
    location: >-
      package.json dependencies / _bmad-output/specs/spec-self-hosted-factory/SPEC.md:76
    severity: medium
  - summary: >-
      `">=11.17.0"` is a one-directional floor, so it covers only half of DW-84's stated
      failure — an npm *newer* than the one that produced the lockfile satisfies it
      silently.
    evidence: |-
      DW-84's diagnosis is "a host without corepack silently runs a different npm than
      package-lock.json was produced by". An open-ended `>=` warns (EBADENGINE, never
      fails, since there is no `.npmrc` and `engine-strict` is off) only on npm below
      11.17.0. An npm 12 host — the case that can rewrite `lockfileVersion` — satisfies
      the floor and emits nothing. DW-84's operative complaint, that "pin and host moving
      together away from the npm that generated the lockfile stays green", is therefore as
      green after this change as before for any host npm >= 11.17.0.
      Not addressed here: DW-84 names `"npm": ">=11.17.0"` verbatim as its smallest fix
      and this bundle's intent repeats that value, so narrowing it to a bounded range
      would contradict the intent rather than fulfil it. Settling it needs a decision on
      the upper bound, the same shape of question DW-3 carries for `engines.node`.
    location: >-
      package.json engines.npm
    severity: low
  - summary: >-
      This bundle's premise that `engines.node`'s upper bound is "a separate open human
      decision (DW-3)" is stale — DW-3 already carries a recorded decision dated
      2026-09-24.
    evidence: |-
      `.bmad-loop/decisions.json` and the DW-3 ledger entry both carry: "2026-09-24
      Declare 22 and 24; keep running 24 — Narrow package.json engines.node to admit only
      the 22 and 24 majors (excluding 23 and 25, which vitest@5.0.1 does not support), and
      correct AGENTS.md:9 ... Close DW-10 and DW-65 in the same change." So the decision
      is made; only the build is outstanding.
      Not acted on here: this bundle's intent says "Leave engines.node alone", DW-3 is a
      separate ledger entry with its own decided bundle intent that also closes DW-10 and
      DW-65, and its fix edits AGENTS.md — an agent-context file. Recorded so the stale
      characterization does not propagate into the next bundle's premise.
    location: >-
      package.json engines.node
    severity: low
---

<intent-contract>

## Intent

**Problem:** `package.json` carries one dependency nothing imports and one missing engine declaration. `@mastra/auth-workos` (line 20) lost its only first-party import in Story 2.3 — `git grep` over `src/` now returns `WORKOS_*` environment-key strings only (DW-32). Separately `engines` declares `node` only, so a host without corepack silently runs a different npm than `package-lock.json` was produced by; gate command 43 asserts `packageManager === "npm@" + $(npm --version)`, a property of the gate host that moves with the host rather than of the install (DW-84).

**Approach:** Remove the root `@mastra/auth-workos` declaration, add `"npm": ">=11.17.0"` to `engines` matching the `npm@11.17.0` `packageManager` pin, and regenerate `package-lock.json` from the edited manifest so `npm ci` — gate command 1 — still installs.

## Boundaries & Constraints

**Always:**
- Keep `@mastra/auth-workos@1.6.5` resolved in the installed tree. `@mastra/factory@0.15.0` declares that same exact version as its own direct dependency, so dropping the *root declaration* is not dropping the package — this is what keeps SPEC.md's "the packages for the ruled-out paths stay installed" satisfied and makes the change observationally inert.
- Move `package.json` and `package-lock.json` in the same change: gate command 1 is `npm ci --no-audit --no-fund`, which hard-fails on manifest/lockfile disagreement.
- Keep the npm floor equal to the `packageManager` pin's version (`11.17.0`) so the two never disagree.
- Re-run the whole `[verify].commands` array, not a subset — a lockfile change is load-bearing for every command after the first.

**Never:**
- Never touch `engines.node`. Its upper bound is a separate open human decision (DW-3).
- Never edit `[verify].commands` in `.bmad-loop/policy.toml`; the array is append-only and this change adds no guard.
- Never edit the deferred-work ledger or the sprint board — the orchestrator records resolution.
- Never bump, add, or remove any other dependency. Regeneration must not drift versions that the current lockfile already pins and the manifest ranges still satisfy.
- Never add `engine-strict` or an `.npmrc`; the floor is a declaration, not a new enforcement mechanism.

</intent-contract>

## Code Map

- `package.json:20` -- `"@mastra/auth-workos": "1.6.5"` in `dependencies`. The line to delete. Only two tracked code files mention the package at all (this and the lockfile); every other hit is a historical planning artifact.
- `package.json:40-43` -- `"packageManager": "npm@11.17.0"` followed by `"engines": { "node": ">=22.19.0" }`. Add `"npm": ">=11.17.0"` beside `node`; leave `node` verbatim.
- `package-lock.json` -- two places move, both inside the root `packages[""]` entry (`lockfileVersion: 3`, so there is no separate legacy `dependencies` mirror): `packages[""].dependencies` loses the entry at line 13, and `packages[""].engines` gains `npm`. `packages["node_modules/@mastra/auth-workos"]` must SURVIVE at `1.6.5`, kept by `packages["node_modules/@mastra/factory"].dependencies["@mastra/auth-workos"] === "1.6.5"` (line 3953).
- `.bmad-loop/policy.toml` `[verify].commands` -- read-only evidence. 55 entries. Command 1 `npm ci --no-audit --no-fund`; command 43 is the `packageManager`/`npm --version` guard DW-84 names. Commands 34, 48, 51 and 53 also read `package.json`, but only `scripts`, `@mastra/factory`'s pinned version, and `packageManager`/`workspaces` — **no guard reads `dependencies` or `engines`**, so neither edit can trip an existing guard, and no new guard is in scope.
- `_bmad-output/specs/spec-self-hosted-factory/SPEC.md:76` -- read-only. "The packages for the ruled-out paths stay installed — `@mastra/auth-workos`, …". Normative; satisfied via the transitive edge above, not waived.
- `AGENTS.md:30` -- read-only. "Treat every dependency bump as one-way" — the reason the lockfile diff must be inspected rather than assumed.

## Tasks & Acceptance

**Execution:**
- `package.json` -- delete the `"@mastra/auth-workos": "1.6.5"` dependency line, and add `"npm": ">=11.17.0"` to `engines` next to the untouched `node` entry -- resolves DW-32 and DW-84, the two edits this bundle owns.
- `package-lock.json` -- regenerate by running npm against the edited manifest (do not hand-edit) -- `npm ci` reads the lockfile, so a stale one fails gate command 1.
- `package-lock.json` -- inspect the regenerated diff and confirm no version of any other package changed -- AGENTS.md treats dependency bumps as one-way, so silent range drift during regeneration is a defect, not a side effect.

**Acceptance Criteria:**
- Given the edited `package.json`, when `git diff package.json` is read, then `dependencies` has lost exactly the `@mastra/auth-workos` line, `engines.npm` is `">=11.17.0"`, and `engines.node` is byte-identical to before.
- Given the regenerated lockfile, when `npm ci --no-audit --no-fund` runs in the worktree, then it exits 0.
- Given that install, when `node_modules/@mastra/auth-workos/package.json` is read, then its `version` is `1.6.5` — the package is still in the tree despite the root declaration being gone.
- Given the lockfile diff, when every changed `"version"` field is listed, then the list is empty — only root `dependencies`/`engines` bookkeeping moved.
- Given the full change, when the whole `[verify].commands` array runs in order, then every command exits 0, command 43 included.
- Given the working tree after the change, when `git status --porcelain` runs, then `package.json` and `package-lock.json` are the only modified tracked files.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 25 findings — high 0, medium 7, low 13, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` blind-hunter: `engines.node >=22.19.0` admits Node 22.19.0, whose bundled npm 10.9.x is below the new floor, so the two are "mutually unsatisfiable" — `packageManager: "npm@11.17.0"` is the corepack declaration that makes the pair satisfiable, and an EBADENGINE warning on a bundled-npm host is precisely the DW-84 signal the floor exists to produce, not a malfunction.
  - `[low]` `[defer]` blind-hunter: `">=11.17.0"` warns only on older npm; npm 12 satisfies it silently, so only one direction of DW-84's drift is covered — deferred (item 3); DW-84 and the bundle intent both name this exact value, so narrowing it would contradict the intent.
  - `[low]` `[reject]` blind-hunter: the Boundaries line "keep the floor equal to the pin so the two never disagree" reads as equality while the code writes a range — the floor's version number *is* equal to the pin's; guard 43 failing on a host npm of 11.18.0 is pre-existing, by-design behaviour of a pin that must move with the host, and the only fix is a wording edit to this build's spec.
  - `[medium]` `[defer]` blind-hunter: the change's value is asserted, never demonstrated — no AC or command produces the EBADENGINE warning, and every listed command runs on npm 11.17.0 where none can appear — deferred (item 1, grouped).
  - `[medium]` `[defer]` blind-hunter: SPEC.md:76's normative "stays installed" loses its last first-party anchor with no guard and an empty `deferred` list — deferred (item 2, grouped); the empty list is no longer empty.
  - `[low]` `[reject]` blind-hunter: the drift check greps `"version"` lines only and is blind to `lockfileVersion`, `resolved`/`integrity`, dev/optional markers and peer churn — the complete lockfile diff was read, and it contains exactly the two root bookkeeping hunks and nothing else, so no drift went undetected; the fix is an edit to this build's spec.
  - `[low]` `[reject]` blind-hunter: the drift-check command exits 1 on its success path and would invert under `set -e` — true of the command as written, but no harness consumed its exit code; the grep no-match was read as the pass it is, and the fix is an edit to this build's spec.
  - `[low]` `[reject]` blind-hunter: the `git status --porcelain` AC is violated by the spec artifact this change adds — the artifact reports as `??` (untracked), so "the only modified tracked files" holds literally; the fix is an edit to this build's spec.
  - `[low]` `[reject]` blind-hunter: the Verification section lists a subset while Boundaries demands the whole array, and "Gate command 43" is a pointer, not an invocation — all 55 entries were in fact run (implementer), and commands 1, 2, 7, 42 and 43 were re-run independently here; the fix is an edit to this build's spec.
  - `[low]` `[reject]` blind-hunter: the Intent understates the live WorkOS surface (`src/mastra/config/integrations.ts:87` reads `WORKOS_COOKIE_PASSWORD`), plus `warnings: [oversized]`, empty `context:` and bare log stubs — `integrations.ts` is untouched by this diff and gate command 55 pins that exact key; the three frontmatter/stub observations are all template-correct; the fix is an edit to this build's spec.
  - `[false]` `[reject]` edge-case: `engines.npm` should be exact `"11.17.0"` because guard 43's exact-equality check rejects anything else — guard 43 reads `p.packageManager` and `workspaces` only and never reads `engines`, so no value of `engines.npm` can affect it; DW-84 also names `">=11.17.0"` verbatim as the smallest fix.
  - `[false]` `[reject]` edge-case: Node 22.19.0's bundled npm 10.9.x yields only a warning while `npm ci` still exits 0 — warning-not-failure is the stated, intended mechanism (no `.npmrc`, `engine-strict` off, and the spec's Never-list forbids adding one); same refutation as the first row.
  - `[medium]` `[defer]` edge-case: a later `@mastra/factory` bump that drops or re-versions `@mastra/auth-workos` breaks SPEC.md:76 silently — deferred (item 2, grouped).
  - `[false]` `[reject]` edge-case: `--install-strategy=nested`, pnpm or Yarn PnP would nest the package under `@mastra/factory/node_modules` and break the AC's resolution path — AGENTS.md:19 forbids a second package manager, there is no `.npmrc` and no `install-strategy` setting, so `npm ci` uses the hoisted default that was verified; under a nested tree `@mastra/factory` still resolves its own copy, so the functional outcome is unchanged either way.
  - `[low]` `[reject]` edge-case: same equality-vs-range claim as the third row above — same refutation.
  - `[low]` `[defer]` edge-case: the claim that the EBADENGINE warning "is the signal DW-84 asks for" fails for a host on newer npm, which emits nothing — deferred (item 3, grouped).
  - `[medium]` `[defer]` verification-gap (pre-verified): `engines.npm` is coupled to the `packageManager` pin by prose only, and nothing in the 55-command array checks they agree; guard 43's own remediation text is the mechanism that desyncs them — deferred (item 1, grouped). Filed disposition was `patch` (append one guard); routed to defer instead because the bundle intent enumerates three edits and DW-84 names the `engines` line as its *smallest fix*, so a new gate guard is excluded by the intent itself, not merely by this spec — gate-guard work has been its own bundle before.
  - `[medium]` `[defer]` verification-gap (pre-verified): dropping the root declaration moves a normative "stays installed" invariant onto a third-party transitive edge that nothing asserts — deferred (item 2, grouped). Filed disposition `defer`, honoured.
  - `[low]` `[reject]` verification-gap other: the `git status --porcelain` AC is not what the change produces — same refutation as the eighth row; the artifact is untracked.
  - `[false]` `[reject]` verification-gap other: the note that both edits verified inert (no `"version"` line in the lockfile diff, `engines.node` byte-identical) — a positive confirmation, not a defect claim; independently re-confirmed here.
  - `[medium]` `[defer]` intent-alignment: the intent's expectation lives at foreign-host install behaviour while the diff's surface is two static JSON fields, bridged only by a warning nothing in the repo reads — deferred (item 1, grouped).
  - `[low]` `[defer]` intent-alignment: directionality — `">=11.17.0"` constrains only the older half of "a different npm than the lockfile was produced by" — deferred (item 3, grouped).
  - `[low]` `[defer]` intent-alignment: guard 43's sentence survives untouched, so DW-84's ledger line closes while the complaint that motivates it stays true for any host npm >= 11.17.0 — deferred (item 3, grouped).
  - `[medium]` `[defer]` intent-alignment: no command in the 55-command gate can distinguish "floor present" from "floor absent", so the declaration is unasserted and deleting it later would leave the gate green — deferred (item 1, grouped).
  - `[low]` `[defer]` intent-alignment: the premise that `engines.node`'s upper bound is "a separate open human decision (DW-3)" is stale — DW-3 carries a recorded decision dated 2026-09-24 — deferred (item 4). Not acted on: the intent says leave `engines.node` alone, DW-3 is a separate decided ledger entry that also closes DW-10 and DW-65, and its fix edits AGENTS.md, an agent-context file.

## Design Notes

The one non-obvious point is why removing a dependency does not remove a dependency. SPEC.md makes "stays installed" normative for the five ruled-out packages; DW-32's argument is that the root entry is *redundant*, not that the constraint is stale:

```
package.json           dependencies["@mastra/auth-workos"] = "1.6.5"   <- deleted
@mastra/factory@0.15.0 dependencies["@mastra/auth-workos"] = "1.6.5"   <- remains
=> node_modules/@mastra/auth-workos@1.6.5                              <- unchanged
```

Both specs are the same exact version, so npm resolves the identical tree either way and `envFallbackAuthProvider` keeps working. The AC that reads `node_modules/@mastra/auth-workos/package.json` after `npm ci` proves this rather than assuming it; if that file were absent the change is wrong and must be reverted, not patched.

The npm floor is a declaration only. With `engine-strict` off (there is no `.npmrc`), npm warns rather than fails on a violation — that warning is the signal DW-84 asks for, and is strictly more than the zero signal available today on a host whose npm and `packageManager` pin have drifted together.

## Verification

**Commands:**
- `npm install --no-audit --no-fund` -- expected: exits 0, rewrites `package-lock.json`.
- `git diff -- package-lock.json | grep -E '^[-+].*"version"'` -- expected: no output.
- `npm ci --no-audit --no-fund` -- expected: exits 0.
- `node -p "require('./node_modules/@mastra/auth-workos/package.json').version"` -- expected: `1.6.5`.
- `npm run check`, `npm test`, `npm run build` -- expected: each exits 0.
- Gate command 43 (the `packageManager`/`npm --version` guard in `.bmad-loop/policy.toml`) -- expected: exits 0, unchanged by this edit.
- `git status --porcelain` -- expected: only `package.json` and `package-lock.json` modified.

## Auto Run Result

Status: done

**Implemented change.** Resolved DW-32 and DW-84 in `package.json` and regenerated the lockfile. Four lines of JSON moved in total; nothing under `src/`, `ops/`, `sandbox/` or `.bmad-loop/` was touched, and the deferred-work ledger and sprint board were not edited.

**Files changed:**
- `package.json` -- dropped the `"@mastra/auth-workos": "1.6.5"` root dependency (DW-32) and added `"npm": ">=11.17.0"` to `engines` beside a byte-identical `node` entry (DW-84).
- `package-lock.json` -- regenerated with `npm install --no-audit --no-fund`, not hand-edited. Exactly two hunks, both inside `packages[""]`: the dependency entry removed, `engines.npm` added.
- `_bmad-output/implementation-artifacts/spec-package-json-declaration-hygiene.md` -- this spec (new).

**Review findings.** Four layers reported 25 findings: high 0, medium 7, low 13, false 5, maybe-false 0.
- Patches applied: **none**. The change is four lines of JSON; every finding was either scope-limited by the bundle intent or a critique of this spec's own prose, and rule "reject any finding whose fix is to edit this build's spec" covers the latter.
- Deferred: 4 grouped entries in frontmatter `deferred` — (1) the gate reads neither `engines` nor root `dependencies`, so the floor is unasserted and can silently desync from the `packageManager` pin [medium]; (2) SPEC.md:76's "stays installed" now rests solely on `@mastra/factory@0.15.0`'s own dependency edge [medium]; (3) `">=11.17.0"` is one-directional, so a newer npm satisfies it silently [low]; (4) the "DW-3 is undecided" premise is stale — DW-3 carries a decision dated 2026-09-24 [low].
- Rejected, with reasons: 11 findings. Five were refuted outright — the `engines.node`/bundled-npm "contradiction" (`packageManager` is the corepack declaration that reconciles them, and the warning is the intended signal), the proposal to write an exact `"11.17.0"` (guard 43 never reads `engines`, and DW-84 names the range verbatim), the "warning only, `npm ci` still exits 0" restatement of the same point, the nested/pnpm/Yarn-PnP resolution path (AGENTS.md:19 forbids a second package manager; no `install-strategy` is set), and the verification-gap layer's positive inertness note (not a defect claim). Six were graded `low` and rejected because their only fix is an edit to this build's spec: the equality-vs-range wording (twice), the drift check's narrowness, its inverted exit code, the `git status` AC's treatment of the untracked spec artifact (twice), the Verification subset, and the Intent's understatement of the live `WORKOS_COOKIE_PASSWORD` read.

**Follow-up review recommended: false.** Zero entries were patched this pass — the computation counts patched entries only, and there is no unverifiable risk to name.

**Verification performed** (all re-run independently of the implementer's report, against the diff rather than the report):
- `git diff -- package-lock.json | grep -E '^[-+].*"version"'` -- no output. No version drifted.
- `npm ci --no-audit --no-fund` -- exit 0.
- `node -p "require('./node_modules/@mastra/auth-workos/package.json').version"` -- `1.6.5`. The package survives in the installed tree with no root declaration, which is what makes SPEC.md:76 still hold.
- `npm run check` -- exit 0. `npm test` -- exit 0 (8 files, 121 tests). `npm run build` -- exit 0.
- Gate command 43 (`packageManager` / `npm --version`) -- exit 0, unaffected.
- `git status --porcelain` -- `package.json` and `package-lock.json` modified; the spec artifact untracked.
- The implementer additionally ran all 55 `[verify].commands` entries in order; all exited 0.

**Residual risks.** All four are recorded in `deferred` above; none blocks this change. The load-bearing one is (1): the new floor is a declaration the gate cannot see, so a later `packageManager` bump — which guard 43's own failure message tells an operator to make — would leave a stale floor that warns on nothing, quietly undoing DW-84. Nothing regresses relative to today (there was no floor at all before), but the invariant wants the guard that entry names.
