---
id: SPEC-self-hosted-factory
companions:
  - '../../planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md'
  - '../../../docs/self-hosting-research.md'
  - 'extension-seams.md'
  - 'brownfield.md'
sources:
  - '../../planning-artifacts/research/technical-repo-structure-for-self-hosted-factory-2026-09-22/research.md'
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Self-Hosted Mastra Factory

## Why

A vision to realize, with a mandate attached. Yurii wants Mastra Factory running 24/7 on one Mac — an M4 Max on `https://factory.kovalchuk.win` — with **zero dependency on Mastra's infrastructure**: own GitHub, Linear and Slack apps, own identity provider, own sandboxes, own Postgres. The mandate is that zero-dependency clause: several environment variables silently defer identity or sandboxing back to Mastra's platform with only a warning, so "self-hosted" is a property that has to be actively held, not a default that is reached. Two things block the build. Every operational artifact the deployment needs — the Slack manifest Mastra does not ship, two LaunchAgent plists, the start wrapper, the newsyslog conf, the sandbox Dockerfile, the provider registration catalogs — exists only as fenced code blocks inside one 634-line markdown document, so nothing can be executed, versioned or diffed. And the repo has no layout rule for where such artifacts go, which is what invites the wrong fix: a monorepo that would create four empty packages while the real gap is operational, not structural.

## Capabilities

- **CAP-1** — Docker sandboxes on this machine
  - **intent:** Agent sessions get an isolated container on this host, one long-lived container per session, reconnected by session id and hard-capped so a runaway session cannot take the machine down.
  - **success:** A session opens a container from the date-tagged image; `git --version` and `gh --version` both resolve inside it; a fourth concurrent session past `MASTRACODE_MAX_SANDBOXES` returns an actionable error rather than thrashing; no repo is ever cloned onto the host filesystem.

- **CAP-2** — Self-hosted identity with organizations
  - **intent:** An operator signs in against identity this machine owns, and lands in an organization, because Factory's tenant is `(orgId, userId)` and every integration is org-scoped.
  - **success:** `/signin` authenticates by email and password against tables in this deployment's own Postgres; a first login has an organization; after registration is closed the sign-up form is gone and `POST /auth/api/sign-up/email` is refused.

- **CAP-3** — Own GitHub App
  - **intent:** A GitHub App registered in Yurii's own account drives the full loop, so issues become reviewed pull requests without Mastra's App in the path.
  - **success:** A webhook delivery lands on `/web/github/webhook`, and one issue reaches a merged PR.

- **CAP-4** — Own Linear app
  - **intent:** A Linear OAuth app owned by Yurii provides issue intake and lets Factory be @-mentioned inside Linear.
  - **success:** An issue routed from Linear reaches a work item, and an @-mention of the app is received.

- **CAP-5** — Own Slack app
  - **intent:** A Slack app created from an operator-authored manifest provides channel-based work and account linking — the manifest is the only genuine first-party artifact among the three provider apps, because the package ships none.
  - **success:** `manifest.yaml` exists as a real file that creates a working app; a test delivery reaches the channels webhook; account linking completes over OIDC.

- **CAP-6** — Public ingress with no inbound ports
  - **intent:** The public origin reaches the server without opening a port, forwarding, or a static IP, and TLS terminates before this machine.
  - **success:** Sign-in works over HTTPS at the public origin while the server binds only `127.0.0.1:4111` and only outbound `7844` is in use.

- **CAP-7** — Unattended 24/7 supervision
  - **intent:** The deployment comes back on its own after a crash, a logout→login cycle, or a planned restart, without a human running commands.
  - **success:** It survives `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` and a full logout→login; the server waits for the Docker socket instead of crash-looping; logs rotate instead of filling the disk.

- **CAP-8** — Operational artifacts are real files
  - **intent:** Every operational artifact lives as exactly one real file at its own path under the two-plane layout, so it can be executed, versioned and diffed instead of copy-pasted out of prose.
  - **success:** Each artifact named in the structural seed exists at its seeded path; no operational artifact exists only as a fenced block; every operator-plane subject directory has a README stating what the operator must do and which env keys it feeds; grep finds no first-party `.ts` outside `src/`.

- **CAP-9** — Fully extracted entry with recorded provenance
  - **intent:** All environment reading and all instance construction moves out of the entry file, so the divergence from Mastra's template shrinks to imports and a future template update is a three-way diff rather than archaeology.
  - **success:** `src/mastra/index.ts` contains only imports, `factory.prepare()`, the literal `new Mastra(...)`, and `factory.finalize()`; `src/mastra/config/README.md` records the `@mastra/factory` version and template origin the entry was forked from; `npm run check` is clean and `npm run build` succeeds.

- **CAP-10** — One store, no Redis
  - **intent:** A single Postgres instance holds application tables and auth/organization tables, and event delivery happens in-process, so the deployment has one stateful dependency instead of two.
  - **success:** The server boots with `REDIS_URL` unset and no `redis` service in `docker-compose.yml`; auth migrations land in the same database as the app tables on one connection string.

## Constraints

- The entry is indivisible: `src/mastra/index.ts` must export a `Mastra` instance named `mastra` constructed by a **literal** `new Mastra(...)` in that file — the deployer's `checkConfigExport` Babel plugin inspects the entry's source. No re-export, no construction in a helper. (AD-2)
- No first-party `.ts`/`.js`/`.mjs`/`.cjs` outside `src/`, and `tsconfig.json` keeps `include: ["src/**/*"]` — because `tsc --noEmit` is the only real check in the verify gate, anything outside `src/` is silently unverified. Carve-out: `ops/*.sh`, kept to process supervision and file placement, never application logic. (AD-4)
- One npm package: exactly one root `package.json` + `package-lock.json`, no `workspaces`, npm stays. A package-manager switch is a full dependency re-resolution — the largest version of exactly the change the no-backups posture forbids. (AD-1)
- Two planes, one subject vocabulary. Provider/app subjects live under `apps/`; host-infrastructure subjects live at root, and root is a **closed set** — adding a root directory is a spine change. Operator-plane directories hold no first-party code and reach the code plane only through environment variables and CLI invocation, never an import. (AD-3)
- Repo-local factory-skill overrides go only at `src/mastra/public/factory-skills/<skill-name>/SKILL.md`, and only the six bundled skill names resolve. `.agents/skills/` is hash-locked in `skills-lock.json` and must never be hand-edited — a hand edit either breaks the hash or is silently overwritten. (AD-9, AD-13)
- Single machine, single process, no Redis. Any design assuming multiple replicas, shared external queues, or cross-process leases contradicts this and is a conflict to surface, not a local choice. (AD-12)
- Environment-key truth is split by nature: `.env.schema` is normative for validation, generated types and `@public`/sensitive marking and is the only list of keys; the **owning subject's README** is normative for what the value must contain and how to obtain it. Every key has exactly one owning subject, and neither side restates the other's half. (AD-6)
- `process.env.X` for any given `X` appears at exactly one location in first-party code; every consumer receives the parsed value by argument or export. (AD-7 — adopted 2026-09-22.)
- Files are canonical; prose links out. One real file per operational artifact; `docs/` references artifacts by repo-relative path and marks any code block non-normative. Section numbers in `docs/self-hosting-research.md` are stable citation anchors — do not renumber. That space-free path is what Story 5.3 renamed the document to, landing in the same change as every citation of it. (AD-5 — rename resolved 2026-09-22.)
- The repo root path and npm script names are an external contract: `npm run start` stays the production entry point and must work with the repo root as cwd. Renaming the script or moving the repo requires updating the LaunchAgent plist, `ops/factory-start.sh` and the newsyslog conf in the same change. (AD-11)
- `MASTRA_HOST` must be `127.0.0.1` — unset binds **all** interfaces, LAN included. Use the literal `127.0.0.1`, not `localhost`. TLS terminates at Cloudflare; `MASTRA_HTTPS_KEY`/`_CERT` stay unset.
- These must stay unset or self-hosting silently breaks: `MASTRA_SHARED_API_URL` (highest-precedence auth path — defers identity to Mastra's platform with a warning only), `MASTRA_PLATFORM_ACCESS_TOKEN`/`_SECRET_KEY`/`MASTRA_PROJECT_ID`/`MASTRA_ENVIRONMENT_ID` (together they move sandboxes to Platform VMs), `E2B_API_KEY`, `SANDBOX_PROVIDER`, `WORKOS_*`, `MASTRACODE_AUTH_DISABLED` (undocumented, and also disables credential encryption).
- The packages for the ruled-out paths stay installed — `@mastra/auth-workos`, `@mastra/e2b`, `@mastra/libsql`, `@mastra/redis-streams`, `@mastra/platform-workspace`. The zero-dependency guarantee rests on their environment keys staying unset plus Story 2.2's sandbox branch ordering, not on removing dependencies. (Resolved 2026-09-22.)
- `signUpEnabled` defaults to `true`. The account is created while still on loopback and registration is closed **before** the public origin is switched on.
- `FACTORY_CREDENTIAL_ENCRYPTION_KEY` must be set before any credential is stored, or provider keys and OAuth tokens persist as plaintext. `GITHUB_APP_WEBHOOK_SECRET` must be stable forever — it is also the primary OAuth-state signer, and with no fallback set it becomes random per process, breaking OAuth across restarts.
- `MASTRACODE_PUBLIC_URL` must be the public URL. A loopback value silently produces OAuth callbacks the browser cannot reach.
- No backups. The Postgres volume is the only copy of projects, work items, sessions, agent memory, integration tokens and auth tables. Every dependency bump is one-way — read the changelog first.
- FileVault is on, so there is no unattended recovery from an unplanned reboot: until someone authenticates at the pre-boot screen there is no session, no agents, no SSH. Planned restarts go through `fdesetup authrestart`. Accepted.
- Secrets never enter the repo: `.env` is gitignored; `.env.schema` and `.env.example` carry key names and shapes only.
- Sandbox image tags are date-stamped (`factory-sandbox:YYYY-MM-DD`), never `latest`, so a bad image is a `FACTORY_SANDBOX_IMAGE` rollback.
- Every finding in this contract is pinned to `@mastra/factory@0.15.0`. A major bump requires re-verifying the integration contract and the extension seams before relying on either.
- Sequencing: the layout restructure (CAP-8) and the entry extraction (CAP-9) land **after** the build order verifies the deployment end-to-end. The build order's edits land in `index.ts` and migrate into `src/mastra/config/` afterward; restructuring first adds an untested variable to a sequence whose checkpoints are already tight. Extraction is total per module, never partial — a module is either fully extracted or not yet started. (AD-8)

## Non-goals

- A monorepo, npm/pnpm workspaces, or any multi-package layout. All three integrations ship compiled inside `@mastra/factory`; an own provider app is a registration plus env vars, not a codebase, so a workspace would create empty packages and re-resolve every dependency on a machine with no backups.
- Per-app project folders. The seams that will actually carry customization are agent-skill markdown and event rules, keyed by skill name and event name — neither wants a `packages/github-app/` directory.
- Task orchestration (Turborepo, Nx) — meaningless at one package.
- CI beyond the local verify gate. Supervision is launchd on one machine; there is no remote runner.
- Backup and restore. Explicitly accepted as absent.
- Multi-tenant or per-organization GitHub Apps. Single operator, single org; the subclassing seam exists if that changes.
- Hosted identity — WorkOS, Mastra platform auth, or any SSO/OAuth identity provider. Email and password against this deployment's Postgres, with no redirect URI to register anywhere.
- Cloud sandboxes: E2B, Mastra Platform VMs, or Apple's `container` runtime (it speaks XPC, not the Docker API, so `dockerode` cannot connect).
- Server-terminated TLS.
- Unattended recovery from a kernel panic or hardware fault — that one needs physical access.
- Automated tests for `src/mastra/config/` while it holds only construction from environment.

## Success signal

One issue filed in GitHub, one routed from Linear, and one raised by a Slack mention each reach a merged pull request — worked in a Docker container on this machine, over `https://factory.kovalchuk.win`, with every credential belonging to Yurii and no request reaching Mastra's platform. Then the machine is logged out and back in, and the whole thing is serving again with nobody typing a command.

## Assumptions

- `docs/self-hosting-research.md` is the document the sprint-plan notes call `SELF_HOSTING_RESEARCH.md` — same content, renamed.
- The brownfield facts in `brownfield.md` are observed from the working tree on 2026-09-22; none of the three sources states them.
- `factory.kovalchuk.win` on an Active `kovalchuk.win` zone remains the intended public origin.
- `@mastra/docker@0.8.0` and `@mastra/auth-better-auth@1.1.5` are intent, not pins — neither is installed, and both versions are inherited rather than verified against this tree. Re-verify at install.

## Open Questions

- Is substantial custom logic intended — per-tenant GitHub Apps, a new `FactoryIntegration`, heavy rule overrides? Nothing in the repo indicates it, and the answer decides whether the extension seams matter at all.
- ~~Delete `pnpm-workspace.yaml`?~~ **Resolved 2026-09-22: delete.** AD-1 calls it non-normative template residue; Story 1.1 removes it so no tool mistakes this single package for a pnpm workspace.
