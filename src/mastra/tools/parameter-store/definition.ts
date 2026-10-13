/**
 * The `parameter_store` tool definition: what the model sees (id, description,
 * input schema) and how a call maps onto `./logic`. A failure is returned as an
 * `{ error }` result rather than thrown, so the agent can relay it.
 *
 * `createParameterStoreTool` takes the store and the `.env` check so the test
 * can pass fakes; `../index` builds the tool from `parameterStore` and
 * `isSetLocally` in `../../config/env`, and only when
 * `FACTORY_SSM_PARAMETER_PATH` is set.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ParameterStore } from '../../secrets/parameter-store';
import { ACTIONS, runParameterStoreAction, type IsSetLocally } from './logic';

export function createParameterStoreTool(store: ParameterStore, isSetLocally?: IsSetLocally) {
  return createTool({
    id: 'parameter_store',
    description:
      `Manage this Factory deployment's secrets and settings in AWS Systems Manager Parameter Store, under ${store.prefix}. ` +
      'Actions: "list" returns every key name (no values); "get" returns the value of one key; ' +
      '"put" creates or overwrites one key as an encrypted SecureString; "delete" removes one key. ' +
      'A key name is an environment variable name such as "SLACK_APP_BOT_TOKEN". ' +
      'The running server uses a change only after a restart, and a value set in the server\'s .env wins over Parameter Store. ' +
      'Use only when the user asks to view or change a deployment secret or setting.',
    inputSchema: z.object({
      action: z.enum(ACTIONS).describe('What to do: "list", "get", "put" or "delete".'),
      name: z
        .string()
        .trim()
        .optional()
        .describe('The environment key name, for example "SLACK_APP_BOT_TOKEN". Required for get, put and delete.'),
      value: z.string().optional().describe('The new value. Required for put; ignored otherwise.'),
    }),
    execute: async request => {
      try {
        return await runParameterStoreAction(store, request, isSetLocally);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
}
