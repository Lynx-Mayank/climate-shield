import { useMemo, useState } from "react"
import { formatCurrency, RiskBadge, SectionHeading } from "./DashboardLayout"
import { recommendations } from "./data"
import type { RiskAssessment } from "../services/riskScoringService"
import {
  rankInterventionsWithinBudget,
  simulateScenario,
  type InterventionAssumption,
  type ScenarioHazard,
  type ScenarioInput,
} from "../services/scenarioService"

interface EngineProfile {
  name: string
  industry: string
  location: string
  monthlyRevenue: string
  monthlyOperatingCosts: string
  suppliers: string
}

interface SupplierDependency {
  id: number
  name: string
  location: string
  material: string
  dependency: number
  alternatives: "None" | "Limited" | "Available"
  transport: string
}

const defaultSuppliers: SupplierDependency[] = [
  {
    id: 1,
    name: "Gujarat Yarn Cooperative",
    location: "Bharuch, Gujarat",
    material: "Cotton yarn",
    dependency: 80,
    alternatives: "Limited",
    transport: "Single road corridor",
  },
  {
    id: 2,
    name: "Western Dyes Supply",
    location: "Ahmedabad, Gujarat",
    material: "Dyes and chemicals",
    dependency: 55,
    alternatives: "Available",
    transport: "Road freight",
  },
]

interface InterventionAssumptionSetting {
  cost: number
  effectiveness: number
}

function toInterventions(
  assumptions: Record<string, InterventionAssumptionSetting>,
): InterventionAssumption[] {
  return recommendations.map((item) => ({
    id: item.id,
    title: item.title,
    targets: [...item.targets],
    cost: assumptions[item.id]?.cost ?? item.cost,
    effectiveness: assumptions[item.id]?.effectiveness ?? item.effectiveness,
    rationale: item.rationale,
  }))
}

function resultValue(value: number | null, suffix = "") {
  return value === null
    ? "Unavailable"
    : `${Math.round(value).toLocaleString("en-IN")}${suffix}`
}

function repaymentPressureValue(result: ReturnType<typeof simulateScenario>) {
  if (result.repaymentStress === "Not provided") {
    return "Enter debt repayment and financial inputs"
  }
  if (result.repaymentStress === "No scheduled debt") {
    return "No scheduled debt repayment"
  }
  return `${result.repaymentStress} · ${result.debtServiceCoverageRatio?.toFixed(2) ?? "—"}× DSCR`
}

export default function ClimateToCreditEngine({
  profile,
  assessment,
}: {
  profile: EngineProfile
  assessment: RiskAssessment
}) {
  const [stage, setStage] = useState(0)
  const [scenario, setScenario] = useState<ScenarioInput>(() => {
    try {
      const saved = localStorage.getItem("climateshield-engine-scenario")
      if (saved) {
        return {
          ...JSON.parse(saved) as ScenarioInput,
          monthlyRevenue: Number(profile.monthlyRevenue) || null,
          monthlyOperatingCosts: Number(profile.monthlyOperatingCosts) || null,
          monthlyDebtRepayment: null,
        }
      }
    } catch {
      // Use documented defaults when local demo storage is unavailable.
    }
    return {
      hazard: "Heavy rainfall / flooding",
      severity: 4,
      durationDays: 6,
      monthlyRevenue: Number(profile.monthlyRevenue) || null,
      monthlyOperatingCosts: Number(profile.monthlyOperatingCosts) || null,
      cashBufferPercent: 25,
      monthlyDebtRepayment: null,
    }
  })
  const [budget, setBudget] = useState(180000)
  const [selectedIds, setSelectedIds] = useState<string[]>(["flood"])
  const [saveMessage, setSaveMessage] = useState("")
  const [assumptions, setAssumptions] = useState(() =>
    Object.fromEntries(
      recommendations.map((item) => [
        item.id,
        { cost: item.cost, effectiveness: item.effectiveness },
      ]),
    ),
  )
  const [suppliers, setSuppliers] = useState<SupplierDependency[]>(() => {
    try {
      const saved = localStorage.getItem("climateshield-suppliers")
      return saved
        ? JSON.parse(saved) as SupplierDependency[]
        : defaultSuppliers
    } catch {
      return defaultSuppliers
    }
  })

  const interventions = toInterventions(assumptions)
  const selected = interventions.filter((item) => selectedIds.includes(item.id))
  const baseline = simulateScenario(scenario, assessment)
  const improved = simulateScenario(scenario, assessment, selected)
  const ranking = rankInterventionsWithinBudget(
    interventions,
    scenario,
    assessment,
    budget,
  )
  const selectedCost = selected.reduce((sum, item) => sum + item.cost, 0)
  const avoidedLoss =
    baseline.lostRevenue === null || improved.lostRevenue === null
      ? null
      : baseline.lostRevenue - improved.lostRevenue

  function updateScenario(next: ScenarioInput) {
    setScenario(next)
    localStorage.setItem(
      "climateshield-engine-scenario",
      JSON.stringify({
        hazard: next.hazard,
        severity: next.severity,
        durationDays: next.durationDays,
        cashBufferPercent: next.cashBufferPercent,
        monthlyRevenue: null,
        monthlyOperatingCosts: null,
        monthlyDebtRepayment: null,
      }),
    )
  }

  function savePlan() {
    const plan = {
      savedAt: new Date().toISOString(),
      business: profile.name,
      scenario: {
        hazard: scenario.hazard,
        severity: scenario.severity,
        durationDays: scenario.durationDays,
        cashBufferPercent: scenario.cashBufferPercent,
        monthlyRevenue: null,
        monthlyOperatingCosts: null,
        monthlyDebtRepayment: null,
      },
      selectedInterventions: selected,
      budget,
      baseline: {
        downtimeDays: baseline.downtimeDays,
        scenarioRiskScore: baseline.scenarioRiskScore,
      },
      improved: {
        downtimeDays: improved.downtimeDays,
        scenarioRiskScore: improved.scenarioRiskScore,
      },
      status: "Proposed",
      persistence: "browser-local demo",
    }
    localStorage.setItem("climateshield-resilience-plan", JSON.stringify(plan))
    setSaveMessage(
      "Proposed action plan saved in this browser. It is not shared with a lender or backend.",
    )
  }

  const supplierImpact = useMemo(
    () =>
      suppliers.map((supplier) => {
        const alternativeFactor =
          supplier.alternatives === "None"
            ? 1
            : supplier.alternatives === "Limited"
              ? 0.7
              : 0.35
        const disruptionDays =
          scenario.durationDays *
          (supplier.dependency / 100) *
          alternativeFactor *
          (scenario.severity / 5)
        const revenueImpact =
          scenario.monthlyRevenue === null
            ? null
            : (scenario.monthlyRevenue / 30) * disruptionDays * 0.6
        return { ...supplier, disruptionDays, revenueImpact }
      }),
    [scenario, suppliers],
  )

  const stages = [
    "Identify risk",
    "Simulate event",
    "Compare interventions",
    "Before & after",
    "Action plan",
    "Lender summary",
  ]
  const stageTargets = [
    "engine-stage-identify",
    "engine-stage-simulate",
    "engine-stage-interventions",
    "engine-stage-before-after",
    "engine-stage-action-plan",
    "engine-stage-lender-summary",
  ]

  function goToStage(index: number) {
    setStage(index)
    requestAnimationFrame(() => {
      document
        .getElementById(stageTargets[index])
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  return (
    <>
      <SectionHeading
        eyebrow="Signature decision workflow"
        title="Climate-to-Credit Resilience Engine"
        description="Trace one transparent workflow from climate risk to a financial scenario, targeted resilience actions, and a lender-ready human-review summary."
      />
      <div className="engine-disclaimer">
        <strong>Decision support only</strong>
        <span>
          Scenario estimates are not predictions, verified losses, credit
          scores, loan decisions, or guaranteed savings.
        </span>
      </div>

      <nav className="engine-stages" aria-label="Resilience engine stages">
        {stages.map((label, index) => (
          <button
            type="button"
            className={stage === index ? "is-active" : ""}
            onClick={() => goToStage(index)}
            key={label}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      <section className="engine-context-grid" id="engine-stage-identify">
        <article>
          <small>Selected business</small>
          <strong>{profile.name}</strong>
          <span>
            {profile.industry} · {profile.location}
          </span>
        </article>
        <article>
          <small>Current climate-risk score</small>
          <strong>{assessment.score} / 100</strong>
          <RiskBadge category={assessment.category} />
        </article>
        <article>
          <small>Assessment completeness</small>
          <strong>{assessment.completeness}%</strong>
          <span>{assessment.confidence} confidence</span>
        </article>
        <article>
          <small>Missing information</small>
          <strong>{assessment.missing.length}</strong>
          <span>
            {assessment.missing.slice(0, 2).join(", ") ||
              "No model inputs missing"}
          </span>
        </article>
      </section>
      <section className="engine-driver-strip" aria-label="Main risk drivers">
        <div>
          <strong>Largest estimated score effects</strong>
          <span>
            One-at-a-time score change versus a neutral factor value; effects
            are not additive or observed damage
          </span>
        </div>
        <ol>
          {assessment.drivers.map((driver) => (
            <li key={driver}>{driver}</li>
          ))}
        </ol>
      </section>

      <div className="engine-workspace" id="engine-stage-simulate">
        <section className="content-card engine-controls">
          <div className="card-heading">
            <div>
              <strong>Stage B · Climate event assumptions</strong>
              <span>Editable and saved locally</span>
            </div>
          </div>
          <label>
            Event
            <select
              value={scenario.hazard}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  hazard: event.target.value as ScenarioHazard,
                })
              }
            >
              <option>Heavy rainfall / flooding</option>
              <option>Extreme heat</option>
              <option>Drought / water shortage</option>
              <option>Temporary power disruption</option>
              <option>Combined event</option>
            </select>
          </label>
          <label>
            <span>
              Severity <b>{scenario.severity} / 5</b>
            </span>
            <input
              type="range"
              min="1"
              max="5"
              value={scenario.severity}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  severity: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Duration (days)
            <input
              type="number"
              min="1"
              max="90"
              value={scenario.durationDays}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  durationDays: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Monthly gross revenue (₹)
            <input
              type="number"
              min="0"
              value={scenario.monthlyRevenue ?? ""}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  monthlyRevenue: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </label>
          <label>
            Monthly operating costs (₹)
            <input
              type="number"
              min="0"
              value={scenario.monthlyOperatingCosts ?? ""}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  monthlyOperatingCosts: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </label>
          <label>
            Monthly scheduled debt repayments (₹)
            <input
              type="number"
              min="0"
              step="1000"
              value={scenario.monthlyDebtRepayment ?? ""}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  monthlyDebtRepayment: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
            <small>
              Optional. Used only to estimate debt-service coverage for this
              scenario.
            </small>
          </label>
          <label>
            <span>
              Available cash buffer <b>{scenario.cashBufferPercent}%</b>
            </span>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={scenario.cashBufferPercent}
              onChange={(event) =>
                updateScenario({
                  ...scenario,
                  cashBufferPercent: Number(event.target.value),
                })
              }
            />
          </label>
        </section>

        <section className="engine-results" id="engine-stage-before-after">
          <div className="before-after-head">
            <div>
              <small>Baseline scenario</small>
              <strong>{scenario.hazard}</strong>
            </div>
            <span>→</span>
            <div>
              <small>With selected actions</small>
              <strong>{selected.length} intervention(s)</strong>
            </div>
          </div>
          <div className="before-after-grid">
            {[
              [
                "Scenario risk score",
                `${baseline.scenarioRiskScore}/100`,
                `${improved.scenarioRiskScore}/100`,
              ],
              [
                "Estimated downtime",
                `${baseline.downtimeDays.toFixed(1)} days`,
                `${improved.downtimeDays.toFixed(1)} days`,
              ],
              [
                "Estimated lost gross revenue",
                baseline.lostRevenue === null
                  ? "Enter monthly revenue"
                  : formatCurrency(baseline.lostRevenue),
                improved.lostRevenue === null
                  ? "Enter monthly revenue"
                  : formatCurrency(improved.lostRevenue),
              ],
              [
                "Additional operating expense",
                baseline.additionalOperatingExpense === null
                  ? "Enter operating costs"
                  : formatCurrency(baseline.additionalOperatingExpense),
                improved.additionalOperatingExpense === null
                  ? "Enter operating costs"
                  : formatCurrency(improved.additionalOperatingExpense),
              ],
              [
                "Cash-flow pressure",
                baseline.cashFlowPressure === null
                  ? "Enter revenue, costs and buffer"
                  : resultValue(baseline.cashFlowPressure, "%"),
                improved.cashFlowPressure === null
                  ? "Enter revenue, costs and buffer"
                  : resultValue(improved.cashFlowPressure, "%"),
              ],
              [
                "Repayment pressure",
                repaymentPressureValue(baseline),
                repaymentPressureValue(improved),
              ],
            ].map(([label, before, after]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{before}</strong>
                <strong>{after}</strong>
              </div>
            ))}
          </div>
          <p className="engine-method-note">
            {baseline.assumptions[0]} Intervention effects only apply to
            matching hazards and combine multiplicatively, capped at 70%.
            Repayment pressure is an estimated debt-service coverage ratio
            (DSCR); enter scheduled monthly repayments to calculate it.
          </p>
        </section>
      </div>

      <section
        className="content-card intervention-workbench"
        id="engine-stage-interventions"
      >
        <div className="card-heading">
          <div>
            <strong>Stage C · Intervention assumptions</strong>
            <span>
              Adjust cost and effectiveness; select actions for before-and-after
              calculation
            </span>
          </div>
        </div>
        <div className="intervention-table">
          <div className="intervention-table__head">
            <span>Action / target</span>
            <span>Cost</span>
            <span>Effectiveness</span>
            <span>Scenario effect</span>
            <span>Select</span>
          </div>
          {interventions.map((item) => {
            const alone = simulateScenario(scenario, assessment, [item])
            const compatible = alone.appliedEffectiveness > 0
            const lossAvoided =
              baseline.lostRevenue === null || alone.lostRevenue === null
                ? null
                : baseline.lostRevenue - alone.lostRevenue
            const eventEquivalents =
              lossAvoided !== null && lossAvoided > 0
                ? item.cost / lossAvoided
                : null
            return (
              <div key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.targets.join(", ") || "operational continuity"} ·{" "}
                    {item.rationale}
                  </small>
                </span>
                <label>
                  ₹
                  <input
                    type="number"
                    min="0"
                    value={item.cost}
                    onChange={(event) =>
                      setAssumptions({
                        ...assumptions,
                        [item.id]: {
                          ...assumptions[item.id],
                          cost: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="number"
                    min="0"
                    max="70"
                    value={Math.round(item.effectiveness * 100)}
                    onChange={(event) =>
                      setAssumptions({
                        ...assumptions,
                        [item.id]: {
                          ...assumptions[item.id],
                          effectiveness: Number(event.target.value) / 100,
                        },
                      })
                    }
                  />
                  %
                </label>
                <span className={compatible ? "is-compatible" : "is-unrelated"}>
                  {compatible
                    ? `${
                        lossAvoided === null
                          ? "Loss unavailable"
                          : `${formatCurrency(lossAvoided)} avoided*`
                      }`
                    : "No modeled benefit for this hazard"}
                  {compatible && eventEquivalents !== null && (
                    <small>
                      Payback period unavailable without event frequency; cost
                      equals {eventEquivalents.toFixed(1)} scenario-event
                      equivalents.
                    </small>
                  )}
                </span>
                <button
                  type="button"
                  className={selectedIds.includes(item.id) ? "is-selected" : ""}
                  onClick={() =>
                    setSelectedIds((current) =>
                      current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id],
                    )
                  }
                >
                  {selectedIds.includes(item.id) ? "Selected" : "Add"}
                </button>
              </div>
            )
          })}
        </div>
        <p className="engine-table-footnote">
          *Avoided gross revenue loss under the current scenario assumptions,
          not verified savings. Effectiveness inputs are editable demo
          assumptions.
        </p>
      </section>

      <section className="budget-planner" id="engine-stage-action-plan">
        <div className="content-card">
          <div className="card-heading">
            <div>
              <strong>Stage E · Budget-guided action plan</strong>
              <span>Deterministic ranking, not mathematical optimization</span>
            </div>
          </div>
          <label>
            <span>
              Available budget <b>{formatCurrency(budget)}</b>
            </span>
            <input
              type="range"
              min="10000"
              max="400000"
              step="5000"
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
            />
          </label>
          <div className="budget-bar">
            <span
              style={
                {
                  "--budget-use": `${Math.min(100, (selectedCost / budget) * 100)}%`,
                } as React.CSSProperties
              }
            />
          </div>
          <p>
            Selected bundle: {formatCurrency(selectedCost)} ·{" "}
            {selectedCost > budget
              ? `${formatCurrency(selectedCost - budget)} over budget`
              : `${formatCurrency(budget - selectedCost)} remaining`}
          </p>
          <button type="button" onClick={savePlan}>
            Save proposed action plan
          </button>
          {saveMessage && <small role="status">{saveMessage}</small>}
        </div>
        <div className="content-card">
          <div className="card-heading">
            <div>
              <strong>Suggested within budget</strong>
              <span>Compatible avoided-loss-per-rupee ranking</span>
            </div>
          </div>
          <ol className="ranked-actions">
            {ranking.selected.length ? (
              ranking.selected.map((item) => (
                <li key={item.intervention.id}>
                  <span>{item.intervention.title}</span>
                  <strong>{formatCurrency(item.intervention.cost)}</strong>
                  <small>
                    Ratio {item.benefitCost.toFixed(2)} ·{" "}
                    {formatCurrency(item.avoidedLoss)} illustrative avoided loss
                  </small>
                </li>
              ))
            ) : (
              <li>No compatible action fits the current budget.</li>
            )}
          </ol>
          <p>{ranking.explanation}</p>
        </div>
      </section>

      <section className="content-card ripple-card">
        <div className="card-heading">
          <div>
            <strong>Climate Ripple Effect · Supply-chain dependencies</strong>
            <span>
              User-entered demo relationships; no supplier network was
              discovered automatically
            </span>
          </div>
        </div>
        <div className="ripple-network">
          <div className="ripple-business">
            <strong>{profile.name}</strong>
            <span>Primary business</span>
          </div>
          {supplierImpact.map((supplier) => (
            <article key={supplier.id}>
              <div className="ripple-line">
                <span
                  style={
                    {
                      "--dependency": `${supplier.dependency}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
              <header>
                <strong>{supplier.name}</strong>
                <span>{supplier.dependency}% dependency</span>
              </header>
              <label>
                Supplier location
                <input
                  value={supplier.location}
                  onChange={(event) =>
                    setSuppliers((current) =>
                      current.map((item) =>
                        item.id === supplier.id
                          ? { ...item, location: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Material / service
                <input
                  value={supplier.material}
                  onChange={(event) =>
                    setSuppliers((current) =>
                      current.map((item) =>
                        item.id === supplier.id
                          ? { ...item, material: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Dependency ({supplier.dependency}%)
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={supplier.dependency}
                  onChange={(event) =>
                    setSuppliers((current) =>
                      current.map((item) =>
                        item.id === supplier.id
                          ? {
                              ...item,
                              dependency: Number(event.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Alternatives
                <select
                  value={supplier.alternatives}
                  onChange={(event) =>
                    setSuppliers((current) =>
                      current.map((item) =>
                        item.id === supplier.id
                          ? {
                              ...item,
                              alternatives: event.target
                                .value as SupplierDependency["alternatives"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option>None</option>
                  <option>Limited</option>
                  <option>Available</option>
                </select>
              </label>
              <label>
                Transport dependency
                <input
                  value={supplier.transport}
                  onChange={(event) =>
                    setSuppliers((current) =>
                      current.map((item) =>
                        item.id === supplier.id
                          ? { ...item, transport: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <p>
                User-entered disruption estimate:{" "}
                <strong>{supplier.disruptionDays.toFixed(1)} days</strong>
                {supplier.revenueImpact !== null &&
                  ` · ${formatCurrency(supplier.revenueImpact)} gross revenue exposure`}
              </p>
            </article>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(
              "climateshield-suppliers",
              JSON.stringify(suppliers),
            )
            setSaveMessage(
              "Supplier dependencies saved locally in this browser.",
            )
          }}
        >
          Save supply-chain inputs locally
        </button>
      </section>

      <article
        className="report-sheet engine-report"
        id="engine-stage-lender-summary"
      >
        <header>
          <div>
            <strong>ClimateShield MSME</strong>
            <span>Climate-to-Credit Resilience Summary</span>
          </div>
          <RiskBadge category={assessment.category} />
        </header>
        <section>
          <h2>Business and baseline risk</h2>
          <p>
            {profile.name} · {profile.industry} · {profile.location}. Current
            model score {assessment.score}/100 ({assessment.category}), with{" "}
            {assessment.confidence.toLowerCase()} confidence and{" "}
            {assessment.completeness}% input completeness.
          </p>
        </section>
        <section>
          <h2>Selected scenario</h2>
          <p>
            {scenario.hazard}, severity {scenario.severity}/5 for{" "}
            {scenario.durationDays} days. Baseline estimate:{" "}
            {baseline.downtimeDays.toFixed(1)} downtime days and{" "}
            {baseline.lostRevenue === null
              ? "unavailable revenue loss"
              : `${formatCurrency(baseline.lostRevenue)} gross revenue loss`}
            .
          </p>
        </section>
        <section>
          <h2>Proposed resilience actions</h2>
          {selected.length ? (
            <ol>
              {selected.map((item) => (
                <li key={item.id}>
                  {item.title} · {formatCurrency(item.cost)} ·{" "}
                  {Math.round(item.effectiveness * 100)}% effectiveness
                  assumption
                </li>
              ))}
            </ol>
          ) : (
            <p>No actions selected.</p>
          )}
          <p>
            Bundle cost {formatCurrency(selectedCost)}. Estimated residual
            downtime {improved.downtimeDays.toFixed(1)} days. Estimated avoided
            gross revenue loss{" "}
            {avoidedLoss === null ? "unavailable" : formatCurrency(avoidedLoss)}
            .
          </p>
        </section>
        <section>
          <h2>Human-review items</h2>
          <ol>
            <li>Verify site-level hazard data and business asset placement.</li>
            <li>Validate revenue, operating-cost, and cash-buffer inputs.</li>
            <li>Obtain supplier and intervention quotations.</li>
            <li>
              Do not use this climate score as an automated credit decision.
            </li>
          </ol>
        </section>
        <section className="report-limitations">
          <h2>Data quality and limitations</h2>
          <p>
            This decision-support artifact combines available Open-Meteo weather
            retrieval with profile inputs and editable model assumptions. It is
            not a certified assessment, forecast of business loss, loan
            approval, probability of default, or guarantee of savings.
          </p>
        </section>
        <footer>
          Browser-local demo report · Generated{" "}
          {new Date().toLocaleString("en-IN")}
        </footer>
      </article>
      <button
        className="print-button engine-print"
        type="button"
        onClick={() => window.print()}
      >
        Print lender-ready resilience summary
      </button>
    </>
  )
}
