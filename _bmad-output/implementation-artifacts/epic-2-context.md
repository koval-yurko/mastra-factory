# Epic 2 Context: A signed-in operator with a real container

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the deployment usable by a real person on a real container, entirely on loopback, before anything is exposed to the internet. Today the auth chain defers to a hosted platform or an external identity provider, and the sandbox slot falls through to a cloud provider chain — so neither identity nor execution belongs to this machine. This epic replaces the external auth branch with a provider backed by this deployment's own Postgres (so users land in an organization, which every integration is scoped to), places a local Docker sandbox branch ahead of the cloud provider chain so a stray platform variable cannot move execution off the host, gives sessions a container image that already carries the tools agents reach for first, proves a session really gets an isolated container with hard resource ceilings and a working concurrency cap, and then closes registration. Registration must be shut before the next epic opens a public origin, so this epic is the last chance to exercise sign-up safely.

## Stories

- Story 2.1: [operator] A sandbox image that carries git and gh
- Story 2.2: Select the Docker sandbox ahead of every cloud provider
- Story 2.3: Identity this machine owns, with organizations
- Story 2.4: [operator] Sign in on loopback and land in an organization
- Story 2.5: [operator] A session gets a real container, and the cap holds
- Story 2.6: [operator] Close registration before anything is public

## Requirements & Constraints

- **Local execution is structural, not configurational.** The local Docker branch must be evaluated *ahead* of the platform/E2B provider chain, so a platform project id, environment id or cloud sandbox key present by accident cannot relocate agent work off this host. An unrecognised provider value must fall through to the existing chain rather than throw.
- **Sandboxes are session-scoped and long-lived.** A sandbox is keyed by session id, satisfying the framework's id-keyed get-or-create, and is reattached by that key on resume rather than recreated or torn down per command.
- **Ceilings are hard caps.** Memory, CPU quota against a fixed period, a process limit and an execution timeout all come from env with documented defaults, so a runaway session is killed instead of taking the host down. The working directory uses the base-class option, not the package's deprecated spelling.
- **The image carries its tools.** The sandbox image needs version control and the GitHub CLI present at first use — the framework has explicit error codes for their absence and the slim base ships neither. It also carries a generic toolchain, builds for `linux/arm64`, and copies no application code, because repositories are cloned inside the session's container at runtime.
- **Nothing is cloned onto the host.** A checkout produced by a session must exist only inside the container.
- **Identity is local and org-bearing.** Sign-in authenticates email and password against this deployment's own Postgres, with no redirect anywhere external. The chosen provider is the only one in the chain that implements the organizations interface, which every integration depends on. Auth tables are created in the same database and on the same connection string as the application tables, under one set of migrations.
- **The concurrency cap must refuse, not thrash.** A session request past the configured maximum returns an actionable error naming the cap.
- **Registration is opened once and then closed.** Sign-up defaults to open; the single account is created while still on loopback, then sign-up is disabled as a committed code change — not an env toggle a bad `.env` could silently revert — so the sign-up form disappears from the SPA and the sign-up endpoint refuses. This must be confirmed before any story in the next epic.
- **Credential encryption before first credential.** The credential-encryption key and its id must be set before anything is stored, or provider keys and OAuth tokens persist as plaintext; the key must be escrowed, since without it the database survives but every stored credential is undecryptable.
- **Zero external dependency.** The platform shared-API URL, platform tokens/ids, cloud sandbox keys, the previous identity provider's variables, and the auth-disable flag must all stay unset — the last one also silently disables credential encryption.
- **Graceful degradation.** Env-key groups are validated at construction and report "not configured" rather than throwing; an unconfigured integration never blocks boot.

## Technical Decisions

- **The entry stays indivisible, and extraction is deferred.** The literal `new Mastra(...)` constructing the export named `mastra` must remain in `src/mastra/index.ts` — a build-time source inspection depends on it. Both new branches land there, kept small and commented because the file now diverges from the upstream template. Do not start moving construction into config modules; that is the final epic's work.
- **One read site per env key.** Each `process.env.X` appears at exactly one location in first-party code; consumers receive parsed values by argument or export.
- **Env-key truth is split.** The env schema file is the only list of keys and is normative for validation, generated types and public/sensitive marking; the owning subject's README is normative for what a value must contain and how to obtain it. Neither restates the other's half. Every key introduced here must be declared in the schema, with secrets marked sensitive.
- **Operator-plane subjects own their READMEs.** The sandbox subject directory owns the sandbox env keys and the workdir key, and carries the build/retag command plus a tag history table. Operator-plane directories hold no first-party code and reach the code plane only through env vars and CLI invocation.
- **Image tags are date-stamped, never `latest`,** so rolling back a bad image is an env-var change. The tag actually built gets recorded in the tag history on confirmation.
- **Versions are intent, not pins.** The two new dependencies carry inherited version numbers that must be re-verified against the installed core's peer range at install time, and the version actually resolved recorded rather than assumed. Do not install a second copy of the auth library the provider already depends on; an unmet peer warning is expected and recorded rather than silenced by adding a dependency the code does not import.
- **Files are canonical.** The image definition is a real committed file at its seeded path, not a fenced block in prose.
- **Operator parking.** Work that cannot run from a story worktree — building an image, starting a server, signing in, opening sessions — commits whatever is automatable, then parks the story awaiting operator action with the exact commands and checkpoints listed, rather than reporting done. Completion is an explicit confirm step.
- **Gate reality.** Stories run in a fresh worktree with tracked files only; typecheck must be clean, and anything a story must read has to be committed.

## Cross-Story Dependencies

- Depends on Epic 1: a running container engine and a healthy Postgres on the host, plus the extended verify gate.
- Story 2.5 needs both the image from 2.1 and the sandbox branch from 2.2, and a signed-in account from 2.4.
- Story 2.4 needs the auth wiring from 2.3 before an account can exist.
- Story 2.6 flips the sign-up flag introduced by 2.3 and requires the account from 2.4 to already exist; it must be confirmed before any Epic 3 story opens the public origin.
- Stories 2.2 and 2.3 both edit the entry file, and both extend the env schema — sequential, each landing a different pre-designed section. Epic 5 later rewrites both into config modules.
