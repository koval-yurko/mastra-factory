# GitHub App

The operator-plane subject for the GitHub App this deployment registers and owns — the app that
clones repositories, opens and reviews pull requests, and delivers repository events back to Factory.
This file is normative for the URLs that app's console asks for, the permissions and webhook events
it is registered with, and what each key under "Keys this subject owns" below must contain and how
to obtain it.

`.env.schema` is the list of keys. `docs/self-hosting-research.md` §4.1 keeps the same URLs as a
narrative index across every provider; if the two ever disagree, this file wins. Neither is restated
here.

Everything below that describes what the installed software does was read out of
`node_modules/@mastra/factory` at version `0.15.0` and is cited by `file:line` against that package,
with paths relative to `node_modules/@mastra/factory/dist/integrations/github/`. Re-read the citation
before trusting a claim after a dependency bump.

## Keys this subject owns

The table below is the closed list of the keys this file owns, and this file is the only record
for what each must contain and how to obtain it. The
other two `apps/` subjects, `sandbox/README.md`, `ops/README.md`, and `README.md` as the residual
owner, claim the rest; between the six tables every key `.env.schema` declares is claimed exactly
once. The `MASTRA_PLATFORM_GITHUB_*` keys are **not** here: they belong to the Mastra Platform
integration rather than to this deployment's own GitHub App, and `README.md` owns them.

| Key | What the value must contain | Full record |
|---|---|---|
| `GITHUB_APP_ID` | the numeric App ID GitHub assigns | the `GITHUB_APP_ID` section below |
| `GITHUB_APP_PRIVATE_KEY` | the whole PEM on one line, newlines escaped | the `GITHUB_APP_PRIVATE_KEY` section below |
| `GITHUB_APP_CLIENT_ID` | the app's OAuth client identifier | the `GITHUB_APP_CLIENT_ID` section below |
| `GITHUB_APP_CLIENT_SECRET` | a client secret belonging to that same app | the `GITHUB_APP_CLIENT_SECRET` section below |
| `GITHUB_APP_SLUG` | the final path segment of the app's public page | the `GITHUB_APP_SLUG` section below |
| `GITHUB_APP_WEBHOOK_SECRET` | the one random string the console field and `.env` both carry | the `GITHUB_APP_WEBHOOK_SECRET` section below |
| `MASTRACODE_GITHUB_RECONCILE_ENABLED` | left unset, so the sweep runs | the "Reconcile sweep" section below |
| `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` | left unset, so the cycle is an hour | the "Reconcile sweep" section below |
| `MASTRACODE_GITHUB_AUTHORIZED_BOTS` | extra reviewer bot logins to trust, if any | the `MASTRACODE_GITHUB_AUTHORIZED_BOTS` section below |

`.env.schema` declares and validates every key in that table and is the only list of key names;
this file never
restates what it declares. Behaviour that is non-obvious rather than operator-facing lives in
`docs/self-hosting-research.md` §11 ("Environment variables — traps only"), which is referenced here
by path and never copied.

## Console URLs

Register these at Settings → Developer settings → GitHub Apps → your app. All of them are written
against this deployment's public origin, `https://factory.kovalchuk.win`.

| Field | Value |
|---|---|
| Callback URL **and** Setup URL | `https://factory.kovalchuk.win/auth/github/callback` |
| Webhook URL | `https://factory.kovalchuk.win/web/github/webhook` |

The first row is **one value in two fields**: the same callback URL goes in the Callback URL box
*and* in the Setup URL box, both on the app's General page. Factory derives that path from the public
origin held in `MASTRACODE_PUBLIC_URL` and offers no separate redirect setting, so there is nothing to
make the two agree — the URL registered in the console has to be this one, character for character.

Webhooks must be active for the Webhook URL to matter. A deployment that cannot receive them still
works, but merge state then arrives only through the reconcile sweep described at the bottom of this
file — and `GITHUB_APP_WEBHOOK_SECRET` is still required either way, for the reason given in its own
section below.

## Permissions

Grant exactly these seven:

| Permission | Why | Grant |
|---|---|---|
| Contents | clone, commit, push | Read and write |
| Pull requests | create, update, merge and list PRs; create, submit and dismiss reviews; review comments and replies; request and remove reviewers | Read and write |
| Issues | read and update issues; create, update and delete comments; add and remove labels | Read and write |
| Metadata | repository lookup (`integration.js:428`) — mandatory for every GitHub App | Read |
| Commit statuses | **required** — it is what unlocks the `status` event subscription; no API call uses it | Read |
| Administration | collaborator permission level (`integration.js:393`); no write call exists | Read |
| Checks | **granted but unexercised** — headroom for CI signal | Read |

Contents, Pull requests, Issues, Metadata and Administration are each here because a call in the
package needs them. Commit statuses and Checks are not: nothing in the shipped JavaScript reads a
check run or writes a commit status.

```bash
grep -rn --include='*.js' "checks\.\|createCommitStatus\|ListCommitStatuses\|/actions/" \
  node_modules/@mastra/factory/dist/integrations/github/
```

That matches nothing. (Without `--include` it finds two hits, both the string `checks.` ending a
sentence in one doc comment — `webhook.d.ts:8` and its source map, neither of them a call.) The
`status` webhook is not in the handler's allowlist either (`webhook.js:6-13`), so nothing arrives on
that side to be handled.

The two are still not interchangeable, and this is the one place in this table where "start narrow"
would cost you the registration. **GitHub gates an App's event subscriptions on its permissions,**
and the `status` event that "Register the app" step 7 has you subscribe to is offered only while
Commit statuses is granted — so dropping that row leaves step 7 impossible to complete, not merely
less capable. Grant it. Checks is the genuinely optional one: no check event is subscribed, so it is
pure headroom for exactly the CI-signal reading this deployment expects to want next.

Checks stays in the grant anyway. Widening a GitHub App's permissions after the fact forces every
installation to re-approve, and this console is visited once; a grant that is never used costs
nothing at all, and the price of leaving it out is a consent round-trip to put it back.

Skip **Actions** and **Artifact metadata** unless agents need to read CI runs or touch
`.github/workflows/`, and skip **Dependabot alerts** and **Security events** — nothing consumes
advisory intake.

Start narrow beyond this set. A later `403` is the signal to widen, and GitHub names the missing
permission in the error, so the only cost of guessing low is that same consent round-trip: it is not
a re-registration.

## Webhook events

Subscribe to all ten below. They do not all do the same thing, and the difference is worth knowing
before the first delivery lands, because a passing delivery and an ignored one look identical from
the outside.

**Six reach the handler.** `pull_request`, `pull_request_review`, `pull_request_review_comment`,
`issues`, `issue_comment` and `push` are the entire contents of the handler's allowlist
(`webhook.js:6-13`). A delivery of one of these passes its signature check, is logged as a
`[GitHub Webhook]` line (`webhook.js:443`), and is then dispatched.

Of those six, four drive rules — `issues`, `issue_comment`, `pull_request` and
`pull_request_review`, the only events `eventName()` has a branch for (`rules.js:66-85`).
`pull_request_review_comment` drives the review-notification path instead (`webhook.js:189`) rather
than a rule. **`push` drives neither.** It is allowlisted, so it is accepted and logged, and then it
stops: there is no `push` branch in `rules.js:66-85`, and `classifyGithubWebhook` returns without a
notification unless the payload carries a pull request number (`webhook.js:169`), which a push
payload never does. Subscribing to it is harmless and costs one log line per push.

**Four are accepted and ignored.** Also enable `installation`, `status`, `label` and `repository`.
None of them is in the allowlist, so each delivery has its signature verified and then returns
`202 {"ok":true,"ignored":true}` with nothing logged (`webhook.js:432-439`). That is a pass, not a
fault — do not read an ignored delivery as a broken endpoint.

**`{"ignored":true}` does not mean "not allowlisted".** The same body comes back whenever dispatch
ends without delivering to anything (`webhook.js:461-466`) — an allowlisted event with no pull
request number, or one whose sender is not authorized (`webhook.js:364-372`). So the response body
alone cannot tell a subscription you chose to ignore from a delivery that was dropped on the way
through. **The server log is what separates them:** every allowlisted delivery prints a
`[GitHub Webhook]` line before dispatch (`webhook.js:443`), and a non-allowlisted one returns before
reaching it. `202 {"ignored":true}` with no log line is one of the four above; the same body *with* a
log line is an allowlisted event that got dropped, and checkpoint 4 is where that is read.

They are subscribed deliberately. The cost is one `202` per delivery and no work; the benefit is that
the subscription is already in place if a later version of `@mastra/factory` starts handling one of
them — `installation` most plausibly — and the alternative is another trip through this console.

## The five identity keys are one group

`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` and
`GITHUB_APP_SLUG` are all-or-nothing. Fill all five, or leave all five blank and run without GitHub.
A partial fill is not a third option, and it does not announce itself the same way in both directions.
Filling the group from the top — the App ID first, the rest "later" — stops the server before it
starts: env validation names the first key left empty and refuses to load. Filling only keys from the
end of the group passes validation instead, and GitHub then stays inert with nothing logged, because
an incomplete group is never wired up (`src/mastra/config/integrations.ts:48-49` builds the
integration only when all five are non-empty). Only all five blank is the supported way to run without
GitHub.

## Register the app

Two preconditions, both checked before the app exists rather than after:

- **The public origin is serving.** Every URL in the Console URLs table is on
  `https://factory.kovalchuk.win`, and GitHub cannot deliver to a host it cannot reach. Ingress
  checkpoint 4 in `ops/README.md` is the proof.
- **Registration is closed and your account exists.** The same precondition `ops/README.md` opens
  its ingress section with: `README.md` step 3's probe answers `400` carrying
  `EMAIL_PASSWORD_SIGN_UP_DISABLED`.

Then, in order:

1. Settings → Developer settings → GitHub Apps → **New GitHub App**.
2. **Name it.** GitHub derives the slug from this name — lower-cased, spaces turned into hyphens —
   and that slug is what `GITHUB_APP_SLUG` has to hold. Set Homepage URL to
   `https://factory.kovalchuk.win`.
3. **Callback URL and Setup URL.** Both get
   `https://factory.kovalchuk.win/auth/github/callback`, from the table above, character for
   character. The Setup URL is where GitHub returns the browser after an installation; the callback
   handles that arrival — which carries no `code` — by starting the OAuth identify leg itself
   (`routes.js:340-341`), which is why one URL is correct in both fields.
4. **Webhook.** Tick **Active** and set the Webhook URL from the table.
5. **Generate the webhook secret before you save.** Run `openssl rand -hex 32`, paste the output
   into the Secret field, and escrow it in your password manager in the same action. The console
   never shows it again — it is write-only from that point — and the string in `.env` has to be
   byte-identical to the one in that field.
6. **Permissions.** Set the seven rows of the Permissions table, and nothing else.
7. **Subscribe to events.** The ten named under Webhook events.
8. **Where can this GitHub App be installed?** — **Only on this account**, *provided the repositories
   you intend to work in are owned by this same account*. "This account" is the account the app is
   created under, and it does not reach repositories owned by a GitHub organization you merely belong
   to: choose **Any account** if the target repository lives in an organization, or create the app
   under that organization instead. Getting this wrong does not fail at registration — it fails later,
   with the organization simply absent from the install screen. The setting can be widened afterwards
   without re-registering.
9. **Create the app.**

The app now exists and is installed nowhere. Collect its five values from the General page, and note
that two of them are shown exactly once:

- **App ID** and **Client ID** — read off the page; both are permanent.
- **Client secrets → Generate a new client secret** — displayed once, at generation. Escrow it now.
- **Private keys → Generate a private key** — downloads a `.pem` GitHub keeps only the fingerprint
  of. There is no way to download the same key twice. Escrow it now.
- **Public link** — open it and take the last path segment; that is the slug.

Then write them into `.env` at the repository root, as six lines:

```dotenv
GITHUB_APP_ID=1234567
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_CLIENT_ID=Iv23liXXXXXXXXXXXXXX
GITHUB_APP_CLIENT_SECRET=<the client secret, shown once>
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_WEBHOOK_SECRET=<the string you pasted into the Secret field>
```

The private-key line is the only one you cannot copy straight out of the console — see "How to
convert it" under `GITHUB_APP_PRIVATE_KEY` below for the one command that turns the downloaded
`.pem` into exactly that line.

`.env` is gitignored, is not in this repository, and is read once at startup — so make the edit, then
restart the server. Behind the tunnel that is `npm run build && npm run start`, as `ops/README.md`
describes; `npm run dev` is the wrong thing behind a public hostname. The five identity keys have to
land together, for the reason the group section above gives.

## Install it on a repository

A registered app with no installation reaches no repository at all. Enter the install flow through
the deployment rather than through the app's public page: open

```
https://factory.kovalchuk.win/auth/github/connect
```

while signed in. That route signs a state value carrying your organization and user
(`routes.js:315`) and redirects to GitHub's OAuth identify screen (`routes.js:317`). On return the
callback exchanges the code, lists your installations, and — finding none — redirects you straight to
`https://github.com/apps/<slug>/installations/new` with that same signed state attached
(`routes.js:343-345`, `integration.js:938-942`). Pick **Only select repositories** and choose the
repository you intend to work in.

Starting from the app's public Install button instead lands on the Setup URL with no `code`, and the
callback restarts the OAuth leg itself (`routes.js:340-341`), so it recovers — but
`/auth/github/connect` is the entry this deployment builds, and it is the one to use.

Two ways this route refuses before GitHub is ever reached, both from the same guard
(`routes.js:80-87`):

- **`401 {"error":"unauthorized"}`** — the browser carries no session. Sign in at
  `https://factory.kovalchuk.win/signin` first; this is a GET you can land on directly, and doing so
  signed out is the usual cause.
- **`403 {"error":"organization_required"}`**, with the message "GitHub projects require a WorkOS
  organization. Personal accounts cannot connect repositories." — the session has a user but no
  organization. `README.md` step 4 is the checkpoint that confirms one exists; land there before
  coming back.

And one way it fails *quietly*, which is the one worth recognising: a redirect to
**`/?github=error`** — the app's home page with a query string and no visible message. It means
either the signed state did not match the session's org and user (`routes.js:330-339`) or the token
exchange or installation upsert threw (`routes.js:353-356`). Both write a `[GitHub]` warning to the
server log and nothing to the browser, so read the log rather than the page. A stale tab, a sign-in
as a different user mid-flow, or a `GITHUB_APP_WEBHOOK_SECRET` changed between issuing the state and
verifying it all land here — start the flow again from `/auth/github/connect` in a fresh tab.

To change the repository selection later, `https://factory.kovalchuk.win/auth/github/connect?manage=1`
skips the identify leg and goes straight to the install-management screen (`routes.js:316`). Adding a
repository is an install-settings edit, not a re-registration.

## `GITHUB_APP_ID`

**What the value must contain.** The numeric App ID GitHub assigns when the app is created — the
number shown as "App ID" on the app's General page, not the installation id and not the client id.

**How to obtain it.** Settings → Developer settings → GitHub Apps → your app → General. It is
visible from the moment the app exists and never changes.

## `GITHUB_APP_PRIVATE_KEY`

**What the value must contain.** The entire contents of the PEM file GitHub generates, `-----BEGIN`
and `-----END` lines included, with every literal newline written as an escaped `\n` so the whole key
sits on one line:

```
"-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----"
```

Dropping the header or footer line, or pasting the file's real newlines instead of escaping them,
leaves a value that is not a usable key.

**How to obtain it.** On the app's General page, under "Private keys", choose *Generate a private
key*. The browser downloads a `.pem` file and GitHub keeps only the fingerprint — there is no way to
download the same key twice. Escrow it in a password manager as you generate it (see the note under
`GITHUB_APP_WEBHOOK_SECRET`).

**How to convert it.** What GitHub hands you is the multi-line file; what `.env` needs is the single
escaped line above. This prints the finished line, ready to paste:

```bash
printf 'GITHUB_APP_PRIVATE_KEY="%s"\n' \
  "$(perl -0777 -pe 's/\n\z//; s/\n/\\n/g' ~/Downloads/<your-app>.*.private-key.pem)"
```

`perl -0777` slurps the whole file so the substitution sees every newline; the first expression drops
the file's trailing newline and the second turns the rest into literal `\n`. Paste the output into
`.env` as one line. Keep the `.pem` out of the repository, and delete it once the value is escrowed
and `.env` is written.

## `GITHUB_APP_CLIENT_ID`

**What the value must contain.** The app's OAuth client identifier, shown as "Client ID" on the
General page directly under the App ID. It is not the App ID and not the app slug.

**How to obtain it.** Read it off that page. Like the App ID it is fixed for the life of the app.

## `GITHUB_APP_CLIENT_SECRET`

**What the value must contain.** A client secret belonging to the same app.

**How to obtain it.** General page → "Client secrets" → *Generate a new client secret*. The full
value is displayed once, at generation; afterwards only its last characters are shown. If it is lost,
generate a second secret and delete the old one — both work until the old one is revoked, so the swap
does not need a maintenance window.

## `GITHUB_APP_SLUG`

**What the value must contain.** The app's URL slug — the final path segment of its public page,
`https://github.com/apps/<slug>`. GitHub derives it from the app name at creation, lower-cased with
spaces turned into hyphens, so it is usually, but not reliably, the name you typed. It is what the
install URL is built from (`integration.js:938-945`), so a wrong slug sends the operator to a
`404` on github.com rather than to an install screen.

**How to obtain it.** Open the app's public page from the General page ("Public link") and copy the
last segment of the address. Renaming the app changes this value, which is the one way it can drift
out of date.

## `GITHUB_APP_WEBHOOK_SECRET`

**What the value must contain.** A high-entropy random string that you choose, set once in the app's
Webhook secret field and record here — the two have to be the same string or every delivery fails its
signature check. Any long unguessable value will do; `openssl rand -hex 32` produces a suitable one.

**How to obtain it.** Generate it yourself, paste it into Settings → your app → General →
Webhook → Secret, and keep the same string in the environment. Do both before saving the app, since
the console will not show the value back to you afterwards.

**It is required even with webhooks disabled.** This value is not only the webhook signature key: it
is the first source in this deployment's chain for the secret that signs GitHub OAuth and
installation state. `src/mastra/config/integrations.ts:86-87` resolves that secret as
`GITHUB_APP_WEBHOOK_SECRET` → `WORKOS_COOKIE_PASSWORD` → `SLACK_APP_SIGNING_SECRET`, and hands the
result to the factory as `stateSecret` (`src/mastra/config/factory.ts:85`). The GitHub integration
declares `requiresStableStateSigner = true` (`integration.js:228`), and the factory throws while
starting if a registered integration requires a stable signer and none is configured
(`factory.js:369`).

So the failure is a boot refusal, not a wobble: **a configured GitHub App with none of the three set
does not start at all**, and the error names the integration —
`integration 'github' signs OAuth state and requires a replica-stable state secret, but none is
configured`. This deployment keeps `WORKOS_COOKIE_PASSWORD` unset, so in practice the chain is this
key or `SLACK_APP_SIGNING_SECRET`.

Those fallbacks sign state, and that is all they do. The webhook endpoint reads
`GITHUB_APP_WEBHOOK_SECRET` and nothing else: with that key unset every delivery is rejected
`401 {"error":"unauthorized","message":"GitHub webhook secret is not configured"}` before a single
header is read (`webhook.js:28-35`), even on a server that booted cleanly on a Slack secret. Set this
key specifically.

**It must be stable and permanent.** Rotating it invalidates every sign-in and install flow that is
in mid-air, and because the same string verifies deliveries, the console field and `.env` have to
change in the same moment or every webhook `401`s in between. Choose it once and never rotate it as
routine maintenance.

Escrow this secret and `GITHUB_APP_PRIVATE_KEY` in a password manager. Neither is recoverable from
GitHub: the private key is shown only at generation, and the webhook secret is write-only in the
console. Losing both means re-registering the app, which means a new App ID, a new slug and every
installation approving again.

## Reconcile sweep

Leave `MASTRACODE_GITHUB_RECONCILE_ENABLED` on. It controls one worker that sweeps **both** pull
requests and issues — two reconcilers sharing a single timer and a single lease
(`integration.js:1006-1014`, `reconcile-worker.js:7`) — re-reading each one's state from GitHub and
writing it back onto the matching cards (`rules.js:697-727`). Left unset the sweep runs anyway: the
package treats anything that is not `false` as enabled, empty included
(`reconciliation-config.js:3-5,9-15`).

`MASTRACODE_GITHUB_RECONCILE_ENABLED` and `MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` are the
**fallback** pair. `integration.js:1006-1014` reads a per-sweep enable and interval key for pull
requests and for issues first, and consults these two only where the matching per-sweep key is
unset. That is the state this deployment is in — none of the per-sweep keys is set, so these two are
what is actually in force — but it is why everything below is stated as "unless a per-sweep override
is set". Those override keys are declared in no schema here and setting them is not part of this
deployment.

**The cycle is one hour.** The worker defaults to `intervalMs ?? 36e5` (`reconcile-worker.js:35`),
and the package's own `DEFAULT_GITHUB_RECONCILE_INTERVAL_MS = 60 * 6e4` (`reconcile-worker.js:5`) is
that same hour. The issue sweep takes the pull-request interval unless given its own
(`reconcile-worker.js:36`).

This sweep is the **only** writer of merge state when GitHub cannot reach this deployment's webhook
endpoint — behind a private network, during a tunnel outage, or before the Webhook URL above is
registered. At an hour, that is a slow backstop rather than a substitute: with webhooks landing,
merge state is current within seconds; with webhooks down, it can be an hour stale. Turning the sweep
off is only reasonable when webhook delivery is known to be healthy, and it buys nothing but a few
API calls.

`MASTRACODE_GITHUB_RECONCILE_INTERVAL_MS` is what shortens the cycle — the same interval in
milliseconds, for the case where an hour is the wrong number, and it applies to whichever sweeps have
no per-sweep interval override of their own. Left alone, an hour is what runs.

Do not confuse either key with `MASTRA_PLATFORM_GITHUB_RECONCILE_ENABLED`, a separate key that does
not control this sweep and stays unset in this deployment.

## `MASTRACODE_GITHUB_AUTHORIZED_BOTS`

**What the value must contain.** A comma-separated list of GitHub login names — reviewer bots this
deployment trusts to trigger review and comment notifications, **on top of** the two built-in
defaults rather than instead of them (`webhook.js:283-287`). Bare logins including the `[bot]`
suffix GitHub actually uses (`renovate[bot]`, say); not display names, not `@`-prefixed mentions,
and not numeric user ids. Case does not matter and neither does surrounding whitespace — each entry
is trimmed and lower-cased, and matched against a lower-cased sender
(`webhook.js:296-303`) — but the `[bot]` suffix is part of the login and dropping it does not match.

**How to obtain it.** Nothing issues it: it is a list you choose. Read a login off a review or
comment that bot has already left on one of your repositories — the author name on that event is the
string this key wants. Unset is the supported state and is what this deployment runs: the defaults
`coderabbitai[bot]` and `devin-ai-integration[bot]` (`webhook.js:287`) are then the whole trusted
set, and a review from anything else is ignored rather than refused, which is the symptom to
recognise. Adding a login widens what can start work on this deployment's behalf, so add one
deliberately and only for a bot you installed.

## Checkpoints

Run these in order from the repository root. Checkpoints 1 to 3 need no installation; 4 and 5 do.
Checkpoint 2 starts the server in the foreground and every checkpoint after it needs that server
still running — **leave it running and open a second shell** for checkpoints 3 to 5 rather than
stopping it to get a prompt back.

### 1 — the values reached `.env`

```bash
for k in GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_CLIENT_ID GITHUB_APP_CLIENT_SECRET \
         GITHUB_APP_SLUG GITHUB_APP_WEBHOOK_SECRET; do
  n=$(grep -cE "^[[:space:]]*$k=" .env)
  v=$(grep -E "^[[:space:]]*$k=" .env | tail -1 | cut -d= -f2- | tr -d ' \t"')
  printf '%-26s lines=%s %s\n' "$k" "$n" "$([ -n "$v" ] && echo set || echo EMPTY)"
done
```

Expected: six rows, every one reading `lines=1` and `set`. A plain `grep -c` is not enough here,
because two of the three ways this goes wrong still produce the right count:

- **`EMPTY`** — the key is present but its value is blank, whitespace, or `""`.
  `src/mastra/config/integrations.ts:42-49` trims before testing, so all three are the same as absent:
  with any of the five identity keys in that state the integration is never constructed and **nothing
  is logged about it**. This row is the only warning you get.
- **`lines=2`** or more — the key is written twice. `.env` keeps the last occurrence, which is why
  the check reads the last line; the danger is that a duplicate of one key plus a missing other key
  gives a total of five and looks correct.
- **`lines=0`** — missing outright. Read "The five identity keys are one group" above and fix it
  before starting the server, because which of the two failure modes you get depends on *which* keys
  are missing. A `0` for `GITHUB_APP_WEBHOOK_SECRET` is checkpoint 3's `401` waiting to happen.

If every row instead prints a `No such file or directory` warning, `.env` does not exist yet: copy
`.env.example` to `.env` at the repository root and start from "Register the app" above.

### 2 — the server boots with the App configured

```bash
npm run build && npm run start
```

Expected: the build completes and the server reaches its startup banner. This runs in the foreground
and stays there — leave it, and use a second shell from here on. Two boot failures belong to this
story specifically:

- `MastraFactory: integration 'github' signs OAuth state and requires a replica-stable state secret,
  but none is configured` — `GITHUB_APP_WEBHOOK_SECRET` is empty and neither fallback is set
  (`factory.js:369`, `integration.js:228`). This is a refusal to start, not a degraded mode.
- varlock refusing to load and naming a `GITHUB_APP_*` key — the identity group was filled from the
  top and the named key is the first one left empty.

### 3 — a `ping` reaches the endpoint

GitHub sends a `ping` when the app's webhook is saved. Read the result at Settings → Developer
settings → GitHub Apps → your app → **Advanced** → Recent Deliveries. If the ping was sent before
the server was running, press **Redeliver** rather than reading the old result.

Expected: **`202`** with body `{"ok":true,"ignored":true}`. That is the passing outcome, and it means
exactly what it says — the signature verified, and `ping` is not one of the six allowlisted events,
so the handler returned before doing any work (`webhook.js:432-439`). It is the strongest single
signal available before an installation exists: reachability and the shared secret, both confirmed in
one delivery.

Read a failure by which one it is; they route to different places:

- `401 {"error":"unauthorized","message":"GitHub webhook secret is not configured"}` — the running
  server has no `GITHUB_APP_WEBHOOK_SECRET`. Checkpoint 1's last row, then restart; the value is
  read at startup (`webhook.js:28-35`).
- `401 {"error":"unauthorized","message":"Invalid GitHub webhook signature"}` — the console's Secret
  field and `GITHUB_APP_WEBHOOK_SECRET` are different strings (`webhook.js:19-27,61`). Re-paste from
  the escrowed copy; the comparison is over the exact bytes.
- `401 {"error":"unauthorized","message":"Missing x-hub-signature-256 header"}` — the delivery
  carried no signature at all (`webhook.js:53-59`). From GitHub that means the app's Secret field is
  empty: the secret is what makes GitHub sign, so setting it only in `.env` produces exactly this.
- `400 {"error":"bad_request","message":"Missing x-github-event header"}` or the same shape naming
  `x-github-delivery` (`webhook.js:39-52`) — the request reached the handler and was rejected before
  any secret was consulted. A real GitHub delivery always carries both, so a `400` here means the
  request was **not** from GitHub: almost always a hand-built `curl` with a mistyped header name.
  Do not read it as a secret or a tunnel problem.
- **A `5xx` from this server** (as opposed to a Cloudflare `502`) — the signature passed, the event
  was allowlisted, and dispatch threw. Nothing above is wrong; the fault is downstream, in storage or
  the rule dispatcher. The server log holds the stack, and that is the only place it appears.
- **A connection error, a timeout, or a Cloudflare `502`/`530`** — nothing to do with the secret. The
  delivery never arrived: the tunnel is down or the server is not listening. Go to `ops/README.md`,
  ingress checkpoints 3 and 4, and come back.
- `404` — the Webhook URL is wrong. Compare it with the Console URLs table character for character;
  it carries no `/api` prefix and no controller-id segment.

The same check without the console, useful when iterating on the secret, with the server running and
`GITHUB_APP_WEBHOOK_SECRET` exported into the shell:

```bash
: "${GITHUB_APP_WEBHOOK_SECRET:?export it in this shell first}"
BODY='{"zen":"probe"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GITHUB_APP_WEBHOOK_SECRET" -r | cut -d' ' -f1)"
curl -sS -w '\n%{http_code}\n' -X POST https://factory.kovalchuk.win/web/github/webhook \
  -H 'content-type: application/json' -H 'x-github-event: ping' \
  -H 'x-github-delivery: local-probe' -H "x-hub-signature-256: $SIG" --data-raw "$BODY"
```

Expected: `{"ok":true,"ignored":true}` then `202` — the same result, read the same way.

**The first line is not decoration.** Unset, `$GITHUB_APP_WEBHOOK_SECRET` expands to nothing and
`openssl` signs with an *empty* key — a perfectly well-formed HMAC that the server then rejects,
giving you a `401 Invalid GitHub webhook signature` and the false conclusion that the console and
`.env` hold different strings. The guard turns that into an immediate `parameter not set` instead.
`.env` is not exported into your shell by anything, so this is the normal state of a fresh terminal.

**The secret is exposed while this runs.** It sits in the `openssl` argument list, where any process
on this machine can read it with `ps`, and the whole command lands in `~/.zsh_history`. Run it with a
leading space if `HIST_IGNORE_SPACE` is set (`setopt histignorespace`), and prefer the console's
**Redeliver** — which exposes nothing — whenever it is available.

### 4 — a real event is logged

Only after the installation exists. In an installed repository, open a pull request or push a commit
to an open one, and watch the server's log.

Expected: a `[GitHub Webhook]` line carrying the event and action (`webhook.js:443`), and a `202` for
that delivery in Recent Deliveries. Read the log line and the body together — neither alone is
conclusive:

- **`202 {"ok":true,"ignored":true}` with no log line** — the event was one of the four
  accepted-and-ignored. Check which event the delivery was before treating it as a fault.
- **A second log line reading `[GitHub Webhook] sender not authorized`**, with the same
  `{"ignored":true}` body — the delivery arrived, verified and classified correctly, and was then
  dropped because the account that triggered it is not on the authorized-sender list
  (`webhook.js:364-372,451`). This is the failure mode a correctly registered and correctly
  installed app still hits, and nothing about the registration is wrong when it happens. It is most
  likely when the action came from a bot or from the Factory App's own account rather than from you;
  trigger the event as yourself and watch whether the line disappears.
- **Nothing at all in Recent Deliveries** — the app is not installed on that repository. Re-run the
  install flow above.

### 5 — the loop closes

Follow "Run your first issue" in the root `README.md`: enable **Sync GitHub issues** for the
installed repository under Settings → Work Intake → GitHub issues, open a small issue, find it in
**Work → Intake**, and take it through to a merged pull request.

Expected: the issue appears as a work item, a session opens against it, a pull request is created in
the installed repository, and merging that pull request moves the card to its terminal state.

If the card's state lags after the merge, that is checkpoint 4's problem rather than this one — but
it will resolve on its own regardless, because the reconcile sweep re-reads merge state and writes it
back. Hourly, though, not immediately: see "Reconcile sweep" above before concluding that anything is
broken, and read the sweep as the backstop it is rather than as the mechanism.
