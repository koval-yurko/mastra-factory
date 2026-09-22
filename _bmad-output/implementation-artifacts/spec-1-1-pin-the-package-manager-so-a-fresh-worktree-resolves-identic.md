---
title: 'Story 1.1: Pin the package manager so a fresh worktree resolves identically'
type: 'chore'
created: '2026-09-22'
status: 'done'
baseline_revision: '5d10559970efded0ef52f5299d086ff3e77d650d'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Nothing in the verify gate re-checks the packageManager pin or the absence of workspace
      declarations, so both invariants are true at this commit and unenforced afterwards.
    evidence: |-
      All four commands in .bmad-loop/policy.toml [verify].commands were read and traced.
      `npm ci` runs under the ambient npm and never consults `packageManager` (confirmed
      empirically: a scratch package pinned to npm@99.99.99-does-not-exist still installed
      cleanly under npm 11.17.0). `npm run check` is `tsc --noEmit` with
      include: ["src/**/*"], so package.json is never read as a program. The two shell
      guards filter on `*.ts *.js *.mjs *.cjs` paths and on `.agents/skills` status
      respectively, so neither sees package.json, a reintroduced pnpm-workspace.yaml, or a
      competing lockfile. `engines.npm` is also unset, so a non-corepack host with a
      different npm diverges silently.
      Smallest fix: append one `sh -c` guard to [verify].commands asserting that
      package.json's `packageManager` matches `npm --version`, that no `workspaces` key
      exists, and that no competing workspace/lock file is tracked - following the
      `&& exit 1 || exit 0` idiom the two existing guards already use.
      Not done here: it adds a new standing gate command (new surface, guarding a
      reintroduction never demonstrated) to a file the orchestrator reads live during this
      run, and Story 1.2 is the story that owns appending to [verify].commands. Note that
      .bmad-loop/policy.toml IS tracked and reachable from a story worktree.
    location: >-
      .bmad-loop/policy.toml [verify].commands
    severity: medium
  - summary: >-
      .env.schema and .env.example still instruct the reader to run `pnpm db:up` from a
      "monorepo root", against a hardcoded default connection string.
    evidence: |-
      .env.schema:196 and .env.example:168 both read: run `pnpm db:up` from this package
      (`pnpm --dir mastracode/web db:up` from the monorepo root), with
      postgres://user:pass@localhost:54329/mastracode_web inline. Three contradictions with
      AD-1 and the single-package posture: the pnpm invocation, the monorepo assertion, and
      template-default credentials.
      This story degrades the inconsistency rather than merely inheriting it. The deleted
      pnpm-workspace.yaml existed to suppress ERR_PNPM_IGNORED_BUILDS on pnpm v10+, so a
      reader following that prose now hits the failure the deleted file suppressed; and in a
      corepack-shimmed environment - the environment the new `packageManager` field exists to
      serve - a `pnpm` invocation hard-errors on a package-manager mismatch.
      Smallest fix: change both comments to `npm run db:up` and drop the monorepo path.
      Routed to Story 1.3, which already edits both files (non-default credentials, env
      schema update) and is the next story in this epic.
    location: >-
      .env.schema:196 and .env.example:168
    severity: medium
  - summary: >-
      Node is unpinned and AGENTS.md's stated Node version does not match the machine's.
    evidence: |-
      engines.node is ">=22.19.0" with an open upper bound; there is no .nvmrc and no
      engines.npm; the authoring machine runs Node v24.19.0 while AGENTS.md states
      "TypeScript on Node 22". Pinning npm alone does not fully deliver "a fresh worktree
      resolves identically" - the Node major is still free to move.
      Deferred rather than fixed: an .nvmrc would add a root-level file, which AD-3 forbids
      (root is a closed set), and correcting the version statement edits AGENTS.md, an
      agent-context file. Needs a decision on whether to narrow engines.node or accept
      Node 22+ as the real contract, then one edit in whichever artifact wins.
    location: >-
      package.json engines / AGENTS.md
    severity: low
  - summary: >-
      `npm run build` writes 24 untracked files into src/mastra/public/factory/ that no
      .gitignore rule covers, so any build leaves the working tree dirty.
    evidence: |-
      Discovered while verifying this story: `mastra build --dir src/mastra` logs "Copying
      Factory UI..." and materialises src/mastra/public/factory/ (index.html, assets/,
      favicons, pwa icons, routes-manifest.json). The directory does not exist at baseline
      5d10559, is not in .gitignore, and was removed by hand here so the story's diff stayed
      clean. A story agent that runs `npm run build` and then commits would commit the
      bundled UI; one that does not clean up trips the orchestrator's clean-tree check at
      finalization.
      Smallest fix: add `src/mastra/public/factory/` to .gitignore. It must be that exact
      path, not `src/mastra/public/`, because AGENTS.md documents
      src/mastra/public/factory-skills/<skill-name>/SKILL.md as a real first-party override
      location that has to stay committable.
    location: >-
      .gitignore / src/mastra/public/factory/
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `package.json` names no package manager, so a corepack-aware environment has nothing to pin
npm to, and the template's stray `pnpm-workspace.yaml` still sits at root where a tool can read this single
package as a pnpm workspace. AD-1 fixes the package manager as npm and calls that file non-normative residue.

**Approach:** Declare `packageManager` in `package.json` naming the npm version this machine resolved the
committed lockfile with, and delete `pnpm-workspace.yaml`. Nothing else at root changes — no script names,
no dependency ranges, no lockfile re-resolution.

## Boundaries & Constraints

**Always:**
- Exactly one `package.json` and one `package-lock.json`, both at root (AD-1 / NFR3).
- `packageManager` names npm and the exact version in use on this machine: `npm@11.17.0` (verified with
  `npm --version`). A bare `npm@<version>` string — no corepack integrity hash.
- The `start`, `check`, `build`, `dev`, `db:up`, `db:down` and `deploy` scripts keep their current names and
  command strings verbatim (AD-11 / NFR10 — supervision artifacts in Epic 4 invoke them by name).
- `package-lock.json` stays byte-identical: this change must not re-resolve dependencies (no-backups posture).

**Never:**
- Never add a `workspaces` field, a second `package.json`, or any other lockfile.
- Never switch the package manager, bump a dependency range, or run a command that rewrites the lockfile
  (`npm install`, `npm update`, `npm dedupe`). Install only via `npm ci`.
- Never add a root-level file or directory beyond the edit above — root is a closed set (AD-3).
- Do not touch `src/`, `docker-compose.yml`, `.env.schema`, `.env.example`, `tsconfig.json`, or `AGENTS.md`;
  they belong to other stories.

</intent-contract>

## Code Map

- `package.json` -- the only file edited. Currently has no `packageManager` key and no `workspaces` key
  (verified). `scripts` block holds `dev`, `db:up`, `db:down`, `check`, `build`, `start`, `deploy`;
  `engines.node` is `>=22.19.0`. Add `packageManager` as a sibling of `engines`.
- `pnpm-workspace.yaml` -- 17-line template residue configuring pnpm build-script approval
  (`minimumReleaseAgeExclude`, `allowBuilds`). Its own header comment states npm ignores it entirely.
  Delete the file. Verified: no first-party file references it. Other tracked files mention `pnpm` in prose
  only — planning and spec documents (`epics.md`, `research.md`, `SPEC.md`, `brownfield.md`,
  `ARCHITECTURE-SPINE.md`) discuss the decision to drop it, and `.env.schema:196` / `.env.example:168` carry
  `pnpm db:up` instructions. None is a workspace declaration; all are out of scope here (see Design Notes).
- `package-lock.json` -- `lockfileVersion: 3`, committed, read-only for this story.
- `_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md`
  -- AD-1 is the governing rule (read-only): one npm package, no workspaces, `pnpm-workspace.yaml` is
  non-normative residue.
- `.bmad-loop/policy.toml` -- `[verify].commands` already starts with `npm ci --no-audit --no-fund`.
  This file is **tracked and present in every story worktree** — `.gitignore` ignores `.bmad-loop/runs/` and
  `.bmad-loop/cache/` only, and carries an explicit comment that `policy.toml` is deliberately tracked so
  Story 1.2 can extend `[verify].commands` from a worktree. Read-only for this story: no verify-command
  change is needed here, because the existing gate already exercises the install path this story touches.

## Tasks & Acceptance

**Execution:**
- `package.json` -- add `"packageManager": "npm@11.17.0"` as a top-level key, placed next to `engines`;
  change nothing else in the file -- gives corepack-aware environments a version to select and records the
  npm that resolved the committed lockfile.
- `pnpm-workspace.yaml` -- delete the file with `git rm pnpm-workspace.yaml` -- AD-1 calls it non-normative
  template residue; removing it stops any tool from reading this single package as a pnpm workspace.

**Acceptance Criteria:**
- Given a checkout with no `node_modules/`, when `npm ci --no-audit --no-fund` runs at the repo root, then it
  exits 0 and `git status --porcelain -- package-lock.json` stays empty (the lockfile was not re-resolved).
- Given the change is complete, when the repo is searched for workspace declarations, then
  `pnpm-workspace.yaml` does not exist, no `pnpm-workspace.*`/`yarn`/`bun` workspace or lock file exists
  anywhere in the tree, `package.json` contains no `workspaces` key, and `package-lock.json` is the single
  lockfile at root.
- Given the `start`, `check` and `build` scripts are an external contract, when `package.json` is diffed
  against its previous revision, then the only changed line is the added `packageManager` key — every script
  name and command string is byte-identical.
- Given the typecheck is the repo's only real check, when `npm run check` runs, then it exits 0.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass

- verdicts: 34 findings — high 0, medium 10, low 16, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` blind-hunter: `git diff HEAD -- package.json` is order-dependent and reads empty after commit — real, but the fix edits this build's spec; the substantive check was performed against `baseline_revision` instead and showed exactly one added line, zero modified.
  - `[low]` `[reject]` blind-hunter: `git ls-files | grep -iE ...` exits 1 on the clean outcome, inverting under an exit-code-checking runner — real; fix edits this build's spec. Not in `[verify].commands`, so no gate is affected; run manually with `|| echo` and confirmed no matches.
  - `[low]` `[reject]` blind-hunter: workspace-absence AC says "anywhere in the tree" but `git ls-files` sees tracked files only and misses `.yml`, `.yarnrc.yml`, `lerna.json`, `.pnpmfile.cjs` — real overreach; fix edits this build's spec. Ran the widened tracked scan (`pnpm-workspace.(yaml|yml)`, `pnpm-lock`, `yarn.lock`, `bun.lock(b)`, `.yarnrc`, `lerna.json`, `.pnpmfile`, `rush.json`, `package.json`): the only hit is the root `package.json`.
  - `[low]` `[reject]` blind-hunter: "lockfile was not re-resolved" is tautological because `npm ci` never writes the lockfile — correct; fix edits this build's spec. Ran the stronger check `git diff 5d10559 -- package-lock.json`: empty.
  - `[medium]` `[defer]` blind-hunter: nothing in the change or the gate exercises the pin; corepack is never enabled or asserted, so the field can drift to a nonexistent version with zero signal — verified real (see deferred item 1).
  - `[low]` `[defer]` blind-hunter: Node left unpinned (`engines.node >=22.19.0`, open upper bound; machine runs v24.19.0) while `AGENTS.md` says "Node 22" — verified real; deferred because the fix either adds a root file (forbidden by AD-3) or edits an agent-context file (see deferred item 3).
  - `[medium]` `[defer]` blind-hunter: deleting `pnpm-workspace.yaml` degrades the surviving `pnpm db:up` prose from inconsistent to actively misleading — verified real (see deferred item 2).
  - `[low]` `[reject]` blind-hunter: Design Notes routed the `pnpm db:up` fix to Epic 5 when Story 1.3 already edits both env files — verified correct (`epics.md` Story 1.3 updates `.env.schema` and `.env.example`); fix edits this build's spec, and the Design Note was corrected in place.
  - `[low]` `[reject]` blind-hunter: knowingly-deferred items sat in prose while frontmatter `deferred` stayed empty — true when filed; this pass writes all four items into frontmatter `deferred`, which is where the sweep reads them.
  - `[low]` `[defer]` blind-hunter: the env residue is broader than the Code Map admitted — the same comments assert a monorepo path and a hardcoded connection string, not just `pnpm` — verified; grouped with the env-prose entry (deferred item 2).
  - `[low]` `[reject]` blind-hunter: Code Map said "16-line" residue; the hunk header is `@@ -1,17 +0,0 @@` — verified, the file was 17 lines. Fix edits this build's spec; corrected in place.
  - `[low]` `[reject]` blind-hunter: no smoke test behind the "external contract" claim — closed by evidence rather than code: `npm run build` was executed and exited 0 ("Build successful"). `npm run start` needs varlock plus a live Postgres and is out of reach here.
  - `[false]` `[reject]` blind-hunter (note): empty Spec Change Log / Review Triage Log while `status: in-review` — that is the expected mid-flight state; the log is written by this pass, which is the first review.
  - `[false]` `[reject]` edge-case: corepack shim plus unreachable registry makes `npm ci` fail before install — does not occur at the cited location: `which npm` resolves to the real nvm binary (`.../lib/node_modules/npm/bin/npm-cli.js`), corepack is installed but not shimmed for npm, and selecting the pinned npm is precisely what the story's first AC asks a corepack-aware environment to do.
  - `[low]` `[defer]` edge-case: `engines.npm` unset, so a non-corepack host with a different npm diverges silently — real; same root cause as the unenforced-pin entry (deferred item 1).
  - `[false]` `[reject]` edge-case: npm 11 `allow-scripts` withholds install scripts, leaving unbuilt native deps — refuted two ways: `npm ci` from an empty tree produced `node_modules/esbuild/bin/esbuild` and `@esbuild/darwin-arm64`, and `npm run build` completed successfully. The deleted file was pnpm-only config npm never read, so the deletion cannot change npm's script behaviour; the warning is pre-existing and identical before and after.
  - `[low]` `[reject]` edge-case: `git ls-files | grep` exit-code inversion — same claim as the blind-hunter row above; same disposition.
  - `[medium]` `[defer]` edge-case: the deletion removed pnpm build approvals while two `pnpm` prose instructions remain — grouped with the env-prose entry (deferred item 2).
  - `[false]` `[reject]` edge-case: `brownfield.md:15` is now an orphaned reference to a deleted file — refuted: that file's "What exists" block is a dated snapshot of the repo **as found** during brownfield analysis, not a live map. It accurately records that `pnpm-workspace.yaml` was present then; every story invalidates part of it by design.
  - `[medium]` `[reject]` edge-case: Code Map claimed `.bmad-loop/policy.toml` is "gitignored, exists only in the main checkout" — **verified false and load-bearing**: `git ls-files --error-unmatch` succeeds, `git check-ignore` exits 1, the file is present in this worktree, and `.gitignore` carries a comment saying it is deliberately tracked so Story 1.2 can extend `[verify].commands`. The fix edits this build's spec, so it is rejected as a route; the false claim was corrected in place rather than committed.
  - `[low]` `[reject]` edge-case: the AC's "no lock file anywhere in the tree" is unsatisfiable because `node_modules/combined-stream/yarn.lock` exists after install — correct; same claim as the tracked-scope row above, same disposition.
  - `[false]` `[reject]` edge-case: root `skills-lock.json` violates "single lockfile at root" — refuted: NFR3 names `package.json` + `package-lock.json` specifically, and `skills-lock.json` is the Mastra CLI's skills hash manifest, not a package-manager lockfile. The gate's fourth guard depends on it.
  - `[low]` `[reject]` edge-case: Code Map's survey of `pnpm` mentions understated their number — verified (planning and spec documents also mention pnpm). Fix edits this build's spec; the Code Map line was corrected in place.
  - `[medium]` `[defer]` verification-gap: the `packageManager` pin is exercised by no gate command, so a typo'd or drifted version ships green — filed pre-verified as `patch`; re-routed to defer because the smallest fix adds a new standing gate command (new surface, guarding a reintroduction never demonstrated) to `[verify].commands`, which the orchestrator is reading live during this run, and which Story 1.2 owns (deferred item 1).
  - `[medium]` `[defer]` verification-gap: "no workspace declaration anywhere" becomes established state with nothing re-checking it — filed pre-verified as `patch`; same root cause and same re-route as the row above (deferred item 1).
  - `[medium]` `[reject]` verification-gap (other): the `policy.toml`-is-gitignored claim is false — same claim as the edge-case row above; same disposition and same in-place correction.
  - `[medium]` `[defer]` verification-gap (other): under a corepack shim the surviving `pnpm db:up` prose now hard-errors on a package-manager mismatch — grouped with the env-prose entry (deferred item 2).
  - `[medium]` `[defer]` intent-alignment: the intent's expectation lives at the toolchain surface ("a corepack-aware environment selects that npm version") while every check lives at the file-content surface — accurate and the same root cause as the unenforced-pin entry (deferred item 1).
  - `[low]` `[reject]` intent-alignment: the `npm ci` AC was already satisfiable at baseline, so the change's own contribution is verified only as field presence — accurate but not a defect: install determinism comes from the committed lockfile, and the AC is a regression guard over it. The story's asked-for contribution *is* the declaration.
  - `[false]` `[reject]` intent-alignment: `npm@11.17.0` is the authoring machine's npm, not provably the npm that wrote the lockfile — refuted as a defect: the AC says "the npm version **in use**", which selects the authoring machine's npm, and `lockfileVersion: 3` is written by npm 7 through 11, making the alternative reading undecidable by construction.
  - `[medium]` `[defer]` intent-alignment: on a "no tool mistakes this for a pnpm workspace" reading that includes prose, the env-file instructions still violate it — grouped with the env-prose entry (deferred item 2).
  - `[false]` `[reject]` intent-alignment: the `skills-lock.json` exemption is unstated — the reviewer itself concludes this is not a defect; refuted on the same NFR3 wording as the edge-case row.
  - `[low]` `[reject]` intent-alignment: "unchanged in name **and behaviour**" is checked textually, and only `check` is executed — closed by evidence: `npm run build` was run and exited 0. `npm run start` requires varlock plus a live Postgres, which Story 1.4 brings up.
  - `[false]` `[reject]` intent-alignment (note): the diff ends at `in-review` with no `## Auto Run Result` — expected; the diff was staged mid-flight and finalization happens in this step.

## Design Notes

`packageManager` is written bare (`npm@11.17.0`) rather than with a corepack integrity hash. The hash is
optional, and this repo's npm is not installed through corepack — on this machine `npm` resolves to the real
nvm-installed binary, so the field is documentation plus a corepack hint, not an active shim. A hash would
add a value nothing here verifies and that must be re-derived on every npm bump.

`.env.schema:196` and `.env.example:168` instruct the reader to run `pnpm db:up` — and, in the same comment,
`pnpm --dir mastracode/web db:up` "from the monorepo root" against a hardcoded default connection string.
That contradicts AD-1 on two counts (package manager, and the no-monorepo posture). It is prose, not a
workspace declaration, so it is outside this story's acceptance criteria; **Story 1.3 already edits both
files** and is where the correction belongs. Recorded in frontmatter `deferred` rather than fixed here, so
the inconsistency is on the ledger instead of silently widening this change.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exits 0 in a tree with no `node_modules/`
- `git status --porcelain -- package-lock.json` -- expected: no output (lockfile untouched by the install)
- `npm run check` -- expected: exits 0
- `test ! -e pnpm-workspace.yaml && echo gone` -- expected: prints `gone`
- `git ls-files | grep -iE 'pnpm-workspace|yarn\.lock|pnpm-lock|bun\.lock'` -- expected: no output
- `node -e "const p=require('./package.json'); if(p.workspaces) process.exit(1); console.log(p.packageManager)"`
  -- expected: prints `npm@11.17.0`, exits 0
- `git diff HEAD -- package.json` -- expected: exactly one added line, the `packageManager` key

## Auto Run Result

Status: done

### Summary

`package.json` now declares `"packageManager": "npm@11.17.0"` — the npm actually in use on this machine,
verified with `npm --version` — and the template's `pnpm-workspace.yaml` is deleted. Dependency resolution is
unchanged: `package-lock.json` is byte-identical to baseline `5d10559`, and every npm script keeps its name
and command string verbatim.

### Files changed

- `package.json` — one added line: `"packageManager": "npm@11.17.0"`, placed immediately before `engines`.
  Inserting before rather than after `engines` keeps the diff a single pure insertion with zero modified
  lines (appending would have forced a comma onto the preceding `}`).
- `pnpm-workspace.yaml` — deleted (17 lines of pnpm-only build-approval config that npm never read).
- `_bmad-output/implementation-artifacts/spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
  — this spec.
- `_bmad-output/implementation-artifacts/epic-1-context.md` — compiled epic context (planning cache).

### Review findings

Four layers ran (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) and reported 34
findings: 0 high, 10 medium, 16 low, 8 false, 0 maybe-false. Full per-finding triage is in the Review
Triage Log above.

- **Patches applied: 0.** No finding met the patch bar — none was both caused by this change and fixable
  without adding new surface.
- **Deferred: 4 items** (frontmatter `deferred`) — the verify gate never re-checks the pin or the
  no-workspace invariant (medium, routed to Story 1.2, which owns `[verify].commands`); the `pnpm db:up` /
  monorepo / hardcoded-credential prose in `.env.schema:196` and `.env.example:168` (medium, routed to
  Story 1.3, which already edits both files); Node left unpinned with `AGENTS.md` claiming Node 22 against
  an actual v24.19.0 (low); and `npm run build` writing 24 untracked files into `src/mastra/public/factory/`
  that no `.gitignore` rule covers (medium, discovered during verification here).
- **Rejected findings and their reasons:** eleven were real but their only fix was to edit this build's own
  spec — the `git diff HEAD` and `git ls-files | grep` command shapes, the AC's "anywhere in the tree"
  overreach, the tautological lockfile check, the "16-line" miscount, the understated `pnpm`-mention survey,
  the Epic 5 vs Story 1.3 misrouting, and the empty `deferred` array. Two of those were verified-false
  factual claims rather than wording nits, so the text was corrected in place before commit rather than
  committed wrong: the Code Map had asserted `.bmad-loop/policy.toml` is "gitignored, exists only in the
  main checkout" (it is tracked, present in this worktree, and `.gitignore` explicitly says so — a false
  premise that would have told Story 1.2 it cannot reach `[verify].commands`), and it had understated which
  tracked files mention `pnpm`. Eight findings were refuted outright: corepack is installed but not shimmed
  for npm, so no `npm ci` failure mode exists here and pinned-version selection is the AC's stated goal;
  the `allow-scripts` concern was disproved by a from-empty `npm ci` producing `esbuild`'s binary and by a
  successful `npm run build`; `skills-lock.json` is a skills hash manifest, not a package-manager lockfile,
  and NFR3 names `package-lock.json` specifically; `brownfield.md` is a dated as-found snapshot, not a live
  map, so it is not orphaned by this deletion; the version-provenance objection is undecidable by
  construction because `lockfileVersion: 3` spans npm 7–11 while the AC says "the npm version in use"; and
  two were mid-flight-state observations about a diff staged before finalization. Two low findings about
  unexercised commands were closed by running the commands rather than by editing anything.

### Follow-up review recommendation

`false`. Zero entries were triaged `patch`, so neither the high-patch nor the two-medium-patch condition is
met, and no specific unverified risk remains that another review pass would settle — the open items are
deferred work with named owners, not uncertainty about this diff.

### Verification performed

- `npm ci --no-audit --no-fund` after `rm -rf node_modules` — exit 0.
- `git diff 5d10559 -- package-lock.json` — empty; the lockfile was not re-resolved.
- `npm run check` (`tsc --noEmit`) — exit 0.
- `npm run build` (`mastra build --dir src/mastra`) — "Build successful". Run beyond the spec's command list
  to put evidence behind the "scripts unchanged in behaviour" criterion. Its `src/mastra/public/factory/` and
  `.mastra/` output were removed afterwards so the tree matches the intended change.
- `test ! -e pnpm-workspace.yaml` — file gone.
- Widened tracked scan for `pnpm-workspace.(yaml|yml)`, `pnpm-lock`, `yarn.lock`, `bun.lock(b)`, `.yarnrc`,
  `lerna.json`, `.pnpmfile`, `rush.json` and every `package.json` — the only hit is the root `package.json`.
- `node -e "... p.workspaces ... p.packageManager"` — no `workspaces` key; prints `npm@11.17.0`.
- `git diff --cached 5d10559 -- package.json` — exactly one added line, zero modified.

### Residual risks

- The pin is declarative. On this machine `npm` is the real nvm binary, not a corepack shim, so the field
  changes nothing today and is unexercised by any gate; its value can drift out of date with no signal until
  someone runs in a corepack-enabled environment. Deferred item 1 is the fix.
- `npm run start` was not executed — it needs varlock and a live Postgres, which Story 1.4 brings up. Its
  script string is byte-identical to baseline, so only a corepack-shimmed host resolving a different npm
  could change its behaviour.
- The story's title promises identical resolution, but determinism comes from the committed lockfile, which
  already existed. Pinning npm narrows one remaining variable; Node's major version is still unpinned
  (deferred item 3).
