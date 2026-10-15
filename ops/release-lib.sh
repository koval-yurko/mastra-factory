#!/bin/zsh
# Shared routines for ops/deploy.sh, ops/rollback.sh and ops/local-mode.sh.
# Sourced, never run. Design: docs/ci-deploy-research.md.
#
# Supervision and file placement only (AGENTS.md, the ops/*.sh carve-out):
# release links, the launchd job, a database dump, and HTTP calls that ask the
# running Factory whether it is busy. No application logic.

zmodload zsh/datetime   # EPOCHSECONDS
# A failed API call inside a pipeline (curl | jq) must fail the pipeline.
setopt pipefail

readonly REPO_ROOT=/Users/koval/dev/test/mastra-factory
readonly RELEASES_DIR=$REPO_ROOT/releases
readonly DEPLOY_LOG=$RELEASES_DIR/deploy.log
readonly QUIESCE_FILE=$RELEASES_DIR/.quiesce.json
readonly HOLD_FILE=$RELEASES_DIR/HOLD
readonly FACTORY_LABEL=ai.mastra.factory
readonly FACTORY_PLIST=$HOME/Library/LaunchAgents/$FACTORY_LABEL.plist
readonly FACTORY_URL=http://127.0.0.1:4111
readonly DB_SERVICE=app-db

readonly KEEP_RELEASES=5
readonly QUIESCE_LIMIT_SECONDS=${QUIESCE_LIMIT_SECONDS:-21600}   # 6 h
readonly POLL_SECONDS=15
readonly CLEAN_POLLS=3
readonly START_WAIT_SECONDS=180
readonly STABLE_SECONDS=60

# Release ids: UTC timestamp, a dash, 7 hex characters of the commit.
readonly RELEASE_ID_PATTERN='^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7}$'

# launchd gives the scripts a minimal PATH; jq, docker and curl live here.
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

say() { print -r -- "[release] $*"; }
fail() { print -u2 -r -- "[release] $*"; return 1; }

# One line per activation outcome, kept beside the releases.
record() {
  mkdir -p "$RELEASES_DIR"
  print -r -- "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$DEPLOY_LOG"
}

# ---------------------------------------------------------------------------
# .env — read single keys, never source the file
# ---------------------------------------------------------------------------

# Value of KEY from the repo-root .env: last non-comment assignment wins,
# surrounding single or double quotes removed. Empty when unset.
env_value() {
  local key=$1 line value
  [[ -f $REPO_ROOT/.env ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$REPO_ROOT/.env" | tail -n 1) || true
  value=${line#*=}
  value=${value%$'\r'}
  if [[ $value == \"*\" || $value == \'*\' ]]; then
    value=${value[2,-2]}
  fi
  print -r -- "$value"
}

# ---------------------------------------------------------------------------
# Releases and links
# ---------------------------------------------------------------------------

is_release_id() { [[ $1 =~ $RELEASE_ID_PATTERN ]]; }

# Every release folder, oldest first (the names sort by time).
release_ids() {
  local dir
  for dir in "$RELEASES_DIR"/*(N/); do
    is_release_id "${dir:t}" && print -r -- "${dir:t}"
  done
}

# The release a link points at, or nothing.
link_target() {
  local link=$RELEASES_DIR/$1
  [[ -L $link ]] && print -r -- "$(readlink "$link")"
}

check_release() {
  local id=$1
  is_release_id "$id" || { fail "not a release id: $id"; return 1; }
  [[ -f $RELEASES_DIR/$id/output/index.mjs ]] || { fail "release $id has no output/index.mjs"; return 1; }
  [[ -f $RELEASES_DIR/$id/output/factory/index.html ]] || { fail "release $id has no Factory UI (output/factory/index.html)"; return 1; }
  check_sandbox_images "$id"
}

# With the docker sandbox selected, every image the release's sandbox catalog
# names must exist on this engine: a missing one fails each session that needs
# it, and only after the release is live. The image pipeline
# (.github/workflows/sandbox-images.yml) builds them; a rollback needs the old
# tags, so never prune an image a stored release names (sandbox/README.md).
# A release built before the catalog existed has none and is not checked.
check_sandbox_images() {
  local id=$1 catalog=$RELEASES_DIR/$1/output/sandbox-catalog.json tag missing=()
  [[ $(env_value FACTORY_SANDBOX_PROVIDER) == docker ]] || return 0
  [[ -f $catalog ]] || { say "release $id has no sandbox-catalog.json — not checking images"; return 0; }
  for tag in $(jq -r '[.default.image, (.projects[] | .image // empty)] | unique | .[]' "$catalog"); do
    DOCKER_HOST=${DOCKER_HOST:-unix://$HOME/.colima/default/docker.sock} docker image inspect "$tag" >/dev/null 2>&1 \
      || missing+=("$tag")
  done
  (( ${#missing} == 0 )) || {
    fail "release $id names sandbox image(s) this engine does not have: ${missing[*]} — run the sandbox-images workflow"
    return 1
  }
}

# Point a link at a release in one rename: a reader sees the old or the new
# target, never a missing link. `mv -h` renames the link itself on macOS.
set_link() {
  local name=$1 id=$2
  ln -sfn "$id" "$RELEASES_DIR/.$name.tmp"
  mv -fh "$RELEASES_DIR/.$name.tmp" "$RELEASES_DIR/$name"
}

# Merge fields into release.json. Usage: release_json_set <id> '<jq filter>' [jq args…]
release_json_set() {
  local id=$1 filter=$2 file=$RELEASES_DIR/$1/release.json
  shift 2
  [[ -f $file ]] || print '{}' > "$file"
  jq "$@" "$filter" "$file" > "$file.tmp" && mv -f "$file.tmp" "$file"
}

# ---------------------------------------------------------------------------
# The launchd job
# ---------------------------------------------------------------------------

factory_pid() {
  launchctl list | awk -v label="$FACTORY_LABEL" '$3 == label { print $1 }'
}

factory_loaded() { launchctl print "gui/$UID/$FACTORY_LABEL" >/dev/null 2>&1; }

health_ok() {
  [[ $(curl -s -o /dev/null -m 5 -w '%{http_code}' "$FACTORY_URL/health") == 200 ]]
}

restart_factory() {
  if factory_loaded; then
    launchctl kickstart -k "gui/$UID/$FACTORY_LABEL"
  else
    launchctl bootstrap "gui/$UID" "$FACTORY_PLIST" 2>/dev/null || true
    launchctl kickstart "gui/$UID/$FACTORY_LABEL"
  fi
}

stop_factory() {
  launchctl bootout "gui/$UID/$FACTORY_LABEL" 2>/dev/null || true
  local deadline=$(( EPOCHSECONDS + 60 ))
  while health_ok && (( EPOCHSECONDS < deadline )); do sleep 2; done
  ! health_ok || { fail "the server still answers on $FACTORY_URL after bootout"; return 1; }
}

# /health answers 200, then keeps answering for STABLE_SECONDS with the same
# launchd pid. A pid change means KeepAlive restarted a crashed server.
wait_healthy() {
  local deadline=$(( EPOCHSECONDS + START_WAIT_SECONDS )) pid
  until health_ok; do
    (( EPOCHSECONDS < deadline )) || { fail "no 200 from $FACTORY_URL/health within ${START_WAIT_SECONDS}s"; return 1; }
    sleep 3
  done
  pid=$(factory_pid)
  deadline=$(( EPOCHSECONDS + STABLE_SECONDS ))
  while (( EPOCHSECONDS < deadline )); do
    sleep 5
    health_ok || { fail "/health stopped answering during the ${STABLE_SECONDS}s check"; return 1; }
    [[ $(factory_pid) == "$pid" ]] || { fail "the server restarted during the ${STABLE_SECONDS}s check (crash loop)"; return 1; }
  done
}

# ---------------------------------------------------------------------------
# Factory API — sign in with the .env login, call with a bearer token
# ---------------------------------------------------------------------------

typeset -g FACTORY_TOKEN=

# The token and the password never appear in argv (ps): both reach curl on stdin.
factory_sign_in() {
  local email password response
  email=$(env_value FACTORY_DEPLOY_EMAIL)
  password=$(env_value FACTORY_DEPLOY_PASSWORD)
  if [[ -z $email || -z $password ]]; then
    fail "FACTORY_DEPLOY_EMAIL and FACTORY_DEPLOY_PASSWORD must be set in $REPO_ROOT/.env"
    return 1
  fi
  response=$(jq -n --arg email "$email" --arg password "$password" '{email: $email, password: $password}' |
    curl -sS -m 20 -X POST -H 'Content-Type: application/json' --data-binary @- \
      "$FACTORY_URL/auth/api/sign-in/email") || { fail "sign-in request failed"; return 1; }
  FACTORY_TOKEN=$(print -r -- "$response" | jq -r '.token // empty' 2>/dev/null)
  [[ -n $FACTORY_TOKEN ]] || { fail "sign-in returned no token — check the .env login"; return 1; }
}

# factory_api <METHOD> <path> [json body]  → response body on stdout; fails on HTTP >= 400.
factory_api() {
  # Not `path`: in zsh that name is tied to PATH, and a local one empties the command search.
  local method=$1 route=$2 body=${3:-}
  local -a args=(-sS -f -m 30 -X "$method" -K -)
  [[ -n $body ]] && args+=(-H 'Content-Type: application/json' --data-raw "$body")
  print -r -- "header = \"Authorization: Bearer $FACTORY_TOKEN\"" | curl "${args[@]}" "$FACTORY_URL$route"
}

project_ids() {
  factory_api GET '/web/factory/projects?page=0&perPage=100' | jq -r 'if (.projects | type) == "array" then .projects[].id else error("no project list") end'
}

# ---------------------------------------------------------------------------
# Quiesce: no Factory work in flight
# ---------------------------------------------------------------------------

# Prints a reason when the factory is busy, nothing when idle. Fails on an API error.
busy_reason() {
  local live project count ids items
  ids=$(project_ids) || return 1
  # Only the route's own JSON counts. A server without the route answers the
  # path with the UI's HTML and status 200, which must never read as "idle".
  if live=$(factory_api GET /web/ops/live-sessions 2>/dev/null) &&
     print -r -- "$live" | jq -e '(.running | type == "array") and (.parked | type == "array")' >/dev/null 2>&1; then
    count=$(print -r -- "$live" | jq '.running | length') || return 1
    (( count == 0 )) || { print "$count running session(s)"; return 0; }
    count=$(print -r -- "$live" | jq '.parked | length') || return 1
    (( count == 0 )) || { print "$count parked session(s) waiting for an answer"; return 0; }
  else
    # A server older than src/mastra/ops/live-sessions.ts (the first deploy
    # after it was added) has no such route. Fall back to Factory's own lists,
    # which cover work-item sessions only — not chat-only sessions.
    say "no /web/ops/live-sessions on this server — checking work-item sessions only" >&2
    for project in ${(f)ids}; do
      items=$(factory_api GET "/web/factory/projects/$project/work-items") || return 1
      count=$(print -r -- "$items" | jq -e '(.runningSessionIds // []) | length') || return 1
      (( count == 0 )) || { print "$count running session(s) in project $project"; return 0; }
      count=$(print -r -- "$items" | jq -e '(.parkedSessionIds // []) | length') || return 1
      (( count == 0 )) || { print "$count parked session(s) in project $project"; return 0; }
    done
  fi
  for project in ${(f)ids}; do
    count=$(factory_api GET "/web/factory/projects/$project/decisions?statuses=pending,leased,retry&limit=1" |
      jq -e '.decisions | length') || return 1
    (( count == 0 )) || { print "active decisions in project $project"; return 0; }
  done
}

# Set every project's autoRunEnabled back to what quiesce saved.
resume_automation() {
  [[ -f $QUIESCE_FILE ]] || return 0
  local project enabled ok=1
  if [[ -z $FACTORY_TOKEN ]]; then factory_sign_in || return 1; fi
  for project in $(jq -r 'keys[]' "$QUIESCE_FILE"); do
    enabled=$(jq -r --arg p "$project" '.[$p]' "$QUIESCE_FILE")
    if factory_api PATCH "/web/factory/projects/$project" "{\"autoRunEnabled\":$enabled}" >/dev/null; then
      say "automation of project $project restored to autoRunEnabled=$enabled"
    else
      ok=0
      fail "could not restore autoRunEnabled=$enabled on project $project — set it in the UI"
    fi
  done
  (( ok )) && rm -f "$QUIESCE_FILE"
}

# Pause automation, then wait for CLEAN_POLLS idle polls in a row. The saved
# state is written BEFORE the first pause, so a crash can always be resumed.
quiesce() {
  local project enabled reason clean=0
  local deadline=$(( EPOCHSECONDS + QUIESCE_LIMIT_SECONDS ))
  factory_sign_in || return 1

  # A previous run that died between pause and resume left its saved state.
  if [[ -f $QUIESCE_FILE ]]; then
    say "found $QUIESCE_FILE from an earlier run — resuming first"
    resume_automation || return 1
  fi

  local saved='{}' ids
  ids=$(project_ids) || { fail "could not list the Factory projects"; return 1; }
  for project in ${(f)ids}; do
    enabled=$(factory_api GET "/web/factory/projects/$project" | jq -r '.project.autoRunEnabled // false') || return 1
    saved=$(print -r -- "$saved" | jq --arg p "$project" --argjson v "$enabled" '. + {($p): $v}')
  done
  print -r -- "$saved" > "$QUIESCE_FILE"
  for project in $(print -r -- "$saved" | jq -r 'to_entries[] | select(.value == true) | .key'); do
    factory_api PATCH "/web/factory/projects/$project" '{"autoRunEnabled":false}' >/dev/null || return 1
    say "paused automation of project $project"
  done

  while (( clean < CLEAN_POLLS )); do
    if (( EPOCHSECONDS >= deadline )); then
      fail "factory still busy after ${QUIESCE_LIMIT_SECONDS}s: $reason"
      return 1
    fi
    reason=$(busy_reason) || { fail "could not read the factory state"; return 1; }
    if [[ -z $reason ]]; then
      (( clean += 1 ))
    else
      clean=0
      say "waiting: $reason"
    fi
    (( clean < CLEAN_POLLS )) && sleep $POLL_SECONDS
  done
  say "factory is idle ($CLEAN_POLLS clean polls)"
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

compose() { (cd "$REPO_ROOT" && DOCKER_HOST=${DOCKER_HOST:-unix://$HOME/.colima/default/docker.sock} docker compose "$@"); }

# pg_dump inside the database container, with the container's own credentials.
dump_database() {
  local target=$1
  compose exec -T "$DB_SERVICE" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$target.tmp" &&
    [[ -s $target.tmp ]] && mv -f "$target.tmp" "$target" || { rm -f "$target.tmp"; fail "pg_dump failed"; return 1; }
}

restore_database() {
  local source=$1
  compose exec -T "$DB_SERVICE" sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$source"
}

# ---------------------------------------------------------------------------
# Pruning
# ---------------------------------------------------------------------------

# The releases pruning would delete, oldest first: all but the newest
# KEEP_RELEASES, never current, previous or a pinned one.
releases_to_prune() {
  local -a ids keep
  local id start
  ids=($(release_ids))
  # Not ${ids[-KEEP_RELEASES,-1]}: with fewer ids than that, zsh returns an
  # empty slice, and every release but current and previous would be deleted.
  start=$(( ${#ids} > KEEP_RELEASES ? ${#ids} - KEEP_RELEASES + 1 : 1 ))
  keep=(${ids[$start,-1]} $(link_target current) $(link_target previous))
  for id in $ids; do
    (( ${keep[(Ie)$id]} )) && continue
    [[ -e $RELEASES_DIR/pinned/$id ]] && continue
    print -r -- "$id"
  done
}

prune_releases() {
  local id
  for id in $(releases_to_prune); do
    rm -rf -- "$RELEASES_DIR/$id"
    say "pruned $id"
    record "pruned $id"
  done
}

# ---------------------------------------------------------------------------
# Activation — shared by deploy and rollback
# ---------------------------------------------------------------------------

# activate <id> <mode>   mode: deploy (takes a dump) | rollback (no dump)
#
# Automation stays paused across the restart: autoRunEnabled lives in the
# database, so the new server comes up paused and nothing starts before the
# health check. It is restored afterwards, on whichever server then runs. A
# cancel (INT/TERM, e.g. from the runner) restores it before exiting.
activate() {
  local id=$1 mode=$2 old_current outcome

  check_release "$id" || return 1
  old_current=$(link_target current)
  [[ $old_current == "$id" ]] && say "$id is already current — restarting it"

  trap 'resume_automation; exit 143' INT TERM
  if health_ok; then
    quiesce || { resume_automation; trap - INT TERM; record "$mode $id FAILED quiesce"; return 1; }
  else
    say "the server is not answering — nothing to quiesce"
  fi

  if [[ $mode == deploy ]]; then
    say "dumping the database to releases/$id/db.dump"
    if ! dump_database "$RELEASES_DIR/$id/db.dump"; then
      resume_automation; trap - INT TERM; record "$mode $id FAILED dump"; return 1
    fi
  fi

  [[ -n $old_current && $old_current != "$id" ]] && set_link previous "$old_current"
  set_link current "$id"
  say "current -> $id${old_current:+ (was $old_current)}"

  restart_factory
  if wait_healthy; then
    release_json_set "$id" '. + {activatedAt: $at, health: "pass"}' --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    outcome="ok (was ${old_current:-none})"
    say "$id is live"
  else
    release_json_set "$id" '. + {health: "fail"}'
    outcome="FAILED health"
    if [[ -n $old_current && $old_current != "$id" ]]; then
      fail "$id failed its health check — switching back to $old_current"
      set_link current "$old_current"
      restart_factory
      if wait_healthy; then
        outcome+=", rolled back to $old_current"
      else
        outcome+=", rollback to $old_current ALSO FAILED"
        fail "$old_current is not healthy either — see ~/Library/Logs/mastra-factory/err.log"
      fi
    fi
  fi

  # Restored once a server answers; otherwise .quiesce.json stays for the next run.
  if health_ok; then resume_automation; fi
  trap - INT TERM
  record "$mode $id $outcome"
  [[ $outcome == ok* ]]
}
