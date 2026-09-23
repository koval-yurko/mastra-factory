#!/bin/zsh
# Place the supervision artifacts where the OS reads them.
#
# Safe to re-run, and it starts nothing: bootstrapping the agents, the pmset
# settings and the newsyslog dry run are Story 4.2's operator steps.
#
# Supervision and file placement only (AGENTS.md, the ops/*.sh carve-out).

set -eu

# ${0:A} is this script's own absolute, symlink-resolved path; :h twice is the
# repo root, since this script lives at <root>/ops/install.sh.
readonly SCRIPT_DIR="${0:A:h}"
readonly REPO_ROOT="${SCRIPT_DIR:h}"

# Every path in both plists is absolute and baked to this root. Running the
# installer from a copy of the repo elsewhere — a bmad-loop worktree, say —
# would link plists pointing at a different tree, and launchd would report
# nothing wrong. Refuse instead.
readonly EXPECTED_ROOT=/Users/koval/dev/test/mastra-factory

if [[ "$REPO_ROOT" != "$EXPECTED_ROOT" ]]; then
  print -u2 "[install] refusing: the plists are baked to $EXPECTED_ROOT"
  print -u2 "[install] but this checkout is $REPO_ROOT"
  print -u2 "[install] nothing was installed. Run this from the deployment checkout."
  exit 1
fi

# Same problem one level up: every log path in both plists is baked under
# /Users/koval/Library/Logs, while the directory created below follows $HOME. A
# run under any other home would create it somewhere the agents never write to,
# and they would then refuse to spawn for want of their log directory.
readonly EXPECTED_HOME=/Users/koval

if [[ "$HOME" != "$EXPECTED_HOME" ]]; then
  print -u2 "[install] refusing: the plists bake log paths under $EXPECTED_HOME"
  print -u2 "[install] but \$HOME is $HOME"
  print -u2 "[install] nothing was installed. Run this as the deployment's own user."
  exit 1
fi

readonly LOG_DIR="$HOME/Library/Logs/mastra-factory"
readonly AGENT_DIR="$HOME/Library/LaunchAgents"
readonly NEWSYSLOG_DIR=/etc/newsyslog.d
readonly CONF_NAME=ai.mastra.factory.conf

# Check every source before placing any of it. `ln -sfn` never stats its source,
# so a renamed or deleted plist would install as a dangling symlink and launchd
# would report only an opaque spawn failure; a wrapper that lost its executable
# bit fails the same silent way.
for required in \
  "$REPO_ROOT/ops/launchagents/ai.mastra.colima.plist" \
  "$REPO_ROOT/ops/launchagents/ai.mastra.factory.plist" \
  "$REPO_ROOT/ops/newsyslog/$CONF_NAME"; do
  if [[ ! -f "$required" ]]; then
    print -u2 "[install] refusing: missing $required"
    print -u2 "[install] nothing was installed."
    exit 1
  fi
done

if [[ ! -x "$REPO_ROOT/ops/factory-start.sh" ]]; then
  print -u2 "[install] refusing: $REPO_ROOT/ops/factory-start.sh is missing or not executable"
  print -u2 "[install] nothing was installed. Restore its mode with chmod +x."
  exit 1
fi

# Take elevation first. The newsyslog copy is the last step, and with `set -e` a
# declined or failed sudo there would abort with both plists already linked and
# nothing said about the partial placement.
print "[install] sudo is needed to install $NEWSYSLOG_DIR/$CONF_NAME as root:wheel — this prompt is expected"
if ! sudo -v; then
  print -u2 "[install] refusing: could not obtain elevation. Nothing was installed."
  exit 1
fi

# launchd does not create the log directory, and an agent whose
# StandardOutPath is unwritable will not spawn.
mkdir -p "$LOG_DIR"
mkdir -p "$AGENT_DIR"
print "[install] log directory: $LOG_DIR"

# Link rather than copy: launchd follows a symlink in ~/Library/LaunchAgents,
# and linking keeps the repo copy the only copy (AD-5). Edit the file in the
# repo, re-bootstrap the agent, done.
for plist in ai.mastra.colima.plist ai.mastra.factory.plist; do
  ln -sfn "$REPO_ROOT/ops/launchagents/$plist" "$AGENT_DIR/$plist"
  print "[install] linked $AGENT_DIR/$plist -> $REPO_ROOT/ops/launchagents/$plist"
done

# The opposite case: the newsyslog conf must be root-owned 644, and a
# root-read file pointing into a user-writable repo is a privilege problem
# newsyslog may refuse outright. So it is copied, with elevation — which means
# a change to the conf requires re-running this installer.
sudo install -o root -g wheel -m 644 "$REPO_ROOT/ops/newsyslog/$CONF_NAME" "$NEWSYSLOG_DIR/$CONF_NAME"
print "[install] installed $NEWSYSLOG_DIR/$CONF_NAME (root:wheel 644)"

print "[install] done. Nothing was started — bootstrap the agents per Story 4.2."
