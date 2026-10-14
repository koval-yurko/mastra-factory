# actions-runner — the GitHub Actions runner on this Mac

This folder holds the self-hosted runner that builds and deploys this repository on a push to
`main`. The design, and the reasons for it, are in `docs/ci-deploy-research.md`. The pipeline is
`.github/workflows/deploy.yml`. The release scripts are in `ops/`.

| Path | In git | What it is |
| --- | --- | --- |
| `register.sh` | yes | Downloads the runner, checks its SHA-256, registers it, writes its job environment. |
| `ai.mastra.runner.plist` | yes | The LaunchAgent that keeps the runner running. `ops/install.sh` links it. |
| `hooks/job-started.sh` | yes | Runs before every job (as `/bin/bash -e`, so plain bash only). Fails every job that is not the owner's deploy. |
| `runner/` | no | The runner program, its credentials (`.runner`, `.credentials*`), its `.env`, `.path` and `_work/`. |

Warning: `git clean -fdx` deletes `runner/`, including the registration. Use `git clean -fd`.

## Install

Do these steps in order, once. Each one says how to check it.

**Before you start**

- The Factory server runs as the LaunchAgent `ai.mastra.factory` (`ops/README.md`), and
  `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4111/health` prints `200`.
- `jq` is installed (`/usr/bin/jq` ships with macOS 15+, or `brew install jq`).
- You are logged in to macOS as the deployment user. A LaunchAgent runs only in a logged-in session.

1. **GitHub settings.** Apply "Security" below: private repo, no collaborators, allowed actions,
   read-only workflow token, the `main` ruleset, and the Factory GitHub App without `actions`,
   `administration` or `workflows` permission on this repo.

2. **Deploy login in `.env`.** Add an account that administers the Factory organization, then make
   `.env` readable only by you:

   ```sh
   # in .env
   FACTORY_DEPLOY_EMAIL=you@example.com
   FACTORY_DEPLOY_PASSWORD=...
   ```
   ```sh
   chmod 600 .env
   zsh -c 'source ops/release-lib.sh; factory_sign_in && echo token-ok && project_ids'
   ```

   Expected: `token-ok`, then one project id per line.

3. **Registration token.** Repo Settings > Actions > Runners > New self-hosted runner. Copy the token
   from the `./config.sh` line. It is valid for 1 hour.

4. **Register.**

   ```sh
   actions-runner/register.sh       # paste the token when asked; it is not echoed
   ```

   Expected last line: `[runner] done. … Nothing was started.` Section "What register.sh does" below
   lists each step.

5. **Place the LaunchAgent.** `ops/install.sh` links all three plists and copies the newsyslog conf.
   It asks for `sudo`, and it refuses to run before step 4 (it checks `runner/runsvc.sh`).

   ```sh
   ops/install.sh
   ```

6. **Start the runner.**

   ```sh
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.mastra.runner.plist
   launchctl kickstart gui/$(id -u)/ai.mastra.runner
   tail -n 5 ~/Library/Logs/mastra-factory/runner.log
   ```

   Expected: `√ Connected to GitHub`, then `Listening for Jobs`. On GitHub, Settings > Actions >
   Runners shows `factory-mac` as **Idle**. If not, see "Troubleshooting".

7. **Check the guard.** Do "Check it" at the end of "Security" below.

8. **First deploy.** Push to `main` and watch Actions > deploy. Then:

   ```sh
   ops/deploy.sh --list                                   # the new release has *
   grep '\[factory\] starting release' ~/Library/Logs/mastra-factory/out.log | tail -n 1
   ```

### What register.sh does

1. Downloads the newest `actions-runner-osx-arm64-<version>.tar.gz` into `runner/` and checks its
   SHA-256 against the value in the release notes. Skipped when `runner/config.sh` exists.
2. Registers with `config.sh --name factory-mac --labels factory-mac --work _work --unattended --replace`.
   Skipped when `runner/.runner` exists, unless you pass `--replace`.
3. Sets `runner/.credentials` to mode 600 (`config.sh` writes it readable by every user).
4. Copies `runner/bin/runsvc.sh` to `runner/runsvc.sh`. The plist starts that file. `./svc.sh install`
   would make the same copy, but it also writes its own plist outside the repo, so it is not used.
5. Writes `runner/package.json` with `{ "type": "commonjs" }`. The runner is CommonJS Node code inside
   this repo, and without this file Node applies the repo root's `"type": "module"` to it.
6. Writes these keys to `runner/.env` (the runner's file, not the project `.env`), keeping the lines
   `config.sh` wrote:

   | Key | Value |
   | --- | --- |
   | `REPO_ROOT` | This checkout. The workflow runs `ops/*.sh` from here, never from the job checkout. |
   | `FACTORY_NODE_VERSION` | The Node version pinned in `ops/factory-start.sh`. The build fails on any other. |
   | `DOCKER_HOST` | The Colima socket, for `pg_dump` and the sandbox containers. |
   | `ACTIONS_RUNNER_HOOK_JOB_STARTED` | `hooks/job-started.sh`. |

7. Writes `runner/.path` with the pinned Node first.

It is safe to run again, and it starts nothing. Run it again after a runner self-update, and after
a change to `NODE_BIN` in `ops/factory-start.sh`; then restart the runner, because the runner reads
`.env` and `.path` only at start.

The runner service itself runs on the Node it ships (`runner/externals/node24`). Job steps run on
the Node in `.path`, the same one as the Factory server.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ops/install.sh`: `refusing: …/actions-runner/runner/runsvc.sh is missing` | Step 4 not done, or an old `register.sh` | `actions-runner/register.sh` |
| `factory-mac` is **Offline**; `runner.err.log`: `require is not defined in ES module scope` | `runner/package.json` is missing | `actions-runner/register.sh`, then `launchctl kickstart -k gui/$(id -u)/ai.mastra.runner` |
| `launchctl list` shows `-` and a non-zero status for `ai.mastra.runner` | The service exits at start | Read `runner.err.log` first, then `runner/_diag/` |
| Runner gone from Settings > Actions > Runners | GitHub removes a runner after 14 days offline | New token, then `actions-runner/register.sh --replace` and a runner restart |
| Job fails in "Set up runner" with `Process completed with exit code 127` | The hook uses a non-bash command: the runner runs `.sh` hooks as `/bin/bash -e <file>`, whatever the shebang | Keep `hooks/job-started.sh` plain bash; test with `env -i GITHUB_…=… /bin/bash -e actions-runner/hooks/job-started.sh` |
| Job fails in "Set up runner" with `[runner-guard] refused` | The hook refused it: wrong branch, workflow, actor or event | Expected for anything but the owner's deploy. The log line names the field. |
| `build` fails at "Node is the server's Node" | `.path` names another Node | `actions-runner/register.sh`, then restart the runner |

## Operate

| Task | Command |
| --- | --- |
| Restart the runner | `launchctl kickstart -k gui/$(id -u)/ai.mastra.runner` |
| Stop the runner | `launchctl bootout gui/$(id -u)/ai.mastra.runner` |
| Logs | `~/Library/Logs/mastra-factory/runner.log`, `runner.err.log`; job logs in `runner/_diag/` |
| Why did the last job fail? (no browser needed) | `grep -E 'Arguments\|exit code\|Step result' "$(ls -t actions-runner/runner/_diag/Worker_*.log \| head -1)" \| tail -n 20` |
| Register again (GitHub removes a runner after 14 days offline) | `actions-runner/register.sh --replace`, then restart the runner |
| After a runner self-update | `actions-runner/register.sh`, then restart the runner |
| Remove | Stop it, then `cd actions-runner/runner && ./config.sh remove --token <removal token>` (Settings > Actions > Runners > the runner > Remove) |

The runner updates itself. A runner update restarts the runner process only, not the Factory server.

Facts that shape the pipeline: a job can run 5 days; a queued job is cancelled after 24 hours
without a runner; the connection is outbound HTTPS only.

## Security — only the owner can use this runner

A job on this runner runs as the deployment user. It can read the project `.env` and use Docker.
Four layers keep other people's code off it.

### 1. Who can start a workflow

- Keep the repository private. GitHub advises against self-hosted runners on public repos: anyone
  can fork one and open a pull request whose workflow asks for this runner.
- If it stays public: Settings > Actions > General > "Approval for running fork pull request
  workflows from contributors" = **Require approval for all external contributors**, and never
  approve a run you did not read. The hook (layer 3) then still refuses every job that is not
  `deploy.yml` on `main` by the owner, before any step runs.
- Settings > Collaborators: nobody.
- Settings > Deploy keys: no key with write access.
- Account Settings > Applications: remove every app with access to this repo that does not need it.
- Do not install the Factory GitHub App on this repo. With `actions: write` it can start a workflow;
  with `administration: write` it can register runners. If Factory must work on this repo, give its
  App neither, and no `workflows` permission.
- Personal access tokens: fine-grained, limited to the repos they need. Delete unused classic tokens
  with `repo` or `workflow` scope.
- Two-factor authentication on, with a passkey or security key.

### 2. Repository settings

Settings > Actions > General:

| Setting | Value |
| --- | --- |
| Actions permissions | Allow `koval-yurko`, and select non-`koval-yurko`, actions; allow actions created by GitHub. |
| Fork pull request workflows | Off. |
| Workflow permissions | Read repository contents. |
| Allow GitHub Actions to create and approve pull requests | Off. |

Settings > Rules > Rulesets, target `main`: restrict deletions, block force pushes.

Settings > Actions > Runners: one runner, `factory-mac`. No repository secrets.

### 3. The hook

`hooks/job-started.sh` fails a job unless the repository, `refs/heads/main`, the workflow file
`deploy.yml` on `main`, the actor, the triggering actor (`koval-yurko`) and the event (`push` or
`workflow_dispatch`) all match. Its path is in `runner/.env`, outside git, so a pushed commit cannot
switch it off. A changed hook takes effect only after a pull into this checkout.

### 4. The workflow

Only `push` to `main` and `workflow_dispatch` start it. Every job has `if:` checks on the repository,
branch and actor, `permissions: contents: read`, and a checkout with `persist-credentials: false`.
Never add `pull_request`, `pull_request_target`, `issue_comment` or `workflow_run`.

### Check it

1. Push a branch `test/runner-guard` with a workflow that runs on that branch with
   `runs-on: [self-hosted, factory-mac]`. Expected: the job fails in "Set up runner" with
   `[runner-guard] refused`. No step runs.
2. Run `deploy` with `workflow_dispatch` on a branch other than `main`. Expected: refused.
3. Delete the branch.
