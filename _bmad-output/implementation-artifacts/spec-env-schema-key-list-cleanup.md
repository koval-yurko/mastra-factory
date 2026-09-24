---
title: 'env-schema key-list cleanup: deprecated patterns, a dead key, four undeclared keys, and an unconstrained image tag'
type: 'chore'
created: '2026-09-25'
status: 'done'
baseline_revision: 'ad5e449be8e234558a7ff57f77d0761c308e3d42'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      Two enum declarations reject the bare, unquoted values README.md tells the operator to
      write, so a .env following the documented instruction refuses to boot.
    evidence: |-
      Measured on this tree with a temporary .env holding `MASTRACODE_DISTRIBUTED_LOCK=0` and
      `VITE_REACT_GRAB=true`: `npx varlock load --format json` exits 1 and names both keys.
      varlock coerces an unquoted .env number/boolean before enum validation, and these two
      declarations list only the quoted members — `enum("", "0", "1")` at .env.schema:542 and
      `enum("", "true")` at :557 — unlike MASTRA_PLATFORM_GITHUB_POLLING_ENABLED (:201) and
      MASTRACODE_GITHUB_RECONCILE_ENABLED (:385), which list the bare forms alongside and
      carry the comment explaining why. README.md:283 tells the operator `0` is the value for
      a single process with no database. Pre-existing and untouched by this change: the diff
      does not touch either declaration (`git diff <baseline> -- .env.schema | grep -c
      'DISTRIBUTED_LOCK\|VITE_REACT_GRAB'` returns 0). Fix is to add the bare members to both
      enums, the way the two working keys already do.
    location: >-
      .env.schema:542 (MASTRACODE_DISTRIBUTED_LOCK), .env.schema:557 (VITE_REACT_GRAB)
    severity: medium
  - summary: >-
      Nine further environment keys that @mastra/factory reads are declared in neither
      .env.schema nor .env.example — the same defect class DW-43 named, for other families.
    evidence: |-
      `grep -rhoE 'process\.env\.MASTRACODE_[A-Z0-9_]+' node_modules/@mastra/factory/dist`
      filtered against `^KEY=` in .env.schema returns, undeclared:
      MASTRACODE_EXPERIMENTAL_SUBCONSCIOUS, MASTRACODE_INCIDENT_IO_RECONCILE_ENABLED,
      MASTRACODE_INCIDENT_IO_RECONCILE_INTERVAL_MS,
      MASTRACODE_PLATFORM_GITHUB_{PR,ISSUE}_RECONCILE_{ENABLED,INTERVAL_MS} and
      MASTRACODE_PLATFORM_GITHUB_RECONCILE_INTERVAL_MS,
      MASTRACODE_PLATFORM_LINEAR_POLLING_ENABLED. Pre-existing: DW-43 scoped this story to the
      four MASTRACODE_GITHUB_*RECONCILE* keys, and all seven MASTRACODE_GITHUB_* names in the
      package are now declared. Gate command 26 only censuses first-party `src/` reads, so
      package-read keys are invisible to it and this class does not self-report. Deciding
      each one is a schema decision (@public, sensitivity, type) of the kind AD-6 assigns to
      the owning subject, and the MASTRACODE_PLATFORM_GITHUB_* set in particular needs the
      README.md-vs-apps/github/README.md ownership call the two confusable families already
      forced once.
    location: >-
      .env.schema, .env.example
    severity: low
---

<intent-contract>

## Intent

**Problem:** Four defects sit in `.env.schema`'s declarations (DW-30, DW-34, DW-43, DW-82): three keys still carry the `@type=string(matches="…")` form varlock deprecates, and `varlock` is pinned `^1.9.0`, so the major that stops reading a string as a regex is one routine update away — the constraints would then silently admit any value; `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` is fully typed and `@public` while nothing reads it, so it reads as a live switch that does nothing; four `MASTRACODE_GITHUB_*RECONCILE*` per-sweep override keys that `@mastra/factory` reads are declared in neither `.env.schema` nor `.env.example`; and `FACTORY_SANDBOX_IMAGE` carries no type constraint, so the tag actually run can be `factory-sandbox:latest` even though NFR19's no-`latest` rule is gate-enforced on the Dockerfile's `FROM` and on the docs' commands.

**Approach:** One pass over `.env.schema` and its `.env.example` mirror: substitute `regex("…")` for each deprecated string pattern, delete the dead key, declare the four GitHub overrides beside the legacy pair exactly as Story 5.2 declared their four Linear twins, and constrain `FACTORY_SANDBOX_IMAGE` to the date-stamped form `sandbox/README.md` already documents. Every declared key must stay claimed by exactly one owned-keys README, so the two README tables move with the schema.

## Boundaries & Constraints

**Always:**
- Mirror every addition and deletion into `.env.example` **at the same position** — gate command 28 compares both key lists for identity *and* order. `.env.example` mirrors the prose comments and the `# KEY=` line only; it never carries the `# @public` / `# @type=` decorator lines.
- Keep the ownership partition total: every key `.env.schema` declares is claimed by exactly one `## Keys this subject owns` table across the six owned-keys READMEs, and every claimed key is declared.
- Keep blank a valid value for `FACTORY_SANDBOX_IMAGE`: `README.md:166` and `sandbox/README.md:222` both record that with the key blank the *first session* refuses to start and the error names the key. A constraint that rejects blank would move that failure to boot and contradict both files.
- Declare the four GitHub override keys **unrestricted** (`# @public`, no `@type`). `github/reconciliation-config.js` falls through an unrecognised value to the legacy name and then to the default; a type that fails `varlock load` would refuse a value the package tolerates.

**Never:**
- Do not write `@required`, `@public`, `@sensitive`, `@type=`, `fails the pattern` or `varlock load` into any of the six owned-keys READMEs — gate command 31 greps for exactly those and AD-6 puts the mechanism on the schema side.
- Do not retype the legacy pair `MASTRACODE_GITHUB_RECONCILE_ENABLED` / `_INTERVAL_MS`, beyond the `regex()` substitution DW-30 names; their existing types are out of scope.
- Do not touch the deferred-work ledger or `sprint-status.yaml`.
- Do not constrain `FACTORY_SANDBOX_IMAGE` to a bare `YYYY-MM-DD` tag: `sandbox/README.md:322` tells the operator to suffix a same-day rebuild (`factory-sandbox:2026-09-23b`), and that form must stay valid.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Deprecation gone | `npx varlock load --format json` on the edited schema | Exits 0 and prints no "string patterns are deprecated" warning for any key | No error expected |
| Image tag pinned | `FACTORY_SANDBOX_IMAGE=factory-sandbox:2026-09-23` | Accepted | No error expected |
| Same-day rebuild | `FACTORY_SANDBOX_IMAGE=factory-sandbox:2026-09-23b` | Accepted | No error expected |
| Image tag unset | `FACTORY_SANDBOX_IMAGE=` (blank) | Accepted; the refusal stays at first-session start | No error expected |
| Moving tag refused | `FACTORY_SANDBOX_IMAGE=factory-sandbox:latest` | `varlock load` fails naming the key | Boot refused rather than a silent moving tag |
| Untagged refused | `FACTORY_SANDBOX_IMAGE=factory-sandbox` | `varlock load` fails naming the key | Same |
| Interval still checked | `MASTRACODE_MAX_SANDBOXES=abc` | `varlock load` fails, as it does today | Same behaviour through `regex()` as through the string form |

</intent-contract>

## Code Map

- `.env.schema` -- the only list of environment keys (AD-6). Five edit sites: `:205` `MASTRA_PLATFORM_GITHUB_POLLING_INTERVAL_MS` and `:397` `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` both carry `@type=string(matches="^(|[1-9][0-9]*)$")`; `:512` `MASTRACODE_MAX_SANDBOXES` carries `^(|[0-9]+)$`; `:295-303` is the `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` comment block and declaration; `:482-483` is `FACTORY_SANDBOX_IMAGE`, `# @public` with no type. Insertion point for the four new keys: after `:398`, before the `MASTRACODE_GITHUB_AUTHORIZED_BOTS` block at `:399-403`.
- `.env.example` -- operator copy; `:256-265` mirrors the `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` block, `:341-353` mirrors the GitHub reconcile block, `:428` is `# FACTORY_SANDBOX_IMAGE=`.
- `.env.schema:440-455` + `.env.example:390-401` -- **the pattern to copy**: Story 5.2's four Linear twins, one shared prose paragraph then four `# @public` / key pairs, with the decorator lines absent on the example side.
- `apps/github/README.md:28-38` -- owned-keys table; add four rows beside the legacy pair at `:35-36`. `:379-394` is the "Reconcile sweep" section, whose sentence "Those override keys are declared in no schema here and setting them is not part of this deployment." becomes false once they are declared and must be rewritten.
- `apps/linear/README.md:29-32` and `:370-377` -- the twin README treatment to match: four table rows plus a `| Name | Effect |` table in the sweep section.
- `README.md:262` (table row) and `:282` (the "legacy" bullet) -- the only two claims on `MASTRACODE_BOOTSTRAP_PERSONAL_ORG`; both must go with the declaration.
- `node_modules/@mastra/factory/dist/integrations/github/integration.js:1006-1014` (read-only) -- reads all four override keys; `…/github/reconciliation-config.js` (read-only) shows an unrecognised value falling through silently, which is why the four stay untyped.
- `node_modules/varlock/dist/env-graph-w5M1iF_W.mjs:5570-5585` (read-only) -- the accepted form is `matches=regex("<source>")`, pattern source only; a `/…/`-wrapped argument is rejected outright.
- `.bmad-loop/policy.toml:2393-2452` (read-only) -- the 55 verify commands; by 1-based index into `[verify].commands`, **25** is the ownership partition, **26** first-party reads ⊆ declared, **27** the same-keys-same-ORDER check, **30** the restatement line, **47** the docs' no-`latest` rule (docs only — this spec closes the declaration half).

## Tasks & Acceptance

**Execution:**
- `.env.schema` -- replace `matches="…"` with `matches=regex("…")` at `:205`, `:397` and `:512`, keeping each pattern source byte-identical -- closes DW-30 before the pinned `^1.9.0` major changes how a string is read.
- `.env.schema` -- delete the `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` declaration and its whole comment block -- closes DW-34; a typed, `@public` declaration reads as a live switch that nothing consults.
- `.env.schema` -- after `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS`, insert `MASTRACODE_GITHUB_PR_RECONCILE_ENABLED`, `MASTRACODE_GITHUB_ISSUE_RECONCILE_ENABLED`, `MASTRACODE_GITHUB_PR_RECONCILE_INTERVAL_MS` and `MASTRACODE_GITHUB_ISSUE_RECONCILE_INTERVAL_MS`, each `# @public` with no type, under one shared prose paragraph shaped like the Linear block -- closes DW-43.
- `.env.schema` -- constrain `FACTORY_SANDBOX_IMAGE` with `@type=string(matches=regex("^(|factory-sandbox:[0-9]{4}-[0-9]{2}-[0-9]{2}[A-Za-z0-9._-]*)$"))` and extend its comment to say what the pattern admits and that blank still reaches the code -- closes DW-82 by putting NFR19's no-`latest` rule on the tag actually run.
- `.env.example` -- mirror all four schema changes at the same positions, prose comments included and decorator lines excluded -- gate command 28 compares key identity and order.
- `README.md` -- delete the `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` table row at `:262` and its name from the legacy bullet at `:282`, leaving the three `WORKOS_*` names -- a claim on an undeclared key fails the ownership partition.
- `apps/github/README.md` -- add the four override keys to the owned-keys table, and rewrite the Reconcile sweep paragraph that calls them undeclared, giving them a `| Name | Effect |` table like `apps/linear/README.md:370-377` -- keeps the partition total and the prose true, without naming a sigil.

**Acceptance Criteria:**
- Given the edited schema, when `npx varlock load --format json` runs, then it exits 0 and its output contains no "string patterns are deprecated" text.
- Given the edited tree, when the full verify gate runs, then every command passes — in particular 25 (ownership partition), 26 (first-party reads), 27 (same keys, same order) and 30 (restatement line).
- Given `.env.schema`, when it is searched for `matches="`, then there are no matches, and `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` appears nowhere in the repository outside `_bmad-output/` and `.bmad-loop/`.
- Given `.env.schema`, when the four `MASTRACODE_GITHUB_{PR,ISSUE}_RECONCILE_{ENABLED,INTERVAL_MS}` keys are looked up, then each is declared `# @public` with no `@type`, and each appears once in `.env.example` at the same relative position and once in `apps/github/README.md`'s owned-keys table.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 28 findings — high 0, medium 3, low 20, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` blind-hunter: the four new per-sweep keys are untyped while the legacy pair two lines above is typed — the intent names the four Linear twins as the model and `.env.schema:454-463` declares those `# @public` with no type; typing these would make `varlock load` refuse a value `github/reconciliation-config.js:3-15` tolerates by falling through, a harsher outcome than the one reported.
  - `[false]` `[reject]` blind-hunter: `apps/github/README.md:43` "declares and validates every key in that table" is now false — the identical sentence stands at `apps/linear/README.md:34` over four deliberately unrestricted keys and at `sandbox/README.md:33`; it locates declaration and validation in the schema, it does not assert that every key carries a type.
  - `[low]` `[patch]` blind-hunter: the owned-keys row for the issue interval says "the issue cycle follows the pull-request one", true only when the legacy interval is unset — reworded to name the legacy interval first and the pull-request-effective one second.
  - `[low]` `[reject]` blind-hunter: the shared prose block attaches to only the first of the four keys, leaving three with no description — the Linear block the intent names as the model has the identical shape; diverging from it costs more than it gains.
  - `[medium]` `[defer]` blind-hunter: deleting the BOOTSTRAP block loses the unquoted-value coercion record and two live enums reject their bare forms — the "only record" half is refuted (the note survives at `.env.schema:201` and `:385`), but the enum half reproduces: with a temporary `.env`, `MASTRACODE_DISTRIBUTED_LOCK=0` and `VITE_REACT_GRAB=true` both fail. Pre-existing and untouched by this diff; deferred with the measurement.
  - `[low]` `[reject]` blind-hunter: the tag pattern admits `factory-sandbox:2026-09-23-latest` and `factory-sandbox:9999-99-99` — a tag literally named `…-latest` is not docker's moving `latest` and is no more re-pointable than the date tag itself, which `sandbox/README.md:322` says is re-pointed on a same-day rebuild; ranging the date adds regex complexity for no guarantee. The comment's over-absolute wording was real and is patched below.
  - `[low]` `[reject]` blind-hunter: the pattern rejects digest pins and registry-qualified references — it matches exactly what `sandbox/README.md:81-82` states the value must contain (a local-store `factory-sandbox:YYYY-MM-DD`), which AD-6 makes the record; broadening it without moving that record is the wrong half of the pair to edit.
  - `[low]` `[patch]` blind-hunter: `sandbox/README.md`, the AD-6 owner, was not told that a malformed non-blank value now stops the server — added to the key's section and to the session-failure list, on the consequence side of the restatement line.
  - `[low]` `[patch]` blind-hunter: `README.md` step 6 describes only the blank-value failure — added the tag-typo case beside it.
  - `[low]` `[defer]` blind-hunter: nine further package-read keys remain undeclared — reproduced by grep; pre-existing, outside DW-43's named set, and each needs its own ownership and sensitivity call. Deferred.
  - `[low]` `[reject]` edge-case: a registry- or namespace-qualified reference is refused and the server will not boot — same finding as the digest-pin one above, rejected on the same record.
  - `[false]` `[reject]` edge-case: an arbitrary trailing suffix such as `-latest` still passes — refuted with the moving-tag reasoning above; the suffix class exists for the documented same-day rebuild.
  - `[low]` `[reject]` edge-case: `factory-sandbox:9999-99-99` is accepted as date-stamped — real but negligible; a nonsense date is still a fixed, rollback-able tag, and ranging the date is more than a direct correction.
  - `[low]` `[patch]` edge-case: the constraint binds only the `varlock run --` path, so `npm run dev` (`mastra factory dev`, no varlock — confirmed in `package.json`) still takes any value — the comment's guarantee was reworded in both env files to say what is accepted and on which path it is checked.
  - `[low]` `[reject]` edge-case: `leaseTtlMs = max(30s, min(intervalMs, issueIntervalMs) * 3)` couples the two halves, so "paced on its own" overstates — each sweep keeps its own next-run time (`#nextPullRequestReconcileAt` / `#nextIssueReconcileAt`); the lease TTL is an internal derived value and documenting it is scope the operator has no lever on.
  - `[low]` `[defer]` edge-case: the five `MASTRACODE_PLATFORM_GITHUB_*` per-sweep keys are undeclared — same entry as the nine-key defer above.
  - `[false]` `[reject]` edge-case: after the deletion a stale `.env` line passes through untyped with nothing explaining it — deletion is what DW-34 directs, and an undeclared key in `.env` is ignored rather than an error (measured), so nothing breaks for an operator who left the line.
  - `[low]` `[patch]` edge-case: "otherwise the legacy name applies, otherwise the default" skips a link for the issue interval — confirmed at `integration.js:1014` then `reconcile-worker.js:35-36` (`issueIntervalMs ?? intervalMs`); same entry as the owned-keys row above, both wordings corrected.
  - `[medium]` `[patch]` verification-gap: no gate command supplies a value for `FACTORY_SANDBOX_IMAGE`, so deleting the `@type=` line leaves the whole gate green and reinstates DW-82 — appended gate command 56, which runs the five-value matrix as process-environment overrides. Mutation-tested: fails on both bad values with the decorator removed, passes as committed.
  - `[medium]` `[patch]` verification-gap: varlock prints the deprecation only inside its invalid-configuration report, so a valid config loads identically before and after the `regex()` migration and the deprecated spelling can return unnoticed — appended gate command 57, which fails on any `matches="` in `.env.schema`. Mutation-tested: fails naming line 525 when one site is reverted, passes as committed.
  - `[low]` `[reject]` verification-gap (other): a quoted whitespace-only value now fails at startup, where `src/mastra/config/sandbox.test.ts:228-236` expects the code's own named error — the two surfaces never meet and both still hold; varlock trims an unquoted `.env` value, which is the spelling `README.md` tells the operator to write, so tolerating padding in the pattern buys nothing.
  - `[low]` `[patch]` intent-alignment 3a: the intent's expectation lives at "the tag actually run" while the change lives at the declaration, which binds only the `npm start` path — same entry as the `npm run dev` patch above; the comment no longer claims more than that.
  - `[low]` `[reject]` intent-alignment 3b: the sandbox tests exercise a surface the change does not reach — same as the whitespace finding; gate command 56 now supplies the regression cover those tests cannot.
  - `[low]` `[reject]` intent-alignment 3c: reading A2 refuses forms reading A1 allows — rejected on the `sandbox/README.md` record, as above.
  - `[low]` `[patch]` intent-alignment 3d: the record surface was updated for DW-43 but not for DW-82 — same entry as the `sandbox/README.md` patch above.
  - `[low]` `[reject]` intent-alignment 3e: typing asymmetry inside the GitHub block — same as the first finding, rejected on the intent's naming of the Linear twins.
  - `[false]` `[reject]` intent-alignment 3f: the ordering check is the 23rd entry, not the 27th — refuted by running the array: my own indexed run prints 25 = ownership partition, 26 = first-party reads, 27 = same-keys-same-ORDER, 30 = restatement line, matching the corrected Code Map.
  - `[false]` `[reject]` intent-alignment 3g: the spec file is outside the reviewed patch — deliberate; the review diff excludes the spec and the policy file so reviewers judge the product, and both are committed with the change.

### 2026-09-25 — Review pass (follow-up)
- verdicts: 31 findings — high 0, medium 6, low 23, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind-hunter: gate command 57 greps only the double-quoted `matches="`, and varlock reads a single-quoted string as a pattern identically — reproduced: rewriting `.env.schema:527` as `matches='^(|[0-9]+)$'` leaves 57 at rc=0 and `varlock load` at rc=0, the exact DW-30 regression 57 was appended to stop. Appended gate command 58, a quote-agnostic check for `matches=` followed by a double quote, single quote or backtick, with a `matches=regex(` vacuity sentinel. Mutation-tested: 57 passes on the single-quoted mutation and 58 fails naming line 527; both pass as committed. 57 itself is left alone — `[verify].commands` is append-only.
  - `[medium]` `[patch]` blind-hunter: nothing regression-covers the three constraints this diff migrated; command 56 exercises only `FACTORY_SANDBOX_IMAGE` and 57 only the spelling — reproduced: replacing the `MASTRACODE_MAX_SANDBOXES` pattern with a permissive one leaves all 57 commands green and `=abc` loading cleanly. Appended gate command 59, which runs `KEY=abc` (must exit non-zero naming the key) and `KEY=5` (must exit 0, which also proves the override reached the schema) for all three migrated keys. Mutation-tested: fails on the permissive pattern, passes as committed.
  - `[low]` `[patch]` blind-hunter: `README.md:166` and `sandbox/README.md:233` overclaim what the pattern catches — a wrong-date tag (`factory-sandbox:2026-09-24`) is the commonest typo, is date-stamped, passes the schema, and still fails at the first session. Both passages reworded from "typo"/"mistyped" to "of the wrong shape", each with a sentence sending the right-shape-wrong-image case to the registry bullet at `sandbox/README.md:246-252`.
  - `[low]` `[patch]` blind-hunter: `.env.example` said the check "is applied on the `npm start` path, which reads this file" — nothing reads `.env.example`. Reworded in both env files to "reads `.env` against `.env.schema`", which is true of each and keeps the two mirrored.
  - `[low]` `[patch]` blind-hunter: the env-file shared paragraph states a two-link fallback while `apps/github/README.md` documents three for the issue interval — two records of one fact disagreeing. Added "with one link more than that for the issue interval" to both env files, leaving the README as the record of the chain it already points at.
  - `[low]` `[reject]` blind-hunter: the four new keys are untyped while the legacy pair above is typed — carried from the 2026-09-25 pass, same claim at the same location, code unchanged; rejected there on the intent's naming of the Linear twins as the model.
  - `[medium]` `[defer]` blind-hunter: the BOOTSTRAP deletion loses the numeric-coercion record and two enums reject their bare forms — carried from the 2026-09-25 pass; already recorded in `deferred` (and as DW-102), whose fix — adding the bare members to both enums — covers the refinement that the surviving notes at `:201`/`:385` cover booleans only. Not deferred a second time.
  - `[low]` `[patch]` blind-hunter: the Effect table gives an effect only to `false`, omitting that `true` re-enables a half when the legacy key is `false` — confirmed at `reconciliation-config.js:3` (`parseOptionalBoolean(child) ?? parseOptionalBoolean(legacy) ?? true`). Row extended to cover `true`, and a closing sentence added naming run-one-half-only as what the pair adds.
  - `[low]` `[patch]` blind-hunter: the owned-keys row for the issue interval states a chain in a column whose siblings state resolved values, never saying the issue cycle is also hourly here — row now leads with "the issue cycle is an hour too" and keeps the chain behind it.
  - `[low]` `[patch]` blind-hunter: "anything else unrecognised falls back to …" is garbled, and "a positive whole number of milliseconds" is looser in practice (`Number()` takes `1e3`, `0x3e8`) — the garble is fixed in the reworded enable row. The `Number()` half is rejected: the only fixes are typing the keys, which the intent's Always list forbids, or a caveat about spellings no operator writes.
  - `[low]` `[reject]` blind-hunter: gate 56's ok-branch mis-attributes an unrelated load failure to `FACTORY_SANDBOX_IMAGE`, and its blank row cannot self-demonstrate the override — both real, but command 1 (`npx varlock load`) fails first on any broken `.env`, so the gate never reaches 56 in that state; the in-place fix is barred by the append-only rule and duplicating the whole matrix to correct one message is more than a direct correction.
  - `[medium]` `[patch]` edge-case: `.bmad-loop/policy.toml:2450` misses the single-quoted spelling — same entry as the first finding; closed by appended command 58.
  - `[low]` `[reject]` edge-case: `.bmad-loop/policy.toml:2449`'s ok branch blames this declaration for any non-zero exit — same entry as the gate-56 finding above, rejected on the same reasoning.
  - `[low]` `[reject]` edge-case: an interval override written `0x10`, `1e3` or `3600000.0` reaches `Number()` and yields an unintended sweep — real but negligible, and the proposed fix (typing the two per-sweep interval keys) is what the intent's Always list forbids, because the package tolerates the value by falling through.
  - `[low]` `[patch]` edge-case: `FALSE` and a padded ` false ` do switch a half off, because `parseOptionalBoolean` trims and lowercases — confirmed in `reconciliation-config.js:9-15`; the paragraph now says the match is made after trimming and lowercasing.
  - `[low]` `[reject]` edge-case: a quoted or space-padded image value is refused though `src/mastra/config/sandbox.ts` trims — carried from the 2026-09-25 pass, same claim at `.env.schema:496`, code unchanged.
  - `[low]` `[patch]` edge-case: `.env.example` names itself as the file `npm start` reads — same entry as the fourth finding above.
  - `[low]` `[patch]` edge-case (claim): "varlock is pinned `^1.9.0`, so the major is one routine update away" is false — `^1.9.0` resolves below 2.0.0, so no `npm ci`/`npm update` crosses it. Command 57's message carries the overstatement and is frozen by the append-only rule; appended command 58 states the mechanism correctly ("not a routine install … but the varlock major, whenever an explicit range bump brings it in"), so the accurate rationale is the one a future reader meets alongside the wider check. The same overstatement in the Intent block is not touched — a finding whose fix edits this build's spec.
  - `[low]` `[patch]` edge-case (claim): `npm run dev` is bare `mastra factory dev`, so `factory-sandbox:latest` still runs unblocked there — carried from the 2026-09-25 pass, which patched all four surfaces to say exactly that; the wording survives this pass's `.env` rewording.
  - `[medium]` `[patch]` verification-gap: the `regex()` migration is pinned by spelling only, not behaviour — same entry as the second finding; closed by appended command 59.
  - `[medium]` `[patch]` verification-gap: the deprecated-spelling guard only catches the double-quoted form — same entry as the first finding; closed by appended command 58.
  - `[low]` `[reject]` verification-gap: the blank row of command 56's matrix asserts nothing, because varlock does not validate an empty value at all — verified and true, but it means blank stays valid however the pattern is later tightened, so the row can never regress and nothing is at risk; filed as defer, rejected instead because the entry is caused by this story and grades `low` with no bad outcome.
  - `[low]` `[reject]` verification-gap (other): the leading `(|…)` alternative is inert — same entry as the blank-row finding; the schema comment's claim that blank is accepted remains true, only the stated reason is belt-and-braces.
  - `[low]` `[patch]` verification-gap (other): command 57's message overstates what the `package.json` range picks up — same entry as the `^1.9.0` claim above.
  - `[low]` `[reject]` intent-alignment (a): the intent's "Deprecation gone" matrix row is vacuous, since varlock prints the warning only inside its invalid-configuration report and the row passed before the change too — true, and already compensated by commands 57 and 58; the only fix is to edit this build's spec.
  - `[low]` `[reject]` intent-alignment (b): the `npm start`/`npm run dev` lifecycle claim now stated in four files is tested nowhere, so wrapping `dev` in varlock would silently falsify all four — the claim is true today; a new gate command reading `package.json` scripts is new machinery for a change nobody is proposing.
  - `[low]` `[reject]` intent-alignment (c): the pattern admits `factory-sandbox:2026-09-23-latest` and `9999-99-99` and refuses registry-qualified references — carried from the 2026-09-25 pass, rejected there on the `sandbox/README.md` record that AD-6 makes authoritative.
  - `[false]` `[reject]` intent-alignment (d): `README.md:156`'s copy-paste block `FACTORY_SANDBOX_IMAGE=factory-sandbox:<YYYY-MM-DD>` is now rejected at boot — it is a placeholder the step tells the operator to fill in, and failing at startup with an error naming the key is earlier and louder than the session-start failure it replaces; `README.md:166` and the step's own checkpoint both describe it.
  - `[low]` `[reject]` intent-alignment (e): the new `apps/github/README.md` prose pins claims to line numbers inside a versioned dependency with no guard — the pre-existing text in the same section already cites `reconcile-worker.js:35` and `:5`; this is the file's established convention, and a guard over it is a separate piece of machinery.
  - `[false]` `[reject]` intent-alignment (f): the diff takes the README "Never" list narrowly while taking the prose obligations broadly — gate command 30's own message permits a README to say what goes wrong and what the operator sees, which is all the `sandbox/README.md` addition does; the mechanism words stay on the schema side and the gate passes.
  - `[low]` `[reject]` intent-alignment (g): the Intent block cites gate commands 28 and 31 where the array has 27 and 30 — correct (the Code Map was fixed last pass and the Intent block was not), but the fix is to edit this build's spec.

## Design Notes

`regex()` takes the pattern **source**, with flags as a separate second argument; a `/…/`-wrapped argument throws rather than being stripped (`env-graph-w5M1iF_W.mjs`, `assertUnwrappedRegexSource`). So the substitution is mechanical — wrap the existing quoted source, change nothing inside it:

```
# before
# @public @type=string(matches="^(|[1-9][0-9]*)$")
# after
# @public @type=string(matches=regex("^(|[1-9][0-9]*)$"))
```

The `FACTORY_SANDBOX_IMAGE` pattern is derived from what `sandbox/README.md` already states the value must contain — `factory-sandbox:YYYY-MM-DD`, "Never `latest`" — with the trailing `[A-Za-z0-9._-]*` covering the documented same-day suffix. The leading `(|…)` alternative is what keeps blank valid, the same shape `MASTRACODE_MAX_SANDBOXES` uses for its own documented blank case.

## Verification

**Commands:**
- `npm ci --no-audit --no-fund` -- expected: completes; `node_modules/` is absent in this worktree and every later command needs it.
- `npx varlock load --format json` -- expected: exit 0, and no "string patterns are deprecated" and no "use regex() instead" anywhere in stdout or stderr.
- `grep -n 'matches="' .env.schema` -- expected: no output.
- `grep -rn MASTRACODE_BOOTSTRAP_PERSONAL_ORG . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_bmad-output --exclude-dir=.bmad-loop` -- expected: no output.
- One `npx varlock load --format json` run per I/O matrix row, with the row's value supplied as a process-environment override, each run's exit status and message recorded -- expected: exit 0 for `factory-sandbox:2026-09-23`, `factory-sandbox:2026-09-23b` and blank; non-zero naming `FACTORY_SANDBOX_IMAGE` for `factory-sandbox:latest` and for bare `factory-sandbox`; non-zero naming `MASTRACODE_MAX_SANDBOXES` for `abc`. Confirm first that a process-environment override actually reaches the schema, so a passing row cannot be a value that was never read.
- Run every command in `.bmad-loop/policy.toml` `[verify].commands` in order -- expected: all pass, including `npm run check`, `npm test` and `npm run build`.

## Auto Run Result

Status: done
Blocking condition: none

**Implemented change.** `.env.schema` and its `.env.example` mirror close DW-30, DW-34, DW-43 and DW-82 in one pass: the three deprecated `matches="…"` patterns become `matches=regex("…")` with their sources byte-identical, the dead `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` declaration and comment block are deleted, the four `MASTRACODE_GITHUB_{PR,ISSUE}_RECONCILE_{ENABLED,INTERVAL_MS}` overrides are declared `# @public` with no type under one shared paragraph shaped like the Linear block, and `FACTORY_SANDBOX_IMAGE` is constrained to the date-stamped form with blank still valid. The ownership partition moves with the schema, and four gate commands (56–59) now hold the parts varlock's own output cannot report.

**Files changed.**
- `.env.schema` — three `regex()` substitutions, the dead key deleted, four GitHub overrides declared, `FACTORY_SANDBOX_IMAGE` typed and its comment extended.
- `.env.example` — the same four changes mirrored at the same positions, prose only, no decorator lines.
- `README.md` — the `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` row and legacy-bullet name removed; the sandbox-image paragraph now separates the wrong-shape failure (startup) from the right-shape-wrong-image one (first session).
- `apps/github/README.md` — four owned-keys rows, and a Reconcile-sweep rewrite replacing the now-false "declared in no schema here" sentence with a `| Name | Effect |` table and the fallback chains.
- `sandbox/README.md` — the startup-failure case added to the key's section and to the session-failure list, each pointing the right-shape-wrong-image case at the registry bullet.
- `.bmad-loop/policy.toml` — four appended gate commands: 56 (the five-value `FACTORY_SANDBOX_IMAGE` matrix), 57 (no double-quoted `matches=`), 58 (no quoted string passed to `matches` in any quoting), 59 (the three migrated constraints still reject `abc` and still accept `5`).

**Review findings — follow-up pass.** 31 findings across four layers: high 0, medium 6, low 23, false 2, maybe-false 0.
- Patched, 8 entries — 2 medium, 6 low. Medium: the quote-agnostic deprecation guard (command 58) and the behavioural cover for the three migrated constraints (command 59), both mutation-tested. Low: the "typo" overclaim in `README.md` and `sandbox/README.md`; `.env.example` naming itself as the file `npm start` reads; the two-link-vs-three-link fallback disagreement between the env files and `apps/github/README.md`; the Effect table omitting what `true` does and how the value is matched; the owned-keys row for the issue interval not stating its resolved value; and the `^1.9.0` urgency claim, stated correctly in command 58 since command 57 is frozen by the append-only rule.
- Deferred, 0 new. The BOOTSTRAP-deletion/bare-enum finding is carried from the previous pass and already recorded in `deferred` and as DW-102; it is not deferred again.
- Rejected, with reasons recorded per row in the triage log above: 5 carried rejects from the previous pass (untyped per-sweep keys, the tag pattern's admitted and refused forms, the padded-value case); 2 `false` (the `README.md` step-6 placeholder, which now fails earlier and louder with the key named; the narrow-Never/broad-prose tension, which gate 30 explicitly permits); 4 findings whose only fix edits this build's spec (the vacuous "Deprecation gone" matrix row, the Intent block's gate numbers 28/31 for 27/30); the `Number()` looseness of the interval keys and gate 56's ok-branch misattribution, both blocked by an intent boundary or by the append-only rule and negligible in practice; the inert `(|…)` alternative, which cannot regress because varlock does not validate empty values at all; the untested `npm start`/`npm run dev` lifecycle claim and the dependency line numbers in `apps/github/README.md`, each needing new guard machinery for a change nobody is proposing.

**Verification performed.**
- All 59 `[verify].commands` run in order: every one exits 0, including `npm ci`, `npm run check`, `npm test` and `npm run build`.
- `npx varlock load --format json`: exit 0, zero occurrences of "deprecat" in stdout or stderr.
- `grep -n 'matches="' .env.schema`: no output. `grep -rn MASTRACODE_BOOTSTRAP_PERSONAL_ORG` outside `node_modules`, `.git`, `_bmad-output` and `.bmad-loop`: no output.
- The full I/O matrix as process-environment overrides: `factory-sandbox:2026-09-23`, `factory-sandbox:2026-09-23b` and blank exit 0; `factory-sandbox:latest` and bare `factory-sandbox` exit 1 naming the key; `MASTRACODE_MAX_SANDBOXES=abc` exits 1 naming the key. The override was confirmed to reach the schema by reading the resolved value back out of `--format json`.
- Both appended commands mutation-tested in place and restored: a single-quoted `matches='…'` at `.env.schema:527` leaves command 57 green and fails command 58 naming the line; a permissive `regex("^(|[0-9]+)$|.*")` leaves commands 57 and 58 green and fails command 59 naming `MASTRACODE_MAX_SANDBOXES`. `.env.schema` byte-identical after both.

**Follow-up review recommended: false.** This was a follow-up pass and it patched no `high`; the two mediums were both verification coverage, and each was mutation-tested in both directions before and after the fix, so no unverified risk remains to name.

**Residual risks.**
- Command 56's ok-branch can still blame `FACTORY_SANDBOX_IMAGE` for a load failure caused by another key. Unreachable in a gate run, because command 1 fails first on a broken `.env`, and the in-place fix is barred by the append-only rule on `[verify].commands`.
- The `apps/github/README.md` fallback prose cites `@mastra/factory` internals by line number. Accurate against the installed 0.15.0 and consistent with the section's pre-existing citations, but a package bump moves them with nothing to catch it.
- `npm run dev` bypasses varlock, so the tag constraint binds only the `npm start` path. Stated in all four documents that describe it; no guard reads `package.json` scripts, so a change to either script would falsify them silently.
- The only working-tree change left uncommitted is `_bmad-output/implementation-artifacts/deferred-work.md`, which the orchestrator owns and commits in its own sweep commit. It was already modified when this session started and was not read for edits or written to here.

