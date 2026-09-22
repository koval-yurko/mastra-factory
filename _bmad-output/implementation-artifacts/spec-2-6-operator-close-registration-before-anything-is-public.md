---
title: 'Story 2.6: [operator] Close registration before anything is public'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: 'a43a3695f8d6b34aac1624dc39929a5bc745dacd'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Closing registration leaves no self-service password recovery and no documented way to add a
      second operator — and a second account would not see the first account's work anyway.
    evidence: |-
      No email sending is configured anywhere in this deployment, so better-auth's reset-password flow
      has no transport; with sign-up closed, a locked-out operator's only path is the same source edit
      README step 3 now documents, which is not labelled as recovery. Separately, the personal-org
      bootstrap keys on the user id (`personal-<user id>`, `@mastra/auth-better-auth/dist/index.js`
      `ensureOrganization`), so a second account lands in its own organization and sees none of the
      first account's projects, stored credentials or GitHub connection — every integration is
      org-scoped.
      Not done here: both are pre-existing consequences of the Story 2.3/2.4 identity design rather
      than of this diff, and documenting multi-operator semantics is new content about a scenario this
      single-operator deployment has not reached. The natural owner is whichever story first adds a
      second human.
    location: >-
      README.md "Start the Factory Server" step 3 / Troubleshooting
    severity: low
  - summary: >-
      `docs/Self-hosting research.md` is now the one committed document describing a different
      account-creation mechanism from `README.md` step 3.
    evidence: |-
      `docs/Self-hosting research.md:235,497-502,597` describe the sequence as "create the account on
      loopback with `signUpEnabled: true`, then flip to `false` before the tunnel" — accurate as the
      plan and as history, but a reader who lands there rather than in `README.md` will not find the
      reopen-and-restore procedure step 3 now specifies, nor the probe that verifies it.
      Not done here: `AGENTS.md:26-27` makes that file's section numbers stable citation anchors used
      across the spec and stories, and `epics.md` assigns the file to Story 5.3, which renames and
      rewrites it. Editing its prose from this story risks the anchors for a divergence that is
      currently only a difference of detail, not a false statement.
    location: >-
      docs/Self-hosting research.md §6-7 vs README.md step 3
    severity: low
operator_actions:
  - >-
    Precondition — the running server must be on this diff. `npm run dev` watches the source and
    respawns on save (`[Mastra Dev] - ✅ Restarting server...`), so checking out this change is
    normally enough; if that line never appeared, stop the dev server and start it again, because a
    process still serving the previous build has registration open and every check below then
    passes for the wrong reason. Confirm the database is `healthy` first (README step 2). Nothing in
    `.env` needs to change: there is no key for this, which is the point of the story.
  - >-
    Check 1 — the sign-in page offers no account creation. Open `http://127.0.0.1:4111/signin` in
    the browser. Expected: **Welcome back** over the email and password form, and underneath it the
    literal line **Account creation is managed by your administrator.** where the **New here? Sign
    up** toggle used to be. Treat this as a hint rather than proof — the SPA hides the toggle only
    when `/auth/me` answers `signUpDisabled: true`, so a visible toggle can also mean the page could
    not read auth state; check 2 is the authoritative one. Signing in with the account made under
    Story 2.4 must still work — this closes registration, not sign-in.
  - >-
    Check 2 — the sign-up endpoint refuses the request. Run README step 3's probe:
    `curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:4111/auth/api/sign-up/email
    -H 'Content-Type: application/json' -d
    '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'`.
    Only `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED` passes; anything else is inconclusive, not
    a pass — `000` is nothing listening, `404` is the wrong path or self-managed auth not selected,
    `503 auth_unavailable` is the migration failure diagnosed in README step 4, and `200` means
    registration is still open AND the probe just created a real `probe@example.invalid` account
    that has to be deleted (README step 3 gives the `psql` statement) before re-probing.
  - >-
    Check 3 — Studio's login stays cosmetic. Anything Studio renders for login in production
    without a licence is already empty (`buildCapabilities` returns `login: null`), so confirm only
    that nothing there offers account creation either, and that it is not a route the operator is
    expected to use. No action follows from this one; it is recorded so a blank Studio login is not
    later mistaken for a regression from this change.
  - >-
    Confirm before any Epic 3 story. Epic 3's first story opens a public origin; this closure is
    the precondition for that, so the two checks above must hold on a restarted server first.
---

<intent-contract>

## Intent

**Problem:** `src/mastra/index.ts` constructs `MastraAuthBetterAuth` with `signUpEnabled: true`, so anyone
who can reach `/signin` can create an account. Only the loopback bind (`MASTRA_HOST=127.0.0.1`) keeps that
form off the network, and Epic 3's first story opens a public origin. Registration has to be shut before
that, and shut as committed code rather than an env toggle a bad `.env` could silently revert.

**Approach:** Flip the one constructor field to `signUpEnabled: false` and rewrite the comment that promised
this story would. Pin the closure with a named test on `isSignUpEnabled()`, which is the single field all
three consuming surfaces read. Then correct every committed sentence that still tells an operator
registration is open — in `.env.schema`, `.env.example` and `README.md` step 3, which currently instructs
the operator to click a sign-up toggle this change removes — and park for the operator's restart-and-check.

## Boundaries & Constraints

**Always:**
- The closure is the literal `signUpEnabled: false` in the `MastraAuthBetterAuth` options in
  `src/mastra/index.ts`. The field stays written out: deleting it restores the package default `true`
  (`@mastra/auth-better-auth/dist/index.js:442`, `options.signUpEnabled ?? true`).
- `src/mastra/index.test.ts` keeps a test whose failure names the regression: a fresh provider built from
  `BETTER_AUTH_SECRET` alone reports `isSignUpEnabled() === false`. Deleting the option must turn it red.
- `README.md` step numbering under "Start the Factory Server" stays 1–6 with the same titles. Step 6 is
  cited by `sandbox/README.md` and by Story 2.5's operator actions; renumbering breaks those citations.
- Step 3 must stay a procedure that actually works after this change: creating an account now requires
  temporarily setting the field back to `true`, restarting, creating it, and restoring `false`.
- Prose changes are corrections of statements this diff falsifies, nothing wider.
- Every part an agent can do is committed; the story then parks at `status: awaiting-operator` with the
  restart and the two checks in `operator_actions:`.

**Never:**
- Never introduce an env key for this, never declare one in `.env.schema` / `.env.example`, and never read
  `process.env` for sign-up state — the acceptance criterion is precisely that a `.env` cannot reopen
  registration.
- Never pass any other option to the constructor: no `auth`, `database`, `baseURL`, `plugins`, `name`.
  Deferred-instance mode is unchanged and this story adds nothing to it.
- Never touch the branch order in `selectAuth()`, the `MASTRA_SHARED_API_URL` arm, the blank-secret gate,
  or `const secretEncryption = auth === null ? undefined : credentialEncryption()`.
- Never edit `docs/Self-hosting research.md` (Story 5.3 owns it; its section numbers are cited anchors),
  `AGENTS.md`, `sandbox/`, `ops/`, `docker-compose.yml`, `tsconfig.json`, `package.json`,
  `.bmad-loop/policy.toml` or `sprint-status.yaml`.
- Never start a server, open a database connection, or run a migration; never add a dependency.
- Never move construction out of `src/mastra/index.ts` — the literal `new Mastra(...)` stays (AD-2/NFR21).

## I/O & Edge-Case Matrix

This matrix covers only what `selectAuth()` can be asked in-process. The three surfaces an operator sees —
the SPA's sign-in page, `POST /auth/api/sign-up/email` and Studio's login — all need a running deployment
against a live database, so they are `operator_actions:` checkpoints, not rows here; Design Notes records
why one field pins all three.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Registration closed | `BETTER_AUTH_SECRET` set, nothing else | `selectAuth()` returns a `MastraAuthBetterAuth` whose `isSignUpEnabled()` is `false`, `name` still `better-auth` | No error expected |
| Padded secret | `BETTER_AUTH_SECRET=" s3cret… "` | trimmed, same provider, still closed | No error expected |
| Platform precedence | `MASTRA_SHARED_API_URL` **plus** a secret | `undefined` — no provider is constructed, so the field has no meaning | No throw, unchanged |
| Auth off | `MASTRACODE_AUTH_DISABLED=1` | `null`, unchanged | No throw |
| Auth unconfigured | `BETTER_AUTH_SECRET` unset, `""` or `"   "` | `undefined` — falls through to the platform-backed default | No throw, unchanged |

</intent-contract>

## Code Map

- `src/mastra/index.ts` -- **the whole code change, one field.** `selectAuth()` is at ~161; the
  `new MastraAuthBetterAuth({...})` literal is at ~182-200. `signUpEnabled: true` is **line 189**, preceded
  by a five-line comment (185-188) reading *"Explicit even though `true` is the package default: Story 2.6
  closes registration once this deployment's single account exists … A field that already exists makes that
  a one-word change with a clear blame line."* — that comment is the prediction this story fulfils and must
  be rewritten to state the closure, why it is code and not env, and how to reopen it deliberately. The
  `satisfies ConstructorParameters<typeof MastraAuthBetterAuth>[0]` note at 190-199 is unrelated and stays.
  Arm 3 of the chain comment (123-147) describes deferred-instance mode and does not mention sign-up;
  leave it. Nothing else in the file reads or writes sign-up state.
- `src/mastra/index.test.ts` -- **the pinning surface.** `describe('selectAuth')` at 780. The test
  `builds a self-managed provider from BETTER_AUTH_SECRET alone` (789-803) asserts
  `instanceof MastraAuthBetterAuth`, `name === 'better-auth'`, and at **802**
  `expect(provider.isSignUpEnabled()).toBe(true)` under a comment reading *"Story 2.6 flips this to false."*
  — that assertion is what this story flips, and it is worth lifting into its own named `it(...)` so a
  deleted option fails with a test name that says registration reopened. `SECRET` at 782, per-describe
  `afterEach` at 784-787. Nothing else in the 46-test file touches sign-up.
- `node_modules/@mastra/auth-better-auth/dist/index.js` -- **read-only, why one field is enough.** `:442`
  `this.signUpEnabledConfig = options.signUpEnabled ?? true` — the default that makes deletion dangerous.
  `:493` `disableSignUp: !this.signUpEnabledConfig` inside the `betterAuth({...})` built by `init()`.
  `:700-701` `isSignUpEnabled()` returns the same field. One field, three readers.
- `node_modules/@mastra/auth-better-auth/node_modules/better-auth/dist/api/routes/sign-up.mjs` --
  **read-only, the endpoint refusal.** `:22` the endpoint is `/sign-up/email` (mounted under `/auth/api`).
  `:144-147` throws `BAD_REQUEST` with message *"Email and password sign up is not enabled"* and code
  `EMAIL_PASSWORD_SIGN_UP_DISABLED` when `emailAndPassword.disableSignUp` is set. That is FR13's refusal.
- `node_modules/@mastra/factory/dist/auth.js:289-295` -- **read-only.** `handleAuthMe` reports
  `signUpDisabled: true` to the SPA when `provider.isSignUpEnabled?.() === false`.
- `node_modules/mastra/dist/factory/assets/index-DbZ8psQ5.js` -- **read-only, the SPA.** The sign-in form
  component takes `signUpDisabled` and, when true, renders the text *"Account creation is managed by your
  administrator."* **in place of** the **New here? Sign up** toggle button. That exact string is the
  operator's visual confirmation.
- `node_modules/@mastra/core/dist/ee-B4JkfaNy-B2RRRA3J.js:403-425` -- **read-only.** `buildCapabilities`
  also calls `isSignUpEnabled()`, and returns `login: null` in production without a valid licence
  (`isLicensedOrCloud` false) — the empty Studio login the fourth acceptance criterion calls cosmetic.
- `.env.schema:190-192` and `.env.example:165-167` -- **edit, identical three-line paragraph** inside the
  "Self-managed auth (Better Auth)" banner: *"Registration is OPEN on this path: anyone who can reach the
  sign-in page can create an account until a committed code change closes sign-up, so do not expose a fresh
  deployment publicly before making your own account."* This diff is that committed change, so the sentence
  becomes false the moment it lands. Banner convention: `#`-prefixed prose lines between two `# ---` rules.
  No key is added, removed or given a value.
- `README.md` -- **edit, operator procedure.** `:39` `MASTRA_HOST` — *"the one value that keeps the open
  sign-up form (step 3) off the network while it is open"*. `:66` *"this is the check that the sign-up
  window stays on this machine"* and `:72` *"the open sign-up form is on every interface"* — all three now
  describe a window step 3 opens deliberately rather than a standing default. `:82-86` **step 3 — Create the
  account** is the substantive rewrite: it currently says to *"Choose the **New here? Sign up** toggle"* and
  closes with *"A later, committed change closes sign-up; until it lands…"*, a procedure that cannot be
  followed after this diff. `:232` the Sign-in troubleshooting bullet is the list where the toggle's absence
  belongs. Step titles and the 1–6 numbering are load-bearing (cited from `sandbox/README.md` and Story
  2.5's operator actions) — rewrite in place, never renumber.
- `.bmad-loop/policy.toml` -- **read-only, gitignored.** `[verify].commands`: `npm ci --no-audit --no-fund`,
  `npm run check`, `npx varlock load --format json`, the non-`src/` source guard, the `.agents/skills`
  guard, `npm test`. This story adds no check, so the array is unchanged.
- Baseline revision `a43a3695f8d6b34aac1624dc39929a5bc745dacd`; tree clean at start.

## Tasks & Acceptance

**Execution:**
- `src/mastra/index.ts` -- change `signUpEnabled: true` to `signUpEnabled: false` and rewrite the comment
  above it: registration is closed, the field is written out because deleting it restores the package
  default `true`, and reopening for a deliberate second account is an edit here plus a restart, not a `.env`
  line -- the acceptance criterion is that no environment value can reopen registration, so the comment has
  to say where the switch is instead of pointing at a story that has now happened.
- `src/mastra/index.test.ts` -- lift the `isSignUpEnabled()` assertion out of
  `builds a self-managed provider from BETTER_AUTH_SECRET alone` into its own `it(...)` named for the
  closure, asserting `false`, with a comment naming the three readers of `signUpEnabledConfig` (the
  `disableSignUp` flag `init()` passes better-auth, `/auth/me`'s `signUpDisabled`, and `buildCapabilities`)
  -- deleting the option is the regression that silently reopens registration, and a test named for it fails
  with the reason in its own title. Extend the existing padded-secret test with the same assertion, since
  its matrix row claims the trimmed value reaches the same provider *configuration*, not just the same class.
- `.env.schema` / `.env.example` -- replace the "Registration is OPEN on this path" paragraph in both with
  the closed state: sign-up is disabled in `src/mastra/index.ts`, the sign-in page offers no account
  creation, `POST /auth/api/sign-up/email` is refused, and there is deliberately no key here that reopens it
  -- these files are what an operator copies to `.env`, and a sentence telling them registration is open is
  a live trap once it is not. Mirror the wording between the two files as the rest of the section does.
- `README.md` -- rewrite step 3 so creating an account is the temporary-reopen procedure (set the field to
  `true`, restart, create the account, restore `false`, restart), keeping the step number and title; add its
  checkpoint (the SPA text *"Account creation is managed by your administrator."* and the `400`
  `EMAIL_PASSWORD_SIGN_UP_DISABLED` response); reword the three "open sign-up form" references at `:39`,
  `:66` and `:72` to name the window step 3 opens; and add one Sign-in troubleshooting bullet at `:232` for
  the missing toggle -- step 3 as written instructs the operator to click a control this diff removes, so
  leaving it is shipping a procedure that cannot be completed.

**Acceptance Criteria:**
- Given `signUpEnabled` defaults to `true` and is the most dangerous setting in this deployment, when
  `src/mastra/index.ts` is read, then the only `MastraAuthBetterAuth` construction passes an explicit
  `signUpEnabled: false`, and the diff that closes registration is entirely in tracked source under
  version control.
- Given a `.env` must not be able to revert it (FR13/NFR13), when the full diff and both env files are
  read, then no environment key gates sign-up: `grep -rn 'signUpEnabled' src/` shows no `process.env`
  on or near it, and no key mentioning sign-up or registration is declared in `.env.schema` or
  `.env.example`.
- Given deleting the field restores the package default, when the `signUpEnabled: false` line is removed
  from `src/mastra/index.ts`, then `npm test` fails on the test named for the closure — and passes again
  when it is restored.
- Given `.env.schema` and `.env.example` are what an operator copies, when their "Self-managed auth (Better
  Auth)" banners are read, then neither claims registration is open, both state that sign-up is closed in
  committed code, and no key was added, removed or given a value.
- Given `README.md` documents the procedure an operator follows, when "Start the Factory Server" is read,
  then step 3 describes account creation against closed registration without instructing the operator to
  click a control that no longer renders, the steps are still numbered 1–6 with their existing titles, and
  no sentence claims registration is open by default.
- Given the entry must stay indivisible (AD-2/NFR1/NFR21), when `src/mastra/index.ts` is read, then it
  still contains the literal `new Mastra(...)` exporting `mastra`, `selectAuth()`'s branch order is
  unchanged, and no construction moved to another file.
- Given secrets never enter the repo (NFR18), when the full diff against
  `a43a3695f8d6b34aac1624dc39929a5bc745dacd` is read, then no added line carries a usable password, key or
  token.
- Given the verify gate, when `npm ci --no-audit --no-fund`, `npm run check`, `npx varlock load --format
  json`, both path guards and `npm test` run in order in a worktree with no `node_modules/`, then every one
  exits 0.
- Given this verification needs a running deployment (NFR13), when the session finishes, then the story
  parks at `status: awaiting-operator` with the restart, the absent sign-up toggle, the refused endpoint
  and the cosmetic Studio login in `operator_actions:`, and is confirmed before any Epic 3 story.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 22 findings — high 0, medium 10, low 8, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` The step-3 `curl` probe creates a real `probe@example.invalid` account whenever
    it fails, and nothing removes it. Verified: `better-auth/dist/api/routes/sign-up.mjs:144-147` checks
    `disableSignUp` before body validation, so the pass path writes nothing but the fail path writes a
    user row, and step 4's organization join cannot surface it (a curl-only account has a `"user"` row and
    no `"organization"` row, which step 4 calls "not yet a failure"). Patched: the `200` branch now carries
    the `psql` delete, its quoting rationale, and an FK fallback, then restore-and-re-probe.
  - `[medium]` `[patch]` The probe's outcome was stated only against `200`, so `000`, `404` and `503` all
    read as a pass. Verified: `-s` swallows the connection error, and a `503 auth_unavailable` is step 4's
    migration failure — a down or unmigrated server would have confirmed a closure nobody tested, right
    before Epic 3 opens the public origin. Patched: exactly one outcome passes (`400` carrying
    `EMAIL_PASSWORD_SIGN_UP_DISABLED`), with `000`/`404`/`503`/`200` each named and routed.
  - `[medium]` `[patch]` Step 3 never said the temporary `signUpEnabled: true` must not be committed, and
    nothing verified the restoration. Verified: while the field says `true` the closure test fails, so the
    verify gate is red and a commit made in that window ships open registration in tracked source.
    Patched: the edit is marked uncommittable, the red test is named as the pin working, and the restore
    sub-step ends with `git diff --exit-code src/mastra/index.ts`.
  - `[medium]` `[patch]` The reopen procedure assumes the `npm run dev` path, while this same README's
    "Deploy" section documents `npm run build`/`npm run start` and `npm run deploy`, where the source edit
    does nothing until a rebuild and step 1's loopback bind does not exist. Patched: a scoping paragraph
    binds the procedure to the dev path and forbids opening the window on an internet-reachable deployment.
  - `[medium]` `[patch]` "`npm run dev` reads the source once; stop it and start it again" is false.
    Verified in the installed CLI: `mastra factory dev` →`startDevServer({factory: true})` → `dev()` →
    `bundler.watch(...)`, and `BUNDLE_END` fires `checkAndRestart` → `rebundleAndRestart`
    (`node_modules/mastra/dist/index.js:4605-4627`, `:4763-4776`), skipped only while
    `/__hot-reload-status` reports `disabled`. The window therefore opens on save, not on a chosen
    restart. Patched in README step 3 and in this spec's `operator_actions` precondition, which repeated
    the same claim.
  - `[low]` `[patch]` Onboarding was sequenced ambiguously against the restore: the list said to restore
    "before going on to step 4" while the paragraph after implied onboarding came later, when it actually
    starts the instant **Create account** succeeds. Patched: close the window as soon as the account
    exists, with the reason the restart is free (the account is a row, the session a cookie).
  - `[low]` `[patch]` The env-file rewrite dropped the deleted sentence's instruction ("do not expose a
    fresh deployment publicly before making your own account") and compressed the procedure to "an edit to
    that file and a restart" — no restoration, no loopback requirement. Low rather than medium because
    README step 3 still states both and the banner points there. Patched: both banners now mirror step 3's
    full shape and restore the exposure warning, byte-identical to each other.
  - `[medium]` `[patch]` The `MASTRA_HOST` rewrite narrowed the loopback bind's justification to the
    sign-up window, implying it stops mattering after step 3, when it still keeps the authenticated API,
    sessions, stored credentials and Studio off the network on every boot — a security-relevant claim this
    diff made narrower than the truth. Patched at `:39`, `:66` and `:72`, and the three sentences rewritten
    to parse in one pass.
  - `[low]` `[defer]` With registration closed there is no self-service password recovery and no
    documented way to add a second operator, and a second account would get its own personal organization
    and therefore see none of the first account's projects, credentials or GitHub connection.
  - `[low]` `[reject]` The no-env-key guarantee is asserted by grep rather than by a test; add tests
    stubbing `SIGNUP_ENABLED`, `MASTRACODE_SIGNUP_ENABLED` and similar. Real in principle but the fix
    invents key names nobody has added, to guard a hypothetical future edit — the same shape Story 2.3's
    review rejected for "no test catches an `auth:` key being added", and the set of keys a future author
    might invent is not enumerable.
  - `[low]` `[patch]` The closure test dropped the `toBeInstanceOf` assertion its sibling keeps, so a
    `selectAuth()` regression returning `undefined` would fail with a bare thrown `Error` in the one test
    whose value is that its failure names the problem. Patched: the assertion added before the type guard.
    The paired suggestion to extract an `expectBetterAuth()` helper for the thrice-repeated type guard is
    rejected — a cosmetic refactor that adds surface to three passing tests.
  - `[low]` `[reject]` This spec's `operator_actions` check 3 (Studio) has no pass/fail, and its Code Map
    pins line numbers this diff shifts. Refuted on both halves: the fourth acceptance criterion asks the
    operator to *recognise* the empty Studio login as cosmetic, so "no action follows" is the correct
    content, not a defect; and a Code Map describes the pre-change file an implementer reads, so
    pre-change anchors are what it is for.
  - `[medium]` `[patch]` `carried` — dev-server hot-restart claim, filed independently by the edge-case
    layer with the same `checkAndRestart` evidence. Same entry and same patch as the fifth row.
  - `[medium]` `[patch]` `carried` — stray `probe@example.invalid` account after a failed probe, filed
    independently by the edge-case layer with the delete statement. Same entry and patch as the first row.
  - `[medium]` `[patch]` `carried` — non-`400`/`200` probe outcomes reading as a pass, filed independently
    by the edge-case layer. Same entry and patch as the second row.
  - `[low]` `[patch]` A visible **New here? Sign up** toggle is not proof registration reopened: the SPA
    renders it whenever `/auth/me` does not answer `signUpDisabled === true`, including when that request
    fails. Verified in the shipped bundle (`signUpDisabled:(…)?.signUpDisabled===!0`). Patched: the toggle
    check is demoted to a hint in both README step 3 and `operator_actions` check 1, with the probe named
    authoritative.
  - `[medium]` `[patch]` `carried` — the temporary `true` edit can be committed or stashed; add
    `git diff --exit-code src/mastra/index.ts`. Same entry and patch as the third row.
  - `[low]` `[patch]` `carried` — env banners dropped the loopback/exposure warning, filed independently
    by the edge-case layer at low confidence. Same entry and patch as the seventh row.
  - `[medium]` `[patch]` `carried` — the "reads the source once" claim, filed a third time by the
    verification-gap layer's `Other findings` with the same CLI evidence. Same entry and patch.
  - `[false]` `[reject]` The verification-gap layer reported **no verification gaps**: it confirmed the one
    production site, that the option has no in-repo sibling, and independently re-ran the mutation check
    (delete the field → the closure test fails; restore → green). Recorded as a finding row because every
    layer result gets one; there is nothing to fix.
  - `[low]` `[defer]` `docs/Self-hosting research.md` §6-7 still describes the create-then-flip sequence as
    the plan, so it is now the one committed document describing a different account-creation mechanism
    from README step 3. Accurate as history, and the file is owned by Story 5.3 with section numbers cited
    as stable anchors across the spec, so the fix belongs there.
  - `[false]` `[reject]` The padded-secret test was widened into a second closure check, so a deleted field
    turns two tests red with only one named for the reason. Refuted as a defect: the assertion was added
    deliberately so the matrix row "trimmed, same provider, still closed" is covered by a test that
    actually checks the configuration rather than only the class, and it is recorded in Tasks & Acceptance.
    A second red test names a true consequence.

## Design Notes

**Why one field is the whole change.** `signUpEnabledConfig` is set once in the constructor
(`@mastra/auth-better-auth/dist/index.js:442`) and read by three independent surfaces: `init()` passes
`disableSignUp: !signUpEnabledConfig` into `betterAuth()` (`:493`), which is what makes
`POST /auth/api/sign-up/email` answer `400 EMAIL_PASSWORD_SIGN_UP_DISABLED`
(`better-auth/dist/api/routes/sign-up.mjs:144-147`); `@mastra/factory/dist/auth.js:291` turns
`isSignUpEnabled() === false` into `/auth/me`'s `signUpDisabled`, which is what removes the SPA's
**New here? Sign up** toggle; and `@mastra/core`'s `buildCapabilities` reads it for Studio's login. So
pinning `isSignUpEnabled()` in a test pins all three, and no second assertion is needed to cover them.

**Why the test is named for the regression.** The dangerous edit is not changing `false` to `true` — that
is visible in review — it is *deleting* the line, because `options.signUpEnabled ?? true` then reopens
registration with no diff that mentions sign-up at all. A test that fails with "registration is closed" in
its name is the only place that reads as an alarm rather than a stale expectation.

**Why README step 3 becomes a reopen procedure rather than a new step.** The steps are cited by number from
outside this file (`sandbox/README.md`, Story 2.5's operator actions both name step 6), so inserting a step
would silently invalidate those references. Step 3's job — "the operator ends up with exactly one account"
— is unchanged; only the mechanism moves from a rendered toggle to a two-line source edit around the
account creation. That also keeps the loopback-bind warnings in steps 1 and 2 meaningful: they now protect
a window the operator opens on purpose and closes again, which is a smaller and more honest claim than
protecting a form that is open by default.

## Verification

**Commands:**
- `grep -n 'signUpEnabled' src/mastra/index.ts` -- expected: exactly one executable line,
  `signUpEnabled: false,`; the only other hit is the comment quoting the package default
- `grep -n 'process.env' src/mastra/index.ts | grep -i 'signup\|registration'` -- expected: no match
- `grep -niE 'sign.?up|registration' .env.schema .env.example` -- expected: only the rewritten
  closed-registration prose; no key name, and no line of the form `KEY=`
- `grep -n 'new Mastra(' src/mastra/index.ts` -- expected: the `export const mastra = new Mastra({`
  construction present (the file's two other hits are comments about it, unchanged from the baseline)
- `grep -nE '^### [0-9] — ' README.md` -- expected: six steps, numbered 1–6, titles unchanged from the
  baseline (diff the headings against `git show a43a3695f8d6b34aac1624dc39929a5bc745dacd:README.md`)
- `grep -n 'New here? Sign up' README.md` -- expected: present only inside step 3's reopen procedure, never
  as the default way to reach the form
- `npm ci --no-audit --no-fund` -- expected: exits 0 in a worktree with no `node_modules/`
- `npm run check` -- expected: exits 0
- `npx varlock load --format json` -- expected: exits 0 with no `.env` present
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected: 0
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: 0
- `npm test` -- expected: exits 0, every test passing, including the renamed closure test
- Mutation check: delete the `signUpEnabled: false` line, run `npm test` -- expected: the closure test
  fails; restore the line byte-for-byte and re-run -- expected: green again
- `git diff a43a3695f8d6b34aac1624dc39929a5bc745dacd -- . ':!package-lock.json' | grep '^+'` -- expected: no
  line carries a usable password, key or token

**Manual checks (if no CLI):**
- Nothing here contacts a database or a browser. Read the rewritten `README.md` step 3 end to end as an
  operator with a fresh deployment and confirm every instruction is executable against the code this diff
  leaves behind — in particular that the account-creation path names the source edit, the restart, and the
  restoration of `signUpEnabled: false`.
- Read `.env.schema` and `.env.example` side by side and confirm the two rewritten paragraphs say the same
  thing, as every other paragraph in that section does.

## Auto Run Result

Status: awaiting-operator
Blocking condition: none

**Implemented change.** Registration is closed. `src/mastra/index.ts` constructs the deployment's only auth
provider with `signUpEnabled: false`, so no one can create an account against it — and because that is a
literal in tracked source rather than an environment key, no `.env`, stray export or bad deploy config can
reopen it. The field is written out rather than omitted: the package default is `options.signUpEnabled ??
true` (`@mastra/auth-better-auth/dist/index.js:442`), so deleting the line would reopen sign-up in a diff
that never mentions sign-up. One field drives all three surfaces the story cares about — `init()` passes
`disableSignUp: !signUpEnabledConfig` into better-auth, which makes `POST /auth/api/sign-up/email` answer
`400 EMAIL_PASSWORD_SIGN_UP_DISABLED`; `/auth/me` turns it into the SPA's `signUpDisabled`, which replaces
the **New here? Sign up** toggle with *"Account creation is managed by your administrator."*; and
`buildCapabilities` reads it for Studio. Nothing else in `selectAuth()` moved: the branch order, the
blank-secret gate and `secretEncryption`'s `auth === null` coupling are byte-identical.

**Files changed.**
- `src/mastra/index.ts` — `signUpEnabled: true` → `false`, and the comment above it rewritten from a
  prediction about this story into a statement of the closure, why the field must stay written out, why it
  is deliberately not read from the environment, and how to reopen it on purpose.
- `src/mastra/index.test.ts` — the inherited `isSignUpEnabled()` assertion lifted out of the
  provider-construction test into `closes registration: a self-managed provider never allows sign-up`,
  which now also asserts `toBeInstanceOf` so a branch-order regression fails as a named assertion; the
  padded-secret test carries the same closure assertion, so the trimmed path is checked for configuration
  rather than only for class. 59 tests, up from 58.
- `.env.schema` / `.env.example` — the "Registration is OPEN on this path" paragraph, which this diff
  falsifies, replaced in both (byte-identical to each other) with the closed state, the full reopen shape,
  and the restored instruction to stay on loopback while the window is open.
- `README.md` — step 3 ("Create the account", number and title unchanged, because `sandbox/README.md` and
  Story 2.5's operator actions cite these steps by number) rewritten from "click the sign-up toggle" into a
  deliberate reopen-and-restore procedure with a `curl` checkpoint; the `MASTRA_HOST` bullet and the two
  `lsof` sentences restored to the full claim about what the loopback bind protects; one Troubleshooting
  bullet added so an absent toggle reads as intended behaviour rather than a fault.

**Review findings.** Four layers, **22 findings — high 0, medium 10, low 8, false 4, maybe-false 0**. The
verification-gap layer reported **no verification gaps** and independently re-ran the mutation check. Every
finding about the code itself came back clean; all ten patched entries were in the operator-facing prose
this change introduced. **Patched by entry verdict: high 0, medium 6, low 4.** Two entries deferred and
four rejected:
- *Deferred:* no password recovery or second-operator path with sign-up closed, and a second account's own
  personal organization isolating it from the first's work — both pre-existing consequences of the Story
  2.3/2.4 identity design. `docs/Self-hosting research.md` §6-7 still describing the plan's create-then-flip
  sequence — accurate as history, and Story 5.3 owns that file's cited section anchors.
- *Rejected:* tests stubbing invented env key names (`SIGNUP_ENABLED`, …) to guard a hypothetical future
  edit — the same shape Story 2.3's review rejected, and the set of keys a future author might invent is
  not enumerable. Extracting a shared type-guard helper for three passing tests — cosmetic, adds surface.
  Two claims about this spec refuted: `operator_actions` check 3 having no action is the fourth acceptance
  criterion's own wording (the operator *recognises* the empty Studio login), and a Code Map pinning
  pre-change line numbers is what a Code Map is for. One claim that the padded-secret test's added
  assertion is duplication refuted: it is deliberate matrix coverage, recorded in Tasks & Acceptance.

The single most consequential patch: README step 3 and this spec's operator precondition both claimed
`npm run dev` "reads the source once" and that a restart is the operator's choice. Verified false in the
installed CLI — `mastra factory dev` → `startDevServer({factory: true})` → `dev()` → `bundler.watch(...)`,
and `BUNDLE_END` fires `checkAndRestart` → `rebundleAndRestart` (`node_modules/mastra/dist/index.js:4605-
4627`, `:4763-4776`) — so the sign-up window opens the moment the file is saved. Both texts now say so.

**Follow-up review recommended: true.** Six medium entries were patched on a first pass, which is the
threshold. The named risk: README step 3's reopen ritual is a procedure this change invented, no automated
check exercises any of it, and six of its statements needed correction on this pass — so the residual risk
is another unverified procedural claim in the patched text. Two specifically were reasoned to rather than
executed: the `psql` cleanup's foreign-key fallback (delete `"session"` and `"account"` rows first), and
"onboarding picks up where it left off" after the restore restart.

**Verification.** Full gate in order: `npm ci --no-audit --no-fund` **0** (run at session start into an
empty `node_modules/`), `npm run check` (`tsc --noEmit`) **0**, `npx varlock load --format json` **0** with
no `.env` present, both path guards **0**, `npm test` (`vitest run --dir src`) **0** with **59/59 passing**
— before the patches and again after. Mutation check run twice, before and after patching: deleting the
`signUpEnabled: false` line fails exactly the closure test and the padded-secret test (2 failed | 57
passed); restoring the line byte-for-byte returns 59/59, with `git diff` clean for the entry. Greps:
`signUpEnabled` appears at one executable line in `src/` and once in the comment quoting the package
default; no `process.env` read for sign-up state anywhere; neither env file declares a sign-up key or gives
any key a value; the two env paragraphs `diff` clean against each other; `export const mastra = new
Mastra({` present; README headings still `1 —` … `6 —` with the baseline titles. Secrets scan over every
added line outside `package-lock.json`: only key names, the `EMAIL_PASSWORD_SIGN_UP_DISABLED` error code,
and the literal placeholder `<any 8+ characters>`. No server was started and no database contacted beyond
the suite's own temp libSQL files.

**Residual risks.** Nothing here proves the closure on a running deployment — that is the whole content of
`operator_actions:`, and it is why this story parks rather than completing. The in-repo test reads back the
literal the same diff writes; its real value is as a mutation guard against the field being deleted, not as
evidence that the SPA hides the toggle or that the endpoint answers `400`. Those two claims rest on reading
the vendored packages (`better-auth/dist/api/routes/sign-up.mjs:144-147`,
`@mastra/factory/dist/auth.js:289-295`, and the exact string in the shipped SPA bundle) and are confirmed
only by the operator's checks. Second: the repo's canonical bring-up now tells every future operator that
the normal way to obtain an account is to edit `src/mastra/index.ts` and restart twice — consistent with the
acceptance criterion, which forbids only an *environment* reopen, but it does make a source edit routine in
a procedure whose safety depends on the loopback bind still being in place. Step 3 now says that explicitly
and forbids the procedure on a deployed instance. Third: until an operator runs the checks below, Epic 3
must not start — the closure being committed is not the same as the closure being observed.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — the running server must be on this diff. `npm run dev` watches the source and respawns on save (`[Mastra Dev] - ✅ Restarting server...`), so checking out this change is normally enough; if that line never appeared, stop the dev server and start it again, because a process still serving the previous build has registration open and every check below then passes for the wrong reason. Confirm the database is `healthy` first (README step 2). Nothing in `.env` needs to change: there is no key for this, which is the point of the story.
- Check 1 — the sign-in page offers no account creation. Open `http://127.0.0.1:4111/signin` in the browser. Expected: **Welcome back** over the email and password form, and underneath it the literal line **Account creation is managed by your administrator.** where the **New here? Sign up** toggle used to be. Treat this as a hint rather than proof — the SPA hides the toggle only when `/auth/me` answers `signUpDisabled: true`, so a visible toggle can also mean the page could not read auth state; check 2 is the authoritative one. Signing in with the account made under Story 2.4 must still work — this closes registration, not sign-in.
- Check 2 — the sign-up endpoint refuses the request. Run README step 3's probe: `curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:4111/auth/api/sign-up/email -H 'Content-Type: application/json' -d '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'`. Only `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED` passes; anything else is inconclusive, not a pass — `000` is nothing listening, `404` is the wrong path or self-managed auth not selected, `503 auth_unavailable` is the migration failure diagnosed in README step 4, and `200` means registration is still open AND the probe just created a real `probe@example.invalid` account that has to be deleted (README step 3 gives the `psql` statement) before re-probing.
- Check 3 — Studio's login stays cosmetic. Anything Studio renders for login in production without a licence is already empty (`buildCapabilities` returns `login: null`), so confirm only that nothing there offers account creation either, and that it is not a route the operator is expected to use. No action follows from this one; it is recorded so a blank Studio login is not later mistaken for a regression from this change.
- Confirm before any Epic 3 story. Epic 3's first story opens a public origin; this closure is the precondition for that, so the two checks above must hold on a restarted server first.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
