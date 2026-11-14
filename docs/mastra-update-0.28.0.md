# Mastra update report: factory 0.27.0 → 0.28.0

Date: 2026-11-14. Base: commit `509cfca` on `main`.
Sources: npm registry (`npm view`), the `CHANGELOG.md` of each package in
`mastra-ai/mastra` on GitHub, and the npm tarballs of the new versions.

## 1. Version gap

Every package is 1 release behind. `@mastra/factory` 0.28.0 was published on
2026-11-12, 9 days after 0.27.0.

| Package | Pinned | Latest | Entries (stable) |
|---|---|---|---|
| `@mastra/factory` | 0.27.0 | **0.28.0** | 32 minor, 79 patch |
| `@mastra/core` | 1.82.0 | 1.83.0 | 141 |
| `@mastra/server` (transitive, patched) | 1.82.0 | 1.83.0 | 43 |
| `@mastra/code-sdk` | 1.18.0 | 1.19.0 | 25 |
| `mastra` (CLI, dev) | 1.38.0 | 1.39.0 | 61 |
| `@mastra/pg` | 1.35.0 | 1.36.0 | 16 |
| `@mastra/observability` | 1.23.1 | 1.24.0 | 12 |
| `@mastra/memory` | 1.41.0 | 1.41.1 | 6 |
| `@mastra/libsql` | 1.29.0 | 1.30.0 | 5 |
| `@mastra/docker` | 0.13.0 | 0.14.0 | 2 |
| `@mastra/platform-workspace` | 1.12.0 | 1.13.0 | 2 |
| `@mastra/auth-better-auth` | 1.1.10 | 1.1.11 | 3 |
| `@mastra/e2b` | 0.16.1 | 0.17.0 | 1 |
| `@mastra/loggers` | 1.3.10 | 1.3.10 | — (current) |

Entry counts exclude "Updated dependencies" lines and prerelease sections.
`@mastra/factory` 0.28.0 needs Node `>=22.19.0`, so our `engines` range stays valid.

## 2. Local patches against the new versions

Checked with `patch --dry-run -p4` inside each extracted new tarball.

| Patch | Result | Work needed |
|---|---|---|
| `@mastra+factory+0.27.0.patch` (Slack provenance) | Applies clean | Rename the file to 0.28.0 |
| `@mastra+server+1.82.0.patch` (auth handler) | Applies clean | Rename the file to 1.83.0 |
| `@mastra+core+1.82.0.patch` (first-thread startup cancel race) | Chunk file names changed. Applies clean after rename to `agent-controller-BhkzVgCi.js` and `agent-controller-DCh02MMY.cjs` | Regenerate. The upstream code is unchanged, so the race is still there and the patch is still needed |
| `@mastra+code-sdk+1.18.0.patch` (sandbox AGENTS.md / CLAUDE.md read) | **2 of 7 hunks fail**: `dist/agents/prompts/agent-instructions.js` and `dist/index.js` | Rewrite. 1.19.0 adds async instruction loading (`loadSessionInstructionsAsync`, async `AgentsMDInjector` readers, PR #30104) in the same code. Upstream does not read the files inside the sandbox, so the patch is still needed |

## 3. Changes that act on this deployment

### 3.1 One-way database changes (read before you upgrade)

- **Boards move into the database (#29756, #29707).** On first load, Factory
  rewrites every stored board of every project once. It converts the removed
  project switches **Auto-start runs** and **Self-review before pull requests**
  into phase fields (`autoStart`, a self-review phase). Phases get stored
  runners (`factory-triage`, `factory-plan`, `factory-build`, `factory-self-review`,
  `factory-review`).
- **Review auto-start turns on.** The changelog says: a stored `autoStart: false`
  reads the same as unset, so the migration turns Review's automatic start on.
  If we had it off, turn it off again after the upgrade.
- **Card comments are removed (#29062).** Cards get one `description` field. The
  comment feed, mentions and comment counts are gone. Back up the comments
  first if they matter: after the upgrade the UI and API do not show them.
- **Intake routes replace label routes (#29754, #29353).** Label routes and a
  source binding's board are gone. Every project gets new default routes
  (closed → Done, not planned → Canceled, reopened → Intake, a catch-all to
  Work › Intake).
- **Done no longer cleans up GitHub issue labels.** The agent does it before the
  move. A card that a merge or a person moves to Done keeps its labels.
- **`@mastra/pg` adds an index on `mastra_threads.metadata` (#30086).** It builds at
  startup without a write lock.
- **Done and canceled cards copy to the new card tables in the background
  (#29494).** Open cards copy first. This continues the 0.27.0 board-item split.

Rollback after these run is not safe: a 0.27.0 release does not read the
rewritten boards or the removed comments. Take a database dump with the release
scripts in `ops/` before the deploy, as the policy in `AGENTS.md` requires.

### 3.2 API and config changes

- Our config does not use any removed option. I checked `src/` for
  `autoRunEnabled`, `selfReviewEnabled`, `reviewTestChecksEnabled`,
  `transitionPolicy`, `onEnter`/`onExit`, `feedPublisher` and `brief`: no match.
- The `customTools` integration (`src/mastra/tools/index.ts`) still works: the
  `IntegrationTools` type and the `extraTools` path are still in 0.28.0.
- `IntegrationContext.feed` is removed. Our code does not use it.
- New `tools` option on `MastraFactory` and Mastra Connect tools. Connect needs
  `MASTRA_PROJECT_ID` and Platform credentials, which we keep unset, so it stays
  off. Factory no longer loads `~/.mastracode/mcp.json`; that file does not exist
  on this Mac.
- **CORS (core #29406).** With `server.auth` and no `server.cors.origin`, the
  server no longer sends `Access-Control-Allow-Credentials: true`. Factory sets
  `credentials: true` only when `MASTRACODE_ALLOWED_ORIGINS` is non-empty. Check
  that the Studio at `studio.kovalchuk.win` either uses the same origin or is
  listed in `MASTRACODE_ALLOWED_ORIGINS`.
- **Core BREAKING (#29503):** on a plain `Agent`, `durable` now
  controls resumable streams only. Our code does not set `durable`.
- The `source_control_publish_test_check` tool is removed. Review results appear
  only in the `## Factory test report` comment.

### 3.3 New features we get

- Board editor in the UI (create, edit, delete boards; editable phases).
- Slack tools for Slack sessions (read channels and threads, post, search).
  Default: own channel only. Our `apps/slack/manifest.yaml` already has every
  bot scope that the 0.28.0 README lists.
- Slack voice clips and composer dictation become text (needs a speech-to-text key).
- Linear browse tools `linear_list_projects` and `linear_list_issues`. They only
  read, so our Linear scopes (read, comments:create) are enough.
- Audit trail tool `factory_list_audit_events`.
- `docker` 0.14.0: `DockerFactorySandbox` keeps Factory-wide build env vars
  out of the image and its template identity. New Factory-wide sandbox env vars
  in Settings (#29923). Check this against our rule that sandbox credentials are
  per project and SSM-only.

### 3.4 Fixes that matter here

- GitHub installation token refresh in long sessions (no more `401` on `git push`, #29824).
- Session tokens can read CI results (`gh pr checks`, `gh run view`, #29338).
- A bound session switches threads as its owner (fixes "the request has no
  authenticated user", #30179, #29872).
- A card's sandbox stops when the card leaves that context (#29981). Fewer idle
  Docker containers on this Mac.
- Idle dispatcher sleeps instead of a database query every second (#29228).
- Boot no longer waits for every run binding or every open decision.
- Many board performance fixes (304 caching, `since=<cursor>` deltas, one board read per event).
- Postgres: faster cold start index builds; `saveThread` no longer moves a thread to another resource.

## 4. Recommendation

Upgrade as one change, like `4a5f07d`:

1. Bump every package in section 1 to its latest version.
2. Rename the factory and server patches. Regenerate the core patch for the new
   chunk names. Rewrite the code-sdk patch for the async instruction loader.
3. Run `npm run check`, `npm test` and `npm run build`.
4. Start 0.28.0 on a copy of the production database. Check the board rewrite,
   the intake routes and Review's auto-start before you push to `main`.
5. After the deploy, turn off Review auto-start again if we had it off.

Risk: medium. The code changes are small (patches only). The one-way board
and comment migrations are the main risk.
