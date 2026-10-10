import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router"
import DashboardLayout, {
  DashboardGlyph,
  DataNotice,
  formatCurrency,
  type NavigationItem,
  RiskBadge,
  SectionHeading,
} from "./DashboardLayout"
import { borrowers, type Borrower } from "./data"
import { riskCategory } from "../services/riskScoringService"
import {
  simulateScenario,
  type ScenarioHazard,
} from "../services/scenarioService"
import { searchLocations } from "../services/climateService"
import GeoMap, { type MapPoint } from "./GeoMap"
import { ApiError, apiRequest, downloadCsv } from "../services/api"

interface AuthorizedAssessment {
  id: number
  business: {
    name: string
    industry: string
    city: string
    state: string
  }
  result: {
    score: number | null
    category: string | null
    completeness: number
    hazards: Record<string, number | null>
    model_version?: string
  }
  created_at: string
}

const navigation: NavigationItem[] = [
  { id: "portfolio", label: "Portfolio Overview", icon: "portfolio" },
  { id: "borrowers", label: "Borrower Risk", icon: "borrowers" },
  { id: "exposure", label: "Climate Exposure", icon: "exposure" },
  { id: "scenario", label: "Scenario Analysis", icon: "simulator" },
  { id: "alerts", label: "Early Warning Alerts", icon: "alerts" },
  { id: "insights", label: "Lending Insights", icon: "insights" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "settings", label: "Settings", icon: "settings" },
]

const lenderViewPaths: Record<string, string> = {
  portfolio: "/lender/dashboard",
  borrowers: "/lender/borrowers",
  exposure: "/lender/climate-exposure",
  scenario: "/lender/scenario-analysis",
  alerts: "/lender/alerts",
  insights: "/lender/insights",
  reports: "/lender/reports",
  settings: "/lender/settings",
}

function PortfolioMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <article className={`portfolio-metric portfolio-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function DonutChart() {
  const categories = ["Critical", "High", "Moderate", "Low"].map((name) => {
    const count = borrowers.filter((item) => item.category === name).length
    return { name, count, value: (count / borrowers.length) * 100 }
  })
  return (
    <div className="donut-layout">
      <div className="donut-chart">
        <div>
          <strong>{borrowers.length}</strong>
          <span>borrowers</span>
        </div>
      </div>
      <div className="chart-legend">
        {categories.map((category) => (
          <div key={category.name}>
            <span
              className={`chart-swatch chart-swatch--${category.name.toLowerCase()}`}
            />
            <p>
              <strong>{category.name}</strong>
              <small>
                {category.count} · {category.value}%
              </small>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PortfolioOverview({
  onNavigate,
}: {
  onNavigate: (view: string) => void
}) {
  const [authorizedPortfolio, setAuthorizedPortfolio] = useState<{
    status: "loading" | "success" | "error" | "demo"
    items: AuthorizedAssessment[]
    message?: string
  }>({ status: "loading", items: [] })
  const [industryFilter, setIndustryFilter] = useState("")
  const [riskFilter, setRiskFilter] = useState("")
  const [hazardFilter, setHazardFilter] = useState("")
  const [exportError, setExportError] = useState("")

  useEffect(() => {
    if (sessionStorage.getItem("climateshield_demo_role") === "lender") {
      setAuthorizedPortfolio({ status: "demo", items: [] })
      return
    }
    let active = true
    void apiRequest<{ items: AuthorizedAssessment[] }>("/lender/portfolio")
      .then(({ items }) => {
        if (active) setAuthorizedPortfolio({ status: "success", items })
      })
      .catch((error: unknown) => {
        if (!active) return
        setAuthorizedPortfolio({
          status: "error",
          items: [],
          message:
            error instanceof ApiError
              ? error.message
              : "The authorized portfolio could not be loaded.",
        })
      })
    return () => {
      active = false
    }
  }, [])
  const availableIndustries = useMemo(
    () =>
      [
        ...new Set(
          authorizedPortfolio.items.map((item) => item.business.industry),
        ),
      ]
        .filter(Boolean)
        .sort(),
    [authorizedPortfolio.items],
  )
  const filteredAssessments = useMemo(
    () =>
      authorizedPortfolio.items.filter((item) => {
        if (industryFilter && item.business.industry !== industryFilter) {
          return false
        }
        if (
          riskFilter &&
          (item.result.category ?? "Unavailable") !== riskFilter
        ) {
          return false
        }
        if (hazardFilter && item.result.hazards[hazardFilter] == null) {
          return false
        }
        return true
      }),
    [authorizedPortfolio.items, industryFilter, riskFilter, hazardFilter],
  )

  async function exportAuthorizedAssessments() {
    const params = new URLSearchParams()
    if (industryFilter) params.set("industry", industryFilter)
    if (riskFilter) params.set("category", riskFilter)
    if (hazardFilter) params.set("hazard", hazardFilter)
    setExportError("")
    try {
      await downloadCsv(
        `/lender/export.csv${params.size ? `?${params}` : ""}`,
        "climateshield-authorized-lender-assessments.csv",
      )
    } catch (error) {
      setExportError(
        error instanceof ApiError ? error.message : "Portfolio export failed.",
      )
    }
  }

  const highRisk = borrowers.filter(
    (item) => item.category === "High" || item.category === "Critical",
  ).length
  const plans = borrowers.filter((item) => item.resilience !== "No plan").length
  const exposure = borrowers.reduce((sum, item) => sum + item.exposure, 0)
  const highRiskPercent = Math.round((highRisk / borrowers.length) * 1000) / 10
  const [mapState, setMapState] = useState<{
    status: "loading" | "success" | "error"
    points: MapPoint[]
    message?: string
  }>({ status: "loading", points: [] })

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function geocodePortfolio() {
      const results = await Promise.allSettled(
        borrowers.map(async (borrower) => {
          const matches = await searchLocations(
            borrower.location,
            controller.signal,
          )
          const location = matches[0]
          return location
            ? {
                id: String(borrower.id),
                latitude: location.latitude,
                longitude: location.longitude,
                label: borrower.name,
                detail: `${borrower.location} · City-level geocoding, not a verified business address`,
                category: borrower.category,
              }
            : null
        }),
      )
      if (!active) return
      const points = results.flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value] : [],
      )
      setMapState(
        points.length
          ? { status: "success", points }
          : {
              status: "error",
              points: [],
              message:
                "Borrower locations could not be geocoded. No coordinates were invented.",
            },
      )
    }

    void geocodePortfolio()
    return () => {
      active = false
      controller.abort()
    }
  }, [])

  return (
    <>
      <SectionHeading
        eyebrow="Lender portfolio"
        title="Portfolio Overview"
        description="Climate risk intelligence for stronger, safer and more resilient lending."
      />
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Authorized borrower assessments</strong>
            <span>Live records linked to this lender account</span>
          </div>
          {authorizedPortfolio.status === "success" && (
            <button
              className="print-button"
              type="button"
              onClick={() => void exportAuthorizedAssessments()}
              disabled={authorizedPortfolio.items.length === 0}
            >
              Download authorized CSV
            </button>
          )}
        </div>
        {authorizedPortfolio.status === "success" && (
          <section className="analyst-filters" aria-label="Portfolio filters">
            <label>
              Industry
              <select
                value={industryFilter}
                onChange={(event) => setIndustryFilter(event.target.value)}
              >
                <option value="">All industries</option>
                {availableIndustries.map((industry) => (
                  <option key={industry}>{industry}</option>
                ))}
              </select>
            </label>
            <label>
              Risk category
              <select
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value)}
              >
                <option value="">All categories</option>
                {["Low", "Moderate", "High", "Critical", "Unavailable"].map(
                  (category) => (
                    <option key={category}>{category}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Hazard indicator
              <select
                value={hazardFilter}
                onChange={(event) => setHazardFilter(event.target.value)}
              >
                <option value="">Any available hazard</option>
                {["flood", "rainfall", "heat", "drought"].map((hazard) => (
                  <option key={hazard} value={hazard}>
                    {hazard[0].toUpperCase() + hazard.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}
        {exportError && <p role="alert">{exportError}</p>}
        {authorizedPortfolio.status === "loading" && (
          <p role="status">Loading authorized assessments…</p>
        )}
        {authorizedPortfolio.status === "error" && (
          <p role="alert">{authorizedPortfolio.message}</p>
        )}
        {authorizedPortfolio.status === "demo" && (
          <p>
            Demo mode does not load authorized borrower records. Sign in to view
            assessments explicitly linked to your lender account.
          </p>
        )}
        {authorizedPortfolio.status === "success" &&
          filteredAssessments.length === 0 && (
            <p>
              {authorizedPortfolio.items.length === 0
                ? "No assessments are currently linked to this lender. An administrator must explicitly authorize borrower access."
                : "No authorized assessments match these filters."}
            </p>
          )}
        {authorizedPortfolio.status === "success" &&
          filteredAssessments.length > 0 && (
            <div className="table-scroll">
              <table className="borrower-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Industry</th>
                    <th>Region</th>
                    <th>Risk</th>
                    <th>Hazards available</th>
                    <th>Completeness</th>
                    <th>Assessed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssessments.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.business.name || "Business name unavailable"}
                      </td>
                      <td>{item.business.industry || "Not provided"}</td>
                      <td>
                        {[item.business.city, item.business.state]
                          .filter(Boolean)
                          .join(", ") || "Not provided"}
                      </td>
                      <td>
                        {Object.entries(item.result.hazards)
                          .filter(([, value]) => value != null)
                          .map(([hazard]) => hazard)
                          .join(", ") || "None recorded"}
                      </td>
                      <td>
                        {item.result.category ??
                          (item.result.score === null
                            ? "Insufficient data"
                            : `Score ${item.result.score}`)}
                      </td>
                      <td>{item.result.completeness}%</td>
                      <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
      <DataNotice>
        The charts and named sample records below are synthetic demonstrations.
        The authorized assessment list above contains live records scoped to
        this lender account; climate feeds are not connected to these summaries.
      </DataNotice>
      <section className="portfolio-metrics">
        <PortfolioMetric
          label="Total MSME borrowers"
          value={String(borrowers.length)}
          detail="Synthetic demonstration records"
          tone="navy"
        />
        <PortfolioMetric
          label="High / critical risk"
          value={String(highRisk)}
          detail={`${highRiskPercent}% of sample borrowers`}
          tone="red"
        />
        <PortfolioMetric
          label="Climate-sensitive exposure"
          value={formatCurrency(exposure)}
          detail="Illustrative amount at exposure"
          tone="amber"
        />
        <PortfolioMetric
          label="With resilience plans"
          value={`${plans} / ${borrowers.length}`}
          detail="Any documented plan status"
          tone="green"
        />
      </section>
      <section className="lender-chart-grid">
        <article className="chart-card">
          <div className="card-heading">
            <div>
              <strong>Borrowers by risk category</strong>
              <span>Synthetic distribution</span>
            </div>
            <button type="button" onClick={() => onNavigate("borrowers")}>
              View records
            </button>
          </div>
          <DonutChart />
        </article>
        <article className="chart-card">
          <div className="card-heading">
            <div>
              <strong>Climate risk by sector</strong>
              <span>Average illustrative score</span>
            </div>
          </div>
          <div className="horizontal-bars">
            {[...new Set(borrowers.map((item) => item.industry))].map(
              (name) => {
                const records = borrowers.filter(
                  (item) => item.industry === name,
                )
                const value = Math.round(
                  records.reduce((sum, item) => sum + item.score, 0) /
                    records.length,
                )
                return (
                  <div key={name}>
                    <span>{name}</span>
                    <div className="progress-track">
                      <i
                        style={
                          { "--progress": `${value}%` } as React.CSSProperties
                        }
                      />
                    </div>
                    <b>{value}</b>
                  </div>
                )
              },
            )}
          </div>
        </article>
        <article className="chart-card lender-map-card">
          <div className="card-heading">
            <div>
              <strong>Geographic Climate Risk Distribution</strong>
              <span>
                Open-Meteo city geocoding · No hazard boundaries displayed
              </span>
            </div>
          </div>
          <GeoMap
            points={mapState.points}
            center={[22.8, 79]}
            zoom={5}
            fitPoints
            loading={mapState.status === "loading"}
            error={mapState.message}
            emptyMessage="No borrower record currently has validated geographic coordinates."
            className="lender-portfolio-map"
          />
        </article>
        <article className="chart-card">
          <div className="card-heading">
            <div>
              <strong>Portfolio risk trend</strong>
              <span>Synthetic monthly records</span>
            </div>
          </div>
          <svg
            className="line-chart line-chart--portfolio"
            viewBox="0 0 570 180"
            role="img"
            aria-label="Synthetic portfolio risk trend"
          >
            {[35, 75, 115, 155].map((y) => (
              <line x1="20" x2="555" y1={y} y2={y} key={y} />
            ))}
            <polyline points="22,110 70,105 118,111 166,99 214,92 262,96 310,84 358,78 406,82 454,70 502,68 550,61" />
            <text x="20" y="177">
              Apr
            </text>
            <text x="274" y="177">
              Sep
            </text>
            <text x="535" y="177">
              Mar
            </text>
          </svg>
        </article>
      </section>
    </>
  )
}

function BorrowerDetail({
  borrower,
  onBack,
}: {
  borrower: Borrower
  onBack: () => void
}) {
  const sharedAssessment =
    borrower.name === "Aarav Textiles"
      ? (() => {
          try {
            const value = sessionStorage.getItem(
              "climateshield-business-assessment",
            )
            return value
              ? JSON.parse(value) as Borrower["assessment"]
              : borrower.assessment
          } catch {
            return borrower.assessment
          }
        })()
      : borrower.assessment
  const savedPlan =
    borrower.name === "Aarav Textiles"
      ? (() => {
          try {
            const plan = localStorage.getItem("climateshield-resilience-plan")
            return plan
              ? JSON.parse(plan) as {
                  selectedInterventions?: { title: string }[]
                  savedAt?: string
                  persistence?: string
                }
              : null
          } catch {
            return null
          }
        })()
      : null
  return (
    <>
      <button className="back-button" type="button" onClick={onBack}>
        ← Back to borrower portfolio
      </button>
      <SectionHeading
        eyebrow="Synthetic borrower record"
        title="Borrower Risk Profile"
        description={`${borrower.name} · ${borrower.industry} · ${borrower.location}`}
        action={<RiskBadge category={sharedAssessment.category} />}
      />
      <DataNotice>
        This detail view contains no real customer, credit, repayment, or
        financial account information.
      </DataNotice>
      <section className="borrower-detail-hero">
        <div className="borrower-score">
          <span>Illustrative risk score</span>
          <strong>
            {sharedAssessment.score}
            <small>/100</small>
          </strong>
          <RiskBadge category={sharedAssessment.category} />
        </div>
        <dl>
          <div>
            <dt>Primary hazard</dt>
            <dd>{borrower.hazard}</dd>
          </div>
          <div>
            <dt>Estimated exposure</dt>
            <dd>{formatCurrency(borrower.exposure)}</dd>
          </div>
          <div>
            <dt>Resilience status</dt>
            <dd>{borrower.resilience}</dd>
          </div>
          <div>
            <dt>Sample updated</dt>
            <dd>{borrower.updated}</dd>
          </div>
        </dl>
      </section>
      <section className="dashboard-two-column">
        <article className="content-card">
          <div className="card-heading">
            <div>
              <strong>Risk drivers</strong>
              <span>Illustrative profile assumptions</span>
            </div>
          </div>
          <ul className="detail-list">
            {sharedAssessment.drivers.map((driver) => (
              <li key={driver}>
                <span>!</span>
                {driver}
              </li>
            ))}
          </ul>
        </article>
        <article className="content-card">
          <div className="card-heading">
            <div>
              <strong>Mitigation actions</strong>
              <span>Suggested for demonstration</span>
            </div>
          </div>
          <ul className="detail-list detail-list--green">
            {borrower.mitigations.map((item) => (
              <li key={item}>
                <span>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Illustrative stress result</strong>
            <span>Severe monsoon · preset assumptions</span>
          </div>
        </div>
        <div className="stress-strip">
          <div>
            <span>Operational disruption</span>
            <strong>
              {borrower.category === "Critical" ? "8–12 days" : "4–7 days"}
            </strong>
          </div>
          <div>
            <span>Repayment stress</span>
            <strong>
              {sharedAssessment.score > 75 ? "Elevated" : "Moderate"}
            </strong>
          </div>
          <div>
            <span>Data confidence</span>
            <strong>{sharedAssessment.confidence}</strong>
          </div>
        </div>
      </section>
      <section className="content-card data-quality-card">
        <div className="card-heading">
          <div>
            <strong>Data quality</strong>
            <span>Known limitations</span>
          </div>
        </div>
        <p>
          Assessment completeness is {sharedAssessment.completeness}%. Missing
          inputs:{" "}
          {sharedAssessment.missing.join(", ") || "none in the synthetic model"}
          . No bureau data, account history, audited financials, or verified
          geospatial hazard layers are connected.
        </p>
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Climate-to-Credit resilience plan</strong>
            <span>Browser-local decision-support artifact</span>
          </div>
        </div>
        {savedPlan ? (
          <div className="saved-plan-summary">
            <strong>
              {savedPlan.selectedInterventions?.length ?? 0} proposed actions
            </strong>
            <p>
              This plan was saved locally by the business demo on{" "}
              {savedPlan.savedAt
                ? new Date(savedPlan.savedAt).toLocaleString("en-IN")
                : "an unknown date"}
              . It has not been submitted, verified, or shared through a
              backend.
            </p>
            <ul>
              {savedPlan.selectedInterventions?.map((item) => (
                <li key={item.title}>{item.title}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="empty-state">
            No browser-local resilience plan is available for this synthetic
            borrower.
          </div>
        )}
      </section>
    </>
  )
}

function BorrowerRisk({
  selectedBorrowerId,
  onSelectBorrower,
  onBack,
}: {
  selectedBorrowerId: number | null
  onSelectBorrower: (borrower: Borrower) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [industry, setIndustry] = useState("All")
  const [location, setLocation] = useState("All")
  const [alert, setAlert] = useState("All")
  const [hazard, setHazard] = useState("All")
  const [confidence, setConfidence] = useState("All")
  const selected =
    selectedBorrowerId === null
      ? null
      : (borrowers.find((borrower) => borrower.id === selectedBorrowerId) ??
        null)
  const filtered = borrowers.filter((borrower) => {
    const matchesQuery =
      `${borrower.name} ${borrower.location} ${borrower.industry}`
        .toLowerCase()
        .includes(query.toLowerCase())
    return (
      matchesQuery &&
      (category === "All" || borrower.category === category) &&
      (industry === "All" || borrower.industry === industry) &&
      (location === "All" || borrower.location.includes(location)) &&
      (hazard === "All" || borrower.hazard === hazard) &&
      (confidence === "All" || borrower.confidence === confidence) &&
      (alert === "All" ||
        (alert === "Active" ? borrower.alert : !borrower.alert))
    )
  })
  if (selected) return <BorrowerDetail borrower={selected} onBack={onBack} />
  const industries = [...new Set(borrowers.map((item) => item.industry))]
  return (
    <>
      <SectionHeading
        eyebrow="Portfolio screening"
        title="Borrower Risk"
        description="Search and filter synthetic MSME borrower records, then open a record to review its illustrative risk drivers."
      />
      <DataNotice>
        These are invented demonstration businesses. They do not represent real
        borrowers or verified credit exposure.
      </DataNotice>
      <section className="content-card filter-panel">
        <label className="table-search">
          <DashboardGlyph name="search" size={17} />
          <input
            placeholder="Search borrower, industry, or location"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Risk
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>All</option>
            <option>Critical</option>
            <option>High</option>
            <option>Moderate</option>
            <option>Low</option>
          </select>
        </label>
        <label>
          Industry
          <select
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          >
            <option>All</option>
            {industries.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Region
          <select
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option>All</option>
            <option>Gujarat</option>
            <option>Maharashtra</option>
            <option>Tamil Nadu</option>
            <option>Kerala</option>
            <option>Rajasthan</option>
            <option>Assam</option>
            <option>Karnataka</option>
          </select>
        </label>
        <label>
          Alert
          <select
            value={alert}
            onChange={(event) => setAlert(event.target.value)}
          >
            <option>All</option>
            <option>Active</option>
            <option>None</option>
          </select>
        </label>
        <label>
          Hazard
          <select
            value={hazard}
            onChange={(event) => setHazard(event.target.value)}
          >
            <option>All</option>
            {[...new Set(borrowers.map((item) => item.hazard))].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Confidence
          <select
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
          >
            <option>All</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </label>
      </section>
      <section className="content-card borrower-table-card">
        <div className="card-heading">
          <div>
            <strong>{filtered.length} borrower records</strong>
            <span>Click a row for risk details</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="borrower-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Risk</th>
                <th>Primary hazard</th>
                <th>Est. exposure</th>
                <th>Resilience</th>
                <th>Updated</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((borrower) => (
                <tr
                  key={borrower.id}
                  onClick={() => onSelectBorrower(borrower)}
                  tabIndex={0}
                  onKeyDown={(event) =>
                    event.key === "Enter" && onSelectBorrower(borrower)
                  }
                >
                  <td>
                    <strong>{borrower.name}</strong>
                    {borrower.alert && (
                      <small className="table-alert">Active alert</small>
                    )}
                  </td>
                  <td>{borrower.industry}</td>
                  <td>{borrower.location}</td>
                  <td>
                    <strong>{borrower.score}</strong>
                    <RiskBadge category={borrower.category} />
                  </td>
                  <td>{borrower.hazard}</td>
                  <td>{formatCurrency(borrower.exposure)}</td>
                  <td>{borrower.resilience}</td>
                  <td>{borrower.updated}</td>
                  <td>{borrower.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            No synthetic records match the selected filters.
          </div>
        )}
      </section>
    </>
  )
}

function ClimateExposure() {
  const hazards = [
    { name: "Flooding", borrowers: 3, exposure: 4470000, value: 78 },
    { name: "Extreme heat", borrowers: 2, exposure: 1870000, value: 52 },
    { name: "Heavy rainfall", borrowers: 2, exposure: 3060000, value: 68 },
    {
      name: "Drought / water stress",
      borrowers: 2,
      exposure: 1350000,
      value: 38,
    },
  ]
  return (
    <>
      <SectionHeading
        eyebrow="Portfolio hazard view"
        title="Climate Exposure"
        description="Separate broad geographic hazard indicators from borrower-specific profile exposure and estimated loss."
      />
      <DataNotice>
        No population exposure dataset, map provider, or business-level loss
        model is connected. Values are synthetic portfolio examples.
      </DataNotice>
      <section className="exposure-layout">
        <div className="content-card">
          <div className="card-heading">
            <div>
              <strong>Exposure by hazard</strong>
              <span>Illustrative borrower and rupee exposure</span>
            </div>
          </div>
          <div className="exposure-bars">
            {hazards.map((hazard) => (
              <div key={hazard.name}>
                <div>
                  <strong>{hazard.name}</strong>
                  <span>
                    {hazard.borrowers} borrowers ·{" "}
                    {formatCurrency(hazard.exposure)}
                  </span>
                </div>
                <div className="progress-track">
                  <span
                    style={
                      {
                        "--progress": `${hazard.value}%`,
                      } as React.CSSProperties
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="portfolio-map">
          <div className="map-grid" />
          {[
            ["Surat", "18%", "60%", "critical"],
            ["Chennai", "64%", "70%", "high"],
            ["Pune", "34%", "48%", "high"],
            ["Guwahati", "78%", "32%", "critical"],
            ["Bengaluru", "58%", "57%", "low"],
          ].map(([name, left, top, level]) => (
            <button
              className={`portfolio-map__pin portfolio-map__pin--${level}`}
              style={{ "--left": left, "--top": top } as React.CSSProperties}
              title={`${name} · synthetic borrower cluster`}
              type="button"
              key={name}
            >
              <span />
              {name}
            </button>
          ))}
          <div className="map-integration map-integration--small">
            <strong>Illustrative location view</strong>
            <span>
              Connect a map and verified hazard layers for geographic analysis.
            </span>
          </div>
        </div>
      </section>
      <section className="content-card definition-grid">
        <div>
          <strong>Population-level exposure</strong>
          <p>
            People or assets located in a broad hazard zone. Not available in
            this demo and never treated as verified shop damage.
          </p>
        </div>
        <div>
          <strong>Geographic hazard indicator</strong>
          <p>
            A location-based signal such as potential flood depth or heat
            intensity. Requires a verified geospatial source.
          </p>
        </div>
        <div>
          <strong>Business-level loss estimate</strong>
          <p>
            A modeled outcome using site vulnerability, financial assumptions,
            and protective measures. Current values are illustrative only.
          </p>
        </div>
      </section>
    </>
  )
}

interface PortfolioScenario {
  type: string
  severity: number
  disruption: number
}

function portfolioScenarioResult(state: PortfolioScenario) {
  const hazardMap: Record<string, ScenarioHazard> = {
    "Severe monsoon flooding": "Heavy rainfall / flooding",
    "Extended extreme heat": "Extreme heat",
    "Drought and water shortage": "Drought / water shortage",
    "Combined hazard scenario": "Combined event",
  }
  const results = borrowers.map((borrower) =>
    simulateScenario(
      {
        hazard: hazardMap[state.type],
        severity: state.severity,
        durationDays: state.disruption,
        monthlyRevenue: null,
        monthlyOperatingCosts: null,
        cashBufferPercent: 25,
      },
      borrower.assessment,
    ),
  )
  const shifted = results.filter(
    (result, index) =>
      riskCategory(result.scenarioRiskScore) !== borrowers[index].category,
  ).length
  const averageDowntime =
    results.reduce((sum, result) => sum + result.downtimeDays, 0) /
    results.length
  const highAfter = results.filter(
    (result) =>
      riskCategory(result.scenarioRiskScore) === "High" ||
      riskCategory(result.scenarioRiskScore) === "Critical",
  ).length
  const averageScoreChange = Math.round(
    results.reduce(
      (sum, result, index) =>
        sum + result.scenarioRiskScore - borrowers[index].score,
      0,
    ) / results.length,
  )
  return {
    shifted,
    averageDowntime,
    highAfter,
    scoreChange: averageScoreChange,
  }
}

function ScenarioAnalysis() {
  const [scenario, setScenario] = useState<PortfolioScenario>({
    type: "Severe monsoon flooding",
    severity: 4,
    disruption: 7,
  })
  const result = portfolioScenarioResult(scenario)
  return (
    <>
      <SectionHeading
        eyebrow="Portfolio stress testing"
        title="Scenario Analysis"
        description="Explore how editable climate stress assumptions could shift this synthetic portfolio."
      />
      <DataNotice>
        Results are illustrative scenario estimates—not forecasts, expected
        credit losses, capital calculations, or lending recommendations.
      </DataNotice>
      <div className="simulator-layout">
        <section className="content-card simulator-controls">
          <div className="card-heading">
            <div>
              <strong>Stress assumptions</strong>
              <span>Edit to recalculate instantly</span>
            </div>
          </div>
          <label>
            Portfolio scenario
            <select
              value={scenario.type}
              onChange={(event) =>
                setScenario({ ...scenario, type: event.target.value })
              }
            >
              <option>Severe monsoon flooding</option>
              <option>Extended extreme heat</option>
              <option>Drought and water shortage</option>
              <option>Combined hazard scenario</option>
            </select>
          </label>
          <label>
            <span>
              Scenario severity <b>{scenario.severity} / 5</b>
            </span>
            <input
              type="range"
              min="1"
              max="5"
              value={scenario.severity}
              onChange={(event) =>
                setScenario({
                  ...scenario,
                  severity: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Average disruption duration
            <input
              type="number"
              min="1"
              max="45"
              value={scenario.disruption}
              onChange={(event) =>
                setScenario({
                  ...scenario,
                  disruption: Number(event.target.value),
                })
              }
            />
            <small>Illustrative days for exposed borrowers</small>
          </label>
        </section>
        <section className="simulator-results">
          <div className="scenario-banner">
            <span>Illustrative portfolio stress</span>
            <strong>{scenario.type}</strong>
            <small>
              Severity {scenario.severity} · {scenario.disruption} days
            </small>
          </div>
          <div className="metric-grid metric-grid--two">
            <PortfolioMetric
              label="Borrowers shifting risk band"
              value={`${result.shifted} / 8`}
              detail="Simple threshold movement"
              tone="red"
            />
            <PortfolioMetric
              label="Average estimated downtime"
              value={`${result.averageDowntime.toFixed(1)} days`}
              detail="Shared scenario engine output"
              tone="amber"
            />
            <PortfolioMetric
              label="High / critical after stress"
              value={`${result.highAfter} / ${borrowers.length}`}
              detail="Scenario-only risk categories"
              tone="blue"
            />
            <PortfolioMetric
              label="Average score movement"
              value={`+${result.scoreChange}`}
              detail="Scenario-only points"
              tone="navy"
            />
          </div>
          <div className="scenario-distribution">
            <strong>Post-scenario illustrative distribution</strong>
            <div>
              <span
                className="segment segment--critical"
                style={
                  {
                    "--segment": `${25 + result.shifted * 5}%`,
                  } as React.CSSProperties
                }
              />
              <span
                className="segment segment--high"
                style={{ "--segment": `${38}%` } as React.CSSProperties}
              />
              <span className="segment segment--moderate" />
              <span className="segment segment--low" />
            </div>
            <small>Critical · High · Moderate · Low</small>
          </div>
        </section>
      </div>
      <section className="content-card formula-card">
        <div className="card-heading">
          <div>
            <strong>Calculation transparency</strong>
            <span>Demonstration formula</span>
          </div>
        </div>
        <code>
          each borrower scenario = shared baseline risk + bounded hazard stress
          uplift
        </code>
        <code>
          risk-band shift = scenario category − current shared-engine category
        </code>
        <p>
          Borrower revenue, operating costs, and cash buffers are unavailable,
          so portfolio repayment and loss estimates are not calculated. This
          model excludes probability of default, loss given default, loan terms,
          collateral, insurance, and borrower cash flows.
        </p>
      </section>
    </>
  )
}

function EarlyWarnings() {
  const initial = borrowers
    .filter((borrower) => borrower.alert)
    .map((borrower) => borrower.id)
  const [active, setActive] = useState(initial)
  return (
    <>
      <SectionHeading
        eyebrow="Sample monitoring"
        title="Early Warning Alerts"
        description="Review and acknowledge synthetic alerts associated with demonstration borrower profiles."
      />
      <DataNotice>
        Alerts are not connected to IMD, a weather provider, a flood-warning
        system, or borrower operations.
      </DataNotice>
      <section className="alert-board">
        {borrowers
          .filter((borrower) => borrower.alert)
          .map((borrower) => {
            const open = active.includes(borrower.id)
            return (
              <article
                className={open ? "lender-alert is-open" : "lender-alert"}
                key={borrower.id}
              >
                <div className="lender-alert__icon">
                  <DashboardGlyph name="alerts" />
                </div>
                <div>
                  <span>{open ? "Active sample alert" : "Acknowledged"}</span>
                  <h2>
                    {borrower.hazard} · {borrower.name}
                  </h2>
                  <p>
                    {borrower.location} · Illustrative operating disruption may
                    require borrower outreach.
                  </p>
                  <small>Sample record · {borrower.updated}</small>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActive((current) =>
                      open
                        ? current.filter((id) => id !== borrower.id)
                        : [...current, borrower.id],
                    )
                  }
                >
                  {open ? "Acknowledge" : "Reopen"}
                </button>
              </article>
            )
          })}
      </section>
    </>
  )
}

function LendingInsights() {
  const insights = [
    {
      title: "Prioritize resilience conversations",
      detail:
        "Five synthetic borrowers are in high or critical risk bands; four also have active sample alerts.",
      label: "Portfolio action",
    },
    {
      title: "Request continuity evidence",
      detail:
        "Borrowers with no plan or planning-only status may benefit from documenting practical continuity controls.",
      label: "Due diligence",
    },
    {
      title: "Explore adaptation-purpose finance",
      detail:
        "Backup power, flood protection, and water efficiency are candidate uses of funds, subject to normal appraisal.",
      label: "Opportunity",
    },
    {
      title: "Avoid automated adverse decisions",
      detail:
        "Illustrative climate scores should supplement—not replace—verified borrower data, judgment, and fair-lending controls.",
      label: "Governance",
    },
  ]
  return (
    <>
      <SectionHeading
        eyebrow="Decision support"
        title="Lending Insights"
        description="Portfolio-level prompts for review—not automated credit decisions or verified borrower recommendations."
      />
      <DataNotice>
        Insights use synthetic records and must not be used to approve, price,
        decline, or alter real credit.
      </DataNotice>
      <section className="insight-grid">
        {insights.map((insight, index) => (
          <article key={insight.title}>
            <span>0{index + 1}</span>
            <small>{insight.label}</small>
            <h2>{insight.title}</h2>
            <p>{insight.detail}</p>
            <button
              type="button"
              onClick={() =>
                window.alert(
                  "Demo workflow only: connect a governed lender workflow before assigning this action.",
                )
              }
            >
              Review workflow
            </button>
          </article>
        ))}
      </section>
      <section className="content-card governance-card">
        <div className="card-heading">
          <div>
            <strong>Responsible use guardrails</strong>
            <span>Required before production deployment</span>
          </div>
        </div>
        <div>
          <p>
            <span>✓</span> Validate climate data provenance and model
            performance.
          </p>
          <p>
            <span>✓</span> Keep climate indicators separate from protected
            attributes.
          </p>
          <p>
            <span>✓</span> Provide human review and borrower correction
            pathways.
          </p>
          <p>
            <span>✓</span> Monitor for geographic and sector bias.
          </p>
        </div>
      </section>
    </>
  )
}

interface LenderReportsLoadingState {
  status: "loading"
}

interface LenderReportsReadyState {
  status: "ready"
  items: AuthorizedAssessment[]
}

interface LenderReportsErrorState {
  status: "error"
  message: string
}

interface LenderReportsDemoState {
  status: "demo"
}

type LenderReportsState = LenderReportsLoadingState | LenderReportsReadyState | LenderReportsErrorState | LenderReportsDemoState

function LenderReports() {
  const [state, setState] = useState<LenderReportsState>({
    status: "loading",
  })
  const [exportError, setExportError] = useState("")

  useEffect(() => {
    if (sessionStorage.getItem("climateshield_demo_role") === "lender") {
      setState({ status: "demo" })
      return
    }
    let active = true
    void apiRequest<{ items: AuthorizedAssessment[] }>("/lender/portfolio")
      .then(({ items }) => {
        if (active) setState({ status: "ready", items })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The authorized report could not be loaded.",
        })
      })
    return () => {
      active = false
    }
  }, [])

  const items = state.status === "ready" ? state.items : []
  const highRisk = items.filter(
    (item) =>
      item.result.category === "High" || item.result.category === "Critical",
  ).length
  const averageScore = items.filter((item) => item.result.score !== null)
  const meanScore = averageScore.length
    ? Math.round(
        averageScore.reduce((sum, item) => sum + (item.result.score ?? 0), 0) /
          averageScore.length,
      )
    : null
  const categories = ["Critical", "High", "Moderate", "Low", "Unavailable"]
    .map((category) => ({
      category,
      count: items.filter(
        (item) => (item.result.category ?? "Unavailable") === category,
      ).length,
    }))
    .filter((item) => item.count > 0)

  async function exportReport() {
    setExportError("")
    try {
      await downloadCsv(
        "/lender/export.csv",
        "climateshield-authorized-lender-assessments.csv",
      )
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? error.message
          : "The authorized report export failed.",
      )
    }
  }

  return (
    <>
      <SectionHeading
        eyebrow="Authorized portfolio reporting"
        title="Climate Risk Assessment Summary"
        description="Report on assessments explicitly linked to this lender account. No loan, repayment, or financial information is included."
        action={
          <>
            <button
              className="print-button"
              type="button"
              onClick={() => void exportReport()}
              disabled={state.status !== "ready" || items.length === 0}
            >
              Download authorized CSV
            </button>
            <button
              className="print-button"
              type="button"
              onClick={() => window.print()}
              disabled={state.status !== "ready"}
            >
              <DashboardGlyph name="reports" /> Print report
            </button>
          </>
        }
      />
      <DataNotice label="AUTHORIZED DATA">
        Risk scores are prototype decision-support indicators, not a credit
        rating or lending recommendation. This summary uses only explicitly
        authorized records and omits business assets, contact details, and
        financial information.
      </DataNotice>
      {exportError && <p role="alert">{exportError}</p>}
      {state.status === "loading" && (
        <section className="content-card" role="status">
          Loading authorized assessments…
        </section>
      )}
      {state.status === "error" && (
        <section className="content-card" role="alert">
          Authorized report unavailable: {state.message}
        </section>
      )}
      {state.status === "demo" && (
        <section className="content-card">
          Demo mode does not access or report authorized borrower records. Sign
          in with an approved lender account to generate a scoped report.
        </section>
      )}
      {state.status === "ready" && items.length === 0 && (
        <section className="content-card">
          No assessments are currently linked to this lender. An administrator
          must explicitly authorize borrower access before a report is
          available.
        </section>
      )}
      {state.status === "ready" && items.length > 0 && (
        <article className="report-sheet">
          <header>
            <div>
              <strong>ClimateShield MSME</strong>
              <span>Authorized borrower assessment summary</span>
            </div>
            <span className="status-badge">Authorized records only</span>
          </header>
          <section>
            <h2>Portfolio summary</h2>
            <dl className="report-grid">
              <div>
                <dt>Authorized assessments</dt>
                <dd>{items.length}</dd>
              </div>
              <div>
                <dt>High / critical</dt>
                <dd>{highRisk} assessments</dd>
              </div>
              <div>
                <dt>Mean available risk score</dt>
                <dd>
                  {meanScore === null ? "Unavailable" : `${meanScore} / 100`}
                </dd>
              </div>
              <div>
                <dt>Mean reported completeness</dt>
                <dd>
                  {Math.round(
                    items.reduce(
                      (sum, item) => sum + item.result.completeness,
                      0,
                    ) / items.length,
                  )}
                  %
                </dd>
              </div>
            </dl>
          </section>
          <section>
            <h2>Risk distribution</h2>
            <div className="analyst-distribution">
              {categories.map(({ category, count }) => (
                <div key={category}>
                  <span>
                    <RiskBadge category={category} />
                  </span>
                  <strong>{count}</strong>
                  <small>assessments</small>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2>Assessment records</h2>
            <div className="table-scroll">
              <table className="borrower-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Industry</th>
                    <th>Region</th>
                    <th>Risk</th>
                    <th>Completeness</th>
                    <th>Assessed</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.business.name || "Business name unavailable"}
                      </td>
                      <td>{item.business.industry || "Not provided"}</td>
                      <td>
                        {[item.business.city, item.business.state]
                          .filter(Boolean)
                          .join(", ") || "Not provided"}
                      </td>
                      <td>
                        {item.result.category ??
                          (item.result.score === null
                            ? "Insufficient data"
                            : `Score ${item.result.score}`)}
                      </td>
                      <td>{item.result.completeness}%</td>
                      <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="report-limitations">
            <h2>Data quality and limitations</h2>
            <p>
              These records are saved prototype assessments. Data sources and
              completeness reflect information present at assessment time; the
              report does not include repayment or expected-credit-loss data.
            </p>
          </section>
          <footer>
            Generated from records authorized for this lender account.
          </footer>
        </article>
      )}
    </>
  )
}

function LenderSettings() {
  const [settings, setSettings] = useState({
    alerts: true,
    weekly: false,
    review: true,
  })
  return (
    <>
      <SectionHeading
        eyebrow="Institution preferences"
        title="Settings"
        description="Configure local demo preferences and review missing production integrations."
      />
      <section className="content-card settings-list">
        {[
          [
            "alerts",
            "Portfolio alert badges",
            "Show synthetic alert status in portfolio views",
          ],
          [
            "weekly",
            "Weekly summary",
            "Requires a future notification backend",
          ],
          [
            "review",
            "Human review reminder",
            "Show responsible-use prompts in insights",
          ],
        ].map(([key, title, detail]) => (
          <div key={key}>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <button
              className={
                settings[(key as keyof typeof settings)]
                  ? "toggle is-on"
                  : "toggle"
              }
              type="button"
              aria-pressed={settings[(key as keyof typeof settings)]}
              onClick={() =>
                setSettings({
                  ...settings,
                  [key]: !settings[(key as keyof typeof settings)],
                })
              }
            >
              <span />
            </button>
          </div>
        ))}
      </section>
      <section className="content-card integration-status">
        <div className="card-heading">
          <div>
            <strong>Production readiness</strong>
            <span>Services and controls still required</span>
          </div>
        </div>
        <dl className="data-list">
          <div>
            <dt>Institution authentication</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Borrower authorization</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Climate and map APIs</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Model governance</dt>
            <dd>Not implemented</dd>
          </div>
          <div>
            <dt>Audit logging</dt>
            <dd>Not implemented</dd>
          </div>
        </dl>
      </section>
    </>
  )
}

export default function LenderDashboard() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const borrowerMatch = location.pathname.match(/^\/lender\/borrowers\/(\d+)$/)
  const selectedBorrowerId = borrowerMatch ? Number(borrowerMatch[1]) : null
  const pathView = borrowerMatch
    ? "borrowers"
    : Object.entries(lenderViewPaths).find(
        ([, path]) => path === location.pathname,
      )?.[0]
  const requestedView = pathView ?? searchParams.get("view") ?? "portfolio"
  const activeView = navigation.some((item) => item.id === requestedView)
    ? requestedView
    : "portfolio"
  function navigate(view: string) {
    const path = lenderViewPaths[view]
    if (path) {
      routerNavigate(path)
    } else {
      setSearchParams(view === "portfolio" ? {} : { view })
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const content = (() => {
    switch (activeView) {
      case "borrowers":
        return (
          <BorrowerRisk
            selectedBorrowerId={selectedBorrowerId}
            onSelectBorrower={(borrower) =>
              routerNavigate(`/lender/borrowers/${borrower.id}`)
            }
            onBack={() => routerNavigate("/lender/borrowers")}
          />
        )
      case "exposure":
        return <ClimateExposure />
      case "scenario":
        return <ScenarioAnalysis />
      case "alerts":
        return <EarlyWarnings />
      case "insights":
        return <LendingInsights />
      case "reports":
        return <LenderReports />
      case "settings":
        return <LenderSettings />
      default:
        return <PortfolioOverview onNavigate={navigate} />
    }
  })()
  return (
    <DashboardLayout
      productLabel="Lender"
      contextTitle="Lender Workspace"
      contextSubtitle="Authorized assessments · Synthetic tools labeled"
      navigation={navigation}
      activeView={activeView}
      onNavigate={navigate}
    >
      {content}
    </DashboardLayout>
  )
}
