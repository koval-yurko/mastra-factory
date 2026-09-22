---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - '_bmad-output/specs/spec-self-hosted-factory/SPEC.md'
  - '_bmad-output/specs/spec-self-hosted-factory/brownfield.md'
  - '_bmad-output/specs/spec-self-hosted-factory/extension-seams.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md'
  - 'docs/Self-hosting research.md'
  - '.bmad-loop/policy.toml'
---

# mastra-factory - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for mastra-factory, decomposing the requirements
from the SPEC (standing in for a PRD — none was authored) and the Architecture Spine into implementable
stories.

**Source note.** There is no PRD and no UX design contract. `SPEC.md` is the canonical requirements contract
and names its companions explicitly; `docs/Self-hosting research.md` is one of those companions, so its §2–§11
are normative detail, not background. `.bmad-loop/policy.toml` is not a requirements document — it is included
because it defines the verify gate stories must pass and the `[operator]` parking mechanism that roughly 60% of
this work depends on.

**Execution context.** Work targets `main` (revised 2026-09-22 — the earlier `bmad/self-hosting` branch
strategy is superseded). Stories are driven by bmad-loop with `scm.isolation = "worktree"`, so each story
still runs on its own branch in a fresh worktree containing tracked files only, merged into `main` on success.

## Requirements Inventory

### Functional Requirements

**Repo readiness**

FR1: The package manager is pinned so that `npm ci` in a fresh worktree resolves identically to the authoring machine (`package-lock.json` is already tracked as of commit `5e09129`).
FR2: The three pure helpers in `src/mastra/index.ts` — `positiveInt` (:45), `decodeCredentialEncryptionKey` (:52), `localSandboxEnv` (:204) — have automated tests that execute as part of the bmad-loop verify gate.

**CAP-1 — Docker sandboxes on this machine**

FR3: When `FACTORY_SANDBOX_PROVIDER` equals `docker`, the sandbox slot constructs a `DockerSandbox`, and that branch is evaluated **ahead** of the platform/E2B provider chain so a stray platform variable cannot move sandboxes off this machine.
FR4: Each sandbox is keyed by `ctx.sessionId`, is long-lived, and is reconnected by session id rather than torn down per command.
FR5: Sandbox resource ceilings are read from `FACTORY_SANDBOX_MEMORY_GIB` (default 10), `FACTORY_SANDBOX_CPUS` (default 4) and `MASTRACODE_SANDBOX_WORKDIR` (default `/workspace`), and are applied as hard caps (`memory`, `cpuPeriod`/`cpuQuota`, `pidsLimit` 4096, `timeout` 15 min).
FR6: A sandbox image exists that carries `git` and `gh` plus a generic toolchain, is built for `linux/arm64`, and is referenced by `FACTORY_SANDBOX_IMAGE`.
FR7: A session request past `MASTRACODE_MAX_SANDBOXES` (3) returns an actionable error rather than thrashing the host.
FR8: No repository is ever cloned onto the host filesystem — cloning happens inside the session's container.

**CAP-2 — Self-hosted identity with organizations**

FR9: `MastraAuthBetterAuth` replaces the WorkOS branch as the auth provider, constructed with `secret: BETTER_AUTH_SECRET` and an explicit `signUpEnabled` value.
FR10: Auth runs in deferred-instance mode so Better Auth's tables are created by `auth.init({ database: storage.authDatabase?.() })` in the same Postgres and on the same connection string as the application tables.
FR11: `/signin` authenticates by email and password against this deployment's own Postgres, with no redirect to any external identity provider.
FR12: The first login results in the user holding an organization (via `ensureOrganization`), because every integration is org-scoped on `(orgId, userId)`.
FR13: After registration is closed, the sign-up form is absent from the SPA and `POST /auth/api/sign-up/email` is refused.

**CAP-3 — Own GitHub App**

FR14: A GitHub App registered in Yurii's own account is configured with Contents R+W, Pull requests R+W, Issues R+W, Metadata R, Commit statuses R, Administration R and Checks R, and subscribes to `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issues`, `issue_comment`, `push`, `installation`, `status`, `label`, `repository`.
FR15: All five of `GITHUB_APP_ID`, `_PRIVATE_KEY`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_SLUG` are configured together, plus a permanently stable `GITHUB_APP_WEBHOOK_SECRET`.
FR16: A webhook delivery lands on `/web/github/webhook`, and one issue reaches a merged pull request through the App.

**CAP-4 — Own Linear app**

FR17: A Linear OAuth app owned by Yurii is registered with redirect URL `https://factory.kovalchuk.win/auth/linear/callback` and scopes `read`, `write`, `issues:create`, `comments:create`, `app:mentionable`.
FR18: `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` are set together (one alone is a boot error), and an issue routed from Linear reaches a work item while an @-mention of the app is received.

**CAP-5 — Own Slack app**

FR19: `apps/slack/manifest.yaml` exists as a real, authored file that creates a working Slack app — the package ships none.
FR20: The Slack app points Events and Interactivity at `…/api/agent-controllers/mastra-code/channels/slack/webhook`, OAuth redirect at `…/connect/slack/oidc/callback`, subscribes to `app_mention`, `message.channels`, `message.groups`, `message.im`, `message.mpim`, and has OpenID Connect enabled for account linking.
FR21: `SLACK_APP_SIGNING_SECRET`, `SLACK_APP_BOT_TOKEN`, `SLACK_APP_CLIENT_ID`, `SLACK_APP_CLIENT_SECRET` and `MASTRACODE_CHANNELS_PUBLIC_URL` are configured, a test delivery reaches the channels webhook, and account linking completes over OIDC.

**CAP-6 — Public ingress with no inbound ports**

FR22: A Cloudflare Tunnel forwards the public hostname to `http://127.0.0.1:4111` over plain HTTP, using outbound `7844` only — no inbound port, no forwarding, no static IP.
FR23: The server binds `127.0.0.1` literally (not `localhost`) via `MASTRA_HOST`, and sign-in works over HTTPS at `https://factory.kovalchuk.win`.
FR24: Every callback URL in the §4.1 registry is recorded in a repo file and registered at its provider, with `MASTRACODE_PUBLIC_URL` set to the public origin.

**CAP-7 — Unattended 24/7 supervision**

FR25: A LaunchAgent starts Colima with `--foreground` and the documented VM sizing; a second LaunchAgent starts Factory with an explicit `PATH`, `ProcessType: Interactive`, `ThrottleInterval: 30`, `KeepAlive` and `WorkingDirectory` pinned to the repo root.
FR26: A wait-for-socket wrapper polls the Colima Docker socket for up to 10 minutes before exec'ing `npm run start`, exiting non-zero for launchd to retry rather than crash-looping.
FR27: Log rotation is configured through `newsyslog` for `out.log`, `err.log` and `colima.log` at 7 generations of 10 MB, and the log directory is created before the agents are bootstrapped.
FR28: Power settings prevent sleep and enable auto-restart (`pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0`).
FR29: The deployment survives `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` and a full logout→login without a human running commands.

**CAP-8 — Operational artifacts are real files**

FR30: Every operational artifact exists as exactly one real file at its seeded path under the two-plane layout — no operational artifact exists only as a fenced block.
FR31: Every operator-plane subject directory carries a `README.md` stating what the operator must do and which env keys that subject owns.
FR32: `docs/Self-hosting research.md` references artifacts by repo-relative path; any remaining code block in `docs/` is marked non-normative, and existing section numbers are not renumbered.
FR33: No first-party `.ts`, `.js`, `.mjs` or `.cjs` exists outside `src/`, with the `ops/*.sh` carve-out the only exception.

**CAP-9 — Fully extracted entry with recorded provenance**

FR34: `src/mastra/index.ts` retains only imports, `factory.prepare()`, the literal `new Mastra(...)` and `factory.finalize()`; all environment reading and instance construction moves into `src/mastra/config/`, one module per concern, fully rather than partially.
FR35: `src/mastra/config/README.md` records the `@mastra/factory` version and template origin the entry was forked from, so a template update is a three-way diff.
FR36: After extraction, `npm run check` is clean and `npm run build` succeeds.

**CAP-10 — One store, no Redis**

FR37: The `redis` service is absent from `docker-compose.yml` and the server boots with `REDIS_URL` unset.
FR38: `docker-compose.yml` carries `restart: unless-stopped` and non-default database credentials.

### NonFunctional Requirements

NFR1: **Entry indivisibility (AD-2).** `src/mastra/index.ts` must export a `Mastra` named `mastra` built by a literal `new Mastra(...)` in that file — the deployer's `checkConfigExport` Babel plugin inspects the source. No re-export, no construction in a helper.
NFR2: **Compiler reach (AD-4).** `tsconfig.json` keeps `include: ["src/**/*"]`; widening it is a spine change. Anything outside `src/` is silently unverified because `tsc --noEmit` is the gate.
NFR3: **One npm package (AD-1).** Exactly one root `package.json` + `package-lock.json`, no `workspaces`, npm stays. A package-manager switch is a full dependency re-resolution — forbidden by the no-backups posture.
NFR4: **Two planes, one vocabulary (AD-3).** Provider/app subjects under `apps/`; host-infrastructure subjects at root, and root is a closed set. Operator-plane directories hold no first-party code and reach the code plane only through env vars and CLI invocation, never an import.
NFR5: **Skill override path (AD-9, AD-13).** Repo-local factory-skill overrides go only at `src/mastra/public/factory-skills/<skill-name>/SKILL.md`, and only the six bundled names resolve. `.agents/skills/` is hash-locked in `skills-lock.json` and must never be hand-edited.
NFR6: **Single machine, single process (AD-12).** No Redis, no replicas, no shared external queues, no cross-process leases. A design assuming any of those is a conflict to surface, not a local choice.
NFR7: **Env-key truth split (AD-6).** `.env.schema` is normative for validation, generated types and `@public`/sensitive marking and is the only list of keys; the owning subject's README is normative for what the value must contain and how to obtain it. Neither side restates the other's half.
NFR8: **One read site per env key (AD-7).** `process.env.X` appears at exactly one location in first-party code; consumers receive parsed values by argument or export. *(Adopted by Yurii, 2026-09-22.)*
NFR9: **Files canonical (AD-5).** One real file per operational artifact; prose links out. Section numbers in `docs/Self-hosting research.md` are stable citation anchors.
NFR10: **External contract (AD-11).** `npm run start` stays the production entry point and must work with the repo root as cwd. Renaming the script or moving the repo requires updating the plist, `ops/factory-start.sh` and the newsyslog conf in the same change.
NFR11: **Network posture.** `MASTRA_HOST` must be the literal `127.0.0.1` — unset binds all interfaces including the LAN. TLS terminates at Cloudflare; `MASTRA_HTTPS_KEY`/`_CERT` stay unset.
NFR12: **Zero-dependency mandate.** These must stay unset or self-hosting silently breaks: `MASTRA_SHARED_API_URL`, `MASTRA_PLATFORM_ACCESS_TOKEN`/`_SECRET_KEY`/`MASTRA_PROJECT_ID`/`MASTRA_ENVIRONMENT_ID`, `E2B_API_KEY`, `SANDBOX_PROVIDER`, `WORKOS_*`, `MASTRACODE_AUTH_DISABLED`.
NFR13: **Registration sequencing.** `signUpEnabled` defaults to `true`; the account is created while still on loopback and registration is closed **before** the public origin is switched on.
NFR14: **Credential safety.** `FACTORY_CREDENTIAL_ENCRYPTION_KEY` must be set before any credential is stored or provider keys and OAuth tokens persist as plaintext. `GITHUB_APP_WEBHOOK_SECRET` must be stable forever — it is also the primary OAuth-state signer, and unset it becomes random per process, breaking OAuth across restarts.
NFR15: **Public URL correctness.** `MASTRACODE_PUBLIC_URL` must be the public URL; a loopback value silently produces OAuth callbacks the browser cannot reach.
NFR16: **No backups.** The Postgres volume is the only copy of projects, work items, sessions, agent memory, integration tokens and auth tables. Every dependency bump is one-way — read the changelog first.
NFR17: **FileVault.** No unattended recovery from an unplanned reboot; planned restarts go through `fdesetup authrestart`. Accepted.
NFR18: **Secrets never enter the repo.** `.env` is gitignored; `.env.schema` and `.env.example` carry key names and shapes only.
NFR19: **Image tagging.** Sandbox image tags are date-stamped (`factory-sandbox:YYYY-MM-DD`), never `latest`, so a bad image is a `FACTORY_SANDBOX_IMAGE` rollback.
NFR20: **Version pinning.** Every finding in the contract is pinned to `@mastra/factory@0.15.0`; a major bump requires re-verifying the integration contract and the extension seams first.
NFR21: **Sequencing (AD-8).** The layout restructure (CAP-8) and the entry extraction (CAP-9) land **after** the build order verifies the deployment end-to-end. Extraction is total per module, never partial.
NFR22: **Verify-gate reality.** Stories run in a fresh worktree with tracked files only, so the gate is `npm ci --no-audit --no-fund` then `npm run check`. Untracked files are invisible to story agents — anything a story must read has to be committed.
NFR23: **Graceful degradation.** An unconfigured integration degrades silently and reports its state to diagnostics; it never blocks boot. Partial configuration stays disabled and visible to the status route. Env-key groups are validated at construction and report "not configured" rather than throwing.

### Additional Requirements

*From the Architecture Spine, brownfield state, and the research companion.*

- **No starter template.** This is a brownfield repo already scaffolded from `npm create factory`. Epic 1 Story 1 is therefore *not* a scaffolding story — the tree exists and `src/mastra/index.ts` is 366 lines of unextracted construction.
- **Dependencies to add, versions unverified.** `@mastra/docker` (intent `0.8.0`, core peer `>=1.67.0`) and `@mastra/auth-better-auth` (intent `1.1.5`, peer `hono@^4`, already depends on `better-auth@^1.6.23` — do not install a second copy). Neither is in `package.json`. Treat both numbers as intent and re-verify at install.
- **Structural seed to create.** `apps/{github,linear,slack}/`, `sandbox/`, `ops/{launchagents,newsyslog}/`, `src/mastra/config/` — none of these exist today.
- **Host prerequisites, none installed.** Colima, `docker`, `docker-compose`, `gh`. Only `cloudflared` is present. Node v24.19.0 satisfies every `engines` field.
- **Operator-plane README ownership is assigned:** `apps/github/README.md` owns `GITHUB_APP_*`; `apps/linear/README.md` owns `LINEAR_*`; `apps/slack/README.md` owns `SLACK_APP_*` and `MASTRACODE_CHANNELS_PUBLIC_URL`; `sandbox/README.md` owns `FACTORY_SANDBOX_*` and `MASTRACODE_SANDBOX_WORKDIR`; `ops/README.md` owns `DOCKER_HOST` and the supervision-facing vars.
- **Operator-mode mechanics.** `.bmad-loop/policy.toml` has `[operator] enabled = true`: a dev session may park a story at `awaiting-operator` once its agent-doable work is committed, recording what is owed in the spec's `operator_actions:` frontmatter. Completion is `bmad-loop confirm <story-key>`. Roughly 60% of this work is human-only and must use this mechanism rather than being filed as ordinary agent stories.
- **Verify-gate extension.** The testing story must extend `.bmad-loop/policy.toml` `[verify].commands` in the same change, or the tests never gate anything. *(Confirmed with Yurii, 2026-09-22.)*
- **Branch strategy.** Per-story branches cut by bmad-loop (`scm.branch_per = "story"`), each merged into `main` after its verify gate passes, then deleted. `[scm] target_branch` is pinned to `main` explicitly rather than left at `""`, so a run started from another branch cannot merge somewhere unintended. *(Revised 2026-09-22: the original plan used a long-lived `bmad/self-hosting` integration branch.)*
- **Build order is a hard sequence.** `docs/Self-hosting research.md` §8 defines eleven checkpointed steps, loopback first and public last; LaunchAgents only after everything works by hand. Epic ordering must not violate it.
- **Open questions carried into planning:** none remain. Whether `pnpm-workspace.yaml` is deleted was resolved 2026-09-22 — it is, in Story 1.1.
- **Resolved 2026-09-22, now normative in `SPEC.md`:** AD-7's one-read-site rule is adopted; the ruled-out packages (`@mastra/auth-workos`, `@mastra/e2b`, `@mastra/libsql`, `@mastra/redis-streams`, `@mastra/platform-workspace`) stay installed; `docs/Self-hosting research.md` is renamed to a space-free path in Story 5.3.

### UX Design Requirements

**Not applicable — no UX design contract exists, and none is needed.**

This is deliberate rather than a planning gap. Factory ships its own SPA, including the `/signin` email/password
form (`factory/dist/auth.js:366` — `IAuthHttpHandler` proxies `ALL /auth/api/*` to the provider's own HTTP
surface). No first-party UI is built, modified or styled anywhere in this contract, and SPEC.md's non-goals
rule out hosted identity and any SSO flow that would introduce new screens. The only user-visible surfaces are
Factory's own, Slack's, Linear's and GitHub's.

The two interface-shaped requirements that do exist are captured as functional requirements rather than UX
ones, because they are configuration outcomes with no design content: FR13 (the sign-up form disappears once
registration is closed) and FR21 (account linking completes over OIDC).

### FR Coverage Map

| FR | Epic | Covered by |
| --- | --- | --- |
| FR1 | Epic 1 | Package manager pinned so a fresh worktree resolves identically |
| FR2 | Epic 1 | Vitest + tests for the three pure entry helpers, wired into the verify gate |
| FR3 | Epic 2 | `DockerSandbox` branch placed ahead of the platform/E2B chain |
| FR4 | Epic 2 | Session-id keying and reconnection, observed at the loopback checkpoint |
| FR5 | Epic 2 | `FACTORY_SANDBOX_*` hard caps applied to the container |
| FR6 | Epic 2 | Date-tagged sandbox image carrying `git` + `gh` |
| FR7 | Epic 2 | Actionable error past `MASTRACODE_MAX_SANDBOXES` |
| FR8 | Epic 2 | No host-side clone, verified after a real session |
| FR9 | Epic 2 | `MastraAuthBetterAuth` replaces the WorkOS branch |
| FR10 | Epic 2 | Deferred-instance mode — auth tables in the app's own Postgres |
| FR11 | Epic 2 | `/signin` authenticates email + password locally |
| FR12 | Epic 2 | First login holds an organization |
| FR13 | Epic 2 | Registration closed; sign-up endpoint refused |
| FR14 | Epic 3 | GitHub App permissions + webhook event subscriptions |
| FR15 | Epic 3 | All five `GITHUB_APP_*` plus a permanently stable webhook secret |
| FR16 | Epic 3 | Delivery on `/web/github/webhook`; one issue → merged PR |
| FR17 | Epic 3 | Linear OAuth app, redirect URL, `app:mentionable` scope |
| FR18 | Epic 3 | `LINEAR_CLIENT_ID`/`_SECRET` together; issue routed + @-mention received |
| FR19 | Epic 3 | `apps/slack/manifest.yaml` authored as a real file |
| FR20 | Epic 3 | Slack event/interactivity/OAuth URLs and bot events |
| FR21 | Epic 3 | Slack env set; test delivery lands; OIDC account linking completes |
| FR22 | Epic 3 | Cloudflare Tunnel to `127.0.0.1:4111`, outbound 7844 only |
| FR23 | Epic 3 | Literal `127.0.0.1` bind; HTTPS sign-in at the public origin |
| FR24 | Epic 3 | §4.1 callback-URL registry committed and registered per provider |
| FR25 | Epic 4 | Colima + Factory LaunchAgents |
| FR26 | Epic 4 | Wait-for-socket wrapper with launchd retry semantics |
| FR27 | Epic 4 | `newsyslog` rotation + log directory created |
| FR28 | Epic 4 | `pmset` power settings |
| FR29 | Epic 4 | Survives `launchctl kickstart` and a full logout→login |
| FR30 | Epic 5 | Every operational artifact is exactly one real file at its seeded path |
| FR31 | Epic 5 | Every operator-plane subject has a README owning its env keys |
| FR32 | Epic 5 | `docs/` links out; remaining code blocks marked non-normative |
| FR33 | Epic 5 | No first-party program source outside `src/` |
| FR34 | Epic 5 | Entry reduced to imports + `prepare()` + literal `new Mastra(...)` + `finalize()` |
| FR35 | Epic 5 | `src/mastra/config/README.md` records template provenance |
| FR36 | Epic 5 | `npm run check` clean and `npm run build` succeeds after extraction |
| FR37 | Epic 1 | `redis` service absent; server boots with `REDIS_URL` unset |
| FR38 | Epic 1 | `restart: unless-stopped` and non-default database credentials |

All 38 functional requirements are mapped. No FR appears in two epics.

## Epic List

### Epic 1: A verified repo and one datastore on a working engine

The gate that guards every later story can actually fail for a real reason, the operator has a container
engine on this machine, and the deployment has exactly one stateful dependency instead of two.
**FRs covered:** FR1, FR2, FR37, FR38

### Epic 2: A signed-in operator with a real container

The operator signs in against identity this machine owns, lands in an organization, and opens a session that
gets an isolated Docker container on this host — then closes registration, all before anything is public.
**FRs covered:** FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13

### Epic 3: A public origin and three apps that belong to Yurii

The deployment is reachable over HTTPS with no inbound port open, and all three intake sources — GitHub,
Linear, Slack — run on apps Yurii owns, with no Mastra-owned app anywhere in the path.
**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24

### Epic 4: Unattended 24/7 supervision

The deployment comes back on its own after a crash, a logout→login cycle, or a planned restart, without a
human running commands — and its logs rotate instead of filling the disk.
**FRs covered:** FR25, FR26, FR27, FR28, FR29

### Epic 5: Canonical artifacts and a fully extracted entry

Every operational artifact has one home and one owner, `docs/` links out instead of duplicating, and the entry
is reduced to imports, `prepare()`, the literal `new Mastra(...)` and `finalize()` with its template provenance
recorded. **Deliberately last** — AD-8/NFR21 requires the restructure and extraction to land only after the
deployment is verified end-to-end.
**FRs covered:** FR30, FR31, FR32, FR33, FR34, FR35, FR36

### Epic sequencing and standalone check

| Epic | Depends on | Stands alone because |
| --- | --- | --- |
| 1 | — | Delivers a working engine + store; nothing later is needed to prove it |
| 2 | 1 | Needs a store and an engine; proves itself on loopback with no ingress |
| 3 | 2 | Needs a signed-in org to connect integrations to; proves itself per provider |
| 4 | 3 | Supervises a deployment already verified by hand (build order §8 step 11) |
| 5 | 4 | Rewrites what 2 and 3 wrote, only once the whole thing is known good |

No epic requires a later epic to function. Epics 2, 3 and 5 all touch `src/mastra/index.ts`, and 1, 2 and 3 all
touch `.env.schema` — this overlap is **sequential, not iterative**: each lands a different pre-designed
section with no feedback loop back to the previous epic. Epic 5 is the one that rewrites earlier work, which
is exactly why AD-8 places it last.

Epics 1, 3 and 4 are majority `[operator]` work: those stories commit what is automatable, park at
`awaiting-operator` with a checklist in `operator_actions:`, and complete via `bmad-loop confirm <story-key>`.

---

## Epic 1: A verified repo and one datastore on a working engine

The gate that guards every later story can actually fail for a real reason, the operator has a container
engine on this machine, and the deployment has exactly one stateful dependency instead of two.

### Story 1.1: Pin the package manager so a fresh worktree resolves identically

As a developer driving stories through bmad-loop,
I want the package manager pinned and the stray pnpm workspace file removed,
So that `npm ci` in a fresh story worktree resolves exactly what this machine resolved, and no tool mistakes
this single package for a pnpm workspace.

**Acceptance Criteria:**

**Given** `package-lock.json` is committed and AD-1 fixes npm as the package manager
**When** `package.json` declares a `packageManager` field naming the npm version in use
**Then** a corepack-aware environment selects that npm version automatically
**And** `npm ci --no-audit --no-fund` succeeds in a checkout with no `node_modules/` present

**Given** AD-1 calls `pnpm-workspace.yaml` non-normative template residue
**When** the file is deleted
**Then** no workspace declaration remains anywhere in the repo
**And** `package.json` still contains no `workspaces` field, and there is exactly one lockfile at root (NFR3)

**Given** the repo root path and npm script names are an external contract (AD-11 / NFR10)
**When** the change is complete
**Then** `npm run start`, `npm run check` and `npm run build` are unchanged in name and behaviour

### Story 1.2: Tests for the entry's pure helpers, running inside the verify gate

As the operator supervising unattended story runs,
I want the three pure helpers in the entry covered by tests that the verify gate executes,
So that a story which breaks environment parsing fails at the gate instead of at boot, where the only
witness is a crash-looping LaunchAgent.

**Acceptance Criteria:**

**Given** `tsconfig.json` keeps `include: ["src/**/*"]` and AD-4 forbids first-party TypeScript outside `src/`
**When** the test files are added
**Then** they live under `src/mastra/` (e.g. `src/mastra/index.test.ts`), never in a root `tests/` directory
**And** no `vitest.config.ts` is added at the repo root, because the root directory set is closed (AD-3) —
vitest runs on its defaults through the npm script

**Given** `positiveInt` (`src/mastra/index.ts:45`)
**When** it receives `undefined`, `""`, `"0"`, `"-1"`, `"abc"` and `"3"`
**Then** it returns `undefined` for every non-positive or unparseable input
**And** returns `3` for `"3"`

**Given** `decodeCredentialEncryptionKey` (`src/mastra/index.ts:52`)
**When** it receives a well-formed base64 32-byte key, and separately a malformed value
**Then** the valid key decodes to a 32-byte `Buffer`
**And** the malformed value raises an error naming the environment variable it came from, so a boot failure
points at the key rather than at the decoder

**Given** `localSandboxEnv` (`src/mastra/index.ts:204`)
**When** the process environment contains both the variables it forwards and variables it must not forward
**Then** only the expected keys appear in the returned record

**Given** `.bmad-loop/policy.toml` `[verify].commands` already runs four commands — `npm ci --no-audit --no-fund`,
`npm run check`, and two guards that enforce AD-4 (no first-party `.ts`/`.js`/`.mjs`/`.cjs` outside `src/`) and
AD-9/AD-13 (`.agents/skills/` unmodified)
**When** a `test` script is added to `package.json` and the test command is **appended** to the existing
`[verify].commands` in the same change
**Then** a fresh story worktree runs install, typecheck, tests and both guards
**And** all four pre-existing commands survive the edit — rewriting the array rather than appending to it would
silently delete the two guards, which nothing else enforces
**And** a deliberately failing test fails the gate rather than being silently skipped

**Given** the deployer bundles from `src/mastra` and test files now live there
**When** `npm run build` runs
**Then** the build still succeeds
**And** `npm run check` stays clean with the test files in the compiler's scope

### Story 1.3: One datastore — drop Redis and harden the compose file

As the operator,
I want `docker-compose.yml` to describe exactly one stateful service, with a restart policy and credentials
of my own,
So that the deployment has one thing to lose rather than two, and Postgres comes back with the machine.

**Acceptance Criteria:**

**Given** AD-12 fixes the topology at one process with in-process workers
**When** `docker-compose.yml` is edited
**Then** the `redis` service is absent, along with any volume, network or `depends_on` entry referencing it
**And** no committed file instructs anyone to set `REDIS_URL` — its absence is the configured state (FR37)

**Given** the datastore must survive a host restart unattended
**When** the database service is defined
**Then** it carries `restart: unless-stopped` (FR38)

**Given** the template shipped default database credentials
**When** the credentials are changed
**Then** the user and password are non-default
**And** the database remains `mastracode_web` reachable on `127.0.0.1:54329` from the `pgvector/pgvector:pg18`
image, so the documented `DATABASE_URL` shape still holds
**And** `.env.example` carries the connection-string shape with no real secret in it (NFR18)

**Given** `.env.schema` is the only list of keys (AD-6 / NFR7)
**When** any key's presence or shape changes in this story
**Then** `.env.schema` is updated
**And** no README restates the validation half that `.env.schema` owns

### Story 1.4: [operator] A working container engine and a healthy Postgres

As the operator,
I want Colima and the Docker CLI installed, and Postgres running from the hardened compose file,
So that this machine can host sandboxes and the single datastore everything else depends on.

**Acceptance Criteria:**

**Given** nothing but `cloudflared` is installed on the host today
**When** the operator installs `colima`, `docker`, `docker-compose` and `gh`, linking the compose CLI plugin
if `docker compose` is not found, and starts Colima with `--cpu 12 --memory 32 --disk 200 --vm-type vz
--mount-type virtiofs`
**Then** `docker info` succeeds against `~/.colima/default/docker.sock`

**Given** the compose file from Story 1.3 and `DOCKER_HOST` pointed at the Colima socket
**When** the operator runs `npm run db:up`
**Then** the container reports healthy on `127.0.0.1:54329`
**And** the database `mastracode_web` exists on the `pgvector/pgvector:pg18` image

**Given** this story's agent-doable work is limited to recording the procedure, because installing software
and starting a VM cannot be done from a story worktree
**When** the session finishes its committable work
**Then** `ops/README.md` exists, owning `DOCKER_HOST` per AD-6 and stating the bring-up procedure by command
**And** the story parks at `awaiting-operator` with the install and start commands listed in
`operator_actions:`, rather than reporting done
**And** completion happens through `bmad-loop confirm <story-key>` once the two checkpoints above hold

---

## Epic 2: A signed-in operator with a real container

The operator signs in against identity this machine owns, lands in an organization, and opens a session that
gets an isolated Docker container on this host — then closes registration, all before anything is public.

### Story 2.1: [operator] A sandbox image that carries git and gh

As the operator,
I want a date-tagged container image with `git`, `gh` and a generic toolchain already in it,
So that agent sessions do not fail at first use — Factory has explicit `git-missing` and `gh-missing` error
codes, and `node:22-slim` ships neither tool.

**Acceptance Criteria:**

**Given** operational artifacts must be real files at their seeded paths (AD-5 / FR30)
**When** the image definition is committed
**Then** `sandbox/factory-sandbox.Dockerfile` exists as a real file, not a fenced block in prose
**And** it installs `git`, `ca-certificates`, `curl`, `gnupg`, `openssh-client`, `less`, the GitHub CLI from
its own apt repository, and a generic toolchain layer (`build-essential`, `python3`, `python3-pip`,
`python3-venv`, `ripgrep`, `jq`, `unzip`), enables corepack, and sets `WORKDIR /workspace`
**And** it copies no application code, because the repo is cloned inside the session's sandbox at runtime

**Given** AD-6 assigns `sandbox/README.md` ownership of `FACTORY_SANDBOX_*` and `MASTRACODE_SANDBOX_WORKDIR`
**When** that README is committed
**Then** it states what each of those values must contain and how to obtain or choose it
**And** it carries the build and retag command plus a tag history table
**And** it does not restate the validation or `@public` marking that `.env.schema` owns (NFR7)

**Given** image tags are date-stamped and never `latest`, so a bad image is an env-var rollback (NFR19)
**When** the operator builds the image
**Then** `docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t factory-sandbox:<YYYY-MM-DD> .`
succeeds
**And** `docker run --rm factory-sandbox:<YYYY-MM-DD> sh -c 'git --version && gh --version'` resolves both tools (FR6)

**Given** building an image requires a running engine and cannot happen in a story worktree
**When** the session finishes its committable work
**Then** the story parks at `awaiting-operator` with the build and smoke-test commands in `operator_actions:`
**And** the tag actually built is recorded in `sandbox/README.md`'s tag history on confirmation

### Story 2.2: Select the Docker sandbox ahead of every cloud provider

As the operator holding a zero-dependency mandate,
I want the `DockerSandbox` branch evaluated before the platform and E2B provider chain,
So that agent work runs in a container on this machine even if a platform variable is set by accident —
the guarantee is structural rather than a matter of keeping `.env` clean.

**Acceptance Criteria:**

**Given** `@mastra/docker` is not installed and its intended `0.8.0` is inherited intent, not a pin (NFR20)
**When** the dependency is added
**Then** the resolved version is re-verified against `@mastra/core@1.67.0`'s peer range `>=1.67.0`
**And** the version actually installed is recorded, not assumed

**Given** Factory's sandbox slot is `(ctx: FactorySandboxContext) => MastraSandbox`
**When** `FACTORY_SANDBOX_PROVIDER` is the string `docker` after trimming
**Then** a `DockerSandbox` is returned, keyed `id: ctx.sessionId` so Factory's id-keyed `getOrCreate` on
`start()` is satisfied
**And** this branch is evaluated **ahead** of the platform/E2B chain, so `MASTRA_PROJECT_ID`,
`MASTRA_ENVIRONMENT_ID` or `E2B_API_KEY` cannot move sandboxes off this machine (FR3 / NFR12)

**Given** resource ceilings must be hard caps that OOM-kill the container rather than the host
**When** the sandbox is constructed
**Then** `memory` is `FACTORY_SANDBOX_MEMORY_GIB` (default 10) in bytes, `cpuQuota` is `FACTORY_SANDBOX_CPUS`
(default 4) × a 100 000 µs `cpuPeriod`, `pidsLimit` is 4096, and `timeout` is 15 minutes
**And** `workingDirectory` comes from `MASTRACODE_SANDBOX_WORKDIR` (default `/workspace`), using the
base-class option rather than the package's deprecated `workingDir`
**And** `image` comes from `FACTORY_SANDBOX_IMAGE`

**Given** `.env.schema` is the only list of keys (AD-6 / NFR7)
**When** the branch is added
**Then** `FACTORY_SANDBOX_PROVIDER`, `FACTORY_SANDBOX_IMAGE`, `FACTORY_SANDBOX_MEMORY_GIB`,
`FACTORY_SANDBOX_CPUS`, `MASTRACODE_SANDBOX_WORKDIR` and `MASTRACODE_MAX_SANDBOXES` are declared there
**And** unrecognised values of `FACTORY_SANDBOX_PROVIDER` still fall through to the existing chain rather than
throwing (NFR23)

**Given** the entry must stay indivisible (AD-2 / NFR1) and extraction is deliberately deferred (NFR21)
**When** this change lands
**Then** the literal `new Mastra(...)` remains in `src/mastra/index.ts`
**And** the diff is small and commented, because it now differs from the upstream template
**And** `npm run check` is clean

### Story 2.3: Identity this machine owns, with organizations

As the operator,
I want Better Auth wired as the auth provider against this deployment's own Postgres,
So that sign-in never reaches Mastra's platform, and users hold the organizations that every integration is
scoped to.

**Acceptance Criteria:**

**Given** `@mastra/auth-better-auth` is not installed and its intended `1.1.5` is inherited intent (NFR20)
**When** the dependency is added
**Then** the resolved version is re-verified
**And** no second copy of `better-auth` is installed, since the package already depends on `^1.6.23`
**And** the unmet `hono@^4` peer warning is expected and recorded rather than silenced by adding a dependency
the code does not import

**Given** the template's auth chain is platform → WorkOS → nothing, and neither `SimpleAuth` nor plain JWT
implements `IOrganizationsProvider`
**When** `MastraAuthBetterAuth` replaces the WorkOS branch
**Then** it is constructed with `secret: process.env.BETTER_AUTH_SECRET` and an explicit `signUpEnabled: true`
carrying a comment that Story 2.6 flips it
**And** the `organization()` plugin is **not** added by hand, because the provider already installs it

**Given** deferred-instance mode hands `storage.authDatabase?.()` to `betterAuth()`
**When** the server starts
**Then** auth tables are created in the same Postgres and on the same connection string as the application
tables, with one set of migrations (FR10)

**Given** the zero-dependency mandate (NFR12)
**When** the wiring lands
**Then** `MASTRA_SHARED_API_URL` is set nowhere, because it is the highest-precedence auth path and defers
identity to Mastra's platform with only a warning
**And** `WORKOS_*` and `MASTRACODE_AUTH_DISABLED` are set nowhere — the latter also disables credential
encryption as a side effect
**And** `BETTER_AUTH_URL` is not introduced, because nothing reads it; `baseURL` comes from `MASTRACODE_PUBLIC_URL`

**Given** `.env.schema` owns the key list (NFR7)
**When** the change lands
**Then** `BETTER_AUTH_SECRET` is declared there and marked sensitive
**And** `npm run check` is clean

### Story 2.4: [operator] Sign in on loopback and land in an organization

As the operator,
I want to create the one account against a loopback origin and confirm it holds an organization,
So that identity is proven before anything is reachable from the internet — and before the open-registration
default can be exploited.

**Acceptance Criteria:**

**Given** registration must be exercised while the deployment is still private (NFR13)
**When** the operator writes `.env` with `MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111` and starts the server
with `npm run dev`, which bypasses varlock
**Then** `/signin` renders
**And** the operator creates the single account by email and password (FR11)

**Given** credentials must never be stored unencrypted (NFR14)
**When** `.env` is written
**Then** `FACTORY_CREDENTIAL_ENCRYPTION_KEY` and `FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID` are set **before** any
credential is stored
**And** the key is copied into a password manager, because without it the database survives but every stored
credential and OAuth token is undecryptable ciphertext

**Given** `ensureOrganization` bootstraps a personal org on first login but swallows every failure, so a
failure looks like a missing feature rather than an error
**When** the operator inspects the organization tables after first login
**Then** the account holds exactly one organization (FR12)
**And** a missing organization is treated as a failed bootstrap to investigate, not as expected state

**Given** `.env` is gitignored and secrets never enter the repo (NFR18)
**When** the story is confirmed
**Then** nothing committed contains a real secret
**And** the story parks at `awaiting-operator` with the `.env` composition and the sign-in checkpoint in
`operator_actions:`

### Story 2.5: [operator] A session gets a real container, and the cap holds

As the operator,
I want a signed-in session to open a container from the date-tagged image and the concurrency cap to refuse
the fourth,
So that agent work is genuinely isolated on this machine and one runaway session cannot take the host down.

**Acceptance Criteria:**

**Given** a signed-in operator from Story 2.4 and `FACTORY_SANDBOX_PROVIDER=docker`
**When** a session is opened
**Then** a container starts from `FACTORY_SANDBOX_IMAGE`
**And** `git` and `gh` both resolve inside it

**Given** containers are long-lived and reconnected by session id rather than torn down per command
**When** the same session is resumed after an idle period
**Then** the original container is reattached by its session-id label rather than a new one being created (FR4)

**Given** `MASTRACODE_MAX_SANDBOXES` is 3 and caps are ceilings rather than reservations
**When** a fourth concurrent session is requested
**Then** Factory returns an actionable error naming the cap
**And** the host does not thrash (FR7)

**Given** the repo is cloned **inside** the session's sandbox, never onto the host
**When** a session has cloned a repository
**Then** the checkout exists in the container at `/workspace`
**And** no corresponding checkout appears anywhere on the host filesystem (FR8)

**Given** this verification requires a running deployment and a live Docker engine
**When** the session finishes
**Then** the story parks at `awaiting-operator` with the four checks above in `operator_actions:`

### Story 2.6: [operator] Close registration before anything is public

As the operator,
I want the sign-up path shut off while the deployment is still on loopback,
So that switching on the public origin cannot expose open registration to anyone who finds the hostname.

**Acceptance Criteria:**

**Given** `signUpEnabled` defaults to `true` and is the single most dangerous setting in this deployment
**When** the constructor value is changed to `false`
**Then** the change is a committed, reviewable diff in `src/mastra/config`'s eventual owner — for now
`src/mastra/index.ts` — rather than an environment toggle that a bad `.env` could silently revert

**Given** the account already exists from Story 2.4
**When** the operator restarts the server
**Then** the sign-up form is absent from the SPA
**And** `POST /auth/api/sign-up/email` is refused (FR13)

**Given** registration must be closed **before** the public origin is switched on (NFR13)
**When** this story is confirmed
**Then** it is confirmed ahead of any story in Epic 3
**And** `npm run check` is clean

**Given** Mastra Studio's login UI comes up empty in production without `MASTRA_LICENSE_KEY`
**When** the operator inspects the deployment after the restart
**Then** that empty Studio login is recognised as a cosmetic EE-gate artifact
**And** Factory's own `/signin` is confirmed working, which is the surface that matters

---

## Epic 3: A public origin and three apps that belong to Yurii

The deployment is reachable over HTTPS with no inbound port open, and all three intake sources — GitHub,
Linear, Slack — run on apps Yurii owns, with no Mastra-owned app anywhere in the path.

### Story 3.1: Every callback URL recorded where its subject owns it

As the operator registering three provider apps by hand,
I want every URL each console will ask for written down in the repo before I open a console,
So that a registration is a transcription rather than a derivation, and a change of public origin has one
list to walk rather than four consoles to remember.

**Acceptance Criteria:**

**Given** AD-3 makes provider/app subjects live under `apps/` with one spelling in both planes
**When** the subject directories are created
**Then** `apps/github/`, `apps/linear/` and `apps/slack/` each exist with a `README.md`
**And** no new root directory is created for ingress, because root is a closed set — the tunnel is host
infrastructure and belongs in `ops/README.md` (NFR4)

**Given** AD-6 makes the owning subject's README normative for what a value must contain and how to obtain it
**When** the READMEs are written
**Then** `apps/github/README.md` owns `GITHUB_APP_*`, `apps/linear/README.md` owns `LINEAR_*`, and
`apps/slack/README.md` owns `SLACK_APP_*` and `MASTRACODE_CHANNELS_PUBLIC_URL`
**And** each states what the operator must do in that provider's console
**And** none of them restates the validation, type or `@public` marking that `.env.schema` owns (NFR7)

**Given** the §4.1 registry was read out of the packages rather than guessed
**When** each subject's URL table is recorded
**Then** GitHub carries Callback URL **and** Setup URL at `/auth/github/callback`, and Webhook URL at
`/web/github/webhook`
**And** Linear carries Redirect URL at `/auth/linear/callback`
**And** Slack carries Events and Interactivity at
`/api/agent-controllers/mastra-code/channels/slack/webhook`, and OAuth redirect at
`/connect/slack/oidc/callback`
**And** every path is written against `https://factory.kovalchuk.win`, the public origin (FR24 / NFR15)

**Given** `docs/` links out rather than duplicating (AD-5 / NFR9)
**When** this story lands
**Then** `docs/Self-hosting research.md` §4.1 references the subject READMEs by repo-relative path
**And** its existing section numbers are not renumbered, because they are stable citation anchors

### Story 3.2: [operator] A public origin with no inbound ports

As the operator,
I want the public hostname reaching this machine through an outbound-only tunnel,
So that the deployment is on the internet without a forwarded port, a static IP, or TLS to terminate here.

**Acceptance Criteria:**

**Given** registration was closed in Story 2.6 (NFR13)
**When** this story begins
**Then** Story 2.6 is already confirmed — the tunnel does not go up over an open sign-up form

**Given** an expired domain breaks every callback at once
**When** the operator prepares ingress
**Then** the `kovalchuk.win` zone is confirmed **Active** before the tunnel is installed
**And** auto-renew is confirmed on

**Given** `cloudflared` needs outbound `7844` only
**When** the tunnel is installed and its public hostname is configured
**Then** `factory` / `kovalchuk.win` forwards to `http://127.0.0.1:4111` as type HTTP
**And** no inbound port is opened and no port forwarding is configured (FR22)

**Given** an unset `MASTRA_HOST` binds **all** interfaces including the LAN (NFR11)
**When** `.env` is switched from loopback to the public origin
**Then** `MASTRA_HOST` is the literal `127.0.0.1`, not `localhost`, because once bound to IPv4 loopback
`localhost` may resolve to `::1` and refuse connections with nothing obviously wrong
**And** `MASTRACODE_PUBLIC_URL` and `MASTRACODE_CHANNELS_PUBLIC_URL` are both the public HTTPS origin
**And** `MASTRA_HTTPS_KEY` and `MASTRA_HTTPS_CERT` stay unset, because TLS terminates at Cloudflare

**Given** `.env.schema` is the only list of keys (AD-6 / NFR7)
**When** the ingress keys are settled
**Then** `MASTRA_HOST` and `PORT` are declared in `.env.schema` rather than left undeclared, so the key list
stays complete and their values are marked `@public`

**Given** the production path is varlock plus `NODE_ENV=production`
**When** the operator runs `npm run build && npm run start`
**Then** sign-in works over HTTPS at `https://factory.kovalchuk.win` (FR23)
**And** `ops/README.md` gains the tunnel section describing the install and the public-hostname mapping
**And** the story parks at `awaiting-operator` with the zone check, tunnel install and `.env` switch in
`operator_actions:`

### Story 3.3: [operator] A GitHub App that belongs to Yurii

As the operator,
I want a GitHub App registered in my own account driving the full issue-to-merged-PR loop,
So that the delivery path has no Mastra-owned App in it and every token is mine.

**Acceptance Criteria:**

**Given** the permission set was cross-referenced against the API calls actually present in
`@mastra/factory@0.15.0`
**When** the App is registered
**Then** it grants Contents R+W, Pull requests R+W, Issues R+W, Metadata R, Commit statuses R,
Administration R and Checks R
**And** Actions, Artifact metadata, Dependabot alerts and Security events are skipped unless agents read CI
**And** a later 403 is treated as the signal to widen, since GitHub names the missing permission and changing
permissions costs a consent round-trip rather than a rebuild (FR14)

**Given** every webhook event was confirmed by explicit dispatch in the package
**When** subscriptions are configured
**Then** `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issues`, `issue_comment` and
`push` are enabled
**And** `installation`, `status`, `label` and `repository` are also enabled

**Given** all five of `GITHUB_APP_ID`, `_PRIVATE_KEY`, `_CLIENT_ID`, `_CLIENT_SECRET` and `_SLUG` are required
or the integration stays silently inert by design (NFR23)
**When** `.env` is populated
**Then** all five are set together, with the private key as PEM with escaped newlines
**And** the URLs match `apps/github/README.md` exactly — Callback **and** Setup URL at
`/auth/github/callback`, Webhook URL at `/web/github/webhook` (FR15)

**Given** `GITHUB_APP_WEBHOOK_SECRET` is also the primary OAuth-state signer, and with no fallback set it
becomes random per process, breaking OAuth across every restart (NFR14)
**When** the secret is generated
**Then** it is stable and permanent
**And** it is stored in a password manager alongside the App private key, because both are regenerable only
at the cost of re-registering

**Given** the 5-minute reconcile sweep is the only merge-state writer when webhooks cannot land
**When** configuration is complete
**Then** `MASTRACODE_GITHUB_RECONCILE_ENABLED` is left on

**Given** the loop must be proven end to end
**When** the App is installed and a repository is connected
**Then** a webhook delivery lands on `/web/github/webhook`
**And** one issue reaches a merged pull request (FR16)
**And** the story parks at `awaiting-operator` with the registration, installation and loop proof in
`operator_actions:`

### Story 3.4: [operator] A Linear app that belongs to Yurii

As the operator,
I want my own Linear OAuth app for issue intake and @-mentions,
So that work can arrive from Linear and Factory can be addressed inside it, on credentials I control.

**Acceptance Criteria:**

**Given** `app:mentionable` is easily missed and without it Factory cannot be @-mentioned inside Linear
**When** the OAuth app is created
**Then** its scopes are `read`, `write`, `issues:create`, `comments:create` and `app:mentionable`
**And** the redirect URL is `https://factory.kovalchuk.win/auth/linear/callback`, matching
`apps/linear/README.md` (FR17)

**Given** read/write is workspace-wide because Linear has no per-project narrowing at the OAuth layer
**When** scoping is considered
**Then** narrowing is understood to happen in Factory's intake selection, not in the grant

**Given** `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` are all-or-nothing and one alone is a boot error
**When** `.env` is populated
**Then** both are set together
**And** the integration additionally requires auth, a database and an organization, all of which Epic 2
established

**Given** intake must be proven
**When** an issue is routed from Linear
**Then** it reaches a work item
**And** an @-mention of the app is received (FR18)
**And** the story parks at `awaiting-operator` with the app creation and both proofs in `operator_actions:`

### Story 3.5: [operator] A Slack app created from a manifest this repo owns

As the operator,
I want a Slack app created from a manifest committed in this repo,
So that channel-based work and account linking exist — and the one Slack artifact the package does not ship
is versioned rather than retyped into a console.

**Acceptance Criteria:**

**Given** `@mastra/factory` ships no Slack manifest, making this the only genuine first-party artifact among
the three provider apps (AD-5 / FR30)
**When** the manifest is authored
**Then** `apps/slack/manifest.yaml` exists as a real file that creates a working app (FR19)
**And** it is not reproduced as a fenced block in `docs/`

**Given** the Slack webhook path is `/api/agent-controllers/{controller.id}/channels/{platform}/webhook`, with
the controller id `mastra-code` even though Factory registers it on Mastra under the key `code`
**When** the app is configured
**Then** Events and Interactivity both point at
`https://factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook`
**And** the OAuth redirect is `https://factory.kovalchuk.win/connect/slack/oidc/callback`
**And** bot events are `app_mention`, `message.channels`, `message.groups`, `message.im` and `message.mpim`
**And** a bot user and the App Home messages tab are enabled, with OpenID Connect on for account linking (FR20)

**Given** `SLACK_APP_SIGNING_SECRET` is the master switch — unset means no Slack integration is constructed at
all — and without `SLACK_APP_BOT_TOKEN` Slack can reach Factory but Factory cannot reply
**When** `.env` is populated
**Then** `SLACK_APP_SIGNING_SECRET`, `SLACK_APP_BOT_TOKEN` (`xoxb-`), `SLACK_APP_CLIENT_ID`,
`SLACK_APP_CLIENT_SECRET` and `MASTRACODE_CHANNELS_PUBLIC_URL` are all set

**Given** core skips platforms a provider manages itself, so the path must be confirmed rather than assumed
**When** the app is installed
**Then** one test delivery reaches the channels webhook
**And** account linking completes over OIDC (FR21)
**And** the story parks at `awaiting-operator` with the app creation from manifest and both proofs in
`operator_actions:`

---

## Epic 4: Unattended 24/7 supervision

The deployment comes back on its own after a crash, a logout→login cycle, or a planned restart, without a
human running commands — and its logs rotate instead of filling the disk.

### Story 4.1: The supervision artifacts, as real files in the repo

As the operator,
I want the two LaunchAgent plists, the start wrapper, the log-rotation conf and an installer committed as
real files,
So that supervision can be executed, versioned and diffed — rather than copy-pasted out of a markdown
document every time something changes.

**Acceptance Criteria:**

**Given** Colima runs inside a user login session, so a daemon would start before any session exists and
Factory would crash-loop with no Docker socket
**When** the LaunchAgents are authored
**Then** both are **agents**, not daemons, and `ops/README.md` records why — `UserName` does not help, because
it changes the uid rather than the session

**Given** `--foreground` keeps launchd supervising the VM rather than watching a wrapper exit
**When** `ops/launchagents/ai.mastra.colima.plist` is committed
**Then** it starts Colima with `--cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs --foreground`
**And** it sets an explicit `PATH`, `RunAtLoad`, `KeepAlive`, `ThrottleInterval 30`, and stdout/stderr paths
under `~/Library/Logs/mastra-factory/`

**Given** a LaunchAgent inherits a minimal `PATH` and would not find `node`, `docker` or `git`, and the
throttled default `ProcessType` would give agent work low CPU and IO priority
**When** `ops/launchagents/ai.mastra.factory.plist` is committed
**Then** it runs `/usr/bin/caffeinate -dimsu` against the repo's own `ops/factory-start.sh`
**And** it sets `WorkingDirectory` to the repo root, an explicit `PATH`, `NODE_ENV=production`, `DOCKER_HOST`
pointed at the Colima socket, `RunAtLoad`, `KeepAlive`, `ThrottleInterval 30` and `ProcessType Interactive`
**And** it references the wrapper at its repo path rather than a copy elsewhere, so AD-5 holds and AD-11's
"update the plist, the wrapper and the conf in the same change" remains meaningful (FR25)

**Given** launchd has no dependency ordering, so Factory must wait for Docker itself
**When** `ops/factory-start.sh` is committed
**Then** it exports `DOCKER_HOST` at the Colima socket, polls for that socket and a succeeding `docker info`
for up to ten minutes, and breaks as soon as both hold
**And** on timeout it writes a diagnostic to stderr and exits non-zero, so launchd retries on its throttle
rather than the process crash-looping (FR26)
**And** it `cd`s to the repo root and `exec`s `npm run start`, which stays the production entry point (NFR10)
**And** it stays thin — process supervision and file placement only, never application logic, per AD-4's
carve-out for `ops/*.sh` (NFR2)

**Given** launchd never rotates logs
**When** `ops/newsyslog/ai.mastra.factory.conf` is committed
**Then** it rotates `out.log`, `err.log` and `colima.log` at 7 generations of 10 MB with the `N` and `J` flags
— no process to signal, bzip2 compression (FR27)

**Given** the OS requires these files at paths outside the repo, while the repo copy stays canonical (AD-5)
**When** `ops/install.sh` is committed
**Then** it creates `~/Library/Logs/mastra-factory/`, places both plists where launchd reads them, and
installs the newsyslog conf
**And** it is safe to re-run
**And** it **copies** the newsyslog conf with elevation rather than symlinking it, because that file must be
root-owned `644` and a link to a user-writable repo file is both a privilege problem and something newsyslog
may refuse

### Story 4.2: [operator] Bring the agents up

As the operator,
I want both LaunchAgents bootstrapped and the machine's power behaviour set,
So that the deployment starts at login and the host stays awake to serve it.

**Acceptance Criteria:**

**Given** everything from Epics 1–3 already works when started by hand, which is build-order step 11's
precondition
**When** this story begins
**Then** Epic 3's provider stories are confirmed — supervision is automating a deployment already proven, not
debugging one

**Given** launchd does not create the log directory and the agent will not spawn without it
**When** the operator runs `ops/install.sh`
**Then** `~/Library/Logs/mastra-factory/` exists before either agent is bootstrapped

**Given** both plists are in place
**When** the operator runs `launchctl bootstrap gui/$(id -u)` against each
**Then** Colima starts under launchd and its socket appears
**And** the Factory agent waits for that socket rather than failing, then serves on `127.0.0.1:4111` (FR25)

**Given** the conf must be root-owned to take effect
**When** the newsyslog conf is installed
**Then** it is `root`-owned `644` at `/etc/newsyslog.d/ai.mastra.factory.conf`
**And** `sudo newsyslog -nvv` lists all three log files in its dry run (FR27)

**Given** the machine must not sleep through work
**When** power settings are applied
**Then** `sudo pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0` is in effect (FR28)

**Given** `cloudflared` runs as a LaunchDaemon from boot while Factory's agent starts at login, and any logout
kills Factory
**When** the operator reviews the running deployment
**Then** 502s in the boot-to-login window are recognised as expected rather than a fault
**And** fast user switching is disabled, because a second session's logout would take Factory down
**And** the story parks at `awaiting-operator` with the bootstrap, newsyslog and `pmset` steps in
`operator_actions:`

### Story 4.3: [operator] Prove it comes back on its own

As the operator,
I want the deployment's recovery demonstrated rather than assumed,
So that the first unattended restart is not also the first test of whether unattended restart works.

**Acceptance Criteria:**

**Given** `KeepAlive` and `ThrottleInterval 30` are configured
**When** the operator runs `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`
**Then** the process is killed and restarted by launchd
**And** the deployment is serving again with no further commands (FR29)

**Given** both LaunchAgents are tied to the login session
**When** the operator performs a full logout and logs back in
**Then** Colima and Factory both start again
**And** sign-in works over HTTPS at the public origin without anything being typed

**Given** the wrapper's ten-minute wait exists precisely for the window where Factory starts before Docker
**When** Factory's agent starts while the Colima socket is not yet present
**Then** the wrapper waits rather than the process crash-looping
**And** the wait is visible in `out.log`, confirming the branch actually runs (FR26)

**Given** rotation that never fires is indistinguishable from rotation that is misconfigured
**When** rotation is exercised
**Then** a rotated, compressed generation appears in `~/Library/Logs/mastra-factory/`
**And** the live log continues to be written

**Given** FileVault is on, so until someone authenticates at the pre-boot screen there is no session, no
agents, no SSH and no Screen Sharing (NFR17)
**When** recovery limits are recorded
**Then** `ops/README.md` states that an unplanned reboot needs a human at the keyboard, that planned restarts
go through `sudo fdesetup authrestart`, and that a kernel panic or hardware fault is the accepted residual risk
**And** the story parks at `awaiting-operator` with the kickstart and logout→login proofs in `operator_actions:`

---

## Epic 5: Canonical artifacts and a fully extracted entry

Every operational artifact has one home and one owner, `docs/` links out instead of duplicating, and the entry
is reduced to imports, `prepare()`, the literal `new Mastra(...)` and `finalize()` with its template
provenance recorded. Deliberately last: AD-8 / NFR21 requires this to land only after the deployment is
verified end to end.

**Decisions resolved before this epic was written** (Yurii, 2026-09-22): AD-7 is **adopted** — one read site
per environment key. The ruled-out packages (`@mastra/auth-workos`, `@mastra/e2b`, `@mastra/libsql`,
`@mastra/redis-streams`, `@mastra/platform-workspace`) **stay installed**; the zero-dependency guarantee rests
on unset variables plus Story 2.2's branch ordering. `docs/Self-hosting research.md` **is renamed** to a
space-free path in Story 5.3.

### Story 5.1: Every operational artifact at its seeded path, and no code outside src/

As a future maintainer opening this repo in six months,
I want each operational artifact to exist exactly once at the path the spine names for it,
So that finding the thing that configures something is a lookup rather than a search, and nothing important
lives only inside prose.

**Acceptance Criteria:**

**Given** the structural seed names a path for every artifact (AD-3, AD-5)
**When** the layout is audited
**Then** `sandbox/factory-sandbox.Dockerfile`, `sandbox/README.md`, `ops/README.md`,
`ops/launchagents/*.plist`, `ops/factory-start.sh`, `ops/newsyslog/ai.mastra.factory.conf`,
`ops/install.sh`, `apps/github/README.md`, `apps/linear/README.md`, `apps/slack/README.md` and
`apps/slack/manifest.yaml` each exist at exactly that path (FR30)
**And** no operational artifact exists only as a fenced block anywhere in the repo
**And** no artifact exists in two places

**Given** root is a closed set and only tool-fixed files belong there (AD-3 / NFR4)
**When** the root directory is audited
**Then** the only files outside a subject directory are `package.json`, `package-lock.json`, `tsconfig.json`,
`docker-compose.yml`, `.env`, `.env.schema`, `.env.example` and `.gitignore`
**And** any file found at root outside that allowlist is either moved to its owning subject or the allowlist
is amended as a deliberate spine change, not a silent one

**Given** `tsc --noEmit` is the only real check and cannot see outside `src/` (AD-4 / NFR2)
**When** the tree is searched for first-party program source
**Then** no `.ts`, `.js`, `.mjs` or `.cjs` file exists outside `src/`, with `ops/*.sh` the sole carve-out (FR33)
**And** `tsconfig.json` still reads `include: ["src/**/*"]`
**And** the vendored and tool-owned trees named in AD-13 — `.agents/`, `_bmad/`, `_bmad-output/`,
`.bmad-loop/`, `.claude/`, `node_modules/` — are excluded from this audit rather than reorganised

**Given** `.agents/skills/` is hash-tracked in `skills-lock.json`
**When** the audit runs
**Then** nothing under it has been hand-edited, because a hand edit either breaks the hash or is silently
overwritten (NFR5)

### Story 5.2: Every subject owns its keys, and .env.schema is the only key list

As the operator hunting for what a variable must contain,
I want exactly one place that answers that question for each key,
So that no two documents can disagree about the same variable and neither has to be trusted over the other.

**Acceptance Criteria:**

**Given** AD-6 splits environment truth by nature
**When** the READMEs are audited
**Then** every operator-plane subject directory has a `README.md` stating what the operator must do and which
keys it feeds (FR31)
**And** `apps/github/` owns `GITHUB_APP_*`, `apps/linear/` owns `LINEAR_*`, `apps/slack/` owns `SLACK_APP_*`
and `MASTRACODE_CHANNELS_PUBLIC_URL`, `sandbox/` owns `FACTORY_SANDBOX_*` and `MASTRACODE_SANDBOX_WORKDIR`,
and `ops/` owns `DOCKER_HOST` and the supervision-facing variables
**And** every key has exactly one owning subject — no key is documented by two READMEs

**Given** `.env.schema` is normative for validation, generated types and `@public`/sensitive marking, and is
the only list of keys (NFR7)
**When** the split is audited
**Then** every key the deployment sets is declared in `.env.schema`
**And** no README restates validation, type or sensitivity — and `.env.schema` does not restate how to obtain
a value from a provider console

**Given** secrets never enter the repo (NFR18)
**When** the audit completes
**Then** `.env` is gitignored, and `.env.schema` and `.env.example` carry key names and shapes only
**And** no committed file contains a real credential

**Given** the `docs/` §11 trap table documents behaviour that is not obvious from a key's name
**When** ownership is settled
**Then** the trap table remains the home for trap behaviour, referenced from the owning README rather than
copied into it

### Story 5.3: docs/ links out, and the path loses its space

As anyone citing the research document from a script or a story spec,
I want a path without a space in it and prose that points at files rather than reproducing them,
So that quoting is never load-bearing and no fenced block can drift away from the file it duplicates.

**Acceptance Criteria:**

**Given** files are canonical and prose links out (AD-5 / NFR9)
**When** the document is rewritten
**Then** the fenced blocks that duplicate real artifacts — the sandbox Dockerfile (§2.1), both plists (§7.1,
§7.3), the start wrapper (§7.2) and the newsyslog conf (§7.4) — are replaced by references to their
repo-relative paths (FR32)
**And** any code block that remains is illustrative and explicitly marked non-normative
**And** the narrative, decisions, build order and risk register are preserved, because those are what the
document is for

**Given** section numbers are stable citation anchors
**When** content is removed or reworded
**Then** existing section numbers are **not** renumbered (NFR9)

**Given** the space in the filename is a shell-quoting footgun on a path this contract cites heavily
**When** the file is renamed to a space-free path
**Then** the rename and the citation updates land in the same change
**And** every citation is updated: `SPEC.md` frontmatter `companions:`, `brownfield.md`,
`ARCHITECTURE-SPINE.md` (frontmatter `sources:`, AD-5, AD-12, the Consistency Conventions table and the
structural seed), and this epics document
**And** a repository-wide search for the old path returns nothing outside the vendored and tool-owned trees

### Story 5.4: A config module with recorded provenance, holding storage, vector and pubsub

As a maintainer facing a future Mastra template update,
I want the entry's infrastructure construction moved into `src/mastra/config/` with the fork point written
down,
So that reconciling with upstream is a three-way diff rather than archaeology.

**Acceptance Criteria:**

**Given** full extraction makes the entry structurally unlike upstream, and the provenance record is what
keeps that cost payable (AD-8)
**When** `src/mastra/config/` is created
**Then** `src/mastra/config/README.md` records the `@mastra/factory` version and the template origin the entry
was forked from (FR35)
**And** it states that it must be updated on every reconciliation

**Given** extraction is total per module, never partial — a module is either fully extracted or not yet
started (AD-8 / NFR21)
**When** storage, vector and pubsub move
**Then** each becomes its own module under `src/mastra/config/`, with no construction for those concerns left
behind in the entry
**And** modules not yet extracted remain entirely in the entry, untouched

**Given** AD-7 is adopted — `process.env.X` appears at exactly one location in first-party code (NFR8)
**When** these modules read their keys
**Then** each key they own is read exactly once
**And** every consumer receives the parsed value by argument or module export rather than reading the
environment again

**Given** Story 1.2's tests import the pure helpers from `src/mastra/index.ts`
**When** a helper relocates into `src/mastra/config/`
**Then** its test moves or its import is updated in the **same** change
**And** the verify gate stays green across the commit, never red on an import path

**Given** the entry must stay indivisible (AD-2 / NFR1)
**When** this story lands
**Then** the literal `new Mastra(...)` is still in `src/mastra/index.ts`
**And** `npm run check` is clean

### Story 5.5: Extract auth, integrations and sandbox

As a maintainer,
I want the three concerns this project actually modified moved into `src/mastra/config/` as well,
So that the local deltas sit beside the upstream ones under one rule instead of being the only things left in
the entry.

**Acceptance Criteria:**

**Given** AD-8 requires the local additions to be extracted alongside upstream's
**When** auth, integrations and sandbox move
**Then** the Better Auth provider from Story 2.3 and the `DockerSandbox` branch from Story 2.2 move with them,
each fully rather than partially
**And** each concern is one module under `src/mastra/config/`

**Given** Story 2.2's ordering guarantee is what keeps sandboxes on this machine while `@mastra/e2b` and
`@mastra/platform-workspace` remain installed
**When** the sandbox module is extracted
**Then** the `DockerSandbox` branch is still evaluated **ahead** of the platform and E2B chain
**And** a test or an explicit assertion records that ordering, so a later refactor cannot silently reverse it

**Given** `signUpEnabled` is `false` as of Story 2.6 and must never silently revert (NFR13)
**When** the auth module is extracted
**Then** it is still a literal `false` in committed code, not an environment toggle

**Given** AD-7 is adopted (NFR8)
**When** these modules read `BETTER_AUTH_SECRET`, `GITHUB_APP_*`, `LINEAR_*`, `SLACK_APP_*`,
`FACTORY_SANDBOX_*`, `MASTRACODE_SANDBOX_WORKDIR` and `MASTRACODE_MAX_SANDBOXES`
**Then** each key is read at exactly one location
**And** all-or-nothing groups are validated at construction and report "not configured" rather than throwing,
so an unconfigured integration degrades without blocking boot (NFR23)

**Given** the entry must stay indivisible (AD-2)
**When** this story lands
**Then** the literal `new Mastra(...)` is still in `src/mastra/index.ts`
**And** `npm run check` is clean

### Story 5.6: The entry is four things, and the build proves it

As a maintainer,
I want `src/mastra/index.ts` reduced to exactly imports, `prepare()`, the literal `new Mastra(...)` and
`finalize()`,
So that the divergence from Mastra's template is imports alone, and the deployer's own check still passes.

**Acceptance Criteria:**

**Given** extraction is complete across every module
**When** the entry is read
**Then** it contains only imports, the `factory.prepare()` call, the literal `new Mastra(...)` and
`factory.finalize()` (FR34)
**And** no environment reading and no instance construction remain in it

**Given** the deployer's `checkConfigExport` Babel plugin inspects the entry's source (AD-2 / NFR1)
**When** the build runs
**Then** the entry still exports a `Mastra` instance named `mastra` built by a literal `new Mastra(...)` in
that file
**And** the instance is never re-exported from another module and never constructed in a helper

**Given** the gate and the build are the only checks that exist
**When** verification runs
**Then** `npm run check` is clean and `npm run build` succeeds (FR36)
**And** the tests from Story 1.2 still run and pass under the extended `[verify].commands`

**Given** AD-7 is adopted and now spans the whole code plane (NFR8)
**When** the finished code plane is audited
**Then** a search for each environment key used by the deployment returns exactly one read site
**And** `src/mastra/config/README.md` reflects the final module layout alongside the provenance record
