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

### DW-22: `docs/Self-hosting research.md` §2.1 still carries a verbatim, unmarked copy of the image definition, and its build commands name an `-f` path that no longer resolves from the repository root plus a
origin: spec-deferred a1e0fb683d69
location: docs/Self-hosting research.md §2.1 / §2.2 / §8 vs sandbox/
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: medium
reason: A `diff` of §2.1 lines 96–117 against `sandbox/factory-sandbox.Dockerfile` shows only the two fences and the filename comment differing — every instruction line is identical. AD-5 requires a code block in `docs/` to be illustrative and marked non-normative; `grep -rn "non-normative" docs/` returns nothing. §2.1 line 120 and §8 line 490 both read `-f factory-sandbox.Dockerfile` (unresolvable from root now that the file lives under `sandbox/`) with `-t factory-sandbox:2026-09-22`, a date the `date +%F` build will never produce. §2.2 additionally states the `FACTORY_SANDBOX_MEMORY_GIB` / `FACTORY_SANDBOX_CPUS` / `MASTRACODE_SANDBOX_WORKDIR` values that `sandbox/README.md` now owns, so two documents can drift about the same keys. Not done here: this story sets `docs/` read-only because its section numbers are stable citation anchors. Making `docs/` link out rather than restate is Story 5.3's work (FR32), and Story 5.2 audits key ownership. Second instance of open DW-20, which records the
status: open

### DW-23: No gate command can read a Dockerfile, so the no-`COPY`, no-`latest` and `WORKDIR /workspace` invariants this story's acceptance criteria assert are hand-checked once and unenforced afterwards.
origin: spec-deferred c63fae638826
location: .bmad-loop/policy.toml [verify].commands / sandbox/factory-sandbox.Dockerfile
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: medium
reason: The five `[verify].commands` are `npm ci`, `npm run check` (`tsc --noEmit`, `include: ["src/**/*"]`), a path guard filtering `*.ts *.js *.mjs *.cjs`, a `.agents/skills` status guard, and `npm test` (`vitest run --dir src`). None of them parses a `.Dockerfile` or a `.md`: adding a `COPY . /workspace`, retagging to `latest`, or moving `WORKDIR` leaves all five exiting 0. Smallest fix: three `sh -c` grep guards appended to `[verify].commands`, following the `&& exit 1 || exit 0` idiom the two existing guards already use. Not done here: `.bmad-loop/policy.toml` is orchestrator surface this story's intent sets read-only. Same shape as open DW-14 (nothing can parse `docker-compose.yml`).
status: open

### DW-24: Whether `/usr/share/keyrings` exists in `node:22-bookworm-slim` is unverified; if it does not, the `curl -o` write fails and the build dies at the operator's first action.
origin: spec-deferred d9cff73d2206
location: sandbox/factory-sandbox.Dockerfile:5-6
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
reason: The image writes `/usr/share/keyrings/githubcli-archive-keyring.gpg` with `curl -o` and never creates the directory, while GitHub's own Debian instructions open with `mkdir -p -m 755 /usr/share/keyrings` precisely because it is not guaranteed. Debian base images normally ship it via `debian-archive-keyring`, which is why the inherited §2.1 recipe omits the `mkdir` — but no container engine exists on this host, so it could not be observed either way, and the Dockerfile is pinned to §2.1's content by this story's acceptance criteria. What would settle it: `docker run --rm node:22-bookworm-slim ls -d /usr/share/keyrings`, or simply the operator's first `docker build`. The failure is loud and immediate, and `sandbox/README.md`'s "If the build fails" section already names the `mkdir -p` fix, so the cost of being wrong is one retry rather than a silent defect.
status: open

### DW-25: The build context is the repository root with no `.dockerignore`, so `node_modules/`, `.git/`, `_bmad-output/` and `.env` are transferred to the engine on every build even though the image copies
origin: spec-deferred dfd1f11b1a9d
location: sandbox/README.md build command / repository root (.dockerignore absent)
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: low
reason: `docker build … -f sandbox/factory-sandbox.Dockerfile … .` makes the repo root the context; there is no `.dockerignore` anywhere in the tree, and `node_modules/` alone is over 1 GB here before the `.bmad-loop/runs/` worktrees. Nothing lands in the image — the Dockerfile has no `COPY`/`ADD` — so the cost is transfer time, plus `.env` (which holds `POSTGRES_PASSWORD`) being sent to the daemon. Not done here, two ways: the epic's acceptance criterion pins the build command's trailing `.`, and a root `.dockerignore` would add a file to the closed root set AD-3 defines, which is a spine decision rather than a local call. Either fix — narrowing the context to `sandbox/`, or adding the ignore file to the root allowlist — needs that decision first. `sandbox/README.md` documents the cost in the meantime.
status: open

### DW-26: Session containers are long-lived, one per session, with no idle teardown and nothing reaping them, so they accumulate for the life of the host and the VM disk is the real limit.
origin: spec-deferred 76029d7616d5
location: sandbox/README.md / src/mastra/index.ts dockerSandboxOptions
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: medium
reason: `@mastra/docker`'s `clone()` doc states `idleTimeoutMinutes` is ignored because "Docker containers have no provider-side idle teardown", and the entry stops nothing. Each container holds a checkout plus `node_modules`. The package labels every one `mastra.sandbox`, so `docker ps -a --filter label=mastra.sandbox=true` is the handle a cleanup procedure would use. Not done here: lifecycle and the concurrency cap are Story 2.5's subject ("a session gets a real container, and the cap holds"), and nothing can be observed without a running engine.
status: open

### DW-27: No concurrency cap exists at all — `MASTRACODE_MAX_SANDBOXES` is read by nothing, so Story 2.5's acceptance criterion that a session past the maximum returns an actionable error naming the cap is not
origin: spec-deferred cc76107e9bd6
location: _bmad-output/planning-artifacts/epics.md Story 2.5 / .env.schema MASTRACODE_MAX_SANDBOXES
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: medium
reason: `grep -rl MAX_SANDBOXES node_modules` returns nothing, and `@mastra/factory/dist/factory.js:259` states: "'maxSandboxes' is gone with the sandbox fleet — there is one sandbox per session and no pool to cap." Every statement this story could reach was corrected to say the key records the sizing rather than enforcing it, but the capability itself is absent: a fourth concurrent session gets its own full 10 GiB / 4-core ceiling and the 32 GiB VM is oversubscribed. What this needs: either a first-party cap in the entry (new behaviour, and the actionable-error wording is Story 2.5's to specify) or Story 2.5 re-scoped against what `@mastra/factory@0.15.0` actually offers. Not a call this story can make.
status: open

### DW-28: `ARCHITECTURE-SPINE.md` and the canonical `SPEC.md` both still state that `@mastra/docker` is not installed, which this story makes false.
origin: spec-deferred 5b69817a8e29
location: ARCHITECTURE-SPINE.md:236-243 / spec-self-hosted-factory/SPEC.md:110
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: low
reason: `ARCHITECTURE-SPINE.md` lines 236-243 list `@mastra/docker` under "**Planned, not yet resolved** — … Neither is in `package.json` or `node_modules` as of 2026-09-22", and `_bmad-output/specs/spec-self-hosted-factory/SPEC.md:110` says "neither is installed". Both were accurate when written and both carry "Re-verify at install", which this story did: `0.8.0` resolved, peer `>=1.67.0-0 <2.0.0-0` satisfied by core `1.67.0`. Not done here: `SPEC.md` is the canonical requirements contract and the spine is the architecture record; a story amending either from inside an epic is how those documents stop being trustworthy. `@mastra/auth-better-auth` in the same table is still genuinely uninstalled, so the row cannot simply be deleted — Story 2.3 will falsify that half.
status: open

### DW-29: `AGENTS.md` states `.bmad-loop/policy.toml` is gitignored and exists only in the main checkout. It is tracked, deliberately, and that false sentence caused Story 2.1 to defer a gate fix it could have
origin: spec-deferred da23966be0e8
location: AGENTS.md:46-49 vs .gitignore:10-12
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: medium
reason: `git check-ignore -v .bmad-loop/policy.toml` exits 1 and `git ls-files .bmad-loop/` lists it, while `.gitignore:12` carries the comment "`.bmad-loop/policy.toml` is deliberately TRACKED: Story 1.2 must extend …". `AGENTS.md:46-49` says the opposite. Story 2.1's deferred item 2 ("no gate command can read a Dockerfile") was parked on the premise that the file "is gitignored orchestrator surface"; this story verified otherwise and added a gate command directly. Story 2.1's item 2 is therefore actionable now, not blocked. Not done here: `AGENTS.md` is an agent-context file and is regenerated by `bmad-project-context`; editing the managed block by hand is replaced on refresh.
status: open

### DW-30: Three keys in `.env.schema` still use `@type=string(matches=...)`, a form varlock deprecates in favour of `regex(...)`, and the new gate command surfaces the warning.
origin: spec-deferred ae8f1165f22e
location: .env.schema MASTRACODE_MAX_SANDBOXES / MASTRA_PLATFORM_GITHUB_POLLING_INTERVAL_MS / MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: low
reason: Running `npx varlock load --format json` against an invalid config prints, for each of `MASTRACODE_MAX_SANDBOXES`, `MASTRA_PLATFORM_GITHUB_POLLING_INTERVAL_MS` and `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS`: "string patterns are deprecated, use regex() instead … a future major version will stop reading a string as a regex". `varlock` is pinned `^1.9.0`, so that major is reachable by a routine update, and the constraint would then be read as a literal string rather than a pattern — silently admitting any value. Not done here: the three annotations are pre-existing and this story added none of them (its own two were deleted in the first review pass). Two of the three keys are interval knobs with nothing to do with the sandbox, and the fix is one substitution per key across a file three stories now edit — better done once, deliberately, than folded into an unrelated change.
status: open

### DW-31: The DW-27 and DW-29 headings in the deferred-work ledger end mid-sentence, because the writer truncates the summary it copies from a spec's `deferred` entry.
origin: spec-deferred 6edfb51f08df
location: _bmad-output/implementation-artifacts/deferred-work.md DW-27 / DW-29
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: low
reason: `deferred-work.md` DW-27 ends "… naming the cap is not" and DW-29 ends "… a gate fix it could have"; the corresponding `summary` fields in this spec's frontmatter end "… is not implementable with the installed packages" and "… a gate fix it could have made". Both entries' `reason:` fields carry the full claim, so no information is lost — only the one-line heading a sweep reads first is cut. Every earlier DW entry written from a shorter summary is intact, which points at a length limit in the writer rather than at these two entries. Not done here: `deferred-work.md` is the orchestrator's ledger and this session is instructed not to modify existing entries; the fix belongs in whatever writes them.
status: open

### DW-32: `@mastra/auth-workos` is now an unused root dependency: this story removed its only first-party import, and nothing under `src/` references it.
origin: spec-deferred ea94c665404a
location: package.json dependencies['@mastra/auth-workos']
source_spec: `spec-2-3-identity-this-machine-owns-with-organizations.md`
severity: low
reason: `grep -n 'MastraAuthWorkos\|@mastra/auth-workos' src/mastra/index.ts` returns nothing after this change, while `package.json` still carries `"@mastra/auth-workos": "1.6.5"`. Removing it is safe in principle — `@mastra/factory@0.15.0` declares the same exact `1.6.5` as a direct dependency, so the package stays in the tree and its `envFallbackAuthProvider` keeps working — which is also why nothing observable changes either way. Not done here: NFR20 makes a dependency-tree change something to re-verify and record deliberately, and this story's package.json task is the single addition it was scoped to. The natural owner is Epic 5's dependency and extraction work.
status: open

### DW-33: `AGENTS.md` tells agents to leave `WORKOS_*` unset, while the env files now tell an operator to keep `WORKOS_COOKIE_PASSWORD` set so the OAuth/link `state` signer survives a restart.
origin: spec-deferred 030fc2a55be0
location: AGENTS.md:66-69 vs .env.schema "WorkOS (legacy)" section / src/mastra/index.ts stateSecret
source_spec: `spec-2-3-identity-this-machine-owns-with-organizations.md`
severity: low
reason: `AGENTS.md:66-69` lists `WORKOS_*` among the variables that must stay unset or "self-hosting silently defers back to Mastra's platform". After this story that is only half true: the credential pair is inert, but `WORKOS_COOKIE_PASSWORD` is still read at `src/mastra/index.ts` in the `stateSecret` fallback chain, and `.env.schema` now says so explicitly. The cleaner resolution is to stop depending on a WorkOS key at all: this story introduced `BETTER_AUTH_SECRET`, a deployment-stable secret that is a better `state`-signer fallback than a WorkOS cookie password, which would retire the last reason any `WORKOS_*` key stays alive. Not done here: the fix edits `AGENTS.md`, an agent-context file regenerated by `bmad-project-context`, and changing the signer chain is behaviour this story did not need.
status: open

### DW-34: `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` remains declared, `@public` and `@type`-validated in `.env.schema` while nothing in the server or the installed packages reads it.
origin: spec-deferred 8effee78b917
location: .env.schema MASTRACODE_BOOTSTRAP_PERSONAL_ORG / .env.example
source_spec: `spec-2-3-identity-this-machine-owns-with-organizations.md`
severity: low
reason: `grep -rn MASTRACODE_BOOTSTRAP_PERSONAL_ORG src node_modules/@mastra` returns nothing; the only hits are the declarations in `.env.schema` and `.env.example`. It was already unread before this story — the WorkOS provider never consulted it — so this is pre-existing, and this diff only documents it as unused. A fully-typed declaration in the canonical key list still reads as a live switch, and an operator who sets it to `0` gets personal organizations anyway. Not done here: deleting a declared key is a decision about the key list rather than about auth selection, and `.env.schema` is edited by several stories in sequence.
status: open

### DW-35: `MASTRA_HOST` and `PORT` appear in neither `.env.schema` nor `.env.example`, so "copy `.env.example` to `.env`" cannot produce two of the seven values the first sign-in needs, and `.env.example`'s
origin: spec-deferred 5796d418a22c
location: .env.schema / .env.example vs README.md "Start the Factory Server" step 1
source_spec: `spec-2-4-operator-sign-in-on-loopback-and-land-in-an-organization.md`
severity: low
reason: `grep -nE 'MASTRA_HOST|^PORT' .env.schema .env.example` returns nothing, while `README.md`'s step 1 now requires both. `.env.example:2-3` reads "every value is optional — features light up as their variables are set", which is false for these two on the loopback path: unset, `MASTRA_HOST` puts the open sign-up form on every interface and an unset `PORT` lets the CLI drift off the origin `MASTRACODE_PUBLIC_URL` names. `AGENTS.md:61-63` makes `.env.schema` the only list of keys, so an undeclared key the committed procedure requires is off-list by the repo's own rule. Not done here: `epics.md:681-684` is Story 3.2's acceptance criterion verbatim — "`MASTRA_HOST` and `PORT` are declared in `.env.schema` rather than left undeclared … and their values are marked `@public`". Declaring them in this story would take that criterion. Verified this session that the gap is inert for the path this story documents: `varlock load --format json` against a `.env` carrying both keys exits 0 and passes
status: open

### DW-36: The concurrency cap counts the session sandboxes the CURRENT server process handed out, so containers that outlive a restart are not counted and the host can end up running more session containers
origin: spec-deferred b294a61a59c6
location: src/mastra/index.ts `liveDockerSandboxes` / `admitDockerSession`
source_spec: `spec-2-5-operator-a-session-gets-a-real-container-and-the-cap-holds.md`
severity: low
reason: `src/mastra/index.ts` `liveDockerSandboxes` is a module-level `Map` populated by `selectSandbox`'s docker branch, so it starts empty on every boot. Session containers have no idle teardown (`deferred-work.md` DW-26) and `@mastra/docker/dist/index.js:794-804` reattaches by querying the daemon for `mastra.sandbox.id=<id>`, so the containers themselves survive a restart while the registry does not: restart with three containers still up and three more sessions are admitted, for six containers on a host sized for three. Not done here: closing it needs the real occupancy from the engine — `listContainers` filtered on `mastra.sandbox=true` — which is async, while the slot Factory calls is `(ctx: FactorySandboxContext) => MastraSandbox`, synchronous, with the documented contract that "construction must be cheap and side-effect-free" (`sandbox/session-sandbox.d.ts:36,54`). There is nowhere to await it without either an async slot the type forbids or a dockerode client in the entry, which AD-2
status: open

### DW-37: Closing registration leaves no self-service password recovery and no documented way to add a second operator — and a second account would not see the first account's work anyway.
origin: spec-deferred 116064269ef9
location: README.md "Start the Factory Server" step 3 / Troubleshooting
source_spec: `spec-2-6-operator-close-registration-before-anything-is-public.md`
severity: low
reason: No email sending is configured anywhere in this deployment, so better-auth's reset-password flow has no transport; with sign-up closed, a locked-out operator's only path is the same source edit README step 3 now documents, which is not labelled as recovery. Separately, the personal-org bootstrap keys on the user id (`personal-<user id>`, `@mastra/auth-better-auth/dist/index.js` `ensureOrganization`), so a second account lands in its own organization and sees none of the first account's projects, stored credentials or GitHub connection — every integration is org-scoped. Not done here: both are pre-existing consequences of the Story 2.3/2.4 identity design rather than of this diff, and documenting multi-operator semantics is new content about a scenario this single-operator deployment has not reached. The natural owner is whichever story first adds a second human.
status: open

### DW-38: `docs/Self-hosting research.md` is now the one committed document describing a different account-creation mechanism from `README.md` step 3.
origin: spec-deferred d0b5746eb552
location: docs/Self-hosting research.md §6-7 vs README.md step 3
source_spec: `spec-2-6-operator-close-registration-before-anything-is-public.md`
severity: low
reason: `docs/Self-hosting research.md:235,497-502,597` describe the sequence as "create the account on loopback with `signUpEnabled: true`, then flip to `false` before the tunnel" — accurate as the plan and as history, but a reader who lands there rather than in `README.md` will not find the reopen-and-restore procedure step 3 now specifies, nor the probe that verifies it. Not done here: `AGENTS.md:26-27` makes that file's section numbers stable citation anchors used across the spec and stories, and `epics.md` assigns the file to Story 5.3, which renames and rewrites it. Editing its prose from this story risks the anchors for a divergence that is currently only a difference of detail, not a false statement.
status: open

### DW-39: `.env.schema` and `.env.example` still carry the provider-console prose the three new subject READMEs now own, so two committed documents describe how to obtain the same thirteen values.
origin: spec-deferred 9c30fba52681
location: .env.schema:45-65,312-315,364-365 and .env.example vs apps/*/README.md
source_spec: `spec-3-1-every-callback-url-recorded-where-its-subject-owns-it.md`
severity: medium
reason: `.env.schema:45-65` tells the operator where each Slack credential lives ("Basic Information → App Credentials", "starts xoxb-"), `:312-315` gives the GitHub callback-registration instruction, and `:364-365` the Linear one; `.env.example` duplicates all of it verbatim with the decorator lines stripped. AD-6 and `AGENTS.md:61-63` give that half to the owning subject's README and say neither side restates the other's, so before this change the schema was the only copy and after it there are two. Nothing checks either way, and the schema copy is the one an operator editing `.env` meets first. Not done here: `epics.md:1014-1019` is Story 5.2's acceptance criterion verbatim — "`.env.schema` does not restate how to obtain a value from a provider console" — so stripping the prose here would take that story's criterion. The duplication is inert in the meantime: the two copies agree today, and the READMEs are the normative half under AD-6 from the moment they exist.
status: open

### DW-40: The Cloudflare public-hostname mapping is the one row in the §4.1 registry that still has no subject README, so "every callback URL recorded where its subject owns it" is not yet literally true for
origin: spec-deferred ec2a70d67cc7
location: ops/README.md (absent section) vs docs/Self-hosting research.md §4.1 Cloudflare row
source_spec: `spec-3-1-every-callback-url-recorded-where-its-subject-owns-it.md`
severity: low
reason: `docs/Self-hosting research.md` §4.1 carries `Cloudflare | Public Hostname → URL | 127.0.0.1:4111 (type HTTP)`, and the paragraph this story added to §4.1 concedes the gap by naming Cloudflare and Better Auth as the rows with no subject README. AD-3 makes the tunnel host infrastructure, which puts it in the existing `ops/` subject rather than a new root directory — so the owner exists and is simply unwritten. Not done here: `epics.md:689-691` is Story 3.2's acceptance criterion verbatim — "`ops/README.md` gains the tunnel section describing the install and the public-hostname mapping" — so writing the mapping here would take it. Until 3.2 lands, §4.1 remains that row's only record, which is why this story kept the table rather than emptying it.
status: open

### DW-41: `MASTRACODE_PUBLIC_URL` is the origin all three README URL tables derive from, yet no subject README owns it, and the one file that does specify it still pins it to loopback.
origin: spec-deferred 02199c0f7aaa
location: README.md:41 vs apps/github/README.md:24 and apps/linear/README.md:21
source_spec: `spec-3-1-every-callback-url-recorded-where-its-subject-owns-it.md`
severity: medium
reason: `apps/github/README.md:24` and `apps/linear/README.md:21` both state that Factory derives their callback path from the public origin held in `MASTRACODE_PUBLIC_URL`, and both write that path as `https://factory.kovalchuk.win/...`. The key itself falls outside this story's partition (`GITHUB_APP_*`, `LINEAR_*`, `SLACK_APP_*`, `MASTRACODE_CHANNELS_PUBLIC_URL`), so it gained no `##` section anywhere. Its only specification in the repo is root `README.md:41` — "exactly `http://127.0.0.1:4111`: scheme, host and port" — written for the loopback-only deployment that preceded this epic. An operator who configures `.env` from the root README therefore registers loopback-derived callbacks, which is the exact failure `docs/Self-hosting research.md:292-293` warns about. The two statements are both live and they contradict each other. Not done here: AD-6 puts the host/origin-facing keys in the `ops/` subject, and the intent's Never list leaves `ops/` untouched for Story 3.2, which is also the story
status: open

### DW-42: `ops/README.md` now holds two subjects at one heading level, so it carries two checkpoint sequences and two bring-up procedures with nothing structural separating them.
origin: spec-deferred 883292299578
location: ops/README.md
source_spec: `spec-3-2-operator-a-public-origin-with-no-inbound-ports.md`
severity: low
reason: The H1 is `# Host infrastructure` and the container-engine half still runs as a flat sequence of H2s (`## DOCKER_HOST`, `## Before you start`, `## Bring-up`, `## Checkpoints`, `## Teardown`) with no section heading of its own, while the ingress half appended below it opens with `## Ingress — Cloudflare Tunnel` and ends with `## Ingress checkpoints`. A reader who lands on "Checkpoints" from a search cannot tell from the heading which subject it belongs to. Not done here: grouping the container-engine half under a heading means demoting five existing H2s to H3s, and `README.md:15,64` plus the Story 1.4 spec cite this file's checkpoints by number. Epic 4 adds supervision content to the same file, which is the change that should settle the structure for all three subjects at once rather than twice.
status: open

### DW-43: Five `MASTRACODE_GITHUB_*` keys that `@mastra/factory@0.15.0` and `src/mastra/index.ts` read are declared in neither `.env.schema` nor `.env.example`, so Story 5.2's criterion "every key the
origin: spec-deferred b47d8d43466a
location: .env.schema, .env.example, src/mastra/index.ts:233
source_spec: `spec-3-3-operator-a-github-app-that-belongs-to-yurii.md`
severity: low
reason: `src/mastra/index.ts:233` reads `MASTRACODE_GITHUB_AUTHORIZED_BOTS` and passes it to the integration as `authorizedBots`. `node_modules/@mastra/factory/dist/integrations/github/ integration.js:1006-1014` reads four more as the per-sweep overrides that take precedence over the declared legacy pair: `MASTRACODE_GITHUB_PR_RECONCILE_ENABLED`, `MASTRACODE_GITHUB_ISSUE_RECONCILE_ENABLED`, `MASTRACODE_GITHUB_PR_RECONCILE_INTERVAL_MS` and `MASTRACODE_GITHUB_ISSUE_RECONCILE_INTERVAL_MS`. `grep -c` for each over `.env.schema` and `.env.example` returns 0. Not done here: this spec's Never list forbids declaring them, because declaring a key is a schema decision with `@public`/sensitivity and type consequences and the audit that decides them is Story 5.2's (`epics.md:1014-1017`). `apps/github/README.md` documents only the keys that are declared, so the README and the schema stay consistent with each other in the meantime; the four reconcile overrides are unset in this deployment, and
status: open

### DW-44: `epics.md:730` still states "the 5-minute reconcile sweep" as the premise of Story 3.3's own acceptance criterion, so the frozen plan and the operator documentation now disagree about the one number
origin: spec-deferred 2df6ab13ac92
location: _bmad-output/planning-artifacts/epics.md:730
source_spec: `spec-3-3-operator-a-github-app-that-belongs-to-yurii.md`
severity: low
reason: This story established, against `node_modules/@mastra/factory/dist/integrations/github/ reconcile-worker.js:35`, that the sweep interval defaults to `36e5` — one hour — and corrected `apps/github/README.md`, `.env.schema`, `.env.example` and `docs/Self-hosting research.md` §5 accordingly. `epics.md:730` is the source of the five-minute figure and was not touched, so it is now the only place in the repository still asserting it, and it is the surface the next reader of this story's intent meets first. Not done here: `epics.md` is the frozen sprint plan that this and every other story is dispatched from, and rewriting a story's own acceptance premise mid-run would change the record the run is judged against. The operator-facing documents are corrected and are the ones AD-6 makes normative; the epics correction belongs to a retrospective or a plan amendment.
status: open

### DW-45: Four `MASTRACODE_LINEAR_*RECONCILE*` keys that `@mastra/factory@0.15.0` reads are declared in neither `.env.schema` nor `.env.example`, so Story 5.2's criterion "every key the deployment sets is
origin: spec-deferred d1a75f7453b0
location: .env.schema, .env.example, node_modules/@mastra/factory/dist/integrations/linear/reconciliation-config.js:12-17
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `node_modules/@mastra/factory/dist/integrations/linear/reconciliation-config.js:12-17` reads `MASTRACODE_LINEAR_ISSUE_RECONCILE_ENABLED`, `MASTRACODE_LINEAR_RECONCILE_ENABLED`, `MASTRACODE_LINEAR_ISSUE_RECONCILE_INTERVAL_MS` and `MASTRACODE_LINEAR_RECONCILE_INTERVAL_MS` straight off `process.env`, child name first and legacy name as the fallback, defaulting to enabled at the five-minute interval of `node_modules/@mastra/factory/dist/integrations/issue-reconcile-worker.js:5,25`. `grep -c` for each over `.env.schema` and `.env.example` returns 0. This is the same gap DW-43 records for GitHub, one integration over. Not done here: this spec's Tasks list forbids declaring them, because declaring a key is a schema decision with `@public`/sensitivity and type consequences and the audit that decides them is Story 5.2's (`epics.md:1014-1017`). `apps/linear/README.md` documents all four as read-but-undeclared and unset, with the precedence rule and the default, so the operator can still explain
status: open

### DW-46: `epics.md:749-751,768` still carries the five-scope list and makes "an @-mention of the app is received" a criterion of this story, so the frozen plan asserts a scope set and a capability that
origin: spec-deferred d8bdca98a444
location: _bmad-output/planning-artifacts/epics.md:749-751,768
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: medium
reason: This story established, against `node_modules/@mastra/factory/dist/integrations/linear/ integration.js:330`, that the authorize URL requests exactly `read,comments:create`, and that `app:mentionable` plus @-mentions are unreachable at this version for three independent reasons — the scope is not requested, `actor=app` is never sent (`integration.js:326-332`), and neither a Linear webhook route nor an `AgentSessionEvent` handler exists anywhere in the package (`grep -rn "webhook" .../integrations/linear/` and `grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/` both return nothing). `apps/linear/README.md`, `.env.schema`, `.env.example` and §6 of `docs/Self-hosting research.md` are corrected; `epics.md` is not, so it is now the only place still asserting both. Not done here: `epics.md` is the frozen sprint plan this story is dispatched from, and rewriting a story's own acceptance premise mid-run would change the record the run is judged against. The
status: open

### DW-47: The §11 trap-table row at `docs/Self-hosting research.md:670` still reads "all-or-nothing; one alone is a boot error", the symmetric claim this story disproved, because the row is a table row and this
origin: spec-deferred 84966d1ee1fa
location: docs/Self-hosting research.md:670
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `docs/Self-hosting research.md:670` is `| `LINEAR_CLIENT_ID` / `_SECRET` | all-or-nothing; one alone is a boot error |`. The real behaviour is asymmetric: the secret without the id fails varlock at `npm run start` and names `LINEAR_CLIENT_ID` (`.env.schema:395`), while the id without the secret passes validation and leaves the integration unbuilt and unlogged (`src/mastra/index.ts:242-243`, a ternary). The boot error that does exist is the state-signer one (`node_modules/@mastra/factory/dist/factory.js:369`, `.../integrations/linear/integration.js:306`), which the row does not mention. Not done here: this spec's Never list forbids adding, removing or changing any table row or heading in that file — §6 and §11 are a dated research record corrected by appending, and the appended 2026-09-23 paragraph under §6 now carries the correction. §6 already tells the reader that `apps/linear/README.md` wins on disagreement, so the stale row is shadowed rather than authoritative; a §11 pass that
status: open

### DW-48: The user-level memory note "Mastra Factory Linear OAuth scopes" still records the five-scope list and singles out `app:mentionable` as the easily-missed one, so the note contradicts the repository it
origin: spec-deferred cdaa6b085816
location: user memory: mastra-factory-linear-oauth-scopes.md
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: medium
reason: The note records five permissions observed on a consent screen on 2026-09-21 and maps them to `read`, `write`, `issues:create`, `comments:create`, `app:mentionable`, adding "`app:mentionable` is the easily-missed one: without it Factory can't be @-mentioned in Linear". This story established that the observation is of Mastra's *hosted* consent screen and is true of a client this deployment never constructs: `src/mastra/index.ts:36` imports `LinearIntegration`, whose `buildAuthorizeUrl` requests `read,comments:create` (`node_modules/@mastra/factory/dist/integrations/linear/integration.js:330`), and mentions are unreachable at `0.15.0` for three independent reasons. The note also repeats the symmetric boot-error claim this story disproved. Not done here: the memory store is outside the repository and outside this story's diff, and rewriting a user-level note is not a change a story worktree can commit or a reviewer can see. The correction is the same one already recorded for `epics.md`;
status: open

### DW-49: `epic-3-context.md` still carries the two claims this story disproved, and it is the file the remaining Epic 3 stories load as their primary planning context.
origin: spec-deferred 02eb9f7111e9
location: _bmad-output/implementation-artifacts/epic-3-context.md:45-49
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `_bmad-output/implementation-artifacts/epic-3-context.md:45-46` states "The mention-capability scope is easy to miss and its absence silently prevents the app being addressed inside Linear", and `:47-49` states "Env-key groups are all-or-nothing … the integration stays inert (or, for one provider, fails at boot) by design". Both were falsified here: the scope is never requested and no endpoint could receive a mention, and the Linear pair is asymmetric with the real boot failure being the state signer. Story 3.5 loads this file as its context. Not done here: the file is a regenerable compiled cache — its own header says "Regenerate with compile-epic-context if planning docs change" — and it is derived from `epics.md`, whose correction is already deferred above. Editing the cache without editing its source would make the next regeneration silently undo the fix.
status: open

### DW-50: The §11 trap table carries a second row this story's evidence falsifies — the `GITHUB_APP_WEBHOOK_SECRET` row still describes an unset signer as a degraded mode when a registered Linear or GitHub
origin: spec-deferred 124a0d597e72
location: docs/Self-hosting research.md, §11 trap table, GITHUB_APP_WEBHOOK_SECRET row
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: low
reason: `docs/Self-hosting research.md` §11 says an unset `GITHUB_APP_WEBHOOK_SECRET` with no `WORKOS_COOKIE_PASSWORD`/`SLACK_APP_SIGNING_SECRET` means "random per process ⇒ OAuth breaks across restarts". With any integration declaring `requiresStableStateSigner` registered — Linear at `node_modules/@mastra/factory/dist/integrations/linear/integration.js:306`, GitHub likewise — `node_modules/@mastra/factory/dist/factory.js:369` throws during `prepare()` and the server does not start. Story 3.3 corrected the same claim in `.env.schema`, `.env.example` and `apps/github/README.md` and left this row; this story corrects the Linear row's equivalent and leaves it too. Not done here: this spec's Never list forbids adding, removing or changing any table row or heading in that file — §6 and §11 are a dated research record corrected by appending. The row is pre-existing rather than caused by this change, and a §11 pass that re-reads every trap row at once is the right owner; §6 and §5 both already
status: open
