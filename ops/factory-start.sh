#!/bin/zsh
# Start wrapper for the ai.mastra.factory LaunchAgent.
#
# launchd has no dependency ordering: the Factory agent and the Colima agent are
# started independently, so this script waits for the Docker socket itself rather
# than letting the server crash-loop against a socket that is not there yet.
#
# Supervision only — no application logic lives here (AGENTS.md, the ops/*.sh
# carve-out). Nothing under ops/ is typechecked.

set -eu
zmodload zsh/datetime   # EPOCHSECONDS

# node and npm come from nvm, which installs outside every system prefix, so the
# baked PATH has to name the version directory itself: launchd sources no profile
# and `nvm use` is a shell function that does not exist here, so nothing else puts
# it on the path. The version is pinned rather than read from ~/.nvm/alias/default
# because supervision wants one deterministic runtime, not whichever Node a later
# `nvm alias default` happens to select. Bumping Node means editing this line.
readonly NODE_BIN=/Users/koval/.nvm/versions/node/v24.19.0/bin
export PATH=$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

# In a shell $HOME expands, so the socket is written with the variable here. The
# plist spells the same path out in full, because launchd does not expand it.
readonly DOCKER_SOCKET="$HOME/.colima/default/docker.sock"
export DOCKER_HOST="unix://$DOCKER_SOCKET"

readonly REPO_ROOT=/Users/koval/dev/test/mastra-factory

# Break as soon as the socket exists *and* the engine answers — a socket file
# alone is not a running daemon.
#
# The bound is wall clock, not a count of attempts: against a half-started or
# wedged engine a single `docker info` can block for tens of seconds, so N
# attempts × 5 s would promise ten minutes and deliver an hour, and the non-zero
# exit that hands the retry back to launchd might never be reached.
readonly WAIT_SECONDS=600
readonly POLL_SECONDS=5
readonly PROBE_SECONDS=20
typeset -i deadline=$(( EPOCHSECONDS + WAIT_SECONDS ))
typeset -i announced=0
typeset -i ready=0
typeset -i last_info_rc=-1   # -1 = never attempted, because the socket was absent

# The deadline is only read between polls, and `docker info` has no client-side
# timeout: against an engine that accepts the connection but never answers, it
# blocks indefinitely — so an uncapped probe would sail past the ten minutes and
# the exit below would never be reached, which is the very failure the wall-clock
# bound exists to prevent. Cap the probe itself. `timeout(1)` is not part of
# macOS, hence the watchdog; a probe killed by it reports 143.
probe_docker() {
  local rc=0 probe_pid killer_pid
  docker info >/dev/null 2>&1 &
  probe_pid=$!
  ( sleep $PROBE_SECONDS; kill -TERM $probe_pid 2>/dev/null ) &
  killer_pid=$!
  wait $probe_pid || rc=$?
  kill -TERM $killer_pid 2>/dev/null || true
  wait $killer_pid 2>/dev/null || true
  return $rc
}

while (( EPOCHSECONDS < deadline )); do
  if [[ -S "$DOCKER_SOCKET" ]]; then
    last_info_rc=0
    probe_docker || last_info_rc=$?
    if (( last_info_rc == 0 )); then
      ready=1
      break
    fi
  else
    last_info_rc=-1
  fi
  if (( announced == 0 )); then
    # Name the branch that is actually blocking: "no socket yet" and "socket is
    # there, engine does not answer" are different faults, and this line is what
    # Story 4.3 reads out of out.log.
    if (( last_info_rc < 0 )); then
      print "[factory] waiting up to ${WAIT_SECONDS}s for the Colima docker socket at $DOCKER_SOCKET"
    else
      print "[factory] waiting up to ${WAIT_SECONDS}s: socket $DOCKER_SOCKET is present, but docker info exits $last_info_rc"
    fi
    announced=1
  fi
  sleep $POLL_SECONDS
done

if (( ready == 0 )); then
  # Report the two conditions separately: "the Colima agent never created the
  # socket", "the socket is there but the engine does not answer" and "docker is
  # not on the baked PATH at all" (exit 127) need different fixes, and this
  # stderr line is the only trace the operator gets.
  if [[ -S "$DOCKER_SOCKET" ]]; then
    socket_state=present
  else
    socket_state=absent
  fi
  if (( last_info_rc < 0 )); then
    info_state="not attempted — socket absent"
  elif (( last_info_rc == 127 )); then
    info_state="exit 127 — docker not found on PATH=$PATH"
  elif (( last_info_rc == 143 )); then
    info_state="killed after ${PROBE_SECONDS}s — the engine accepted the connection but never answered"
  else
    info_state="exit $last_info_rc"
  fi
  print -u2 "[factory] docker not ready after ${WAIT_SECONDS}s — exiting for launchd to retry"
  print -u2 "[factory]   socket $DOCKER_SOCKET: $socket_state"
  print -u2 "[factory]   last docker info: $info_state"
  exit 1
fi

if (( announced == 1 )); then
  print "[factory] docker socket is up — starting the server"
fi

# The same fault the docker branch above reports as exit 127, one layer up. Left
# bare, a missing npm ends the run with "command not found: npm" and no record of
# which PATH was searched — so name it, the way every other exit here is named.
# Unlike the docker wait this is never transient: launchd will throttle-retry a
# config error forever, and this line is what tells the operator to stop waiting.
if [[ ! -x "$NODE_BIN/npm" ]]; then
  print -u2 "[factory] npm not found at $NODE_BIN/npm — not a transient fault, launchd will retry pointlessly"
  print -u2 "[factory]   the pinned Node was probably removed by \`nvm uninstall\`; reinstall it or repoint NODE_BIN"
  print -u2 "[factory]   installed: $(ls "$HOME/.nvm/versions/node" 2>/dev/null | tr '\n' ' ')"
  exit 1
fi

cd "$REPO_ROOT"
exec npm run start
