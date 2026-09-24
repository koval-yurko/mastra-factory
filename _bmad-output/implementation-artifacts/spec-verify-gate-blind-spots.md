---
title: 'Close four verify-gate blind spots (DW-1, DW-18, DW-23, DW-63)'
type: 'chore'
created: '2026-09-24'
status: 'done'
baseline_revision: '501cea0134a27fee9db4aabc133e41655fca94f8'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      The sensitivity census in guards 4 and 44 runs one direction only: nothing asserts that a
      key which must stay masked still is, so adding a `# @public` line above POSTGRES_PASSWORD —
      or flipping the file header to @defaultSensitive=false — unmasks secrets with all 48 gate
      commands green.
    evidence: |-
      Measured in this worktree by two independent reviewers: inserting `# @public` above
      POSTGRES_PASSWORD at .env.schema:340 makes `varlock load --format json-full` report
      isSensitive:false for it, and guards 4 and 42-47 all exit 0. The same holds for a
      one-character edit to the header. .env.schema carries roughly 50 `# @public` annotations
      and the two positive lists cover 5 of them. Pre-existing: guard 4 has had this shape since
      Story 1.3, and the bundle intent scoped DW-18 to the two POSTGRES keys only.
      Smallest fix: append a guard pinning at least one known-sensitive key
      (POSTGRES_PASSWORD) to isSensitive === true, which also pins the header.
    location: >-
      .bmad-loop/policy.toml [verify].commands (guards 4 and 44) / .env.schema
    severity: medium
  - summary: >-
      Nothing reconciles the three tracked copies of the sandbox working directory — the
      Dockerfile's WORKDIR, MASTRACODE_SANDBOX_WORKDIR's default in .env.schema, and
      DEFAULT_SANDBOX_WORKDIR in src/mastra/config/sandbox.ts — even though guard 46's own
      message says sandbox/README.md ties them together "by sight".
    evidence: |-
      Guard 46 pins the Dockerfile's WORKDIR to /workspace and nothing else. The other two sites
      are machine-readable and unchecked: .env.schema:499 (`MASTRACODE_SANDBOX_WORKDIR=/workspace`)
      and src/mastra/config/sandbox.ts:90 (`const DEFAULT_SANDBOX_WORKDIR = '/workspace'`).
      Changing one alone leaves all 48 commands green and the container mounting a path the
      server does not use. Not caused by this change; guard 46 already holds the Dockerfile
      value in a variable, so the comparison is a few bytes.
    location: >-
      .bmad-loop/policy.toml [verify].commands (guard 46) / .env.schema:499 /
      src/mastra/config/sandbox.ts:90
    severity: medium
  - summary: >-
      The one thing the sandbox image exists for — carrying `git` and `gh` — is asserted by no
      gate command, so the whole GitHub CLI install block can be deleted with all 48 green.
    evidence: |-
      Measured: deleting the `gh` apt block from sandbox/factory-sandbox.Dockerfile leaves guards
      45 and 46 at rc=0. DW-23's source story is spec-2-1 "operator: a sandbox image that carries
      git and gh"; this bundle closed the three shape invariants DW-23 named (no COPY/ADD, one
      WORKDIR /workspace, a pinned FROM) and not the package list. Smallest fix: a grep guard over
      the Dockerfile asserting `git` and `gh` are installed.
    location: >-
      .bmad-loop/policy.toml [verify].commands / sandbox/factory-sandbox.Dockerfile
    severity: medium
  - summary: >-
      The no-`latest` rule is enforced on the documented build command and the Dockerfile's base
      image, but not on the tag actually run: FACTORY_SANDBOX_IMAGE can be set to
      `factory-sandbox:latest` and every gate command stays green.
    evidence: |-
      FACTORY_SANDBOX_IMAGE is declared at .env.schema:483 as `# @public` with no @type/matches
      constraint, so `varlock load` accepts any value. Guard 37's key census names it as a key to
      reconcile, never as a value. Guard 47 reads sandbox/README.md's build and run commands;
      guard 46 reads the Dockerfile's FROM, which is a different tag from the one NFR19 fixes.
      Smallest fix: a `@type=string(matches=...)` constraint on the declaration, or a guard over
      its default. Pre-existing — the key has been unconstrained since Story 2.2.
    location: .env.schema:483 (FACTORY_SANDBOX_IMAGE)
    severity: medium
  - summary: >-
      DW-63's chain has two links and guard 48 covers one: ops/factory-start.sh:130 is
      `exec npm run start`, and rewriting it to `exec mastra start` bypasses varlock entirely with
      all 48 commands green.
    evidence: |-
      Guard 48 asserts package.json's `start` script contains `varlock run --`. The production
      path per AD-11/NFR10 is LaunchAgent -> ops/factory-start.sh -> `exec npm run start`
      (ops/factory-start.sh:130). No command in the gate reads that `exec` line, though six
      commands otherwise open that file. DW-63's ledger text scopes the fix to package.json:15,
      which is what was implemented. Smallest fix: one grep guard over ops/factory-start.sh
      asserting the wrapper still execs `npm run start`.
    location: ops/factory-start.sh:130
    severity: medium
  - summary: >-
      The other half of DW-1's diagnosis is still open: `engines.npm` is unset, so a host without
      corepack silently runs a different npm than package-lock.json was produced by, and guard 43
      only proves the pin agrees with whatever npm the gate host happens to run.
    evidence: |-
      package.json `engines` declares `node` only. Guard 43 asserts
      packageManager === "npm@" + $(npm --version), a property of the gate host rather than of the
      install, so pin and host moving together away from the npm that generated the lockfile stays
      green. The bundle intent scoped this change to .bmad-loop/policy.toml, and DW-1 named
      engines.npm as diagnosis rather than as part of its smallest fix, so it was deliberately not
      touched. Smallest fix: add `"npm": ">=11.17.0"` to engines in a change that owns package.json.
    location: package.json engines
    severity: low
---

<intent-contract>

## Intent

**Problem:** Four invariants the repo depends on are enforced by nothing: the `packageManager` pin and the single-package shape of `package.json` (DW-1); the two `# @public` annotations on `POSTGRES_USER` / `POSTGRES_DB` in `.env.schema` (DW-18); the Dockerfile's no-`COPY`, `WORKDIR /workspace` and no-`latest` rules (DW-23); and the `varlock run --` prefix on `package.json`'s `start` script, the single path on which `.env.schema` is applied at all (DW-63). Each was re-verified against the current 42-command gate and each can be broken with all 42 commands exiting 0.

**Approach:** Append six `sh -c` guards to `.bmad-loop/policy.toml` `[verify].commands`, in the `&& exit 1 || exit 0` / `|| { echo "…"; exit 1; }` idiom the existing guards use, plus a matching comment block above the array in the established numbered style. No file other than `.bmad-loop/policy.toml` changes.

## Boundaries & Constraints

**Always:**
- `[verify].commands` is **append-only**: every existing entry keeps its exact bytes and its exact index. The six new entries go at the END of the array, after the current index 41 (`npm run build`, "guard 42" in the comments), so no existing comment's guard number goes stale.
- Each new guard must be verified **both ways** in this worktree — passing on the clean tree and failing, naming the offender, on a deliberate break — before it is committed. Revert every deliberate break; the tree must be clean apart from `policy.toml`.
- Guards are `/bin/sh` strings run with `shell=True` from the worktree root. A guard must never contain a literal `'` inside its `sh -c '…'` body — use `q=$(printf "\47")` / `dq=$(printf "\42")`, as existing guards do.
- Every guard fails **as itself**: a missing or unparseable subject file produces that guard's own message, never an uncaught stack trace or a vacuous pass.
- Extend the comment block above `commands = [` describing the six new guards and the both-ways verification, matching the surrounding prose style.

**Never:**
- Do not edit, reorder, re-point or delete any existing command, and do not renumber any guard in the comments.
- Do not change `package.json`, `.env.schema`, `sandbox/factory-sandbox.Dockerfile`, `sandbox/README.md` or any other repo file to make a guard pass — they are the subjects, and all four are correct today.
- Do not add `engines.npm`, widen an existing guard's pathspec, or touch the deferred-work ledger.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean tree | Repo as committed | All 48 commands exit 0 | No error expected |
| `packageManager` dropped or bumped away from the running npm | `package.json` | Guard 43 exits 1, printing the pin found and the npm running the gate | — |
| `"workspaces": ["packages/*"]` added | `package.json` | Guard 43 exits 1 naming the key | — |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `yarn.lock` tracked anywhere | index | Guard 43 exits 1 naming the path | — |
| `# @public` removed from `POSTGRES_USER` or `POSTGRES_DB` | `.env.schema` | Guard 44 exits 1 naming the key | — |
| `COPY . /workspace` or `ADD` added | Dockerfile | Guard 45 exits 1 printing the line | — |
| `WORKDIR` moved off `/workspace`, duplicated, or removed; `FROM` retagged `:latest` or left untagged | Dockerfile | Guard 46 exits 1 printing what it found | — |
| `factory-sandbox:latest`, or `-t factory-sandbox` untagged, written into the build/run commands | `sandbox/README.md` | Guard 47 exits 1 printing the line | — |
| `"start"` loses its `varlock run --` prefix | `package.json` | Guard 48 exits 1 printing the script found | — |
| Subject file missing, empty, or unparseable JSON | any of the above | That guard exits 1 with its own "missing/unreadable" message | Never an uncaught exception |

</intent-contract>

## Code Map

- `.bmad-loop/policy.toml` -- **the only file this story changes.** `[verify]` starts at line 28; the comment block runs to line 1226; `commands = [` is line 1227 and `]` is line 1270, one command per line, 42 entries at 0-based indices 0-41 (comments number them 1-based, so index 41 = "guard 42" = `npm run build`). Append after line 1269.
- `.bmad-loop/policy.toml:1231` (index 3) -- the `json-full` sensitivity guard to **mirror** for DW-18: pipes `npx varlock load --format json-full` into `node -e`, iterates `["MASTRA_HOST","PORT","DOCKER_HOST"]`, fails when `!c[k] || c[k].isSensitive!==false`. Copy its shape; do not edit it.
- `.bmad-loop/policy.toml:1246` and `:1250` (guards 19 and 23) -- the twelve-artifact index and working-tree guards. They already name `sandbox/factory-sandbox.Dockerfile`, but only assert tracked / non-empty / regular-file, which is exactly DW-23's gap.
- `.bmad-loop/policy.toml:1248` (guard 20) -- the AD-3 root closed-set guard. Relevant to DW-1: a **root** `pnpm-lock.yaml` already fails it, so guard 43's file check earns its keep on nested paths and on the two in-`package.json` keys.
- `.bmad-loop/policy.toml:1238,1248` -- idiom references: `sed -n "s/^readonly X=//p"`, `case … in … esac`, collecting offenders and failing outside a pipeline.
- `package.json:15` -- `"start": "varlock run -- mastra start"` (DW-63 subject). `:40` -- `"packageManager": "npm@11.17.0"`; no `workspaces` key; `engines` has `node` only. Running npm on this host is 11.17.0 — measured.
- `.env.schema:338-342` -- `# @public` / `POSTGRES_USER=` / `POSTGRES_PASSWORD=` / `# @public` / `POSTGRES_DB=`. Header sets `@defaultSensitive=true`. Measured: `npx varlock load --format json-full` emits `POSTGRES_USER {"isSensitive":false}` and `POSTGRES_DB {"isSensitive":false}` with no `.env` present, so the mirror of guard 4 works unchanged.
- `sandbox/factory-sandbox.Dockerfile` -- 19 lines; one `FROM node:22-bookworm-slim`, one `WORKDIR /workspace`, no `COPY`/`ADD`.
- `sandbox/README.md:82-83,252-253,268-269,303-307,316-318,340` -- every `factory-sandbox:` reference. Measured: `$TAG`, `2026-09-23`, `2026-09-23b`, `<YYYY-MM-DD>`, `YYYY-MM-DD` — and the word "latest" appears in prose at :83 ("Never `latest`"), so a bare `grep latest` would be a false failure. The tested pattern `factory-sandbox:latest|-t[[:space:]]+"?factory-sandbox"?([[:space:]]|$)` returns rc=1 on the file today.
- `_bmad-output/implementation-artifacts/spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md:225-243` -- the acceptance criteria DW-23 says are hand-checked once: no `COPY`/`ADD`, `WORKDIR /workspace`, date-stamped tag never `latest`.

## Tasks & Acceptance

**Execution:**
- `.bmad-loop/policy.toml` -- append six entries to `[verify].commands` after index 41, each a `'''sh -c '…' '''` TOML literal on one line -- closes DW-1, DW-18, DW-23, DW-63.
  - **43 (DW-1)** — `package.json` parsed with `node -e` inside a `try/catch` that reports `package.json unreadable or not valid JSON: <message>`: (a) `packageManager` is exactly `npm@` + the output of `npm --version`, message naming both the pin found and the npm running the gate and saying the fix is to move them together; (b) no `workspaces` key at all; then in shell, (c) `git -c core.quotePath=false ls-files` lists no `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `bun.lock`, `lerna.json` or `turbo.json` at any depth, naming the offender.
  - **44 (DW-18)** — guard 4's pipeline with the key list `["POSTGRES_USER","POSTGRES_DB"]` and a message that says the key lost its `# @public` line and is therefore masked in the stdout of `varlock run -- mastra start`.
  - **45 (DW-23)** — `sandbox/factory-sandbox.Dockerfile` is non-empty, and `grep -nEi "^[[:space:]]*(COPY|ADD)[[:space:]]"` finds nothing; the message prints the line and says the repository is cloned into the container, never baked in.
  - **46 (DW-23)** — same file: exactly one `WORKDIR` instruction whose argument is `/workspace`, and exactly one `FROM` whose image reference carries an explicit tag or `@sha256:` digest that is not `latest`. Messages print the value found. Assert the tag *shape*, not the literal `node:22-bookworm-slim`, so a deliberate base bump is not a gate failure.
  - **47 (DW-23)** — `sandbox/README.md` is non-empty and contains neither `factory-sandbox:latest` nor a `-t factory-sandbox` with no tag (which docker resolves to `latest`); message quotes NFR19's date-stamped form. Match the tested pattern above, not the bare word.
  - **48 (DW-63)** — `scripts.start` in `package.json` is a string containing `varlock run --`, with the same JSON `try/catch`; message prints the script found and states that without the prefix `.env.schema` is never read at all.
- `.bmad-loop/policy.toml` -- extend the comment block above `commands = [` with a numbered paragraph per new guard (43-48) in the existing voice: what it asserts, what it is the only command here that reads, why the obvious cheaper form was rejected, and the both-ways verification actually run -- the comment block is where this gate records its own reasoning, and every earlier guard has one.

**Acceptance Criteria:**
- Given the tree as committed, when every entry of `[verify].commands` is run in order from the worktree root, then all 48 exit 0.
- Given the array before this change, when it is diffed against the array after, then the first 42 entries are byte-identical and in the same order, and exactly six entries are added at the end.
- Given each of the ten break scenarios in the I/O matrix is applied one at a time, when the gate is run, then the corresponding guard exits non-zero with a message naming the offending key, path, line or value — and the break is reverted, leaving `git status --porcelain` reporting `.bmad-loop/policy.toml` alone.
- Given `sandbox/README.md` as written, when guard 47 runs, then it exits 0 despite the file containing the word `latest` in prose at line 83.
- Given `package.json` is replaced by invalid JSON, when guards 43 and 48 run, then each prints its own "unreadable or not valid JSON" message and exits 1 rather than dying with a node stack trace.
- Given `git diff --stat`, when the change is complete, then `.bmad-loop/policy.toml` is the only path listed.

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 29 findings — high 0, medium 16, low 11, false 2, maybe-false 0
- findings:
  - `[medium]` `[defer]` (blind-hunter) The `@public` census is one-directional — a `# @public` above POSTGRES_PASSWORD unmasks it with all guards green — reproduced by two reviewers independently; pre-existing in guard 4 since Story 1.3 and outside the four DW entries this bundle closes, so deferred with the smallest fix recorded.
  - `[medium]` `[patch]` (blind-hunter) Guard 47 matched only `-t`, not `--tag`, and not the run-side reference — confirmed by inspection and by the reviewer's measurement; pattern widened to `(-t|--tag)`, both quote styles, and an untagged `factory-sandbox` operand of `docker run`/`docker image`, then re-verified both ways by me.
  - `[medium]` `[patch]` (blind-hunter) Guard 43's file census omitted nested `package.json`/`package-lock.json`, `nx.json`, `rush.json`, `pnpm-workspace.yml`, `npm-shrinkwrap.json` — verified: a tracked `packages/foo/package.json` passed; census extended with the four filenames plus a below-root `package.json` rule, re-verified failing on `packages/foo/package.json`, `tools/nx.json` and `tools/pnpm-workspace.yml`.
  - `[low]` `[patch]` (blind-hunter) Guard 45's heading "NOTHING BAKED INTO THE SANDBOX IMAGE" over-claimed — `RUN git clone … /workspace` passes it; heading narrowed to the no-`COPY`/no-`ADD` rule it actually enforces. The grep was deliberately NOT widened: the Dockerfile's own legitimate `curl -fsSL … -o /usr/share/keyrings/…` would trip a RUN-side fetch check.
  - `[medium]` `[patch]` (blind-hunter) Guard 46 accepted an unpinned base expressed as a build argument (`ARG BASE_TAG=latest` + `FROM node:${BASE_TAG}`) — a `$` in the reference is now rejected outright; re-verified failing on that break and still passing on `FROM --platform=$TARGETPLATFORM node:22-bookworm-slim`.
  - `[medium]` `[defer]` (blind-hunter) Nothing binds the three copies of `/workspace` (Dockerfile WORKDIR, `.env.schema:499`, `src/mastra/config/sandbox.ts:90`) — real drift, but a new cross-file reconciliation rather than a smallest fix to what this bundle added; deferred.
  - `[medium]` `[defer]` (blind-hunter) The image's purpose — carrying `git` and `gh` — is unguarded; deleting the `gh` install block leaves 45 and 46 green. Outside DW-23's three named invariants; deferred.
  - `[medium]` `[patch]` (blind-hunter) Guard 43's pin message did not say the failure repeats on every subsequent unattended run until pin and lockfile move together — recovery sentence added to the message.
  - `[low]` `[reject]` (blind-hunter) The spec's "no file other than policy.toml changes" contradicts the spec file being added — the fix is to edit this build's spec, which triage rejects by rule; and for product files `git diff --stat` does list `.bmad-loop/policy.toml` alone.
  - `[low]` `[patch]` (blind-hunter) Two prose slips: "guard 42 … named in five places" is four (lines 1191, 1194, 1195, 1198 — counted) — corrected. The second half, replacing array indices with stable guard ids, is rejected: that is a redesign of the numbering convention, not a direct correction.
  - `[false]` `[reject]` (blind-hunter) "`deferred: []` despite known gaps" — the `deferred` list is populated by the review step, not by the implementer, so its emptiness in the diff is not a defect; six entries are filed above.
  - `[false]` `[reject]` (edge-case-hunter) "Corepack shim makes guard 43's comparison tautological" — under an active corepack shim the npm that runs IS the pinned one, so the property the guard asserts is satisfied rather than bypassed; there is no wrong pin left to miss.
  - `[medium]` `[patch]` (edge-case-hunter) The corepack integrity form `npm@11.17.0+sha512.<hash>` failed a correct pin — reproduced by me (rc=1); a trailing `+<suffix>` is now stripped before comparison, with the value still printed as declared. Re-verified: that pin passes, `npm@10.0.0+sha512.…` still fails.
  - `[medium]` `[patch]` (edge-case-hunter) Nested `packages/foo/package.json` with no lockfile passed — same root cause as the census finding above; fixed and re-verified together.
  - `[low]` `[patch]` (edge-case-hunter) `RUN git clone`/`curl`/`wget` baking the tree passes guard 45 — same root cause as the heading over-claim; resolved by narrowing the claim rather than the pattern, for the false-failure reason recorded above.
  - `[low]` `[reject]` (edge-case-hunter) Exec-form `WORKDIR ["/workspace"]` would fail guard 46 — WORKDIR has no JSON exec form in the Dockerfile reference, so this shape is not a correct Dockerfile; and the fix adds a stripping branch for a form nobody writes.
  - `[low]` `[reject]` (edge-case-hunter) A `WORKDIR`/`FROM` line inside a `RUN` heredoc body would be miscounted — the Dockerfile uses no heredocs, a future one would have to begin a body line with a Dockerfile keyword, and the fix (heredoc-range stripping) is well beyond a direct correction.
  - `[medium]` `[patch]` (edge-case-hunter) `--tag factory-sandbox` and joined `-tfactory-sandbox` undetected — same root cause as the guard 47 pattern finding; `--tag` and both quote styles are covered now. The joined `-tfactory-sandbox` spelling is covered by the widened `[[:space:]]*` form.
  - `[low]` `[reject]` (edge-case-hunter) The spec's single-path claim vs. two paths in `git diff --stat` — duplicate of the rejected spec-scope finding; fix would edit this build's spec.
  - `[medium]` `[patch]` (verification-gap, pre-verified) Guard 47 pinned only the `-t` build flag, missing single-quoted and run-side untagged references — filed disposition `patch`, applied as filed; all three named forms now fail and the committed README still passes, including `docker images factory-sandbox` at :330 and the "Never latest" prose at :83.
  - `[medium]` `[patch]` (verification-gap) Guard 44's `try`/`catch` was dead for the case it was written for and the message misdirected — reproduced by me: with `.env.schema` unparseable the guard blamed POSTGRES_USER. The guard now checks the file exists and is non-empty and that `varlock load` itself exited 0, each naming the schema; the comment paragraph was corrected.
  - `[medium]` `[patch]` (verification-gap) Guard 43 rejected the canonical corepack pin — same root cause as the integrity-suffix finding; fixed and re-verified together.
  - `[medium]` `[defer]` (verification-gap) The inverse sensitivity direction is enforced by nothing — same root cause as the first finding; deferred together.
  - `[low]` `[patch]` (verification-gap) Guard 45's headline overstates its scope — same root cause as the heading finding; heading narrowed.
  - `[medium]` `[defer]` (intent-alignment) The no-`latest` rule is not enforced on the tag actually run: `FACTORY_SANDBOX_IMAGE` is unconstrained in `.env.schema:483`. Real and outside the bundle's file scope, which is `.bmad-loop/policy.toml` only; deferred.
  - `[medium]` `[defer]` (intent-alignment) `ops/factory-start.sh:130` is `exec npm run start` and no command reads it, so the wrapper can bypass varlock — confirmed by me at that line. DW-63's ledger scopes the fix to `package.json:15`, which is what shipped; the second link is deferred.
  - `[low]` `[reject]` (intent-alignment) Nothing parses `policy.toml`, so the guards themselves are unguarded — true and pre-existing for all 42 prior guards; the fix is a test harness over the gate, far more than a direct correction.
  - `[low]` `[reject]` (intent-alignment) The spec's scope claim vs. the spec file in the diff — third duplicate; fix would edit this build's spec.
  - `[low]` `[defer]` (intent-alignment) Guard 43 asserts agreement with the gate host rather than reproducibility, and `engines.npm` — the other half of DW-1's diagnosis — stays unset. Deferred with the smallest fix recorded, since it needs a change that owns `package.json`.

### 2026-09-24 — Review pass (follow-up)
- verdicts: 29 findings — high 0, medium 8, low 17, false 4, maybe-false 0 (3 of them carried from the pass above)
- findings:
  - `[medium]` `[patch]` (blind-hunter) Guard 47's third alternation used `[^:]*` to skip intermediate arguments, and that class cannot cross a `:`, so any `docker run` line carrying a colon before the image operand passed — measured: `docker run --rm -v "$PWD:/workspace" factory-sandbox …` and `docker run --rm -p 8080:8080 factory-sandbox` both MISSED, and the flagless `docker run factory-sandbox …` too. Arguments are now skipped as whole whitespace-delimited words; re-verified failing on all three and still passing on the committed `docker run --rm "factory-sandbox:$TAG"`.
  - `[medium]` `[patch]` (blind-hunter) The prior pass's log claimed joined `-tfactory-sandbox` was covered by a "widened `[[:space:]]*` form"; the shipped guard used `[[:space:]]+` — measured MISSED. The flag arm is now `[[:space:]=]*`, which also closes `--tag=factory-sandbox`; re-verified both ways, and `-t "factory-sandbox:$TAG"` still passes.
  - `[low]` `[patch]` (blind-hunter) Guard 43's census omitted a nested `package-lock.json` with no `package.json` beside it — measured MISSED by both the filename census and the below-root rule. The below-root rule is now `/(package|package-lock)\.json$`; re-verified failing on `packages/foo/package-lock.json` while the repository's own root lockfile still passes.
  - `[false]` `[reject]` (blind-hunter) "The Never clause forbids the largest part of this diff (the ledger edits)" — refuted: `git show --stat 6a74ef3` lists `.bmad-loop/policy.toml` and this spec only. The ledger edits are the orchestrator's uncommitted bookkeeping, which this invocation puts outside the build's ownership. The half of the claim that WAS true — the policy.toml comment asserting `git status --porcelain` ends "naming nothing but this file" — is corrected in place to name product files.
  - `[low]` `[reject]` (blind-hunter) Design Notes still says guard 42 is named in "five places" while policy.toml says four — real drift, but the fix is to edit this build's spec, which triage rejects by rule. The authoritative copy (policy.toml) is correct.
  - `[low]` `[reject]` (blind-hunter) Spec Tasks bullets describe the pre-review, narrower guards — same class; the fix edits this build's spec.
  - `[low]` `[reject]` (blind-hunter) The I/O matrix was not updated after the review patches and its break count is nine, not ten — same class; the fix edits this build's spec.
  - `[low]` `[reject]` (blind-hunter) Acceptance criterion 2 (append-only) has no verification command behind it — same class; the fix edits this build's spec. Checked independently this pass by parsing both revisions with a TOML parser: the first 42 entries are byte-identical.
  - `[low]` `[patch]` (blind-hunter) Guard 44 printed its "@public line dropped" message when the key was absent from the schema entirely, sending the operator to the wrong edit. The `!c[k]` branch is now split out with its own restore-the-declaration message; re-verified by deleting `POSTGRES_USER=` from an otherwise valid schema.
  - `[low]` `[patch]` (blind-hunter) Guard 45 missed `ONBUILD COPY`/`ONBUILD ADD`, which defers the same bake to every derived build — measured MISSED. Pattern now `^[[:space:]]*(ONBUILD[[:space:]]+)?(COPY|ADD)[[:space:]]`; re-verified failing on `ONBUILD COPY . /workspace`.
  - `[false]` `[reject]` (blind-hunter) "Guard 46's comment describes `AS <stage>` stripping that does not exist" — the suffix IS stripped, by the same first-token read the comment describes; the outcome claimed missing does happen. The comment was reworded anyway to name the mechanism rather than imply a dedicated branch.
  - `[low]` `[patch]` (blind-hunter) The failure-latency note argued only the Dockerfile case and omitted the sharper one: guard 43's subject is the install, so a wrong pin is reported only after `npm ci` and `npm run build` have both run under it. Sentence added to the note.
  - `[low]` `[patch]` (edge-case-hunter) `package.json` holding the literal `null` PARSES, so the `try`/`catch` did not fire and `p.packageManager` / `p.scripts` died with a node stack trace — reproduced. Both guards now reject a non-object manifest by name before reading any property; re-verified on `null`.
  - `[medium]` `[patch]` (edge-case-hunter) Joined `-t` and `--tag=` forms undetected — same root cause as the flag-arm finding above; fixed and re-verified together.
  - `[medium]` `[patch]` (edge-case-hunter) Any colon earlier on the `docker run` line defeats the operand arm — same root cause as the first finding; fixed and re-verified together.
  - `[low]` `[reject]` (edge-case-hunter) Guard 44 blames `.env.schema` when `npx varlock` itself is missing — true of the message, but `npm ci` is index 0 of this same gate, so varlock is present whenever guard 44 runs; guard 4 has had the identical shape since Story 1.3. Fix adds a branch for a state the gate cannot reach in order.
  - `[low]` `[patch]` (edge-case-hunter) A directory at a grep subject's path passes `test -s`, and a grep over it reports nothing, so guards 45/46/47 passed vacuously on a subject never opened — reproduced. `test -f` added to all three; re-verified with a directory at the Dockerfile and at `sandbox/README.md`.
  - `[low]` `[patch]` (edge-case-hunter) Nested `package-lock.json` with no manifest beside it — same root cause as the census finding; fixed and re-verified together.
  - `[false]` `[reject]` (edge-case-hunter, filed low-confidence) "The Intent says no file other than policy.toml changes, yet the ledger is rewritten" — duplicate of the scope claim refuted above by `git show --stat 6a74ef3`.
  - `[medium]` `[patch]` (verification-gap, pre-verified) Guard 47's `docker run`/`docker image` arm blind to any line containing a colon — filed disposition `patch`, applied as filed and re-measured by me in this worktree.
  - `[medium]` `[patch]` (verification-gap, pre-verified) Guard 47 does not match `--tag=`, joined `-t`, or `docker tag` — filed disposition `patch`, applied as filed; `docker[[:space:]]+(run|image|tag)` now covers the third, and all three fail in place.
  - `[medium]` `[patch]` (verification-gap, pre-verified) The no-`latest` rule was enforced on `sandbox/README.md`, which BUILDS the image, and not on `README.md:156`, where step 6 tells the operator which tag to run — measured: setting it to `factory-sandbox:latest` left all 48 green. Guard 47 now reads both files; re-verified failing on that exact break, with `docker images factory-sandbox` at `:168` and the `` `factory-sandbox:` tag `` prose at `:326` still passing.
  - `[low]` `[reject]` (verification-gap) Design Notes' superseded "five places" count — duplicate of the prose-drift finding; fix edits this build's spec.
  - `[low]` `[reject]` (verification-gap) Guard 44's non-zero branch would misattribute a missing `varlock` — duplicate of the edge-case finding above; rejected for the same reason, and the layer itself records it as not a regression.
  - `[medium]` `[defer]` (intent-alignment) `carried` — the site-versus-property gap across all six invariants (inverse sensitivity, the three `/workspace` copies, `git`/`gh` unguarded, `FACTORY_SANDBOX_IMAGE`, `ops/factory-start.sh:130`, `engines.npm`). Every row maps one-for-one onto a `deferred` entry filed last pass; verdict and route kept, not re-filed.
  - `[low]` `[reject]` (intent-alignment) `carried` — nine of ten matrix rows are evidenced in prose that no automation re-executes. Same claim as last pass's "nothing parses policy.toml, so the guards themselves are unguarded", rejected then on the same ground: the fix is a test harness over the gate, far beyond a direct correction, and it is pre-existing for all 42 prior guards.
  - `[false]` `[reject]` (intent-alignment) `carried` — the file-scope divergence (spec and ledger in the tree). Refuted above and rejected three times last pass.
  - `[low]` `[reject]` (intent-alignment) Guard 43 fails on any tracked below-root `package.json` with no exception mechanism, and guard 47's operand arm is unmeasured against future `docker image inspect`/`docker save` prose — the first is the assertion the guard exists to make, stated in its own message; the second is speculative about text that does not exist. Checked: `docker image inspect factory-sandbox` DOES match, and correctly so, since it resolves to `:latest`.
  - `[low]` `[reject]` (intent-alignment) Internal drift — the "five places" count and the spec being a mid-loop snapshot under review. Duplicate of the prose-drift finding; fix edits this build's spec. The snapshot half is how a follow-up pass is defined, not a defect.

## Design Notes

Why appended at the very end rather than inserted before `npm run build`: inserting would renumber guard 42, which the comment block names in five places. The cost is that a Dockerfile typo is only reported after the build's second dependency install; correctness of the gate outweighs failure latency in an unattended run.

Why guard 43 compares the pin to `npm --version` rather than merely asserting it is present: a pin nothing checks is decoration — DW-1's evidence is that a scratch package pinned to `npm@99.99.99-does-not-exist` still installed cleanly. The admitted cost is that upgrading the host npm fails the gate on an unrelated story; that is the intended signal, and the message must say so, since the fix (bump the pin and regenerate the lockfile in one commit) is the same review moment guard 25's pinned digest asks for.

Quoting, the part that bites: the TOML `'''…'''` literal does no escape processing, so the bytes reach `/bin/sh` verbatim; `sh -c '…'` then forbids a literal `'` inside. Within a nested `node -e "…"` the shell turns `\"` into `"` before node sees it — the shape guard 21 already uses.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exit 0 (the gate's first command; a fresh worktree has no `node_modules`).
- Run all 48 `[verify].commands` in order from the worktree root -- expected: every one exits 0.
- For each of the ten I/O-matrix break rows: apply the break, run the affected guard, confirm exit 1 and the offender named, `git checkout --` the break -- expected: exit 1 then a clean revert.
- `git status --porcelain` -- expected: `.bmad-loop/policy.toml` is the only modified path once testing is done.

## Auto Run Result

Status: done

**Implemented change.** Six `sh -c` guards appended to `.bmad-loop/policy.toml` `[verify].commands`
at indices 42-47 (guards 43-48 in the file's 1-based comment numbering), taking the gate from 42 to
48 commands, plus the matching numbered comment block above `commands = [`. The four blind spots the
bundle names are now enforced: the `packageManager` pin and single-package shape (DW-1), the two
`# @public` POSTGRES keys resolved through varlock (DW-18), the sandbox Dockerfile's no-`COPY`/`ADD`,
single `WORKDIR /workspace` and pinned `FROM`, plus the date-stamped tag form in the docs (DW-23),
and the `varlock run --` prefix on `package.json`'s `start` script (DW-63). The array is append-only
and stayed that way across both review passes: parsing `HEAD:.bmad-loop/policy.toml` and the working
copy with a TOML parser shows the 42-entry prefix byte-identical and in the same order, six entries
appended, and no existing entry or guard number touched.

**Files changed.**
- `.bmad-loop/policy.toml` -- six commands appended to `[verify].commands`; the comment block above
  the array extended with one numbered paragraph per new guard (what it asserts, what it is the only
  command that reads, which cheaper form was rejected and why, and the both-ways verification run).
- `_bmad-output/implementation-artifacts/spec-verify-gate-blind-spots.md` -- this spec (process
  artifact, not product).

The deferred-work ledger is also modified in this worktree. That is the orchestrator's own
bookkeeping, written around this build and outside its ownership; the story commit `6a74ef3` touches
`.bmad-loop/policy.toml` and this spec only.

**Review findings, follow-up pass: 29 findings across four layers — high 0, medium 8, low 17,
false 4.** Patched: 9 entries — 3 medium, 6 low. All nine land in `.bmad-loop/policy.toml`.
- Guard 47, three medium entries. Its `docker run`/`docker image` arm skipped intermediate arguments
  with `[^:]*`, a class that cannot cross a `:`, so any run line carrying a colon walked through it —
  `docker run --rm -v "$PWD:/workspace" factory-sandbox …` and `-p 8080:8080` both measured green.
  Arguments are now skipped as whole words. Its flag arm required a space, so `-tfactory-sandbox` and
  `--tag=factory-sandbox` passed, and `docker tag <id> factory-sandbox` was not in the verb list;
  the arm is now `(-t|--tag)[[:space:]=]*` and the verb list is `(run|image|tag)`. And it read
  `sandbox/README.md` alone — the file that BUILDS the image — while `README.md:156` is where the
  operator copies the tag the server actually RUNS into `.env`; setting that line to
  `factory-sandbox:latest` left all 48 green, measured. The guard now reads both files.
- Guard 43, two low entries: the below-root census missed a lone nested `package-lock.json`, and a
  `package.json` holding the literal `null` parses, so the `try`/`catch` never fired and
  `p.packageManager` died with a node stack trace — the exact outcome the I/O matrix forbids.
- Guard 48, same non-object fix on `p.scripts`.
- Guard 44: the absent-key and masked-key branches are split, so a deleted declaration no longer
  reports as a dropped `# @public` line.
- Guard 45: `ONBUILD COPY`/`ONBUILD ADD` now counted, since it defers the same bake rather than
  avoiding it.
- Guards 45, 46 and 47: a directory passes `test -s` and a grep over one reports nothing, so all
  three could pass vacuously on a subject never opened; `test -f` added to each.
- Two comment corrections: the failure-latency note now argues the sharper guard-43 case (its subject
  is the install that has already run by the time it fails), and the closing "git status names
  nothing but this file" claim now says "no product file but this one", which is true of the tree.

Deferred: nothing new this pass. The six entries filed last pass (inverse sensitivity census, the
three unreconciled `/workspace` copies, `git`/`gh` unguarded in the image, unconstrained
`FACTORY_SANDBOX_IMAGE`, `ops/factory-start.sh:130`, unset `engines.npm`) were re-raised by the
intent-alignment layer as one grouped entry, carried at `medium`/`defer` without re-filing.

Rejected, with reasons: four findings that the spec's own prose is stale or self-contradictory (the
"five places" count in Design Notes, the Tasks bullets describing the pre-review guards, the
un-updated I/O matrix, and acceptance criterion 2 having no command behind it) — each rejected by
the rule that a finding whose fix is to edit this build's spec does not survive triage; the
authoritative copies in `policy.toml` are correct, and the append-only criterion was checked
independently this pass with a TOML parser. Two claims that this change violates its own file scope
by rewriting the ledger — refuted by `git show --stat 6a74ef3`, which lists `policy.toml` and the
spec only. One claim that guard 46's comment describes `AS <stage>` stripping that does not exist —
refuted, the suffix is stripped by the first-token read the comment describes, though the wording was
made to name the mechanism. Two that guard 44 misattributes a missing `varlock` binary to a broken
schema — true of the message, but `npm ci` is index 0 of this same gate, so the state is unreachable
in order, and guard 4 has had the identical shape since Story 1.3. One that nine of ten matrix rows
are evidenced in prose no automation re-executes — carried from last pass, where it was rejected as
pre-existing for all 42 prior guards with a test harness over the gate as its only fix. One that
guard 43 has no exception mechanism for a below-root `package.json` — that is the assertion the guard
exists to make, and its message says so.

**Verification performed.**
- `node_modules` present from the prior run; the gate parsed out of `policy.toml` with a TOML parser
  yields 48 commands.
- All 48 commands run in order from the worktree root: ALL GREEN, before and after the patches.
- Append-only re-checked mechanically against `HEAD:.bmad-loop/policy.toml`: first 42 entries
  byte-identical, 6 appended, all 6 of the appended ones changed by this pass and none of the 42.
- Failing direction re-measured for every patch, each break reverted immediately: nested
  `packages/foo/package-lock.json` (guard 43 names the path; a root `package-lock.json` still
  passes); `package.json` replaced by `null` (guards 43 and 48 each print their own not-a-JSON-object
  message, no stack trace); `POSTGRES_USER=` deleted from an otherwise valid `.env.schema` (guard 44
  prints its absent-declaration message, not its masked-key one); `ONBUILD COPY . /workspace`
  appended (guard 45 prints the line); a directory at the Dockerfile path (guards 45 and 46 each
  print their own not-a-regular-file message) and at `sandbox/README.md` (guard 47 likewise);
  `README.md:156` set to `factory-sandbox:latest`; the run command rewritten with
  `-v "$PWD:/workspace"`; `-tfactory-sandbox`; `--tag=factory-sandbox`; and
  `docker tag abc123 factory-sandbox` appended. Guard 47's widened pattern was also checked against
  every legitimate form in both READMEs before it was written in — `-t "factory-sandbox:$TAG"`,
  `docker run --rm "factory-sandbox:$TAG"`, `docker images factory-sandbox`,
  `FACTORY_SANDBOX_IMAGE=factory-sandbox:<YYYY-MM-DD>`, the "Never `latest`" prose and the
  "a `factory-sandbox:` tag" prose all still pass.
- `git status --porcelain` after testing: `.bmad-loop/policy.toml` plus the two orchestrator-owned
  bookkeeping files. No break fixture survives.

**Follow-up review: false.** This was a follow-up pass and it patched no `high`; the work has
converged. Patched counts by entry verdict: high 0, medium 3, low 6.

**Residual risks.** The six deferred entries are unchanged: each of the four invariants is still
enforced as a string in one static file rather than as a property of running behaviour, so the
inverse sensitivity direction, the three copies of `/workspace`, the image's `git`/`gh` payload, the
`FACTORY_SANDBOX_IMAGE` value, `ops/factory-start.sh:130` and `engines.npm` remain breakable with
all 48 green. Nothing parses `policy.toml` itself, so the guards' own correctness rests on the
both-ways measurements recorded in the comment block and above, not on anything re-executable —
pre-existing for all 48 commands. Guard 47's operand arm now matches at any argument position, which
makes a future `docker image inspect factory-sandbox` in either README a gate failure; that is
correct (it resolves to `:latest`) but is a new way for a docs edit to fail the gate.

