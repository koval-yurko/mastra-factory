---
title: 'Story 3.4: [operator] A Linear app that belongs to Yurii'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: '663525846f8d2576d1afe800174b1e137a8bded0'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Four `MASTRACODE_LINEAR_*RECONCILE*` keys that `@mastra/factory@0.15.0` reads are declared in
      neither `.env.schema` nor `.env.example`, so Story 5.2's criterion "every key the deployment
      sets is declared in `.env.schema`" does not hold for the Linear block either.
    evidence: |-
      `node_modules/@mastra/factory/dist/integrations/linear/reconciliation-config.js:12-17` reads
      `MASTRACODE_LINEAR_ISSUE_RECONCILE_ENABLED`, `MASTRACODE_LINEAR_RECONCILE_ENABLED`,
      `MASTRACODE_LINEAR_ISSUE_RECONCILE_INTERVAL_MS` and `MASTRACODE_LINEAR_RECONCILE_INTERVAL_MS`
      straight off `process.env`, child name first and legacy name as the fallback, defaulting to
      enabled at the five-minute interval of
      `node_modules/@mastra/factory/dist/integrations/issue-reconcile-worker.js:5,25`. `grep -c` for
      each over `.env.schema` and `.env.example` returns 0. This is the same gap DW-43 records for
      GitHub, one integration over.
      Not done here: this spec's Tasks list forbids declaring them, because declaring a key is a
      schema decision with `@public`/sensitivity and type consequences and the audit that decides
      them is Story 5.2's (`epics.md:1014-1017`). `apps/linear/README.md` documents all four as
      read-but-undeclared and unset, with the precedence rule and the default, so the operator can
      still explain an unexpected sweep without the schema growing a key this story did not decide.
    location: >-
      .env.schema, .env.example, node_modules/@mastra/factory/dist/integrations/linear/reconciliation-config.js:12-17
    severity: low
  - summary: >-
      `epics.md:749-751,768` still carries the five-scope list and makes "an @-mention of the app is
      received" a criterion of this story, so the frozen plan asserts a scope set and a capability
      that `@mastra/factory@0.15.0` cannot produce by any console action.
    evidence: |-
      This story established, against `node_modules/@mastra/factory/dist/integrations/linear/
      integration.js:330`, that the authorize URL requests exactly `read,comments:create`, and that
      `app:mentionable` plus @-mentions are unreachable at this version for three independent
      reasons — the scope is not requested, `actor=app` is never sent (`integration.js:326-332`),
      and neither a Linear webhook route nor an `AgentSessionEvent` handler exists anywhere in the
      package (`grep -rn "webhook" .../integrations/linear/` and
      `grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/` both return
      nothing). `apps/linear/README.md`, `.env.schema`, `.env.example` and §6 of
      `docs/Self-hosting research.md` are corrected; `epics.md` is not, so it is now the only place
      still asserting both.
      Not done here: `epics.md` is the frozen sprint plan this story is dispatched from, and
      rewriting a story's own acceptance premise mid-run would change the record the run is judged
      against. The operator-facing documents are corrected and are the ones AD-6 makes normative;
      the epics correction belongs to a retrospective or a plan amendment. The same correction is
      owed to the user-level memory note "Mastra Factory Linear OAuth scopes", which records the
      five-scope list and singles out `app:mentionable`.
    location: >-
      _bmad-output/planning-artifacts/epics.md:749-751,768
    severity: medium
  - summary: >-
      The §11 trap-table row at `docs/Self-hosting research.md:670` still reads "all-or-nothing; one
      alone is a boot error", the symmetric claim this story disproved, because the row is a table
      row and this spec forbids editing one.
    evidence: |-
      `docs/Self-hosting research.md:670` is `| `LINEAR_CLIENT_ID` / `_SECRET` | all-or-nothing; one
      alone is a boot error |`. The real behaviour is asymmetric: the secret without the id fails
      varlock at `npm run start` and names `LINEAR_CLIENT_ID` (`.env.schema:395`), while the id
      without the secret passes validation and leaves the integration unbuilt and unlogged
      (`src/mastra/index.ts:242-243`, a ternary). The boot error that does exist is the state-signer
      one (`node_modules/@mastra/factory/dist/factory.js:369`,
      `.../integrations/linear/integration.js:306`), which the row does not mention.
      Not done here: this spec's Never list forbids adding, removing or changing any table row or
      heading in that file — §6 and §11 are a dated research record corrected by appending, and the
      appended 2026-09-23 paragraph under §6 now carries the correction. §6 already tells the reader
      that `apps/linear/README.md` wins on disagreement, so the stale row is shadowed rather than
      authoritative; a §11 pass that re-reads every trap row at once is the right owner.
    location: >-
      docs/Self-hosting research.md:670
    severity: low
  - summary: >-
      The user-level memory note "Mastra Factory Linear OAuth scopes" still records the five-scope
      list and singles out `app:mentionable` as the easily-missed one, so the note contradicts the
      repository it describes and will be recalled into future sessions as fact.
    evidence: |-
      The note records five permissions observed on a consent screen on 2026-09-21 and maps them to
      `read`, `write`, `issues:create`, `comments:create`, `app:mentionable`, adding "`app:mentionable`
      is the easily-missed one: without it Factory can't be @-mentioned in Linear". This story
      established that the observation is of Mastra's *hosted* consent screen and is true of a client
      this deployment never constructs: `src/mastra/index.ts:36` imports `LinearIntegration`, whose
      `buildAuthorizeUrl` requests `read,comments:create`
      (`node_modules/@mastra/factory/dist/integrations/linear/integration.js:330`), and mentions are
      unreachable at `0.15.0` for three independent reasons. The note also repeats the symmetric
      boot-error claim this story disproved.
      Not done here: the memory store is outside the repository and outside this story's diff, and
      rewriting a user-level note is not a change a story worktree can commit or a reviewer can see.
      The correction is the same one already recorded for `epics.md`; it needs an owner with write
      access to the memory directory.
    location: >-
      user memory: mastra-factory-linear-oauth-scopes.md
    severity: medium
  - summary: >-
      `epic-3-context.md` still carries the two claims this story disproved, and it is the file the
      remaining Epic 3 stories load as their primary planning context.
    evidence: |-
      `_bmad-output/implementation-artifacts/epic-3-context.md:45-46` states "The mention-capability
      scope is easy to miss and its absence silently prevents the app being addressed inside Linear",
      and `:47-49` states "Env-key groups are all-or-nothing … the integration stays inert (or, for
      one provider, fails at boot) by design". Both were falsified here: the scope is never requested
      and no endpoint could receive a mention, and the Linear pair is asymmetric with the real boot
      failure being the state signer. Story 3.5 loads this file as its context.
      Not done here: the file is a regenerable compiled cache — its own header says "Regenerate with
      compile-epic-context if planning docs change" — and it is derived from `epics.md`, whose
      correction is already deferred above. Editing the cache without editing its source would make
      the next regeneration silently undo the fix.
    location: >-
      _bmad-output/implementation-artifacts/epic-3-context.md:45-49
    severity: low
  - summary: >-
      The §11 trap table carries a second row this story's evidence falsifies — the
      `GITHUB_APP_WEBHOOK_SECRET` row still describes an unset signer as a degraded mode when a
      registered Linear or GitHub integration makes it a boot refusal.
    evidence: |-
      `docs/Self-hosting research.md` §11 says an unset `GITHUB_APP_WEBHOOK_SECRET` with no
      `WORKOS_COOKIE_PASSWORD`/`SLACK_APP_SIGNING_SECRET` means "random per process ⇒ OAuth breaks
      across restarts". With any integration declaring `requiresStableStateSigner` registered — Linear
      at `node_modules/@mastra/factory/dist/integrations/linear/integration.js:306`, GitHub likewise —
      `node_modules/@mastra/factory/dist/factory.js:369` throws during `prepare()` and the server does
      not start. Story 3.3 corrected the same claim in `.env.schema`, `.env.example` and
      `apps/github/README.md` and left this row; this story corrects the Linear row's equivalent and
      leaves it too.
      Not done here: this spec's Never list forbids adding, removing or changing any table row or
      heading in that file — §6 and §11 are a dated research record corrected by appending. The row is
      pre-existing rather than caused by this change, and a §11 pass that re-reads every trap row at
      once is the right owner; §6 and §5 both already declare the owning READMEs authoritative on
      disagreement.
    location: >-
      docs/Self-hosting research.md, §11 trap table, GITHUB_APP_WEBHOOK_SECRET row
    severity: low
operator_actions:
  - >-
    Confirm the precondition first: the public origin is serving and registration is closed. Do
    nothing below until `ops/README.md` ingress checkpoint 4 passes (`https://factory.kovalchuk.win/signin`
    answers `200` through the tunnel) and `README.md` step 3's probe answers `400` carrying
    `EMAIL_PASSWORD_SIGN_UP_DISABLED`. Linear will not return a browser to a host it cannot reach,
    and the redirect URL registered below is on that origin.
  - >-
    Register the OAuth application. Linear → Settings → API → **OAuth applications** → **Create
    new**, following `apps/linear/README.md` → "Register the application" step by step. Redirect URL
    is `https://factory.kovalchuk.win/auth/linear/callback`, character for character — no `/api`
    prefix, no trailing slash. There is no scope screen to fill in: Linear declares no scopes in its
    console, and this deployment requests `read,comments:create` from code
    (`integration.js:330`). **Leave the application's webhooks off and subscribe to no events** —
    no Linear webhook route exists in `@mastra/factory@0.15.0`, so a configured webhook would be a
    URL with nothing behind it.
  - >-
    Escrow the client secret, at creation. Linear displays `LINEAR_CLIENT_SECRET` exactly once, on
    the page where the application is created, and never shows it again. Put it in your password
    manager in the same action. Recovery is a rotation in the console plus an `.env` edit in the
    same moment, because every connect flow in between fails.
  - >-
    Populate `.env` and restart. Write the two lines from `apps/linear/README.md` → "Register the
    application" into `.env` at the repository root — `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`,
    together. Then restart with `npm run build && npm run start`; `.env` is read once at startup.
    Checkpoints 1 and 2 are the proof. A boot that ends in `integration 'linear' signs OAuth state
    and requires a replica-stable state secret` means none of `GITHUB_APP_WEBHOOK_SECRET`,
    `WORKOS_COOKIE_PASSWORD` or `SLACK_APP_SIGNING_SECRET` is set, not that the application is
    wrong. Never commit `.env`.
  - >-
    Confirm the surface is live before connecting anything. Checkpoint 3 in `apps/linear/README.md`:
    `curl https://factory.kovalchuk.win/web/linear/status` must answer `401
    {"error":"unauthorized","reason":"auth_required"}`. A `200` carrying `"reason":"missing_config"`
    is **not** a pass — it is the disabled stub, meaning the integration was never constructed
    (both keys unset, or only the id set, which logs nothing at all).
  - >-
    Connect the workspace. Open `https://factory.kovalchuk.win/auth/linear/connect` while signed in,
    consent, and pick the workspace; the browser should land on `/?linear=connected`. Confirm from
    the server side that `/web/linear/status` now answers `"connected":true` with `"reason":"ready"`
    and names the workspace. A redirect to `/?linear=error` writes a `[Linear]` warning to the
    server log and nothing to the browser — read the log, not the page.
  - >-
    Make both intake selections, following `apps/linear/README.md` → "Choose what comes in". First,
    in the intake settings, enable Linear issue sync and select the Linear projects to pull from
    (per-teammate). Then bind each selected project to a board on the **Linear routing** card. The
    second selection is the binding ingestion depends on — a project selected but not bound
    produces an empty issue list, no work item and nothing in the log.
  - >-
    Prove the loop. Checkpoint 5 in `apps/linear/README.md`: create a small issue in a selected and
    routed Linear project, in a non-terminal state, and confirm it appears in **Work → Intake** as a
    work item and that opening it starts a session. Completing or canceling the issue in Linear
    should move the card to its terminal state — immediately on the next board read, or within five
    minutes via the reconcile sweep.
  - >-
    Do **not** attempt the @-mention proof. The story's fourth Given asks for "an @-mention of the
    app is received"; that is not achievable at `@mastra/factory@0.15.0` and no console action makes
    it so. `app:mentionable` is not requested, `actor=app` is never put on the authorize URL, and
    the package registers no Linear webhook route and carries no `AgentSessionEvent` handler — so a
    mention has nowhere to arrive. `apps/linear/README.md` → "Mentions are not available at
    `@mastra/factory@0.15.0`" records the limitation with its evidence; re-check it after a
    `@mastra/factory` bump rather than treating it as a misconfiguration.
---

<intent-contract>

## Intent

**Problem:** `apps/linear/README.md` is the file the operator will register the OAuth application from,
and its two load-bearing statements are false against the installed `@mastra/factory@0.15.0`. It tells
the operator to request five scopes when `buildAuthorizeUrl` hardcodes exactly `read,comments:create`
with no override seam, and it tells them `app:mentionable` is what makes Factory @-mentionable inside
Linear when the package sends no `actor=app`, registers no Linear webhook route, and has no
`AgentSessionEvent` handler — so the mention half of the story's own acceptance criteria cannot be
proven at this version by any console action. It also describes the all-or-nothing pair as symmetric
when only one direction fails, and omits the one failure that actually stops the boot: `LinearIntegration`
sets `requiresStableStateSigner = true`, so configuring Linear with no stable state secret refuses to
start. Beyond the reference material the file carries no procedure at all — no registration sequence,
no connect step, and no checkpoint that would distinguish "not configured" from "configured but not
connected" from "connected but nothing selected".

**Approach:** Re-run the cross-reference the story's first Given clause asserts, against the package in
`node_modules`, correct what it falsifies, and record the mention gap as a version limitation with its
three independent causes cited — rather than parking an operator on a proof no console setting can
produce. Then give `apps/linear/README.md` the registration → connect → intake-selection → proof
procedure with numbered checkpoints, mirroring what Story 3.3 did for `apps/github/`. Everything after
that is a console action or an edit to the gitignored `.env`, so the story parks at `awaiting-operator`
with those enumerated.

## Boundaries & Constraints

**Always:**
- Every corrected claim cites the installed package by `file:line`. This is the AC's own standard — the
  scope list and the mention capability are asserted as facts about this deployment, and the deployment
  is `src/mastra/index.ts` plus `@mastra/factory@0.15.0`.
- The redirect URL already in the file is correct and verified against the registered route; transcribe,
  never re-derive, and change no URL.
- Keep the story's second Given clause intact: workspace-wide read with no per-project narrowing at the
  OAuth layer, narrowing in intake selection. It is true and it is the reason the intake-selection step
  exists.
- State plainly that Linear declares no scopes in its console — scopes are the `scope` parameter on the
  authorize URL, which this deployment builds — so the operator does not go looking for a checkbox list
  that is not there.
- Match house style: `## <KEY>` sections with **What the value must contain.** / **How to obtain it.**,
  `### N — <claim>` checkpoints with a fenced command and an `Expected:` line, hard-wrapped at ~105
  columns.
- `.env.schema` stays the only list of keys; `apps/linear/README.md` stays the only record of what a
  `LINEAR_*` value must contain and how to obtain it. Neither restates the other (AD-6).

**Never:**
- Never edit a heading, heading number or table row in `docs/Self-hosting research.md`. §6 and §11 are a
  dated research record: correct by appending a dated paragraph, the shape Stories 3.2 and 3.3 used.
- Never add first-party code: no `.ts`/`.js`/`.mjs`/`.cjs`, no change to `src/`, `package.json` or
  `docker-compose.yml`. `src/mastra/index.ts` is read-only evidence here.
- Never write `.env`, and never put a client id or client secret in a tracked file.
- Never instruct the operator to enable webhooks on the Linear application. No Linear webhook route
  exists in this deployment, so a configured webhook is a URL with nothing behind it.
- Never document a hand-crafted authorize URL as a way to obtain `app:mentionable`. The scope is not the
  binding constraint — with no endpoint receiving `AgentSessionEvent`, granting it changes nothing — and
  teaching an unsupported flow that still cannot work is worse than naming the limit.
- Never claim an operator-surface result as observed: no application, no `.env` and no tunnel exist in
  this worktree, so registration, connection and the issue-to-work-item loop are the operator's proofs.
- Never add a `@required` annotation that is not conditional — the verify gate runs `npx varlock load`
  in a worktree with no `.env`, and an unconditional requirement fails it.

</intent-contract>

## Code Map

- `apps/linear/README.md` -- the file this story edits (66 lines, created by Story 3.1). `:12-24` Console
  URLs — correct, verified against `routes.js:132`; leave the URL alone. `:26-39` Scopes — `:28`'s
  five-scope instruction and `:30-33`'s `app:mentionable` mention claim are the two false statements;
  `:35-39`'s workspace-wide paragraph is true and stays. `:41-54` the two per-key sections — correct.
  `:56-66` "Both, or neither" — `:58-61` claims a symmetric boot error, which holds in one direction only;
  `:63-66`'s auth/DB/org list is right but omits the state signer. No registration procedure, no connect
  step, no checkpoints anywhere in the file.
- `node_modules/@mastra/factory/dist/integrations/linear/integration.js` -- `:325-334` `buildAuthorizeUrl`:
  `scope` is the literal `"read,comments:create"` at `:330`, params are `client_id`, `redirect_uri`,
  `response_type`, `scope`, `state`, `prompt=consent` — no `actor`. `:306`
  `requiresStableStateSigner = true`. `:315-316` the `REQUIRED_FIELDS` throw, unreachable behind the
  entry's ternary. `:133-134` `canPostComments` accepts `comments:create`, `write` or `admin`; `:130`
  scope-less rows count as read-only. `:148-170` `getFreshAccessToken` → `LinearReauthRequiredError`.
  `:445-452` `listProjects` — intake sources are Linear **projects**. `:458-473` `listActiveIssues` — the
  state-type filter and the project filter. `:630-640` the reconcile worker construction.
- `node_modules/@mastra/factory/dist/integrations/linear/routes.js` -- `:76` `enabled = Boolean(linear) &&
  auth.enabled()`; `:83-119` `/web/linear/status` and its three bodies; `:120` everything past status also
  needs `stateSigner` and `intake`; `:121` the redirect URI, `options.redirectUri` never set by the caller;
  `:122-131` `/auth/linear/connect`; `:132-164` `/auth/linear/callback` and both `/?linear=error` exits;
  `:37-40` `403 organization_required`; `:59-68` `linearFetchError`; `:166-185` `/web/linear/projects`;
  `:186-262` `/web/linear/issues`, with `:249-255` the ingestion call that turns issues into work items;
  `:19-26` `scopeSourceIdsToProject`. **No webhook route exists in this file or anywhere under
  `dist/integrations/linear/`.**
- `node_modules/@mastra/factory/dist/integrations/linear/reconciliation-config.js` -- `:12-17` the four env
  names, child-then-legacy, defaulting to enabled; a non-positive interval is a `console.warn` only.
- `node_modules/@mastra/factory/dist/integrations/issue-reconcile-worker.js` -- `:25` `intervalMs ?? 3e5`
  — five minutes, and `:5` `DEFAULT_ISSUE_RECONCILE_INTERVAL_MS = 5 * 6e4`, the same five minutes.
- `node_modules/@mastra/factory/dist/integrations/linear/rules.js` -- `:57` `issueObserved`/`issueClosed`,
  the only two Linear rule events; `:49-56` the ingress identity and the closed-with-no-item skip.
- `node_modules/@mastra/factory/dist/routes/surface.js` -- `:222-236` the disabled `/web/linear/status`
  stub and its `diagnostics` object, which is what checkpoint 3 reads.
- `node_modules/@mastra/factory/dist/factory.js` -- `:369` the boot throw when a registered integration
  requires a stable signer and none is configured; `:180` `publicOrigin` defaulting to
  `http://localhost:4111`, which is how a wrong `MASTRACODE_PUBLIC_URL` produces an unreachable callback.
- `src/mastra/index.ts` -- **read-only**. `:237-248` the two-key gate: a ternary, so a partial group is
  silent, not a throw. `:548-552` the signer chain `GITHUB_APP_WEBHOOK_SECRET || WORKOS_COOKIE_PASSWORD ||
  SLACK_APP_SIGNING_SECRET`; `:607` `publicUrl`; `:616` it reaches the factory as `stateSecret`.
- `.env.schema:376-392` / `.env.example:329-344` -- the Linear block. `:380-381` / `:333-334` assert the
  symmetric boot error; `:387-389` / `:340-342` assert a "runtime envGroup validation" that does not
  exist anywhere in `src/` or in the package. Fix the comment text only.
- `docs/Self-hosting research.md` -- `## 6.` at `:350`, already carrying Story 3.1's pointer sentence.
  `:355-360` is the Linear paragraph carrying the five-scope list and the mention claim; `:670` is the
  §11 trap-table row asserting the symmetric boot error. Additive dated paragraph only — touch neither.
- `apps/github/README.md:133-241,386-533` -- the registration / connect / `### N — <claim>` checkpoint
  style to copy, including the `Expected:` paragraph and the failure-reading bullet list.
- `ops/README.md:337-436` -- the ingress checkpoints the Linear proof depends on and cross-references.

## Tasks & Acceptance

**Execution:**
- `apps/linear/README.md` -- edit -- correct the two false claims, each against the package:
  (a) the Scopes section states what this deployment actually requests — `read,comments:create`,
  hardcoded at `integration.js:330`, with no env var, config field or console setting that changes it —
  and that Linear declares no scopes in its console at all, so the consent screen will show those two and
  the operator has nothing to tick. Keep the workspace-wide paragraph; add that `write` and
  `issues:create` are not requested, so Factory reads Linear and comments on it but does not create or
  edit issues there;
  (b) the `app:mentionable` paragraph is replaced by a version-limitation statement naming all three
  independent reasons a mention cannot arrive — the scope is not requested, `actor=app` is never sent
  (`integration.js:326-332`), and no Linear webhook route or `AgentSessionEvent` handler exists anywhere
  in the package — and says plainly that no console setting makes it work at `0.15.0`, so the operator
  should not enable webhooks on the application.
- `apps/linear/README.md` -- edit -- correct "Both, or neither" to the asymmetry the code has: secret
  without id fails varlock at `npm run start` and names the key; id without secret passes validation and
  leaves Linear silently inert (`src/mastra/index.ts:242-243`); and add the state-signer requirement —
  `requiresStableStateSigner = true` (`integration.js:306`) means both keys set with none of
  `GITHUB_APP_WEBHOOK_SECRET`, `WORKOS_COOKIE_PASSWORD` or `SLACK_APP_SIGNING_SECRET` set refuses the boot
  (`factory.js:369`, chain at `src/mastra/index.ts:548-552`).
- `apps/linear/README.md` -- edit -- add the package-provenance preamble stanza the sibling READMEs carry,
  then append the procedure the file lacks: a `## Register the application` sequence (preconditions — the
  public origin is up per `ops/README.md` ingress checkpoint 4, and registration is closed; Settings → API
  → Applications; the redirect URL from the table; webhooks left off and why; the client secret shown once
  and escrowed at creation), a `## Connect a workspace` step entering through `/auth/linear/connect` with
  the `401`/`403`/`?linear=error` readings, a `## Choose what comes in` step covering intake enablement,
  project selection and the board binding that ingestion depends on, the `.env` pair as a dotenv block
  with the restart note, and `## Checkpoints` numbered with expected output: the two values reached
  `.env`; the server boots with Linear configured; `/web/linear/status` answers `401 auth_required`
  rather than `missing_config`; the workspace connects and the status body names it; and the
  issue-to-work-item loop. State that the reconcile sweep backstops issue state every five minutes.
- `apps/linear/README.md` -- edit -- add a `## Reconcile sweep` section for the four
  `MASTRACODE_LINEAR_*RECONCILE*` env names the package reads, documented as read-but-undeclared and
  unset in this deployment, with the five-minute default and the child-over-legacy precedence
  (`reconciliation-config.js:12-17`, `issue-reconcile-worker.js:5,25`). Do not declare them in the
  schema — that is Story 5.2's audit.
- `.env.schema` -- edit -- correct the two false comment claims in the Linear block: the all-or-nothing
  sentence at `:380-381` becomes the real asymmetry, and the "runtime envGroup validation" sentence at
  `:388-389` is replaced by what actually holds the other direction (nothing does; the entry's ternary
  leaves it silent). Add the state-signer consequence in one clause. Nothing else: no console prose, no
  new key, no decorator change.
- `.env.example` -- edit -- mirror both comment corrections at `:333-334` and `:340-342`, decorators
  stripped, so the two files keep saying the same thing.
- `docs/Self-hosting research.md` -- edit -- append one dated 2026-09-23 paragraph under §6 recording what
  the re-cross-reference against `node_modules` changed (two scopes requested, not five; `app:mentionable`
  and @-mentions unreachable at `0.15.0` for three independent reasons; the boot error asymmetric; the
  state signer the real boot stopper) and naming `apps/linear/README.md` as where the corrected form
  lives. Add no heading, move no table row, and leave the §11 row at `:670` alone.

**Acceptance Criteria:**
- Given the story's first Given clause asserts a scope set as fact about this deployment, when
  `apps/linear/README.md` is read, then it states that `read,comments:create` is what the authorize URL
  requests, cites `integration.js:330`, and no sentence in the file instructs the operator to select
  scopes in Linear's console.
- Given `app:mentionable` is the premise of that same clause, when the mention section is read, then it
  names all three reasons a mention cannot arrive at `@mastra/factory@0.15.0` — scope not requested,
  `actor=app` not sent, no webhook route or `AgentSessionEvent` handler — each cited, and instructs the
  operator to leave webhooks disabled on the application rather than pointing them at a URL.
- Given the second Given clause is true and load-bearing, when the scopes section is read, then it still
  states that read access is workspace-wide, that Linear offers no per-project narrowing at the OAuth
  layer, and that narrowing happens in Factory's intake selection.
- Given the pair is described as all-or-nothing with one alone a boot error, when the README,
  `.env.schema` and `.env.example` are read, then all three describe the same asymmetry — secret without
  id fails varlock at `npm run start`, id without secret is silent — and none of them claims a runtime
  envGroup validation that does not exist.
- Given an unset state signer is fatal for Linear specifically, when the README is read, then it names the
  three-source chain, names `src/mastra/index.ts` as where it resolves, and says a configured Linear pair
  with none of the three set fails to boot.
- Given the operator must be able to tell "not configured" from "configured but not connected", when the
  checkpoints are read, then at least one distinguishes `{"reason":"missing_config"}` from
  `401 auth_required` on `/web/linear/status` and says which one is the pass.
- Given a test issue can be invisible for four different structural reasons, when the intake-selection
  step is read, then it covers intake being off, the issue belonging to no selected Linear project, the
  issue being in a completed or canceled state, and the selected project not bound to a board.
- Given `docs/` section numbers are stable citation anchors, when `git diff` for that file is inspected
  against the baseline, then no line beginning with `#` and no table row is added, removed or changed.
- Given `.env.schema` and the README must not restate each other, when both are read, then the schema
  gained no console prose and the README gained no validation, type or `@public` statement.
- Given the verify gate runs `npx varlock load` with no `.env` present, when the gate runs, then it
  passes — no unconditional `@required` was introduced.
- Given the operator plane holds no first-party code, when the diff is inspected, then no `.ts`, `.js`,
  `.mjs` or `.cjs` file changed, `src/` is untouched, and `npm run check` is clean.
- Given registration, connection and the loop proof are console and host actions, when the run finishes,
  then the spec's status is `awaiting-operator` with a non-empty `operator_actions:` covering
  registration, the secret escrow, the `.env` population and restart, the workspace connection, the
  intake selection and the issue-to-work-item proof — and the mention criterion recorded as not
  achievable at this package version rather than parked as a proof the operator is expected to produce.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 37 findings — high 0, medium 16, low 18, false 2, maybe-false 1
- findings:
  - `[low]` `[patch]` The "no webhook route" argument enumerated five routes and cited `routes.js:82-265`, a range ending exactly where the omitted sixth begins — confirmed: `/web/linear/issues/:identifier` registers at `:265` and `buildLinearRoutes` returns at `:312`. Enumeration is now six routes cited `:82-312`; the conclusion is unchanged.
  - `[medium]` `[patch]` Checkpoint 4 listed `403 organization_required` under a step whose server-side confirmation is `/web/linear/status`, which never returns it — confirmed at `routes.js:99-106`: with a session and no org that route answers `200` with `organizationRequired:true`. The 403 is now attributed to `/auth/linear/connect` (`routes.js:33-44`) and the 200 body named as the status route's form of the same condition.
  - `[low]` `[patch]` `.env.example` said "fails **this** validation" while carrying no `@required` — confirmed, it is the decorator-stripped mirror. The sentence now names varlock and the annotation's home in `.env.schema`.
  - `[low]` `[reject]` Two spec-internal citations drift from the post-change file (`.env.schema:390` vs `:395`, `routes.js:96-99` vs `:95-98`) — real, and the README's own citations were independently confirmed correct; rejected because the fix edits this build's spec.
  - `[low]` `[reject]` A `deferred` entry pins the §11 row at `:670`, which the appended paragraph moved to `:688` — real; rejected because the fix edits this build's spec.
  - `[medium]` `[patch]` "The legacy name is consulted only when the child name is unset" was narrower than the code — confirmed at `reconciliation-config.js:2-8`: `optionalBoolean` returns `undefined` after a warn for any value that is not `true`/`false`, so `0`/`no`/`off` also falls through to the legacy name and then `?? true`. The interval sentence had the same defect — an invalid child interval falls through to the legacy interval, not to the five-minute default. Both sentences and the two table rows corrected.
  - `[medium]` `[patch]` Every listed reason a test issue is missing explained an *empty* list, leaving the "issues visible, nothing ingested" state undocumented — confirmed at `routes.js:210-218,249-255`: ingestion runs only with a `factoryProjectId` and bound boards. Added.
  - `[low]` `[patch]` Checkpoints 4 and 5 carry an `Expected:` with no fenced command, and checkpoint 4 asked for a cookie-authenticated fetch with no way to run it — the second half confirmed and fixed with a devtools `fetch` and a `curl -b` form; checkpoint 5 stays a console sequence, the same shape `apps/github/README.md` checkpoint 5 uses.
  - `[medium]` `[patch]` Checkpoint 2 expected only a startup banner, which is equally true in the id-set/secret-unset case the change exists to expose — confirmed. It now says a clean boot does not prove Linear was configured and routes to checkpoint 3.
  - `[medium]` `[patch]` "This deployment keeps `WORKOS_COOKIE_PASSWORD` unset" was asserted from a worktree with no `.env` — confirmed unsupported: `.env.schema:238-246` says the key stays declared precisely because a deployment that already set it keeps a stable signer. Restated as a condition to check.
  - `[low]` `[patch]` Checkpoint 4 sent the reader to "the four things that land here" where the `/?linear=error` paragraph gives three code paths — confirmed; corrected to three in both places.
  - `[low]` `[reject]` The spec's Verification expects the Linear webhook grep to return "type declarations for the platform poller" when it returns nothing — real, and the README's claim is the correct one (the grep was run: no output); rejected because the fix edits this build's spec.
  - `[low]` `[defer]` The §11 trap table has a second row this evidence falsifies, the `GITHUB_APP_WEBHOOK_SECRET` one, and only the Linear row was deferred — confirmed; pre-existing from Story 3.3 and covered by the Never rule on table rows. Deferred as its own entry.
  - `[low]` `[patch]` The quoted state-signer boot error stopped before its actionable half, and the memory-note correction lived only inside another entry's prose — the quote now runs through `Set 'stateSecret' on the factory config.`; the memory note became its own `deferred` entry.
  - `[low]` `[patch]` (edge-case) Route enumeration incomplete — same defect as the first row; fixed by the same edit.
  - `[medium]` `[patch]` (edge-case) An unparseable child reconcile boolean silently hands the decision to the legacy name — same defect as the precedence row; fixed by the same edit.
  - `[medium]` `[patch]` (edge-case) An invalid child interval falls through to the legacy interval, not the default — same defect; fixed by the same edit.
  - `[maybe-false]` `[reject]` (edge-case) No reconcile worker is constructed when `context.runtime` is absent (`integration.js:630-633`) — the diff never shows this deployment reaching that branch, and a normal boot binds the runtime; settling it needs a boot with work-items storage unavailable, which would fail far louder elsewhere. If true it would be `low`.
  - `[medium]` `[patch]` (edge-case) Checkpoint 1's `tr -d ' \t"'` left single quotes, so `LINEAR_CLIENT_SECRET=''` printed `set` while `src/mastra/index.ts:240-243` trims it to absent — confirmed. Single quotes now stripped; re-tested against a fixture `.env` and it prints `EMPTY`.
  - `[low]` `[patch]` (edge-case) The same command reported `lines=0` for `export LINEAR_CLIENT_ID=…` — confirmed. The pattern now accepts an optional `export ` prefix; re-tested and it prints `lines=1 set`.
  - `[medium]` `[patch]` (edge-case) `appDbConfigured` in the status diagnostics is the hardcoded literal `true` in both the live route (`routes.js:79`) and the stub (`surface.js:232`) — confirmed; an operator could clear the database on the strength of a constant. One clause added saying so.
  - `[medium]` `[patch]` (edge-case) The connect-failure enumeration omitted a wrong `MASTRACODE_PUBLIC_URL` — confirmed at `routes.js:121` → `factory.js:180` (default `http://localhost:4111`): Linear rejects the `redirect_uri` on its own page, so nothing reaches the deployment and no log line exists. Added, with the browser address bar named as where it is read.
  - `[medium]` `[patch]` (edge-case) A connection stored with no recorded scope is treated as read-only and the comment tool is withheld with nothing logged — confirmed at `integration.js:129-134` and `agent-tools.js:42,81`. Added to Scopes with reconnecting as the fix.
  - `[medium]` `[patch]` (edge-case) `listProjects` is `projects(first: 100)` with no pagination (`integration.js:445-446`), so a project past the first hundred is unselectable and looks identical to "the issue is in no selected project" — confirmed. Added as a further structural reason.
  - `[medium]` `[patch]` (edge-case) The `WORKOS_COOKIE_PASSWORD` assumption — same defect as the row above; fixed by the same edit.
  - `[medium]` `[patch]` (edge-case, deletion) The rewritten prerequisites paragraph dropped the database, which `.env.schema:378-379` and `.env.example:331-332` still condition on — confirmed. Restored, so all three files name the same set.
  - `[low]` `[reject]` (edge-case, claim) The README's four-row `MASTRACODE_LINEAR_*` table and its "varlock refuses and names `LINEAR_CLIENT_ID`" breach AD-6 and this spec's own AC — checked: AD-6 makes `.env.schema` normative for *which keys exist and their validation, type and `@public` marking*, and the README declares nothing, marks nothing and states explicitly that these four are undeclared. `apps/github/README.md` carries the identical construction from Story 3.3 (a reconcile-key section plus a varlock-refusal reading in checkpoint 2) and survived that review. The remaining gap is the AC's phrasing, whose fix edits this build's spec.
  - `[low]` `[defer]` (edge-case, claim) `epic-3-context.md:45-49` still asserts the mention claim and the symmetric all-or-nothing claim, and Story 3.5 loads it as context — confirmed; it is a regenerable cache derived from `epics.md`, whose correction is already deferred, so editing it alone would be undone by the next regeneration.
  - `[low]` `[patch]` (verification-gap, other) Route enumeration under-enumerates — same defect as the first row; fixed by the same edit.
  - `[low]` `[reject]` (verification-gap, other) Two stale `file:line` citations in the spec's Design Notes table — same as the fourth row; rejected because the fix edits this build's spec. The layer confirmed every operator-facing citation correct.
  - `[medium]` `[defer]` (intent-alignment) AC1's five-scope list is contradicted rather than satisfied, leaving `epics.md` the only place still asserting it — confirmed and already carried as a `deferred` entry; rewriting a story's own acceptance premise mid-run would change the record the run is judged against.
  - `[medium]` `[defer]` (intent-alignment) AC4's mention proof is inverted: `operator_actions:` ends by enumerating something as *not* owed — confirmed, and deliberate. No console action can produce the proof at `0.15.0`, so parking it would owe the operator an impossible task; the limitation and its evidence are recorded in the README and in the same `deferred` entry.
  - `[low]` `[reject]` (intent-alignment) AC3's Given ("one alone is a boot error") is reversed in all three files — that reversal is the story's purpose and rests on `src/mastra/index.ts:242-243`; the AC's Then ("both are set together") survives and is operator action 4.
  - `[low]` `[patch]` (intent-alignment) `operator_actions:` entries are multi-sentence paragraphs rather than "one imperative instruction each", and entry 1 was a bare precondition statement — entries 1 and 7 rewritten imperative-led; the multi-sentence shape is kept, matching Story 3.3's accepted list.
  - `[false]` `[reject]` (intent-alignment) "Spec status is `in-review` and the tree is uncommitted, so the required terminal status is not shown" — an observation of normal mid-run state; finalization sets `awaiting-operator` and commits.
  - `[low]` `[reject]` (intent-alignment) The README is several times the size the criteria motivate, and documents four env names no AC mentions — the procedure is what makes the criteria executable rather than aspirational, which is the same trade Story 3.2 and 3.3 made; already flagged as `warnings: ['oversized']`.
  - `[false]` `[reject]` (intent-alignment) "The redirect URL AC is satisfied cleanly on the repo surface" — not a defect; recorded because every finding gets a row. The URL was transcribed, not re-derived, and re-verified against `routes.js:121,132`.

## Design Notes

**Why the mention criterion is a limitation and not a documentation fix.** Linear's own agent
documentation makes three things necessary for an app to be @-mentionable: the `app:mentionable` scope,
`actor=app` on the authorize URL, and a webhook endpoint subscribed to Agent session events that receives
a `created` `AgentSessionEvent`. The installed package supplies none of the three — `buildAuthorizeUrl`
sets six parameters and `actor` is not among them (`integration.js:326-332`), the scope literal is two
values (`:330`), and `grep` for `app:mentionable`, `actor=app` and `AgentSession` across all of
`node_modules/@mastra/` returns nothing but unrelated Mastra-core workflow internals. There is no Linear
webhook route to point a console at. Granting the scope out of band would therefore still produce no
observable mention, which is why the file names the limit instead of teaching a workaround.

**Where the five-scope list came from, and why that matters.** It is not invented: it is an accurate
record of Mastra's *hosted* consent screen, observed 2026-09-21, and it is what `epics.md:751` and
`docs/…:357-359` carry. This deployment does not use that path — `src/mastra/index.ts:36` imports
`LinearIntegration`, the self-hosted direct-OAuth integration, and never constructs
`PlatformLinearIntegration`. So the list is true of a different client. The README should say this
rather than simply deleting the list, because the operator has seen that screen and will otherwise
conclude the file is wrong.

**The behaviours the checkpoints rest on.** All read out of the installed package; they are what makes a
checkpoint diagnostic rather than decorative, and the README must carry the reading for each. Every row
is a state the operator can land in, and the point of the table is that several of them are
indistinguishable from the browser. There is no first-party code here to unit-test these against — each
one is `@mastra/factory@0.15.0`'s behaviour observed at the operator's surface, which is why they are
checkpoints in a README rather than an I/O matrix in this spec.

| Situation | What the operator observes | Evidence |
|---|---|---|
| Neither key set | `/web/linear/status` → `missing_config`, `linearAppConfigured:false` | `surface.js:222-236` |
| Id set, secret unset | identical body, nothing logged — not an error at all | `src/mastra/index.ts:242-243` ternary |
| Secret set, id unset | varlock refuses, names `LINEAR_CLIENT_ID`; `npm run dev` starts anyway | `.env.schema:390` `@required` |
| Configured, no stable signer | boot throws, naming integration `linear` | `factory.js:369`, `integration.js:306` |
| Configured, signed out | `401 {"error":"unauthorized","reason":"auth_required"}` — this is the pass | `routes.js:96-99` |
| Configured, no org | `403 organization_required` on connect | `routes.js:37-40` |
| Connected | `/?linear=connected`, status names the workspace | `routes.js:163`, `:108-114` |
| Consent fails or state mismatches | `/?linear=error`, a `[Linear]` warning in the log, nothing in the browser | `routes.js:139-145,159-161` |
| Connected, intake off | `404 linear_intake_disabled` | `routes.js:207-210` |
| Connected, no project selected | `200 {"issues":[],"nextCursor":null}` — reads as "no issues" | `routes.js:219-222` |
| Issue completed or canceled | absent from intake; the filter is four non-terminal state types | `integration.js:473` |
| Issue in no Linear project | absent from intake — sources are projects, not teams | `integration.js:446,465` |
| Selected but unbound to a board | `issues: []`, no work item, nothing logged | `routes.js:19-26,212-222` |
| Token stale, no refresh | `409 linear_reauth_required` | `routes.js:60-63`, `integration.js:150` |
| App @-mentioned in Linear | nothing reaches the deployment | no scope, no `actor=app`, no route |

**Why the reconcile keys are documented but not declared.** The package reads four
`MASTRACODE_LINEAR_*RECONCILE*` names that no schema declares, exactly the shape Story 3.3 deferred for
GitHub. Declaring a key is a schema decision with `@public` and type consequences, and the audit that
decides them is Story 5.2's (`epics.md:1014-1017`). The README documents behaviour the operator will
observe — a five-minute sweep that re-reads issue state — without declaring anything; the gap goes to
`deferred`.

**Why `docs/` gets a paragraph and not a fix.** §6 is a dated record of a 2026-09-21 reading and its
numbers are cited as anchors (`AGENTS.md:26-27`). Stories 3.2 and 3.3 set the precedent: date the old
finding, append the correction, point at the owning file. The §11 trap-table row is a table row and is
covered by the same Never rule.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exits 0. Required: every claim below reads `node_modules`.
- `npm run check` -- expected: exits 0 with no TypeScript output.
- `npm test` -- expected: exits 0; this story touches no code, so the suite must be unchanged.
- `npx varlock load --format json > /dev/null` -- expected: exits 0 with no `.env` present.
- `grep -n 'scope' node_modules/@mastra/factory/dist/integrations/linear/integration.js | grep searchParams`
  -- expected: one line, setting `"scope"` to `"read,comments:create"`.
- `grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/ | grep -v '\.map'` --
  expected: no hit inside `@mastra/factory`.
- `grep -rn "webhook" node_modules/@mastra/factory/dist/integrations/linear/` -- expected: no
  `registerApiRoute` and no route path; the only hits are type declarations for the platform poller.
- `grep -n "intervalMs ?? " node_modules/@mastra/factory/dist/integrations/issue-reconcile-worker.js` --
  expected: `3e5`.
- `grep -rn "envGroup" src/ node_modules/@mastra/factory/dist/` -- expected: no output, which is the
  evidence behind removing that sentence from both env files.
- `git diff -- 'docs/Self-hosting research.md' | grep -E '^[-+](#|\|)'` -- expected: no output, run
  against the baseline commit after committing.
- `git diff --name-only` against this spec's `baseline_revision`, piped through
  `grep -E '\.(ts|js|mjs|cjs)$|^src/'` -- expected: no output.
- `find apps ops -type f ! -name '*.md'` -- expected: no output.
- `grep -rniE 'lin_api_|lin_oauth_|client_secret[=:][A-Za-z0-9]' apps/ .env.schema .env.example` --
  expected: no output beyond illustrative placeholders.
- `awk 'length>105' apps/linear/README.md` (excluding fenced blocks and tables) -- expected: no output.
- `git status --porcelain` -- expected: no `.env`, created or left behind.

**Manual checks:**
- Read the redirect URL in the Console URLs table against `routes.js:121,132` character by character:
  `/auth/linear/callback`, no `/api` prefix, no trailing slash.
- Confirm each checkpoint is runnable at the point it appears — the `/web/linear/status` probe before any
  workspace is connected, the work-item checkpoint only after intake selection exists.
- Confirm no corrected claim rests on the research document or on the epic rather than on a `file:line`
  in `node_modules` or `src/`.

## Auto Run Result

Status: awaiting-operator

**Summary.** Story 3.4 re-ran the cross-reference its first acceptance criterion asserts — the scope set
and the mention capability against what `@mastra/factory@0.15.0` actually does — and found the premise
false in both halves. `buildAuthorizeUrl` requests exactly `read,comments:create` as a string literal
with no env var, config field or console setting that changes it, and Linear declares no scopes in its
console at all, so there is no five-scope list for an operator to tick anywhere. The `app:mentionable`
half is not a documentation error but a version limitation: the scope is not requested, `actor=app` is
never sent, and the package registers no Linear webhook route and carries no `AgentSessionEvent`
handler — three independent reasons a mention cannot arrive, any one of them sufficient. The
all-or-nothing claim proved asymmetric, and the boot error that actually exists is a different one, the
replica-stable state signer. `apps/linear/README.md` now carries the corrected form with the procedure
it never had — registration, connection, both intake selections and five numbered checkpoints — and
every criterion naming a console, an `.env` or a live issue is enumerated in `operator_actions:`. The
one criterion no operator can meet is recorded as owed by a package version rather than by a human.

**Files changed.**
- `apps/linear/README.md` — 66 → 480 lines. Corrected Scopes section, a new "Mentions are not available
  at `@mastra/factory@0.15.0`", a rewritten "Both, or neither" carrying the asymmetry and the state
  signer, plus `## Register the application`, `## Connect a workspace`, `## Choose what comes in`,
  `## Reconcile sweep` and `## Checkpoints` 1–5. The redirect URL is unchanged.
- `.env.schema` / `.env.example` — comment text only: the symmetric-boot-error claim replaced with the
  real asymmetry, the nonexistent "runtime envGroup validation" sentence replaced with what actually
  holds the other direction, and the state-signer consequence added. No key, no decorator, no new key.
- `docs/Self-hosting research.md` — one dated 2026-09-23 paragraph appended under §6. No heading,
  heading number or table row added, removed or changed.
- `_bmad-output/implementation-artifacts/spec-3-4-…md` — this spec.

**Review findings.** 37 findings across four layers — high 0, medium 16, low 18, false 2, maybe-false 1.
Twenty-two entries patched, four deferred, eleven rejected. Patched by verdict: medium 14, low 8.

Patches applied, by theme:
1. **Checkpoints that could pass while the thing they check was broken.** Checkpoint 1's `tr` left single
   quotes, so `LINEAR_CLIENT_SECRET=''` printed `set` for a value the entry trims to absent, and its
   pattern missed an `export `-prefixed key entirely; both are fixed and were re-tested against a fixture
   `.env`. Checkpoint 2 expected only a startup banner, which is equally true in the id-set/secret-unset
   case this whole change exists to expose — it now says so and routes to checkpoint 3.
2. **A response the file attributed to the wrong route.** `/web/linear/status` never answers `403
   organization_required`; with a session and no org it answers `200` with `organizationRequired:true`.
   The 403 belongs to `/auth/linear/connect`, and both readings are now in the right place.
3. **Failures with no reading.** A wrong `MASTRACODE_PUBLIC_URL`, which makes Linear reject the
   `redirect_uri` on its own page with nothing reaching the deployment and no log line; a connection
   stored without a recorded scope, which withholds the comment tool silently; a workspace past the
   hundred-project pagination ceiling; and the "issues list correctly but nothing is ingested" state,
   which every previously listed reason missed because they all explain an *empty* list.
4. **Two claims stated more confidently than the code supports.** The reconcile precedence rule ignored
   that an unparseable child value also falls through to the legacy name, and that an invalid child
   interval falls through to the legacy interval rather than to the five-minute default.
5. **An assumption about a file that does not exist here.** "This deployment keeps
   `WORKOS_COOKIE_PASSWORD` unset" was asserted from a worktree with no `.env`, against a schema comment
   that says the opposite is exactly why the key stays declared. Restated as a condition to check.
6. **Diagnostics that prove less than they look like they prove.** `appDbConfigured` is the hardcoded
   literal `true` in both the live route and the disabled stub.
7. **Citation and quotation hygiene.** The route enumeration behind the "no webhook route" argument
   listed five of six and cited a range ending where the sixth begins; the state-signer boot error was
   quoted without its actionable second sentence; a cross-reference miscounted three paths as four; and
   `.env.example` used "this validation" where no validation exists.

Deferred (6, four added at review): the four undeclared `MASTRACODE_LINEAR_*RECONCILE*` keys, Story 5.2's
criterion verbatim; `epics.md`, still the only place asserting the five-scope list and the mention proof;
the §11 trap-table row on the Linear pair, and a second §11 row on `GITHUB_APP_WEBHOOK_SECRET` that the
same evidence falsifies — both table rows the Never list preserves; the user-level memory note carrying
the same falsified five-scope list, which lives outside the repository; and `epic-3-context.md`, a
regenerable cache whose source correction is already deferred.

Rejected (11): two observations of normal mid-run state or of a criterion that is satisfied rather than
broken; five whose fix edits this build's spec (two citation drifts, a `deferred` line pointer, the
Verification command's expected output, and the AC phrasing behind the AD-6 claim); one maybe-false about
a reconcile worker branch the diff never shows this deployment reaching; and three that are the story's
purpose rather than a defect — AC3's reversed Given, the README's size against criteria that would
otherwise be unexecutable, and the AD-6 claim itself, which `apps/github/README.md` refutes by carrying
the identical construction from Story 3.3.

**Verification performed.**
- `npm ci --no-audit --no-fund` — exit 0; the worktree carries tracked files only, so every claim below
  reads a freshly installed `node_modules`.
- `npm run check` — exit 0, no TypeScript output. `npm test` — 59/59, unchanged; this story adds no code.
- `npx varlock load --format json` — exit 0 with no `.env` present, so the verify gate's schema load
  passes and no unconditional `@required` was introduced.
- `integration.js:330` read directly: `url.searchParams.set("scope", "read,comments:create")`, and
  `:326-332` sets six parameters with no `actor` among them.
- `grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/` — no hit inside
  `@mastra/factory`; the only matches are unrelated workflow internals in `@mastra/core` and
  `@mastra/server`. `grep -rn "webhook" .../dist/integrations/linear/` — no output at all.
- `routes.js` read end to end: six routes, `/web/linear/issues/:identifier` at `:265`, `buildLinearRoutes`
  returning at `:312` in a 316-line file — the enumeration behind the mention argument now matches.
- `factory.js:369` throws on a registered integration requiring a stable signer, `integration.js:306`
  sets `requiresStableStateSigner = true`, and `src/mastra/index.ts:548-552,616` resolves the chain —
  the boot-refusal claim, read directly, and the message quoted to its end.
- `reconciliation-config.js:2-17` and `issue-reconcile-worker.js:5,25` read directly: child-over-legacy
  with `undefined` returned after a warn for any unrecognized value, and `intervalMs ?? 3e5`.
- `integration.js:445-446,463-473` — intake sources are Linear projects via `projects(first: 100)`, and
  the issue filter is the four non-terminal state types plus a project filter.
- The session-cookie name in checkpoint 4 was derived from `@mastra/auth-better-auth`'s
  `sessionCookieName`, not guessed, and the operator is told to copy the exact name from devtools.
- Checkpoint 1's command was executed against a fixture `.env` holding `export LINEAR_CLIENT_ID=abc123`
  and `LINEAR_CLIENT_SECRET=''` — it reports `lines=1 set` and `lines=1 EMPTY`, which is the behaviour
  the checkpoint claims.
- `git diff 6635258 -- 'docs/Self-hosting research.md' | grep -E '^[-+](#|\|)'` — no output: no heading
  and no table row added, removed or changed, pinned to the baseline.
- `git diff --name-only 6635258 | grep -E '\.(ts|js|mjs|cjs)$|^src/'` — no output.
  `find apps ops -type f ! -name '*.md'` — no output.
- `grep -rniE 'lin_api_|lin_oauth_|client_secret[=:][A-Za-z0-9]' apps/ .env.schema .env.example` — no
  output; `git status --porcelain` shows no `.env` created or left behind.
- Added lines in `apps/linear/README.md` over 105 columns, excluding fenced blocks and tables — none.
- The frontmatter was parsed as YAML after every append: `deferred` is one list of six items and
  `operator_actions` one list of nine non-empty strings.
- Manual: the redirect URL read against `routes.js:121,132` character by character and unchanged by this
  story; each checkpoint confirmed runnable at the point it appears (1–3 before any connection exists,
  4–5 only after).

**Follow-up review recommendation: true.** Fourteen `medium` entries were patched on a first pass, and
the named unverified risk is this: three of the surviving claims describe Linear's console or the
Factory SPA rather than the installed package, and this worktree has no application, no `.env` and no
tunnel to check them against — that Linear's OAuth application console offers no scope selector and no
mandatory webhook section (taken from Linear's developer documentation, not from a console this run
could open), that the intake settings expose both a Linear issue-sync selection and a "Linear routing"
board binding under roughly those names (taken from `@mastra/factory`'s own README rather than from the
running UI), and that the session cookie is `__Secure-better-auth.session_token` here (derived from
`sessionCookieName`'s logic, not observed). The operator's own registration settles all three.

**Residual risks.** Every acceptance criterion naming a console, a password manager, `.env` or a live
issue is owed by the operator and enumerated in `operator_actions:`. None of it is startable until
Story 3.2's operator actions land: `https://factory.kovalchuk.win` resolves to nothing until the tunnel
is up, and Linear will not return a browser to a host it cannot reach. The repo now documents an
application that does not yet exist, which is intended and stated. The one criterion that is not merely
unstarted but unachievable is the @-mention proof — `operator_actions:` says so explicitly rather than
owing the operator an impossible task, and the epic, the §11 trap table, the compiled epic context and a
user-level memory note all still assert the premises this story disproved; all four are deferred, and
until they are corrected a reader who starts from any of them will disagree with `apps/linear/README.md`.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Confirm the precondition first: the public origin is serving and registration is closed. Do nothing below until `ops/README.md` ingress checkpoint 4 passes (`https://factory.kovalchuk.win/signin` answers `200` through the tunnel) and `README.md` step 3's probe answers `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED`. Linear will not return a browser to a host it cannot reach, and the redirect URL registered below is on that origin.
- Register the OAuth application. Linear → Settings → API → **OAuth applications** → **Create new**, following `apps/linear/README.md` → "Register the application" step by step. Redirect URL is `https://factory.kovalchuk.win/auth/linear/callback`, character for character — no `/api` prefix, no trailing slash. There is no scope screen to fill in: Linear declares no scopes in its console, and this deployment requests `read,comments:create` from code (`integration.js:330`). **Leave the application's webhooks off and subscribe to no events** — no Linear webhook route exists in `@mastra/factory@0.15.0`, so a configured webhook would be a URL with nothing behind it.
- Escrow the client secret, at creation. Linear displays `LINEAR_CLIENT_SECRET` exactly once, on the page where the application is created, and never shows it again. Put it in your password manager in the same action. Recovery is a rotation in the console plus an `.env` edit in the same moment, because every connect flow in between fails.
- Populate `.env` and restart. Write the two lines from `apps/linear/README.md` → "Register the application" into `.env` at the repository root — `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`, together. Then restart with `npm run build && npm run start`; `.env` is read once at startup. Checkpoints 1 and 2 are the proof. A boot that ends in `integration 'linear' signs OAuth state and requires a replica-stable state secret` means none of `GITHUB_APP_WEBHOOK_SECRET`, `WORKOS_COOKIE_PASSWORD` or `SLACK_APP_SIGNING_SECRET` is set, not that the application is wrong. Never commit `.env`.
- Confirm the surface is live before connecting anything. Checkpoint 3 in `apps/linear/README.md`: `curl https://factory.kovalchuk.win/web/linear/status` must answer `401 {"error":"unauthorized","reason":"auth_required"}`. A `200` carrying `"reason":"missing_config"` is **not** a pass — it is the disabled stub, meaning the integration was never constructed (both keys unset, or only the id set, which logs nothing at all).
- Connect the workspace. Open `https://factory.kovalchuk.win/auth/linear/connect` while signed in, consent, and pick the workspace; the browser should land on `/?linear=connected`. Confirm from the server side that `/web/linear/status` now answers `"connected":true` with `"reason":"ready"` and names the workspace. A redirect to `/?linear=error` writes a `[Linear]` warning to the server log and nothing to the browser — read the log, not the page.
- Make both intake selections, following `apps/linear/README.md` → "Choose what comes in". First, in the intake settings, enable Linear issue sync and select the Linear projects to pull from (per-teammate). Then bind each selected project to a board on the **Linear routing** card. The second selection is the binding ingestion depends on — a project selected but not bound produces an empty issue list, no work item and nothing in the log.
- Prove the loop. Checkpoint 5 in `apps/linear/README.md`: create a small issue in a selected and routed Linear project, in a non-terminal state, and confirm it appears in **Work → Intake** as a work item and that opening it starts a session. Completing or canceling the issue in Linear should move the card to its terminal state — immediately on the next board read, or within five minutes via the reconcile sweep.
- Do **not** attempt the @-mention proof. The story's fourth Given asks for "an @-mention of the app is received"; that is not achievable at `@mastra/factory@0.15.0` and no console action makes it so. `app:mentionable` is not requested, `actor=app` is never put on the authorize URL, and the package registers no Linear webhook route and carries no `AgentSessionEvent` handler — so a mention has nowhere to arrive. `apps/linear/README.md` → "Mentions are not available at `@mastra/factory@0.15.0`" records the limitation with its evidence; re-check it after a `@mastra/factory` bump rather than treating it as a misconfiguration.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
