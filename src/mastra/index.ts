/**
 * Platform-deployable Mastra entry for MastraCode.
 *
 * This file is four things and nothing else (FR34/AD-8): its imports, the
 * `prepare()` call, the literal `new Mastra(...)` export, and `finalize()`. It
 * reads no environment key and constructs nothing but that `Mastra`. The
 * assembly — explicit `MastraFactory` config built out of today's env vars —
 * lives in `./config/factory`, and every concern it puts together is
 * constructed in its own module beside it, each env key read at one site.
 * `src/mastra/config/README.md` records what this entry was forked from and how
 * to reconcile it with an upstream template update.
 * Everything else (feature readiness, route/middleware assembly, controller
 * construction) lives in `MastraFactory` (`@mastra/factory`).
 *
 * `mastra build` requires the entry to export a `Mastra` instance named
 * `mastra` constructed by a literal `new Mastra(...)` in THIS file (validated
 * by the deployer's `checkConfigExport` Babel plugin) — which is why the
 * factory returns constructor args from `prepare()` instead of the instance.
 * The Mastra CLI consumes this entry everywhere: `mastra dev`, `mastra build`,
 * and `mastra deploy` all bundle this module and let the deployer generate
 * the server.
 */

import { Mastra } from '@mastra/core/mastra';
import { factory } from './config/factory';

const preparedArgs = await factory.prepare();

// Construct the server-owned Mastra HERE so the `new Mastra(...)` literal lives
// in the entry file (see module docs). `prepare()` returns the constructor args
// carrying the controller (via `agentControllers`), storage, and the assembled
// `server` config (middleware + apiRoutes + cors). Keep the worker-relevant
// properties explicit so deploy builds can statically detect the worker topology.
export const mastra = new Mastra({
  ...preparedArgs,
  storage: preparedArgs.storage,
  pubsub: preparedArgs.pubsub,
  workers: preparedArgs.workers,
});

// Post-construct boot: initialize the controller (which now inherits this
// instance's storage) and start its workers. Runs at module load via top-level
// await, so the deployer imports a fully-booted instance.
await factory.finalize();
