---
title: 'DW-67/69/70/73/76: trim the last three env reads in config/ and make the comments beside them true'
type: 'bugfix'
created: '2026-09-26'
status: 'done'
baseline_revision: '01c4423b82c52d84cdb2605a6b04b1396d2b1cd5'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized, multiple-goals]
deferred:
  - summary: >-
      MASTRACODE_CHANNELS_PUBLIC_URL is still read raw, so a whitespace-only value is
      truthy, wins the ?? over the now-trimmed publicUrl, and mounts the Slack OIDC
      routes on a blank redirect base.
    evidence: |-
      src/mastra/config/integrations.ts:105 is `process.env.MASTRACODE_CHANNELS_PUBLIC_URL ?? publicUrl`.
      `'   '` is truthy, so it wins the `??` and reaches SlackIntegration as
      `oidcRedirectBaseUrl`; `oidcConfigured` is `Boolean(clientId && clientSecret &&
      oidcRedirectBaseUrl)` (node_modules/@mastra/factory/dist/integrations/slack/integration.js:88),
      so the routes mount and every `redirect_uri` is built by appending
      `/connect/slack/oidc/callback` to whitespace — Slack answers `bad_redirect_uri`.
      integrations.test.ts covers only the present-and-empty `''` control, not whitespace.
      Pre-existing: the key was read raw before this change too. Deliberately out of
      scope here — the bundle names exactly three reads, and this key's rawness is what
      the present-and-empty operator control in apps/slack/README.md depends on, so a
      fix must preserve `''` (disabling) while making `'   '` behave the same, which is
      a behaviour decision rather than a trim.
    location: >-
      src/mastra/config/integrations.ts:105
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Three environment reads under `src/mastra/config/` are untrimmed while every neighbour is trimmed, so a padded `.env` line is a configured value rather than an absent one: `pubsub.ts:17` builds a real `RedisStreamsPubSub` on a blank URL at module load (DW-67), `integrations.ts:97` hands Slack a whitespace bot token (DW-73), and `public-url.ts:19` makes `'   '` the deployment's public origin — `@mastra/factory` reaches for its own default with `??` (`node_modules/@mastra/factory/dist/factory.js`), so the Slack OIDC routes mount against that blank origin (DW-76). Separately, `config/factory.ts:60-63` claims an unset `DATABASE_URL` means "default storage resolution applies (local libSQL file)", which never happens because `config/storage.ts:26-30` constructs `LibSQLFactoryStorage` itself (DW-70).

**Approach:** Add `?.trim()` to the three reads, with `|| undefined` wherever an empty result must read as unset, flip the three tests that deliberately pin today's untrimmed behaviour, and correct every in-repo comment and doc sentence that asserts the old behaviour — including the `apps/slack/README.md` bullet DW-76 names, and the `config/factory.ts` storage comment DW-70 names.

## Boundaries & Constraints

**Always:**
- Keep one literal `process.env.<KEY>` read site per key: `?.trim()` is added to the existing read, never a second read (guards at `.bmad-loop/policy.toml` lines 3240, 3243, 3246 census read sites and would fail on a second one).
- Leave the deliberately-raw reads raw and their in-place reasons intact: `GITHUB_APP_WEBHOOK_SECRET` and `SLACK_APP_SIGNING_SECRET` into the `stateSecret` chain (`integrations.ts:35,78,86-87`), `WORKOS_COOKIE_PASSWORD` in that same chain, `MASTRACODE_CHANNELS_PUBLIC_URL` under `??` (`integrations.ts:102`), and `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` ids in `auth.ts`.
- Every comment or doc sentence left in the tree must describe what the code does after the change. Where a test's whole purpose was to pin the defect, rewrite the case and its comment rather than deleting the case.
- `apps/slack/README.md:395` cites `src/mastra/config/integrations.ts:102`; keep that line number correct (edit `integrations.ts:97` in place, do not shift lines above 102) or update the citation.

**Never:**
- Do not edit `_bmad-output/implementation-artifacts/deferred-work.md` or `sprint-status.yaml` — the orchestrator owns them.
- Do not touch `.env.schema`'s or `ops/README.md`'s `REDIS_URL` prose (DW-69): "unset keeps the in-process bus" becomes true once the trim lands, and documenting the old asymmetry would enshrine a defect. Verify, do not edit.
- Do not change `??` to `||` anywhere in `integrations.ts` — the present-and-empty `MASTRACODE_CHANNELS_PUBLIC_URL` control documented in `apps/slack/README.md:393-394` depends on `??`.
- Do not add trimming to any key outside these three, and do not restructure the config modules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Padded Redis URL | `REDIS_URL='  redis://u:p@127.0.0.1:6399  '` | `pubsub` is a `RedisStreamsPubSub` constructed with `{ url: 'redis://u:p@127.0.0.1:6399' }`; the log still redacts credentials | No error expected |
| Blank Redis URL | `REDIS_URL='   '` | `pubsub` is `undefined` and nothing is logged — same as unset | No error expected |
| Padded public URL | `MASTRACODE_PUBLIC_URL='  https://factory.example  '` | `config.publicUrl === 'https://factory.example'`; the Slack integration's `oidcConfigured` is `true` | No error expected |
| Blank public URL | `MASTRACODE_PUBLIC_URL='   '`, Slack group set, no channels URL | `config.publicUrl` is `undefined` so the factory applies its own default; Slack `oidcConfigured` is `false` | No error expected |
| Blank bot token | Slack group set, `SLACK_APP_BOT_TOKEN='   '` | Integration is still built; `diagnostics().botTokenConfigured` is `false` | No error expected |
| Padded bot token | Slack group set, `SLACK_APP_BOT_TOKEN='  slack-bot-token  '` | `diagnostics().botTokenConfigured` is `true` | No error expected |
| Channels URL control preserved | `MASTRACODE_CHANNELS_PUBLIC_URL=''`, `MASTRACODE_PUBLIC_URL='https://factory.example'` | `oidcConfigured` stays `false` — `??` still lets the empty value win | No error expected |

</intent-contract>

## Code Map

- `src/mastra/config/pubsub.ts:17` -- `const redisUrl = process.env.REDIS_URL` (DW-67). The ternary at `:18` already treats falsy as unset, so `?.trim()` alone suffices; no `|| undefined` needed. The module docstring `:1-8` and the block comment `:11-16` describe the key and stay accurate after the trim.
- `src/mastra/config/integrations.ts:97` -- `botToken: process.env.SLACK_APP_BOT_TOKEN` (DW-73), sitting between `:98-99` which already use `?.trim()`. `SlackIntegration.diagnostics()` returns `botTokenConfigured: Boolean(botToken)` (`node_modules/@mastra/factory/dist/integrations/slack/integration.js:88`), so a blank token is observable. Read-only context: `:35`, `:78`, `:86-87` are the deliberately-raw `stateSecret` arms; `:102` is the `??` fallback.
- `src/mastra/config/public-url.ts:13-14,19` -- docstring asserts "Exported RAW, untrimmed" and `:19` exports the raw value (DW-76). Consumers: `config/factory.ts:78` (`publicUrl` slot) and `config/integrations.ts:102-103` (`oidcRedirectBaseUrl` fallback, `uiOrigin`).
- `src/mastra/config/factory.ts:60-63` -- the `storage,` comment claiming "default storage resolution applies (local libSQL file)" (DW-70). `config/storage.ts:14-30` is the truth: the `else` arm constructs `LibSQLFactoryStorage` on `file:${getDatabasePath()}`, and its own comment there is already accurate — mirror its wording.
- `src/mastra/config/infrastructure.test.ts:199-218` -- the case pinning `REDIS_URL='   '` as configured. Must flip to "reads as unset" plus a padded-value case. `:189-197` is the existing unset/empty case.
- `src/mastra/config/factory.test.ts:181-196` -- the case pinning a whitespace-only `MASTRACODE_PUBLIC_URL` as a configured origin (asserts `config.publicUrl === '   '` and `oidcConfigured === true`). Must flip both halves.
- `src/mastra/config/integrations.test.ts:303-313` -- "passes the bot token through to the integration"; its comment calls `botToken` "the one Slack option passed through raw". `:284-301` is the absent-token negative half. `:16` in the file docstring says "two of those keys are read UNTRIMMED" (the `stateSecret` pair) — that remains true; do not change it.
- `src/mastra/config/README.md:58` (table row for `public-url.ts`, "raw and untrimmed") and `:132` ("it passes a whitespace-only value through raw") -- both assert the old behaviour.
- `apps/slack/README.md:389-399` -- the `/?slack=error` bullet; `:394` says the routes are disabled when the channels key "and `MASTRACODE_PUBLIC_URL` are both unset", which after the trim must also cover a blank `MASTRACODE_PUBLIC_URL`. `:395` cites `integrations.ts:102`.
- `.env.schema:50-55` (`REDIS_URL`) and `ops/README.md:339-351` -- read-only verification targets for DW-69; both already say "unset keeps the in-process bus". `.env.schema:57-77` (`MASTRACODE_PUBLIC_URL`) says it "Defaults to http://localhost:4111 … when unset" — also becomes more true, leave it.
- `.bmad-loop/policy.toml:3205-3269` -- the `[verify].commands` array. Guards 3240/3243/3246 count `process.env` read sites; `?.trim()` still matches their patterns, so the count is unchanged. Guard 3240 strips comment lines before reading the factory call's top-level properties, so the `storage,` comment rewrite is invisible to it.

## Tasks & Acceptance

**Execution:**
- `src/mastra/config/pubsub.ts` -- change `:17` to `const redisUrl = process.env.REDIS_URL?.trim();` -- a padded `.env` line must not dial a Redis that need not exist (DW-67); the ternary below already treats `''` as unset.
- `src/mastra/config/integrations.ts` -- change `:97` in place to `botToken: process.env.SLACK_APP_BOT_TOKEN?.trim() || undefined,` -- removes the last asymmetry in the Slack group (DW-73); `|| undefined` keeps `botTokenConfigured` false for a blank value. Do not add or remove lines above `:102`.
- `src/mastra/config/public-url.ts` -- change `:19` to `export const publicUrl = process.env.MASTRACODE_PUBLIC_URL?.trim() || undefined;` and rewrite the "Exported RAW, untrimmed" paragraph `:13-14` to say the value is trimmed and a blank one reads as unset, because `@mastra/factory` uses `??` to reach its default -- DW-76.
- `src/mastra/config/factory.ts` -- rewrite the `storage,` comment `:60-63` so the unset branch names `./storage`'s own libSQL construction instead of "default storage resolution" -- DW-70; mirror the accurate wording already in `config/storage.ts:14-19`.
- `src/mastra/config/infrastructure.test.ts` -- rewrite `:199-218` into a case asserting a whitespace-only `REDIS_URL` leaves `pubsub` undefined and logs nothing, and add a case asserting a padded URL reaches `RedisStreamsPubSub` trimmed; replace the deferred-work comment with why the trim exists -- the I/O matrix rows 1-2.
- `src/mastra/config/factory.test.ts` -- rewrite `:181-196` so a whitespace-only `MASTRACODE_PUBLIC_URL` leaves `config.publicUrl` undefined and Slack `oidcConfigured` false, and add a padded-value case asserting the trimmed origin reaches both consumers -- the I/O matrix rows 3-4.
- `src/mastra/config/integrations.test.ts` -- update the comment at `:304-307` (no longer "passed through raw") and add cases for a blank and a padded `SLACK_APP_BOT_TOKEN` -- the I/O matrix rows 5-6.
- `src/mastra/config/README.md` -- update `:58` and `:132` so neither describes `public-url.ts` as raw/untrimmed -- the directory README is the map of these modules.
- `apps/slack/README.md` -- amend `:393-396` so the disabled-routes condition covers a blank `MASTRACODE_PUBLIC_URL` alongside unset, leaving the present-and-empty `MASTRACODE_CHANNELS_PUBLIC_URL` control and the `integrations.ts:102` citation intact -- DW-76's re-reconciliation.

**Acceptance Criteria:**
- Given the whole tree after the change, when `git grep -nE "process\.env\.(REDIS_URL|SLACK_APP_BOT_TOKEN|MASTRACODE_PUBLIC_URL)" -- src` is run, then each key appears at exactly one site and each is followed by `?.trim()`.
- Given `.env.schema` and `ops/README.md`, when their `REDIS_URL` prose is re-read, then "unset keeps the in-process bus" is a true statement about the new code and neither file was modified.
- Given the repository, when `git grep -n "untrimmed\|through raw" -- src apps ops '*.md'` is run, then no surviving sentence claims `public-url.ts`, `pubsub.ts` or the Slack bot token is raw, and the only remaining "untrimmed" claims are the `stateSecret` chain ones in `integrations.ts` and `integrations.test.ts`, which are still accurate.
- Given `apps/slack/README.md:389-399`, when it is read against `integrations.ts`, then the cited line number still lands on the `??` expression and the bullet's disabling conditions match the new behaviour.

## Design Notes

Why `|| undefined` on two of the three and not on `pubsub.ts`: `public-url.ts`'s consumer chain is `??`-based (`@mastra/factory`'s `publicUrl ?? 'http://localhost:4111'`, and `integrations.ts:102`'s `MASTRACODE_CHANNELS_PUBLIC_URL ?? publicUrl`), so `''` would still count as configured; `botToken` is passed straight into an options object where `undefined` is the documented "absent" shape. `pubsub.ts` feeds a plain truthiness ternary, where `''` is already absent — adding `|| undefined` there would be noise.

The three tests being flipped were written as tripwires: each says in its comment that adding the trim should be "a visible, deliberate edit rather than a silent behaviour change". Flipping them is that edit. Keep the pattern — each rewritten case should state why the trim exists, so the next reader sees a decision rather than an accident.

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 25 findings — high 0, medium 5, low 18, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: the padded-bot-token case is vacuous — `Boolean('  slack-bot-token  ')` is true with or without the trim — Confirmed by mutation: reverting `integrations.ts` to the bare read left that case green. Patched: `integrations.test.ts` now wraps `SlackIntegration` in a recording subclass (the `importOriginal` technique `factory.test.ts` already uses) and asserts the constructor received `botToken === 'slack-bot-token'`; the same revert now fails two cases.
  - `[low]` `[patch]` blind-hunter: `|| undefined` on `botToken` was unpinned — dropping it left all 141 tests green while the test comment claimed it was load-bearing — Same root cause as the row above (no value-level observation of the constructor options); the same capture now asserts `botToken === undefined` for a blank value, and dropping `|| undefined` fails that case.
  - `[low]` `[patch]` blind-hunter: `pubsub.ts:11-16` still said "when `REDIS_URL` is set … Without `REDIS_URL` … the in-process default applies", which no longer describes a present-but-blank value — Real; the comment sits on the changed read and the bundle is about comment accuracy. Patched: "set" now means set to something non-blank, and the closing sentence covers "unset, or blank once trimmed".
  - `[low]` `[patch]` blind-hunter: `integrations.ts:97` carried no in-place reason for `?.trim() || undefined` beside two bare `?.trim()` siblings, in a file where every read-shape decision has one — Real; that missing-reason condition is what DW-67 blamed. Patched with a three-line comment; the `??` line moved to `:105` and `apps/slack/README.md`'s citation was updated to match.
  - `[low]` `[patch]` blind-hunter: `config/README.md` documented "blank reads as unset" for the `public-url.ts` row but not the `pubsub.ts` row, and the "Tests here" paragraphs were not extended — Half real: the table asymmetry is a genuine inconsistency and the row was patched; the "Tests here" paragraphs are incomplete rather than false, so they were left alone.
  - `[low]` `[reject]` blind-hunter: `.env.schema:71-72` ("Defaults to http://localhost:4111 … when unset") and `:82` were not re-reconciled for the public URL — Rejected: neither sentence is false after the change, and the intent's own DW-69 instruction is to leave such prose saying what it already says rather than documenting the old asymmetry. `.env.schema` is also on the Never list.
  - `[low]` `[reject]` blind-hunter: the `apps/slack/README.md` bullet grew a line, so this spec's `:395`/`:393-396` citations and `deferred-work.md`'s DW-76 citation now point one line off — Rejected: the only fixes are editing this build's spec or the orchestrator-owned ledger, both excluded. The bullet's substance and its `integrations.ts` citation are correct.
  - `[low]` `[patch]` blind-hunter: `factory.ts`'s new comment copied `storage.ts`'s own clause into a second file, reproducing the drift that created DW-70 — Real as a durability concern. Patched: the comment now points at `./storage` as the owner of the unset branch and drops the duplicated detail.
  - `[medium]` `[patch]` edge-case: padded bot token asserts only a boolean the untrimmed read also satisfies — Duplicate of the first row; same group, same fix.
  - `[low]` `[reject]` edge-case: a blank `REDIS_URL` now takes the unset branch with no warning — Real but negligible: the operator has to write a whitespace-only value, `DATABASE_URL` has behaved this way all along, and the proposed fix adds a raw local plus a new console branch — more than a direct correction.
  - `[low]` `[reject]` edge-case: a blank `MASTRACODE_PUBLIC_URL` collapses to `undefined` with no warning — Rejected for the same reason as the row above: same shape, same added branch.
  - `[medium]` `[defer]` edge-case: `MASTRACODE_CHANNELS_PUBLIC_URL` is still raw, so `'   '` is truthy, wins the `??`, and mounts the OIDC routes on a blank redirect base — Verified real. Pre-existing (the key was raw before this change) and excluded by the intent, which names three reads and depends on this key's rawness for the present-and-empty operator control. Recorded in `deferred`.
  - `[low]` `[reject]` edge-case: acceptance criterion 3's grep still returns `deferred-work.md` rows calling these reads untrimmed — Rejected: those rows are the historical ledger the intent forbids editing, and the criterion's target is the code plane, where the census passes. The only other fix is editing this build's spec.
  - `[low]` `[reject]` edge-case: the spec's Design Notes claim all three flipped tests were tripwires, but the bot-token comment pinned no raw behaviour — Correct as a fact; rejected because the only fix is editing this build's spec. The spec's Execution row for that file did direct "update the comment … and add cases", so nothing was mis-implemented.
  - `[medium]` `[patch]` verification-gap: the bot token's value is observed by nothing — `diagnostics()` returns only `Boolean(botToken)`, and a regression that keeps the absent-token semantics while dropping the value trim ships a padded `Authorization` header with the suite green — Pre-verified by the layer and reproduced here; same group as the first row, closed by the recording-subclass capture.
  - `[low]` `[patch]` verification-gap: `factory.test.ts`'s "trims a padded value before either consumer sees it" overreaches — `oidcConfigured` is true for the padded value too — Real. Patched: the case is retitled to name the factory slot and the comment states what the Slack assertion actually observes.
  - `[medium]` `[defer]` verification-gap: `MASTRACODE_CHANNELS_PUBLIC_URL` raw-whitespace scope note — Duplicate of the edge-case row above; same group, deferred.
  - `[low]` `[patch]` intent-alignment: `factory.js:180`'s `??` default is never executed because `MastraFactory` is mocked, so the case titled "the factory applies its own default" observes the slot, not the default — Real as a comment-accuracy point; same group as the row above. Patched: the case now says explicitly that the factory's `??` is not what it sees.
  - `[low]` `[patch]` intent-alignment: the `|| undefined` comment asserts an effect at a surface no test reaches — Duplicate of the second row; closed by the same capture.
  - `[low]` `[reject]` intent-alignment: the `REDIS_URL` tests observe a stub, not "no socket opens" — Rejected: the stub is deliberate and documented (`infrastructure.test.ts:11-15` — a real construct would hang the gate rather than fail it), and unmocking is far more than a direct correction.
  - `[low]` `[reject]` intent-alignment: nothing in `.env.schema` or `ops/README.md` records that DW-69 was deliberately closed by code — Rejected: marking it there is exactly the "document the asymmetry" move the intent declines, and the spec is the in-tree record.
  - `[false]` `[reject]` intent-alignment: DW-70's named file (`src/mastra/index.ts`) no longer holds the comment — Refuted as a defect: the entry's location is stale, the diff corrects the comment where it actually lives (`config/factory.ts`), and no "default storage resolution" claim survives outside `_bmad-output/`.
  - `[false]` `[reject]` intent-alignment: DW-73's ledger line `:102` points at a different key — Refuted as a defect: following it literally would have trimmed `MASTRACODE_CHANNELS_PUBLIC_URL`, which the intent forbids; the diff edited the bot-token read the prose names.
  - `[low]` `[reject]` intent-alignment: DW-76's `apps/slack/README.md:395` citation drifted — Duplicate of the blind-hunter citation row; rejected for the same reason.
  - `[low]` `[patch]` intent-alignment: `pubsub.ts:11-16` residual comment — Duplicate of the third row; closed by the same patch.

## Auto Run Result

Status: done

**Change.** The three untrimmed environment reads under `src/mastra/config/` now trim, so a padded `.env` line reads the same way an unset key does: `REDIS_URL` no longer constructs a `RedisStreamsPubSub` on a blank URL at module load (DW-67), `SLACK_APP_BOT_TOKEN` no longer reaches Slack padded or blank (DW-73), and `MASTRACODE_PUBLIC_URL` no longer becomes the deployment's public origin when it is whitespace (DW-76). DW-69 is closed by that code change rather than by a doc edit — `.env.schema` and `ops/README.md` already said "unset keeps the in-process bus", which is now true of a blank value too, and both files are byte-untouched. DW-70's inaccurate "default storage resolution applies" comment is corrected where the call actually lives. Every comment and doc sentence that asserted the old behaviour was rewritten, including the `apps/slack/README.md` OIDC bullet DW-76 required re-reconciling.

**Files changed.**
- `src/mastra/config/pubsub.ts` — `REDIS_URL` read trimmed; the block comment above it now says a blank value is unset too.
- `src/mastra/config/integrations.ts` — `SLACK_APP_BOT_TOKEN` read trimmed with `|| undefined`, plus an in-place reason for that shape beside its two bare-`?.trim()` siblings.
- `src/mastra/config/public-url.ts` — `MASTRACODE_PUBLIC_URL` trimmed with `|| undefined`; the "Exported RAW, untrimmed" paragraph replaced with why the downstream `??` fallbacks need `undefined`.
- `src/mastra/config/factory.ts` — the `storage,` comment now points at `./storage` as the owner of the unset branch instead of claiming the factory resolves it.
- `src/mastra/config/infrastructure.test.ts` — the `REDIS_URL` tripwire flipped to "reads as unset", plus a padded-URL case asserting the trimmed connection string and the redaction.
- `src/mastra/config/factory.test.ts` — the `MASTRACODE_PUBLIC_URL` tripwire flipped on both halves, plus a padded-origin case; both comments qualified to claim only what they observe.
- `src/mastra/config/integrations.test.ts` — a recording `SlackIntegration` subclass makes the constructor's `botToken` observable; blank and padded cases assert the value, not just the diagnostics boolean.
- `src/mastra/config/README.md` — the `pubsub.ts` and `public-url.ts` table rows and the `factory.test.ts` paragraph no longer describe these reads as raw.
- `apps/slack/README.md` — the `/?slack=error` bullet now covers a blank `MASTRACODE_PUBLIC_URL` alongside unset, with the present-and-empty channels control intact and its `integrations.ts` citation updated to `:105`.

**Review findings.** 25 findings across four layers: 6 patch entries applied (1 medium, 5 low), 1 entry deferred (medium), 12 rejected. Patched: the bot-token trim and its `|| undefined` had no value-level cover; `pubsub.ts`'s comment was stale; `integrations.ts:97` had no in-place reason; `config/README.md`'s `pubsub.ts` row lagged the `public-url.ts` row; `factory.ts` duplicated `storage.ts`'s clause; two `factory.test.ts` comments overreached. Deferred: `MASTRACODE_CHANNELS_PUBLIC_URL` is still read raw, so a whitespace-only value wins the `??` and mounts the OIDC routes on a blank base — pre-existing and excluded by the intent. Rejected, with reasons: `.env.schema`'s public-URL prose (not false; DW-69's own principle says leave it); the README bullet's line-number drift (only fixable by editing this spec or the ledger); two "warn when the key is set but blank" proposals (each adds a branch for a case an operator is unlikely to meet); acceptance-criterion 3's grep hitting the historical ledger; the Design Notes' "three tripwires" phrasing; the Redis stub not proving "no socket opens" (deliberate — a real construct would hang the gate); no in-schema marker that DW-69 was closed by code (that marker is the asymmetry the intent declines to document); and two intent-alignment observations about stale ledger locations, both refuted as defects since the diff fixes each concern where it actually lives.

**Follow-up review recommended:** false — one medium entry was patched and no high; the patched medium is now mutation-verified red in both directions, so nothing unverified remains from this pass.

**Verification.** `npm run check` exit 0. `npm test` 8 files / 141 tests passed. `npm run build` succeeded. All 63 `[verify].commands` in `.bmad-loop/policy.toml:3205-3269` executed with 0 failures (`npm ci` skipped — dependencies installed from the same lockfile at the start of the run), including the read-site censuses at lines 3240, 3243 and 3246. `git grep -nE "process\.env\.(REDIS_URL|SLACK_APP_BOT_TOKEN|MASTRACODE_PUBLIC_URL)" -- src` returns exactly three matches, one per key, each with `?.trim()`. `git diff --stat` against the baseline for `.env.schema` and `ops/README.md` is empty. Mutation-checked after the patch round: reverting the bot-token read fails 2 cases, dropping only its `|| undefined` fails 1; both were green before the patch. `apps/slack/README.md:396`'s `integrations.ts:105` citation verified against the file.

**Residual risks.** The deferred `MASTRACODE_CHANNELS_PUBLIC_URL` whitespace case is the last read in that `??` expression that behaves the old way, and the README bullet this change amended now describes blank-as-unset for the other half — a reader could assume both keys behave alike. Separately, `@mastra/factory`'s own `publicUrl ?? 'http://localhost:4111'` is never executed by any test here (the factory is mocked), so the consequence of a blank origin is reasoned from `node_modules`, not observed; the read-site census is what keeps both consumers on the one export.

## Verification

**Commands:**
- `npm run check` -- expected: exit 0, no type errors.
- `npm test` -- expected: exit 0, every case green; the three rewritten cases assert the new behaviour.
- `git grep -nE "process\.env\.(REDIS_URL|SLACK_APP_BOT_TOKEN|MASTRACODE_PUBLIC_URL)" -- src` -- expected: exactly three matches, one per key, each with `?.trim()`.
- `git diff --stat -- .env.schema ops/README.md` -- expected: empty output (DW-69 is closed by the code change, not by a doc edit).
- Run the `[verify].commands` list in `.bmad-loop/policy.toml:3205-3269` -- expected: every command exits 0, in particular the read-site censuses at lines 3240, 3243 and 3246.
