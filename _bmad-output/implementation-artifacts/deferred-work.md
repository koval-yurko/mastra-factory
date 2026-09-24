### DW-1: Nothing in the verify gate re-checks the packageManager pin or the absence of workspace declarations, so both invariants are true at this commit and unenforced afterwards.
origin: spec-deferred c482c5a49419
location: .bmad-loop/policy.toml [verify].commands
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: medium
reason: All four commands in .bmad-loop/policy.toml [verify].commands were read and traced. `npm ci` runs under the ambient npm and never consults `packageManager` (confirmed empirically: a scratch package pinned to npm@99.99.99-does-not-exist still installed cleanly under npm 11.17.0). `npm run check` is `tsc --noEmit` with include: ["src/**/*"], so package.json is never read as a program. The two shell guards filter on `*.ts *.js *.mjs *.cjs` paths and on `.agents/skills` status respectively, so neither sees package.json, a reintroduced pnpm-workspace.yaml, or a competing lockfile. `engines.npm` is also unset, so a non-corepack host with a different npm diverges silently. Smallest fix: append one `sh -c` guard to [verify].commands asserting that package.json's `packageManager` matches `npm --version`, that no `workspaces` key exists, and that no competing workspace/lock file is tracked - following the `&& exit 1 || exit 0` idiom the two existing guards already use. Not done here: it adds a
status: done 2026-09-24
resolution: resolved by sweep bundle dw-verify-gate-blind-spots
resolution-undo: 340e55fd205d0e3cf3819beaf836397d67f87ae55dde5aa611ff6ba9055f6e5d 2026-09-24 7374617475733a206f70656e

### DW-2: .env.schema and .env.example still instruct the reader to run `pnpm db:up` from a "monorepo root", against a hardcoded default connection string.
origin: spec-deferred 2d08071c4094
location: .env.schema:196 and .env.example:168
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: medium
reason: .env.schema:196 and .env.example:168 both read: run `pnpm db:up` from this package (`pnpm --dir mastracode/web db:up` from the monorepo root), with postgres://user:pass@localhost:54329/mastracode_web inline. Three contradictions with AD-1 and the single-package posture: the pnpm invocation, the monorepo assertion, and template-default credentials. This story degrades the inconsistency rather than merely inheriting it. The deleted pnpm-workspace.yaml existed to suppress ERR_PNPM_IGNORED_BUILDS on pnpm v10+, so a reader following that prose now hits the failure the deleted file suppressed; and in a corepack-shimmed environment - the environment the new `packageManager` field exists to serve - a `pnpm` invocation hard-errors on a package-manager mismatch. Smallest fix: change both comments to `npm run db:up` and drop the monorepo path. Routed to Story 1.3, which already edits both files (non-default credentials, env schema update) and is the next story in this epic.
status: done 2026-09-24
resolution: already resolved: .env.schema:310 and .env.example:272 now read "start the docker-compose.yml service with `npm run db:up`"; grep for `pnpm` and `monorepo` over both files returns nothing, and the connection string at .env.schema:312 / .env.example:274 is the placeholder `postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@127.0.0.1:54329/<POSTGRES_DB>`, not the old hardcoded user:pass default.

### DW-3: Node is unpinned and AGENTS.md's stated Node version does not match the machine's.
origin: spec-deferred 8258050aa542
location: package.json engines / AGENTS.md
source_spec: `spec-1-1-pin-the-package-manager-so-a-fresh-worktree-resolves-identic.md`
severity: low
reason: engines.node is ">=22.19.0" with an open upper bound; there is no .nvmrc and no engines.npm; the authoring machine runs Node v24.19.0 while AGENTS.md states "TypeScript on Node 22". Pinning npm alone does not fully deliver "a fresh worktree resolves identically" - the Node major is still free to move. Deferred rather than fixed: an .nvmrc would add a root-level file, which AD-3 forbids (root is a closed set), and correcting the version statement edits AGENTS.md, an agent-context file. Needs a decision on whether to narrow engines.node or accept Node 22+ as the real contract, then one edit in whichever artifact wins.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e
decision: 2026-09-24 Declare 22 and 24; keep running 24 — Narrow package.json engines.node to admit only the 22 and 24 majors (excluding 23 and 25, which vitest@5.0.1 does not support), and correct AGENTS.md:9 from 'TypeScript on Node 22' to name both supported majors. Leave ops/factory-start.sh:20's Node 24 pin and docs/self-hosting-research.md:61's 'one Node 24' as they are — both become accurate. Close DW-10 and DW-65 in the same change. Note AGENTS.md's claim sits inside the `<!-- bmad:context -->` managed block regenerated by bmad-project-context, so the edit has to survive a refresh. Re-run the full gate, which starts with npm ci.

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
status: done 2026-09-25
resolution: resolved by sweep bundle dw-agents-md-context-block-refresh
resolution-undo: 237df82981ee94958d5888adef457dbb0f36696c33b8abdcc1310c086b9f75cf 2026-09-25 7374617475733a206f70656e

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
decision: 2026-09-25 Tear the boot down inside the suite — Add an afterAll to src/mastra/index.test.ts that shuts the booted factory down — stopping the controller workers finalize() started — so the suite cannot hold the event loop open, and state in the file's docstring that session_timeout_min is the only outer bound. Extend the existing afterAll at :101 rather than adding a second one, and verify the suite still exits cleanly under `npm test`.

### DW-10: engines.node ">=22.19.0" admits Node 23 and 25, which vitest@5.0.1 does not support, and npm reports the mismatch as a warning only.
origin: spec-deferred 3384e5fbd132
location: package.json engines
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: low
reason: vitest@5.0.1 declares engines.node "^22.12.0 || ^24.0.0 || >=26.0.0"; package.json declares ">=22.19.0" with an open upper bound and there is no engine-strict setting, so EBADENGINE does not fail `npm ci`. The gate would run its test runner on an unsupported runtime. Same root cause as ledger entry DW-3 (Node unpinned); the decision owed there — narrow engines.node or accept Node 22+ — now has a second constraint to satisfy.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e

### DW-11: The verify gate never runs `npm run build`, so the epic's "the build still succeeds with test files in src/mastra" criterion is a one-time manual observation.
origin: spec-deferred 2c30c0be9e9b
location: .bmad-loop/policy.toml [verify].commands
source_spec: `spec-1-2-tests-for-the-entry-s-pure-helpers-running-inside-the-verify.md`
severity: medium
reason: [verify].commands is npm ci, npm run check, two git guards and npm test — no build. The deployer scans named subdirectories (agents/, workflows/, skills/, schedules/, subagents/), so today's top-level src/mastra/index.test.ts is not collected and the manual build passes. A test file placed under src/mastra/agents/ would be bundled and drag vitest into a deploy, while npm run check and npm test both stay green. Not done here: adding `npm run build` to the gate makes every verify run write the untracked src/mastra/public/factory/ tree that ledger entry DW-4 is open about, so the two belong together.
status: done 2026-09-24
resolution: already resolved: `npm run build` is a real element of [verify].commands at .bmad-loop/policy.toml:1269 (index 41 of 42, confirmed by a TOML parse), so the epic's build criterion is now enforced on every verify run.

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
status: done 2026-09-24
resolution: resolved by sweep bundle dw-compose-file-hardening-and-gate
resolution-undo: a67a4d60eea04bb484ee5ddf601fcfb5489834b6a9418e3a18d91e08c314b161 2026-09-24 7374617475733a206f70656e

### DW-15: The loopback-only publish 127.0.0.1:54329:5432 assumes Colima/Lima forwards a guest-loopback port to host loopback; that was reasoned from documentation, never observed.
origin: spec-deferred 7d417b749053
location: docker-compose.yml ports
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
reason: Story 1.4's checkpoint is "the container reports healthy on 127.0.0.1:54329". The previous binding ('54329:5432') published on every interface inside the VM, which Lima certainly forwards; the new one narrows it. If Lima's default port-forward rules do not cover guest 127.0.0.1, `npm run db:up` succeeds while the host cannot reach 54329, and Story 1.4 blocks on a change this story made for hardening rather than for any acceptance criterion. What would settle it: on the Story 1.4 host, after `npm run db:up`, run `pg_isready -h 127.0.0.1 -p 54329`. If it fails, revert the ports entry to '54329:5432'.
status: done 2026-09-24
resolution: already resolved: Settled by observation on this host: docker-compose.yml:53 publishes '127.0.0.1:54329:5432', `docker ps` shows mastracode-web-db Up 22 hours (healthy) on 127.0.0.1:54329->5432/tcp, and `pg_isready -h 127.0.0.1 -p 54329` returns 'accepting connections' — Lima forwards guest loopback as reasoned, and gate command 52 now pins host_ip/published/target.

### DW-16: docker-compose.yml pins no project name, so the data volume's real name follows the checkout directory — moving or renaming the repo silently creates a new empty volume, and there are no backups.
origin: spec-deferred c3dafb4a0193
location: docker-compose.yml
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: Compose derives the project name from the directory basename when no top-level `name:` is set, and prefixes named volumes with it: the volume is mastra-factory_mastracode-web-pgdata, not mastracode-web-pgdata. AGENTS.md records that "the Postgres volume is the only copy of projects, work items, sessions, memory and tokens", so a rename that orphans it is unrecoverable. The fixed `container_name: mastracode-web-db` has the mirror problem: it defeats per-project namespacing, and now that restart: unless-stopped is set, a container started from a since-deleted directory survives reboots while holding both the name and port 54329. Smallest fix: add `name: mastra-factory` at the top of docker-compose.yml. Pre-existing: both the unpinned project name and container_name predate this story.
status: done 2026-09-24
resolution: resolved by sweep bundle dw-compose-file-hardening-and-gate
resolution-undo: a67a4d60eea04bb484ee5ddf601fcfb5489834b6a9418e3a18d91e08c314b161 2026-09-24 7374617475733a206f70656e

### DW-17: `npm run db:up` is `docker compose up -d --wait` with no `--wait-timeout`, so now that `restart: unless-stopped` keeps a failing container out of the exited state, a container that never reaches
origin: spec-deferred c04401f815c4
location: package.json db:up / docker-compose.yml restart policy
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: Compose's `--wait` defaults to `--wait-timeout 0`, meaning wait forever, and it ends early on a container that exits. Before this story a container that failed to initialize exited and `--wait` reported that failure; with `restart: unless-stopped` (added here) it crash-loops instead, so the loop never terminates and `npm run db:up` produces no output. Reachable through a POSTGRES_USER or POSTGRES_DB value the entrypoint rejects at initdb. Reasoned from Compose's documented flag semantics, not observed — no container engine exists on this machine. What would settle it: on the Story 1.4 host, set POSTGRES_USER to a value initdb rejects and run `npm run db:up`; if it hangs, the claim holds. Smallest fix: `docker compose up -d --wait --wait-timeout 120` in package.json `db:up`. Not done here: the intent pins `db:up` and `db:down` to their exact command strings (AD-11 / NFR10), so changing one is outside this story.
status: done 2026-09-24
resolution: resolved by sweep bundle dw-compose-file-hardening-and-gate
resolution-undo: a67a4d60eea04bb484ee5ddf601fcfb5489834b6a9418e3a18d91e08c314b161 2026-09-24 7374617475733a206f70656e

### DW-18: The two `# @public` annotations in .env.schema are load-bearing for the production log yet no check in the repo asserts they are still there, even though varlock can be run today.
origin: spec-deferred 3b9452900c4a
location: .env.schema (POSTGRES_USER / POSTGRES_DB @public) / test surface
source_spec: `spec-1-3-one-datastore-drop-redis-and-harden-the-compose-file.md`
severity: medium
reason: `npm run start` is `varlock run -- mastra start`, which builds a find/replace over every sensitive value and applies it to non-TTY stdout. `POSTGRES_USER` and `POSTGRES_DB` inherit `@defaultSensitive=true` from the file header, so without `# @public` the literals `factory` and `mastracode_web` are masked throughout the deployment's only diagnostic surface — the defect this build found and patched. Deleting either annotation leaves `npm ci`, `npm run check`, both path guards and `npm test` all exiting 0: tsc is scoped to `src/**/*`, vitest runs `--dir src`, and neither parses .env.schema. Unlike the docker-compose gap above, this one is closable without a container engine: varlock is an installed devDependency and `varlock load` exits 0 in this worktree with no `.env` present. Smallest fix: a check that runs `node_modules/.bin/varlock load --format json-full --filter="POSTGRES_*"` and asserts `POSTGRES_USER.isSensitive === false`, `POSTGRES_DB.isSensitive === false`,
status: done 2026-09-24
resolution: resolved by sweep bundle dw-verify-gate-blind-spots
resolution-undo: 340e55fd205d0e3cf3819beaf836397d67f87ae55dde5aa611ff6ba9055f6e5d 2026-09-24 7374617475733a206f70656e

### DW-19: The `# @public` annotation on `DOCKER_HOST` is load-bearing for the production log, and no gate command observes it — a third instance of the condition DW-18 already records for `POSTGRES_USER` and
origin: spec-deferred 0082bb47af7c
location: .env.schema (DOCKER_HOST @public) / test surface
source_spec: `spec-1-4-operator-a-working-container-engine-and-a-healthy-postgres.md`
severity: medium
reason: `.env.schema`'s header is `@defaultSensitive=true`, so without `# @public` the key resolves as sensitive and `varlock run -- mastra start` masks it in non-TTY stdout — the deployment's only diagnostic surface, and the surface carrying the "cannot connect to the Docker daemon at …" error `ops/README.md` teaches the operator to read. Reproduced in a scratch schema: with the annotation `varlock run` printed the socket path, without it the value came back masked. Deleting the line leaves all five `[verify].commands` green — `tsc` is scoped to `src/**/*`, vitest to `--dir src`, and neither path guard nor `npm ci` parses `.env.schema`. Smallest fix: a vitest file under `src/` that shells out to `node_modules/.bin/varlock load --format json-full` and asserts `isSensitive === false` for all three `@public` keys — it would run inside `npm test`, the repo's own gate. Not done here: this story's intent forbids editing `src/` and `package.json`. The in-scope action is to widen DW-18 to name
status: done 2026-09-24
resolution: already resolved: The json-full sensitivity guard at .bmad-loop/policy.toml:1231 asserts `isSensitive === false` for exactly ["MASTRA_HOST","PORT","DOCKER_HOST"], and DOCKER_HOST still carries `# @public` at .env.schema:355 — deleting that line now fails the gate naming the key.

### DW-20: `ops/README.md` is not the sole committed source for `DOCKER_HOST`'s value: `docs/Self-hosting research.md` states the same two spellings, and this story sets that file read-only.
origin: spec-deferred aa41ef8b8c61
location: docs/Self-hosting research.md §7.2 / §7.3 / §8 vs ops/README.md
source_spec: `spec-1-4-operator-a-working-container-engine-and-a-healthy-postgres.md`
severity: low
reason: §7.2 line 387 carries `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`, §7.3 line 420 the absolute launchd spelling, and §8 line 476 the export again. AD-6 gives the owning subject's README the "what the value must contain" half, so two documents can now drift about the same key. Nothing checks either way. Not done here: the intent sets `docs/` read-only because its section numbers are stable anchors cited across the spec and stories. Making `docs/` link out rather than restate is Story 5.3's work (FR32), and Story 5.2 audits key ownership.
status: done 2026-09-25
resolution: already resolved: docs/self-hosting-research.md:407 (§7.2) now reads "`ops/README.md` is the canonical record for what each line it prints means" and §7.3 lists only PATH/ProcessType/ThrottleInterval — neither states DOCKER_HOST's value, and no absolute launchd spelling survives under docs/ (one `unix://` hit in the whole file); the sole remaining `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"` at :467 sits inside §8's fence under the `Non-normative` marker at :459, which is exactly what AD-5 requires and what gate guards 32/33 enforce, so ops/README.md:49 is the only normative source.

### DW-21: Nothing compares `.env.schema` and `.env.example`, so a key added to one and not the other is invisible to every gate command.
origin: spec-deferred b15669a8c3da
location: .env.schema / .env.example
source_spec: `spec-1-4-operator-a-working-container-engine-and-a-healthy-postgres.md`
severity: low
reason: NFR18 requires the example file to mirror the schema shape-for-shape, and this change hand-mirrored an eleven-line comment block plus the key into both. The five `[verify].commands` never parse either file, so a one-sided edit ships green. Pre-existing: both files and the mirroring convention predate this story. Smallest fix: a check asserting the set of key names in `.env.example` (commented out) equals the set declared in `.env.schema`.
status: done 2026-09-24
resolution: already resolved: .bmad-loop/policy.toml:1967 (verify command 28, added in 6dc8a9d) extracts `KEY=` from .env.schema and `# KEY=` from .env.example and fails on any set OR order mismatch — strictly stronger than the set-equality check this entry asked for.

### DW-22: `docs/Self-hosting research.md` §2.1 still carries a verbatim, unmarked copy of the image definition, and its build commands name an `-f` path that no longer resolves from the repository root plus a
origin: spec-deferred a1e0fb683d69
location: docs/Self-hosting research.md §2.1 / §2.2 / §8 vs sandbox/
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: medium
reason: A `diff` of §2.1 lines 96–117 against `sandbox/factory-sandbox.Dockerfile` shows only the two fences and the filename comment differing — every instruction line is identical. AD-5 requires a code block in `docs/` to be illustrative and marked non-normative; `grep -rn "non-normative" docs/` returns nothing. §2.1 line 120 and §8 line 490 both read `-f factory-sandbox.Dockerfile` (unresolvable from root now that the file lives under `sandbox/`) with `-t factory-sandbox:2026-09-22`, a date the `date +%F` build will never produce. §2.2 additionally states the `FACTORY_SANDBOX_MEMORY_GIB` / `FACTORY_SANDBOX_CPUS` / `MASTRACODE_SANDBOX_WORKDIR` values that `sandbox/README.md` now owns, so two documents can drift about the same keys. Not done here: this story sets `docs/` read-only because its section numbers are stable citation anchors. Making `docs/` link out rather than restate is Story 5.3's work (FR32), and Story 5.2 audits key ownership. Second instance of open DW-20, which records the
status: done 2026-09-24
resolution: already resolved: Story 5.3 replaced the copy: docs/self-hosting-research.md:103-105 names `sandbox/factory-sandbox.Dockerfile` by path instead of reproducing it (no `FROM node` / `RUN apt` anywhere under docs/), `-f factory-sandbox.Dockerfile` is gone from :480, and every surviving fence carries a `Non-normative` marker (8 in that file) enforced by gate guards 32/33 at policy.toml:1259-1260.

### DW-23: No gate command can read a Dockerfile, so the no-`COPY`, no-`latest` and `WORKDIR /workspace` invariants this story's acceptance criteria assert are hand-checked once and unenforced afterwards.
origin: spec-deferred c63fae638826
location: .bmad-loop/policy.toml [verify].commands / sandbox/factory-sandbox.Dockerfile
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: medium
reason: The five `[verify].commands` are `npm ci`, `npm run check` (`tsc --noEmit`, `include: ["src/**/*"]`), a path guard filtering `*.ts *.js *.mjs *.cjs`, a `.agents/skills` status guard, and `npm test` (`vitest run --dir src`). None of them parses a `.Dockerfile` or a `.md`: adding a `COPY . /workspace`, retagging to `latest`, or moving `WORKDIR` leaves all five exiting 0. Smallest fix: three `sh -c` grep guards appended to `[verify].commands`, following the `&& exit 1 || exit 0` idiom the two existing guards already use. Not done here: `.bmad-loop/policy.toml` is orchestrator surface this story's intent sets read-only. Same shape as open DW-14 (nothing can parse `docker-compose.yml`).
status: done 2026-09-24
resolution: resolved by sweep bundle dw-verify-gate-blind-spots
resolution-undo: 340e55fd205d0e3cf3819beaf836397d67f87ae55dde5aa611ff6ba9055f6e5d 2026-09-24 7374617475733a206f70656e

### DW-24: Whether `/usr/share/keyrings` exists in `node:22-bookworm-slim` is unverified; if it does not, the `curl -o` write fails and the build dies at the operator's first action.
origin: spec-deferred d9cff73d2206
location: sandbox/factory-sandbox.Dockerfile:5-6
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
reason: The image writes `/usr/share/keyrings/githubcli-archive-keyring.gpg` with `curl -o` and never creates the directory, while GitHub's own Debian instructions open with `mkdir -p -m 755 /usr/share/keyrings` precisely because it is not guaranteed. Debian base images normally ship it via `debian-archive-keyring`, which is why the inherited §2.1 recipe omits the `mkdir` — but no container engine exists on this host, so it could not be observed either way, and the Dockerfile is pinned to §2.1's content by this story's acceptance criteria. What would settle it: `docker run --rm node:22-bookworm-slim ls -d /usr/share/keyrings`, or simply the operator's first `docker build`. The failure is loud and immediate, and `sandbox/README.md`'s "If the build fails" section already names the `mkdir -p` fix, so the cost of being wrong is one retry rather than a silent defect.
status: done 2026-09-24
resolution: already resolved: Settled by the observation the entry named: `docker run --rm node:22-bookworm-slim ls -ld /usr/share/keyrings` returns 'drwxr-xr-x 2 root root 4096 /usr/share/keyrings', so the curl -o target ships in the base image; corroborated by the running factory-sandbox:2026-09-23 container built from this Dockerfile.

### DW-25: The build context is the repository root with no `.dockerignore`, so `node_modules/`, `.git/`, `_bmad-output/` and `.env` are transferred to the engine on every build even though the image copies
origin: spec-deferred dfd1f11b1a9d
location: sandbox/README.md build command / repository root (.dockerignore absent)
source_spec: `spec-2-1-operator-a-sandbox-image-that-carries-git-and-gh.md`
severity: low
reason: `docker build … -f sandbox/factory-sandbox.Dockerfile … .` makes the repo root the context; there is no `.dockerignore` anywhere in the tree, and `node_modules/` alone is over 1 GB here before the `.bmad-loop/runs/` worktrees. Nothing lands in the image — the Dockerfile has no `COPY`/`ADD` — so the cost is transfer time, plus `.env` (which holds `POSTGRES_PASSWORD`) being sent to the daemon. Not done here, two ways: the epic's acceptance criterion pins the build command's trailing `.`, and a root `.dockerignore` would add a file to the closed root set AD-3 defines, which is a spine decision rather than a local call. Either fix — narrowing the context to `sandbox/`, or adding the ignore file to the root allowlist — needs that decision first. `sandbox/README.md` documents the cost in the meantime.
status: open
decision: 2026-09-24 Amend AD-3; add .dockerignore — Amend AD-3's root-file table in ARCHITECTURE-SPINE.md to admit .dockerignore with a one-line rationale, add the file at the repository root excluding node_modules/, .git/, _bmad-output/, .bmad-loop/runs/, .mastra/ and .env, and replace sandbox/README.md:259-263's cost paragraph with a statement of what is now excluded. Extend the root closed-set gate guard's allowlist to the new entry so the membership assertion still passes, and confirm the image still builds unchanged (nothing from the context is used).

### DW-26: Session containers are long-lived, one per session, with no idle teardown and nothing reaping them, so they accumulate for the life of the host and the VM disk is the real limit.
origin: spec-deferred 76029d7616d5
location: sandbox/README.md / src/mastra/index.ts dockerSandboxOptions
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: medium
reason: `@mastra/docker`'s `clone()` doc states `idleTimeoutMinutes` is ignored because "Docker containers have no provider-side idle teardown", and the entry stops nothing. Each container holds a checkout plus `node_modules`. The package labels every one `mastra.sandbox`, so `docker ps -a --filter label=mastra.sandbox=true` is the handle a cleanup procedure would use. Not done here: lifecycle and the concurrency cap are Story 2.5's subject ("a session gets a real container, and the cap holds"), and nothing can be observed without a running engine.
status: done 2026-09-24
resolution: closed by human decision: sandbox/README.md:150-155 documents the label filter and the cleanup, the cap bounds new admissions, and no teardown design survives the synchronous-slot and AD-2 constraints without new architecture.
decision: 2026-09-24 Keep the manual procedure; close — sandbox/README.md:150-155 documents the label filter and the cleanup, the cap bounds new admissions, and no teardown design survives the synchronous-slot and AD-2 constraints without new architecture.

### DW-27: No concurrency cap exists at all — `MASTRACODE_MAX_SANDBOXES` is read by nothing, so Story 2.5's acceptance criterion that a session past the maximum returns an actionable error naming the cap is not
origin: spec-deferred cc76107e9bd6
location: _bmad-output/planning-artifacts/epics.md Story 2.5 / .env.schema MASTRACODE_MAX_SANDBOXES
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: medium
reason: `grep -rl MAX_SANDBOXES node_modules` returns nothing, and `@mastra/factory/dist/factory.js:259` states: "'maxSandboxes' is gone with the sandbox fleet — there is one sandbox per session and no pool to cap." Every statement this story could reach was corrected to say the key records the sizing rather than enforcing it, but the capability itself is absent: a fourth concurrent session gets its own full 10 GiB / 4-core ceiling and the 32 GiB VM is oversubscribed. What this needs: either a first-party cap in the entry (new behaviour, and the actionable-error wording is Story 2.5's to specify) or Story 2.5 re-scoped against what `@mastra/factory@0.15.0` actually offers. Not a call this story can make.
status: done 2026-09-24
resolution: already resolved: The cap exists and is first-party: src/mastra/config/sandbox.ts:207 reads MASTRACODE_MAX_SANDBOXES through positiveInt inside `admitDockerSession`, which throws the actionable message at :210-216 naming the key, its value and the live occupancy; covered by 8+ assertions in src/mastra/config/sandbox.test.ts (:437, :463, :509, :519-522, :551, :587-592). Residual restart-undercount is separately filed as DW-36.

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
status: done 2026-09-25
resolution: resolved by sweep bundle dw-agents-md-context-block-refresh
resolution-undo: 237df82981ee94958d5888adef457dbb0f36696c33b8abdcc1310c086b9f75cf 2026-09-25 7374617475733a206f70656e

### DW-30: Three keys in `.env.schema` still use `@type=string(matches=...)`, a form varlock deprecates in favour of `regex(...)`, and the new gate command surfaces the warning.
origin: spec-deferred ae8f1165f22e
location: .env.schema MASTRACODE_MAX_SANDBOXES / MASTRA_PLATFORM_GITHUB_POLLING_INTERVAL_MS / MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS
source_spec: `spec-2-2-select-the-docker-sandbox-ahead-of-every-cloud-provider.md`
severity: low
reason: Running `npx varlock load --format json` against an invalid config prints, for each of `MASTRACODE_MAX_SANDBOXES`, `MASTRA_PLATFORM_GITHUB_POLLING_INTERVAL_MS` and `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS`: "string patterns are deprecated, use regex() instead … a future major version will stop reading a string as a regex". `varlock` is pinned `^1.9.0`, so that major is reachable by a routine update, and the constraint would then be read as a literal string rather than a pattern — silently admitting any value. Not done here: the three annotations are pre-existing and this story added none of them (its own two were deleted in the first review pass). Two of the three keys are interval knobs with nothing to do with the sandbox, and the fix is one substitution per key across a file three stories now edit — better done once, deliberately, than folded into an unrelated change.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-env-schema-key-list-cleanup
resolution-undo: d3d893e960379613857819faf592c93adcd5aa09fe7e5dfd3a4b3131512a6b6f 2026-09-25 7374617475733a206f70656e

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
status: done 2026-09-25
resolution: resolved by sweep bundle dw-package-json-declaration-hygiene
resolution-undo: 970e8c699a1ad30548c5eb58840c95f5366ef557408f43ebede0079383f0c42c 2026-09-25 7374617475733a206f70656e

### DW-33: `AGENTS.md` tells agents to leave `WORKOS_*` unset, while the env files now tell an operator to keep `WORKOS_COOKIE_PASSWORD` set so the OAuth/link `state` signer survives a restart.
origin: spec-deferred 030fc2a55be0
location: AGENTS.md:66-69 vs .env.schema "WorkOS (legacy)" section / src/mastra/index.ts stateSecret
source_spec: `spec-2-3-identity-this-machine-owns-with-organizations.md`
severity: low
reason: `AGENTS.md:66-69` lists `WORKOS_*` among the variables that must stay unset or "self-hosting silently defers back to Mastra's platform". After this story that is only half true: the credential pair is inert, but `WORKOS_COOKIE_PASSWORD` is still read at `src/mastra/index.ts` in the `stateSecret` fallback chain, and `.env.schema` now says so explicitly. The cleaner resolution is to stop depending on a WorkOS key at all: this story introduced `BETTER_AUTH_SECRET`, a deployment-stable secret that is a better `state`-signer fallback than a WorkOS cookie password, which would retire the last reason any `WORKOS_*` key stays alive. Not done here: the fix edits `AGENTS.md`, an agent-context file regenerated by `bmad-project-context`, and changing the signer chain is behaviour this story did not need.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-agents-md-context-block-refresh
resolution-undo: 237df82981ee94958d5888adef457dbb0f36696c33b8abdcc1310c086b9f75cf 2026-09-25 7374617475733a206f70656e

### DW-34: `MASTRACODE_BOOTSTRAP_PERSONAL_ORG` remains declared, `@public` and `@type`-validated in `.env.schema` while nothing in the server or the installed packages reads it.
origin: spec-deferred 8effee78b917
location: .env.schema MASTRACODE_BOOTSTRAP_PERSONAL_ORG / .env.example
source_spec: `spec-2-3-identity-this-machine-owns-with-organizations.md`
severity: low
reason: `grep -rn MASTRACODE_BOOTSTRAP_PERSONAL_ORG src node_modules/@mastra` returns nothing; the only hits are the declarations in `.env.schema` and `.env.example`. It was already unread before this story — the WorkOS provider never consulted it — so this is pre-existing, and this diff only documents it as unused. A fully-typed declaration in the canonical key list still reads as a live switch, and an operator who sets it to `0` gets personal organizations anyway. Not done here: deleting a declared key is a decision about the key list rather than about auth selection, and `.env.schema` is edited by several stories in sequence.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-env-schema-key-list-cleanup
resolution-undo: d3d893e960379613857819faf592c93adcd5aa09fe7e5dfd3a4b3131512a6b6f 2026-09-25 7374617475733a206f70656e

### DW-35: `MASTRA_HOST` and `PORT` appear in neither `.env.schema` nor `.env.example`, so "copy `.env.example` to `.env`" cannot produce two of the seven values the first sign-in needs, and `.env.example`'s
origin: spec-deferred 5796d418a22c
location: .env.schema / .env.example vs README.md "Start the Factory Server" step 1
source_spec: `spec-2-4-operator-sign-in-on-loopback-and-land-in-an-organization.md`
severity: low
reason: `grep -nE 'MASTRA_HOST|^PORT' .env.schema .env.example` returns nothing, while `README.md`'s step 1 now requires both. `.env.example:2-3` reads "every value is optional — features light up as their variables are set", which is false for these two on the loopback path: unset, `MASTRA_HOST` puts the open sign-up form on every interface and an unset `PORT` lets the CLI drift off the origin `MASTRACODE_PUBLIC_URL` names. `AGENTS.md:61-63` makes `.env.schema` the only list of keys, so an undeclared key the committed procedure requires is off-list by the repo's own rule. Not done here: `epics.md:681-684` is Story 3.2's acceptance criterion verbatim — "`MASTRA_HOST` and `PORT` are declared in `.env.schema` rather than left undeclared … and their values are marked `@public`". Declaring them in this story would take that criterion. Verified this session that the gap is inert for the path this story documents: `varlock load --format json` against a `.env` carrying both keys exits 0 and passes
status: done 2026-09-24
resolution: already resolved: .env.schema:31 declares MASTRA_HOST= and :33 declares PORT= (mirrored at .env.example:24-25, added by Story 3.2 in 52f07b3), and gate command 4 at .bmad-loop/policy.toml:1944 fails unless both resolve through varlock with isSensitive === false.

### DW-36: The concurrency cap counts the session sandboxes the CURRENT server process handed out, so containers that outlive a restart are not counted and the host can end up running more session containers
origin: spec-deferred b294a61a59c6
location: src/mastra/index.ts `liveDockerSandboxes` / `admitDockerSession`
source_spec: `spec-2-5-operator-a-session-gets-a-real-container-and-the-cap-holds.md`
severity: low
reason: `src/mastra/index.ts` `liveDockerSandboxes` is a module-level `Map` populated by `selectSandbox`'s docker branch, so it starts empty on every boot. Session containers have no idle teardown (`deferred-work.md` DW-26) and `@mastra/docker/dist/index.js:794-804` reattaches by querying the daemon for `mastra.sandbox.id=<id>`, so the containers themselves survive a restart while the registry does not: restart with three containers still up and three more sessions are admitted, for six containers on a host sized for three. Not done here: closing it needs the real occupancy from the engine — `listContainers` filtered on `mastra.sandbox=true` — which is async, while the slot Factory calls is `(ctx: FactorySandboxContext) => MastraSandbox`, synchronous, with the documented contract that "construction must be cheap and side-effect-free" (`sandbox/session-sandbox.d.ts:36,54`). There is nowhere to await it without either an async slot the type forbids or a dockerode client in the entry, which AD-2
status: done 2026-09-24
decision: 2026-09-25 Seed the count from the daemon at boot — At server startup, before any session is admitted, query the Docker daemon once for containers labelled mastra.sandbox=true and seed liveDockerSandboxes (or a sibling counter) from the result, so the cap counts containers that outlived a restart. This keeps the synchronous slot untouched — the async work happens at boot, not in the slot — but it puts a Docker client in the config layer, which AD-2 currently forbids, so amend AD-2 explicitly in the same change and add coverage in config/sandbox.test.ts for the seeded-occupancy path.
resolution: closed by human decision: The per-process scope is stated at src/mastra/config/sandbox.ts:191-195 and in sandbox/README.md, no async occupancy check fits the synchronous slot without new architecture, and DW-26 was closed on the same constraint.
decision: 2026-09-24 Close — accept, already documented — The per-process scope is stated at src/mastra/config/sandbox.ts:191-195 and in sandbox/README.md, no async occupancy check fits the synchronous slot without new architecture, and DW-26 was closed on the same constraint.

### DW-37: Closing registration leaves no self-service password recovery and no documented way to add a second operator — and a second account would not see the first account's work anyway.
origin: spec-deferred 116064269ef9
location: README.md "Start the Factory Server" step 3 / Troubleshooting
source_spec: `spec-2-6-operator-close-registration-before-anything-is-public.md`
severity: low
reason: No email sending is configured anywhere in this deployment, so better-auth's reset-password flow has no transport; with sign-up closed, a locked-out operator's only path is the same source edit README step 3 now documents, which is not labelled as recovery. Separately, the personal-org bootstrap keys on the user id (`personal-<user id>`, `@mastra/auth-better-auth/dist/index.js` `ensureOrganization`), so a second account lands in its own organization and sees none of the first account's projects, stored credentials or GitHub connection — every integration is org-scoped. Not done here: both are pre-existing consequences of the Story 2.3/2.4 identity design rather than of this diff, and documenting multi-operator semantics is new content about a scenario this single-operator deployment has not reached. The natural owner is whichever story first adds a second human.
status: open
decision: 2026-09-25 Document the source-edit window as the recovery path — Add a Troubleshooting entry to README.md naming the existing signUpEnabled source-edit window at README.md:88-91 as the lock-out recovery path, stating plainly that there is no email transport and therefore no self-service password reset, and that the window must be closed and proven closed with `git diff --exit-code src/mastra/config/auth.ts` exactly as step 3 requires. Leave multi-operator semantics undocumented — that half belongs to whichever story first adds a second human.

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
status: done 2026-09-24
resolution: already resolved: Provider-console prose is gone from both env files (zero hits for `xoxb`, `Basic Information`, `App Credentials`, `api.slack.com`, `github.com/settings`, `linear.app/settings`); .env.schema:88-90, :365-368 and :427-429 now point at apps/*/README.md, and the restatement guard at .bmad-loop/policy.toml:1257 enforces the boundary in both directions.

### DW-40: The Cloudflare public-hostname mapping is the one row in the §4.1 registry that still has no subject README, so "every callback URL recorded where its subject owns it" is not yet literally true for
origin: spec-deferred ec2a70d67cc7
location: ops/README.md (absent section) vs docs/Self-hosting research.md §4.1 Cloudflare row
source_spec: `spec-3-1-every-callback-url-recorded-where-its-subject-owns-it.md`
severity: low
reason: `docs/Self-hosting research.md` §4.1 carries `Cloudflare | Public Hostname → URL | 127.0.0.1:4111 (type HTTP)`, and the paragraph this story added to §4.1 concedes the gap by naming Cloudflare and Better Auth as the rows with no subject README. AD-3 makes the tunnel host infrastructure, which puts it in the existing `ops/` subject rather than a new root directory — so the owner exists and is simply unwritten. Not done here: `epics.md:689-691` is Story 3.2's acceptance criterion verbatim — "`ops/README.md` gains the tunnel section describing the install and the public-hostname mapping" — so writing the mapping here would take it. Until 3.2 lands, §4.1 remains that row's only record, which is why this story kept the table rather than emptying it.
status: done 2026-09-24
resolution: already resolved: ops/README.md:235 opens `## Ingress — Cloudflare Tunnel` and :370-375 carries the public-hostname table (Subdomain factory, Domain kovalchuk.win, Type HTTP, URL 127.0.0.1:4111), with the HTTP-not-HTTPS rationale at :377-380 — Story 3.2 wrote the section this entry was waiting for.

### DW-41: `MASTRACODE_PUBLIC_URL` is the origin all three README URL tables derive from, yet no subject README owns it, and the one file that does specify it still pins it to loopback.
origin: spec-deferred 02199c0f7aaa
location: README.md:41 vs apps/github/README.md:24 and apps/linear/README.md:21
source_spec: `spec-3-1-every-callback-url-recorded-where-its-subject-owns-it.md`
severity: medium
reason: `apps/github/README.md:24` and `apps/linear/README.md:21` both state that Factory derives their callback path from the public origin held in `MASTRACODE_PUBLIC_URL`, and both write that path as `https://factory.kovalchuk.win/...`. The key itself falls outside this story's partition (`GITHUB_APP_*`, `LINEAR_*`, `SLACK_APP_*`, `MASTRACODE_CHANNELS_PUBLIC_URL`), so it gained no `##` section anywhere. Its only specification in the repo is root `README.md:41` — "exactly `http://127.0.0.1:4111`: scheme, host and port" — written for the loopback-only deployment that preceded this epic. An operator who configures `.env` from the root README therefore registers loopback-derived callbacks, which is the exact failure `docs/Self-hosting research.md:292-293` warns about. The two statements are both live and they contradict each other. Not done here: AD-6 puts the host/origin-facing keys in the `ops/` subject, and the intent's Never list leaves `ops/` untouched for Story 3.2, which is also the story
status: done 2026-09-24
resolution: already resolved: ops/README.md:271 is now a full `## MASTRACODE_PUBLIC_URL` section claimed in ops' owned-keys table at :25, and root README.md:41 no longer pins the key — it says `http://127.0.0.1:4111` "here" and hands off to ops/README.md, whose :273-275 sequences loopback then `https://factory.kovalchuk.win`; the two statements no longer contradict.

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
status: done 2026-09-25
resolution: resolved by sweep bundle dw-env-schema-key-list-cleanup
resolution-undo: d3d893e960379613857819faf592c93adcd5aa09fe7e5dfd3a4b3131512a6b6f 2026-09-25 7374617475733a206f70656e

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
status: done 2026-09-24
resolution: already resolved: .env.schema:449, :451, :453 and :455 declare all four MASTRACODE_LINEAR_*RECONCILE* keys, mirrored at .env.example:398-401, added by Story 5.2's key audit in 6dc8a9d.

### DW-46: `epics.md:749-751,768` still carries the five-scope list and makes "an @-mention of the app is received" a criterion of this story, so the frozen plan asserts a scope set and a capability that
origin: spec-deferred d8bdca98a444
location: _bmad-output/planning-artifacts/epics.md:749-751,768
source_spec: `spec-3-4-operator-a-linear-app-that-belongs-to-yurii.md`
severity: medium
reason: This story established, against `node_modules/@mastra/factory/dist/integrations/linear/ integration.js:330`, that the authorize URL requests exactly `read,comments:create`, and that `app:mentionable` plus @-mentions are unreachable at this version for three independent reasons — the scope is not requested, `actor=app` is never sent (`integration.js:326-332`), and neither a Linear webhook route nor an `AgentSessionEvent` handler exists anywhere in the package (`grep -rn "webhook" .../integrations/linear/` and `grep -rn "app:mentionable\|actor=app\|AgentSession" node_modules/@mastra/` both return nothing). `apps/linear/README.md`, `.env.schema`, `.env.example` and §6 of `docs/Self-hosting research.md` are corrected; `epics.md` is not, so it is now the only place still asserting both. Not done here: `epics.md` is the frozen sprint plan this story is dispatched from, and rewriting a story's own acceptance premise mid-run would change the record the run is judged against. The
status: open
decision: 2026-09-24 Amend with a dated correction — Amend Story 3.4's Given/Then in _bmad-output/planning-artifacts/epics.md:749-751,759,768 to the verified reality — the authorize URL requests exactly `read,comments:create`, app:mentionable is not requested and @-mentions are unreachable at @mastra/factory 0.15.0, and the LINEAR_CLIENT_ID/LINEAR_CLIENT_SECRET pair is asymmetric rather than all-or-nothing — carrying a dated correction note naming the evidence rather than silently rewriting the criterion, so the record of what was planned survives beside what was found. Regenerate _bmad-output/implementation-artifacts/epic-3-context.md afterwards, since it is a cache compiled from epics.md and carries the same two claims.
decision: 2026-09-24 Amend with a dated correction — Amend Story 3.4's Given/Then in _bmad-output/planning-artifacts/epics.md:749-751,759,768 to the verified reality — the authorize URL requests exactly `read,comments:create`, app:mentionable is not requested and @-mentions are unreachable at @mastra/factory 0.15.0, and the LINEAR_CLIENT_ID/LINEAR_CLIENT_SECRET pair is asymmetric rather than all-or-nothing — carrying a dated correction note naming the evidence rather than silently rewriting the criterion, so the record of what was planned survives beside what was found. Regenerate _bmad-output/implementation-artifacts/epic-3-context.md afterwards, since it is a cache compiled from epics.md and carries the same two claims.

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
status: done 2026-09-24
resolution: already resolved: The note at ~/.claude/projects/-Users-koval-dev-test-mastra-factory/memory/mastra-factory-linear-oauth-scopes.md was rewritten 2026-09-23 and now opens "Corrected 2026-09-23 (story 3.4)", splitting the hosted five-scope client from this deployment's hardcoded `read,comments:create`, stating @-mentions cannot work at 0.15.0, and correcting the symmetric boot-error claim.

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

### DW-51: `docs/Self-hosting research.md` §7 still carries verbatim, unmarked copies of all five supervision artifacts, and three of those copies are now wrong: the wrapper is sited at `~/bin/factory-start.sh`,
origin: spec-deferred 4f56c5245270
location: docs/Self-hosting research.md §7.1-§7.4 vs ops/launchagents/, ops/factory-start.sh, ops/newsyslog/ai.mastra.factory.conf
source_spec: `spec-4-1-the-supervision-artifacts-as-real-files-in-the-repo.md`
severity: medium
reason: §7.1 (:408-431), §7.2 (:437-455), §7.3 (:459-483) and §7.4 (:494-499) reproduce the plists, the wrapper and the newsyslog conf in full, in unannotated fences; `grep -rn "non-normative" docs/` returns nothing, so AD-5's requirement that a `docs/` code block be marked illustrative is unmet for all four. Three are also stale against what this story committed: §7.2's heading sites the wrapper at `~/bin/factory-start.sh` while the canonical file is `ops/factory-start.sh`; §7.3:468 is `<string>/Users/koval/bin/factory-start.sh</string>` while the committed plist names `/Users/koval/dev/test/mastra-factory/ops/factory-start.sh`; and §7.4 rotates `out.log`, `err.log` and `colima.log` only, missing the `colima.err.log` row the committed conf adds. An operator following §7 rather than `ops/` would therefore install a plist whose `ProgramArguments` point at a file that was never created — launchd reports that as a spawn failure with no hint at the cause — and a rotation conf that leaves the
status: done 2026-09-24
resolution: already resolved: docs/self-hosting-research.md §7 now references the artifacts by path only (:391, :400, :414, :426) with no `<key>`, `ProgramArguments`, `#!/` or `koval:staff` anywhere in the file, and both `~/bin/factory-start.sh` and `/Users/koval/bin/` are gone (:405 names `ops/factory-start.sh`); gate guards 31/32 at policy.toml:1258-1259 now hold the doc to path-reference-only.

### DW-52: `AGENTS.md` still describes the verify gate as `npm ci`, `npm run check` "and two guards"; it is now eleven commands, four of them new here.
origin: spec-deferred 9819176cf508
location: AGENTS.md:46-49 vs .bmad-loop/policy.toml [verify].commands
source_spec: `spec-4-1-the-supervision-artifacts-as-real-files-in-the-repo.md`
severity: low
reason: `AGENTS.md:46-49` reads "runs `npm ci --no-audit --no-fund`, `npm run check`, and two guards"; `[verify].commands` in `.bmad-loop/policy.toml` holds eleven entries after this story (parsed and counted). The same sentence also still says `policy.toml` "is gitignored and exists only in the main checkout", which this story relied on being false — the file is tracked and was edited in this worktree. Both halves are already recorded as open DW-5 and DW-29; this story compounds the count rather than introducing a new condition. Not fixed here because the smallest fix edits an agent-context file, which this workflow routes to the ledger rather than patching mid-story.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-agents-md-context-block-refresh
resolution-undo: 237df82981ee94958d5888adef457dbb0f36696c33b8abdcc1310c086b9f75cf 2026-09-25 7374617475733a206f70656e

### DW-53: Whether a rotated `out.log` keeps being written is unverified: macOS `newsyslog` rotates by rename with no copy-truncate, `launchd` holds the descriptor it opened at spawn, and the `N` flag signals
origin: spec-deferred e553d5efb542
location: ops/newsyslog/ai.mastra.factory.conf:2-5 vs ops/launchagents/ai.mastra.factory.plist
source_spec: `spec-4-1-the-supervision-artifacts-as-real-files-in-the-repo.md`
reason: `man 5 newsyslog.conf` on this host lists the flags as `B C D G J N U Z` plus `-`: there is no run-a-command flag, and the only notification mechanism is a signal to a pid read from `path_to_pid_file`. A launchd-managed node process has no pid file this repo controls, and SIGHUP would kill it rather than make it reopen, so `N` is the only correct spelling — which is also what Story 4.1's acceptance criterion pins ("with the `N` and `J` flags — no process to signal"). The open-descriptor consequence follows from launchd opening `StandardOutPath` once per spawn, but it was not observed: rotation cannot be exercised in a story worktree, which is why the conf was left as specified and the limit written into `ops/README.md` instead. What would settle it: Story 4.3's rotation criterion — force a rotation, then confirm a compressed generation exists **and** the live `out.log` is still growing. If it is not, the remedy is `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` after a
status: open
decision: 2026-09-25 Operator runs recovery proof 4

### DW-54: `AGENTS.md` still describes the verify gate as `npm ci`, `npm run check` "and two guards" and says there is no test script; the gate is fifteen commands, eight of them over `ops/`, and `npm test` has
origin: spec-deferred ac4161b09558
location: AGENTS.md:44-49 vs .bmad-loop/policy.toml [verify].commands
source_spec: `spec-4-2-operator-bring-the-agents-up.md`
severity: low
reason: `AGENTS.md:44-49` reads "There is no test script, so it is the only automated check until a story adds one" and "runs `npm ci --no-audit --no-fund`, `npm run check`, and two guards"; `[verify].commands` in `.bmad-loop/policy.toml` holds fifteen entries after this story (parsed and counted), including `npm test` and eight `ops/` guards. The same sentence also still says `policy.toml` "is gitignored and exists only in the main checkout", which is false — `git ls-files .bmad-loop` returns it, and this story edited it in a worktree. Story 4.1 recorded the same condition (open as DW-5 and DW-29); this story moves the guard count again rather than introducing a new condition. Not fixed here because the smallest fix edits an agent-context file, which this workflow routes to the ledger rather than patching mid-story.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-agents-md-context-block-refresh
resolution-undo: 237df82981ee94958d5888adef457dbb0f36696c33b8abdcc1310c086b9f75cf 2026-09-25 7374617475733a206f70656e

### DW-55: `ops/install.sh` and `ops/factory-start.sh` point the reader at story keys ("bootstrap the agents per Story 4.2", "Story 4.3 reads out of out.log") that stop resolving once those stories are
origin: spec-deferred 1da806fe09e0
location: ops/install.sh:5,98 and ops/factory-start.sh:70
source_spec: `spec-4-2-operator-bring-the-agents-up.md`
severity: low
reason: `ops/install.sh:5` and `:98` and `ops/factory-start.sh:70` carry the references. Before this story there was nowhere else to point; `ops/README.md` now has "Bringing the agents up" and six numbered supervision checkpoints, so `:98`'s closing line in particular would be more useful as a pointer to that section than to a sprint row a reader cannot look up. Not done here because this story's intent sets the five `ops/` artifacts read-only — it exercises them unchanged, and a defect or staleness in one is a finding to record rather than a silent edit in a story that touches nothing else under `ops/`.
status: open

### DW-56: Supervision checkpoint 1 in `ops/README.md` (Story 4.2's) expects `0` in the second column of `launchctl list` beside a live pid, but that column is the job's *last exit status* and reads as the
origin: spec-deferred f1156e28a493
location: ops/README.md, supervision checkpoint 1 ("both agents are registered, and neither is looping")
source_spec: `spec-4-3-operator-prove-it-comes-back-on-its-own.md`
severity: medium
reason: `man launchctl` under `list`: "The second column displays the last exit status of the job. If the number in this column is negative, it represents the negative of the signal which stopped the job. Thus, `-15` would indicate that the job was terminated with SIGTERM." Confirmed live on this host: `launchctl list` currently shows `9226 -9 com.apple.spotlightknowledged.updater` — a running pid beside a negative status. `ops/README.md`'s supervision checkpoint 1 reads "each with a real pid in the first column and `0` in the second… a `0` beside a live pid is a job that is running and has not died yet in this session", and its failure reading treats "a pid that is different every time you run this, with a non-zero status" as the crash-loop signature — which a healthy kickstarted job also matches. Recovery proof 1 carried the same defect and was corrected in this story (the pass criterion is now the pid change plus the `200`, with the status column explicitly excluded). Not fixed here because
status: open

### DW-57: AD-4 forbids "`.ts`, `.js`, `.mjs`, `.cjs` or other program source" outside `src/`, but the only guard filters exactly those four extensions, so a first-party `.tsx`, `.jsx`, `.mts` or `.cts` outside
origin: spec-deferred 7c6afed72d93
location: .bmad-loop/policy.toml [verify].commands index 5
source_spec: `spec-5-1-every-operational-artifact-at-its-seeded-path-and-no-code-ou.md`
severity: low
reason: `.bmad-loop/policy.toml` `[verify].commands` index 5 is `git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/"`; the four globs are literal and no other command widens them. `tsconfig.json` is `include: ["src/**/*"]`, so `tsc --noEmit` never sees such a file either — which is the exact condition AD-4 exists to prevent, one extension list away from the one that is enforced. Not fixed here: the guard predates this story (it was added with the gate itself), and Story 5.1's acceptance criterion names only the same four extensions, so widening it is a change to AD-4's enforcement surface rather than to this story's. Smallest fix: add `"*.tsx" "*.jsx" "*.mts" "*.cts"` to that one `git ls-files` invocation.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-artifact-invariants
resolution-undo: 5da15eae468a5645b61dc773d1020d808bc2c39644e2fad31f72ed7eca63a152 2026-09-25 7374617475733a206f70656e

### DW-58: `docs/Self-hosting research.md` is named by the Structural Seed and cited as normative by AD-5 and AD-12, yet its deletion or truncation is invisible to every gate command, including the new
origin: spec-deferred 97e6b19b6e9b
location: docs/Self-hosting research.md vs .bmad-loop/policy.toml [verify].commands
source_spec: `spec-5-1-every-operational-artifact-at-its-seeded-path-and-no-code-ou.md`
severity: low
reason: The new artifact guard covers the twelve operator-plane artifacts under `apps/`, `sandbox/` and `ops/` that Story 5.1's acceptance criterion enumerates; `docs/` is outside that list because the criterion does not name it. Confirmed no other command opens it: `grep -n "Self-hosting" .bmad-loop/policy.toml` returns nothing, `tsc` is `include: ["src/**/*"]`, and `npm test` is `vitest run --dir src`. So the one document AGENTS.md calls "normative operational detail in §2–§11" could be emptied with the gate green — the same failure mode the artifact guard was added to close, one directory over. Pre-existing, not caused by this story. Smallest fix: add `docs/Self-hosting research.md` to the seeded-artifact guard's path list once Story 5.3 has renamed it to its space-free path, so the entry lands on the final name.
status: done 2026-09-24
resolution: already resolved: The renamed docs/self-hosting-research.md is now covered by gate commands 31-33 at .bmad-loop/policy.toml:1971-1973, which assert git index mode 100644, non-emptiness, and reconciliation against the artifacts it used to reproduce — deletion or truncation now fails the gate.

### DW-59: Nothing asserts that `.env` is absent from the index, so `git add -f .env` commits a secrets file with all 24 gate commands green — and the root closed-set guard is the one place that explicitly
origin: spec-deferred 3d4bfb9e7435
location: .bmad-loop/policy.toml [verify].commands root closed-set guard vs .gitignore
source_spec: `spec-5-1-every-operational-artifact-at-its-seeded-path-and-no-code-ou.md`
severity: low
reason: Verified in an isolated clone: `git add -f .env` with a `SECRET=` line left every command at exit 0. The membership assertion passes because `.env` is one of AD-3's twelve allowlist entries, so a tracked `.env` satisfies this story's acceptance criterion ("every tracked root file is one of the twelve AD-3 names") as written; the presence assertion skips it as gitignored. Pre-existing in the sense that no gate command ever observed it, and outside this story's intent, whose "Always" clause puts gitignored paths "out of view by construction" — the guard was built to that boundary deliberately. It still means the repo's cheapest secret-leak check does not exist. Smallest fix: one clause in the root closed-set guard asserting `.env` is NOT in the tracked root-file list, with its own message.
status: done 2026-09-24
resolution: already resolved: .bmad-loop/policy.toml:1969 (verify command 29) runs `git ls-files | grep -E "(^|/)[.]env([.].*)?$" | grep -vE "^[.]env[.](example|schema)$"` and exits 1 naming any tracked env file, so `git add -f .env` now fails the gate.

### DW-60: `_bmad-output/planning-artifacts/epics.md` still publishes the superseded eight-entry root allowlist as this story's own acceptance criterion, which the amended AD-3 now contradicts.
origin: spec-deferred 36ee6516bf4e
location: _bmad-output/planning-artifacts/epics.md:978-982
source_spec: `spec-5-1-every-operational-artifact-at-its-seeded-path-and-no-code-ou.md`
severity: low
reason: `epics.md:978-982` reads "the only files outside a subject directory are `package.json`, `package-lock.json`, `tsconfig.json`, `docker-compose.yml`, `.env`, `.env.schema`, `.env.example` and `.gitignore`" — false against both the tree and AD-3's amended twelve-entry table, which this story widened on the AC's own amend-the-allowlist branch. A later story or retrospective reading epics.md rather than the spine would try to move four tool-located root files. Not fixed here: editing an epic acceptance criterion mid-epic is a correct-course action (bmad-correct-course), not a gate patch, and AD-3 is the normative home the same criterion points at. The sibling half self-heals: `epic-5-context.md` repeats the eight-entry list but is a cache invalidated by any newer file under planning-artifacts, and ARCHITECTURE-SPINE.md is now newer, so the next story recompiles it. Smallest fix: amend NFR4's acceptance criterion in epics.md to cite AD-3 instead of restating it.
status: open
decision: 2026-09-24 Amend epics.md to cite AD-3 — Replace the restated eight-entry list at _bmad-output/planning-artifacts/epics.md:978-982 with a citation of AD-3's root-file table in ARCHITECTURE-SPINE.md, carrying a dated correction note that records the superseded list and why it was widened — Story 5.1 took the acceptance criterion's own amend-the-allowlist branch. Do not restate the twelve entries; the point is that exactly one document owns the list. Leave every other criterion in that section byte-identical.

### DW-61: No gate command resolves `.env.schema` against the environment the deployment actually boots with, so a future type, pattern or `@required` tightening on a key supplied through the process environment
origin: spec-deferred 14b56007a3d2
location: .bmad-loop/policy.toml [verify].commands vs ops/launchagents/ai.mastra.factory.plist
source_spec: `spec-5-2-every-subject-owns-its-keys-and-env-schema-is-the-only-key-l.md`
severity: low
reason: Demonstrated by the verification-gap layer: adding `@type=enum("development", "test")` to the new `NODE_ENV` declaration left all 30 commands at exit 0, while `NODE_ENV=production npx varlock run -- node -e 'console.log(1)'` exited 1 with `Resolved config/env did not pass validation`. The gate runs with no `.env` and with none of the plists' `EnvironmentVariables` exported, so no declared key ever resolves to a value — entries 2 and 3 assert only that the schema parses and that three keys carry `@public`, and the new guard 4 reconciles key *names* without resolving a value. Pre-existing in kind rather than caused here: `DOCKER_HOST` has been declared and plist-supplied since Story 4.2 with the same exposure; this story adds `NODE_ENV` to the same class. Nothing in the tree carries such a constraint today, so the failure needs a future edit to become real. Smallest fix: one more gate command that reads each `ops/launchagents/*.plist` `EnvironmentVariables` pair with `plutil -extract …
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-env-resolution-census
resolution-undo: ff3ff672f7e7577b593d73c567bad9b51febce7061d752ca9b0aa815bb5628d8 2026-09-25 7374617475733a206f70656e

### DW-62: The schema-completeness guard reads literal `process.env.KEY` and `process.env["KEY"]` only, so the four configuration keys read through `process.env[key]` over an array literal are invisible to it
origin: spec-deferred abe6ea13ab87
location: src/mastra/index.ts:576-578 vs .bmad-loop/policy.toml [verify].commands index 25
source_spec: `spec-5-2-every-subject-owns-its-keys-and-env-schema-is-the-only-key-l.md`
severity: low
reason: `src/mastra/index.ts:576-578` is `['MASTRA_PLATFORM_ACCESS_TOKEN', 'MASTRA_PLATFORM_SECRET_KEY'].some(key => Boolean(process.env[key]?.trim()))` and `['MASTRA_ENVIRONMENT_ID', 'MASTRA_PROJECT_ID'].every(...)`. These select the Platform sandbox, so they are deployment configuration, not the sandbox-inherited host variables at `:255-275` that the guard is correctly blind to. Confirmed: adding `'MASTRA_ZZUNDECLARED'` to that array left all 30 commands at exit 0, while the same name written as `process.env.MASTRA_ZZUNDECLARED` trips the guard naming file and line. All four keys are declared today, so nothing is currently unclaimed. Not closed here because reading a name out of an array literal needs a parser rather than a grep, which is a new mechanism rather than a direct correction; the guard's comment now names the gap and the four keys instead of claiming coverage it does not have. Smallest fix: an AST-based extraction, or a convention that every such array is annotated with a comment
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-env-resolution-census
resolution-undo: ff3ff672f7e7577b593d73c567bad9b51febce7061d752ca9b0aa815bb5628d8 2026-09-25 7374617475733a206f70656e

### DW-63: Nothing asserts that `package.json`'s `start` script keeps invoking the server through `varlock run --`, which is the single path on which `.env.schema` is applied at all, so dropping that prefix
origin: spec-deferred 46d02b12c6b1
location: package.json:15 vs .bmad-loop/policy.toml [verify].commands
source_spec: `spec-5-2-every-subject-owns-its-keys-and-env-schema-is-the-only-key-l.md`
severity: medium
reason: `package.json:15` is `"start": "varlock run -- mastra start"`. Demonstrated by rewriting it to `"start": "mastra start"`: all 30 `[verify].commands` stayed at exit 0. The policy comment leans on that invocation twice when it explains why a bare `@required` cannot be used, and both `ops/README.md` and `README.md` tell the operator the schema is what validates the environment — none of which survives the prefix being removed. Deferred rather than patched because it is pre-existing, not caused here: `varlock run --` has been the only application point since long before this story, with no guard over it, and this change adds eleven declarations to a mechanism that was already unprotected. Smallest fix: one more gate command asserting that the `start` script in `package.json` contains `varlock run --`, with a message saying that without it the schema is never read.
status: done 2026-09-24
resolution: resolved by sweep bundle dw-verify-gate-blind-spots
resolution-undo: 340e55fd205d0e3cf3819beaf836397d67f87ae55dde5aa611ff6ba9055f6e5d 2026-09-24 7374617475733a206f70656e

### DW-64: Open deferred-work entries still point at the research document by its old path and by section/line anchors this story rewrote, so the next sweep follows dangling pointers.
origin: spec-deferred 707ba5c656a0
location: _bmad-output/implementation-artifacts/deferred-work.md
source_spec: `spec-5-3-docs-links-out-and-the-path-loses-its-space.md`
severity: medium
reason: `_bmad-output/implementation-artifacts/deferred-work.md` carries 22 occurrences of `docs/Self-hosting research.md` inside entries whose `status:` is still `open`. DW-22 ("§2.1 / §2.2 / §8") and DW-51 ("§7.1-§7.4") describe fenced copies this story deleted, and DW-47 cites `docs/Self-hosting research.md:670`, a line number in a file that lost ~180 lines above it. The ledger is orchestrator-owned — this session may not re-open, rewrite or resolve its entries — so the correction has to come from a sweep run.
status: open
decision: 2026-09-24 Run it as a bundle anyway and accept the fast-forward merge hazard — In a normal bundle session, rewrite citations only inside _bmad-output/implementation-artifacts/deferred-work.md: replace every `docs/Self-hosting research.md` with `docs/self-hosting-research.md`, re-anchor the section and line references Story 5.3 moved (DW-22's §2.1/§2.2/§8, DW-51's §7.1-§7.4, DW-47's :670), and re-anchor the src/mastra/index.ts line citations against the src/mastra/config/ modules Epic 5 extracted. Headings, status lines, reason prose and ids stay byte-identical — only pointers change. Expect to reconcile against the ledger closes this sweep writes in the main checkout before the branch can fast-forward.
decision: 2026-09-24 Authorize a ledger-maintenance pass — Authorize a single session, exempted from the usual prohibition on editing _bmad-output/implementation-artifacts/deferred-work.md, to rewrite citations only: replace every `docs/Self-hosting research.md` with `docs/self-hosting-research.md`, re-anchor the section and line references Story 5.3 moved, and re-anchor the src/mastra/index.ts line citations DW-68 records against the config modules Epic 5 extracted. Headings, status lines, reasons and ids stay byte-identical — only pointers change — and the pass must run outside a story worktree so it cannot collide with the orchestrator's own ledger writes.

### DW-65: The §1 architecture diagram says the Factory Server runs "one Node 24" while the repo pins Node 22 everywhere else.
origin: spec-deferred 5aec5e596ae9
location: docs/self-hosting-research.md:57
source_spec: `spec-5-3-docs-links-out-and-the-path-loses-its-space.md`
severity: low
reason: `docs/self-hosting-research.md:57` reads `Factory Server (one Node 24)`; `package.json:42` declares `"node": ">=22.19.0"`, `AGENTS.md` says "TypeScript on Node 22" and the sandbox image is `node:22-bookworm-slim`. Verified pre-existing: the same line is present at baseline `6dc8a9d` (`docs/Self-hosting research.md:56`), so this story did not introduce it — it only brought the block under a `Non-normative` marker. Note `ops/factory-start.sh` pins `NODE_BIN=.../v24.19.0`, so deciding which number is right is a real call, not a typo fix.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e

### DW-66: `AGENTS.md`'s "Running and verifying" section carries three false claims, two of them in ways that would mislead the next story: it says there is no test script, that the verify gate runs two guards,
origin: spec-deferred bc1bce9a78f9
location: AGENTS.md:47-53
source_spec: `spec-5-4-a-config-module-with-recorded-provenance-holding-storage-vec.md`
severity: medium
reason: `AGENTS.md:47-48` reads "There is no test script, so it is the only automated check until a story adds one" while `package.json:13` has `"test": "vitest run --dir src"` and three test files now run. `AGENTS.md:49-51` says the gate runs `npm ci`, `npm run check` "and two guards" — `[verify].commands` holds 36 entries. `AGENTS.md:53` says `policy.toml` "is gitignored and exists only in the main checkout" — it is tracked, and `.gitignore:13-15` carries a comment saying so deliberately. All three are false at baseline `b321370`, so this story did not introduce them; and the block is a `<!-- bmad:context -->` managed region, which step-04 routes to defer.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-agents-md-context-block-refresh
resolution-undo: 237df82981ee94958d5888adef457dbb0f36696c33b8abdcc1310c086b9f75cf 2026-09-25 7374617475733a206f70656e

### DW-67: `REDIS_URL` is the one key in the new config modules that is not trimmed, so a whitespace-only value constructs a real `RedisStreamsPubSub` on a blank URL at module load.
origin: spec-deferred 479ee93a755f
location: src/mastra/config/pubsub.ts:17
source_spec: `spec-5-4-a-config-module-with-recorded-provenance-holding-storage-vec.md`
severity: medium
reason: `src/mastra/config/pubsub.ts:17` is `const redisUrl = process.env.REDIS_URL` with no `?.trim()`, while `config/database-url.ts` trims both its keys and every integration key in the entry is trimmed. `apps/github/README.md:454` and `apps/linear/README.md:415` make "blank, whitespace, or empty-quoted" the canonical `.env` failure shape, so the value is reachable. Verified pre-existing: the same untrimmed read is at baseline `b321370` (`src/mastra/index.ts:108`), so this story only moved it — and the Always clause required the move to be behaviour-preserving. Today's behaviour is now pinned explicitly in `src/mastra/config/infrastructure.test.ts`, so adding the trim would be a visible, deliberate edit. Note `index.test.ts`'s own docstring: a `REDIS_URL` the boot acts on makes it dial a Redis that need not exist, and the gate hangs rather than fails.
status: open

### DW-68: Three `src/mastra/index.ts:N` citations in `_bmad-output/planning-artifacts/epics.md`, and nine in `_bmad-output/implementation-artifacts/deferred-work.md`, name lines the entry no longer holds.
origin: spec-deferred aab19e90f9fd
location: _bmad-output/planning-artifacts/epics.md:303,308,314
source_spec: `spec-5-4-a-config-module-with-recorded-provenance-holding-storage-vec.md`
severity: low
reason: `epics.md:303` cites `src/mastra/index.ts:45` for `positiveInt`, `:308` cites `:52` for `decodeCredentialEncryptionKey`, `:314` cites `:204` for `localSandboxEnv`. All three were ALREADY stale at baseline `b321370` — the functions sat at `:50`, `:64` and `:272` there — and this story shifted them again, to `:57`, `:71` and `:259`. `deferred-work.md` carries `index.ts` anchors in DW-25 (`:576-578`, now `:527-529`), DW-54 (`:69-86`), and six more. Not repaired here: the intent's Never clause forbids rewriting anything under `_bmad-output/`, and the deferred-work ledger is the orchestrator's to edit. Settling this needs a pass that owns both files at once.
status: open

### DW-69: `ops/README.md` and `.env.schema` both describe `REDIS_URL` as "unset keeps the in-process bus" without noting that a whitespace-only value is not unset and does construct a client.
origin: spec-deferred 4d932a9d51a1
location: ops/README.md (REDIS_URL section), .env.schema
source_spec: `spec-5-4-a-config-module-with-recorded-provenance-holding-storage-vec.md`
severity: low
reason: Same root cause as the untrimmed-`REDIS_URL` entry above: `config/pubsub.ts:17` does not trim, so `REDIS_URL=" "` builds a `RedisStreamsPubSub` on a blank target while the identically padded `DATABASE_URL` reads as absent. The operator-facing text says only "Unset keeps the in-process bus". Not repaired here for two reasons: the intent's Never clause forbids editing `.env.schema`, and documenting the asymmetry would enshrine as intended a behaviour the entry above records as a defect. Both should move together — add the `?.trim()` and leave the docs saying what they already say.
status: open

### DW-70: The comment above `storage,` in the entry's `new MastraFactory({ … })` call says the factory falls back to "default storage resolution" when no database is configured, which never happens —
origin: spec-deferred c9f4f1d1be29
location: src/mastra/index.ts (new MastraFactory call, storage property comment)
source_spec: `spec-5-4-a-config-module-with-recorded-provenance-holding-storage-vec.md`
severity: low
reason: `src/mastra/index.ts` factory call, the paragraph ending "Unset (bare local dev) → default storage resolution applies (local libSQL file)". `config/storage.ts:20-30` constructs `LibSQLFactoryStorage` on that branch, so the factory's own resolution is never reached. Verified pre-existing and byte-identical at baseline `b321370:src/mastra/index.ts:593` — the inline block there also always produced an instance, so this story neither introduced nor worsened it. Left alone because the Always clause makes this story a behaviour- preserving move and the comment is the entry's, not a moved concern's; `config/README.md`'s "a concern moves with the comments that explain it" is what will collect it, in the story that next edits this call.
status: open

### DW-71: A malformed or whitespace-only `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` aborts the boot with a raw `SyntaxError` from `JSON.parse` that never names the key, instead of the shaped message the
origin: spec-deferred e55e4ef0bcf4
location: src/mastra/config/auth.ts:55-56
source_spec: `spec-5-5-extract-auth-integrations-and-sandbox.md`
severity: medium
reason: `src/mastra/config/auth.ts:55-56` reads the key into a local and parses it when truthy, so `' '` or `'{oops'` reaches `JSON.parse` unguarded. Verified pre-existing and semantically identical at baseline `4ba3bd4` (`src/mastra/index.ts:88-90` was `process.env.X ? JSON.parse(process.env.X) : {}`), so this story only moved it — and the intent's Always clause required the move to be behaviour-preserving, with the double read collapsed and nothing else changed. The adjacent shape error (`must be a JSON object of key ids to base64 keys.`) is now pinned whole by `config/auth.test.ts`, so adding the `try`/`catch` would be a visible, deliberate edit against a test that already exists.
status: open

### DW-72: A `FACTORY_SANDBOX_MEMORY_GIB` or `FACTORY_SANDBOX_CPUS` set to a very large safe integer passes `positiveInt` and is multiplied into a `memory`/`cpuQuota` outside any range Docker will accept, so
origin: spec-deferred 9ad26926bae2
location: src/mastra/config/sandbox.ts:119-121
source_spec: `spec-5-5-extract-auth-integrations-and-sandbox.md`
severity: low
reason: `src/mastra/config/sandbox.ts:119-121` bounds the knobs only by `Number.isSafeInteger` and `> 0`, then multiplies by `1024 ** 3`. Verified pre-existing and byte-identical at baseline `4ba3bd4` (`src/mastra/index.ts:325-327`); `positive-int.test.ts` pins the parser's range behaviour unchanged. Capping the knobs is a behaviour change and a new ceiling constant, which `sandbox/README.md` would have to state — the story that adds the cap should own both.
status: open

### DW-73: `SLACK_APP_BOT_TOKEN` is the one Slack key read raw while `SLACK_APP_CLIENT_ID` and `SLACK_APP_CLIENT_SECRET` beside it are trimmed, and that asymmetry has no test.
origin: spec-deferred 8abbf6649a78
location: src/mastra/config/integrations.ts:102
source_spec: `spec-5-5-extract-auth-integrations-and-sandbox.md`
severity: low
reason: `src/mastra/config/integrations.ts:102` passes `process.env.SLACK_APP_BOT_TOKEN` straight through while `:103-104` use `?.trim()`. Verified pre-existing and byte-identical at baseline `4ba3bd4` (`src/mastra/index.ts:513-515`), so this story moved it without touching it. `SlackIntegration.diagnostics()` exposes `botTokenConfigured`, so the whitespace case is observable and a test is cheap — but the behaviour it would pin is unchanged behaviour, and the Always clause put untrimmed reads out of this story's reach.
status: open

### DW-74: Two of the sandbox module's env reads are unpinned: `E2B_API_KEY`'s `.trim()` and `MASTRACODE_LOCAL_SANDBOX_ROOT`, which no test in `src/` stubs at all, leaving the `LocalSandbox` working-directory
origin: spec-deferred ccb46363581e
location: src/mastra/config/sandbox.ts:271,280
source_spec: `spec-5-5-extract-auth-integrations-and-sandbox.md`
severity: low
reason: `src/mastra/config/sandbox.ts:271` and `:280`. `E2B_API_KEY` is stubbed in eight places in `config/sandbox.test.ts` but never to a whitespace-only value, so dropping the `.trim()` leaves the suite green; `MASTRACODE_LOCAL_SANDBOX_ROOT` appears nowhere under `src/` outside the module. Verified pre-existing: `git show 4ba3bd4:src/mastra/index.test.ts` mentions `MASTRACODE_LOCAL_SANDBOX_ROOT` zero times, so the relocated blocks moved this gap intact rather than creating it. Every other trim in the module (image, provider, workdir) has a dedicated case; closing these two is new coverage for unchanged behaviour.
status: open

### DW-75: The concern import order inside `src/mastra/config/factory.ts` carries the boot's evaluation order — which diagnostic an operator sees first when several things are wrong — and no test or guard reads
origin: spec-deferred 0d5e45dddd54
location: src/mastra/config/factory.ts:36-43
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: low
reason: Hoisting `import { auth, secretEncryption } from './auth'` above `./pubsub` in `config/factory.ts` leaves 120/120 tests and all 42 gate commands green. Verified pre-existing: the identical import block sat in `src/mastra/index.ts` at baseline `8b1fd1c` with exactly the same absence of cover, and Story 5.5's review logged and rejected the same finding against the entry. `config/factory.ts:26-35`, `config/README.md:78-86` and five module docstrings all assert the coupling holds. The cheap close is a case in `config/factory.test.ts` that stubs `REDIS_URL` plus a Slack group that throws and asserts the ordered `console.log` / `console.warn` / throw sequence.
status: open

### DW-76: A `MASTRACODE_PUBLIC_URL` that is present but empty or whitespace-only becomes the deployment's public origin, because the value is exported raw and `@mastra/factory` reaches for its
origin: spec-deferred b05b5439d03e
location: src/mastra/config/public-url.ts:19
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: low
reason: `src/mastra/config/public-url.ts:19` exports `process.env.MASTRACODE_PUBLIC_URL` untrimmed; `node_modules/@mastra/factory/dist/factory.js:180` uses `??`, so `''` is a configured origin and OAuth redirect URLs are built against it. Verified pre-existing and semantically identical at baseline `8b1fd1c`: `src/mastra/index.ts:78` was `publicUrl: process.env.MASTRACODE_PUBLIC_URL,` and `config/integrations.ts:92` read the same key raw. This story's Always clause required the collapse to be behaviour-preserving, and adding `?.trim() || undefined` is a deliberate behaviour change that `apps/slack/README.md:395`'s present-and-empty operator control would have to be re-reconciled against.
status: open

### DW-77: The Slack integration's `uiOrigin` slot — the origin every account-link redirect is built against — is asserted nowhere under `src/`, so severing it from the one `MASTRACODE_PUBLIC_URL` read leaves
origin: spec-deferred 5d1e552c348e
location: src/mastra/config/integrations.ts:103
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: medium
reason: Changing `integrations.ts:103` to `uiOrigin: undefined` keeps `tsc` clean (the slot is `uiOrigin?: string`), 121/121 tests passing and all 42 gate commands at exit 0: guard 41 counts read sites, guards 35/37 parse the factory call's property list, and `SlackIntegration.diagnostics()` returns only booleans, so no public member exposes the value. Verified pre-existing: `uiOrigin: publicUrl` sat at `config/integrations.ts:108` at baseline `8b1fd1c` with exactly the same absence of cover (`git grep uiOrigin 8b1fd1c -- src` returns that one line). The consequence if it is severed is that Slack redirects resolve against the API origin instead of the SPA origin. The cheap close is not cheap here: the house style in `integrations.test.ts` deliberately does not stub integration packages, so observing the value means either capturing the `SlackIntegration` constructor argument or driving its connect route.
status: open

### DW-78: Four test suites now carry their own hand-maintained environment-sweep prefix list, and a prefix added to one does not reach the others — a case can inherit an ambient value it never mentions.
origin: spec-deferred 29b6e5bc8722
location: src/mastra/config/factory.test.ts:77
source_spec: `spec-5-6-the-entry-is-four-things-and-the-build-proves-it.md`
severity: low
reason: `src/mastra/index.test.ts:42,70`, `config/auth.test.ts:38,43`, `config/sandbox.test.ts:30,36` and now `config/factory.test.ts:77,78` each declare their own `*_ENV_PREFIXES` / `*_ENV_EXACT` pair; `factory.test.ts`'s comment asserts it is "the same list" as `../index.test.ts` and nothing enforces that. Verified pre-existing: three of the four suites carried their own copies at baseline `8b1fd1c`, so the new file follows the house pattern rather than introducing it. The fix — exporting one pair from a shared module and importing it in all four — is a test-infrastructure refactor across suites this story does not otherwise touch.
status: open

### DW-79: The sensitivity census in guards 4 and 44 runs one direction only: nothing asserts that a key which must stay masked still is, so adding a `# @public` line above POSTGRES_PASSWORD — or flipping the
origin: spec-deferred 7adcf0706d56
location: .bmad-loop/policy.toml [verify].commands (guards 4 and 44) / .env.schema
source_spec: `spec-verify-gate-blind-spots.md`
severity: medium
reason: Measured in this worktree by two independent reviewers: inserting `# @public` above POSTGRES_PASSWORD at .env.schema:340 makes `varlock load --format json-full` report isSensitive:false for it, and guards 4 and 42-47 all exit 0. The same holds for a one-character edit to the header. .env.schema carries roughly 50 `# @public` annotations and the two positive lists cover 5 of them. Pre-existing: guard 4 has had this shape since Story 1.3, and the bundle intent scoped DW-18 to the two POSTGRES keys only. Smallest fix: append a guard pinning at least one known-sensitive key (POSTGRES_PASSWORD) to isSensitive === true, which also pins the header.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-env-resolution-census
resolution-undo: ff3ff672f7e7577b593d73c567bad9b51febce7061d752ca9b0aa815bb5628d8 2026-09-25 7374617475733a206f70656e

### DW-80: Nothing reconciles the three tracked copies of the sandbox working directory — the Dockerfile's WORKDIR, MASTRACODE_SANDBOX_WORKDIR's default in .env.schema, and DEFAULT_SANDBOX_WORKDIR in
origin: spec-deferred 1c1ed662aa0a
location: .bmad-loop/policy.toml [verify].commands (guard 46) / .env.schema:499 / src/mastra/config/sandbox.ts:90
source_spec: `spec-verify-gate-blind-spots.md`
severity: medium
reason: Guard 46 pins the Dockerfile's WORKDIR to /workspace and nothing else. The other two sites are machine-readable and unchecked: .env.schema:499 (`MASTRACODE_SANDBOX_WORKDIR=/workspace`) and src/mastra/config/sandbox.ts:90 (`const DEFAULT_SANDBOX_WORKDIR = '/workspace'`). Changing one alone leaves all 48 commands green and the container mounting a path the server does not use. Not caused by this change; guard 46 already holds the Dockerfile value in a variable, so the comparison is a few bytes.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-artifact-invariants
resolution-undo: 5da15eae468a5645b61dc773d1020d808bc2c39644e2fad31f72ed7eca63a152 2026-09-25 7374617475733a206f70656e

### DW-81: The one thing the sandbox image exists for — carrying `git` and `gh` — is asserted by no gate command, so the whole GitHub CLI install block can be deleted with all 48 green.
origin: spec-deferred 040dd4da631b
location: .bmad-loop/policy.toml [verify].commands / sandbox/factory-sandbox.Dockerfile
source_spec: `spec-verify-gate-blind-spots.md`
severity: medium
reason: Measured: deleting the `gh` apt block from sandbox/factory-sandbox.Dockerfile leaves guards 45 and 46 at rc=0. DW-23's source story is spec-2-1 "operator: a sandbox image that carries git and gh"; this bundle closed the three shape invariants DW-23 named (no COPY/ADD, one WORKDIR /workspace, a pinned FROM) and not the package list. Smallest fix: a grep guard over the Dockerfile asserting `git` and `gh` are installed.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-artifact-invariants
resolution-undo: 5da15eae468a5645b61dc773d1020d808bc2c39644e2fad31f72ed7eca63a152 2026-09-25 7374617475733a206f70656e

### DW-82: The no-`latest` rule is enforced on the documented build command and the Dockerfile's base image, but not on the tag actually run: FACTORY_SANDBOX_IMAGE can be set to `factory-sandbox:latest` and
origin: spec-deferred fe29cecfe996
location: .env.schema:483 (FACTORY_SANDBOX_IMAGE)
source_spec: `spec-verify-gate-blind-spots.md`
severity: medium
reason: FACTORY_SANDBOX_IMAGE is declared at .env.schema:483 as `# @public` with no @type/matches constraint, so `varlock load` accepts any value. Guard 37's key census names it as a key to reconcile, never as a value. Guard 47 reads sandbox/README.md's build and run commands; guard 46 reads the Dockerfile's FROM, which is a different tag from the one NFR19 fixes. Smallest fix: a `@type=string(matches=...)` constraint on the declaration, or a guard over its default. Pre-existing — the key has been unconstrained since Story 2.2.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-env-schema-key-list-cleanup
resolution-undo: d3d893e960379613857819faf592c93adcd5aa09fe7e5dfd3a4b3131512a6b6f 2026-09-25 7374617475733a206f70656e

### DW-83: DW-63's chain has two links and guard 48 covers one: ops/factory-start.sh:130 is `exec npm run start`, and rewriting it to `exec mastra start` bypasses varlock entirely with all 48 commands green.
origin: spec-deferred febf696d6197
location: ops/factory-start.sh:130
source_spec: `spec-verify-gate-blind-spots.md`
severity: medium
reason: Guard 48 asserts package.json's `start` script contains `varlock run --`. The production path per AD-11/NFR10 is LaunchAgent -> ops/factory-start.sh -> `exec npm run start` (ops/factory-start.sh:130). No command in the gate reads that `exec` line, though six commands otherwise open that file. DW-63's ledger text scopes the fix to package.json:15, which is what was implemented. Smallest fix: one grep guard over ops/factory-start.sh asserting the wrapper still execs `npm run start`.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-gate-guards-artifact-invariants
resolution-undo: 5da15eae468a5645b61dc773d1020d808bc2c39644e2fad31f72ed7eca63a152 2026-09-25 7374617475733a206f70656e

### DW-84: The other half of DW-1's diagnosis is still open: `engines.npm` is unset, so a host without corepack silently runs a different npm than package-lock.json was produced by, and guard 43 only proves the
origin: spec-deferred 56ce62f9b4c1
location: package.json engines
source_spec: `spec-verify-gate-blind-spots.md`
severity: low
reason: package.json `engines` declares `node` only. Guard 43 asserts packageManager === "npm@" + $(npm --version), a property of the gate host rather than of the install, so pin and host moving together away from the npm that generated the lockfile stays green. The bundle intent scoped this change to .bmad-loop/policy.toml, and DW-1 named engines.npm as diagnosis rather than as part of its smallest fix, so it was deliberately not touched. Smallest fix: add `"npm": ">=11.17.0"` to engines in a change that owns package.json.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-package-json-declaration-hygiene
resolution-undo: 970e8c699a1ad30548c5eb58840c95f5366ef557408f43ebede0079383f0c42c 2026-09-25 7374617475733a206f70656e

### DW-85: No `[verify].commands` entry may run a mutating `docker compose` subcommand — above all `down -v` from a worktree — and nothing enforces that rule; pinning the project name is exactly what made it
origin: spec-deferred 9c27b0cf4e0d
location: .bmad-loop/policy.toml [verify].commands (the rule is stated in the guard-50 comment paragraph)
source_spec: `spec-compose-file-hardening-and-gate-2.md`
severity: medium
reason: Carried forward from the previous attempt of this bundle and re-confirmed here. Before the pin, a worktree's Compose commands addressed a directory-scoped project, so a `down -v` there was inert; after it, `POSTGRES_PASSWORD=x docker compose config` from this worktree resolves to project `mastra-factory`, and `docker volume ls` shows `mastra-factory_mastracode-web-pgdata` is the only volume on this host — AGENTS.md:31 records it as the only copy of projects, work items, sessions, memory and tokens, with no backups. Grepping all 52 command bodies, only indices 27, 48, 49 and 51 invoke `compose` and all four call `config` only; none of them reads `.bmad-loop/policy.toml`, so the rule exists only as prose in the comment block. Not patched here because the fix is not trivial: a guard that reads its own array and rejects a mutating `docker compose` subcommand would match its own text and every sibling guard's explanatory message, so it needs a self-exclusion rule this file has no precedent
status: open

### DW-86: DW-16's mirror half is not merely unaddressed — guard 52 now makes `container_name: mastracode-web-db` a gate-enforced requirement, so the per-project namespacing the ledger wanted restored is pinned
origin: spec-deferred 1209bba26471
location: docker-compose.yml:24 (container_name) / .bmad-loop/policy.toml guard 52 / README.md / ops/README.md
source_spec: `spec-compose-file-hardening-and-gate-2.md`
severity: low
reason: `docker-compose.yml:24` still pins `container_name`, and `docker ps` on this host shows the live container carrying it. Pinning the project name does not change this: `container_name` opts the service out of the project prefix entirely, which is the opposite of what `name:` restores for the volume. Guard 52's new `container_name` arm now asserts that exact value, so removing it is a two-file change rather than a one-line one. Explicitly pre-existing and out of this bundle's scope: DW-16's own ledger text says "both the unpinned project name and container_name predate this story" and names its smallest fix as `name: mastra-factory` alone. Smallest fix: drop `container_name`, relax guard 52's arm to the resolved `<project>-app-db-1` form, and update the `docker inspect`/`docker exec`/`docker stop` command lines in README.md and ops/README.md in the same change.
status: done 2026-09-24
decision: 2026-09-25 Drop container_name; re-point guard 52 — Remove container_name from docker-compose.yml so the service takes the project prefix, re-point guard 52's container_name arm at .bmad-loop/policy.toml:1992 to assert the resolved project-prefixed form instead of the literal (re-pointing a moved subject, not weakening the assertion), and update every docker inspect, docker exec and docker stop line in README.md and ops/README.md in the same change. Verify with `docker compose config` and a real restart that the existing mastra-factory_mastracode-web-pgdata volume is still attached — AGENTS.md:31 records it as the only copy of all deployment data, with no backups, so the data must not be orphaned.
resolution: closed by human decision: A single-operator host runs one database; the stable name is what README.md and ops/README.md's diagnostics address, and guard 52 now pins it deliberately.
decision: 2026-09-24 Close — the fixed name is deliberate — A single-operator host runs one database; the stable name is what README.md and ops/README.md's diagnostics address, and guard 52 now pins it deliberately.

### DW-87: `[verify].commands` entry 51 fails at baseline, independent of this change: docker-compose.yml:12 explains the bound in prose as "`--wait` alone defaults to --wait-timeout 0", and guard 51's flag scan
origin: spec-deferred e68f42b2de42
location: docker-compose.yml:12 vs .bmad-loop/policy.toml [verify].commands entry 51
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: Full 55-entry gate run on the corrected tree: 54 pass, only 51 fails. Its command string is byte-identical to baseline `47966e45abbdc437359f20f69fd5492a6e933cdb` (the array is append-only and was verified entry-by-entry), and its only inputs — `docker-compose.yml`, `package.json`, `README.md`, `ops/README.md` — are untouched by this change, so it fails identically before and after. `git log -S` shows the conflicting comment landed in `737d6b9` and the prose-reconciliation arm in its child `59a0280`, i.e. guard 51 has been red since it was added. Smallest fix: reword that one comment clause so it carries no `--wait-timeout <digits>` token; docker-compose.yml:9 still states `--wait-timeout 120`, which is the value the guard needs to find.
status: done 2026-09-25
resolution: already resolved: docker-compose.yml:12 now reads "a bare `--wait` defaults to a zero timeout" — the `--wait-timeout <digits>` token guard 51 scans for is gone from the prose while :9 still carries `--wait-timeout 120` for the guard to find; the reword is the smallest fix this entry prescribed and landed in commit 1796009, and a full parse of [verify].commands now shows 63 entries with guard 51's only inputs (docker-compose.yml, package.json, README.md, ops/README.md) agreeing.

### DW-88: `_bmad-output/planning-artifacts/epics.md` still carries the claim this change corrected, and `AGENTS.md` cites that file as a normative pointer, so the two now contradict each other.
origin: spec-deferred 8ebb66b5954d
location: _bmad-output/planning-artifacts/epics.md:319,325 vs AGENTS.md:44
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: epics.md:319 says the gate runs "`npm run check`, and two guards" and :325 warns against deleting "the two guards"; `[verify].commands` holds 55. AGENTS.md:44 lists `_bmad-output/planning-artifacts/epics.md` under "Where things are", and `.claude/skills/bmad-project-context/SKILL.md:70` calls two live contradictory instructions a defect. Not fixed here: epics.md is a frozen record of the plan and sits outside the two files this change is allowed to edit. Smallest fix is either correcting those two lines or marking epics.md as historical where AGENTS.md points at it.
status: open

### DW-89: The pre-existing `[verify]` narrative at the head of `.bmad-loop/policy.toml` still describes the array as it was at four entries, in the same file whose new comment block preaches against exactly
origin: spec-deferred 7c6621d28295
location: .bmad-loop/policy.toml:33,44
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: `.bmad-loop/policy.toml:33` reads "The two guards after the typecheck enforce AD-4 and AD-9/AD-13" and :44 describes `npm test` as appended to a two-guard list; the array holds 55 entries and AGENTS.md now directs every session to read it as the live list. No gate command reads those comment lines. Pre-existing — it predates this change and none of the six ledger entries recorded it — so it is filed rather than patched here.
status: open

### DW-90: Nothing re-proves that the three guards still DETECT anything; a narrowing edit turns one into a green no-op that is indistinguishable at the gate from a guard that passed.
origin: spec-deferred dd040e10ac59
location: .bmad-loop/policy.toml [verify].commands entries 53, 54, 55
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: Measured by the verification-gap layer: narrowing guard 55's token pattern from `[A-Z][A-Z0-9_*?]*` to `[A-Z][A-Z0-9_]*` — the shape of the earlier draft, and a plausible "tidy this to a legal key name" edit — makes `` `WORKOS_*` `` match nothing, so arms (a) and (b) see zero offenders. With the glob restored onto the unset bullet the shipped guard exits 1 and the mutated one exits 0; the `keys.length < 5` sentinel does not fire because the other 13 tokens remain. `npm test` is `vitest run --dir src` and no test under `src/` executes entries 53-55, so the only evidence they detect anything is the by-hand break/revert matrix — run twice in this session (19 cases, then 26 more after the review patches), and recorded in the `[verify]` comment block. Not fixed here: the smallest real fix is a canary arm per guard, running its own extraction over an in-program fixture. That is a substantial rewrite of three ~3,000-character programs inside TOML `'''` literals whose quoting already forbids
status: open

### DW-91: DW-87 is `status: open` in the deferred-work ledger, but this change resolved it; its `reason` field also still describes the pre-repair tree.
origin: spec-deferred 875a6421c806
location: _bmad-output/implementation-artifacts/deferred-work.md DW-87
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: The ledger entry prescribes "Smallest fix: reword that one comment clause", which this change applied at `docker-compose.yml:12`, and asserts "54 pass, only 51 fails" — measured now, the full array is 55 of 55 and entry 51 exits 0. Not fixed here because the intent's Boundaries say "Do not edit the deferred-work ledger or the sprint board; the orchestrator records resolution", and DW-87/88/89 were written into the ledger by the orchestrator (`origin: spec-deferred`), not by a dev session. Left for the orchestrator to close on integration; recorded here so a later sweep does not re-do finished work from a stale reason.
status: open

### DW-92: This change edits one comment clause of `docker-compose.yml`, which the intent's "Always" section pins outside its two-file scope.
origin: spec-deferred c3cd5bd361eb
location: docker-compose.yml:12 vs spec `<intent-contract>` Boundaries & Constraints
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: `[verify].commands` entry 51 was red at baseline and had been since it was added: it reconciles every `--wait-timeout <digits>` written in `docker-compose.yml` against `package.json scripts[db:up]`, and the file's line 12 explained the default in prose with that exact token. The orchestrator's deterministic gate failed on it and re-dispatched this session to repair the tree. No fix existed inside `AGENTS.md` or `.bmad-loop/policy.toml`: the array is append-only by the same "Always" section, so entry 51 could not be amended. The excursion is one YAML comment clause — no service, image, port, volume or healthcheck field — and it is what makes the acceptance criterion "all 55 exit 0" reachable. Recorded rather than hidden; the three acceptance/boundary/verification lines that still assert a two-file diff sit inside the read-only `<intent-contract>` and were deliberately not edited.
status: open

### DW-93: Guard 54 reads backtick-anchored tokens only, so a tracked path called gitignored in unbackticked prose still passes.
origin: spec-deferred 89ff546b6a8d
location: .bmad-loop/policy.toml [verify].commands entry 54
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: Measured twice: a clause reading "The file docs/self-hosting-research.md is gitignored." exits 0 both before and after this pass's guard-54 patches. Kept as a known limit rather than widened: the managed block backticks every path it names, and the fix — matching ~100 raw tracked-path strings against clause text — measurably false-fails on correct prose (the already-backticked contrast clause "unlike `.env`, `package.json` is never gitignored" exits 1 today). The intent's I/O matrix specifies the backticked form for this row.
status: open

### DW-94: Two AGENTS.md nits left unfixed because a fix edits an agent-context file: the restamped provenance line runs to 120 columns, and the gate bullet restates entry 1's npm flags.
origin: spec-deferred 623c70cc065e
location: AGENTS.md:2 and AGENTS.md:51-59
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: `AGENTS.md:2` is 120 characters against the ~100-column hard wrap the rest of the block keeps, and it switched from the short-SHA convention (`5e09129`) to a full 40-character SHA — the full SHA is what the spec's Tasks section requires, so only the wrap is in question. Separately, the gate bullet says "starting with `npm ci --no-audit --no-fund`", which copies unguarded content out of `[verify].commands` entry 1: change those flags and the prose goes stale with all 55 entries green. Both are cosmetic, both live inside the managed block that `bmad-project-context` regenerates, and review routing sends any fix that edits an agent-context file to defer.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e

### DW-95: `AGENTS.md`'s Policy section still tells every session that `tsc --noEmit` is the only real check — the same "only check" claim class this change removed from `## Running and verifying`, two headings
origin: spec-deferred 2af5191ae912
location: AGENTS.md:15-18
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: `AGENTS.md:16` reads "`tsc --noEmit` is the only real check, so code outside `src/` is silently unverified". `[verify].commands` holds 55 entries, three of which run `npm run check`, `npm test` and `npm run build` and the rest of which check `ops/`, `sandbox/`, the compose project and this block's own prose — so the clause is false in the same way DW-5/54/66 were. This pass widened guard 53's denial arm to the whole managed block, but that arm matches `no <script> script`, not an "only check" assertion, so nothing catches this wording; measured green. Pre-existing at baseline `47966e4` and not introduced here, and the fix edits an agent-context file, which review routing sends to defer. Smallest fix is rewording that clause to say what `tsc --noEmit` does not cover rather than what nothing else checks.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e

### DW-96: DW-90's recorded demonstration no longer reproduces, so a sweep that re-runs it as written will conclude the entry is closed while the gap it describes is still open.
origin: spec-deferred fcc9f07a7c47
location: _bmad-output/implementation-artifacts/deferred-work.md DW-90
source_spec: `spec-agents-md-context-block-refresh.md`
severity: medium
reason: DW-90 says narrowing guard 55's token class from `[A-Z][A-Z0-9_*?]*` to `[A-Z][A-Z0-9_]*` makes the guard exit 0 with `` `WORKOS_*` `` restored to the unset bullet. Measured on this tree: the mutated guard exits 1, because arm (c) — the unbackticked glob scan over the sliced unset bullet, added after that measurement was taken — matches `WORKOS_*` with or without backticks. The underlying gap is still real and was re-demonstrated here by a different mutation: narrowing guard 53's denial window from `j<=i+4` to `j<=i+1` turns that arm into a permanent exit 0 with "There is no automated test script here." in the section, and no sentinel fires. Not fixed here: DW-90 lives in the deferred-work ledger, which the intent's Boundaries and this run's dispatch both put off-limits to a dev session. Filed so the orchestrator can refresh the demonstration rather than close the entry on a stale one.
status: open

### DW-97: The restamped provenance line names the baseline SHA, which predates the two commits that wrote the block, so the next refresh diffs from a tree that does not contain the block it is checking.
origin: spec-deferred 8bfe8b7cdc98
location: AGENTS.md:2
source_spec: `spec-agents-md-context-block-refresh.md`
severity: low
reason: `AGENTS.md:2` reads "Verified 2026-09-25 against 47966e45abbdc437359f20f69fd5492a6e933cdb". That is `baseline_revision`; the block's own edits landed in `bcf0ff9` and `2dd8e20`, both after it, and `bmad-project-context/SKILL.md:85` has refresh diff from the stamped SHA. The result is a false drift signal on this change's own lines, not a missed one. The dev session followed the spec, whose Tasks section says to stamp `git rev-parse HEAD` — which was the baseline while the session ran. Not fixed here: the fix edits an agent-context file. Distinct from the column-wrap item above, which is about the line's length, not which SHA it names.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e

### DW-98: The verify gate reads neither `engines` nor root `dependencies`, so the new `engines.npm` floor is asserted by nothing and can silently desync from the `packageManager` pin it was chosen to match.
origin: spec-deferred b6cce4948e11
location: .bmad-loop/policy.toml [verify].commands / package.json engines.npm
source_spec: `spec-package-json-declaration-hygiene.md`
severity: medium
reason: All 55 entries of `[verify].commands` were enumerated and scanned: the string `engines` appears zero times in `.bmad-loop/policy.toml`. The seven commands that read `package.json` (20, 34, 43, 48, 51, 52, 53) read only `scripts`, `@mastra/factory`'s pinned version, `packageManager` and `workspaces`. No vitest suite reads the manifest. So deleting `engines.npm` in a later change leaves the gate green, and — the sharper case — guard 43's own remediation text instructs an operator to bump `packageManager` and regenerate the lockfile, which desyncs the floor without any signal. The floor then admits an npm below the one the lockfile was produced by, which is the condition DW-84 added it to detect. Smallest fix: append one `sh -c` guard to `[verify].commands` (the array is append-only) asserting `engines.npm` equals `">=" + packageManager` with the `npm@` prefix and any `+sha512` suffix stripped. Not done here: this bundle's intent enumerates three edits (drop the dependency, add the floor,
status: open

### DW-99: SPEC.md:76's normative "the packages for the ruled-out paths stay installed" now rests solely on `@mastra/factory@0.15.0`'s own dependency edge, which nothing in this repo asserts.
origin: spec-deferred ef4d0178adc7
location: package.json dependencies / _bmad-output/specs/spec-self-hosted-factory/SPEC.md:76
source_spec: `spec-package-json-declaration-hygiene.md`
severity: medium
reason: Before this change the root declaration was itself the pin: `npm ci` could not produce a tree lacking `@mastra/auth-workos`. After it, the only remaining edge is `packages["node_modules/@mastra/factory"].dependencies["@mastra/auth-workos"] === "1.6.5"` — a third party's internal choice. A later `@mastra/factory` bump that drops or renames that dependency would violate a constraint SPEC.md marks normative and resolved, and every one of the 55 gate commands would still exit 0: none reads `dependencies`, none inspects `node_modules`, and no first-party module imports the package. The spec's own proof (`node -p "require('./node_modules/@mastra/auth-workos/package.json').version"`) is a one-shot verification command, not a gate entry, so it never runs again. Not closed here: the edge holds today at the pinned `@mastra/factory@0.15.0`, and AGENTS.md:30 already forces a deliberate one-way review at the next bump, which is the natural moment to either add a gate assertion or restore the root
status: open

### DW-100: `">=11.17.0"` is a one-directional floor, so it covers only half of DW-84's stated failure — an npm *newer* than the one that produced the lockfile satisfies it silently.
origin: spec-deferred 39534d1cb68c
location: package.json engines.npm
source_spec: `spec-package-json-declaration-hygiene.md`
severity: low
reason: DW-84's diagnosis is "a host without corepack silently runs a different npm than package-lock.json was produced by". An open-ended `>=` warns (EBADENGINE, never fails, since there is no `.npmrc` and `engine-strict` is off) only on npm below 11.17.0. An npm 12 host — the case that can rewrite `lockfileVersion` — satisfies the floor and emits nothing. DW-84's operative complaint, that "pin and host moving together away from the npm that generated the lockfile stays green", is therefore as green after this change as before for any host npm >= 11.17.0. Not addressed here: DW-84 names `"npm": ">=11.17.0"` verbatim as its smallest fix and this bundle's intent repeats that value, so narrowing it to a bounded range would contradict the intent rather than fulfil it. Settling it needs a decision on the upper bound, the same shape of question DW-3 carries for `engines.node`.
status: open
decision: 2026-09-25 Bound it to the 11 major — Narrow package.json engines.npm from ">=11.17.0" to ">=11.17.0 <12.0.0", so a host npm that could rewrite lockfileVersion falls out of the declared range, and state in the same change that the bound moves with packageManager — which is the reconciliation guard the gate-guards-manifest-invariants bundle appends for DW-98, so the two must agree on the parse. Mirror the DW-3 decision's shape: declare the majors this deployment actually supports rather than an open bound.

### DW-101: This bundle's premise that `engines.node`'s upper bound is "a separate open human decision (DW-3)" is stale — DW-3 already carries a recorded decision dated 2026-09-24.
origin: spec-deferred 3b8ab93457ac
location: package.json engines.node
source_spec: `spec-package-json-declaration-hygiene.md`
severity: low
reason: `.bmad-loop/decisions.json` and the DW-3 ledger entry both carry: "2026-09-24 Declare 22 and 24; keep running 24 — Narrow package.json engines.node to admit only the 22 and 24 majors (excluding 23 and 25, which vitest@5.0.1 does not support), and correct AGENTS.md:9 ... Close DW-10 and DW-65 in the same change." So the decision is made; only the build is outstanding. Not acted on here: this bundle's intent says "Leave engines.node alone", DW-3 is a separate ledger entry with its own decided bundle intent that also closes DW-10 and DW-65, and its fix edits AGENTS.md — an agent-context file. Recorded so the stale characterization does not propagate into the next bundle's premise.
status: done 2026-09-25
resolution: resolved by sweep bundle dw-node-range-and-agents-md-claims
resolution-undo: 80711c2591abb4beef19a8d78006377e9f0bb41a7424126b075fe41efb082f47 2026-09-25 7374617475733a206f70656e

### DW-102: Two enum declarations reject the bare, unquoted values README.md tells the operator to write, so a .env following the documented instruction refuses to boot.
origin: spec-deferred 8bea9d7efda5
location: .env.schema:542 (MASTRACODE_DISTRIBUTED_LOCK), .env.schema:557 (VITE_REACT_GRAB)
source_spec: `spec-env-schema-key-list-cleanup.md`
severity: medium
reason: Measured on this tree with a temporary .env holding `MASTRACODE_DISTRIBUTED_LOCK=0` and `VITE_REACT_GRAB=true`: `npx varlock load --format json` exits 1 and names both keys. varlock coerces an unquoted .env number/boolean before enum validation, and these two declarations list only the quoted members — `enum("", "0", "1")` at .env.schema:542 and `enum("", "true")` at :557 — unlike MASTRA_PLATFORM_GITHUB_POLLING_ENABLED (:201) and MASTRACODE_GITHUB_RECONCILE_ENABLED (:385), which list the bare forms alongside and carry the comment explaining why. README.md:283 tells the operator `0` is the value for a single process with no database. Pre-existing and untouched by this change: the diff does not touch either declaration (`git diff <baseline> -- .env.schema | grep -c 'DISTRIBUTED_LOCK\|VITE_REACT_GRAB'` returns 0). Fix is to add the bare members to both enums, the way the two working keys already do.
status: open

### DW-103: Nine further environment keys that @mastra/factory reads are declared in neither .env.schema nor .env.example — the same defect class DW-43 named, for other families.
origin: spec-deferred 8d565ddda17f
location: .env.schema, .env.example
source_spec: `spec-env-schema-key-list-cleanup.md`
severity: low
reason: `grep -rhoE 'process\.env\.MASTRACODE_[A-Z0-9_]+' node_modules/@mastra/factory/dist` filtered against `^KEY=` in .env.schema returns, undeclared: MASTRACODE_EXPERIMENTAL_SUBCONSCIOUS, MASTRACODE_INCIDENT_IO_RECONCILE_ENABLED, MASTRACODE_INCIDENT_IO_RECONCILE_INTERVAL_MS, MASTRACODE_PLATFORM_GITHUB_{PR,ISSUE}_RECONCILE_{ENABLED,INTERVAL_MS} and MASTRACODE_PLATFORM_GITHUB_RECONCILE_INTERVAL_MS, MASTRACODE_PLATFORM_LINEAR_POLLING_ENABLED. Pre-existing: DW-43 scoped this story to the four MASTRACODE_GITHUB_*RECONCILE* keys, and all seven MASTRACODE_GITHUB_* names in the package are now declared. Gate command 26 only censuses first-party `src/` reads, so package-read keys are invisible to it and this class does not self-report. Deciding each one is a schema decision (@public, sensitivity, type) of the kind AD-6 assigns to the owning subject, and the MASTRACODE_PLATFORM_GITHUB_* set in particular needs the README.md-vs-apps/github/README.md ownership call the two confusable families already
status: open
decision: 2026-09-25 Declare the reachable families, record the rest — Declare in .env.schema, and mirror into .env.example, the keys this deployment could plausibly set — the MASTRACODE_PLATFORM_GITHUB_{PR,ISSUE}_RECONCILE_* and MASTRACODE_PLATFORM_GITHUB_RECONCILE_INTERVAL_MS set, and MASTRACODE_PLATFORM_LINEAR_POLLING_ENABLED — each with @public/sensitivity/@type chosen per key and the MASTRACODE_PLATFORM_GITHUB_* family assigned to apps/github/README.md under AD-6, with a comment distinguishing it from the MASTRACODE_GITHUB_* family already there. Record the remaining keys (the incident.io pair and connection id, MASTRA_INTEGRATIONS_API_URL, MASTRA_PLATFORM_APP_SLUG, MASTRA_PLATFORM_REGION, MASTRA_PROJECT_ROOT, MASTRA_TELEMETRY_DISABLED, MASTRACODE_EXPERIMENTAL_SUBCONSCIOUS) in one comment block naming why each is deliberately undeclared. Mind the parity guard, which compares .env.schema and .env.example key-for-key and in order.

### DW-104: AD-4's "or other program source" category is still unenforced for non-TypeScript/JavaScript languages — guard 5 is an extension filter, not a category rule.
origin: spec-deferred 92b5f8411c08
location: .bmad-loop/policy.toml [verify].commands guard 5
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: low
reason: Measured in this worktree: a tracked `ops/probe.py` passes guard 5 and every other command in `[verify].commands` (61/61 green). The widening this change made closes the eight-extension TypeScript/JavaScript family only, which is the fix DW-57's ledger text prescribed; AD-4's rule text enumerates four extensions and then says "or other program source", with an `ops/*.sh` carve-out. Closing the category needs either a language-agnostic rule or AD-3-style derivation from the spine, and the extension list cannot express it. Recorded in the guard's own comment block as a stated limit.
status: open
decision: 2026-09-25 Amend AD-4 to a closed extension set — Amend AD-4 in ARCHITECTURE-SPINE.md to replace "or other program source" with a closed, enumerated set of program-source extensions (the eight TypeScript/JavaScript ones plus .py, .rb, .go, .rs, .sh, .pl, .php) and keep the ops/*.sh carve-out as an explicit exception row, so the rule text says exactly what a grep can check. Then append a guard whose pathspec is that set, derived from the spine the way the root closed-set guard derives AD-3's table, so the rule and its enforcement cannot drift. Verify by confirming a tracked ops/probe.py now fails and the three real ops/*.sh files still pass.

### DW-105: No gate command reads the `cd "$REPO_ROOT"` line in ops/factory-start.sh, so the wrapper can still be pointed at another manifest without touching its exec line.
origin: spec-deferred 3dad0c8060f8
location: ops/factory-start.sh:129
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: medium
reason: Measured: rewriting `ops/factory-start.sh:129` from `cd "$REPO_ROOT"` to `cd /tmp` leaves all 61 commands green. npm then resolves whatever package.json is nearest that directory, so `npm run start` never reaches this repository's `varlock run --` prefix — the same bypass new entry 61 closes on the exec line, one line above it. The baked-repo-root guard pins the `readonly REPO_ROOT=` literal against ops/install.sh and the plist, but nothing asserts that the `cd` actually uses it. AD-11 names "must work with the repo root as cwd" as part of the same rule. Smallest fix: one arm on the wrapper asserting the last `cd` before the exec is `"$REPO_ROOT"`.
status: open

### DW-106: Only one key's VALUE is reconciled between .env.schema and .env.example; the parity guard compares key names and order only, so every other default can drift in the file the operator deploys from.
origin: spec-deferred 8ff8e9630cee
location: .bmad-loop/policy.toml [verify].commands (the .env.schema/.env.example parity guard) / .env.example
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: low
reason: The schema/example parity guard strips values with `sed "s/=.*$//"` and compares key names and order, so a drifted value in `.env.example` is invisible to it. This change added a value comparison for `MASTRACODE_SANDBOX_WORKDIR` alone, because that is the key DW-80 named. Measured before that arm existed: setting `.env.example`'s copy to `/srv` left all 61 commands green, and `.env.example` is the file the operator copies to `.env`, so its value is the one that wins at runtime. Every other defaulted key in that file has the same exposure. Smallest fix: extend the parity guard to compare values for keys whose schema declaration carries a non-empty default, rather than one key at a time.
status: open

### DW-107: `sandbox/README.md` is a fifth copy of the sandbox workdir and guard 46 cites it as the binding it protects, but nothing reconciles it.
origin: spec-deferred 282f385e6563
location: sandbox/README.md:54,167-169 / .bmad-loop/policy.toml [verify].commands guard 46
source_spec: `spec-gate-guards-artifact-invariants.md`
severity: low
reason: Guard 46's own messages say `sandbox/README.md` "ties MASTRACODE_SANDBOX_WORKDIR to it by sight", and that README writes `/workspace` in prose at :54 and :167-:169. The guard reconciles the four machine-readable copies and cannot read the fifth: it is documentation, not a declaration, so an arm for it would be a grep for a path substring in English. Pre-existing — the README predates this change, and guard 30 already polices what may and may not appear in the six READMEs without touching values. Measured: rewriting every `/workspace` in that file to `/srv` leaves all 61 commands green. The boundary is now stated in guard 46's comment block rather than left to be rediscovered. Smallest fix: one arm requiring the README to carry the `wd` guard 46 already extracted, at least once, accepting that it asserts presence rather than absence of drift.
status: open

### DW-108: Guard 26's array-literal arm and guard 41's sixth spelling see SINGLE-LINE literals only, so an undeclared key in a literal wrapped across lines is still invisible to both.
origin: spec-deferred ccfecb4901cc
location: .bmad-loop/policy.toml [verify].commands guards 26 and 41
source_spec: `spec-gate-guards-env-resolution-census.md`
severity: low
reason: Measured in this worktree: adding const ZZ_EXTRA = [ 'MASTRA_ZZUNDECLARED_ONE', ]; export const zzHas = ZZ_EXTRA.some(key => Boolean(process.env[key])); to `src/mastra/config/sandbox.ts` leaves guards 26 and 41 — and every other entry of `[verify].commands` — at exit 0, while the same key added to the single-line literal at `:288` fails guard 26 naming `file:line:token`. Both arms join quoted tokens to the computed index BY LINE NUMBER, which is what keeps the `LOCAL_SANDBOX_ENV_KEYS` host-variable sweep correctly invisible and what leaves this class open. Prettier wraps such a literal the moment it exceeds the print width, so the shape is reachable without anyone choosing it. Not closed here for the reason DW-62's own ledger text gives: reading array elements across lines needs a parser rather than a grep, which is a new mechanism rather than a direct correction. The guard's comment now scopes itself to single-line literals and states this residual instead of claiming the class is
status: open

### DW-109: Entry 63 resolves .env.schema against the LaunchAgent PLISTS only, but launchd runs ops/factory-start.sh, which exports its own pairs on top — so a declared key the wrapper sets is value-checked by
origin: spec-deferred 754a26968fc8
location: .bmad-loop/policy.toml [verify].commands entry 63; ops/factory-start.sh:21-26
source_spec: `spec-gate-guards-env-resolution-census.md`
severity: medium
reason: Measured in this worktree: adding export MASTRACODE_MAX_SANDBOXES=abc to `ops/factory-start.sh` after line 26 leaves ALL 63 entries of `[verify].commands` at exit 0, while `env MASTRACODE_MAX_SANDBOXES=abc npx varlock load --format json` exits 1 — i.e. the next `launchctl kickstart` fails in exactly the way DW-61 describes. Entry 28 reconciles the wrapper's exported key NAMES against `.env.schema` but never resolves a value; entry 63 only overlays plist pairs. The wrapper also wins over the plist for keys both set: `ops/factory-start.sh:26` is `export DOCKER_HOST="unix://$DOCKER_SOCKET"`, one of the only two pairs entry 63 value-checks (the two happen to agree in value on this host, so nothing fails today). Not closed here because the wrapper's values are shell expressions that need the script's prologue RUN to resolve — a new mechanism rather than a wider grep — and because DW-61's own smallest-fix text named only the plists, so this is a residual of the ledger entry rather than a
status: open

### DW-110: Nothing in the verify gate reads `engines`, and `EBADENGINE` stays warn-only, so the narrowed Node range is declared but never observed or enforced.
origin: spec-deferred 6ee9fc57b23a
location: package.json:41 / .bmad-loop/policy.toml [verify].commands
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: medium
reason: `engines` appears zero times in `.bmad-loop/policy.toml`; the only entry that parses the manifest (the gate-script census) reads `scripts` and never touches `engines`. There is no `.npmrc` at the repo root and `npm config get engine-strict` is `false`, so `npm ci` exits 0 on an excluded major. Demonstrated: reverting `engines.node` to `">=22.19.0"`, or mistyping it as `"^22.19.0 || ^25.0.0"`, leaves every gate entry green; a scratch project declaring `"^20.0.0"` runs `npm ci --no-audit --no-fund` to exit 0 with only an `EBADENGINE` warning. This is DW-10's stated mechanism ("the gate would run its test runner on an unsupported runtime"), which the recorded 2026-09-24 decision addressed with a declaration rather than an enforcement mechanism. Closing it means appending one `[verify].commands` entry that asserts the fixed table (22.19.0 accepted, 23.11.0 rejected, 24.19.0 accepted, 25.0.0 rejected) and that `process.version` satisfies the declared range — which this bundle's scope
status: open

### DW-111: The Node fact is now stated in four artifacts with no arm tying any two together, so the freshly corrected AGENTS.md claim can drift again exactly the way DW-3 and DW-65 did.
origin: spec-deferred e1a49ac5d841
location: AGENTS.md:10
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: medium
reason: After this change the contract appears at `package.json:41`, `package-lock.json:33`, `AGENTS.md:10` ("Node 22.19+ or 24") and `ops/factory-start.sh:20` (`v24.19.0`, exact), plus the diagram at `docs/self-hosting-research.md:61`. Guards 53, 54 and 55 are the only entries that open AGENTS.md; none of them parses `engines`. Demonstrated: narrowing `engines.node` to `"^24.0.0"` alone and leaving AGENTS.md untouched keeps all 63 entries green while the block keeps telling agents "Node 22.19+ or 24". One appended guard could derive the admitted majors from `engines.node` and require the block's summary sentence to name exactly those.
status: open

### DW-112: The "only check" claim class this pass removed by hand is still caught by nothing, and the managed block is regenerated by bmad-project-context, so all four corrections can revert.
origin: spec-deferred fe2f48e236fe
location: AGENTS.md:14-19 and :52-60
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: medium
reason: DW-95 already records that guard 53's denial arm matches `no <script> script`, not an "only check" assertion, and re-measured green here: guards 53/54/55 exit 0 on both the old and the new wording of `AGENTS.md:17`, and on both the old and the new `npm ci` prose. The repo's own doctrine at `.bmad-loop/policy.toml:1991-1993` is that a hand patch inside the managed block is replaced on the next refresh while "a guard is not replaced", and `policy.toml:2010-2022` describes the one-story lag that follows. The intent's closing note ("every edit has to survive a refresh") is therefore satisfied only in the sense that the edits pass today's gate; nothing makes them durable. The array is append-only and this bundle's scope forbids appending, so the durable fix is a later story or a bmad-project-context post-write check.
status: open

### DW-113: `@types/node` is pinned to the 22 major while `engines.node` now declares 24 supported, so `tsc --noEmit` type-checks against Node 22 typings on either runtime.
origin: spec-deferred 6b457719552c
location: package.json:33
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: `package.json` devDependencies pin `"@types/node": "22.20.1"`. With 24 declared supported, the gate cannot see 24-only API surface as valid and would reject it on a supported runtime. Nothing in the change or the gate ties the typings major to `engines.node`.
status: open

### DW-114: npm does not validate the lockfile's root `engines` mirror against `package.json`, so a future manifest-only edit leaves the two silently out of step.
origin: spec-deferred c4d8d550813e
location: package-lock.json:33
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: Demonstrated on this machine (npm 11.17.0): a scratch project whose lock declares `packages[""].engines.node: ">=99.0.0"` while `package.json` declares `"^22.19.0 || ^24.0.0"` runs `npm ci --no-audit --no-fund` to exit 0 with no warning and no lock-mismatch error. This change regenerated the mirror correctly, but the "confirm the diff is confined to that one line" step is human-run and nothing repeats it.
status: open

### DW-115: Several installed packages declare Node ranges narrower than the new `engines.node`, so `EBADENGINE` warnings remain reachable inside the two admitted majors.
origin: spec-deferred 8f13ae685f56
location: package.json:41
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: Read from `package-lock.json`: `posthog-node` declares `^20.20.0 || >=22.22.0` (so 22.19.0 through 22.21.x warn), the 27 `@babel/*` packages declare `^22.18.0 || >=24.11.0` (so 24.0.0 through 24.10.x warn), and `@napi-rs/lzma-linux-x64-gnu` declares `^22.20 || ^24.12 || >=25`. Pre-existing — `">=22.19.0"` admitted all of these too — and warn-only either way, but it means the declared range is not the intersection of what the tree actually supports.
status: open

### DW-116: No operator-facing document states a Node prerequisite, so the human installing this on a fresh Mac never reads the majors this change decided.
origin: spec-deferred 2a3ef779606a
location: README.md
source_spec: `spec-node-range-and-agents-md-claims.md`
severity: low
reason: Root `README.md`, `docs/`, `ops/README.md` and `sandbox/README.md` carry no Node version statement; the version appears only in `ops/factory-start.sh:20`'s `NODE_BIN` pin, the `docs/self-hosting-research.md:61` diagram, and now `package.json` and the AGENTS.md block — none of which is the setup path. Editing `README.md` adds no root file, so AD-3 does not block it; it is simply outside this bundle's two named files.
status: open
