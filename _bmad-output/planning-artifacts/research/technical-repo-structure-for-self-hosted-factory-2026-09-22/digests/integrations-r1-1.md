# Digest — what "own GitHub / Linear / Slack app" actually requires

**Dimension:** integration code surface · **Round:** 1
**Method:** direct read of the shipped package artifact (primary source), not search.
**Accessed:** 2026-09-22

## Claims

| # | Claim | Source | Confidence | Class |
|---|---|---|---|---|
| 1 | All three integrations ship complete and compiled inside `@mastra/factory@0.15.0`. Module/byte counts: GitHub 20 modules / 235,074 B · Linear 8 / 52,387 B · Slack 6 / 82,953 B. | `node_modules/@mastra/factory/dist/integrations/{github,linear,slack}/*.js` | High | version/compat |
| 2 | The repo entry **already constructs all three** from env vars — `GithubIntegration` (`index.ts:156-169`), `LinearIntegration` (`index.ts:176-182`), `SlackIntegration` (`index.ts:266-277`) — and passes them as `integrations: [...]` (`index.ts:279`, `:289`). | `src/mastra/index.ts` | High | version/compat |
| 3 | Each integration owns its own HTTP surface. `GithubIntegration.routes()` returns the `/web/github/*` + `/auth/github/*` apiRoutes; `LinearIntegration.routes()` the OAuth connect/callback; `SlackIntegration` contributes `channels()` + account-link `routes()`. The factory mounts them. | `dist/integrations/*/integration.d.ts` class docs | High | version/compat |
| 4 | Integration env vars are read in exactly one place. Verbatim: *"the deploy entry reads that integration's env vars ONCE... No other module reads `LINEAR_*` env vars."* and *"No system code reads integration env vars or imports integration free functions."* | `dist/integrations/linear/integration.d.ts`; `dist/integrations/base.d.ts` | High | version/compat |
| 5 | An unconfigured integration degrades cleanly: *"its routes never mount, its tools never register, diagnostics report 'not configured', and the server boots fine."* | `dist/integrations/base.d.ts` | High | version/compat |
| 6 | Four extension seams exist, and only four: (a) `rules` — `Partial<Record<EventName, FactoryRuleHandler \| null>>` on GitHub and Linear; (b) `adapterOptions: SlackAdapterChannelConfig` on Slack; (c) subclassing — *"A custom integration (different app per tenant, custom Octokit config) can subclass this and override individual methods"*; (d) implementing `FactoryIntegration` for a brand-new integration. | `dist/integrations/github/{integration,default-rules}.d.ts`, `slack/integration.d.ts`, `base.d.ts` | High | version/compat |
| 7 | Six agent skills ship as editable markdown: `configure-factory-rules`, `factory-plan`, `factory-triage`, `factory-review`, `factory-rereview`, `factory-complete-issue`. | `node_modules/@mastra/factory/factory-skills/*/SKILL.md` | High | version/compat |
| 8 | **No Slack app manifest ships** in the package — `grep` for `app_manifest` / `display_information` / `manifest.json` across `dist/integrations/slack/*.js` returns nothing. The manifest is operator-authored. | grep over `dist/integrations/slack/` | High | version/compat |
| 9 | Better Auth requires no first-party module: one import + one constructor (`new MastraAuthBetterAuth({ secret, signUpEnabled })`) replacing the WorkOS branch, plus one env var. The package implements all five provider interfaces Factory composes against. | `docs/Self-hosting research.md` §3.1–3.2 (marked [verified] against `@mastra/auth-better-auth@1.1.5`) | High | version/compat |
| 10 | `tsconfig.json` sets `include: ["src/**/*"]`. Any TypeScript placed outside `src/` is invisible to `npm run check` (`tsc --noEmit`) — the bmad-loop verify gate's only real check. | `tsconfig.json` | High | version/compat |
| 11 | `mastra build` requires the entry to export a `Mastra` instance named `mastra` built by a **literal** `new Mastra(...)` **in the entry file**, enforced by the deployer's `checkConfigExport` Babel plugin. | `src/mastra/index.ts` module docstring (lines 11-17) | High | version/compat |
| 12 | The sandbox image copies no application code — a generic toolchain image (`FROM node:22-bookworm-slim` + git/gh/build tools), built with context `.` but containing no `COPY` of repo files. | `docs/Self-hosting research.md` §2.1 | High | pattern |

## Leads

- The operator-authored artifacts are the real homeless set: Slack manifest (8), two LaunchAgent plists, `factory-start.sh`, the newsyslog conf, the sandbox Dockerfile, and the GitHub App permission/event registry. All currently live only as fenced code blocks inside one markdown doc.
- 10 + 11 together bound every layout option far more tightly than any package-manager consideration.

## Looked for and did not find

- Any per-integration plugin directory, code-generation step, or scaffold that a user is expected to fill in.
- Any Mastra-documented monorepo/workspace layout guidance inside the installed packages.
