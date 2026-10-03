/**
 * Every custom agent tool this deployment adds to the Code Agent.
 *
 * Factory has no tools slot of its own; a tool reaches the Code Agent through a
 * `FactoryIntegration` whose `agentTools()` the factory merges into the SDK's
 * `extraTools` on every request. `customTools` is that integration and nothing
 * else — no routes, no storage, no workers — and `config/integrations.ts`
 * appends it to the array the factory receives. Tools run in the server process
 * on this host, not in the session sandbox.
 *
 * Adding a tool: create `<name>/logic.ts` (plain TypeScript, no Mastra imports)
 * and `<name>/definition.ts` (the `createTool` call that wraps it), then add it
 * to `TOOLS` below. The key is the name the model sees, and it must not collide
 * with a built-in tool (`github_*`, `linear_*`, `factory_*`, …) — a collision
 * fails the boot.
 */
import type { FactoryIntegration } from '@mastra/factory';
import { getWeatherTool } from './weather/definition';

const TOOLS = {
  get_weather: getWeatherTool,
};

export const customTools: FactoryIntegration = {
  id: 'custom-tools',
  routes: () => [],
  diagnostics: () => ({ tools: Object.keys(TOOLS) }),
  agentTools: async () => TOOLS,
};
