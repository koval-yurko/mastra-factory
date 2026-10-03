/**
 * Weather logic: current conditions for a named city, from Open-Meteo
 * (https://open-meteo.com) — free and keyless, so nothing here reads the
 * environment. Plain TypeScript with no Mastra imports: the tool definition in
 * `./definition` is the only place that knows this is an agent tool.
 */

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 10_000;

/** WMO weather interpretation codes, as Open-Meteo documents them. */
const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

export interface CurrentWeather {
  location: string;
  observedAt: string;
  timezone: string;
  conditions: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;
  precipitationMm: number;
  windSpeedKmh: number;
}

/** Thrown when the geocoder knows no city by that name. */
export class CityNotFoundError extends Error {
  constructor(city: string, country?: string) {
    super(`No city named "${city}"${country ? ` in ${country}` : ''} was found.`);
    this.name = 'CityNotFoundError';
  }
}

interface GeocodingResponse {
  results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[];
}

interface ForecastResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  timezone: string;
}

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url.host} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function describeWeatherCode(code: number): string {
  return WEATHER_CODES[code] ?? `Unknown (WMO code ${code})`;
}

/**
 * Resolve `city` (optionally narrowed by an ISO 3166-1 alpha-2 `country`) to
 * its best geocoder match and return the current conditions there. Throws
 * `CityNotFoundError` for an unknown city and `Error` for a failed request.
 */
export async function getCurrentWeather(city: string, country?: string): Promise<CurrentWeather> {
  const countryCode = country?.toUpperCase();

  const geocodingUrl = new URL(GEOCODING_URL);
  geocodingUrl.searchParams.set('name', city);
  geocodingUrl.searchParams.set('count', '1');
  geocodingUrl.searchParams.set('language', 'en');
  if (countryCode) geocodingUrl.searchParams.set('countryCode', countryCode);
  const place = (await getJson<GeocodingResponse>(geocodingUrl)).results?.[0];
  if (!place) throw new CityNotFoundError(city, countryCode);

  const forecastUrl = new URL(FORECAST_URL);
  forecastUrl.searchParams.set('latitude', String(place.latitude));
  forecastUrl.searchParams.set('longitude', String(place.longitude));
  forecastUrl.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
  );
  forecastUrl.searchParams.set('timezone', 'auto');
  const { current, timezone } = await getJson<ForecastResponse>(forecastUrl);

  return {
    location: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    observedAt: current.time,
    timezone,
    conditions: describeWeatherCode(current.weather_code),
    temperatureC: current.temperature_2m,
    feelsLikeC: current.apparent_temperature,
    humidityPercent: current.relative_humidity_2m,
    precipitationMm: current.precipitation,
    windSpeedKmh: current.wind_speed_10m,
  };
}
