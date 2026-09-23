---
title: 'Story 3.5: [operator] A Slack app created from a manifest this repo owns'
type: 'feature'
created: '2026-09-23'
status: done
baseline_revision: 'eca1081c89c2aba883346a58e4019a715929aaab'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/apps/slack/README.md'
  - '{project-root}/AGENTS.md'
warnings: ['oversized']
deferred: []
operator_actions:
  - >-
    Precondition — the public origin is serving and registration is closed. Nothing below works until
    `ops/README.md` ingress checkpoint 4 passes (`https://factory.kovalchuk.win/signin` answers `200`
    through the tunnel) and `README.md` step 3's probe answers `400` carrying
    `EMAIL_PASSWORD_SIGN_UP_DISABLED`. Slack accepts HTTPS only and refuses to save an Events Request
    URL it cannot reach, so this is a hard gate rather than a nicety — Story 3.2 is what delivers it.
  - >-
    Create the app from the manifest. `api.slack.com/apps` → **Create New App** → **From a manifest**
    → pick the workspace → switch to the **YAML** tab (the default is JSON and rejects YAML) → paste
    the entire contents of `apps/slack/manifest.yaml` → **Create**. Follow `apps/slack/README.md` →
    "Creating the app" step by step, and read its "Read this before step 1" warning first: the
    signing secret comes from the app, so the Events Request URL in the manifest cannot answer
    Slack's challenge at creation time and Slack may refuse the app on that ground. Dropping
    `settings.event_subscriptions.request_url` and restoring it after the restart costs nothing.
    If Slack names any other key in a validation error, drop that one key and create the app anyway;
    do not fall back to filling console pages in by hand. `features.assistant_view` is survivable —
    a logged warning and nothing else. **The user half of the scope list (`openid`, `profile`) is
    not**: dropping it removes account linking entirely rather than halving it, and an unlinked
    sender is blocked before the agent sees the message. Record what you dropped.
  - >-
    Install it to the workspace and copy the bot token. Settings → *Install App* → *Install to
    Workspace*, approve the manifest's scope list — seventeen bot scopes, less anything you recorded
    dropping — then copy the **Bot User OAuth Token** (`xoxb-…`)
    from OAuth & Permissions. It does not exist before the install. Not the user token (`xoxp-`) and
    not an app-level token (`xapp-`). Any later scope change means re-installing and copying a new
    token.
  - >-
    Copy the three credentials. Basic Information → App Credentials gives **Signing Secret**,
    **Client ID** and **Client Secret** (the last behind a *Show* control, re-displayable later, so
    none of the three needs the one-shot escrow the GitHub story needed). The signing secret is the
    master switch: unset, no Slack integration is constructed at all and the webhook path `404`s.
  - >-
    Populate `.env` and restart. Write the five lines from `apps/slack/README.md` → "Creating the
    app" into `.env` at the repository root — `SLACK_APP_SIGNING_SECRET`, `SLACK_APP_BOT_TOKEN`,
    `SLACK_APP_CLIENT_ID`, `SLACK_APP_CLIENT_SECRET` and `MASTRACODE_CHANNELS_PUBLIC_URL`
    (`https://factory.kovalchuk.win`, origin only). Set the last one explicitly rather than leaving
    it to the fallback: after Story 3.2 `MASTRACODE_PUBLIC_URL` already holds the same public origin,
    so an unset channels key would be correct by coincidence — the state `ops/README.md` warns
    against. Do not write the key with an empty value either: unset falls back, but present-and-empty
    is `""`, which disables the OIDC routes outright. Restart with
    `npm run build && npm run start`; `.env` is read once at startup. Never commit `.env`.
  - >-
    Invite the bot to a channel. `/invite @Mastra Factory` in the channel you intend to use.
    `chat:write.public` lets it post into a channel it is not in, but it receives no
    `message.channels` event for such a channel — so an un-invited channel is silent in the direction
    that matters, and that silence looks exactly like a wrong Request URL.
  - >-
    Run the checkpoints in `apps/slack/README.md` in their numbered order, 1 to 5 — the order is
    load-bearing, not presentational. Checkpoint 2 comes before checkpoint 3 because an unsigned
    `POST` answering `401 Invalid signature` proves the route exists, while a `404` there is the same
    thing the console reports as "Your URL didn't respond" with no hint which cause it is. Checkpoint
    3 is the first time the Events Request URL can verify at all — a freshly created app is never
    already Verified, because the secret it needed did not exist yet. Paste the same URL into
    Interactivity & Shortcuts; that field saves without probing, so it is the more likely of the two
    to be silently wrong.
  - >-
    Prove one OIDC link, then one delivery — in that order. Checkpoint 4 first: open
    `https://factory.kovalchuk.win/connect/slack/oidc/start` while signed in, confirm the redirect to
    `slack.com/openid/connect/authorize` carries `scope=openid+profile` and a `redirect_uri` matching
    the registered callback, and complete the link. It must come first because an unlinked sender is
    blocked before the agent ever sees the message — the mention gets an ephemeral "Connect your
    account" card and nothing else, which reads exactly like a missing bot token. Then checkpoint 5:
    mention the bot in the invited channel, ask for something that produces a file, and confirm the
    reply and the attachment — the attachment is what proves `files:write`, the one scope the
    vendor's default list omits. Do not expect a typing status on a channel mention; that call
    targets an assistant thread, so its home is checkpoint 5b's DM.
  - >-
    Record the result against the repository, not only in the console. If any manifest key was
    dropped at creation, or any scope had to be added afterwards, edit `apps/slack/manifest.yaml`
    and re-paste it on the app's **App Manifest** page so the file and the live app stay the same
    thing. That round trip is the whole point of the file existing.
---

<intent-contract>

## Intent

**Problem:** `@mastra/factory@0.15.0` ships no Slack app manifest — verified: no `*.yaml`/`*.yml`/
`*manifest*` file and no scope literal anywhere in its `dist`. So the one genuine first-party
artifact among the three provider apps does not exist, and `apps/slack/README.md` says so out loud
("That file is not in this repository yet"), leaving the bot token scopes recorded nowhere at all.
Without that list the operator cannot save the five bot events or post a single message.

**Approach:** Author `apps/slack/manifest.yaml` as one real file at its seeded path, with the shape
the vendor's own `buildManifest()` emits (`@mastra/slack@1.6.3` `dist/index.js:276-320`) but
corrected against the Web API calls this deployment actually makes and against this deployment's
URLs. Then close the README's deferral — give it the scope list, the create-from-manifest procedure
and checkpoints — and repoint the `docs/` narrative at the file by path. Everything after that is
console work, so the story parks at `awaiting-operator`.

## Boundaries & Constraints

**Always:** The manifest is exactly one real file at `apps/slack/manifest.yaml` (AD-5). Both request
URLs and the redirect URL are character-for-character the rows already in `apps/slack/README.md` and
docs §4.1 — `https://factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook`
and `https://factory.kovalchuk.win/connect/slack/oidc/callback`. Bot events are exactly the five
already recorded. Every scope in the manifest is justified by a call site or by an event
subscription Slack gates on it, and the README says which. `docs/` references the manifest by
repo-relative path only, and its section numbers are never renumbered (AGENTS.md).

**Never:** No fenced manifest body in `docs/` or in any README — the file is the record (AD-5 /
FR30). No new root directory, and no first-party code under `apps/` (AD-3, AGENTS.md). No secrets in
the repo; the manifest carries URLs, scopes and settings only. No `.env.schema` change — all five
keys (`SLACK_APP_SIGNING_SECRET`, `SLACK_APP_BOT_TOKEN`, `SLACK_APP_CLIENT_ID`,
`SLACK_APP_CLIENT_SECRET`, `MASTRACODE_CHANNELS_PUBLIC_URL`) are already declared at
`.env.schema:56-83`. No slash commands and no shortcuts: the package registers no command names and
handles no `shortcut`/`message_action` payload. No `socket_mode_enabled`, no `token_rotation_enabled`,
no `org_deploy_enabled`. Do not perform, simulate or claim any console action — this story parks.

## Runtime behaviours the README's checkpoints must capture

This story ships no executable code, so these are operator-observable behaviours to be written into
`apps/slack/README.md` as numbered checkpoints — not unit-test scenarios.

| Scenario | Input / State | Expected observation | When it goes wrong |
|----------|--------------|---------------------|--------------------|
| Manifest creates the app | `apps/slack/manifest.yaml` pasted into *Create app → From a manifest* | App exists with the five bot events, interactivity enabled on the same URL, messages tab on, redirect URL registered, bot + user scopes requested | Slack names the offending key in its validation error; drop that one key, never abandon the manifest |
| Webhook reachable at all | unsigned `POST` to the webhook path | `401 Invalid signature` — proves the route exists and Slack was constructed | `404` means `SLACK_APP_SIGNING_SECRET` is unset, so no integration was built and no route registered |
| Events Request URL saved | Slack POSTs `{"type":"url_verification","challenge":…}` | Console accepts the URL; the challenge is echoed | A wrong signing secret fails signature verification first, so the console reports the URL as unverifiable |
| Account linking starts | signed-in `GET /connect/slack/oidc/start` | Redirect to `slack.com/openid/connect/authorize` carrying `scope=openid profile` | Redirect to `/?slack=error` when client id, client secret or the channels public URL is missing |
| Agent posts a file | agent replies with an attachment | `files.uploadV2` succeeds | Without `files:write` Slack answers `missing_scope` — the scope the vendor default list omits |

</intent-contract>

## Code Map

- `apps/slack/manifest.yaml` -- **the deliverable, does not exist yet.** Seeded path named at
  `apps/slack/README.md:59`.
- `apps/slack/README.md` -- Story 3.1 wrote the URL table (`:19-31`), the app-settings table
  (`:41-46`) and the five env sections (`:67-129`). `## Creating the app` (`:56-65`) is the
  deferral this story closes; it currently states the file "is not in this repository yet" and that
  the scope list is unsettled. Add a scopes section and a checkpoints section; mirror the
  Register/Checkpoints shape of `apps/github/README.md` and `apps/linear/README.md`.
- `docs/Self-hosting research.md` -- §4.1 URL registry (`:266-292`) already carries both Slack rows;
  **do not touch**. §6's `**Slack.** Own app from the Factory manifest.` (`:380`) is the line to
  correct — the manifest is this repo's, not the package's — and the only place to add the path
  reference. Section numbers are stable citation anchors (AGENTS.md).
- `.env.schema:56-83` -- all five Slack-side keys already declared with `@sensitive` marking. Read
  only; no change.
- `src/mastra/index.ts:558-569` -- the single read site for the Slack keys. `SLACK_APP_SIGNING_SECRET`
  is the master switch (`:558-560`); `oidcRedirectBaseUrl` is `MASTRACODE_CHANNELS_PUBLIC_URL ??
  MASTRACODE_PUBLIC_URL` (`:567`). Read only.
- `node_modules/@mastra/slack/dist/index.js:246-320` -- `DEFAULT_BOT_SCOPES` (16 entries),
  `DEFAULT_BOT_EVENTS` (the five) and `buildManifest()`. **This is the shape to mirror.** It is
  never called on this deployment's path (`grep buildManifest` in `@mastra/factory/dist` → nothing)
  and its URLs are a different product's, so copy the structure, not the values. Two gaps to close:
  it omits `files:write` despite `files.uploadV2` being called, and it emits no
  `oauth_config.scopes.user`, so OIDC account linking has no scopes.
- `node_modules/@chat-adapter/slack/dist/index.js` -- the real Web API call sites behind every
  scope: `chat.postMessage` `:4188`, `chat.update` `:4524`, `chat.postEphemeral` `:4255`,
  `conversations.replies` `:3210`, `conversations.history` `:3769`, `conversations.info` `:2011`,
  `conversations.open` `:5266`, `users.info` `:1962`, `reactions.add/remove` `:4745`/`:4767`,
  `files.uploadV2` `:4479`, private-file download `:3957`, `assistant.threads.setStatus` `:4824`.
  Signature verification and the `401 Invalid signature` at `:2079-2085`; `url_verification` answered
  at `:2127`; interactive payload types at `:2313-2328` (`block_actions`, `block_suggestion`,
  `view_submission`, `view_closed` — no shortcuts).
- `node_modules/@mastra/factory/dist/integrations/slack/connect-route.js:3-5,65` -- OIDC authorize
  URL, callback path `/connect/slack/oidc/callback`, and `scope: "openid profile"` (no `email`).
- `node_modules/@mastra/factory/dist/integrations/slack/integration.js:5-12,64` -- Factory wires
  `typingStatus`, which is what reaches `assistant.threads.setStatus` and so what `assistant:write`
  is for. `:70-81` gates the OIDC routes on client id + secret + redirect base.
- `_bmad-output/implementation-artifacts/spec-3-3-*.md`, `spec-3-4-*.md` -- the two preceding
  operator stories; match their `operator_actions:` depth and their README checkpoint numbering.

## Tasks & Acceptance

**Execution:**
- `apps/slack/manifest.yaml` -- create it. `display_information` (name + ≤139-char description);
  `features.app_home` with `messages_tab_enabled: true`, `home_tab_enabled: false`,
  `messages_tab_read_only_enabled: false`; `features.bot_user` with `always_online: true`;
  `features.assistant_view`; `oauth_config.redirect_urls` holding the one OIDC callback URL;
  `oauth_config.scopes.bot` = the 16 vendor defaults **plus `files:write`**;
  `oauth_config.scopes.user` = `openid`, `profile`; `settings.event_subscriptions` with the webhook
  URL and the five bot events; `settings.interactivity` enabled on the same URL;
  `org_deploy_enabled`, `socket_mode_enabled`, `token_rotation_enabled` all `false`. Carry short
  YAML comments explaining only what is not derivable — the `mastra-code` segment, the two
  deliberate departures from the vendor defaults, and why interactivity is on with no shortcuts.
  -- Rationale: FR19/FR30, AD-5: the app's whole registration becomes one diffable file.
- `apps/slack/README.md` -- replace `## Creating the app` with a procedure that creates the app from
  `apps/slack/manifest.yaml` (the deferral is now false and must not survive), add a
  `## Bot token scopes` section mapping every scope to the call or event that needs it and naming
  the two departures from the vendor list, and add a `## Checkpoints` section numbered like the
  GitHub and Linear READMEs, carrying one checkpoint for every row of the runtime-behaviours table
  in the intent contract. Do not restate `.env.schema`'s validation/`@public` half (NFR7), and do
  not reproduce the manifest body. -- Rationale: AD-6 makes this file normative for console settings
  and env values; the scope list has had no home until now.
- `docs/Self-hosting research.md` -- in §6 only, correct "Own app from the Factory manifest" to name
  `apps/slack/manifest.yaml` as this repo's file and reference it by repo-relative path. Leave §4.1
  and every section number untouched. -- Rationale: AD-5/NFR9 — prose links out, files are canonical.
- `_bmad-output/implementation-artifacts/spec-3-5-*.md` -- finalize frontmatter to
  `status: awaiting-operator` with a non-empty `operator_actions:` list covering: confirm 3.2's
  origin is live first; create the app from the manifest; install it to the workspace and copy the
  `xoxb-` token; copy signing secret, client id and client secret; populate `.env` and restart;
  invite the bot to a channel; run the checkpoints; prove one delivery and one OIDC link.
  -- Rationale: every remaining step is console work no agent can perform.

**Acceptance Criteria:**
- Given `@mastra/factory` ships no Slack manifest, when this story lands, then
  `apps/slack/manifest.yaml` exists as a real parseable YAML file at that exact path, and no fenced
  reproduction of its body appears anywhere under `docs/` or in any `README.md`.
- Given the URL registry was read out of the packages rather than guessed, when the manifest's URLs
  are compared with `apps/slack/README.md:21-22` and docs §4.1, then all three strings match
  character for character, including the `mastra-code` controller-id segment.
- Given `apps/slack/README.md:59-65` currently defers the manifest and its scope list, when the
  story lands, then no sentence claiming the file is absent remains, and every bot scope in the
  manifest appears in the README with the call site or event that requires it.
- Given operator-plane directories hold no first-party code (AD-3), when the repository is checked
  after the change, then `apps/` contains only `README.md` and `manifest.yaml` files, no new root
  directory exists, and `npm run check` is clean.
- Given `.env.schema` is the only list of keys and already declares all five (`:56-83`), when the
  story lands, then `.env.schema` and `.env.example` are unchanged by it.
- Given every remaining step is console work, when the agent has finished, then the spec's
  frontmatter reads `status: awaiting-operator` with a non-empty `operator_actions:` list, and no
  console action is reported as performed.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 30 findings — high 5, medium 15, low 6, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: `epic-3-context.md` is a fifth changed file the spec's own verification forbids, and the rewrite narrows "before any story here begins" to "before the tunnel goes up" — reverted the file to `eca1081`; it was this workflow's step-01 regeneration, not story work, and reverting restores the wider constraint and makes `git diff --name-only` match the spec.
  - `[medium]` `[patch]` blind-hunter: `features.assistant_view` declared with none of the events that surface delivers subscribed — bot events must stay at the registry's five, so both manifest and README now state the non-subscription is deliberate and that the surface exists only for the status call.
  - `[medium]` `[patch]` blind-hunter: `operator_actions` said a blank `MASTRACODE_CHANNELS_PUBLIC_URL` falls back to a loopback `MASTRACODE_PUBLIC_URL` — `src/mastra/index.ts:567` uses `??`, so blank is `""` and disables OIDC while unset falls back, and after Story 3.2 that fallback is the public origin; rewrote the entry.
  - `[medium]` `[patch]` blind-hunter: checkpoint 5 expected a typing status from a channel mention — `assistant.threads.setStatus` targets an assistant thread, so the expectation moved to the new DM step and the diagnostic no longer blames a missing scope.
  - `[medium]` `[patch]` blind-hunter: no checkpoint exercised the DM path although the messages tab, `im:*` and `message.im` exist for it — checkpoint 5 split into 5a (channel) and 5b (DM).
  - `[low]` `[reject]` blind-hunter: no `.env`/boot/diagnostics checkpoint like the GitHub and Linear READMEs — checkpoint 2's `401`-vs-`404` already proves the values reached `.env` and the integration was constructed, and the signing secret's state-signer blast radius is already in its own section; a new section is more than a direct correction.
  - `[low]` `[patch]` blind-hunter: checkpoint 1 and `operator_actions` asserted a hard "seventeen bot scopes" while also blessing key drops — both now read as the manifest's list minus anything recorded dropped.
  - `[low]` `[patch]` blind-hunter: scope table omitted `chat.postEphemeral` and `home_tab_enabled: false` carried no comment — added the call site to the `chat:write` row and a one-line manifest comment.
  - `[low]` `[patch]` blind-hunter: citation drift — `integration.js` `typingStatus` is at `:61` not `:64`, and the OIDC gate block is `:69-82` (ternary `:75`) not `:70-81`; verified against the file and corrected everywhere.
  - `[medium]` `[patch]` blind-hunter: the README's "App settings" table described a smaller app than the manifest registers, yet checkpoint 1 asks the operator to confirm interactivity and the assistant view against it — added both rows.
  - `[false]` `[reject]` blind-hunter: spec frontmatter reads `in-review` and contradicts its own acceptance criterion — the reviewers saw the mid-run snapshot; `in-review` is what step-04 sets before reviewing, and finalization writes `awaiting-operator`. `warnings: ['oversized']` is the workflow's own machine-readable flag, as on every sibling epic-3 spec.
  - `[high]` `[patch]` edge-case: the manifest's Events Request URL cannot answer Slack at creation time, because `SLACK_APP_SIGNING_SECRET` comes from the app and the route 404s until it is in `.env` — added a pre-step-1 warning and an in-line two-pass recovery (drop `settings.event_subscriptions.request_url`, create, populate `.env`, restart, restore via the App Manifest page).
  - `[high]` `[patch]` edge-case: checkpoint 3 claimed creation "usually verifies this on the spot" — impossible for the same reason; replaced with the statement that a fresh app can never already be Verified.
  - `[high]` `[patch]` edge-case: an unlinked sender is blocked before the agent sees the message, getting an ephemeral Connect card (`slack.js:60-79`, reached via `gateDispatch` `:318-330` from `:404`), which the old text diagnosed as a stale bot token — added the branch and made checkpoint 4 a stated prerequisite of checkpoint 5.
  - `[medium]` `[patch]` edge-case: a linked account with zero or several factories is blocked by a "Pick a default factory" card (`slack.js:104-140`) with no listed cause matching — added the branch.
  - `[false]` `[reject]` edge-case: `uiOrigin` is `MASTRACODE_PUBLIC_URL`, so checkpoint 4's redirects would land on loopback — this story's stated precondition is Story 3.2, after which `MASTRACODE_PUBLIC_URL` is the public origin (`ops/README.md:302`); the loopback case cannot arise here.
  - `[low]` `[patch]` edge-case: `SLACK_APP_CLIENT_ID` was a literal sample value among four placeholders — made it a placeholder in the same style.
  - `[high]` `[patch]` edge-case: the claim that dropping the user scopes leaves the Slack-side Connect card working is false — `saveAccountLink` has one writer, the OIDC callback, and the card deep-links back into the same flow; corrected in all four places to say linking is removed, not halved.
  - `[medium]` `[patch]` edge-case: `git diff --name-only` did not yield the four paths the spec names — same root cause as the first row; resolved by the revert.
  - `[medium]` `[patch]` edge-case: blank-vs-unset `MASTRACODE_CHANNELS_PUBLIC_URL` claim — same root cause as the third row; resolved with it.
  - `[medium]` `[patch]` edge-case: `operator_actions` said "in order" then ordered the checkpoints 2, 3, 5, 4 — reordered to the README's 1-5, with checkpoint 4 before 5 for the gate reason above.
  - `[medium]` `[patch]` edge-case: `epic-3-context.md` deleted the epic-wide registration precondition — same root cause as the first row; resolved by the revert.
  - `[medium]` `[patch]` verification-gap: checkpoint 4's "only condition that leaves the routes disabled" was wrong about the channels URL — rewritten to distinguish missing client credentials, a present-and-empty channels URL, and both URL keys unset.
  - `[medium]` `[patch]` verification-gap: the `.env` operator action's stated reason contradicted `ops/README.md:310-312` ("correct by coincidence") — same root cause as the third row; the rewrite adopts that document's reasoning.
  - `[medium]` `[patch]` verification-gap: `epic-3-context.md` edited outside the declared file set with a weakened constraint — same root cause as the first row; resolved by the revert.
  - `[false]` `[reject]` intent-alignment: terminal protocol not reached (`status: in-review`, work uncommitted) — mid-run snapshot; finalization writes `awaiting-operator` and commits.
  - `[medium]` `[patch]` intent-alignment: a file outside the story's contract, which the diff's own check forbids — same root cause as the first row; resolved by the revert.
  - `[high]` `[patch]` intent-alignment: FR20 requires OpenID Connect on, yet the diff blessed dropping the scopes that carry it — same root cause as the user-scope row; the text now forbids proceeding without them.
  - `[false]` `[reject]` intent-alignment: `MASTRACODE_CHANNELS_PUBLIC_URL` is agent work assigned to the operator — `.env` is gitignored and lives in the main checkout, not this worktree; no agent action can place it, and the key travels with four console secrets in one edit.
  - `[low]` `[reject]` intent-alignment: the manifest's authority rests on `node_modules`, absent from the committed tree, so its citations are unverifiable from the repo — true of the GitHub and Linear READMEs equally and inherent to not vendoring dependencies; the README already pins `@chat-adapter/slack@4.41.0` / `@mastra/slack@1.6.3` and says to re-read after a bump. Every citation was verified against the installed packages during this run.

## Design Notes

The manifest's authority is the vendor's own builder for this exact adapter, not a guess — mirroring
`buildManifest()` keeps the key names, nesting and boolean defaults known-good. Only two values
depart from it, and both are evidenced: `files:write` (it calls `files.uploadV2` at
`@chat-adapter/slack:4479` yet omits the scope) and `oauth_config.scopes.user: [openid, profile]`
(its builder targets a different product whose linking flow is not OIDC; ours requests exactly
`openid profile` at `connect-route.js:65`). Slack forbids mixing `openid` with other user scopes, so
that list stays at two.

`assistant:write` is carried because Factory always installs a typing-status function
(`integration.js:5-12,64`) that reaches `assistant.threads.setStatus`; Slack gates that API on the
assistant surface, which is why `features.assistant_view` is present even though the epic's settings
table does not name it. Its failure mode is a logged warning, not a broken loop — so if Slack refuses
either that feature or the user scopes, the README tells the operator to drop just that key rather
than abandon the manifest.

Interactivity must be **enabled** on the same URL — core's tool-approval buttons post
`block_actions` there — but no `slash_commands` and no shortcuts are declared, because the package
registers no command names and its payload switch has no `shortcut` branch.

## Verification

**Commands:**
- `npm run check` -- expected: exits 0, no TypeScript output (nothing under `src/` changed).
- `node -e "const y=require('yaml');y.parse(require('fs').readFileSync('apps/slack/manifest.yaml','utf8'))"`
  (or any YAML parser already in `node_modules`) -- expected: parses with no error and yields an
  object carrying `display_information`, `features`, `oauth_config`, `settings`.
- `grep -rn "display_information\|oauth_config" docs/ apps/*/README.md` -- expected: no match — the
  manifest body is reproduced nowhere.
- `grep -c "factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook" apps/slack/manifest.yaml`
  -- expected: `2` (events + interactivity), and the same string is present in
  `apps/slack/README.md` and docs §4.1.
- `git diff --name-only` -- expected: exactly `apps/slack/manifest.yaml`, `apps/slack/README.md`,
  `docs/Self-hosting research.md` and this spec. `.env.schema` and `.env.example` must not appear.

**Manual checks (if no CLI):**
- Read `apps/slack/README.md` end to end: no remaining sentence says the manifest is absent, and the
  five env sections written by Story 3.1 survive unedited.
- `docs/Self-hosting research.md` section headings are byte-identical to before apart from the §6
  Slack paragraph.

## Auto Run Result

Status: awaiting-operator

**Implemented change.** `@mastra/factory@0.15.0` ships no Slack manifest, so `apps/slack/manifest.yaml`
is this repository's own first-party artifact. It mirrors the shape `@mastra/slack@1.6.3`'s
`buildManifest()` emits, carries this deployment's three URLs verbatim from the Story 3.1 registry,
and departs from the vendor defaults twice on evidence — `files:write` added for `files.uploadV2`,
and `oauth_config.scopes.user: [openid, profile]` added for the OIDC account linking the vendor
builder does not target. `apps/slack/README.md` closes the deferral it carried ("that file is not in
this repository yet") with a scope-by-scope justification table, a create-from-manifest procedure and
five numbered checkpoints; `docs/Self-hosting research.md` §6 now names the file by path. Every
console and `.env` step that remains is human work and is enumerated in `operator_actions`.

**Files changed.**
- `apps/slack/manifest.yaml` — new: the app's whole registration as one diffable file.
- `apps/slack/README.md` — scope table, create-from-manifest procedure, checkpoints; Interactivity
  and assistant-view rows added to the App settings table.
- `docs/Self-hosting research.md` — §6's one Slack line repointed at the manifest path. No section
  renumbered; §4.1 untouched.
- This spec — plan, triage log and `operator_actions`.

One edit reaches outside the sections this story owns: the `SLACK_APP_CLIENT_SECRET` paragraph Story
3.1 wrote repeated the false "the Slack-side Connect card still works" claim, so it was corrected
with the other three occurrences rather than left as the one surviving copy.

**Review findings.** 30 findings across four layers — high 5, medium 15, low 6, false 4. Twenty-four
were patched, in two groups plus singletons: the create-from-manifest ordering (the signing secret
does not exist when Slack tries to verify the Request URL), the account-linking gate (an unlinked
sender is blocked behind an ephemeral Connect card, so checkpoint 4 must precede checkpoint 5), the
user scopes being mandatory rather than droppable, the blank-vs-unset behaviour of
`MASTRACODE_CHANNELS_PUBLIC_URL`, a DM checkpoint, two citation corrections and the `epic-3-context.md`
revert. Nothing was deferred. Four findings were rejected as `false`: two described the mid-run
`in-review` snapshot rather than the finalized spec; one assumed a loopback `MASTRACODE_PUBLIC_URL`
that Story 3.2 has already replaced; one claimed `MASTRACODE_CHANNELS_PUBLIC_URL` was agent-doable,
but `.env` is gitignored and lives outside this worktree. Two `low` findings were rejected: a
separate `.env`/boot checkpoint duplicating what checkpoint 2's `401`-vs-`404` already proves, and
the observation that `node_modules` citations are unverifiable from the committed tree — inherent to
not vendoring dependencies, already hedged with pinned versions, and verified against the installed
packages during this run.

**Follow-up review recommended: true.** Patched entries by verdict: high 1, medium 1, low 0 (grouped
entries counted once, at the entry verdict). The named unverified risk is the first one: whether
Slack actually refuses to create an app whose `settings.event_subscriptions.request_url` cannot
answer its challenge. The two-pass recovery is documented and costs nothing if unnecessary, but no
in-repo check can settle it — only the operator running checkpoint 1 will.

**Verification performed.** `npm run check` → exit 0 (`node_modules` symlinked from the main checkout
for the run, then removed; nothing under `src/` changed). The manifest parses with the `yaml` package
and yields the four expected top-level keys, 17 bot scopes including `files:write`, user scopes
`["openid","profile"]`, the five bot events, identical event and interactivity URLs, and all three of
`org_deploy_enabled`/`socket_mode_enabled`/`token_rotation_enabled` false. The webhook URL appears
exactly twice in the manifest and matches `apps/slack/README.md` and docs §4.1 character for
character. `grep -rn "display_information\|oauth_config" docs/ apps/*/README.md` → no match: the
manifest body is reproduced nowhere. No stale `:5-12,64`, `:70-81` or sample client id remains.
`git diff --name-only` against `eca1081` → exactly the four files above; `.env.schema` and
`.env.example` untouched; no docs heading changed. The intent contract's runtime-behaviours table
names console-observable outcomes rather than unit-test scenarios — this story adds no executable
code — and each of its rows is covered by a numbered checkpoint in `apps/slack/README.md`.

**Residual risks.**
- The manifest has never been submitted to Slack. Its key names and nesting follow the vendor
  builder's known-good output, but `features.assistant_view` and `oauth_config.scopes.user` are the
  two keys whose acceptance depends on workspace and app settings outside this repository. Step 5 of
  "Creating the app" says what each costs and which of them cannot be given up.
- Every scope justification cites `node_modules`, which the committed tree does not carry. The
  citations were verified against `@chat-adapter/slack@4.41.0` and `@mastra/factory@0.15.0` as
  installed today; a dependency bump invalidates them, which the README says out loud.
- `assistant:write` and `features.assistant_view` buy one typing-status line and nothing else. If
  Slack's assistant surface later requires its own event subscriptions, that is a registry change —
  bot events are fixed at five by Story 3.1's URL registry and docs §4.1.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — the public origin is serving and registration is closed. Nothing below works until `ops/README.md` ingress checkpoint 4 passes (`https://factory.kovalchuk.win/signin` answers `200` through the tunnel) and `README.md` step 3's probe answers `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED`. Slack accepts HTTPS only and refuses to save an Events Request URL it cannot reach, so this is a hard gate rather than a nicety — Story 3.2 is what delivers it.
- Create the app from the manifest. `api.slack.com/apps` → **Create New App** → **From a manifest** → pick the workspace → switch to the **YAML** tab (the default is JSON and rejects YAML) → paste the entire contents of `apps/slack/manifest.yaml` → **Create**. Follow `apps/slack/README.md` → "Creating the app" step by step, and read its "Read this before step 1" warning first: the signing secret comes from the app, so the Events Request URL in the manifest cannot answer Slack's challenge at creation time and Slack may refuse the app on that ground. Dropping `settings.event_subscriptions.request_url` and restoring it after the restart costs nothing. If Slack names any other key in a validation error, drop that one key and create the app anyway; do not fall back to filling console pages in by hand. `features.assistant_view` is survivable — a logged warning and nothing else. **The user half of the scope list (`openid`, `profile`) is not**: dropping it removes account linking entirely rather than halving it, and an unlinked sender is blocked before the agent sees the message. Record what you dropped.
- Install it to the workspace and copy the bot token. Settings → *Install App* → *Install to Workspace*, approve the manifest's scope list — seventeen bot scopes, less anything you recorded dropping — then copy the **Bot User OAuth Token** (`xoxb-…`) from OAuth & Permissions. It does not exist before the install. Not the user token (`xoxp-`) and not an app-level token (`xapp-`). Any later scope change means re-installing and copying a new token.
- Copy the three credentials. Basic Information → App Credentials gives **Signing Secret**, **Client ID** and **Client Secret** (the last behind a *Show* control, re-displayable later, so none of the three needs the one-shot escrow the GitHub story needed). The signing secret is the master switch: unset, no Slack integration is constructed at all and the webhook path `404`s.
- Populate `.env` and restart. Write the five lines from `apps/slack/README.md` → "Creating the app" into `.env` at the repository root — `SLACK_APP_SIGNING_SECRET`, `SLACK_APP_BOT_TOKEN`, `SLACK_APP_CLIENT_ID`, `SLACK_APP_CLIENT_SECRET` and `MASTRACODE_CHANNELS_PUBLIC_URL` (`https://factory.kovalchuk.win`, origin only). Set the last one explicitly rather than leaving it to the fallback: after Story 3.2 `MASTRACODE_PUBLIC_URL` already holds the same public origin, so an unset channels key would be correct by coincidence — the state `ops/README.md` warns against. Do not write the key with an empty value either: unset falls back, but present-and-empty is `""`, which disables the OIDC routes outright. Restart with `npm run build && npm run start`; `.env` is read once at startup. Never commit `.env`.
- Invite the bot to a channel. `/invite @Mastra Factory` in the channel you intend to use. `chat:write.public` lets it post into a channel it is not in, but it receives no `message.channels` event for such a channel — so an un-invited channel is silent in the direction that matters, and that silence looks exactly like a wrong Request URL.
- Run the checkpoints in `apps/slack/README.md` in their numbered order, 1 to 5 — the order is load-bearing, not presentational. Checkpoint 2 comes before checkpoint 3 because an unsigned `POST` answering `401 Invalid signature` proves the route exists, while a `404` there is the same thing the console reports as "Your URL didn't respond" with no hint which cause it is. Checkpoint 3 is the first time the Events Request URL can verify at all — a freshly created app is never already Verified, because the secret it needed did not exist yet. Paste the same URL into Interactivity & Shortcuts; that field saves without probing, so it is the more likely of the two to be silently wrong.
- Prove one OIDC link, then one delivery — in that order. Checkpoint 4 first: open `https://factory.kovalchuk.win/connect/slack/oidc/start` while signed in, confirm the redirect to `slack.com/openid/connect/authorize` carries `scope=openid+profile` and a `redirect_uri` matching the registered callback, and complete the link. It must come first because an unlinked sender is blocked before the agent ever sees the message — the mention gets an ephemeral "Connect your account" card and nothing else, which reads exactly like a missing bot token. Then checkpoint 5: mention the bot in the invited channel, ask for something that produces a file, and confirm the reply and the attachment — the attachment is what proves `files:write`, the one scope the vendor's default list omits. Do not expect a typing status on a channel mention; that call targets an assistant thread, so its home is checkpoint 5b's DM.
- Record the result against the repository, not only in the console. If any manifest key was dropped at creation, or any scope had to be added afterwards, edit `apps/slack/manifest.yaml` and re-paste it on the app's **App Manifest** page so the file and the live app stay the same thing. That round trip is the whole point of the file existing.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
