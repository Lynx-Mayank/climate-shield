const GEOCODING_URL =
  import.meta.env.VITE_OPEN_METEO_GEOCODING_URL ??
  "https://geocoding-api.open-meteo.com/v1"
const FORECAST_URL =
  import.meta.env.VITE_OPEN_METEO_FORECAST_URL ??
  "https://api.open-meteo.com/v1"
const ARCHIVE_URL =
  import.meta.env.VITE_OPEN_METEO_ARCHIVE_URL ??
  "https://archive-api.open-meteo.com/v1"

const REQUEST_TIMEOUT_MS = 10000

export interface GeocodedLocation {
  id: number
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
  timezone: string
  label: string
}

export interface DailyWeatherPoint {
  date: string
  temperatureMax: number | null
  temperatureMin: number | null
  precipitation: number | null
  evapotranspiration: number | null
}

export interface WeatherSeries {
  kind: "historical" | "forecast"
  source: "Open-Meteo"
  model: string
  latitude: number
  longitude: number
  timezone: string
  units: {
    temperature: string
    precipitation: string
    evapotranspiration: string
  }
  period: { start: string; end: string }
  daily: DailyWeatherPoint[]
}

export interface CurrentWeather {
  kind: "current"
  source: "Open-Meteo"
  time: string
  temperature: number | null
  precipitation: number | null
  weatherCode: number | null
  windSpeed: number | null
  units: {
    temperature: string
    precipitation: string
    windSpeed: string
  }
}

export interface ClimateDataQuality {
  level: "Low" | "Medium" | "High"
  completeness: number
  freshness: "Current" | "Stale" | "Unknown"
  coverage: "Forecast and recent history" | "Forecast only" | "History only" | "No coverage"
  missing: string[]
  explanation: string
}

export interface ClimateBundle {
  location: { latitude: number; longitude: number }
  retrievedAt: string
  current: CurrentWeather | null
  forecast: WeatherSeries | null
  historical: WeatherSeries | null
  quality: ClimateDataQuality
  errors: string[]
}

interface OpenMeteoDailyResponse {
  latitude?: number
  longitude?: number
  timezone?: string
  current_units?: Record<string, string>
  current?: Record<string, string | number | null>
  daily_units?: Record<string, string>
  daily?: {
    time?: unknown
    temperature_2m_max?: unknown
    temperature_2m_min?: unknown
    precipitation_sum?: unknown
    et0_fao_evapotranspiration?: unknown
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeoutController = new AbortController()
  const timeout = window.setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  )
  const abort = () => timeoutController.abort()
  signal?.addEventListener("abort", abort, { once: true })

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: timeoutController.signal,
    })
    if (response.status === 429) {
      throw new Error("Open-Meteo rate limit reached. Try again shortly.")
    }
    if (!response.ok) {
      throw new Error(`Climate service returned HTTP ${response.status}.`)
    }
    return (await response.json()) as T
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new Error("Climate request timed out.")
    }
    throw error instanceof Error ? error : new Error("Climate request failed.")
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nullableNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null
}

function parseDaily(
  response: OpenMeteoDailyResponse,
  kind: WeatherSeries["kind"],
): WeatherSeries {
  const times = response.daily?.time
  if (
    !Array.isArray(times) ||
    !times.every((item) => typeof item === "string")
  ) {
    throw new Error(`Open-Meteo ${kind} response is missing daily dates.`)
  }

  const max = Array.isArray(response.daily?.temperature_2m_max)
    ? response.daily.temperature_2m_max
    : []
  const min = Array.isArray(response.daily?.temperature_2m_min)
    ? response.daily.temperature_2m_min
    : []
  const precipitation = Array.isArray(response.daily?.precipitation_sum)
    ? response.daily.precipitation_sum
    : []
  const et0 = Array.isArray(response.daily?.et0_fao_evapotranspiration)
    ? response.daily.et0_fao_evapotranspiration
    : []
  const daily = times.map((date, index) => ({
    date,
    temperatureMax: nullableNumber(max[index]),
    temperatureMin: nullableNumber(min[index]),
    precipitation: nullableNumber(precipitation[index]),
    evapotranspiration: nullableNumber(et0[index]),
  }))

  if (!daily.length) throw new Error(`Open-Meteo returned no ${kind} rows.`)

  return {
    kind,
    source: "Open-Meteo",
    model:
      kind === "forecast"
        ? "Open-Meteo forecast models"
        : "ERA5 / archive endpoint",
    latitude: isFiniteNumber(response.latitude) ? response.latitude : 0,
    longitude: isFiniteNumber(response.longitude) ? response.longitude : 0,
    timezone: response.timezone ?? "Unknown",
    units: {
      temperature: response.daily_units?.temperature_2m_max ?? "°C",
      precipitation: response.daily_units?.precipitation_sum ?? "mm",
      evapotranspiration:
        response.daily_units?.et0_fao_evapotranspiration ?? "mm",
    },
    period: { start: daily[0].date, end: daily[daily.length - 1].date },
    daily,
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function historicalWindow() {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 7)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 29)
  return { start: isoDate(start), end: isoDate(end) }
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodedLocation[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const url = new URL(`${GEOCODING_URL}/search`)
  url.search = new URLSearchParams({
    name: trimmed,
    count: "6",
    language: "en",
    format: "json",
  }).toString()
  const payload = await fetchJson<{ results?: unknown }>(url.toString(), signal)
  if (!Array.isArray(payload.results)) return []

  return payload.results.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return []
    const item = raw as Record<string, unknown>
    if (
      !isFiniteNumber(item.id) ||
      typeof item.name !== "string" ||
      !isFiniteNumber(item.latitude) ||
      !isFiniteNumber(item.longitude) ||
      typeof item.country !== "string" ||
      typeof item.timezone !== "string"
    ) {
      return []
    }
    const admin1 = typeof item.admin1 === "string" ? item.admin1 : undefined
    return [
      {
        id: item.id,
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        country: item.country,
        admin1,
        timezone: item.timezone,
        label: [item.name, admin1, item.country].filter(Boolean).join(", "),
      },
    ]
  })
}

export async function loadClimateData(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<ClimateBundle> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Enter valid latitude and longitude coordinates.")
  }

  const common = {
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration",
  }
  const forecastUrl = new URL(`${FORECAST_URL}/forecast`)
  forecastUrl.search = new URLSearchParams({
    ...common,
    current: "temperature_2m,precipitation,weather_code,wind_speed_10m",
    forecast_days: "7",
  }).toString()
  const window = historicalWindow()
  const archiveUrl = new URL(`${ARCHIVE_URL}/archive`)
  archiveUrl.search = new URLSearchParams({
    ...common,
    start_date: window.start,
    end_date: window.end,
  }).toString()

  const [forecastResult, historicalResult] = await Promise.allSettled([
    fetchJson<OpenMeteoDailyResponse>(forecastUrl.toString(), signal),
    fetchJson<OpenMeteoDailyResponse>(archiveUrl.toString(), signal),
  ])
  const errors: string[] = []
  let forecast: WeatherSeries | null = null
  let historical: WeatherSeries | null = null
  let current: CurrentWeather | null = null

  if (forecastResult.status === "fulfilled") {
    try {
      forecast = parseDaily(forecastResult.value, "forecast")
      const raw = forecastResult.value.current
      if (raw && typeof raw.time === "string") {
        current = {
          kind: "current",
          source: "Open-Meteo",
          time: raw.time,
          temperature: nullableNumber(raw.temperature_2m),
          precipitation: nullableNumber(raw.precipitation),
          weatherCode: nullableNumber(raw.weather_code),
          windSpeed: nullableNumber(raw.wind_speed_10m),
          units: {
            temperature:
              forecastResult.value.current_units?.temperature_2m ?? "°C",
            precipitation:
              forecastResult.value.current_units?.precipitation ?? "mm",
            windSpeed:
              forecastResult.value.current_units?.wind_speed_10m ?? "km/h",
          },
        }
      } else {
        errors.push("Current conditions were unavailable.")
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Forecast parsing failed.",
      )
    }
  } else {
    errors.push(
      forecastResult.reason instanceof Error
        ? forecastResult.reason.message
        : "Forecast retrieval failed.",
    )
  }

  if (historicalResult.status === "fulfilled") {
    try {
      historical = parseDaily(historicalResult.value, "historical")
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "History parsing failed.",
      )
    }
  } else {
    errors.push(
      historicalResult.reason instanceof Error
        ? historicalResult.reason.message
        : "History retrieval failed.",
    )
  }

  const availableValues = [
    ...(forecast?.daily ?? []),
    ...(historical?.daily ?? []),
  ].flatMap((point) => [
    point.temperatureMax,
    point.temperatureMin,
    point.precipitation,
    point.evapotranspiration,
  ])
  const completeValues = availableValues.filter(
    (value) => value !== null,
  ).length
  const completeness = availableValues.length
    ? Math.round((completeValues / availableValues.length) * 100)
    : 0
  const hasForecast = Boolean(forecast)
  const hasHistory = Boolean(historical)
  if (!hasForecast && !hasHistory) {
    throw new Error(
      errors.join(" ") || "Open-Meteo returned no usable weather coverage.",
    )
  }
  const coverage =
    hasForecast && hasHistory
      ? "Forecast and recent history"
      : hasForecast
        ? "Forecast only"
        : hasHistory
          ? "History only"
          : "No coverage"
  const missing = [
    !current && "current conditions",
    !forecast && "forecast",
    !historical && "recent historical observations",
    completeness < 90 && "some daily variables",
    "verified flood-depth layer",
    "long-term drought climatology",
  ].filter(Boolean) as string[]
  const level: ClimateDataQuality["level"] =
    hasForecast && hasHistory && completeness >= 90
      ? "Medium"
      : hasForecast || hasHistory
        ? "Low"
        : "Low"

  return {
    location: { latitude, longitude },
    retrievedAt: new Date().toISOString(),
    current,
    forecast,
    historical,
    errors,
    quality: {
      level,
      completeness,
      freshness: current ? "Current" : "Unknown",
      coverage,
      missing,
      explanation:
        level === "Medium"
          ? "Weather coverage is available, but site hazard, vulnerability, and long-term climate datasets are incomplete."
          : "Only partial weather coverage is available; assessment confidence remains low.",
    },
  }
}
