# Brownfield state

Observed from the working tree on **2026-09-22**. None of the three sources states this; it is the starting point downstream work sequences against. The structural seed in `ARCHITECTURE-SPINE.md` is entirely aspirational — almost none of it exists yet.

## What exists

```text
mastra-factory/
  src/mastra/index.ts        # 366 lines, unextracted — the ONLY file under src/
  docker-compose.yml         # still carries the redis service
  .env.schema                # ~50 keys
  .env.example
  package.json / package-lock.json
  tsconfig.json              # include: ["src/**/*"] — as required
  pnpm-workspace.yaml        # template residue
  skills-lock.json
  docs/Self-hosting research.md
  .agents/ .bmad-loop/ .claude/ _bmad/ _bmad-output/   # outside both planes (AD-13)
```

## What does not exist yet

- `apps/github/`, `apps/linear/`, `apps/slack/` — no provider-app directories, no READMEs, no `manifest.yaml`
- `sandbox/` — no `factory-sandbox.Dockerfile`
- `ops/` — no plists, no `factory-start.sh`, no newsyslog conf, no `install.sh`
- `src/mastra/config/` — nothing extracted; no provenance README
- `src/mastra/integrations/`, `src/mastra/rules/`, `src/mastra/public/factory-skills/`
- `.env` — never written

## Deltas the contract implies

| Current state | Contract | Note |
| --- | --- | --- |
| `redis` service in `docker-compose.yml` | Must be absent (AD-12) | Also: add `restart: unless-stopped`, change the default `user`/`pass` |
| `@mastra/docker` not installed | Needed for CAP-1 | Intended `0.8.0`; core peer `>=1.67.0` matches |
| `@mastra/auth-better-auth` not installed | Needed for CAP-2 | Intended `1.1.5`; peer `hono@^4` is not a direct dependency, so expect an unmet-peer warning. It already depends on `better-auth@^1.6.23` — do not install a second copy |
| `@mastra/auth-workos`, `@mastra/e2b`, `@mastra/libsql`, `@mastra/redis-streams`, `@mastra/platform-workspace` installed | Their env vars must stay unset | Whether the packages themselves come out is an open question |
| `index.ts` is 366 lines, all construction inline | Only imports + `prepare()` + literal `new Mastra(...)` + `finalize()` (AD-8) | Lands after the build order verifies end-to-end |
| No lockfile problem | — | A lockfile was generated and committed 2026-09-22; without it the verify gate's `npm ci` has nothing to install from |

## Verify-gate reality

`npm run check` (`tsc --noEmit`) is the only quality gate that exists — no test script, no linter. Because stories run in a fresh git worktree, which checks out tracked files only, `node_modules/` is absent and the install is part of the gate rather than a precondition: `npm ci --no-audit --no-fund` then `npm run check`.

Two consequences worth holding onto:

- `tsc --noEmit` alone is a thin definition of "verified" — a change can pass the gate while being behaviourally wrong.
- Untracked files are invisible to story agents, so anything they must read has to be committed.

## Runtime prerequisites on the host

Nothing is installed yet except `cloudflared`. Node v24.19.0 is present and satisfies every `engines` field. Colima, `docker`, `docker-compose` and `gh` are all still to come.
