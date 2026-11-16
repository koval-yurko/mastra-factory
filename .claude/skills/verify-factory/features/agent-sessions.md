# Agent sessions

An operator connects GitHub, links a repository to a project and opens a session on it. Factory
creates one Docker sandbox container from the catalog image with the catalog ceilings, clones the
repository into it and checks out a session branch. With a model key, the agent then works on that
branch. In a verify run, the fakes server (`src/mastra/verify-fakes/`) plays GitHub and the
model, so no real GitHub App, browser consent, model key or network is needed.

## Sub-features

- `github-connect` connects the GitHub App installation (OAuth identify, installation list).
- `repo-link` links the installation's repository to a Factory project.
- `session-create` creates a user session on the linked repository with a `user/session-<id>` branch.
- `session-sandbox` starts exactly one `factory-sandbox:<tag>` container with the catalog ceilings, and clones the repository into it.
- `session-agent` runs one agent turn on the fake model: a tool call in the sandbox that commits and pushes to the fake.
- `session-cleanup` removes the container that the run started.

## How to get to it (user POV)

- The UI: Settings › GitHub › Connect, the project's repository settings, then a new session (authenticated pages, not driven yet).
- The browser route `GET /auth/github/connect` and the routes below, with the bearer token.

## Driving it with curl, the fakes server and the sandbox

Preconditions:

- Launch ran with the fakes server (`../SKILL.md` step 1), and Doctor passes, including the two fake checks.
- `H=(-H "Authorization: Bearer $VERIFY_TOKEN" -H 'Content-Type: application/json')`, `F=http://127.0.0.1:$FAKE_PORT`, `E=$R/evidence/sessions`, and `mkdir -p $E`.
- One authenticated `/web/*` call was made, so the personal organization exists.
- Steps marked **docker** run only in `docker` mode; steps marked **local** only in `local` mode. Report the others as skipped.

- **Connect.** Run the browser hops with curl. The first redirect goes to `https://github.com/login/oauth/authorize`; send it to the fake, and the fake answers with the callback.
  `L1=$(curl -s -o /dev/null -w '%{redirect_url}' "${H[@]}" $U/auth/github/connect)`,
  `L2=$(curl -s -o /dev/null -w '%{redirect_url}' "${L1/https:\/\/github.com/$F}")`,
  `curl -s -o $E/01-callback.txt -w '%{http_code} %{redirect_url}\n' "${H[@]}" "$L2"`. The last line is `302 $U/?github=connected`.
  Then `curl -s "${H[@]}" $U/web/github/status > $E/02-status.json`: `connected` is `true`, with installation `4242` for `factory-verify`.
- **Repositories.** Run `curl -s "${H[@]}" $U/web/github/repos > $E/03-repos.json`. One repo: `factory-verify/sandbox`, id `4244`. Keep `.repos[0].installationStorageId` as `INST`.
- **Project and connection.** Run `"${M[@]}" project create '{"name":"verify-sessions"}' > $E/04-project.json` and keep `PID=$(jq -r .data.project.id $E/04-project.json)`. Then `curl -s "${H[@]}" -X POST $U/web/factory/projects/$PID/source-control-connections -d "{\"integrationId\":\"github\",\"installationId\":\"$INST\"}" > $E/05-connection.json`, which returns `.connection.id` (keep it as `CID`).
- **Link.** Run `curl -s "${H[@]}" -X POST $U/web/factory/projects/$PID/source-control-connections/$CID/repositories -d '{"repository":{"externalId":"4244","slug":"factory-verify/sandbox"},"sandboxProvider":"custom","sandboxWorkdir":"/workspace"}' > $E/06-link.json`. `.projectRepository.id` is the project repository id (`PRID`).
- **Session.** Run `curl -s "${H[@]}" -X POST $U/web/github/projects/$PRID/sessions -d '{"title":"Verify session"}' > $E/07-session.json`. `.session` has a `sessionId`, `branch` `user/session-<sessionId>` and `baseBranch` `main`. Keep `SID=$(jq -r .session.sessionId $E/07-session.json)` for the routes below. `.session.id` is a different value: the session row id, which names the sandbox.
- **Sandbox (docker).** Run `docker ps -aq --no-trunc | sort > $R/scratch/containers-before`, then `curl -s -m 600 "${H[@]}" -X POST $U/web/user-sessions/$SID/sandbox/start -d '{}' > $E/08-sandbox-start.json` (`{"started":true}`), then `docker ps -aq --no-trunc | sort | comm -13 $R/scratch/containers-before - | tee $R/scratch/session-containers`. Exactly one id. `server.log` shows `repository clone attempt=1 exit=0`, and `fake.log` shows `GET /factory-verify/sandbox.git/info/refs?service=git-upload-pack`.
- **Container (docker).** Run `docker inspect $(cat $R/scratch/session-containers) > $E/09-container.json`. Image is the catalog default (`factory-sandbox:<tag>` from `build.log`), `Memory` and `MemorySwap` are `1073741824`, `CpuQuota`/`CpuPeriod` are `50000`/`100000`, `PidsLimit` is `4096`, `Init` is `true`, and the only `GIT_*` env is the `GIT_CONFIG_PARAMETERS` rewrite to `host.docker.internal:<FAKE_PORT>`.
- **Checkout (docker).** Run `docker exec <id> sh -c 'cd /workspace/sandbox && git log --oneline -1 && git branch --show-current' > $E/10-workspace.txt`. The commit equals `git --git-dir $R/scratch/git/factory-verify/sandbox.git log --oneline -1 main`, and the branch is the session branch.
- **Sandbox (local).** Run `curl -s -m 600 "${H[@]}" -X POST $U/web/user-sessions/$SID/sandbox/start -d '{}' > $E/08-sandbox-start.json` (`{"started":true}`). `server.log` shows `repository clone attempt=1 exit=0`, and `fake.log` shows the `git-upload-pack` requests. No container starts: the session runs as processes of the verify server.
- **Checkout (local).** Run `d=$(dirname $(find $R/scratch/sandboxes -maxdepth 3 -name .git -type d | head -1))`, then `{ echo $d; git -C $d log --oneline -1; git -C $d branch --show-current; } > $E/10-workspace.txt`. The folder is `scratch/sandboxes/<.session.id>/sandbox` (the session row id, not `$SID`), the commit equals the fake's `main`, and the branch is the session branch.
- **Model key.** Store the fake model's sentinel key (see "The model" in `../SKILL.md`): `for scope in user org; do curl -s "${H[@]}" -X PUT $U/web/config/providers/anthropic/key -d "{\"key\":\"sk-ant-factory-verify-fake-model\",\"scope\":\"$scope\"}"; done > $E/12-model-key.json`. Both answers are `"ok":true`, and `.provider.provider` is `anthropic`.
- **Model.** A new session runs on the built-in default `openai/gpt-5.5` and fails with `ProviderAuthRequiredError … openai`. Switch it: `curl -s "${H[@]}" -X POST $U/api/agent-controller/code/sessions/$SID/model -d '{"modelId":"anthropic/claude-haiku-4-5"}'` answers `{"ok":true}`. `code` is the only agent controller (`GET $U/api/agent-controller`).
- **Agent turn.** Send one message: `curl -s "${H[@]}" -X POST $U/api/agent-controller/code/sessions/$SID/messages -d '{"message":"Write the fake model marker file, commit it and push the branch."}'` answers `{"ok":true}` at once; the reply streams on `…/sessions/$SID/stream`. Wait until `fake.log` has a new `MODEL stream … -> end_turn` line. Before it, `fake.log` shows `MODEL stream tools=<n> -> tool_use execute_command` and `POST /factory-verify/sandbox.git/git-receive-pack`.
- **Turn proof.** Run `git --git-dir $R/scratch/git/factory-verify/sandbox.git log --oneline --all > $E/20-fake-repo-log.txt` and `git --git-dir $R/scratch/git/factory-verify/sandbox.git branch >> $E/20-fake-repo-log.txt`. The session branch exists on the fake and its tip is `Fake model turn`. In the sandbox (`docker exec <id>` in `docker` mode, the clone folder in `local` mode), `git log --oneline -1` shows the same commit and `FAKE_MODEL.md` exists.
- **Cleanup.** The SKILL cleanup removes every id in `scratch/session-containers`, and only those ids.

## Gotchas

- The fake model's command tool starts in the sandbox workdir (`/workspace`), not in the clone. The script changes into the first git checkout below it; a real model does the same with `cd`.
- A model call with a different key, for example a real one, goes to `api.anthropic.com`. Only the sentinel key reaches the fake.

- The link route answers `400 invalid_project_repository` unless the body has both `sandboxProvider` and `sandboxWorkdir`.
- In `docker` mode the repository is cloned to `/workspace/<repo name>`, not to `/workspace` itself. In `local` mode it goes to `scratch/sandboxes/<.session.id>/<repo name>`. Factory never reads the stored `sandboxWorkdir` at runtime.
- `?github=error` after the callback means the server log has a `[GitHub] Install callback failed …` line with the cause. A `bad port` cause means the fake runs on 4190; use 4191-4199.
- `fake.log` lines starting with `UNHANDLED` name a GitHub endpoint that the fake does not answer yet. Add it in `apiRoute` in `src/mastra/verify-fakes/server.ts`, with a test.
- `gh` inside the container still targets `api.github.com`; the rewrite covers only `git`. An agent step that uses `gh` fails in a verify run.
- Production shares the Colima VM: 12 GiB and 6 CPUs, with 10 GiB for all sandboxes. One verify session adds to production's load.
- Never remove a container that is not in `scratch/session-containers`. Production session containers use the same image.
- The dev server (`mastra factory dev`, Launch step 2) has no `sandbox-catalog.json`, so a Docker session there fails with `sandbox-catalog.json is missing`. Use the built server (Launch step 4).
