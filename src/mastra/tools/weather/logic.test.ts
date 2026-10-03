/**
 * The weather logic. `fetch` is stubbed so the suite never dials Open-Meteo;
 * what is asserted is which two requests are made and how their answers are
 * shaped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityNotFoundError, getCurrentWeather } from './logic';

const KYIV = { name: 'Kyiv', admin1: 'Kyiv City', country: 'Ukraine', latitude: 50.45, longitude: 30.52 };
const CURRENT = {
  time: '2026-10-03T14:00',
  temperature_2m: 12.3,
  apparent_temperature: 10.1,
  relative_humidity_2m: 71,
  precipitation: 0,
  weather_code: 2,
  wind_speed_10m: 14.8,
};

function stubFetch(...bodies: unknown[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(bodies.shift())));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCurrentWeather', () => {
  it('geocodes the city, then reads current conditions at its coordinates', async () => {
    const fetchMock = stubFetch({ results: [KYIV] }, { current: CURRENT, timezone: 'Europe/Kyiv' });

    expect(await getCurrentWeather('Kyiv', 'ua')).toEqual({
      location: 'Kyiv, Kyiv City, Ukraine',
      observedAt: '2026-10-03T14:00',
      timezone: 'Europe/Kyiv',
      conditions: 'Partly cloudy',
      temperatureC: 12.3,
      feelsLikeC: 10.1,
      humidityPercent: 71,
      precipitationMm: 0,
      windSpeedKmh: 14.8,
    });

    const [geocoding, forecast] = fetchMock.mock.calls.map(call => new URL(String((call as unknown[])[0])));
    expect(geocoding!.host).toBe('geocoding-api.open-meteo.com');
    expect(geocoding!.searchParams.get('name')).toBe('Kyiv');
    expect(geocoding!.searchParams.get('countryCode')).toBe('UA');
    expect(forecast!.host).toBe('api.open-meteo.com');
    expect(forecast!.searchParams.get('latitude')).toBe('50.45');
    expect(forecast!.searchParams.get('longitude')).toBe('30.52');
  });

  it('throws CityNotFoundError for an unknown city instead of guessing one', async () => {
    const fetchMock = stubFetch({});

    await expect(getCurrentWeather('Nowhereville')).rejects.toThrow(
      new CityNotFoundError('Nowhereville'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('names an unmapped WMO code rather than dropping it', async () => {
    stubFetch({ results: [KYIV] }, { current: { ...CURRENT, weather_code: 42 }, timezone: 'Europe/Kyiv' });

    expect((await getCurrentWeather('Kyiv')).conditions).toBe('Unknown (WMO code 42)');
  });

  it('throws on an HTTP failure, naming the host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    await expect(getCurrentWeather('Kyiv')).rejects.toThrow('geocoding-api.open-meteo.com returned HTTP 503');
  });
});
