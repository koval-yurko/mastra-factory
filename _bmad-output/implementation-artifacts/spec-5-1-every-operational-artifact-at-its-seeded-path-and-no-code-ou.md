---
title: 'Story 5.1: Every operational artifact at its seeded path, and no code outside src/'
type: 'chore'
created: '2026-09-23'
status: 'done'
baseline_revision: 'a9c1a0e1cf393d4b4b2f402b843c556d21273289'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      AD-4 forbids "`.ts`, `.js`, `.mjs`, `.cjs` or other program source" outside `src/`, but the only
      guard filters exactly those four extensions, so a first-party `.tsx`, `.jsx`, `.mts` or `.cts`
      outside `src/` passes the gate unverified.
    evidence: |-
      `.bmad-loop/policy.toml` `[verify].commands` index 5 is
      `git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/"`; the four globs are literal and no
      other command widens them. `tsconfig.json` is `include: ["src/**/*"]`, so `tsc --noEmit` never
      sees such a file either — which is the exact condition AD-4 exists to prevent, one extension list
      away from the one that is enforced. Not fixed here: the guard predates this story (it was added
      with the gate itself), and Story 5.1's acceptance criterion names only the same four extensions,
      so widening it is a change to AD-4's enforcement surface rather than to this story's. Smallest
      fix: add `"*.tsx" "*.jsx" "*.mts" "*.cts"` to that one `git ls-files` invocation.
    location: >-
      .bmad-loop/policy.toml [verify].commands index 5
    severity: low
  - summary: >-
      `docs/Self-hosting research.md` is named by the Structural Seed and cited as normative by AD-5 and
      AD-12, yet its deletion or truncation is invisible to every gate command, including the new
      seeded-artifact guard.
    evidence: |-
      The new artifact guard covers the twelve operator-plane artifacts under `apps/`, `sandbox/` and
      `ops/` that Story 5.1's acceptance criterion enumerates; `docs/` is outside that list because the
      criterion does not name it. Confirmed no other command opens it: `grep -n "Self-hosting"
      .bmad-loop/policy.toml` returns nothing, `tsc` is `include: ["src/**/*"]`, and `npm test` is
      `vitest run --dir src`. So the one document AGENTS.md calls "normative operational detail in
      §2–§11" could be emptied with the gate green — the same failure mode the artifact guard was added
      to close, one directory over. Pre-existing, not caused by this story. Smallest fix: add
      `docs/Self-hosting research.md` to the seeded-artifact guard's path list once Story 5.3 has
      renamed it to its space-free path, so the entry lands on the final name.
    location: >-
      docs/Self-hosting research.md vs .bmad-loop/policy.toml [verify].commands
    severity: low
  - summary: >-
      Nothing asserts that `.env` is absent from the index, so `git add -f .env` commits a secrets file
      with all 24 gate commands green — and the root closed-set guard is the one place that explicitly
      exempts it.
    evidence: |-
      Verified in an isolated clone: `git add -f .env` with a `SECRET=` line left every command at exit 0.
      The membership assertion passes because `.env` is one of AD-3's twelve allowlist entries, so a tracked
      `.env` satisfies this story's acceptance criterion ("every tracked root file is one of the twelve AD-3
      names") as written; the presence assertion skips it as gitignored. Pre-existing in the sense that no
      gate command ever observed it, and outside this story's intent, whose "Always" clause puts gitignored
      paths "out of view by construction" — the guard was built to that boundary deliberately. It still
      means the repo's cheapest secret-leak check does not exist. Smallest fix: one clause in the root
      closed-set guard asserting `.env` is NOT in the tracked root-file list, with its own message.
    location: >-
      .bmad-loop/policy.toml [verify].commands root closed-set guard vs .gitignore
    severity: low
  - summary: >-
      `_bmad-output/planning-artifacts/epics.md` still publishes the superseded eight-entry root allowlist
      as this story's own acceptance criterion, which the amended AD-3 now contradicts.
    evidence: |-
      `epics.md:978-982` reads "the only files outside a subject directory are `package.json`,
      `package-lock.json`, `tsconfig.json`, `docker-compose.yml`, `.env`, `.env.schema`, `.env.example` and
      `.gitignore`" — false against both the tree and AD-3's amended twelve-entry table, which this story
      widened on the AC's own amend-the-allowlist branch. A later story or retrospective reading epics.md
      rather than the spine would try to move four tool-located root files. Not fixed here: editing an epic
      acceptance criterion mid-epic is a correct-course action (bmad-correct-course), not a gate patch, and
      AD-3 is the normative home the same criterion points at. The sibling half self-heals:
      `epic-5-context.md` repeats the eight-entry list but is a cache invalidated by any newer file under
      planning-artifacts, and ARCHITECTURE-SPINE.md is now newer, so the next story recompiles it.
      Smallest fix: amend NFR4's acceptance criterion in epics.md to cite AD-3 instead of restating it.
    location: >-
      _bmad-output/planning-artifacts/epics.md:978-982
    severity: low
---

<intent-contract>

## Intent

**Problem:** AD-3, AD-4 and AD-5 describe where files live, and nothing checks it. Every one of the
eighteen gate commands opens particular paths, so a seeded artifact that is deleted, emptied or moved is
invisible to all of them, and a stray file appearing at root is invisible too — which is how four tracked
root files (`AGENTS.md`, `README.md`, `skills-lock.json`, `.mastra-project.json`) accumulated outside the
eight-entry allowlist AD-3 still publishes as closed.

**Approach:** Audit the tree against the structural seed, the root allowlist and the `src/`-only rule,
recording the evidence. Where reality is right and the spine is stale — the four tool-fixed root files —
amend AD-3 as the deliberate spine change its own rule demands, rather than moving files a tool locates.
Then convert each audited rule into a gate command so the audit is permanent rather than a one-time
observation.

## Boundaries & Constraints

**Always:** Read the tree through `git ls-files`, so gitignored paths (`.env`, `node_modules/`, `.mastra/`,
`.bmad-loop/runs/`) are out of view by construction and a story worktree — tracked files only — sees exactly
what the gate asserts. Treat `.agents/`, `_bmad/`, `_bmad-output/`, `.bmad-loop/` and `.claude/` as out of
scope for reorganisation (AD-13); they are audited only for the hand-edit rule. Append to
`[verify].commands`, never rewrite or reorder an existing entry. Every new guard must fail with a message
naming the offending path and the fix.

**Never:** Do not move, rename or delete any file that is already at its seeded path — the audit's finding
is that the layout is correct. Do not touch `docs/Self-hosting research.md`: its fenced copies of the
Dockerfile, the plists, the wrapper and the conf are Story 5.3's work (FR32), and its section numbers are
stable citation anchors. Do not edit `AGENTS.md` (managed block — route to the ledger). Do not hand-edit
`.agents/skills/` or `skills-lock.json`. Do not widen `tsconfig.json`'s `include`, and do not add a root
file or root directory to make a guard pass.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Seeded layout intact | current tree | all four new guards exit 0 | No error expected |
| Artifact dropped from the index or truncated | `git rm --cached apps/slack/manifest.yaml`, or `: > apps/slack/manifest.yaml` | guard 1 exits 1 | message names the path and cites AD-5 |
| Stray root file tracked | `git add vitest.config.ts` at root | guard 2 exits 1 | message names the file and offers both fixes: move it under its subject, or amend AD-3 naming the tool that fixes its location |
| Stray root directory tracked | `git add tests/x.ts` | guard 2 exits 1 | message names the directory and says a root directory is a spine change |
| `include` widened or dropped | `include: ["src/**/*","ops/**/*"]`, or key removed | guard 3 exits 1 | message prints the value found and the required value |
| `.agents/skills/` edited and staged | any staged edit, addition or deletion under it | guard 4 exits 1 | message prints both digests and says to update `skills-lock.json` and the expected digest together |

</intent-contract>

## Code Map

- `.bmad-loop/policy.toml` — `[verify].commands` at :~200-265. **The three structural guards are already
  present in this worktree, uncommitted**: the orchestrator preserved them when the first dev attempt timed
  out (`.gitignore:12` records that policy.toml is deliberately tracked so a story can extend the gate).
  All three were re-run here and pass. Existing guard at index 5 is the AD-4 extension filter
  (`git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/"`); index 6 is
  `git status --porcelain -- .agents/skills`, which compares both the worktree and the index against HEAD —
  so it catches an unstaged *and* a staged edit, and goes blind the moment one is committed (verified in an
  isolated clone: after `git commit` of an edit under that tree it exits 0).
- `_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md`
  — AD-3 root allowlist at :66-69 (eight entries; four tracked root files are missing from it and the closed
  root *directory* set is asserted but never enumerated); AD-4 at :71-79; AD-5 at :81-87; AD-13 at :165-173;
  Structural Seed at :246-277 (lists `docker-compose.yml`, the env files and the package manifests at root,
  and omits the same four).
- Audited, no change: all twelve seeded artifacts (`sandbox/factory-sandbox.Dockerfile`, `sandbox/README.md`,
  `ops/README.md`, `ops/launchagents/ai.mastra.{colima,factory}.plist`, `ops/factory-start.sh`,
  `ops/newsyslog/ai.mastra.factory.conf`, `ops/install.sh`, `apps/{github,linear,slack}/README.md`,
  `apps/slack/manifest.yaml`) are tracked and non-empty. Tracked `.ts` files: `src/mastra/index.ts`,
  `src/mastra/index.test.ts` — nothing else, no `.js`/`.mjs`/`.cjs` anywhere. `tsconfig.json` reads
  `include: ["src/**/*"]`.
- `.agents/skills/` — two tracked files, written once by `5a2eb72 Create project from template` and by no
  commit since; `git ls-files -s` digest `deb4fcc41be816003cfd12cd7c91fc7fa8783f7cb9d66f651b056dee49f576d8`.
  `skills-lock.json` records `computedHash 61e8e758…`, which is not the sha256 of either file nor of their
  concatenation — the CLI's algorithm is not reproducible from the repo, so the lockfile's own hash cannot be
  re-verified here; git's content addressing is the substitute.
- Duplicate-copy surface, deliberately untouched: `docs/Self-hosting research.md` §2.1 (Dockerfile), §7.1,
  §7.3 (plists), §7.2 (wrapper), §7.4 (conf) — already tracked as DW-22 and DW-51, routed to Story 5.3. A
  signature grep across every tracked non-vendored file (`DOCTYPE plist`, `^FROM `, `koval:staff`,
  `display_information`, `EXPECTED_ROOT`) finds no second copy anywhere else.

## Tasks & Acceptance

**Execution:**
- `_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md`
  — amend AD-3's root allowlist to name all twelve tracked-or-gitignored root files with *what fixes each
  one's location*, adding `AGENTS.md`, `README.md`, `skills-lock.json` and `.mastra-project.json` and saying
  plainly that their consumers accept no path argument, so moving them is not possible; state that nothing
  else may be tracked at root and that adding an entry is a spine change. Enumerate the closed root
  *directory* set the same rule already claims. Extend the Structural Seed with the four files and one
  sentence saying root is exactly those closed sets, checked by the gate. — the AC's stated remedy for a
  root file outside the allowlist is to move it or amend the allowlist deliberately; a tool-located file
  cannot be moved, so the amendment is the only honest branch, and it must be recorded, not silent.
- `.bmad-loop/policy.toml` — keep the three already-present structural guards (seeded-artifact existence,
  root closed set, literal `tsconfig` `include`), re-verify each passes and fails correctly, and append a
  fourth asserting the `git ls-files -s` digest of `.agents/skills/` equals
  `deb4fcc41be816003cfd12cd7c91fc7fa8783f7cb9d66f651b056dee49f576d8`; extend the comment block above
  `commands` to document the fourth alongside the other three. — the existing skills guard reads
  `git status`, which goes blind the moment a hand edit is committed, and the lockfile's own hash is not
  reproducible here, so the index digest is what makes AD-13's "never hand-edited" observable past the commit
  boundary.

**Acceptance Criteria:**
- Given the twelve paths the structural seed names, when the gate runs, then each is tracked and non-empty,
  and removing any one from the index or truncating it fails the gate with a message naming that path.
- Given root is a closed set, when the gate runs, then every tracked root file is one of the twelve AD-3
  names and every tracked root directory is one of the eleven AD-3 names, and a tracked `vitest.config.ts`
  at root or a tracked `tests/` directory fails the gate naming the offender and the fix.
- Given AD-3 is the normative home for the root allowlist, when the amended spine is read, then it names
  every root file the tree actually tracks, each with the tool or convention that fixes its location, and the
  guard's allowlist and the spine's list agree entry for entry.
- Given `tsc --noEmit` cannot report its own blind spot, when the gate runs, then `tsconfig.json`'s `include`
  is exactly `["src/**/*"]`, and widening it or dropping the key fails the gate printing the value found.
- Given no first-party program source may live outside `src/`, when the tree is searched, then the only
  tracked `.ts`/`.js`/`.mjs`/`.cjs` files are under `src/`, and the pre-existing AD-4 guard still enforces it.
- Given `.agents/skills/` is vendored and hash-locked, when the gate runs, then its index digest matches the
  recorded value, and any staged edit, addition or deletion under it fails the gate printing both digests and
  telling the maintainer to update `skills-lock.json` and the expected digest in the same change.
- Given the audit found the layout already correct, when the diff is read, then no file has been moved,
  renamed or deleted, `docs/Self-hosting research.md` is untouched, and no existing `[verify].commands` entry
  has been rewritten or reordered.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 35 findings — high 0, medium 14, low 15, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` Guard 1 takes membership from the index but size from the working tree, so a staged 0-byte blob passes — confirmed: with `apps/slack/manifest.yaml` staged as a 0-byte blob and the 4130-byte file restored on disk the guard exited 0; fixed to assert the index (`git ls-files -s` mode plus `git cat-file -s :<path>`).
  - `[medium]` `[patch]` Guard 2 iterates unquoted `$(git ls-files)`, so paths word-split and non-ASCII paths arrive C-quoted — confirmed: a root `my config.json` was reported as offender `my`; fixed with `git -c core.quotePath=false ls-files` through `while IFS= read -r`, failing outside the pipeline.
  - `[medium]` `[patch]` Guard 2 is subset-only, so deleting an allowlisted root file is invisible — confirmed: `git rm --cached docker-compose.yml` left all four guards green; fixed with a presence assertion over the eleven tracked allowlist entries (`.env` excluded as gitignored).
  - `[medium]` `[patch]` Guard 3 parses `tsconfig.json` as strict JSON while `tsc` accepts JSONC — confirmed: a legal `// src only` line produced an uncaught `SyntaxError` and no guard message, and `tsc --noEmit` accepted the same file; fixed by stripping full-line `//` comments and wrapping read+parse in try/catch.
  - `[medium]` `[patch]` `skills-lock.json` is declared vendored and never-hand-edited but no gate command reads it — confirmed: `grep -n skills-lock .bmad-loop/policy.toml` finds it only in comments and in guard 2's allowlist; fixed by extending guard 4's digest to `git ls-files -s .agents/skills skills-lock.json`.
  - `[low]` `[patch]` AD-13 is silent about the new obligation to move the pinned digest with a CLI-driven skills update, which lived only in a TOML comment — one sentence added to AD-13.
  - `[medium]` `[patch]` Guard 2's allowlist was a hand copy of AD-3 with nothing tying them together, so appending one `case` token would widen root with the spine untouched — fixed by deriving both sets from AD-3; verified a tracked `vitest.config.ts` fails until an AD-3 table row names it, and passes once it does.
  - `[false]` `[reject]` "guards 8-11" in the new comment is mis-numbered — refuted: the comment block numbers each group locally (`the two guards after the typecheck` 1-2; `the last eleven guards cover ops/` 1-11 at `.bmad-loop/policy.toml:88-198`), and under that scheme items 8-11 are exactly the four `ops/README.md` cross-checks the sentence describes.
  - `[false]` `[reject]` "All eighteen read particular files by path" overstates the prior set — refuted: each of the eighteen is path-anchored (`npm ci` on the root manifests, `npm run check` on `include`, `varlock load` on `.env.schema`, `npm test` on `--dir src`), which is precisely the blindness-to-everything-else the sentence asserts.
  - `[low]` `[reject]` The spec's Code Map line anchors are stale after the spine edit — rejected: the fix is to edit this build's spec, and the Code Map records the pre-change state the implementation was planned against.
  - `[false]` `[reject]` The Structural Seed block does not list `.gitignore` or `tsconfig.json` although the new sentence claims twelve files — refuted: the sentence says root is "the two closed sets **AD-3 enumerates**", deferring the enumeration to AD-3 rather than to the block, and the block was already partial before this change.
  - `[low]` `[patch]` "each of the twelve operational artifacts above" left the reader counting a block that also lists `src/`, `docs/` and the root files — the sentence now names the twelve as the operator-plane artifacts under `apps/`, `sandbox/` and `ops/` and says why the rest are outside; the same finding's second half (`docs/Self-hosting research.md` is covered by no guard) went to the ledger.
  - `[low]` `[defer]` AD-4 says "or other program source" while the guard filters four extensions, so `.tsx`/`.jsx`/`.mts`/`.cts` outside `src/` pass — pre-existing guard, and this story's criterion names the same four extensions; deferred with the one-line fix.
  - `[false]` `[reject]` The new spec citations grow Story 5.3's rename search surface — refuted: 5.3's criterion excludes "the vendored and tool-owned trees" and AD-13 names `_bmad-output/` as generated, so specs there are outside that search by construction.
  - `[medium]` `[patch]` Guard 2 fails on a legitimate non-ASCII path — confirmed: a tracked `docs/café.md` produced `tracked root directory not in the AD-3 closed set: "docs`, a false gate failure; fixed by the `core.quotePath=false` rewrite and re-verified (`docs/café.md` now exits 0).
  - `[medium]` `[patch]` Guard 2 misnames a space-bearing offender — confirmed and fixed with the same rewrite; `my config.json` is now named in full.
  - `[medium]` `[patch]` Guard 3 dies with a raw `SyntaxError`/ENOENT instead of its own message — confirmed for both JSONC and a missing file; fixed, and a malformed file now reports `tsconfig.json unreadable or not valid JSON: <message>`.
  - `[low]` `[reject]` Guard 3 is blind to an `include` inherited through `extends` — rejected: AD-4 requires `tsconfig.json` itself to read `include: ["src/**/*"]`, so failing an `extends`-only config is the rule rather than a defect; the file carries no `extends`, and the fix adds a branch for a state never demonstrated.
  - `[low]` `[patch]` Guard 4 never checks the digest substitution's exit status, so a missing `shasum` reads as a hand edit with an empty "found" value — fixed with the `test -n "$a"` clause the ops guards already use.
  - `[low]` `[reject]` Guard 4 would report an unmerged index under `.agents/skills` as a hand edit — rejected: the gate runs after a clean review on a worktree with no conflict state, and the fix adds conflict-detection branching for a situation never shown reachable.
  - `[low]` `[patch]` Guard 1 accepts a symlink at a seeded path because `test -s` follows links — confirmed: `sandbox/README.md` staged as index mode 120000 exited 0; fixed by the same index-mode check, which now names the symlink case.
  - `[medium]` `[patch]` A committed `skills-lock.json` hand edit passes every one of the 22 commands — confirmed; fixed by the combined digest, verified failing on a `computedHash` edit while the pre-existing `git status` guard stays green.
  - `[low]` `[patch]` The AD-3 rewrite dropped "Moving any of them requires updating its consuming tool in the same change" — confirmed by grep; the obligation is restored as a clause covering the movable entries.
  - `[medium]` `[patch]` Guard 3 violated this spec's own boundary that every new guard fail with a message naming the offender and the fix — same fix as the JSONC finding; all three failure paths now print the guard's own text.
  - `[medium]` `[patch]` (pre-verified gap) The root closed sets were duplicated in guard 2 and the spine with nothing checking agreement, so the gate was self-certifying — fixed by deriving both sets from AD-3, which also satisfies the acceptance criterion that the two agree entry for entry.
  - `[medium]` `[patch]` (pre-verified gap) `skills-lock.json` was pinned by nothing although guard 4's message presumes it moves with the tree — fixed by the combined digest, one constant for both files.
  - `[medium]` `[patch]` Guard 3's bare `JSON.parse` — same fix as above.
  - `[low]` `[reject]` Guard 1's twelve paths are not tied to the Structural Seed either — rejected: the seed writes two entries as globs (`ops/launchagents/*.plist`, `ops/newsyslog/*.conf`) and already carries a Story 5.4 entry the guard correctly omits, so an exact set comparison needs glob-aware matching, which is more than a direct correction; the seed now states which twelve the gate checks and why the rest are outside.
  - `[low]` `[patch]` The comment's "Each reads the tree through `git ls-files`" is untrue of guard 3 (reads `tsconfig.json` from disk) and of guard 2 (also reads the spine) — corrected.
  - `[low]` `[patch]` Guard 2's unquoted iteration — same fix as above.
  - `[false]` `[reject]` AC1's "no artifact exists in two places" is unimplemented because five fenced copies remain in `docs/Self-hosting research.md` — refuted at the intent level: the same epic assigns those exact five blocks to Story 5.3 (FR32) and FR30's own wording is "*only* as a fenced block"; every artifact has exactly one file, verified by signature grep, and DW-22/DW-51 already track the prose copies.
  - `[low]` `[reject]` The ACs were restated from "when the layout is audited" to "when the gate runs" — rejected: the audit was performed and its evidence recorded in the Code Map, and the epic's own gate-reality constraint makes a gate command the durable form of the same assertion; no fix short of re-deriving the spec.
  - `[low]` `[reject]` AC4's mechanism was substituted, coupling a vendored concern into `policy.toml` — rejected as a documented trade-off: `skills-lock.json`'s `computedHash` is not reproducible from the tree (sha256 of `SKILL.md`, of its content without the trailing newline, and of both files concatenated all differ), so git's index digest is the only available observable; the coupling is the intended review moment and is now stated in AD-13 rather than only in a comment.
  - `[false]` `[reject]` AC2 is satisfied only under the amend-the-allowlist reading — no defect: AC2 supplies that branch explicitly, and the auditor confirmed the guard and the spine agree 12/12 files and 11/11 directories.
  - `[low]` `[reject]` Guard 1 hardcodes both plist filenames where AC1 writes `ops/launchagents/*.plist` — rejected: both plists that exist are covered, guard 5 pins each Label to its filename stem, and glob-expanding the existence check adds complexity for a third plist that does not exist.

### 2026-09-23 — Review pass (follow-up)
- verdicts: 34 findings — high 0, medium 8, low 22, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` Guard 2 resolves the spine with `ls`/`sed` from disk, so an uncommitted AD-3 edit
    satisfies the amend-the-spine ceremony — refuted: `bmad_loop.verify.finalize_commit` runs `git add -A`
    (`verify.py:9360`, called from `engine.py:3783`) after the gate, so the spine edit the guard read is in the
    story commit; reading disk is what matches what gets committed.
  - `[false]` `[reject]` Guard 3 reads `tsconfig.json` from disk, reproducing the index/worktree split —
    refuted by the same `git add -A`: the committed file is the on-disk one, and a *staged* widening with the
    worktree restored is reverted by that step rather than shipped.
  - `[low]` `[reject]` Guard 3 strips only full-line `//`, so a `/* */` block comment, a trailing `//` after a
    value and a trailing comma fail as "unreadable" on configs `tsc` accepts — confirmed for all three, but
    rejected: `tsconfig.json` is pinned by AD-4 and changes rarely, the guard fails loudly as itself with an
    actionable message, and the honest fix (`tsc --showConfig`) would resolve `extends` and stop asserting
    what AD-4 requires — that `tsconfig.json` ITSELF reads the one `include`. The limit is now documented in
    the guard's comment instead of being a surprise.
  - `[low]` `[patch]` Guard 4's `test -n "$a"` cannot detect a failing `git`, because `shasum` of empty input
    is the non-empty `e3b0c442…` — confirmed: run from a non-repo cwd it printed "digest changed: found
    e3b0c442…" and told the maintainer to regenerate a vendored tree that was fine, while the comment claimed
    the case was covered; fixed by capturing the rows with `|| exit 1`, asserting them non-empty, then hashing.
  - `[medium]` `[patch]` The directory closed-set extraction ends on the prose anchor `are the whole set`, and
    over-collection is checked nowhere, so rewording it runs `sed` to EOF and silently WIDENS root —
    confirmed: with the phrase changed to "are the complete set" a tracked root `config/` was admitted; fixed
    by ending the range on the next bullet and asserting both ranges terminate on their closing anchor.
  - `[low]` `[patch]` The allowlist grep requires exactly two leading spaces, so a formatting-only de-indent
    red-lights the whole gate with "could not extract the AD-3 root allowlist table" — confirmed; fixed to
    `^[[:space:]]*[|]` and re-verified green on the de-indented table.
  - `[low]` `[defer]` Nothing asserts `.env` is untracked; `git add -f .env` leaves all 24 commands green —
    confirmed, and deferred: a tracked `.env` satisfies AC2 as written (it is one of AD-3's twelve names) and
    the intent's "Always" clause puts gitignored paths out of view by construction, so closing it widens the
    rule rather than correcting this one. Ledger entry carries the one-clause fix.
  - `[low]` `[reject]` The presence assertion is file-only, so a root directory can leave the index unnoticed
    — confirmed (`git rm --cached -r docs` stays green), rejected: the only root directory no other command
    covers is `docs/`, already recorded in this spec's ledger (the seeded-artifact guard covers `apps/`,
    `sandbox/`, `ops/`; removing `src/` fails `tsc`/`vitest`), and the fix adds a fourth assertion loop for a
    case no other guard leaves open.
  - `[low]` `[defer]` `epics.md` and `epic-5-context.md` still publish the superseded eight-entry allowlist —
    confirmed at `epics.md:978-982`; deferred: amending an epic AC mid-epic is a correct-course action, and the
    context file is a cache the newer spine already invalidates, so it recompiles on the next story.
  - `[low]` `[reject]` The spec still pins the tree-only digest `deb4fcc…` where the guard pins the combined
    `1ba1914…`, AC6 names only `.agents/skills/`, the Verification file count is short, and the Change Log is
    empty — real (confirmed by grep), but every fix edits this build's spec, which triage does not do.
  - `[low]` `[reject]` The I/O & Edge-Case Matrix was never extended to the symlink, staged-0-byte, non-ASCII,
    JSONC and committed-lockfile cases the reviews found — same reason: the fix edits this build's spec.
  - `[low]` `[reject]` Nothing obliges a future seeded artifact to join the guard's hardcoded twelve paths —
    carried: same claim and location as the prior pass's rejection; the seed still writes two entries as globs
    and carries a Story 5.4 entry the guard deliberately omits, and the seed states which twelve are checked.
  - `[false]` `[reject]` Spec status and `sprint-status.yaml` disagree and the follow-up flag leads nowhere —
    refuted: `status: in-review` is this pass's own mid-review state (step-04 sets it on entry and finalizes to
    `done`), and `followup_review_recommended: true` is precisely what dispatched this pass.
  - `[low]` `[reject]` Both new `deferred-work.md` headings are truncated mid-sentence — real but pre-existing
    and not this story's to fix: DW-19 and DW-18 truncate the same way, the full text is in each entry's
    `reason:`, and the ledger is orchestrator-owned (this session is directed not to rewrite its entries).
  - `[low]` `[reject]` `tsconfig.json` JSONC forms beyond full-line comments fail the gate — same finding and
    same rejection as above.
  - `[medium]` `[patch]` A seeded artifact emptied or deleted in the working tree without staging leaves the
    gate green — confirmed: `: > apps/slack/manifest.yaml` and `rm apps/github/README.md` both exited 0 on all
    24 commands; fixed by appending a working-tree guard (`test -L`/`-f`/`-s`) over the same twelve paths.
  - `[medium]` `[patch]` Rewording AD-3's `are the whole set` end marker runs the extraction to EOF —
    confirmed; same fix as the range finding above.
  - `[low]` `[patch]` A backticked forbidden name placed inside an extraction range would become an allowed
    entry — the shipped document keeps its counter-examples after the end anchor, so `config/` is still
    rejected today, but the risk is the same unbounded-range root cause and the bullet-anchored range fixes it.
  - `[low]` `[patch]` The presence assertion hardcodes `.env` as the sole gitignored exception, so a second
    gitignored AD-3 row fails as "not tracked at root" — confirmed by adding a `.env.local` row; fixed with
    `git check-ignore -q`, which removes the last hand-copied element from an otherwise derived guard.
  - `[low]` `[patch]` Guard 4 hashes empty input when `git` fails or both paths leave the index — confirmed;
    same fix as the failing-git finding above.
  - `[medium]` `[patch]` This spec's matrix claims `: > apps/slack/manifest.yaml` makes guard 1 exit 1, and it
    does not — confirmed, and fixed in the code rather than the claim: the working-tree guard now owns that row.
  - `[low]` `[reject]` This spec's Execution bullet pins `deb4fcc…` where the guard pins `1ba1914…` —
    confirmed, rejected: the fix edits this build's spec.
  - `[medium]` `[patch]` (pre-verified gap) Guards 1 and 2 assert the index, but `finalize_commit` runs
    `git add -A` after the gate, so the whole uncommitted delta is unchecked and then committed — verified in
    the orchestrator source (`verify.py:9360`) and empirically; fixed with the working-tree seeded-artifact
    guard plus `git ls-files -o --exclude-standard` in the root closed-set guard.
  - `[medium]` `[patch]` (pre-verified gap) Guard 4 pins the index only and the pre-existing `git status`
    guard's pathspec stops at `.agents/skills`, so an unstaged `skills-lock.json` edit passes all 22 commands
    — confirmed; fixed by appending `git status --porcelain -- skills-lock.json` rather than rewriting the
    pre-existing entry.
  - `[low]` `[reject]` Guard 3's partial JSONC handling — same finding, same rejection.
  - `[low]` `[reject]` Requiring exactly one `ARCHITECTURE-SPINE.md` hard-fails the gate when a per-epic
    architecture folder exists, which the bmad-architecture skill supports — confirmed (a second folder exits
    1 for every story), rejected: failing closed on an ambiguous normative source is correct behaviour, the
    message names the condition, and choosing among several spines is a policy decision this intent does not
    make.
  - `[low]` `[patch]` The hardcoded `.env` exception re-introduces spine/guard divergence — same fix as above.
  - `[medium]` `[patch]` The matrix expects guard 1 to exit 1 on EITHER of row 2's two mutations, and the
    unstaged one exits 0 — the enforcement surface was substituted (working tree → index) rather than widened,
    so the trade closed two staged holes the matrix never named and opened the one it did name; confirmed, and
    fixed by asserting both surfaces instead of choosing between them.
  - `[medium]` `[patch]` The two files AD-13's new sentence pins "together" are not covered at the same
    surface: the vendored tree is caught unstaged by the pre-existing `git status` guard, `skills-lock.json` is
    not — confirmed; fixed by the appended working-tree lockfile guard.
  - `[low]` `[reject]` Every failure path is attested only in prose; the repo can automatically exercise the
    all-green case only — true and structural: a harness for shell-embedded-in-TOML is a new test surface, far
    more than a direct correction, and the negative rows were re-verified by hand again this pass (14 cases).
  - `[low]` `[patch]` The gate now parses a generated markdown document as machine input, coupling it to
    formatting — accepted as the mechanism that makes derivation real, and its two demonstrated failure modes
    are patched (bullet-anchored ranges, whitespace-tolerant table grep); the editing contract is now stated
    in AD-3 beside the lists rather than only in the guard's comment.
  - `[low]` `[reject]` The seeded-artifact guard hardcodes twelve paths while the seed writes two as globs —
    carried: same claim and location as the prior pass's rejection, and the code still reads as that row
    describes.
  - `[false]` `[reject]` The presence assertion imposes a constraint the contract never authorised (root files
    are now mandatory) — refuted: AC2 makes root "exactly" the closed set, which is a both-directions claim,
    and the prior pass added it on a demonstrated hole (`git rm --cached docker-compose.yml` staying green).
  - `[low]` `[reject]` The `src/`-only rule received no new guard and `docs/Self-hosting research.md` is
    covered by none — carried: both are already in this spec's ledger with their one-line fixes, and the
    matrix scores neither.

## Design Notes

**Why the spine changes and the tree does not.** The AC offers two branches for a root file outside the
allowlist: move it to its owning subject, or amend the allowlist as a deliberate spine change. All four
offenders are in the second branch, and provably so: each is read from the repo root by a consumer that
accepts no path argument — coding agents read `AGENTS.md` from the root, forges render the root `README.md`,
and the Mastra CLI writes `skills-lock.json` and `.mastra-project.json` at the project root. Moving any of
them means editing a consumer this repo does not own. So the allowlist was simply written short, and the fix is to write it out with the *reason* attached to
each entry, which is also what stops the next agent from reading the list as arbitrary.

**"No artifact in two places" means no second file.** Five artifacts are still reproduced as fenced blocks
in `docs/Self-hosting research.md`; the same epic gives their removal to Story 5.3 (FR32), and DW-22/DW-51
already track them. This story therefore reads that criterion as *one canonical file per artifact* and
verifies it as such: a signature grep over every tracked non-vendored file finds no second copy outside that
document. Reading it as "delete the prose copies" would do Story 5.3's work in the file whose stable section
numbers this story is told not to disturb.

**Why an index digest and not the lockfile's hash.** `skills-lock.json`'s `computedHash` could not be
reproduced from the tree (tried: sha256 of `SKILL.md`, of its content without the trailing newline, and of
both files concatenated), so a guard cannot re-derive it. `git ls-files -s .agents/skills` prints mode, blob
sha and path per file; hashing that line set catches an edit, an addition and a deletion alike, needs no
knowledge of the CLI's internals, and changes only when the tracked content changes.

## Verification

**Commands:**
- `sh -c` each of the four new `[verify].commands` entries, run from the repo root — expected: all exit 0 on
  the current tree.
- Negative pass, each reverted immediately afterwards: `git rm --cached apps/slack/manifest.yaml`;
  `: > apps/slack/manifest.yaml`; `touch vitest.config.ts && git add -N vitest.config.ts`;
  `mkdir tests && touch tests/x.ts && git add -N tests/x.ts`; widen and then delete `include` in
  `tsconfig.json`; stage an edit under `.agents/skills/` — expected: exactly the guard that owns each case
  exits 1 with a message naming the offender, and the other three still exit 0.
- `git ls-files | grep -vE '^(\.agents|_bmad|_bmad-output|\.bmad-loop|\.claude)/' | grep -E '\.(ts|js|mjs|cjs)$'`
  — expected: only `src/mastra/index.ts` and `src/mastra/index.test.ts`.
- `npm run check` — expected: clean (the story touches no TypeScript).
- `git status --porcelain` and `git diff --stat` before finalising — expected: exactly two files changed,
  `.bmad-loop/policy.toml` and `ARCHITECTURE-SPINE.md`, plus the spec; no deletions, no renames.


## Auto Run Result

Status: done
Blocking condition: none

**Summary.** Follow-up review pass on a `done` spec. No code was re-derived; six patches were applied to
this story's own structural guards and the AD-3 amendment it shipped. The substantive change is that the
gate now asserts the layout rules at **both** git surfaces instead of one. The prior pass had moved the
seeded-artifact check from the working tree to the index (closing staged-0-byte and staged-symlink holes) and,
in doing so, stopped catching the plainest violation of all: `rm` or `: >` on a seeded artifact without
staging it. That matters because the orchestrator's `finalize_commit` runs `git add -A` after the gate
(`bmad_loop/verify.py:9360`), so the working tree — not the verified index — is what the story commit carries.
The same split left an unstaged `skills-lock.json` hand edit invisible to all 22 commands and an untracked
stray root file invisible to the root closed-set guard. Both surfaces are now asserted, and the spine
derivation was hardened against the two ways its markdown extraction could go wrong.

**Files changed** (two, plus this spec — no deletions, no renames, no moves):
- `.bmad-loop/policy.toml` — appended two guards (working-tree seeded artifacts; working-tree
  `skills-lock.json`), bringing `[verify].commands` from 22 to 24; fixed four defects inside the two guards
  this story added (extraction-range bounding, whitespace-tolerant table grep, `git check-ignore` instead of a
  hardcoded `.env`, real `git`-failure detection); rewrote the comment block to document the two-surface model
  and to correct three claims that had become false.
- `.../ARCHITECTURE-SPINE.md` — AD-3's gate paragraph now states that both `git ls-files` and
  `git ls-files -o --exclude-standard` are checked and why, and records the two editing constraints the gate's
  markdown parsing imposes (bullet order; the section ending at `### AD-4`).

**Review findings breakdown** — 34 findings across four layers: high 0, medium 8, low 22, false 4,
maybe-false 0. Routed: 15 patch (6 grouped entries), 2 defer, 17 reject.

Patched entries (6): medium 3 — index-only seeded-artifact assertion vs `git add -A`; `skills-lock.json`
pinned only in the index; unbounded/unvalidated spine extraction ranges. low 3 — allowlist grep coupled to a
two-space indent; hardcoded `.env` exception; `git` failure misreported as a hand edit.

Deferred (2, appended to `deferred`): `git add -f .env` passes every command (intent puts gitignored paths out
of view by construction); `epics.md:978-982` still publishes the superseded eight-entry allowlist (amending an
epic AC is a correct-course action).

Rejected (17), with reasons: guard 2 reading the spine from disk and guard 3 reading `tsconfig.json` from disk
are both **false** — `git add -A` makes the on-disk file the committed one. Spec/sprint status "disagreement"
is **false** — `in-review` is this pass's own mid-review state. The presence assertion "exceeding the
contract" is **false** — AC2's "exactly" is a both-directions claim. Guard 3's partial JSONC handling (3
duplicate rows) — rejected: `tsc --showConfig` would resolve `extends` and stop asserting what AD-4 requires;
the limit is now documented in the guard. Directory presence left subset-only — rejected: the only uncovered
root directory is `docs/`, already in the ledger. Exactly-one-spine hard failure — rejected: failing closed on
an ambiguous normative source is correct, and picking among spines is a policy call this intent does not make.
Four rows whose fix edits this build's spec (digest `deb4fcc…` vs `1ba1914…` ×2, unextended matrix, empty
change log) — rejected by rule. Truncated `deferred-work.md` headings — pre-existing and orchestrator-owned.
No automated negative-path harness — a new test surface, not a correction. Three carried rejections from the
prior pass (seed-to-guard coupling ×2, `src/`-only and `docs/` deferrals) re-checked and still accurate.

**Verification performed** (isolated clone of HEAD; guards extracted from the final `policy.toml` and run
individually):
- All 24 `[verify].commands` exit 0 on a clean tree, in the clone and in this worktree.
- 14-case behavioural suite, each reverted afterwards — every original matrix row still fires on its owning
  guard, and each new case fires on the intended one: staged index drop → guard 1; unstaged truncate, unstaged
  delete, unstaged symlink → guard 5 (new); staged 0-byte blob with a full file on disk → guard 1; tracked and
  untracked stray root file, tracked and untracked stray root directory → guard 2; `include` widened and
  `include` dropped → guard 3; staged `.agents/skills` edit → pre-existing `git status` guard + guard 4;
  committed lockfile edit → guard 4; unstaged lockfile edit → guard 6 (new); reworded closed-set bullet and
  renamed `### AD-4` heading → guard 2's range-overrun message instead of a silently widened set.
- Legitimate cases re-confirmed green: `docs/café.md`, a full-line JSONC comment, a de-indented AD-3 table, a
  second gitignored AD-3 allowlist row, and a root file admitted only after AD-3 names it (added, verified,
  removed).
- `npm ci && npm run check && npm test` in the clone: 0 / 0 / 59 tests passed, and it leaves no untracked
  non-ignored file, so the widened guard 2 does not false-fail after the gate's own commands run.
- Guard 4's pinned digest is unchanged (`1ba1914…`) — the refactor to `printf "%s\n" "$l" | shasum` reproduces
  the original byte stream.
- Append-only confirmed mechanically: the 18 pre-baseline `[verify].commands` entries are byte-identical and in
  the same order (`tomli` comparison against `a9c1a0e`); only this story's own entries 19 and 21 were edited.
- `git ls-files | grep -vE '^(\.agents|_bmad|_bmad-output|\.bmad-loop|\.claude)/' | grep -E '\.(ts|js|mjs|cjs)$'`
  → `src/mastra/index.ts`, `src/mastra/index.test.ts` only. `npm run check` clean. `git diff --stat` shows no
  deletions and no renames; `docs/Self-hosting research.md` and `AGENTS.md` untouched.

**Follow-up review recommended: false.** This is a follow-up pass and it patched no `high`; the work has
converged. (Patch volume is not grounds — the six entries were 3 medium and 3 low.)

**Residual risks.** (1) The gate parses a generated markdown document as machine input. The two demonstrated
failure modes are closed and the editing contract is now in AD-3, but a large enough AD-3 rewrite still fails
the gate rather than silently mis-deriving — loudly, which is the intended direction. (2) A per-epic
`architecture-*/` folder red-lights the gate until someone resolves which spine is normative. (3) Three JSONC
forms `tsc` accepts are reported as unparseable. (4) The negative behaviour of all six structural guards is
attested by this run's manual suite, not by a harness the repo can replay. (5) Four ledger entries remain open
against this story's surface: the AD-4 extension list, `docs/Self-hosting research.md`, a force-added `.env`,
and `epics.md`'s stale allowlist.
