---
title: 'Bound the capacity knobs: a digits-only parser and a ceiling on the two Docker sandbox knobs'
type: 'bugfix'
created: '2026-09-26'
status: 'done'
baseline_revision: '2c1a3476f735d98f176124df31e9337a6432378f'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized, multiple-goals]
deferred:
  - summary: >-
      The product of FACTORY_SANDBOX_MEMORY_GIB (or FACTORY_SANDBOX_CPUS) and the
      configured MASTRACODE_MAX_SANDBOXES is never checked, so a raised concurrency
      count with a per-container knob at its bound still oversubscribes the host.
    evidence: |-
      The new bounds are derived from DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES (3), but the
      count that actually applies is positiveInt(process.env.MASTRACODE_MAX_SANDBOXES) in
      admitDockerSession. MASTRACODE_MAX_SANDBOXES=5 with FACTORY_SANDBOX_MEMORY_GIB=30
      passes every check and commits 150 GiB on a 32 GiB VM — the oversubscription
      sandbox/README.md ("the two numbers are one decision") and
      docs/self-hosting-research.md:157 warn about. Pre-existing: nothing checked the
      product before this change either, and the intent prescribed the
      default-derived bound explicitly. The fix is a cross-check where the count is
      read (memoryGib * maxSandboxes against the host budget), which is new behaviour
      and a new refusal path neither DW-13 nor DW-72 asks for.
    location: >-
      src/mastra/config/sandbox.ts:207
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `positiveInt` (`src/mastra/config/positive-int.ts:23-28`) coerces with `Number()`, so a typo'd capacity knob silently becomes a *different valid number* rather than falling back to the default — `'0x10'` becomes 16, `'0b11'` 3, `'1e3'` 1000, `'+5'` 5, `' 3 '` 3 (DW-13). Separately, `FACTORY_SANDBOX_MEMORY_GIB` and `FACTORY_SANDBOX_CPUS` are bounded only by `Number.isSafeInteger` and `> 0` before being multiplied by `1024 ** 3` and by the pinned CPU period, so a large safe integer produces a `memory`/`cpuQuota` outside any range Docker accepts and the session fails inside the daemon rather than at the knob (DW-72).

**Approach:** Reject any raw value that is not a run of ASCII digits before coercing, and give each of the two per-container knobs a ceiling constant derived from the host budget the existing defaults already encode (`DOCKER_SANDBOX_DEFAULT_MEMORY_GIB` 10 and `DOCKER_SANDBOX_DEFAULT_CPUS` 4, each times `DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES` 3 — 30 GiB and 12 cores, which is exactly the whole-VM arithmetic `sandbox/README.md` already states). A value above its ceiling refuses the session with a message naming the key and the ceiling, the way a missing `FACTORY_SANDBOX_IMAGE` already does. `sandbox/README.md` states both ceilings, because it owns "what the value must contain" under AD-6.

## Boundaries & Constraints

**Always:**
- `positiveInt` keeps returning `number | undefined` and keeps its existing rejections (unset, empty, `0`, negative, fractional, beyond the safe-integer range). The digits check is added *before* coercion; the `Number.isSafeInteger`/`> 0` checks stay, because a long run of digits passes the regex but is not a safe integer.
- The ceiling check lives in `dockerSandboxOptions`, after each knob has resolved to a number and before it is multiplied. It `throw`s, matching the `FACTORY_SANDBOX_IMAGE` refusal already in that function, so a refusal never falls through to the Platform/E2B arms.
- Each ceiling is written as the product of the two existing constants, so the derivation is visible in the source and cannot drift from the defaults.
- The ceiling is inclusive: a value *equal to* the ceiling is accepted.
- `sandbox/README.md` prose must not name the schema mechanism — no `@required`/`@public`/`@sensitive`, no declared type, no "fails the pattern" or `varlock load` wording (a verify-gate guard greps for these in all six owning READMEs).
- `.env.schema` and `.env.example` comment edits must not introduce a `>` or `→` between letters, and must point at `sandbox/README.md` for the ceiling numbers rather than restating them (AD-6; another guard greps for both).

**Never:**
- Do not add a ceiling to `MASTRACODE_MAX_SANDBOXES` or to `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` — DW-72 names the two per-container knobs only, and the concurrency cap already refuses at its own call site.
- Do not add a regex to the `FACTORY_SANDBOX_MEMORY_GIB` / `FACTORY_SANDBOX_CPUS` declarations in `.env.schema`; the parser is the place the bound is applied, and a boot-time pattern would change which values reach the code.
- Do not change the branch order in `selectSandbox`, the default values, the CPU period, or any other `DockerSandboxOptions` field.
- Do not restate the ceiling numbers in `.env.schema`, `.env.example`, root `README.md`, or `docs/self-hosting-research.md`.
- Do not edit the deferred-work ledger.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plain digits | `positiveInt('3')` | `3` | No error expected |
| Alternative spelling | `positiveInt('0x10' \| '0b11' \| '1e3' \| '+5' \| ' 3 ')` | `undefined` — the knob falls back to its default | No error expected |
| Existing rejections | `positiveInt('' \| '0' \| '-1' \| '2.5' \| 'abc' \| 'NaN' \| 'Infinity' \| '9007199254740993')` | `undefined` | No error expected |
| Knob at its ceiling | `FACTORY_SANDBOX_MEMORY_GIB=30`, `FACTORY_SANDBOX_CPUS=12` | `memory`/`memorySwap` 30 GiB in bytes, `cpuQuota` 1_200_000 | No error expected |
| Memory above ceiling | `FACTORY_SANDBOX_MEMORY_GIB=31` | `dockerSandboxOptions` throws | Message names `FACTORY_SANDBOX_MEMORY_GIB`, the value, the ceiling `30`, and points at `sandbox/README.md` |
| CPUs above ceiling | `FACTORY_SANDBOX_CPUS=13` | `dockerSandboxOptions` throws | Message names `FACTORY_SANDBOX_CPUS`, the value, the ceiling `12`, and points at `sandbox/README.md` |
| Typo'd knob | `FACTORY_SANDBOX_MEMORY_GIB=1e3` | Falls back to 10 GiB (was: a 1000 GiB limit) | No error expected |

</intent-contract>

## Code Map

- `src/mastra/config/positive-int.ts:23-28` -- the whole parser. One `Number(raw)` coercion to guard. Its doc comment states the fractional-rejection rationale and must gain the digits rationale.
- `src/mastra/config/positive-int.test.ts:51-62` -- the test that *pins today's leniency* (`'0x10'` is 16, …) and says in a comment that changing the parser is out of that story's scope. This is the case to invert; it is the DW-13 pin.
- `src/mastra/config/sandbox.ts:75-82` -- the constant block: `DOCKER_SANDBOX_CPU_PERIOD_US` 100_000, `DOCKER_SANDBOX_DEFAULT_CPUS` 4, `DOCKER_SANDBOX_DEFAULT_MEMORY_GIB` 10, `DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES` 3, `BYTES_PER_GIB` `1024 ** 3`. The two new ceiling constants belong here, beside the defaults they are derived from.
- `src/mastra/config/sandbox.ts:104-149` -- `dockerSandboxOptions`. Lines 111-117 are the existing throw-and-name-the-key precedent; 119-121 resolve the knobs and compute `memoryBytes`; 134 computes `cpuQuota`. The ceiling checks go between 120 and 121.
- `src/mastra/config/sandbox.test.ts:238-260` -- `falls back to the documented defaults for malformed or non-positive ceilings` (a loop over `['abc','0','-2','2.5','']`) and `honours positive whole-number ceilings` (16 GiB / 8 cores — both stay under the new ceilings, so this case is unaffected). The new spelling cases extend the first; the ceiling cases are new siblings.
- `sandbox/README.md:99-126` -- the `FACTORY_SANDBOX_MEMORY_GIB` and `FACTORY_SANDBOX_CPUS` sections. Each has a **What the value must contain** paragraph (the place for the ceiling) and a **How to choose it** paragraph that already states the 32 GiB / 12-core VM and the `× 3` arithmetic the ceilings come from. Read-only constraint: the owned-keys table at :22-31 needs no change (no new key).
- `.env.schema:499-507` and `.env.example:441-447` -- the two knobs' comments, currently "A value that is not a positive whole number falls back to the default, 10/4." Both files carry byte-identical comment prose for these keys and a gate guard requires the same keys in the same order in both.
- `src/mastra/config/factory.ts:58` and `src/mastra/config/factory.test.ts:232-241` -- the third `positiveInt` caller (`MASTRACODE_DISPATCH_MAX_IN_FLIGHT`). Read-only evidence: its rejection loop is `['0','x','-3','1.5','']`, all still rejected, so it stays green untouched.
- `src/mastra/config/sandbox.ts:207` -- `MASTRACODE_MAX_SANDBOXES` also reads through `positiveInt`. `.env.schema:528` already pins it to `^(|[0-9]+)$` on the `npm start` path, so the stricter parser only *agrees* with that declaration; `sandbox/README.md:130-134` already says "Anything that is not a run of digits" for it, and now becomes true on the `npm run dev` path too. No edit needed there.

## Tasks & Acceptance

**Execution:**
- `src/mastra/config/positive-int.ts` -- guard with `if (!/^[0-9]+$/.test(raw)) return undefined;` before `Number(raw)`; extend the doc comment to say why (a typo'd knob must fall back to the default, not become a different valid number) -- DW-13.
- `src/mastra/config/positive-int.test.ts` -- replace the `accepts the alternative spellings ...` case with one asserting each of `'0x10'`, `'0b11'`, `'1e3'`, `'+5'`, `' 3 '` is now `undefined`, keeping a comment that names the failure mode; leave every other case as-is (`'Infinity'` and `'9007199254740993'` still return `undefined`, now via the digits guard and the safe-integer guard respectively) -- the DW-13 pin has to move with the behaviour.
- `src/mastra/config/sandbox.ts` -- add `DOCKER_SANDBOX_MAX_MEMORY_GIB` and `DOCKER_SANDBOX_MAX_CPUS` beside the defaults, each written as `DEFAULT × DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES` with a comment naming the host budget; in `dockerSandboxOptions`, throw for a resolved `memoryGib` or `cpus` above its ceiling, with a message naming the key, the offending value, the ceiling and `sandbox/README.md` -- DW-72.
- `src/mastra/config/sandbox.test.ts` -- add the new spellings to the malformed-value loop, and add cases for: at-ceiling accepted (30 GiB, 12 cores, with literal expected byte/quota numbers), memory above ceiling throws naming its key, CPUs above ceiling throws naming its key -- nothing else in the repo can observe a `DockerSandboxOptions`.
- `sandbox/README.md` -- state the ceiling in each knob's **What the value must contain** paragraph, with the arithmetic it is derived from and what an operator sees when it binds -- the README owns this under AD-6.
- `.env.schema` and `.env.example` -- amend both knobs' comments identically so "falls back to the default" is no longer the whole story: a value above the ceiling refuses the session instead, and `sandbox/README.md` is where the ceiling is stated -- keep the numbers out of these two files.

**Acceptance Criteria:**
- Given `FACTORY_SANDBOX_PROVIDER=docker` and a `FACTORY_SANDBOX_MEMORY_GIB` of `1e3`, when the first session asks for a sandbox, then the container is created with the documented 10 GiB default rather than a 1000 GiB limit.
- Given a `FACTORY_SANDBOX_CPUS` above the ceiling, when the first session asks for a sandbox, then the session is refused before any container is created and the error text contains the key name and the ceiling — it is not relocated to the Platform, E2B or local arm.
- Given `sandbox/README.md`, when an operator reads either knob's "What the value must contain" paragraph, then the ceiling for that knob is stated there with the arithmetic it comes from, and the file still names no schema mechanism.
- Given the full verify gate (`npm run check`, `npm test`, `npm run build` and every guard), when it runs on this change, then it passes — in particular the six-README / `.env.schema` reconciliation guards and the `src/mastra/config` env census stay green, because no env key is added or removed and no new `process.env` read is introduced.

## Review Triage Log

### 2026-09-26 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 20, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` blind-hunter: rejecting `' 3 '` makes a padded `.env` line silently default, while sibling keys in the same file are trimmed — the intent names `' 3 '` becoming 3 as one of the defects to close and prescribes `/^[0-9]+$/` with no trim, so trimming would restore the behaviour this change exists to remove; excluded by the intent itself.
  - `[medium]` `[defer]` blind-hunter: the bound is derived from `DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES`, not the configured `MASTRACODE_MAX_SANDBOXES`, so a raised count still oversubscribes the host — verified real (5 × 30 GiB on a 32 GiB VM passes every check) but pre-existing: nothing checked the product before this change. Deferred with severity medium; the overclaiming half of the constant comment was corrected under the patch below.
  - `[low]` `[patch]` blind-hunter: the constant comment's "30 GiB and 12 cores — the same whole-VM numbers `sandbox/README.md` states" is wrong for memory (the README's VM is 32 GiB; 30 is the sandbox share) and flattens two different derivations — fixed: each number is now named for its own derivation.
  - `[low]` `[patch]` blind-hunter: the refusal message's "grow the VM first" is not actionable, because the bound is a compiled-in product of two constants — fixed: both messages now say the bound is not a setting and point at `sandbox/README.md` for what raising it takes.
  - `[low]` `[patch]` blind-hunter: `.env.schema`/`.env.example` still said "not a positive whole number falls back", but `1e3` and `+5` read as positive whole numbers and now fall back — fixed: both files use the "run of digits" wording with the two spellings called out.
  - `[low]` `[patch]` blind-hunter: the other two `positiveInt` callers changed behaviour with no doc update — fixed for the docs (`README.md:285`, and the `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` comment in both env files). The `factory.test.ts` half is rejected on the verification-gap layer's refutation: the rule is pinned at the parser boundary and that call site's own loop relies on no now-rejected spelling.
  - `[low]` `[reject]` blind-hunter: no boot-time detection of an out-of-bound knob, and the per-session caveat is unstated — the new README paragraphs already say "the session that would use it is refused before any container is created", which conveys the timing; a boot-time check is new surface the intent does not ask for.
  - `[low]` `[patch]` blind-hunter: the four independent `toThrow` calls with `/\b31\b/` and `/\b30\b/` would still pass on a message that swapped the value and the bound — fixed: one ordered regex per case, `/… is 31, which is more than the 30 GiB[\s\S]*sandbox\/README\.md/`.
  - `[low]` `[reject]` blind-hunter: the two throw blocks are copy-pasted prose and want a shared helper — the named harm is only hypothetical wording drift, and a `refuseAboveBound(key, value, bound, unit)` helper adds public surface for two six-line call sites; the ordered regexes now catch drift instead.
  - `[low]` `[patch]` blind-hunter: coverage gaps — no `selectSandbox`-level case and no huge-digit-run case. Both fixed (see the two entries below). The leading-zeros part is rejected: `'030'` is 30 with no bad outcome.
  - `[low]` `[patch]` blind-hunter: `32212254720` written unseparated beside `10 * 1024 * 1024 * 1024` — fixed: `30 * 1024 * 1024 * 1024` for both `memory` and `memorySwap`.
  - `[low]` `[reject]` blind-hunter: "the two ceilings above" in the pre-existing comment now collides with the new `MAX_*` constants — the new constants sit *below* that comment, so "above" still resolves unambiguously to the two defaults; the fix would edit pre-existing prose for no named harm.
  - `[false]` `[reject]` edge-case: a restart with an oversized knob makes an existing container unreachable and refuses a reattaching session — after a restart `liveDockerSandboxes` is empty, so no session is "reattaching" in this map, and within one process Factory memoizes the instance and never re-calls the slot. Every session is refused, which is the same loud configuration failure the pre-existing `FACTORY_SANDBOX_IMAGE` refusal already produces; the proposed fix (check after the reattach early-return) would let a misconfigured deployment keep serving unbounded knobs.
  - `[medium]` `[defer]` edge-case: `memoryGib * maxSandboxes` is never cross-checked — same root cause as the blind-hunter finding above; deferred with it.
  - `[medium]` `[patch]` edge-case: a digit run past the safe-integer range is rejected by `positiveInt` first and silently gets the default, so the bound never sees it — fixed: both README paragraphs now scope the refusal claim to values within the range the server can hold and say an over-long digit run falls back, and `'99999999999999999999'` was added to the malformed-value loop.
  - `[low]` `[reject]` edge-case: trim before the digits test — duplicate of the blind-hunter whitespace finding; rejected for the same reason.
  - `[low]` `[reject]` edge-case: with both knobs above their bounds only memory is named, so CPU surfaces after another restart — real but trivial, both knobs being simultaneously over-bound is not an everyday case, and collecting both violations adds an accumulator and a second code path for a message the operator reaches twice at worst.
  - `[medium]` `[patch]` edge-case (claim): the README/env claim "a value above the bound does not fall back" is false for an unrepresentable digit run — same root cause as the edge-case finding above; fixed with it.
  - `[low]` `[patch]` edge-case (claim): the README's "grow the VM and move this ceiling and the concurrency count together" implies the ceiling is an operator setting — same root cause as the message finding above; fixed with it, and `sandbox/README.md` now states the bound is compiled into `src/mastra/config/sandbox.ts`.
  - `[low]` `[patch]` verification-gap (other): the at-bound case's comment claimed a change to either default would fail it, but only a *decrease* does — fixed: the comment now names the one direction it catches and points at the two refusal cases as the pin on the bound's value.
  - `[low]` `[reject]` intent-alignment: DW-72 frames the harm at the Docker daemon surface, while the bound is a host-policy number two orders of magnitude tighter, so the knobs can no longer express a bigger host — the intent prescribes exactly this derivation ("derived from the same host budget the existing defaults are"), so it is excluded by the intent.
  - `[low]` `[patch]` intent-alignment: the "nothing is relocated" guarantee is asserted in prose but exercised only against `dockerSandboxOptions` — fixed: a `selectSandbox` case in the same shape as the existing image refusal, with the stray Platform and E2B variables set.
  - `[low]` `[reject]` intent-alignment: the digits check runs on the untrimmed value — duplicate of the whitespace findings; rejected for the same reason.
  - `[medium]` `[defer]` intent-alignment: the bound is anchored to a default while the budget it names is operator-settable — same root cause as the two oversubscription findings; deferred with them. The layer itself notes the gap is inherited from the intent, not introduced by the diff.
  - `[false]` `[reject]` intent-alignment: the intent's "lower bound" has no corresponding change — the parser's lower bound is the digits rule plus the pre-existing `<= 0` check, which is what now rejects `-1`, `0` and `2.5` before coercion; nothing in the intent asks for a floor at the sandbox surface.
  - `[low]` `[patch]` intent-alignment: the parser change lands on three call sites and only one is exercised — the documentation half is patched (see the `positive whole number` entry). The claim that `sandbox/README.md`'s "stops `npm start` before the server boots" is now incomplete for dev runs is false: that sentence is about the `npm start` path and stays true; the dev path was equally undocumented before.
  - `[low]` `[reject]` intent-alignment: the `.env.schema`/`.env.example` comment edits are discretionary scope — no harm named, and the layer confirms they are consistent with AD-6 (numbers kept out, the README named).

## Design Notes

Why `/^[0-9]+$/` and not `Number.parseInt`: `parseInt('4 workers')` is `4`, which is the same class of silent-success this is closing. The regex is the only form that rejects every spelling `Number()` invents while still accepting exactly what the two READMEs promise — "a whole number", "a run of digits".

Why the ceiling throws instead of clamping to the ceiling or falling back to the default: a knob an operator deliberately raised past what the host can serve is a configuration mistake, and silently serving 30 GiB when `.env` says 64 would make the documented cap a fiction. Falling back to 10 would hide it just as well. The precedent two lines up in the same function — a missing image refuses and names the key — is the shape to copy.

The ceiling arithmetic, spelled out so the constants are not magic:

```ts
// This host's whole sandbox budget: the per-container default times the
// concurrency it was sized against. A knob above it cannot be served even as
// the only live session, and Docker would take the number regardless.
const DOCKER_SANDBOX_MAX_MEMORY_GIB = DOCKER_SANDBOX_DEFAULT_MEMORY_GIB * DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES; // 30
const DOCKER_SANDBOX_MAX_CPUS = DOCKER_SANDBOX_DEFAULT_CPUS * DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES; // 12
```

Both products land on a number `sandbox/README.md` already states as a property of this VM (32 GiB less Postgres; 12 cores), so the ceilings are the documented host budget rather than a new invention.

## Verification

**Commands:**
- `npx vitest run --dir src src/mastra/config/positive-int.test.ts` -- expected: all cases pass, including the inverted spelling case.
- `npx vitest run --dir src src/mastra/config/sandbox.test.ts src/mastra/config/factory.test.ts` -- expected: all pass, with the new ceiling cases green and `factory.test.ts` unchanged and green.
- `npm run check` -- expected: exit 0.
- `npm test` -- expected: exit 0 across the whole suite.
- `npm run build` -- expected: exit 0.

## Auto Run Result

Status: done

**Implemented change.** `positiveInt` now requires a run of ASCII digits before it coerces, so a typo'd capacity knob falls back to its default instead of becoming a different valid number (DW-13). `dockerSandboxOptions` holds `FACTORY_SANDBOX_MEMORY_GIB` and `FACTORY_SANDBOX_CPUS` to an inclusive upper bound — 30 GiB and 12 cores, each written as the per-container default times the default concurrency count — and refuses the session by throwing, naming the key, the offending value, the bound and `sandbox/README.md`, before either number is multiplied into `HostConfig.Memory` or a CFS quota (DW-72). `sandbox/README.md` states both bounds with their arithmetic, says the bound is compiled into `src/mastra/config/sandbox.ts` rather than being a setting, and scopes the refusal claim to values the server can represent.

**Files changed.**
- `src/mastra/config/positive-int.ts` -- digits guard ahead of the coercion, with the rationale in the doc comment.
- `src/mastra/config/positive-int.test.ts` -- the DW-13 pin inverted: the five alternative spellings now assert `undefined`.
- `src/mastra/config/sandbox.ts` -- `DOCKER_SANDBOX_MAX_MEMORY_GIB` and `DOCKER_SANDBOX_MAX_CPUS` as derived products, and two refusal throws between the knob resolution and the multiplications.
- `src/mastra/config/sandbox.test.ts` -- the five spellings plus an unrepresentable digit run added to the malformed-value loop; at-bound accepted; two ordered-regex refusal cases; one `selectSandbox` case proving a refusal is not relocated.
- `sandbox/README.md` -- both knobs' "What the value must contain" paragraphs state the bound, its derivation, where it lives, and what the operator sees when it binds.
- `.env.schema`, `.env.example` -- both knobs' and `MASTRACODE_DISPATCH_MAX_IN_FLIGHT`'s comments reworded to "run of digits", with the bound left to `sandbox/README.md`.
- `README.md` -- the same rewording for the `MASTRACODE_DISPATCH_MAX_IN_FLIGHT` bullet.

**Review findings breakdown.** 27 findings across four layers — 0 high, 5 medium, 20 low, 2 false. Eight entries patched (1 medium, 7 low): the unrepresentable-digit-run gap between the docs and the code plus its test; the "positive whole number" wording in three files; the "grow the VM" remedy in both messages and the README; the constant comment's whole-VM claim; the swapped-message hole in the refusal assertions; the at-bound comment's direction claim; the unseparated byte literal; the missing `selectSandbox`-surface case. One entry deferred (medium, pre-existing): the product of a per-container knob and the configured `MASTRACODE_MAX_SANDBOXES` is never cross-checked. Every rejected finding and its reason is recorded row by row under `## Review Triage Log` — the whitespace/trim family (excluded by the intent, which names `' 3 '` as a defect to close), the reattach-refusal claim (refuted: the map is empty after a restart and the slot is not re-called within a process), the shared-helper and both-knobs-at-once suggestions (low, fix adds surface), the boot-time check, the terminology collision, leading zeros, the Docker-range reading of the bound, the "lower bound" reading, and the discretionary env-comment scope.

**Follow-up review recommendation:** `false`. First pass; no patched entry was `high` and only one was `medium`, so the threshold (a `high`, or two or more `medium`) is not met. Patched by verdict: medium 1, low 7.

**Verification performed.**
- `npx vitest run --dir src` on `positive-int.test.ts`, `sandbox.test.ts`, `factory.test.ts` -- pass.
- `npm run check` -- exit 0.
- `npm test` -- 8 files, 137 tests, all pass.
- `npm run build` -- exit 0.
- Every matrix row is covered by a test that ran and passed: the three parser rows in `positive-int.test.ts`, the at-bound row and both refusal rows in `sandbox.test.ts` (each refusal regex pins key, value, bound and the README pointer in order), and the typo'd-knob row by the malformed-value loop asserting 10 GiB and 400_000.
- The implementation agent additionally re-ran every runnable `[verify].commands` guard from `.bmad-loop/policy.toml` (all but `npm ci`) with no failures, including the six-README schema-mechanism grep over the reworded `README.md` bullet and the `.env.schema`/`.env.example` key-order and punctuation guards. The orchestrator's gate is the authority on that.

**Residual risks.**
- The bounds move with the three defaults they are derived from. A *lowered* default turns the at-bound case into a refusal and fails it; a *raised* one lifts the bound silently, caught only by the two refusal cases at 31 and 13. The at-bound comment now says so explicitly.
- The deferred oversubscription hole stands: a raised `MASTRACODE_MAX_SANDBOXES` with either knob at its bound commits more than the VM has, and nothing refuses it.
- On a host larger than this Colima VM the two knobs cannot express the machine — raising a bound is a code edit in `src/mastra/config/sandbox.ts`. That is the derivation the intent prescribed, and `sandbox/README.md` now says where the number lives.
