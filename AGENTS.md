## mastra-factory

A self-hosted Mastra Factory deployment: one operator, one Mac, own GitHub/Linear/Slack apps,
own identity, own Docker sandboxes, own Postgres, and no dependency on Mastra's platform.
TypeScript on Node 22.19+ or 24 (`engines.node` in `package.json`), npm, one package. Goals,
constraints and architecture decisions are in `docs/architecture.md`.

## Policy

- Keep first-party `.ts`/`.js`/`.mjs`/`.cjs` under `src/` only, and keep `tsconfig.json` at
  `include: ["src/**/*"]` — `tsc --noEmit` type-checks only the files that `include` names, so
  code outside `src/` is never type-checked. Sole carve-out: shell scripts in `ops/` and
  `actions-runner/`, limited to process supervision and file placement, never application logic.
- Never add `workspaces` to `package.json`, add a second package, or switch package managers.
  One root `package.json` + `package-lock.json`, npm.
- Never add a root directory or root file — root is a closed set (AD-3 in
  `docs/architecture.md`), and changing it means recording it there first. Provider and app
  subjects go under `apps/`. `.github/`, `actions-runner/` and the
  gitignored `releases/` were added for CI/CD (`docs/ci-deploy-research.md`).
- Never `git clean -x`: it deletes `releases/` (every stored build and database dump) and
  `actions-runner/runner/` (the runner registration).
- Never hand-edit `.agents/skills/` — it is hash-locked in `skills-lock.json`, so an edit either
  breaks the hash or is overwritten. Repo-local skill overrides go to
  `src/mastra/public/factory-skills/<skill-name>/SKILL.md`.
- Never renumber sections in `docs/self-hosting-research.md` — the numbers are cited as stable
  anchors across `docs/`.
- Keep secrets out of the repo: `.env` is gitignored; `src/mastra/config/env.ts` and `.env.example`
  carry key names and shapes only.
- Treat every dependency bump as one-way and read the changelog first — there are no backups, and
  the Postgres volume is the only copy of projects, work items, sessions, memory and tokens.

## Where things are

- Deployment entry: `src/mastra/index.ts` — a fork of a generated template entry, now reduced to
  four things: its imports, `factory.prepare()`, the literal `new Mastra(...)` and
  `factory.finalize()`. It reads no environment key and constructs nothing else.
- Local deltas lifted out of that entry, plus the record of what it was forked from and how to
  reconcile it: `src/mastra/config/` (`README.md` there; storage, vector, pubsub, auth, the three
  integrations and the sandbox branch are all constructed in that directory, not in the entry, and
  so is the `new MastraFactory({…})` call that assembles them — `config/factory.ts`)
- Goals, constraints, non-goals and architecture decisions AD-1…AD-13: `docs/architecture.md`
- Known open issues: `docs/open-issues.md`
- Normative operational detail in §2–§11, not background: `docs/self-hosting-research.md`

## Running and verifying

- Verify with `npm run check`, `npm test` and `npm run build` — the deploy workflow runs each of
  them, so a change that only typechecks is not verified.
- `npm run start:release` is the production entry point (`ops/factory-start.sh` execs it; it
  serves `releases/current`), and `npm run start` runs the local build in `.mastra/output`; both
  must keep working with the repo root as cwd. Renaming either script, or moving the repo, requires
  updating the LaunchAgent plists, `ops/factory-start.sh`, `ops/release-lib.sh`,
  `actions-runner/register.sh` and the newsyslog conf in the same change.
- Code reaches production only through a push to `main` (`.github/workflows/deploy.yml` on the
  self-hosted runner). Never run `npm run build` to update the live server; use the release
  scripts in `ops/` (`deploy.sh`, `rollback.sh`, `local-mode.sh`).

## Conventions that differ from defaults

- `src/mastra/index.ts` must export a `Mastra` instance named `mastra` built by a literal
  `new Mastra(...)` in that file — the deployer's `checkConfigExport` Babel plugin inspects the
  entry's source. Never re-export it, never construct it in a helper.
- Read `process.env` for a configuration key only in `src/mastra/config/env.ts`; every other module
  reads the exported `env` object, each key at exactly one site, and every consumer receives the
  parsed value by argument or export. Never write to `process.env`.
- `src/mastra/config/env.ts` (`envSpecs`, envalid) lists every environment key this deployment
  uses — no unused keys; add a key there and to `.env.example` (same order, one-line comment) when
  something starts using it — and is normative for validation, defaults and sensitive marking
  (`SENSITIVE_KEYS`); what a value must
  contain and how to obtain it belongs in the owning subject's README. Never restate one side in the
  other.
- `envSpecs` has two groups, mirrored by `.env.example`: SYSTEM keys stay in `.env` (bootstrap,
  dependency-read, Compose and host settings), ADDITIONAL keys (secrets and app credentials only
  first-party config reads) belong in AWS SSM Parameter Store. With `FACTORY_SSM_PARAMETER_PATH`
  set, `env.ts` loads every parameter under that path at boot as initial values, and a non-blank
  value in `.env` or the shell overrides it.
- Set `MASTRA_HOST` to the literal `127.0.0.1` — unset binds every interface including the LAN,
  and `localhost` is not equivalent here.
- Leave these unset or self-hosting silently defers back to Mastra's platform:
  `MASTRA_SHARED_API_URL`, `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PLATFORM_SECRET_KEY`,
  `MASTRA_PROJECT_ID`, `MASTRA_ENVIRONMENT_ID`, `E2B_API_KEY`, `SANDBOX_PROVIDER`,
  `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `MASTRACODE_AUTH_DISABLED`.
- Keep `WORKOS_COOKIE_PASSWORD` set wherever it already is, and never add it to the list above — it
  is the second link of the OAuth/link `state` signer chain in
  `src/mastra/config/integrations.ts`, so clearing it drops the deployment back to a per-process
  random secret and invalidates every `state` in flight across a restart.
- Sandbox images are tagged `YYYY-MM-DD-<input hash>` by `src/build/sandbox-images.ts` and built
  only by the image pipeline (`.github/workflows/sandbox-images.yml`), never tagged by hand and
  never `latest`; each release carries its tags in `sandbox-catalog.json`, so a bad image is a
  release rollback. Never prune an image that a stored release names.
- Sandbox credentials are per project and SSM-only (`<prefix>/projects/<owner>/<name>/<NAME>`,
  listed in `sandbox/projects/<owner>/<name>/sandbox.json`); never forward a host credential to
  every session container.
- Operator-plane directories hold no first-party code and reach the code plane only through
  environment variables and CLI invocation, never an import.
