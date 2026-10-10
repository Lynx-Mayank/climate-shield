import type { HazardIndicator, HazardKey } from "./hazardService"
import floodDatasetCsv from "../../flood_risk_dataset_india.csv?raw"
import naturalDisastersCsv from "../../natural_disasters.csv?raw"

export type RiskCategory = "Low" | "Moderate" | "High" | "Critical"

export const RISK_THRESHOLDS = {
  lowMax: 24,
  moderateMax: 49,
  highMax: 74,
} as const

export interface HazardScores {
  flood: number | null
  heat: number | null
  rainfall: number | null
  drought: number | null
}

export interface VulnerabilityFactors {
  industrySensitivity: number | null
  assetSensitivity: number | null
  weatherDependence: number | null
  powerDependence: number | null
  waterDependence: number | null
  supplyChainDependence: number | null
  interruptionSensitivity: number | null
}

export interface RiskLocation {
  latitude?: number | null
  longitude?: number | null
  state?: string | null
  city?: string | null
}

export interface RiskInput {
  hazards: HazardScores
  vulnerability: VulnerabilityFactors
  financials?: {
    monthlyRevenue: number | null
    monthlyOperatingCosts: number | null
  }
  resilience: number | null
  sourceLabel: string
  location?: RiskLocation | null
}

export interface RiskContribution {
  factor: string
  dimension: "Hazard" | "Vulnerability" | "Financial" | "Mitigation"
  value: number
  weight: number
  contribution: number
  explanation: string
}

export interface RiskAssessment {
  score: number
  category: RiskCategory
  hazardExposure: number
  vulnerability: number
  climateVulnerability: number
  financialRisk: number | null
  vulnerabilityFactors: VulnerabilityFactors
  calibration: {
    historicalFloodIndex: number | null
    historicalDroughtIndex: number
  }
  resilience: number
  mitigationAdjustment: number
  completeness: number
  confidence: "Low" | "Medium" | "High"
  contributions: RiskContribution[]
  drivers: string[]
  missing: string[]
  methodology: string
}

const HAZARD_WEIGHTS = {
  precipitationGroup: 0.45,
  heat: 0.25,
  drought: 0.3,
}

const VULNERABILITY_WEIGHTS: Record<keyof VulnerabilityFactors, number> = {
  industrySensitivity: 0.18,
  assetSensitivity: 0.18,
  weatherDependence: 0.14,
  powerDependence: 0.12,
  waterDependence: 0.12,
  supplyChainDependence: 0.14,
  interruptionSensitivity: 0.12,
}

type FloodCsvRow = {
  latitude: number
  longitude: number
  rainfall: number
  temperature: number
  humidity: number
  riverDischarge: number
  waterLevel: number
  elevation: number
  populationDensity: number
  infrastructure: number
  historicalFloods: number
  floodOccurred: number
}

type DisasterCsvRow = {
  country: string
  location: string
  disasterType: string
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value))
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ""
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentValue += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue)
      currentValue = ""
      continue
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1
      }
      currentRow.push(currentValue)
      if (currentRow.some((value) => value.trim() !== "")) {
        rows.push(currentRow)
      }
      currentRow = []
      currentValue = ""
      continue
    }

    currentValue += character
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue)
    if (currentRow.some((value) => value.trim() !== "")) {
      rows.push(currentRow)
    }
  }

  return rows
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null
  }

  const cleaned = value.replace(/[$,%]/g, "").replace(/\s+/g, " ").trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function featureVectorForFloodRow(row: FloodCsvRow): number[] {
  return [
    row.rainfall,
    row.temperature,
    row.humidity,
    row.riverDischarge,
    row.waterLevel,
    row.elevation,
    row.populationDensity,
    row.infrastructure,
    row.historicalFloods,
  ]
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value))
}

function fitLogisticFloodModel(rows: FloodCsvRow[]) {
  if (!rows.length) {
    return {
      weights: new Array(9).fill(0),
      bias: 0,
      means: new Array(9).fill(0),
      stds: new Array(9).fill(1),
    }
  }

  const dimensions = featureVectorForFloodRow(rows[0]).length
  const means = new Array(dimensions).fill(0)
  const stds = new Array(dimensions).fill(1)

  rows.forEach((row) => {
    featureVectorForFloodRow(row).forEach((value, index) => {
      means[index] += value
    })
  })

  means.forEach((_, index) => {
    means[index] /= rows.length
  })

  rows.forEach((row) => {
    featureVectorForFloodRow(row).forEach((value, index) => {
      const variance = (value - means[index]) ** 2
      stds[index] += variance
    })
  })

  stds.forEach((_, index) => {
    stds[index] = Math.sqrt(stds[index] / rows.length) || 1
  })

  let weights = new Array(dimensions).fill(0)
  let bias = 0

  for (let iteration = 0; iteration < 400; iteration += 1) {
    let weightGradient = new Array(dimensions).fill(0)
    let biasGradient = 0

    rows.forEach((row) => {
      const featureVector = featureVectorForFloodRow(row)
      const normalized = featureVector.map(
        (value, index) => (value - means[index]) / stds[index],
      )
      const linear =
        bias +
        normalized.reduce(
          (sum, value, index) => sum + weights[index] * value,
          0,
        )
      const probability = sigmoid(linear)
      const error = probability - row.floodOccurred

      weightGradient = weightGradient.map(
        (current, index) => current + error * normalized[index],
      )
      biasGradient += error
    })

    const step = 0.08
    weights = weights.map(
      (value, index) => value - (step / rows.length) * weightGradient[index],
    )
    bias -= (step / rows.length) * biasGradient
  }

  return { weights, bias, means, stds }
}

const floodCsvRows = parseCsvRows(floodDatasetCsv)
  .slice(1)
  .map((row) => {
    const latitude = toNumber(row[0])
    const longitude = toNumber(row[1])
    const rainfall = toNumber(row[2])
    const temperature = toNumber(row[3])
    const humidity = toNumber(row[4])
    const riverDischarge = toNumber(row[5])
    const waterLevel = toNumber(row[6])
    const elevation = toNumber(row[7])
    const landCover = row[8]?.trim()
    const soilType = row[9]?.trim()
    const populationDensity = toNumber(row[10])
    const infrastructure = toNumber(row[11])
    const historicalFloods = toNumber(row[12])
    const floodOccurred = toNumber(row[13])

    if (
      latitude === null ||
      longitude === null ||
      rainfall === null ||
      temperature === null ||
      humidity === null ||
      riverDischarge === null ||
      waterLevel === null ||
      elevation === null ||
      populationDensity === null ||
      infrastructure === null ||
      historicalFloods === null ||
      floodOccurred === null ||
      !landCover ||
      !soilType
    ) {
      return null
    }

    return {
      latitude,
      longitude,
      rainfall,
      temperature,
      humidity,
      riverDischarge,
      waterLevel,
      elevation,
      populationDensity,
      infrastructure,
      historicalFloods,
      floodOccurred: floodOccurred > 0 ? 1 : 0,
    } satisfies FloodCsvRow
  })
  .filter((row): row is FloodCsvRow => row !== null)

const floodModel = fitLogisticFloodModel(floodCsvRows)
const FLOOD_PRIOR_MAX_DISTANCE_KM = 75

const disasterCsvRows = parseCsvRows(naturalDisastersCsv)
  .slice(1)
  .map((row) => {
    const country = row[10]?.trim() ?? ""
    const location = row[13]?.trim() ?? ""
    const disasterType = row[5]?.trim() ?? ""

    if (!country || !disasterType) {
      return null
    }

    return {
      country,
      location,
      disasterType,
    } satisfies DisasterCsvRow
  })
  .filter((row): row is DisasterCsvRow => row !== null)

const indiaDroughtEvents = disasterCsvRows.filter(
  (row) => row.country === "India" && row.disasterType === "Drought",
)

function historicalFloodIndex(location?: RiskLocation | null): number | null {
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude)
  ) {
    return null
  }

  const lat = Number(location.latitude)
  const lon = Number(location.longitude)
  const nearestRows = [...floodCsvRows]
    .map((row) => ({
      row,
      distance: greatCircleDistanceKm(lat, lon, row.latitude, row.longitude),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 15)

  if (
    !nearestRows.length ||
    nearestRows[0].distance > FLOOD_PRIOR_MAX_DISTANCE_KM
  ) {
    return null
  }

  const weighted = nearestRows.reduce(
    (sum, { row, distance }) => {
      const weight = 1 / (distance * distance + 25)
      return {
        index: sum.index + floodModelIndex(row) * weight,
        weight: sum.weight + weight,
      }
    },
    { index: 0, weight: 0 },
  )
  return weighted.weight > 0 ? weighted.index / weighted.weight : null
}

function greatCircleDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(latitudeB - latitudeA)
  const longitudeDelta = radians(longitudeB - longitudeA)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(haversine))
}

function floodModelIndex(row: FloodCsvRow): number {
  const normalized = featureVectorForFloodRow(row).map((value, index) => {
    const deviation = floodModel.stds[index] || 1
    return (value - floodModel.means[index]) / deviation
  })
  const logit =
    floodModel.bias +
    normalized.reduce(
      (sum, value, index) => sum + floodModel.weights[index] * value,
      0,
    )
  return clamp(sigmoid(logit) * 100)
}

function historicalDroughtIndex(location?: RiskLocation | null): number {
  if (!location || (!location.state && !location.city)) {
    return 0
  }

  const aliases: Record<string, string[]> = {
    "west bengal": ["bengal"],
    odisha: ["orissa"],
    "tamil nadu": ["tami nadu"],
    "madhya pradesh": ["madhya pradesh"],
  }
  const normalized = (value: string) =>
    ` ${value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `
  const locationTerms = [location.state, location.city]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => [value, ...(aliases[value.trim().toLowerCase()] ?? [])])
    .map(normalized)
  const matchingEvents = indiaDroughtEvents.filter((event) => {
    const eventLocation = normalized(event.location)
    return locationTerms.some((term) => eventLocation.includes(term))
  })

  if (!matchingEvents.length) {
    return 0
  }

  const frequencyRatio =
    (matchingEvents.length / Math.max(indiaDroughtEvents.length, 1)) * 100
  return clamp(frequencyRatio)
}

interface WeightedRiskEntry {
  value: number | null
  weight: number
}

interface AvailableRiskEntry extends WeightedRiskEntry {
  value: number
}

function weightedAvailable(entries: WeightedRiskEntry[]): number {
  const available = entries.filter(
    (entry): entry is AvailableRiskEntry =>
      entry.value !== null && Number.isFinite(entry.value),
  )
  const weight = available.reduce((sum, entry) => sum + entry.weight, 0)
  if (!weight) return 50
  return available.reduce(
    (sum, entry) => sum + clamp(entry.value) * (entry.weight / weight),
    0,
  )
}

export function riskCategory(score: number): RiskCategory {
  if (score <= RISK_THRESHOLDS.lowMax) return "Low"
  if (score <= RISK_THRESHOLDS.moderateMax) return "Moderate"
  if (score <= RISK_THRESHOLDS.highMax) return "High"
  return "Critical"
}

function scoreFromDimensions(
  hazardExposure: number,
  vulnerability: number,
  resilience: number,
): number {
  const baseRisk = Math.sqrt(hazardExposure * vulnerability)
  return Math.round(clamp(baseRisk * (1 - (clamp(resilience) / 100) * 0.2)))
}

export function scoreRisk(input: RiskInput): RiskAssessment {
  const historicalFloodRisk = historicalFloodIndex(input.location)
  const historicalDroughtRisk = historicalDroughtIndex(input.location)

  const floodSignal =
    historicalFloodRisk === null
      ? (input.hazards.flood ?? 50)
      : clamp((input.hazards.flood ?? 50) * 0.65 + historicalFloodRisk * 0.35)
  const rainfallSignal =
    historicalFloodRisk === null
      ? (input.hazards.rainfall ?? 50)
      : clamp((input.hazards.rainfall ?? 50) * 0.7 + historicalFloodRisk * 0.3)
  const droughtSignal =
    historicalDroughtRisk === 0
      ? (input.hazards.drought ?? 50)
      : clamp(
          (input.hazards.drought ?? 50) * 0.75 + historicalDroughtRisk * 0.25,
        )

  const precipitation =
    input.hazards.flood === null && input.hazards.rainfall === null
      ? (historicalFloodRisk ?? null)
      : Math.max(floodSignal, rainfallSignal)

  const hazardExposure = weightedAvailable([
    { value: precipitation, weight: HAZARD_WEIGHTS.precipitationGroup },
    { value: input.hazards.heat ?? null, weight: HAZARD_WEIGHTS.heat },
    { value: droughtSignal ?? null, weight: HAZARD_WEIGHTS.drought },
  ])
  const vulnerability = weightedAvailable(
    Object.entries(VULNERABILITY_WEIGHTS).map(([key, weight]) => ({
      value: input.vulnerability[(key as keyof VulnerabilityFactors)],
      weight,
    })),
  )
  const monthlyRevenue = input.financials?.monthlyRevenue
  const monthlyOperatingCosts = input.financials?.monthlyOperatingCosts
  const financialRisk =
    monthlyRevenue !== null &&
    monthlyRevenue !== undefined &&
    Number.isFinite(monthlyRevenue) &&
    monthlyRevenue > 0 &&
    monthlyOperatingCosts !== null &&
    monthlyOperatingCosts !== undefined &&
    Number.isFinite(monthlyOperatingCosts) &&
    monthlyOperatingCosts >= 0
      ? clamp((monthlyOperatingCosts / monthlyRevenue) * 100)
      : null
  const combinedVulnerability =
    financialRisk === null
      ? vulnerability
      : vulnerability * 0.8 + financialRisk * 0.2
  const resilience = clamp(input.resilience ?? 0)
  const score = scoreFromDimensions(
    hazardExposure,
    combinedVulnerability,
    resilience,
  )
  const unmitigatedScore = scoreFromDimensions(
    hazardExposure,
    combinedVulnerability,
    0,
  )
  const mitigationAdjustment = unmitigatedScore - score
  const hazardValues = Object.values(input.hazards)
  const vulnerabilityValues = Object.values(input.vulnerability)
  const availableCount = [
    ...hazardValues,
    ...vulnerabilityValues,
    input.resilience,
  ].filter((value) => value !== null).length
  const totalCount = hazardValues.length + vulnerabilityValues.length + 1
  const completeness = Math.round((availableCount / totalCount) * 100)
  const confidence =
    completeness >= 90 && input.sourceLabel.includes("verified site hazard")
      ? "High"
      : completeness >= 65
        ? "Medium"
        : "Low"
  const missing = [
    ...Object.entries(input.hazards)
      .filter(([, value]) => value === null)
      .map(([key]) => `${key} hazard indicator`),
    ...Object.entries(input.vulnerability)
      .filter(([, value]) => value === null)
      .map(([key]) =>
        key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
      ),
    input.resilience === null ? "documented resilience controls" : null,
  ].filter(Boolean) as string[]

  const hazardFactors = [
    {
      factor: "Combined rainfall / flood proxy",
      dimension: "Hazard" as const,
      value: precipitation,
      weight: HAZARD_WEIGHTS.precipitationGroup,
      explanation:
        "Uses the larger rainfall-related indicator once, blended with the historical flood prior when available.",
    },
    {
      factor: "Extreme heat",
      dimension: "Hazard" as const,
      value: input.hazards.heat,
      weight: HAZARD_WEIGHTS.heat,
      explanation: "Represents potential heat stress on people and operations.",
    },
    {
      factor: "Water shortage",
      dimension: "Hazard" as const,
      value: droughtSignal,
      weight: HAZARD_WEIGHTS.drought,
      explanation:
        "Uses the live dryness indicator and only location-matched historical drought records.",
    },
  ]
  const vulnerabilityFactors = Object.entries(VULNERABILITY_WEIGHTS).map(
    ([key, weight]) => ({
      key: key as keyof VulnerabilityFactors,
      factor: key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
      dimension: "Vulnerability" as const,
      value: input.vulnerability[(key as keyof VulnerabilityFactors)],
      weight: weight * (financialRisk === null ? 1 : 0.8),
      explanation: "Business-profile sensitivity assumption.",
    }),
  )
  const factorInputs = [
    ...hazardFactors,
    ...vulnerabilityFactors,
    ...(financialRisk === null
      ? []
      : [
          {
            factor: "Operating cost ratio",
            dimension: "Financial" as const,
            value: financialRisk,
            weight: 0.2,
            explanation:
              "Monthly operating costs as a share of monthly revenue; higher operating-cost pressure increases business vulnerability.",
          },
        ]),
    {
      factor: "Documented resilience",
      dimension: "Mitigation" as const,
      value: resilience,
      weight: 0.2,
      explanation:
        "Documented resilience reduces the score by up to 20%; action-plan status alone does not change it.",
    },
  ]
  const contributions: RiskContribution[] = factorInputs
    .filter((item) => item.value !== null)
    .map((item) => {
      let counterfactualExposure = hazardExposure
      let counterfactualVulnerability = combinedVulnerability
      let counterfactualResilience = resilience
      if (item.dimension === "Hazard") {
        counterfactualExposure = weightedAvailable(
          hazardFactors.map((factor) => ({
            value: factor.factor === item.factor ? 50 : factor.value,
            weight: factor.weight,
          })),
        )
      } else if (item.dimension === "Vulnerability") {
        const selectedFactor = vulnerabilityFactors.find(
          (factor) => factor.factor === item.factor,
        )
        const climateWithoutFactor = weightedAvailable(
          vulnerabilityFactors.map((factor) => ({
            value: factor.key === selectedFactor?.key ? 50 : factor.value,
            weight: VULNERABILITY_WEIGHTS[factor.key],
          })),
        )
        counterfactualVulnerability =
          financialRisk === null
            ? climateWithoutFactor
            : climateWithoutFactor * 0.8 + financialRisk * 0.2
      } else {
        if (item.dimension === "Financial") {
          counterfactualVulnerability = vulnerability * 0.8 + 50 * 0.2
        } else {
          counterfactualResilience = 0
        }
      }
      const counterfactualScore = scoreFromDimensions(
        counterfactualExposure,
        counterfactualVulnerability,
        counterfactualResilience,
      )
      return {
        factor: item.factor,
        dimension: item.dimension,
        value: item.value as number,
        weight: item.weight,
        explanation: item.explanation,
        contribution: score - counterfactualScore,
      }
    })

  const drivers = [...contributions]
    .filter((item) => item.contribution !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.contribution) - Math.abs(a.contribution) ||
        a.factor.localeCompare(b.factor),
    )
    .slice(0, 4)
    .map((item) =>
      item.contribution > 0
        ? `${item.factor}: adds ${item.contribution} risk points`
        : `${item.factor}: reduces risk by ${Math.abs(item.contribution)} points`,
    )

  return {
    score,
    category: riskCategory(score),
    hazardExposure: Math.round(hazardExposure),
    vulnerability: Math.round(combinedVulnerability),
    climateVulnerability: Math.round(vulnerability),
    financialRisk:
      financialRisk === null ? null : Math.round(financialRisk * 10) / 10,
    vulnerabilityFactors: input.vulnerability,
    calibration: {
      historicalFloodIndex: historicalFloodRisk,
      historicalDroughtIndex: historicalDroughtRisk,
    },
    resilience: Math.round(resilience),
    mitigationAdjustment: Math.round(mitigationAdjustment * 10) / 10,
    completeness,
    confidence,
    contributions,
    drivers,
    missing,
    methodology:
      "Base risk = square root(hazard exposure × combined business vulnerability). When monthly revenue and operating costs are provided, business vulnerability combines climate vulnerability (80%) with operating cost ratio (20%); otherwise it uses climate vulnerability alone. Historical flood observations calibrate the precipitation proxy; only location-matched drought records inform the drought proxy. The driver list reports one-at-a-time score changes against a neutral input and is not additive. Documented mitigation reduces base risk by resilience × 20%, bounded to the 0–100 scale. Prototype decision support, not a validated credit or loss-prediction model.",
  }
}

export function hazardScoresFromIndicators(
  indicators: HazardIndicator[],
  fallback: HazardScores,
): HazardScores {
  return (["flood", "heat", "rainfall", "drought"] as HazardKey[]).reduce(
    (scores, key) => {
      const indicator = indicators.find((item) => item.key === key)
      scores[key] = indicator?.score ?? fallback[key]
      return scores
    },
    { ...fallback },
  )
}

export const DEFAULT_HAZARDS: HazardScores = {
  flood: 85,
  heat: 65,
  rainfall: 78,
  drought: 35,
}

export const DEFAULT_VULNERABILITY: VulnerabilityFactors = {
  industrySensitivity: 78,
  assetSensitivity: 82,
  weatherDependence: 70,
  powerDependence: 76,
  waterDependence: 58,
  supplyChainDependence: 80,
  interruptionSensitivity: 78,
}

export const DEFAULT_RISK_INPUT: RiskInput = {
  hazards: DEFAULT_HAZARDS,
  vulnerability: DEFAULT_VULNERABILITY,
  resilience: 30,
  sourceLabel: "synthetic demo assumptions",
}
