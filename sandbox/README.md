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

`projects/<owner>/<name>/` under this directory holds the exceptions: one Dockerfile and one
`sandbox.json` for each repository that needs a toolchain, a ceiling or a credential the others should
not carry. The base image stays canonical for the repositories that need nothing special. A project
Dockerfile is written from scratch on a pinned public base and does not extend the base image: inheriting
it would drag in every tool that image carries, including ones that project has no use for, and would make
the two builds order-dependent. The `Per-project sandboxes` section below is the record for that
directory; it owns no environment key of its own.

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
| `EXPO_TOKEN` | an Expo access token for the EAS CLI inside session containers, or blank | the `EXPO_TOKEN` section below |
| `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN` | a Vercel API token for that one repository, or blank | the `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN` section below |
| `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_ORG_ID` | the Vercel team that token belongs to, or blank | the `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_ORG_ID` section below |
| `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_PROJECT_ID` | the Vercel project inside that team, or blank | the `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_PROJECT_ID` section below |

`.env.schema` declares and validates every key in that table and is the only list of key names;
this file never
restates what it declares. Per-project sandboxes are not keys: a project is a directory under
`sandbox/projects/`, committed beside its Dockerfile, and the `Per-project sandboxes` section below is
its record. The host-side names that directory's `env` map points at are keys, and every one of them
appears in the table above. Behaviour that is non-obvious rather than operator-facing lives in
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
path a session must take. `corepack enable` runs next, so `npm`, `pnpm` and `yarn` all resolve. The
last layer installs the EAS CLI (`eas-cli`, https://docs.expo.dev/eas/cli/) globally from npm at a
pinned version; to upgrade, change the version in that `RUN` line and rebuild. The `eas-cli` skill
under `src/mastra/public/factory-skills/` is what tells the agent it is there. The
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

A value that is neither blank nor of that form stops the **server** at startup, before any session
exists: `npm start` refuses to come up and the error names this key. That is a different failure from
the blank case below — nothing is running, so there is no session view to open and no container to
look for. Fix the line in `.env` and start the server again. `npm run dev` does not apply this check
and takes whatever is written, so a tag of the wrong shape can survive a development run and only show
up the first time the server is started for real.

**How to obtain it.** Build the image (below) and use the tag you built. The tag history table at the
bottom of this file records which ones exist. There is no default and none is invented: with
`FACTORY_SANDBOX_PROVIDER=docker` and this key blank, the first session refuses to start and the error
names this key. That refusal is deliberate — the sandbox package's own default is `node:22-slim`, which
carries neither `git` nor `gh`, so falling back to it would trade a named error for a session that only
fails once the agent reaches for git.

## `FACTORY_SANDBOX_MEMORY_GIB`

**What the value must contain.** A whole number of gibibytes — the hard memory ceiling for one
session's container. It is a cap, not a reservation: exceeding it OOM-kills that container instead of
the host. Whole gibibytes only — there is no way to express a fraction of one here, and anything that
is not a run of digits — `-1`, `2.5`, `1e3`, `abc` — falls back to the default, `10`, rather than
being rounded into something plausible. So do `0` and a run of digits too long for the server to hold
exactly, which is anything past sixteen or so digits: those fall back as well rather than being
refused, so a number that absurd gets a 10 GiB container and no error.

Within the range the server can hold, the most this key may ask for is **30**: the 10 GiB per container
below times the three concurrent sessions this host is sized for, which is the entire share of the VM's
32 GiB that sandboxes get — a container above it could not be served even as the only live session. A
larger number in that range is not capped or rounded down — the session that would use it is refused
before any container is created, with an error naming this key, its value and that 30. Nothing is
relocated: a refused session does not fall back to this host or to a cloud provider.

That 30 is not a setting. It is compiled into `src/mastra/config/sandbox.ts` as the product of the
default ceiling below and the default concurrency count, so raising it is a code edit there, and a code
edit alone would only move the number past what the VM can serve: growing the VM and raising the two
constants are both required, in the same change.

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
only — a fraction of a core cannot be expressed here, and anything that is not a run of digits — `-1`,
`2.5`, `1e3`, `abc` — falls back to the default, `4`, rather than being rounded into something
plausible. So do `0` and a run of digits too long for the server to hold exactly, exactly as for the
memory ceiling above: those fall back rather than being refused.

Within the range the server can hold, the most this key may ask for is **12**: the 4 cores per container
below times the three concurrent sessions this host is sized for, which is every core the VM has. A
larger number in that range is refused the same way the memory ceiling above is — the session is refused
before any container is created, with an error naming this key, its value and that 12, and nothing is
relocated. And like that one, the 12 is compiled into `src/mastra/config/sandbox.ts` as the product of
the default below and the default concurrency count, so raising it means editing those constants and
growing the VM together, not either on its own.

**How to choose it.** `4` on this host. The Colima VM has 12 cores and Postgres takes roughly one, so
three sandboxes at 4 cores each is a mild, deliberate overcommit. The three is the same concurrency
`MASTRACODE_MAX_SANDBOXES` holds sessions to. Overcommitting CPU is the benign case: caps are ceilings,
contending containers are throttled rather than killed, and the memory number is the one that actually
binds — which is why the concurrency count is chosen against memory and not against cores.

## Per-project sandboxes

**What this is.** One directory per repository that needs something the shared image should not carry:
`sandbox/projects/<owner>/<name>/`, holding a `Dockerfile` and a `sandbox.json`. Both are committed, and
both are reviewed like code — adding a project is a pull request, not a deployment edit. The directory
name is the address: a session bound to `koval-yurko/eleven-labs-english-agent` reads
`sandbox/projects/koval-yurko/eleven-labs-english-agent/sandbox.json`, and nothing else selects it.

**How a session finds its config.** Factory reports the repository a session is bound to as an
`owner/name` slug, and that slug addresses the directory, matched exactly after trimming. A session with
no repository has no slug, and a repository with no directory has no config; both take the global image
and the global ceilings, and neither is an error. Matching is case-sensitive, so a slug that differs only
in case finds nothing and runs on the global settings — the safe direction, since the alternative would
be handing one project's credentials to another.

**What `sandbox.json` holds.** Four optional fields, and an absent field means the global setting
decides that one:

| Field | What it decides |
|---|---|
| `image` | the image this project's containers are created from, instead of `FACTORY_SANDBOX_IMAGE` |
| `memoryGib` | this project's memory ceiling, instead of `FACTORY_SANDBOX_MEMORY_GIB` |
| `cpus` | this project's CPU ceiling, instead of `FACTORY_SANDBOX_CPUS` |
| `env` | which host variables reach this project's containers, and under what names |

`image` is a date-stamped tag in this project's own family —
`factory-sandbox-eleven-labs-english-agent:2026-10-11` — date-stamped for the reason the
`FACTORY_SANDBOX_IMAGE` section above gives, and it must already be in this engine's store, because the
container is created from it here rather than pulled from a registry.
`npm run sandbox:build -- <owner>/<name>` builds that image and writes the tag it built into this field,
so the file and the store cannot drift.

`memoryGib` and `cpus` are whole numbers, written as JSON numbers and not as strings. The host bounds the
sections above derive still bind: 30 GiB and 12 cores. A project value above them refuses that project's
session before any container is created, with an error naming this file and this field rather than the
global key — this file supplied the number, and pointing at the global one would send you to fix a line
that is not wrong.

**What the `Dockerfile` has to carry.** A project Dockerfile is written from scratch on a pinned public
base; it does not extend `factory-sandbox`. That is deliberate: inheriting the base would pull in every
tool it carries, including ones this project has no use for, and an installed CLI is one an agent can run
whether or not anything asked for it. The cost is that the Dockerfile restates the session contract
itself, and the per-project Dockerfile gate is what keeps that from being forgotten:

- `git` and `gh`, installed and on `PATH` — Factory clones the repository and opens pull requests from
  inside the container, so a project image without them fails every session bound to it.
- `WORKDIR /workspace`, the one directory the sandbox runtime mounts and works in. The runtime supplies
  no working directory of its own, so an image that omits this starts sessions somewhere else.
- A long-lived `CMD` or `ENTRYPOINT`. The runtime passes no command and expects the container to stay up
  between exec calls; `CMD ["sleep", "infinity"]` is the convention the base image uses.
- The project's own tools, at pinned versions. Nothing else: no `COPY` of the build context, which is the
  repository root and would bake `.env` into an image layer, and no literal credential in an `ENV` or
  `ARG`. Credentials arrive through `env` below, at container creation, so they stay out of the image.

A project that needs no extra tool at all needs no Dockerfile and no `image` field — it takes the global
tag and the global image.

**What `env` holds.** A map from the name a variable has **inside the container** to the name it has **on
this host**:

```json
{ "env": { "VERCEL_TOKEN": "ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN" } }
```

The direction is the point. Two Vercel projects each need their own token, and the Vercel CLI in each
checkout looks for it as `VERCEL_TOKEN`; keeping one distinct host secret per project and letting each
`env` map present its own under that shared container-side name is what makes both work without either
credential reaching the other's sandbox. A host name this map does not mention never reaches the
container, and a container-side name may appear in another project's map too, because each container
receives only its own.

It lists **names** only. The values stay in this host's environment and are read when a container is
created, so committing this file publishes no secret. A host name that is unset or blank forwards
nothing, so a project can be committed before its credentials are provisioned and the session simply runs
without them until they are. Every host name an `env` map uses is declared in `.env.schema`, which is why
a new project's host keys are added there rather than invented in this file.

**How a host name is spelled.** Project-forwarded host keys follow one convention, and it is enforced:

```
<PROJECT>_<SERVICE>_<WHAT IT IS>
```

`PROJECT` is the repository-name half of the slug in upper case with underscores for separators, so
`koval-yurko/eleven-labs-english-agent` gives `ELEVEN_LABS_ENGLISH_AGENT`. `SERVICE` is the external
service the credential belongs to — `VERCEL`, `EXPO`, `SUPABASE`. The last part says what the value is:
`TOKEN`, `ORG_ID`, `PROJECT_ID`, `DB_URL`. Project first, so every credential belonging to one repository
sorts together in `.env.schema` and in a `grep`, and so two Vercel projects can each present
`VERCEL_TOKEN` to their own sandbox without their host names colliding. Service in the middle, so the
service is visible without parsing the tail. `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN` and
`MARKETING_SITE_VERCEL_TOKEN` are the same shape for two different repositories.

If two owners ever have repositories with the same name, the owner-qualified form is accepted instead:
`<OWNER>_<PROJECT>_<SERVICE>_<WHAT IT IS>`, as in `KOVAL_YURKO_ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN`.
Anything else — service first, another project's prefix, or no underscore after the project — is rejected
by the per-project config gate, so the convention cannot rot one project at a time.

An `env` entry whose container-side name is `EXPO_TOKEN` overrides the global forward for that project,
which is how two projects build against two Expo accounts.

**What several projects look like together.** The point of the container-side name being free while the
host-side name is unique is that unrelated projects can share a convention inside their own sandboxes
without sharing anything else. Four directories, four different credential sets, no overlap:

```
sandbox/projects/
  koval-yurko/eleven-labs-english-agent/   # Vercel deploy status and logs
  acme/marketing-site/                      # a different Vercel account entirely
  acme/mobile-app/                          # Expo, plus a database the web projects do not touch
  acme/data-pipeline/                       # no credentials at all, just a bigger machine
```

```json
{ "image": "factory-sandbox-eleven-labs-english-agent:2026-10-11",
  "env": { "VERCEL_TOKEN": "ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN",
           "VERCEL_ORG_ID": "ELEVEN_LABS_ENGLISH_AGENT_VERCEL_ORG_ID",
           "VERCEL_PROJECT_ID": "ELEVEN_LABS_ENGLISH_AGENT_VERCEL_PROJECT_ID" } }
```

```json
{ "image": "factory-sandbox-marketing-site:2026-10-11",
  "env": { "VERCEL_TOKEN": "MARKETING_SITE_VERCEL_TOKEN",
           "VERCEL_ORG_ID": "MARKETING_SITE_VERCEL_ORG_ID",
           "VERCEL_PROJECT_ID": "MARKETING_SITE_VERCEL_PROJECT_ID" } }
```

Both of those hand their checkout a `VERCEL_TOKEN`, which is what the Vercel CLI looks for, and neither
can see the other's — the tokens are different host variables, provisioned separately, and each is
forwarded only into the one directory that names it.

```json
{ "image": "factory-sandbox-mobile-app:2026-10-11",
  "memoryGib": 16,
  "env": { "EXPO_TOKEN": "MOBILE_APP_EXPO_TOKEN",
           "SUPABASE_DB_URL": "MOBILE_APP_SUPABASE_DB_URL" } }
```

That one takes the global Expo forward away and replaces it, so it builds against its own Expo account;
`memoryGib` is there because a mobile build is not the same shape as a docs site. Note the absence of
`cpus` — it stays on the global ceiling, which is the whole reason the fields are independent.

```json
{ "memoryGib": 24, "cpus": 8 }
```

And that one forwards nothing, so its containers get `EXPO_TOKEN` like every other session and no secret
of their own; it exists only to give one repository more machine. It has no `image` either, so it runs on
the global tag and needs no Dockerfile of its own — a directory with a `sandbox.json` and no
`Dockerfile` is a valid project, and the build command has nothing to do there.

Only the first of those four is real; the rest are here to show the shape. Adding them would mean
declaring `MARKETING_SITE_VERCEL_TOKEN` and the others in `.env.schema` first, since a host name an
`env` map uses has to exist there before it can be forwarded — spelled the way the convention above
requires, which the same gate checks. Three of the four also name an `image`, so three of the four would
need a Dockerfile beside the config and a `npm run sandbox:build -- <owner>/<name>` run on every host
before their sessions work.

**What goes wrong, and what you see.** This file is read, not parsed leniently. One that cannot be read,
is not valid JSON, holds a JSON value that is not an object, carries a field the table above does not
list, or holds a value of the wrong shape refuses the session and names this file. A malformed config is
not guessed at, because guessing would mean deciding which credentials to forward on the strength of a
typo. Nothing is relocated — as with the ceilings above, the docker branch throws instead of falling
through to another provider.

**Two things that are not errors.** A missing directory means global settings, as above. And the lookup
runs from the working directory, so a server process that is not running with the repository root as its
working directory finds no project directory at all and runs every session on the global settings; it
logs one warning saying so rather than refusing to start. `npm run start` and the launch agent both set
that directory, so this reaches only a server started by hand from somewhere else.

**When it applies.** Like every other setting on this page, when a container is **created**. Editing a
`sandbox.json` and restarting the server reaches only sessions whose containers are created after the
restart; an existing session keeps the image, ceilings and credentials it started with until its
container is removed.

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

## `EXPO_TOKEN`

**What the value must contain.** An Expo access token, or nothing. When set, it is forwarded into every
docker-provider session container as `EXPO_TOKEN`, which is how the EAS CLI in the image authenticates
— `eas whoami` then prints the account instead of `Not logged in`. Blank forwards nothing. This is the
one host variable that reaches **every** session container regardless of which repository the session is
bound to; a project's `sandbox.json` `env` map is how anything else reaches one, and only the containers
it names. A project `env` entry whose container-side name is `EXPO_TOKEN` overrides this forward for that
project, which is how two projects build against two Expo accounts.

**How to obtain it.** expo.dev → account settings → Access tokens → create a token. Prefer a robot
user's token or one from an account that only this deployment uses: the token is readable by
anything running in the container, which includes the agent and any script in a repository it
clones, so treat it as handed to the agent rather than kept from it.

Like the ceilings below, it is applied when a session's container is **created**. Setting, changing
or revoking it and restarting the server reaches only sessions whose containers are created after the
restart; an existing session keeps the value it started with until its container is removed.

## `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_TOKEN`

**What the value must contain.** A Vercel API token for the Vercel project that
`koval-yurko/eleven-labs-english-agent` deploys to, or nothing. It is not forwarded to every session:
that project's `sandbox.json` `env` map names it, and it reaches that project's container as
`VERCEL_TOKEN`. No other session container sees it. Inside that container it is what lets the Vercel CLI
in the checked-out repository read deployment status, build failures and recent runtime logs without an
interactive login step.

**How to obtain it.** vercel.com → account settings → Tokens → create a token. The deployment this
serves accepts a full-access classic token, so scope it as narrowly as the account allows and prefer one
from an account that only this deployment uses. Treat it as handed to the agent rather than kept from
it: anything running in that container can read it, including any script in a repository it clones.

The host-side name carries the project because a second Vercel project needs a second token, and both
present theirs to their own sandbox as `VERCEL_TOKEN` — the `Per-project sandboxes` section above is why
that is the map's direction and not an accident.

Applied when a container is **created**, like `EXPO_TOKEN` above, so rotating it reaches only the
containers created after the restart.

## `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_ORG_ID`

**What the value must contain.** The identifier of the Vercel team that token belongs to, or nothing. It
names an account and is not a credential. The same `env` map forwards it, and it reaches that container
as `VERCEL_ORG_ID` — the CLI needs both to address a project without an interactive link step, and a
token with no team identifier makes it ask.

**How to obtain it.** From a checkout of that repository, `vercel link` writes both this and the project
identifier below into `.vercel/project.json`; the project's settings page in the dashboard shows the same
two strings. Either way it is stable for the life of the project, so it is set once.

## `ELEVEN_LABS_ENGLISH_AGENT_VERCEL_PROJECT_ID`

**What the value must contain.** The identifier of the Vercel project that repository deploys to, or
nothing. It names a project inside the team above and is not a credential. Forwarded alongside the other
two by the same `env` map, and reaching that container as `VERCEL_PROJECT_ID`.

**How to obtain it.** The same `vercel link` run or the same settings page. Take both identifiers from
one place and set them together: a project identifier from a different team reads like a permissions
problem rather than like the mismatch it is.

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
  history table below and restart. A non-blank value that is not a date-stamped `factory-sandbox:`
  tag never reaches this point — it stops the server at startup instead — so a session reaching this
  error means the key is blank. A tag of the right shape that this engine does not hold is not caught
  at startup either, and surfaces as the registry error below rather than as this one.
- **The error names a `sandbox/projects/<owner>/<name>/sandbox.json` path.** That project's config is
  the cause and nothing else is: it could not be read, is not valid JSON, holds a value that is not a
  JSON object, carries a field the `Per-project sandboxes` section does not list, or holds a value of
  the wrong shape — an image tag outside this project's family, a ceiling that is not a whole number
  written as a JSON number, or an `env` name that is not a valid variable name on one side or the
  other. The error says which. A ceiling **above** the host bound arrives the same way and names the
  file and the field, because that file supplied the number; fix it there and not in the global key.
  This config is read rather than parsed leniently, so a session for that repository will not start
  until the file does — other repositories are unaffected.
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
  `FACTORY_SANDBOX_IMAGE` at one the list actually shows. The same failure arrives for a project image,
  where the missing tag is the one in that project's `sandbox.json` `image` field — list it with
  `docker images factory-sandbox-<name>` and rebuild it with
  `npm run sandbox:build -- <owner>/<name>`, which also rewrites the field to the tag it built.
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

`npm run sandbox:build` runs that build, the smoke test below and the `arm64` check in one go. If they
all pass, it sets `FACTORY_SANDBOX_IMAGE` in `.env` to the new tag. The line must already exist there.
Rebuilding on the same date replaces that day's tag. Afterwards, record the tag in the table below
and restart the server.

`--platform linux/arm64` matches the Apple-silicon VM; an image built for another architecture runs
under emulation and is slow enough to look like a hang.

The trailing `.` is the build context, and it is the repository root because that is the command this
subject pins — `-f` and the context are independent arguments, so the context is a choice, not a
consequence of the `-f` path. The image copies nothing out of it. There is no `.dockerignore`, so the
whole tree — `node_modules/` and `.env` included — is still transferred to the engine before the first
instruction runs, which is why the first build spends a visible stretch on "transferring context".

## Build a project image

```bash
npm run sandbox:build -- koval-yurko/eleven-labs-english-agent
```

The argument is the project's `owner/name` slug — the same two directory levels under
`sandbox/projects/`. One slug builds one project; there is no "build every project" form, because a
project image is only needed where that project's sessions run.

It builds `sandbox/projects/<owner>/<name>/Dockerfile`, tags the result
`factory-sandbox-<name>:YYYY-MM-DD` with today's date, runs the same smoke test and `arm64` check the
base build runs, and then writes the tag it built into the `image` field of that project's
`sandbox.json`. The write is why the command exists rather than a bare `docker build`: the file that
decides which image a session uses is updated by the same run that produced the image, so the two cannot
drift. Nothing is written to `.env` — a project image is not the global one.

One thing it needs first: the slug must exist. A name with no `sandbox/projects/<owner>/<name>/Dockerfile`
exits 1 naming the path it looked for, rather than building nothing quietly. There is no ordering
dependency on the base image — a project Dockerfile is written from scratch on a pinned public base, so it
builds on a host that has never built `factory-sandbox` at all, and a change to the base image cannot
break it.

Run it once per host before that project's sessions are expected to work. The `sandbox.json` is
committed, the image is not — it lives in this engine's store and nowhere else — so a freshly cloned
tree names a project image no one has built yet. Until it is built, sessions bound to that repository
fail the way a missing global image does, and the fix is this command rather than anything in the
configuration.

Rebuilding on the same date replaces that day's tag, exactly as the base build does, and the
`sandbox.json` field is rewritten to the same string — so a second build on one day leaves no trace in
the diff and the first image dangling. Suffix the tag by hand if both have to survive.

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

A project image is checked the same way with its own tag, and the `gh` half still has to pass — the
project Dockerfile installs it itself rather than inheriting it, so this is what catches a project image
that omitted part of the session contract and would then fail every session that tries to open a pull
request. Add the tool that Dockerfile installs to the check: for
`factory-sandbox-eleven-labs-english-agent:2026-10-11` that is `vercel --version`, which is also the
check that the version it pins is the one that got installed. `npm run sandbox:build -- <owner>/<name>`
runs the shared half only, so the project-specific half is a manual step.

Record the tag in the table below once this passes, then point `FACTORY_SANDBOX_IMAGE` at it and
restart the server. Sessions started after the restart are created from that tag.

## If the build fails

- **`docker build` cannot connect to the daemon.** The engine is not running or `DOCKER_HOST` is not
  exported in this shell. Neither is fixed here: see `ops/README.md`.
- **The `gh` layer fails.** Applies to a project Dockerfile as well as the base one, since both install
  `gh` the same way. Two causes. The `curl` fetching `githubcli-archive-keyring.gpg` needs
  `https://cli.github.com` to be reachable from inside the build — a proxy or a blocked egress stops it
  there, and the layer fails before any `gh` package is seen. Or the write to
  `/usr/share/keyrings/githubcli-archive-keyring.gpg` fails because the directory does not exist in the
  image being built on, which a future base change could cause; the fix is an explicit `mkdir -p` ahead of
  the `curl` in that same chain. A failure at `apt-get install gh` *after* both of those means the
  source list was written but the repository did not resolve.
- **The build is killed part-way, or `apt-get` fails writing.** The VM is out of disk. Reclaim with
  `docker image prune` and `docker system df`, or grow the VM — checkouts plus `node_modules` in
  long-lived session containers are what fill it over months.
- **A project build fails at its `FROM` line.** The pinned public base is not in this engine's store and
  could not be pulled — egress blocked or proxied, the registry unreachable, or a tag mistyped in that
  Dockerfile. `docker images` shows what is already local; `docker pull` the reference on its own to see
  the real error before rebuilding. This used to be the way a base-image change quietly broke the projects
  built on top of it; project Dockerfiles no longer extend `factory-sandbox`, so a base rebuild cannot
  break them.
- **A project build exits 1 before building anything.** The slug names no
  `sandbox/projects/<owner>/<name>/Dockerfile`. The error prints the path it looked for; the argument is
  the `owner/name` slug and not a project name on its own.

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

A project image rolls back the same way with one difference: the tag that decides is the `image` field
in that project's `sandbox.json`, not `FACTORY_SANDBOX_IMAGE`. Edit the field to the older tag and
restart — or rebuild on a new date, which rewrites it. Only that one repository is affected; every
other session keeps using the global tag. The same prune hazard applies, and a project tag has fewer
containers referencing it, so it is the easier of the two to lose.

List what the engine actually holds with:

```bash
docker images factory-sandbox
```

## Tag history

Newest first. A tag earns a row once its build has passed the smoke test above; the tag in the top row
is normally the one `FACTORY_SANDBOX_IMAGE` points at, and the rows under it are the rollback targets.

This table is for base images only. A project image's live tag is the `image` field in that project's
`sandbox.json`, which the build command rewrites, so its history is in that file's git log rather than
here; a row here would go stale the next time anyone rebuilt the project.

| Tag                        | Built                | Change        |
|----------------------------|----------------------|---------------|
| factory-sandbox:2026-10-03c | 2026-10-03 | Replace rtk with eas-cli 24.10.0 |
| factory-sandbox:2026-10-03b | 2026-10-03 | Add rtk 0.51.0 |
| factory-sandbox:2026-09-23 | 2026-09-23T12:34:56Z | Initial build |
