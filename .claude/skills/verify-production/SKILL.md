---
name: verify-production
description: "Prove a deployed change on the REAL production Factory at https://factory.kovalchuk.win: sign in with the FACTORY_TEST_* login, open a session on a linked repository, start its Docker sandbox, check the container (image, ceilings, env names, files), send one agent prompt, read the reply and delete the session. Use after a push to main has deployed, when the user asks for production or end-to-end proof of a sandbox, secret or session change. For a change that is not deployed yet, use verify-factory instead."
---

# Verify on production

This skill acts on the live server: the real database, the real GitHub App and the real model key.
Each agent prompt costs money. Do only what the user asked, and delete what you created.

`verify-factory` is the disposable copy with fakes. Use it before a deploy. Use this skill after
the deploy (`ops/README.md` says how a push to `main` deploys).

## Rules

1. **Never print a secret.** Keep the token in a shell variable, and pass it to `curl` on stdin
   (`-K -`), never as an argument. Never echo `FACTORY_TEST_PASSWORD` or the token.
2. **Never list environment variables with a line tool.** `env | cut -d= -f1` (or `sed`, `awk`,
   `grep`) prints every line of a multi-line value in full. This leaked a GCP private key on
   2026-11-16. Use one of these:
   - on the host: `docker inspect <id> | jq '[.[0].Config.Env[] | split("=")[0]] | sort'`
   - in a container or in a prompt to the agent:
     `node -e 'console.log(Object.keys(process.env).sort().join("\n"))'`
3. **Tell the session agent the same.** A prompt must name the safe command and say "never print a
   value". Do not let the agent choose its own command to list secrets.
4. **Read-only by default.** Create at most one session per check, send at most the prompts the user
   asked for, and never ask the agent to commit, push, deploy, apply or destroy.
5. **Clean up.** Delete every session you created (step 7), also after a failure. Delete local
   files that hold session output.

## Where things run

| Step | factory Mac (Claude Code) | Factory session on `koval-yurko/mastra-factory` |
|---|---|---|
| Sign-in, sessions, prompts | yes | yes |
| Container checks (`docker`) | yes | no: the sandbox has no Docker socket |

## 1. Sign in

The login is in SSM: `<FACTORY_SSM_PARAMETER_PATH>/projects/koval-yurko/mastra-factory/`
`FACTORY_TEST_EMAIL` and `FACTORY_TEST_PASSWORD` (`sandbox/README.md`, "Project secrets").

- In a Factory session on `koval-yurko/mastra-factory`, both are already environment variables.
- On the factory Mac, load them from SSM. Run this from the repository root, with
  `npm ci` done. It reads the AWS keys from the main checkout's `.env` and prints nothing:

```zsh
eval "$(node --input-type=module -e '
import { parse } from "dotenv"; import { readFileSync } from "node:fs";
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
const e = parse(readFileSync("/Users/koval/dev/test/mastra-factory/.env"));
const c = new SSMClient({ region: e.AWS_SECRETS_MANAGER_REGION, credentials: {
  accessKeyId: e.AWS_SECRETS_MANAGER_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRETS_MANAGER_SECRET_ACCESS_KEY } });
const r = await c.send(new GetParametersByPathCommand({ WithDecryption: true,
  Path: e.FACTORY_SSM_PARAMETER_PATH.replace(/\/+$/, "") + "/projects/koval-yurko/mastra-factory" }));
for (const p of r.Parameters) { const n = p.Name.split("/").pop();
  if (n.startsWith("FACTORY_TEST_")) console.log(`export ${n}=${JSON.stringify(p.Value)}`); }')"
```

Then sign in, and define `api`. Each Bash call is a new shell, so put these lines at the start of
every call (or in a scratch file outside the repository that each call sources):

```zsh
U=https://factory.kovalchuk.win
FACTORY_TOKEN=$(jq -n --arg e "$FACTORY_TEST_EMAIL" --arg p "$FACTORY_TEST_PASSWORD" '{email:$e,password:$p}' |
  curl -sS -m 20 -X POST -H 'Content-Type: application/json' -H "Origin: $U" --data-binary @- \
    "$U/auth/api/sign-in/email" | jq -r '.token // empty')
unset FACTORY_TEST_PASSWORD
[[ -n $FACTORY_TOKEN ]] || { echo "sign-in failed" >&2; exit 1; }
api() { local m=$1 r=$2 b=${3:-}; local -a a=(-sS -m 60 -X "$m" -K -)
  [[ -n $b ]] && a+=(-H 'Content-Type: application/json' --data-raw "$b")
  print -r -- "header = \"Authorization: Bearer $FACTORY_TOKEN\"" | curl "${a[@]}" "$U$r"; }
```

`mastra api factory --url $U` works with the same token, but only through
`--header "Authorization: Bearer …"`, which shows the token in `ps`. Prefer `api`.

## 2. Find the project repository

```zsh
api GET '/web/factory/projects?page=0&perPage=10' | jq -c '.projects[] | {id, name}'
api GET /web/factory/projects/<project-id>/source-control-connections \
  | jq -c '.connections[].repositories[] | {id, slug: .repository.slug}'
```

The `id` of the wanted slug is the project repository id (`PRID`). A repository that is not listed
is not linked; linking one is a change to production, so ask first.

## 3. Create the session and start its sandbox

```zsh
docker ps -aq --no-trunc | sort > /tmp/vp-before          # Mac only
api POST /web/github/projects/$PRID/sessions '{"title":"verify-production: <what>"}' > /tmp/vp-session.json
SID=$(jq -r .session.sessionId /tmp/vp-session.json)      # .session.id is a different value
api POST /web/user-sessions/$SID/sandbox/start '{}'      # {"started":true}; can take minutes
docker ps -aq --no-trunc | sort | comm -13 /tmp/vp-before - > /tmp/vp-containers   # Mac only: one id
```

## 4. Check the container (Mac only)

```zsh
C=$(cat /tmp/vp-containers)
docker inspect $C | jq -c '.[0] | {image: .Config.Image, mem: .HostConfig.Memory,
  cpu: [.HostConfig.CpuQuota, .HostConfig.CpuPeriod], entrypoint: .Config.Entrypoint, cmd: .Config.Cmd,
  env_names: ([.Config.Env[] | split("=")[0]] | sort)}'
docker exec $C sh -c 'cd /workspace/<repo name> && git branch --show-current && git log --oneline -1'
```

Compare the image and ceilings with `releases/current/output/sandbox-catalog.json`, and the env
names with the `secrets` in `sandbox/projects/<owner>/<name>/sandbox.json`. Factory runs the
container with `Cmd ["sleep","infinity"]`: the image `CMD` never runs, the image `ENTRYPOINT` does.

## 5. Send one prompt

```zsh
api GET /api/agent-controller/code/sessions/$SID | jq -c '{modelId, running}'
api POST /api/agent-controller/code/sessions/$SID/messages "$(jq -nc --arg m '<prompt>' '{message:$m}')"
```

Begin the prompt with: "This is an automated check. Do not change, commit or push anything. Never
print a secret value." Name every command the agent must run (rule 3). Then poll until
`running` is `false`, every 15 s.

## 6. Read the reply

```zsh
S=$(api GET /api/agent-controller/code/sessions/$SID)
T=$(print -r -- $S | jq -r .threadId); R=$(print -r -- $S | jq -r .resourceId)
api GET "/api/memory/threads/$T/messages?agentId=code&resourceId=$R&perPage=50" \
  | jq -r '.messages[-1] | [.content.parts[]? | select(.type=="text") | .text] | join("\n")'
```

Without `resourceId` the route answers "thread belongs to a different resource". Read the reply
before you report it: if it shows a secret, stop, delete the session (step 7) and tell the user to
rotate that secret.

## 7. Delete the session

```zsh
print -r -- "header = \"Authorization: Bearer $FACTORY_TOKEN\"" | curl -sS -K - -X DELETE "$U/web/user-sessions/$SID"
# {"removed":true}; a GET then answers "Session not found", and the container is gone
rm -f /tmp/vp-session.json /tmp/vp-before /tmp/vp-containers
```

## Report

Name the session id (deleted), the image tag, the ceilings, the env names, the checks that passed or
failed, the model, and what the agent ran. Never include a value, the token or a raw reply that
holds a secret.
