# Slack app

The operator-plane subject for the Slack application this deployment registers and owns — the app
that carries mentions and messages between a Slack workspace and Factory's agent. This file is
normative for the URLs Slack's console asks for, the events and settings that app is registered with,
and what each key under "Keys this subject owns" below must contain and how to obtain it.

`.env.schema` is the list of keys. `docs/self-hosting-research.md` §4.1 keeps the same URLs as a
narrative index across every provider; if the two ever disagree, this file wins. Neither is restated
here.

## Keys this subject owns

The table below is the closed list of the keys this file owns, and this file is the only record
for what each must contain and how to obtain it. The
other two `apps/` subjects, `sandbox/README.md`, `ops/README.md`, and `README.md` as the residual
owner, claim the rest; between the six tables every key `.env.schema` declares is claimed exactly
once.

| Key | What the value must contain | Full record |
|---|---|---|
| `SLACK_APP_SIGNING_SECRET` | the app's signing secret — and the master switch for Slack | the `SLACK_APP_SIGNING_SECRET` section below |
| `SLACK_APP_BOT_TOKEN` | the bot user's OAuth token, beginning `xoxb-` | the `SLACK_APP_BOT_TOKEN` section below |
| `SLACK_APP_CLIENT_ID` | the app's OAuth client ID | the `SLACK_APP_CLIENT_ID` section below |
| `SLACK_APP_CLIENT_SECRET` | the client secret of that same app | the `SLACK_APP_CLIENT_SECRET` section below |
| `MASTRACODE_CHANNELS_PUBLIC_URL` | the public HTTPS origin Slack must reach | the `MASTRACODE_CHANNELS_PUBLIC_URL` section below |

`.env.schema` declares and validates every key in that table and is the only list of key names;
this file never
restates what it declares. Behaviour that is non-obvious rather than operator-facing lives in
`docs/self-hosting-research.md` §11 ("Environment variables — traps only"), which is referenced here
by path and never copied.

## Console URLs

Register these at `api.slack.com/apps` → your app. All of them are written against this deployment's
public origin, `https://factory.kovalchuk.win`, and Slack accepts HTTPS only — a loopback URL cannot
be used here even for a first test.

| Field | Value |
|---|---|
| Event Subscriptions → Request URL **and** Interactivity & Shortcuts → Request URL | `https://factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook` |
| OAuth & Permissions → Redirect URL | `https://factory.kovalchuk.win/connect/slack/oidc/callback` |

The first row is **one value in two fields**: Events and Interactivity both post to the same
endpoint, on two separate console pages.

**The `mastra-code` segment is not a typo and is not derivable.** That path is assembled from the
agent controller's own id, which is the literal string `mastra-code`, even though Factory registers
that controller with Mastra under the shorter key `code`. Writing `/api/agent-controllers/code/...`
produces a URL that looks right, verifies nothing, and silently receives no deliveries. Copy the row
above rather than rebuilding the path from anything you see elsewhere.

Slack will not accept an Events Request URL until it answers a challenge, so the tunnel and the
server have to be up before this field can be saved. Interactivity has no such check — it accepts
whatever is typed, which makes it the more likely of the two to be wrong. Confirm both with one test
delivery: core skips platforms a provider manages itself, so a path that is merely plausible produces
silence rather than an error.

## App settings

| Setting | Value |
|---|---|
| Bot events | `app_mention`, `message.channels`, `message.groups`, `message.im`, `message.mpim` |
| Bot user | enabled |
| App Home | Messages tab enabled |
| Interactivity & Shortcuts | **On**, Request URL as in the table above; no shortcuts declared |
| Agents & AI Apps (assistant view) | enabled |
| OpenID Connect | enabled, for account linking |

All five bot events are the registered set. `app_mention` is the first summons; the four `message.*`
events are what let the agent follow the conversation afterwards, covering public channels, private
channels, direct messages and group DMs respectively.

The App Home messages tab is what makes the bot addressable in a DM at all; with it off, a direct
message to the app has nowhere to arrive. Interactivity is on because core's tool-approval buttons
post `block_actions` to that same URL; the assistant view exists only so Slack will accept the
typing-status call, and none of its own events are subscribed (see "Bot token scopes"). OpenID
Connect is not optional here: it is the *only* way an account link is ever written, and an unlinked
sender is blocked before the agent sees the message.

## Bot token scopes

The app is registered from `apps/slack/manifest.yaml` in this repository — see "Creating the app"
below — and that manifest requests seventeen bot scopes. Each one is here because a call in the
installed packages needs it, or because Slack gates one of the five bot events on it; nothing is
requested speculatively.
Paths below are relative to `node_modules/`, read at `@chat-adapter/slack@4.41.0` (which
`@mastra/slack@1.6.3` re-exports) and `@mastra/factory@0.15.0`; re-read the citation after a
dependency bump.

| Scope | What needs it |
|---|---|
| `chat:write` | `chat.postMessage` (`@chat-adapter/slack/dist/index.js:4188`), `chat.update` (`:4524`) — the agent's replies and their live edits — and `chat.postEphemeral` (`:4255`), which is what posts the "Connect your account" and "Pick a default factory" cards |
| `chat:write.public` | posting into a channel the bot has not been invited to, on the same call |
| `im:write` | `conversations.open` (`:5266`) — opening the DM the agent answers in |
| `channels:history` | `conversations.history` (`:3769`) and `conversations.replies` (`:3210`) in public channels; also what Slack gates `message.channels` on |
| `channels:read` | `conversations.info` (`:2011`) for a public channel |
| `groups:history` | the same two history calls in private channels; gates `message.groups` |
| `groups:read` | `conversations.info` for a private channel |
| `im:history` | the same two history calls in a DM; gates `message.im` |
| `im:read` | `conversations.info` for a DM |
| `mpim:history` | the same two history calls in a group DM; gates `message.mpim` |
| `mpim:read` | `conversations.info` for a group DM |
| `app_mentions:read` | gates the `app_mention` event — the first summons |
| `users:read` | `users.info` (`:1962`) — resolving who sent a message |
| `reactions:write` | `reactions.add` (`:4745`) and `reactions.remove` (`:4767`) — the acknowledgement emoji |
| `files:read` | downloading a private file a person attached (`url_private`, `:3957`) |
| `files:write` | `files.uploadV2` (`:4479`) — an agent reply that carries an attachment |
| `assistant:write` | `assistant.threads.setStatus` (`:4824`), reached by the typing-status function Factory always installs (`@mastra/factory/dist/integrations/slack/integration.js:5-12,61`) |

**The assistant surface is present for that one call and nothing else.**
`features.assistant_view` in the manifest and `assistant:write` above exist so Slack will accept
`assistant.threads.setStatus`; the events that surface would deliver — `assistant_thread_started` and
`assistant_thread_context_changed` — are **deliberately not subscribed**. Bot events stay at the five
the App settings table records, which is the set the URL registry and docs §4.1 carry. Adding the
assistant events would change that registered set and buy nothing: the agent is summoned by
`app_mention` and the four `message.*` events.

**Two of these depart from the vendor's own default list**, the one
`@mastra/slack/dist/index.js:246-273` carries, and both departures are deliberate:

- **`files:write` is added.** The vendor list omits it even though the adapter calls
  `files.uploadV2`. Without it, an agent reply carrying an attachment fails with `missing_scope`
  while every other reply succeeds — the failure is per-message, not per-app, which is why it is easy
  to miss until it happens.
- **User scopes are added: `openid` and `profile`.** The vendor builder emits no user scopes at
  all, because it targets a product whose linking flow is not OIDC. This deployment's is: the start
  route requests exactly `openid profile`
  (`@mastra/factory/dist/integrations/slack/connect-route.js:65`). Slack forbids mixing `openid` with
  any other user scope, so this list stays at two — no `email`, nothing else.

  **These two are not optional, and losing them does not merely halve account linking — it removes
  it.** The account link is written in exactly one place, the OIDC callback handler
  (`connect-route.js:102`, `saveAccountLink`), and there is no second writer anywhere in the package.
  The Slack-side "Connect your account" card is not an alternative to that flow: it deep-links to
  `/connect/slack`, which redirects to the web Connections page, where "Connect Slack" starts the
  same OIDC flow (`@mastra/factory/dist/integrations/slack/slack.js:80-93`). With no link written,
  every mention and every DM is blocked at the gate before the agent sees it (`slack.js:318-330`).
  So if Slack refuses the user scopes at creation, get them granted — re-paste the manifest on the
  console's **App Manifest** page, or turn on OpenID Connect in the app's own setting — rather than
  proceeding without them.

There are no user scopes beyond those two, no `commands` scope, and no shortcut declaration: the
package registers no slash-command names, and its interactive payload switch has branches only for
`block_actions`, `block_suggestion`, `view_submission` and `view_closed`
(`@chat-adapter/slack/dist/index.js:2313-2328`).

Widening the list later is a re-install, not a re-registration: change the scopes, install the app
again, and copy the new `xoxb-` token, because a scope change issues one.

## Creating the app

The app is created from a manifest rather than by filling in every console page by hand, which is
what keeps the settings above reproducible. The manifest is `apps/slack/manifest.yaml` in this
repository — it is this repo's file, not one the packages ship, and it is the only record of the
scope list and the settings as one diffable unit. Nothing here reproduces its body; read it at that
path.

Two preconditions, both checked before the app exists rather than after:

- **The public origin is serving.** Every URL in the Console URLs table is on
  `https://factory.kovalchuk.win`, and Slack will not save an Events Request URL it cannot reach.
  Ingress checkpoint 4 in `ops/README.md` is the proof.
- **Registration is closed and your account exists.** The same precondition `ops/README.md` opens its
  ingress section with: `README.md` step 3's probe answers `400` carrying
  `EMAIL_PASSWORD_SIGN_UP_DISABLED`.

**Read this before step 1: the Request URL in the manifest cannot answer Slack at creation time.**
`SLACK_APP_SIGNING_SECRET` comes *from* the app, so it does not exist until the app does — and until
that value is in `.env` and the server has been restarted, no Slack integration is constructed and
the webhook path `404`s (`src/mastra/config/integrations.ts:93-95`). Slack tries to verify
`settings.event_subscriptions.request_url` while creating the app, and it may refuse to create the
app on that ground. That is a chicken-and-egg in the console, not a fault in the manifest, and the
recovery is two minutes long:

> Delete the single line `settings.event_subscriptions.request_url` from the pasted YAML — **keep
> `bot_events`** — and create the app. Then finish steps 6 to 8 and the `.env` write and restart
> below. With the server running, put the URL back: either re-paste the full, unedited
> `apps/slack/manifest.yaml` on the console's **App Manifest** page, or type the URL into Event
> Subscriptions → Request URL and save it there. Checkpoint 3 is where it verifies.

Do this pre-emptively if you prefer — creating the app without the Request URL and restoring it after
the restart always works, whereas leaving it in only sometimes does.

Then, in order:

1. Go to `api.slack.com/apps` → **Create New App** → **From a manifest**.
2. Pick the workspace this deployment serves.
3. Choose the **YAML** tab, and paste the entire contents of `apps/slack/manifest.yaml`. The default
   tab is JSON and it will reject YAML with a parse error — switch the tab first.
4. Review the summary screen. It should list the five bot events, the redirect URL, and interactivity
   enabled. Then **Create**.
5. **If Slack rejects a key**, it names the offending one in the validation error. Delete that single
   key from the pasted text and create the app — do not abandon the manifest and start filling pages
   in by hand. Three keys are plausible refusals, and they do not cost the same:
   - `settings.event_subscriptions.request_url` — the chicken-and-egg above. Drop it, restore it
     after the restart. No capability is lost.
   - `features.assistant_view` — a logged warning on each typing-status update, and nothing else.
     The reply still arrives.
   - the user half of the scope list (`openid`, `profile`) — **this one you cannot proceed without.**
     Dropping it does not halve account linking, it removes it: the OIDC callback is the only writer
     of an account link, and an unlinked sender is blocked before the agent sees the message. Get the
     scopes granted — re-paste the manifest on the **App Manifest** page, or turn on OpenID Connect
     in the app's own setting — before going further. See "Bot token scopes" for the evidence.

   Record what you dropped, and restore each one as soon as the condition that blocked it is gone.
6. **Install to the workspace.** Settings → *Install App* → *Install to Workspace*, and approve the
   scope list. The app reaches nothing until this is done.
7. Collect four values, all from the app's own pages:
   - **Bot User OAuth Token** (`xoxb-…`) — OAuth & Permissions, available only after step 6.
   - **Signing Secret** — Basic Information → App Credentials.
   - **Client ID** and **Client Secret** — the same panel; the secret is behind a *Show* control and
     can be displayed again later.
8. **Invite the bot to a channel** you intend to use: `/invite @Mastra Factory` in that channel.
   `chat:write.public` lets it post without an invite, but it receives no `message.channels` event
   for a channel it is not in, so an un-invited channel is silent in the direction that matters.

Then write the five values into `.env` at the repository root:

```dotenv
SLACK_APP_SIGNING_SECRET=<Basic Information → App Credentials → Signing Secret>
SLACK_APP_BOT_TOKEN=xoxb-...
SLACK_APP_CLIENT_ID=<Basic Information → App Credentials → Client ID>
SLACK_APP_CLIENT_SECRET=<Basic Information → App Credentials → Client Secret>
MASTRACODE_CHANNELS_PUBLIC_URL=https://factory.kovalchuk.win
```

`.env` is gitignored, is not in this repository, and is read once at startup — so make the edit, then
restart. Behind the tunnel that is `npm run build && npm run start`, as `ops/README.md` describes.
What each value must contain, and what breaks when it is wrong, is in its own section below.

**Editing the app afterwards does not mean editing this file by hand.** The console keeps a
*App Manifest* page that accepts the same YAML, so a settings change is an edit to
`apps/slack/manifest.yaml` followed by a paste — which is what keeps the repository's copy and the
live app the same thing. A change to the scope list additionally needs a re-install (step 6) and a
fresh bot token.

## `SLACK_APP_SIGNING_SECRET`

**What the value must contain.** The signing secret of the Slack app, used to verify that an inbound
request really came from Slack.

**How to obtain it.** Basic Information → App Credentials → Signing Secret, on the app's own page.

**This key is the master switch for Slack.** Unset, no Slack integration is constructed at all:
nothing listens on the webhook path above, and the Connections page reports Slack as not set up. That
is the supported way to run this deployment without Slack — there is no separate disable flag. It
also means a missing signing secret does not look like an authentication failure; it looks like Slack
was never configured.

It is additionally the last-resort signer for OAuth and install state, which is what gives a
Slack-only deployment — one with no GitHub App and so no `GITHUB_APP_WEBHOOK_SECRET` — a signer that
survives a restart.

## `SLACK_APP_BOT_TOKEN`

**What the value must contain.** The bot user's OAuth token, which begins `xoxb-`. Not the user token
(`xoxp-`) and not the app-level token (`xapp-`); those are different credentials on the same page and
none of them is interchangeable.

**How to obtain it.** OAuth & Permissions → Bot User OAuth Token, available once the app has been
installed into a workspace. Re-installing after a scope change issues a new token — copy it again at
that point.

Without this token Slack can reach Factory but Factory cannot answer: mentions arrive, are processed,
and produce no message back. That one-way silence is the symptom of a missing or stale bot token.

## `SLACK_APP_CLIENT_ID`

**What the value must contain.** The app's OAuth client ID.

**How to obtain it.** Basic Information → App Credentials → Client ID.

## `SLACK_APP_CLIENT_SECRET`

**What the value must contain.** The client secret belonging to the same app.

**How to obtain it.** Basic Information → App Credentials → Client Secret; the console hides it
behind a *Show* control and can display it again later, so it does not need escrowing the way a
one-shot secret does.

Together with the client ID it enables the "Sign in with Slack" account-linking flow — and that flow
is the *only* way an account link is ever written (`connect-route.js:102`). Without the pair no link
can be created at all: the Slack-side "Connect your account" card is not a second route, it just
deep-links back into this same flow (`slack.js:80-93`), so it fails the same way. And with no link,
every mention and DM is blocked before the agent sees it (`slack.js:318-330`) — which makes this pair
a requirement for the bot to answer anyone, not an optional convenience.

## `MASTRACODE_CHANNELS_PUBLIC_URL`

**What the value must contain.** The public HTTPS origin Slack must reach to get to this deployment —
`https://factory.kovalchuk.win` — with no path and no trailing segment. The OAuth redirect URL in the
table above is built by appending `/connect/slack/oidc/callback` to it, so an origin that disagrees
with what is registered in the console produces a redirect Slack refuses.

**How to obtain it.** It is the public hostname the tunnel serves, not something a provider issues.
It is carried as its own key, separate from the origin the rest of the app uses, precisely so that
sign-in can run against loopback while Slack still reaches this machine over the tunnel. Point it at
loopback and OAuth callbacks send the browser to an address only the server itself can resolve.

Left unset, it falls back to `MASTRACODE_PUBLIC_URL` — so on a deployment whose sign-in origin is
loopback, leaving this key blank silently makes loopback the Slack origin too, which is exactly the
failure the paragraph above describes. Set it explicitly.

## Checkpoints

Run these in order. Checkpoint 1 is the console; 2 to 5 need `.env` filled from "Creating the app"
and the server running behind the tunnel (`npm run build && npm run start`) — leave it running in
one shell and use a second for the `curl` lines. Commands are written from the repository root.

### 1 — the manifest creates the app

Paste `apps/slack/manifest.yaml` into **Create New App → From a manifest → YAML** and create.

Expected: the app exists, and its own pages agree with this file — Event Subscriptions lists the five
bot events of the App settings table, Interactivity & Shortcuts is **On** with the same Request URL,
App Home shows the Messages tab enabled, the assistant view is present, and OAuth & Permissions lists
seventeen bot scopes, the two user scopes and the one redirect URL. The Events Request URL is the one
field that may legitimately be blank at this point — see the chicken-and-egg warning in "Creating the
app" — and checkpoint 3 is where it is filled in and verified.

If Slack refuses the paste, it names the offending key in the validation error. Drop that one key and
create the app — never abandon the manifest for hand-entry, because the settings above stop being
reproducible the moment they live only in a console. Step 5 of "Creating the app" lists the three
plausible refusals and what each costs; two are survivable and one, the user scopes, is not — do not
carry on past it.

### 2 — the webhook route exists at all

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  https://factory.kovalchuk.win/api/agent-controllers/mastra-code/channels/slack/webhook \
  -H 'content-type: application/json' --data-raw '{"type":"url_verification","challenge":"probe"}'
```

Expected: **`401`**, with body `Invalid signature`. That is the pass. The request carried no Slack
signature headers, so verification rejected it (`@chat-adapter/slack/dist/index.js:2079-2085`) — and
reaching a rejection proves the route is registered, which means `SLACK_APP_SIGNING_SECRET` was set
when the server booted and the Slack integration was constructed.

- **`404`** — no route. `SLACK_APP_SIGNING_SECRET` is unset or blank, so no integration was built
  (`src/mastra/config/integrations.ts:93-95`) and nothing listens on that path. It is not a URL typo
  on this side, because the URL came out of the Console URLs table; check `.env` and restart. A `404`
  is also what a mistyped path gives, so compare the line above with the table character for character
  before concluding anything, especially the `mastra-code` segment.
- **A connection error or a Cloudflare `502`/`530`** — nothing to do with Slack. The tunnel is down
  or the server is not listening; go to `ops/README.md` ingress checkpoints 3 and 4 and come back.

Run this **before** attempting checkpoint 3. A `404` here is a `Your URL didn't respond` there, and
the console gives no hint which of the two causes it is.

### 3 — Slack saves the Events Request URL

Event Subscriptions → Enable Events, paste the Request URL from the Console URLs table, and wait for
the verification.

Expected: a green **Verified**. Slack POSTs `{"type":"url_verification","challenge":…}`, the adapter
verifies the signature and echoes the challenge back
(`@chat-adapter/slack/dist/index.js:2127`), and the field saves. **A freshly created app cannot
already show Verified**, whatever the manifest carried: verification needs a signature this server
can produce, and at creation time `SLACK_APP_SIGNING_SECRET` did not exist yet. This checkpoint is
therefore the first moment the URL is ever verified, and it requires `.env` populated and the server
restarted — which is why it sits after that step and not inside "Creating the app".

The failure to recognise is **`Your request URL didn't respond with the correct challenge value`**
where checkpoint 2 passed: the signature check runs *before* the challenge is echoed, so a signing
secret in `.env` that differs from the one on Basic Information produces exactly this, and it reads
as a URL problem rather than a credential one. Re-copy the Signing Secret and restart.

**Interactivity has no such check.** Interactivity & Shortcuts accepts whatever is typed and saves it
without probing, which makes it the more likely of the two fields to be silently wrong. Paste the
same URL there and confirm it against the table by eye — checkpoint 5 is the only thing that exercises
it.

### 4 — account linking starts

Signed in to `https://factory.kovalchuk.win`, open in the browser:

```
https://factory.kovalchuk.win/connect/slack/oidc/start
```

Expected: a redirect to `https://slack.com/openid/connect/authorize?…` carrying `scope=openid+profile`,
a `client_id` matching `SLACK_APP_CLIENT_ID`, and a `redirect_uri` of
`https://factory.kovalchuk.win/connect/slack/oidc/callback` — the row in the Console URLs table.
Approve it and the browser should return through that callback.

- **A redirect to `/?slack=error` immediately, before Slack is ever reached** — the OIDC half was
  never wired. The routes are built only when client id, client secret *and* a redirect base are all
  truthy (`@mastra/factory/dist/integrations/slack/integration.js:69-82`, the ternary at `:75`), so:
  an empty or missing `SLACK_APP_CLIENT_ID` or `SLACK_APP_CLIENT_SECRET` disables them outright;
  `MASTRACODE_CHANNELS_PUBLIC_URL` disables them only when it is **present and empty** — which yields
  `""` — or when it and `MASTRACODE_PUBLIC_URL` are both unset. Merely *unset* is not enough, because
  `src/mastra/config/integrations.ts:102` uses `??` and falls back to `MASTRACODE_PUBLIC_URL`, which
  this deployment always sets; that fallback leaves the routes enabled and pointing at the wrong
  origin instead, which is the `bad_redirect_uri` below rather than this bullet. The signing secret
  being present is what makes the route exist at all, so this is a *different* failure from checkpoint
  2's `404`.
- **A redirect to `/auth/login?returnTo=…`** — the browser carries no session. Sign in first; this is
  a GET you can land on directly, and doing so signed out is the usual cause.
- **Slack answering `bad_redirect_uri`** — the `redirect_uri` the start route built does not match
  the app's registered one. It is built by appending `/connect/slack/oidc/callback` to
  `MASTRACODE_CHANNELS_PUBLIC_URL`, so the mismatch is in that key, not in the console.
- **`invalid_scope`** — the user half of the scope list was dropped at creation, or a scope was added
  alongside `openid`, which Slack forbids. See "Bot token scopes".

### 5 — a message round-trips, attachment included

**Checkpoint 4 must have passed first.** Not as tidiness: every inbound mention and DM goes through
a gate that resolves the sender's account link before the agent is reached
(`@mastra/factory/dist/integrations/slack/slack.js:318-330`, entered from the message handlers at
`:404` and `:499`). With no link, nothing you do here can succeed.

**5a — a channel mention.** In the channel the bot was invited to, mention it and ask for something
that produces a file — for example, ask it to write a short script and attach it.

Expected: a reply is posted in the thread and the attachment arrives as a file. That exchange
exercises `app_mention` delivery on the verified URL, `chat.postMessage` on the bot token, and
`files.uploadV2` for the attachment. **Do not expect a typing status here** — see 5b.

**5b — a DM.** Open the app from the sidebar, go to its **Messages** tab, and send it a short
message.

Expected: a typing status (`is thinking…`, `is typing...`) followed by a reply in the DM. This is the
path `messages_tab_enabled`, the `im:read`/`im:write`/`im:history` scopes and the `message.im` event
all exist to serve, and it is the only one of the two that shows the status line, because
`assistant.threads.setStatus` (`@chat-adapter/slack/dist/index.js:4824`) targets an assistant thread
rather than a public channel. If the Messages tab is missing entirely, `features.app_home` did not
survive creation.

Reading the failures:

- **An ephemeral "Connect your account" card, visible only to you, and no agent reply** — the
  sender has no account link, so the gate posted the card and stopped
  (`slack.js:60-79`). This is the most likely first-run outcome and it is **not** a token problem.
  Press **Connect account** on the card, or do checkpoint 4, and message again. The card's link is
  deliberately identity-free: it lands on Connections, where "Connect Slack" runs the same OIDC flow
  (`slack.js:80-93`).
- **An ephemeral "Pick a default factory" card** — the link exists, but the tenant has zero factories
  or several, so the run has nowhere to go (`slack.js:104-140`). With none, create one in the web app;
  with several, open **Settings → Connections** and pick which one Slack sessions route to. Then
  message again. A tenant with exactly one factory never sees this card — it is stamped onto the link
  automatically.
- **The mention arrives and nothing is posted back, with no ephemeral card either** — *this* is the
  one-way silence of a missing or stale `SLACK_APP_BOT_TOKEN`. Re-installing after any scope change
  issues a new token; copy it again. Check for the two cards above before concluding this, since a
  blocked sender also produces no agent reply.
- **A text reply arrives but the file does not**, with `missing_scope` in the server log — `files:write`
  is not granted. It is the one scope the vendor default list omits; if the app was created from this
  repository's manifest it is present, so this means the scope list was edited at creation. Add it,
  re-install, and copy the new bot token.
- **No typing status in 5b, and a warning in the log about `assistant.threads.setStatus`** — either
  `assistant:write` or `features.assistant_view` is missing. This is cosmetic: the reply still
  arrives, which is why it is listed last. Its absence in **5a** is not a defect at all and needs no
  action.
- **Nothing at all, and no log line** — the bot is not in that channel, or the mention went to a
  channel it was never invited to. Run `/invite` there and try again before suspecting the URL.

A tool-approval prompt in a reply is what exercises Interactivity: pressing its button posts a
`block_actions` payload to the same URL. If the reply's buttons do nothing at all, that field is
wrong — it is the one checkpoint 3 could not verify for you.
