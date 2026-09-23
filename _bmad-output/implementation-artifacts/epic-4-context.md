# Epic 4 Context: Unattended 24/7 supervision

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Take a deployment that has already been proven end-to-end by hand — container engine, datastore, sign-in,
sandboxes, public origin and all three provider apps — and put it under the operating system's own process
supervisor so it starts at login, restarts itself after a crash, comes back after a logout→login cycle, and
survives a planned restart without a human typing commands. The supervision itself has to be *material*: the
two LaunchAgent property lists, the wait-for-Docker start wrapper, the log-rotation config and the installer
all land as real, versioned, diffable files in the repo rather than snippets pasted out of a narrative
document. The epic ends only when recovery has been demonstrated rather than assumed — a killed process coming
back, a full logout→login bringing everything up, the start wrapper visibly waiting for the container socket,
and a rotated compressed log generation on disk — with the known recovery limits written down alongside.

## Stories

- Story 4.1: The supervision artifacts, as real files in the repo
- Story 4.2: [operator] Bring the agents up
- Story 4.3: [operator] Prove it comes back on its own

## Requirements & Constraints

- **Agents, not daemons.** The container VM runs inside a user login session, so a system daemon would start
  before any session exists and the server would crash-loop with no Docker socket. Running as the right uid
  does not fix this — the uid is not the session. The reason must be recorded in the ops subject's README, not
  just encoded in the files.
- **Two supervised processes.** One agent owns the container VM and keeps the supervisor attached to the VM
  itself (foreground) rather than watching a wrapper exit, with the documented CPU/memory/disk/VM-type sizing.
  The other owns the application, started under a power-assertion wrapper so the host does not idle out from
  under it.
- **Explicit environment is mandatory.** A login agent inherits a minimal search path and would not find the
  node, docker or git binaries; the default process type also throttles CPU and IO priority, which starves
  agent work. Both must be set explicitly, along with working directory, Docker socket, restart-on-exit,
  run-at-load and a restart throttle.
- **No dependency ordering exists.** The supervisor will not sequence the two agents, so the application's
  start wrapper must wait for the Docker socket and a succeeding engine query for up to ten minutes, breaking
  as soon as both hold. On timeout it emits a diagnostic and exits non-zero so the supervisor retries on its
  throttle instead of the process crash-looping.
- **Logs must rotate.** The supervisor never rotates; rotation is configured through the OS log-rotation
  facility for the application's stdout and stderr plus the VM log, at seven generations of ten megabytes, with
  no process to signal and compression on.
- **Installation places files outside the repo.** An installer creates the log directory (the agents will not
  spawn without it), places both property lists where the supervisor reads them, and installs the rotation
  config. It must be safe to re-run. The rotation config is **copied with elevation, never symlinked** — it
  must be root-owned `644`, and a link into a user-writable repo file is both a privilege problem and
  something the rotation tool may refuse.
- **Power behaviour is part of the deliverable.** Sleep disabled, auto-restart on power loss enabled, power
  nap off — applied on AC power.
- **Recovery must be demonstrated.** A forced kill-and-restart, a full logout→login with sign-in working over
  the public origin unaided, an observable wait-for-socket branch in the log, and a real rotated compressed
  generation with the live log still being written.
- **Known, accepted limits must be written down.** Full-disk encryption means an unplanned reboot has no
  session, no agents and no remote access until a human authenticates at the pre-boot screen; planned restarts
  therefore go through the authenticated-restart command, and a kernel panic or hardware fault is accepted
  residual risk. The tunnel daemon starts at boot while the application starts at login, so gateway errors in
  the boot-to-login window are expected, not a fault. Fast user switching must be disabled — a second
  session's logout takes the application down.

## Technical Decisions

- **Files are canonical; prose links out.** Every operational artifact is exactly one real file at its own
  seeded path under `ops/`. Narrative documentation references artifacts by repo-relative path and never
  reproduces their contents in a fenced block; any code block left in documentation is illustrative and must be
  marked non-normative. Existing section numbers in the narrative doc are stable citation anchors.
- **The property list references the wrapper at its repo path**, not a copy elsewhere — that is what keeps the
  single-canonical-file rule true and keeps "update the plist, the wrapper and the rotation conf in the same
  change" meaningful.
- **Repo root path and npm script names are an external contract.** The production entry point stays
  `npm run start` and must work with the repo root as cwd: the wrapper changes directory then execs it, and the
  agent pins its working directory to the repo root. Renaming that script or moving the repo requires updating
  the property list, the wrapper and the rotation conf together.
- **Shell scripts are the one carve-out to the code-under-`src/` rule.** `ops/*.sh` may exist outside `src/`
  because the supervisor and wrapper invoke them by path. They stay thin — process supervision and file
  placement only, never application logic. Anything needing a language runtime belongs under `src/` behind an
  npm script. Note the consequence: nothing in `ops/` is typechecked, so it is silently unverified by the gate.
- **Two planes, one vocabulary; root is a closed set.** Supervision is host infrastructure and belongs to the
  existing ops subject at root. Creating a new root directory is a spine change, not a local call. Operator-plane
  directories hold no first-party code and reach the code plane only through environment variables and CLI
  invocation, never an import.
- **Env-key truth is split.** The env schema file is the only list of keys and is normative for validation,
  generated types and public/sensitive marking; the owning subject's README is normative for what a value must
  contain and how to obtain it. The ops subject owns the Docker-socket variable and the supervision-facing
  vars. Neither side restates the other's half, and secrets never enter the repo.
- **Single machine, single process.** One process serves UI and API; no replicas, no shared external queues,
  no cross-process leases. Any supervision design implying otherwise is a conflict to surface.
- **Do not start extracting the entry.** Moving environment reading and construction into config modules is
  deliberately the *next* epic's work and must not begin here.
- **Gate reality.** Stories run in a fresh worktree containing tracked files only, with an install plus
  typecheck gate. Anything a story must read has to be committed.
- **Operator parking.** Two of three stories are human-only: commit whatever is automatable, then park the
  story awaiting operator action with the exact commands, checkpoints and proofs listed in the spec's
  operator-actions frontmatter, rather than reporting done. Completion is an explicit confirm step.

## Cross-Story Dependencies

- Depends on the whole build order up to this point: the previous epic's provider stories must be confirmed
  before Story 4.2 begins. Supervision automates a deployment already proven by hand — it is not the place to
  debug one.
- Story 4.1 is the only agent-doable story and must land first; Stories 4.2 and 4.3 bootstrap and exercise
  exactly the files it commits.
- Within Story 4.2 the log directory must exist (via the installer) before either agent is bootstrapped, and
  the rotation config only takes effect once root-owned at its system path.
- Story 4.3 depends on 4.2: nothing can be proven to recover until both agents are running and power behaviour
  is applied.
- The next epic rewrites layout and extracts the entry; it must not disturb the repo root path or the
  production start script without updating these artifacts in the same change.
