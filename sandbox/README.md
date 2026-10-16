# Sandbox images

The operator-plane subject for the containers that agent sessions run in. This file is normative for
the files in this folder, for what each key under "Keys this subject owns" must contain, for the
project secrets in AWS SSM Parameter Store, and for how images are built, checked and rolled back.

`src/mastra/config/env.ts` (`envSpecs`) is the list of keys. `ops/README.md` states what `DOCKER_HOST`
must contain and how to obtain it. Export it before you run a command below, because the build must
reach the Colima engine. Neither is restated here.

`docs/self-hosting-research.md` §2.1 says why every image carries `git` and `gh`.

## Keys this subject owns

The table below is the closed list of the keys this file owns. The three subject READMEs under
`apps/`, `ops/README.md`, and `README.md` as the residual owner, claim the rest; between the six tables
every key `envSpecs` in `src/mastra/config/env.ts` declares is claimed exactly once.

| Key | What the value must contain | Full record |
|---|---|---|
| `FACTORY_SANDBOX_PROVIDER` | which sandbox runs session commands | the `FACTORY_SANDBOX_PROVIDER` section below |
| `MASTRACODE_MAX_SANDBOXES` | how many session containers this process runs at once | the `MASTRACODE_MAX_SANDBOXES` section below |
| `MASTRACODE_SANDBOX_WORKDIR` | the checkout base inside a docker-provider container | the `MASTRACODE_SANDBOX_WORKDIR` section below |
| `MASTRACODE_LOCAL_SANDBOX_ROOT` | the checkout root on this host, for the local provider only | the `MASTRACODE_LOCAL_SANDBOX_ROOT` section below |
| `E2B_API_KEY` | must stay unset | the `E2B_API_KEY` section below |

Images, ceilings and credentials are **not** keys. They are in the files of this folder and in SSM, as
the sections below describe. `envSpecs` declares and validates every key in that table and is the only
list of key names. Behaviour that is non-obvious rather than operator-facing lives in
`docs/self-hosting-research.md` §11 ("Environment variables — traps only").

## The files in this folder

```
sandbox/
├── factory-sandbox.Dockerfile      the shared image
├── sandbox.json                    the shared ceilings: memoryGib, cpus
└── projects/<owner>/<name>/        one folder per repository that needs something different
    ├── sandbox.json                its own ceilings and secrets — required
    └── Dockerfile                  its own image — optional; this folder is its build context
```

The folder name is the repository slug that Factory reports for a session (`owner/name`). Slugs are
compared in lower case. A repository with no folder here runs on the shared image with the shared
ceilings and gets no secrets.

`sandbox/sandbox.json` must hold both fields:

```json
{ "memoryGib": 1, "cpus": 0.5 }
```

A project's `sandbox.json` may hold `memoryGib`, `cpus` and `secrets`. Each field is optional. A
missing field takes the shared value. `{}` is valid. An unknown field is an error, so a typo does not
pass silently. Example:

```json
{ "memoryGib": 4, "cpus": 2, "secrets": ["EXPO_TOKEN", "VERCEL_TOKEN"] }
```

`npm run build` reads these files, checks them and writes the result into the build output as
`sandbox-catalog.json` (`src/build/sandbox-images.ts`). The server reads that file from its cwd, which
is the output folder. Thus a release carries its own catalog, and a rollback restores the catalog
that the release was built with. A bad file fails the build, so it cannot reach a release.

## Ceilings

`memoryGib` is the hard memory ceiling of one session container, in gibibytes. `cpus` is the hard CPU
ceiling, in cores, applied as a CFS quota against a 100 ms period that the server pins: `0.5` is 50 ms
of every 100 ms. Both may have up to 2 decimal places. The least values are `0.25` GiB and `0.01`
cores. They are ceilings, not reservations: a container that goes above its memory ceiling is OOM-killed, not the
host. Swap is disabled (the swap ceiling equals the memory ceiling), so `memoryGib` is the whole memory
budget of the container.

The largest values are **10** GiB and **6** cores. The Colima VM has 12 GiB and 6 CPUs
(`colima list`). 10 GiB is the share that sandboxes get after Postgres and the VM itself take about
2 GiB. 6 cores is every core of the VM. A container above them cannot run even as the only session. These bounds are not settings: they are `HOST_MAX_MEMORY_GIB` and
`HOST_MAX_CPUS` in `src/mastra/config/sandbox-catalog.ts`. To raise them, grow the VM and change the
constants in the same commit.

**How to choose them.** The shared values are `1` GiB and `0.5` cores. 10 sessions at 1 GiB use the
10 GiB budget exactly, and 10 sessions at 0.5 cores use 5 of the 6 cores. Give a project more only when
its sessions need it, for example a large install or test suite. Each running container counts against
the same VM, so a project at 4 GiB takes the room of 4 shared containers. A CPU overcommit is safe: a
busy container is throttled, not killed. A memory overcommit is not: the VM kills containers.

Two more limits apply to every container and are not settable:

- **Process limit: 4096.** A fork-bomb or a runaway parallel build gets "resource temporarily
  unavailable" and the VM stays up. An init process reaps exited children.
- **Command timeout: 15 minutes.** A dependency install or a test suite that stops at almost exactly 15
  minutes hit this limit. It is not a hang.

Every ceiling is fixed when a session's container is **created**. A session reattaches to its existing
container. Thus a new ceiling reaches only sessions whose containers are created after the deploy.

## Project secrets

A project's containers get exactly the secrets its `sandbox.json` lists, under the same names. Nothing
else from the host reaches a container, and no secret goes to every session.

Each secret is an AWS SSM Parameter Store parameter at:

```
<FACTORY_SSM_PARAMETER_PATH>/projects/<owner>/<name>/<NAME>
```

For example `/mastra-factory/projects/koval-yurko/eleven-labs-english-agent/VERCEL_TOKEN`. Use the
`SecureString` type. Write the slug in lower case. The server loads this subtree at boot, beside the
other parameters, with the same credentials (`README.md` owns them). There is no `.env` override for a
project secret, and the `parameter_store` agent tool does not list or read this subtree.

**Rules:**

- Only SSM. Without `FACTORY_SSM_PARAMETER_PATH`, a session of a project that lists secrets is refused.
- A listed secret with no value refuses the session before a container is created. The error names the
  parameter. An agent whose CLI is not logged in fails later and far from the cause, so it does not
  start.
- A parameter that `sandbox.json` does not list is not forwarded.
- The server reads SSM at boot. After you change a parameter, restart the server.
- A secret is applied when the container is **created**. An existing session keeps its old value until
  its container is removed.

**What a secret may be.** Anything in the container can read it: the agent, and every script in a
repository it clones. Use tokens scoped to that one project. Prefer a robot account, or an account that
only this deployment uses. Treat a token as given to the agent, not kept from it.

The secrets of `koval-yurko/eleven-labs-english-agent`:

| Name | What it is | How to obtain it |
|---|---|---|
| `EXPO_TOKEN` | Expo access token; the EAS CLI logs in with it (`eas whoami`) | expo.dev → account settings → Access tokens |
| `VERCEL_TOKEN` | Vercel access token; the Vercel CLI logs in with it. It must reach every project below | vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | the id of the Vercel team (or user) that owns the projects | team Settings → General → Team ID |
| `VERCEL_PROJECT_API_ID` | the id of the API project | project Settings → General → Project ID |

The repository has several Vercel projects, and one CLI works with all of them. Thus the container
never holds `VERCEL_PROJECT_ID`: with `VERCEL_ORG_ID`, the CLI would work only with that one project.
The agent sets `VERCEL_PROJECT_ID` for one command (a skill in the repository's `.claude/skills/`). A project command
without it stops with the CLI error "You specified `VERCEL_ORG_ID` but you forgot to specify
`VERCEL_PROJECT_ID`", so it cannot reach the wrong project; team commands (`vercel project ls`) work
without it. Do not use the name `VERCEL_TEAM_ID`: the CLI reads it too and adds it to every API call.

To add another project, add a parameter `VERCEL_PROJECT_<NAME>_ID` (for example
`VERCEL_PROJECT_WEB_ID`), add the name to `secrets` in that project's `sandbox.json`, and restart the
server after the deploy. All projects must be in the `VERCEL_ORG_ID` team, and the token must reach
them; a project in another team needs its own pair of names.

## Images

**The shared image** (`factory-sandbox.Dockerfile`) is `node:22-bookworm-slim` plus `git`,
`ca-certificates`, `curl`, `gnupg`, `openssh-client`, `less` and the GitHub CLI (`gh`, from
`https://cli.github.com/packages` under its own `signed-by` keyring). A second layer adds a generic
toolchain: `build-essential`, `python3`, `python3-pip`, `python3-venv`, `ripgrep`, `jq`, `unzip`. On
bookworm, `python3-pip` is an externally-managed environment (PEP 668), so a session must use
`python3 -m venv`. `corepack enable` makes `npm`, `pnpm` and `yarn` resolve. It is built with an empty
build context and copies nothing.

**A project image** (`projects/<owner>/<name>/Dockerfile`) is written from scratch for that repository.
It does not use `FROM` with the shared image, so it holds only the tools its sessions use. Its build
context is its own folder, so a `COPY` can reach only the files in that folder. The image for
`koval-yurko/eleven-labs-english-agent` adds the EAS CLI (`eas-cli`) and the Vercel CLI, each at a
pinned version. A skill that tells the agent how to use a project's tools belongs in that
repository's `.claude/skills/`: a Factory session reads it from the clone once the container runs.

**The session contract.** Every image must have these. The image pipeline checks them on the finished
image and removes an image that fails:

- `git` and `gh` — the repository is cloned **inside** the container, and pull requests are opened from it;
- `node` and `corepack` — a checkout picks its own package manager;
- `WORKDIR /workspace` — the clone path; see `MASTRACODE_SANDBOX_WORKDIR`;
- a `CMD` or `ENTRYPOINT` that keeps running, conventionally `sleep infinity` — the runtime gives no
  command, so an image with nothing to run stops before the agent types anything;
- the `arm64` architecture — another architecture runs under emulation, slowly enough to look like a hang.

Images define no user, so session commands run as root.

**Rules for a Dockerfile.** Each `FROM` must name its base by digest (`image@sha256:…`), or an earlier
stage. Do not put a credential in `ENV`, `ARG` or a file: secrets arrive from SSM when the container is
created. The build refuses an `.env` file or a symbolic link in a build context.

## Tags

Every tag has the form `YYYY-MM-DD-<hash>`:

- the shared image is `factory-sandbox:<date>-<hash>`;
- a project image is `factory-sandbox/<owner>/<name>:<date>-<hash>`.

`<hash>` is the first 12 hex digits of a SHA-256 over the image inputs: the Dockerfile and every file of
the build context, without `sandbox.json`. `<date>` is the commit date of the last commit that touched
those inputs. Thus the same commit gives the same tags on every machine. `npm run build` writes the tags
into the catalog, and the image pipeline builds them, and the two steps do not need to talk.

Results:

- A change to a Dockerfile or to a file in a build context gives a new tag, and the pipeline builds it.
- A change to `sandbox.json` only (ceilings, secrets) builds nothing.
- Without a change, nothing is built. A tag never moves to another image.
- To take a base-image update, change the digest in `FROM`. To rebuild with no other change, edit the
  Dockerfile (for example, a version).
- Files that git does not track yet have no commit date. Then the date is today (UTC), so a local tag
  can differ from the tag after the commit.

## The image pipeline

`.github/workflows/sandbox-images.yml` builds every tag that the commit names and that the engine does
not have. `deploy.yml` calls it as its first job on each push to `main`, so a release never names an
image that is not built. You can also run it by hand: Actions → sandbox-images → Run workflow. The
runner's job-started hook (`actions-runner/hooks/job-started.sh`) accepts this workflow only from `main`.

By hand, on this host, from the repository root:

```bash
node src/build/sandbox-images.ts plan                      # every tag, and whether the engine has it
npm run sandbox:build                                      # build every missing tag
npm run sandbox:build -- koval-yurko/eleven-labs-english-agent   # one project only
```

Each build adds these labels: `factory.sandbox.inputs` (the hash), `factory.sandbox.slug` and
`org.opencontainers.image.revision` (the commit).

## The image check at deploy

When `FACTORY_SANDBOX_PROVIDER=docker`, `ops/release-lib.sh` checks every tag in the release's
`sandbox-catalog.json` before it activates the release. This includes a deploy, a deploy of a stored
release from GitHub, and `ops/rollback.sh`. A missing tag stops the activation and names the tag. A
release built before the catalog existed has none, and is not checked.

## Rollback

A release rollback is a sandbox rollback: the older release carries its older catalog and tags. It works
only while the older images are still on the engine.

**Warning:** do not delete an image that a stored release names. `docker image prune -a` removes every
image that no container uses, which includes the rollback targets. To see which tags the stored
releases need:

```bash
jq -r '.default.image, (.projects[].image // empty)' releases/*/output/sandbox-catalog.json | sort -u
docker images 'factory-sandbox*'
```

Existing session containers keep the image they were created from. A rollback reaches sessions whose
containers are created after it.

## `FACTORY_SANDBOX_PROVIDER`

**What the value must contain.** The literal string `docker` to run sessions in per-session containers,
or `local` to run them as the server process on this host.

**How to choose it.** `docker` is the value this host is built for; `local` is a diagnostic fallback
that gives up isolation. `docker` is checked ahead of every cloud provider, so it keeps work on this
host structurally: a stray `MASTRA_PROJECT_ID`, `MASTRA_ENVIRONMENT_ID` or `E2B_API_KEY` left in `.env`
cannot move a session off this machine while it is set. Anything else — unset, `DOCKER`, `podman` — is
not a selection: `src/mastra/config/sandbox.ts` falls through to automatic selection, meaning Mastra
Platform first, then direct E2B, then local. The value is matched after trimming, but the case must be
exact.

## `MASTRACODE_MAX_SANDBOXES`

**What the value must contain.** A whole number of concurrent docker-provider session containers — the
most this server process runs at once. Anything that is not a run of digits stops `npm start` before
the server boots, naming this key. Blank and `0` fall back to the default, `3`. There is no value for
"unlimited". The key applies only to `FACTORY_SANDBOX_PROVIDER=docker`.

**How to choose it.** `10` on this host, chosen on 2026-10-11 for Slack-driven parallel sessions. 10
containers at the shared 1 GiB ceiling use the 10 GiB budget exactly. A project with a higher
`memoryGib` makes this an overcommit: when several busy sessions run at once, the VM kills containers,
and a killed container loses its session state. If that happens, lower this key, lower the project
ceilings, or grow the VM.

When the cap binds, the next session is refused before a container is created, with an error that
names this key and its value. Nothing is relocated. A session that already has a container is
reattaching and is admitted even at the cap.

Only 2 things free a slot: the session's work item reaches a terminal stage, or the session is deleted.
Closing the view in the browser does nothing. The slot is released when the container stop completes.
A sandbox whose start or teardown failed keeps its slot (state `error`) until the server restarts,
because a container may still run under it.

The count is **per server process**. Containers outlive a server restart, but the count does not. After
a restart that left containers behind, run `docker ps --filter label=mastra.sandbox=true` and remove the
ones whose sessions are finished.

## `MASTRACODE_SANDBOX_WORKDIR`

**What the value must contain.** An absolute path **inside** the container. Each repository gets one
directory under it, named after the repository alone — `/workspace/mastra-factory`, not
`/workspace/<owner>/mastra-factory`. Two repositories with the same name under different owners collide
here. `/workspace`.

**How to choose it.** Keep it `/workspace`. The image pipeline checks that every image has
`WORKDIR /workspace`; if you ever change one, change all images, the check in
`src/build/sandbox-images.ts` and this key in the same commit. This path never refers to this host.

## `MASTRACODE_LOCAL_SANDBOX_ROOT`

**What the value must contain.** An absolute path **on this host** under which the local provider checks
repositories out, one directory per repository. Unset, it defaults to `~/.mastracode/web/sandboxes`.

**How to choose it.** Leave it unset. It is read only when `FACTORY_SANDBOX_PROVIDER=local`, which this
host does not run outside a diagnostic. It does not make the local provider safer: the checkout still
runs as the server process on the shared host filesystem. For a diagnostic, point it outside this
repository, because the checkout and its `node_modules` would otherwise land inside the tree the server
runs from.

## `E2B_API_KEY`

**What the value must contain.** Nothing — it must stay **unset** on this deployment.

**How to choose it.** It is a credential for E2B's cloud VMs. It is reached only when
`FACTORY_SANDBOX_PROVIDER` is neither `docker` nor `local` and the Mastra Platform variables are
incomplete, and then it silently runs sessions on someone else's machine. With
`FACTORY_SANDBOX_PROVIDER=docker` the docker branch is evaluated first, so a stray value cannot move work
off this host.

## If a session fails to start

- **The error names `sandbox-catalog.json`.** The server did not start from a build. `npm run build`
  writes the file into the build output; `npm run start:release` and `npm run start` run from an output
  folder. `npm run dev` does not run from a build, so it cannot use the docker sandbox.
- **The error says a project "lists the sandbox secret(s)".** A listed secret has no value in SSM, or
  `FACTORY_SSM_PARAMETER_PATH` is not set. Create the parameter that the error names and restart the
  server. Values are never printed.
- **The error names `MASTRACODE_MAX_SANDBOXES`.** This process already holds as many sandboxes as that
  key allows. See the section above.
- **A registry error — "pull access denied", "repository does not exist", or a timeout reaching
  `docker.io`.** The tag is not on this engine, so Docker tried to pull it from a registry where it does
  not exist. The deploy check normally stops this. Run `node src/build/sandbox-images.ts plan` from a
  checkout of the deployed commit, then `npm run sandbox:build`. Also check that the server uses the
  same `DOCKER_HOST` as your shell.
- **A connection error reaching the daemon.** The engine is not running, or the server process does not
  have `DOCKER_HOST`. The server is a different process from your shell. `ops/README.md` owns that value.

## If a build fails

- **The plan fails before any build.** A file in this folder is invalid, and the error names it. The
  same check runs in `npm run build`.
- **`docker build` cannot connect to the daemon.** The engine is not running or `DOCKER_HOST` is not
  exported. See `ops/README.md`.
- **The `gh` layer fails.** The `curl` of `githubcli-archive-keyring.gpg` needs `https://cli.github.com`
  from inside the build. Or `/usr/share/keyrings/` does not exist in a new base image; add `mkdir -p`
  before the `curl`. A failure at `apt-get install gh` after both means the source list did not resolve.
- **"failed its smoke test and was removed".** The image breaks the session contract above. The message
  says which part.
- **The build stops part-way, or `apt-get` fails to write.** The VM is out of disk. Check
  `docker system df`. Remove only images that no stored release names (see Rollback), or grow the VM.

## Moving from the old keys

Before this change, `FACTORY_SANDBOX_IMAGE`, `FACTORY_SANDBOX_MEMORY_GIB`, `FACTORY_SANDBOX_CPUS` and a
global `EXPO_TOKEN` configured every container. The server does not read them now.

1. Create the 4 parameters in the table under "Project secrets", under
   `projects/koval-yurko/eleven-labs-english-agent/`.
2. Push to `main`. The pipeline builds the images, and the deploy checks them before activation.
3. Keep the old keys in `.env` and the old `EXPO_TOKEN` parameter until no stored release is older than
   this change. A rollback to such a release still reads them. Then remove them.

**Warning:** do step 1 before step 2. If you do not, every session of that project is refused after the
deploy.
