import { FormEvent, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router"
import ClimateIntelligence from "./ClimateIntelligence"
import ClimateToCreditEngine from "./ClimateToCreditEngine"
import GeoMap from "./GeoMap"
import DashboardLayout, {
  DashboardGlyph,
  DataNotice,
  formatCurrency,
  type NavigationItem,
  RiskBadge,
  SectionHeading,
} from "./DashboardLayout"
import { recommendations } from "./data"
import { ApiError, apiRequest } from "../services/api"
import type {
  ClimateBundle,
  GeocodedLocation,
} from "../services/climateService"
import type { HazardIndicator } from "../services/hazardService"
import {
  DEFAULT_HAZARDS,
  DEFAULT_VULNERABILITY,
  riskCategory,
  scoreRisk,
  type HazardScores,
  type RiskAssessment,
} from "../services/riskScoringService"
import {
  simulateScenario,
  type ScenarioHazard,
} from "../services/scenarioService"

type ProgressStatus = "Planned" | "In progress" | "Completed"

interface BusinessProfile {
  name: string
  industry: string
  location: string
  city: string
  state: string
  latitude: string
  longitude: string
  size: string
  employees: string
  monthlyRevenue: string
  monthlyOperatingCosts: string
  interruptionToleranceDays: string
  powerDependence: string
  waterDependence: string
  assets: string
  suppliers: string
  measures: string
}

const defaultProfile: BusinessProfile = {
  name: "Aarav Textiles",
  industry: "Textile manufacturing",
  location: "Surat, Gujarat",
  city: "Surat",
  state: "Gujarat",
  latitude: "21.1702",
  longitude: "72.8311",
  size: "Small enterprise",
  employees: "34",
  monthlyRevenue: "850000",
  monthlyOperatingCosts: "560000",
  interruptionToleranceDays: "3",
  powerDependence: "80",
  waterDependence: "60",
  assets: "Dyeing equipment, looms, finished fabric inventory",
  suppliers: "Two regional yarn suppliers; road-based delivery",
  measures: "Raised stock racks and basic equipment insurance",
}

const emptyAccountProfile: BusinessProfile = {
  name: "",
  industry: "",
  location: "",
  city: "",
  state: "",
  latitude: "",
  longitude: "",
  size: "",
  employees: "",
  monthlyRevenue: "",
  monthlyOperatingCosts: "",
  interruptionToleranceDays: "",
  powerDependence: "",
  waterDependence: "",
  assets: "",
  suppliers: "",
  measures: "",
}

const navigation: NavigationItem[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "risk", label: "Climate Risk", icon: "risk" },
  { id: "simulator", label: "Risk Simulator", icon: "simulator" },
  {
    id: "engine",
    label: "Climate-to-Credit Engine",
    icon: "insights",
  },
  {
    id: "recommendations",
    label: "Recommendations",
    icon: "recommendations",
  },
  { id: "progress", label: "Resilience Progress", icon: "progress" },
  { id: "reports", label: "Reports", icon: "reports" },
  { id: "profile", label: "Business Profile", icon: "profile" },
  { id: "settings", label: "Settings", icon: "settings" },
]

const businessViewPaths: Record<string, string> = {
  overview: "/business/dashboard",
  risk: "/business/climate-risk",
  simulator: "/business/simulator",
  engine: "/business/climate-to-credit",
  recommendations: "/business/recommendations",
  progress: "/business/progress",
  reports: "/business/reports",
  profile: "/business/profile",
  settings: "/business/settings",
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) as T : fallback
  } catch {
    return fallback
  }
}

function profileForLocalStorage(profile: BusinessProfile) {
  const {
    monthlyRevenue: _monthlyRevenue,
    monthlyOperatingCosts: _monthlyOperatingCosts,
    ...nonFinancialProfile
  } = profile
  return nonFinancialProfile
}

function scenarioForLocalStorage(scenario: ScenarioState) {
  return {
    hazard: scenario.hazard,
    severity: scenario.severity,
    duration: scenario.duration,
    cashBuffer: scenario.cashBuffer,
  }
}

function financialAmount(value: string): number | null {
  if (!value.trim()) return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function hasInvalidFinancialInput(profile: BusinessProfile): boolean {
  return [profile.monthlyRevenue, profile.monthlyOperatingCosts].some(
    (value) => {
      if (!value.trim()) return false
      const amount = Number(value)
      return !Number.isFinite(amount) || amount < 0
    },
  )
}

function profileRiskAssessment(
  profile: BusinessProfile,
  hazards: HazardScores,
  sourceLabel: string,
) {
  const interruptionDays = Number(profile.interruptionToleranceDays)
  const supplyText = profile.suppliers.toLowerCase()
  const assetText = profile.assets.toLowerCase()
  const measureText = profile.measures.toLowerCase()
  const documentedMeasures = [
    "raised",
    "barrier",
    "backup",
    "insurance",
    "storage",
    "plan",
    "cooling",
  ].filter((keyword) => measureText.includes(keyword)).length
  const resilience = Math.min(75, 14 + documentedMeasures * 8)
  return scoreRisk({
    hazards,
    vulnerability: {
      ...DEFAULT_VULNERABILITY,
      industrySensitivity: profile.industry ? 78 : null,
      assetSensitivity: profile.assets
        ? assetText.includes("equipment") || assetText.includes("inventory")
          ? 82
          : 65
        : null,
      powerDependence: profile.powerDependence
        ? Number(profile.powerDependence)
        : null,
      waterDependence: profile.waterDependence
        ? Number(profile.waterDependence)
        : null,
      supplyChainDependence: profile.suppliers
        ? supplyText.includes("two") || supplyText.includes("single")
          ? 80
          : 60
        : null,
      interruptionSensitivity: Number.isFinite(interruptionDays)
        ? Math.max(25, Math.min(95, 95 - interruptionDays * 8))
        : null,
    },
    financials: {
      monthlyRevenue: financialAmount(profile.monthlyRevenue),
      monthlyOperatingCosts: financialAmount(profile.monthlyOperatingCosts),
    },
    resilience,
    sourceLabel,
    location: {
      latitude: profile.latitude ? Number(profile.latitude) : null,
      longitude: profile.longitude ? Number(profile.longitude) : null,
      state: profile.state || null,
      city: profile.city || null,
    },
  })
}

function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  illustrative = true,
}: {
  label: string
  value: string
  detail: string
  tone?: string
  illustrative?: boolean
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__label">
        <span>{label}</span>
        {illustrative && <small>Illustrative</small>}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function TrendChart({ score }: { score: number }) {
  const points = [42, 46, 44, 51, 57, 54, 62, 65, 61, 68, 70, score]
  const plot = points
    .map((value, index) => `${22 + index * 48},${150 - value * 1.45}`)
    .join(" ")
  return (
    <div className="chart-card">
      <div className="card-heading">
        <div>
          <strong>Historical risk trend</strong>
          <span>Illustrative monthly model output</span>
        </div>
        <RiskBadge category="High" />
      </div>
      <svg
        className="line-chart"
        viewBox="0 0 570 180"
        role="img"
        aria-label={`Illustrative climate risk trend ending at ${score}`}
      >
        <defs>
          <linearGradient id="businessArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#12a870" stopOpacity=".32" />
            <stop offset="1" stopColor="#12a870" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[35, 75, 115, 155].map((y) => (
          <line x1="20" x2="555" y1={y} y2={y} key={y} />
        ))}
        <polygon
          points={`22,165 ${plot} 550,165`}
          fill="url(#businessArea)"
          stroke="none"
        />
        <polyline points={plot} />
        <circle cx="550" cy={150 - score * 1.45} r="5" />
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
    </div>
  )
}

function RiskGauge({ score }: { score: number }) {
  return (
    <div
      className="risk-gauge"
      style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
    >
      <div>
        <strong>{score}</strong>
        <span>/ 100</span>
        <small>Model estimate</small>
      </div>
    </div>
  )
}

function Overview({
  onNavigate,
  profile,
  assessment,
  scenarioResult,
  climateBundle,
}: {
  onNavigate: (view: string) => void
  profile: BusinessProfile
  assessment: RiskAssessment
  scenarioResult: ReturnType<typeof simulateScenario>
  climateBundle: ClimateBundle | null
}) {
  const hazards = [
    {
      name: "Flood",
      level: "High",
      value:
        assessment.contributions.find((item) =>
          item.factor.includes("rainfall"),
        )?.value ?? 78,
      note: "Monsoon drainage and ground-floor assets",
    },
    {
      name: "Extreme heat",
      level: "Moderate",
      value:
        assessment.contributions.find((item) => item.factor === "Extreme heat")
          ?.value ?? 61,
      note: "Equipment and worker heat exposure",
    },
    {
      name: "Heavy rainfall",
      level: "High",
      value:
        assessment.contributions.find((item) =>
          item.factor.includes("rainfall"),
        )?.value ?? 74,
      note: "Access roads and supplier deliveries",
    },
    {
      name: "Drought",
      level: "Low",
      value:
        assessment.contributions.find(
          (item) => item.factor === "Water shortage",
        )?.value ?? 32,
      note: "Process-water dependence is limited",
    },
  ]
  return (
    <>
      <SectionHeading
        eyebrow="Business overview"
        title="Overview"
        description="Your climate risk snapshot and key insights."
      />
      <DataNotice>
        The risk score is a model estimate. Weather inputs are{" "}
        {climateBundle
          ? "from the latest Open-Meteo retrieval"
          : "synthetic defaults until Open-Meteo is retrieved"}
        . When provided, monthly revenue and operating costs also inform
        business vulnerability; event-level financial impacts remain scenario
        estimates.
      </DataNotice>
      <section className="overview-hero-card">
        <div className="overview-risk">
          <RiskGauge score={assessment.score} />
          <div>
            <span>Climate Risk Score</span>
            <h2>{assessment.category} climate risk</h2>
            <p>
              Hazard exposure {assessment.hazardExposure}/100 and business
              vulnerability {assessment.vulnerability}/100 drive this score.
              Climate vulnerability is {assessment.climateVulnerability}/100
              {assessment.financialRisk === null
                ? "; financial inputs are not included."
                : ` and the operating cost ratio is ${assessment.financialRisk}/100.`}
            </p>
            <button type="button" onClick={() => onNavigate("risk")}>
              Review risk drivers
            </button>
          </div>
        </div>
        <div className="overview-update">
          <span className="live-dot" />
          <div>
            <strong>
              {climateBundle
                ? "Climate data retrieved"
                : "Demo assumptions active"}
            </strong>
            <small>
              {climateBundle
                ? new Date(climateBundle.retrievedAt).toLocaleString("en-IN")
                : "Open Climate Risk to retrieve data"}
            </small>
          </div>
        </div>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="Estimated disruption"
          value={`${scenarioResult.downtimeDays.toFixed(1)} days`}
          detail="Current editable scenario estimate"
          tone="amber"
        />
        <MetricCard
          label="Revenue at risk"
          value={
            scenarioResult.lostRevenue === null
              ? "Unavailable"
              : formatCurrency(scenarioResult.lostRevenue)
          }
          detail="Estimated gross revenue loss, not profit"
          tone="red"
        />
        <MetricCard
          label="Resilience score"
          value={`${assessment.resilience} / 100`}
          detail="Documented mitigation input"
          tone="green"
        />
        <MetricCard
          label="Data confidence"
          value={assessment.confidence}
          detail={`${assessment.completeness}% model-input completeness`}
          tone="blue"
        />
      </section>
      <section className="overview-map-weather">
        <article className="content-card overview-map-card">
          <div className="card-heading">
            <div>
              <strong>Climate Risk at Your Location</strong>
              <span>{profile.location} · Geographic context</span>
            </div>
            <button type="button" onClick={() => onNavigate("risk")}>
              View Detailed Map
            </button>
          </div>
          <GeoMap
            points={[
              {
                id: "business-overview",
                latitude: Number(profile.latitude),
                longitude: Number(profile.longitude),
                label: profile.name,
                detail: profile.location,
                category: assessment.category,
              },
            ]}
            center={[Number(profile.latitude), Number(profile.longitude)]}
            zoom={10}
            className="overview-location-map"
          />
        </article>
        <article className="content-card current-weather-card">
          <div className="card-heading">
            <div>
              <strong>Current Weather</strong>
              <span>
                {climateBundle
                  ? "LIVE DATA · Open-Meteo"
                  : "Weather retrieval available on Climate Risk"}
              </span>
            </div>
          </div>
          {climateBundle?.current ? (
            <>
              <div className="current-weather-value">
                <span>Now</span>
                <strong>
                  {climateBundle.current.temperature ?? "—"}
                  <small>{climateBundle.current.units.temperature}</small>
                </strong>
                <p>{profile.location}</p>
              </div>
              <dl className="current-weather-metrics">
                <div>
                  <dt>Precipitation</dt>
                  <dd>
                    {climateBundle.current.precipitation ?? "—"}{" "}
                    {climateBundle.current.units.precipitation}
                  </dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>
                    {climateBundle.current.windSpeed ?? "—"}{" "}
                    {climateBundle.current.units.windSpeed}
                  </dd>
                </div>
                <div>
                  <dt>Forecast</dt>
                  <dd>
                    {climateBundle.forecast?.daily.length ?? 0} days available
                  </dd>
                </div>
              </dl>
              <div className="weather-mini-forecast">
                {climateBundle.forecast?.daily.slice(0, 4).map((day) => (
                  <span key={day.date}>
                    <time>{day.date.slice(5)}</time>
                    <b>{day.temperatureMax?.toFixed(0) ?? "—"}°</b>
                    <small>{day.precipitation?.toFixed(0) ?? "—"} mm</small>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="weather-empty-state">
              <strong>Weather not retrieved in this session</strong>
              <p>
                Open Climate Risk to retrieve current conditions and the
                seven-day forecast for this validated location.
              </p>
              <button type="button" onClick={() => onNavigate("risk")}>
                Retrieve weather data
              </button>
            </div>
          )}
        </article>
      </section>
      <section className="dashboard-two-column">
        <TrendChart score={assessment.score} />
        <div className="chart-card">
          <div className="card-heading">
            <div>
              <strong>Sample weather alerts</strong>
              <span>Not sourced from a live alert service</span>
            </div>
            <span className="count-badge">2</span>
          </div>
          <div className="alert-list">
            <div className="alert-item alert-item--urgent">
              <span>High</span>
              <div>
                <strong>Heavy rainfall watch</strong>
                <p>Illustrative watch · next 48 hours</p>
              </div>
            </div>
            <div className="alert-item">
              <span>Med</span>
              <div>
                <strong>Heat stress advisory</strong>
                <p>Illustrative operational reminder</p>
              </div>
            </div>
          </div>
          <button
            className="text-action"
            type="button"
            onClick={() => onNavigate("risk")}
          >
            Open climate risk view →
          </button>
        </div>
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Hazards affecting this business</strong>
            <span>
              Illustrative hazard indicators, not measured site losses
            </span>
          </div>
        </div>
        <div className="hazard-grid">
          {hazards.map((hazard) => (
            <article className="hazard-card" key={hazard.name}>
              <div>
                <span
                  className={`hazard-dot hazard-dot--${riskCategory(hazard.value).toLowerCase()}`}
                />
                <strong>{hazard.name}</strong>
                <RiskBadge category={riskCategory(hazard.value)} />
              </div>
              <div className="progress-track">
                <span
                  style={
                    { "--progress": `${hazard.value}%` } as React.CSSProperties
                  }
                />
              </div>
              <p>{hazard.note}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Recommended next actions</strong>
            <span>Prioritized from the current sample profile</span>
          </div>
          <button type="button" onClick={() => onNavigate("recommendations")}>
            View all
          </button>
        </div>
        <div className="action-list">
          {recommendations.slice(0, 3).map((item, index) => (
            <div className="action-row" key={item.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.problem}</small>
              </div>
              <RiskBadge category={item.priority} />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function ClimateRisk() {
  return (
    <>
      <SectionHeading
        eyebrow="Climate intelligence"
        title="Climate Risk"
        description="Understand the distinction between business profile inputs, potential hazard exposure, and illustrative model estimates."
      />
      <DataNotice>
        No map provider or climate API is configured. Geographic analysis and
        forecast layers below are integration states, not live analysis.
      </DataNotice>
      <section className="map-card">
        <div className="map-placeholder">
          <div className="map-grid" />
          <div className="map-pin">
            <span />
            <strong>Aarav Textiles</strong>
            <small>Surat, Gujarat · Profile location</small>
          </div>
          <div className="map-integration">
            <DashboardGlyph name="risk" size={28} />
            <strong>Map integration ready</strong>
            <span>
              Connect a geospatial provider to display verified hazard layers.
            </span>
            <code>21.1702° N, 72.8311° E</code>
          </div>
        </div>
        <aside className="map-legend">
          <strong>Layer status</strong>
          <div>
            <span className="legend-marker legend-marker--profile" />
            <p>
              <b>Business location</b>
              <small>User-entered profile data</small>
            </p>
          </div>
          <div>
            <span className="legend-marker legend-marker--measured" />
            <p>
              <b>Measured observations</b>
              <small>Not connected</small>
            </p>
          </div>
          <div>
            <span className="legend-marker legend-marker--forecast" />
            <p>
              <b>Forecast layers</b>
              <small>Not connected</small>
            </p>
          </div>
          <div>
            <span className="legend-marker legend-marker--estimate" />
            <p>
              <b>Illustrative estimates</b>
              <small>Available below</small>
            </p>
          </div>
        </aside>
      </section>
      <section className="dashboard-two-column">
        <div className="content-card">
          <div className="card-heading">
            <div>
              <strong>Illustrative risk drivers</strong>
              <span>Profile-based assumptions</span>
            </div>
          </div>
          <div className="driver-list">
            <div>
              <span>01</span>
              <p>
                <strong>Asset placement</strong>
                <small>
                  Critical equipment and stock are assumed to be near ground
                  level.
                </small>
              </p>
              <RiskBadge category="High" />
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Delivery dependency</strong>
                <small>
                  Road-based suppliers may be disrupted during intense rainfall.
                </small>
              </p>
              <RiskBadge category="High" />
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Current controls</strong>
                <small>
                  Raised racks offer partial protection; flood barriers are not
                  documented.
                </small>
              </p>
              <RiskBadge category="Moderate" />
            </div>
          </div>
        </div>
        <div className="content-card">
          <div className="card-heading">
            <div>
              <strong>Data provenance</strong>
              <span>What this demonstration currently uses</span>
            </div>
          </div>
          <dl className="data-list">
            <div>
              <dt>Business profile</dt>
              <dd>User-editable demo record</dd>
            </div>
            <div>
              <dt>Historical observations</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>Weather forecasts</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>Risk score</dt>
              <dd>Illustrative profile assumptions</dd>
            </div>
            <div>
              <dt>Last sample update</dt>
              <dd>18 Mar 2026 · 09:30 IST</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  )
}

interface ScenarioState {
  hazard: string
  severity: number
  duration: number
  revenue: number
  operatingCosts: number
  cashBuffer: number
}

function calculateScenario(
  scenario: ScenarioState,
  assessment: RiskAssessment,
) {
  const result = simulateScenario(
    {
      hazard: scenario.hazard as ScenarioHazard,
      severity: scenario.severity,
      durationDays: scenario.duration,
      monthlyRevenue: scenario.revenue || null,
      monthlyOperatingCosts: scenario.operatingCosts || null,
      cashBufferPercent: scenario.cashBuffer,
    },
    assessment,
  )
  return {
    downtime: result.downtimeDays,
    revenueLoss: result.lostRevenue,
    additionalExpense: result.additionalOperatingExpense,
    cashPressure: result.cashFlowPressure,
    repayment: result.repaymentStress,
    projectedScore: assessment.score,
  }
}

function RiskSimulator({
  scenario,
  setScenario,
  assessment,
}: {
  scenario: ScenarioState
  setScenario: (value: ScenarioState) => void
  assessment: RiskAssessment
}) {
  const result = calculateScenario(scenario, assessment)
  return (
    <>
      <SectionHeading
        eyebrow="What-if analysis"
        title="Climate Event Simulator"
        description="Adjust transparent assumptions to explore potential operational and financial effects. Results are estimates, not predictions."
      />
      <DataNotice>
        Outputs are illustrative and do not use a forecast, verified loss model,
        or lender underwriting rules.
      </DataNotice>
      <div className="simulator-layout">
        <section className="content-card simulator-controls">
          <div className="card-heading">
            <div>
              <strong>Scenario assumptions</strong>
              <span>All inputs are editable</span>
            </div>
          </div>
          <label>
            Climate scenario
            <select
              value={scenario.hazard}
              onChange={(event) =>
                setScenario({ ...scenario, hazard: event.target.value })
              }
            >
              <option>Heavy rainfall / flooding</option>
              <option>Extreme heat</option>
              <option>Drought / water shortage</option>
              <option>Temporary power disruption</option>
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
            <small>1 = limited disruption · 5 = severe disruption</small>
          </label>
          <label>
            Disruption duration
            <input
              type="number"
              min="1"
              max="30"
              value={scenario.duration}
              onChange={(event) =>
                setScenario({
                  ...scenario,
                  duration: Number(event.target.value),
                })
              }
            />
            <small>Calendar days under scenario conditions</small>
          </label>
          <label>
            Approx. monthly revenue
            <input
              type="number"
              min="0"
              step="10000"
              value={scenario.revenue}
              onChange={(event) =>
                setScenario({
                  ...scenario,
                  revenue: Number(event.target.value),
                })
              }
            />
            <small>Used only for this local demo calculation</small>
          </label>
          <label>
            Approx. monthly operating costs
            <input
              type="number"
              min="0"
              step="10000"
              value={scenario.operatingCosts}
              onChange={(event) =>
                setScenario({
                  ...scenario,
                  operatingCosts: Number(event.target.value),
                })
              }
            />
            <small>Required for additional operating-expense estimate</small>
          </label>
        </section>
        <section className="simulator-results">
          <div className="scenario-banner">
            <span>Illustrative scenario estimate</span>
            <strong>{scenario.hazard}</strong>
            <small>
              Severity {scenario.severity} · {scenario.duration} days
            </small>
          </div>
          <div className="metric-grid metric-grid--two">
            <MetricCard
              label="Operational downtime"
              value={`${result.downtime.toFixed(1)} days`}
              detail="Duration × hazard sensitivity"
              tone="amber"
            />
            <MetricCard
              label="Estimated revenue loss"
              value={
                result.revenueLoss === null
                  ? "Unavailable"
                  : formatCurrency(result.revenueLoss)
              }
              detail="Daily revenue × downtime"
              tone="red"
            />
            <MetricCard
              label="Cash-flow pressure"
              value={
                result.cashPressure === null
                  ? "Unavailable"
                  : `${result.cashPressure}%`
              }
              detail={`Loss and added costs relative to ${scenario.cashBuffer}% cash buffer`}
              tone="blue"
            />
            <MetricCard
              label="Repayment difficulty"
              value={result.repayment}
              detail="Requires scheduled repayment input in the Resilience Engine"
              tone="amber"
            />
          </div>
          <div className="projected-score">
            <div>
              <span>Overall climate risk score</span>
              <strong>
                {result.projectedScore}
                <small>/100</small>
              </strong>
            </div>
            <div className="progress-track">
              <span
                style={
                  {
                    "--progress": `${result.projectedScore}%`,
                  } as React.CSSProperties
                }
              />
            </div>
            <p>
              Matches the Overview score. Scenario inputs change the estimates
              above, not the underlying business risk score.
            </p>
          </div>
        </section>
      </div>
      <section className="content-card formula-card">
        <div className="card-heading">
          <div>
            <strong>Calculation method</strong>
            <span>Transparent demonstration logic</span>
          </div>
        </div>
        <code>
          downtime = duration × severity disruption fraction × hazard multiplier
        </code>
        <code>
          gross revenue loss = (monthly revenue ÷ 30) × estimated downtime × 85%
        </code>
        <code>
          business risk score = the shared Overview climate risk score
        </code>
        <p>
          This simplified calculation excludes insurance, seasonality, inventory
          recovery, credit terms, and actual site vulnerability.
        </p>
      </section>
    </>
  )
}

function Recommendations() {
  const [selected, setSelected] = useState<string[]>(["flood", "power"])
  const compared = recommendations.filter((item) => selected.includes(item.id))
  return (
    <>
      <SectionHeading
        eyebrow="Adaptation planning"
        title="Resilience Recommendations"
        description="Compare practical actions against editable implementation costs and illustrative avoided-loss assumptions."
      />
      <DataNotice>
        Costs and benefits are broad demonstration assumptions. Obtain vendor
        quotes and professional advice before investing.
      </DataNotice>
      <section className="recommendation-grid">
        {recommendations.map((item) => {
          const payback =
            item.avoidedLoss > 0 ? item.cost / item.avoidedLoss : 0
          const active = selected.includes(item.id)
          return (
            <article
              className={`recommendation-card ${active ? "is-compared" : ""}`}
              key={item.id}
            >
              <div className="recommendation-card__top">
                <span className="recommendation-icon">
                  <DashboardGlyph name="recommendations" />
                </span>
                <RiskBadge category={item.priority} />
              </div>
              <h2>{item.title}</h2>
              <p>{item.problem}</p>
              <dl>
                <div>
                  <dt>Estimated cost</dt>
                  <dd>{formatCurrency(item.cost)}</dd>
                </div>
                <div>
                  <dt>Illustrative avoided loss</dt>
                  <dd>{formatCurrency(item.avoidedLoss)}</dd>
                </div>
                <div>
                  <dt>Cost / avoided-loss ratio</dt>
                  <dd>{payback.toFixed(1)} event equivalents</dd>
                </div>
              </dl>
              <small>{item.benefit}</small>
              <small>
                Payback period is unavailable without a supported
                event-frequency assumption.
              </small>
              <button
                type="button"
                onClick={() =>
                  setSelected((current) =>
                    active
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id],
                  )
                }
              >
                {active ? "Remove from comparison" : "Compare action"}
              </button>
            </article>
          )
        })}
      </section>
      <section className="content-card comparison-card">
        <div className="card-heading">
          <div>
            <strong>Action comparison</strong>
            <span>{compared.length} actions selected</span>
          </div>
        </div>
        {compared.length ? (
          <div className="comparison-table">
            <div className="comparison-table__head">
              <span>Action</span>
              <span>Cost</span>
              <span>Avoided loss*</span>
              <span>Benefit / cost</span>
            </div>
            {compared.map((item) => (
              <div key={item.id}>
                <strong>{item.title}</strong>
                <span>{formatCurrency(item.cost)}</span>
                <span>{formatCurrency(item.avoidedLoss)}</span>
                <span>{(item.avoidedLoss / item.cost).toFixed(1)}×</span>
              </div>
            ))}
            <p>
              *Illustrative avoided loss under stated assumptions, not a
              guaranteed saving.
            </p>
          </div>
        ) : (
          <div className="empty-state">
            Select at least one action to compare estimated cost and benefit.
          </div>
        )}
      </section>
    </>
  )
}

function ResilienceProgress({
  progress,
  setProgress,
  assessment,
}: {
  progress: Record<string, ProgressStatus>
  setProgress: (value: Record<string, ProgressStatus>) => void
  assessment: RiskAssessment
}) {
  const completed = Object.values(progress).filter(
    (status) => status === "Completed",
  ).length
  const inProgress = Object.values(progress).filter(
    (status) => status === "In progress",
  ).length
  const notStarted = Object.values(progress).filter(
    (status) => status === "Planned",
  ).length
  const completion = Math.round((completed / recommendations.length) * 100)
  function update(id: string, status: ProgressStatus) {
    const next = { ...progress, [id]: status }
    setProgress(next)
    localStorage.setItem(
      "climateshield-business-progress",
      JSON.stringify(next),
    )
  }
  return (
    <>
      <SectionHeading
        eyebrow="Implementation tracker"
        title="Your Resilience Action Plan"
        description="Track implementation of recommended actions. Status changes do not automatically alter the climate risk score."
      />
      <DataNotice>
        Risk score remains {assessment.score} until a documented risk-model
        input or mitigation effectiveness assumption is reviewed and changed.
      </DataNotice>
      <section className="progress-summary">
        <div>
          <strong>{completion}%</strong>
          <span>Overall completion</span>
        </div>
        <div>
          <strong>{recommendations.length}</strong>
          <span>Total actions</span>
        </div>
        <div>
          <strong>{completed}</strong>
          <span>Completed</span>
        </div>
        <div>
          <strong>{inProgress}</strong>
          <span>In progress</span>
        </div>
        <div>
          <strong>{notStarted}</strong>
          <span>Not started</span>
        </div>
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Action plan</strong>
            <span>Saved locally in this browser</span>
          </div>
        </div>
        <div className="progress-actions">
          {recommendations.map((item) => (
            <div key={item.id}>
              <span
                className={
                  progress[item.id] === "Completed"
                    ? "progress-check is-complete"
                    : "progress-check"
                }
              >
                ✓
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.problem}</small>
              </div>
              <select
                aria-label={`Status for ${item.title}`}
                value={progress[item.id] ?? "Planned"}
                onChange={(event) =>
                  update(item.id, event.target.value as ProgressStatus)
                }
              >
                <option>Planned</option>
                <option>In progress</option>
                <option>Completed</option>
              </select>
            </div>
          ))}
        </div>
      </section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <strong>Progress history</strong>
            <span>User-entered demo activity</span>
          </div>
        </div>
        <div className="timeline">
          <div>
            <span />
            <p>
              <strong>Progress tracker opened</strong>
              <small>Current session · Demo mode</small>
            </p>
          </div>
          <div>
            <span />
            <p>
              <strong>Raised stock racks documented</strong>
              <small>Sample history · 12 Mar 2026</small>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

function BusinessProfile({
  profile,
  setProfile,
}: {
  profile: BusinessProfile
  setProfile: (value: BusinessProfile) => void
}) {
  const [draft, setDraft] = useState(profile)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (
      !draft.name.trim() ||
      !draft.industry.trim() ||
      !draft.location.trim()
    ) {
      setMessage("Business name, industry, and location are required.")
      return
    }
    if (hasInvalidFinancialInput(draft)) {
      setMessage(
        "Monthly revenue and operating costs must be valid non-negative amounts.",
      )
      return
    }
    const latitude = Number(draft.latitude)
    const longitude = Number(draft.longitude)
    if (
      !draft.latitude.trim() ||
      !draft.longitude.trim() ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setMessage(
        "Enter valid latitude and longitude coordinates before saving.",
      )
      return
    }
    setProfile(draft)
    localStorage.setItem(
      "climateshield-business-profile",
      JSON.stringify(profileForLocalStorage(draft)),
    )
    setSaving(true)
    try {
      await apiRequest("/business/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name.trim(),
          industry: draft.industry.trim(),
          address: draft.location.trim(),
          city: draft.city.trim(),
          state: draft.state.trim(),
          latitude,
          longitude,
          size: draft.size,
          employee_range: draft.employees,
          activities: "",
          assets: draft.assets,
          operating_hours: "",
          protective_measures: draft.measures,
        }),
      })
      setMessage(
        "Business profile saved to your authenticated account. Financial inputs remain session-only.",
      )
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 401
          ? "This demo profile was saved in this browser only. Sign in to save it to your account."
          : `Profile saved locally, but server persistence failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
      )
    } finally {
      setSaving(false)
    }
  }
  const fields: {
    key: keyof BusinessProfile
    label: string
    type?: string
    required?: boolean
    wide?: boolean
    min?: string
  }[] = [
    { key: "name", label: "Business name", required: true },
    { key: "industry", label: "Business type / industry", required: true },
    { key: "location", label: "Business location", required: true, wide: true },
    { key: "city", label: "City" },
    { key: "state", label: "State / authorized region" },
    { key: "latitude", label: "Latitude", required: true },
    { key: "longitude", label: "Longitude", required: true },
    { key: "size", label: "Business size" },
    { key: "employees", label: "Number of employees", type: "number" },
    {
      key: "monthlyRevenue",
      label: "Approx. monthly revenue (₹)",
      type: "number",
      min: "0",
    },
    {
      key: "monthlyOperatingCosts",
      label: "Approx. monthly operating costs (₹)",
      type: "number",
      min: "0",
    },
    {
      key: "interruptionToleranceDays",
      label: "Interruption tolerance (days)",
      type: "number",
    },
    {
      key: "powerDependence",
      label: "Electricity dependence (0–100)",
      type: "number",
    },
    {
      key: "waterDependence",
      label: "Water dependence (0–100)",
      type: "number",
    },
    { key: "assets", label: "Critical equipment or assets", wide: true },
    {
      key: "suppliers",
      label: "Main suppliers and delivery dependencies",
      wide: true,
    },
    { key: "measures", label: "Current protective measures", wide: true },
  ]
  return (
    <>
      <SectionHeading
        eyebrow="Business inputs"
        title="Business Profile"
        description="Keep the inputs used by this demonstration accurate. Financial details remain in memory for this session only."
      />
      <DataNotice>
        {sessionStorage.getItem("climateshield_demo_role") === "owner"
          ? "Demo mode uses browser-local sample data. Do not enter real confidential or financial information."
          : "Your business profile is saved to your authenticated account. Revenue and cost inputs remain session-only."}
      </DataNotice>
      <form className="content-card profile-form" onSubmit={submit}>
        <div className="card-heading">
          <div>
            <strong>Profile information</strong>
            <span>Required fields are marked with *</span>
          </div>
        </div>
        <div className="profile-form__grid">
          {fields.map((field) => (
            <label className={field.wide ? "is-wide" : ""} key={field.key}>
              {field.label}
              {field.required ? " *" : ""}
              {field.wide ? (
                <textarea
                  value={draft[field.key]}
                  required={field.required}
                  onChange={(event) =>
                    setDraft({ ...draft, [field.key]: event.target.value })
                  }
                />
              ) : (
                <input
                  type={field.type ?? "text"}
                  min={field.min}
                  value={draft[field.key]}
                  required={field.required}
                  onChange={(event) =>
                    setDraft({ ...draft, [field.key]: event.target.value })
                  }
                />
              )}
            </label>
          ))}
        </div>
        <div className="form-footer">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
          {message && <span role="status">{message}</span>}
        </div>
      </form>
    </>
  )
}

function Reports({
  profile,
  scenario,
  assessment,
}: {
  profile: BusinessProfile
  scenario: ScenarioState
  assessment: RiskAssessment
}) {
  const result = calculateScenario(scenario, assessment)
  return (
    <>
      <SectionHeading
        eyebrow="Decision summary"
        title="Business Climate Risk Report"
        description="A print-friendly summary of profile inputs, illustrative risk, recommendations, scenario results, and limitations."
        action={
          <button
            className="print-button"
            type="button"
            onClick={() => window.print()}
          >
            <DashboardGlyph name="reports" /> Print report
          </button>
        }
      />
      <DataNotice>
        This report uses sample hazard assumptions and is not suitable for
        underwriting, insurance, or investment decisions.
      </DataNotice>
      <article className="report-sheet">
        <header>
          <div>
            <strong>ClimateShield MSME</strong>
            <span>Business Climate Risk Summary</span>
          </div>
          <RiskBadge category={assessment.category} />
        </header>
        <section>
          <h2>Business profile</h2>
          <dl className="report-grid">
            <div>
              <dt>Business</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt>Industry</dt>
              <dd>{profile.industry}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{profile.location}</dd>
            </div>
            <div>
              <dt>Employees</dt>
              <dd>{profile.employees}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h2>Illustrative risk summary</h2>
          <div className="report-risk">
            <RiskGauge score={assessment.score} />
            <div>
              <strong>
                {assessment.score} / 100 · {assessment.category}
              </strong>
              <p>
                Primary drivers: potential flooding, heavy rainfall disruption,
                {assessment.drivers.join("; ")}.
              </p>
            </div>
          </div>
        </section>
        <section>
          <h2>Scenario result</h2>
          <p>
            {scenario.hazard}, severity {scenario.severity}/5 over{" "}
            {scenario.duration} days: approximately {result.downtime.toFixed(1)}{" "}
            days downtime and{" "}
            {result.revenueLoss === null
              ? "unavailable"
              : formatCurrency(result.revenueLoss)}{" "}
            estimated gross revenue loss.
          </p>
        </section>
        <section>
          <h2>Priority actions</h2>
          <ol>
            {recommendations.slice(0, 3).map((item) => (
              <li key={item.id}>
                {item.title} — {item.benefit}
              </li>
            ))}
          </ol>
        </section>
        <section className="report-limitations">
          <h2>Data quality and limitations</h2>
          <p>
            Open-Meteo weather may be retrieved in the Climate Risk view, but no
            verified flood-depth map, financial account, or validated loss model
            is connected. Risk and financial effects remain model or scenario
            estimates. Profile, scenario, and plans are browser-local.
          </p>
        </section>
        <footer>Generated in DEMO MODE · Sample record date 18 Mar 2026</footer>
      </article>
    </>
  )
}

function Settings() {
  const [settings, setSettings] = useState({
    alerts: true,
    email: false,
    compact: false,
  })
  return (
    <>
      <SectionHeading
        eyebrow="Preferences"
        title="Settings"
        description="Configure local demonstration preferences. Notification delivery requires a future backend integration."
      />
      <section className="content-card settings-list">
        <div>
          <span>
            <strong>In-app sample alerts</strong>
            <small>Show illustrative weather and risk notices</small>
          </span>
          <button
            className={settings.alerts ? "toggle is-on" : "toggle"}
            type="button"
            aria-pressed={settings.alerts}
            onClick={() =>
              setSettings({ ...settings, alerts: !settings.alerts })
            }
          >
            <span />
          </button>
        </div>
        <div>
          <span>
            <strong>Email notifications</strong>
            <small>Cannot send until an email service is connected</small>
          </span>
          <button
            className={settings.email ? "toggle is-on" : "toggle"}
            type="button"
            aria-pressed={settings.email}
            onClick={() => setSettings({ ...settings, email: !settings.email })}
          >
            <span />
          </button>
        </div>
        <div>
          <span>
            <strong>Compact data tables</strong>
            <small>Use denser rows on supported screens</small>
          </span>
          <button
            className={settings.compact ? "toggle is-on" : "toggle"}
            type="button"
            aria-pressed={settings.compact}
            onClick={() =>
              setSettings({ ...settings, compact: !settings.compact })
            }
          >
            <span />
          </button>
        </div>
      </section>
      <section className="content-card integration-status">
        <div className="card-heading">
          <div>
            <strong>Integration status</strong>
            <span>Production services required</span>
          </div>
        </div>
        <dl className="data-list">
          <div>
            <dt>Authentication</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Climate API</dt>
            <dd>Open-Meteo client integration available</dd>
          </div>
          <div>
            <dt>Map provider</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Notification service</dt>
            <dd>Not connected</dd>
          </div>
        </dl>
      </section>
    </>
  )
}

export default function BusinessDashboard() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const pathView = Object.entries(businessViewPaths).find(
    ([, path]) => path === location.pathname,
  )?.[0]
  const requestedView = pathView ?? searchParams.get("view") ?? "overview"
  const activeView = navigation.some((item) => item.id === requestedView)
    ? requestedView
    : "overview"
  const [profile, setProfile] = useState(() =>
    sessionStorage.getItem("climateshield_demo_role") === "owner"
      ? {
          ...defaultProfile,
          ...readStorage("climateshield-business-profile", defaultProfile),
        }
      : emptyAccountProfile,
  )
  const [hazards, setHazards] = useState<HazardScores>(DEFAULT_HAZARDS)
  const [climateBundle, setClimateBundle] = useState<ClimateBundle | null>(null)
  const [riskSource, setRiskSource] = useState("synthetic demo assumptions")
  const [assessmentSync, setAssessmentSync] = useState("")
  const [progress, setProgress] = useState<Record<string, ProgressStatus>>(() =>
    readStorage(
      "climateshield-business-progress",
      Object.fromEntries(
        recommendations.map((item, index) => [
          item.id,
          index === 0 ? "In progress" : "Planned",
        ]),
      ) as Record<string, ProgressStatus>,
    ),
  )

  useEffect(() => {
    if (sessionStorage.getItem("climateshield_demo_role") === "owner") return
    let active = true
    void apiRequest<{
      profile: {
        name: string
        industry: string
        address: string
        city: string
        state: string
        latitude: number
        longitude: number
        size: string
        employee_range: string
        assets: string
        protective_measures: string
      }
    }>("/business/profile")
      .then(({ profile: saved }) => {
        if (!active) return
        const hydrated: BusinessProfile = {
          ...emptyAccountProfile,
          name: saved.name,
          industry: saved.industry,
          location: saved.address,
          city: saved.city,
          state: saved.state,
          latitude: String(saved.latitude),
          longitude: String(saved.longitude),
          size: saved.size,
          employees: saved.employee_range,
          assets: saved.assets,
          measures: saved.protective_measures,
        }
        setProfile((current) => ({
          ...hydrated,
          monthlyRevenue: current.monthlyRevenue,
          monthlyOperatingCosts: current.monthlyOperatingCosts,
          interruptionToleranceDays: current.interruptionToleranceDays,
          powerDependence: current.powerDependence,
          waterDependence: current.waterDependence,
          suppliers: current.suppliers,
        }))
        localStorage.setItem(
          "climateshield-business-profile",
          JSON.stringify(profileForLocalStorage(hydrated)),
        )
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 404) {
          localStorage.removeItem("climateshield-business-profile")
          setProfile(emptyAccountProfile)
          return
        }
        setAssessmentSync(
          `Saved business profile could not be loaded: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        )
      })
    return () => {
      active = false
    }
  }, [])
  const [scenario, setScenarioState] = useState<ScenarioState>(() => ({
    hazard: "Heavy rainfall / flooding",
    severity: 4,
    duration: 5,
    revenue: Number(profile.monthlyRevenue) || 850000,
    operatingCosts: Number(profile.monthlyOperatingCosts) || 560000,
    cashBuffer: 25,
    ...readStorage("climateshield-business-scenario", {}),
  }))
  const assessment = useMemo(
    () => profileRiskAssessment(profile, hazards, riskSource),
    [profile, hazards, riskSource],
  )
  const scenarioResult = useMemo(
    () =>
      simulateScenario(
        {
          hazard: scenario.hazard as ScenarioHazard,
          severity: scenario.severity,
          durationDays: scenario.duration,
          monthlyRevenue: scenario.revenue || null,
          monthlyOperatingCosts: scenario.operatingCosts || null,
          cashBufferPercent: scenario.cashBuffer,
        },
        assessment,
      ),
    [assessment, scenario],
  )

  useEffect(() => {
    sessionStorage.setItem(
      "climateshield-business-assessment",
      JSON.stringify(assessment),
    )
  }, [assessment])

  function setScenario(value: ScenarioState) {
    setScenarioState(value)
    localStorage.setItem(
      "climateshield-business-scenario",
      JSON.stringify(scenarioForLocalStorage(value)),
    )
  }

  function selectLocation(location: GeocodedLocation) {
    const next = {
      ...profile,
      location: location.label,
      city: location.name,
      state: location.admin1 ?? profile.state,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    }
    setProfile(next)
    localStorage.setItem(
      "climateshield-business-profile",
      JSON.stringify(profileForLocalStorage(next)),
    )
  }

  async function receiveHazards(
    indicators: HazardIndicator[],
    bundle: ClimateBundle,
  ) {
    setClimateBundle(bundle)
    const nextHazards: HazardScores = {
      flood: indicators.find((item) => item.key === "flood")?.score ?? null,
      heat: indicators.find((item) => item.key === "heat")?.score ?? null,
      rainfall:
        indicators.find((item) => item.key === "rainfall")?.score ?? null,
      drought: indicators.find((item) => item.key === "drought")?.score ?? null,
    }
    setHazards(nextHazards)
    setRiskSource("live Open-Meteo weather plus profile assumptions")
    if (hasInvalidFinancialInput(profile)) {
      setAssessmentSync(
        "Assessment was not saved: monthly revenue and operating costs must be valid non-negative amounts.",
      )
      return
    }
    if (sessionStorage.getItem("climateshield_demo_role") === "owner") return

    setAssessmentSync("Saving this assessment to your authorized account…")
    try {
      await apiRequest("/business/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          industry: profile.industry,
          address: profile.location,
          city: profile.city,
          state: profile.state,
          latitude: Number(profile.latitude),
          longitude: Number(profile.longitude),
          size: profile.size,
          employee_range: profile.employees,
          activities: "",
          assets: profile.assets,
          operating_hours: "",
          protective_measures: profile.measures,
        }),
      })
      const sensitivity = profileRiskAssessment(profile, nextHazards, "saved")
      await apiRequest("/business/assessments", {
        method: "POST",
        body: JSON.stringify({
          hazards: nextHazards,
          vulnerability_factors: Object.fromEntries(
            Object.entries(sensitivity.vulnerabilityFactors).map(
              ([key, value]) => [
                key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
                value,
              ],
            ),
          ),
          resilience: sensitivity.resilience,
          financials: {
            monthly_revenue: financialAmount(profile.monthlyRevenue),
            monthly_operating_costs: financialAmount(
              profile.monthlyOperatingCosts,
            ),
          },
          calibration: {
            historical_flood_index:
              sensitivity.calibration.historicalFloodIndex,
            historical_drought_index:
              sensitivity.calibration.historicalDroughtIndex,
          },
          model_version: "climateshield-prototype-v3",
          source_provenance: {
            source: "Open-Meteo",
            retrieved_at: bundle.retrievedAt,
            coverage: bundle.quality.coverage,
            completeness: bundle.quality.completeness,
            missing: bundle.quality.missing,
            errors: bundle.errors,
            historical: bundle.historical
              ? {
                  kind: bundle.historical.kind,
                  period: bundle.historical.period,
                  daily: bundle.historical.daily,
                }
              : null,
            forecast: bundle.forecast
              ? {
                  kind: bundle.forecast.kind,
                  period: bundle.forecast.period,
                  daily: bundle.forecast.daily,
                }
              : null,
          },
        }),
      })
      setAssessmentSync(
        "Assessment saved to your account with its source timestamp and data-quality metadata.",
      )
    } catch (error) {
      setAssessmentSync(
        `Assessment is available in this view but was not saved to the backend: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      )
    }
  }

  function navigate(view: string) {
    const path = businessViewPaths[view]
    if (path) {
      routerNavigate(path)
    } else {
      setSearchParams(view === "overview" ? {} : { view })
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const content = useMemo(() => {
    switch (activeView) {
      case "risk":
        return (
          <ClimateIntelligence
            profile={profile}
            onLocationSelected={selectLocation}
            onHazardsLoaded={receiveHazards}
            persistenceStatus={assessmentSync}
          />
        )
      case "simulator":
        return (
          <RiskSimulator
            scenario={scenario}
            setScenario={setScenario}
            assessment={assessment}
          />
        )
      case "engine":
        return (
          <ClimateToCreditEngine profile={profile} assessment={assessment} />
        )
      case "recommendations":
        return <Recommendations />
      case "progress":
        return (
          <ResilienceProgress
            progress={progress}
            setProgress={setProgress}
            assessment={assessment}
          />
        )
      case "reports":
        return (
          <Reports
            profile={profile}
            scenario={scenario}
            assessment={assessment}
          />
        )
      case "profile":
        return <BusinessProfile profile={profile} setProfile={setProfile} />
      case "settings":
        return <Settings />
      default:
        return (
          <Overview
            onNavigate={navigate}
            profile={profile}
            assessment={assessment}
            scenarioResult={scenarioResult}
            climateBundle={climateBundle}
          />
        )
    }
  }, [
    activeView,
    profile,
    progress,
    scenario,
    assessment,
    scenarioResult,
    climateBundle,
    assessmentSync,
  ])
  const needsBusinessProfile =
    !profile.name.trim() &&
    activeView !== "profile" &&
    activeView !== "settings"

  return (
    <DashboardLayout
      productLabel="Business"
      contextTitle={profile.name}
      contextSubtitle={profile.location}
      navigation={navigation}
      activeView={activeView}
      onNavigate={navigate}
    >
      {needsBusinessProfile ? (
        <section className="content-card">
          <SectionHeading
            eyebrow="Business setup"
            title="Add your business profile"
            description="Your account has no saved business profile yet. Add your own location and business details to enable climate assessments; demo sample data is not shown as your account data."
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate("profile")}
          >
            Complete business profile
          </button>
        </section>
      ) : (
        content
      )}
    </DashboardLayout>
  )
}
