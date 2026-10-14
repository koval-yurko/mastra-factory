#!/bin/zsh
# Switch between the released service and a local run (docs/ci-deploy-research.md, section 9).
#
#   ops/local-mode.sh on       set HOLD, wait for idle Factory work, stop the service
#   ops/local-mode.sh off      start the service on releases/current, check health, clear HOLD
#   ops/local-mode.sh status
#
# Between "on" and "off": npm run build && npm run start (or npm run dev).
# While HOLD is set, CI still builds and stores releases but deploys none.
# Supervision only (AGENTS.md, the ops/*.sh carve-out).

set -u
source "${0:A:h}/release-lib.sh"

case ${1:-} in
  on)
    mkdir -p "$RELEASES_DIR"
    touch "$HOLD_FILE"
    say "HOLD set — CI will not deploy"
    if health_ok; then
      trap 'resume_automation; exit 143' INT TERM
      quiesce || { resume_automation; fail "not stopped; HOLD stays set. Run 'ops/local-mode.sh off' to clear it."; exit 1; }
      # Automation is restored before the stop, so the local server starts with
      # the projects as they were. A run can start in these few seconds.
      resume_automation
      trap - INT TERM
    fi
    stop_factory || exit 1
    record "local-mode on"
    say "the released service is stopped; port 4111 is free"
    ;;
  off)
    if health_ok && ! factory_loaded; then
      fail "something still answers on $FACTORY_URL — stop the local server first"
      exit 1
    fi
    [[ -n $(link_target current) ]] || { fail "no releases/current — deploy a release first"; exit 1; }
    restart_factory
    wait_healthy || { fail "the released service is not healthy; HOLD stays set"; exit 1; }
    rm -f "$HOLD_FILE"
    record "local-mode off ($(link_target current))"
    say "released service is live on $(link_target current); HOLD cleared"
    ;;
  status)
    print "HOLD:    $([[ -e $HOLD_FILE ]] && print set || print 'not set')"
    print "agent:   $(factory_loaded && print "loaded, pid $(factory_pid)" || print 'not loaded')"
    print "current: $(link_target current || true)"
    if pid=$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -n 1) && [[ -n $pid ]]; then
      print "port 4111: pid $pid, cwd $(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    else
      print "port 4111: free"
    fi
    ;;
  *) print -u2 "usage: ${0:t} on | off | status"; exit 2 ;;
esac
