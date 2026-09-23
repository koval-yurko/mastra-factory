---
title: 'Story 3.3: [operator] A GitHub App that belongs to Yurii'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: '52f07b3632a47969656cf7af64e204a34cff86a7'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Five `MASTRACODE_GITHUB_*` keys that `@mastra/factory@0.15.0` and `src/mastra/index.ts` read
      are declared in neither `.env.schema` nor `.env.example`, so Story 5.2's criterion "every key
      the deployment sets is declared in `.env.schema`" does not hold for the GitHub block.
    evidence: |-
      `src/mastra/index.ts:233` reads `MASTRACODE_GITHUB_AUTHORIZED_BOTS` and passes it to the
      integration as `authorizedBots`. `node_modules/@mastra/factory/dist/integrations/github/
      integration.js:1006-1014` reads four more as the per-sweep overrides that take precedence over
      the declared legacy pair: `MASTRACODE_GITHUB_PR_RECONCILE_ENABLED`,
      `MASTRACODE_GITHUB_ISSUE_RECONCILE_ENABLED`, `MASTRACODE_GITHUB_PR_RECONCILE_INTERVAL_MS` and
      `MASTRACODE_GITHUB_ISSUE_RECONCILE_INTERVAL_MS`. `grep -c` for each over `.env.schema` and
      `.env.example` returns 0.
      Not done here: this spec's Never list forbids declaring them, because declaring a key is a
      schema decision with `@public`/sensitivity and type consequences and the audit that decides
      them is Story 5.2's (`epics.md:1014-1017`). `apps/github/README.md` documents only the keys
      that are declared, so the README and the schema stay consistent with each other in the
      meantime; the four reconcile overrides are unset in this deployment, and
      `MASTRACODE_GITHUB_AUTHORIZED_BOTS` is optional with a built-in default list.
    location: >-
      .env.schema, .env.example, src/mastra/index.ts:233
    severity: low
  - summary: >-
      `epics.md:730` still states "the 5-minute reconcile sweep" as the premise of Story 3.3's own
      acceptance criterion, so the frozen plan and the operator documentation now disagree about the
      one number an operator uses to decide whether merge state is stale or the webhook is broken.
    evidence: |-
      This story established, against `node_modules/@mastra/factory/dist/integrations/github/
      reconcile-worker.js:35`, that the sweep interval defaults to `36e5` — one hour — and corrected
      `apps/github/README.md`, `.env.schema`, `.env.example` and `docs/Self-hosting research.md` §5
      accordingly. `epics.md:730` is the source of the five-minute figure and was not touched, so it
      is now the only place in the repository still asserting it, and it is the surface the next
      reader of this story's intent meets first.
      Not done here: `epics.md` is the frozen sprint plan that this and every other story is
      dispatched from, and rewriting a story's own acceptance premise mid-run would change the
      record the run is judged against. The operator-facing documents are corrected and are the ones
      AD-6 makes normative; the epics correction belongs to a retrospective or a plan amendment.
    location: >-
      _bmad-output/planning-artifacts/epics.md:730
    severity: low
operator_actions:
  - >-
    Precondition — the public origin is serving and registration is closed. Nothing below works
    until `ops/README.md` ingress checkpoint 4 passes (`https://factory.kovalchuk.win/signin`
    answers `200` through the tunnel) and `README.md` step 3's probe answers `400` carrying
    `EMAIL_PASSWORD_SIGN_UP_DISABLED`. GitHub cannot deliver to a host it cannot reach, and every
    URL registered below is on that origin.
  - >-
    Register the App. Settings → Developer settings → GitHub Apps → **New GitHub App**, following
    `apps/github/README.md` → "Register the app" step by step. Callback URL *and* Setup URL both get
    `https://factory.kovalchuk.win/auth/github/callback`; Webhook URL gets
    `https://factory.kovalchuk.win/web/github/webhook`, with **Active** ticked. Grant the seven
    permissions in the Permissions table and subscribe to the ten events in the Webhook events
    section — including the four that the package currently ignores, which is deliberate.
  - >-
    Escrow 1 — the webhook secret, before saving the app. Generate it with `openssl rand -hex 32`,
    paste it into the Webhook → Secret field, and put the same string in your password manager in
    the same action. The field is write-only afterwards; a lost value cannot be read back out of
    GitHub and every delivery fails its signature check until the two agree again.
  - >-
    Escrow 2 — the private key and the client secret, at generation. On the app's General page:
    Client secrets → *Generate a new client secret* (shown once), and Private keys → *Generate a
    private key* (downloads a `.pem`; GitHub keeps only the fingerprint and will not issue the same
    key twice). Escrow both immediately. Losing the private key and the webhook secret together
    means re-registering the app, which means a new App ID, a new slug and a fresh install approval.
  - >-
    Populate `.env` and restart. Write the six lines from `apps/github/README.md` → "Register the
    app" into `.env` at the repository root — `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM on one
    line with `\n` escapes), `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`,
    `GITHUB_APP_WEBHOOK_SECRET`. The first five are all-or-nothing. Then restart with
    `npm run build && npm run start`; `.env` is read once at startup. Checkpoints 1 and 2 are the
    proof — and a boot that ends in `integration 'github' signs OAuth state and requires a
    replica-stable state secret` means `GITHUB_APP_WEBHOOK_SECRET` is empty, not that the App is
    wrong. Never commit `.env`.
  - >-
    Install it on a repository. Open `https://factory.kovalchuk.win/auth/github/connect` while
    signed in and follow the redirect through GitHub's OAuth screen to the install page; choose
    **Only select repositories** and pick the repository to work in. The app reaches nothing until
    this is done. `?manage=1` on the same URL is how to change the selection later.
  - >-
    Prove webhook delivery. Checkpoint 3 in `apps/github/README.md`: at Settings → Developer
    settings → GitHub Apps → your app → **Advanced** → Recent Deliveries, press **Redeliver** on the
    `ping` and record the result. `202 {"ok":true,"ignored":true}` is the pass — signature verified,
    event not allowlisted. A `401` is the secret (the two strings differ, or the server has none); a
    connection error or a Cloudflare `502`/`530` is the tunnel, and goes to `ops/README.md` ingress
    checkpoints 3 and 4 instead. Then checkpoint 4: open a pull request in the installed repository
    and confirm a `[GitHub Webhook]` line appears in the server log.
  - >-
    Prove the loop. Checkpoint 5: enable **Sync GitHub issues** for the installed repository under
    Settings → Work Intake → GitHub issues, open a small issue, find it in **Work → Intake**, and
    take it through to a merged pull request, following root `README.md` → "Run your first issue".
    Record whether the card reaches its terminal state on the merge webhook or only after the
    hourly reconcile sweep — that difference is what tells you whether webhook delivery is actually
    healthy.
---

<intent-contract>

## Intent

**Problem:** `apps/github/README.md` is the file the operator will register the App from, and four of
its load-bearing statements are false against the installed `@mastra/factory@0.15.0` — the `status`
webhook is not handled (it is the stated reason for granting Commit statuses), four of the ten webhook
events it tells the operator to subscribe to are accepted-and-ignored, the reconcile sweep runs hourly
rather than every five minutes, and an unset state signer is described as breaking OAuth across restarts
when it actually refuses the boot. Beyond the reference material the file carries no ordered procedure:
no registration sequence, no installation step, and no checkpoint that would tell the operator whether a
delivery reached `/web/github/webhook` or died at the signature check.

**Approach:** Re-run the cross-reference the story's first Given clause asserts, against the package in
`node_modules`, and correct what it falsifies; then give `apps/github/README.md` the registration →
installation → proof procedure with numbered checkpoints, mirroring what Story 3.2 did for `ops/`.
Everything after that is a console action or an edit to the gitignored `.env`, so the story parks at
`awaiting-operator` with those enumerated.

## Boundaries & Constraints

**Always:**
- Register the permission set and the ten-event subscription list the story's acceptance criteria name.
  The evidence narrows what they *do*, not what is granted: record the narrowing as evidence beside each
  row so a future tightening is a read rather than a re-derivation.
- Every corrected claim cites the installed package by `file:line`. This is the AC's own standard —
  "cross-referenced against the API calls actually present in `@mastra/factory@0.15.0`".
- The callback URL, setup URL and webhook URL already in the file are correct and verified against the
  registered routes; transcribe, never re-derive, and change no URL.
- Match house style: `## <KEY>` sections with **What the value must contain.** / **How to obtain it.**,
  `### N — <claim>` checkpoints with a fenced command and an `Expected:` line, hard-wrapped at ~105
  columns.
- `.env.schema` stays the only list of keys; `apps/github/README.md` stays the only record of what a
  `GITHUB_APP_*` value must contain and how to obtain it. Neither restates the other (AD-6).

**Never:**
- Never edit a heading, heading number or table row in `docs/Self-hosting research.md`. §5 is a dated
  research record: correct it by appending a dated paragraph, the shape Story 3.2 used for §8.
- Never add first-party code: no `.ts`/`.js`/`.mjs`/`.cjs`, no change to `src/`, `package.json` or
  `docker-compose.yml`. `src/mastra/index.ts` is read-only evidence here.
- Never write `.env`, and never put an App ID, private key, client secret or webhook secret in a tracked
  file.
- Never declare the undeclared sibling keys the investigation surfaced
  (`MASTRACODE_GITHUB_AUTHORIZED_BOTS`, `MASTRACODE_GITHUB_PR_/ISSUE_RECONCILE_*`) — "every key the
  deployment sets is declared in `.env.schema`" is Story 5.2's criterion verbatim (`epics.md:1014-1017`).
  Record it as `deferred` instead.
- Never claim an operator-surface result as observed: no App, no `.env` and no tunnel exist in this
  worktree, so registration, installation and the issue-to-merged-PR loop are the operator's proofs.

</intent-contract>

## Code Map

- `apps/github/README.md` -- the file this story edits. `:12-30` Console URLs (correct — leave the URLs
  alone); `:32-53` the permission table, whose Commit statuses row reads "the `status` webhook is
  handled" (false) and whose Checks row reads "CI signal on pull requests" (no `checks.*` call exists);
  `:55-59` the webhook event list; `:61-70` the all-or-nothing group (correct, and independently
  confirmed at `src/mastra/index.ts:217-234`); `:124-146` `GITHUB_APP_WEBHOOK_SECRET`, whose
  "requires either it or `WORKOS_COOKIE_PASSWORD`" is two-thirds of a three-deep chain and whose
  "OAuth breaks across every restart" understates a boot failure; `:148-159` the reconcile sweep,
  "five-minute cycle" and "merged pull requests" both wrong. No registration procedure and no
  checkpoints anywhere in the file.
- `node_modules/@mastra/factory/dist/integrations/github/webhook.js` -- `:6-13`
  `SUPPORTED_GITHUB_WEBHOOK_EVENTS` is exactly six names; `:19-27` signature verify; `:28-35` unset
  secret → 401; `:165-169` `classifyGithubWebhook` returns early without a PR number; `:432-439`
  signature first, then allowlist → `202 {ok, ignored}`; `:443` the `[GitHub Webhook]` log line.
- `node_modules/@mastra/factory/dist/integrations/github/rules.js` -- `:66-85` `eventName()`, the full
  set of dispatched events (no `push`); `:697-727` what the sweep writes.
- `node_modules/@mastra/factory/dist/integrations/github/reconcile-worker.js` -- `:34` `intervalMs ??
  36e5` — one hour, not five minutes; `:5` `DEFAULT_GITHUB_RECONCILE_INTERVAL_MS = 60 * 6e4`, the same
  hour; `:7` lease key; `:35` the issue interval defaults to the PR interval.
- `node_modules/@mastra/factory/dist/integrations/github/reconciliation-config.js` -- `:3` unset →
  `true`, and only the literal strings `"true"`/`"false"` are recognized.
- `node_modules/@mastra/factory/dist/integrations/github/integration.js` -- `:44-50,244-245`
  `REQUIRED_FIELDS` includes `slug`; `:228` `requiresStableStateSigner = true`; `:393` the collaborator
  lookup that is Administration-read's only justification; `:938-945` the install URL built from the
  slug; `:1006-1014` both reconcile sweeps read the legacy keys as fallback. No `checks.*`, no
  `repos.createCommitStatus`, no `/actions/`, no `graphql(` anywhere in the dist.
- `node_modules/@mastra/factory/dist/integrations/github/routes.js` -- `:291` `/web/github/webhook`;
  `:308-309,320` `/auth/github/connect` and `/auth/github/callback` (which is also the default
  `redirectUri`, and the only return path — there is no separate setup route, which is why one URL goes
  in both console fields); `:344-353` the callback lists installations and re-redirects to install when
  none come back.
- `node_modules/@mastra/factory/dist/factory.js` -- `:369` the boot throw when a registered integration
  requires a stable signer and none is configured.
- `src/mastra/index.ts` -- **read-only**. `:217-234` the five-key group and `webhookSecret`;
  `:548-551` the real signer chain `GITHUB_APP_WEBHOOK_SECRET || WORKOS_COOKIE_PASSWORD ||
  SLACK_APP_SIGNING_SECRET`; `:616` it reaches the factory as `stateSecret`. `:233` reads
  `MASTRACODE_GITHUB_AUTHORIZED_BOTS`, which no schema declares — deferred, not fixed here.
- `.env.schema:330-363` / `.env.example:284-315` -- the GitHub block. `:362-363` and `:314` both say
  "Defaults to 300000 (5min)", which is false. Fix only that, and only there.
- `docs/Self-hosting research.md` -- `## 5.` at `:297`, already carrying Story 3.1's pointer sentence
  naming `apps/github/README.md` canonical. Its permission table, event list and 5-min claim are this
  story's corrections' source. Additive paragraph only.
- `ops/README.md:84-155` -- the `### N — <claim>` / fenced command / `Expected:` checkpoint style to
  copy, and the ingress section the GitHub proof depends on.

## Tasks & Acceptance

**Execution:**
- `apps/github/README.md` -- edit -- correct the four false claims, each against the package:
  (a) the permission table's Commit statuses and Checks rows say plainly that `@mastra/factory@0.15.0`
  exercises neither, that they are granted as headroom for CI signal the story asks for, and that
  dropping them costs a consent round-trip — keep both in the grant;
  (b) the webhook section splits the six dispatched events from the four that return `202 ignored`,
  names `push` as allowlisted-but-inert, and states that subscribing to the four is deliberate headroom;
  (c) `GITHUB_APP_WEBHOOK_SECRET` gets the real chain (`GITHUB_APP_WEBHOOK_SECRET` →
  `WORKOS_COOKIE_PASSWORD` → `SLACK_APP_SIGNING_SECRET`, resolved in `src/mastra/index.ts`) and the real
  consequence — a configured GitHub App with none of the three set does not boot, and the webhook
  endpoint 401s on every delivery without this key specifically;
  (d) the sweep is hourly, covers issues as well as pull requests, and
  `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` is what shortens it.
- `apps/github/README.md` -- edit -- append the procedure the file lacks: a `## Register the app`
  ordered sequence (preconditions — the public origin from `ops/README.md` is up and registration is
  closed; create at Settings → Developer settings → GitHub Apps → New; the URLs and settings already in
  this file; webhook secret generated and escrowed *before* saving; private key generated and escrowed
  at generation), a `## Install it on a repository` step reading the slug off the public page and
  entering through `/auth/github/connect`, the `.env` group as a dotenv block with the restart note, and
  `## Checkpoints` numbered with expected output: the five keys present in `.env`; the server boots
  (with the stable-signer failure named as the thing a boot refusal means); the `ping` delivery showing
  `202 {"ok":true,"ignored":true}` in Recent Deliveries — with `401` routed to the secret and a
  connection error routed to the tunnel; a real `pull_request` delivery producing a `[GitHub Webhook]`
  line in the server log; and the issue-to-merged-PR loop, cross-referencing root `README.md`'s
  "Run your first issue". State that the sweep backstops merge state hourly if the last two fail.
- `.env.schema` -- edit -- change the `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` comment's false default
  to the hour the package uses, and widen the `MASTRACODE_GITHUB_RECONCILE_ENABLED` comment from
  "Merged-PR" to both sweeps. Nothing else: no console prose, no new key, no decorator change.
- `.env.example` -- edit -- mirror both comment corrections at `:308-314`, decorators stripped.
- `docs/Self-hosting research.md` -- edit -- append one dated paragraph under §5 recording what the
  2026-09-23 re-cross-reference against `node_modules` changed (Commit statuses and Checks unexercised;
  four events inert; the sweep hourly; the signer chain three-deep and fatal at boot) and naming
  `apps/github/README.md` as where the corrected form lives. Add no heading, move no table row.

**Acceptance Criteria:**
- Given the story's first Given clause asserts a cross-reference against `@mastra/factory@0.15.0`, when
  `apps/github/README.md` is read, then no sentence in it contradicts the installed package, and the
  Commit statuses row no longer claims the `status` webhook is handled.
- Given the permission set the AC names must still be what gets registered, when the permission table is
  read, then all seven rows are still present and still instructed as grants, with Commit statuses and
  Checks marked as granted-but-unexercised rather than justified by a call that does not exist.
- Given the AC also enables `installation`, `status`, `label` and `repository`, when the webhook section
  is read, then all ten events are still instructed, the six the package dispatches are distinguished
  from the four that return `202 ignored`, and `push` is named as allowlisted but driving no rule.
- Given an unset state signer is fatal rather than merely unstable, when `GITHUB_APP_WEBHOOK_SECRET`'s
  section is read, then it states the three-source chain, names `src/mastra/index.ts` as where it
  resolves, and says a configured GitHub App with none of the three set fails to boot.
- Given the sweep is the fallback merge-state writer, when the reconcile section and `.env.schema` are
  read, then both say one hour, both name `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` as what shortens it,
  and neither says five minutes anywhere in the repo.
- Given the operator must be able to tell a reachability failure from a signature failure, when the
  checkpoints are read, then at least one carries the `202 {"ok":true,"ignored":true}` ping result with
  `401` and a connection error routed to different causes.
- Given `docs/` section numbers are stable citation anchors, when `git diff` for that file is inspected
  against the baseline, then no line beginning with `#` and no table row is added, removed or changed.
- Given `.env.schema` and the README must not restate each other, when both are read, then the schema
  gained no console prose and the README gained no validation, type or `@public` statement.
- Given the operator plane holds no first-party code, when the diff is inspected, then no `.ts`, `.js`,
  `.mjs` or `.cjs` file changed, `src/` is untouched, and `npm run check` is clean.
- Given registration, installation and the loop proof are console and host actions, when the run
  finishes, then the spec's status is `awaiting-operator` with a non-empty `operator_actions:` covering
  registration, both escrows, the `.env` population and restart, installation on a repository, the
  webhook-delivery proof and the issue-to-merged-PR proof.

## Spec Change Log

- 2026-09-23 — Two Verification entries were imprecise and were run in a corrected form; the claims
  they test are unchanged and all hold.
  - `grep -rn "checks\.\|createCommitStatus\|ListCommitStatuses\|/actions/" node_modules/@mastra/factory/dist/integrations/github/`
    expects no output but returns two matches: `webhook.d.ts:8` and `webhook.js.map:1`, both the
    string `checks.` ending a sentence in the same doc comment ("collaborator permission checks.").
    Restricted to the shipped JavaScript (`--include='*.js'`) it returns nothing, which is the
    evidence the Commit statuses and Checks rows actually rest on. `apps/github/README.md` states
    the exclusion rather than claiming a bare grep is empty.
  - `sed -n '34p' .../reconcile-worker.js` expects `intervalMs ?? 36e5`; that line is `35p` in the
    installed package (line 34 is `this.#sourceControl = config.sourceControl;`). The Code Map's
    `reconcile-worker.js:34` and `:35` are each one low; the README cites `:35` and `:36`. `:5`,
    `:7` and every other `file:line` in the Code Map was re-checked and is exact.
- 2026-09-23 — `reconciliation-config.js:3` in the Code Map points at the function signature; the
  `?? true` fallback is `:4` and the recognized-strings switch is `:9-15`. The README cites
  `:3-5,9-15`. The parser also trims and lower-cases before matching, so `TRUE` is recognized too —
  the README says "trimmed and lower-cased" rather than "only the literal strings".

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 33 findings — high 0, medium 9, low 21, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` `.env.schema`/`.env.example` still carried the two-of-three signer chain the README was correcting — confirmed at `.env.schema:347-351`: "requires either this value or `WORKOS_COOKIE_PASSWORD`", with the third source misattributed to Slack. Both comments now state the full chain and the boot failure.
  - `[low]` `[reject]` `docs/Self-hosting research.md:329` still says "5-min sweep" while an AC says "neither says five minutes anywhere in the repo" — real but the fix edits this build's spec, and §5 is a dated research record the Never list deliberately preserves; the correcting paragraph sits three lines below it.
  - `[medium]` `[patch]` Commit statuses was labelled unexercised headroom, but GitHub gates event subscriptions on permissions and step 7 subscribes to `status` — dropping the row makes the registration impossible, not merely narrower. Row and paragraph now say so; Checks stays the one genuinely optional grant.
  - `[medium]` `[patch]` `202 {"ok":true,"ignored":true}` was taught as unique to non-allowlisted events — confirmed false at `webhook.js:461-466`, which returns it for any allowlisted delivery whose dispatch ends ignored. The `[GitHub Webhook]` log line is now named as the discriminator.
  - `[medium]` `[patch]` The unauthorized-sender drop (`webhook.js:364-372`) was undocumented — confirmed: a correctly registered and installed app still fails the loop this way, logging `sender not authorized`. Added to checkpoint 4.
  - `[low]` `[patch]` Checkpoint 1's `grep -cE '…=.'` passed on whitespace-only and `""` values that `src/mastra/index.ts:217-223` trims to absent — confirmed. Replaced by a per-key loop reporting `lines=` and `set`/`EMPTY`.
  - `[false]` `[reject]` "`routes.js:340-341` is off by one" — checked: `:340` is `const code = c.req.query("code")` and `:341` the `if (!code)` redirect, exactly the cited claim. The verification-gap layer independently confirmed the same lines.
  - `[low]` `[patch]` `routes.js:344-353` and `integration.js:938-945` overshot into the opposite branch and the next method's doc comment — confirmed. Narrowed to `:343-345` and `:938-942`.
  - `[low]` `[reject]` Two Verification commands the Spec Change Log records as imprecise were not repaired — the fix edits this build's spec; both were run in their corrected form and the claims they test hold.
  - `[low]` `[reject]` `awk 'length>105'` implements no fence/table exclusion — the exclusion is the command's stated semantics and was honoured when run; the fix edits this build's spec.
  - `[false]` `[reject]` "Spec frontmatter says `in-review`, contradicting its own AC-10" — that is this step's normal mid-run state; finalization sets `awaiting-operator`.
  - `[medium]` `[patch]` No way to produce the one-line escaped PEM the file demands from the multi-line `.pem` GitHub downloads — confirmed gap. A tested `perl -0777` command now emits the finished line.
  - `[low]` `[patch]` Checkpoint 2's `npm run start` is foreground while 3–5 need that server running — confirmed. Preamble and checkpoint 2 now say to use a second shell.
  - `[low]` `[patch]` The `curl` probe puts the webhook secret in argv and shell history — confirmed by inspection. One clause added, matching how Story 3.2 handled the tunnel token.
  - `[low]` `[patch]` "They are the only writer" — number disagreement in both env files. Fixed.
  - `[low]` `[patch]` "(trimmed and lower-cased)" implied `TRUE` is accepted, which `.env.schema`'s own `@type=enum` rejects first — confirmed. Parenthetical dropped rather than restating validation in the README.
  - `[low]` `[patch]` (edge-case) Checkpoint 1 false pass on whitespace-only values — same defect as the checkpoint-1 row; fixed by the same edit.
  - `[low]` `[patch]` (edge-case) Checkpoint 1 counted lines, not distinct keys, so a duplicate plus a missing key read as five — same defect; the loop reports `lines=` per key.
  - `[low]` `[patch]` (edge-case) No reading for `.env` not existing yet — same defect; the missing-file reading was added.
  - `[low]` `[patch]` (edge-case) The probe builds a valid empty-key HMAC when `$GITHUB_APP_WEBHOOK_SECRET` is unset, turning the `401` into a false mismatch diagnosis — confirmed. Guarded with `${VAR:?}` and explained.
  - `[low]` `[patch]` (edge-case) `400` readings for missing `x-github-event`/`x-github-delivery` were absent, so a header fault routed to the secret or the tunnel — confirmed at `webhook.js:39-52`. Added.
  - `[medium]` `[patch]` (edge-case) `/auth/github/connect` answers `401 unauthorized` or `403 organization_required` with raw JSON and no reading in the procedure — confirmed at `routes.js:80-87`. Both added.
  - `[low]` `[patch]` (edge-case) The silent `/?github=error` redirect on a state/tenant mismatch had no reading — confirmed at `routes.js:330-339,353-356`. Added.
  - `[low]` `[reject]` (edge-case) Install → connect redirect loop when an installation is not yet visible — speculative about GitHub-side propagation, and the `/?github=error` and install readings added above give the operator the exit; not worth a branch on an unobserved race.
  - `[medium]` `[patch]` (edge-case) "Only on this account" silently blocks an org-owned repository — real, and it fails at the install screen rather than at registration. Step 8 now carries the condition.
  - `[low]` `[patch]` (edge-case) No `5xx` reading for a dispatch that throws — confirmed only `202` variants and "nothing at all" were covered. Added, distinguished from a Cloudflare `502`.
  - `[medium]` `[patch]` (edge-case, claim) The schema comment preserved the claim the change calls false — same defect as the first row; fixed by the same edit.
  - `[low]` `[reject]` (edge-case, claim) "neither says five minutes anywhere in the repo" is false at `docs/…:329` — same defect as the second row; rejected for the same reason.
  - `[medium]` `[patch]` (edge-case, claim) "Set false to disable both" and the interval sentence ignored the per-sweep overrides that take precedence — confirmed at `integration.js:1006-1014`. Both now state the documented keys are the fallback, without documenting the override keys as settable.
  - `[low]` `[reject]` (intent-alignment) The verification surface is repo text while the intent's expectations live at the console, `.env` and the running origin — true and unfixable from a worktree with no App, no `.env` and no tunnel, which is exactly why the epic parks those criteria with the operator.
  - `[low]` `[defer]` (intent-alignment) `epics.md:730` still asserts the five-minute sweep this story disproved, so the frozen plan and the operator docs disagree — deferred: rewriting a story's own acceptance premise mid-run would change the record the run is judged against.
  - `[low]` `[reject]` (intent-alignment) The spec's AC wording versus `docs/…:329` — same defect as the second row.
  - `[false]` `[reject]` (intent-alignment) "Work is staged but uncommitted and the spec is not yet at `awaiting-operator`" — an observation of mid-run state; finalization is what settles both.

## Design Notes

**The behaviours the checkpoints rest on.** All read out of the installed package; they are what makes a
checkpoint diagnostic rather than decorative, and the README must carry the reading for each.

| Situation | What the operator observes | Evidence |
|---|---|---|
| Webhook secret unset | `401 {"error":"unauthorized","message":"GitHub webhook secret is not configured"}`, before any header is read | `webhook.js:28-35` — reject, never skip |
| Secret mismatched | `401` | `webhook.js:19-27,61` HMAC-SHA256 + `timingSafeEqual` |
| `ping` on save | `202 {"ok":true,"ignored":true}` — signature passed, event not allowlisted | `webhook.js:432-439` |
| One of the four inert events | `202 {"ok":true,"ignored":true}`, nothing logged | `webhook.js:6-13` |
| A dispatched event | `[GitHub Webhook]` line in the server log, then rule dispatch | `webhook.js:443`, `rules.js:80-85` |
| `push` | allowlisted and logged, then dropped | no `eventName()` branch `rules.js:66-85`; `classifyGithubWebhook` needs a PR number `webhook.js:169` |
| No stable state signer | boot fails, naming integration `github` | `factory.js:369`, `integration.js:228` |
| Group filled from the top | `varlock` refuses to load, naming the first empty key | `.env.schema:339-345` `@required` chain |
| Group filled from the end | loads, GitHub silently inert | `src/mastra/index.ts:222-223` needs all five |

**Why the wrong permissions stay granted.** The AC names the seven, and GitHub charges a consent
round-trip for every widening — but nothing for a grant never used. Commit statuses and Checks are
headroom for exactly the CI-signal reading the story's own skip-list contemplates. Deleting them would
take the AC; asserting a call that does not exist is what has to stop. So the rows stay and the *Why*
column tells the truth.

**Why the four inert events stay subscribed.** Same shape, weaker cost: an ignored delivery is one 202.
`installation` in particular is the one a future version is most likely to start handling, and the
operator is in this console exactly once. What the file must not do is let the operator conclude from a
`202 ignored` that something is broken — which is precisely what an unannotated list would cause.

**Why `docs/` gets a paragraph and not a fix.** §5's table is a dated record of a 2026-09-21 reading of
Mastra's consent screen, and the numbers are cited as anchors (`AGENTS.md:26-27`). Story 3.2 set the
precedent for §8: date the old finding, append the correction, point at the owning file. The research
document should read as research that was superseded, not as a document that was silently right all
along.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: exits 0. Required: every claim below reads `node_modules`.
- `npm run check` -- expected: exits 0 with no TypeScript output.
- `grep -rn "five-minute\|5-min\|300000 (5min)" apps/ .env.schema .env.example README.md` -- expected: no
  output.
- `grep -n "SUPPORTED_GITHUB_WEBHOOK_EVENTS" -A 8 node_modules/@mastra/factory/dist/integrations/github/webhook.js`
  -- expected: exactly the six event names the README's first group lists.
- `grep -rn "checks\.\|createCommitStatus\|ListCommitStatuses\|/actions/" node_modules/@mastra/factory/dist/integrations/github/`
  -- expected: no output, which is the evidence behind the Checks and Commit statuses rows.
- `sed -n '34p' node_modules/@mastra/factory/dist/integrations/github/reconcile-worker.js` -- expected:
  `intervalMs ?? 36e5`.
- `git diff -- 'docs/Self-hosting research.md' | grep -E '^[-+](#|\|)'` -- expected: no output, run
  against the baseline commit after committing.
- `git diff --name-only` against this spec's `baseline_revision`, piped through
  `grep -E '\.(ts|js|mjs|cjs)$|^src/'` -- expected: no output.
- `find apps ops -type f ! -name '*.md'` -- expected: no output.
- `grep -rniE 'ghp_|github_pat_|BEGIN RSA PRIVATE KEY-----[A-Za-z0-9]' apps/ .env.schema .env.example` --
  expected: no output beyond the README's illustrative `MIIEow...` placeholder.
- `awk 'length>105' apps/github/README.md` (excluding fenced blocks and tables) -- expected: no output.
- `git status --porcelain` -- expected: no `.env`, created or left behind.

**Manual checks:**
- Read every URL in the Console URLs table against `routes.js:291,308-309,320` character by character:
  `/auth/github/callback` in both the Callback and Setup fields, `/web/github/webhook` with no `/api`
  prefix and no controller-id segment.
- Confirm each checkpoint is one the operator can actually run at the point it appears — the ping
  checkpoint before any installation exists, the `[GitHub Webhook]` log checkpoint only after one does.
- Confirm no corrected claim rests on the research document rather than on a `file:line` in
  `node_modules`.

## Auto Run Result

Status: awaiting-operator

**Summary.** Story 3.3 re-ran the cross-reference its first acceptance criterion asserts — the permission
set and webhook event list against the API calls actually present in `@mastra/factory@0.15.0` — and
corrected the four statements in `apps/github/README.md` it falsified: the `status` webhook is not
handled, four of the ten subscribed events return `202 ignored`, the reconcile sweep runs hourly rather
than every five minutes and covers issues too, and an unset state signer refuses the boot rather than
silently randomising. The same file gained the procedure it never had — registration, installation and
five numbered checkpoints ending at the issue-to-merged-PR loop. Every acceptance criterion that names a
console, a password manager, `.env` or a live delivery is the operator's, and all of it is enumerated in
`operator_actions:`. The permission grant and the ten-event subscription the criteria name are unchanged:
what changed is the evidence recorded beside them.

**Files changed.**
- `apps/github/README.md` — four corrections, each cited `file:line` into the installed package, plus
  `## Register the app` (preconditions, nine console steps, the dotenv block, the PEM conversion),
  `## Install it on a repository`, and `## Checkpoints` 1–5 with expected output and failure readings.
  No URL changed.
- `.env.schema` / `.env.example` — comment text only: the reconcile default corrected from
  `300000 (5min)` to `3600000 (1h)`, the enable comment widened to both sweeps, and the
  `GITHUB_APP_WEBHOOK_SECRET` comment corrected to the real three-source chain and the boot failure.
  No key, no decorator, no new key.
- `docs/Self-hosting research.md` — one dated 2026-09-23 paragraph appended under §5 recording what the
  re-cross-reference changed and naming `apps/github/README.md` as where the corrected form lives. No
  heading, heading number or table row moved.
- `_bmad-output/implementation-artifacts/spec-3-3-…md` — this spec.

**Review findings.** 33 findings across four layers — high 0, medium 9, low 21, false 3, maybe-false 0.
Twenty-two entries patched, one deferred, ten rejected. Patched by verdict: medium 9, low 13.

Patches applied, by theme:
1. **A claim the file taught that the package does not keep.** `202 {"ok":true,"ignored":true}` is not
   the signature of a non-allowlisted event — `webhook.js:461-466` returns it for any allowlisted
   delivery whose dispatch ends ignored, including one dropped because the sender is not authorized.
   The `[GitHub Webhook]` log line is now named as the discriminator, and the unauthorized-sender drop
   is documented as a way a correctly registered, correctly installed app still fails the loop.
2. **A permission wrongly demoted.** Commit statuses is not headroom: GitHub gates event subscriptions
   on permissions, so it is what makes the mandated `status` subscription possible. Dropping it would
   have made the registration impossible — the opposite of the "start narrow" advice beside it.
3. **A step stated without a way to meet it.** The file demanded a one-line `\n`-escaped PEM from a
   multi-line download and gave no conversion; there is now a tested command.
4. **Checkpoints that could pass while the thing they check was broken.** Checkpoint 1's `grep -c`
   accepted whitespace-only and `""` values that the entry trims to absent, and counted lines rather
   than distinct keys; it is now a per-key loop reporting `lines=` and `set`/`EMPTY`, with a reading
   for a missing `.env`. The offline probe built a valid empty-key HMAC when the variable was unset,
   turning its `401` into a false mismatch diagnosis; it is now guarded.
5. **Failures with no reading.** `400` on a missing webhook header, `5xx` on a dispatch that throws,
   `401`/`403 organization_required` on `/auth/github/connect`, the silent `/?github=error` redirect,
   an org-owned repository against "Only on this account", and the foreground `npm run start` that
   checkpoints 3–5 all depend on.
6. **Two documents that would have disagreed.** `.env.schema` and `.env.example` still carried the
   two-of-three signer chain the README was correcting; both now state the full chain and the boot
   failure. Plus the reconcile keys named as the fallback pair the per-sweep overrides displace.
7. **Citation hygiene.** Two ranges narrowed to the lines that carry their claim.

Deferred (2): the five `MASTRACODE_GITHUB_*` keys the deployment reads but no schema declares — Story
5.2's criterion verbatim; and `epics.md:730`, which still asserts the five-minute sweep this story
disproved, left alone because rewriting a story's own acceptance premise mid-run would change the record
the run is judged against.

Rejected (10): three observations of mid-run state or of nearby-but-different code (the `routes.js`
off-by-one that checked out exact, the spec's `in-review` status, the staged-not-committed tree); four
whose fix was to edit this build's spec (the two Verification commands the change log already records,
the `awk` exclusion, and the AC's "anywhere in the repo" wording against the deliberately preserved
§5 research record, raised twice); the demand that `docs/…:329` be rewritten rather than superseded;
a speculative GitHub-side install-propagation race; and "the verification surface is repo text while
the intent lives at the host surface" — true, unfixable from a worktree with no App and no `.env`, and
precisely why the epic parks those criteria with the operator.

**Verification performed.**
- `npm ci --no-audit --no-fund` — exit 0; every claim below reads the installed package.
- `npm run check` — exit 0, no TypeScript output.
- `grep -rn "five-minute\|5-min\|300000 (5min)" apps/ .env.schema .env.example README.md` — no output.
- `SUPPORTED_GITHUB_WEBHOOK_EVENTS` read at `webhook.js:6-13` — exactly the six events the README's
  first group lists, and `status`, `label`, `repository` and `installation` are absent from it.
- `grep -rn --include='*.js' "checks\.\|createCommitStatus\|ListCommitStatuses\|/actions/"` over the
  GitHub dist — no output. Without `--include` it returns two doc-comment/source-map hits, which is
  why the README states the exclusion rather than claiming a bare grep is clean.
- `reconcile-worker.js:35` reads `config.intervalMs ?? 36e5`, and `:5` exports
  `DEFAULT_GITHUB_RECONCILE_INTERVAL_MS = 60 * 6e4` — the same hour. Both were read directly.
- `factory.js:369` throws on a registered integration requiring a stable signer, and
  `integration.js:228` sets `requiresStableStateSigner = true` — the boot-refusal claim, read directly.
- `webhook.js:28-35` (unset secret → 401 before any header is read), `:61-65` (signature mismatch →
  `Invalid GitHub webhook signature`), `:432-441` (signature first, then allowlist → `202 ignored`),
  `:461-466` (dispatch-ignored returns the same body) — all read directly.
- `routes.js:315-317` (connect, `manage=1`), `:340-341` (no `code` → restart the identify leg),
  `:343-345` (exchange, list, redirect to install), `:80-87` (`401`/`403 organization_required`) — all
  read directly; the two over-wide citations were narrowed to match.
- `git diff 52f07b3 -- 'docs/Self-hosting research.md' | grep -E '^[-+](#|\|)'` — no output: no heading
  and no table row added, removed or changed, pinned to the baseline.
- `git diff --name-only 52f07b3 | grep -E '\.(ts|js|mjs|cjs)$|^src/'` — no output.
- `find apps ops -type f ! -name '*.md'` — no output.
- `grep -rniE 'ghp_|github_pat_|BEGIN RSA PRIVATE KEY-----[A-Za-z0-9]' apps/ .env.schema .env.example`
  — no output; `git status --porcelain` shows no `.env` created or left behind.
- Added lines in `apps/github/README.md` over 105 columns, excluding fenced blocks and tables — none.
- No per-sweep override key and no `MASTRACODE_GITHUB_AUTHORIZED_BOTS` appears in `apps/github/README.md`,
  `.env.schema` or `.env.example` — the deferred keys stayed deferred.
- Manual: every URL in the Console URLs table read against `routes.js:291` and `:320` character by
  character and unchanged by this story; each checkpoint confirmed runnable at the point it appears
  (1–3 before any installation exists, 4–5 only after).

**Follow-up review recommendation: true.** Nine `medium` entries were patched on a first pass, and the
named unverified risk is this: three of the new claims describe GitHub's console rather than the installed
package, and no App exists in a story worktree to check them against — that GitHub gates the `status`
event subscription on the Commit statuses permission (the reason that row was re-graded from headroom to
required), that "Only on this account" is what blocks an organization-owned repository at the install
screen, and the exact body a dispatch failure returns. A later pass, or the operator's own registration,
is what settles those.

**Residual risks.** Every acceptance criterion naming host or console state — the registration itself,
both escrows, `.env`, the restart, the installation, the webhook delivery and the issue-to-merged-PR loop
— is owed by the operator and enumerated in `operator_actions:`. None of it is startable until Story 3.2's
own operator actions land: `https://factory.kovalchuk.win` resolves to nothing until the tunnel is up, and
GitHub cannot deliver to a host it cannot reach. The repo now documents an App that does not yet exist,
which is intended and stated, but it means `apps/github/README.md` and `ops/README.md` have to be read in
that order.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — the public origin is serving and registration is closed. Nothing below works until `ops/README.md` ingress checkpoint 4 passes (`https://factory.kovalchuk.win/signin` answers `200` through the tunnel) and `README.md` step 3's probe answers `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED`. GitHub cannot deliver to a host it cannot reach, and every URL registered below is on that origin.
- Register the App. Settings → Developer settings → GitHub Apps → **New GitHub App**, following `apps/github/README.md` → "Register the app" step by step. Callback URL *and* Setup URL both get `https://factory.kovalchuk.win/auth/github/callback`; Webhook URL gets `https://factory.kovalchuk.win/web/github/webhook`, with **Active** ticked. Grant the seven permissions in the Permissions table and subscribe to the ten events in the Webhook events section — including the four that the package currently ignores, which is deliberate.
- Escrow 1 — the webhook secret, before saving the app. Generate it with `openssl rand -hex 32`, paste it into the Webhook → Secret field, and put the same string in your password manager in the same action. The field is write-only afterwards; a lost value cannot be read back out of GitHub and every delivery fails its signature check until the two agree again.
- Escrow 2 — the private key and the client secret, at generation. On the app's General page: Client secrets → *Generate a new client secret* (shown once), and Private keys → *Generate a private key* (downloads a `.pem`; GitHub keeps only the fingerprint and will not issue the same key twice). Escrow both immediately. Losing the private key and the webhook secret together means re-registering the app, which means a new App ID, a new slug and a fresh install approval.
- Populate `.env` and restart. Write the six lines from `apps/github/README.md` → "Register the app" into `.env` at the repository root — `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM on one line with `\n` escapes), `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`, `GITHUB_APP_WEBHOOK_SECRET`. The first five are all-or-nothing. Then restart with `npm run build && npm run start`; `.env` is read once at startup. Checkpoints 1 and 2 are the proof — and a boot that ends in `integration 'github' signs OAuth state and requires a replica-stable state secret` means `GITHUB_APP_WEBHOOK_SECRET` is empty, not that the App is wrong. Never commit `.env`.
- Install it on a repository. Open `https://factory.kovalchuk.win/auth/github/connect` while signed in and follow the redirect through GitHub's OAuth screen to the install page; choose **Only select repositories** and pick the repository to work in. The app reaches nothing until this is done. `?manage=1` on the same URL is how to change the selection later.
- Prove webhook delivery. Checkpoint 3 in `apps/github/README.md`: at Settings → Developer settings → GitHub Apps → your app → **Advanced** → Recent Deliveries, press **Redeliver** on the `ping` and record the result. `202 {"ok":true,"ignored":true}` is the pass — signature verified, event not allowlisted. A `401` is the secret (the two strings differ, or the server has none); a connection error or a Cloudflare `502`/`530` is the tunnel, and goes to `ops/README.md` ingress checkpoints 3 and 4 instead. Then checkpoint 4: open a pull request in the installed repository and confirm a `[GitHub Webhook]` line appears in the server log.
- Prove the loop. Checkpoint 5: enable **Sync GitHub issues** for the installed repository under Settings → Work Intake → GitHub issues, open a small issue, find it in **Work → Intake**, and take it through to a merged pull request, following root `README.md` → "Run your first issue". Record whether the card reaches its terminal state on the merge webhook or only after the hourly reconcile sweep — that difference is what tells you whether webhook delivery is actually healthy.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
