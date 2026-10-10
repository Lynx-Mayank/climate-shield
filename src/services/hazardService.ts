import type { ClimateBundle } from "./climateService"

export type HazardKey = "flood" | "heat" | "rainfall" | "drought"

export interface HazardIndicator {
  key: HazardKey
  label: string
  score: number | null
  status: "available" | "unavailable"
  value: string
  type: "derived" | "integration-required"
  source: string
  coverage: string
  resolution: string
  period: string
  units: string
  limitation: string
  retrievedAt: string
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function deriveHazardIndicators(
  bundle: ClimateBundle,
): HazardIndicator[] {
  const forecast = bundle.forecast?.daily ?? []
  const history = bundle.historical?.daily ?? []
  const temperatures = [...forecast, ...history]
    .map((point) => point.temperatureMax)
    .filter((value): value is number => value !== null)
  const rainfall = [...forecast, ...history]
    .map((point) => point.precipitation)
    .filter((value): value is number => value !== null)
  const historyRain = history
    .map((point) => point.precipitation)
    .filter((value): value is number => value !== null)
  const evapotranspiration = history
    .map((point) => point.evapotranspiration)
    .filter((value): value is number => value !== null)
  const maxTemperature = temperatures.length ? Math.max(...temperatures) : null
  const maxRain = rainfall.length ? Math.max(...rainfall) : null
  const historyRainTotal = historyRain.length
    ? historyRain.reduce((sum, value) => sum + value, 0)
    : null
  const et0Total = evapotranspiration.length
    ? evapotranspiration.reduce((sum, value) => sum + value, 0)
    : null
  const period = bundle.historical
    ? `${bundle.historical.period.start} to ${bundle.historical.period.end}`
    : bundle.forecast
      ? `${bundle.forecast.period.start} to ${bundle.forecast.period.end}`
      : "Unavailable"

  return [
    {
      key: "flood",
      label: "Flood-related indicator",
      score: maxRain === null ? null : clamp((maxRain / 100) * 100),
      status: maxRain === null ? "unavailable" : "available",
      value:
        maxRain === null
          ? "Unavailable"
          : `${maxRain.toFixed(1)} mm maximum daily precipitation`,
      type: "derived",
      source: "Open-Meteo precipitation; flood layer not connected",
      coverage: "Point weather model grid near selected coordinates",
      resolution: "Model-dependent; not parcel or shop level",
      period,
      units: "mm/day precipitation proxy",
      retrievedAt: bundle.retrievedAt,
      limitation:
        "Rainfall is not verified flooding, flood depth, population exposure, or business damage.",
    },
    {
      key: "heat",
      label: "Extreme heat indicator",
      score:
        maxTemperature === null
          ? null
          : clamp(((maxTemperature - 30) / 15) * 100),
      status: maxTemperature === null ? "unavailable" : "available",
      value:
        maxTemperature === null
          ? "Unavailable"
          : `${maxTemperature.toFixed(1)} °C maximum daily temperature`,
      type: "derived",
      source: "Open-Meteo temperature",
      coverage: "Point weather model grid near selected coordinates",
      resolution: "Model-dependent",
      period,
      units: "°C",
      retrievedAt: bundle.retrievedAt,
      limitation:
        "A temperature indicator does not measure indoor heat, worker exposure, or equipment failure.",
    },
    {
      key: "rainfall",
      label: "Heavy rainfall indicator",
      score: maxRain === null ? null : clamp((maxRain / 75) * 100),
      status: maxRain === null ? "unavailable" : "available",
      value:
        maxRain === null
          ? "Unavailable"
          : `${maxRain.toFixed(1)} mm maximum daily precipitation`,
      type: "derived",
      source: "Open-Meteo precipitation",
      coverage: "Point weather model grid near selected coordinates",
      resolution: "Model-dependent",
      period,
      units: "mm/day",
      retrievedAt: bundle.retrievedAt,
      limitation:
        "Forecast precipitation is uncertain and is not a confirmed disruptive event.",
    },
    {
      key: "drought",
      label: "Short-window dryness indicator",
      score:
        historyRainTotal === null || et0Total === null
          ? null
          : clamp(
              ((et0Total - historyRainTotal) / Math.max(et0Total, 1)) * 100,
            ),
      status:
        historyRainTotal === null || et0Total === null
          ? "unavailable"
          : "available",
      value:
        historyRainTotal === null || et0Total === null
          ? "Unavailable"
          : `${historyRainTotal.toFixed(1)} mm rain vs ${et0Total.toFixed(1)} mm reference ET₀`,
      type: "derived",
      source: "Open-Meteo precipitation and FAO ET₀",
      coverage: "Recent 30-day point weather model grid",
      resolution: "Model-dependent",
      period,
      units: "dimensionless short-window proxy",
      retrievedAt: bundle.retrievedAt,
      limitation:
        "This is not a meteorological drought index, groundwater assessment, or long-term water-stress dataset.",
    },
  ]
}

export const unavailableFloodDataset = {
  source:
    "World Bank Data Catalog — Global Flood Exposure Gridded Exposure Headcounts by Country",
  status: "Integration point only",
  coverage: "Global gridded population exposure",
  limitation:
    "Population exposure is not verified flooding or damage at a business address. The gridded dataset is not bundled or queried by this frontend prototype.",
}
