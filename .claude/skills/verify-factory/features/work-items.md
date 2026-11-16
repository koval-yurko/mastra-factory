# Work items and boards

An operator adds a card to a project's board, and the card moves through the board's stages under
optimistic concurrency. Each move raises the card's `revision`, and a move with an old revision is
refused.

## Sub-features

- `boards-list` shows the built-in boards and their phases.
- `card-create` creates a card in `intake` on the `work` board.
- `card-transition` moves a card to another stage and raises its revision.
- `card-stale-revision` refuses a move that sends an old `expectedRevision`.

## How to get to it (user POV)

- The UI: the project board after sign-in (an authenticated page, not driven yet).
- The CLI: `mastra api factory boards`, `work-item create|list|transition`.

## Driving it with the mastra api CLI

Preconditions:

- [Projects](./projects.md) `project-create` passed. Set `PID=$(jq -r .data.project.id evidence/projects/01-create.json)`.

- **Boards.** Run `"${M[@]}" boards $PID > evidence/work-items/01-boards.json`. Board `work` has the phases `intake, triage, planning, execute, review, pr-review, done, canceled`. Board `review` has `intake, review, done, canceled`.
- **Create card.** Run `"${M[@]}" work-item create $PID '{"title":"Verify: intake card"}' > evidence/work-items/02-create.json`. `.data.workItem` has an `id`, `board` `work`, `stages` `["intake"]` and `revision` `1`. Set `WID=$(jq -r .data.workItem.id evidence/work-items/02-create.json)`.
- **Transition.** Run `"${M[@]}" work-item transition $PID $WID "{\"board\":\"work\",\"stage\":\"triage\",\"requestId\":\"$(node -p 'crypto.randomUUID()')\",\"cause\":\"manual\",\"expectedRevision\":1}" > evidence/work-items/03-transition.json`. `.data.result.revision` is `2`.
- **Second view.** Run `"${M[@]}" work-item list $PID > evidence/work-items/04-list-after.json`. In `.data.workItems`, the card shows `stages` `["triage"]` and `revision` `2`.
- **Stale revision.** Run `"${M[@]}" work-item transition $PID $WID "{\"board\":\"work\",\"stage\":\"planning\",\"requestId\":\"$(node -p 'crypto.randomUUID()')\",\"cause\":\"manual\",\"expectedRevision\":1}" 2> evidence/work-items/05-stale.json`. The CLI exits `1`. In the file, `.error.code` is `HTTP_ERROR`, `.error.details.status` is `409`, and `.error.details.body.result` has `"status":"rejected"` and `"code":"stale"`. A new `list` (`06-list-after-stale.json`) still shows `triage` and revision `2`.
- **Database row (docker).** Run `docker exec factory-verify-db-$RUN_ID psql -U factory -d factory_verify -c "SELECT id, work_item_id, board, stages, revision FROM factory_board_items WHERE id = '$WID';" > evidence/work-items/07-db.txt`. One row: board `work`, stages `["triage"]`, revision `2`.

## Gotchas

- `work-item list` takes only the project id. A second JSON argument fails with `too many arguments for 'list'`.
- `work-item update` never moves a card. Use `transition`.
- Moving a card to `triage`, `planning` or `execute` on a project with `autoRunEnabled: true` can start an agent run. Keep it `false` here.
- A fresh `requestId` is required for each new move. The same id again replays the stored result (exit `0`), so a stale probe with an old id never gives `409`.
- The CLI writes errors to stderr. Capture an expected `409` with `2>`.
- The card id from the API is a **board item** id. Its stage and revision are in `factory_board_items`, not in `factory_work_items` (that table has no row with this id) and not in `work_items`. `factory_board_items` is a table, not a view.
