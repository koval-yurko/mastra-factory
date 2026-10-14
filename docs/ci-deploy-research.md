# CI/CD on this Mac — final design

Status: implemented and installed on 2026-10-14. The runner is registered and online. Not yet run
end to end: the first push to `main` is the first deploy (section 13).
Date: 2026-10-14. Revision 7.

Installation steps: `actions-runner/README.md` ("Install"). Day-to-day commands: `README.md`
("Deploy, rollback and local mode"). This file holds the design and the reasons.

A push to `main` starts a GitHub self-hosted runner on this Mac. The runner builds the project,
stores the build as a release, and restarts the Factory server on that release. The last 5
releases stay on disk. One command rolls back to any of them.

## 1. Decisions

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Runner folder | `actions-runner/` at the repo root. |
| D2 | Release store | `releases/` at the repo root, gitignored. |
| D3 | `.github/` at the repo root | Yes. |
| D4 | Releases to keep | 5, plus `current`, `previous` and pinned ones. |
| D5 | Sandboxes at deploy | Wait until no Factory work is in progress. Never force. Destroy only if needed. |
| D6 | Parked sessions | A parked session blocks a deploy until a test shows it survives a restart. |
| D7 | Database dump | `pg_dump` on every deploy, stored in the release folder of the same name. No off-machine copy for now. |
| D8 | Secrets | AWS SSM Parameter Store (commit `2f22fc3`). The runner gets no AWS credential. |
| D9 | Factory API login for scripts | Credentials in the project `.env` (section 7.4). |
| D10 | Local build | Writes to `.mastra/output`, never into `releases/`. |
| D11 | Local run | Stop the released service, then run the local server. |
| D12 | Runner user | The same macOS user as the Factory server. |
| D13 | Who can use the runner | Only the repo owner `koval-yurko` (section 11). |
| D14 | Branch | `main`. |

D1, D2 and D3 add three root directories. The root is a closed set (AD-3), so this is a spine change.
Section 12 lists the files to change.

## 2. Folders

```
mastra-factory/
├── .github/
│   └── workflows/
│       └── deploy.yml                  # NEW, tracked — the pipeline (section 5)
├── actions-runner/                     # NEW
│   ├── README.md                       # tracked — register, update, remove, security settings
│   ├── register.sh                     # tracked — download, check, configure the runner
│   ├── ai.mastra.runner.plist          # tracked — LaunchAgent, linked by ops/install.sh
│   ├── hooks/
│   │   └── job-started.sh              # tracked — refuses any job that is not ours (section 11.3)
│   └── runner/                         # gitignored — runner program, _work, credentials
│       ├── runsvc.sh, config.sh, bin/ …
│       ├── .env, .path                 # the runner's own job environment (not the project .env)
│       └── _work/                      # job checkouts and build output
├── releases/                           # NEW, gitignored — the release store
│   ├── 20261014T141500Z-3f9a1c2/
│   │   ├── output/                     # the full .mastra/output tree of that commit
│   │   ├── release.json                # metadata
│   │   └── db.dump                     # database before this release became current
│   ├── 20261013T093000Z-2f22fc3/
│   ├── current  -> 20261014T141500Z-3f9a1c2
│   ├── previous -> 20261013T093000Z-2f22fc3
│   ├── pinned/                         # pinned/<id>: never pruned
│   ├── HOLD                            # present = do not deploy (local run)
│   ├── .quiesce.json                   # saved automation state during a deploy
│   └── deploy.log                      # one line per deploy and rollback
├── ops/
│   ├── factory-start.sh                # CHANGED — starts the current release
│   ├── install.sh                      # CHANGED — also links actions-runner/ai.mastra.runner.plist
│   ├── newsyslog/ai.mastra.factory.conf  # CHANGED — adds runner logs
│   ├── release-lib.sh                  # NEW — shared routines, sourced by the scripts below
│   ├── release-store.sh                # NEW
│   ├── deploy.sh                       # NEW
│   ├── rollback.sh                     # NEW
│   └── local-mode.sh                   # NEW
├── src/mastra/ops/
│   └── live-sessions.ts                # NEW — GET /web/ops/live-sessions (section 7.1)
├── src/mastra/public/factory/          # Factory UI, copied by `mastra build` (gitignored, unchanged)
├── .mastra/output/                     # local build only (gitignored, unchanged)
└── .env                                # SYSTEM keys + deploy login (section 7.4)
```

Rules:

1. `.gitignore` gets `releases/` and `actions-runner/runner/`.
2. `actions-runner/*.sh` and `actions-runner/hooks/*.sh` hold supervision only, like `ops/*.sh`.
   `AGENTS.md` and AD-4 name only `ops/*.sh` as the carve-out today, so extend the carve-out.
3. The release scripts stay in `ops/`, because they supervise the Factory server, not the runner.
4. Warning: `git clean -fdx` deletes ignored folders, so it deletes every release and the runner.
   Use `git clean -fd` in this repo.

Release name: `YYYYMMDDTHHMMSSZ-<7-char sha>`, in UTC. It sorts by time and shows the commit.

`release.json`:

```json
{
  "id": "20261014T141500Z-3f9a1c2",
  "sha": "3f9a1c2…",
  "builtAt": "2026-10-14T14:15:00Z",
  "runId": 123456789,
  "node": "v24.19.0",
  "lockfileSha256": "…",
  "activatedAt": "2026-10-14T14:21:40Z",
  "health": "pass"
}
```

## 3. How it works

```
 push to main (by koval-yurko)
      │
      ▼
 GitHub ──(outbound long-poll, port 443)──▶ runner  (LaunchAgent ai.mastra.runner)
                                              │   hooks/job-started.sh: not ours → job fails
              job "build"                     │   job "deploy"
              ─────────────                   │   ────────────
              checkout into _work             │   ops/deploy.sh <id>
              npm ci / check / test / build   │     HOLD?            → stop, release stays stored
              ops/release-store.sh            │     quiesce Factory  → wait for idle work
                → releases/<id>/              │     pg_dump          → <id>/db.dump
                                              │     switch "current" → <id>
                                              │     restart ai.mastra.factory
                                              │     GET /health      → fail: switch back, restart
                                              │     resume Factory, prune old releases
                                              ▼
 ai.mastra.factory ── ops/factory-start.sh ── cd <repo root>
                                              mastra start --dir releases/current/output
```

Main ideas:

1. **Build in one place, run from another.** `npm run build` empties `.mastra/` first, so a build
   in place deletes the files under a running server. The runner builds in its own `_work` folder.
   The server runs from `releases/current/output`. Only the restart is an outage.
2. **One link decides which build runs.** `releases/current` points at one release folder.
   Deploy and rollback change only this link, then restart the server.
3. **The cwd stays the repo root.** `mastra start` loads `.env` from the cwd and sets
   `MASTRA_PROJECT_ROOT` to the cwd. Both stay the same as today. `--dir` selects the build.
4. **Secrets do not go through CI.** Each release holds the key list of its own commit (compiled
   into the bundle). Values come from `.env` and SSM at server start. The runner has no AWS key.
5. **Never cut off Factory work.** The deploy waits until Factory reports no running and no parked session.

### 3.1 Check result: `MASTRA_PROJECT_ROOT` (open item 4)

`mastra start` sets `MASTRA_PROJECT_ROOT` to its cwd. With the cwd at the repo root, the value is the
same as today. Three places read it (checked in the installed packages):

| Reader | Use | Effect with a release build |
| --- | --- | --- |
| `@mastra/core` telemetry | Hash for an anonymous project id | None. Same value as today. |
| template installer workflow (`@mastra/server`) | Where an agent-builder template writes files | Points at the repo root, as today. |
| `@mastra/factory` `spa-static.js` | Where the Factory UI is found | **Needs care.** See below. |

The Factory UI is looked up in this order:

1. `MASTRACODE_UI_DIST`
2. `<cwd of the server>/factory` — for a release: `releases/<id>/output/factory`
3. `factory/` next to the bundled module — the same folder
4. `$MASTRA_PROJECT_ROOT/src/mastra/public/factory` — the repo root copy
5. `<cwd>/src/mastra/public/factory`

Test result (a clean build of this tree, 2026-10-14): `mastra build` copies **neither** the UI nor
`src/mastra/public/factory-skills` into `.mastra/output`. Its log has no "Copying Factory UI" line,
and its public-folder copy finds nothing. Two effects on the server that runs today:

1. It serves the UI from the fallback, the repo root's `src/mastra/public/factory`. That copy is from
   2026-09-23 and has 10 asset files; the UI in the installed `mastra@1.33.0` CLI has 349.
2. Factory looks for repo-local skill overrides under the server cwd (`.mastra/output`) and finds
   none, so `src/mastra/public/factory-skills/` (`eas-cli`, `factory-pr-feedback`,
   `operator-profile`) is not loaded.

Why: the CLI treats a project as a Factory only when the entry file itself holds
`new MastraFactory(...)`, and this entry keeps that call in `src/mastra/config/factory.ts`
(AGENTS.md). And `observability.ts` and `logger.ts` make the CLI bundle a generated entry under
`.mastra/`, so its copy of `public/` looks next to that file and finds nothing.

Fix: `npm run build` is `mastra build --dir src/mastra && node src/build/complete-output.ts`. The
second step does what the CLI does for a detected Factory:

1. copies the UI shipped with the installed CLI (`node_modules/mastra/dist/factory`) into
   `src/mastra/public/factory`, replacing the old copy (so `npm run dev` serves the same UI);
2. copies `src/mastra/public/` into `.mastra/output` (`factory/`, `factory-skills/`);
3. writes `.mastra/output/mastra-project.json` and fails if `factory/index.html` is missing.

The server then finds both under its own cwd. This works the same for a local build and for CI.
`ops/release-store.sh` refuses a build without them, and `release.json` records the UI source
(`"ui": "mastra@1.33.0"`). Checked on 2026-10-14: a full `npm run build` puts the UI (349 assets),
the three skills and the marker into the output.

Check after a `mastra` upgrade: if a new CLI detects this project as a Factory again, its build
log shows "Copying Factory UI" and step 1 to 3 repeat work that is already done. That is harmless.

Other checks: the build has no absolute path of the build checkout in its `.mjs` and `.json` files.
Only native-module build files (`ssh2`, `cpu-features` Makefiles and objects) hold one. They do not
affect the run.

## 4. Scripts

All scripts are zsh, run from the repo root checkout, and write one line to `releases/deploy.log`.

| Script | Who runs it | What it does |
| --- | --- | --- |
| `ops/release-store.sh <sha>` | CI job `build` | Copies `.mastra/output` from the job checkout to `releases/<id>/output` with `cp -cR` (APFS clone). Refuses a build without the Factory UI or the skill overrides (section 3.1). Writes `release.json`. Prints `id=<id>` for the next job. |
| `ops/deploy.sh <id>` | CI job `deploy`, or the operator | The full activation: HOLD check, quiesce, dump, switch, restart, health check, auto rollback, resume, prune. |
| `ops/deploy.sh --list` | Operator | Lists releases, marks `current` and `previous`, shows health and pinned state. |
| `ops/deploy.sh --pin <id>` / `--unpin <id>` | Operator | Keeps a release out of pruning. |
| `ops/rollback.sh [<id>]` | Operator | Activates `previous`, or the given release. Same quiesce, restart and health check. No build. |
| `ops/rollback.sh --with-db` | Operator | Back to `previous` and restores the database it ran on. Asks for a typed confirmation. |
| `ops/local-mode.sh on` | Operator | Creates `HOLD`, waits for idle Factory work, stops `ai.mastra.factory`. Port 4111 is free. |
| `ops/local-mode.sh off` | Operator | Starts `ai.mastra.factory` on `current`, runs the health check, removes `HOLD`. |
| `ops/local-mode.sh status` | Operator | Shows `HOLD`, the agent state, and which build holds port 4111. |
| `actions-runner/register.sh` | Operator, once | Downloads and checks the runner, runs `config.sh`, writes the runner `.env` and `.path`. |
| `actions-runner/hooks/job-started.sh` | The runner, before each job | Fails any job that is not from `main`, this repo, `deploy.yml` and `koval-yurko`. |
| `npm run start:release` | `ops/factory-start.sh` | `mastra start --dir releases/current/output`. |

`ops/deploy.sh` and `ops/rollback.sh` share one activation routine. A rollback is an activation of
an older release.

## 5. GitHub pipeline

`.github/workflows/deploy.yml`:

```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      release:
        description: Release id to activate. Empty = build the selected commit.
        required: false

concurrency:
  group: deploy
  cancel-in-progress: false      # one run at a time; a newer pending run replaces an older pending one

permissions:
  contents: read

jobs:
  build:
    if: >-
      github.repository == 'koval-yurko/mastra-factory' &&
      github.ref == 'refs/heads/main' &&
      github.actor == 'koval-yurko' &&
      github.triggering_actor == 'koval-yurko' &&
      !inputs.release
    runs-on: [self-hosted, macOS, ARM64, factory-mac]
    timeout-minutes: 30
    outputs:
      release: ${{ steps.store.outputs.id }}
    steps:
      - uses: actions/checkout@<full commit sha>
        with:
          persist-credentials: false
      - name: Node is the server's Node
        run: test "$(node --version)" = "$FACTORY_NODE_VERSION"
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run build
      - id: store
        run: '"$REPO_ROOT/ops/release-store.sh" "$GITHUB_SHA"'

  deploy:
    needs: build
    if: >-
      always() &&
      github.repository == 'koval-yurko/mastra-factory' &&
      github.ref == 'refs/heads/main' &&
      github.actor == 'koval-yurko' &&
      github.triggering_actor == 'koval-yurko' &&
      (needs.build.result == 'success' || inputs.release)
    runs-on: [self-hosted, macOS, ARM64, factory-mac]
    timeout-minutes: 420          # 6 h quiesce limit + margin; the default is 360
    steps:
      - run: '"$REPO_ROOT/ops/deploy.sh" "${{ inputs.release || needs.build.outputs.release }}"'
```

`REPO_ROOT` and `FACTORY_NODE_VERSION` come from the runner's own `.env` file (section 10).
The `if:` lines are the first guard. They are in the repo, so a changed workflow can remove them.
The runner hook (section 11.3) is the guard that a repo change cannot remove.

What a run looks like in GitHub:

| Event | `build` | `deploy` | Result |
| --- | --- | --- | --- |
| Push to `main`, all good | builds, stores `<id>` | activates `<id>` | Server runs the new commit. |
| Push, a test fails | fails | skipped | Nothing changes. |
| Push, `HOLD` exists | stores `<id>` | exits 0, "held" in the summary | Release waits. Activate it later. |
| Push, Factory busy for 6 h | stores `<id>` | fails at quiesce | Release waits. Activate it later. |
| Push, new build fails `/health` | stores `<id>` | rolls back by itself, fails | Server runs the previous release. |
| Manual run with `release` | skipped | activates that id | Deploy or rollback from the GitHub UI. |
| Any job from another branch, workflow or person | refused by the hook | refused by the hook | Nothing runs on this Mac. |

The `deploy` job runs `ops/deploy.sh` from the repo root checkout, not from the job checkout.
A new commit cannot change the deploy logic until you pull it into the repo root.
When a pushed commit changes `ops/` or `actions-runner/` and the repo root is behind, the job prints a warning.

## 6. Deploy, step by step

`ops/deploy.sh <id>`:

1. Check that `releases/<id>/output/index.mjs` and `releases/<id>/output/factory/index.html` exist.
2. If `releases/HOLD` exists, print "held", exit 0.
3. **Quiesce** (section 7). On timeout: resume Factory, exit 1.
4. **Dump**: `pg_dump --format=custom` from the compose Postgres container to `releases/<id>/db.dump`.
5. **Destroy sandboxes**, only when needed (section 7.3).
6. **Switch**: `previous` = old `current`. `current` = `<id>`.
   Atomic: `ln -s <id> current.tmp && mv -fh current.tmp current`.
7. **Restart**: `launchctl kickstart -k gui/$(id -u)/ai.mastra.factory`.
8. **Health check**: `GET http://127.0.0.1:4111/health` must return 200, and the server pid must
   stay the same for 60 s (no crash loop). `/health` is a Mastra route registered before the auth middleware.
9. On health failure: switch `current` back to `previous`, restart, check again, write
   `"health": "fail"` in `release.json`, exit 1.
10. **Resume** Factory automation (section 7) on whichever server now answers. Automation stays
    paused across the restart, so the new server starts no run before its health check. A cancel
    (INT/TERM) also resumes. If no server answers, `.quiesce.json` stays and the next run resumes first.
11. **Prune**: keep the newest 5 releases, plus `current`, `previous` and pinned ones. Delete the rest,
    dumps included.
12. Write `activatedAt` and `"health": "pass"` in `release.json`. Add a line to `deploy.log`.

## 7. Quiesce: no work in progress

### 7.1 The signals

| Signal | Where | Meaning |
| --- | --- | --- |
| `runningSessionIds` | `mastra api factory work-item list <project>` | Work-item sessions with an agent run in flight now. |
| `parkedSessionIds` | same response | Sessions that wait for a human answer. Blocks a deploy (D6). |
| decisions with an active status | `mastra api factory decision list` | Queued work that can start a run. |
| `autoRunEnabled` | `mastra api factory project get` / `update` | When false, Factory starts no run by itself. |
| all live sessions | `GET /web/ops/live-sessions` (`src/mastra/ops/live-sessions.ts`) | Also covers chat-only sessions (Slack), which the work-item list does not show. |

A container in Docker state "running" says nothing. Containers idle for a long time.
Only the Factory signals count.

### 7.2 The routine

```
1. For each project: save autoRunEnabled to releases/.quiesce.json, set it to false.
2. Every 15 s: no running session (work items and the all-sessions route),
   no parked session, no active decision.
3. 3 clean polls in a row → idle. A webhook can start a run between two polls.
4. After 6 h without idle → resume, exit 1.
Resume: set autoRunEnabled back from .quiesce.json, delete the file.
```

The running state lives in server memory, so the check runs before the restart, against the live server.
If `.quiesce.json` exists at the start of a deploy, a previous run did not resume. Resume first.

### 7.3 Destroy sandboxes

A restart does not need a destroy. The server finds each container again by its label
`mastra.sandbox.id=<session id>`. A destroy also deletes uncommitted work in the container.

`ops/deploy.sh` destroys containers only when `FACTORY_SANDBOX_IMAGE` in `.env` differs from the
image of a container:

1. Only after quiesce.
2. Only containers with the label `mastra.sandbox=true`.
3. Only containers whose session id is not running and not parked.

Open item: confirm that Factory creates a new container for such a session and restores its checkout.
Until then, change `FACTORY_SANDBOX_IMAGE` by hand, not through a deploy.

### 7.4 How the scripts log in to the Factory API (D9)

Checked in the installed code:

1. `mastra api --url <url> --header "Authorization: Bearer <token>"` sends any header.
2. `@mastra/auth-better-auth` accepts `Authorization: Bearer <session token>`. It turns the token into
   the signed session cookie that Better Auth expects.
3. Better Auth is mounted at `/auth/api`. Sign-up is off in `src/mastra/config/auth.ts`.

A stored session token expires, so the scripts store the login, not the token:

```
.env
FACTORY_DEPLOY_EMAIL=<your Factory login>
FACTORY_DEPLOY_PASSWORD=<its password>
```

Per deploy:

1. `POST http://127.0.0.1:4111/auth/api/sign-in/email` with the email and password. Read `token`.
2. Call `mastra api factory --url http://127.0.0.1:4111 --header "Authorization: Bearer $token" …`.
3. Never print the token or the password. Never pass them as command-line arguments that `ps` can show.
   Send the sign-in body on stdin (`curl --data @-`).

Rules from `AGENTS.md`:

1. Add both keys to `envSpecs` (SYSTEM group) and `.env.example`, because `.env` lists them.
   Add `FACTORY_DEPLOY_PASSWORD` to `SENSITIVE_KEYS`, so the server log masks it.
2. The scripts read only these two keys from `.env` with `grep`. They do not `source` the file.
3. The account must be a member of the organization that owns the Factory projects.

Tested on 2026-10-14: `zsh -c 'source ops/release-lib.sh; factory_sign_in && echo token-ok && project_ids'`
signs in and lists the projects. Keep `.env` at mode 600: it now holds a password.

## 8. Rollback

```sh
ops/deploy.sh --list                  # see releases
ops/rollback.sh                       # back to "previous"
ops/rollback.sh 20261013T093000Z-2f22fc3
ops/rollback.sh --with-db             # back to "previous" and its database
```

Or from GitHub: Actions, deploy, Run workflow, put the release id in `release`.

A rollback runs the same activation as a deploy: quiesce, switch, restart, health check, resume.
It does not take a new dump and does not build. It takes about one minute when Factory is idle.

### 8.1 Code and database

| Command | Code | Database |
| --- | --- | --- |
| `ops/rollback.sh <id>` | release `<id>` | unchanged |
| `ops/rollback.sh <id> --with-db` | release `<id>` | restored |

The dump in release N holds the database before N became current. That is the state that the
release before N used. So `--with-db` restores `releases/<current>/db.dump` and is offered only
for the step back to `previous`. The current database is saved first as
`releases/<current>/db.before-restore.dump`.

Warning: a restore deletes every change since the dump: work items, sessions, tokens, memory.
The script shows the dump time and asks you to type the release id.

Server start runs schema migrations. Older code on a newer schema can fail. Then use `--with-db`.

### 8.2 Automatic rollback

Step 9 in section 6 rolls back by itself when the new release does not pass `/health` within 60 s.
A defect that shows later needs `ops/rollback.sh`.

## 9. Local run

The local server and the released server use the same port (4111), the same `.env` and the same
Postgres. Never run both at once.

```sh
ops/local-mode.sh on          # HOLD + wait for idle Factory work + stop ai.mastra.factory
npm run build                 # builds into .mastra/output only
npm run start                 # local server on 127.0.0.1:4111
# ... test ...
# Ctrl+C
ops/local-mode.sh off         # start the released service on "current", health check, remove HOLD
```

During local mode:

1. A push to `main` still runs `build` and stores a release. `deploy` exits with "held".
2. After `local-mode.sh off`, the server runs `current`, not the held release.
   To run the new one: `ops/deploy.sh <id>`, or run the workflow with that id.
3. `npm run dev` works the same way: stop the service first with `ops/local-mode.sh on`.

## 10. The runner

### 10.1 Install, once

The full, checked steps are in `actions-runner/README.md` ("Install"). In short:

```sh
actions-runner/register.sh         # asks for a registration token
ops/install.sh                     # sudo; links actions-runner/ai.mastra.runner.plist and the existing plists
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.runner.plist
launchctl kickstart gui/$(id -u)/ai.mastra.runner
```

`register.sh`:

1. Downloads the newest `actions-runner-osx-arm64-<version>.tar.gz` into `actions-runner/runner/`
   and checks its SHA-256 against the release notes.
2. Runs `config.sh --url https://github.com/koval-yurko/mastra-factory --token <token>
   --name factory-mac --labels factory-mac --work _work --unattended --replace`.
3. Sets `.credentials` to mode 600.
4. Copies `bin/runsvc.sh` to `runsvc.sh`, which the plist starts (what `./svc.sh install` would do).
5. Writes `package.json` with `{ "type": "commonjs" }` in the runner folder. Without it, Node applies
   the repo root's `"type": "module"` to the runner's own code and the service crashes at start.
6. Writes the runner `.env` file: `REPO_ROOT`, `FACTORY_NODE_VERSION`, `DOCKER_HOST`,
   `ACTIONS_RUNNER_HOOK_JOB_STARTED=<repo>/actions-runner/hooks/job-started.sh`.
7. Writes `.path` with the pinned `NODE_BIN` from `ops/factory-start.sh`.

### 10.2 `actions-runner/ai.mastra.runner.plist`

| Key | Value |
| --- | --- |
| `Label` | `ai.mastra.runner` |
| `ProgramArguments` | `/usr/bin/caffeinate -dimsu <repo>/actions-runner/runner/runsvc.sh` |
| `WorkingDirectory` | `<repo>/actions-runner/runner` |
| `EnvironmentVariables` | `PATH` (pinned Node first), `DOCKER_HOST`, `ACTIONS_RUNNER_SVC=1` |
| `SessionCreate`, `RunAtLoad`, `KeepAlive` | true |
| Logs | `~/Library/Logs/mastra-factory/runner.log`, `runner.err.log` |

GitHub says a custom service must start the runner through `runsvc.sh`. `ACTIONS_RUNNER_SVC=1` and
`SessionCreate` come from the runner's own plist template (`bin/actions.runner.plist.template`);
the first tells the runner it runs as a service, so a self-update restarts it in place.
Do not use `./svc.sh install`: it writes its own plist outside the repo.

### 10.3 Facts to know

| Fact | Value |
| --- | --- |
| Network | Outbound HTTPS only. No inbound port, no tunnel. |
| Job time limit | 5 days per job (self-hosted). |
| Queue limit | A job waits 24 h for the runner, then GitHub cancels it. |
| Offline runner | GitHub removes it after 14 days without a connection. Run `register.sh` again. |
| Updates | The runner updates itself. Keep this on. |
| Rights | Same user as the server (D12). It can read `.env` and use Docker. |

### 10.4 Remove

```sh
launchctl bootout gui/$(id -u)/ai.mastra.runner
cd actions-runner/runner && ./config.sh remove --token <removal token>
```

## 11. GitHub security: only the owner can use the runner

Why it matters: a job on this runner runs as your macOS user. It can read `.env` (AWS bootstrap key,
Postgres password, deploy login) and control Docker. A job from anyone else is full control of this Mac.

The defense has 4 layers. Each one alone is not enough.

### 11.1 Who can start a workflow at all

1. **Keep the repository private.** On a public repo, anyone can fork and open a pull request.
2. **No collaborators.** Settings, Collaborators: empty. Only the owner has write access, so only the
   owner can push a branch, merge, or run `workflow_dispatch`.
3. **No deploy keys with write access.** Settings, Deploy keys.
4. **Check installed GitHub Apps and OAuth apps.** Account Settings, Applications. Remove access to
   this repo for every app that does not need it.
5. **Do not install the Factory GitHub App on this repo.** The hosted Factory App asks for
   `actions` and `administration` read and write (memory note `mastra-factory-github-app-permissions`).
   With `actions: write` an app can start `workflow_dispatch`. With `administration: write` it can
   register runners and change repo settings. A Factory agent that works on this repo could then reach
   this Mac. If Factory must work on this repo, give its App no `actions`, `administration` or
   `workflows` permission.
6. **Personal access tokens.** Use fine-grained tokens limited to the repos they need. Delete classic
   tokens with `repo` or `workflow` scope that you do not use. A token that can push to this repo can deploy.
7. **Account.** Turn on two-factor authentication. Use a passkey or a security key if you can.

### 11.2 Repository settings

Settings, Actions, General:

| Setting | Value |
| --- | --- |
| Actions permissions | Allow `koval-yurko`, and select non-`koval-yurko`, actions. Allow only actions created by GitHub. Pin each one to a full commit SHA. |
| Fork pull request workflows | Off (the default for private repos). Do not turn it on. |
| Workflow permissions | Read repository contents. |
| Allow GitHub Actions to create and approve pull requests | Off. |

Settings, Rules, Rulesets, a ruleset for `main`:

| Rule | Value |
| --- | --- |
| Restrict deletions | On |
| Block force pushes | On |
| Require a pull request before merging | Optional. With 0 required approvals it forces the PR path without blocking you. |

Settings, Actions, Runners: exactly one runner, `factory-mac`. Remove any other.
No repository secrets are needed. Keep the secrets list empty.

### 11.3 The runner refuses foreign jobs (the hook)

The workflow `if:` lines live in the repo. Anyone with push access can push a branch with a new
workflow file that uses `runs-on: self-hosted` and no `if:`. GitHub runs workflow files from the pushed
branch. The hook stops this, because it lives on the Mac and runs before every job.

`actions-runner/hooks/job-started.sh` exits non-zero (the job fails before its first step) unless all
of these are true:

| Variable | Must be |
| --- | --- |
| `GITHUB_REPOSITORY` | `koval-yurko/mastra-factory` |
| `GITHUB_REF` | `refs/heads/main` |
| `GITHUB_WORKFLOW_REF` | `koval-yurko/mastra-factory/.github/workflows/deploy.yml@refs/heads/main` |
| `GITHUB_ACTOR` | `koval-yurko` |
| `GITHUB_TRIGGERING_ACTOR` | `koval-yurko` |
| `GITHUB_EVENT_NAME` | `push` or `workflow_dispatch` |

The runner reads the hook path from its own `.env`, outside git. A pushed commit cannot change it.
The hook file itself is in the repo root checkout. A push changes it only after you pull.

### 11.4 Inside the workflow

1. Triggers: only `push` to `main` and `workflow_dispatch`. Never `pull_request`,
   `pull_request_target`, `issue_comment` or `workflow_run`.
2. `permissions: contents: read` at the top.
3. `actions/checkout` with `persist-credentials: false`, so the token is not left in `.git/config`.
4. The job `if:` lines from section 5.
5. Pass no secret to the workflow. The deploy reads what it needs from the project `.env` on the Mac.

### 11.5 Check it

1. Push a branch `test/runner-guard` with a copy of `deploy.yml` that triggers on that branch.
   Expected: the job fails in the hook, no step runs.
2. Run `deploy` with `workflow_dispatch` on a branch other than `main`. Expected: refused.
3. Look at Settings, Actions, Runners after each change: one runner, status idle.

## 12. Changes to existing files

| File | Change |
| --- | --- |
| `package.json` | Add `"start:release": "mastra start --dir releases/current/output"`. `build` becomes `mastra build --dir src/mastra && node src/build/complete-output.ts` (section 3.1). |
| `src/build/complete-output.ts` | NEW. The post-build step, with tests. |
| `ops/factory-start.sh` | Check `releases/current/output/index.mjs`, then `exec npm run start:release`. |
| `ops/install.sh` | Link and check `actions-runner/ai.mastra.runner.plist`. |
| `ops/newsyslog/ai.mastra.factory.conf` | Rotate `runner.log` and `runner.err.log`. |
| `.gitignore` | Add `releases/` and `actions-runner/runner/`. |
| `src/mastra/config/env.ts`, `.env.example` | Add `FACTORY_DEPLOY_EMAIL`, `FACTORY_DEPLOY_PASSWORD` (sensitive). |
| `src/mastra/ops/live-sessions.ts`, `config/integrations.ts` | The all-sessions route, with tests, registered as the `live-sessions` integration. |
| `ARCHITECTURE-SPINE.md` AD-3 (not done; BMAD framework only) | Add `.github/`, `actions-runner/` and `releases/` to the root directory set. |
| `ARCHITECTURE-SPINE.md` AD-4 (not done), `AGENTS.md` (done) | Extend the shell carve-out to `actions-runner/*.sh` and `actions-runner/hooks/*.sh`. Production entry is `start:release`. |
| `.bmad-loop/policy.toml` (not done; bmad-loop only) | Append guards for the new layout. Never rewrite the array. |
| `README.md`, `ops/README.md` | "Rebuild: stop, build, start" becomes "deploy, rollback, local mode". |

## 13. Status and first run

| Step | State |
| --- | --- |
| `npm run build` places the UI and the skill overrides (section 3.1) | Done, checked with a full build. |
| All-sessions route, `.env` deploy login, release scripts, `factory-start.sh` | Done. 205 tests pass. |
| Sign-in, project list, idle check, quiesce and resume, `pg_dump`, health check on the live server | Done, tested read-only on 2026-10-14. |
| Runner registered, LaunchAgent placed, runner online | Done on 2026-10-14. |
| GitHub security settings (section 11) and the guard check (section 11.5) | To do by the operator. |
| First deploy: push to `main` | To do. First run of the switch, the restart and the auto rollback. |
| Rollback test: `ops/rollback.sh`, then `ops/deploy.sh <new id>` | To do after the first deploy. Also the first run of the live-sessions route. |
| Parked session across a restart (D6) | Open. |
| Sandbox re-created after a destroy (section 7.3) | Open. |
| Spine record (`ARCHITECTURE-SPINE.md`) and bmad-loop guards | Open. Only the BMAD framework edits them. Two guards now fail: the root-directory set, and "`factory-start.sh` execs `npm run start`". |

### 13.1 Defects found in testing, and fixed

| Defect | Effect | Fix |
| --- | --- | --- |
| A zsh local variable named `path` in `factory_api` | `path` is tied to `PATH`, so `curl` was "command not found" and every API call failed | Renamed to `route`; comment in `release-lib.sh` |
| The old server answers the unknown route `/web/ops/live-sessions` with the UI's HTML and status 200 | The idle check read "0 running" and reported idle (fail-open) | The route counts only when its JSON has `running` and `parked` arrays; every `jq` count fails on bad input |
| The fallback note went to stdout | The idle check returned it as a busy reason and would wait 6 h | The note goes to stderr |
| `runsvc.sh` missing in the runner root | `ops/install.sh` refused | `register.sh` copies it |
| The job-started hook was written in zsh (`print`) | The runner runs `.sh` hooks as `/bin/bash -e`, ignoring the shebang: exit 127, the first deploy failed in "Set up runner" | The hook is plain bash; tested the way the runner calls it |
| The repo's `"type": "module"` reached the runner's code | The runner service crashed at start; GitHub showed it Offline | `register.sh` writes `runner/package.json` (CommonJS) |

## 14. Open items

1. Does Factory create a new container for a session whose container was destroyed, and restore its
   checkout? (Checked later. Until then, no destroy through a deploy.)
2. Does a parked session survive a restart? (Until tested, a parked session blocks a deploy.)

## Sources

- [Self-hosted runners reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Actions limits](https://docs.github.com/en/actions/reference/limits)
- [Runner as a service](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service)
- [Remove runners](https://docs.github.com/en/enterprise-server@3.20/actions/how-tos/manage-runners/self-hosted-runners/remove-runners)
- [Run scripts before or after a job](https://docs.github.com/en/enterprise-server@3.20/actions/how-tos/manage-runners/self-hosted-runners/run-scripts)
- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
