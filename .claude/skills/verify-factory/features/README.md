# Factory verification map

This directory is the maintained source for proving the user-facing behavior of this self-hosted
Factory. Read this index before you drive the instance from `../SKILL.md`. Then use the matching
feature file as the recipe.

## Baseline preconditions

- The instance was started by `../SKILL.md` steps 1-5 in this worktree, and Doctor passes.
- The database is the run's own `factory-verify-db-<RUN_ID>` (empty when it starts, in memory).
- One account exists: `verify@example.invalid`, its password in `scratch/account.sh`, its bearer token in `scratch/token.sh`.
- `U=http://127.0.0.1:<APP_PORT>` and `M=(npx mastra api --url $U --header "Authorization: Bearer $VERIFY_TOKEN" factory)` are set in the shell.
- Never drive port `4111`. Never drive an instance whose PID is not in `scratch/server.pid`.

## Driving conventions

- Start each recipe from the baseline, unless its preconditions say otherwise.
- Read a leaf's contract with `"${M[@]}" <command> --schema` before a write. Use a fresh `node -p 'crypto.randomUUID()'` for every `requestId`.
- Responses wrap the object: `project create` returns `.data.project`, `project list` returns `.data` (an array), `boards` returns `.data.boards`, `work-item create` returns `.data.workItem`, `work-item transition` returns `.data.result`, and `work-item list` returns `.data.workItems` (with `runningSessionIds` and `parkedSessionIds` beside it).
- The UI needs a browser `Accept` header. Use headless Chrome from `../SKILL.md` (Drive), not plain `curl`.

## Proof and skip reporting

- Save the action's response and a later, read-only second view of the state in `evidence/<feature-id>/`.
- UI proof is a headless-Chrome screenshot plus `--dump-dom` of the same page.
- Mutation proof includes the new `revision` (work items) or a later `updatedAt` (projects, which have no revision), and a later `list` or `SELECT` that shows the stored value.
- The CLI writes an error to stderr and exits `1`. Capture an expected error with `2>`, and check the exit code.
- Report each entry point that you did not drive, with the reason. Never report it as verified through another path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph that describes the user-visible
behavior. Then it has exactly four H2 sections, in this order: `Sub-features`,
`How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.

## Features

- [Sign-in and closed registration](./sign-in.md) covers the sign-in page, password sign-in, refused sign-up and the personal organization.
- [Projects](./projects.md) covers project create, list and update.
- [Work items and boards](./work-items.md) covers boards, card create, stage transitions and revision checks.
- [Agent sessions](./agent-sessions.md) covers GitHub connect through the fakes server, repository link, session create, its sandbox and clone, and one agent turn on the fake model that commits and pushes.
