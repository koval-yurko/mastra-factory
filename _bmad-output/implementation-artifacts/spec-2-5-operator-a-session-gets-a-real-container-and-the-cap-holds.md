---
title: 'Story 2.5: [operator] A session gets a real container, and the cap holds'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: '4455939f39c4505e3cd7b071965b27b4c96b6c75'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The concurrency cap counts the session sandboxes the CURRENT server process handed out, so
      containers that outlive a restart are not counted and the host can end up running more session
      containers than `MASTRACODE_MAX_SANDBOXES` allows.
    evidence: |-
      `src/mastra/index.ts` `liveDockerSandboxes` is a module-level `Map` populated by
      `selectSandbox`'s docker branch, so it starts empty on every boot. Session containers have no
      idle teardown (`deferred-work.md` DW-26) and `@mastra/docker/dist/index.js:794-804` reattaches
      by querying the daemon for `mastra.sandbox.id=<id>`, so the containers themselves survive a
      restart while the registry does not: restart with three containers still up and three more
      sessions are admitted, for six containers on a host sized for three.
      Not done here: closing it needs the real occupancy from the engine — `listContainers` filtered
      on `mastra.sandbox=true` — which is async, while the slot Factory calls is
      `(ctx: FactorySandboxContext) => MastraSandbox`, synchronous, with the documented contract that
      "construction must be cheap and side-effect-free" (`sandbox/session-sandbox.d.ts:36,54`). There
      is nowhere to await it without either an async slot the type forbids or a dockerode client in
      the entry, which AD-2 rules out. `sandbox/README.md`'s `## MASTRACODE_MAX_SANDBOXES` states the
      per-process scope and tells the operator to check
      `docker ps --filter label=mastra.sandbox=true` after a restart that left containers behind.
    location: >-
      src/mastra/index.ts `liveDockerSandboxes` / `admitDockerSession`
    severity: low
operator_actions:
  - >-
    Precondition — Story 2.1's image and Story 2.4's sign-in must already be done and holding:
    Colima running with `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"` in the shell,
    `docker images factory-sandbox` listing the tag from `sandbox/README.md`'s tag history, the
    database `healthy`, and an account that can sign in at `http://127.0.0.1:4111/signin`. Then add
    `README.md` "Start the Factory Server" step 6's three lines to `.env` —
    `FACTORY_SANDBOX_PROVIDER=docker`, `FACTORY_SANDBOX_IMAGE=factory-sandbox:<the tag you built>`
    and `MASTRACODE_MAX_SANDBOXES=3` — and restart `npm run dev`, because `.env` is read once at
    startup. With the provider line missing the checks below all pass against a checkout on this
    host rather than in a container, which is the failure they exist to catch.
  - >-
    Check 1 — a session gets a real container from the date-tagged image, with git and gh inside it.
    Open a session from the UI (Work → Intake → Investigate), then run
    `docker ps --filter label=mastra.sandbox=true --format '{{.ID}} {{.Image}} {{.Labels}}'`.
    Expected: one container, its image the exact `FACTORY_SANDBOX_IMAGE` tag, carrying a
    `mastra.sandbox.id=<session id>` label. Then, against that container id,
    `docker exec <id> sh -c 'git --version && gh --version'` — both version lines must print. A
    failure here that names Docker Hub means the tag is not in this engine's local store; a failure
    naming `FACTORY_SANDBOX_IMAGE` means the key did not reach the server process. Both are in
    `sandbox/README.md` "If a session fails to start".
  - >-
    Check 2 — a resumed session reattaches instead of provisioning a second container. Note the
    container id and the `mastra.sandbox.id` label from check 1, leave the session idle, then
    restart the server (`npm run dev` again) and reopen the SAME session. Expected: `docker ps
    --filter label=mastra.sandbox.id=<the same session id>` still shows the SAME container id, and
    the total count from check 1's command has not gone up. A second container under the same
    session id is the failure — reattachment is a daemon label query, so it must survive the
    restart.
  - >-
    Check 3 — the fourth concurrent session is refused with an actionable error. With
    `MASTRACODE_MAX_SANDBOXES=3` and no server restart in between, open four sessions. Expected: the
    first three each get a container (`docker ps --filter label=mastra.sandbox=true` shows three),
    and the fourth fails with an error whose text contains `MASTRACODE_MAX_SANDBOXES is 3`. Look for
    that text in BOTH places and record which one carried it: the browser surface, and the
    `npm run dev` output. The refusal is a plain `Error` thrown from the entry's `sandbox:` slot, not
    a coded `MaterializeError` with a mapping in `@mastra/factory/dist/routes/surface.js`, so it may
    reach only the server log — if the browser shows a generic failure while the log carries the
    message, the cap worked and the surfacing is the gap to report, not a failed check. Confirm the
    host did not thrash — no fourth container was created, and memory did not go into swap
    (`colima ssh -- free -m`, or Activity Monitor for the VM). Then free a slot the way the code
    actually releases one: DELETE one of the three sessions (closing its view releases nothing).
    Expected: the container for that session goes away and a newly opened session is admitted — but
    not instantly, because the slot is released only once that container's stop completes, so re-try
    the new session if the first attempt still refuses. Counted per server process, so do not restart
    mid-check.
  - >-
    Check 4 — the checkout is inside the container and nowhere on this host. After a session has
    cloned its repository, `docker exec <container id> ls /workspace` must show a directory named
    after the repository alone (no owner segment). Then confirm the host has no copy:
    `ls ~/.mastracode/web/sandboxes 2>/dev/null` (the LocalSandbox root — expected missing or with
    no directory for this session) and
    `find ~ -maxdepth 4 -type d -name '<repo name>' -not -path '*/node_modules/*' 2>/dev/null`
    outside this Factory checkout itself. A checkout appearing on the host means
    `FACTORY_SANDBOX_PROVIDER` did not reach the server and the session fell through to `local`.
  - >-
    Nothing in this story's diff can be confirmed by the verify gate beyond the unit tests: no
    container is ever created there. If any check above fails, do not confirm the story — report
    which check and its output, since checks 1, 2 and 4 distinguish "configuration did not reach the
    server" from "the code is wrong", and only check 3 exercises first-party logic.
---

<intent-contract>

## Intent

**Problem:** Story 2.5's third acceptance criterion (FR7) requires a session request past
`MASTRACODE_MAX_SANDBOXES` to return an actionable error naming the cap — and no such cap exists.
`grep -rl MAX_SANDBOXES node_modules` returns nothing, and `@mastra/factory/dist/factory.js:259`
refuses the option outright: *"'maxSandboxes' is gone with the sandbox fleet — there is one sandbox
per session and no pool to cap."* Factory's only session registry is a memo
(`sandbox/session-sandbox.js:6,13-24`) that constructs unconditionally, and `dispatcher.maxInFlight`
queues background dispatches rather than refusing sessions. So a fourth concurrent session today gets
its own full 10 GiB / 4-core ceiling and the 32 GiB VM is oversubscribed, silently. `deferred-work.md`
DW-27 recorded this and handed the call to this story: *"either a first-party cap in the entry … or
Story 2.5 re-scoped."* Separately, nothing committed tells the operator to set
`FACTORY_SANDBOX_PROVIDER` before opening a session — and with it unset, `selectSandbox` falls through
to `LocalSandbox`, which clones the repository **onto this host**, which is what this story's fourth
criterion forbids.

**Approach:** Implement the cap as first-party behaviour in the entry's docker branch — the only place
it can live — so a session past the limit is refused with an error that names the key, its value and
what to do, and so a *reattaching* session is never refused. Then correct every committed statement
that says the key enforces nothing (`.env.schema`, `.env.example`, `sandbox/README.md`), give
`MASTRACODE_MAX_SANDBOXES` an owning-subject section in `sandbox/README.md`, add the sandbox `.env`
values to `README.md`'s bring-up so the first session actually lands in a container, and park the four
running-deployment checks in `operator_actions:`.

## Boundaries & Constraints

**Always:**
- The cap is read at exactly one site (AD-6 / AGENTS.md "one read site per env key"), inside the
  entry's docker branch, through the existing `positiveInt` helper.
- The cap applies **only** to the `docker` provider. `local`, Platform and E2B are untouched: the
  number is sized from this host's memory against `FACTORY_SANDBOX_MEMORY_GIB`, which no other
  provider consumes.
- A session that already holds a container is reattaching, not claiming a new slot — it must be
  admitted even at the cap, or a resumed session becomes unreachable (AC 2 would contradict AC 3).
- Occupancy is read from each sandbox's own lifecycle `status`
  (`@mastra/core/.../mastra-sandbox.d.ts:153`, values at `workspace/lifecycle.d.ts:122`), which the
  base class moves to `stopped`/`destroyed` when Factory retires the session
  (`@mastra/factory/dist/integrations/github/sandbox-release.js`) — so a released session frees its
  slot without any timer or eviction hook.
- The refusal is thrown from the `sandbox:` slot, exactly like the existing `FACTORY_SANDBOX_IMAGE`
  refusal (`src/mastra/index.ts:318-324`), which Story 2.2 established and review accepted.
- `.env.schema` keeps the key list, validation and `@public` marking; `sandbox/README.md` states what
  the value must contain and how to choose it. Neither restates the other (NFR7).
- The entry stays indivisible: the literal `new Mastra(...)` remains in `src/mastra/index.ts`, and the
  addition is small and commented (AD-2 / NFR1 / NFR21).
- Every behavioural claim added to the entry is pinned by a test in `src/mastra/index.test.ts`, which
  is where the verify gate can see it.

**Never:**
- Never re-scope the story to "no cap exists". FR7 is a functional requirement and DW-27 names
  implementing it as this story's option; documenting the absence would leave the epic's success
  criterion unmet with nothing owed to anyone.
- Never add a `dockerOptions`/dockerode client to the entry to count real containers: the slot type is
  `(ctx: FactorySandboxContext) => MastraSandbox` — synchronous, with the contract *"construction must
  be cheap and side-effect-free"* (`sandbox/session-sandbox.d.ts:36,54`). A daemon query cannot be
  awaited there, and the async alternatives all grow the entry against AD-2.
- Never change `dispatcher.maxInFlight`, `MASTRACODE_DISPATCH_MAX_IN_FLIGHT`, or the per-container
  ceilings — they are a different limit and Story 2.2 owns them.
- Never touch `signUpEnabled` (Story 2.6), `MASTRA_HOST`/`PORT` in `.env.schema` (Story 3.2),
  `docs/` (Story 5.3), `deferred-work.md` or `sprint-status.yaml` (the orchestrator's).
- Never edit `.agents/skills/`, `package.json`, `package-lock.json`, `docker-compose.yml`,
  `tsconfig.json`, `ops/`, `AGENTS.md` or `.bmad-loop/policy.toml`.
- Never start a server, an engine or a container from this session: a story worktree has no `.env`, no
  engine and no image. The four checks are operator actions.
- Never put a real secret, password or connection string in a committed line (NFR18).

## I/O & Edge-Case Matrix

`selectSandbox(ctx, platformSandboxConfigured, liveSessions)` — `liveSessions` is the module-level
registry of session sandboxes this process handed out, injected for tests the same way
`platformSandboxConfigured` already is. `MASTRACODE_MAX_SANDBOXES` unset in every row unless named.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First session | `docker`, image set, registry empty | a `DockerSandbox` keyed on the session id, registered | No error expected |
| At the documented default | `docker`, 3 distinct session ids already registered and live | the 4th distinct id is refused | `Error` naming `MASTRACODE_MAX_SANDBOXES` and the value `3` |
| Cap raised | `MASTRACODE_MAX_SANDBOXES=5`, 4 live | admitted | No error expected |
| Reattach at the cap | 3 live, the request is for an id already registered | admitted, no new slot consumed | No error expected |
| Session released | 3 live, one sandbox's `status` is `stopped` or `destroyed` | that entry is dropped; the next distinct id is admitted | No error expected |
| Start failed | a registered sandbox's `status` is `error` | it keeps its slot | No error — its container may exist; only retirement frees it |
| Malformed cap | `MASTRACODE_MAX_SANDBOXES` is `0`, `-1`, `2.5`, `abc` or blank | falls back to the default, 3 | No throw — same fall-back as the sibling ceilings |
| Image unset **and** at the cap | `docker`, no image | refused naming `FACTORY_SANDBOX_IMAGE` | The image is checked first: it breaks every session, the cap only this one |
| Refusal is terminal | at the cap, with `MASTRA_PROJECT_ID` / `E2B_API_KEY` set | throws | Never falls through to a cloud provider — that would relocate work off-host (NFR12) |
| Non-docker providers | `local`, or Platform/E2B selected | no cap applied, registry untouched | No error expected |

</intent-contract>

## Code Map

- `src/mastra/index.ts` -- **the behaviour change.** `:275-281` is the comment block that currently
  states the cap enforces nothing — it is the text this story falsifies. `:286-297` the ceiling
  constants (`DOCKER_SANDBOX_CPU_PERIOD_US`, `..._DEFAULT_CPUS`, `..._DEFAULT_MEMORY_GIB`,
  `..._PIDS_LIMIT`, `..._TIMEOUT_MS`, `DEFAULT_SANDBOX_WORKDIR`) — the new default belongs beside them.
  `:311-356` `dockerSandboxOptions()`, including `:318-324` the `FACTORY_SANDBOX_IMAGE` refusal, the
  precedent for throwing out of this slot. `:372-405` `selectSandbox()`; `:380-381` the one
  `FACTORY_SANDBOX_PROVIDER` read and the docker branch to extend; `:372` the injected
  `platformSandboxConfigured` parameter, whose doc comment (`:364-369`) states the injection pattern to
  follow for the registry. `:50-55` `positiveInt`, the parser every capacity knob uses. `:485` the
  production call site `sandbox: ctx => selectSandbox(ctx, hasPlatformSandboxEnv)` — must keep working
  unchanged, so the new parameter is defaulted.
- `src/mastra/index.test.ts` -- **where the claim is pinned.** `:34-60` the env sweep: `MASTRACODE_`
  is a swept prefix, so `MASTRACODE_MAX_SANDBOXES` is unset for every test unless stubbed. `:308-446`
  `describe('dockerSandboxOptions')` and `:459-539` `describe('selectSandbox')` — the new block goes
  after the latter and reuses its `ctx` shape (`:461-466`) and `IMAGE` constant. `:495-510` the
  image-refusal test is the model for "the refusal must not fall through to a cloud provider": it sets
  the platform and E2B variables so a regression that returns instead of throwing is visible. 46 tests
  pass today.
- `.env.schema` -- **key list, comment is wrong.** `MASTRACODE_MAX_SANDBOXES` is declared at the end of
  the sandbox section with `@public @type=string(matches="^(|[0-9]+)$")`; its comment says *"Nothing in
  the installed packages reads it … it constrains nothing today"*. Only the comment changes: the
  annotation and the type stay (the `string(matches=…)` deprecation is an open deferred item that
  belongs to a deliberate pass over all three keys carrying it, not to this story).
- `.env.example` -- **mirrors those comments verbatim**, commented-out assignment. Same correction.
- `sandbox/README.md` -- **the owning subject README.** `:3-6` the owned-key list to extend. `:80-86`
  and `:93-97` are the two paragraphs asserting the three is *"not a limit anything applies"* — both
  now false. `:87-97` `## FACTORY_SANDBOX_CPUS` is the section the new one follows; `:69-86`
  `## FACTORY_SANDBOX_MEMORY_GIB` carries the 32 GiB arithmetic the cap defends. `:136-151`
  `## If a session fails to start` — the refusal belongs there beside the image and daemon failures.
  `:239-246` the tag history, whose top row `factory-sandbox:2026-09-23` is the tag Story 2.1's
  operator confirm recorded.
- `README.md` -- **the bring-up that stops one step short.** `:9-119` `## Start the Factory Server`
  (five numbered steps, Story 2.4's). `:121-127` `## Run your first issue` walks the operator into
  opening a session with no sandbox key set. `:155-169` the "Configure your Factory" paragraph that
  names `FACTORY_SANDBOX_PROVIDER=docker` and points at `sandbox/README.md` — the values exist in
  prose but not in the procedure. `:205-212` Troubleshooting, whose `Sign-in:` bullet is the pattern.
- `@mastra/factory/dist/factory.js:259` -- **read-only.** Throws for an options-object `sandbox:`:
  *"'maxSandboxes' is gone with the sandbox fleet — there is one sandbox per session and no pool to
  cap."* The proof no package-level cap exists.
- `@mastra/factory/dist/sandbox/session-sandbox.js:6,13-24` -- **read-only.** `sessionSandboxes`, a
  per-process memo; `getSessionSandbox` constructs unconditionally on a miss, so the entry's slot is
  called once per new session id and never for a memoized one. `:57` `evictSessionSandbox` — dropped on
  stop/destroy/retirement or construction failure.
- `@mastra/factory/dist/workspace.js:203,276,303` -- **read-only.** `createSessionSandboxInstance` *is*
  the entry's slot; `constructSessionEntry()` is called un-caught at `:303`, so a throw propagates out
  of the session's workspace resolution (wired at `factory.js:380`). `:296-301` catches only `start()`
  failures, not construction.
- `@mastra/docker/dist/index.js` -- **read-only.** `:423` `status = "pending"` at construction.
  `:493` labels every container `mastra.sandbox=true` and `mastra.sandbox.id=<id>`. `:794-804`
  `listContainers({ all: true, filters: { label: ['mastra.sandbox.id=<id>'] } })` — the reattach
  lookup is a **daemon query**, so a resumed session finds its container across a server restart.
  `:533-588` create-then-start; `:603-619` warns that ceilings are not re-applied to an existing
  container. `:645`/`:657` the only `stop`/`remove`; no `AutoRemove`, no idle teardown.
- `@mastra/core/dist/workspace-_WoSs-8p.js:3833-3850,3944-3950,3989-3995` -- **read-only.** The base
  class's status transitions: `starting`→`running`, `stopping`→`stopped`, `destroying`→`destroyed`,
  `error` on any failure. `ProviderStatus`'s ten values are at `workspace/lifecycle.d.ts:122`.
- `@mastra/factory/dist/integrations/github/sandbox.js:176,518` -- **read-only.** `git --version` and
  `gh --version` are probed inside the sandbox; failure is `MaterializeError(…, 'git-missing')` /
  `'gh-missing'`, surfaced as `repository_git_missing` / `repository_cli_missing`
  (`routes/surface.js:24-33`). `:184-193` the clone: `git clone --depth=1 …` run through
  `sandbox.executeCommand`, into `<workingDirectory>/<repo>` for the docker provider
  (`sandbox/workdir.js:34-44`) — nothing on the host.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- **read-only, the orchestrator's ledger.**
  DW-27 is the entry this story answers; DW-26 records that nothing tears a container down on idle,
  which is why the cap's per-process scope matters.
- Baseline revision `4455939f39c4505e3cd7b071965b27b4c96b6c75`; tree clean at start.

## Tasks & Acceptance

**Execution:**
- `src/mastra/index.ts` -- add the cap to the docker branch: a `DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES`
  constant of `3` beside the other ceiling constants; a module-level `Map<string, MastraSandbox>` of
  the session sandboxes this process handed out; a private admission helper that drops entries whose
  `status` is `stopped` or `destroyed`, admits an already-registered id unconditionally, reads
  `process.env.MASTRACODE_MAX_SANDBOXES` once through `positiveInt`, and otherwise throws an `Error`
  naming the key, its effective value and the live count, telling the operator to finish a session or
  raise the key only if the host has memory for another container. Wire it into `selectSandbox`'s
  docker branch **after** the image check and **before** `new DockerSandbox(...)`, registering the
  instance only once construction succeeded, and add the registry as a third defaulted parameter of
  `selectSandbox` so a test can inject its own — matching how `platformSandboxConfigured` is already
  passed in. Rewrite the `:275-281` comment, which currently asserts the opposite. -- FR7 has no
  implementation anywhere in the installed stack, so without this the story's central claim is false.
- `src/mastra/index.test.ts` -- add a `describe` block covering every row of the matrix: refusal at the
  default with the key and the number in the message, admission of exactly the cap, a raised cap, a
  reattaching id admitted at the cap, a slot freed by `stopped`/`destroyed`, a slot held by `error`,
  every malformed value falling back to 3, the image check winning over the cap, the refusal not
  falling through to a configured platform/E2B, and the non-docker providers being uncapped. --
  `tsc` cannot see a capacity rule and no container is ever created in the gate, so these assertions
  are the only automated witness.
- `.env.schema` -- replace the `MASTRACODE_MAX_SANDBOXES` comment with what it now does: the maximum
  docker-provider session containers this server process runs at once, non-positive or malformed
  values falling back to 3, the refusal naming the key, and that the count is per server process.
  Leave the annotation, the type and every other key untouched. -- the file is the only list of keys
  and currently documents the key as inert.
- `.env.example` -- apply the same corrected comment above the commented-out assignment, so the two
  files still agree. -- they are read as one pair; a stale half is worse than neither.
- `sandbox/README.md` -- add `MASTRACODE_MAX_SANDBOXES` to the owned-key list at the top and a
  `## MASTRACODE_MAX_SANDBOXES` section after `## FACTORY_SANDBOX_CPUS` stating what the value must
  contain and how to choose it (3 on this host, the same arithmetic the memory section already
  carries), that there is no value meaning "unlimited", and that the count is per server process so
  containers left by an earlier process are not counted. Correct the two paragraphs that call the
  three "not a limit anything applies", and add the refusal to `## If a session fails to start`. --
  the subject README is normative for what the value must contain, and three of its paragraphs are now
  false.
- `README.md` -- add one numbered step to `## Start the Factory Server`, after step 5, giving the
  `.env` lines a session needs before the first one is opened — `FACTORY_SANDBOX_PROVIDER=docker`,
  `FACTORY_SANDBOX_IMAGE=factory-sandbox:<YYYY-MM-DD>` and `MASTRACODE_MAX_SANDBOXES=3` — stating that
  with the provider unset the checkout lands on **this host** instead of in a container, and pointing
  at `sandbox/README.md` for the values rather than restating them. Add one `Sessions:` bullet to
  Troubleshooting. -- `## Run your first issue` currently walks the operator straight into a session
  with no sandbox configured, which is the fall-through this story's fourth criterion forbids.

**Acceptance Criteria:**
- Given no cap exists anywhere in the installed packages, when a fourth distinct session is requested
  from the docker branch with three live, then `selectSandbox` throws, and the message contains the
  literal `MASTRACODE_MAX_SANDBOXES` and the effective limit.
- Given a session is resumed rather than created, when `selectSandbox` is called at the cap for a
  session id the registry already holds, then it returns a sandbox instead of throwing — so AC 2's
  reattachment is never defeated by AC 3's cap.
- Given caps must refuse rather than relocate (NFR12), when the refusal fires with
  `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PROJECT_ID`, `MASTRA_ENVIRONMENT_ID` and `E2B_API_KEY` all
  set, then it still throws and no Platform or E2B sandbox is returned.
- Given the key is read at one site (AGENTS.md), when `grep -n MASTRACODE_MAX_SANDBOXES
  src/mastra/index.ts` runs, then exactly one line is a `process.env` read.
- Given `.env.schema` is the only key list and `sandbox/README.md` owns the values (NFR7), when both
  are read, then neither says the key enforces nothing, the README carries what the value must contain
  and how to choose it, and the schema carries no "how to obtain it" prose.
- Given the docker branch is the only capped one, when `FACTORY_SANDBOX_PROVIDER` is `local`, unset or
  unrecognised, then the registry is untouched and no refusal is possible.
- Given the entry must stay indivisible (AD-2 / NFR1), when the diff is read, then the literal
  `new Mastra(...)` is still in `src/mastra/index.ts`, no construction moved into a helper module, and
  no file outside `src/` holds first-party TypeScript.
- Given `README.md`'s procedure ends before a session is opened, when the committed README is read,
  then it names the three sandbox `.env` values, says the checkout lands on this host while
  `FACTORY_SANDBOX_PROVIDER` is unset, and points at `sandbox/README.md` for the values rather than
  restating them.
- Given secrets never enter the repo (NFR18), when the diff against `4455939` is read, then no added
  line carries a usable key, password or connection string, and `.env` stays gitignored.
- Given the verify gate, when `npm ci --no-audit --no-fund`, `npm run check`, `npx varlock load
  --format json`, both path guards and `npm test` run in order in a worktree with no `node_modules/`,
  then every one exits 0 and the pre-existing 46 tests still pass alongside the new ones.
- Given the container, the reattachment, the refusal and the host-filesystem check all need a running
  server, a live engine and a real `.env`, when this session finishes its committable work, then the
  story parks at `awaiting-operator` with those four checks enumerated in `operator_actions:`.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 23 findings — high 0, medium 13, low 9, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` A session being torn down keeps its slot while `sandbox/README.md` promised "frees its slot immediately" — Verified: `_executeStop` sets `stopping`, awaits the teardown hook and `container.stop({ t: 10 })`, and only then sets `stopped` (`@mastra/core/dist/workspace-_WoSs-8p.js:3943-3952`). Operator check 3 would intermittently read as a failure on correct code. Grouped with the release-semantics rows below. Patched: the entry's doc comment, `sandbox/README.md` and operator check 3 now say release lands when the container stop completes.
  - `[medium]` `[patch]` "Finish or close a running session" is not what frees a slot — Verified by grepping every caller of `releaseSessionSandbox`: only session deletion (`@mastra/factory/dist/integrations/github/routes.js:999`) and `SessionRetirementCoordinator` (`sandbox/session-retirement.js:116`, reached from work-item terminal retirement and repository unlink). Closing a session view retires nothing, so an operator could follow the error message exactly and still be refused. Patched: the thrown message, `sandbox/README.md` and operator check 3 now name the two real triggers.
  - `[medium]` `[patch]` The documented fall-back is unreachable for most values it names — Verified by running the gate's own command: `MASTRACODE_MAX_SANDBOXES=abc npx varlock load --format json` exits 1, as do `-1`, `2.5` and `1e3`; only blank and `0` exit 0. `npm start` is `varlock run`, so those values stop the boot rather than defaulting to 3. Patched: the sentence is qualified in `.env.schema`, `.env.example` and `sandbox/README.md`; the `@type` annotation is untouched (its `string(matches=…)` deprecation is a separate open deferred item).
  - `[low]` `[patch]` The refusal said "live session containers" while the registry counts constructed sandboxes — Verified: `@mastra/docker/dist/index.js:423` sets `status = "pending"` at construction and the container is created in `start()`, so a session opened and abandoned before start holds a slot with no container, contradicting the `docker ps` cross-check the README hands the operator. Patched: the message now counts "live sessions".
  - `[low]` `[patch]` A slot held by a failed start can only be reclaimed by restarting the server, and nothing said so — Real: there is no session to finish, and raising the key needs a restart anyway. Grouped with the release-semantics rows. Patched: stated in the entry's comment, `sandbox/README.md`'s new section and its "If a session fails to start" bullet.
  - `[medium]` `[patch]` The older `describe('selectSandbox')` block still registers `session-abc` in the production registry, contradicting the new block's own comment — Verified in the diff: those tests call `selectSandbox(ctx, false)` with two arguments. Harmless today only because they reuse one session id. Grouped with the verification-gap row below; patched by the new test, which clears the shared map before and after.
  - `[medium]` `[patch]` Nothing established that the refusal text reaches the operator — Verified: the cap throws a plain `Error` from the `sandbox:` slot, not a coded `MaterializeError` with a mapping in `@mastra/factory/dist/routes/surface.js:24-33` like `git-missing`/`gh-missing`, so it may land only in the server log. Patched: operator check 3 now says to look in both the browser surface and the `npm run dev` output, and that a log-only message means the cap worked and the surfacing is the gap to report.
  - `[low]` `[patch]` README step 6's checkpoint could not be met inside step 6 — Verified against `README.md:11` ("Do not move past a step whose checkpoint does not hold") and step 6's opening "once you have opened a session in … below". Grouped with the step-ordering row. Patched: step 6 now has an in-place checkpoint (the three keys present, the tag in the local image store, the server restarted) and the `docker ps` observation forward-references "Run your first issue" explicitly.
  - `[low]` `[patch]` Step 6's keys arrive after `.env` was composed and the server booted, forcing a second restart — Real and avoidable. Grouped with the row above. Patched: one clause saying the three keys can go into step 1's block up front.
  - `[low]` `[patch]` "Configure your Factory" still framed docker/local as neutral overrides and never mentioned the cap — Verified at `README.md:155-169`: a reader of that section alone gets the pre-story picture. Patched: one cross-reference sentence naming step 6, the unset-provider host-checkout consequence and `MASTRACODE_MAX_SANDBOXES` as the third sandbox key, without restating values `sandbox/README.md` owns.
  - `[low]` `[reject]` Nothing is logged at boot about the effective cap, nor on a refusal — Real but the fix is new behaviour in the entry (two log sites), not a direct correction, and AD-2 keeps this diff small; the refusal already carries the key and its value in its own message.
  - `[medium]` `[patch]` A `stop()`/`destroy()` that throws leaves `status: 'error'`, burning that slot until the process restarts — Verified: `session-retirement.js:114-128` awaits `releaseSessionSandbox` inside a `try/catch` that only warns, and the base class sets `error` on a throw (`workspace-_WoSs-8p.js:3950,3995`). Grouped with the release-semantics rows. Patched as documentation: the proposed code fix needs a retired-id set this file cannot observe.
  - `[medium]` `[patch]` A session requested while another is at `stopping`/`destroying` is refused despite a freeing slot — Verified; holding the slot through teardown is correct behaviour (the container still holds its memory), so only the claim that release is instant was wrong. Grouped with the first row and patched by the same wording change.
  - `[low]` `[reject]` A session reopened while its release is still in flight registers a new sandbox over the one tearing down — Real but benign: both instances resolve the same container name and label, the slot count stays at one, and the reopened instance's own `start()` restarts the container. The proposed fix awaits or tracks in-flight releases — new state and complexity for a race Factory does not drive.
  - `[false]` `[reject]` Factory evicts the session memo at `workspace.js:493` without calling `stop()`/`destroy()`, pinning the slot — Refuted: that eviction leaves the container **running**, so the slot correctly reflects a container that still exists. A later reopen of the same id is admitted as a reattach and overwrites the entry; a later retirement stops it. The leaked-container case is pre-existing (DW-26) and the held slot is the honest accounting of it.
  - `[medium]` `[patch]` `.env.schema`'s `@type` rejects `-1`/`2.5`/`abc` rather than falling back — Same root cause as the fall-back row above; grouped and patched by the same wording change.
  - `[low]` `[reject]` `positiveInt` accepts any safe integer, so `MASTRACODE_MAX_SANDBOXES=1e9` effectively disables the cap — An operator writing that has chosen no cap, exactly as `FACTORY_SANDBOX_MEMORY_GIB=999999` chooses no memory ceiling; "no value disables the cap" means there is no off-switch sentinel, not that the number is bounded. The fix adds a clamp — a guard, not a correction. `positiveInt`'s lenient spellings are already pinned by an existing test and recorded as DW-13.
  - `[low]` `[reject]` An empty `ctx.sessionId` would make every such session share one slot and one container id — Not shown reachable: `sessionId` is a stored session row's id, and the same value already keys the container name and label in the pre-existing code. The fix adds a guard for a state never demonstrated.
  - `[medium]` `[patch]` The spec and the entry's comment claimed reading `status` "IS the release hook, with nothing to keep in sync" — Same root cause as the failed-teardown row; grouped and patched by the same comment rewrite.
  - `[medium]` `[patch]` `sandbox/README.md`'s "Finishing or closing a running session frees its slot immediately" — Same root cause as the first row; grouped and patched together.
  - `[medium]` `[patch]` The matrix row "Malformed cap → no throw" is true only off the varlock path — Same root cause as the fall-back row; grouped. Patched in the three committed files; the matrix itself is inside `<intent-contract>` and read-only, and the rows it describes remain exactly what `npm run dev` produces.
  - `[medium]` `[patch]` (verification-gap layer, filed pre-verified) The production registry is never exercised — every cap test injects its own `Map`, so changing `selectSandbox`'s default parameter to `= new Map()`, which disables the cap in the only place it runs, left all 57 tests and `tsc` green. Patched: `liveDockerSandboxes` is exported under the file's test-only convention and a twelfth test drives the shared default with two-argument calls. Re-verified independently this session by applying that same mutation: it now fails exactly one test (`1 failed | 57 passed`), and the file was restored and the suite re-run green.
  - `[medium]` `[patch]` (verification-gap layer, `Other findings`) The fall-back sentence is wrong under varlock — Same root cause as the fall-back row above; grouped and patched together. The layer had run `varlock load` for each value itself, which is how the split between `0`/blank and everything else was established.

Intent-alignment auditor filed no findings — its report is descriptive by instruction. It read the diff as implementing the "the cap is missing and must be written first-party" reading, recorded that the host-level reading (count real containers via the engine) is declined with a stated reason and carried in `deferred`, and named the structural gap this story cannot close: three of the four acceptance criteria live at the running-deployment surface while the diff's automated witness is a pure function over an injected `Map`, so their outcome arrives as an operator report rather than as an artifact in the repository.

## Design Notes

**Why the cap lives in the entry and nowhere else.** Three candidate layers were read out of the
installed packages and two were ruled out by their own code. `@mastra/factory` removed the concept:
`factory.js:259` throws for an options-object `sandbox:` with *"'maxSandboxes' is gone with the sandbox
fleet"*, and its session registry (`sandbox/session-sandbox.js:13-24`) is a memo that constructs
unconditionally with no count and no refusal path. `dispatcher.maxInFlight` is a different limit — at
its ceiling `dispatcher.js:293-295` claims nothing this tick and retries, which is backpressure on
background dispatches, not a refusal, and a long-lived session's container outlives the dispatch that
created it. The `sandbox:` slot is the one place first-party code runs per new session, and it already
refuses there for a missing image. So the cap goes there.

**Why occupancy is counted by `status` rather than by a counter.** A counter needs a decrement, and
nothing hands the entry a release hook: Factory retires sessions through its own
`releaseSessionSandbox`, which calls `stop()`/`destroy()` on the instance it memoized — the very object
the slot returned. The base class moves `status` to `stopped`/`destroyed` in those calls
(`workspace-_WoSs-8p.js:3944-3950,3989-3995`), so reading the status *is* the release hook, with no
API to subscribe to and nothing to keep in sync. `error` is deliberately **not** treated as released:
`_executeStart` sets it when the start lifecycle throws, and the session setup hook (clone, checkout,
setup command) runs after the container is already created and started — so an `error` sandbox very
often still owns a running container, and freeing its slot would overcommit the host exactly when
something is already wrong.

**Why the cap cannot be exact, and what that costs.** It counts the sandboxes *this process* handed
out. Docker containers have no idle teardown (`deferred-work.md` DW-26) and reattachment is a daemon
label query (`@mastra/docker/dist/index.js:794-804`), so containers survive a server restart while the
registry does not — after a restart with three containers still up, three more sessions are admissible.
Closing that needs a `docker ps` by `mastra.sandbox=true`, which is async, and the slot is
`(ctx) => MastraSandbox` with a *"cheap and side-effect-free"* construction contract
(`session-sandbox.d.ts:36,54`): there is nowhere to await it without either an async slot the type
forbids or a dockerode client in the entry, against AD-2. The gap is recorded in `deferred` rather than
papered over, and `sandbox/README.md` states the per-process scope so the operator can see it.

**Why the default is 3 rather than "unlimited when unset".** The two sibling ceilings in the same
block already carry host-specific defaults — `FACTORY_SANDBOX_MEMORY_GIB` 10 and
`FACTORY_SANDBOX_CPUS` 4 — and a blank `.env` line falls back to them rather than to no limit. The cap
is the third leg of the same arithmetic (3 × 10 GiB = the VM's 32 GiB), so making it the only one that
disappears when unset would hand the FR7 guarantee to a `.env` line, which is the failure mode this
epic removes everywhere else. The consequence is stated plainly: no value disables the cap, `0` falls
back to 3 like every other malformed input, and raising it is the supported move.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exits 0 in a worktree with no `node_modules/`
- `npm run check` -- expected: exits 0
- `npm test` -- expected: exits 0, the 46 pre-existing tests plus the new cap block all passing
- `npx varlock load --format json` -- expected: exits 0 with no `.env` present
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected: 0
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: 0
- `grep -n 'MASTRACODE_MAX_SANDBOXES' src/mastra/index.ts` -- expected: exactly one `process.env` read
- `grep -n 'new Mastra(' src/mastra/index.ts` -- expected: the literal is still here
- `grep -rn 'nothing enforces it\|not a limit anything applies\|constrains nothing\|nothing reads it' .env.schema .env.example sandbox/README.md src/mastra/index.ts` -- expected: no match
- `git diff 4455939f39c4505e3cd7b071965b27b4c96b6c75 --stat` -- expected: `src/mastra/index.ts`,
  `src/mastra/index.test.ts`, `.env.schema`, `.env.example`, `sandbox/README.md`, `README.md` and this
  spec only
- `git diff 4455939f39c4505e3cd7b071965b27b4c96b6c75 -- package.json package-lock.json docs AGENTS.md ops docker-compose.yml tsconfig.json .bmad-loop _bmad-output/implementation-artifacts/deferred-work.md _bmad-output/implementation-artifacts/sprint-status.yaml` -- expected: empty
- `grep -n 'signUpEnabled' src/mastra/index.ts` -- expected: still `signUpEnabled: true`
- `grep -nE 'MASTRA_HOST|^PORT' .env.schema .env.example` -- expected: no match (Story 3.2's)
- `git check-ignore -v .env` -- expected: matched by `.gitignore`

**Manual checks (if no CLI):**
- Read the new refusal message against `sandbox/README.md`'s new section and confirm the key name, the
  default and the remedy agree in both, and that the README states no value disables the cap.
- Read the registry's release condition against `@mastra/core/dist/workspace-_WoSs-8p.js:3944-3995` and
  confirm the statuses it drops are exactly the ones `stop()` and `destroy()` produce.

## Auto Run Result

Status: awaiting-operator
Blocking condition: none — the story is complete as far as an agent can take it. Opening a session,
reattaching one across a restart, requesting a fourth and inspecting where the checkout landed all
need a running server, a live Docker engine, the image from Story 2.1 and the account from Story 2.4,
none of which exists in a story worktree.

**Implemented change.** FR7 — "a session request past `MASTRACODE_MAX_SANDBOXES` returns an
actionable error rather than thrashing the host" — had no implementation anywhere in the installed
stack. `@mastra/factory` refuses the option outright (`factory.js:259`: *"'maxSandboxes' is gone with
the sandbox fleet"*), its session registry is a memo that constructs unconditionally, and
`dispatcher.maxInFlight` queues background dispatches rather than refusing sessions. `deferred-work.md`
DW-27 recorded the gap and handed this story the choice between implementing the cap and re-scoping.
This story implements it, in the one place first-party code runs per new session: the entry's
`sandbox:` slot, which already refuses there for a missing `FACTORY_SANDBOX_IMAGE`. A module-level map
of the session sandboxes this process handed out is pruned by each sandbox's own lifecycle `status`,
an already-registered id is admitted as a reattach, and a genuinely new session past the cap is
refused with an error naming the key, its value and what actually frees a slot. Alongside it, every
committed statement that said the key enforces nothing was corrected, `sandbox/README.md` took
ownership of the value, and `README.md`'s bring-up gained the step that was missing: with
`FACTORY_SANDBOX_PROVIDER` unset the server silently falls through to `LocalSandbox` and clones onto
this host, which is exactly what this story's fourth criterion forbids.

**Files changed.**
- `src/mastra/index.ts` — the behaviour. `DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES = 3` beside the two
  sibling ceilings, the `liveDockerSandboxes` registry (exported for tests only), the
  `admitDockerSession` helper, and the docker branch reordered to resolve the image, admit, construct,
  then register. The comment block that asserted the opposite was rewritten.
- `src/mastra/index.test.ts` — 12 new tests, one per matrix row plus one that drives the production
  registry through two-argument calls.
- `.env.schema` / `.env.example` — the `MASTRACODE_MAX_SANDBOXES` comment replaced with what the key
  now does, including which values reach the fall-back and which fail `varlock load`. Annotations and
  types untouched.
- `sandbox/README.md` — `MASTRACODE_MAX_SANDBOXES` added to the owned-key list and given its own
  section; the two paragraphs calling three "not a limit anything applies" corrected; a refusal entry
  added to "If a session fails to start".
- `README.md` — step 6 "Where agent sessions run" with the three `.env` lines and an in-place
  checkpoint, a cross-reference from "Configure your Factory", and a **Sessions:** troubleshooting
  bullet.

**Review findings.** Four layers, **23 findings — high 0, medium 13, low 9, false 1, maybe-false 0**.
Seven grouped entries patched (**4 medium, 3 low**), none newly deferred, five rejected:
- Patched (medium): what actually frees a slot — the message and three documents claimed closing a
  session releases one and that release is instant, when the only release paths are session deletion
  and work-item terminal retirement, the slot is held until the container stop completes, and a
  teardown that throws holds it until the server restarts; the documented "falls back to 3" for
  malformed values, which is true only under `npm run dev` because `varlock load` rejects `abc`,
  `-1`, `2.5` and `1e3` outright and `npm start` runs through varlock; the production registry having
  no automated witness — the verification-gap layer showed that defaulting `selectSandbox`'s new
  parameter to `new Map()`, which disables the cap entirely, left all 57 tests and `tsc` green; and
  operator check 3 asserting the refusal text without saying where to look for it, when the cap
  throws a plain `Error` with no `surface.js` mapping and may reach only the server log.
- Patched (low): the message counting "containers" while the registry counts constructed sandboxes,
  some of which are `pending` with no container yet; README step 6 having a checkpoint it could only
  satisfy in the next section, and adding three keys after the server had already booted; and
  "Configure your Factory" still presenting docker and local as neutral overrides with no mention of
  the cap or of the host checkout.
- Rejected: boot and refusal logging (new behaviour in the entry, not a correction, and the refusal
  already names the key); a reopen racing an in-flight release (benign — both instances resolve the
  same container, the count stays at one, and the fix needs new state); the claim that evicting the
  session memo without stopping pins a slot (refuted — the container is still running, so the slot is
  the honest accounting); an unbounded `MASTRACODE_MAX_SANDBOXES` "disabling" the cap (an operator
  writing `1e9` has chosen no cap, exactly as with the memory ceiling, and the fix is a clamp); and a
  guard for an empty `sessionId`, a state never shown reachable and already load-bearing in the
  pre-existing container name and label.

**Follow-up review recommended: true.** First pass; four medium entries were patched, which crosses
the threshold on its own. The named residual risk: the cap's release semantics are now documented
from reading `@mastra/core`'s status transitions and `@mastra/factory`'s retirement coordinator, and
nothing automated observes any of it — no test drives a real `stop()`/`destroy()`, so the claims that
`stopped`/`destroyed` are the only statuses those calls produce, that a failed teardown lands on
`error`, and that closing a session view retires nothing are assertions about vendored internals at
the versions in `package-lock.json`. A second pass should re-derive those three specifically, plus
whether `_onStop`'s teardown-command path can leave a sandbox at a status this file does not expect.
Patched counts by verdict: high 0, medium 4, low 3.

**Verification.** Every command in this spec's Verification block was re-run after the patches.
`npm run check` (`tsc --noEmit`) **0**; `npx varlock load --format json` **0** with no `.env` present;
both path guards **0**; `npm test` (`vitest run --dir src`) **0** with **58/58 passing** — the 46
pre-existing tests plus 12 new ones. `grep -n 'process.env.MASTRACODE_MAX_SANDBOXES'
src/mastra/index.ts` returns exactly one line (`:420`); the `new Mastra(...)` literal is still in the
entry; `signUpEnabled: true` is unchanged at `:189`; no match in the env files for `MASTRA_HOST` or
`PORT`; no match anywhere for the four stale phrases that said the key enforces nothing; `.env` is
matched by `.gitignore`. The diff restricted to `package.json`, `package-lock.json`, `docs`,
`AGENTS.md`, `ops`, `docker-compose.yml`, `tsconfig.json`, `.bmad-loop`, `deferred-work.md` and
`sprint-status.yaml` is empty. Two claims were checked against the tools themselves rather than by
reading: `varlock load` was run once per candidate value of `MASTRACODE_MAX_SANDBOXES` to establish
which ones boot, and the cap-wiring mutation (`= liveDockerSandboxes` → `= new Map()`) was applied and
reverted to confirm it now fails exactly one test where it previously failed none.

**Residual risks.**
- The cap is per server process, not per host. Containers have no idle teardown and reattachment is a
  daemon label query, so they outlive the registry: a restart with three containers still up admits
  three more. Recorded in `deferred` with the reason the synchronous, side-effect-free slot contract
  leaves nowhere to query the engine.
- A slot held by a sandbox whose start or teardown failed is released only by restarting the server.
  Deliberate — an errored sandbox usually still owns a running container — but it means the cap can
  tighten over a long-lived process, which only the documented restart clears.
- Where the refusal surfaces is unknown. It is a plain `Error` from the `sandbox:` slot with no
  mapping in `@mastra/factory`'s error surface, so the message may reach only the server log. Operator
  check 3 asks for both places and treats a log-only result as the cap working with a surfacing gap to
  report.
- Three of the four acceptance criteria — the container from the date-tagged image with git and gh,
  the reattach across a restart, and the checkout existing only inside the container — have no
  automated witness at all and no code change in this story; they are pre-existing package behaviour
  plus a `.env` the operator must compose. Their outcome arrives as an operator report.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — Story 2.1's image and Story 2.4's sign-in must already be done and holding: Colima running with `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"` in the shell, `docker images factory-sandbox` listing the tag from `sandbox/README.md`'s tag history, the database `healthy`, and an account that can sign in at `http://127.0.0.1:4111/signin`. Then add `README.md` "Start the Factory Server" step 6's three lines to `.env` — `FACTORY_SANDBOX_PROVIDER=docker`, `FACTORY_SANDBOX_IMAGE=factory-sandbox:<the tag you built>` and `MASTRACODE_MAX_SANDBOXES=3` — and restart `npm run dev`, because `.env` is read once at startup. With the provider line missing the checks below all pass against a checkout on this host rather than in a container, which is the failure they exist to catch.
- Check 1 — a session gets a real container from the date-tagged image, with git and gh inside it. Open a session from the UI (Work → Intake → Investigate), then run `docker ps --filter label=mastra.sandbox=true --format '{{.ID}} {{.Image}} {{.Labels}}'`. Expected: one container, its image the exact `FACTORY_SANDBOX_IMAGE` tag, carrying a `mastra.sandbox.id=<session id>` label. Then, against that container id, `docker exec <id> sh -c 'git --version && gh --version'` — both version lines must print. A failure here that names Docker Hub means the tag is not in this engine's local store; a failure naming `FACTORY_SANDBOX_IMAGE` means the key did not reach the server process. Both are in `sandbox/README.md` "If a session fails to start".
- Check 2 — a resumed session reattaches instead of provisioning a second container. Note the container id and the `mastra.sandbox.id` label from check 1, leave the session idle, then restart the server (`npm run dev` again) and reopen the SAME session. Expected: `docker ps --filter label=mastra.sandbox.id=<the same session id>` still shows the SAME container id, and the total count from check 1's command has not gone up. A second container under the same session id is the failure — reattachment is a daemon label query, so it must survive the restart.
- Check 3 — the fourth concurrent session is refused with an actionable error. With `MASTRACODE_MAX_SANDBOXES=3` and no server restart in between, open four sessions. Expected: the first three each get a container (`docker ps --filter label=mastra.sandbox=true` shows three), and the fourth fails with an error whose text contains `MASTRACODE_MAX_SANDBOXES is 3`. Look for that text in BOTH places and record which one carried it: the browser surface, and the `npm run dev` output. The refusal is a plain `Error` thrown from the entry's `sandbox:` slot, not a coded `MaterializeError` with a mapping in `@mastra/factory/dist/routes/surface.js`, so it may reach only the server log — if the browser shows a generic failure while the log carries the message, the cap worked and the surfacing is the gap to report, not a failed check. Confirm the host did not thrash — no fourth container was created, and memory did not go into swap (`colima ssh -- free -m`, or Activity Monitor for the VM). Then free a slot the way the code actually releases one: DELETE one of the three sessions (closing its view releases nothing). Expected: the container for that session goes away and a newly opened session is admitted — but not instantly, because the slot is released only once that container's stop completes, so re-try the new session if the first attempt still refuses. Counted per server process, so do not restart mid-check.
- Check 4 — the checkout is inside the container and nowhere on this host. After a session has cloned its repository, `docker exec <container id> ls /workspace` must show a directory named after the repository alone (no owner segment). Then confirm the host has no copy: `ls ~/.mastracode/web/sandboxes 2>/dev/null` (the LocalSandbox root — expected missing or with no directory for this session) and `find ~ -maxdepth 4 -type d -name '<repo name>' -not -path '*/node_modules/*' 2>/dev/null` outside this Factory checkout itself. A checkout appearing on the host means `FACTORY_SANDBOX_PROVIDER` did not reach the server and the session fell through to `local`.
- Nothing in this story's diff can be confirmed by the verify gate beyond the unit tests: no container is ever created there. If any check above fails, do not confirm the story — report which check and its output, since checks 1, 2 and 4 distinguish "configuration did not reach the server" from "the code is wrong", and only check 3 exercises first-party logic.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
