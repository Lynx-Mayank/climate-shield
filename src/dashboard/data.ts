import {
  DEFAULT_HAZARDS,
  DEFAULT_VULNERABILITY,
  scoreRisk,
  type RiskAssessment,
  type RiskCategory,
  type RiskInput,
} from "../services/riskScoringService"

export type { RiskCategory }

export interface Borrower {
  id: number
  name: string
  industry: string
  location: string
  score: number
  category: RiskCategory
  hazard: string
  exposure: number
  resilience: "No plan" | "Planning" | "In progress" | "Active"
  updated: string
  alert: boolean
  drivers: string[]
  mitigations: string[]
  assessment: RiskAssessment
  confidence: RiskAssessment["confidence"]
}

const borrowerRecords: Omit<Borrower, "assessment" | "confidence">[] = [
  {
    id: 1,
    name: "Aarav Textiles",
    industry: "Textiles",
    location: "Surat, Gujarat",
    score: 84,
    category: "Critical",
    hazard: "Flooding",
    exposure: 1850000,
    resilience: "In progress",
    updated: "18 Mar 2026",
    alert: true,
    drivers: [
      "Low-lying industrial zone",
      "Monsoon-sensitive inventory",
      "Single access road",
    ],
    mitigations: [
      "Elevate electrical systems",
      "Add flood barriers",
      "Review inventory cover",
    ],
  },
  {
    id: 2,
    name: "Nila Food Works",
    industry: "Food processing",
    location: "Chennai, Tamil Nadu",
    score: 78,
    category: "High",
    hazard: "Extreme heat",
    exposure: 1260000,
    resilience: "Active",
    updated: "18 Mar 2026",
    alert: true,
    drivers: [
      "Cold-chain dependency",
      "High cooling load",
      "Heat-sensitive workforce",
    ],
    mitigations: [
      "Backup cooling",
      "Shift heat-intensive work",
      "Equipment maintenance plan",
    ],
  },
  {
    id: 3,
    name: "Pragati Auto Parts",
    industry: "Manufacturing",
    location: "Pune, Maharashtra",
    score: 66,
    category: "High",
    hazard: "Heavy rainfall",
    exposure: 980000,
    resilience: "Planning",
    updated: "17 Mar 2026",
    alert: false,
    drivers: [
      "Supplier concentration",
      "Drainage constraints",
      "Just-in-time inventory",
    ],
    mitigations: [
      "Diversify suppliers",
      "Improve drainage",
      "Maintain safety stock",
    ],
  },
  {
    id: 4,
    name: "Sundar Retail Mart",
    industry: "Retail",
    location: "Kochi, Kerala",
    score: 58,
    category: "Moderate",
    hazard: "Flooding",
    exposure: 540000,
    resilience: "In progress",
    updated: "17 Mar 2026",
    alert: true,
    drivers: [
      "Ground-floor stock",
      "Coastal rainfall",
      "Limited alternate storage",
    ],
    mitigations: ["Raise stock racks", "Create evacuation checklist"],
  },
  {
    id: 5,
    name: "Jai Kisan Foods",
    industry: "Agriculture",
    location: "Nagpur, Maharashtra",
    score: 74,
    category: "High",
    hazard: "Drought",
    exposure: 1120000,
    resilience: "No plan",
    updated: "16 Mar 2026",
    alert: true,
    drivers: [
      "Water-intensive processing",
      "Single water source",
      "Seasonal suppliers",
    ],
    mitigations: [
      "Add water storage",
      "Audit process water",
      "Contract alternate suppliers",
    ],
  },
  {
    id: 6,
    name: "Udaan Logistics",
    industry: "Logistics",
    location: "Jaipur, Rajasthan",
    score: 45,
    category: "Moderate",
    hazard: "Extreme heat",
    exposure: 610000,
    resilience: "Active",
    updated: "16 Mar 2026",
    alert: false,
    drivers: ["Outdoor operations", "Vehicle heat stress"],
    mitigations: ["Heat-safe schedules", "Preventive fleet maintenance"],
  },
  {
    id: 7,
    name: "Meghna Packaging",
    industry: "Manufacturing",
    location: "Guwahati, Assam",
    score: 88,
    category: "Critical",
    hazard: "Heavy rainfall",
    exposure: 2080000,
    resilience: "Planning",
    updated: "15 Mar 2026",
    alert: true,
    drivers: [
      "River-proximate site",
      "Moisture-sensitive materials",
      "Road disruption",
    ],
    mitigations: [
      "Waterproof storage",
      "Alternate transport route",
      "Response plan",
    ],
  },
  {
    id: 8,
    name: "GreenLeaf Services",
    industry: "Services",
    location: "Bengaluru, Karnataka",
    score: 29,
    category: "Low",
    hazard: "Water stress",
    exposure: 230000,
    resilience: "Active",
    updated: "15 Mar 2026",
    alert: false,
    drivers: ["Intermittent municipal supply"],
    mitigations: ["Water-efficient fixtures", "Remote-work continuity plan"],
  },
]

const borrowerModelInputs: Record<number, RiskInput> = {
  1: {
    hazards: DEFAULT_HAZARDS,
    vulnerability: {
      ...DEFAULT_VULNERABILITY,
      industrySensitivity: 78,
      assetSensitivity: 82,
      weatherDependence: 70,
      powerDependence: 80,
      waterDependence: 60,
      supplyChainDependence: 80,
      interruptionSensitivity: 71,
    },
    resilience: 30,
    sourceLabel: "synthetic demo assumptions",
    financials: {
      monthlyRevenue: 850000,
      monthlyOperatingCosts: 560000,
    },
    location: {
      latitude: 21.1702,
      longitude: 72.8311,
      state: "Gujarat",
      city: "Surat",
    },
  },
  2: {
    hazards: { flood: 48, heat: 88, rainfall: 62, drought: 42 },
    vulnerability: {
      industrySensitivity: 82,
      assetSensitivity: 85,
      weatherDependence: 72,
      powerDependence: 90,
      waterDependence: 68,
      supplyChainDependence: 66,
      interruptionSensitivity: 84,
    },
    resilience: 48,
    sourceLabel: "synthetic demo assumptions",
  },
  3: {
    hazards: { flood: 58, heat: 61, rainfall: 76, drought: 38 },
    vulnerability: {
      industrySensitivity: 72,
      assetSensitivity: 78,
      weatherDependence: 55,
      powerDependence: 72,
      waterDependence: 45,
      supplyChainDependence: 88,
      interruptionSensitivity: 75,
    },
    resilience: 35,
    sourceLabel: "synthetic demo assumptions",
  },
  4: {
    hazards: { flood: 76, heat: 56, rainfall: 81, drought: 25 },
    vulnerability: {
      industrySensitivity: 58,
      assetSensitivity: 72,
      weatherDependence: 62,
      powerDependence: 55,
      waterDependence: 38,
      supplyChainDependence: 62,
      interruptionSensitivity: 65,
    },
    resilience: 42,
    sourceLabel: "synthetic demo assumptions",
  },
  5: {
    hazards: { flood: 35, heat: 76, rainfall: 45, drought: 88 },
    vulnerability: {
      industrySensitivity: 90,
      assetSensitivity: 68,
      weatherDependence: 92,
      powerDependence: 62,
      waterDependence: 95,
      supplyChainDependence: 78,
      interruptionSensitivity: 80,
    },
    resilience: 18,
    sourceLabel: "synthetic demo assumptions",
  },
  6: {
    hazards: { flood: 30, heat: 82, rainfall: 35, drought: 62 },
    vulnerability: {
      industrySensitivity: 52,
      assetSensitivity: 48,
      weatherDependence: 78,
      powerDependence: 42,
      waterDependence: null,
      supplyChainDependence: 65,
      interruptionSensitivity: 58,
    },
    resilience: 60,
    sourceLabel: "synthetic demo assumptions",
  },
  7: {
    hazards: { flood: 90, heat: 52, rainfall: 94, drought: 30 },
    vulnerability: {
      industrySensitivity: 74,
      assetSensitivity: 86,
      weatherDependence: 70,
      powerDependence: 68,
      waterDependence: 55,
      supplyChainDependence: 85,
      interruptionSensitivity: 90,
    },
    resilience: 24,
    sourceLabel: "synthetic demo assumptions",
  },
  8: {
    hazards: { flood: 28, heat: 62, rainfall: 38, drought: 64 },
    vulnerability: {
      industrySensitivity: 28,
      assetSensitivity: 22,
      weatherDependence: 30,
      powerDependence: 45,
      waterDependence: 52,
      supplyChainDependence: null,
      interruptionSensitivity: 32,
    },
    resilience: 72,
    sourceLabel: "synthetic demo assumptions",
  },
}

const borrowerFinancials: Record<number, {
  monthlyRevenue: number
  monthlyOperatingCosts: number
}> = {
  2: { monthlyRevenue: 1200000, monthlyOperatingCosts: 990000 },
  3: { monthlyRevenue: 1650000, monthlyOperatingCosts: 1120000 },
  4: { monthlyRevenue: 760000, monthlyOperatingCosts: 625000 },
  5: { monthlyRevenue: 980000, monthlyOperatingCosts: 910000 },
  6: { monthlyRevenue: 1400000, monthlyOperatingCosts: 910000 },
  7: { monthlyRevenue: 1850000, monthlyOperatingCosts: 1550000 },
  8: { monthlyRevenue: 620000, monthlyOperatingCosts: 390000 },
}

export const borrowers: Borrower[] = borrowerRecords.map((record) => {
  const assessment = scoreRisk({
    ...borrowerModelInputs[record.id],
    financials:
      borrowerFinancials[record.id] ??
      borrowerModelInputs[record.id].financials,
  })
  return {
    ...record,
    score: assessment.score,
    category: assessment.category,
    assessment,
    confidence: assessment.confidence,
  }
})

export const recommendations = [
  {
    id: "flood",
    title: "Elevate equipment and install flood barriers",
    problem: "Reduces direct water contact with critical equipment and stock.",
    cost: 85000,
    effectiveness: 0.45,
    targets: ["flood", "rainfall"] as const,
    rationale:
      "Engineering assumption: barriers and elevation reduce direct water contact; effectiveness must be verified for site depth and design.",
    avoidedLoss: 210000,
    priority: "Urgent",
    benefit: "Assumes a 45% reduction in vulnerable asset exposure.",
  },
  {
    id: "power",
    title: "Add backup power for critical operations",
    problem: "Maintains essential systems during grid interruptions.",
    cost: 145000,
    effectiveness: 0.5,
    targets: [] as const,
    rationale:
      "Continuity assumption: correctly sized backup power supports documented critical loads during outages.",
    avoidedLoss: 190000,
    priority: "High",
    benefit: "Assumes backup covers refrigeration and billing for 12 hours.",
  },
  {
    id: "heat",
    title: "Improve ventilation and heat controls",
    problem:
      "Limits heat stress for workers and temperature-sensitive equipment.",
    cost: 62000,
    effectiveness: 0.2,
    targets: ["heat"] as const,
    rationale:
      "Operational assumption: ventilation, shade, and cooling reduce heat-related productivity disruption.",
    avoidedLoss: 98000,
    priority: "High",
    benefit: "Assumes a 20% reduction in heat-related productivity losses.",
  },
  {
    id: "water",
    title: "Create a water storage and efficiency plan",
    problem: "Reduces disruption from short-term water shortages.",
    cost: 48000,
    effectiveness: 0.35,
    targets: ["drought"] as const,
    rationale:
      "Storage assumption: essential process demand can be covered for a limited shortage period.",
    avoidedLoss: 72000,
    priority: "Medium",
    benefit: "Assumes three days of essential process-water coverage.",
  },
  {
    id: "supplier",
    title: "Diversify critical suppliers",
    problem: "Reduces dependency on one climate-exposed delivery route.",
    cost: 25000,
    effectiveness: 0.25,
    targets: ["flood", "rainfall", "drought"] as const,
    rationale:
      "Supply-chain assumption: a qualified alternate reduces dependency-related downtime, not direct site damage.",
    avoidedLoss: 115000,
    priority: "Medium",
    benefit: "Assumes one qualified alternate supplier is available.",
  },
  {
    id: "continuity",
    title: "Document a business interruption plan",
    problem: "Speeds decisions, communications, and restart after disruption.",
    cost: 18000,
    effectiveness: 0.12,
    targets: ["flood", "rainfall", "heat", "drought"] as const,
    rationale:
      "Continuity assumption: rehearsed roles and recovery steps reduce preventable restart delay.",
    avoidedLoss: 65000,
    priority: "Medium",
    benefit: "Assumes one avoided day of preventable downtime.",
  },
]
