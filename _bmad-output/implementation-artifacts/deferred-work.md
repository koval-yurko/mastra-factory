### DW-1: Nothing in the verify gate re-checks the packageManager pin or the absence of workspace declarations, so both invariants are true at this commit and unenforced afterwards.
origin: spec-deferred c482c5a49419
location: .bmad-loop/policy.toml [verify].commands
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: medium
reason: All four commands in .bmad-loop/policy.toml [verify].commands were read and traced. `npm ci` runs under the ambient npm and never consults `packageManager` (confirmed empirically: a scratch package pinned to npm@99.99.99-does-not-exist still installed cleanly under npm 11.17.0). `npm run check` is `tsc --noEmit` with include: ["src/**/*"], so package.json is never read as a program. The two shell guards filter on `*.ts *.js *.mjs *.cjs` paths and on `.agents/skills` status respectively, so neither sees package.json, a reintroduced pnpm-workspace.yaml, or a competing lockfile. `engines.npm` is also unset, so a non-corepack host with a different npm diverges silently. Smallest fix: append one `sh -c` guard to [verify].commands asserting that package.json's `packageManager` matches `npm --version`, that no `workspaces` key exists, and that no competing workspace/lock file is tracked - following the `&& exit 1 || exit 0` idiom the two existing guards already use. Not done here: it adds a
status: open

### DW-2: .env.schema and .env.example still instruct the reader to run `pnpm db:up` from a "monorepo root", against a hardcoded default connection string.
origin: spec-deferred 2d08071c4094
location: .env.schema:196 and .env.example:168
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: medium
reason: .env.schema:196 and .env.example:168 both read: run `pnpm db:up` from this package (`pnpm --dir mastracode/web db:up` from the monorepo root), with postgres://user:pass@localhost:54329/mastracode_web inline. Three contradictions with AD-1 and the single-package posture: the pnpm invocation, the monorepo assertion, and template-default credentials. This story degrades the inconsistency rather than merely inheriting it. The deleted pnpm-workspace.yaml existed to suppress ERR_PNPM_IGNORED_BUILDS on pnpm v10+, so a reader following that prose now hits the failure the deleted file suppressed; and in a corepack-shimmed environment - the environment the new `packageManager` field exists to serve - a `pnpm` invocation hard-errors on a package-manager mismatch. Smallest fix: change both comments to `npm run db:up` and drop the monorepo path. Routed to Story 1.3, which already edits both files (non-default credentials, env schema update) and is the next story in this epic.
status: open

### DW-3: Node is unpinned and AGENTS.md's stated Node version does not match the machine's.
origin: spec-deferred 8258050aa542
location: package.json engines / AGENTS.md
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: low
reason: engines.node is ">=22.19.0" with an open upper bound; there is no .nvmrc and no engines.npm; the authoring machine runs Node v24.19.0 while AGENTS.md states "TypeScript on Node 22". Pinning npm alone does not fully deliver "a fresh worktree resolves identically" - the Node major is still free to move. Deferred rather than fixed: an .nvmrc would add a root-level file, which AD-3 forbids (root is a closed set), and correcting the version statement edits AGENTS.md, an agent-context file. Needs a decision on whether to narrow engines.node or accept Node 22+ as the real contract, then one edit in whichever artifact wins.
status: open

### DW-4: `npm run build` writes 24 untracked files into src/mastra/public/factory/ that no .gitignore rule covers, so any build leaves the working tree dirty.
origin: spec-deferred 67931d3c5a9f
location: .gitignore / src/mastra/public/factory/
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: medium
reason: Discovered while verifying this story: `mastra build --dir src/mastra` logs "Copying Factory UI..." and materialises src/mastra/public/factory/ (index.html, assets/, favicons, pwa icons, routes-manifest.json). The directory does not exist at baseline 5d10559, is not in .gitignore, and was removed by hand here so the story's diff stayed clean. A story agent that runs `npm run build` and then commits would commit the bundled UI; one that does not clean up trips the orchestrator's clean-tree check at finalization. Smallest fix: add `src/mastra/public/factory/` to .gitignore. It must be that exact path, not `src/mastra/public/`, because AGENTS.md documents src/mastra/public/factory-skills/<skill-name>/SKILL.md as a real first-party override location that has to stay committable.
status: open

### DW-5: AGENTS.md states there is no test script, that the verify gate runs four commands, and that .bmad-loop/policy.toml is gitignored — all three are false after this story.
origin: spec-deferred 32b3d27e2974
location: AGENTS.md:44, AGENTS.md:46, AGENTS.md:49
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: AGENTS.md:44 "Verify with `npm run check`. There is no test script, so it is the only automated check until a story adds one" — this story added it. AGENTS.md:46 describes the gate as `npm ci`, `npm run check` "and two guards"; it is now five commands. AGENTS.md:49 says policy.toml "is gitignored and exists only in the main checkout"; `git ls-files` returns it and .gitignore:12 carries a comment saying it is deliberately tracked (this was already known false from Story 1.1's review and is now compounded). Smallest fix: three sentence-level edits in AGENTS.md. Deferred because the fix edits an agent-context file, which this workflow routes to the ledger rather than patching mid-story.
status: open

### DW-6: decodeCredentialEncryptionKey validates byte length only, so a value containing non-base64 characters is accepted whenever its valid characters still decode to 32 bytes.
origin: spec-deferred 16eb37173212
location: src/mastra/index.ts:61-64
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: Verified: Buffer.from('!!!!' + 'A'.repeat(43), 'base64').byteLength === 32, and the helper returns that buffer. A typo-corrupted key therefore decrypts stored credentials to garbage rather than failing at boot with a message naming the variable. Smallest fix: assert the string matches /^[A-Za-z0-9+/]{43}=$/ before decoding. Not done here: the spec forbids changing any helper's behaviour — this story observes them. The lenient behaviour is now pinned by a test, so a future tightening is a visible edit.
status: open

### DW-7: credentialEncryption() JSON.parses FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS before validating it, so malformed JSON aborts boot with a bare SyntaxError naming nothing; it is untested, and the
origin: spec-deferred b2e660f6dc54
location: src/mastra/index.ts:67-96
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: src/mastra/index.ts:69-86. The JSON.parse is unguarded, so a stray character produces "Unexpected token ... in JSON" with no mention of the variable — exactly the boot-failure legibility problem this epic exists to fix, in the function next door to the one it fixed. The primary key is read with `?.trim()` at line 68 while previous-key strings reach decodeCredentialEncryptionKey untrimmed, so a trailing newline fails only on rotation. The function is not exported and not covered. Out of scope here: the epic names three pure helpers, and this one reads process.env directly.
status: open

### DW-8: The gate's test command boots the whole factory because the tests import the entry; the environment it boots in is arranged by a prefix denylist that a future env var could escape.
origin: spec-deferred de8d3aa4c65e
location: src/mastra/index.test.ts:27-55
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: src/mastra/index.test.ts imports ./index, whose module body runs `await factory.prepare()` and `await factory.finalize()` (workers started). Two inherited variables were shown to break the gate before the sweep landed: REDIS_URL made `npm test` hang past 75s, and a malformed FACTORY_CREDENTIAL_ENCRYPTION_KEY aborted it with zero tests run. The sweep covers FACTORY_/MASTRA_/MASTRACODE_/WORKOS_/GITHUB_APP_/LINEAR_/SLACK_APP_/E2B_ plus REDIS_URL, DATABASE_URL and APP_DATABASE_URL — correct today, but it is a denylist mirroring the entry by hand. Epic 5's extraction of config out of the entry retires the whole mechanism; until then a new differently-named key in the entry is a silent hole.
status: open

### DW-9: Nothing bounds or tears down the factory the test boots — no afterAll shutdown, and no per-command timeout in [verify].commands — so a boot that hangs stalls the gate rather than failing it.
origin: spec-deferred a53224131bee
location: .bmad-loop/policy.toml [verify] / src/mastra/index.test.ts
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: The test file has no afterAll; the entry starts controller workers at import and the process exits only because nothing holds the loop. .bmad-loop/policy.toml [limits] has git_timeout_s (git subprocesses only) and session_timeout_min (the whole session), but no per-verify-command bound. The REDIS_URL reproduction showed what that costs: no output, no exit, until something outside kills it. The env sweep removes today's known trigger, not the exposure. Smallest fix: a per-command timeout in the verify runner, or `--testTimeout`/a hard process bound on the test command. Both are orchestrator surface beyond this story.
status: open

### DW-10: engines.node ">=22.19.0" admits Node 23 and 25, which vitest@5.0.1 does not support, and npm reports the mismatch as a warning only.
origin: spec-deferred 3384e5fbd132
location: package.json engines
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: low
reason: vitest@5.0.1 declares engines.node "^22.12.0 || ^24.0.0 || >=26.0.0"; package.json declares ">=22.19.0" with an open upper bound and there is no engine-strict setting, so EBADENGINE does not fail `npm ci`. The gate would run its test runner on an unsupported runtime. Same root cause as ledger entry DW-3 (Node unpinned); the decision owed there — narrow engines.node or accept Node 22+ — now has a second constraint to satisfy.
status: open

### DW-11: The verify gate never runs `npm run build`, so the epic's "the build still succeeds with test files in src/mastra" criterion is a one-time manual observation.
origin: spec-deferred 2c30c0be9e9b
location: .bmad-loop/policy.toml [verify].commands
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: [verify].commands is npm ci, npm run check, two git guards and npm test — no build. The deployer scans named subdirectories (agents/, workflows/, skills/, schedules/, subagents/), so today's top-level src/mastra/index.test.ts is not collected and the manual build passes. A test file placed under src/mastra/agents/ would be bundled and drag vitest into a deploy, while npm run check and npm test both stay green. Not done here: adding `npm run build` to the gate makes every verify run write the untracked src/mastra/public/factory/ tree that ledger entry DW-4 is open about, so the two belong together.
status: open

### DW-12: The one place localSandboxEnv() is wired — the sandbox's env — is observed by no test, so the secret-withholding property is pinned at the helper and not where it takes effect.
origin: spec-deferred 5398e36c021e
location: src/mastra/index.ts:323
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: `env: localSandboxEnv()` at src/mastra/index.ts:323 is the helper's only call site (grepped the first-party tree). Replacing it with a spread of process.env leaves all four localSandboxEnv tests green and satisfies `tsc`, while GITHUB_APP_PRIVATE_KEY, WORKOS_API_KEY, DATABASE_URL and FACTORY_CREDENTIAL_ENCRYPTION_KEY — the exact keys the test lists as WITHHELD_KEYS — reach commands run inside an untrusted checkout. Not done here: reaching that callback means driving MastraFactory far enough to build a LocalSandbox, which is factory surface this story does not touch. It belongs with Epic 5's extraction of config out of the entry, alongside the boot-cost entries above.
status: open

### DW-13: positiveInt accepts every spelling Number() understands, so a typo'd capacity knob silently becomes a different valid number instead of falling back to the default.
origin: spec-deferred 4a806528e804
location: src/mastra/index.ts:45-50
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: Verified and now pinned by a test: '0x10' -> 16, '0b11' -> 3, '1e3' -> 1000, '+5' -> 5, ' 3 ' -> 3. Same class of defect as the decodeCredentialEncryptionKey leniency two entries above, which was filed; this one was pinned by a test but never filed, so the two got inconsistent treatment. Smallest fix: reject a value that does not match /^[0-9]+$/ before coercing. Not done here: the spec forbids changing any helper's behaviour — this story observes them.
status: open

### DW-14: Nothing in the repo can execute or even parse docker-compose.yml, so every property this story adds — the loopback publish, the required-password guard, the TCP healthcheck — ships behind no
origin: spec-deferred 55db33aa8639
location: .bmad-loop/policy.toml [verify].commands / docker-compose.yml
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: The five [verify].commands are npm ci, npm run check (tsc, include: ["src/**/*"]), two git path guards and npm test (vitest run --dir src). None parses YAML or invokes Compose, and docker-compose.yml is outside both the compiler's and the runner's scope: the gate produces byte-identical results before and after this change. Inverting the publish back to '54329:5432', or letting the healthcheck's ${POSTGRES_USER:-factory} drift from environment's, still exits 0 everywhere. No container engine exists on this machine (docker, colima, docker-compose all absent — verified), so `docker compose config` could not be run here either. Smallest fix: add `docker compose config -q` to [verify].commands once Story 1.4 lands an engine. Not done here: this story explicitly forbids requiring an engine, and [verify].commands is orchestrator surface.
status: open

### DW-15: The loopback-only publish 127.0.0.1:54329:5432 assumes Colima/Lima forwards a guest-loopback port to host loopback; that was reasoned from documentation, never observed.
origin: spec-deferred 7d417b749053
location: docker-compose.yml ports
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
reason: Story 1.4's checkpoint is "the container reports healthy on 127.0.0.1:54329". The previous binding ('54329:5432') published on every interface inside the VM, which Lima certainly forwards; the new one narrows it. If Lima's default port-forward rules do not cover guest 127.0.0.1, `npm run db:up` succeeds while the host cannot reach 54329, and Story 1.4 blocks on a change this story made for hardening rather than for any acceptance criterion. What would settle it: on the Story 1.4 host, after `npm run db:up`, run `pg_isready -h 127.0.0.1 -p 54329`. If it fails, revert the ports entry to '54329:5432'.
status: open

### DW-16: docker-compose.yml pins no project name, so the data volume's real name follows the checkout directory — moving or renaming the repo silently creates a new empty volume, and there are no backups.
origin: spec-deferred c3dafb4a0193
location: docker-compose.yml
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: Compose derives the project name from the directory basename when no top-level `name:` is set, and prefixes named volumes with it: the volume is mastra-factory_mastracode-web-pgdata, not mastracode-web-pgdata. AGENTS.md records that "the Postgres volume is the only copy of projects, work items, sessions, memory and tokens", so a rename that orphans it is unrecoverable. The fixed `container_name: mastracode-web-db` has the mirror problem: it defeats per-project namespacing, and now that restart: unless-stopped is set, a container started from a since-deleted directory survives reboots while holding both the name and port 54329. Smallest fix: add `name: mastra-factory` at the top of docker-compose.yml. Pre-existing: both the unpinned project name and container_name predate this story.
status: open

### DW-17: `npm run db:up` is `docker compose up -d --wait` with no `--wait-timeout`, so now that `restart: unless-stopped` keeps a failing container out of the exited state, a container that never reaches
origin: spec-deferred c04401f815c4
location: package.json db:up / docker-compose.yml restart policy
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: Compose's `--wait` defaults to `--wait-timeout 0`, meaning wait forever, and it ends early on a container that exits. Before this story a container that failed to initialize exited and `--wait` reported that failure; with `restart: unless-stopped` (added here) it crash-loops instead, so the loop never terminates and `npm run db:up` produces no output. Reachable through a POSTGRES_USER or POSTGRES_DB value the entrypoint rejects at initdb. Reasoned from Compose's documented flag semantics, not observed — no container engine exists on this machine. What would settle it: on the Story 1.4 host, set POSTGRES_USER to a value initdb rejects and run `npm run db:up`; if it hangs, the claim holds. Smallest fix: `docker compose up -d --wait --wait-timeout 120` in package.json `db:up`. Not done here: the intent pins `db:up` and `db:down` to their exact command strings (AD-11 / NFR10), so changing one is outside this story.
status: open

### DW-18: The two `# @public` annotations in .env.schema are load-bearing for the production log yet no check in the repo asserts they are still there, even though varlock can be run today.
origin: spec-deferred 3b9452900c4a
location: .env.schema (POSTGRES_USER / POSTGRES_DB @public) / test surface
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: `npm run start` is `varlock run -- mastra start`, which builds a find/replace over every sensitive value and applies it to non-TTY stdout. `POSTGRES_USER` and `POSTGRES_DB` inherit `@defaultSensitive=true` from the file header, so without `# @public` the literals `factory` and `mastracode_web` are masked throughout the deployment's only diagnostic surface — the defect this build found and patched. Deleting either annotation leaves `npm ci`, `npm run check`, both path guards and `npm test` all exiting 0: tsc is scoped to `src/**/*`, vitest runs `--dir src`, and neither parses .env.schema. Unlike the docker-compose gap above, this one is closable without a container engine: varlock is an installed devDependency and `varlock load` exits 0 in this worktree with no `.env` present. Smallest fix: a check that runs `node_modules/.bin/varlock load --format json-full --filter="POSTGRES_*"` and asserts `POSTGRES_USER.isSensitive === false`, `POSTGRES_DB.isSensitive === false`,
status: open

### DW-19: The `# @public` annotation on `DOCKER_HOST` is load-bearing for the production log, and no gate command observes it — a third instance of the condition DW-18 already records for `POSTGRES_USER` and
origin: spec-deferred 0082bb47af7c
location: .env.schema (DOCKER_HOST @public) / test surface
source_spec: `spec-1-4-operator-a-working-container-engine-and-a-healthy-postgres.md`
severity: medium
reason: `.env.schema`'s header is `@defaultSensitive=true`, so without `# @public` the key resolves as sensitive and `varlock run -- mastra start` masks it in non-TTY stdout — the deployment's only diagnostic surface, and the surface carrying the "cannot connect to the Docker daemon at …" error `ops/README.md` teaches the operator to read. Reproduced in a scratch schema: with the annotation `varlock run` printed the socket path, without it the value came back masked. Deleting the line leaves all five `[verify].commands` green — `tsc` is scoped to `src/**/*`, vitest to `--dir src`, and neither path guard nor `npm ci` parses `.env.schema`. Smallest fix: a vitest file under `src/` that shells out to `node_modules/.bin/varlock load --format json-full` and asserts `isSensitive === false` for all three `@public` keys — it would run inside `npm test`, the repo's own gate. Not done here: this story's intent forbids editing `src/` and `package.json`. The in-scope action is to widen DW-18 to name
status: open

### DW-20: `ops/README.md` is not the sole committed source for `DOCKER_HOST`'s value: `docs/Self-hosting research.md` states the same two spellings, and this story sets that file read-only.
origin: spec-deferred aa41ef8b8c61
location: docs/Self-hosting research.md §7.2 / §7.3 / §8 vs ops/README.md
source_spec: `spec-1-4-operator-a-working-container-engine-and-a-healthy-postgres.md`
severity: low
reason: §7.2 line 387 carries `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`, §7.3 line 420 the absolute launchd spelling, and §8 line 476 the export again. AD-6 gives the owning subject's README the "what the value must contain" half, so two documents can now drift about the same key. Nothing checks either way. Not done here: the intent sets `docs/` read-only because its section numbers are stable anchors cited across the spec and stories. Making `docs/` link out rather than restate is Story 5.3's work (FR32), and Story 5.2 audits key ownership.
status: open

### DW-21: Nothing compares `.env.schema` and `.env.example`, so a key added to one and not the other is invisible to every gate command.
origin: spec-deferred b15669a8c3da
location: .env.schema / .env.example
source_spec: `spec-1-4-operator-a-working-container-engine-and-a-healthy-postgres.md`
severity: low
reason: NFR18 requires the example file to mirror the schema shape-for-shape, and this change hand-mirrored an eleven-line comment block plus the key into both. The five `[verify].commands` never parse either file, so a one-sided edit ships green. Pre-existing: both files and the mirroring convention predate this story. Smallest fix: a check asserting the set of key names in `.env.example` (commented out) equals the set declared in `.env.schema`.
status: open
