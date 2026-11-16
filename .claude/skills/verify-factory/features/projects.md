# Projects

An operator creates a Factory project, sees it in the project list and changes its settings. A
project groups work items and boards, and it holds the automation switch `autoRunEnabled`.

## Sub-features

- `project-create` creates a project with a name and an optional description.
- `project-list` shows the project to members of the same organization.
- `project-update` changes metadata without a change to automation, unless asked.

## How to get to it (user POV)

- The UI: the project list after sign-in (an authenticated page, not driven yet; see `../SKILL.md` Drive).
- The CLI: `mastra api factory project create|list|get|update`.

## Driving it with the mastra api CLI

Preconditions:

- Sign-in passed, and `$M` is set.
- No project named `verify-project` exists.

- **Create.** Run `"${M[@]}" project create '{"name":"verify-project","description":"factory-verify scratch project"}' > evidence/projects/01-create.json`. `.data.project` has an `id`, `name` `verify-project`, `autoRunEnabled` `false`, and `createdBy` equal to the verify user's id.
- **List.** Run `"${M[@]}" project list > evidence/projects/02-list.json`. `.data` contains one object with that `id`.
- **Update.** Read the contract with `"${M[@]}" project update --schema`. Run `"${M[@]}" project update $PID '{"description":"updated by verify"}' > evidence/projects/03-update.json`. `.data.project.description` is the new text, `autoRunEnabled` is still `false`, and `updatedAt` is later than in `01-create.json`. Then run `"${M[@]}" project get $PID > evidence/projects/03-get-after-update.json` for the second view.
- **Errors.** Run `"${M[@]}" project update $PID '{}' 2> evidence/projects/05-empty-update.json`. The CLI exits `1` with `HTTP_ERROR` status `400` and the body `{"error":"invalid_project"}`.
- **Second view (docker).** Run `docker exec factory-verify-db-$RUN_ID psql -U factory -d factory_verify -c "SELECT * FROM factory_projects WHERE id = '<id>';" > evidence/projects/04-db.txt`.

## Gotchas

- The create response nests the object: `.data.project.id`, not `.data.id`. Set `PID=$(jq -r .data.project.id evidence/projects/01-create.json)`.
- A project has no `revision`. The proof of an update is the stored value and a later `updatedAt`.
- `project list` ignores `page` and `perPage` and returns every project of the organization.
- The CLI writes an error to stderr and exits `1`. Capture an expected error with `2>`, never `>`.
- `autoApprovePlans` is deprecated: the update route ignores it, and a project never returns it.
- A new project has `modelScope` `hybrid` and no default model. Agent runs need a model; see [Agent sessions](./agent-sessions.md).
- Do not set `autoRunEnabled: true` on a project that has cards. That can start real agent runs.
