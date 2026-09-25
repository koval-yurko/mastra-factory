/**
 * The browser-facing public origin of this deployment.
 *
 * It is its own module for the reason `database-url.ts` and `positive-int.ts`
 * are: its two consumers sit in different concerns — `./integrations`, where the
 * Slack integration takes it as its UI origin and as the fallback base of its
 * OIDC redirect, and `./factory`, where it becomes the factory's `publicUrl:` —
 * so exporting it from `./integrations` would make the assembly depend on the
 * integrations concern for a value that is not theirs, and would leave the one
 * read site inside one of its two consumers. This module is the single
 * first-party read site for `MASTRACODE_PUBLIC_URL` (AD-7).
 *
 * Trimmed, and a blank value reads as unset: every consumer downstream reaches
 * for its own fallback with `??` — `@mastra/factory`'s `publicUrl ?? 'http://localhost:4111'`
 * and `./integrations`'s `MASTRACODE_CHANNELS_PUBLIC_URL ?? publicUrl` — so an
 * empty string would still count as a configured origin and a padded `.env` line
 * would become the deployment's public origin and the base of Slack's OIDC
 * redirect. `|| undefined` is what makes those fallbacks fire.
 *
 * See `README.md` in this directory for what the entry was forked from and how
 * these modules are reconciled with an upstream template update.
 */
export const publicUrl = process.env.MASTRACODE_PUBLIC_URL?.trim() || undefined;
