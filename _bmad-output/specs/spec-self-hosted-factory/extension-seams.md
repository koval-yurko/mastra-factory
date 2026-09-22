# Extension seams

Where first-party code may legitimately go. Four seams exist in `@mastra/factory@0.15.0`, and only four — verified by reading the shipped `.d.ts` contracts, not documentation. Re-verify after any major bump.

| Seam | Shape | When to use it | Where it lands |
| --- | --- | --- | --- |
| **Event rules** | `rules?: Partial<Record<EventName, FactoryRuleHandler \| null>>` on the GitHub and Linear integrations. `null` disables an event; an omitted key keeps the default. | Change what an event does — suppress auto-triage, re-route an issue to a different board. | `src/mastra/rules/<subject>.ts` (AD-10) |
| **Slack adapter options** | `adapterOptions?: SlackAdapterChannelConfig` — `streaming`, `toolDisplay: 'grouped'`, and similar presentation knobs. | Tune how Slack renders agent work. | The Slack construction site in `src/mastra/config/` (AD-8) |
| **Subclassing** | Extend an integration and override individual methods. | Per-tenant GitHub Apps, custom Octokit config (retry/throttle, GHES base URL). | `src/mastra/integrations/<subject>/` (AD-10) |
| **A new integration** | Implement the `FactoryIntegration` interface. | A source Mastra does not ship — Jira, GitLab, PagerDuty. No factory changes required. | `src/mastra/integrations/<subject>/` (AD-10) |

None of these is ever a reason to create a package (AD-1).

## The seam that will actually carry the customization

Six agent skills ship as editable markdown: `factory-triage`, `factory-plan`, `factory-review`, `factory-rereview`, `factory-complete-issue`, `configure-factory-rules`. This is prose, not TypeScript, and it is the most likely place real customization happens.

Overrides go at `src/mastra/public/factory-skills/<skill-name>/SKILL.md` — the one candidate path valid under both cwd variants the server runs with. Override is per-file: a local file wins, absent ones fall back to bundled. Only those six names resolve. This is **not** the `.agents/skills/` tree, which is hash-locked in `skills-lock.json` and must not be hand-edited (AD-9, AD-13).

## Why this reorders the layout question

The two places substantial work is likely — agent-skill markdown and event rules — are keyed by skill name and by event name, not by provider app. Neither wants a per-app project directory. Each integration's configuration has been deliberately collapsed to a single construction site, so a folder per app would hold one constructor call.

## When a seam outgrows a directory

A workspace becomes justified only when a new `FactoryIntegration` exceeds roughly 500 lines **and** must be shared across two deployments — both conditions, not either. Everything below that is satisfied by a directory.
