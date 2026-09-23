# Host infrastructure

The operator-plane subject for the infrastructure this host runs underneath the Factory Server. Two
things live here: the Docker engine and the Postgres service `docker-compose.yml` describes, and the
Cloudflare Tunnel that makes this deployment reachable from the internet. This file is normative for
what each key under "Keys this subject owns" below must contain and how to obtain it, and for the
order the bring-up commands run in.

`.env.schema` is the list of keys. `README.md` ("Configure your Factory") states what the three
`POSTGRES_*` values must contain and how to choose them, and `apps/slack/README.md` is the record for
`MASTRACODE_CHANNELS_PUBLIC_URL`. None of them is restated here.

## Keys this subject owns

The table below is the closed list of the keys this file owns, and this file is the only record
for what each must contain and how to obtain it. The four
subject READMEs under `apps/` and `sandbox/`, plus `README.md` as the residual owner, claim the rest;
between the six tables every key `.env.schema` declares is claimed exactly once.

| Key | What the value must contain | Full record |
|---|---|---|
| `DOCKER_HOST` | a `unix://` URL naming the running Colima VM's socket | the `DOCKER_HOST` section below |
| `MASTRA_HOST` | the dotted loopback address the listener binds to | the `MASTRA_HOST` section below |
| `PORT` | the pinned port the server listens on | the `PORT` section below |
| `MASTRACODE_PUBLIC_URL` | the origin the browser reaches this deployment at | the `MASTRACODE_PUBLIC_URL` section below |
| `NODE_ENV` | the runtime mode this process runs as | the `NODE_ENV` section below |
| `REDIS_URL` | the Redis the cross-process event bus rides on, when there is one | the `REDIS_URL` section below |

`.env.schema` declares and validates every key in that table and is the only list of key names;
this file never
restates what it declares. Behaviour that is non-obvious rather than operator-facing lives in
`docs/self-hosting-research.md` §11 ("Environment variables — traps only"), which is referenced here
by path and never copied.

Not .env keys: `PATH`.

`PATH` is a process-environment setting rather than configuration: it is written into both plists
because a launchd agent inherits a minimal one, and exported again by `ops/factory-start.sh`. It is
not read from `.env` and does not belong in `.env.schema`, and "The artifacts" below is where it is
described. `NODE_BIN` next to it in that wrapper is not an environment variable at all — it is a
`readonly` shell constant holding the nvm prefix `node` and `npm` come from, and it exists only to
build `PATH`, so it is neither set by the deployment nor carved out from anything.

That line above is machine input, not prose. The verify gate reconciles every key the plists, the
wrapper and `docker-compose.yml` set against `.env.schema`, and reads it as the carve-out list — so
it has to stay a column-0 line beginning exactly `Not .env keys:` with the names backticked. Bullet
it, indent it or reword the prefix and the gate fails, reporting that it found no carve-out list.

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

Nothing starts Colima at login until the supervision agents below are installed and bootstrapped, so
for now the operator must run `colima start` after a host reboot before the container's
`restart: unless-stopped` policy can bring Postgres back. The agents that remove that step exist as files —
`ops/launchagents/ai.mastra.colima.plist` and `ops/launchagents/ai.mastra.factory.plist`, placed by
`ops/install.sh` — and "Supervision — LaunchAgents" at the end of this file is their record. Having
them in the repo starts nothing; bootstrapping them is a separate step.

## Ingress — Cloudflare Tunnel

Everything above keeps this deployment on this machine. This section is what makes it reachable at
`https://factory.kovalchuk.win`, and the important half of that sentence is what does *not* change:
the server's socket stays on `127.0.0.1:4111`. `cloudflared` runs here, dials **out** to Cloudflare,
and Cloudflare hands requests back down that same connection to the loopback address. Nothing is
listening for the internet on this host, on this network, or on this router.

Two preconditions, both checked before the install rather than after:

- **Registration is already closed.** Sign-up is disabled in committed source — the literal
  `signUpEnabled: false` in `src/mastra/config/auth.ts` — and your own account exists. `README.md` step 3
  is the procedure and its `POST /auth/api/sign-up/email` probe is the proof: a `400` carrying
  `EMAIL_PASSWORD_SIGN_UP_DISABLED`, and nothing else. A public hostname is a public DNS record, so a
  deployment published with that window still open gives the first account to whoever finds it first.
- **The `kovalchuk.win` zone is Active, with auto-renew on.** Confirm both in the Cloudflare
  dashboard and at the registrar before installing anything. Every callback URL registered with
  GitHub, Linear and Slack resolves through this one domain, so an expiry breaks all of them at once
  and none of them reports the reason.

## `MASTRA_HOST`

**What the value must contain.** The literal `127.0.0.1` — the dotted address, never the name
`localhost`.

The value is handed to the listener unchanged, and a name goes through the resolver first, which on
this host commonly answers `::1` before `127.0.0.1`. So `MASTRA_HOST=localhost` leaves the server on
IPv6 loopback while the tunnel's HTTP origin names the IPv4 one, and nothing on this side reports a
mismatch: the server starts, the startup banner reads normally, and every request through the tunnel
comes back as a Cloudflare `502`. Ingress checkpoint 1 is what exposes it, because it prints the
address that actually got bound rather than the one that was asked for.

Unset is worse and quieter still. `@mastra/deployer` resolves
`bindHost = serverOptions?.host ?? process.env.MASTRA_HOST`, so with neither set the server listens on
**every** interface, this machine's LAN address included, and logs nothing about it. Listing the key
in `.env.schema` changes none of that: leaving it blank is not a boot error, and an unset key is
absent from the server's environment entirely rather than reaching it as an empty string, so nothing
is handed to the listener in its place. On the `npm run start` path the server's own stdout does echo
the value it was given — but that is what `.env` said, never the address the socket actually took,
and `npm run dev` is bare `mastra factory dev`, so the bring-up in `README.md` step 2 gets not even
that. Ingress checkpoint 1 is the only thing that reports what was bound. `HOST` is not a substitute
either; it changes the URL printed in the startup banner and moves no socket.

**How to obtain it.** Nothing issues it. It is a constant for a single-machine deployment, and the
tunnel is not a reason to change it — the tunnel is what reaches this address.

## `PORT`

**What the value must contain.** `4111`, pinned. The same number appears in the tunnel's
public-hostname target below and in the loopback `MASTRACODE_PUBLIC_URL` of `README.md` step 1; all of
them have to agree.

Unset, `npm run dev` scans 4111–4131 and quietly takes 4112 when 4111 is busy. Before the tunnel
exists — the loopback bring-up of `README.md` step 1 — every request then arrives on an origin
sign-in does not trust, with nothing saying why, because `MASTRACODE_PUBLIC_URL` still names 4111.
Once the tunnel exists it keeps sending to 4111 too, so the public hostname answers `502` while the
server runs perfectly well on a port nobody is pointing at. Pinned, a busy port stops the boot with
`EADDRINUSE`, which is the loud failure worth having.

**How to obtain it.** Nothing issues it either. It is chosen here and then copied into the tunnel's
public-hostname target.

## `MASTRACODE_PUBLIC_URL`

**What the value must contain.** With the tunnel serving: exactly `https://factory.kovalchuk.win` —
scheme and host, no port, no path, no trailing slash. Before the tunnel exists it is the loopback
origin `README.md` step 1 sets, and it stays that way for as long as the first bring-up runs.

In that loopback form it carries the port as well — `http://127.0.0.1:4111` — and has to agree with
`MASTRA_HOST` and `PORT` character for character. `localhost` and `127.0.0.1` are not interchangeable
here either: the browser sends whichever one the address bar holds, and an origin differing from this
value by that name alone is refused with the same `403` described below.

This is the origin the browser uses and the only origin sign-in trusts — the trusted-origin list is
seeded from this value — and it is also what every provider callback URL is derived from. Left on
loopback while the tunnel is up it fails twice, neither time usefully: the browser arrives on
`https://factory.kovalchuk.win`, the sign-in request carries an origin the server does not trust and
is refused with `403` whose only record is a log line reading
`Invalid origin: https://factory.kovalchuk.win`; and every callback the providers redirect to points
at `http://127.0.0.1:4111/…`, an address only this server can reach, so each OAuth round-trip
dead-ends in the operator's own browser.

**How to obtain it.** It is the public hostname configured below — subdomain plus zone — with
`https://` in front. No provider issues it. Change it only together with the tunnel's public-hostname
mapping and the callback URLs recorded in `apps/github/README.md`, `apps/linear/README.md` and
`apps/slack/README.md`.

## `NODE_ENV`

**What the value must contain.** On this deployment, `production` — and it is set in
`ops/launchagents/ai.mastra.factory.plist` rather than in `.env`, because it describes the process
launchd starts and not a feature of the app. Leave it out of `.env` entirely.

`development` and `test` are the two values that change behaviour here, and both change it in the
same dangerous direction: they make `DATABASE_URL` optional and move all storage to a local libSQL
file. A `NODE_ENV=development` line in `.env` therefore does not fail — it silently relocates every
account, session and work item off the Postgres this deployment runs, where `README.md` step 4's
query then finds nothing and reads as a failed bootstrap. Any other value, unset included, keeps the
production requirement, which is why the bring-up in `README.md` leaves it unset on the
`npm run dev` path.

**How to obtain it.** Nothing issues it. It is a constant for this deployment, and the only place it
is written is that plist.

## `REDIS_URL`

**What the value must contain.** A Redis connection URL — `redis://` or `rediss://`, with whatever
credentials the instance needs. It is the bus the server publishes session, workflow and signal
events on, and the lease provider that replaces the file-based thread locks once it is set.

**How to obtain it.** There is nothing to obtain on this host: this deployment runs one server
process, the in-process bus is what a single process wants, and the key stays unset. It exists for
the multi-replica case, where every replica must be given the *same* Redis — two replicas on
different instances share no events at all and each behaves as though it were alone. Nothing reports
that; the symptom is a session whose stream stops updating in one browser while the work proceeds in
another. The value may embed a password, so it is one of the keys the server's own log masks rather
than echoing.

## Bringing the tunnel up

```bash
brew install cloudflared
sudo cloudflared service install <TOKEN>
```

`<TOKEN>` comes from the tunnel itself: Cloudflare Zero Trust → **Networks → Tunnels** → create a
tunnel, and the connector install command the console then shows carries it. It is a long-lived
credential — paste it into that one command, put it in nothing tracked by git, and keep it out of
`~/.zsh_history` too, which is where a pasted command lands by default: run the install with a
leading space if `HIST_IGNORE_SPACE` is set (`setopt histignorespace`), or delete the line from the
history file afterwards. `service install` registers `cloudflared` as a LaunchDaemon, so it starts at
boot from then on.

Then add one public hostname to that tunnel, in the same console:

| Field | Value |
| --- | --- |
| Subdomain | `factory` |
| Domain | `kovalchuk.win` |
| Type | **HTTP** |
| URL | `127.0.0.1:4111` |

Type **HTTP**, not HTTPS. The origin leg is plain HTTP that never leaves this machine, and TLS
terminates at Cloudflare — which is why `MASTRA_HTTPS_KEY` and `MASTRA_HTTPS_CERT` stay unset. Those
are the pair that would make the server serve TLS itself; they are declared in no schema here and
setting them is not part of this deployment. The URL field has to match `MASTRA_HOST` and `PORT`
character for character.

**What this opens, and what it does not.** `cloudflared` makes an outbound connection on port
**7844** and keeps it — QUIC over UDP by default, TCP if it falls back to HTTP/2. That is the entire
network change:

- no inbound port is opened, on this host or on the router;
- nothing is port-forwarded, and the router's configuration is not touched. Confirm that rather than
  assume it: open the router's admin page and check that its port-forwarding / NAT / "virtual server"
  table carries no rule for `4111`, none aimed at this machine, and nothing left over from an earlier
  experiment. Nothing on this host can read that table, and ingress checkpoint 2 only shows that a
  forward would have nothing to deliver to — not that none exists;
- no static IP is involved — this machine's address can change and the tunnel reconnects;
- the server goes on listening on `127.0.0.1:4111` and on nothing else.

**The `.env` switch.** Edit `.env` at the repository root so these four lines read:

```dotenv
MASTRA_HOST=127.0.0.1
PORT=4111
MASTRACODE_PUBLIC_URL=https://factory.kovalchuk.win
MASTRACODE_CHANNELS_PUBLIC_URL=https://factory.kovalchuk.win
```

Two of those lines are unchanged and two are not. `MASTRA_HOST` and `PORT` carry exactly the values
`README.md` step 1 set, and are listed to make it explicit that going public does not move the
socket. `MASTRACODE_PUBLIC_URL` changes value, from that step's loopback origin to the public one.
`MASTRACODE_CHANNELS_PUBLIC_URL` is in none of step 1's keys at all — it is being set here for the
first time. It is Slack's own origin key and `apps/slack/README.md` is its record; it is pinned here
rather than left to fall back because it is carried separately precisely so the two origins *can*
differ. After this switch the fallback would happen to produce the right value, which is the worst
state to leave it in: correct by coincidence, and silently wrong the day the coincidence ends.

`.env` is gitignored, is not in this repository, and is read once at startup — so make the edit, then
restart the server.

One thing changes underfoot at the same moment, and it is a loss rather than a gain. `npm run start`
is `varlock run -- mastra start`, and varlock reads `.env` and `.env.local` only — `.env.development`
is not one of its sources. `npm run dev` does read that file (`README.md` step 1), so anything kept
there has been applying right up to this point and stops applying the instant you move to the
production path, with nothing logged. Move it into `.env` before the switch, not after.

Behind the tunnel, serve the production build rather than the dev server:

```bash
npm run build
npm run start
```

`npm run dev` is the wrong thing behind a public hostname, for two reasons rather than one. It
rebundles and respawns on every source save, and a respawn behind a public hostname is a visible
outage; and its entry sets `studio: true`
(`node_modules/mastra/dist/templates/dev.entry.js:8`), so debugging over the tunnel publishes Mastra
Studio at the public origin alongside the app. Debug on loopback.

## Ingress checkpoints

These are numbered independently of the container-engine checkpoints above; every reference to them
in this section says "ingress" for that reason. Ingress checkpoints 1 and 2 need neither
`cloudflared` nor a tunnel — run them before the install as well as after, since a check that only
works once you have finished proves nothing about what the install changed. Ingress checkpoint 3
needs `cloudflared` installed but no public traffic. Ingress checkpoint 4 is the end-to-end one and
the only one that needs the tunnel actually serving.

### 1 — the socket is still bound to loopback

```bash
lsof -nP -iTCP:4111 -sTCP:LISTEN
```

Expected: one row whose address column reads `127.0.0.1:4111`. A `*:4111` means `MASTRA_HOST` never
reached the server and it is listening on every interface, LAN address included — with the tunnel up
that is two ways in where the design has one. A `[::1]:4111` means the value was spelled `localhost`:
the tunnel's HTTP origin names `127.0.0.1`, so the public hostname will answer `502` while this
command still looks like something is running. Either way, stop the server, fix `.env`, start it
again, and do not go on until the row reads `127.0.0.1:4111`.

No output at all is not a pass — it means nothing is bound to 4111. Either the server is not running,
or `PORT` was left unset and `npm run dev` drifted to 4112, which is the failure the `PORT` section
above describes: the server is fine, the tunnel is fine, and the public hostname answers `502`
because the two are pointed at different ports.

### 2 — nothing of this deployment listens off loopback

```bash
sudo lsof -nP -iTCP -sTCP:LISTEN | grep -vE '127\.0\.0\.1|\[::1\]'
```

`sudo` is not optional here. Unprivileged `lsof` lists only the invoking user's processes, and
`cloudflared` runs as root once `service install` has registered it, so without `sudo` the exact
listener class this check exists to rule out is the one it cannot see — and the check then passes for
the wrong reason.

Expected: no **TCP listener** belonging to this deployment — no `node`, no `cloudflared`, and neither
port `4111` nor `54329` anywhere in the output. Rows from unrelated macOS services do appear
(`rapportd`, `ControlCenter` and the like), and so does `limactl` on `*:53`, which is Colima's DNS for
its own VM rather than anything serving this deployment; the claim being checked is only that no TCP
listener of ours sits on a non-loopback address. This is also what makes a forwarded port harmless: a
router forwarding `4111` to this machine has nothing to deliver it to while every listener of ours is
on loopback — which is why the router's own table still has to be read directly, as the network
posture above says.

### 3 — cloudflared is outbound-only, on 7844

```bash
sudo lsof -nP -i -a -c cloudflared
```

Expected: outbound connections to a Cloudflare address on port `7844` are present and established —
QUIC over UDP by default, TCP if it fell back to HTTP/2. Other rows are normal and are not a fault:
`cloudflared` resolves names over DNS, talks to Cloudflare's API on `443`, and runs its own metrics
HTTP server, which shows up as a `LISTEN` row on a **loopback** address. The one thing that must not
appear is a `LISTEN` row on a **non-loopback** address — that would mean something here is accepting
connections from the network on the tunnel's behalf, which this design never does. No output at all
means the daemon is not running: check with `sudo launchctl list | grep cloudflared` and re-run the
install if it is absent.

### 4 — HTTPS sign-in answers through the tunnel

```bash
dig +short factory.kovalchuk.win
curl -sS -o /dev/null -w '%{http_code} %{remote_ip}\n' https://factory.kovalchuk.win/signin
```

Expected: `dig` returns Cloudflare addresses and never this network's public address — the name
resolves to Cloudflare, which is what makes the inbound path theirs rather than ours. No output from
`dig` means the record does not exist yet: the public hostname was never saved into the tunnel's
configuration, or the DNS record it generates has not propagated. Wait, repeat, and check the
hostname in the console before looking anywhere else — nothing further down this list can succeed
until the name resolves. `curl` then prints `200` followed by one of those same addresses.

Finish in the browser: open `https://factory.kovalchuk.win/signin`, sign in with the account from
`README.md` step 3, and land in the app with a session that survives a reload. Valid TLS with no
warning is part of the result — the certificate is Cloudflare's, issued for the zone, and nothing on
this host holds a key.

If `curl` reports `502`, the tunnel reached this host and found nothing at `127.0.0.1:4111`: back to
ingress checkpoint 1, and check the server is actually running. A `530` or a `1033` page means the
tunnel itself is not connected — ingress checkpoint 3.

Last, now that the origin is public, re-check the precondition this section opened with — through the
public origin rather than through loopback, because the public origin is the one strangers reach:

```bash
curl -s -w '\n%{http_code}\n' -X POST https://factory.kovalchuk.win/auth/api/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"probe","email":"probe@example.invalid","password":"<any 8+ characters>"}'
```

Expected: `400` carrying `EMAIL_PASSWORD_SIGN_UP_DISABLED` — the same single passing outcome
`README.md` step 3 defines, and every other result is read there. A `200` here is the one that cannot
wait: registration is open on a public hostname and the probe has just created a real account. Take
the origin down first (ingress teardown below), then delete that account and fix the source field
before bringing it back.

### The window between boot and login

`cloudflared` is a LaunchDaemon and starts at boot, before anyone logs in. The Factory Server does
not: Colima runs inside a login session, so the server comes up at login — by hand until the agents
in "Supervision — LaunchAgents" below are bootstrapped, and by launchd after that. Between the two
the tunnel is up with nothing behind it, and
`https://factory.kovalchuk.win` answers `502` from Cloudflare's own error page. That window is
expected and needs no action. A `502` that outlives it is ingress checkpoint 1's problem, not the
tunnel's.

## Ingress teardown

The way back to a deployment reachable only from this machine — needed when ingress checkpoint 4
fails and you do not want to debug in public, and needed immediately if the closed-registration
precondition turns out to have been violated. Stop serving the public hostname first; tidiness comes
after.

```bash
sudo cloudflared service uninstall
```

Then, in Cloudflare Zero Trust → **Networks → Tunnels**, delete the `factory` public hostname from
the tunnel, and in the dashboard's DNS view for `kovalchuk.win` delete the `factory` record that
hostname generated. `service uninstall` removes the connector from this host and leaves both of those
behind, so a hostname left mapped goes on resolving and answers `1033` rather than nothing at all.

Finally put `.env` back: `MASTRACODE_PUBLIC_URL=http://127.0.0.1:4111`, and
`MASTRACODE_CHANNELS_PUBLIC_URL` removed, since loopback is not an origin Slack can reach and a
fallback to it is the failure `apps/slack/README.md` describes. Restart the server. `MASTRA_HOST` and
`PORT` do not change here either — nothing about them was ever part of going public. Ingress
checkpoints 1 and 2 confirm the result, and `dig +short factory.kovalchuk.win` returning nothing
confirms the name is gone.

## Supervision — LaunchAgents

Everything above is started by hand. This section is the set of files that hands the job to `launchd`:
two LaunchAgents, a start wrapper, a log-rotation conf and an installer, all committed under `ops/` so
that supervision can be diffed and versioned rather than pasted out of a document. They are files, not
a running configuration — **nothing here is bootstrapped yet.** Committing them changes nothing about
what this host does at login.

**Agents, not daemons.** Colima runs inside a user login session. A LaunchDaemon starts at boot,
before any session exists, so a daemonised Factory would come up against a Docker socket that has not
been created and crash-loop until somebody logged in. `UserName` does not rescue that: it changes the
uid the process runs as, not the session it runs in. Both units are therefore **agents**, read from
`~/Library/LaunchAgents` and tied to the login session — which is also why a logout takes Factory down
with it.

Every path in both plists is written out in full. `launchd` passes `ProgramArguments`,
`EnvironmentVariables` and the log paths through verbatim and never expands `$HOME`, which is the same
trap the `DOCKER_HOST` section above describes: a plist written with `$HOME` in it points at a path
that is never created, and nothing reports the mismatch.

### The artifacts

- **`ops/launchagents/ai.mastra.colima.plist`** — the container engine. Runs
  `/opt/homebrew/bin/colima start` with the same `--cpu 12 --memory 32 --disk 200 --vm-type vz
  --mount-type virtiofs` sizing as the bring-up above, plus `--foreground`: that flag is what keeps
  `launchd` supervising the VM itself rather than watching a `colima start` invocation exit and
  treating its exit as the service ending. Explicit `PATH`, `RunAtLoad`, `KeepAlive`,
  `ThrottleInterval 30`; stdout and stderr to `colima.log` and `colima.err.log` under
  `~/Library/Logs/mastra-factory/`.

- **`ops/factory-start.sh`** — the wait. `launchd` has no dependency ordering: it starts both agents
  independently and will not sequence them, so the Factory side waits for Docker itself. The wrapper
  exports `DOCKER_HOST`, then polls for the socket **and** a succeeding `docker info` every 5 s,
  breaking as soon as both hold — a socket file on its own is not a running engine. The ten-minute
  bound is wall clock rather than a count of attempts, because a wedged engine can make a single
  `docker info` block for tens of seconds and a fixed number of tries would then promise ten minutes
  and deliver an hour, never reaching the exit that hands the retry back to launchd. The wall clock
  is only read between polls, though, and `docker info` has no client-side timeout of its own — an
  engine that accepts the connection and then never answers would block past the deadline for as long
  as it liked. So the probe itself is capped at 20 s by a watchdog (`timeout(1)` is not part of
  macOS), and a probe killed that way is reported as such rather than as a bare exit 143.
  The first time it is not ready it says so on stdout, naming which of the two conditions is
  blocking — no socket yet, or a socket that is there while `docker info` fails — so the branch is
  visible in `out.log` rather than inferred. On timeout it writes a diagnostic to stderr and exits non-zero, which hands the retry
  to the agent's 30 s throttle instead of letting the server crash-loop; that line reports the socket
  and the engine separately, since "Colima never created the socket", "the socket is there but the
  engine does not answer" and "`docker` is not on the baked `PATH`" (exit 127) need different fixes
  and `err.log` is the only trace. Then it `cd`s to the repo
  root and `exec`s `npm run start`, which stays the production entry point.

  It also sets the `PATH` that call runs under, rather than inheriting the plist's. `node` and `npm`
  come from nvm, which installs under `~/.nvm/versions/node/<version>/bin` — outside every system
  prefix a launchd agent's `PATH` would normally carry, and unreachable by `nvm use`, which is a shell
  function that does not exist in a session launchd started. So the wrapper names that directory
  itself, in `NODE_BIN`, and that one line is where the deployment's Node version is pinned. Left to
  the plist the agent gets `command not found: npm` on every spawn and crash-loops on its thirty-second
  throttle, with only that line in `err.log` to show for it — so the wrapper checks `NODE_BIN/npm` is
  executable before the `exec` and, unlike the docker wait, reports it as the permanent fault it is.

- **`ops/launchagents/ai.mastra.factory.plist`** — the server. Runs the wrapper under
  `/usr/bin/caffeinate -dimsu` so the host does not idle out from under a deployment that is serving.
  `WorkingDirectory` is the repo root; `PATH` is explicit because an agent inherits a minimal one and
  would find neither `docker` nor `git` — but not `node` either, which is the wrapper's job below and
  not this file's; `NODE_ENV=production`; `DOCKER_HOST` in the
  written-out spelling; `ProcessType Interactive`, because the throttled default gives agent work low
  CPU and IO priority; `RunAtLoad`, `KeepAlive` and `ThrottleInterval 30`, which keeps a bad `.env`
  out of a tight crash-loop. stdout and stderr to `out.log` and `err.log`.

  It names the wrapper at its repo path — `/Users/koval/dev/test/mastra-factory/ops/factory-start.sh`
  — and not a copy under `~/bin`. The repo copy is the only copy, so editing it here is the whole
  edit. The other side of that: moving this repo, or renaming the `start` script, is a change to the
  plist, the wrapper and the newsyslog conf at once.

- **`ops/newsyslog/ai.mastra.factory.conf`** — rotation, because `launchd` never rotates anything.
  Four rows, each on identical terms: `koval:staff 644 7 10240 * NJ`, seven generations of 10 MB, `N`
  for no process to signal and `J` for bzip2. Four and not three: a `--foreground` Colima writes most
  of its output to stderr, so `colima.err.log` is rotated alongside `out.log`, `err.log` and
  `colima.log` rather than being the one file left to grow until it fills the disk.

  **A known limit of the `N` flag.** macOS `newsyslog` rotates by rename and has no copy-truncate,
  and `man 5 newsyslog.conf` offers only signal-based notification — the flags are `B C D G J N U Z`
  and none of them runs a command. `launchd`, meanwhile, opens `StandardOutPath` and
  `StandardErrorPath` once when it spawns the job and holds the descriptor. So after the first
  rotation the running agent may go on writing into the renamed inode, which is then bzip2'd and
  unlinked: the symptom is a freshly created `out.log` that stays at zero bytes while the deployment
  is plainly serving, and the disk that log was using is not reclaimed until the agent is restarted
  and reopens the file. Restarting the agent is the remedy; there is no configuration that avoids it,
  since `N` and `J` are what this rotation is specified as. Whether it actually happens here is what
  recovery proof 4 below settles: it forces a rotation and reads the live log afterwards, both readings
  are results, and the one this host gave is written down in "Recovery limits" at the end of this file.

- **`ops/install.sh`** — placement, and nothing else. It creates `~/Library/Logs/mastra-factory/`
  (`launchd` does not create the log directory, and an agent whose log path is unwritable will not
  spawn), symlinks both plists into `~/Library/LaunchAgents`, and copies the conf to
  `/etc/newsyslog.d/ai.mastra.factory.conf` as `root:wheel` `644` with `sudo` — the elevation prompt
  is the operator's. It is safe to re-run, and it starts nothing.

### Linked plists, a copied conf

`launchd` follows a symlink in `~/Library/LaunchAgents` without complaint, and linking is what keeps
the repo copy canonical: edit the plist here, re-bootstrap the agent, done — there is never a second
copy to drift. `newsyslog` is the opposite case. Its conf has to be root-owned `644`, and a
root-read file that points into a user-writable repo is a privilege problem `newsyslog` may simply
refuse. So that one is copied, with the consequence that changing it means re-running the installer.

The installer also refuses to run from any checkout other than `/Users/koval/dev/test/mastra-factory`,
printing the expected and the actual root and installing nothing. Every path in both plists is
absolute and baked to that root, while a copy of this repo elsewhere — a worktree, say — carries
identical files; installing from one would link plists pointing at a different tree entirely, and
`launchd` would report nothing wrong. It refuses on a `$HOME` other than `/Users/koval` for the same
reason, since the plists bake their log paths under that home; it checks that all four artifacts are
present and that the wrapper is still executable before placing anything, because `ln -sfn` will
happily install a dangling link; and it takes elevation up front rather than at the last step, so a
declined `sudo` leaves nothing half-placed.

### Before bootstrapping

Three things have to be true before either agent is started, and none of them is checked by anything:

- **`npm run build` has been run, and re-run since the last source change.** `npm run start` is
  `varlock run -- mastra start`, and `mastra start` never builds: it resolves `.mastra/output` and
  throws `Output directory … does not exist` if it is absent
  (`node_modules/mastra/dist/index.js:4845-4848`). `.mastra/` is gitignored, so a fresh checkout has
  no build at all. Bootstrapping without one is a 30-second crash-loop on `ThrottleInterval`, and its
  only symptom is that one line repeating in `err.log`. A *stale* build is worse, because it serves
  perfectly well and reports nothing — `start` never rebuilds.
- **Stop any Colima started by hand first** (`colima stop`). The bring-up section above tells the
  operator to run `colima start` in a shell; from here on the Colima agent owns the VM, and two
  owners of one VM is not a state either of them reports.
- **Run the installer directly, as zsh** — `ops/install.sh` from the repo root, not `sh
  ops/install.sh`. It uses zsh-only expansions (`${0:A:h}` is how it finds the repo root it then
  refuses to be wrong about), and under `sh` that resolves to nothing useful.

### What is not done here

Nothing is running. Committing these files changes what this host *can* do at login, not what it
does: until `ops/install.sh` has placed them and `launchctl` has been told to load them, `launchctl
list` knows no `ai.mastra.*` job and a logout still ends the deployment for good. Bootstrapping the
two agents with `launchctl bootstrap`, confirming the conf with a `sudo newsyslog -nvv` dry run, and
applying the host's power and session behaviour are operator steps that these files make possible and
do not perform — "Bringing the agents up" below is the order they are performed in, and "Supervision
checkpoints" is how each of them is proven. Proving that any of it comes *back* on its own — after a
killed process, after a logout, after a rotation — is handed over the same way, to "Recovery proofs" and
"Recovery limits" at the end of this file.

## Bringing the agents up

Every step here is an action on this host rather than a change in the repository: an installer that
takes elevation, two `launchctl` calls that mean nothing outside a login session, a `pmset` line and a
`defaults write`. None of it happens by merging anything, and all of it is the operator's.

Confirm the three items under "Before bootstrapping" above first — a `npm run build` newer than the
last source change, no Colima started by hand (`colima stop`), and the installer run as zsh. Nothing
checks any of them, and each fails *after* the bootstrap rather than during it: as one line repeating
in `err.log` on a 30-second throttle, as two owners of one VM that neither of them reports, or as a
`${0:A:h}` that expanded to nothing.

Stop any Factory server you started by hand as well, for the same reason one level up: `## Bring-up`
and the tunnel section above both tell you to run one, and a server still holding `4111` leaves the
Factory agent failing on `EADDRINUSE` and looping on its 30-second throttle while supervision
checkpoint 3 passes against the process *you* started — a green checkpoint over a dead agent.

Then, from the repository root:

```bash
# 1 — place the files: log directory, both plists, the rotation conf
ops/install.sh
ls -ld ~/Library/Logs/mastra-factory
ls -l ~/Library/LaunchAgents/ai.mastra.*

# 2 — hand the two jobs to launchd
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.factory.plist

# 3 — the host stays awake on AC, and comes back after a power loss
sudo pmset -c sleep 0 disablesleep 1 autorestart 1 powernap 0

# 4 — one login session only
sudo defaults write /Library/Preferences/.GlobalPreferences MultipleSessionEnabled -bool false
```

Do not move past a step whose supervision checkpoint below does not hold.

The two `ls` lines are step 1's own readback, because three of the four things the installer places get
no checkpoint of their own below. Expected: a directory, and two entries in `~/Library/LaunchAgents`
that are symlinks — `ai.mastra.colima.plist` and `ai.mastra.factory.plist`, each `->` its file under
this repo's `ops/launchagents/`. A `No such file or directory` from either line means the installer
did not run, or ran somewhere it refused; a plist entry that is a regular file rather than a link is a
copy from somewhere else and will drift. The fourth thing it places, the conf, is supervision
checkpoint 4.

**Why the installer comes first, and not as tidiness.** `launchd` opens `StandardOutPath` and
`StandardErrorPath` when it spawns a job, and it does not create the directory they live in. An agent
whose log path is unwritable therefore does not run at all — that is a spawn failure, not a job
running without logs, and its only trace is a non-zero last exit status in `launchctl list`.
`~/Library/Logs/mastra-factory/` is the directory `ops/install.sh` creates, which is the whole reason
step 1 is step 1. The installer is also what puts the two plists into `~/Library/LaunchAgents` in the
first place, so before it has run `bootstrap` has no file to name.

`ops/install.sh` asks for `sudo` once, before it places anything. That prompt is
`/etc/newsyslog.d/ai.mastra.factory.conf` and nothing else — every other thing the installer does is
inside your own home and needs no elevation — and it comes up front so a declined password leaves
nothing half-placed. Re-running the installer is safe, and it is how a change to any of the five
artifacts is re-applied; a changed conf in particular is picked up *only* by re-running it, since that
is the one file copied rather than linked.

**What `bootstrap` does.** `gui/$(id -u)` is the login session's domain, so both jobs are registered
against the session rather than against the shell you typed the command in: the registration outlives
that terminal and is read again at the next login, which is the entire point of the exercise.
`RunAtLoad` means each job also starts immediately. Colima is bootstrapped before Factory for
readability only — `launchd` sequences nothing, and what actually resolves the ordering is
`ops/factory-start.sh` waiting for the socket.

**The `pmset` line.** Four settings in one command, landing in two different places: `sleep`,
`powernap` and `autorestart` in the AC power block that `pmset -g custom` prints, and `disablesleep`
as the system-wide `SleepDisabled` that only `pmset -g` shows. `-c` scopes the three per-source ones
to AC power, which is the only state this deployment is expected to serve in. `autorestart 1` is the
one that may not take: not every Apple silicon machine accepts it, and one that does not simply shows
no `autorestart` row afterwards and reports nothing at either end. That is a fact about the hardware
to record, not a command to run again — supervision checkpoint 5 is where it is read.

**Fast user switching.** `MultipleSessionEnabled` does not exist on this host until step 4 writes it,
and an absent key is indistinguishable from a deliberately disabled one. It is written explicitly for
that reason rather than left to a default. What it buys is one failure mode removed: both units are
agents tied to a login session, so a second session — and specifically that session logging out —
takes the Factory agent down with it.

**The way back.** `launchctl bootout` unregisters a job and is the exact inverse of step 2. Factory
first, so the server stops before the engine underneath it does:

```bash
launchctl bootout gui/$(id -u)/ai.mastra.factory
launchctl bootout gui/$(id -u)/ai.mastra.colima
```

That undoes the registration and nothing else: the symlinks, the conf, the log directory and the
`pmset` settings all stay, and a bootout lasts only until the next login, because the login session
reads `~/Library/LaunchAgents` again. To make it stick, unplace what the installer placed:

```bash
rm ~/Library/LaunchAgents/ai.mastra.colima.plist ~/Library/LaunchAgents/ai.mastra.factory.plist
sudo rm /etc/newsyslog.d/ai.mastra.factory.conf
```

Those two remove the symlinks and the rotation conf; the log directory and its contents are left
alone, and so are the `pmset` and fast-user-switching settings, which are host settings rather than
part of this deployment — reverse them deliberately if you want them back, they are not undone here.
With both jobs out, `colima start` and `npm run start` by hand work again exactly as the bring-up
above describes.

## Supervision checkpoints

These are numbered independently of the container-engine checkpoints and of the ingress checkpoints
above; every reference to them says "supervision" for that reason.

Supervision checkpoint 1 is the only one that is meaningless before the bootstrap — there is nothing
for it to report until step 2 has run. Supervision checkpoints 5 and 6 read host settings that have
nothing to do with `launchd` — run them before steps 3 and 4 as well as after, because the reading
beforehand is what separates a setting you applied from one that was already there. Supervision checkpoints 2 and 3 are worth running before the bootstrap too, and they
should *fail* then: with the hand-started Colima stopped and no server running, a socket that answers
or a bound `4111` means something you did not bootstrap is still up, and every result they give
afterwards would be crediting `launchd` with somebody else's work. Supervision checkpoint 4's first
command needs `ops/install.sh` to have run, but neither agent.

### 1 — both agents are registered, and neither is looping

```bash
launchctl list | grep ai.mastra
```

Expected: two rows, `ai.mastra.colima` and `ai.mastra.factory`, each with a real pid in the first
column and `0` in the second. That second column is the *last exit status*, so a `0` beside a live pid
is a job that is running and has not died yet in this session.

A `-` in the pid column with `78` beside it is the usual failure and it is not a crash: `78` is
`EX_CONFIG`, launchd refusing the property list itself. A pid that is different every time you run
this, with a non-zero status, is a job dying and being restarted on its `ThrottleInterval 30` — find
which one, then read its log: `err.log` for Factory, `colima.err.log` for Colima, both under
`~/Library/Logs/mastra-factory/`. `launchctl print gui/$(id -u)/ai.mastra.factory` prints the full
record, including the path launchd resolved the symlink to.

Exactly one row means one of the two `bootstrap` calls did not take. Re-run that call on its own and
read its stderr — `bootstrap` reports its refusal there and then exits, and the message is the whole
diagnosis. Re-running it against a job that *is* already loaded is an error too, and a harmless one:
`bootout` that job first if you want a clean re-registration, or use
`launchctl kickstart -k gui/$(id -u)/<label>` when all you want is to restart it.

No output at all means neither job is loaded: step 2 has not run, or it ran in a different session.

### 2 — Colima owns the VM

```bash
test -S "$HOME/.colima/default/docker.sock" && \
  DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" docker info >/dev/null && echo ok
```

Expected: prints `ok`. `DOCKER_HOST` is given explicitly rather than relied on from a docker context,
because the context on this host points at whatever `colima start` last activated and the claim being
checked is that *this* socket answers. Allow a few minutes after the bootstrap: a first
`colima start` provisions the VM, and the agent carries the same sizing flags as the bring-up above.

No socket after several minutes is a failure to read in `colima.err.log` rather than `colima.log` — a
`--foreground` Colima writes most of its output to stderr. If `colima status` instead reports a VM you
started in a shell earlier, that is the two-owners state "Before bootstrapping" warns about: `bootout`
both agents, `colima stop`, and start again from step 2.

### 3 — Factory waited, then served

```bash
lsof -nP -iTCP:4111 -sTCP:LISTEN
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4111/signin
grep -F '[factory] waiting up to' ~/Library/Logs/mastra-factory/out.log
```

Expected: one row whose address column reads `127.0.0.1:4111`, then `200`. Check the row's pid against
the one supervision checkpoint 1 reports for `ai.mastra.factory`: if they differ, what is answering on
`4111` is a server somebody started by hand, the agent is failing on `EADDRINUSE` behind it, and this
checkpoint is green over a job that is not running.

The `grep` is the wait itself — `ops/factory-start.sh` prints `[factory] waiting up to 600s …` the
first time the socket is not yet there, naming which of the two conditions is blocking, and
`[factory] docker socket is up — starting the server` when it clears. No matching line in the *current*
`out.log` is not a failure: either Colima had the socket up before the Factory agent reached it and
the wrapper had nothing to wait for, or the line has aged out — `out.log` rotates at 10 MB, so on a
host that has been up for a while check the generations too with
`bzgrep -F '[factory] waiting up to' ~/Library/Logs/mastra-factory/out.log.*.bz2` before concluding
anything from its absence.

The failures read as follows. Run before step 1, as the preamble directs, the third command reports
`grep: …/out.log: No such file or directory` — neither the log directory nor the file exists until the
installer and the bootstrap have created them, and that reading is expected at that point rather than
a fault. `Output directory … does not exist` repeating in
`~/Library/Logs/mastra-factory/err.log` is the missing `npm run build` from "Before bootstrapping" —
build, then `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`. A `*:4111` row where
`127.0.0.1:4111` belongs is the `MASTRA_HOST` failure that ingress checkpoint 1 above already
diagnoses, and it is read there rather than here. `[factory] docker not ready after 600s` in `err.log`
means the wrapper gave up and handed the retry back to launchd; the two lines after it report the
socket and the engine separately, and supervision checkpoint 2 is where that is pursued.

A `502` from `https://factory.kovalchuk.win` while this checkpoint passes on loopback — in particular
after a restart, before anyone has logged in — is "The window between boot and login" above, and needs
no action.

### 4 — rotation is in force

```bash
ls -l /etc/newsyslog.d/ai.mastra.factory.conf
sudo newsyslog -nvv | grep mastra-factory
```

Expected: `-rw-r--r--` owned by `root  wheel`, then four rows — one each for
`/Users/koval/Library/Logs/mastra-factory/out.log`,
`/Users/koval/Library/Logs/mastra-factory/err.log`,
`/Users/koval/Library/Logs/mastra-factory/colima.log` and
`/Users/koval/Library/Logs/mastra-factory/colima.err.log`. Four and not three:
`ops/newsyslog/ai.mastra.factory.conf` rotates Colima's stderr as well, and
`docs/self-hosting-research.md` §7.4 references that conf by path rather than reproducing it. The
committed conf is what the installer copies, so four is the number to expect here.

`-n` makes this a dry run that rotates nothing, which is what makes it safe to run at any point. Each
row reads either `--> will trim at <date>` or `does not exist, skipped`. Before the agents have ever
run, all four say `does not exist, skipped` and that is correct — launchd creates the files when it
spawns the jobs. Once supervision checkpoint 1 passes it is a real failure: `does not exist, skipped`
against a log that is plainly being written means the conf names a path no plist writes, so nothing
rotates that file and it grows until the disk is full.

No output at all from the second command — not four rows, not one, nothing matching `mastra-factory`
— means `newsyslog` is not reading this conf: it is absent from `/etc/newsyslog.d` altogether, which
is the likeliest failure before the first successful install. Re-run `ops/install.sh`, and confirm
with the `ls -l` above rather than by assuming it worked the second time.

Note what this checkpoint does *not* prove. It shows that the conf is installed and that `newsyslog`
reads all four paths; it does not show that a rotation, once it fires, leaves the live log still being
written. "The artifacts" above records why that is an open question — `N` gives no process to signal,
launchd holds the descriptor it opened at spawn, and the symptom would be a freshly created zero-byte
`out.log` while the deployment is plainly serving, cured by restarting the agent. Proving that on this
host is recovery proof 4's business, not this one's — it forces a trim and reads what the live log does
afterwards, which is the only way to find out.

Ownership is the other half, and its failure is silent. The conf is read by a root process out of a
root-owned directory, which is why "Linked plists, a copied conf" above has this one file copied
rather than symlinked into a user-writable repo. Anything other than `root  wheel` `644` means it did
not come from `install -o root -g wheel -m 644` — re-run `ops/install.sh`.

### 5 — the host stays awake

```bash
pmset -g custom
pmset -g | grep SleepDisabled
```

Expected: under `AC Power`, `sleep 0`, `powernap 0` and `autorestart 1`; then `SleepDisabled 1`. Two
commands because the four settings land in two places — `disablesleep` is system-wide and is reported
as `SleepDisabled` outside either power block, while the other three are per-source and only `-c`, AC,
was set. The `Battery Power` block is untouched by design and is not part of this check.

`SleepDisabled 0`, or no `SleepDisabled` row under "System-wide power settings" at all, means
`disablesleep 1` did not take and the machine can still be put to sleep — that one is not
hardware-optional, so re-run the `pmset` line and read it back rather than recording it.

An AC block that reads `sleep 0` and `powernap 0` with no `autorestart` row at all is the outcome to
expect on hardware that does not support it. Record that and move on: the command was applied, the
machine took the part of it that it takes, and running it again changes nothing. Do not read
`Currently in use:` as the answer either — it reflects whatever assertion happens to be live at that
moment (`caffeinate` from the Factory agent, a screen-sharing session) and says nothing about what was
configured.

### 6 — one session only

```bash
defaults read /Library/Preferences/.GlobalPreferences MultipleSessionEnabled
```

Expected: `0`. `The domain/default pair … does not exist` means step 4 has not run. The effective
behaviour of an absent key is much the same, but nothing distinguishes "deliberately disabled" from
"never touched", which is why the key is written rather than assumed. Anything other than `0` is fast
user switching still enabled, and what that costs is one line: both units are login agents, so a
second session logging out takes the Factory agent down with it.

A `0` here proves the preference was written, not that the behaviour has changed yet: the login window
reads this key at login, so the change takes effect at the next one. The observable is the fast
user-switching control disappearing from the menu bar — check for that after the next login rather
than expecting anything to move now.

## Recovery proofs

These are numbered independently of the container-engine checkpoints, the ingress checkpoints and the
supervision checkpoints above; every reference to them says "recovery proof" for that reason.

**All six supervision checkpoints must hold before the first of these runs.** Every proof below reads a
*change* against a known-good state — a pid that moved, a line that appeared in `out.log`, a compressed
generation that was created — and a change read against a deployment that was never properly up is
evidence of nothing. A `200` after a kickstart says the agent restarted the server only if the server was
the agent's to begin with, which is exactly what supervision checkpoints 1 and 3 establish.

**Unlike a checkpoint, each of these changes host state.** A checkpoint observes and leaves everything
where it was, which is what makes them safe to run at any point; a recovery proof breaks something on
purpose and then reads the return. Recovery proof 1 kills the server, recovery proof 2 logs the session
out, recovery proof 3 unregisters both agents and stops the engine, recovery proof 4 rotates a live log,
and recovery proof 5 restarts the machine. None of them is safe to run while this deployment is serving
anything that matters: expect `https://factory.kovalchuk.win` to answer `502` for part of every one of
them, and run the set when no Factory work is in flight and nobody is signed in through the tunnel.

Recovery proofs 1 to 4 are the ones this deployment is required to pass. Recovery proof 5 is the
planned-restart path and is recommended rather than required, for the reason its own section gives.
Several of them have more than one passing reading; "Recovery limits" below is where the one this host
gave is written down.

### 1 — a killed agent comes back unaided

Record the current state first — the pid is the whole measurement:

```bash
launchctl list | grep ai.mastra
```

Keep the number in the first column of the `ai.mastra.factory` row. Then kill that job and let `launchd`
start it again:

```bash
launchctl kickstart -k gui/$(id -u)/ai.mastra.factory
```

`-k` kills the running instance before restarting the service, so this is a real process death rather
than a reload: what brings the server back is the plist's `KeepAlive`, the same thing that covers a
crash. Using `kickstart -k` instead of killing the pid by hand only makes the death happen on demand.

Allow a minute before reading anything. `ThrottleInterval 30` lets `launchd` hold the restart for up to
thirty seconds, and the server needs several more to bind `4111`. Then:

```bash
launchctl list | grep ai.mastra
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4111/signin
```

Expected: the `ai.mastra.factory` row carries a **different** pid from the one recorded above, and `curl`
prints `200` — with nothing else typed. No `npm run start`, no `bootstrap`, no browser. The
`ai.mastra.colima` row is unchanged, pid included: this proof does not touch the engine.

The pid and the `200` are the whole pass criterion here; the second column is not. It is the job's *last
exit status*, and `man launchctl` (`list`) records that a negative number in it is the negative of the
signal that stopped the job — `-15` for `SIGTERM`. A `kickstart -k` is a kill, so that column reports the
kill **you** just performed, beside a perfectly healthy new pid. Ordinary system jobs on this host sit at
a negative status for the same reason, so do not read one as a fault.

How it reads when it goes wrong. A `-` in the pid column is a job that is not running at all — read
`~/Library/Logs/mastra-factory/err.log`, where a `.mastra/output` left stale or absent by a missed
`npm run build` is the usual cause and repeats one line every thirty seconds. A pid that is different
again every time you re-run the command is the same fault seen from the other side: `KeepAlive`
restarting a job that keeps dying. A pid that has *not* changed means the
kickstart never reached the job — check the label, because `launchctl` answers a job name it does not
know with a bare `No such process` and nothing else.

Because the engine never stopped here, `ops/factory-start.sh` finds the socket on its first poll and
prints neither of its two wait lines. That is correct, and it is why recovery proof 3 has to create the
wait deliberately.

### 2 — a login brings the whole deployment back

Record both pids first, exactly as in recovery proof 1 — there is nothing to compare against afterwards
otherwise:

```bash
launchctl list | grep ai.mastra
```

Then log out fully — Apple menu → **Log Out** — and log back in.

It has to be a real logout. A locked screen, a closed lid or a quit terminal leave the session and both
agents exactly where they were and prove nothing. The `gui/$(id -u)` domain is torn down at logout and
`~/Library/LaunchAgents` is read again at the next login, and that round trip is the thing being proven.

Allow several minutes after logging back in. Colima is starting a VM from cold — the same multi-minute
start the bring-up section above warns about — and `ops/factory-start.sh` is waiting on it. Then:

```bash
launchctl list | grep ai.mastra
```

Expected: both rows are back, `ai.mastra.colima` and `ai.mastra.factory`, each with a pid different from
the one recorded above and `0` in the second column — a fresh login session's jobs have not died yet, so
here the `0` is real. Finish in a browser rather than with `curl`, because the public path is what this
proof is about: open `https://factory.kovalchuk.win/signin` and sign in, unaided — nothing started by
hand, nothing bootstrapped.

Two different `502` windows meet here and only one of them is already recorded above. "The window between
boot and login" is the *boot* case: `cloudflared` is a LaunchDaemon and comes up before anyone logs in,
so the tunnel serves with nothing behind it until a login starts the agents. The logout→login window is
not that one: nothing rebooted, `cloudflared` never stopped, and what its `502` covers is Colima
provisioning and the wrapper waiting on the socket. Both are expected, and both clear on their own.

How it reads when it goes wrong. A `502` still there after ten minutes has outlived the wait the wrapper
is allowed, and `[factory] docker not ready after 600s` in `err.log` says so in as many words —
supervision checkpoint 2 is where the engine side is pursued. A `502` while supervision checkpoint 3
passes on loopback is not this proof's failure at all: the server is up and the tunnel is the problem,
which is ingress checkpoints 3 and 4. One row instead of two means only one agent came back — read
`launchctl print gui/$(id -u)/ai.mastra.colima` and the two Colima logs.

### 3 — the wrapper waits, visibly

The ten-minute wait in `ops/factory-start.sh` exists for the window where `launchd` starts Factory before
Docker is up. Waiting for an ordinary login to show it is a race that usually resolves the other way, and
its absence then proves nothing — so create the condition instead, by bootstrapping the two agents out of
order with the engine stopped.

Take everything down first:

```bash
launchctl bootout gui/$(id -u)/ai.mastra.factory
launchctl bootout gui/$(id -u)/ai.mastra.colima
colima stop
test -S "$HOME/.colima/default/docker.sock" || echo socket absent
```

That last line is the precondition rather than a formality: the proof means nothing unless the socket is
genuinely gone. Then bootstrap **Factory alone**:

```bash
n=$(wc -l < ~/Library/Logs/mastra-factory/out.log)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.factory.plist
sleep 15
tail -n +$((n+1)) ~/Library/Logs/mastra-factory/out.log | grep -F '[factory] waiting up to'
launchctl list | grep ai.mastra.factory
```

Record the line count and read only past it, both here and below — stay in the same shell so `$n` is
still set when the second grep runs. `launchd` opens `out.log` append-only
and never truncates it across spawns, and recovery proof 2 — a cold logout→login — necessarily wrote
both of these lines into that same file; a bare `grep` would match those and report this proof passed on
a run where the wait branch never executed, which is the exact ambiguity it exists to remove.

Expected: one line reading `[factory] waiting up to 600s for the Colima docker socket at
/Users/koval/.colima/default/docker.sock` — the no-socket branch, named as such — and a single row with a
real pid and `0` beside it. Re-run the `launchctl list` a few times over the following minute: the pid
must stay the same. A job that *holds* is the point. A pid that keeps changing would mean the wrapper
exited and launchd restarted it, which at this stage is a fault and not a wait.

Then, still inside the ten minutes, bring the engine up the way it comes up at login:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.colima.plist
```

and watch the wait clear, allowing the VM its several minutes:

```bash
tail -n +$((n+1)) ~/Library/Logs/mastra-factory/out.log | grep -F '[factory] docker socket is up'
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4111/signin
```

Expected: `[factory] docker socket is up — starting the server`, then `200`. Both agents are registered
again, which is also how this proof puts the host back — confirm with supervision checkpoint 1 before
going on to recovery proof 4.

Both printed lines are gated on the same flag inside the wrapper: it announces once, the first time it
finds the engine not ready, and it prints the clearing line **only if** it announced. So against an
engine that was already up — after a `launchctl kickstart -k`, or at a login where Colima won the race —
neither line appears at all, and their absence is a failure of nothing. That is the whole reason this
proof forces the branch rather than reading `out.log` after an ordinary start.

How it reads when it goes wrong. The other wait line — `socket … is present, but docker info exits …` —
means the socket file survived `colima stop` while the engine behind it did not answer. The branch was
still exercised, but record it, because that is the state supervision checkpoint 2 exists for.
`[factory] docker not ready after 600s` in `err.log` means the ten minutes ran out, which is what happens
if the Colima bootstrap is left too late: the wrapper exited non-zero and handed the retry to the agent's
thirty-second throttle. That is the *designed* failure, not a crash-loop — bootstrap Colima, and the next
spawn of the wrapper waits again and then clears.

### 4 — rotation fires and the live log survives

Both agents have to be running and serving for this one — supervision checkpoints 1 and 3 — because the
question is what happens to a log that is *being written* when it is rotated out from under its writer.

Record what is in the log directory now:

```bash
ls -l ~/Library/Logs/mastra-factory/
```

Then force a trim, scoped to one file:

```bash
sudo newsyslog -F -v /Users/koval/Library/Logs/mastra-factory/out.log
```

Three parts of that command are deliberate. `-F` forces the trim regardless of size or age, which is the
only way to see a rotation that would otherwise wait for 10 MB. The trailing path **restricts the run to
logs matching it** — without it, `-F` trims every log named by `/etc/newsyslog.conf` and by everything in
`/etc/newsyslog.d/`, this host's own logs included. And no `-f` is passed, so what is exercised is the
*installed* conf at `/etc/newsyslog.d/ai.mastra.factory.conf`; pointing `newsyslog` at the repo copy
instead would prove a file that rotates nothing at 3 a.m. Write the path out in full, spelled as the conf
spells it, rather than abbreviated with `~`.

Expected from the command: a verbose line naming that one file, and no other `mastra-factory` log
touched. Then:

```bash
ls -l ~/Library/Logs/mastra-factory/
bzcat ~/Library/Logs/mastra-factory/out.log.0.bz2 | tail -n 5
```

Expected: `out.log.0.bz2` now exists — `.bz2` because the conf's flags are `NJ` and `J` is bzip2 — and
`bzcat` prints readable server output, the tail of what the log held before the trim. That pair is the
required result: rotation fires, and the rotated generation is intact and compressed.

Now the live log, which has two passing readings. Ask the descriptor rather than the file size: an idle
deployment writes nothing to stdout either way, so a log that is not growing separates nothing, and the
two readings differ in exactly one observable — which file the job's stdout is still attached to.

```bash
pid=$(launchctl list | awk '$3 == "ai.mastra.factory" { print $1 }')
lsof -p "$pid" -a -d 1
ls -l ~/Library/Logs/mastra-factory/out.log
```

`-d 1` is that job's stdout — the descriptor `launchd` opened from `StandardOutPath` when it spawned the
job. Ask about the pid `launchctl list` reports and not the server's: the node process is a child that
inherited this descriptor rather than opening it. Read the NAME column:

- **It names the live `/Users/koval/Library/Logs/mastra-factory/out.log`.** The descriptor followed the
  path, the limit recorded under "The artifacts" above does not bite on this host, and there is nothing
  further to do. A size that grows while the deployment is being used corroborates it, but it is the
  NAME that decides.
- **It names anything else** — the rotated path, or the same path reported as deleted. That is the
  limit, confirmed rather than refuted: `N` gives `newsyslog` no process to signal, `launchd` holds the
  descriptor it opened when it spawned the job, and the agent is still writing into the renamed inode
  that has since been bzip2'd and unlinked, which is what leaves the freshly created `out.log` at zero
  bytes. It is a result, not a failed proof. The remedy is to make `launchd` reopen the path:

  ```bash
  launchctl kickstart -k gui/$(id -u)/ai.mastra.factory
  ```

  which also releases the unlinked inode and gives back the disk it was holding. Re-run the `lsof`
  afterwards — with the new pid — and fd 1 must name the live `out.log`. Note that this is recovery
  proof 1 run for a different reason.

Record which of the two occurred in "Recovery limits" below. That is the point of this proof, and the
reason it does not demand the first reading.

How it reads when it goes wrong. No `out.log.0.bz2` at all, and no verbose line for the file, means
`newsyslog` matched nothing: the path argument is spelled differently from the conf row, or the conf is
not installed — supervision checkpoint 4. An uncompressed `out.log.0` straight after the trim is not yet
a fault: `newsyslog` forks a child to do the `J` compression, so give it a few seconds and `ls` again.
Only an `out.log.0` that is *still* uncompressed then means the `J` flag is not in force, so what sits in
`/etc/newsyslog.d/` is not the committed conf; re-run `ops/install.sh`. A run that
rotates `err.log`, `colima.log` or `colima.err.log` as well means the path argument was dropped from the
command, and the rest of this host's logs were trimmed with them.

### 5 — a planned restart survives FileVault (recommended, not required)

The four proofs above cover what this deployment has to survive unattended. A *restart* is the case they
do not reach, and under FileVault it is not an ordinary one: the volume is locked until somebody
authenticates at the pre-boot screen, so a plain `sudo reboot` ends with the machine sitting at that
screen with nothing running at all. "Recovery limits" below is what that costs. This proof is the one
path past it.

```bash
fdesetup supportsauthrestart
```

Expected: `true`. Read it even if the restart itself is not run — `false` means the planned-restart path
does not exist on this hardware and "Recovery limits" has to promise less.

Then, when an interruption is acceptable:

```bash
sudo fdesetup authrestart
```

It asks for a password that can unlock the volume, stashes an unlock key and launches `shutdown(8)`. The
machine then comes back past the pre-boot screen with nobody at the keyboard, and stops at the login
window: the volume is unlocked, but the session that the agents live in is not started until somebody
logs in. Log in, and read supervision checkpoints 1 to 4 — recovery proof 2 is the same readback, with
the same expected timings and the same `502` window while Colima provisions.

Two things the man page is explicit about, and both belong in the record. FileVault protections are
**reduced** while the key is stashed: `fdesetup` deliberately keeps at least one additional copy of a
permanent FDE unlock key in system memory and, on supported hardware, in the SMC, until the unlock
completes. And `-delayminutes` arms the same thing without restarting now — `0` means immediately, `-1`
means never — so `sudo fdesetup authrestart -delayminutes -1` leaves the machine armed and waiting, which
also leaves it in that reduced state for as long as it stays armed. Use the plain form unless there is a
reason not to.

How it reads when it goes wrong. A machine that stops at the pre-boot FileVault screen anyway means the
authenticated restart did not take: the man page notes the command "may not work on all systems", and a
`true` from `supportsauthrestart` is not a guarantee — it reports hardware support and says nothing about
whether the unlock will be accepted. Record that outcome, because it changes what "Recovery limits" can
promise: with no working `authrestart`, every restart needs a human at this keyboard. A machine that
comes back to the **login window** with no pre-boot prompt is the success case — the volume unlocked
unaided, and the login that follows is what starts the agents, which is the same login recovery proof 2
already proves.

## Recovery limits

What the proofs above establish is bounded, and the boundary is worth stating as plainly as the proofs.
This section is normative here rather than a pointer at `docs/`: it is what this deployment does **not**
recover from, and the operator's expectation is set by it.

**An unplanned reboot needs a human at this keyboard.** FileVault is on. Until someone authenticates at
the pre-boot screen the volume is locked, and while it is locked there is no login session, no
LaunchAgents, no LaunchDaemons — `cloudflared` included — no SSH and no Screen Sharing. Remote recovery
is impossible by design, and auto-login is not a way around it: macOS does not offer auto-login while
FileVault is enabled. Every proof above assumes a machine that is already unlocked and logged in, because
that is the only state in which any of this runs.

**Planned restarts go through `sudo fdesetup authrestart`.** It is the one path that gets past the
pre-boot screen without a person in front of it, and recovery proof 5 is how it gets read on this host.
It carries the reduced-protection window the man page describes — an extra permanent FDE unlock key held in
system memory and, on supported hardware, in the SMC, until the unlock completes — so it is a deliberate
act rather than the default way to reboot, and `-delayminutes -1` arms it without restarting and holds
that window open for as long as it stays armed.

**A kernel panic or a hardware fault is the accepted residual risk.** Either one lands in the unplanned
case above and needs physical access. Nothing in this repository changes that and nothing is meant to: it
is accepted, not mitigated. A power cut is largely not in that class — this is a laptop and its battery
is the UPS. Note what `autorestart 1` from "Bringing the agents up" does and does not buy for a cut that
outlasts the battery: on hardware that takes the setting at all (supervision checkpoint 5) it powers the
machine back on, and that is where it stops — the boot then reaches the pre-boot FileVault screen like
any other unplanned one, so it still ends in the paragraph above. macOS updates are avoidable in the same
spirit: patch deliberately, at a time when somebody is here to log back in.

**Rotation and the held descriptor.** Recovery proof 4 settles which of the two readings under "The
artifacts" is the real one on this host, and recovery proof 5 settles whether the planned-restart path
this section promises actually works here. Record both outcomes below, with dates, so that the next
operator does not have to force a rotation or a restart to find out:

> Recovery proof 4, first run on _date_: _record one_ — after the forced trim, the Factory job's fd 1
> still named the live `out.log` / named the rotated file, so `out.log` stayed at zero bytes and needed
> `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory` to reopen it.
>
> Recovery proof 5, first run on _date_: `fdesetup supportsauthrestart` printed _true/false_;
> `sudo fdesetup authrestart` was _run/not run_, and the machine _came back to the login window unaided /
> stopped at the pre-boot screen_.

If it is the second, then every rotation — of `out.log`, `err.log`, `colima.log` and `colima.err.log`
alike, whenever one of them passes 10 MB — leaves the agent that writes it going on into an unlinked
inode until it is restarted, and the disk that generation was using is not reclaimed until then either.
The remedy is per log, because it is the job holding the descriptor that has to reopen the path:
`out.log` and `err.log` are the Factory agent's, so
`launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`; `colima.log` and `colima.err.log` are the engine
agent's, so `launchctl kickstart -k gui/$(id -u)/ai.mastra.colima`, which the Factory kickstart does not
touch. No configuration
avoids it: `N` and `J` are what this rotation is specified as, macOS `newsyslog` has no copy-truncate,
and none of its flags runs a command.

**The window between boot and login is not recovered, only waited out.** "The window between boot and
login" above records the boot case and recovery proof 2 the logout→login one. In both, the tunnel is up
and answering `502` with nothing behind it, and nothing on this host shortens the gap: these are agents
precisely because Colima needs a login session, and a daemon would crash-loop against a socket that
cannot exist yet.

**Fast user switching stays off.** Both units are login agents, so a *second* session logging out takes
the Factory agent down with it — a failure recovery proof 2 cannot reveal, because a single logout and
login never creates a second session. `MultipleSessionEnabled` is written `false` in "Bringing the agents
up" step 4 and read back by supervision checkpoint 6; leave it that way.
