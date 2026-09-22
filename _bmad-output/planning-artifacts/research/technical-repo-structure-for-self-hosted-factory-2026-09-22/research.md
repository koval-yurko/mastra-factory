---
title: 'Technical research: Repo structure for the self-hosted Factory'
type: 'technical'
topic: 'Repo structure for the self-hosted Factory'
decision: 'Monorepo vs nested folders, as GitHub/Linear/Slack apps, Better Auth and the sandbox image land'
source: 'primary: shipped package artifacts (@mastra/factory@0.15.0) + repo files'
status: draft
preset: 'standard'
validation: 'normal'
created: '2026-09-22'
updated: '2026-09-22'
---

# Technical research: Repo structure for the self-hosted Factory

**Decision this research serves:** whether to restructure `mastra-factory` into a monorepo (or a repo with
per-project nested folders) as the own GitHub / Linear / Slack apps, Better Auth, and the sandbox Docker image
land — and if so, what the folders should actually be.

---

## Executive summary

**No monorepo. No workspaces. No per-app folders. Your instinct in the last message — "probably we do not need
monorepo at all" — is correct, and the evidence is stronger than expected.**

The premise that "own apps ⇒ separate folders" does not hold, because **an own GitHub/Linear/Slack App is a
registration, not a codebase**. All three integrations ship complete and compiled inside
`@mastra/factory@0.15.0` — 34 modules, ~370 KB of JavaScript [1] — and `src/mastra/index.ts` already constructs
all three [2]. Making them *yours* rather than Mastra's means creating the apps in GitHub/Linear/Slack's own
consoles, registering the URLs Factory already serves, and setting env vars. It adds **zero first-party
modules** [4].

Self-hosting does not change this. "Fully self-hosted" is achieved through env-var configuration — the same
`GithubIntegration` class runs either way; only the credentials differ [2] [4].

So a workspace would create four packages with nothing in them. Worse, two hard constraints make any
multi-package layout actively costly:

- `mastra build` requires `new Mastra(...)` as a **literal in the entry file**, enforced by the deployer's
  `checkConfigExport` Babel plugin [11]. The entry cannot be decomposed into packages.
- `tsconfig.json` is `include: ["src/**/*"]` [10], so anything outside `src/` is invisible to
  `npm run check` — the only real check in your bmad-loop verify gate.

**But the restructure impulse is not wrong — it is aimed at the wrong target.** What genuinely lacks a home is
the *operational* material: the Slack app manifest (which Mastra does **not** ship [8]), two LaunchAgent
plists, `factory-start.sh`, the newsyslog config, the sandbox Dockerfile, and the GitHub App
permission/webhook-event registry. Today all of it exists only as fenced code blocks inside one 634-line
markdown document. That is the actual problem: **not code needing packages, but operational artifacts needing
to become real files.**

Recommendation: **stay a single-package repo; add four flat sibling directories** (`docker/`, `ops/`,
`docs/apps/`, and optionally `src/mastra/config/`). Migration is roughly thirty minutes of file moves, touches
no dependency resolution, and keeps npm, the lockfile, the verify gate, and the LaunchAgent path untouched.

The package-manager question (npm vs pnpm) **dissolves** — with one package there is nothing for a workspace
manager to manage. Stay on npm; see §5.

---

## 1. What an "own app" actually means, per provider

The question you asked — *"check what all these apps means? does it some code needed for them?"* — has a clean
answer per provider. Every row below is from reading the shipped artifact, not documentation.

| | What you create | Where the code is | Code you write |
|---|---|---|---|
| **GitHub App** | An App in GitHub's settings: permissions, 10 webhook events, 3 URLs | `GithubIntegration`, 20 modules / 235 KB, shipped [1] | **None** |
| **Linear app** | An OAuth app: 1 redirect URL, 5 scopes | `LinearIntegration`, 8 modules / 52 KB, shipped [1] | **None** |
| **Slack app** | An app from a manifest: 2 webhook URLs, 5 bot events, OIDC | `SlackIntegration`, 6 modules / 83 KB, shipped [1] | **The manifest YAML** [8] |
| **Better Auth** | Nothing — no console, no redirect URI | `@mastra/auth-better-auth`, shipped | ~6 lines in the entry [9] |

Each integration owns its own HTTP surface and mounts itself: `GithubIntegration.routes()` returns the
`/web/github/*` and `/auth/github/*` routes, `LinearIntegration.routes()` the OAuth connect/callback,
`SlackIntegration` contributes both channels and account-link routes [3]. The URL registry in your §4.1 is not
a list of endpoints you must implement — it is a list of endpoints **that already exist** and that you point
each provider's console at.

The package is explicit that configuration is centralized in the entry and nowhere else:

> *"the deploy entry reads that integration's env vars ONCE, constructs an instance with explicit credentials,
> and passes it to `MastraFactory`. ... No other module reads `LINEAR_*` env vars."* [4]

> *"No system code reads integration env vars or imports integration free functions; everything downstream
> talks to instances through this interface."* [4]

That design is the direct answer to "should each app get a folder": the package has deliberately collapsed each
integration's configuration to a single construction site. A folder per app would hold one constructor call.

Unconfigured integrations degrade cleanly rather than failing — *"its routes never mount, its tools never
register, diagnostics report 'not configured', and the server boots fine"* [5] — which is why you can bring
GitHub up before Linear before Slack (your §8 steps 9–10) with no code branches.

### The one real deliverable: the Slack manifest

`grep` for `app_manifest`, `display_information`, and `manifest.json` across the shipped Slack integration
returns nothing [8]. Your §6 says "Own app from the Factory manifest," but **no manifest ships** — you author
that YAML from the settings table in §6. It is the only genuine authored artifact among the three apps, and it
currently has no home.

---

## 2. Where code *could* legitimately live

Four extension seams exist, and only four [6]:

| Seam | Shape | When you'd use it |
|---|---|---|
| **Event rules** | `rules?: Partial<Record<EventName, FactoryRuleHandler \| null>>` on GitHub and Linear | Change what an event does — e.g. suppress auto-triage, re-route an issue to a different board. `null` disables an event; omitted keeps the default |
| **Slack adapter options** | `adapterOptions?: SlackAdapterChannelConfig` | `streaming`, `toolDisplay: 'grouped'`, and similar presentation knobs |
| **Subclassing** | *"A custom integration (different app per tenant, custom Octokit config) can subclass this and override individual methods"* | Per-tenant GitHub Apps, custom Octokit (retry/throttle, GHES base URL) |
| **A new integration** | Implement `FactoryIntegration` | A source Mastra doesn't ship — Jira, GitLab, PagerDuty. *"Third parties add capabilities by implementing this same interface — no factory changes required"* |

Plus six agent skills that ship as editable markdown — `factory-triage`, `factory-plan`, `factory-review`,
`factory-rereview`, `factory-complete-issue`, `configure-factory-rules` [7]. **This is where your real
customization will happen**, and it is prose, not TypeScript.

Note what this reorders: the most likely place you write something substantial is *agent skill markdown* and
*event rules* — neither of which is organized per-app-as-a-project. Rules are keyed by event name within an
integration's config; skills are keyed by skill name. Neither wants a `packages/github-app/` directory.

---

## 3. The two constraints that close the question

Even if there were code to split, two facts make a multi-package layout costly:

**The entry cannot be decomposed** [11]. From the module docstring in `src/mastra/index.ts`:

> *"`mastra build` requires the entry to export a `Mastra` instance named `mastra` constructed by a literal
> `new Mastra(...)` in THIS file (validated by the deployer's `checkConfigExport` Babel plugin) — which is why
> the factory returns constructor args from `prepare()` instead of the instance."*

The Babel plugin inspects the **source of the entry file** for a literal constructor call. A re-export from a
workspace package would not satisfy it. Helper functions may be extracted; the `new Mastra(...)` may not.

**Your type check only sees `src/`** [10]. `tsconfig.json` is `include: ["src/**/*"]`. Your memory note on the
verify gate records that `tsc` is the only real check in it — so TypeScript placed in a sibling directory is
silently unverified. Any layout that moves `.ts` outside `src/` must also change `tsconfig.json`, and a
workspace layout would need per-package configs plus project references to keep one `tsc --noEmit` meaningful.
That is real ceremony bought for zero code.

A third, softer factor: your §10 lists *"`src/mastra/index.ts` diverges from the template"* as a live Medium
risk. A workspace would multiply the divergence surface from one file to a whole layout, making future template
updates harder — the opposite of the goal.

---

## 4. Recommended layout

Single package. Four flat sibling directories. Nothing in `package.json` changes except possibly a script or
two.

```
mastra-factory/
├── src/mastra/
│   ├── index.ts                     # THE entry — literal new Mastra(...) stays here [11]
│   └── config/                      # optional, only if index.ts gets unwieldy
│       ├── integrations.ts          #   builds github/linear/slack from env
│       ├── sandbox.ts               #   the DockerSandbox branch (§2.2)
│       └── auth.ts                  #   the Better Auth constructor (§3.2)
├── docker/
│   ├── factory-sandbox.Dockerfile   # from §2.1 — a generic toolchain image
│   └── README.md                    # build + retag command, image tag history
├── ops/
│   ├── launchagents/
│   │   ├── ai.mastra.colima.plist   # §7.1
│   │   └── ai.mastra.factory.plist  # §7.3
│   ├── factory-start.sh             # §7.2 — the wait-for-socket wrapper
│   ├── newsyslog/ai.mastra.factory.conf   # §7.4
│   └── install.sh                   # symlink plists, mkdir logs, bootstrap
├── docs/
│   ├── Self-hosting research.md     # stays; becomes the narrative, not the store
│   └── apps/
│       ├── github-app.md            # permissions + events registry (§5)
│       ├── linear-app.md            # scopes + redirect (§6)
│       └── slack-app.manifest.yaml  # THE authored artifact [8]
├── docker-compose.yml               # unchanged
├── .env.schema / .env.example       # unchanged — varlock resolves from root
└── package.json                     # unchanged
```

The Dockerfile moves freely because the sandbox image contains no application code — it is a generic toolchain
image built with context `.` but with no `COPY` of repo files [12], so its build is indifferent to layout.

**Why these four and not per-app folders:** each directory groups by *how the thing is consumed*, which is the
only boundary that's real here. `docker/` is consumed by `docker build`. `ops/` by `launchctl` and
`newsyslog`. `docs/apps/` by a human at a provider's console. `src/` by `mastra build`. Per-app folders would
cut across all four — a `github/` folder would need to hold a doc, an env group, and no code.

**On `src/mastra/config/`:** optional and reversible. It is the one place where "extract into folders" earns
something — it shrinks the template diff in `index.ts` to a few imports, which directly mitigates your §10
divergence risk. Do it only once the entry actually feels long; it is not a prerequisite for anything. Keep it
under `src/` so `tsc` still sees it [10].

**Ordering:** do this migration **after** your §8 build order completes, not before. Everything in §8 runs from
repo root and none of it depends on the new folders. Restructuring first adds an untested variable to a
sequence whose checkpoints are already tight.

---

## 5. Package manager — the question dissolves

You asked me to compare npm and pnpm. With a single package there is **nothing for a workspace manager to
manage** — pnpm's entire advantage here (workspace linking, catalogs, dedup across packages) applies to a
situation you won't be in.

Against that, switching costs are concrete and asymmetric:

- Your §9 states plainly: *"treat every dependency bump as one-way and read the changelog first"* — no backups,
  one Postgres volume, no rollback. A package-manager migration is a **full dependency re-resolution**, the
  largest possible version of exactly the change your own risk register says to avoid.
- Your §8 step 3 notes devDependencies are runtime dependencies (`mastra` CLI and `varlock` are needed by
  `npm start`). pnpm's strict non-flat `node_modules` would need verification against that, and against the
  deployer's bundling — unverified risk for no gain.
- The bmad-loop verify gate runs `npm ci`, and the LaunchAgent execs `npm run start` from a pinned
  `WorkingDirectory` (§7.2, §7.3). Both would need changing.

**Stay on npm.** The stray `pnpm-workspace.yaml` is template residue — it configures build-script approval for
pnpm installs and is ignored entirely by npm. Harmless; delete it or leave it. Revisit only if you ever
genuinely publish a second package.

---

## 6. When to revisit — concrete triggers

Not "when it feels big." Watch for these:

| Trigger | Response |
|---|---|
| You implement `FactoryIntegration` for a **new** source (Jira, GitLab) and it exceeds ~500 lines | Extract to `src/mastra/integrations/<name>/` — still one package |
| You want that integration reusable across **two** deployments | *Now* a workspace has a purpose. Two packages, npm workspaces, no Turborepo |
| Event rules grow past a few handlers | `src/mastra/rules/` — a folder, not a package |
| You genuinely need a second **process** (separate scaling, independent restarts) | Revisit §1's single-process decision first; that's an architecture change, not a layout one |
| You add CI that needs task graphs and caching across ≥3 packages | Only then does Turborepo/Nx pay for itself |

The first two are the ones to watch. Everything below them is satisfied by a directory.

---

## 7. Confidence, limits, and what was not researched

**High confidence** on every load-bearing claim in §§1–3: all are read directly from the shipped
`@mastra/factory@0.15.0` artifact and your repo's own files, accessed 2026-09-22. This is the same standard as
the `[verified]` marks in your self-hosting doc, and stronger than published documentation — which that doc
notes is *"thin and contradicts itself."*

**Scope of the claim.** The findings are pinned to `@mastra/factory@0.15.0`. A major-version bump could add a
plugin surface or restructure the integration contract; re-check §§1–2 if you upgrade.

**Deliberately not researched.** I redirected away from the planned web fan-out (npm-vs-pnpm landscape,
monorepo tooling comparisons, modular-monolith literature). Once the package evidence showed there is no
first-party code to split, those dimensions became answers to a question that does not arise. The
package-manager comparison in §5 is decided on *your* constraints, not on a tooling survey — which is the
correct basis for it, since the generic comparison would not change a single-package outcome.

**Open question — one, and it's yours not mine.** Whether you intend to write substantial custom logic
(per-tenant GitHub Apps, a new integration, heavy rule overrides). Nothing in the repo or the doc indicates
you do, and §2 shows the seams are narrow. If that changes, the §6 triggers apply.

**Staleness.** Selection findings older than two quarters should be refreshed before acting. Re-verify §§1–3
against the installed package version after any `@mastra/factory` major bump.

---

## Sources

All accessed 2026-09-22. Primary sources — shipped package artifacts and repository files — throughout.

| Ref | Source | Publisher | Version / date |
|---|---|---|---|
| 1 | `node_modules/@mastra/factory/dist/integrations/{github,linear,slack}/*.js` — module and byte counts | Mastra | `@mastra/factory@0.15.0` |
| 2 | `src/mastra/index.ts` lines 156–169, 176–182, 266–277, 279, 289 | this repo | 2026-09-21 |
| 3 | `dist/integrations/{github,linear,slack}/integration.d.ts` — class docstrings | Mastra | `@mastra/factory@0.15.0` |
| 4 | `dist/integrations/linear/integration.d.ts`; `dist/integrations/base.d.ts` | Mastra | `@mastra/factory@0.15.0` |
| 5 | `dist/integrations/base.d.ts` — `FactoryIntegration` contract docstring | Mastra | `@mastra/factory@0.15.0` |
| 6 | `dist/integrations/github/{integration,default-rules}.d.ts`; `slack/integration.d.ts`; `base.d.ts` | Mastra | `@mastra/factory@0.15.0` |
| 7 | `node_modules/@mastra/factory/factory-skills/*/SKILL.md` | Mastra | `@mastra/factory@0.15.0` |
| 8 | grep for `app_manifest` / `display_information` / `manifest.json` over `dist/integrations/slack/*.js` — no matches | Mastra | `@mastra/factory@0.15.0` |
| 9 | `docs/Self-hosting research.md` §3.1–3.2, marked [verified] against the package | this repo | v6, 2026-09-22 |
| 10 | `tsconfig.json` — `include: ["src/**/*"]` | this repo | 2026-09-21 |
| 11 | `src/mastra/index.ts` module docstring, lines 11–17 | this repo | 2026-09-21 |
| 12 | `docs/Self-hosting research.md` §2.1 | this repo | v6, 2026-09-22 |
