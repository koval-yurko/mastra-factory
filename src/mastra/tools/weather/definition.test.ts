/**
 * The `get_weather` definition and its registration. The logic is mocked: what
 * is asserted is the call mapping and that a failure becomes an `{ error }`
 * result rather than a thrown run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { customTools } from '../index';
import { getWeatherTool } from './definition';
import { CityNotFoundError, getCurrentWeather } from './logic';

vi.mock('./logic', async importOriginal => ({
  ...(await importOriginal<typeof import('./logic')>()),
  getCurrentWeather: vi.fn(),
}));

// `execute` is optional on the Tool type; this tool always defines it.
const run = (input: { city: string; country?: string }) => getWeatherTool.execute!(input, {} as never);

afterEach(() => {
  vi.mocked(getCurrentWeather).mockReset();
});

describe('get_weather', () => {
  it('passes city and country through and returns the logic result', async () => {
    const weather = { location: 'Kyiv, Kyiv City, Ukraine' } as Awaited<ReturnType<typeof getCurrentWeather>>;
    vi.mocked(getCurrentWeather).mockResolvedValue(weather);

    expect(await run({ city: 'Kyiv', country: 'UA' })).toBe(weather);
    expect(getCurrentWeather).toHaveBeenCalledWith('Kyiv', 'UA');
  });

  it('returns a thrown error as an { error } result', async () => {
    vi.mocked(getCurrentWeather).mockRejectedValue(new CityNotFoundError('Nowhereville'));

    expect(await run({ city: 'Nowhereville' })).toEqual({ error: 'No city named "Nowhereville" was found.' });
  });
});

describe('customTools', () => {
  it('offers get_weather to the agent and nothing over HTTP', async () => {
    expect(customTools.id).toBe('custom-tools');
    expect(customTools.routes({} as never)).toEqual([]);
    expect(await customTools.agentTools!({ requestContext: {} as never })).toEqual({ get_weather: getWeatherTool });
  });
});
