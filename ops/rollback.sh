#!/bin/zsh
# Go back to an earlier release (docs/ci-deploy-research.md, section 8).
#
#   ops/rollback.sh                  activate "previous"
#   ops/rollback.sh <id>             activate that release
#   ops/rollback.sh --with-db        activate "previous" AND restore the database
#   ops/rollback.sh --list           same as ops/deploy.sh --list
#
# A rollback never builds and takes no new dump.
#
# --with-db restores releases/<current>/db.dump: the database as it was just
# before the current release became current, which is the state "previous"
# ran on. So it is offered only for the step back to "previous". The current
# database is saved first as releases/<current>/db.before-restore.dump.
#
# Supervision only (AGENTS.md, the ops/*.sh carve-out).

set -u
source "${0:A:h}/release-lib.sh"

with_db=0
target=
for arg in "$@"; do
  case $arg in
    --with-db) with_db=1 ;;
    --list) exec "${0:A:h}/deploy.sh" --list ;;
    -*) print -u2 "usage: ${0:t} [<id>] [--with-db] | --list"; exit 2 ;;
    *) target=$arg ;;
  esac
done

current=$(link_target current)
previous=$(link_target previous)
[[ -n $target ]] || target=$previous
[[ -n $target ]] || { fail "no previous release recorded — name one (ops/deploy.sh --list)"; exit 1; }
[[ $target != "$current" ]] || { fail "$target is already current"; exit 1; }
[[ -e $HOLD_FILE ]] && { fail "releases/HOLD is set (local mode). Run ops/local-mode.sh off first."; exit 1; }

if (( ! with_db )); then
  activate "$target" rollback
  exit $?
fi

# ---- --with-db -------------------------------------------------------------
[[ $target == "$previous" ]] || {
  fail "--with-db works only for the step back to previous ($previous): only releases/$current/db.dump holds the database that release ran on"
  exit 1
}
readonly DUMP=$RELEASES_DIR/$current/db.dump
[[ -f $DUMP ]] || { fail "no $DUMP"; exit 1; }
check_release "$target" || exit 1

dump_time=$(stat -f '%Sm' "$DUMP")
print "This restores the database to $dump_time (from $current/db.dump)."
print "Every work item, session, token and memory written since then is LOST."
print -n "Type the release id $target to continue: "
read -r answer
[[ $answer == "$target" ]] || { print "Cancelled."; exit 1; }

trap 'resume_automation; exit 143' INT TERM
if health_ok; then
  quiesce || { resume_automation; exit 1; }
fi
say "saving the current database to releases/$current/db.before-restore.dump"
dump_database "$RELEASES_DIR/$current/db.before-restore.dump" || { resume_automation; exit 1; }
# The saved automation state belongs to the database being replaced.
rm -f "$QUIESCE_FILE"
trap - INT TERM

stop_factory || exit 1
say "restoring $DUMP"
restore_database "$DUMP" || { fail "pg_restore failed — the server stays stopped; restore by hand"; record "rollback $target --with-db FAILED restore"; exit 1; }

set_link previous "$current"
set_link current "$target"
restart_factory
if wait_healthy; then
  record "rollback $target --with-db ok (was $current, db from $dump_time)"
  say "$target is live on the restored database"
  exit 0
fi
record "rollback $target --with-db FAILED health"
fail "$target is not healthy on the restored database — see ~/Library/Logs/mastra-factory/err.log"
exit 1
