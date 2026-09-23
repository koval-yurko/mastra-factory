# Sandbox image

The operator-plane subject for the container image every agent session runs inside. This file is
normative for what each key under "Keys this subject owns" below must contain and how to obtain or
choose it, and for the commands that build, smoke-test and retag the image.

`.env.schema` is the list of keys. `ops/README.md` states what `DOCKER_HOST` must contain and how to
obtain it — export it before running any command below, because the build has to reach the Colima
engine. Neither is restated here.

`factory-sandbox.Dockerfile` in this directory is the image, and it is the canonical artifact — the one
file to edit and build. `docs/self-hosting-research.md` §2.1 says why the image carries `git` and `gh`
and references this directory by path rather than reproducing the Dockerfile.

## Keys this subject owns

The table below is the closed list of the keys this file owns, and this file is the only record
for what each must contain and how to choose it. The
three subject READMEs under `apps/`, `ops/README.md`, and `README.md` as the residual owner, claim
the rest; between the six tables every key `.env.schema` declares is claimed exactly once.

| Key | What the value must contain | Full record |
|---|---|---|
| `FACTORY_SANDBOX_PROVIDER` | which sandbox runs session commands | the `FACTORY_SANDBOX_PROVIDER` section below |
| `FACTORY_SANDBOX_IMAGE` | a date-stamped image tag that exists on this engine | the `FACTORY_SANDBOX_IMAGE` section below |
| `FACTORY_SANDBOX_MEMORY_GIB` | the per-session memory ceiling, in whole gibibytes | the `FACTORY_SANDBOX_MEMORY_GIB` section below |
| `FACTORY_SANDBOX_CPUS` | the per-session CPU ceiling, in whole cores | the `FACTORY_SANDBOX_CPUS` section below |
| `MASTRACODE_MAX_SANDBOXES` | how many session containers this process runs at once | the `MASTRACODE_MAX_SANDBOXES` section below |
| `MASTRACODE_SANDBOX_WORKDIR` | the checkout base inside a docker-provider container | the `MASTRACODE_SANDBOX_WORKDIR` section below |
| `MASTRACODE_LOCAL_SANDBOX_ROOT` | the checkout root on this host, for the local provider only | the `MASTRACODE_LOCAL_SANDBOX_ROOT` section below |
| `E2B_API_KEY` | must stay unset | the `E2B_API_KEY` section below |

`.env.schema` declares and validates every key in that table and is the only list of key names;
this file never
restates what it declares. Behaviour that is non-obvious rather than operator-facing lives in
`docs/self-hosting-research.md` §11 ("Environment variables — traps only"), which is referenced here
by path and never copied.

## Before you start

- A container engine installed and running, with `DOCKER_HOST` exported in the shell you use for every
  command below. `ops/README.md` is the procedure and owns that value. `docker info` exiting 0 is the
  precondition for everything here; nothing on this page can work without it.
- Enough free disk in the VM. The build pulls a base image and two `apt-get` layers.

## What the image carries

`node:22-bookworm-slim` plus, in one layer, `git`, `ca-certificates`, `curl`, `gnupg`,
`openssh-client`, `less` and the GitHub CLI (`gh`, from `https://cli.github.com/packages` under its own
`signed-by` keyring), and in a second layer a generic toolchain: `build-essential`, `python3`,
`python3-pip`, `python3-venv`, `ripgrep`, `jq`, `unzip` — note that on bookworm `python3-pip` is an
externally-managed environment (PEP 668), so a plain `pip install` refuses and `python3 -m venv` is the
path a session must take. `corepack enable` runs last, so `npm`, `pnpm` and `yarn` all resolve. The
working directory is `/workspace`, the image defines no user so session commands run as root, and the
container's command is `sleep infinity`, because a session's container is long-lived and driven by
`docker exec`.

`git` and `gh` are there because the repository is cloned **inside** the session's container, never onto
this host — a session that cannot find either one fails at first use.

The image copies no application code, and it is deliberately not specific to any target repository. A
package some repository needs but the image lacks shows up as a failing setup command inside that
session: add it to the toolchain layer, rebuild under a new date tag, and move
`FACTORY_SANDBOX_IMAGE` forward.

## `FACTORY_SANDBOX_PROVIDER`

**What the value must contain.** The literal string `docker` to run sessions in the per-session
containers this image serves, or `local` to run them as the server process on this host instead.

**How to choose it.** `docker` is the value this host is built for; `local` is a diagnostic fallback
that gives up isolation. `docker` is checked ahead of every cloud provider, so it keeps work on this
host structurally: a stray `MASTRA_PROJECT_ID`, `MASTRA_ENVIRONMENT_ID` or `E2B_API_KEY` left in `.env`
cannot relocate a session off this machine while it is set. Anything else — unset, `DOCKER`, `podman` —
is not a selection: `src/mastra/config/sandbox.ts` falls through to automatic selection, meaning Mastra
Platform first, then direct E2B, then local — the off-host relocation the Docker sandbox replaces. The
value is matched after trimming, so surrounding spaces are harmless, but the case must be exact.

## `FACTORY_SANDBOX_IMAGE`

**What the value must contain.** A date-stamped image reference of the form
`factory-sandbox:YYYY-MM-DD`, naming an image that exists in the local image store of the engine
`DOCKER_HOST` points at. Never `latest` — a moving tag makes a bad image impossible to roll back from.

**How to obtain it.** Build the image (below) and use the tag you built. The tag history table at the
bottom of this file records which ones exist. There is no default and none is invented: with
`FACTORY_SANDBOX_PROVIDER=docker` and this key blank, the first session refuses to start and the error
names this key. That refusal is deliberate — the sandbox package's own default is `node:22-slim`, which
carries neither `git` nor `gh`, so falling back to it would trade a named error for a session that only
fails once the agent reaches for git.

## `FACTORY_SANDBOX_MEMORY_GIB`

**What the value must contain.** A whole number of gibibytes — the hard memory ceiling for one
session's container. It is a cap, not a reservation: exceeding it OOM-kills that container instead of
the host. Whole gibibytes only — there is no way to express a fraction of one here.

**How to choose it.** `10` on this host. The Colima VM has 32 GiB, Postgres takes roughly 2 GiB, and
three concurrent sandboxes at 10 GiB each come to 32 exactly — a deliberate full commit, not headroom.
That is safe only because caps are ceilings and not reservations: three sandboxes simultaneously at
their ceiling would leave the VM itself nothing.

The three in that arithmetic is the concurrency this host is sized for, and `MASTRACODE_MAX_SANDBOXES`
below is what holds sessions to it — a fourth concurrent session is refused rather than given its own
10 GiB ceiling. The two numbers are one decision: raising this ceiling without lowering that count, or
raising that count without growing the VM, oversubscribes the host in exactly the way the arithmetic
above rules out. Raise this number only by growing the VM.

## `FACTORY_SANDBOX_CPUS`

**What the value must contain.** A whole number of cores — the hard CPU ceiling for one session's
container, applied as a CFS quota against the 100 ms period the server pins alongside it. Whole cores
only — a fraction of a core cannot be expressed here.

**How to choose it.** `4` on this host. The Colima VM has 12 cores and Postgres takes roughly one, so
three sandboxes at 4 cores each is a mild, deliberate overcommit. The three is the same concurrency
`MASTRACODE_MAX_SANDBOXES` holds sessions to. Overcommitting CPU is the benign case: caps are ceilings,
contending containers are throttled rather than killed, and the memory number is the one that actually
binds — which is why the concurrency count is chosen against memory and not against cores.

## `MASTRACODE_MAX_SANDBOXES`

**What the value must contain.** A whole number of concurrent docker-provider session containers — the
most this server process will run at once. Anything that is not a run of digits — `-1`, `2.5`, `1e3`,
`abc` — stops `npm start` before the server boots, naming this key, rather than being quietly ignored
or rounded into something plausible. Blank and `0` are the two values that reach the code, and both
fall back to the default, `3`. There is no value meaning "unlimited" and no way to turn the cap off.
The key only applies to `FACTORY_SANDBOX_PROVIDER=docker`; `local` and the cloud providers are
uncapped, because the number is sized against this host's memory, which they do not consume.

**How to choose it.** `3` on this host, from the same arithmetic as `FACTORY_SANDBOX_MEMORY_GIB` above:
32 GiB in the VM, roughly 2 for Postgres, 10 per session container. Change it only together with that
ceiling — the pair has to keep multiplying out to what the VM has. Raising it is the supported move
when the host has memory for another container; there is nothing to lower on the per-container side
that buys concurrency for free, because those are ceilings a busy session will actually reach.

What the cap does when it binds: the session that would be the fourth is refused before any container
is created, with an error naming this key and its current value. Nothing is relocated — a refused
session does not fall back to running on this host or on a cloud provider. A session that already has
a container is reattaching, not claiming a new slot, so a resumed session is admitted even at the cap.

What frees a slot is narrower than it looks. Closing a session's view in the browser does nothing —
only two things release a sandbox: the session's work item reaching a terminal stage (the server
retires the session), and deleting the session outright. Neither is instant: the slot is released when
the container stop actually completes, which takes as long as stopping that container takes. And a
slot whose sandbox failed to start, or failed to tear down, is not released at all — those end up in
an `error` state that deliberately keeps its slot, because a container may well still be running under
it, so only restarting the server clears them.

The count is **per server process**, and that is the one place it is inexact. Session containers have
no idle teardown and a resumed session finds its container by asking the engine, so containers outlive
a server restart while the count does not — restart with three containers still up and three more
sessions are admissible, for six containers on a host sized for three. After a restart that left
containers behind, check `docker ps --filter label=mastra.sandbox=true` and remove the ones whose
sessions are finished.

## `MASTRACODE_SANDBOX_WORKDIR`

**What the value must contain.** An absolute path **inside** the container, under which each
repository gets one directory named after the repository alone — `/workspace/mastra-factory`, not
`/workspace/<owner>/mastra-factory`. The owner is not part of the path, so two repositories with the
same name under different owners would collide here. `/workspace`.

**How to choose it.** Keep it equal to the `WORKDIR` in `factory-sandbox.Dockerfile`. They are two
statements of the same directory and there is no reason to move either; if one ever changes, change
both in the same commit. This path never refers to anything on this host.

## `MASTRACODE_LOCAL_SANDBOX_ROOT`

**What the value must contain.** An absolute path **on this host** under which the local provider
checks repositories out, one directory per repository. Unset it defaults to
`~/.mastracode/web/sandboxes`. This is the one key on this page that names a directory on this
machine rather than inside a container.

**How to choose it.** Leave it unset. It is read only when `FACTORY_SANDBOX_PROVIDER=local`, which
this host does not run outside a diagnostic — and setting it does not make the local provider safer:
the checkout still runs as the server process on the shared host filesystem, with no isolation
between sessions, wherever this points. If a diagnostic does need the local provider, point this
somewhere outside this repository, because the checkout and its `node_modules` would otherwise land
inside the tree the Factory Server is running from.

## `E2B_API_KEY`

**What the value must contain.** Nothing — it must stay **unset** on this deployment.

**How to choose it.** It is a credential for E2B's cloud VMs, and a set value is not a selection you
make here: it is reached only when `FACTORY_SANDBOX_PROVIDER` is neither `docker` nor `local` and the
Mastra Platform variables are incomplete, and then it silently runs sessions on someone else's
machine. That is the off-host relocation this whole subject exists to replace. With
`FACTORY_SANDBOX_PROVIDER=docker` the docker branch is evaluated first, so a stray value here cannot
move work off this host — a structural guarantee rather than a matter of keeping `.env` tidy, and the
reason the key is listed at all rather than left out and forgotten.

## Ceilings with no key

Two more limits apply to every session container and neither is settable from `.env` — the server fixes
both, so changing one is a code edit:

- **Process limit: 4096.** The maximum number of processes a session container may have at once. A
  fork-bomb or a runaway parallel build hits this as "resource temporarily unavailable" rather than
  taking the VM down. The container runs an init process that reaps exited children, so processes
  abandoned by a killed command do not accumulate against it.
- **Command timeout: 15 minutes.** The default ceiling on a single command. A dependency install or a
  full test suite that is killed at almost exactly 15 minutes has hit this and not a hang — that is the
  only symptom it produces, and the number appears nowhere in the session's own output.

Swap is also disabled: the swap ceiling is pinned equal to the memory ceiling, so
`FACTORY_SANDBOX_MEMORY_GIB` is the container's whole memory budget. Left unset, Docker would allow a
further equal amount of swap and the cap would be half of what it claims.

Every ceiling on this page is fixed when a session's container is **created**, and a session reattaches
to its existing container rather than replacing it. So editing `FACTORY_SANDBOX_MEMORY_GIB` or
`FACTORY_SANDBOX_CPUS` and restarting the server changes nothing for a session that already has a
container — it keeps the numbers it was created with, and the server logs a warning saying the
requested values cannot be applied. The new ceilings reach only sessions whose containers are created
after the restart, the same way a retag reaches only new containers. To move an existing session onto
new numbers its container has to be removed, which ends that session's state; there is no in-place
resize.

## If a session fails to start

- **The error names `FACTORY_SANDBOX_IMAGE`.** The key is unset or blank while
  `FACTORY_SANDBOX_PROVIDER=docker`. There is no default to fall back to; set it to a tag from the
  history table below and restart.
- **The error names `MASTRACODE_MAX_SANDBOXES`.** This server process is already holding sandboxes for
  as many sessions as that key allows, so this one was refused before a container was created —
  nothing is wrong with the image or the engine. Free a slot by letting a running session's work item
  reach a terminal stage or by deleting one of those sessions (closing the view does not), and expect
  the slot back when that container's stop completes rather than at once; or raise the key and restart
  if this host has memory for another container (see the section above). Restarting also clears slots
  held by sandboxes whose start or teardown failed, which nothing else releases. Note the count is per
  server process: if the server was restarted while session containers were running, the ones it does
  not know about are still holding memory even though they are not counted —
  `docker ps --filter label=mastra.sandbox=true` is what the engine actually has.
- **A registry error — "pull access denied", "repository does not exist", or a timeout reaching
  `docker.io`.** This is the misleading one. When the tag is not in the local image store the sandbox
  tries to **pull** it, and `factory-sandbox:YYYY-MM-DD` exists on no registry, so the failure is
  reported against Docker Hub and names no local cause. It means the tag is missing locally — usually
  pruned, or never built on this engine, or built against a different `DOCKER_HOST` than the server is
  using. Confirm with `docker images factory-sandbox`, then either rebuild that tag or point
  `FACTORY_SANDBOX_IMAGE` at one the list actually shows.
- **A connection error reaching the daemon.** The engine is not running, or the server process does not
  have `DOCKER_HOST` in its environment — note that the server is a different process from your shell,
  so exporting it in a terminal does not give it to a `launchd`-started server. `ops/README.md` owns
  that value and the bring-up procedure.

## Build

Run from the repository root, in a shell where `DOCKER_HOST` is exported.

```bash
TAG=$(date +%F)                      # e.g. 2026-09-23 — the form is factory-sandbox:YYYY-MM-DD
docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t "factory-sandbox:$TAG" .
```

`--platform linux/arm64` matches the Apple-silicon VM; an image built for another architecture runs
under emulation and is slow enough to look like a hang.

The trailing `.` is the build context, and it is the repository root because that is the command this
subject pins — `-f` and the context are independent arguments, so the context is a choice, not a
consequence of the `-f` path. The image copies nothing out of it. There is no `.dockerignore`, so the
whole tree — `node_modules/` and `.env` included — is still transferred to the engine before the first
instruction runs, which is why the first build spends a visible stretch on "transferring context".

## Smoke test

```bash
docker run --rm "factory-sandbox:$TAG" sh -c 'git --version && gh --version'
docker image inspect --format '{{.Architecture}}' "factory-sandbox:$TAG"
```

Expected: a `git version …` line, then `gh version …` — both must print — and then `arm64`. The
architecture line is the half the version checks cannot catch: an image built for `amd64` answers
`git --version` perfectly well and only then runs every session under emulation. The equivalent pinned
form is `docker run --rm factory-sandbox:<YYYY-MM-DD> sh -c 'git --version && gh --version'`, the same
command with the date written out.

Record the tag in the table below once this passes, then point `FACTORY_SANDBOX_IMAGE` at it and
restart the server. Sessions started after the restart are created from that tag.

## If the build fails

- **`docker build` cannot connect to the daemon.** The engine is not running or `DOCKER_HOST` is not
  exported in this shell. Neither is fixed here: see `ops/README.md`.
- **The `gh` layer fails.** Two causes. The `curl` fetching `githubcli-archive-keyring.gpg` needs
  `https://cli.github.com` to be reachable from inside the build — a proxy or a blocked egress stops it
  there, and the layer fails before any `gh` package is seen. Or the write to
  `/usr/share/keyrings/githubcli-archive-keyring.gpg` fails because the directory does not exist in the
  base image, which a future base-image change could cause; the fix is an explicit `mkdir -p` ahead of
  the `curl` in that same chain. A failure at `apt-get install gh` *after* both of those means the
  source list was written but the repository did not resolve.
- **The build is killed part-way, or `apt-get` fails writing.** The VM is out of disk. Reclaim with
  `docker image prune` and `docker system df`, or grow the VM — checkouts plus `node_modules` in
  long-lived session containers are what fill it over months.

## Retag and rollback

There is no in-place update. Extending the toolchain means editing `factory-sandbox.Dockerfile`,
building again on a new date, smoke-testing it, and moving `FACTORY_SANDBOX_IMAGE` forward:

```bash
TAG=$(date +%F)
docker build --platform linux/arm64 -f sandbox/factory-sandbox.Dockerfile -t "factory-sandbox:$TAG" .
docker run --rm "factory-sandbox:$TAG" sh -c 'git --version && gh --version'
docker image inspect --format '{{.Architecture}}' "factory-sandbox:$TAG"
# then set FACTORY_SANDBOX_IMAGE in .env with the tag written out in full —
# factory-sandbox:2026-09-23, not "$TAG" — because nothing expands a shell variable
# in .env; then restart the server
```

A rebuild with no Dockerfile edit is not automatically a fresh image: the layer cache will reuse
everything and `FROM node:22-bookworm-slim` is itself a moving tag, so add `--pull` to pick up a new
base and `--no-cache` when you want every layer genuinely rebuilt — otherwise the new date tag asserts
a freshness the tag history then records.

Two tags on the same calendar day are one tag: a second build re-points `factory-sandbox:YYYY-MM-DD`
and leaves the first image dangling, so a rollback to that date returns the image you are rolling back
*from*. To keep both, suffix the second — `factory-sandbox:2026-09-23b`.

Rolling back is the same edit in reverse: point `FACTORY_SANDBOX_IMAGE` at the previous row's tag and
restart. That works only while the older image is still in the local store, and nothing guarantees it —
`docker image prune -a` removes any image no container references, which is exactly the shape of a
known-good rollback target. Never prune the tag in use or the last known-good one. Keep at least one
known-good tag; existing session containers keep running on the image they were created from, so a
rollback takes effect for sessions started after it.

List what the engine actually holds with:

```bash
docker images factory-sandbox
```

## Tag history

Newest first. A tag earns a row once its build has passed the smoke test above; the tag in the top row
is normally the one `FACTORY_SANDBOX_IMAGE` points at, and the rows under it are the rollback targets.

| Tag                        | Built                | Change        |
|----------------------------|----------------------|---------------|
| factory-sandbox:2026-09-23 | 2026-09-23T12:34:56Z | Initial build |
