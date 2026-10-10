import { FormEvent, useEffect, useRef, useState } from "react"
import {
  loadClimateData,
  searchLocations,
  type ClimateBundle,
  type GeocodedLocation,
} from "../services/climateService"
import {
  deriveHazardIndicators,
  unavailableFloodDataset,
  type HazardKey,
  type HazardIndicator,
} from "../services/hazardService"
import { riskCategory } from "../services/riskScoringService"
import { DashboardGlyph, RiskBadge, SectionHeading } from "./DashboardLayout"
import GeoMap from "./GeoMap"

interface ClimateProfile {
  name: string
  location: string
  latitude: string
  longitude: string
}

interface ClimateIntelligenceProps {
  profile: ClimateProfile
  onLocationSelected: (location: GeocodedLocation) => void
  onHazardsLoaded: (
    indicators: HazardIndicator[],
    bundle: ClimateBundle,
  ) => void
  persistenceStatus?: string
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success"
      bundle: ClimateBundle
      indicators: HazardIndicator[]
    }
  | { status: "error"; message: string }

const hazardTabs: { key: HazardKey; label: string }[] = [
  { key: "flood", label: "Flood Risk" },
  { key: "heat", label: "Extreme Heat" },
  { key: "rainfall", label: "Heavy Rainfall" },
  { key: "drought", label: "Drought" },
]

const hazardDrivers: Record<HazardKey, string> = {
  flood:
    "Maximum daily precipitation is used only as a flood-related proxy. Verified flood depth, drainage and elevation layers are not connected.",
  heat: "The indicator reflects outdoor maximum temperature. Indoor heat, worker exposure and equipment conditions require site data.",
  rainfall:
    "Recent and forecast precipitation indicate possible operational pressure, but do not confirm a disruptive event.",
  drought:
    "Recent rainfall and reference evapotranspiration provide a short-window dryness proxy, not a long-term drought assessment.",
}

function formatRetrieved(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export default function ClimateIntelligence({
  profile,
  onLocationSelected,
  onHazardsLoaded,
  persistenceStatus = "",
}: ClimateIntelligenceProps) {
  const [query, setQuery] = useState(profile.location)
  const [locations, setLocations] = useState<GeocodedLocation[]>([])
  const [searchState, setSearchState] =
    useState<"idle" | "loading" | "empty" | "error">("idle")
  const [state, setState] = useState<LoadState>({ status: "idle" })
  const [selectedHazard, setSelectedHazard] = useState<HazardKey>("flood")
  const lastLoadedCoordinates = useRef("")
  const loadingCoordinates = useRef("")
  const latitude = Number(profile.latitude)
  const longitude = Number(profile.longitude)
  const selectedIndicator =
    state.status === "success"
      ? state.indicators.find((indicator) => indicator.key === selectedHazard)
      : undefined
  const selectedCategory =
    selectedIndicator?.score === null || selectedIndicator?.score === undefined
      ? null
      : riskCategory(selectedIndicator.score)
  const mapPoints =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [
          {
            id: "selected-business",
            latitude,
            longitude,
            label: profile.name,
            detail: `${profile.location} · Selected business location`,
            category: selectedCategory ?? undefined,
          },
        ]
      : []

  async function retrieve(lat = latitude, lon = longitude) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setState({
        status: "error",
        message: "Select a geocoded location or enter valid coordinates.",
      })
      return
    }
    const coordinateKey = `${lat},${lon}`
    if (loadingCoordinates.current === coordinateKey) return
    loadingCoordinates.current = coordinateKey
    setState({ status: "loading" })
    try {
      const bundle = await loadClimateData(lat, lon)
      const indicators = deriveHazardIndicators(bundle)
      setState({ status: "success", bundle, indicators })
      onHazardsLoaded(indicators, bundle)
      lastLoadedCoordinates.current = coordinateKey
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Climate information could not be loaded.",
      })
    } finally {
      if (loadingCoordinates.current === coordinateKey) {
        loadingCoordinates.current = ""
      }
    }
  }

  useEffect(() => {
    const coordinateKey = `${latitude},${longitude}`
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      lastLoadedCoordinates.current !== coordinateKey
    ) {
      void retrieve(latitude, longitude)
    }
  }, [latitude, longitude])

  async function submitSearch(event: FormEvent) {
    event.preventDefault()
    setSearchState("loading")
    try {
      const results = await searchLocations(query)
      setLocations(results)
      setSearchState(results.length ? "idle" : "empty")
    } catch {
      setLocations([])
      setSearchState("error")
    }
  }

  function chooseLocation(location: GeocodedLocation) {
    setQuery(location.label)
    setLocations([])
    onLocationSelected(location)
  }

  return (
    <>
      <SectionHeading
        eyebrow="Live public weather integration"
        title="Location-Based Climate Risk"
        description="Detailed analysis of climate hazards at your business location."
        action={
          <button
            className="print-button"
            type="button"
            onClick={() => void retrieve()}
            disabled={state.status === "loading"}
          >
            {state.status === "loading"
              ? "Refreshing…"
              : "Refresh climate data"}
          </button>
        }
      />
      <div className="climate-source-banner">
        <strong>Source distinction</strong>
        <span>
          Open-Meteo weather: live retrieval · Hazard indicators: derived
          proxies · Business loss: scenario estimate · Flood-depth layer: not
          connected
        </span>
      </div>
      {persistenceStatus && (
        <div
          className="climate-source-banner"
          role="status"
          aria-live="polite"
        >
          <strong>Assessment record</strong>
          <span>{persistenceStatus}</span>
        </div>
      )}

      <div className="hazard-tabs" role="tablist" aria-label="Climate hazards">
        {hazardTabs.map((hazard) => (
          <button
            key={hazard.key}
            type="button"
            role="tab"
            aria-selected={selectedHazard === hazard.key}
            className={selectedHazard === hazard.key ? "is-active" : ""}
            onClick={() => setSelectedHazard(hazard.key)}
          >
            {hazard.label}
          </button>
        ))}
      </div>

      <section className="climate-analysis-layout">
        <GeoMap
          points={mapPoints}
          center={
            Number.isFinite(latitude) && Number.isFinite(longitude)
              ? [latitude, longitude]
              : undefined
          }
          zoom={10}
          loading={state.status === "loading"}
          error={
            state.status === "error"
              ? "Climate data is unavailable; the validated location remains visible."
              : undefined
          }
          className="climate-primary-map"
        />
        <aside className="hazard-analysis-panel">
          <div className="hazard-analysis-panel__heading">
            <span>Selected hazard</span>
            <h2>
              {
                hazardTabs.find((hazard) => hazard.key === selectedHazard)
                  ?.label
              }
            </h2>
            {selectedCategory ? (
              <RiskBadge category={selectedCategory} />
            ) : (
              <span className="data-state-badge">INSUFFICIENT DATA</span>
            )}
          </div>
          <div className="hazard-analysis-score">
            <span>Derived indicator score</span>
            <strong>
              {selectedIndicator?.score ?? "—"}
              {selectedIndicator?.score !== null &&
                selectedIndicator?.score !== undefined && <small>/100</small>}
            </strong>
            <p>
              {selectedIndicator?.value ??
                "Retrieving available weather indicators…"}
            </p>
          </div>
          <dl className="hazard-analysis-details">
            <div>
              <dt>Current temperature</dt>
              <dd>
                {state.status === "success"
                  ? `${state.bundle.current?.temperature ?? "—"} ${state.bundle.current?.units.temperature ?? ""}`
                  : "Loading"}
              </dd>
            </div>
            <div>
              <dt>Current precipitation</dt>
              <dd>
                {state.status === "success"
                  ? `${state.bundle.current?.precipitation ?? "—"} ${state.bundle.current?.units.precipitation ?? ""}`
                  : "Loading"}
              </dd>
            </div>
            <div>
              <dt>Elevation</dt>
              <dd>INSUFFICIENT DATA</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {selectedIndicator?.source ?? "Open-Meteo retrieval pending"}
              </dd>
            </div>
            <div>
              <dt>Retrieved</dt>
              <dd>
                {state.status === "success"
                  ? formatRetrieved(state.bundle.retrievedAt)
                  : "Pending"}
              </dd>
            </div>
          </dl>
          <div className="hazard-driver-note">
            <strong>Main risk drivers and limitations</strong>
            <p>{hazardDrivers[selectedHazard]}</p>
            {selectedHazard === "flood" && (
              <small>{unavailableFloodDataset.limitation}</small>
            )}
          </div>
        </aside>
      </section>

      <section className="content-card location-search-card">
        <div className="card-heading">
          <div>
            <strong>Validated business location</strong>
            <span>
              Geocoding provided by Open-Meteo using GeoNames source data
            </span>
          </div>
        </div>
        <form className="location-search" onSubmit={submitSearch}>
          <label>
            <DashboardGlyph name="search" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search city or district"
              aria-label="Search business location"
            />
          </label>
          <button type="submit" disabled={searchState === "loading"}>
            {searchState === "loading" ? "Searching…" : "Search location"}
          </button>
        </form>
        {locations.length > 0 && (
          <div className="location-results" role="listbox">
            {locations.map((location) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => chooseLocation(location)}
                key={location.id}
              >
                <strong>{location.label}</strong>
                <span>
                  {location.latitude.toFixed(4)},{" "}
                  {location.longitude.toFixed(4)} · {location.timezone}
                </span>
              </button>
            ))}
          </div>
        )}
        {searchState === "empty" && (
          <p className="inline-state">
            No matching geocoded locations were returned. Try a broader place
            name.
          </p>
        )}
        {searchState === "error" && (
          <p className="inline-state inline-state--error">
            Location search failed. Existing coordinates remain available.
          </p>
        )}
      </section>

      {state.status === "loading" && (
        <section className="climate-loading" aria-live="polite">
          <span />
          <div>
            <strong>Retrieving Open-Meteo information</strong>
            <p>
              Loading forecast and a recent 30-day historical window. A timeout
              is applied if the service is unavailable.
            </p>
          </div>
        </section>
      )}

      {state.status === "error" && (
        <section className="climate-error" role="alert">
          <strong>Climate data unavailable</strong>
          <p>{state.message}</p>
          <button type="button" onClick={() => void retrieve()}>
            Try again
          </button>
        </section>
      )}

      {state.status === "success" && (
        <>
          <section className="climate-quality-card">
            <div>
              <span>Assessment data quality</span>
              <strong>{state.bundle.quality.level}</strong>
              <RiskBadge category={state.bundle.quality.level} />
            </div>
            <dl>
              <div>
                <dt>Weather completeness</dt>
                <dd>{state.bundle.quality.completeness}%</dd>
              </div>
              <div>
                <dt>Coverage</dt>
                <dd>{state.bundle.quality.coverage}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{state.bundle.quality.freshness}</dd>
              </div>
              <div>
                <dt>Retrieved</dt>
                <dd>{formatRetrieved(state.bundle.retrievedAt)}</dd>
              </div>
            </dl>
            <p>{state.bundle.quality.explanation}</p>
          </section>

          <section className="weather-summary-grid">
            <article>
              <small>Current · Open-Meteo</small>
              <strong>
                {state.bundle.current?.temperature ?? "—"}
                <span>{state.bundle.current?.units.temperature ?? ""}</span>
              </strong>
              <p>
                Precipitation {state.bundle.current?.precipitation ?? "—"}{" "}
                {state.bundle.current?.units.precipitation ?? ""}
              </p>
              <time>{state.bundle.current?.time ?? "Time unavailable"}</time>
            </article>
            <article>
              <small>7-day forecast · not a confirmed event</small>
              <strong>
                {state.bundle.forecast?.daily.length ?? 0}
                <span> days</span>
              </strong>
              <p>
                {state.bundle.forecast?.period.start} to{" "}
                {state.bundle.forecast?.period.end}
              </p>
              <time>Open-Meteo forecast models</time>
            </article>
            <article>
              <small>Recent history · archive</small>
              <strong>
                {state.bundle.historical?.daily.length ?? 0}
                <span> days</span>
              </strong>
              <p>
                {state.bundle.historical?.period.start ?? "Unavailable"} to{" "}
                {state.bundle.historical?.period.end ?? "Unavailable"}
              </p>
              <time>Open-Meteo archive endpoint</time>
            </article>
          </section>

          <section className="content-card">
            <div className="card-heading">
              <div>
                <strong>Seven-day weather forecast</strong>
                <span>
                  Model output from Open-Meteo; forecasts are uncertain
                </span>
              </div>
            </div>
            {state.bundle.forecast?.daily.length ? (
              <div className="forecast-strip">
                {state.bundle.forecast.daily.map((day) => (
                  <article key={day.date}>
                    <time>{day.date.slice(5)}</time>
                    <strong>{day.temperatureMax?.toFixed(1) ?? "—"}°</strong>
                    <span>{day.precipitation?.toFixed(1) ?? "—"} mm rain</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                Open-Meteo returned no forecast rows for this location.
              </div>
            )}
          </section>

          <section className="content-card">
            <div className="card-heading">
              <div>
                <strong>Unified hazard indicators</strong>
                <span>
                  Derived from available weather variables—not verified losses
                </span>
              </div>
            </div>
            <div className="hazard-data-grid">
              {state.indicators.map((indicator) => (
                <article key={indicator.key}>
                  <header>
                    <strong>{indicator.label}</strong>
                    <span>{indicator.type}</span>
                  </header>
                  <h2>{indicator.value}</h2>
                  <dl>
                    <div>
                      <dt>Source</dt>
                      <dd>{indicator.source}</dd>
                    </div>
                    <div>
                      <dt>Coverage</dt>
                      <dd>{indicator.coverage}</dd>
                    </div>
                    <div>
                      <dt>Resolution</dt>
                      <dd>{indicator.resolution}</dd>
                    </div>
                    <div>
                      <dt>Period / units</dt>
                      <dd>
                        {indicator.period} · {indicator.units}
                      </dd>
                    </div>
                  </dl>
                  <p>{indicator.limitation}</p>
                </article>
              ))}
            </div>
          </section>

          {state.bundle.errors.length > 0 && (
            <section className="partial-data-warning">
              <strong>Partial retrieval</strong>
              <ul>
                {state.bundle.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}
