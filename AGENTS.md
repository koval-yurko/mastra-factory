<!-- bmad:context -->
<!-- Verified 2026-09-25 against 4c176b4f84cdc16cd322c840c0d10d3d27d44596. Managed by
     bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want
     preserved outside the markers. -->

## mastra-factory

A self-hosted Mastra Factory deployment: one operator, one Mac, own GitHub/Linear/Slack apps,
own identity, own Docker sandboxes, own Postgres, and no dependency on Mastra's platform.
TypeScript on Node 22.19+ or 24 (`engines.node` in `package.json`), npm, one package. The
requirements contract is `_bmad-output/specs/spec-self-hosted-factory/SPEC.md` plus the files it
names in `companions:` — there is no PRD.

## Policy

- Keep first-party `.ts`/`.js`/`.mjs`/`.cjs` under `src/` only, and keep `tsconfig.json` at
  `include: ["src/**/*"]` — `tsc --noEmit` type-checks only the files that `include` names, so
  code outside `src/` is never type-checked. Sole carve-out: `ops/*.sh`, limited to process
  supervision and file placement, never application logic.
- Never add `workspaces` to `package.json`, add a second package, or switch package managers.
  One root `package.json` + `package-lock.json`, npm.
- Never add a root directory — root is a closed set and changing it is an architecture-spine
  change. Provider and app subjects go under `apps/`.
- Never hand-edit `.agents/skills/` — it is hash-locked in `skills-lock.json`, so an edit either
  breaks the hash or is overwritten. Repo-local skill overrides go to
  `src/mastra/public/factory-skills/<skill-name>/SKILL.md`.
- Never renumber sections in `docs/self-hosting-research.md` — the numbers are cited as stable
  anchors across the spec and stories.
- Keep secrets out of the repo: `.env` is gitignored; `.env.schema` and `.env.example` carry key
  names and shapes only.
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
- Architecture decisions AD-1…AD-13, cited by ID throughout the stories:
  `_bmad-output/planning-artifacts/architecture/architecture-mastra-factory-2026-09-22/ARCHITECTURE-SPINE.md`
- Epics and stories: `_bmad-output/planning-artifacts/epics.md`
- Normative operational detail in §2–§11, not background: `docs/self-hosting-research.md`

## Running and verifying

- Verify with `npm run check`, `npm test` and `npm run build` — the bmad-loop gate runs each of
  them, so a change that only typechecks is not verified.
- The bmad-loop verify gate runs every entry of `[verify].commands` in `.bmad-loop/policy.toml`, in
  order, starting with `npm ci`, in a worktree holding tracked files only (no `node_modules/`, no
  `.env`). Those entries reconcile the layout rules (no first-party code outside `src/`, root a
  closed set), the vendored `.agents/skills/` tree, the environment-key split, the `ops/` and
  `sandbox/` artifacts, the compose project and this block's own prose against the files they
  describe — read the array rather than restating the guard list or its length anywhere. A story
  that adds a check APPENDS it there and never rewrites or reorders the array, because the guards
  already in it are enforced nowhere else; gating a new `npm run <script>` also obliges naming it
  in this section. `.bmad-loop/policy.toml` is tracked, so a story worktree has it.
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
  `MASTRA_PROJECT_ID`, `MASTRA_ENVIRONMENT_ID`, `E2B_API_KEY`, `SANDBOX_PROVIDER`,
  `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `MASTRACODE_AUTH_DISABLED`.
- Keep `WORKOS_COOKIE_PASSWORD` set wherever it already is, and never add it to the list above — it
  is the second link of the OAuth/link `state` signer chain in
  `src/mastra/config/integrations.ts`, so clearing it drops the deployment back to a per-process
  random secret and invalidates every `state` in flight across a restart.
- Tag sandbox images by date (`factory-sandbox:YYYY-MM-DD`), never `latest`, so a bad image is a
  `FACTORY_SANDBOX_IMAGE` rollback.
- Operator-plane directories hold no first-party code and reach the code plane only through
  environment variables and CLI invocation, never an import.

<!-- /bmad:context -->
