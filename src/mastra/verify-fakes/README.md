# verify-fakes

Local fakes of the 2 external services that a Factory agent session needs: **GitHub** and the
**Anthropic model API**. A verification run (`.claude/skills/verify-factory/`) uses them so that it
needs no GitHub App, no browser consent, no model key and no network. Production never uses them.

## What it does

One small HTTP server (`server.ts`) listens on `127.0.0.1` and plays both services:

| Fake | What it answers | File |
| --- | --- | --- |
| GitHub OAuth | `GET /login/oauth/authorize` sends the browser back to the callback with a code. `POST /login/oauth/access_token` returns a user token. | `server.ts` |
| GitHub App and REST API | Under `/api/…`: the user, 1 App installation (id `4242`), installation tokens, 1 repository (id `4244`), commits, branches, pull requests and comments. The state is kept in memory. | `server.ts` (`apiRoute`) |
| Git hosting | `/<owner>/<name>.git/…` runs `git http-backend` on a bare repository, so clone, fetch and push work. The server creates the repository with 1 commit on `main` when it starts. | `server.ts` |
| Anthropic model | `POST /anthropic/v1/messages` (JSON and streaming SSE) with a fixed script, see below. | `anthropic.ts` |

## How Factory reaches the fakes

All 3 paths are on only while `FACTORY_FAKES_URL` is set. `src/mastra/config/env.ts` accepts only
`http://127.0.0.1:<port>`, and `src/mastra/config/fakes-url.ts` is the one place that reads it.

1. **The Factory server process.** `redirect.ts` wraps `globalThis.fetch`
   (`installFakesRedirect`, called from `src/mastra/config/integrations.ts`):
   - `https://api.github.com/…` goes to `<fakes>/api/…`.
   - `https://github.com/login/oauth/…` goes to `<fakes>/login/oauth/…`.
   - `https://api.anthropic.com/…` goes to `<fakes>/anthropic/…`, but **only** when the request
     carries the key `sk-ant-factory-verify-fake-model`. A real key always reaches Anthropic.
2. **Session sandboxes.** `githubFakeSandboxEnv` in `src/mastra/config/sandbox.ts` gives each
   sandbox one git setting (`GIT_CONFIG_PARAMETERS`), which makes git use the fake instead of
   `https://github.com/`. Docker containers reach the host as `host.docker.internal`, and local
   sandboxes use `127.0.0.1`.
3. **Browser steps.** The verify skill follows the OAuth redirects with `curl` and replaces
   `https://github.com` with the fakes URL in the redirect.

## The scripted model

`anthropic.ts` decides each reply from the request alone, so every run gives the same result:

1. The request offers a tool with a string `command` input, for example `execute_command`: the fake
   calls it once. The command changes into the clone, writes `FAKE_MODEL.md`, commits it as
   `Fake model turn` and pushes the branch. Other required text fields of the tool get a short
   value.
2. The last message has a tool result: the fake ends the turn with a short text.
3. Every other call (titles, memory, a request without tools): a short text.

A verify run stores the key `sk-ant-factory-verify-fake-model` as the Anthropic provider key with
`PUT /web/config/providers/anthropic/key`, because Factory sessions read model keys only from that
store. The proof of a turn is the `Fake model turn` commit on the session branch in the fake
repository. The fake proves Factory's flow (model call, tool run, push), not model quality.

## Run it

```bash
node src/mastra/verify-fakes/server.ts --port 4191 --repo factory-verify/sandbox \
  --git-root <scratch>/git --log <scratch>/fake.log
```

- The server prints `fakes ready http://127.0.0.1:<port>` when it listens.
- Use a port from 4191 to 4199. Do not use 4190: `fetch` refuses it, because it is on the
  "bad ports" list.
- Run it with plain `node`: it must not import a relative file without the `.ts` extension.
- The verify skill starts and stops it; see "Launch" and "Cleanup" in
  `.claude/skills/verify-factory/SKILL.md`.

## The log

Each request is one line in the `--log` file. Two kinds of lines are important:

- `MODEL stream tools=<n> -> tool_use execute_command` or `-> end_turn`: one model call and what the
  fake answered.
- `UNHANDLED <method> <path>`: Factory called a GitHub endpoint that the fake does not answer. The
  fake answers it with `404`.

## Add a missing endpoint

1. Find the `UNHANDLED` line in the log.
2. Add the route to `apiRoute` in `server.ts` and return the fields that Factory reads.
3. Add a case to `server.test.ts`.

## Tests

`npm test` runs:

- `server.test.ts`: OAuth, REST, `git clone` and `git push` over the fake, and a start under
  plain `node`.
- `anthropic.test.ts`: the script, and the real `@ai-sdk/anthropic` client against the fake.
  `ai` and `@ai-sdk/anthropic` come in through `@mastra/code-sdk`, so a dependency update can
  break this test.
- `redirect.test.ts`: which URLs go to the fakes.

## Limits

- One repository and one installation per server.
- No webhooks: the fake never calls Factory.
- The fake accepts every request without authentication. That is why it listens on
  `127.0.0.1` only.
- `gh` inside a sandbox still goes to `api.github.com`; only `git` is rewritten.
- The model script is fixed. A real model turn needs a real key in the credential store.
