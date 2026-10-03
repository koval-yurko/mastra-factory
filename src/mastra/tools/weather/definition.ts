/**
 * The `get_weather` tool definition: what the model sees (id, description,
 * input schema) and how a call maps onto `./logic`. A failure is returned as an
 * `{ error }` result rather than thrown, so the agent can relay it.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getCurrentWeather } from './logic';

export const getWeatherTool = createTool({
  id: 'get_weather',
  description:
    'Get the current weather in a city: conditions, temperature (°C), feels-like temperature, humidity, ' +
    'precipitation (mm) and wind speed (km/h). Use when the user asks about the weather somewhere.',
  inputSchema: z.object({
    city: z.string().trim().min(1).describe('City name, e.g. "Kyiv" or "San Francisco".'),
    country: z
      .string()
      .trim()
      .length(2)
      .optional()
      .describe('Optional ISO 3166-1 alpha-2 country code to disambiguate, e.g. "UA" or "US".'),
  }),
  execute: async ({ city, country }) => {
    try {
      return await getCurrentWeather(city, country);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
});
