# Mastra Factory

Mastra Factory is an open source environment for building software with coding agents. Connect your repository to turn issues into plans, implementations, and reviewed pull requests.

Created with [`npm create factory`](https://www.npmjs.com/package/create-factory). This project contains the Factory Server and its configuration. Keep it separate from the repository you want agents to change.

Read the [documentation](https://factory.mastra.ai/) or [watch the Mastra Factory overview](https://youtu.be/iMA-Xkhj7fU).

## Start the Factory Server

Using Mastra platform services is optional. The installer configures them for authentication, storage, and sandboxes by default, but you can replace each service independently or run the server without a platform connection. Pass `--no-platform` to `npm create factory` to skip platform provisioning.

Before connecting a model provider, check for `FACTORY_CREDENTIAL_ENCRYPTION_KEY` in `.env`. If it's missing, generate a key once for this project:

```bash
openssl rand -base64 32
```

Save the output as `FACTORY_CREDENTIAL_ENCRYPTION_KEY` in `.env`. Preserve the key across restarts and deployments, and keep a protected backup. See [credential encryption](https://factory.mastra.ai/reference/configuration#stored-credential-encryption) for details.

From the Factory project directory, start the server:

```bash
npm run dev
```

With the default setup, open the local URL printed by the server and sign in through Mastra platform. One server serves both the Factory UI and API. After login you'll see an onboarding wizard, select the repository agents should change. Use **Manage GitHub connection** to grant the GitHub App access if the repository is missing. Optionally add Linear. Connect a model provider using an API key or a supported subscription, then choose the Factory model.

If you skipped platform setup during installation, follow [Get started](https://factory.mastra.ai/) to configure alternative authentication, storage, and sandbox providers.

## Run your first issue

1. Open **Settings → Work Intake → GitHub issues**. Enable **Sync GitHub issues** and select your repository. Each teammate chooses their own issue sources.
1. Create a small GitHub issue, such as adding contribution guidance to the repository's README.
1. Find the issue in **Work → Intake**, select **Investigate**, and open its session to follow the agent's work.

Continue with the [issue-to-pull-request walkthrough](https://factory.mastra.ai/#create-your-first-pull-request) to review a plan and take the change through implementation and pull request review.

## Configure your Factory

Choose authentication, storage, and sandboxes independently. Model providers and issue sources are configured through the Factory UI. Server settings live in `.env`; restart the server after changing them.

| Configuration                                              | What you can change                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Models](https://factory.mastra.ai/configure/models)       | Provider access, personal or organization credentials, and the default model. |
| [GitHub](https://factory.mastra.ai/configure/github)       | Repository access and personal issue intake.                                  |
| [Linear](https://factory.mastra.ai/configure/linear)       | Workspace connection, project selection, and routing issues to a Factory.     |
| [Slack](https://factory.mastra.ai/configure/slack)         | App setup, account linking, and starting sessions from Slack.                 |
| [Auth](https://factory.mastra.ai/configure/auth)           | Mastra platform sign-in or another provider with Server and Studio support.   |
| [Storage](https://factory.mastra.ai/configure/storage)     | The database connection or Factory storage adapter.                           |
| [Sandboxes](https://factory.mastra.ai/configure/sandboxes) | Mastra platform, local execution, or another Mastra sandbox provider.         |

The generated server uses `DATABASE_URL` for PostgreSQL with pgvector. To use the included local PostgreSQL service, start from `.env` — copy `.env.example` to `.env` if you have not already — and set the three values `docker-compose.yml` reads from it:

- `POSTGRES_PASSWORD` — the database role's password. There is no default, and Compose reads `docker-compose.yml` for every command, so `npm run db:up`, `npm run db:down` and any other `docker compose` call stop with an error naming the variable until you set it. Generate a long random value with `openssl rand -hex 32` rather than choosing a memorable one; hex output stays safe in the connection URL below, in `.env`, and in Compose's own interpolation, which characters like `/`, `$` and `#` do not. Keep it only in `.env`.
- `POSTGRES_USER` — the role the database is created with. Defaults to `factory`. Keep it to letters, digits and underscores: Compose expands a `$` while reading `.env`, and a `"` breaks the health check command the value is interpolated into.
- `POSTGRES_DB` — the database name. Defaults to `mastracode_web`.

Then run `npm run db:up` and set `DATABASE_URL` in the same `.env` to match the three values in use, for example `postgres://factory:<password>@127.0.0.1:54329/mastracode_web`. The service publishes port `54329` on loopback only, so nothing else on the network can reach it.

The container applies all three values only when it initializes an empty data volume, so they fix the role, password, and database name at the first `npm run db:up` and are ignored on every later start. Changing one afterwards does not rename or re-password anything. To start over, run `docker compose down -v` — this deletes the database's contents — then `npm run db:up` again.

If `POSTGRES_PASSWORD` goes missing from `.env` after the first start, no `docker compose` command runs — `npm run db:down` included — while the container keeps restarting and holding port `54329`. Put any value back in `.env` to regain control of it (the running database keeps the password it was created with, so `DATABASE_URL` still needs the original), or stop it directly with `docker stop mastracode-web-db && docker rm mastracode-web-db`.

Mastra platform sandboxes use `MASTRA_PLATFORM_ACCESS_TOKEN` or `MASTRA_PLATFORM_SECRET_KEY`, together with `MASTRA_PROJECT_ID` and `MASTRA_ENVIRONMENT_ID`. To run commands on the Factory Server's machine, set this override in `.env`:

```dotenv
FACTORY_SANDBOX_PROVIDER=local
```

Install Git and your repository's build tools on that machine. Authentication and storage can continue to use Mastra platform. The separate `SANDBOX_PROVIDER` setting selects the backend used by Mastra platform sandboxes.

## Deploy

### Mastra platform

Deploy the Factory Server to your Mastra platform project:

```bash
npm run deploy
```

The CLI reports the deployed Factory URL. See [Deployment](https://factory.mastra.ai/deployment) for environment configuration and deployment options.

### Self-host

Run Factory as a persistent Node.js service on a virtual machine or in a container. Configure persistent storage and set `MASTRACODE_PUBLIC_URL` to the public HTTPS origin. Supply your provider credentials through the deployment environment, then build and start the server:

```bash
npm run build
npm run start
```

Keep the generated project's CLI dependencies installed for these commands. You can use Mastra platform services while hosting the Factory Server elsewhere. See [self-hosting](https://factory.mastra.ai/deployment#self-host) for runtime requirements and setup steps.

## Scripts

| Script                              | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `npm run dev`                       | Start the local Factory Server with its UI and API.  |
| `npm run check`                     | Typecheck the Factory Server.                        |
| `npm run build`                     | Build the server and Factory UI in `.mastra/output`. |
| `npm run start`                     | Run the production build.                            |
| `npm run deploy`                    | Build and deploy to Mastra platform.                 |
| `npm run db:up` / `npm run db:down` | Start or stop the optional local PostgreSQL service. |

## Troubleshooting

- **Runtime:** Use a Node.js version that matches `engines.node` in this project's `package.json`.
- **Port changes:** Set `PORT` and update `MASTRACODE_PUBLIC_URL` to match. Update callback URLs for any auth or integration apps you manage.
- **Missing issues:** Check repository access and your **Work Intake** selections. See [intake troubleshooting](https://factory.mastra.ai/troubleshooting#intake-is-empty).

See [Troubleshooting](https://factory.mastra.ai/troubleshooting) for sign-in, provider access, and sandbox errors, or [Environment variables](https://factory.mastra.ai/reference/configuration) for server settings.

## License

Apache-2.0
