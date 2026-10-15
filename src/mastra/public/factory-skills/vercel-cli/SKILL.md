---
name: vercel-cli
description: Run the Vercel CLI (`vercel`) in the sandbox against one of several Vercel projects. Use when asked about Vercel deployments, build failures, logs, domains or environment variables.
---

# Vercel CLI

`vercel` is installed only in the sandbox images of projects that use Vercel. Check with
`command -v vercel` first; if it prints nothing, say that this project's sandbox has no Vercel
CLI, and do not try to install it. Docs: https://vercel.com/docs/cli

## Pick the project for each command

One CLI works with several Vercel projects. The sandbox has:

- `VERCEL_TOKEN` — the login, read by the CLI itself;
- `VERCEL_ORG_ID` — the team that owns the projects, also read by the CLI itself;
- one `VERCEL_PROJECT_<NAME>_ID` per project, for example `VERCEL_PROJECT_API_ID`.

List the projects this sandbox knows with `env | grep -o '^VERCEL_PROJECT_[A-Z0-9_]*_ID' | sort`.
If the user does not say which project, ask; do not guess.

For a command about one project, set `VERCEL_PROJECT_ID` for that command only:

```sh
VERCEL_PROJECT_ID="$VERCEL_PROJECT_API_ID" vercel ls
```

Without it, a project command stops with "You specified `VERCEL_ORG_ID` but you forgot to specify
`VERCEL_PROJECT_ID`". That error means you did not pick a project; pick one and run the command
again. A command about the team (for example `vercel project ls`) needs no project:

```sh
vercel project ls --scope "$VERCEL_ORG_ID"
```

Each command starts in a fresh shell, so repeat `VERCEL_PROJECT_ID=…` every time. Never `export` it,
never change `VERCEL_ORG_ID`, and never write either to `.vercel/` or another file: the next command
could then reach the wrong project.

## Rules

- Never run `vercel login` or `vercel logout`. Credentials come only from `VERCEL_TOKEN`.
- Never print, echo, log or write `VERCEL_TOKEN` anywhere — not to a file, a commit, a PR or the
  chat. To check it is present, use `test -n "$VERCEL_TOKEN" && echo set`.
- Do not deploy, promote, roll back, remove, or change environment variables or domains unless the
  user explicitly asks for that exact action on that project.
- Pass `--yes` only to commands the user asked for, and never to a command that removes something.
- Show the command's output to the user in a code block.
