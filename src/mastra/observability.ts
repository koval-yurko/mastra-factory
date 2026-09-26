/**
 * Local AI tracing for the Factory Server — every agent run, model call and
 * tool call a Factory session makes, with its full input and output.
 *
 * This file is picked up by file-system routing, not imported: `mastra factory
 * dev` and `mastra build` both discover `src/mastra/observability.ts` and call
 * `mastra.__registerFsObservability()` on the entry's exported instance. That
 * keeps `src/mastra/index.ts` the four things FR34/AD-8 allow. Without it the
 * server runs on core's `NoOpObservability`: the code SDK builds its own
 * `Observability` for the agent controller, but a controller registered on a
 * parent Mastra uses the parent's, so that one is discarded.
 *
 * Spans go to the observability domain of the server's own storage and nowhere
 * else — there is deliberately no Platform exporter here. The code SDK only
 * attaches that domain (a DuckDB file, `observability.duckdb` in the Mastra Code
 * app data directory) when `observability.localTracing` is `true` in that
 * directory's `settings.json`; without it the exporter warns once that storage
 * is unavailable and persists nothing. Studio's Traces, Logs and Metrics pages
 * read the same domain through `/api/observability/*`.
 *
 * Reads no environment key.
 */
import { MastraStorageExporter, Observability, SensitiveDataFilter } from '@mastra/observability';

// Full payloads are the point: a Factory session's spans carry the prompts,
// the repository code the agent read and the tool output it acted on. The
// defaults (50 array items, 128 KiB strings, 50 keys, depth 8) cut a long
// thread's message history and large file reads short, so they are raised.
export const serializationOptions = {
  maxStringLength: 2_000_000,
  maxArrayLength: 5_000,
  maxObjectKeys: 1_000,
  maxDepth: 20,
};

// The controller's own request-context keys, so a trace can be filtered by the
// Factory thread, project and mode that produced it. Same names the code SDK
// uses for its controller-level instance.
export const requestContextKeys = [
  'controller.threadId',
  'controller.resourceId',
  'controller.controllerId',
  'controller.session.modeId',
  'controller.session.modelId',
  'controller.state.projectName',
  'controller.state.gitBranch',
  'controller.state.subagentModelId',
];

export default new Observability({
  configs: {
    default: {
      serviceName: 'mastra-factory',
      requestContextKeys,
      serializationOptions,
      // `event-sourced` is the strategy the code SDK pairs with the DuckDB domain.
      exporters: [new MastraStorageExporter({ strategy: 'event-sourced' })],
      // Redacts only values under credential-shaped keys (exact match on
      // `token`, `apikey`, `authorization`, …) — prompts and code pass through.
      spanOutputProcessors: [new SensitiveDataFilter()],
    },
  },
});
