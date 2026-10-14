#!/bin/bash
# Runner job-started hook: refuse every job that is not the owner's deploy.
#
# The runner runs this before each job (ACTIONS_RUNNER_HOOK_JOB_STARTED in the
# runner's own .env, which is outside git). A non-zero exit fails the job
# before its first step. The workflow's own `if:` lines live in the repo, so a
# pushed branch with a new workflow file could drop them; this check cannot be
# changed by a push — only by a pull into this checkout.
#
# Plain bash, not zsh: the runner ignores the shebang and runs a .sh hook as
# `/bin/bash -e <file>` (seen in runner/_diag/Worker_*.log). A zsh builtin such
# as `print` is "command not found" there, exit 127, and every job fails.
#
# Supervision only (AGENTS.md, the actions-runner/*.sh carve-out).

set -u

readonly OWNER=koval-yurko
readonly REPOSITORY=koval-yurko/mastra-factory
readonly WORKFLOW_REF=$REPOSITORY/.github/workflows/deploy.yml@refs/heads/main

refuse() {
  printf '[runner-guard] refused: %s\n' "$1" >&2
  printf '[runner-guard] repository=%s ref=%s workflow=%s actor=%s triggering_actor=%s event=%s\n' \
    "${GITHUB_REPOSITORY:-?}" "${GITHUB_REF:-?}" "${GITHUB_WORKFLOW_REF:-?}" \
    "${GITHUB_ACTOR:-?}" "${GITHUB_TRIGGERING_ACTOR:-?}" "${GITHUB_EVENT_NAME:-?}" >&2
  exit 1
}

[[ ${GITHUB_REPOSITORY:-} == "$REPOSITORY" ]] || refuse "not $REPOSITORY"
[[ ${GITHUB_REF:-} == refs/heads/main ]] || refuse "not the main branch"
[[ ${GITHUB_WORKFLOW_REF:-} == "$WORKFLOW_REF" ]] || refuse "not .github/workflows/deploy.yml on main"
[[ ${GITHUB_ACTOR:-} == "$OWNER" ]] || refuse "actor is not $OWNER"
[[ ${GITHUB_TRIGGERING_ACTOR:-} == "$OWNER" ]] || refuse "triggering actor is not $OWNER"
case ${GITHUB_EVENT_NAME:-} in
  push|workflow_dispatch) ;;
  *) refuse "event ${GITHUB_EVENT_NAME:-?} is not push or workflow_dispatch" ;;
esac

printf '[runner-guard] accepted: %s by %s on %s\n' "$GITHUB_EVENT_NAME" "$GITHUB_ACTOR" "$GITHUB_REF"
