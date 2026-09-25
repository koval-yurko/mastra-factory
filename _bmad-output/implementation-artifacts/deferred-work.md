### DW-8: The gate's test command boots the whole factory because the tests import the entry; the environment it boots in is arranged by a prefix denylist that a future env var could escape.
origin: spec-deferred de8d3aa4c65e
location: src/mastra/index.test.ts:27-55
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: src/mastra/index.test.ts imports ./index, whose module body runs `await factory.prepare()` and `await factory.finalize()` (workers started). Two inherited variables were shown to break the gate before the sweep landed: REDIS_URL made `npm test` hang past 75s, and a malformed FACTORY_CREDENTIAL_ENCRYPTION_KEY aborted it with zero tests run. The sweep covers FACTORY_/MASTRA_/MASTRACODE_/WORKOS_/GITHUB_APP_/LINEAR_/SLACK_APP_/E2B_ plus REDIS_URL, DATABASE_URL and APP_DATABASE_URL — correct today, but it is a denylist mirroring the entry by hand. Epic 5's extraction of config out of the entry retires the whole mechanism; until then a new differently-named key in the entry is a silent hole.
status: open

### DW-9: Nothing bounds or tears down the factory the test boots — no afterAll shutdown, and no per-command timeout in [verify].commands — so a boot that hangs stalls the gate rather than failing it.
origin: spec-deferred a53224131bee
location: .bmad-loop/policy.toml [verify] / src/mastra/index.test.ts
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: The test file has no afterAll; the entry starts controller workers at import and the process exits only because nothing holds the loop. .bmad-loop/policy.toml [limits] has git_timeout_s (git subprocesses only) and session_timeout_min (the whole session), but no per-verify-command bound. The REDIS_URL reproduction showed what that costs: no output, no exit, until something outside kills it. The env sweep removes today's known trigger, not the exposure. Smallest fix: a per-command timeout in the verify runner, or `--testTimeout`/a hard process bound on the test command. Both are orchestrator surface beyond this story.
status: open
decision: 2026-09-25 Tear the boot down inside the suite — Add an afterAll to src/mastra/index.test.ts that shuts the booted factory down — stopping the controller workers finalize() started — so the suite cannot hold the event loop open, and state in the file's docstring that session_timeout_min is the only outer bound. Extend the existing afterAll at :101 rather than adding a second one, and verify the suite still exits cleanly under `npm test`.

### DW-12: The one place localSandboxEnv() is wired — the sandbox's env — is observed by no test, so the secret-withholding property is pinned at the helper and not where it takes effect.
origin: spec-deferred 5398e36c021e
location: src/mastra/index.ts:323
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: `env: localSandboxEnv()` at src/mastra/index.ts:323 is the helper's only call site (grepped the first-party tree). Replacing it with a spread of process.env leaves all four localSandboxEnv tests green and satisfies `tsc`, while GITHUB_APP_PRIVATE_KEY, WORKOS_API_KEY, DATABASE_URL and FACTORY_CREDENTIAL_ENCRYPTION_KEY — the exact keys the test lists as WITHHELD_KEYS — reach commands run inside an untrusted checkout. Not done here: reaching that callback means driving MastraFactory far enough to build a LocalSandbox, which is factory surface this story does not touch. It belongs with Epic 5's extraction of config out of the entry, alongside the boot-cost entries above.
status: open

### DW-25: The build context is the repository root with no `.dockerignore`, so `node_modules/`, `.git/`, `_bmad-output/` and `.env` are transferred to the engine on every build even though the image copies
origin: spec-deferred dfd1f11b1a9d
location: sandbox/README.md build command / repository root (.dockerignore absent)
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: low
reason: `docker build … -f sandbox/factory-sandbox.Dockerfile … .` makes the repo root the context; there is no `.dockerignore` anywhere in the tree, and `node_modules/` alone is over 1 GB here before the `.bmad-loop/runs/` worktrees. Nothing lands in the image — the Dockerfile has no `COPY`/`ADD` — so the cost is transfer time, plus `.env` (which holds `POSTGRES_PASSWORD`) being sent to the daemon. Not done here, two ways: the epic's acceptance criterion pins the build command's trailing `.`, and a root `.dockerignore` would add a file to the closed root set AD-3 defines, which is a spine decision rather than a local call. Either fix — narrowing the context to `sandbox/`, or adding the ignore file to the root allowlist — needs that decision first. `sandbox/README.md` documents the cost in the meantime.
status: open
decision: 2026-09-24 Amend AD-3; add .dockerignore — Amend AD-3's root-file table in ARCHITECTURE-SPINE.md to admit .dockerignore with a one-line rationale, add the file at the repository root excluding node_modules/, .git/, _bmad-output/, .bmad-loop/runs/, .mastra/ and .env, and replace sandbox/README.md:259-263's cost paragraph with a statement of what is now excluded. Extend the root closed-set gate guard's allowlist to the new entry so the membership assertion still passes, and confirm the image still builds unchanged (nothing from the context is used).

### DW-28: `ARCHITECTURE-SPINE.md` and the canonical `SPEC.md` both still state that `@mastra/docker` is not installed, which this story makes false.
origin: spec-deferred 5b69817a8e29
location: ARCHITECTURE-SPINE.md:236-243 / spec-self-hosted-factory/SPEC.md:110
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: low
reason: `ARCHITECTURE-SPINE.md` lines 236-243 list `@mastra/docker` under "**Planned, not yet resolved** — … Neither is in `package.json` or `node_modules` as of 2026-09-22", and `_bmad-output/specs/spec-self-hosted-factory/SPEC.md:110` says "neither is installed". Both were accurate when written and both carry "Re-verify at install", which this story did: `0.8.0` resolved, peer `>=1.67.0-0 <2.0.0-0` satisfied by core `1.67.0`. Not done here: `SPEC.md` is the canonical requirements contract and the spine is the architecture record; a story amending either from inside an epic is how those documents stop being trustworthy. `@mastra/auth-better-auth` in the same table is still genuinely uninstalled, so the row cannot simply be deleted — Story 2.3 will falsify that half.
status: open

### DW-31: The DW-27 and DW-29 headings in the deferred-work ledger end mid-sentence, because the writer truncates the summary it copies from a spec's `deferred` entry.
origin: spec-deferred 6edfb51f08df
location: _bmad-output/implementation-artifacts/deferred-work.md DW-27 / DW-29
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: low
reason: `deferred-work.md` DW-27 ends "… naming the cap is not" and DW-29 ends "… a gate fix it could have"; the corresponding `summary` fields in this spec's frontmatter end "… is not implementable with the installed packages" and "… a gate fix it could have made". Both entries' `reason:` fields carry the full claim, so no information is lost — only the one-line heading a sweep reads first is cut. Every earlier DW entry written from a shorter summary is intact, which points at a length limit in the writer rather than at these two entries. Not done here: `deferred-work.md` is the orchestrator's ledger and this session is instructed not to modify existing entries; the fix belongs in whatever writes them.
status: open

### DW-37: Closing registration leaves no self-service password recovery and no documented way to add a second operator — and a second account would not see the first account's work anyway.
origin: spec-deferred 116064269ef9
location: README.md "Start the Factory Server" step 3 / Troubleshooting
source_spec: `spec-2-6-operator-close-registration-before-anything-is-public.md`
severity: low
reason: No email sending is configured anywhere in this deployment, so better-auth's reset-password flow has no transport; with sign-up closed, a locked-out operator's only path is the same source edit README step 3 now documents, which is not labelled as recovery. Separately, the personal-org bootstrap keys on the user id (`personal-<user id>`, `@mastra/auth-better-auth/dist/index.js` `ensureOrganization`), so a second account lands in its own organization and sees none of the first account's projects, stored credentials or GitHub connection — every integration is org-scoped. Not done here: both are pre-existing consequences of the Story 2.3/2.4 identity design rather than of this diff, and documenting multi-operator semantics is new content about a scenario this single-operator deployment has not reached. The natural owner is whichever story first adds a second human.
status: open
decision: 2026-09-25 Document the source-edit window as the recovery path — Add a Troubleshooting entry to README.md naming the existing signUpEnabled source-edit window at README.md:88-91 as the lock-out recovery path, stating plainly that there is no email transport and therefore no self-service password reset, and that the window must be closed and proven closed with `git diff --exit-code src/mastra/config/auth.ts` exactly as step 3 requires. Leave multi-operator semantics undocumented — that half belongs to whichever story first adds a second human.

### DW-38: `docs/Self-hosting research.md` is now the one committed document describing a different account-creation mechanism from `README.md` step 3.
origin: spec-deferred d0b5746eb552
location: docs/Self-hosting research.md §6-7 vs README.md step 3
source_spec: `spec-2-6-operator-close-registration-before-anything-is-public.md`
severity: low
reason: `docs/Self-hosting research.md:235,497-502,597` describe the sequence as "create the account on loopback with `signUpEnabled: true`, then flip to `false` before the tunnel" — accurate as the plan and as history, but a reader who lands there rather than in `README.md` will not find the reopen-and-restore procedure step 3 now specifies, nor the probe that verifies it. Not done here: `AGENTS.md:26-27` makes that file's section numbers stable citation anchors used across the spec and stories, and `epics.md` assigns the file to Story 5.3, which renames and rewrites it. Editing its prose from this story risks the anchors for a divergence that is currently only a difference of detail, not a false statement.
status: open

### DW-42: `ops/README.md` now holds two subjects at one heading level, so it carries two checkpoint sequences and two bring-up procedures with nothing structural separating them.
origin: spec-deferred 883292299578
location: ops/README.md
source_spec: `spec-3-2-operator-a-public-origin-with-no-inbound-ports.md`
severity: low
reason: The H1 is `# Host infrastructure` and the container-engine half still runs as a flat sequence of H2s (`## DOCKER_HOST`, `## Before you start`, `## Bring-up`, `## Checkpoints`, `## Teardown`) with no section heading of its own, while the ingress half appended below it opens with `## Ingress — Cloudflare Tunnel` and ends with `## Ingress checkpoints`. A reader who lands on "Checkpoints" from a search cannot tell from the heading which subject it belongs to. Not done here: grouping the container-engine half under a heading means demoting five existing H2s to H3s, and `README.md:15,64` plus the Story 1.4 spec cite this file's checkpoints by number. Epic 4 adds supervision content to the same file, which is the change that should settle the structure for all three subjects at once rather than twice.
status: open

### DW-44: `epics.md:730` still states "the 5-minute reconcile sweep" as the premise of Story 3.3's own acceptance criterion, so the frozen plan and the operator documentation now disagree about the one number
origin: spec-deferred 2df6ab13ac92
location: _bmad-output/planning-artifacts/epics.md:730
source_spec: `spec-3-3-operator-a-github-app-that-belongs-to-yurii.md`
severity: low
reason: This story established, against `node_modules/@mastra/factory/dist/integrations/github/ reconcile-worker.js:35`, that the sweep interval defaults to `36e5` — one hour — and corrected `apps/github/README.md`, `.env.schema`, `.env.example` and `docs/Self-hosting research.md` §5 accordingly. `epics.md:730` is the source of the five-minute figure and was not touched, so it is now the only place in the repository still asserting it, and it is the surface the next reader of this story's intent meets first. Not done here: `epics.md` is the frozen sprint plan that this and every other story is dispatched from, and rewriting a story's own acceptance premise mid-run would change the record the run is judged against. The operator-facing documents are corrected and are the ones AD-6 makes normative; the epics correction belongs to a retrospective or a plan amendment.
status: open

### DW-46: `epics.md:749-751,768` still carries the five-scope list and makes "an @-mention of the app is received" a criterion of this story, so the frozen plan asserts a scope set and a capability that
origin: spec-deferred d8bdca98a444
location: _bmad-output/planning-artifacts/epics.md:749-751,768
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: medium
reason: This story established, against `node_modules/@mastra/factory/dist/integrations/linear/ integration.js:330`, that the authorize URL requests exactly `read,comments:create`, and that `app:mentionable` plus @-mentions are unreachable at this version for three independent reasons — the scope is not requested, `actor=app` is never sent (`integration.js:326-332`), and neither a Linear webhook route nor an `AgentSessionEvent` handler exists anywhere in the package (`grep -rn "webhook" .../integrations/linear/` and `grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/` both return nothing). `apps/linear/README.md`, `.env.schema`, `.env.example` and §6 of `docs/Self-hosting research.md` are corrected; `epics.md` is not, so it is now the only place still asserting both. Not done here: `epics.md` is the frozen sprint plan this story is dispatched from, and rewriting a story's own acceptance premise mid-run would change the record the run is judged against. The
status: open
decision: 2026-09-24 Amend with a dated correction — Amend Story 3.4's Given/Then in _bmad-output/planning-artifacts/epics.md:749-751,759,768 to the verified reality — the authorize URL requests exactly `read,comments:create`, app:mentionable is not requested and @-mentions are unreachable at @mastra/factory 0.15.0, and the LINEAR_CLIENT_ID/LINEAR_CLIENT_SECRET pair is asymmetric rather than all-or-nothing — carrying a dated correction note naming the evidence rather than silently rewriting the criterion, so the record of what was planned survives beside what was found. Regenerate _bmad-output/implementation-artifacts/epic-3-context.md afterwards, since it is a cache compiled from epics.md and carries the same two claims.
decision: 2026-09-24 Amend with a dated correction — Amend Story 3.4's Given/Then in _bmad-output/planning-artifacts/epics.md:749-751,759,768 to the verified reality — the authorize URL requests exactly `read,comments:create`, app:mentionable is not requested and @-mentions are unreachable at @mastra/factory 0.15.0, and the LINEAR_CLIENT_ID/LINEAR_CLIENT_SECRET pair is asymmetric rather than all-or-nothing — carrying a dated correction note naming the evidence rather than silently rewriting the criterion, so the record of what was planned survives beside what was found. Regenerate _bmad-output/implementation-artifacts/epic-3-context.md afterwards, since it is a cache compiled from epics.md and carries the same two claims.

### DW-47: The §11 trap-table row at `docs/Self-hosting research.md:670` still reads "all-or-nothing; one alone is a boot error", the symmetric claim this story disproved, because the row is a table row and this
origin: spec-deferred 84966d1ee1fa
location: docs/Self-hosting research.md:670
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `docs/Self-hosting research.md:670` is `| `LINEAR_CLIENT_ID` / `_SECRET` | all-or-nothing; one alone is a boot error |`. The real behaviour is asymmetric: the secret without the id fails varlock at `npm run start` and names `LINEAR_CLIENT_ID` (`.env.schema:395`), while the id without the secret passes validation and leaves the integration unbuilt and unlogged (`src/mastra/index.ts:242-243`, a ternary). The boot error that does exist is the state-signer one (`node_modules/@mastra/factory/dist/factory.js:369`, `.../integrations/linear/integration.js:306`), which the row does not mention. Not done here: this spec's Never list forbids adding, removing or changing any table row or heading in that file — §6 and §11 are a dated research record corrected by appending, and the appended 2026-09-23 paragraph under §6 now carries the correction. §6 already tells the reader that `apps/linear/README.md` wins on disagreement, so the stale row is shadowed rather than authoritative; a §11 pass that
status: open

### DW-49: `epic-3-context.md` still carries the two claims this story disproved, and it is the file the remaining Epic 3 stories load as their primary planning context.
origin: spec-deferred 02eb9f7111e9
location: _bmad-output/implementation-artifacts/epic-3-context.md:45-49
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `_bmad-output/implementation-artifacts/epic-3-context.md:45-46` states "The mention-capability scope is easy to miss and its absence silently prevents the app being addressed inside Linear", and `:47-49` states "Env-key groups are all-or-nothing … the integration stays inert (or, for one provider, fails at boot) by design". Both were falsified here: the scope is never requested and no endpoint could receive a mention, and the Linear pair is asymmetric with the real boot failure being the state signer. Story 3.5 loads this file as its context. Not done here: the file is a regenerable compiled cache — its own header says "Regenerate with compile-epic-context if planning docs change" — and it is derived from `epics.md`, whose correction is already deferred above. Editing the cache without editing its source would make the next regeneration silently undo the fix.
status: open

### DW-50: The §11 trap table carries a second row this story's evidence falsifies — the `GITHUB_APP_WEBHOOK_SECRET` row still describes an unset signer as a degraded mode when a registered Linear or GitHub
origin: spec-deferred 124a0d597e72
location: docs/Self-hosting research.md, §11 trap table, GITHUB_APP_WEBHOOK_SECRET row
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `docs/Self-hosting research.md` §11 says an unset `GITHUB_APP_WEBHOOK_SECRET` with no `WORKOS_COOKIE_PASSWORD`/`SLACK_APP_SIGNING_SECRET` means "random per process ⇒ OAuth breaks across restarts". With any integration declaring `requiresStableStateSigner` registered — Linear at `node_modules/@mastra/factory/dist/integrations/linear/integration.js:306`, GitHub likewise — `node_modules/@mastra/factory/dist/factory.js:369` throws during `prepare()` and the server does not start. Story 3.3 corrected the same claim in `.env.schema`, `.env.example` and `apps/github/README.md` and left this row; this story corrects the Linear row's equivalent and leaves it too. Not done here: this spec's Never list forbids adding, removing or changing any table row or heading in that file — §6 and §11 are a dated research record corrected by appending. The row is pre-existing rather than caused by this change, and a §11 pass that re-reads every trap row at once is the right owner; §6 and §5 both already
status: open

### DW-53: Whether a rotated `out.log` keeps being written is unverified: macOS `newsyslog` rotates by rename with no copy-truncate, `launchd` holds the descriptor it opened at spawn, and the `N` flag signals
origin: spec-deferred e553d5efb542
location: ops/newsyslog/ai.mastra.factory.conf:2-5 vs ops/launchagents/ai.mastra.factory.plist
source_spec: `spec-4-1-the-supervision-artifacts-as-real-files-in-the-repo.md`
reason: `man 5 newsyslog.conf` on this host lists the flags as `B C D G J N U Z` plus `-`: there is no run-a-command flag, and the only notification mechanism is a signal to a pid read from `path_to_pid_file`. A launchd-managed node process has no pid file this repo controls, and SIGHUP would kill it rather than make it reopen, so `N` is the only correct spelling — which is also what Story 4.1's acceptance criterion pins ("with the `N` and `J` flags — no process to signal"). The open-descriptor consequence follows from launchd opening `StandardOutPath` once per spawn, but it was not observed: rotation cannot be exercised in a story worktree, which is why the conf was left as specified and the limit written into `ops/README.md` instead. What would settle it: Story 4.3's rotation criterion — force a rotation, then confirm a compressed generation exists **and** the live `out.log` is still growing. If it is not, the remedy is `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` after a
status: open
decision: 2026-09-25 Operator runs recovery proof 4

### DW-55: `ops/install.sh` and `ops/factory-start.sh` point the reader at story keys ("bootstrap the agents per Story 4.2", "Story 4.3 reads out of out.log") that stop resolving once those stories are
origin: spec-deferred 1da806fe09e0
location: ops/install.sh:5,98 and ops/factory-start.sh:70
source_spec: `spec-4-2-operator-bring-the-agents-up.md`
severity: low
reason: `ops/install.sh:5` and `:98` and `ops/factory-start.sh:70` carry the references. Before this story there was nowhere else to point; `ops/README.md` now has "Bringing the agents up" and six numbered supervision checkpoints, so `:98`'s closing line in particular would be more useful as a pointer to that section than to a sprint row a reader cannot look up. Not done here because this story's intent sets the five `ops/` artifacts read-only — it exercises them unchanged, and a defect or staleness in one is a finding to record rather than a silent edit in a story that touches nothing else under `ops/`.
status: open

### DW-56: Supervision checkpoint 1 in `ops/README.md` (Story 4.2's) expects `0` in the second column of `launchctl list` beside a live pid, but that column is the job's *last exit status* and reads as the
origin: spec-deferred f1156e28a493
location: ops/README.md, supervision checkpoint 1 ("both agents are registered, and neither is looping")
source_spec: `spec-4-3-operator-prove-it-comes-back-on-its-own.md`
severity: medium
reason: `man launchctl` under `list`: "The second column displays the last exit status of the job. If the number in this column is negative, it represents the negative of the signal which stopped the job. Thus, `-15` would indicate that the job was terminated with SIGTERM." Confirmed live on this host: `launchctl list` currently shows `9226 -9 com.apple.spotlightknowledged.updater` — a running pid beside a negative status. `ops/README.md`'s supervision checkpoint 1 reads "each with a real pid in the first column and `0` in the second… a `0` beside a live pid is a job that is running and has not died yet in this session", and its failure reading treats "a pid that is different every time you run this, with a non-zero status" as the crash-loop signature — which a healthy kickstarted job also matches. Recovery proof 1 carried the same defect and was corrected in this story (the pass criterion is now the pid change plus the `200`, with the status column explicitly excluded). Not fixed here because
status: open

### DW-60: `_bmad-output/planning-artifacts/epics.md` still publishes the superseded eight-entry root allowlist as this story's own acceptance criterion, which the amended AD-3 now contradicts.
origin: spec-deferred 36ee6516bf4e
location: _bmad-output/planning-artifacts/epics.md:978-982
source_spec: `spec-5-1-every-operational-artifact-at-its-seeded-path-and-no-code-ou.md`
severity: low
reason: `epics.md:978-982` reads "the only files outside a subject directory are `package.json`, `package-lock.json`, `tsconfig.json`, `docker-compose.yml`, `.env`, `.env.schema`, `.env.example` and `.gitignore`" — false against both the tree and AD-3's amended twelve-entry table, which this story widened on the AC's own amend-the-allowlist branch. A later story or retrospective reading epics.md rather than the spine would try to move four tool-located root files. Not fixed here: editing an epic acceptance criterion mid-epic is a correct-course action (bmad-correct-course), not a gate patch, and AD-3 is the normative home the same criterion points at. The sibling half self-heals: `epic-5-context.md` repeats the eight-entry list but is a cache invalidated by any newer file under planning-artifacts, and ARCHITECTURE-SPINE.md is now newer, so the next story recompiles it. Smallest fix: amend NFR4's acceptance criterion in epics.md to cite AD-3 instead of restating it.
status: open
decision: 2026-09-24 Amend epics.md to cite AD-3 — Replace the restated eight-entry list at _bmad-output/planning-artifacts/epics.md:978-982 with a citation of AD-3's root-file table in ARCHITECTURE-SPINE.md, carrying a dated correction note that records the superseded list and why it was widened — Story 5.1 took the acceptance criterion's own amend-the-allowlist branch. Do not restate the twelve entries; the point is that exactly one document owns the list. Leave every other criterion in that section byte-identical.

### DW-64: Open deferred-work entries still point at the research document by its old path and by section/line anchors this story rewrote, so the next sweep follows dangling pointers.
origin: spec-deferred 707ba5c656a0
location: _bmad-output/implementation-artifacts/deferred-work.md
source_spec: `spec-5-3-docs-links-out-and-the-path-loses-its-space.md`
severity: medium
reason: `_bmad-output/implementation-artifacts/deferred-work.md` carries 22 occurrences of `docs/Self-hosting research.md` inside entries whose `status:` is still `open`. DW-22 ("§2.1 / §2.2 / §8") and DW-51 ("§7.1-§7.4") describe fenced copies this story deleted, and DW-47 cites `docs/Self-hosting research.md:670`, a line number in a file that lost ~180 lines above it. The ledger is orchestrator-owned — this session may not re-open, rewrite or resolve its entries — so the correction has to come from a sweep run.
status: open
decision: 2026-09-24 Run it as a bundle anyway and accept the fast-forward merge hazard — In a normal bundle session, rewrite citations only inside _bmad-output/implementation-artifacts/deferred-work.md: replace every `docs/Self-hosting research.md` with `docs/self-hosting-research.md`, re-anchor the section and line references Story 5.3 moved (DW-22's §2.1/§2.2/§8, DW-51's §7.1-§7.4, DW-47's :670), and re-anchor the src/mastra/index.ts line citations against the src/mastra/config/ modules Epic 5 extracted. Headings, status lines, reason prose and ids stay byte-identical — only pointers change. Expect to reconcile against the ledger closes this sweep writes in the main checkout before the branch can fast-forward.
decision: 2026-09-24 Authorize a ledger-maintenance pass — Authorize a single session, exempted from the usual prohibition on editing _bmad-output/implementation-artifacts/deferred-work.md, to rewrite citations only: replace every `docs/Self-hosting research.md` with `docs/self-hosting-research.md`, re-anchor the section and line references Story 5.3 moved, and re-anchor the src/mastra/index.ts line citations DW-68 records against the config modules Epic 5 extracted. Headings, status lines, reasons and ids stay byte-identical — only pointers change — and the pass must run outside a story worktree so it cannot collide with the orchestrator's own ledger writes.

### DW-68: Three `src/mastra/index.ts:N` citations in `_bmad-output/planning-artifacts/epics.md`, and nine in `_bmad-output/implementation-artifacts/deferred-work.md`, name lines the entry no longer holds.
origin: spec-deferred aab19e90f9fd
location: _bmad-output/planning-artifacts/epics.md:303,308,314
source_spec: `spec-5-4-a-config-module-with-recorded-provenance-holding-storage-vec.md`
severity: low
reason: `epics.md:303` cites `src/mastra/index.ts:45` for `positiveInt`, `:308` cites `:52` for `decodeCredentialEncryptionKey`, `:314` cites `:204` for `localSandboxEnv`. All three were ALREADY stale at baseline `b321370` — the functions sat at `:50`, `:64` and `:272` there — and this story shifted them again, to `:57`, `:71` and `:259`. `deferred-work.md` carries `index.ts` anchors in DW-25 (`:576-578`, now `:527-529`), DW-54 (`:69-86`), and six more. Not repaired here: the intent's Never clause forbids rewriting anything under `_bmad-output/`, and the deferred-work ledger is the orchestrator's to edit. Settling this needs a pass that owns both files at once.
status: open

### DW-74: Two of the sandbox module's env reads are unpinned: `E2B_API_KEY`'s `.trim()` and `MASTRACODE_LOCAL_SANDBOX_ROOT`, which no test in `src/` stubs at all, leaving the `LocalSandbox` working-directory
origin: spec-deferred ccb46363581e
location: src/mastra/config/sandbox.ts:271,280
source_spec: `spec-5-5-extract-auth-integrations-and-sandbox.md`
severity: low
reason: `src/mastra/config/sandbox.ts:271` and `:280`. `E2B_API_KEY` is stubbed in eight places in `config/sandbox.test.ts` but never to a whitespace-only value, so dropping the `.trim()` leaves the suite green; `MASTRACODE_LOCAL_SANDBOX_ROOT` appears nowhere under `src/` outside the module. Verified pre-existing: `git show 4ba3bd4:src/mastra/index.test.ts` mentions `MASTRACODE_LOCAL_SANDBOX_ROOT` zero times, so the relocated blocks moved this gap intact rather than creating it. Every other trim in the module (image, provider, workdir) has a dedicated case; closing these two is new coverage for unchanged behaviour.
status: open

### DW-75: The concern import order inside `src/mastra/config/factory.ts` carries the boot's evaluation order — which diagnostic an operator sees first when several things are wrong — and no test or guard reads
origin: spec-deferred 0d5e45dddd54
location: src/mastra/config/factory.ts:36-43
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: low
reason: Hoisting `import { auth, secretEncryption } from './auth'` above `./pubsub` in `config/factory.ts` leaves 120/120 tests and all 42 gate commands green. Verified pre-existing: the identical import block sat in `src/mastra/index.ts` at baseline `8b1fd1c` with exactly the same absence of cover, and Story 5.5's review logged and rejected the same finding against the entry. `config/factory.ts:26-35`, `config/README.md:78-86` and five module docstrings all assert the coupling holds. The cheap close is a case in `config/factory.test.ts` that stubs `REDIS_URL` plus a Slack group that throws and asserts the ordered `console.log` / `console.warn` / throw sequence.
status: open

### DW-77: The Slack integration's `uiOrigin` slot — the origin every account-link redirect is built against — is asserted nowhere under `src/`, so severing it from the one `MASTRACODE_PUBLIC_URL` read leaves
origin: spec-deferred 5d1e552c348e
location: src/mastra/config/integrations.ts:103
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: medium
reason: Changing `integrations.ts:103` to `uiOrigin: undefined` keeps `tsc` clean (the slot is `uiOrigin?: string`), 121/121 tests passing and all 42 gate commands at exit 0: guard 41 counts read sites, guards 35/37 parse the factory call's property list, and `SlackIntegration.diagnostics()` returns only booleans, so no public member exposes the value. Verified pre-existing: `uiOrigin: publicUrl` sat at `config/integrations.ts:108` at baseline `8b1fd1c` with exactly the same absence of cover (`git grep uiOrigin 8b1fd1c -- src` returns that one line). The consequence if it is severed is that Slack redirects resolve against the API origin instead of the SPA origin. The cheap close is not cheap here: the house style in `integrations.test.ts` deliberately does not stub integration packages, so observing the value means either capturing the `SlackIntegration` constructor argument or driving its connect route.
status: open

### DW-78: Four test suites now carry their own hand-maintained environment-sweep prefix list, and a prefix added to one does not reach the others — a case can inherit an ambient value it never mentions.
origin: spec-deferred 29b6e5bc8722
location: src/mastra/config/factory.test.ts:77
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: low
reason: `src/mastra/index.test.ts:42,70`, `config/auth.test.ts:38,43`, `config/sandbox.test.ts:30,36` and now `config/factory.test.ts:77,78` each declare their own `*_ENV_PREFIXES` / `*_ENV_EXACT` pair; `factory.test.ts`'s comment asserts it is "the same list" as `../index.test.ts` and nothing enforces that. Verified pre-existing: three of the four suites carried their own copies at baseline `8b1fd1c`, so the new file follows the house pattern rather than introducing it. The fix — exporting one pair from a shared module and importing it in all four — is a test-infrastructure refactor across suites this story does not otherwise touch.
status: open

### DW-85: No `[verify].commands` entry may run a mutating `docker compose` subcommand — above all `down -v` from a worktree — and nothing enforces that rule; pinning the project name is exactly what made it
origin: spec-deferred 9c27b0cf4e0d
location: .bmad-loop/policy.toml [verify].commands (the rule is stated in the guard-50 comment paragraph)
source_spec: `spec-compose-file-hardening-and-gate-2.md`
severity: medium
reason: Carried forward from the previous attempt of this bundle and re-confirmed here. Before the pin, a worktree's Compose commands addressed a directory-scoped project, so a `down -v` there was inert; after it, `POSTGRES_PASSWORD=x docker compose config` from this worktree resolves to project `mastra-factory`, and `docker volume ls` shows `mastra-factory_mastracode-web-pgdata` is the only volume on this host — AGENTS.md:31 records it as the only copy of projects, work items, sessions, memory and tokens, with no backups. Grepping all 52 command bodies, only indices 27, 48, 49 and 51 invoke `compose` and all four call `config` only; none of them reads `.bmad-loop/policy.toml`, so the rule exists only as prose in the comment block. Not patched here because the fix is not trivial: a guard that reads its own array and rejects a mutating `docker compose` subcommand would match its own text and every sibling guard's explanatory message, so it needs a self-exclusion rule this file has no precedent
status: open

### DW-88: `_bmad-output/planning-artifacts/epics.md` still carries the claim this change corrected, and `AGENTS.md` cites that file as a normative pointer, so the two now contradict each other.
origin: spec-deferred 8ebb66b5954d
location: _bmad-output/planning-artifacts/epics.md:319,325 vs AGENTS.md:44
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: epics.md:319 says the gate runs "`npm run check`, and two guards" and :325 warns against deleting "the two guards"; `[verify].commands` holds 55. AGENTS.md:44 lists `_bmad-output/planning-artifacts/epics.md` under "Where things are", and `.claude/skills/bmad-project-context/SKILL.md:70` calls two live contradictory instructions a defect. Not fixed here: epics.md is a frozen record of the plan and sits outside the two files this change is allowed to edit. Smallest fix is either correcting those two lines or marking epics.md as historical where AGENTS.md points at it.
status: open

### DW-89: The pre-existing `[verify]` narrative at the head of `.bmad-loop/policy.toml` still describes the array as it was at four entries, in the same file whose new comment block preaches against exactly
origin: spec-deferred 7c6621d28295
location: .bmad-loop/policy.toml:33,44
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: `.bmad-loop/policy.toml:33` reads "The two guards after the typecheck enforce AD-4 and AD-9/AD-13" and :44 describes `npm test` as appended to a two-guard list; the array holds 55 entries and AGENTS.md now directs every session to read it as the live list. No gate command reads those comment lines. Pre-existing — it predates this change and none of the six ledger entries recorded it — so it is filed rather than patched here.
status: open

### DW-90: Nothing re-proves that the three guards still DETECT anything; a narrowing edit turns one into a green no-op that is indistinguishable at the gate from a guard that passed.
origin: spec-deferred dd040e10ac59
location: .bmad-loop/policy.toml [verify].commands entries 53, 54, 55
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: Measured by the verification-gap layer: narrowing guard 55's token pattern from `[A-Z][A-Z0-9_*?]*` to `[A-Z][A-Z0-9_]*` — the shape of the earlier draft, and a plausible "tidy this to a legal key name" edit — makes `` `WORKOS_*` `` match nothing, so arms (a) and (b) see zero offenders. With the glob restored onto the unset bullet the shipped guard exits 1 and the mutated one exits 0; the `keys.length < 5` sentinel does not fire because the other 13 tokens remain. `npm test` is `vitest run --dir src` and no test under `src/` executes entries 53-55, so the only evidence they detect anything is the by-hand break/revert matrix — run twice in this session (19 cases, then 26 more after the review patches), and recorded in the `[verify]` comment block. Not fixed here: the smallest real fix is a canary arm per guard, running its own extraction over an in-program fixture. That is a substantial rewrite of three ~3,000-character programs inside TOML `'''` literals whose quoting already forbids
status: open

### DW-91: DW-87 is `status: open` in the deferred-work ledger, but this change resolved it; its `reason` field also still describes the pre-repair tree.
origin: spec-deferred 875a6421c806
location: _bmad-output/implementation-artifacts/deferred-work.md DW-87
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: The ledger entry prescribes "Smallest fix: reword that one comment clause", which this change applied at `docker-compose.yml:12`, and asserts "54 pass, only 51 fails" — measured now, the full array is 55 of 55 and entry 51 exits 0. Not fixed here because the intent's Boundaries say "Do not edit the deferred-work ledger or the sprint board; the orchestrator records resolution", and DW-87/88/89 were written into the ledger by the orchestrator (`origin: spec-deferred`), not by a dev session. Left for the orchestrator to close on integration; recorded here so a later sweep does not re-do finished work from a stale reason.
status: open

### DW-92: This change edits one comment clause of `docker-compose.yml`, which the intent's "Always" section pins outside its two-file scope.
origin: spec-deferred c3cd5bd361eb
location: docker-compose.yml:12 vs spec `<intent-contract>` Boundaries & Constraints
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: `[verify].commands` entry 51 was red at baseline and had been since it was added: it reconciles every `--wait-timeout <digits>` written in `docker-compose.yml` against `package.json scripts[db:up]`, and the file's line 12 explained the default in prose with that exact token. The orchestrator's deterministic gate failed on it and re-dispatched this session to repair the tree. No fix existed inside `AGENTS.md` or `.bmad-loop/policy.toml`: the array is append-only by the same "Always" section, so entry 51 could not be amended. The excursion is one YAML comment clause — no service, image, port, volume or healthcheck field — and it is what makes the acceptance criterion "all 55 exit 0" reachable. Recorded rather than hidden; the three acceptance/boundary/verification lines that still assert a two-file diff sit inside the read-only `<intent-contract>` and were deliberately not edited.
status: open

### DW-93: Guard 54 reads backtick-anchored tokens only, so a tracked path called gitignored in unbackticked prose still passes.
origin: spec-deferred 89ff546b6a8d
location: .bmad-loop/policy.toml [verify].commands entry 54
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: Measured twice: a clause reading "The file docs/self-hosting-research.md is gitignored." exits 0 both before and after this pass's guard-54 patches. Kept as a known limit rather than widened: the managed block backticks every path it names, and the fix — matching ~100 raw tracked-path strings against clause text — measurably false-fails on correct prose (the already-backticked contrast clause "unlike `.env`, `package.json` is never gitignored" exits 1 today). The intent's I/O matrix specifies the backticked form for this row.
status: open

### DW-96: DW-90's recorded demonstration no longer reproduces, so a sweep that re-runs it as written will conclude the entry is closed while the gap it describes is still open.
origin: spec-deferred fcc9f07a7c47
location: _bmad-output/implementation-artifacts/deferred-work.md DW-90
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: DW-90 says narrowing guard 55's token class from `[A-Z][A-Z0-9_*?]*` to `[A-Z][A-Z0-9_]*` makes the guard exit 0 with `` `WORKOS_*` `` restored to the unset bullet. Measured on this tree: the mutated guard exits 1, because arm (c) — the unbackticked glob scan over the sliced unset bullet, added after that measurement was taken — matches `WORKOS_*` with or without backticks. The underlying gap is still real and was re-demonstrated here by a different mutation: narrowing guard 53's denial window from `j<=i+4` to `j<=i+1` turns that arm into a permanent exit 0 with "There is no automated test script here." in the section, and no sentinel fires. Not fixed here: DW-90 lives in the deferred-work ledger, which the intent's Boundaries and this run's dispatch both put off-limits to a dev session. Filed so the orchestrator can refresh the demonstration rather than close the entry on a stale one.
status: open

### DW-98: The verify gate reads neither `engines` nor root `dependencies`, so the new `engines.npm` floor is asserted by nothing and can silently desync from the `packageManager` pin it was chosen to match.
origin: spec-deferred b6cce4948e11
location: .bmad-loop/policy.toml [verify].commands / package.json engines.npm
source_spec: `spec-package-json-declaration-hygiene.md`
severity: medium
reason: All 55 entries of `[verify].commands` were enumerated and scanned: the string `engines` appears zero times in `.bmad-loop/policy.toml`. The seven commands that read `package.json` (20, 34, 43, 48, 51, 52, 53) read only `scripts`, `@mastra/factory`'s pinned version, `packageManager` and `workspaces`. No vitest suite reads the manifest. So deleting `engines.npm` in a later change leaves the gate green, and — the sharper case — guard 43's own remediation text instructs an operator to bump `packageManager` and regenerate the lockfile, which desyncs the floor without any signal. The floor then admits an npm below the one the lockfile was produced by, which is the condition DW-84 added it to detect. Smallest fix: append one `sh -c` guard to `[verify].commands` (the array is append-only) asserting `engines.npm` equals `">=" + packageManager` with the `npm@` prefix and any `+sha512` suffix stripped. Not done here: this bundle's intent enumerates three edits (drop the dependency, add the floor,
status: open

### DW-99: SPEC.md:76's normative "the packages for the ruled-out paths stay installed" now rests solely on `@mastra/factory@0.15.0`'s own dependency edge, which nothing in this repo asserts.
origin: spec-deferred ef4d0178adc7
location: package.json dependencies / _bmad-output/specs/spec-self-hosted-factory/SPEC.md:76
source_spec: `spec-package-json-declaration-hygiene.md`
severity: medium
reason: Before this change the root declaration was itself the pin: `npm ci` could not produce a tree lacking `@mastra/auth-workos`. After it, the only remaining edge is `packages["node_modules/@mastra/factory"].dependencies["@mastra/auth-workos"] === "1.6.5"` — a third party's internal choice. A later `@mastra/factory` bump that drops or renames that dependency would violate a constraint SPEC.md marks normative and resolved, and every one of the 55 gate commands would still exit 0: none reads `dependencies`, none inspects `node_modules`, and no first-party module imports the package. The spec's own proof (`node -p "require('./node_modules/@mastra/auth-workos/package.json').version"`) is a one-shot verification command, not a gate entry, so it never runs again. Not closed here: the edge holds today at the pinned `@mastra/factory@0.15.0`, and AGENTS.md:30 already forces a deliberate one-way review at the next bump, which is the natural moment to either add a gate assertion or restore the root
status: open

### DW-100: `">=11.17.0"` is a one-directional floor, so it covers only half of DW-84's stated failure — an npm *newer* than the one that produced the lockfile satisfies it silently.
origin: spec-deferred 39534d1cb68c
location: package.json engines.npm
source_spec: `spec-package-json-declaration-hygiene.md`
severity: low
reason: DW-84's diagnosis is "a host without corepack silently runs a different npm than package-lock.json was produced by". An open-ended `>=` warns (EBADENGINE, never fails, since there is no `.npmrc` and `engine-strict` is off) only on npm below 11.17.0. An npm 12 host — the case that can rewrite `lockfileVersion` — satisfies the floor and emits nothing. DW-84's operative complaint, that "pin and host moving together away from the npm that generated the lockfile stays green", is therefore as green after this change as before for any host npm >= 11.17.0. Not addressed here: DW-84 names `"npm": ">=11.17.0"` verbatim as its smallest fix and this bundle's intent repeats that value, so narrowing it to a bounded range would contradict the intent rather than fulfil it. Settling it needs a decision on the upper bound, the same shape of question DW-3 carries for `engines.node`.
status: open
decision: 2026-09-25 Bound it to the 11 major — Narrow package.json engines.npm from ">=11.17.0" to ">=11.17.0 <12.0.0", so a host npm that could rewrite lockfileVersion falls out of the declared range, and state in the same change that the bound moves with packageManager — which is the reconciliation guard the gate-guards-manifest-invariants bundle appends for DW-98, so the two must agree on the parse. Mirror the DW-3 decision's shape: declare the majors this deployment actually supports rather than an open bound.

### DW-102: Two enum declarations reject the bare, unquoted values README.md tells the operator to write, so a .env following the documented instruction refuses to boot.
origin: spec-deferred 8bea9d7efda5
location: .env.schema:542 (MASTRACODE_DISTRIBUTED_LOCK), .env.schema:557 (VITE_REACT_GRAB)
source_spec: `spec-env-schema-key-list-cleanup.md`
severity: medium
reason: Measured on this tree with a temporary .env holding `MASTRACODE_DISTRIBUTED_LOCK=0` and `VITE_REACT_GRAB=true`: `npx varlock load --format json` exits 1 and names both keys. varlock coerces an unquoted .env number/boolean before enum validation, and these two declarations list only the quoted members — `enum("", "0", "1")` at .env.schema:542 and `enum("", "true")` at :557 — unlike MASTRA_PLATFORM_GITHUB_POLLING_ENABLED (:201) and MASTRACODE_GITHUB_RECONCILE_ENABLED (:385), which list the bare forms alongside and carry the comment explaining why. README.md:283 tells the operator `0` is the value for a single process with no database. Pre-existing and untouched by this change: the diff does not touch either declaration (`git diff <baseline> -- .env.schema | grep -c 'DISTRIBUTED_LOCK\|VITE_REACT_GRAB'` returns 0). Fix is to add the bare members to both enums, the way the two working keys already do.
status: open

### DW-103: Nine further environment keys that @mastra/factory reads are declared in neither .env.schema nor .env.example — the same defect class DW-43 named, for other families.
origin: spec-deferred 8d565ddda17f
location: .env.schema, .env.example
source_spec: `spec-env-schema-key-list-cleanup.md`
severity: low
reason: `grep -rhoE 'process\.env\.MASTRACODE_[A-Z0-9_]+' node_modules/@mastra/factory/dist` filtered against `^KEY=` in .env.schema returns, undeclared: MASTRACODE_EXPERIMENTAL_SUBCONSCIOUS, MASTRACODE_INCIDENT_IO_RECONCILE_ENABLED, MASTRACODE_INCIDENT_IO_RECONCILE_INTERVAL_MS, MASTRACODE_PLATFORM_GITHUB_{PR,ISSUE}_RECONCILE_{ENABLED,INTERVAL_MS} and MASTRACODE_PLATFORM_GITHUB_RECONCILE_INTERVAL_MS, MASTRACODE_PLATFORM_LINEAR_POLLING_ENABLED. Pre-existing: DW-43 scoped this story to the four MASTRACODE_GITHUB_*RECONCILE* keys, and all seven MASTRACODE_GITHUB_* names in the package are now declared. Gate command 26 only censuses first-party `src/` reads, so package-read keys are invisible to it and this class does not self-report. Deciding each one is a schema decision (@public, sensitivity, type) of the kind AD-6 assigns to the owning subject, and the MASTRACODE_PLATFORM_GITHUB_* set in particular needs the README.md-vs-apps/github/README.md ownership call the two confusable families already
status: open
decision: 2026-09-25 Declare the reachable families, record the rest — Declare in .env.schema, and mirror into .env.example, the keys this deployment could plausibly set — the MASTRACODE_PLATFORM_GITHUB_{PR,ISSUE}_RECONCILE_* and MASTRACODE_PLATFORM_GITHUB_RECONCILE_INTERVAL_MS set, and MASTRACODE_PLATFORM_LINEAR_POLLING_ENABLED — each with @public/sensitivity/@type chosen per key and the MASTRACODE_PLATFORM_GITHUB_* family assigned to apps/github/README.md under AD-6, with a comment distinguishing it from the MASTRACODE_GITHUB_* family already there. Record the remaining keys (the incident.io pair and connection id, MASTRA_INTEGRATIONS_API_URL, MASTRA_PLATFORM_APP_SLUG, MASTRA_PLATFORM_REGION, MASTRA_PROJECT_ROOT, MASTRA_TELEMETRY_DISABLED, MASTRACODE_EXPERIMENTAL_SUBCONSCIOUS) in one comment block naming why each is deliberately undeclared. Mind the parity guard, which compares .env.schema and .env.example key-for-key and in order.

### DW-104: AD-4's "or other program source" category is still unenforced for non-TypeScript/JavaScript languages — guard 5 is an extension filter, not a category rule.
origin: spec-deferred 92b5f8411c08
location: .bmad-loop/policy.toml [verify].commands guard 5
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: low
reason: Measured in this worktree: a tracked `ops/probe.py` passes guard 5 and every other command in `[verify].commands` (61/61 green). The widening this change made closes the eight-extension TypeScript/JavaScript family only, which is the fix DW-57's ledger text prescribed; AD-4's rule text enumerates four extensions and then says "or other program source", with an `ops/*.sh` carve-out. Closing the category needs either a language-agnostic rule or AD-3-style derivation from the spine, and the extension list cannot express it. Recorded in the guard's own comment block as a stated limit.
status: open
decision: 2026-09-25 Amend AD-4 to a closed extension set — Amend AD-4 in ARCHITECTURE-SPINE.md to replace "or other program source" with a closed, enumerated set of program-source extensions (the eight TypeScript/JavaScript ones plus .py, .rb, .go, .rs, .sh, .pl, .php) and keep the ops/*.sh carve-out as an explicit exception row, so the rule text says exactly what a grep can check. Then append a guard whose pathspec is that set, derived from the spine the way the root closed-set guard derives AD-3's table, so the rule and its enforcement cannot drift. Verify by confirming a tracked ops/probe.py now fails and the three real ops/*.sh files still pass.

### DW-105: No gate command reads the `cd "$REPO_ROOT"` line in ops/factory-start.sh, so the wrapper can still be pointed at another manifest without touching its exec line.
origin: spec-deferred 3dad0c8060f8
location: ops/factory-start.sh:129
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: medium
reason: Measured: rewriting `ops/factory-start.sh:129` from `cd "$REPO_ROOT"` to `cd /tmp` leaves all 61 commands green. npm then resolves whatever package.json is nearest that directory, so `npm run start` never reaches this repository's `varlock run --` prefix — the same bypass new entry 61 closes on the exec line, one line above it. The baked-repo-root guard pins the `readonly REPO_ROOT=` literal against ops/install.sh and the plist, but nothing asserts that the `cd` actually uses it. AD-11 names "must work with the repo root as cwd" as part of the same rule. Smallest fix: one arm on the wrapper asserting the last `cd` before the exec is `"$REPO_ROOT"`.
status: open

### DW-106: Only one key's VALUE is reconciled between .env.schema and .env.example; the parity guard compares key names and order only, so every other default can drift in the file the operator deploys from.
origin: spec-deferred 8ff8e9630cee
location: .bmad-loop/policy.toml [verify].commands (the .env.schema/.env.example parity guard) / .env.example
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: low
reason: The schema/example parity guard strips values with `sed "s/=.*$//"` and compares key names and order, so a drifted value in `.env.example` is invisible to it. This change added a value comparison for `MASTRACODE_SANDBOX_WORKDIR` alone, because that is the key DW-80 named. Measured before that arm existed: setting `.env.example`'s copy to `/srv` left all 61 commands green, and `.env.example` is the file the operator copies to `.env`, so its value is the one that wins at runtime. Every other defaulted key in that file has the same exposure. Smallest fix: extend the parity guard to compare values for keys whose schema declaration carries a non-empty default, rather than one key at a time.
status: open

### DW-107: `sandbox/README.md` is a fifth copy of the sandbox workdir and guard 46 cites it as the binding it protects, but nothing reconciles it.
origin: spec-deferred 282f385e6563
location: sandbox/README.md:54,167-169 / .bmad-loop/policy.toml [verify].commands guard 46
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: low
reason: Guard 46's own messages say `sandbox/README.md` "ties MASTRACODE_SANDBOX_WORKDIR to it by sight", and that README writes `/workspace` in prose at :54 and :167-:169. The guard reconciles the four machine-readable copies and cannot read the fifth: it is documentation, not a declaration, so an arm for it would be a grep for a path substring in English. Pre-existing — the README predates this change, and guard 30 already polices what may and may not appear in the six READMEs without touching values. Measured: rewriting every `/workspace` in that file to `/srv` leaves all 61 commands green. The boundary is now stated in guard 46's comment block rather than left to be rediscovered. Smallest fix: one arm requiring the README to carry the `wd` guard 46 already extracted, at least once, accepting that it asserts presence rather than absence of drift.
status: open

### DW-108: Guard 26's array-literal arm and guard 41's sixth spelling see SINGLE-LINE literals only, so an undeclared key in a literal wrapped across lines is still invisible to both.
origin: spec-deferred ccfecb4901cc
location: .bmad-loop/policy.toml [verify].commands guards 26 and 41
source_spec: `spec-gate-guards-env-resolution-census.md`
severity: low
reason: Measured in this worktree: adding const ZZ_EXTRA = [ 'MASTRA_ZZUNDECLARED_ONE', ]; export const zzHas = ZZ_EXTRA.some(key => Boolean(process.env[key])); to `src/mastra/config/sandbox.ts` leaves guards 26 and 41 — and every other entry of `[verify].commands` — at exit 0, while the same key added to the single-line literal at `:288` fails guard 26 naming `file:line:token`. Both arms join quoted tokens to the computed index BY LINE NUMBER, which is what keeps the `LOCAL_SANDBOX_ENV_KEYS` host-variable sweep correctly invisible and what leaves this class open. Prettier wraps such a literal the moment it exceeds the print width, so the shape is reachable without anyone choosing it. Not closed here for the reason DW-62's own ledger text gives: reading array elements across lines needs a parser rather than a grep, which is a new mechanism rather than a direct correction. The guard's comment now scopes itself to single-line literals and states this residual instead of claiming the class is
status: open

### DW-109: Entry 63 resolves .env.schema against the LaunchAgent PLISTS only, but launchd runs ops/factory-start.sh, which exports its own pairs on top — so a declared key the wrapper sets is value-checked by
origin: spec-deferred 754a26968fc8
location: .bmad-loop/policy.toml [verify].commands entry 63; ops/factory-start.sh:21-26
source_spec: `spec-gate-guards-env-resolution-census.md`
severity: medium
reason: Measured in this worktree: adding export MASTRACODE_MAX_SANDBOXES=abc to `ops/factory-start.sh` after line 26 leaves ALL 63 entries of `[verify].commands` at exit 0, while `env MASTRACODE_MAX_SANDBOXES=abc npx varlock load --format json` exits 1 — i.e. the next `launchctl kickstart` fails in exactly the way DW-61 describes. Entry 28 reconciles the wrapper's exported key NAMES against `.env.schema` but never resolves a value; entry 63 only overlays plist pairs. The wrapper also wins over the plist for keys both set: `ops/factory-start.sh:26` is `export DOCKER_HOST="unix://$DOCKER_SOCKET"`, one of the only two pairs entry 63 value-checks (the two happen to agree in value on this host, so nothing fails today). Not closed here because the wrapper's values are shell expressions that need the script's prologue RUN to resolve — a new mechanism rather than a wider grep — and because DW-61's own smallest-fix text named only the plists, so this is a residual of the ledger entry rather than a
status: open

### DW-110: Nothing in the verify gate reads `engines`, and `EBADENGINE` stays warn-only, so the narrowed Node range is declared but never observed or enforced.
origin: spec-deferred 6ee9fc57b23a
location: package.json:41 / .bmad-loop/policy.toml [verify].commands
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: medium
reason: `engines` appears zero times in `.bmad-loop/policy.toml`; the only entry that parses the manifest (the gate-script census) reads `scripts` and never touches `engines`. There is no `.npmrc` at the repo root and `npm config get engine-strict` is `false`, so `npm ci` exits 0 on an excluded major. Demonstrated: reverting `engines.node` to `">=22.19.0"`, or mistyping it as `"^22.19.0 || ^25.0.0"`, leaves every gate entry green; a scratch project declaring `"^20.0.0"` runs `npm ci --no-audit --no-fund` to exit 0 with only an `EBADENGINE` warning. This is DW-10's stated mechanism ("the gate would run its test runner on an unsupported runtime"), which the recorded 2026-09-24 decision addressed with a declaration rather than an enforcement mechanism. Closing it means appending one `[verify].commands` entry that asserts the fixed table (22.19.0 accepted, 23.11.0 rejected, 24.19.0 accepted, 25.0.0 rejected) and that `process.version` satisfies the declared range — which this bundle's scope
status: open

### DW-111: The Node fact is now stated in four artifacts with no arm tying any two together, so the freshly corrected AGENTS.md claim can drift again exactly the way DW-3 and DW-65 did.
origin: spec-deferred e1a49ac5d841
location: AGENTS.md:10
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: medium
reason: After this change the contract appears at `package.json:41`, `package-lock.json:33`, `AGENTS.md:10` ("Node 22.19+ or 24") and `ops/factory-start.sh:20` (`v24.19.0`, exact), plus the diagram at `docs/self-hosting-research.md:61`. Guards 53, 54 and 55 are the only entries that open AGENTS.md; none of them parses `engines`. Demonstrated: narrowing `engines.node` to `"^24.0.0"` alone and leaving AGENTS.md untouched keeps all 63 entries green while the block keeps telling agents "Node 22.19+ or 24". One appended guard could derive the admitted majors from `engines.node` and require the block's summary sentence to name exactly those.
status: open

### DW-112: The "only check" claim class this pass removed by hand is still caught by nothing, and the managed block is regenerated by bmad-project-context, so all four corrections can revert.
origin: spec-deferred fe2f48e236fe
location: AGENTS.md:14-19 and :52-60
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: medium
reason: DW-95 already records that guard 53's denial arm matches `no <script> script`, not an "only check" assertion, and re-measured green here: guards 53/54/55 exit 0 on both the old and the new wording of `AGENTS.md:17`, and on both the old and the new `npm ci` prose. The repo's own doctrine at `.bmad-loop/policy.toml:1991-1993` is that a hand patch inside the managed block is replaced on the next refresh while "a guard is not replaced", and `policy.toml:2010-2022` describes the one-story lag that follows. The intent's closing note ("every edit has to survive a refresh") is therefore satisfied only in the sense that the edits pass today's gate; nothing makes them durable. The array is append-only and this bundle's scope forbids appending, so the durable fix is a later story or a bmad-project-context post-write check.
status: open

### DW-113: `@types/node` is pinned to the 22 major while `engines.node` now declares 24 supported, so `tsc --noEmit` type-checks against Node 22 typings on either runtime.
origin: spec-deferred 6b457719552c
location: package.json:33
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: `package.json` devDependencies pin `"@types/node": "22.20.1"`. With 24 declared supported, the gate cannot see 24-only API surface as valid and would reject it on a supported runtime. Nothing in the change or the gate ties the typings major to `engines.node`.
status: open

### DW-114: npm does not validate the lockfile's root `engines` mirror against `package.json`, so a future manifest-only edit leaves the two silently out of step.
origin: spec-deferred c4d8d550813e
location: package-lock.json:33
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: Demonstrated on this machine (npm 11.17.0): a scratch project whose lock declares `packages[""].engines.node: ">=99.0.0"` while `package.json` declares `"^22.19.0 || ^24.0.0"` runs `npm ci --no-audit --no-fund` to exit 0 with no warning and no lock-mismatch error. This change regenerated the mirror correctly, but the "confirm the diff is confined to that one line" step is human-run and nothing repeats it.
status: open

### DW-115: Several installed packages declare Node ranges narrower than the new `engines.node`, so `EBADENGINE` warnings remain reachable inside the two admitted majors.
origin: spec-deferred 8f13ae685f56
location: package.json:41
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: Read from `package-lock.json`: `posthog-node` declares `^20.20.0 || >=22.22.0` (so 22.19.0 through 22.21.x warn), the 27 `@babel/*` packages declare `^22.18.0 || >=24.11.0` (so 24.0.0 through 24.10.x warn), and `@napi-rs/lzma-linux-x64-gnu` declares `^22.20 || ^24.12 || >=25`. Pre-existing — `">=22.19.0"` admitted all of these too — and warn-only either way, but it means the declared range is not the intersection of what the tree actually supports.
status: open

### DW-116: No operator-facing document states a Node prerequisite, so the human installing this on a fresh Mac never reads the majors this change decided.
origin: spec-deferred 2a3ef779606a
location: README.md
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: Root `README.md`, `docs/`, `ops/README.md` and `sandbox/README.md` carry no Node version statement; the version appears only in `ops/factory-start.sh:20`'s `NODE_BIN` pin, the `docs/self-hosting-research.md:61` diagram, and now `package.json` and the AGENTS.md block — none of which is the setup path. Editing `README.md` adds no root file, so AD-3 does not block it; it is simply outside this bundle's two named files.
status: open

### DW-117: `mastra build` no longer copies the Factory UI into `src/mastra/public/factory/`, so a deploy build may ship without the Factory SPA.
origin: spec-deferred 4b10c80d854a
location: src/mastra/index.ts / node_modules/mastra/dist/index.js:1265
source_spec: `spec-dw-4-gitignore-factory-build-output.md`
severity: medium
reason: `node_modules/mastra/dist/index.js:1265` calls `buildFactoryUI()` only when `analyzeEntryProjectType(src/mastra/index.ts)` returns `'factory'`, which `node_modules/@mastra/deployer/dist/build-JNlRQOvG.js:200` grants only when the entry file itself imports AND constructs `MastraFactory`. Story 5.6 / AD-8 moved that construction into `src/mastra/config/factory.ts`, so the entry names `MastraFactory` only in comments and the project type resolves to `undefined`. Measured here: two successive `npm run build` runs logged `Copying public files` / `Done copying public files` with no "Copying Factory UI" line, exited 0, and left `src/mastra/public/` absent. `buildFactoryUI` (index.js:1062) is the only writer into `src/mastra/public/` in the toolchain; the other two `join(mastraDir, "public")` sites (:4761, :4773) pass it to `startServer` as a read-side `publicDir`. What is unsettled is the consequence: whether the served deployment actually needs that SPA at that path.
status: open

### DW-118: Nothing in `[verify].commands` asserts the two `git check-ignore` outcomes, so a future `.gitignore` edit can silently re-shadow the documented skill-override location.
origin: spec-deferred 3f94b96ad5a4
location: .bmad-loop/policy.toml [verify].commands
source_spec: `spec-dw-4-gitignore-factory-build-output.md`
severity: medium
reason: All 63 entries of the `commands` array at `.bmad-loop/policy.toml:3205` were enumerated and run: none probes `src/mastra/public/factory/` or `src/mastra/public/factory-skills/`. The only `git check-ignore` call in the file is inside the AD-3 root guard (line 3225), which filters to root-level entries, so a rule nested under `src/mastra/` cannot move it. The AGENTS.md tracked-path guard (line 3259) keys off `git ls-files`, and nothing under `src/mastra/public` is tracked. Reverting line 8 to `src/mastra/public/` therefore leaves all 63 entries green. Fix is an append of one `sh -c` guard running both probes with their expected exit codes; held back here because DW-4 specifies the smallest fix as the `.gitignore` edit alone and the gate file is orchestrator-owned.
status: open

### DW-119: No gate entry observes the working tree after `npm run build`, so build output landing on a now-uncovered path under `src/mastra/public/` would ship green.
origin: spec-deferred 565bf5c057d2
location: .bmad-loop/policy.toml:3247
source_spec: `spec-dw-4-gitignore-factory-build-output.md`
severity: medium
reason: `npm run build` is entry 42 (`.bmad-loop/policy.toml:3247`). The only two `git status --porcelain` entries in the array are path-scoped to `.agents/skills` (3211) and `skills-lock.json` (3229), and both run before the build — `.bmad-loop/policy.toml:1191` says so itself. Narrowing the ignore rule removes the parent-directory cover that used to absorb any future change to the copy target, so the gap matters more after this change than before it. Fix is an append of `sh -c 'git status --porcelain | grep . && exit 1 || exit 0'` directly after entry 42 — the assertion this spec's Verification section runs by hand but never installs.
status: open

### DW-120: `.bmad-loop/policy.toml:1191` still says `src/mastra/public/` is gitignored; after this change only `src/mastra/public/factory/` is.
origin: spec-deferred 930d0573617b
location: .bmad-loop/policy.toml:1191
source_spec: `spec-dw-4-gitignore-factory-build-output.md`
severity: low
reason: The comment records, as the measured reason `npm run build` leaves the tree clean, that "`.mastra/` … and `src/mastra/public/` are both gitignored". The substantive claim still holds (measured again here), but the stated reason is now one segment too wide, and a future agent reading it could conclude the whole subtree is covered and skip adding cover for a new build output path. One-word correction; left alone because the spec forbids touching the orchestrator-owned policy file.
status: open

### DW-121: The deliberate asymmetry this change introduces — previous-key values are trimmed, their ids are not — is enforced only by a code comment; no test pins it.
origin: spec-deferred 61b39fef503c
location: src/mastra/config/auth.ts:123
source_spec: `spec-dw-6-7-71-credential-key-validation.md`
severity: low
reason: `src/mastra/config/auth.ts:123` trims the value and passes `id` through verbatim, with a five-line comment stating why (an id must keep matching what was recorded alongside existing ciphertext). Adding `id.trim()` there leaves the whole suite green: the value-trim test uses the id `v1` with no whitespace, and `FactorySecretEncryption` exposes only `encrypt`/`decrypt`, so no property read can observe an id. Pinning it needs either an encrypt-then-decrypt round trip across two module generations or a `vi.mock` of `@mastra/factory` asserting the `previous` array — neither has precedent in this suite. The risk is a future edit rather than anything this diff ships wrong; a round-trip test that fails on `id.trim()` would settle it.
status: open

### DW-122: A previous-key id that is empty, or that collides with the primary key id, aborts the boot with a `@mastra/factory` message that names no environment variable.
origin: spec-deferred 6029163fbba2
location: src/mastra/config/auth.ts:108-124
source_spec: `spec-dw-6-7-71-credential-key-validation.md`
severity: medium
reason: Verified by executing the package in this tree: `createFactorySecretEncryption({ primary: { id: 'v1', ... }, previous: [{ id: 'v1', ... }] })` throws `[FactorySecretEncryption] Duplicate key id "v1".`, and an empty id throws `[FactorySecretEncryption] Key id is required.` Neither names `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` or `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID`, which is exactly the boot-failure legibility problem this bundle exists to fix. Colliding with the primary is realistic: `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID` defaults to `v1`, so an operator who adds `{"v1": <old key>}` without also bumping the primary id hits it. Pre-existing and unchanged by this diff — the intent named exactly three defects, and this is a fourth in the same function. Smallest fix: validate the id against the resolved primary id before building the `previous` list and throw a message naming both variables.
status: open

### DW-123: A deployment that sets FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS while FACTORY_CREDENTIAL_ENCRYPTION_KEY is unset or blank returns before every validation in this function and stores credentials as
origin: spec-deferred 7073250f34a9
location: src/mastra/config/auth.ts:88-96
source_spec: `spec-dw-6-7-71-credential-key-validation.md`
severity: medium
reason: `src/mastra/config/auth.ts:88-96`: an unset or blank primary key warns and returns `undefined`, so the rotation blob is never read, no shape check runs, and `secretEncryption` is not built — a mid-rotation deployment that loses the primary key from its environment silently downgrades to plaintext at rest rather than refusing to boot. The console warning does fire, so it is not entirely silent, but nothing connects it to the rotation blob the operator did set. Pre-existing and unchanged by this diff: the same early return is present at baseline, and the intent named exactly three defects, none of them this one. Smallest fix: after the early-return branch, throw when the previous-keys variable is non-empty, naming both variables.
status: open

### DW-124: The product of FACTORY_SANDBOX_MEMORY_GIB (or FACTORY_SANDBOX_CPUS) and the configured MASTRACODE_MAX_SANDBOXES is never checked, so a raised concurrency count with a per-container knob at its bound
origin: spec-deferred 41d7045fb7fb
location: src/mastra/config/sandbox.ts:207
source_spec: `spec-dw-13-72-positive-int-and-sandbox-knob-bounds.md`
severity: medium
reason: The new bounds are derived from DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES (3), but the count that actually applies is positiveInt(process.env.MASTRACODE_MAX_SANDBOXES) in admitDockerSession. MASTRACODE_MAX_SANDBOXES=5 with FACTORY_SANDBOX_MEMORY_GIB=30 passes every check and commits 150 GiB on a 32 GiB VM — the oversubscription sandbox/README.md ("the two numbers are one decision") and docs/self-hosting-research.md:157 warn about. Pre-existing: nothing checked the product before this change either, and the intent prescribed the default-derived bound explicitly. The fix is a cross-check where the count is read (memoryGib * maxSandboxes against the host budget), which is new behaviour and a new refusal path neither DW-13 nor DW-72 asks for.
status: open

### DW-125: MASTRACODE_CHANNELS_PUBLIC_URL is still read raw, so a whitespace-only value is truthy, wins the ?? over the now-trimmed publicUrl, and mounts the Slack OIDC routes on a blank redirect base.
origin: spec-deferred c95e1aa56cd0
location: src/mastra/config/integrations.ts:105
source_spec: `spec-dw-67-69-70-73-76-config-env-trim-and-comment-accuracy.md`
severity: medium
reason: src/mastra/config/integrations.ts:105 is `process.env.MASTRACODE_CHANNELS_PUBLIC_URL ?? publicUrl`. `' '` is truthy, so it wins the `??` and reaches SlackIntegration as `oidcRedirectBaseUrl`; `oidcConfigured` is `Boolean(clientId && clientSecret && oidcRedirectBaseUrl)` (node_modules/@mastra/factory/dist/integrations/slack/integration.js:88), so the routes mount and every `redirect_uri` is built by appending `/connect/slack/oidc/callback` to whitespace — Slack answers `bad_redirect_uri`. integrations.test.ts covers only the present-and-empty `''` control, not whitespace. Pre-existing: the key was read raw before this change too. Deliberately out of scope here — the bundle names exactly three reads, and this key's rawness is what the present-and-empty operator control in apps/slack/README.md depends on, so a fix must preserve `''` (disabling) while making `' '` behave the same, which is a behaviour decision rather than a trim.
status: open
