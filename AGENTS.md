<!-- bmad:context -->
<!-- Verified 2026-09-22 against 5e09129. Managed by bmad-project-context; edits inside
     this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## mastra-factory

A self-hosted Mastra Factory deployment: one operator, one Mac, own GitHub/Linear/Slack apps,
own identity, own Docker sandboxes, own Postgres, and no dependency on Mastra's platform.
TypeScript on Node 22, npm, one package. The requirements contract is
`_bmad-output/specs/spec-self-hosted-factory/SPEC.md` plus the files it names in `companions:`
— there is no PRD.

## Policy

- Keep first-party `.ts`/`.js`/`.mjs`/`.cjs` under `src/` only, and keep `tsconfig.json` at
  `include: ["src/**/*"]` — `tsc --noEmit` is the only real check, so code outside `src/` is
  silently unverified. Sole carve-out: `ops/*.sh`, limited to process supervision and file
  placement, never application logic.
- Never add `workspaces` to `package.json`, add a second package, or switch package managers.
  One root `package.json` + `package-lock.json`, npm.
- Never add a root directory — root is a closed set and changing it is an architecture-spine
  change. Provider and app subjects go under `apps/`.
- Never hand-edit `.agents/skills/` — it is hash-locked in `skills-lock.json`, so an edit either
  breaks the hash or is overwritten. Repo-local skill overrides go to
  `src/mastra/public/factory-skills/<skill-name>/SKILL.md`.
- Never renumber sections in `docs/Self-hosting research.md` — the numbers are cited as stable
  anchors across the spec and stories.
- Keep secrets out of the repo: `.env` is gitignored; `.env.schema` and `.env.example` carry key
  names and shapes only.
- Treat every dependency bump as one-way and read the changelog first — there are no backups, and
  the Postgres volume is the only copy of projects, work items, sessions, memory and tokens.

## Where things are

- Deployment entry, and the only first-party source today: `src/mastra/index.ts`
- Architecture decisions AD-1…AD-13, cited by ID throughout the stories:
  `_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md`
- Epics and stories: `_bmad-output/planning-artifacts/epics.md`
- Normative operational detail in §2–§11, not background: `docs/Self-hosting research.md` — quote
  the path, it contains a space until Story 5.3 renames it.

## Running and verifying

- Verify with `npm run check`. There is no test script, so it is the only automated check until
  a story adds one.
- The bmad-loop verify gate runs `npm ci --no-audit --no-fund`, `npm run check`, and two guards
  (no first-party code outside `src/`; `.agents/skills/` unmodified) in a worktree holding tracked
  files only. A story that adds a check must also add it to `[verify].commands` in
  `.bmad-loop/policy.toml`, which is gitignored and exists only in the main checkout.
- `npm run start` is the production entry point and must keep working with the repo root as cwd.
  Renaming the script, or moving the repo, requires updating the LaunchAgent plist,
  `ops/factory-start.sh` and the newsyslog conf in the same change.

## Conventions that differ from defaults

- `src/mastra/index.ts` must export a `Mastra` instance named `mastra` built by a literal
  `new Mastra(...)` in that file — the deployer's `checkConfigExport` Babel plugin inspects the
  entry's source. Never re-export it, never construct it in a helper.
- Read each environment key at exactly one site in first-party code; every consumer receives the
  parsed value by argument or export.
- `.env.schema` is the only list of environment keys and is normative for validation, generated
  types and `@public`/sensitive marking; what a value must contain and how to obtain it belongs in
  the owning subject's README. Never restate one side in the other.
- Set `MASTRA_HOST` to the literal `127.0.0.1` — unset binds every interface including the LAN,
  and `localhost` is not equivalent here.
- Leave these unset or self-hosting silently defers back to Mastra's platform:
  `MASTRA_SHARED_API_URL`, `MASTRA_PLATFORM_ACCESS_TOKEN`, `MASTRA_PLATFORM_SECRET_KEY`,
  `MASTRA_PROJECT_ID`, `MASTRA_ENVIRONMENT_ID`, `E2B_API_KEY`, `SANDBOX_PROVIDER`, `WORKOS_*`,
  `MASTRACODE_AUTH_DISABLED`.
- Tag sandbox images by date (`factory-sandbox:YYYY-MM-DD`), never `latest`, so a bad image is a
  `FACTORY_SANDBOX_IMAGE` rollback.
- Operator-plane directories hold no first-party code and reach the code plane only through
  environment variables and CLI invocation, never an import.

<!-- /bmad:context -->
