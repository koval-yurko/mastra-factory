---
title: 'Story 2.1: [operator] A sandbox image that carries git and gh'
type: 'chore'
created: '2026-09-23'
status: done
baseline_revision: 'ffb1f4f9a51e2033705162f72e058b5fb58a9934'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
operator_actions:
  - >-
    Precondition — Story 1.4's engine steps must already be done: `colima`, `docker` and `docker compose`
    installed, and the Colima VM provisioned. If they are not, run `ops/README.md`'s bring-up first;
    nothing below can work without a reachable daemon.
  - >-
    Bring the engine up and point clients at it, in the shell used for every step below:
    `colima start` if it is not already running, then
    `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`.
    See `ops/README.md` for what that value must contain.
  - >-
    Build the image from the repository root:
    `TAG=$(date +%F)` then
    `docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t "factory-sandbox:$TAG" .`
    The tag form is `factory-sandbox:YYYY-MM-DD` — never `latest`.
  - >-
    Smoke-test it:
    `docker run --rm "factory-sandbox:$TAG" sh -c 'git --version && gh --version'` then
    `docker image inspect --format '{{.Architecture}}' "factory-sandbox:$TAG"`.
    Expected: a `git version …` line, then a `gh version …` line, then `arm64`. Both versions must
    print — either one missing means the image would fail at first use with `git-missing` /
    `gh-missing` — and anything other than `arm64` means every session would run under emulation.
  - >-
    Record the tag actually built in the (currently empty) tag history table at the bottom of
    `sandbox/README.md` — one row, newest first: the tag, the build date, and `initial image` as the
    change. Do not record a row for an image that was not built.
  - >-
    Report the result: the exact tag, whether the smoke test printed both versions, and the image size
    from `docker images factory-sandbox`. Do not set `FACTORY_SANDBOX_IMAGE` in `.env` yet — the key is
    not declared in `.env.schema` and nothing reads it until the Docker sandbox branch lands.
deferred:
  - summary: >-
      `docs/Self-hosting research.md` §2.1 still carries a verbatim, unmarked copy of the image
      definition, and its build commands name an `-f` path that no longer resolves from the repository
      root plus a tag that will never be built.
    evidence: |-
      A `diff` of §2.1 lines 96–117 against `sandbox/factory-sandbox.Dockerfile` shows only the two
      fences and the filename comment differing — every instruction line is identical. AD-5 requires a
      code block in `docs/` to be illustrative and marked non-normative; `grep -rn "non-normative"
      docs/` returns nothing. §2.1 line 120 and §8 line 490 both read `-f factory-sandbox.Dockerfile`
      (unresolvable from root now that the file lives under `sandbox/`) with `-t
      factory-sandbox:2026-09-22`, a date the `date +%F` build will never produce. §2.2 additionally
      states the `FACTORY_SANDBOX_MEMORY_GIB` / `FACTORY_SANDBOX_CPUS` / `MASTRACODE_SANDBOX_WORKDIR`
      values that `sandbox/README.md` now owns, so two documents can drift about the same keys.
      Not done here: this story sets `docs/` read-only because its section numbers are stable citation
      anchors. Making `docs/` link out rather than restate is Story 5.3's work (FR32), and Story 5.2
      audits key ownership. Second instance of open DW-20, which records the identical condition for
      `DOCKER_HOST`.
    location: >-
      docs/Self-hosting research.md §2.1 / §2.2 / §8 vs sandbox/
    severity: medium
  - summary: >-
      No gate command can read a Dockerfile, so the no-`COPY`, no-`latest` and `WORKDIR /workspace`
      invariants this story's acceptance criteria assert are hand-checked once and unenforced afterwards.
    evidence: |-
      The five `[verify].commands` are `npm ci`, `npm run check` (`tsc --noEmit`, `include:
      ["src/**/*"]`), a path guard filtering `*.ts *.js *.mjs *.cjs`, a `.agents/skills` status guard,
      and `npm test` (`vitest run --dir src`). None of them parses a `.Dockerfile` or a `.md`: adding a
      `COPY . /workspace`, retagging to `latest`, or moving `WORKDIR` leaves all five exiting 0.
      Smallest fix: three `sh -c` grep guards appended to `[verify].commands`, following the
      `&& exit 1 || exit 0` idiom the two existing guards already use.
      Not done here: `.bmad-loop/policy.toml` is orchestrator surface this story's intent sets
      read-only. Same shape as open DW-14 (nothing can parse `docker-compose.yml`).
    location: >-
      .bmad-loop/policy.toml [verify].commands / sandbox/factory-sandbox.Dockerfile
    severity: medium
  - summary: >-
      Whether `/usr/share/keyrings` exists in `node:22-bookworm-slim` is unverified; if it does not, the
      `curl -o` write fails and the build dies at the operator's first action.
    evidence: |-
      The image writes `/usr/share/keyrings/githubcli-archive-keyring.gpg` with `curl -o` and never
      creates the directory, while GitHub's own Debian instructions open with `mkdir -p -m 755
      /usr/share/keyrings` precisely because it is not guaranteed. Debian base images normally ship it
      via `debian-archive-keyring`, which is why the inherited §2.1 recipe omits the `mkdir` — but no
      container engine exists on this host, so it could not be observed either way, and the Dockerfile
      is pinned to §2.1's content by this story's acceptance criteria.
      What would settle it: `docker run --rm node:22-bookworm-slim ls -d /usr/share/keyrings`, or simply
      the operator's first `docker build`. The failure is loud and immediate, and `sandbox/README.md`'s
      "If the build fails" section already names the `mkdir -p` fix, so the cost of being wrong is one
      retry rather than a silent defect.
    location: >-
      sandbox/factory-sandbox.Dockerfile:5-6
    severity: medium (unverified)
  - summary: >-
      The build context is the repository root with no `.dockerignore`, so `node_modules/`, `.git/`,
      `_bmad-output/` and `.env` are transferred to the engine on every build even though the image
      copies nothing.
    evidence: |-
      `docker build … -f sandbox/factory-sandbox.Dockerfile … .` makes the repo root the context; there
      is no `.dockerignore` anywhere in the tree, and `node_modules/` alone is over 1 GB here before the
      `.bmad-loop/runs/` worktrees. Nothing lands in the image — the Dockerfile has no `COPY`/`ADD` — so
      the cost is transfer time, plus `.env` (which holds `POSTGRES_PASSWORD`) being sent to the daemon.
      Not done here, two ways: the epic's acceptance criterion pins the build command's trailing `.`,
      and a root `.dockerignore` would add a file to the closed root set AD-3 defines, which is a spine
      decision rather than a local call. Either fix — narrowing the context to `sandbox/`, or adding the
      ignore file to the root allowlist — needs that decision first. `sandbox/README.md` documents the
      cost in the meantime.
    location: >-
      sandbox/README.md build command / repository root (.dockerignore absent)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Agent sessions run inside a Docker container on this host and clone repositories *inside* that
container, never onto the Mac — so `git` and the GitHub CLI have to be in the image. `node:22-slim` ships
neither, and Factory has explicit `git-missing` / `gh-missing` error codes, so a session fails at first use.
Today the image exists only as a fenced block in `docs/Self-hosting research.md` §2.1, which AD-5 forbids as
the home of an operational artifact, and no committed file says what the `FACTORY_SANDBOX_*` values must
contain or which tag was built.

**Approach:** Create the `sandbox/` operator-plane subject: `sandbox/factory-sandbox.Dockerfile` as the one
real file for the image, and `sandbox/README.md` as the AD-6 owner of `FACTORY_SANDBOX_*` and
`MASTRACODE_SANDBOX_WORKDIR`, carrying the build and retag commands and a tag history table. Building an
image needs a running engine and cannot happen in a story worktree, so the story then parks at
`awaiting-operator` with the build and smoke-test commands enumerated.

## Boundaries & Constraints

**Always:**
- `sandbox/factory-sandbox.Dockerfile` is a real committed file (AD-5 / FR30) and its content matches
  `docs/Self-hosting research.md` §2.1 lines 96–117 — same base image, same two `apt-get` layers, same
  package list, `corepack enable`, `WORKDIR /workspace`, `CMD ["sleep", "infinity"]`.
- It copies no application code: no `COPY`, no `ADD`. The repository is cloned inside the session's
  container at runtime (FR8).
- `sandbox/README.md` owns, per AD-6, what each of `FACTORY_SANDBOX_PROVIDER`, `FACTORY_SANDBOX_IMAGE`,
  `FACTORY_SANDBOX_MEMORY_GIB`, `FACTORY_SANDBOX_CPUS` and `MASTRACODE_SANDBOX_WORKDIR` must contain and how
  to obtain or choose it, plus the build command, the retag/rollback commands, and a tag history table.
- Tags are date-stamped `factory-sandbox:YYYY-MM-DD`, never `latest` (NFR19).
- `sandbox/` is a **seeded** spine directory (`ARCHITECTURE-SPINE.md` Structural Seed, and AD-6 names
  `sandbox/README.md` by path), so creating it executes the spine rather than changing it. Only the two
  files above are created.
- The story finalizes at `status: awaiting-operator` with a non-empty `operator_actions:` list — never
  `done`, never `blocked`. Completion is
  `bmad-loop confirm 2-1-operator-a-sandbox-image-that-carries-git-and-gh`.

**Never:**
- Never restate the half `.env.schema` owns: no required/optional, no sensitivity, no `@public`, no `@type`
  in `sandbox/README.md` (NFR7).
- Never declare `FACTORY_SANDBOX_IMAGE`, `FACTORY_SANDBOX_MEMORY_GIB` or `FACTORY_SANDBOX_CPUS` in
  `.env.schema` / `.env.example`. Story 2.2 declares the whole sandbox key group as its own acceptance
  criterion, in the same change that adds the branch which reads them; declaring them here pre-empts it and
  leaves keys nothing reads. This story documents values, it does not ask for any to be set.
- Never edit `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `docker-compose.yml`,
  `.env.schema`, `.env.example`, `AGENTS.md`, `README.md`, `ops/`, `docs/`, or `.bmad-loop/policy.toml`.
  `docs/` section numbers are stable citation anchors; policy.toml is gitignored orchestrator surface.
- Never run `docker`, `colima` or `brew`, and never attempt to install them. Verified in this worktree:
  `docker`, `colima` and `gh` are all absent; only `git` is on the PATH.
- Never add a root-level file or any root directory other than the seeded `sandbox/`.
- Never pin a tag of `latest`, and never write a tag-history row for an image that has not been built.

</intent-contract>

## Code Map

- `sandbox/factory-sandbox.Dockerfile` -- **to create**. Nothing exists under `sandbox/` today (verified: no
  such directory). Content is `docs/Self-hosting research.md` §2.1 lines 96–117 verbatim in substance:
  `FROM node:22-bookworm-slim`; layer 1 installs `git ca-certificates curl gnupg openssh-client less`, then
  fetches `githubcli-archive-keyring.gpg` with the `curl` it just installed, writes
  `/etc/apt/sources.list.d/github-cli.list` with `arch=$(dpkg --print-architecture)` and `signed-by=`, then
  installs `gh`; layer 2 installs `build-essential python3 python3-pip python3-venv ripgrep jq unzip`; both
  layers end `rm -rf /var/lib/apt/lists/*`; then `RUN corepack enable`, `WORKDIR /workspace`,
  `CMD ["sleep", "infinity"]`.
- `sandbox/README.md` -- **to create**. Model its shape on `ops/README.md` (the other operator-plane subject
  README, created by Story 1.4): a one-paragraph statement of what the file is normative for, a line
  pointing at `.env.schema` as the list of keys, one section per owned key, then commands and checkpoints.
  `ops/README.md` never cites story numbers in prose — say "once the Docker sandbox branch lands" instead.
- `docs/Self-hosting research.md` -- **read-only**, and the source of every fact here. §2.1 lines 91–125 is
  the image and the build command; §2 lines 78–89 is the `@mastra/docker` per-session container model;
  §2.2 lines 127–161 gives the defaults the README documents (`FACTORY_SANDBOX_MEMORY_GIB` 10,
  `FACTORY_SANDBOX_CPUS` 4, `MASTRACODE_SANDBOX_WORKDIR` `/workspace`, image fallback
  `factory-sandbox:2026-09-22`); §2.3 lines 163–178 is the capacity table (Colima VM 12 cores / 32 GiB,
  Postgres ~1 core / ~2 GiB, three sandboxes at 4 cores / 10 GiB each) and the long-lived, label-reconnected,
  prune-weekly lifecycle; §1 lines 73–74 is the verified "the repo is cloned **inside** the session's
  sandbox".
- `.env.schema` -- **read-only**. Already declares `FACTORY_SANDBOX_PROVIDER` (line 13, `# @public`),
  `MASTRACODE_SANDBOX_WORKDIR` (line 335, `# @public`, with the literal default `/workspace` on the line) and
  `MASTRACODE_MAX_SANDBOXES` (line 343). It does **not** declare `FACTORY_SANDBOX_IMAGE`,
  `FACTORY_SANDBOX_MEMORY_GIB` or `FACTORY_SANDBOX_CPUS` — Story 2.2's acceptance criterion adds all six
  together. Its existing prose describes the *upstream* meaning of `FACTORY_SANDBOX_PROVIDER` (`local`);
  `docker` becomes meaningful only after Story 2.2's branch.
- `ARCHITECTURE-SPINE.md` -- **read-only**. Structural Seed (lines 263–265) seeds `sandbox/` with exactly
  these two files; AD-3 (lines 54–69) puts host-infrastructure subjects at root and forbids first-party code
  in them; AD-5 (lines 81–87); AD-6 (lines 89–97) assigns `FACTORY_SANDBOX_*` and
  `MASTRACODE_SANDBOX_WORKDIR` to `sandbox/README.md`; Consistency Conventions (line 213) fixes the tag form.
- `ops/README.md` -- **read-only**. Precedent for voice, and the owner of `DOCKER_HOST` — the variable the
  operator must have exported before `docker build` can reach the engine. Link to it; do not restate it.
- `.bmad-loop/policy.toml` -- **read-only**. `[verify].commands` is `npm ci --no-audit --no-fund`,
  `npm run check`, the two `git ls-files` / `git status` guards, and `npm test`. A `.Dockerfile` and a `.md`
  are invisible to all five: the path guard filters `*.ts *.js *.mjs *.cjs`, `tsc` is `include: ["src/**/*"]`,
  vitest runs `--dir src`. Nothing in the repo can lint or parse a Dockerfile.
- Host facts (verified in this worktree): `command -v docker colima gh` returns nothing; `git` is
  `/usr/bin/git`; there is no `node_modules/`. Baseline revision is
  `ffb1f4f9a51e2033705162f72e058b5fb58a9934`.

## Tasks & Acceptance

**Execution:**
- `sandbox/factory-sandbox.Dockerfile` -- create the image definition exactly as described in the Code Map --
  AD-5/FR30 require one real file at the seeded path, and FR6 requires `git` and `gh` present at first use.
- `sandbox/README.md` -- create the operator-plane subject README: what the file is normative for and a
  pointer to `.env.schema` as the list of keys; a section per owned key (`FACTORY_SANDBOX_PROVIDER`,
  `FACTORY_SANDBOX_IMAGE`, `FACTORY_SANDBOX_MEMORY_GIB`, `FACTORY_SANDBOX_CPUS`,
  `MASTRACODE_SANDBOX_WORKDIR`) stating what the value must contain and how to obtain or choose it; a short
  "what the image carries" note so a future extension knows what is already there; the build command, the
  smoke test, the retag/rollback commands; and an empty tag history table with an explicit "nothing built
  yet" line -- AD-6 gives this file the "what the value must contain and how to obtain it" half, and the
  story's second and third criteria name the build command, the retag command and the table.
- `_bmad-output/implementation-artifacts/spec-2-1-…-git-and-gh.md` -- finalize this spec to
  `status: awaiting-operator` with a non-empty `operator_actions:` list and an `## Auto Run Result` section.

**Acceptance Criteria:**
- Given AD-5/FR30 require operational artifacts to be real files, when `git ls-files sandbox/` runs, then it
  lists exactly `sandbox/README.md` and `sandbox/factory-sandbox.Dockerfile`.
- Given FR6 and the §2.1 package list, when `sandbox/factory-sandbox.Dockerfile` is read, then it is
  `FROM node:22-bookworm-slim` and installs `git`, `ca-certificates`, `curl`, `gnupg`, `openssh-client`,
  `less`, `gh` from `https://cli.github.com/packages` under its own `signed-by` keyring, and
  `build-essential`, `python3`, `python3-pip`, `python3-venv`, `ripgrep`, `jq`, `unzip`; and it runs
  `corepack enable` and sets `WORKDIR /workspace`.
- Given the repository is cloned inside the session's container (FR8), when the Dockerfile is read, then it
  contains no `COPY` and no `ADD` instruction.
- Given AD-6 assigns `sandbox/README.md` ownership of `FACTORY_SANDBOX_*` and `MASTRACODE_SANDBOX_WORKDIR`,
  when that file is read, then each of the five keys has a statement of what its value must contain and how
  to obtain or choose it, and it is the only committed file that states them.
- Given NFR7 splits env-key truth, when `sandbox/README.md` is read, then no sentence states whether any key
  is required, optional, sensitive or `@public`, and no sentence gives a varlock annotation.
- Given NFR19 fixes the tag form, when `sandbox/README.md` is read, then the build command is
  `docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t factory-sandbox:<YYYY-MM-DD> .`
  in date-stamped form, the smoke test is
  `docker run --rm factory-sandbox:<YYYY-MM-DD> sh -c 'git --version && gh --version'`, the string `latest`
  appears only where it is forbidden, and a tag history table exists with no row for an unbuilt image.
- Given Story 2.2 owns the sandbox key group in `.env.schema`, when
  `git diff --stat ffb1f4f9a51e2033705162f72e058b5fb58a9934 -- src package.json package-lock.json tsconfig.json docker-compose.yml .env.schema .env.example AGENTS.md README.md ops 'docs/'`
  runs, then it produces no output.
- Given secrets never enter the repo (NFR18), when the full diff against the baseline is read, then no added
  line carries a usable password, key or token.
- Given the verify gate, when `npm ci --no-audit --no-fund`, `npm run check`, both path guards and `npm test`
  run in order in a worktree with no `node_modules/`, then every one exits 0.
- Given building an image needs a running engine that this host does not have, when the session finishes,
  then the spec's frontmatter reads `status: awaiting-operator` with a non-empty `operator_actions:` list
  carrying the build and smoke-test commands and the instruction to record the tag actually built, and the
  Auto Run Result reports the same status.

## Spec Change Log

## Review Triage Log

### 2026-09-23 — Review pass

- verdicts: 36 findings — high 0, medium 15, low 16, false 4, maybe-false 1
- findings:
  - `[medium]` `[patch]` README claims `docker` "falls through to the local provider, so setting it early
    changes nothing" — verified false at `src/mastra/index.ts:303-316`: `useLocalSandbox` is
    `=== 'local'` only, so `docker` leaves the Platform → E2B → local chain active. Patched: the section
    now says to leave it unset or `local`, and that setting `docker` early re-enables off-host relocation.
  - `[low]` `[patch]` "three concurrent sandboxes at 10 GiB each fit with headroom" — 3 × 10 + 2 = 32,
    the whole VM. Patched to "a deliberate full commit, not headroom", safe only because caps are
    ceilings, matching how the CPU paragraph already frames 3 × 4 + 1 against 12.
  - `[medium]` `[patch]` README told the operator to point `FACTORY_SANDBOX_IMAGE` at the tag while
    `operator_actions:` says not to — verified: the key is undeclared in `.env.schema` and nothing reads
    it. Patched: both places qualified with "once the Docker sandbox branch lands".
  - `[medium]` `[patch]` The `.` build context was explained as a consequence of the `-f` path; `-f` and
    the context are independent CLI arguments. Patched: the context is the pinned command's choice, the
    image copies nothing out of it, and with no `.dockerignore` the whole tree still transfers.
  - `[low]` `[patch]` Smoke test checks only `git`/`gh`, so an `amd64` image built under emulation passes
    it — the failure the Build section itself calls "slow enough to look like a hang". Patched:
    `docker image inspect --format '{{.Architecture}}'` expecting `arm64` added, and mirrored into
    `operator_actions:`.
  - `[low]` `[patch]` A no-edit rebuild hits the layer cache and `FROM node:22-bookworm-slim` is a moving
    tag, so a new date tag can assert freshness it does not have. Patched: one line naming `--pull` and
    `--no-cache`.
  - `[low]` `[patch]` Rollback treated the older image as guaranteed present; `docker image prune -a`
    removes exactly an unreferenced known-good target. Patched: never prune the tag in use or the last
    known-good one.
  - `[false]` `[reject]` Missing `chmod go+r` on the keyring — the `RUN` shell runs as root under
    Docker's fixed default umask 0022 (the host umask is not inherited), so the file lands 0644 and
    `_apt` can read it. The bad outcome does not occur here.
  - `[low]` `[patch]` Capacity sentences leaned on "three concurrent sandboxes" without naming the key.
    Patched: `MASTRACODE_MAX_SANDBOXES` named in both paragraphs, flagged as a key this file does not
    own, with `.env.schema` pointed at as the list.
  - `[low]` `[patch]` "What the image carries" omitted bookworm's PEP 668 `python3-pip` and that the
    image defines no user. Patched: one clause each.
  - `[medium]` `[patch]` No prerequisites and no failure modes, unlike the `ops/README.md` precedent the
    spec named. Patched: a "Before you start" block and an "If the build fails" block with three named
    modes (daemon unreachable; the `gh` layer on unreachable `cli.github.com` or a missing
    `/usr/share/keyrings`; the build killed on VM disk).
  - `[medium]` `[defer]` The Dockerfile's no-`COPY` / no-`latest` / `WORKDIR` invariants are visible to
    none of the five `[verify].commands` — verified by tracing each. Fix is three grep guards in
    `.bmad-loop/policy.toml`, which this story's intent sets read-only. Deferred item 2.
  - `[low]` `[patch]` The `FACTORY_SANDBOX_IMAGE` section cited a `factory-sandbox:2026-09-22` fallback —
    behaviour of code that does not exist and a date `date +%F` will never produce. Patched: the specific
    tag is gone, "pin the tag explicitly" kept with a non-speculative reason.
  - `[maybe-false]` `[defer]` `/usr/share/keyrings` may not exist in `node:22-bookworm-slim`, failing the
    `curl -o` write — Debian base images normally ship it via `debian-archive-keyring`, but no engine
    exists here to check. Settled by `docker run --rm node:22-bookworm-slim ls -d /usr/share/keyrings` or
    the operator's first build; the failure is loud and the README now names the `mkdir -p` fix.
    Deferred item 3.
  - `[false]` `[reject]` Same `chmod go+r` claim from the edge-case layer — same refutation: fixed 0022
    umask inside the build.
  - `[low]` `[patch]` PEP 668 raised again as a Dockerfile change (`ENV PIP_BREAK_SYSTEM_PACKAGES=1`) —
    the defect is real but that fix alters pinned image content and suppresses a guard rather than
    documenting it; patched as documentation with the rest of the image-traps entry.
  - `[low]` `[patch]` A second build on the same calendar day re-points the tag and leaves the first
    image dangling, so "every tag is a distinct date" does not hold. Patched: one paragraph, with a
    suffixed tag as the way to keep both.
  - `[low]` `[patch]` Same-day rebuild breaks the rollback claim — same defect as the row above; patched
    by the same paragraph.
  - `[medium]` `[patch]` The retag comment put `factory-sandbox:$TAG` into `.env`, which expands nothing —
    the same trap `ops/README.md` documents for `$HOME`. Patched: write the tag out in full.
  - `[low]` `[defer]` Build context ships `.env`, `.git` and `node_modules` to the engine; fix is a
    narrowed context or a root `.dockerignore`. The epic's acceptance criterion pins the trailing `.`,
    and a root file is a closed-root-set (AD-3) decision. Deferred item 4; the cost is now documented.
  - `[low]` `[patch]` An emulated image passes the smoke test — same defect as the architecture row;
    patched by the same `docker image inspect` addition.
  - `[medium]` `[patch]` "It is the only copy: nothing in `docs/` reproduces it" is false — `docs/`
    §2.1 still carries the identical fenced block, verified by `diff`. Patched: the sentence now names
    this file as the canonical artifact and §2.1 as a superseded narrative copy.
  - `[medium]` `[patch]` Provider claim, from the edge-case layer — same defect as the first row; patched
    by the same rewrite.
  - `[low]` `[patch]` Headroom claim, from the edge-case layer — same defect as the second row; patched
    by the same rewrite.
  - `[medium]` `[defer]` "Only committed file that states them" cannot hold: `.env.schema` states what
    `FACTORY_SANDBOX_PROVIDER` must contain and `docs/` §2.2 states the 10 / 4 / `/workspace` defaults.
    The schema half is AD-6's own split and not a defect; the `docs/` half is real and `docs/` is
    read-only here. Deferred item 1.
  - `[medium]` `[patch]` Verification-gap layer, filed pre-verified: `docs/` §2.1 holds a verbatim
    unmarked duplicate plus a stale `-f factory-sandbox.Dockerfile` build command, while
    `sandbox/README.md` asserted the opposite. Patched at the sentence (in-scope); the `docs/` edit is
    deferred item 1.
  - `[medium]` `[patch]` Verification-gap other-finding: provider fall-through — same defect as the first
    row; patched by the same rewrite.
  - `[medium]` `[patch]` Verification-gap other-finding: README vs `operator_actions:` contradiction over
    setting the image key — same defect as the third row; patched by the same qualifier.
  - `[low]` `[patch]` Verification-gap other-finding: headroom arithmetic — same defect as the second
    row; patched by the same rewrite.
  - `[medium]` `[patch]` Verification-gap other-finding: build-context justification wrong and the tree
    is over 1 GB — same defect as the fourth row; patched by the same rewrite, structural half deferred.
  - `[low]` `[reject]` Intent auditor: the change's surface (repository text) is not the surface the
    story's acceptance lives at (a built image), and the verify gate is structurally blind to both files.
    True and already stated by the spec — it is the definition of an operator-parked story, not a defect
    to fix; the build is `operator_actions:`.
  - `[medium]` `[defer]` Intent auditor: AD-5 canonicalization is only half done while `docs/` §2.1 keeps
    an unmarked duplicate — same defect as the verification-gap row; deferred item 1.
  - `[medium]` `[patch]` Intent auditor: `operator_actions:` presupposed `colima`/`docker` already
    installed while Story 1.4 is itself still `awaiting-operator`. Patched two ways — a "Before you start"
    block in the README pointing at `ops/README.md`, and an explicit precondition item added ahead of the
    existing `operator_actions:` list.
  - `[low]` `[patch]` Intent auditor: forward-looking claims about unwritten code (the fallback tag, the
    provider fall-through) sit in an operator-plane document — same defects as the provider and
    fallback-tag rows; patched by those rewrites.
  - `[false]` `[reject]` Frontmatter `status: 'in-review'` contradicts the Auto Run Result's
    `awaiting-operator` — transient review-step state the workflow mandates for the duration of this step;
    the terminal status is written at finalize, which this pass did.
  - `[false]` `[reject]` `epic-2-context.md` is not named by any acceptance criterion — it is the
    workflow's own compiled epic context, produced by step-01 before planning; required input, not scope
    creep.

## Design Notes

**Why no `.env.schema` change, when Story 1.4 made one.** Story 1.4 added `DOCKER_HOST` because that story
was the first committed file to *ask the operator to set* a key. This story asks for nothing to be set: it
documents what values must contain, and the branch that reads `FACTORY_SANDBOX_IMAGE`,
`FACTORY_SANDBOX_MEMORY_GIB` and `FACTORY_SANDBOX_CPUS` does not exist yet. Story 2.2's third acceptance
criterion declares all six sandbox keys in one edit alongside that branch. Two stories editing the same
block is the drift AD-6 exists to prevent.

**Why the tag history table starts empty.** No image has ever been built on this host. A seeded row would
assert a tag that does not exist, and the story's own criterion is that the tag *actually* built is recorded
on confirmation — which is the operator's step, not this session's.

**Tag form in the README.** The build and smoke-test commands are shown once in a form that cannot go stale:

```bash
TAG=$(date +%F)                      # e.g. 2026-09-23 — never `latest`
docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t "factory-sandbox:$TAG" .
docker run --rm "factory-sandbox:$TAG" sh -c 'git --version && gh --version'
```

State the literal shape `factory-sandbox:YYYY-MM-DD` alongside it so the pinned command in the acceptance
criteria and the runnable form are visibly the same command.

## Verification

**Commands:**
- `git ls-files sandbox/` -- expected: exactly `sandbox/README.md` and `sandbox/factory-sandbox.Dockerfile`
- `grep -cE '^(COPY|ADD) ' sandbox/factory-sandbox.Dockerfile` -- expected: `0`
- `grep -c 'latest' sandbox/factory-sandbox.Dockerfile` -- expected: `0`
- `grep -E 'node:22-bookworm-slim|corepack enable|WORKDIR /workspace' sandbox/factory-sandbox.Dockerfile` --
  expected: all three present
- `grep -E 'FACTORY_SANDBOX_(PROVIDER|IMAGE|MEMORY_GIB|CPUS)|MASTRACODE_SANDBOX_WORKDIR' sandbox/README.md`
  -- expected: all five keys present
- `grep -nE '@public|@type|sensitive|required' sandbox/README.md` -- expected: no match
- `git diff --stat ffb1f4f9a51e2033705162f72e058b5fb58a9934 -- src package.json package-lock.json tsconfig.json docker-compose.yml .env.schema .env.example AGENTS.md README.md ops 'docs/'`
  -- expected: no output
- `git diff ffb1f4f9a51e2033705162f72e058b5fb58a9934 -- sandbox | grep '^+'` -- expected: no line carries a
  usable password, key or token
- `npm ci --no-audit --no-fund` -- expected: exits 0 with no `node_modules/` present
- `npm run check` -- expected: exits 0
- `sh -c 'git ls-files "*.ts" "*.js" "*.mjs" "*.cjs" | grep -v "^src/" && exit 1 || exit 0'` -- expected:
  exits 0 (a `.Dockerfile` and a `.md` are invisible to this guard)
- `sh -c 'git status --porcelain -- .agents/skills | grep . && exit 1 || exit 0'` -- expected: exits 0
- `npm test` -- expected: exits 0, all tests passing

**Manual checks (if no CLI):**
- No container engine exists on this machine, so the Dockerfile cannot be built or linted here. Read it
  line-by-line against `docs/Self-hosting research.md` §2.1 lines 96–117 and confirm the base image, both
  package lists, the keyring URL and `signed-by` form, the two `rm -rf /var/lib/apt/lists/*` cleanups,
  `corepack enable`, `WORKDIR` and `CMD` all match — and that `curl` and `ca-certificates` are installed in
  the same `&&` chain *before* the `curl` that fetches the keyring runs.
- Read `sandbox/README.md` against `.env.schema` lines 8–13, 331–335 and 340–343 and confirm no sentence
  restates validation, defaults-as-validation, sensitivity or annotations; and against `ops/README.md` and
  confirm `DOCKER_HOST` is linked, not re-derived.

## Auto Run Result

Status: awaiting-operator

**Summary.** The committable half of this story is in. `sandbox/` now exists as the operator-plane subject
the Structural Seed names, holding exactly the two seeded files and nothing else.

`sandbox/factory-sandbox.Dockerfile` is the one real file for the image (AD-5 / FR30): `FROM
node:22-bookworm-slim`, a first `apt-get` layer that installs `git ca-certificates curl gnupg openssh-client
less` and then — in the same `&&` chain, after `curl` and `ca-certificates` are on disk — fetches
`githubcli-archive-keyring.gpg` from `https://cli.github.com/packages`, writes
`/etc/apt/sources.list.d/github-cli.list` with `arch=$(dpkg --print-architecture)` and a `signed-by=` pointing
at that keyring, and installs `gh`; a second layer for the generic toolchain (`build-essential python3
python3-pip python3-venv ripgrep jq unzip`); `rm -rf /var/lib/apt/lists/*` at the end of both; then `RUN
corepack enable`, `WORKDIR /workspace` and `CMD ["sleep", "infinity"]`. It carries no `COPY` and no `ADD` —
the repository is cloned inside the session's container at runtime (FR8), never baked in.

`sandbox/README.md` is the AD-6 owner of `FACTORY_SANDBOX_PROVIDER`, `FACTORY_SANDBOX_IMAGE`,
`FACTORY_SANDBOX_MEMORY_GIB`, `FACTORY_SANDBOX_CPUS` and `MASTRACODE_SANDBOX_WORKDIR`. It opens by naming
what it is normative for, points at `.env.schema` as the list of keys and at `ops/README.md` for
`DOCKER_HOST`, then gives one section per key with a "what the value must contain" and a "how to choose /
obtain it" paragraph — carrying the §2.2 and §2.3 numbers as the choices for this host (`10` GiB and `4`
cores per sandbox against a 12-core / 32 GiB Colima VM with Postgres taking roughly one core and 2 GiB;
`/workspace` kept equal to the Dockerfile's `WORKDIR`). A "what the image carries" section states the two
package layers so a future extension knows what is already there. A "Before you start" block and an "If the
build fails" block mirror `ops/README.md`'s shape. Build, smoke test and retag/rollback are given as runnable
commands, and the tag history table is present and empty with an explicit line saying nothing has been built
yet.

The `FACTORY_SANDBOX_PROVIDER` section says plainly to leave the key unset or `local` for now. Verified
against `src/mastra/index.ts:303-316`: the entry pins the local provider only on the exact string `local`, so
`docker` behaves identically to unset and leaves the Platform → E2B → local chain active — setting it early
would re-enable the off-host relocation this epic exists to replace, not keep work on this host.

Building an image needs a running engine, which a story worktree does not have: `docker`, `colima` and `gh`
are all absent from this host (only `git`, at `/usr/bin/git`). The story therefore parks at
`awaiting-operator` with the build, smoke-test and record-the-tag steps enumerated in `operator_actions:`.
Completion is `bmad-loop confirm 2-1-operator-a-sandbox-image-that-carries-git-and-gh`.

**Files changed** (against `ffb1f4f9a51e2033705162f72e058b5fb58a9934`):
- `sandbox/factory-sandbox.Dockerfile` — created. The image definition; no `COPY`, no `ADD`, no `latest`.
- `sandbox/README.md` — created. Ownership of the five keys, what the image carries, build / smoke test /
  retag / rollback, and an empty tag history table.
- `_bmad-output/implementation-artifacts/spec-2-1-…-git-and-gh.md` — this spec, finalized.

No other file was touched. In particular `.env.schema` and `.env.example` are unchanged: Story 2.2 declares
the whole sandbox key group in the same edit that adds the branch reading it, and this story asks for no
value to be set.

**Verification run.**
- `git ls-files sandbox/` — exactly `sandbox/README.md` and `sandbox/factory-sandbox.Dockerfile`.
- `grep -cE '^(COPY|ADD) ' sandbox/factory-sandbox.Dockerfile` — `0`.
- `grep -c 'latest' sandbox/factory-sandbox.Dockerfile` — `0`.
- `grep -E 'node:22-bookworm-slim|corepack enable|WORKDIR /workspace' sandbox/factory-sandbox.Dockerfile` —
  all three present.
- All five keys present in `sandbox/README.md`.
- `grep -nE '@public|@type|sensitive|required' sandbox/README.md` — no match; `latest` appears on exactly one
  line, the sentence forbidding it.
- `git diff --stat {baseline} -- src package.json package-lock.json tsconfig.json docker-compose.yml
  .env.schema .env.example AGENTS.md README.md ops 'docs/'` — no output.
- Added lines under `sandbox/` scanned for password / secret / token / api-key assignments, private-key
  headers and `ghp_` / `sk-` prefixes — no match. The only URL is the public GitHub CLI package host.
- `npm ci --no-audit --no-fund` in a worktree with no `node_modules/` — 0.
- `npm run check` — 0. Both path guards — 0 (a `.Dockerfile` and a `.md` are invisible to the `*.ts *.js
  *.mjs *.cjs` filter). `npm test` — 0, 18/18 passing.
- Fidelity check: `diff` of `docs/Self-hosting research.md` lines 96–117 against the created Dockerfile
  reports only the three lines that cannot belong to a real file — the opening ```` ```dockerfile ```` fence,
  the `# factory-sandbox.Dockerfile` filename comment (redundant now that the file is at that path), and the
  closing fence. Every instruction line is byte-identical.

**What was not verified, and cannot be here.** The image has never been built. Nothing on this host can build
or lint a Dockerfile — no engine, and no repo tooling that parses one — so `docker build` succeeding, `gh`
resolving from the third-party apt repository, and the `linux/arm64` platform flag matching the VM are all
unobserved. That is the whole content of `operator_actions:`. The tag history table is empty for the same
reason: a seeded row would assert a tag that does not exist.

**This pass's findings** — 36 findings from four layers: high 0, medium 15, low 16, false 4,
maybe-false 1. Grouped by root cause, fourteen entries were patched (at entry verdict: 6 medium, 8 low;
0 high), all of them in `sandbox/README.md`:
- `[medium]` The `FACTORY_SANDBOX_PROVIDER` section said `docker` "falls through to the local provider,
  so setting it early changes nothing". Checked against `src/mastra/index.ts:303-316`: `useLocalSandbox`
  is `=== 'local'` only, so `docker` behaves like unset and leaves the Platform → E2B → local chain
  live — the opposite of what the paragraph promised, and the exact off-host relocation Epic 2 exists to
  prevent. Rewritten: leave the key unset or `local` until the branch lands.
- `[medium]` Two places told the operator to point `FACTORY_SANDBOX_IMAGE` at the new tag while
  `operator_actions:` said not to; the key is undeclared and unread until Story 2.2. Both qualified with
  "once the Docker sandbox branch lands".
- `[medium]` The retag block wrote `FACTORY_SANDBOX_IMAGE=factory-sandbox:$TAG` into `.env`, which
  expands nothing — the same trap `ops/README.md` already documents for `$HOME`. Now says to write the
  tag out in full.
- `[medium]` "It is the only copy: nothing in `docs/` reproduces it" was false — `docs/` §2.1 still
  carries the identical fenced block. The sentence now names this file as the canonical artifact and
  §2.1 as a superseded narrative copy; the `docs/` side is deferred.
- `[medium]` The `.` build context was explained as a consequence of the `-f` path. They are independent
  arguments. Corrected, with the real cost stated: no `.dockerignore`, so the whole tree still transfers.
- `[medium]` Nothing stated prerequisites or failure modes, unlike the `ops/README.md` precedent, and
  `operator_actions:` presupposed an engine that Story 1.4 has not yet installed. Added a "Before you
  start" block, an "If the build fails" block with three named modes, and an explicit precondition item
  ahead of the operator list.
- `[low]` ×8: the "fit with headroom" arithmetic (3 × 10 + 2 = 32 exactly); the smoke test missing an
  architecture check, so an emulated `amd64` image passes it; a no-edit rebuild reusing the layer cache
  under a fresh date tag (`--pull` / `--no-cache`); rollback assuming the old image survives pruning; the
  capacity math never naming `MASTRACODE_MAX_SANDBOXES`; "what the image carries" omitting PEP 668 and
  the root user; a same-day rebuild silently re-pointing the tag; and a cited
  `factory-sandbox:2026-09-22` fallback for code that does not exist.

Rejected (4 false, 1 low) with reasons recorded per row: the missing `chmod go+r` on the keyring (twice —
the build's root shell runs under Docker's fixed 0022 umask, so the file is world-readable already), the
mid-review `status: in-review` snapshot, `epic-2-context.md` not being named by an acceptance criterion
(it is the workflow's own compiled context, produced before planning), and the intent auditor's
observation that the change's surface is repository text while the story's acceptance lives at a built
image — true, already stated by the spec, and the definition of an operator-parked story rather than a
defect.

**Deferred (4 new).** Item 1 — `docs/Self-hosting research.md` §2.1 still holds a verbatim unmarked copy
of the image plus build commands with an `-f` path that no longer resolves and a tag that will never be
built, and §2.2 restates the values `sandbox/README.md` now owns; `docs/` is read-only here and Story 5.3
(FR32) owns it. Second instance of open DW-20. Item 2 — no gate command can read a Dockerfile, so the
no-`COPY` / no-`latest` / `WORKDIR` invariants the acceptance criteria assert are unenforced after this
commit; the fix is three grep guards in `.bmad-loop/policy.toml`, which this story may not edit. Item 3
(unverified) — whether `/usr/share/keyrings` exists in `node:22-bookworm-slim`; if it does not, the
`curl -o` write fails at the operator's first build. Item 4 — the repo-root build context with no
`.dockerignore`; both candidate fixes need a decision this story cannot make (the epic pins the command's
`.`, and a root file is a closed-root-set call under AD-3).

**Follow-up review recommended: true.** Six `medium` entries were patched on a first pass. The specific
unverified risk is that every statement in `sandbox/README.md` — including the corrections this pass made
— is reasoned from reading source and documentation, never from running anything. The image has never
been built, `gh` resolving from the third-party apt repository for `arm64` and `--platform linux/arm64`
matching the VM are unobserved, and no command in the verify gate can see either committed file. If the
corrected provider paragraph or the new failure-mode guidance is wrong, nothing in this repository will
say so.

## Operator Confirmation

Confirmed 2026-09-23: the external actions this story owed were carried out.

- Precondition — Story 1.4's engine steps must already be done: `colima`, `docker` and `docker compose` installed, and the Colima VM provisioned. If they are not, run `ops/README.md`'s bring-up first; nothing below can work without a reachable daemon.
- Bring the engine up and point clients at it, in the shell used for every step below: `colima start` if it is not already running, then `export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"`. See `ops/README.md` for what that value must contain.
- Build the image from the repository root: `TAG=$(date +%F)` then `docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t "factory-sandbox:$TAG" .` The tag form is `factory-sandbox:YYYY-MM-DD` — never `latest`.
- Smoke-test it: `docker run --rm "factory-sandbox:$TAG" sh -c 'git --version && gh --version'` then `docker image inspect --format '{{.Architecture}}' "factory-sandbox:$TAG"`. Expected: a `git version …` line, then a `gh version …` line, then `arm64`. Both versions must print — either one missing means the image would fail at first use with `git-missing` / `gh-missing` — and anything other than `arm64` means every session would run under emulation.
- Record the tag actually built in the (currently empty) tag history table at the bottom of `sandbox/README.md` — one row, newest first: the tag, the build date, and `initial image` as the change. Do not record a row for an image that was not built.
- Report the result: the exact tag, whether the smoke test printed both versions, and the image size from `docker images factory-sandbox`. Do not set `FACTORY_SANDBOX_IMAGE` in `.env` yet — the key is not declared in `.env.schema` and nothing reads it until the Docker sandbox branch lands.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
