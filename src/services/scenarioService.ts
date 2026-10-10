import type { HazardKey } from "./hazardService"
import type { RiskAssessment } from "./riskScoringService"

export type ScenarioHazard = "Heavy rainfall / flooding" | "Extreme heat" | "Drought / water shortage" | "Temporary power disruption" | "Combined event"

export interface ScenarioInput {
  hazard: ScenarioHazard
  severity: number
  durationDays: number
  monthlyRevenue: number | null
  monthlyOperatingCosts: number | null
  cashBufferPercent: number
  monthlyDebtRepayment?: number | null
}

export interface InterventionAssumption {
  id: string
  title: string
  targets: HazardKey[]
  cost: number
  effectiveness: number
  rationale: string
}

export interface ScenarioResult {
  downtimeDays: number
  lostRevenue: number | null
  additionalOperatingExpense: number | null
  cashFlowPressure: number | null
  repaymentStress:
    | "Not provided"
    | "No scheduled debt"
    | "Low"
    | "Moderate"
    | "Elevated"
  debtServiceCoverageRatio: number | null
  scenarioRiskScore: number
  appliedEffectiveness: number
  assumptions: string[]
}

const HAZARD_MULTIPLIERS: Record<ScenarioHazard, number> = {
  "Heavy rainfall / flooding": 1.25,
  "Extreme heat": 0.8,
  "Drought / water shortage": 0.72,
  "Temporary power disruption": 0.62,
  "Combined event": 1.45,
}

const HAZARD_KEYS: Record<ScenarioHazard, HazardKey[]> = {
  "Heavy rainfall / flooding": ["flood", "rainfall"],
  "Extreme heat": ["heat"],
  "Drought / water shortage": ["drought"],
  "Temporary power disruption": [],
  "Combined event": ["flood", "rainfall", "heat", "drought"],
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function simulateScenario(
  scenario: ScenarioInput,
  assessment: RiskAssessment,
  interventions: InterventionAssumption[] = [],
): ScenarioResult {
  const severity = clamp(scenario.severity, 1, 5)
  const duration = clamp(scenario.durationDays, 1, 90)
  const relevantKeys = HAZARD_KEYS[scenario.hazard]
  const relevant = interventions.filter(
    (item) =>
      item.targets.some((target) => relevantKeys.includes(target)) ||
      (scenario.hazard === "Temporary power disruption" && item.id === "power"),
  )
  const combinedEffectiveness = clamp(
    1 -
      relevant.reduce(
        (remaining, item) =>
          remaining * (1 - clamp(item.effectiveness, 0, 0.7)),
        1,
      ),
    0,
    0.7,
  )
  const multiplier = HAZARD_MULTIPLIERS[scenario.hazard]
  const disruptionFraction = clamp(
    (0.12 + severity * 0.12) * multiplier,
    0.1,
    1,
  )
  const baselineDowntime = duration * disruptionFraction
  const downtimeDays = Math.max(
    0.25,
    baselineDowntime * (1 - combinedEffectiveness),
  )
  const dailyRevenue =
    scenario.monthlyRevenue !== null &&
    Number.isFinite(scenario.monthlyRevenue) &&
    scenario.monthlyRevenue >= 0
      ? scenario.monthlyRevenue / 30
      : null
  const lostRevenue =
    dailyRevenue === null
      ? null
      : Math.round(dailyRevenue * downtimeDays * 0.85)
  const dailyOperatingCost =
    scenario.monthlyOperatingCosts !== null &&
    Number.isFinite(scenario.monthlyOperatingCosts) &&
    scenario.monthlyOperatingCosts >= 0
      ? scenario.monthlyOperatingCosts / 30
      : null
  const additionalOperatingExpense =
    dailyOperatingCost === null
      ? null
      : Math.round(
          dailyOperatingCost *
            downtimeDays *
            (0.12 + severity * 0.035) *
            (1 - combinedEffectiveness * 0.5),
        )
  const totalPressure =
    lostRevenue === null || additionalOperatingExpense === null
      ? null
      : lostRevenue + additionalOperatingExpense
  const buffer =
    scenario.monthlyRevenue !== null
      ? scenario.monthlyRevenue * (scenario.cashBufferPercent / 100)
      : null
  const cashFlowPressure =
    totalPressure === null || buffer === null || buffer <= 0
      ? null
      : Math.round((totalPressure / buffer) * 100)
  const repayment =
    scenario.monthlyDebtRepayment !== null &&
    scenario.monthlyDebtRepayment !== undefined &&
    Number.isFinite(scenario.monthlyDebtRepayment) &&
    scenario.monthlyDebtRepayment >= 0
      ? scenario.monthlyDebtRepayment
      : null
  const debtServiceCoverageRatio =
    repayment === null ||
    repayment === 0 ||
    scenario.monthlyRevenue === null ||
    scenario.monthlyOperatingCosts === null ||
    lostRevenue === null ||
    additionalOperatingExpense === null
      ? null
      : Math.round(
          (
            ((scenario.monthlyRevenue - scenario.monthlyOperatingCosts) *
              (duration / 30) -
              lostRevenue -
              additionalOperatingExpense) /
            (repayment * (duration / 30))
          ) *
            100,
        ) / 100
  const repaymentStress =
    repayment === null
      ? "Not provided"
      : repayment === 0
        ? "No scheduled debt"
        : debtServiceCoverageRatio === null
          ? "Not provided"
          : debtServiceCoverageRatio < 1
            ? "Elevated"
            : debtServiceCoverageRatio < 1.5
              ? "Moderate"
              : "Low"
  const scenarioUplift = severity * multiplier * 3
  const scenarioRiskScore = Math.round(
    clamp(
      assessment.score +
        scenarioUplift -
        scenarioUplift * combinedEffectiveness,
    ),
  )

  return {
    downtimeDays,
    lostRevenue,
    additionalOperatingExpense,
    cashFlowPressure,
    repaymentStress,
    debtServiceCoverageRatio,
    scenarioRiskScore,
    appliedEffectiveness: combinedEffectiveness,
    assumptions: [
      "Lost revenue uses average daily gross revenue × disrupted days × 85% assumed loss fraction.",
      "Additional operating expense uses daily operating cost × disrupted days × a severity factor.",
      "Repayment pressure is an estimated debt-service coverage ratio using operating cash flow over the event period, less modeled revenue loss and added costs, divided by scheduled debt repayment over that period.",
      "Intervention effects combine multiplicatively and are capped at 70%.",
      "Financial outputs are scenario estimates, not verified damages, profit loss, probability of default, or expected credit loss.",
    ],
  }
}

export function rankInterventionsWithinBudget(
  interventions: InterventionAssumption[],
  scenario: ScenarioInput,
  assessment: RiskAssessment,
  budget: number,
) {
  const baseline = simulateScenario(scenario, assessment)
  const ranked = interventions
    .map((intervention) => {
      const improved = simulateScenario(scenario, assessment, [intervention])
      const avoidedLoss =
        baseline.lostRevenue === null || improved.lostRevenue === null
          ? 0
          : baseline.lostRevenue - improved.lostRevenue
      return {
        intervention,
        avoidedLoss,
        benefitCost: intervention.cost ? avoidedLoss / intervention.cost : 0,
        compatible: improved.appliedEffectiveness > 0,
      }
    })
    .sort(
      (a, b) =>
        Number(b.compatible) - Number(a.compatible) ||
        b.benefitCost - a.benefitCost ||
        a.intervention.cost - b.intervention.cost,
    )
  let remaining = Math.max(0, budget)
  const selected: typeof ranked = []
  for (const item of ranked) {
    if (item.compatible && item.intervention.cost <= remaining) {
      selected.push(item)
      remaining -= item.intervention.cost
    }
  }
  return {
    ranked,
    selected,
    spent: budget - remaining,
    explanation:
      "Deterministic greedy ranking by compatible estimated avoided loss per rupee, then lower cost. This is not a mathematical optimum.",
  }
}
