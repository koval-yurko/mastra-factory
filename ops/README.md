# Host infrastructure

The operator-plane subject for the infrastructure this host runs underneath the Factory Server. Two
things live here: the Docker engine and the Postgres service `docker-compose.yml` describes, and the
Cloudflare Tunnel that makes this deployment reachable from the internet. This file is normative for
what `DOCKER_HOST`, `MASTRA_HOST`, `PORT` and `MASTRACODE_PUBLIC_URL` must contain and how to obtain
them, and for the order the bring-up commands run in.

`.env.schema` is the list of keys. `README.md` ("Configure your Factory") states what the three
`POSTGRES_*` values must contain and how to choose them, and `apps/slack/README.md` is the record for
`MASTRACODE_CHANNELS_PUBLIC_URL`. None of them is restated here.

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

## Ingress — Cloudflare Tunnel

Everything above keeps this deployment on this machine. This section is what makes it reachable at
`https://factory.kovalchuk.win`, and the important half of that sentence is what does *not* change:
the server's socket stays on `127.0.0.1:4111`. `cloudflared` runs here, dials **out** to Cloudflare,
and Cloudflare hands requests back down that same connection to the loopback address. Nothing is
listening for the internet on this host, on this network, or on this router.

Two preconditions, both checked before the install rather than after:

- **Registration is already closed.** Sign-up is disabled in committed source — the literal
  `signUpEnabled: false` in `src/mastra/index.ts` — and your own account exists. `README.md` step 3
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
**every** interface, this machine's LAN address included, and logs nothing about it. Declaring the key
in `.env.schema` changes none of that. It carries no `@required`, so leaving it blank is not a boot
error — `varlock load` exits 0 with the key unset, which is what keeps every path that legitimately
runs without it working — and it gets no default either: a declared-but-unset key is absent from the
server's environment entirely, not an empty string, so nothing is handed to the listener in its
place. What the declaration buys is validation and `@public`, and only on the varlock path:
`npm run start` is `varlock run -- mastra start`, while `npm run dev` is bare `mastra factory dev` and
never opens `.env.schema` at all, so the bring-up in `README.md` step 2 gets neither. Where it does
apply, `@public` keeps the *configured* value legible in the server's own stdout instead of masked —
worth having, but what it echoes is what `.env` said, never the address the socket actually took.
Ingress checkpoint 1 is the only thing that reports the latter. `HOST` is not a substitute either; it
changes the URL printed in the startup banner and moves no socket.

**How to obtain it.** Nothing issues it. It is a constant for a single-machine deployment, and the
tunnel is not a reason to change it — the tunnel is what reaches this address.

## `PORT`

**What the value must contain.** `4111`, pinned. The same number appears in the tunnel's
public-hostname target below and in the loopback `MASTRACODE_PUBLIC_URL` of `README.md` step 1; all of
them have to agree.

Unset, `npm run dev` scans 4111–4131 and quietly takes 4112 when 4111 is busy. The tunnel keeps
sending to 4111, so the public hostname answers `502` while the server runs perfectly well on a port
nobody is pointing at. Pinned, a busy port stops the boot with `EADDRINUSE`, which is the loud failure
worth having.

**How to obtain it.** Nothing issues it either. It is chosen here and then copied into the tunnel's
public-hostname target.

## `MASTRACODE_PUBLIC_URL`

**What the value must contain.** With the tunnel serving: exactly `https://factory.kovalchuk.win` —
scheme and host, no port, no path, no trailing slash. Before the tunnel exists it is the loopback
origin `README.md` step 1 sets, and it stays that way for as long as the first bring-up runs.

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
not: Colima runs inside a login session, so the server comes up at login (by hand until the Epic 4
supervision agents exist). Between the two the tunnel is up with nothing behind it, and
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
