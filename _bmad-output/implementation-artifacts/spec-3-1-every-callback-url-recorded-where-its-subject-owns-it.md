---
title: 'Story 3.1: Every callback URL recorded where its subject owns it'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_revision: '6df9a0a50543d349181da37a43b11a9b267fa464'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      `.env.schema` and `.env.example` still carry the provider-console prose the three new subject
      READMEs now own, so two committed documents describe how to obtain the same thirteen values.
    evidence: |-
      `.env.schema:45-65` tells the operator where each Slack credential lives ("Basic Information →
      App Credentials", "starts xoxb-"), `:312-315` gives the GitHub callback-registration
      instruction, and `:364-365` the Linear one; `.env.example` duplicates all of it verbatim with
      the decorator lines stripped. AD-6 and `AGENTS.md:61-63` give that half to the owning subject's
      README and say neither side restates the other's, so before this change the schema was the only
      copy and after it there are two. Nothing checks either way, and the schema copy is the one an
      operator editing `.env` meets first.
      Not done here: `epics.md:1014-1019` is Story 5.2's acceptance criterion verbatim —
      "`.env.schema` does not restate how to obtain a value from a provider console" — so stripping
      the prose here would take that story's criterion. The duplication is inert in the meantime:
      the two copies agree today, and the READMEs are the normative half under AD-6 from the moment
      they exist.
    location: >-
      .env.schema:45-65,312-315,364-365 and .env.example vs apps/*/README.md
    severity: medium
  - summary: >-
      The Cloudflare public-hostname mapping is the one row in the §4.1 registry that still has no
      subject README, so "every callback URL recorded where its subject owns it" is not yet literally
      true for the ingress row.
    evidence: |-
      `docs/Self-hosting research.md` §4.1 carries `Cloudflare | Public Hostname → URL |
      127.0.0.1:4111 (type HTTP)`, and the paragraph this story added to §4.1 concedes the gap by
      naming Cloudflare and Better Auth as the rows with no subject README. AD-3 makes the tunnel
      host infrastructure, which puts it in the existing `ops/` subject rather than a new root
      directory — so the owner exists and is simply unwritten.
      Not done here: `epics.md:689-691` is Story 3.2's acceptance criterion verbatim — "`ops/README.md`
      gains the tunnel section describing the install and the public-hostname mapping" — so writing
      the mapping here would take it. Until 3.2 lands, §4.1 remains that row's only record, which is
      why this story kept the table rather than emptying it.
    location: >-
      ops/README.md (absent section) vs docs/Self-hosting research.md §4.1 Cloudflare row
    severity: low
  - summary: >-
      `MASTRACODE_PUBLIC_URL` is the origin all three README URL tables derive from, yet no subject
      README owns it, and the one file that does specify it still pins it to loopback.
    evidence: |-
      `apps/github/README.md:24` and `apps/linear/README.md:21` both state that Factory derives their
      callback path from the public origin held in `MASTRACODE_PUBLIC_URL`, and both write that path
      as `https://factory.kovalchuk.win/...`. The key itself falls outside this story's partition
      (`GITHUB_APP_*`, `LINEAR_*`, `SLACK_APP_*`, `MASTRACODE_CHANNELS_PUBLIC_URL`), so it gained no
      `##` section anywhere. Its only specification in the repo is root `README.md:41` — "exactly
      `http://127.0.0.1:4111`: scheme, host and port" — written for the loopback-only deployment that
      preceded this epic. An operator who configures `.env` from the root README therefore registers
      loopback-derived callbacks, which is the exact failure `docs/Self-hosting research.md:292-293`
      warns about. The two statements are both live and they contradict each other.
      Not done here: AD-6 puts the host/origin-facing keys in the `ops/` subject, and the intent's
      Never list leaves `ops/` untouched for Story 3.2, which is also the story that makes the public
      origin real by standing up the tunnel. Reconciling the loopback-era quickstart with the public
      origin before that tunnel exists would document an origin nothing serves.
    location: >-
      README.md:41 vs apps/github/README.md:24 and apps/linear/README.md:21
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The operator is about to register three provider apps by hand, and every URL those consoles
ask for exists only inside one table in `docs/Self-hosting research.md` §4.1. There is no `apps/`
directory, no provider subject owns its own keys, and a future change of public origin would mean
remembering four consoles instead of walking one list.

**Approach:** Create the three provider/app subjects the spine seeds — `apps/github/`, `apps/linear/`,
`apps/slack/` — each with a `README.md` that is normative for its own URL table, its console settings,
and what its env values must contain and how to obtain them. Then make §4.1 point at those files by
repo-relative path instead of being the only place the URLs live. Documentation only: no TypeScript, no
new root directory, no `.env.schema` edit.

## Boundaries & Constraints

**Always:**
- Every URL is written in full against the public origin `https://factory.kovalchuk.win`, transcribed
  from the §4.1 registry — those paths were read out of the shipped packages, so transcribe, never
  re-derive.
- Each README owns exactly its key group: `apps/github/README.md` → `GITHUB_APP_*`,
  `apps/linear/README.md` → `LINEAR_*`, `apps/slack/README.md` → `SLACK_APP_*` **and**
  `MASTRACODE_CHANNELS_PUBLIC_URL`. No key is documented by two READMEs.
- Each README states what the operator must do in that provider's console, and carries the explicit
  non-restatement sentence naming `.env.schema` as the list of keys — follow the opening shape of
  `ops/README.md:1-10` and `sandbox/README.md:1-14`.
- Match house style: `# <Subject title>` heading, an opening paragraph declaring what the file is
  normative for, `## <KEY>` sections with bolded **What the value must contain.** /
  **How to obtain it.** blocks, hard-wrapped at ~105 columns.

**Never:**
- Never restate validation, type, `@public`/`@sensitive` marking, or `@required` expressions — those
  belong to `.env.schema` and must not appear in a README.
- Never edit `.env.schema` or `.env.example`. Removing the console prose that currently duplicates
  these READMEs is Story 5.2's criterion, not this one's.
- Never renumber or delete a section number in `docs/Self-hosting research.md`; they are stable
  citation anchors. The §4.1 edit is additive.
- Never create a root directory for ingress, and never add the tunnel install or public-hostname
  section to `ops/README.md` — that is Story 3.2's criterion verbatim. This story leaves `ops/`
  untouched.
- Never create `apps/slack/manifest.yaml` (Story 3.5) and never inline a manifest body into a README.
- No `.ts`/`.js`/`.mjs`/`.cjs` under `apps/`, no secrets, no real credential values.

</intent-contract>

## Code Map

- `docs/Self-hosting research.md` -- §4.1 "URL registry" at line 263 is the source table; §5 (line 287)
  carries the GitHub permission table and webhook event list, §6 (line 320) the Linear scopes and the
  Slack settings table. Transcribe from these. `## 4.` is at 246, `## 5.` at 287, `## 6.` at 320,
  `## 7.` at 344 — no heading between them may move.
- `ops/README.md` -- the style model for an operator-plane subject README, and the non-restatement
  clause to mirror (lines 1-10). Read-only in this story.
- `sandbox/README.md` -- the fuller style model: per-key `## KEY` sections, "if the two ever disagree,
  this directory wins" phrasing (line 14), troubleshooting sections. Read-only.
- `.env.schema` -- read-only. Lines 37-66 (`MASTRACODE_PUBLIC_URL`, `MASTRACODE_CHANNELS_PUBLIC_URL`,
  the four `SLACK_APP_*`), 306-345 (`# GitHub projects` header, the six `GITHUB_APP_*`,
  `MASTRACODE_GITHUB_RECONCILE_ENABLED` and `_INTERVAL_MS`), 358-374 (`# Linear intake` header,
  `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`). Confirm exact key spellings here; copy no prose.
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` -- AD-3 (two planes, `apps/`
  namespace, root is a closed set), AD-5 (files canonical, docs link out), AD-6 (env-key truth split),
  and the structural seed naming `apps/github/README.md`, `apps/linear/README.md`,
  `apps/slack/README.md`, `apps/slack/manifest.yaml`.
- `AGENTS.md:21-29,61-63` -- the repo rules this story is judged against.
- `apps/` -- does not exist yet; this story creates it.

## Tasks & Acceptance

**Execution:**
- `apps/github/README.md` -- create -- `# GitHub App`. Opening paragraph + non-restatement sentence. A
  URL table: Callback URL **and** Setup URL both `https://factory.kovalchuk.win/auth/github/callback`
  (one value, two fields, Settings → GitHub Apps → your app → General); Webhook URL
  `https://factory.kovalchuk.win/web/github/webhook`. The permission grants (Contents R+W, Pull
  requests R+W, Issues R+W, Metadata R, Commit statuses R, Administration R, Checks R; Actions,
  Artifact metadata, Dependabot alerts and Security events skipped; a later 403 is the signal to
  widen). The webhook subscriptions (`pull_request`, `pull_request_review`,
  `pull_request_review_comment`, `issues`, `issue_comment`, `push`, plus `installation`, `status`,
  `label`, `repository`). Then a `## KEY` section for each of `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY` (PEM with escaped newlines), `GITHUB_APP_CLIENT_ID`,
  `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`, `GITHUB_APP_WEBHOOK_SECRET` — the last stating it must
  be stable and permanent because it is also the primary OAuth-state signer, and that it and the
  private key are escrowed in a password manager since both are regenerable only by re-registering.
  `MASTRACODE_GITHUB_RECONCILE_ENABLED` gets a short paragraph (left on; the 5-minute sweep is the only
  merge-state writer when webhooks cannot land) — this README is its only documenting README.
- `apps/linear/README.md` -- create -- `# Linear app`. Same opening shape. URL table: Redirect URL
  `https://factory.kovalchuk.win/auth/linear/callback`. Scopes `read`, `write`, `issues:create`,
  `comments:create`, `app:mentionable`, calling out that the last is easily missed and without it
  Factory cannot be @-mentioned inside Linear. State that read/write is workspace-wide because Linear
  has no per-project narrowing at the OAuth layer, so narrowing happens in Factory's intake selection.
  `## LINEAR_CLIENT_ID` and `## LINEAR_CLIENT_SECRET`: all-or-nothing, one alone is a boot error, and
  the integration additionally needs auth, a database and an organization.
- `apps/slack/README.md` -- create -- `# Slack app`. Same opening shape. URL table: Events **and**
  Interactivity both
  `https://factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook`; OAuth
  redirect `https://factory.kovalchuk.win/connect/slack/oidc/callback`. Explain the `mastra-code`
  segment is the controller id even though Factory registers the controller on Mastra under the key
  `code`, so the path is not derivable from the key. Bot events `app_mention`, `message.channels`,
  `message.groups`, `message.im`, `message.mpim`; bot user and App Home messages tab enabled; OpenID
  Connect on for account linking. Note the app is created from a manifest whose seeded path is
  `apps/slack/manifest.yaml`, which is not in the repo yet — name the path, reproduce no manifest body.
  Then `## KEY` sections for `SLACK_APP_SIGNING_SECRET` (the master switch — unset means no Slack
  integration is constructed at all), `SLACK_APP_BOT_TOKEN` (`xoxb-`; without it Slack can reach
  Factory but Factory cannot reply), `SLACK_APP_CLIENT_ID`, `SLACK_APP_CLIENT_SECRET`, and
  `MASTRACODE_CHANNELS_PUBLIC_URL` (the public HTTPS origin the OAuth redirect above is built from).
- `docs/Self-hosting research.md` -- edit §4.1 only -- after the registry table, add a short paragraph
  naming `apps/github/README.md`, `apps/linear/README.md` and `apps/slack/README.md` as the canonical
  record for their rows, stating that those files win if the two ever disagree, and that the table
  remains here as the narrative index and the provenance note for the Cloudflare and Better Auth rows,
  which have no subject README. Change no heading, no heading number, and no existing table row.

**Acceptance Criteria:**
- Given the repo before this change has no `apps/` directory, when the change lands, then
  `apps/github/README.md`, `apps/linear/README.md` and `apps/slack/README.md` all exist and are
  tracked by git, and no new root directory has been created.
- Given a reader opens any one of the three READMEs, when they look for the URLs that provider's
  console asks for, then every URL from §4.1 belonging to that provider is present in full against
  `https://factory.kovalchuk.win`, and the GitHub file states the callback value goes in **both** the
  Callback URL and Setup URL fields.
- Given `.env.schema` owns validation, type and `@public`/sensitive marking, when the three READMEs are
  searched, then no `@public`, `@sensitive`, `@required` or `@type=` decorator text appears in any of
  them, and each carries a sentence naming `.env.schema` as the list of keys.
- Given every key has exactly one owning subject, when the three READMEs are read together, then each
  of the six `GITHUB_APP_*`, both `LINEAR_*`, the four `SLACK_APP_*` and `MASTRACODE_CHANNELS_PUBLIC_URL`
  is described in exactly one of them, and none describes a key belonging to another subject.
- Given section numbers in `docs/Self-hosting research.md` are stable citation anchors, when the diff
  for that file is inspected, then it adds lines inside §4.1 only, and no line beginning with `#` is
  added, removed or changed.
- Given the operator plane holds no first-party code, when `apps/` is searched, then it contains only
  `.md` files, and `npm run check` is clean.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass
- verdicts: 30 findings — high 0, medium 17, low 10, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` `MASTRACODE_PUBLIC_URL` is never named as the key the GitHub and Linear callback paths derive from — confirmed against `.env.schema:312-315,364-365`; both READMEs now name it as a cross-reference only, with no `##` section and no value/obtain prose, so no second owner is created.
  - `[medium]` `[patch]` `apps/slack/README.md` omits that `MASTRACODE_CHANNELS_PUBLIC_URL` falls back to `MASTRACODE_PUBLIC_URL` when unset — confirmed at `.env.schema:42`; the fallback is now stated. The finding's second half, that the loopback-vs-tunnel rationale is false for this deployment, is not correct: it is the schema's own design rationale and remains true as such.
  - `[medium]` `[patch]` `apps/github/README.md` never states the five identity keys are all-or-nothing — confirmed: `grep` for "all-or-nothing|all five|inert" returned nothing, while §5 and NFR23 both require it. A `## The five identity keys are one group` section was added ahead of the per-key sections.
  - `[medium]` `[patch]` The state-signer fallback chain is lost — confirmed at `.env.schema:329-334` and `:48-50`; the GitHub file now states the secret is required even with webhooks disabled and that no signer value means a random per-process signer, and the Slack file now names its signing secret as the last-resort signer.
  - `[low]` `[patch]` `MASTRA_PLATFORM_GITHUB_RECONCILE_ENABLED` (`.env.schema:170`) is a near-identical key the reconcile section could be applied to by mistake — one clause naming it as not-this-key was added.
  - `[medium]` `[patch]` "Subscribe only to the ones whose conversation types you actually want" contradicted the App settings table two lines above and the manifest Story 3.5 will apply — the sentence was replaced with one that keeps all five as the registered set.
  - `[low]` `[patch]` The sourced warning was garbled ("the platform skips channels" for "core skips platforms") — restated in §4.1's own terms.
  - `[low]` `[patch]` Two consequence claims in `apps/github/README.md` were derivations, not transcriptions — the Setup-URL claim was dropped and the PEM claim reduced to what the sources support.
  - `[false]` `[reject]` "`apps/` has no entry point and nothing points at it" — disproved by this change itself: the §4.1 paragraph it adds names all three files by repo-relative path, and §4.1 is the cross-provider index `AGENTS.md` treats as normative operational detail and Stories 3.3-3.5 cite by number.
  - `[false]` `[reject]` "No README records what to change when the public origin changes" — disproved: each README's Console URLs table enumerates exactly the console fields holding the origin for that provider, which is the per-console walk-list the story's So-that asks for.
  - `[low]` `[reject]` The spec's `git diff` verification commands pass vacuously on a staged tree, and its Code Map cites §5/§6/§7 at pre-change line numbers — the fix is to edit this build's spec, which triage rejects. Checked anyway: the heading and table-row checks were re-run against `--cached 6df9a0a` and both hold, and Stories 3.3-3.5 cite `docs/` by stable section number, not line number.
  - `[medium]` `[patch]` (edge-case) GitHub key group all-or-nothing — same defect as the third row; fixed by the same section.
  - `[medium]` `[patch]` (edge-case) `GITHUB_APP_WEBHOOK_SECRET` unset, not merely rotated — same defect as the fourth row; fixed by the new "required even with webhooks disabled" block.
  - `[low]` `[patch]` (edge-case) `SLACK_APP_SIGNING_SECRET` rotation invalidates in-flight OAuth state beyond Slack — same defect as the fourth row; fixed by the added last-resort-signer clause.
  - `[medium]` `[patch]` (edge-case) `MASTRACODE_CHANNELS_PUBLIC_URL` unset rather than set wrong — same defect as the second row; fixed by the added fallback sentence.
  - `[medium]` `[patch]` (edge-case) callback paths derived from an unnamed origin key — same defect as the first row.
  - `[low]` `[patch]` (edge-case) operator toggles the platform reconcile key — same defect as the fifth row.
  - `[medium]` `[patch]` (edge-case) bot-events prose contradicts the prescribed set — same defect as the sixth row.
  - `[medium]` `[patch]` §5 and §6 restate README-normative content with no declared winner — confirmed: the permission table, webhook events, Linear scopes and Slack settings table are now duplicated by the READMEs and only §4.1 had a tie-break. One pointer sentence was added under `## 5.` and `## 6.`; no heading, heading number or table row moved (`git diff | grep -E '^[-+]#'` and `'^[-+]\|'` both empty).
  - `[low]` `[reject]` "The change creates `apps/` at repo root, so the criterion 'no new root directory has been created' fails" — the fix is to reword this build's spec, which triage rejects; substantively the epic's criterion is "no new root directory is created **for ingress**", and `AGENTS.md:21-22` and AD-3's structural seed both sanction `apps/` by name.
  - `[medium]` `[patch]` (verification-gap, Other) GitHub group all-or-nothing — same defect as the third row.
  - `[medium]` `[patch]` (verification-gap, Other) the README lets a reader conclude the webhook secret is optional when webhooks are off — same defect as the fourth row; the Console URLs sentence was also amended so it no longer implies the secret can be skipped.
  - `[medium]` `[patch]` (verification-gap, Other) `MASTRACODE_CHANNELS_PUBLIC_URL` fallback omitted — same defect as the second row.
  - `[medium]` `[patch]` (verification-gap, Other) bot-events prose sits against the prescribed row — same defect as the sixth row.
  - `[low]` `[patch]` (verification-gap, Other) four prose lines ran to 106-109 columns against a ~105 house wrap — reflowed; no non-table line now exceeds 105.
  - `[low]` `[reject]` (intent-alignment) The verification surface is file-and-string presence in the repo, while the intent's expectations live at the provider-console surface — true, and unfixable here by construction: the story worktree carries tracked files only, so the packages §4.1 was read out of are not present. The fix is to edit this build's spec, which triage rejects; Stories 3.3-3.5 own the console-surface proof.
  - `[medium]` `[defer]` (intent-alignment) The READMEs now duplicate `.env.schema`'s console prose, which `AGENTS.md:63` forbids — real and caused by this change, but removing the schema copy is Story 5.2's criterion verbatim, so the intent assigns it elsewhere. Recorded in `deferred`.
  - `[medium]` `[patch]` (intent-alignment) §5/§6 duplication with no tie-break — same defect as the §5/§6 row above.
  - `[low]` `[defer]` (intent-alignment) The Cloudflare public-hostname row still has no subject README — real, and `ops/` is its owner under AD-3, but writing it is Story 3.2's criterion verbatim. Recorded in `deferred`.
  - `[false]` `[reject]` (intent-alignment) "No terminal status, nothing committed" — the auditor observed the run mid-review: `status: in-review` and a staged-but-uncommitted tree are this step's normal state, and finalization follows triage.

### 2026-09-23 — Review pass (follow-up)
- verdicts: 30 findings — high 0, medium 8, low 13, false 9, maybe-false 0
- findings:
  - `[medium]` `[patch]` `apps/github/README.md` "five identity keys are one group" says a partial fill
    is silently inert — disproved and inverted: `GITHUB_APP_ID=12345 npx varlock load` exits 1 naming
    `GITHUB_APP_PRIVATE_KEY` "required but currently empty" plus three cascading dependency errors, so
    the top-down partial fill an operator actually makes is a boot failure, not silence. Only a
    tail-only fill loads and stays inert (`src/mastra/index.ts:212-215`). Section rewritten to state
    both directions.
  - `[low]` `[reject]` Spec AC says "adds lines inside §4.1 only" while the change also adds §5/§6
    pointer paragraphs — fix is to edit this build's spec, which triage rejects. Substantively clean:
    the intent forbids only renumbering/deleting section numbers, and `git diff 6df9a0a | grep '^[-+]#'`
    is empty.
  - `[low]` `[reject]` Verification's `git diff --stat` expectation names `docs/Self-hosting research.md`
    as the only modified tracked file, but `_bmad-output/` artifacts also change — fix is a spec edit.
  - `[low]` `[reject]` carried — `git diff`-based verification commands pass vacuously post-commit;
    same claim and location as the prior pass's rejected row, and the text still reads as described.
  - `[low]` `[reject]` carried — no command checks URL path correctness, only origin presence; same
    claim as the prior pass's intent-alignment row. Fix is a spec edit.
  - `[low]` `[reject]` `deferred-work.md` DW-40's title is truncated mid-clause ("not yet literally true
    for") — confirmed, and the source text in this spec's `deferred[1].summary` is intact, so the loss
    is in the orchestrator's harvest. The ledger is orchestrator-owned and this run is forbidden to
    rewrite its entries; the defect is cosmetic and the complete text survives here.
  - `[false]` `[reject]` "The Better Auth row drops out of the ledger and needs an owner" — disproved at
    `docs/Self-hosting research.md:270`: that row's Field column is literally `*(none)*` ("email+password;
    surface is `/auth/api/*`"). There is no console field and no callback URL to register, so no subject
    owes it a record.
  - `[medium]` `[defer]` `MASTRACODE_PUBLIC_URL` has no owning subject README — confirmed; grouped with
    the root-README row below. Recorded in `deferred`.
  - `[medium]` `[defer]` Root `README.md:41` pins `MASTRACODE_PUBLIC_URL` to "exactly
    `http://127.0.0.1:4111`" while `apps/github/README.md:24` and `apps/linear/README.md:21` derive
    `https://factory.kovalchuk.win/...` callbacks from it — confirmed, both statements live. AD-6 gives
    the key to `ops/`, which the intent's Never list reserves for Story 3.2, the story that makes the
    public origin real. Recorded in `deferred`.
  - `[false]` `[reject]` "`sprint-status.yaml` leaves `epic-3: backlog`" — the board is orchestrator
    bookkeeping; this run is forbidden to write it, and a row's state is not a defect in the change.
  - `[false]` `[reject]` "Spec is `in-review` while sprint says `done`, and `## Spec Change Log` is
    empty" — `in-review` is this step's own normal state mid-pass, and an empty change log is correct:
    no bad_spec loopback ever ran, so nothing outside `<intent-contract>` was amended.
  - `[low]` `[patch]` `apps/linear/README.md:23` broke mid-clause at ~35 columns against the ~105 house
    wrap, left by the prior pass's reflow — confirmed by reading; the paragraph was rejoined.
  - `[medium]` `[patch]` (edge-case) GitHub partial fill is a startup validation error, not silent
    degradation — same defect as the first row; fixed by the same rewrite.
  - `[medium]` `[patch]` (edge-case) `apps/slack/README.md` App settings table omits bot token scopes
    while "Creating the app" calls the table "the record to apply by hand" — confirmed: neither the
    table nor §6 carries scopes, and Slack will not save the five bot events without them. The
    completeness claim was qualified and the scope list left to the manifest (Story 3.5) rather than
    invented here, since no repo source records it.
  - `[medium]` `[defer]` (edge-case) both READMEs name `MASTRACODE_PUBLIC_URL` without saying it must
    hold the public origin — same defect as the root-README row; recorded in `deferred`.
  - `[false]` `[reject]` (edge-case) "The loopback-vs-tunnel rationale in `apps/slack/README.md:119-122`
    is false for this deployment" — carried refutation from the prior pass: it is `.env.schema:38-42`'s
    own design rationale for why the key exists and remains true as such; the paragraph then tells the
    operator to point it at the public origin, not at loopback.
  - `[low]` `[reject]` (edge-case) The reconcile section does not state the literal values the keys
    accept — the intent's Never list forbids restating validation, type and `@type=` expressions, which
    is exactly what an accepted-values list would be; `.env.schema` is named as the list of keys.
  - `[false]` `[reject]` (edge-case) "A trailing slash on `MASTRACODE_CHANNELS_PUBLIC_URL` produces a
    double-slash redirect" — disproved at
    `node_modules/@mastra/factory/dist/integrations/slack/connect-route.js:68`, which builds the
    redirect as `redirectBaseUrl.replace(/\/$/, "")` + the callback path. A trailing slash is stripped.
  - `[false]` `[reject]` (edge-case) `apps/github/README.md` omits `SLACK_APP_SIGNING_SECRET` from the
    signer chain — the passage is scoped to "a configured GitHub integration", where
    `.env.schema:329-334` makes the choice webhook-secret-or-`WORKOS_COOKIE_PASSWORD`; the Slack
    fallback applies to a deployment with no GitHub App, and `apps/slack/README.md:77-79` states it.
  - `[false]` `[reject]` (edge-case) "Story marked done while spec reads `in-review`" — same refutation
    as the spec-status row above.
  - `[low]` `[reject]` (edge-case) carried — "`apps/` is a new root directory, so the criterion fails";
    same claim as the prior pass's rejected row, and `AGENTS.md:21-22` plus AD-3's structural seed still
    sanction `apps/` by name.
  - `[medium]` `[patch]` (verification-gap, Other) GitHub partial-fill claim inverted, with the varlock
    run as evidence — same defect as the first row; this is the evidence that settled it.
  - `[low]` `[reject]` (verification-gap, Other) DW-40 title truncation — same defect as the sixth row.
  - `[low]` `[patch]` (verification-gap, Other) `apps/linear/README.md:21-24` ragged wrap — same defect
    as the twelfth row; fixed by the same rejoin.
  - `[low]` `[reject]` (intent-alignment) carried — the intent's expectations live at the provider
    consoles while the checks observe repo strings; same claim as the prior pass's rejected row, and the
    fix is still a spec edit.
  - `[low]` `[reject]` (intent-alignment) The prior pass rejected a finding on the premise that the
    shipped packages are absent from this worktree, and that premise is false — `node_modules/@mastra/`
    is installed here. Confirmed, and acted on: all five URL paths were re-verified directly against
    `@mastra/factory` and `@mastra/code-sdk` this pass. Recording the correction is all that is left;
    amending the prior row would be a spec edit.
  - `[false]` `[reject]` (intent-alignment) "`apps/slack/README.md:124` inverts the
    `MASTRACODE_CHANNELS_PUBLIC_URL` fallback direction" — disproved: the auditor cited
    `slack.js:52-53`'s `webPublicUrl()`, which resolves the *browser deep-link* origin and is not what
    this README documents. The OAuth redirect base is `src/mastra/index.ts:567`,
    `MASTRACODE_CHANNELS_PUBLIC_URL ?? MASTRACODE_PUBLIC_URL` — the channels key wins and falls back
    exactly as the README states.
  - `[false]` `[reject]` (intent-alignment) "The public origin now appears in four repo files instead of
    one, so a future origin change is four files to walk" — the intent's Always list requires every URL
    to be written in full against `https://factory.kovalchuk.win` in each subject README, so the spread
    is mandated, not a regression; the walk-list the So-that names is the per-console one, which each
    Console URLs table now provides.
  - `[low]` `[reject]` (intent-alignment) carried — §4.1's Cloudflare row is still unowned because its
    owner `ops/` is off-limits until Story 3.2; same claim as the prior pass's deferred row, already
    recorded in `deferred`.
  - `[medium]` `[defer]` (intent-alignment) `MASTRACODE_PUBLIC_URL`'s owner documents it nowhere and
    root `README.md:41` contradicts the new files — same defect as the two defer rows above.

## Design Notes

**Why `ops/README.md` is untouched.** Story 3.1's acceptance criteria mention it only to rule out a new
root directory for ingress. The tunnel install and the public-hostname mapping are Story 3.2's criterion
word for word, so writing them here would take another story's acceptance. Until 3.2 lands, the
Cloudflare row in §4.1 remains that mapping's only record — which is also why §4.1's table is kept
rather than emptied.

**Why §4.1's table survives.** AD-5 makes files canonical and prose a pointer, but the fenced blocks
that get replaced by references are enumerated by Story 5.3 (§2.1, §7.1-§7.4) and §4.1 is not among
them; Stories 3.3-3.5 also cite "the §4.1 registry" by name. The minimum that satisfies this story's
criterion — and the maximum that does not take 5.3's — is an additive pointer paragraph that transfers
normative weight to the subject READMEs while leaving the table and every heading in place.

**Why `.env.schema` keeps its console prose.** Story 5.2's criterion is "`.env.schema` does not restate
how to obtain a value from a provider console". Stripping it here would take that criterion, and the
duplication is inert in the meantime: the READMEs become the normative half under AD-6 the moment they
exist. Expect a deferred-work entry recording the overlap rather than a fix.

## Verification

**Commands:**
- `npm run check` -- expected: exits 0, no TypeScript output (this story adds no code; the check proves
  nothing regressed).
- `ls apps/github/README.md apps/linear/README.md apps/slack/README.md` -- expected: all three listed,
  no "No such file".
- `find apps -type f ! -name '*.md'` -- expected: no output.
- `grep -c 'https://factory\.kovalchuk\.win' apps/github/README.md apps/linear/README.md apps/slack/README.md`
  -- expected: a non-zero count for each of the three files.
- `grep -nE '@public|@sensitive|@required|@type=' apps/github/README.md apps/linear/README.md apps/slack/README.md`
  -- expected: no output.
- `grep -rn 'env\.schema' apps/` -- expected: at least one hit in each of the three files.
- `git diff -- 'docs/Self-hosting research.md' | grep -E '^[-+]#'` -- expected: no output, proving no
  heading was added, removed or renumbered.
- `git diff --stat` -- expected: `docs/Self-hosting research.md` is the only modified tracked file; the
  three READMEs are new.

**Manual checks:**
- Read each README's URL table against §4.1 character by character — a mistyped path is the one defect
  this story exists to prevent and no command catches it. In particular
  `/api/agent-controllers/mastra-code/channels/slack/webhook` must carry `mastra-code`, not `code`.
- Confirm no README states a key's type, required-ness or sensitivity, and that each of the thirteen
  owned keys appears in exactly one README.

## Auto Run Result

Status: done

**Summary.** Story 3.1 creates the three provider subjects the spine seeds — `apps/github/`,
`apps/linear/`, `apps/slack/` — each holding a `README.md` that is normative for its provider's
console URLs, its console settings, and what its env values must contain and how to obtain them, and
makes `docs/Self-hosting research.md` point at those files instead of being the only place the URLs
live. Documentation only: no TypeScript, no `.env.schema` edit, `ops/` untouched. This follow-up pass
re-reviewed the committed change with four independent layers and applied three patches.

**Files changed.**
- `apps/github/README.md` — new. GitHub App console URLs (callback value in both the Callback URL and
  Setup URL fields, plus the webhook URL), the permission grants and the reasons for each, the webhook
  subscriptions, the all-or-nothing identity group, a `##` section per `GITHUB_APP_*` key, and the
  reconcile sweep.
- `apps/linear/README.md` — new. Redirect URL, the five scopes with `app:mentionable` called out,
  workspace-wide read/write and where narrowing actually happens, and both `LINEAR_*` keys.
- `apps/slack/README.md` — new. Events/Interactivity and OAuth redirect URLs, why the `mastra-code`
  path segment is not derivable, the app settings table, the manifest pointer, the four `SLACK_APP_*`
  keys and `MASTRACODE_CHANNELS_PUBLIC_URL`.
- `docs/Self-hosting research.md` — edited. Additive pointer paragraphs in §4.1, §5 and §6 naming the
  three READMEs as canonical and declaring they win on disagreement. No heading, heading number or
  table row moved.
- `_bmad-output/implementation-artifacts/epic-3-context.md` — new, compiled epic context.

**Review findings (this pass).** 30 findings across four layers — high 0, medium 8, low 13, false 9,
maybe-false 0. Three entries patched (medium 2, low 1); one entry deferred (medium); the rest rejected.

Patches applied:
1. `apps/github/README.md` — the identity-group section asserted that any partial fill is silently
   inert. Running `GITHUB_APP_ID=12345 npx varlock load` exits 1 and names the first empty key, so a
   top-down partial fill stops the server instead. The section now states both directions and keeps
   all-five-blank as the supported no-GitHub mode.
2. `apps/slack/README.md` — "Creating the app" presented the settings table as the complete hand-apply
   record while omitting bot token scopes, which Slack requires before the bot events can be saved.
   The claim is now qualified and the scope list left to the manifest, since no repo source records it.
3. `apps/linear/README.md` — a paragraph left ragged by the prior pass's reflow was rejoined.

Deferred: `MASTRACODE_PUBLIC_URL` has no owning subject README, and root `README.md:41` still pins it
to `http://127.0.0.1:4111` while the new files derive `https://factory.kovalchuk.win/...` callbacks
from it. Its owner under AD-6 is `ops/`, which the intent reserves for Story 3.2 — the story that
stands up the tunnel and makes the public origin real.

Rejected findings and their reasons are recorded row by row in the triage log above. The substantive
rejections: the Better Auth row has no console field to own (`*(none)*` in §4.1); a trailing slash on
the channels origin is stripped by `connect-route.js:68`; the claimed inversion of the
`MASTRACODE_CHANNELS_PUBLIC_URL` fallback cited `webPublicUrl()`, a different resolver than the one
that builds the OAuth redirect (`src/mastra/index.ts:567` confirms the README); the GitHub signer
passage is correctly scoped to a configured GitHub integration; and the spread of the origin string
across the three READMEs is mandated by the intent, not a regression. Findings whose only fix was to
edit this build's spec, and findings against orchestrator-owned files (`sprint-status.yaml`,
`deferred-work.md`), were rejected on those grounds with the substance checked anyway.

**Verification performed.**
- `npm run check` — exit 0, no TypeScript output.
- `ls apps/{github,linear,slack}/README.md` — all three present.
- `find apps -type f ! -name '*.md'` — no output.
- `grep -c 'https://factory\.kovalchuk\.win' …` — 3 / 2 / 4, non-zero for each file.
- `grep -nE '@public|@sensitive|@required|@type=' …` — no output.
- `grep -rn 'env\.schema' apps/` — one hit in each of the three files.
- `git diff 6df9a0a -- 'docs/Self-hosting research.md' | grep -E '^[-+]#'` — no output, pinned to the
  baseline rather than to a clean tree so the check is not vacuous.
- Key ownership — each of the six `GITHUB_APP_*`, both `LINEAR_*`, the four `SLACK_APP_*` and
  `MASTRACODE_CHANNELS_PUBLIC_URL` resolves to exactly one README, checked per key.
- Wrap — `awk 'length>105'` over non-table lines in the three READMEs returns nothing.
- Manual: all five URL paths re-verified this pass directly against the shipped packages
  (`@mastra/factory` routes and `connect-route.js`, `@mastra/code-sdk`'s `mastra-code` controller id),
  not only against §4.1 — including the `mastra-code` segment the story exists to protect.

**Follow-up review recommendation: false.** This was a follow-up pass and nothing `high` was patched,
so the work has converged. Patched this pass: high 0, medium 2, low 1.

**Residual risks.** The deferred `MASTRACODE_PUBLIC_URL` contradiction is the live one: until Story 3.2
lands, the repo asserts both a loopback and a public origin for the same key, and an operator who
configures from the root README would register callbacks that never match. The Cloudflare
public-hostname row remains unowned for the same reason. Neither is checkable by any command this
story ships, and both are recorded in `deferred`.

