import { useEffect, useMemo, useState } from "react"

import { useLocation, useNavigate } from "react-router"

import {
  DashboardGlyph,
  DataNotice,
  RiskBadge,
  SectionHeading,
} from "./DashboardLayout"

import DashboardLayout from "./DashboardLayout"

import GeoMap, { type MapPoint } from "./GeoMap"

import PortalProfile from "./PortalProfile"

import type { RiskCategory } from "../services/riskScoringService"

import { ApiError, apiRequest, downloadCsv } from "../services/api"

type AssessmentRecord = {
  id: number

  created_at: string

  location: {
    state: string

    city: string | null

    latitude: number | null

    longitude: number | null
  }

  business: { name: string; industry: string }

  result: {
    score: number | null

    category: string | null

    completeness: number | null

    missing: string[]

    methodology: string

    model_version?: string

    hazards: Record<string, number | null>

    vulnerability_factors: Record<string, number | null>

    source_provenance?: {
      source?: string

      retrieved_at?: string

      coverage?: string

      completeness?: number

      errors?: string[]

      historical?: {
        kind: string

        period: { start: string; end: string }

        daily: {
          date: string

          temperatureMax: number | null

          precipitation: number | null
        }[]
      } | null

      forecast?: {
        kind: string

        period: { start: string; end: string }

        daily: {
          date: string

          temperatureMax: number | null

          precipitation: number | null
        }[]
      } | null
    }
  }
}

type Overview = {
  assessments_available: number

  states_covered: string[]

  risk_distribution: Record<string, number>

  average_completeness: number | null

  latest_assessment: string | null

  data_freshness: string

  data_sources: string[]

  recent_assessments: {
    id: number

    created_at: string

    state: string

    industry: string

    score: number | null

    category: string | null

    completeness: number | null
  }[]
}

type PageStatus = { state: "loading" } | { state: "ready" } | {
  state: "error"
  message: string
}

const navigation: {
  id: string

  label: string

  icon: "overview" | "exposure" | "risk" | "insights" | "reports" | "profile"

  path: string
}[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "overview",
    path: "/analyst/dashboard",
  },

  {
    id: "analytics",
    label: "Climate Analytics",
    icon: "insights",
    path: "/analyst/climate-analytics",
  },

  {
    id: "maps",
    label: "Risk Maps",
    icon: "exposure",
    path: "/analyst/risk-maps",
  },

  {
    id: "assessments",
    label: "Assessments",
    icon: "risk",
    path: "/analyst/assessments",
  },

  {
    id: "quality",
    label: "Data Quality",
    icon: "profile",
    path: "/analyst/data-quality",
  },

  {
    id: "reports",
    label: "Reports",
    icon: "reports",
    path: "/analyst/reports",
  },

  {
    id: "profile",
    label: "Profile",
    icon: "profile",
    path: "/analyst/profile",
  },
]

function useAnalystData(
  state: string,
  industry: string,
  hazard: string,
  since: string,
  until: string,
) {
  const [status, setStatus] = useState<PageStatus>({ state: "loading" })

  const [overview, setOverview] = useState<Overview | null>(null)

  const [items, setItems] = useState<AssessmentRecord[]>([])

  const [states, setStates] = useState<string[]>([])

  const [industries, setIndustries] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()

    const params = new URLSearchParams()

    if (state) params.set("state", state)

    if (industry) params.set("industry", industry)

    if (hazard) params.set("hazard", hazard)

    if (since) params.set("since", since)

    if (until) params.set("until", until)

    const query = params.size ? `?${params}` : ""

    setStatus({ state: "loading" })

    void Promise.all([
      apiRequest<Overview>("/analyst/overview", { signal: controller.signal }),

      apiRequest<{
        items: AssessmentRecord[]

        states: string[]

        industries: string[]
      }>(`/analyst/assessments${query}`, { signal: controller.signal }),
    ])

      .then(([summary, assessments]) => {
        setOverview(summary)

        setItems(assessments.items)

        setStates(assessments.states)

        setIndustries(assessments.industries)

        setStatus({ state: "ready" })
      })

      .catch((error: unknown) => {
        if (controller.signal.aborted) return

        setStatus({
          state: "error",

          message:
            error instanceof Error
              ? error.message
              : "Analyst data could not be loaded.",
        })
      })

    return () => controller.abort()
  }, [state, industry, hazard, since, until])

  return { status, overview, items, states, industries }
}

function Metric({
  label,

  value,

  note,
}: {
  label: string

  value: string

  note: string
}) {
  return (
    <article className="portfolio-metric portfolio-metric--navy">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function FilterControls({
  state,

  setState,

  industry,

  setIndustry,

  hazard,

  setHazard,

  since,

  setSince,

  until,

  setUntil,

  states,

  industries,
}: {
  state: string

  setState: (value: string) => void

  industry: string

  setIndustry: (value: string) => void

  hazard: string

  setHazard: (value: string) => void

  since: string

  setSince: (value: string) => void

  until: string

  setUntil: (value: string) => void

  states: string[]

  industries: string[]
}) {
  return (
    <section
      className="content-card analyst-filters"
      aria-label="Assessment filters"
    >
      <label>
        State scope
        <select
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="">All assigned states</option>
          {states.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Industry
        <select
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        >
          <option value="">All industries</option>
          {industries.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Hazard with available indicator
        <select
          value={hazard}
          onChange={(event) => setHazard(event.target.value)}
        >
          <option value="">All hazards</option>
          <option value="flood">Flood-related proxy</option>
          <option value="rainfall">Rainfall</option>
          <option value="heat">Heat</option>
          <option value="drought">Short-window dryness</option>
        </select>
      </label>
      <label>
        Assessed since
        <input
          type="date"
          value={since}
          onChange={(event) => setSince(event.target.value)}
        />
      </label>
      <label>
        Through
        <input
          type="date"
          value={until}
          onChange={(event) => setUntil(event.target.value)}
        />
      </label>
    </section>
  )
}

function CategoryDistribution({
  distribution,
}: {
  distribution: Record<string, number>
}) {
  const entries = ["Critical", "High", "Moderate", "Low", "Unavailable"]

    .map((category) => ({ category, count: distribution[category] ?? 0 }))

    .filter((item) => item.count > 0)

  if (!entries.length)
    return (
      <div className="empty-state">
        No accessible assessments are available in your assigned scope.
      </div>
    )

  return (
    <div className="analyst-distribution">
      {entries.map((item) => (
        <div key={item.category}>
          <span>
            <RiskBadge category={item.category} />
          </span>
          <strong>{item.count}</strong>
          <small>assessments</small>
        </div>
      ))}
    </div>
  )
}

function AssessmentTable({
  items,

  onSelect,
}: {
  items: AssessmentRecord[]

  onSelect?: (id: number) => void
}) {
  if (!items.length)
    return (
      <div className="empty-state">
        No assessments match these filters. Data appears here only after an
        owner saves an assessment and this account has the matching state scope.
      </div>
    )

  return (
    <div className="table-scroll">
      <table className="borrower-table">
        <thead>
          <tr>
            <th>Assessment</th>
            <th>Business / industry</th>
            <th>Location</th>
            <th>Score</th>
            <th>Data completeness</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {onSelect ? (
                  <button
                    className="analyst-link-button"
                    type="button"
                    onClick={() => onSelect(item.id)}
                  >
                    #{item.id}
                  </button>
                ) : (
                  `#${item.id}`
                )}
              </td>
              <td>
                <strong>{item.business.name}</strong>
                <small>{item.business.industry}</small>
              </td>
              <td>
                {[item.location.city, item.location.state]
                  .filter(Boolean)
                  .join(", ") || "Location unavailable"}
              </td>
              <td>
                {item.result.score ?? "Unavailable"}{" "}
                {item.result.category && (
                  <RiskBadge category={item.result.category} />
                )}
              </td>
              <td>{item.result.completeness ?? "Unavailable"}%</td>
              <td>{new Date(item.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssessmentDetails({ item }: { item: AssessmentRecord }) {
  const provenance = item.result.source_provenance

  return (
    <div className="analyst-detail-grid">
      <article className="content-card">
        <div className="card-heading">
          <div>
            <strong>Assessment #{item.id}</strong>
            <span>
              {item.business.name} · {item.business.industry} ·{" "}
              {item.location.state}
            </span>
          </div>
        </div>
        <div className="analyst-score">
          <strong>{item.result.score ?? "Unavailable"}</strong>
          {item.result.category && (
            <RiskBadge category={item.result.category} />
          )}
          <span>Overall prototype risk score</span>
        </div>
        <h3>Hazard inputs</h3>
        <FactorGrid values={item.result.hazards} />
        <h3>Vulnerability factors</h3>
        <FactorGrid values={item.result.vulnerability_factors} />
        <p className="small-note">{item.result.methodology}</p>
        <p className="small-note">
          Model version: {item.result.model_version ?? "Not recorded"}
        </p>
      </article>
      <article className="content-card">
        <div className="card-heading">
          <div>
            <strong>Data quality and provenance</strong>
            <span>Saved assessment details</span>
          </div>
        </div>
        <p>Completeness: {item.result.completeness ?? "Unavailable"}%</p>
        <p>Source: {provenance?.source ?? "Not recorded"}</p>
        <p>
          Retrieved at:{" "}
          {provenance?.retrieved_at
            ? new Date(provenance.retrieved_at).toLocaleString()
            : "Not recorded"}
        </p>
        <p>Coverage: {provenance?.coverage ?? "Not recorded"}</p>
        {item.result.missing?.length > 0 && (
          <p className="partial-data-warning">
            Missing inputs: {item.result.missing.join(", ")}
          </p>
        )}
        {provenance?.errors?.map((error) => (
          <p className="partial-data-warning" key={error}>
            {error}
          </p>
        ))}
        <p className="small-note">
          Rainfall-derived flood indicators are not confirmed flood events.
          These results are not a validated credit or loss-prediction model.
        </p>
      </article>
    </div>
  )
}

function FactorGrid({ values }: { values: Record<string, number | null> }) {
  return (
    <div className="analyst-factor-grid">
      {Object.entries(values).map(([name, value]) => (
        <div key={name}>
          <span>{name.replace(/_/g, " ")}</span>
          <strong>{value === null ? "Unavailable" : `${value}/100`}</strong>
        </div>
      ))}
    </div>
  )
}

function ClimateSeriesChart({ items }: { items: AssessmentRecord[] }) {
  const samples = items.flatMap((item) => {
    const source = item.result.source_provenance

    return [
      ...(source?.historical?.daily ?? []).map((day) => ({
        ...day,
        kind: "Historical observation",
      })),

      ...(source?.forecast?.daily ?? []).map((day) => ({
        ...day,
        kind: "Forecast",
      })),
    ]
  })

  if (!samples.length) {
    return (
      <div className="empty-state">
        No retained daily historical/forecast series is available for these
        saved assessments. This portal will not recreate weather history from
        assessment scores.
      </div>
    )
  }

  const days = samples.slice(-42)

  const maxRain = Math.max(1, ...days.map((day) => day.precipitation ?? 0))

  const maxTemperature = Math.max(
    1,
    ...days.map((day) => day.temperatureMax ?? 0),
  )

  return (
    <div className="content-card analyst-chart-card">
      <div className="analyst-chart-legend">
        <span>Historical series</span>
        <span>Forecast series</span>
      </div>
      <svg
        viewBox="0 0 800 240"
        role="img"
        aria-label="Saved daily precipitation and temperature, historical and forecast marked separately"
      >
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="42"
            x2="790"
            y1={24 + line * 62}
            y2={24 + line * 62}
            className="analyst-chart-grid"
          />
        ))}
        {days.map((day, index) => {
          const x = 48 + index * (730 / Math.max(1, days.length - 1))

          const rainY = 208 - ((day.precipitation ?? 0) / maxRain) * 170

          const heatY = 208 - ((day.temperatureMax ?? 0) / maxTemperature) * 170

          return (
            <g key={`${day.kind}-${day.date}-${index}`}>
              <circle
                cx={x}
                cy={rainY}
                r="3.5"
                className={
                  day.kind === "Forecast"
                    ? "analyst-chart-forecast"
                    : "analyst-chart-rain"
                }
              />
              <rect
                x={x - 2.5}
                y={heatY - 2.5}
                width="5"
                height="5"
                className={
                  day.kind === "Forecast"
                    ? "analyst-chart-forecast"
                    : "analyst-chart-heat"
                }
              />
            </g>
          )
        })}
      </svg>
      <p className="small-note">
        Historical and forecast points are distinguished by shape and saved
        provenance. Lines and climate trends are not inferred where underlying
        daily data is missing; repeated assessments can include overlapping
        dates.
      </p>
    </div>
  )
}

export default function AnalystPortal() {
  const location = useLocation()

  const navigate = useNavigate()

  const [state, setState] = useState("")

  const [industry, setIndustry] = useState("")

  const [hazard, setHazard] = useState("")

  const [since, setSince] = useState("")

  const [until, setUntil] = useState("")

  const [selectedId, setSelectedId] = useState<number | null>(null)

  const [reportError, setReportError] = useState("")

  const activeView =
    navigation.find((item) => item.path === location.pathname)?.id ?? "overview"

  const { status, overview, items, states, industries } = useAnalystData(
    state,
    industry,
    hazard,
    since,
    until,
  )

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  const points: MapPoint[] = items.flatMap((item) => {
    const { latitude, longitude, state: locationState } = item.location

    if (latitude == null || longitude == null) return []

    return [
      {
        id: String(item.id),

        latitude,

        longitude,

        label: item.business.name,

        detail: `${locationState} · assessment #${item.id} · ${item.result.score ?? "Unavailable"} risk score`,

        category: (item.result.category ??
          undefined) as RiskCategory | undefined,
      },
    ]
  })

  function navigateTo(view: string) {
    const target = navigation.find((item) => item.id === view)

    if (target) navigate(target.path)
  }

  async function exportCsv() {
    setReportError("")

    const params = new URLSearchParams()

    if (state) params.set("state", state)

    if (industry) params.set("industry", industry)

    if (hazard) params.set("hazard", hazard)

    if (since) params.set("since", since)

    if (until) params.set("until", until)

    try {
      await downloadCsv(
        `/analyst/export.csv${params.size ? `?${params}` : ""}`,
        "climateshield-analyst-assessments.csv",
      )
    } catch (error) {
      setReportError(
        error instanceof ApiError ? error.message : "Export failed.",
      )
    }
  }

  const children =
    status.state === "error" ? (
      <div className="empty-state" role="alert">
        Unable to load authorized analytical data: {status.message}
      </div>
    ) : status.state === "loading" ? (
      <div className="empty-state" aria-live="polite">
        Loading assessments in your assigned analyst scope…
      </div>
    ) : (
      <>
        {activeView !== "overview" &&
          activeView !== "quality" &&
          activeView !== "reports" && (
            <FilterControls
              {...{
                state,
                setState,
                industry,
                setIndustry,
                hazard,
                setHazard,
                since,
                setSince,
                until,
                setUntil,
                states,
                industries,
              }}
            />
          )}
        {activeView === "profile" && <PortalProfile portal="analyst" />}
        {activeView === "overview" && (
          <>
            <SectionHeading
              eyebrow="Climate analyst workspace"
              title="Assessment Overview"
              description="Authorized, saved assessments and source metadata within your assigned regional scope."
            />
            <DataNotice label="AUTHORIZED DATA">
              Only records in explicitly assigned analyst scopes are shown.
              Financial inputs and account contact details are excluded.
            </DataNotice>
            <section className="portfolio-metrics">
              <Metric
                label="Assessments available"
                value={String(overview?.assessments_available ?? 0)}
                note="Saved assessment records"
              />
              <Metric
                label="States covered"
                value={String(overview?.states_covered.length ?? 0)}
                note={
                  (overview?.states_covered ?? []).join(", ") ||
                  "No assigned-state data"
                }
              />
              <Metric
                label="Average completeness"
                value={
                  overview?.average_completeness == null
                    ? "Unavailable"
                    : `${overview.average_completeness}%`
                }
                note="Reported input completeness"
              />
              <Metric
                label="Last assessment"
                value={
                  overview?.latest_assessment
                    ? new Date(overview.latest_assessment).toLocaleDateString()
                    : "None"
                }
                note="Assessment timestamp, not climate freshness"
              />
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <strong>Risk category distribution</strong>
                  <span>Stored assessment results</span>
                </div>
              </div>
              <CategoryDistribution
                distribution={overview?.risk_distribution ?? {}}
              />
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <strong>Recently generated assessments</strong>
                  <span>Latest authorized records</span>
                </div>
              </div>
              <AssessmentTable items={items.slice(0, 10)} />
            </section>
            <DataNotice label="AUTHORIZED DATA">
              {overview?.data_freshness ?? "Source freshness is unavailable."}{" "}
              Sources:{" "}
              {(overview?.data_sources ?? []).join("; ") || "No source records"}
              .
            </DataNotice>
          </>
        )}
        {activeView === "analytics" && (
          <>
            <SectionHeading
              eyebrow="Climate analytics"
              title="Observed and Forecast Series"
              description="Compare retained Open-Meteo daily inputs by saved provenance. Assessment score history is not a weather trend."
            />
            <ClimateSeriesChart items={items} />
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <strong>Hazard indicator averages</strong>
                  <span>Filtered saved assessment indicators</span>
                </div>
              </div>
              <FactorGrid
                values={
                  items.length
                    ? Object.fromEntries(
                        ["flood", "rainfall", "heat", "drought"].map((key) => {
                          const values = items
                            .map((item) => item.result.hazards[key])
                            .filter((value): value is number => value != null)
                          return [
                            key,
                            values.length
                              ? Math.round(
                                  values.reduce(
                                    (sum, value) => sum + value,
                                    0,
                                  ) / values.length,
                                )
                              : null,
                          ]
                        }),
                      )
                    : { flood: null, rainfall: null, heat: null, drought: null }
                }
              />
            </section>
          </>
        )}
        {activeView === "maps" && (
          <>
            <SectionHeading
              eyebrow="Geospatial workspace"
              title="Authorized Assessment Locations"
              description="Explore authorized saved records. Markers are assessment locations, not flood boundaries or official hazard polygons."
            />
            <FilterControls
              {...{
                state,
                setState,
                industry,
                setIndustry,
                hazard,
                setHazard,
                since,
                setSince,
                until,
                setUntil,
                states,
                industries,
              }}
            />
            <GeoMap
              points={points}
              fitPoints
              zoom={5}
              emptyMessage="No authorized assessments have usable coordinates."
              className="analyst-map"
            />
            <DataNotice label="AUTHORIZED DATA">
              Map filters use the same server-side analyst scope and assessment
              filters.{" "}
              {hazard
                ? `Values are filtered to records with a ${hazard} indicator.`
                : "Risk categories represent saved prototype model scores."}
            </DataNotice>
          </>
        )}
        {activeView === "assessments" && (
          <>
            <SectionHeading
              eyebrow="Assessment register"
              title="Saved Risk Assessments"
              description="Filter, inspect, and compare detailed assessment inputs within your assigned scope."
            />
            <FilterControls
              {...{
                state,
                setState,
                industry,
                setIndustry,
                hazard,
                setHazard,
                since,
                setSince,
                until,
                setUntil,
                states,
                industries,
              }}
            />
            <section className="content-card">
              <AssessmentTable items={items} onSelect={setSelectedId} />
            </section>
            {selected && <AssessmentDetails item={selected} />}
            {!selected && items[0] && (
              <button
                className="print-button"
                type="button"
                onClick={() => setSelectedId(items[0].id)}
              >
                Open newest assessment details
              </button>
            )}
          </>
        )}
        {activeView === "quality" && (
          <>
            <SectionHeading
              eyebrow="Data quality"
              title="Coverage and Provenance"
              description="Completeness and missingness are tracked separately from the risk score; absent data is not interpreted as safe."
            />
            <section className="portfolio-metrics">
              <Metric
                label="Assigned states"
                value={String(states.length)}
                note={states.join(", ") || "No state scope provisioned"}
              />
              <Metric
                label="Assessments"
                value={String(overview?.assessments_available ?? 0)}
                note="Within assigned scope"
              />
              <Metric
                label="Mean completeness"
                value={
                  overview?.average_completeness == null
                    ? "Unavailable"
                    : `${overview.average_completeness}%`
                }
                note="Across accessible assessments"
              />
              <Metric
                label="Climate-source freshness"
                value="Per-record"
                note="Shown only when a source timestamp was retained"
              />
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <strong>Assessment provenance</strong>
                  <span>Source and model metadata from each saved record</span>
                </div>
              </div>
              <div className="analyst-quality-list">
                {items.map((item) => (
                  <article key={item.id}>
                    <strong>
                      #{item.id} · {item.business.name}
                    </strong>
                    <span>
                      {item.result.source_provenance?.source ??
                        "Source not recorded"}{" "}
                      ·{" "}
                      {item.result.source_provenance?.retrieved_at
                        ? new Date(
                            item.result.source_provenance.retrieved_at,
                          ).toLocaleString()
                        : "retrieval time unavailable"}
                    </span>
                    <span>
                      {item.result.completeness ?? "Unknown"}% complete ·
                      missing:{" "}
                      {item.result.missing?.join(", ") || "none reported"}
                    </span>
                  </article>
                ))}
                {!items.length && (
                  <div className="empty-state">
                    No assessment provenance is available.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
        {activeView === "reports" && (
          <>
            <SectionHeading
              eyebrow="Analyst reports"
              title="Authorized Assessment Export"
              description="Export the filtered assessment summaries; server authorization and analyst state scopes are applied before CSV generation."
              action={
                <button
                  className="print-button"
                  type="button"
                  onClick={() => void exportCsv()}
                >
                  Download scoped CSV
                </button>
              }
            />
            {reportError && (
              <div className="partial-data-warning" role="alert">
                {reportError}
              </div>
            )}
            <FilterControls
              {...{
                state,
                setState,
                industry,
                setIndustry,
                hazard,
                setHazard,
                since,
                setSince,
                until,
                setUntil,
                states,
                industries,
              }}
            />
            <section className="content-card">
              <AssessmentTable items={items} onSelect={setSelectedId} />
            </section>
            <button
              className="print-button"
              type="button"
              onClick={() => window.print()}
            >
              <DashboardGlyph name="reports" /> Print / save PDF
            </button>
          </>
        )}
      </>
    )

  return (
    <DashboardLayout
      productLabel="Climate Analyst"
      contextTitle="Analyst Workspace"
      contextSubtitle={states.join(", ") || "No geographic scope assigned"}
      navigation={navigation.map(({ path: _path, ...item }) => item)}
      activeView={activeView}
      onNavigate={navigateTo}
    >
      {children}
    </DashboardLayout>
  )
}
