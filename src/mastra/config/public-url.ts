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
 * Exported RAW, untrimmed, exactly as the environment gave it: both consumers
 * read it that way already, and collapsing the reads is a move, not a cleanup.
 *
 * See `README.md` in this directory for what the entry was forked from and how
 * these modules are reconciled with an upstream template update.
 */
export const publicUrl = process.env.MASTRACODE_PUBLIC_URL;
