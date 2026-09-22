---
title: "Story 1.2: Tests for the entry's pure helpers, running inside the verify gate"
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_revision: 'f60e7b56f7ea4ffa1a93e5db702c684e54507487'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      AGENTS.md states there is no test script, that the verify gate runs four commands, and that
      .bmad-loop/policy.toml is gitignored — all three are false after this story.
    evidence: |-
      AGENTS.md:44 "Verify with `npm run check`. There is no test script, so it is the only automated
      check until a story adds one" — this story added it. AGENTS.md:46 describes the gate as
      `npm ci`, `npm run check` "and two guards"; it is now five commands. AGENTS.md:49 says
      policy.toml "is gitignored and exists only in the main checkout"; `git ls-files` returns it and
      .gitignore:12 carries a comment saying it is deliberately tracked (this was already known false
      from Story 1.1's review and is now compounded).
      Smallest fix: three sentence-level edits in AGENTS.md. Deferred because the fix edits an
      agent-context file, which this workflow routes to the ledger rather than patching mid-story.
    location: >-
      AGENTS.md:44, AGENTS.md:46, AGENTS.md:49
    severity: medium
  - summary: >-
      decodeCredentialEncryptionKey validates byte length only, so a value containing non-base64
      characters is accepted whenever its valid characters still decode to 32 bytes.
    evidence: |-
      Verified: Buffer.from('!!!!' + 'A'.repeat(43), 'base64').byteLength === 32, and the helper
      returns that buffer. A typo-corrupted key therefore decrypts stored credentials to garbage
      rather than failing at boot with a message naming the variable.
      Smallest fix: assert the string matches /^[A-Za-z0-9+/]{43}=$/ before decoding.
      Not done here: the spec forbids changing any helper's behaviour — this story observes them.
      The lenient behaviour is now pinned by a test, so a future tightening is a visible edit.
    location: >-
      src/mastra/index.ts:61-64
    severity: medium
  - summary: >-
      credentialEncryption() JSON.parses FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS before validating
      it, so malformed JSON aborts boot with a bare SyntaxError naming nothing; it is untested, and the
      primary key is trimmed while previous-key values are not.
    evidence: |-
      src/mastra/index.ts:69-86. The JSON.parse is unguarded, so a stray character produces
      "Unexpected token ... in JSON" with no mention of the variable — exactly the boot-failure
      legibility problem this epic exists to fix, in the function next door to the one it fixed.
      The primary key is read with `?.trim()` at line 68 while previous-key strings reach
      decodeCredentialEncryptionKey untrimmed, so a trailing newline fails only on rotation.
      The function is not exported and not covered. Out of scope here: the epic names three pure
      helpers, and this one reads process.env directly.
    location: >-
      src/mastra/index.ts:67-96
    severity: medium
  - summary: >-
      The gate's test command boots the whole factory because the tests import the entry; the
      environment it boots in is arranged by a prefix denylist that a future env var could escape.
    evidence: |-
      src/mastra/index.test.ts imports ./index, whose module body runs `await factory.prepare()` and
      `await factory.finalize()` (workers started). Two inherited variables were shown to break the
      gate before the sweep landed: REDIS_URL made `npm test` hang past 75s, and a malformed
      FACTORY_CREDENTIAL_ENCRYPTION_KEY aborted it with zero tests run. The sweep covers
      FACTORY_/MASTRA_/MASTRACODE_/WORKOS_/GITHUB_APP_/LINEAR_/SLACK_APP_/E2B_ plus REDIS_URL,
      DATABASE_URL and APP_DATABASE_URL — correct today, but it is a denylist mirroring the entry by
      hand. Epic 5's extraction of config out of the entry retires the whole mechanism; until then a
      new differently-named key in the entry is a silent hole.
    location: >-
      src/mastra/index.test.ts:27-55
    severity: medium
  - summary: >-
      Nothing bounds or tears down the factory the test boots — no afterAll shutdown, and no
      per-command timeout in [verify].commands — so a boot that hangs stalls the gate rather than
      failing it.
    evidence: |-
      The test file has no afterAll; the entry starts controller workers at import and the process
      exits only because nothing holds the loop. .bmad-loop/policy.toml [limits] has git_timeout_s
      (git subprocesses only) and session_timeout_min (the whole session), but no per-verify-command
      bound. The REDIS_URL reproduction showed what that costs: no output, no exit, until something
      outside kills it. The env sweep removes today's known trigger, not the exposure.
      Smallest fix: a per-command timeout in the verify runner, or `--testTimeout`/a hard process
      bound on the test command. Both are orchestrator surface beyond this story.
    location: >-
      .bmad-loop/policy.toml [verify] / src/mastra/index.test.ts
    severity: medium
  - summary: >-
      engines.node ">=22.19.0" admits Node 23 and 25, which vitest@5.0.1 does not support, and npm
      reports the mismatch as a warning only.
    evidence: |-
      vitest@5.0.1 declares engines.node "^22.12.0 || ^24.0.0 || >=26.0.0"; package.json declares
      ">=22.19.0" with an open upper bound and there is no engine-strict setting, so EBADENGINE does
      not fail `npm ci`. The gate would run its test runner on an unsupported runtime.
      Same root cause as ledger entry DW-3 (Node unpinned); the decision owed there — narrow
      engines.node or accept Node 22+ — now has a second constraint to satisfy.
    location: >-
      package.json engines
    severity: low
  - summary: >-
      The verify gate never runs `npm run build`, so the epic's "the build still succeeds with test
      files in src/mastra" criterion is a one-time manual observation.
    evidence: |-
      [verify].commands is npm ci, npm run check, two git guards and npm test — no build. The
      deployer scans named subdirectories (agents/, workflows/, skills/, schedules/, subagents/), so
      today's top-level src/mastra/index.test.ts is not collected and the manual build passes. A test
      file placed under src/mastra/agents/ would be bundled and drag vitest into a deploy, while
      npm run check and npm test both stay green.
      Not done here: adding `npm run build` to the gate makes every verify run write the untracked
      src/mastra/public/factory/ tree that ledger entry DW-4 is open about, so the two belong together.
    location: >-
      .bmad-loop/policy.toml [verify].commands
    severity: medium
  - summary: >-
      The one place localSandboxEnv() is wired — the sandbox's env — is observed by no test, so the
      secret-withholding property is pinned at the helper and not where it takes effect.
    evidence: |-
      `env: localSandboxEnv()` at src/mastra/index.ts:323 is the helper's only call site (grepped the
      first-party tree). Replacing it with a spread of process.env leaves all four localSandboxEnv
      tests green and satisfies `tsc`, while GITHUB_APP_PRIVATE_KEY, WORKOS_API_KEY, DATABASE_URL and
      FACTORY_CREDENTIAL_ENCRYPTION_KEY — the exact keys the test lists as WITHHELD_KEYS — reach
      commands run inside an untrusted checkout.
      Not done here: reaching that callback means driving MastraFactory far enough to build a
      LocalSandbox, which is factory surface this story does not touch. It belongs with Epic 5's
      extraction of config out of the entry, alongside the boot-cost entries above.
    location: >-
      src/mastra/index.ts:323
    severity: medium
  - summary: >-
      positiveInt accepts every spelling Number() understands, so a typo'd capacity knob silently
      becomes a different valid number instead of falling back to the default.
    evidence: |-
      Verified and now pinned by a test: '0x10' -> 16, '0b11' -> 3, '1e3' -> 1000, '+5' -> 5,
      ' 3 ' -> 3. Same class of defect as the decodeCredentialEncryptionKey leniency two entries
      above, which was filed; this one was pinned by a test but never filed, so the two got
      inconsistent treatment.
      Smallest fix: reject a value that does not match /^[0-9]+$/ before coercing.
      Not done here: the spec forbids changing any helper's behaviour — this story observes them.
    location: >-
      src/mastra/index.ts:45-50
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The verify gate is `npm ci`, `tsc --noEmit` and two path guards — nothing executes a line of
first-party logic, so a change that breaks environment parsing passes the gate and fails at boot, where the
only witness is a crash-looping supervisor. The entry's three pure helpers (`positiveInt`,
`decodeCredentialEncryptionKey`, `localSandboxEnv`) are exactly the code whose failure looks like that.

**Approach:** Add vitest as a devDependency, add `src/mastra/index.test.ts` covering the three helpers
including malformed input, add a `test` npm script, and **append** the test command to the existing
`[verify].commands` list in `.bmad-loop/policy.toml`.

## Boundaries & Constraints

**Always:**
- Tests live under `src/mastra/`; the runner uses its defaults through the npm script (AD-3 — root is a
  closed set).
- The test imports the helpers from `src/mastra/index.ts`; the helpers are exported from the entry rather
  than moved out of it (AD-2 — the entry stays indivisible; extraction belongs to Epic 5).
- `npm test` is **appended** to `[verify].commands`. All four existing commands survive byte-identical —
  the two shell guards are enforced nowhere else.
- `npm run check` and `npm run build` stay clean with test files inside the compiler's and the bundler's
  scope. `start`, `check`, `build` keep their names and command strings (AD-11 / NFR10).

**Never:**
- Never add a `vitest.config.ts`, a root `tests/` directory, or any other root-level file or directory.
- Never rewrite `[verify].commands` — only append to it.
- Never change `tsconfig.json`, `docker-compose.yml`, `.env.schema`, `.env.example` or `AGENTS.md`; they
  belong to other stories.
- Never bump or re-resolve an existing dependency: the only lockfile change is the additive vitest subtree.
- Never move a helper out of the entry, and never change any helper's behaviour — this story observes them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid knob | `positiveInt('3')` | `3` | No error expected |
| Non-positive / unparseable | `undefined`, `''`, `'0'`, `'-1'`, `'abc'` | `undefined` (fall back to the default) | No error expected |
| Fractional / unsafe | `'0.5'`, `'2.5'`, `'9007199254740993'`, `'Infinity'` | `undefined` — rejected, never floored | No error expected |
| Valid key | 32-byte base64 via `decodeCredentialEncryptionKey` | 32-byte `Buffer` with the same bytes | No error expected |
| Malformed key | not base64, 31 bytes, 33 bytes, `''` | throws | Message names the env var it was given (`FACTORY_CREDENTIAL_ENCRYPTION_KEY` vs `..._PREVIOUS_KEYS`) |
| Sandbox env | every allow-listed var set, plus `PATH`/`DATABASE_URL`/app secrets | only the 13 allow-listed keys, with their values | No error expected |
| Sandbox env, sparse | allow-listed var unset or empty | key omitted from the record | No error expected |

</intent-contract>

## Code Map

- `src/mastra/index.ts` -- the entry. `positiveInt` (line 45), `decodeCredentialEncryptionKey` (line 52) and
  `localSandboxEnv` (line 204) are module-private; add `export` to each (plus a one-line comment saying the
  export exists for the test) and change nothing else. `LOCAL_SANDBOX_ENV_KEYS` (line 188) is exported too
  (review patch): the test restates the list for readability, but only a direct comparison catches a key
  being *added* — an added key that is unset in the test process is skipped by the helper's `if (value)`
  guard, so all tests stayed green when `NPM_TOKEN` was appended to the entry's list.
  **Importing this module boots the factory** (top-level `await factory.prepare()` / `finalize()`), so the
  test must arrange env first: every variable the entry reads is swept from `process.env` (prefix sweep over
  `FACTORY_`/`MASTRA_`/`MASTRACODE_`/`WORKOS_`/`GITHUB_APP_`/`LINEAR_`/`SLACK_APP_`/`E2B_` plus exact
  `REDIS_URL`/`DATABASE_URL`/`APP_DATABASE_URL`), then `NODE_ENV=test` (else line 233 throws on a missing
  `DATABASE_URL`) and `MASTRA_DB_PATH` pointed at a throwaway file under `tmpdir()` — otherwise
  `getDatabasePath()` resolves to the operator's real dev database at
  `~/Library/Application Support/mastracode/mastra.db` and the boot migrates it. Verified: the import
  completes and the process exits cleanly, ~1 s under vitest.
- `src/mastra/index.test.ts` -- new. Static `import` statements are evaluated before any module-body
  statement, so the env setup above only works ahead of a top-level `await import('./index')`. Import
  extensionless (`'./index'`): `moduleResolution: bundler` resolves it and `allowImportingTsExtensions` is
  unset, so a `.ts` suffix would fail `tsc`.
- `package.json` -- add `"test": "vitest run --dir src"` to `scripts` and `vitest` to `devDependencies`.
  `--dir` scopes collection: run from the main checkout, vitest's defaults would also collect
  `.bmad-loop/runs/*/worktrees/*/src/mastra/*.test.ts` (gitignored, but vitest does not read `.gitignore`).
  The scope is `src`, not `src/mastra`, to match the AD-4 guard, which admits first-party TypeScript
  anywhere under `src/`; a narrower scope would let a test outside `src/mastra` typecheck, pass both guards
  and never run. Verified both directions: a test under `src/other/` is collected, a worktree copy is not.
- `.bmad-loop/policy.toml` -- `[verify].commands`, tracked and reachable from a story worktree. Append
  `"npm test"` as a fifth element; leave the four existing strings untouched.
- `package-lock.json` -- regenerated additively. Verified after `npm i -D --save-exact vitest@5.0.1`:
  52 packages added, 0 removed, 0 existing versions changed.
- `tsconfig.json` -- read-only. `include: ["src/**/*"]` already covers the test file; `types: ["node"]`
  restricts only global auto-inclusion, so vitest's explicitly imported types resolve.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- DW-1 (no gate check for the `packageManager`
  pin) names this story as the owner of `[verify].commands`. Out of this story's acceptance criteria — it
  asks for a second, unrelated guard — so it stays open for the sweep.

## Tasks & Acceptance

**Execution:**
- `package.json` -- add `vitest` (exact version) to `devDependencies` and `"test": "vitest run --dir src/mastra"`
  to `scripts` -- gives the gate a runner with no root config file.
- `package-lock.json` -- let `npm install --save-dev --save-exact` regenerate it; confirm the diff is purely
  additive -- the no-backups posture forbids re-resolving existing dependencies.
- `src/mastra/index.ts` -- export the three helpers -- the tests import them from the entry (AD-2 keeps them
  there until Epic 5).
- `src/mastra/index.test.ts` -- new test file covering the I/O matrix above -- executable coverage of the
  helpers whose failure mode is a boot crash.
- `.bmad-loop/policy.toml` -- append `"npm test"` to `[verify].commands` -- tests only count if the gate runs
  them; appending keeps the two guards nothing else enforces.

**Acceptance Criteria:**
- Given the root directory set is closed, when the change is complete, then no `vitest.config.ts` and no
  root `tests/` directory exist, and the only new file is `src/mastra/index.test.ts`.
- Given `[verify].commands` held four commands, when `.bmad-loop/policy.toml` is diffed against
  `baseline_revision`, then all four original strings are present byte-identical and `npm test` is appended
  after them.
- Given the gate must fail for a real reason, when a deliberately failing test is added and `npm test` runs,
  then it exits non-zero; and when no test file matches, then it also exits non-zero rather than passing
  vacuously.
- Given the deployer bundles from `src/mastra` and typecheck covers `src/**/*`, when `npm run build` and
  `npm run check` run with the test file present, then both exit 0 and the build leaves no file that belongs
  in the commit.
- Given the whole gate, when all five `[verify].commands` run in order in a worktree with no `node_modules/`,
  then every one exits 0.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass

- verdicts: 36 findings — high 0, medium 15, low 15, false 6, maybe-false 0
- findings:
  - `[medium]` `[defer]` blind-hunter: `AGENTS.md:44/46/49` now states there is no test script, that the gate runs four commands, and that `policy.toml` is gitignored — all three false after this change. Verified at those lines; deferred because the fix edits an agent-context file.
  - `[low]` `[defer]` blind-hunter: Design Notes said the boot side effect was "recorded as a residual risk" while frontmatter `deferred` was `[]` — true when filed; this pass records it (deferred items 4 and 5).
  - `[medium]` `[patch]` blind-hunter: the test booted the factory against the operator's real local database (`getDatabasePath()` → `~/Library/Application Support/mastracode/mastra.db`). Verified: a run creates and migrates a ~548 KB database. Patched — `MASTRA_DB_PATH` now points at a throwaway file under `tmpdir()`; the operator DB's mtime is unchanged across runs.
  - `[medium]` `[patch]` blind-hunter: only `NODE_ENV`/`DATABASE_URL`/`APP_DATABASE_URL` were neutralized, leaving `REDIS_URL` and the rest of the deployment env to configure the boot. Verified by reproduction (see the edge-case rows). Patched — a prefix sweep clears every variable the entry reads.
  - `[medium]` `[defer]` blind-hunter: nothing bounds or tears down the boot — no `afterAll` shutdown and no per-command timeout in `[verify]`, so a hanging boot stalls the gate until `session_timeout_min`. Verified real; the patch removes today's known trigger but not the structural exposure (deferred item 5).
  - `[low]` `[patch]` blind-hunter: the test named "not base64 at all" passed on the byte-length branch instead. Verified: `Buffer.from('not-a-real-key','base64').byteLength === 10`. Patched — renamed, and the decoded length asserted inline.
  - `[low]` `[reject]` blind-hunter: the `toThrow` regexes match only the variable name, not "must contain base64-encoded 32-byte keys". True, but the contract the epic states is exactly "names the environment variable it came from"; tightening would pin prose no requirement fixes.
  - `[medium]` `[patch]` blind-hunter: `positiveInt`'s `Number()` coercion forms were untested. Verified: `'0x10'`→16, `'0b11'`→3, `'1e3'`→1000, `'+5'`→5, `' 3 '`→3 — a typo'd knob silently becomes a different valid number. Patched with a test pinning them as accepted.
  - `[medium]` `[defer]` blind-hunter: `credentialEncryption()` `JSON.parse`s `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` before validating, so malformed JSON surfaces as a bare `SyntaxError` naming nothing; it is neither exported nor tested, and the primary key is trimmed while previous values are not. Verified at `src/mastra/index.ts:69-86`; outside the three helpers this story owns (deferred item 3).
  - `[low]` `[reject]` blind-hunter: `vite` is a vitest peer absent from `package.json`. Real, but npm resolves and pins peers in the lockfile — `npm ci` reproduces `vite@8.3.0` exactly — and manifest entries for a devDependency's peers are not standard practice. The same argument would apply to every transitive dependency.
  - `[low]` `[defer]` blind-hunter: `engines.node` `>=22.19.0` admits Node 23/25, which `vitest@5.0.1` does not support, and `EBADENGINE` is warn-only. Verified against vitest's `engines`; same root cause as ledger entry DW-3 (deferred item 6).
  - `[low]` `[reject]` blind-hunter: the env preamble is un-restored per-file boilerplate a second test file would have to copy. Real, but vitest isolates per file and there is one test file; the fix is a shared module this story's boundaries exclude.
  - `[low]` `[reject]` blind-hunter: the "no test files is not a pass" criterion rests on vitest's default `passWithNoTests: false`. Verified it holds today (`exit 1`); pinning it with a flag guards a hypothetical default change.
  - `[false]` `[reject]` blind-hunter: the `[verify]` comment says "on its defaults" while the script passes a flag. Refuted — the comment quotes the full command including `--dir` and then explains the flag's purpose.
  - `[low]` `[reject]` blind-hunter: `npm test` is appended after the tree-cleanliness guard, so pollution it creates is not caught. Verified `git status --porcelain` is clean after `npm test`, and that guard covers `.agents/skills` only, which tests never touch; appending is also what the epic's AC requires.
  - `[medium]` `[patch]` edge-case: an inherited `REDIS_URL` makes the import dial Redis and the gate hang. Reproduced: `REDIS_URL=redis://127.0.0.1:65500 npm test` killed at 75 s with no exit. Patched by the env sweep; the same command now exits 0 in ~1 s.
  - `[medium]` `[patch]` edge-case: an inherited malformed `FACTORY_CREDENTIAL_ENCRYPTION_KEY` aborts the import before any test. Reproduced: exit 1, "Tests no tests". Patched by the env sweep; now exits 0 with all 17 tests run.
  - `[medium]` `[defer]` edge-case: `decodeCredentialEncryptionKey` accepts non-base64 garbage whose valid characters still decode to 32 bytes. Verified: `Buffer.from('!!!!'+'A'.repeat(43),'base64').byteLength === 32`. Pre-existing helper behaviour the spec forbids changing here (deferred item 2).
  - `[low]` `[patch]` edge-case: the "not base64 at all" test only exercises the byte-length branch — same claim as the blind-hunter row; same fix, plus a test pinning the lenient acceptance.
  - `[medium]` `[patch]` edge-case: `positiveInt` coercion forms untested — same claim as the blind-hunter row; same fix.
  - `[low]` `[reject]` edge-case: stubbing `PATH`/`HOME`/`TMPDIR` process-wide while the booted factory's workers run could break a concurrent spawn. No such failure was demonstrated — the stubs are synchronous, last microseconds and are restored in `afterEach` — and `PATH` is precisely the key the test must prove is withheld.
  - `[low]` `[patch]` edge-case (claim): the spec's matrix row "not base64 … throws" reads as base64 validation the helper does not perform. The row is literally true (all listed inputs do throw), but the test name overstated it; corrected in the test rather than in the read-only matrix.
  - `[medium]` `[patch]` edge-case (claim): the test header claimed "two preconditions" while the entry reads many more variables at import. Verified; header rewritten to describe the sweep.
  - `[medium]` `[patch]` verification-gap: the `localSandboxEnv` tests cannot see a key *added* to `LOCAL_SANDBOX_ENV_KEYS`, while their comment claims exactly that protection. Reproduced: appending `'NPM_TOKEN'` left all 14 tests green. Patched — the constant is exported and the two lists compared directly; the same edit now fails the gate.
  - `[medium]` `[defer]` verification-gap: the gate never runs `npm run build`, so the epic's build criterion is a one-time manual observation; a test file under `src/mastra/agents/` would be bundled into a deploy. Verified against the deployer's directory scan; adding `npm run build` to the gate pulls in DW-4's untracked output (deferred item 7).
  - `[medium]` `[patch]` verification-gap (other): `npm test` boots against the operator's shared local database — same claim as the blind-hunter row; same fix.
  - `[medium]` `[patch]` verification-gap (other): `vitest run --dir src/mastra` silently skips tests elsewhere under `src/`, which the AD-4 guard permits. Patched — the scope is now `src`. Verified both directions: a test under `src/other/` fails the gate, a worktree copy under `.bmad-loop/runs/` is still ignored.
  - `[low]` `[patch]` verification-gap (other): the "not base64 at all" test name — same claim as the rows above; same fix.
  - `[low]` `[reject]` intent-alignment: this run's frozen `policy_snapshot` holds the four pre-change commands, so the appended `npm test` first executes on the next run. Verified in the run's `state.json`; inherent to editing the gate from inside a run, not a defect in the change. All five commands were run by hand instead, in order, from an empty `node_modules/`. Recorded as a residual risk.
  - `[low]` `[reject]` intent-alignment: nothing in the tree asserts anything about `[verify].commands` — the story that extends the gate adds no check *of* the gate. True; a standing self-test of the gate is new surface the epic does not ask for, and ledger entry DW-1 already owns that ground.
  - `[low]` `[reject]` intent-alignment: the negative criteria (a failing test fails the gate; no test files is not a pass) are discharged as prose, reproduced by nothing in the tree. Both were executed this pass (exit 1 each); a standing meta-test of the runner is beyond the story.
  - `[false]` `[reject]` intent-alignment: the tests observe helper signatures rather than the call sites where a boot breaks. Refuted as a defect — the epic names the three helpers as the surface and cites their line numbers; call-site wiring is Epic 5's `process.env`-at-one-location work.
  - `[false]` `[reject]` intent-alignment: "pure helpers" versus a full application boot. Refuted as a defect — Story 5.4's acceptance criteria state that this story's tests import the helpers from `src/mastra/index.ts`, so exporting rather than extracting is the required shape; the boot is its acknowledged cost, now isolated to a temp database.
  - `[false]` `[reject]` intent-alignment: the matrix distinguishes four malformed-key scenarios where the helper has one branch. Refuted — the matrix asserts the outcome (throws, naming the variable), which holds for all four; it never claims four branches.
  - `[false]` `[reject]` intent-alignment: the allow-list assertion is a change-detector that tests the list rather than the filtering rule. Refuted — the behavioural tests do exercise the filtering rule (set, unset, empty, withheld); the list comparison is a deliberate second assertion, and the verification-gap finding shows it was the missing half.
  - `[false]` `[reject]` intent-alignment: `awaiting-operator` handling and `sprint-status.yaml`. Refuted as a defect — no acceptance criterion here needs a human outside the repo, and the file is untouched.

### 2026-09-23 — Review pass (follow-up)

- verdicts: 33 findings — high 0, medium 10, low 15, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: the throwaway database is never removed — every `npm test` leaves
    `.db`/`.db-wal`/`.db-shm` in the temp directory (~1.8 MB). Verified: 36 files, 21.5 MB, all from this
    story's own runs. Patched — an `afterAll` unlinks all three suffixes; a full run now leaves the file
    count unchanged. The 36 stale files were deleted.
  - `[medium]` `[patch]` blind-hunter: the temp path was keyed by `process.pid`, which is recycled, so a
    rerun on a reused pid reopens and migrates an earlier run's schema. Same root cause as the row above.
    Patched — the name now uses `randomUUID()`.
  - `[low]` `[reject]` blind-hunter: ledger entry DW-7 claims an untrimmed previous-key value "fails only
    on rotation" on a trailing newline. Verified false — `Buffer.from(validKey + '\n', 'base64').byteLength`
    is 32, so it silently succeeds. Rejected here: the correction edits an orchestrator-owned ledger entry,
    and DW-7's primary defect (an unguarded `JSON.parse` that names nothing) stands regardless.
  - `[low]` `[reject]` blind-hunter: the spec's Tasks bullet and Design Notes still say
    `--dir src/mastra` while `package.json` and the Code Map say `--dir src`. Real staleness, but the fix
    is to edit this build's spec, which triage rejects by rule.
  - `[false]` `[reject]` blind-hunter: `## Spec Change Log` is empty though the review rewrote the spec.
    Refuted — that log records `bad_spec` amendments and loopbacks; no loopback occurred in either pass, so
    an empty log is the correct state. Patches are recorded in this triage log, which is populated.
  - `[low]` `[reject]` blind-hunter: DW-7's heading in `deferred-work.md` is truncated mid-sentence. True,
    but the clause it drops is present verbatim in that entry's `reason:` body, so the sweep loses nothing;
    the ledger is orchestrator-owned and out of this workflow's reach.
  - `[false]` `[reject]` blind-hunter: `sprint-status.yaml` says `done` while the spec says `in-review`.
    Refuted — the spec is `in-review` only for the duration of this pass and returns to `done` at
    finalization; the board is orchestrator bookkeeping, not a second source of truth for spec status.
  - `[low]` `[patch]` blind-hunter: the file header claimed "the sweep is by prefix, not a hand-listed
    denylist" while `ENTRY_ENV_EXACT` twenty lines below is exactly a hand-listed denylist. Verified.
    Patched — the header now says the prefixes are automatic and the three unprefixed names are hand-kept.
  - `[medium]` `[defer]` blind-hunter: the sweep covers what the entry reads, not what the dependency graph
    it boots reads (`PORT`, `HTTP_PROXY`, provider keys). `carried` — same claim and location as the logged
    row for deferred item 4 (ledger DW-8), which already states the sweep is "a denylist mirroring the entry
    by hand"; verified the code still reads that way. Kept at that row's verdict and route; not re-filed.
  - `[low]` `[reject]` blind-hunter: `expect([...LOCAL_SANDBOX_ENV_KEYS]).toEqual(FORWARDED_KEYS)` is
    order-sensitive while the behavioural test three lines down sorts. True. Rejected — the strictness is
    deliberate: the restated list is what a reviewer reads, order-locked equality keeps the two literally in
    step, and a red gate on a reorder is a legible signal. Loosening it weakens the assertion the previous
    pass added precisely because a weaker one missed an added key.
  - `[false]` `[reject]` blind-hunter: the swept variables are never restored, so a second test file under
    `src/` inherits a stripped `process.env`. Refuted by reproduction — two vitest files, one deleting
    `ISOL_PROBE` at module load, the other asserting it is still `present`: 4/4 runs passed. Vitest's default
    `isolate: true` gives each test file a fresh fork, so `process.env` does not leak across files.
  - `[low]` `[reject]` blind-hunter: the `[verify]` comment in `policy.toml` quotes the script's flags,
    creating a second place to drift. True in principle; a comment that quotes the command it is explaining
    is ordinary, and the drift actually observed is in the spec, not here.
  - `[low]` `[reject]` blind-hunter: `deferred-work.md` entries use inconsistent `location` grammars and not
    all carry a "Smallest fix:" clause. No named harm — the sweep reads the structured fields — and the file
    is orchestrator-owned.
  - `[low]` `[reject]` blind-hunter: no test pins `decodeCredentialEncryptionKey`'s tolerance of a trailing
    newline. Verified the tolerance is real (32 bytes). Rejected — that scenario is not in the I/O matrix,
    and pinning every lenient decode path is unbounded; ledger DW-6 already records the leniency.
  - `[low]` `[reject]` blind-hunter: `warnings: ['oversized']` is carried and never acted on. The fix is to
    edit this build's spec, which triage rejects by rule.
  - `[medium]` `[defer]` blind-hunter: the build acceptance criterion cannot fail, because DW-4 records that
    `npm run build` does materialise an untracked `src/mastra/public/factory/` tree. `carried` — same claim
    as the logged row for deferred item 7 (ledger DW-11); verified `[verify].commands` still has no build.
  - `[medium]` `[patch]` edge-case: the temp database is never deleted — 36 files, 21 MB observed; pid reuse
    reopens a stale schema. Same claim as the two blind-hunter rows; same fix.
  - `[low]` `[patch]` edge-case: an entry variable that is neither prefixed nor in `ENTRY_ENV_EXACT` escapes
    the sweep while the comment claims prefix-only coverage. Same claim as the blind-hunter header row; the
    comment is corrected. The completeness of the list itself stays at deferred item 4.
  - `[false]` `[reject]` edge-case: story flipped to `done` while the spec reads `in-review`. Refuted — same
    refutation as the blind-hunter row above.
  - `[low]` `[reject]` edge-case (claim): the spec's Tasks section says `--dir src/mastra` while
    `package.json` says `--dir src`. Same claim as the blind-hunter row; rejected for the same reason.
  - `[medium]` `[defer]` edge-case (claim): the AC says `npm run build` leaves no file belonging in the
    commit, while DW-4 records the opposite. `carried` — same claim as the blind-hunter build row.
  - `[medium]` `[patch]` verification-gap: nothing asserts that the `MASTRA_DB_PATH` redirect took effect,
    so deleting that line — it reads like scaffolding — leaves the suite green while the boot migrates the
    operator's real database. Arrived pre-verified; the previous pass recorded that this exact situation
    already occurred and was caught by a human, not by a red suite. Patched — one test asserts the env var
    holds the throwaway path and that the file exists after the import.
  - `[medium]` `[defer]` verification-gap: `localSandboxEnv()`'s only call site (`index.ts:323`, the
    sandbox's `env`) is observed by no test, so replacing it with a spread of `process.env` keeps the gate
    green while app secrets reach an untrusted checkout. Verified the call site is unique and undriven.
    Deferred — reaching it means driving `MastraFactory` far enough to build a `LocalSandbox`, which is
    factory surface this story does not touch (new deferred item 8).
  - `[medium]` `[patch]` verification-gap (other): every run leaks ~1.8 MB into `TMPDIR`. Same claim as the
    blind-hunter row; same fix.
  - `[low]` `[reject]` verification-gap (other): the spec contradicts the shipped script on `--dir` scope.
    Same claim as the blind-hunter row; rejected for the same reason.
  - `[low]` `[reject]` verification-gap (other): DW-7's heading is truncated. Same claim as the blind-hunter
    row; rejected for the same reason.
  - `[false]` `[reject]` intent-alignment: the tests observe helper signatures rather than the call sites
    where a boot breaks. `carried` — refuted in the previous pass and still refuted: the epic names the three
    helpers as the surface and cites their line numbers; call-site wiring is Epic 5's work.
  - `[false]` `[reject]` intent-alignment: the sweep neutralizes every variable the entry reads, so the boot
    the gate performs never exercises the parsing under test. Accurate as description, refuted as a defect —
    the boot is an acknowledged cost of importing the entry, never the coverage; the coverage is the helper
    assertions, which is the shape Story 5.4's acceptance criteria assume.
  - `[false]` `[reject]` intent-alignment: the matrix says "not base64 → throws" while the shipped test pins
    acceptance. `carried` — refuted in the previous pass: the matrix asserts the outcome for the four inputs
    it lists, all of which do throw; the lenient path is a different input, pinned by its own test and filed
    as ledger DW-6.
  - `[medium]` `[defer]` intent-alignment: `positiveInt`'s coercion leniency got a pinning test but no
    ledger entry, while the parallel `decodeCredentialEncryptionKey` leniency got DW-6 — inconsistent
    treatment of the same class of defect. Verified both are pinned by tests and only one was filed.
    Deferred — pre-existing helper behaviour the spec forbids changing here (new deferred item 9).
  - `[low]` `[reject]` intent-alignment: the Approach text says the runner uses "its defaults" while the
    script passes `--dir src`. Same underlying staleness as the spec-text rows; the fix edits this build's
    spec.
  - `[low]` `[reject]` intent-alignment: this run's frozen `policy_snapshot` holds the pre-change commands,
    so the appended `npm test` first executes on the next run. `carried` — logged and rejected in the
    previous pass as inherent to editing the gate from inside a run; all five commands were again run by
    hand this pass, in order, from an empty `node_modules/`.
  - `[false]` `[reject]` intent-alignment: the diff also flips `sprint-status.yaml` and appends to
    `deferred-work.md`, which the contract neither authorizes nor forbids. Refuted as a defect — both are
    orchestrator-owned bookkeeping this workflow is explicitly instructed not to write or revert.

## Design Notes

**Why the tests import the booting entry.** Epic 5 (Story 5.4 AC) states that Story 1.2's tests import the
helpers from `src/mastra/index.ts` and that a later relocation updates the import in the same change. So the
helpers are exported, not extracted — extraction here would pre-empt AD-2 and Epic 5. The cost is that each
run boots the factory against a local libSQL file; that is a real side effect, recorded as a residual risk
rather than hidden behind a mock.

**Why `--dir` rather than bare `vitest run`.** The epic's constraint is "no config file at root", not "no CLI
flags". `--dir src/mastra` is the smallest way to keep collection inside the directory AD-3 assigns to tests,
and it mirrors the `--dir src/mastra` the `dev` and `build` scripts already pass to the Mastra CLI.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exits 0 with no `node_modules/` present
- `npm run check` -- expected: exits 0
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected: exits 0
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: exits 0
- `npm test` -- expected: exits 0, every test in `src/mastra/index.test.ts` passing
- `npm test` with a temporary always-failing test file -- expected: exits 1 (then delete the file)
- `npx vitest run --dir src/does-not-exist` -- expected: exits 1 ("no test files found" is not a pass)
- `REDIS_URL=redis://127.0.0.1:65500 npm test` and `FACTORY_CREDENTIAL_ENCRYPTION_KEY=oops npm test` --
  expected: both exit 0; an inherited deployment variable must not hang or abort the gate

## Auto Run Result

Status: done

### Summary

The verify gate executes first-party logic. `src/mastra/index.test.ts` covers the entry's three pure
helpers — `positiveInt`, `decodeCredentialEncryptionKey` and `localSandboxEnv` — including malformed input,
and `npm test` is appended as a fifth command to `.bmad-loop/policy.toml` `[verify].commands`, leaving the
four existing commands byte-identical. The helpers are exported from the entry rather than extracted, which
is the shape Story 5.4's acceptance criteria assume.

This follow-up review pass changed the test file only. The previous pass redirected the boot's database at a
throwaway file but left that file behind on every run and asserted nothing about the redirect; both are now
fixed, and the misleading claim in the file header about how the environment sweep works is corrected. 18
tests pass; a deliberately failing test exits 1, and an empty collection exits 1, so the gate cannot go green
vacuously.

### Files changed

- `src/mastra/index.ts` — `export` added to the three helpers and to `LOCAL_SANDBOX_ENV_KEYS`, each with a
  comment saying the export exists for the test. No behaviour changed. Untouched by this pass.
- `src/mastra/index.test.ts` — 18 tests. Sweeps every environment variable the entry reads before importing
  it, redirects the boot's database to a uniquely-named throwaway file under `tmpdir()`, removes that file
  and its `-wal`/`-shm` siblings in `afterAll`, asserts the redirect actually took effect, then asserts the
  I/O matrix.
- `package.json` — `"test": "vitest run --dir src"` and `vitest` pinned exact at `5.0.1`. `start`, `check`,
  `build` and every other script are byte-identical. Untouched by this pass.
- `package-lock.json` — additive only: 52 packages added, 0 removed, 0 versions or integrities changed.
  Untouched by this pass.
- `.bmad-loop/policy.toml` — `"npm test"` appended to `[verify].commands` plus a comment explaining why it
  is appended and why the scope is `src`. Zero removed or modified lines. Untouched by this pass.
- `_bmad-output/implementation-artifacts/spec-1-2-...md` — this spec.

### Review findings (follow-up pass)

Four layers ran (blind-hunter, edge-case-hunter, verification-gap, intent-alignment) and reported 33
findings: 0 high, 10 medium, 15 low, 8 false, 0 maybe-false. Per-finding triage is in the Review Triage Log.

- **Patches applied: 3 entries — 2 medium, 1 low.**
  1. *(medium)* The throwaway database was never removed and its name was keyed by `process.pid`. Verified:
     36 files totalling 21.5 MB had accumulated in the temp directory from this story's own runs, and a
     recycled pid would reopen a stale schema. Fixed — the name uses `randomUUID()` and an `afterAll`
     unlinks the `.db`, `.db-wal` and `.db-shm` files. A full run now leaves the temp file count unchanged;
     the 36 stale files were deleted.
  2. *(medium)* Nothing asserted that the `MASTRA_DB_PATH` redirect took effect, so deleting that line —
     it reads like debug scaffolding — would leave the suite green while the boot migrated the operator's
     real database at `~/Library/Application Support/mastracode/mastra.db`. That exact situation occurred
     in the previous pass and was caught by a reviewer, not by a red suite. Fixed — one test asserts the
     env var holds the throwaway path and that the file exists after the import.
  3. *(low)* The file header claimed "the sweep is by prefix, not a hand-listed denylist" while
     `ENTRY_ENV_EXACT` twenty lines below is exactly a hand-listed denylist of three unprefixed names.
     Fixed — the header now distinguishes the automatic prefixes from the hand-kept exact names.
- **Deferred: 2 new items** (frontmatter `deferred`, items 8 and 9) — `localSandboxEnv()`'s only call site
  (`index.ts:323`) is observed by no test, so the secret-withholding property is pinned at the helper and
  not where it takes effect (medium); and `positiveInt`'s coercion leniency was pinned by a test but never
  filed, unlike the parallel `decodeCredentialEncryptionKey` leniency that became DW-6 (medium).
  Three further medium findings were **carried** at their previous verdicts rather than re-filed: the
  sweep's hand-maintained completeness (deferred item 4 / DW-8) and, twice, the gate's missing
  `npm run build` (deferred item 7 / DW-11).
- **Rejected: 20 findings.** Grouped by reason:
  - **Refuted by reproduction (2):** the swept variables leaking into a second test file — two vitest files
    showed `process.env` is isolated per file under the default `isolate: true`, 4/4 runs; and the empty
    `## Spec Change Log`, which records `bad_spec` amendments and is correctly empty because no loopback
    occurred in either pass.
  - **Refuted as defects (6):** `sprint-status.yaml` disagreeing with a spec that is `in-review` only for
    the duration of this pass (raised twice); the tests observing helper signatures rather than call sites,
    and the related observation that the sweep makes the booted entry's own parsing inert — both accurate
    descriptions, but the epic names the three helpers as the surface; the matrix's malformed-key row, which
    asserts an outcome that holds for all four inputs it lists; and the orchestrator-owned bookkeeping files
    appearing in the diff.
  - **Fix edits this build's spec (4):** the stale `--dir src/mastra` text in Tasks, Design Notes and the
    Approach paragraph (raised four times, one of them folded here), and the unresolved
    `warnings: ['oversized']`.
  - **Fix edits an orchestrator-owned ledger (3):** DW-7's trailing-newline claim, which was verified *false*
    (`Buffer.from(validKey + '\n', 'base64').byteLength === 32`, so the value silently succeeds rather than
    failing on rotation) but whose correction belongs inside DW-7; DW-7's truncated heading, whose dropped
    clause is present verbatim in the entry's body; and the ledger's inconsistent `location` grammars.
  - **Judged not worth the change (5):** the order-sensitive allow-list comparison, where the strictness is
    deliberate and loosening it weakens the assertion the previous pass added on purpose; the missing test
    for trailing-newline tolerance, which is not in the I/O matrix and whose leniency DW-6 already records;
    the `[verify]` comment quoting the command it explains; and the frozen `policy_snapshot`, inherent to
    editing the gate from inside a run.

### Follow-up review recommendation

`false`. This pass patched two medium entries and one low, and no `high`. On a follow-up pass only a patched
`high` warrants another round; the work has converged.

### Verification

All five `[verify].commands` were run by hand, in order, from an empty `node_modules/` (the run's frozen
`policy_snapshot` still holds the four pre-change commands):

- `npm ci --no-audit --no-fund` after `rm -rf node_modules` — exit 0
- `npm run check` — exit 0
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` — exit 0
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` — exit 0
- `npm test` — exit 0, 18 tests passing in ~0.9–2.5 s

Negative and environment checks:

- `npm test` with a temporary always-failing test file — exit 1 (file deleted afterwards)
- `npx vitest run --dir src/does-not-exist` — exit 1
- `REDIS_URL=redis://127.0.0.1:65500 npm test` — exit 0
- `FACTORY_CREDENTIAL_ENCRYPTION_KEY=oops npm test` — exit 0, 18 tests run
- Temp-file accounting: `mastra-factory-index-test-*` count in `$TMPDIR` before a run and after it is
  unchanged; the 36 files left by earlier runs were removed
- Cross-file `process.env` isolation reproduced with two throwaway vitest files, 4/4 runs
- `git status --porcelain` clean apart from the spec and the orchestrator-owned artifacts

`npm run build` was not re-run this pass — the previous pass verified it, and running it materialises the
untracked `src/mastra/public/factory/` tree that ledger entry DW-4 is open about, which would dirty the tree
before finalization.

### Residual risks

- The appended `npm test` first executes under the orchestrator's own gate on the next run; this run's
  policy snapshot was frozen before the change, so the five-command sequence was reproduced by hand.
- Importing the entry still boots the factory. The `afterAll` added here removes the database files; it is
  not a factory shutdown, and there is still no per-command timeout in `[verify]`, so deferred item 5
  (ledger DW-9) stands unchanged.
- The environment sweep's exact-name list (`REDIS_URL`, `DATABASE_URL`, `APP_DATABASE_URL`) is maintained by
  hand, and the sweep covers what the entry reads rather than what the whole booted dependency graph reads.
  Deferred item 4 (ledger DW-8) owns this; the header comment no longer overstates the coverage.
- The allow-list's only real call site is still unobserved (new deferred item 8).

