# Epic 1 Context: A verified repo and one datastore on a working engine

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the automated verify gate capable of failing for a real reason, give the host a working container engine, and reduce the deployment to exactly one stateful dependency. Today the gate is `tsc --noEmit` alone — a change can pass while being behaviourally wrong — and the compose file still describes two stores, one of which the single-process topology will never use. This epic pins dependency resolution so a fresh story worktree installs what the authoring machine installed, adds executable tests for the entry's pure helpers and wires them into the gate, hardens the datastore definition, and brings up the engine plus Postgres on the host. Every later epic runs behind this gate and on this store, so nothing else can be trusted until it lands.

## Stories

- Story 1.1: Pin the package manager so a fresh worktree resolves identically
- Story 1.2: Tests for the entry's pure helpers, running inside the verify gate
- Story 1.3: One datastore — drop Redis and harden the compose file
- Story 1.4: [operator] A working container engine and a healthy Postgres

## Requirements & Constraints

- **Reproducible install.** A fresh checkout with no `node_modules/` must install successfully from the committed lockfile, and a corepack-aware environment must select the intended npm version automatically. The declared package manager stays npm — a switch would be a full dependency re-resolution, which the no-backups posture forbids.
- **Exactly one package.** One `package.json` plus one `package-lock.json`, both at root, no `workspaces` field, and no workspace declaration file of any flavour anywhere in the tree.
- **Tested helpers.** The three pure helpers in the entry (integer parsing of env values, decoding the credential-encryption key, and the allowlist of env vars forwarded into a local sandbox) get automated tests, including malformed-input cases. A decode failure must name the environment variable it came from so a boot failure points at the key, not at the decoder.
- **The gate must actually run them.** Adding tests only counts if the test command is *appended* to the existing verify command list in the same change. The list already carries install, typecheck, and two structural guards; rewriting the array instead of appending silently deletes guards nothing else enforces. A deliberately failing test must fail the gate.
- **One datastore.** The Redis service and every volume, network and dependency reference to it are removed; its absence *is* the configured state, and no committed file may instruct anyone to set a Redis connection string. The database service carries a restart-always policy so it returns with the host.
- **Non-default credentials.** Template-default database user and password are replaced, while the database name, port, and image stay as documented so the connection-string shape holds. Example env files carry shapes only, never a real secret.
- **External contract preserved.** The `start`, `check` and `build` script names and behaviour must not change — supervision artifacts in a later epic invoke them by name with the repo root as cwd.

## Technical Decisions

- **Root is a closed set.** New root-level directories and root-level config files are a spine change, not a local call. In particular, no test-runner config file is added at root and no root `tests/` directory is created — tests live under `src/mastra/` and the runner uses its defaults through an npm script.
- **The compiler's reach is the boundary.** `tsconfig.json` keeps `include: ["src/**/*"]`; anything outside `src/` is unverified because typecheck is the gate. No first-party program source outside `src/`, with operator shell scripts the only carve-out.
- **Single machine, single process.** One Node process serves UI, API and in-process workers. No Redis, no replicas, no shared external queues, no cross-process leases. Any design assuming otherwise is a conflict to surface rather than a local choice.
- **Env-key truth is split.** The env schema file is the only list of keys and is normative for validation, generated types and public/sensitive marking. The owning subject's README is normative for what a value must contain and how to obtain it. Neither restates the other's half. Any key whose presence or shape changes must be reflected in the schema.
- **The entry stays indivisible.** The entry file must keep a literal `new Mastra(...)` constructing an export named `mastra` — a build-time source inspection depends on it. Extraction into config modules is deliberately deferred to the final epic; do not start it here.
- **Verify-gate reality.** Stories run in a fresh worktree containing tracked files only, so install is part of the gate rather than a precondition. Anything a story must read has to be committed — untracked files are invisible to story agents.
- **Operator parking.** Work that cannot be done from a story worktree (installing software, starting a VM, building images) commits whatever is automatable — typically a README recording the procedure by command — then parks the story awaiting operator action with the exact commands listed, rather than reporting done. Completion happens through an explicit confirm step.
- **Build succeeds after tests land.** The deployer bundles from the entry's directory, so adding test files there must leave both the build and the typecheck clean.

## Cross-Story Dependencies

- Story 1.4 consumes the hardened compose file from Story 1.3; it cannot be confirmed before 1.3 lands.
- Story 1.2 depends on Story 1.1's reproducible install — the gate's test command runs after `npm ci` in a fresh worktree.
- Every later epic depends on this one: Epic 2 needs a running engine and store, and all epics run behind the gate Story 1.2 extends.
- Stories 1.1 and 1.3 both touch root-level config; 1.3 also touches the env schema, which Epics 2 and 3 extend later. The overlap is sequential — each lands a different pre-designed section with no feedback loop.
