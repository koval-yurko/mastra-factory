---
name: eas-cli
description: Run the Expo EAS CLI (`eas`) in the sandbox. Use when asked about Expo, EAS, which Expo account is logged in ("eas whoami"), or EAS builds, updates, submissions and project info.
---

# EAS CLI

`eas` (eas-cli 24.10.0) is installed globally in the sandbox. Run it with `execute_command`, like
any other shell command. Docs: https://docs.expo.dev/eas/cli/

## Which account is logged in

Run `eas whoami`. On success it prints the Expo username, and the accounts it belongs to.
`Not logged in` means no credentials reached this sandbox: report that, and do not try to fix it.

## Find the Expo project folder first

Every `eas` command except `eas whoami` works on a project and must run from that project's root
folder. Repositories are cloned under `/workspace/<repo>`, and the Expo app is often in a
subfolder (`apps/mobile`, `mobile/`, …), not at the repository root. Before any project command:

1. Search the checkout for Expo project roots, skipping `node_modules`:

   ```sh
   find /workspace -path '*/node_modules' -prune -o \
     \( -name app.json -o -name 'app.config.*' -o -name eas.json \) -print
   ```

   A folder is an Expo project when it has `app.config.js`/`app.config.ts`, or an `app.json`
   with a top-level `"expo"` key, and its `package.json` depends on `expo`. `eas.json` sits in the
   same folder once EAS is configured.
2. Run every `eas` command from that folder, as `cd <project-folder> && eas <command>`. Each
   command starts in a fresh shell, so repeat the `cd` every time.
3. If several projects match, list them and ask the user which one to use. If none match, say
   that no Expo project was found in this workspace, and list where you searched. Do not run
   `eas init` or `npx create-expo-app` unless the user explicitly asks for a new project.

## Rules

- Never run `eas login` or `eas logout`. They prompt for a password, and the session cannot answer
  a prompt. Credentials come only from the `EXPO_TOKEN` environment variable.
- Never print, echo, log or write `EXPO_TOKEN` anywhere — not to a file, a commit, a PR or the chat.
  To check it is present, use `test -n "$EXPO_TOKEN" && echo set`.
- Pass `--non-interactive` to any `eas` command that accepts it, so it fails instead of waiting for
  input.
- Show the command's output to the user in a code block.
