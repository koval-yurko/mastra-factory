# Container engine

The operator-plane subject for the Docker engine this host runs and the Postgres service
`docker-compose.yml` describes. This file is normative for what `DOCKER_HOST` must contain and how to
obtain it, and for the order the bring-up commands run in.

`.env.schema` is the list of keys. `README.md` ("Configure your Factory") states what the three
`POSTGRES_*` values must contain and how to choose them. Neither is restated here.

## `DOCKER_HOST`

`colima start` creates and activates a docker context for its socket, so the `docker` CLI and
`docker compose` usually resolve it without this variable. `DOCKER_HOST` covers the consumers that do not
read docker contexts — dockerode, which the server uses for the Docker sandbox provider, and any
process `launchd` starts — and it overrides the context when set, which is why bring-up exports it.

**What the value must contain.** A `unix://` URL whose path is the absolute path to the Unix socket of
the running Colima VM:

```
unix://<absolute path to $HOME>/.colima/default/docker.sock
```

Two spellings of the same path, because the two consumers expand differently:

- **In a shell** — write `unix://$HOME/.colima/default/docker.sock`. The shell expands `$HOME` before
  any client reads the value.
- **In a `launchd` property list** — write the path out in full, for example
  `unix:///Users/koval/.colima/default/docker.sock`. `launchd` passes `EnvironmentVariables` through
  verbatim; it does not expand `$HOME`, and an unexpanded value silently points at a socket that is
  never created.

Note the three slashes in the absolute spelling: two belong to the `unix://` scheme and the third is the
leading `/` of the path.

**How to obtain it.** There is nothing to generate or request. `colima start` creates the socket, and the
`default` segment is the Colima profile name — the profile you get when `colima start` is run without
`--profile`. Confirm the socket exists before relying on the value:

```bash
test -S "$HOME/.colima/default/docker.sock" && echo present
```

The value is a local filesystem path. It is the same on every boot of the same profile, so it can be set
once in a shell profile and left alone.

**Setting it in `.env` instead.** `.env` reaches the server, which varlock starts from it, and Compose,
which loads `.env` too — but not a bare `docker` command, which never reads `.env` at all. A value written
there must use the fully written-out path: nothing expands `$HOME` in `.env`, so `unix://$HOME/…` stays
literal and points at a socket that does not exist, the same silent failure as in a property list.

## Before you start

- Homebrew on the PATH (`/opt/homebrew/bin` on Apple silicon).
- `POSTGRES_PASSWORD` set in `.env` at the repository root. Until it is, `npm run db:up` — and every
  other `docker compose` command — stops with an error naming the variable. Copy `.env.example` to `.env`
  if you have not already, then see `README.md` ("Configure your Factory") for what that value and the
  other two `POSTGRES_*` values must contain.

## Bring-up

Run these in order, from the repository root, in one shell. Do not move past a step whose checkpoint
below does not hold.

```bash
# 1 — engine + tools
brew install colima docker docker-compose gh
#     docker-compose is a CLI plugin — if `docker compose` isn't found:
#     mkdir -p ~/.docker/cli-plugins && \
#       ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --cpu 12 --memory 32 --disk 200 --vm-type vz --mount-type virtiofs
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
docker info

# 2 — Postgres
npm run db:up
```

`colima start` provisions a VM on first run and takes several minutes. The `export` lasts for the life of
that shell only; put the same line in your shell profile to make it stick for interactive use.

## Checkpoints

### 1 — the engine answers

```bash
test -S "$HOME/.colima/default/docker.sock" && docker info >/dev/null && echo ok
```

Expected: prints `ok`. `docker info` exits 0 and reaches the daemon through
`~/.colima/default/docker.sock` — confirm the value in force:

```bash
echo "$DOCKER_HOST"
```

Expected: the `unix://…/.colima/default/docker.sock` path above. If `docker info` reports it cannot
connect, the VM is not running (`colima status`).

If `docker compose version` reports an unknown command after `brew install`, apply the
`~/.docker/cli-plugins/docker-compose` symlink shown in step 1 and try again.

### 2 — the container is healthy

```bash
docker inspect --format '{{.State.Health.Status}}' mastracode-web-db
docker inspect --format '{{.Config.Image}}' mastracode-web-db
```

Expected: `healthy`, then `pgvector/pgvector:pg18`. The health probe has a 30 s grace period on a first
start, because initializing an empty data volume takes longer than the retry window. If the status is
anything other than `healthy` — or `docker inspect` reports "No such object", meaning the container was
never created — use `docker compose ps` and `docker compose logs app-db` to find out why.

### 3 — the host can reach it on loopback

```bash
nc -z 127.0.0.1 54329 && echo reachable
```

Expected: prints `reachable`. Use `nc` (`/usr/bin/nc`, present on macOS) — `pg_isready` and `psql` are
not installed on this host, they exist only inside the container. This proves only that something is
listening on the port, not that Postgres answers there; checkpoint 4 is what confirms the server itself.

**Record the result of this one.** `docker-compose.yml` publishes `127.0.0.1:54329:5432`, which binds
inside the VM's loopback and relies on Lima forwarding a guest-loopback port to host loopback. That
forwarding has never been observed here. If this checkpoint fails while checkpoint 2 passes, the port is
bound in the guest but not reaching the host: change the `ports` entry in `docker-compose.yml` to
`'54329:5432'` and re-run `npm run db:up`. Treat that as provisional and report the result — the bare
form publishes on every interface inside the VM and gives up the loopback-only guarantee
`docker-compose.yml` calls mandatory, so it is a diagnostic, not a change to adopt permanently.

### 4 — the database exists

```bash
docker exec mastracode-web-db psql -U factory -d mastracode_web -c '\conninfo'
```

Expected: a connection line naming database `mastracode_web`. Substitute the role and database names you
put in `.env` if you did not keep the defaults — and see `README.md` before changing any of the three
values after this point.

### If `npm run db:up` never returns

`db:up` is `docker compose up -d --wait` with no timeout, and the service carries
`restart: unless-stopped`. A container that fails to initialize — a `POSTGRES_USER` or `POSTGRES_DB`
value `initdb` rejects, for instance — is restarted rather than left exited, so the wait has nothing to
end on: the command produces no output and hangs instead of failing. If that happens, interrupt it and
look at the logs; also record that it hung, since this behavior has been predicted but never observed.

```bash
docker compose ps
docker compose logs app-db
```

## Teardown

```bash
npm run db:down        # stops the container; the data volume survives
colima stop
```

Nothing starts Colima at login yet, so until the supervision agents exist the operator must run
`colima start` after a host reboot before the container's `restart: unless-stopped` policy can bring
Postgres back.
