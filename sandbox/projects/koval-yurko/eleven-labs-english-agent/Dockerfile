# Session image for the koval-yurko/eleven-labs-english-agent repository.
#
# Extends the base image instead of replacing it, so git, the GitHub CLI and the
# rest of what every session needs still come from sandbox/factory-sandbox.Dockerfile,
# and this file adds only what this project's work calls for. The base tag is pinned
# by date for the reason the global image's tag is: two builds of one Dockerfile stay
# two distinguishable images, so rolling back is naming the older one. Bump it here
# deliberately, the way the pinned eas-cli version in the base gets bumped.
#
# Build it with `npm run sandbox:build -- koval-yurko/eleven-labs-english-agent`,
# which smoke-tests it, checks its architecture, and writes the resulting tag into
# the sandbox.json beside this file. Procedure in sandbox/README.md.
#
# The base tag below is the newest one in sandbox/README.md's tag history, so it has
# to exist in the local image store before this file can build — build the base first
# if it does not. Moving to a newer base means editing this line, which is the point:
# a project image inherits a base deliberately, not whenever the base happens to move.
#
# No WORKDIR: /workspace is the base image's contract, pinned by the bmad-loop gate
# across the base Dockerfile, MASTRACODE_SANDBOX_WORKDIR and src/mastra/config/sandbox.ts.
# Restating it here would add a fourth place that has to agree.
FROM factory-sandbox:2026-10-03c

# Vercel CLI — pinned; bump the version and rebuild to upgrade.
#
# This repository deploys services/api to Vercel, and its agents need to read deploy
# status, build failures and recent runtime logs. Having the CLI in the image is what
# stops the workaround koval-yurko/eleven-labs-english-agent#3 reports — `npx --yes
# vercel@latest` in scripts/env-sync.mjs, roughly 59 MB fetched per call and a moving
# version — from being the only way to reach that data from a session. Read-only use
# only; the commands that are and are not allowed are the target repository's to say.
RUN npm install -g vercel@63.1.2 && npm cache clean --force && vercel --version
