---
name: verify-factory
description: "Launch a disposable, isolated copy of this self-hosted Mastra Factory server (own port, own throwaway database, own app-data dir, local fakes for GitHub and the model instead of a GitHub App and a model key) and prove Factory behavior the way an operator uses it: sign-in, projects, work items, boards, GitHub connect and agent sessions through the `/web/*` API, the `mastra api factory` CLI and headless-Chrome screenshots. Runs on the factory Mac (Docker mode) and inside a Factory session sandbox (local mode, no Docker). Use when a change to src/mastra, patches/, sandbox/ or a dependency bump needs runtime proof, not only `npm run check`/`npm test`/`npm run build`."
---

# Verify the Factory server

This skill drives a throwaway Factory instance. On the factory Mac it runs next to production:
the LaunchAgent `ai.mastra.factory` on `127.0.0.1:4111` with Postgres `mastracode-web-db` on
`127.0.0.1:54329`. A verification run never touches either one. Before you drive a feature, read
the map in [`features/README.md`](features/README.md).

## Modes

| Mode | Where | Database | Sessions run in | Not available |
| --- | --- | --- | --- | --- |
| `docker` | the factory Mac (Colima) | a throwaway Postgres container | one Docker sandbox container | — |
| `local` | anywhere without a Docker socket, e.g. a Factory session sandbox | libSQL file in `scratch/appdata` | a local sandbox under `scratch/sandboxes` | the build, `mastra start`, container ceilings, the Docker image, `psql`, Chrome |

Launch step 1 picks the mode: `docker` when `docker info` works, else `local`. Set `VERIFY_MODE`
to force one. In `local` mode, report every `docker`-only check as skipped, never as passed.

`local` mode serves from the dev server (`mastra factory dev`) with `NODE_ENV=development` for the
whole run. `src/mastra/config/database-url.ts` allows the libSQL file only in `development` or
`test`, and `mastra start` always forces `production`, so the built server cannot run without
Postgres. The build is only needed for `sandbox-catalog.json`, which only Docker sessions read.
The dev CLI takes `NODE_ENV` only from an env file, never from the shell, so `local` mode passes
`--env scratch/dev.env` (one line, `NODE_ENV=development`). With `--env` pointing to an existing
file, the CLI loads that file alone and never `.env`. `docker` mode sets `MASTRA_SKIP_DOTENV=1`
instead, which turns every env file off.

A Factory session sandbox of this repository needs `memoryGib` 3 and `cpus` 2
(`sandbox/projects/koval-yurko/mastra-factory/sandbox.json`): the dev server bundle peaks near
1.7 GiB, and at the shared 1 GiB it dies with `Reached heap limit`.

## Hard rules

- Run only in a checkout with **no `.env`**: a git worktree on the factory Mac, or the session
  checkout in a sandbox. Never in `/Users/koval/dev/test/mastra-factory`, which has the production
  `.env`. Step 3 below edits `src/mastra/config/auth.ts` for a few seconds.
- Never use port `4111` or `54329`. Never use the container `mastracode-web-db` or the volume
  `mastra-factory_mastracode-web-pgdata` (the only copy of production data, no backups).
- Never stop a process by name. `pkill -f "mastra start"` also kills production. Stop only the PIDs
  that this run wrote to `scratch/*.pid`.
- Never read the production `.env`. Every key the instance gets comes from `scratch/env.sh` (and in
  `local` mode `scratch/dev.env`), and `env -i` plus `MASTRA_SKIP_DOTENV=1` or `--env` keeps every
  other value out.
- Do one run per checkout at a time, because step 3 edits a tracked file. Runs in different
  checkouts can run at the same time: ports are chosen per run.
- No helper scripts: `.claude/` holds no first-party code (AD-4, AD-13 in
  `docs/architecture.md`). The commands below are the harness. They run unchanged in `bash`
  (the sandbox image has no `zsh`) and in `zsh`.

## The model

Verify runs use no real model and no model credential. The agent turn of
[Agent sessions](features/agent-sessions.md) runs on a scripted, Anthropic-compatible fake model
(`src/mastra/verify-fakes/anthropic.ts`), served by the fakes server at
`/anthropic/v1/messages`. How the fakes work: `src/mastra/verify-fakes/README.md`.

- The run stores the sentinel key `sk-ant-factory-verify-fake-model` as the Anthropic provider key
  through `PUT /web/config/providers/anthropic/key`, as an operator does in Settings › Models.
  The fetch redirect (`src/mastra/verify-fakes/redirect.ts`) sends a request to
  `api.anthropic.com` to the fake only when it carries exactly that key. A real key is never
  redirected.
- Factory sessions read model credentials only from that store ("personal credentials only" on
  this deployment), never from `ANTHROPIC_API_KEY` in the server environment. Do not put a model
  key into a file, a shell profile, the Keychain or `.env`.
- The script: if the request offers a tool with a string `command`, the fake calls it once to
  write `FAKE_MODEL.md` in the clone, commit it as `Fake model turn` and push the branch. After the
  tool result, it ends the turn. Every other model call (titles, memory) gets a short text.
- The fake proves Factory's plumbing (model call, tool run in the sandbox, push), not model
  quality. Each model call is a `MODEL …` line in `fake.log`.

## Layout of a run

```text
~/.factory-verify/<RUN_ID>/
  evidence/   proof artifacts. Cleanup keeps this folder.
  scratch/    env.sh, account.sh, token.sh, fake-app-key.pem (all mode 600), *.pid, ports, logs,
              appdata/, sandboxes/, chrome/, git/ (the fake GitHub repository). Cleanup deletes it.
```

Shell state does not carry over between tool calls. Start every later block with
`R=$HOME/.factory-verify/<RUN_ID>; read RUN_ID APP_PORT DB_PORT FAKE_PORT MODE < $R/scratch/ports`,
using the `RUN_ID` that step 1 printed.

## Launch

Prerequisites: `npm ci` ran in this checkout. In `docker` mode, Colima runs and the image
`pgvector/pgvector:pg18` is present.

1. **Mode, database, ports, env and the fakes server.** Run this block as written:

   ```bash
   RUN_ID=$(date +%Y%m%d-%H%M%S); R=$HOME/.factory-verify/$RUN_ID
   MODE=${VERIFY_MODE:-$(docker info >/dev/null 2>&1 && echo docker || echo local)}
   mkdir -p $R/scratch/appdata $R/scratch/sandboxes $R/scratch/git $R/evidence
   free() { curl -s -o /dev/null --connect-timeout 1 "http://127.0.0.1:$1"; [ $? -eq 7 ]; }   # 7 = refused = free
   APP_PORT=; for p in $(seq 4120 4189); do free $p && { APP_PORT=$p; break; }; done
   FAKE_PORT=; for p in $(seq 4191 4199); do free $p && { FAKE_PORT=$p; break; }; done
   DB_PORT=-; DB_ENV=
   if [ "$MODE" = docker ]; then
     DB_PW=$(openssl rand -hex 16)
     docker run -d --name factory-verify-db-$RUN_ID --label factory-verify=$RUN_ID \
       -p 127.0.0.1::5432 --tmpfs /var/lib/postgresql \
       -e POSTGRES_USER=factory -e POSTGRES_PASSWORD=$DB_PW -e POSTGRES_DB=factory_verify \
       --health-cmd 'pg_isready -h 127.0.0.1 -p 5432 -U factory -d factory_verify' \
       --health-interval 2s --health-retries 30 pgvector/pgvector:pg18
     for i in $(seq 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' factory-verify-db-$RUN_ID)" = healthy ] && break; sleep 2; done
     DB_PORT=$(docker port factory-verify-db-$RUN_ID 5432/tcp | head -1 | sed 's/.*://')
     DB_ENV="export MASTRA_SKIP_DOTENV=1
   export DATABASE_URL=postgres://factory:$DB_PW@127.0.0.1:$DB_PORT/factory_verify
   export FACTORY_SANDBOX_PROVIDER=docker
   export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock"
   else
     DB_ENV="export FACTORY_SANDBOX_PROVIDER=local
   export MASTRACODE_LOCAL_SANDBOX_ROOT=$R/scratch/sandboxes"
     echo NODE_ENV=development > $R/scratch/dev.env
   fi
   echo "$RUN_ID $APP_PORT $DB_PORT $FAKE_PORT $MODE" > $R/scratch/ports
   umask 077; openssl genrsa 2048 2>/dev/null > $R/scratch/fake-app-key.pem
   KEY=$(awk '{printf "%s\\n", $0}' $R/scratch/fake-app-key.pem)
   cat > $R/scratch/env.sh <<EOF
   export MASTRA_TELEMETRY_DISABLED=1
   export MASTRA_APP_DATA_DIR=$R/scratch/appdata
   export MASTRA_HOST=127.0.0.1
   export PORT=$APP_PORT
   export MASTRACODE_PUBLIC_URL=http://127.0.0.1:$APP_PORT
   export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   export FACTORY_CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -base64 32)
   export MASTRACODE_MAX_SANDBOXES=1
   export FACTORY_FAKES_URL=http://127.0.0.1:$FAKE_PORT
   export GITHUB_APP_ID=4241
   export GITHUB_APP_PRIVATE_KEY="$KEY"
   export GITHUB_APP_CLIENT_ID=Iv1.factoryverifyfake
   export GITHUB_APP_CLIENT_SECRET=$(openssl rand -hex 20)
   export GITHUB_APP_SLUG=factory-verify-fake
   export GITHUB_APP_WEBHOOK_SECRET=$(openssl rand -hex 32)
   $DB_ENV
   EOF
   node src/mastra/verify-fakes/server.ts --port $FAKE_PORT --repo factory-verify/sandbox \
     --git-root $R/scratch/git --log $R/scratch/fake.log > $R/scratch/fake.out 2>&1 &
   echo $! > $R/scratch/fake.pid; sleep 2; grep ready $R/scratch/fake.out   # fakes ready http://127.0.0.1:<FAKE_PORT>
   echo RUN_ID=$RUN_ID MODE=$MODE APP_PORT=$APP_PORT DB_PORT=$DB_PORT FAKE_PORT=$FAKE_PORT
   ```

   - `MASTRA_APP_DATA_DIR` is required. Without it, the instance on the Mac opens production's
     `~/Library/Application Support/mastracode/observability.duckdb` and `locks/`. In `local` mode
     the libSQL database is there too (`scratch/appdata/mastra.db`).
   - `-p 127.0.0.1::5432` lets Docker choose a free loopback port. `--tmpfs` keeps the data in
     memory, so removing the container deletes all of it.
   - The `GITHUB_APP_*` values are throwaway: the private key is generated per run, and nothing is
     registered on GitHub. With `FACTORY_FAKES_URL` set, the server sends every GitHub API and
     OAuth request to the fake (`src/mastra/verify-fakes/`), and sandboxes clone from it.
     Production never sets this key, and `src/mastra/config/env.ts` accepts only
     `http://127.0.0.1:<port>`.
   - Never use port 4190 for the fake: it is on the fetch "bad ports" list, and the OAuth exchange
     fails with `TypeError: fetch failed … bad port`.

2. **Open registration and start the dev server.** This follows README step 3 (the account seed):

   ```bash
   node -e "const f='src/mastra/config/auth.ts',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('      signUpEnabled: false,','      signUpEnabled: true,'))"
   git diff --stat src/mastra/config/auth.ts      # must show 1 line changed
   env -i HOME="$HOME" PATH="$PATH" TERM=dumb bash -c '. "$1"; exec node_modules/.bin/mastra factory dev --dir src/mastra --env "$2"' _ $R/scratch/env.sh $R/scratch/dev.env > $R/scratch/dev.log 2>&1 &
   echo $! > $R/scratch/dev.pid
   for i in $(seq 150); do grep -q "ready in" $R/scratch/dev.log && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/health)" = 200 ] && break; sleep 2; done
   ```

   Ready means `dev.log` contains `ready in` and `/health` answers `200`: about 10 s on the Mac,
   about 2 minutes in a 2-CPU sandbox. The log
   line `[Better Auth]: Database schema mismatch … Missing tables` is expected: auth migrates on the
   first auth request.

3. **Create the account, then close registration at once.**

   ```bash
   U=http://127.0.0.1:$APP_PORT; PW=$(openssl rand -hex 12)
   umask 077; printf 'export VERIFY_EMAIL=verify@example.invalid\nexport VERIFY_PASSWORD=%s\n' $PW > $R/scratch/account.sh
   curl -s -o $R/scratch/signup.json -w '%{http_code}\n' -X POST $U/auth/api/sign-up/email \
     -H 'Content-Type: application/json' -H "Origin: $U" \
     -d "{\"name\":\"Verify Operator\",\"email\":\"verify@example.invalid\",\"password\":\"$PW\"}"   # 200
   git checkout -- src/mastra/config/auth.ts && git diff --exit-code src/mastra/config/auth.ts && echo auth-closed
   kill $(cat $R/scratch/dev.pid)       # its child node process exits with it
   ```

   Warning: do not commit and do not end the run while `auth.ts` says `signUpEnabled: true`.
   If any later step fails, run `git checkout -- src/mastra/config/auth.ts` first.

4. **Start the server the run drives.** In `docker` mode that is the release-shaped server: Docker
   sessions need `sandbox-catalog.json`, which only `npm run build` writes. The build goes to this
   checkout's `.mastra/output`. It does not deploy anything, because production serves
   `releases/current` in the main checkout. In `local` mode it is the dev server again (see Modes).

   ```bash
   if [ "$MODE" = docker ]; then
     env -i HOME="$HOME" PATH="$PATH" TERM=dumb MASTRA_SKIP_DOTENV=1 MASTRA_TELEMETRY_DISABLED=1 npm run build > $R/scratch/build.log 2>&1; echo build-exit=$?
     START='exec node_modules/.bin/mastra start'
   else
     START="exec node_modules/.bin/mastra factory dev --dir src/mastra --env $R/scratch/dev.env"
   fi
   env -i HOME="$HOME" PATH="$PATH" TERM=dumb START="$START" bash -c '. "$1"; eval "$START"' \
     _ $R/scratch/env.sh > $R/scratch/server.log 2>&1 &
   echo $! > $R/scratch/server.pid
   for i in $(seq 150); do grep -qE "Mastra API running|ready in" $R/scratch/server.log && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/health)" = 200 ] && break; sleep 2; done
   ```

   Ready means `/health` answers `200`. In `docker` mode `server.log` also contains
   `Mastra API running` with `url: "http://127.0.0.1:<APP_PORT>/api"`, and `build.log` ends with
   `[build] sandbox catalog names factory-sandbox:<tag>…`.

5. **Sign in for the API.** Better Auth returns a bearer token, the same way `ops/release-lib.sh` does it:

   ```bash
   . $R/scratch/account.sh; U=http://127.0.0.1:$APP_PORT
   TOKEN=$(jq -n --arg e "$VERIFY_EMAIL" --arg p "$VERIFY_PASSWORD" '{email:$e,password:$p}' |
     curl -s -X POST -H 'Content-Type: application/json' -H "Origin: $U" --data-binary @- $U/auth/api/sign-in/email | jq -r '.token // empty')
   umask 077; printf 'export VERIFY_TOKEN=%s\n' "$TOKEN" > $R/scratch/token.sh
   ```

## Doctor

Run this first. Run it again whenever something looks wrong. It is read-only.

```bash
R=$HOME/.factory-verify/<RUN_ID>; read RUN_ID APP_PORT DB_PORT FAKE_PORT MODE < $R/scratch/ports; U=http://127.0.0.1:$APP_PORT
kill -0 $(cat $R/scratch/server.pid) && echo server-pid-alive               # the server this run started
grep -cE "127.0.0.1:$APP_PORT|localhost:$APP_PORT" $R/scratch/server.log   # 1 or more: it owns this port
curl -s -o /dev/null -w 'health %{http_code}\n' $U/health                     # 200
[ "$MODE" = docker ] && docker inspect -f '{{.State.Health.Status}}' factory-verify-db-$RUN_ID   # healthy
git diff --exit-code src/mastra/config/auth.ts && echo registration-closed-in-source
grep -c "fakes\] GitHub API" $R/scratch/server.log                     # 1: the redirect is on
curl -s -o /dev/null -w 'fake %{http_code}\n' http://127.0.0.1:$FAKE_PORT/api/user   # 200
. $R/scratch/token.sh; curl -s -o /dev/null -w 'auth %{http_code}\n' -H "Authorization: Bearer $VERIFY_TOKEN" "$U/web/factory/projects?page=0&perPage=1"   # 200
```

Do not drive the instance unless every check passes.

## Drive

Use these harnesses, from the most to the least user-like:

- **UI (unauthenticated pages), Mac only:** headless Chrome. Send a browser `Accept` header. A
  plain `curl` without `Accept: text/html` gets a generic "Mastra Server" page or `401` JSON, not
  the Factory UI.

  ```bash
  CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "$CH" --headless=new --disable-gpu --no-first-run --user-data-dir=$R/scratch/chrome --window-size=1280,900 \
    --virtual-time-budget=8000 --screenshot=$R/evidence/<feature>/<name>.png $U/<path>
  "$CH" --headless=new --disable-gpu --no-first-run --user-data-dir=$R/scratch/chrome \
    --virtual-time-budget=8000 --dump-dom $U/<path> > $R/evidence/<feature>/<name>.html
  ```

- **Factory API through the CLI** (the contract that the UI calls; routes are `/web/*`, not `/api/*`):

  ```bash
  . $R/scratch/token.sh
  M=(npx mastra api --url $U --header "Authorization: Bearer $VERIFY_TOKEN" factory)
  "${M[@]}" project list '{"page":0,"perPage":10}'
  "${M[@]}" <command> --schema | jq '{examples, input: .input.schema}'   # the contract of any leaf
  ```

  `--url` must come before `factory`. Without it, `--schema` fails with `SERVER_UNREACHABLE`.
  Read `.claude/skills/mastra-factory/references/factory-supervisor.md` for the command catalog.
  Its "never curl private routes" rule is about production. On this instance, `curl` on
  `/auth/api/*` and the `/web/*` routes in the feature files is the documented path.
  A fresh UUID for a `requestId`: `node -p 'crypto.randomUUID()'`.

- **Database (second view of a side effect), `docker` mode only:**
  `docker exec factory-verify-db-$RUN_ID psql -U factory -d factory_verify -c '<read-only SELECT>'`.
  In `local` mode use a second API read instead, and report the database view as skipped.

Authenticated UI pages (`/projects`, boards, sessions) need an interactive browser that reaches
`127.0.0.1`. The Paseo browser tools fail with `ERR_CONNECTION_REFUSED` on the Mac's loopback.
Until an interactive harness exists, prove authenticated behavior through the API and the
database, and name the UI entry point as not driven.

## Evidence

- Put each artifact in `$R/evidence/<feature-id>/` and number the files in action order
  (`01-…json`, `02-…json`). Save the action's response and a second, read-only view of the
  resulting state (a later `list`/`get`, a `SELECT`, or a screenshot).
- Use the real user path: Better Auth routes, `/web/*` through the CLI, UI pages. Do not use
  internal setters, test-only routes or direct `INSERT`s. Use the database only to read.
- Check side effects next to the visible result: rows in Postgres, revision numbers, and for
  sessions the sandbox that Factory started.
- Never write a secret into evidence. `signup.json` contains a session token, so it stays in
  `scratch/`. Redact tokens before you copy any auth response into `evidence/`. Never copy
  `env.sh` or a process environment into evidence.
- Name the mode in your report, the feature ID, the entry point you used, and every entry point
  or check you did not drive, and why.

## Cleanup

Run this after every run, also after a failed one. It deletes instances and scratch, and it keeps
the evidence.

```bash
R=$HOME/.factory-verify/<RUN_ID>; read RUN_ID APP_PORT DB_PORT FAKE_PORT MODE < $R/scratch/ports
git checkout -- src/mastra/config/auth.ts                                # closed again, in every case
cp $R/scratch/fake.log $R/evidence/fake.log 2>/dev/null                  # every GitHub and model call the run made
for f in server dev fake; do [ -f $R/scratch/$f.pid ] && kill $(cat $R/scratch/$f.pid) 2>/dev/null; done
sleep 3; for p in $APP_PORT $FAKE_PORT; do curl -s -o /dev/null --connect-timeout 1 http://127.0.0.1:$p; [ $? -eq 7 ] && echo port-$p-free; done
if [ "$MODE" = docker ]; then
  [ -f $R/scratch/session-containers ] && xargs docker rm -f < $R/scratch/session-containers
  docker rm -f factory-verify-db-$RUN_ID
fi
rm -rf "${R:?}/scratch"                                                  # ${R:?} stops the command if R is empty
rm -rf src/mastra/public/factory                                         # see below
ls -R $R/evidence                                                        # proof survives
[ "$MODE" = docker ] && curl -s -o /dev/null -w 'production %{http_code}\n' http://127.0.0.1:4111/health   # unchanged: 200
```

`.mastra/output` stays. The next run's build replaces it. The build copies the Factory UI into
`src/mastra/public/factory` (gitignored), and `tsc` then type-checks its bundled `.js` and fails
`npm run check` with `TS9005`; the next build copies it again.
