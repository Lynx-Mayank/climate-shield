import { useEffect, useMemo, useState, type FormEvent } from "react"

import { useLocation, useNavigate } from "react-router"

import DashboardLayout, {
  DashboardGlyph,
  DataNotice,
  RiskBadge,
  SectionHeading,
} from "./DashboardLayout"

import GeoMap, { type MapPoint } from "./GeoMap"

import PortalProfile from "./PortalProfile"

import { ApiError, apiRequest, downloadCsv } from "../services/api"

type ProgramStatus = "Draft" | "Planned" | "Active" | "Completed" | "Archived"

type Program = {
  id: number

  name: string

  description: string

  scope_state: string

  target_industries: string[]

  climate_hazard: string

  start_date: string

  end_date: string

  program_status: ProgramStatus

  target_businesses: number

  budget: number | null

  eligibility_criteria: string

  progress_notes: string

  participant_count: number

  outcomes: Record<string, string | number | null>

  baseline: {
    assessment_count: number | null
    average_risk_score: number | null
    limitation?: string
  }

  data_label: string
}

type RegionalOverview = {
  assessment_count: number | null

  states_covered: string[]

  authorized_states: string[]

  state_counts: Record<string, number>

  risk_distribution: Record<string, number>

  industry_average_scores: Record<string, {
    average_score: number
    assessment_count: number
  }>

  average_hazards: Record<string, number>

  average_completeness: number | null

  latest_assessment: string | null

  elevated_assessment_count: number | null

  privacy_threshold: number

  privacy_suppressed: boolean
}

type GovernmentMap = {
  cells: {
    latitude: number

    longitude: number

    state: string

    business_count: number

    average_score: number

    risk_distribution: Record<string, number>
  }[]

  privacy_threshold: number

  explanation: string
}

type PageState = { status: "loading" } | { status: "ready" } | {
  status: "error"
  message: string
}

const NAV = [
  {
    id: "overview",
    label: "Overview",
    icon: "overview",
    path: "/government/dashboard",
  },

  {
    id: "map",
    label: "Regional Risk Map",
    icon: "exposure",
    path: "/government/regional-risk-map",
  },

  {
    id: "analytics",
    label: "Regional Analytics",
    icon: "insights",
    path: "/government/regional-analytics",
  },

  {
    id: "programs",
    label: "Policy Programs",
    icon: "recommendations",
    path: "/government/policy-programs",
  },

  {
    id: "progress",
    label: "Program Progress",
    icon: "progress",
    path: "/government/program-progress",
  },

  {
    id: "reports",
    label: "Reports",
    icon: "reports",
    path: "/government/reports",
  },

  {
    id: "profile",
    label: "Profile",
    icon: "profile",
    path: "/government/profile",
  },
] as const

const emptyProgram = {
  name: "",

  description: "",

  scope_state: "",

  target_industries: "",

  climate_hazard: "Heavy rainfall",

  start_date: "",

  end_date: "",

  program_status: "Draft" as ProgramStatus,

  target_businesses: "0",

  budget: "",

  eligibility_criteria: "",

  progress_notes: "",

  participant_count: "0",

  outcomes: "",
}

const DEMO_PROGRAMS: Program[] = [
  {
    id: 1,
    name: "Monsoon-Ready MSME Initiative",
    description: "Illustrative planning record for flood preparedness, continuity planning, and critical-asset protection.",
    scope_state: "Gujarat",
    target_industries: ["Textiles", "Food processing"],
    climate_hazard: "Heavy rainfall",
    start_date: "2026-04-01",
    end_date: "2027-03-31",
    program_status: "Active",
    target_businesses: 120,
    budget: 2500000,
    eligibility_criteria: "Synthetic example only.",
    progress_notes: "Example progress note. No actual government program is represented.",
    participant_count: 42,
    outcomes: { "Continuity plans recorded": 28, "Sites with raised equipment": 17 },
    baseline: {
      assessment_count: 12,
      average_risk_score: 63.5,
      limitation: "Synthetic example; descriptive only.",
    },
    data_label: "Synthetic demo data — not an official government scheme.",
  },
]

const DEMO_PROGRAMS_KEY = "climateshield-government-demo-programs"

function demoPrograms(): Program[] {
  try {
    const saved = sessionStorage.getItem(DEMO_PROGRAMS_KEY)
    return saved ? JSON.parse(saved) as Program[] : DEMO_PROGRAMS
  } catch (error) {
    console.error("Unable to read Government portal demo programs.", error)
    return DEMO_PROGRAMS
  }
}

function demoOverview(state: string): RegionalOverview {
  const counts = state
    ? { [state]: state === "Gujarat" ? 12 : 9 }
    : { Gujarat: 12, Maharashtra: 9 }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return {
    assessment_count: total,
    states_covered: Object.keys(counts),
    authorized_states: ["Gujarat", "Maharashtra"],
    state_counts: counts,
    risk_distribution: state === "Gujarat"
      ? { High: 7, Moderate: 5 }
      : state === "Maharashtra"
        ? { High: 5 }
        : { High: 12, Moderate: 9 },
    industry_average_scores: state === "Maharashtra"
      ? { Manufacturing: { average_score: 58, assessment_count: 9 } }
      : state === "Gujarat"
        ? { Textiles: { average_score: 64, assessment_count: 7 } }
        : {
            Textiles: { average_score: 64, assessment_count: 7 },
            Manufacturing: { average_score: 58, assessment_count: 9 },
          },
    average_hazards: {
      flood: state === "Maharashtra" ? 62 : 74,
      rainfall: state === "Maharashtra" ? 58 : 70,
      heat: state === "Maharashtra" ? 66 : 61,
      drought: state === "Maharashtra" ? 72 : 48,
    },
    average_completeness: 82,
    latest_assessment: "2026-10-01T00:00:00Z",
    elevated_assessment_count: Math.max(5, Math.round(total * 0.62)),
    privacy_threshold: 5,
    privacy_suppressed: false,
  }
}

function demoMap(state: string, hazard: string): GovernmentMap {
  const demoCells: GovernmentMap["cells"] = [
    { latitude: 21.0, longitude: 72.75, state: "Gujarat", business_count: 7, average_score: 64, risk_distribution: { High: 7 } },
    { latitude: 22.0, longitude: 73.0, state: "Gujarat", business_count: 5, average_score: 59, risk_distribution: { Moderate: 5 } },
    { latitude: 18.5, longitude: 73.75, state: "Maharashtra", business_count: 5, average_score: 58, risk_distribution: { High: 5 } },
    { latitude: 19.25, longitude: 73.0, state: "Maharashtra", business_count: 4, average_score: 52, risk_distribution: { Moderate: 4 } },
  ]
  const cells = demoCells.filter(
    (cell) => cell.business_count >= 5 && (!state || cell.state === state),
  )
  const hazardAdjustment: Record<string, number> = {
    flood: 8,
    rainfall: 5,
    heat: 2,
    drought: 6,
  }
  return {
    cells: cells.map((cell) => ({
      ...cell,
      average_score: Math.min(100, cell.average_score + (hazardAdjustment[hazard] ?? 0)),
    })),
    privacy_threshold: 5,
    explanation: "Synthetic demo data. Sample cells are coarsened and shown only when the example group contains at least five businesses.",
  }
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

function RiskDistribution({ values }: { values: Record<string, number> }) {
  const rows = ["Critical", "High", "Moderate", "Low", "Unavailable"].filter(
    (item) => values[item] != null,
  )

  return rows.length ? (
    <div className="analyst-distribution">
      {rows.map((key) => (
        <div key={key}>
          <span>
            <RiskBadge category={key} />
          </span>
          <strong>{values[key]}</strong>
          <small>businesses</small>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      No privacy-safe risk distribution is available in this scope.
    </div>
  )
}

function ProgramEditor({
  states,

  onSaved,
  editing,
  onCancel,
}: {
  states: string[]

  onSaved: () => void
  editing: Program | null
  onCancel: () => void
}) {
  const [form, setForm] = useState(emptyProgram)

  const [message, setMessage] = useState("")

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) {
      setForm(emptyProgram)
      return
    }
    setForm({
      name: editing.name,
      description: editing.description,
      scope_state: editing.scope_state,
      target_industries: editing.target_industries.join(", "),
      climate_hazard: editing.climate_hazard,
      start_date: editing.start_date,
      end_date: editing.end_date,
      program_status: editing.program_status,
      target_businesses: String(editing.target_businesses),
      budget: editing.budget == null ? "" : String(editing.budget),
      eligibility_criteria: editing.eligibility_criteria,
      progress_notes: editing.progress_notes,
      participant_count: String(editing.participant_count),
      outcomes: Object.entries(editing.outcomes)
        .map(([key, value]) => `${key}=${value ?? ""}`)
        .join("\n"),
    })
    setMessage("")
  }, [editing])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (form.end_date < form.start_date) {
      setMessage("Program end date must be on or after its start date.")
      return
    }

    setSaving(true)

    setMessage("")

    const outcomes: Record<string, string | number | null> = {}

    for (const row of form.outcomes.split(/\r?\n/).filter(Boolean)) {
      const separator = row.indexOf("=")

      if (separator <= 0) continue

      const key = row.slice(0, separator).trim()

      const raw = row.slice(separator + 1).trim()

      const number = Number(raw)

      outcomes[key] = raw && Number.isFinite(number) ? number : raw || null
    }

    try {
      const payload = {
        ...form,
        target_industries: form.target_industries
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        target_businesses: Number(form.target_businesses),
        budget: form.budget ? Number(form.budget) : null,
        participant_count: Number(form.participant_count),
        outcomes,
      }
      if (
        sessionStorage.getItem("climateshield_demo_role") === "government"
      ) {
        const existing = demoPrograms()
        const savedProgram: Program = {
          ...payload,
          id: editing?.id ?? Math.max(0, ...existing.map((item) => item.id)) + 1,
          baseline: editing?.baseline ?? {
            assessment_count: null,
            average_risk_score: null,
            limitation: "Synthetic demo record; no assessment baseline is available.",
          },
          data_label: "Synthetic demo data — not an official government scheme.",
        }
        const updated = editing
          ? existing.map((item) =>
              item.id === editing.id ? savedProgram : item,
            )
          : [savedProgram, ...existing]
        sessionStorage.setItem(DEMO_PROGRAMS_KEY, JSON.stringify(updated))
      } else {
        await apiRequest(
          editing
            ? `/government/programs/${editing.id}`
            : "/government/programs",
          {
            method: editing ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        )
      }

      setMessage(
        "Program record saved. It is user-entered and is not an automatically verified government scheme.",
      )

      setForm(emptyProgram)

      onSaved()
      onCancel()
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Program could not be saved.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="content-card government-program-form" onSubmit={submit}>
      <div className="card-heading">
        <div>
          <strong>
            {editing ? `Edit ${editing.name}` : "Create a resilience initiative"}
          </strong>
          <span>
            {sessionStorage.getItem("climateshield_demo_role") === "government"
              ? "Demo entries are saved in this browser session only."
              : "All scope and program fields are validated by the server."}
          </span>
        </div>
      </div>
      <div className="government-form-grid">
        <label>
          Program name
          <input
            required
            maxLength={180}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Geographic scope
          <select
            required
            value={form.scope_state}
            onChange={(event) =>
              setForm({ ...form, scope_state: event.target.value })
            }
          >
            <option value="">Select authorized state</option>
            {states.map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
        <label>
          Climate hazard
          <select
            value={form.climate_hazard}
            onChange={(event) =>
              setForm({ ...form, climate_hazard: event.target.value })
            }
          >
            <option>Heavy rainfall</option>
            <option>Flood-related exposure</option>
            <option>Extreme heat</option>
            <option>Water shortage</option>
            <option>Multi-hazard resilience</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={form.program_status}
            onChange={(event) =>
              setForm({
                ...form,
                program_status: event.target.value as ProgramStatus,
              })
            }
          >
            {["Draft", "Planned", "Active", "Completed", "Archived"].map(
              (status) => (
                <option key={status}>{status}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Planned start
          <input
            required
            type="date"
            value={form.start_date}
            onChange={(event) =>
              setForm({ ...form, start_date: event.target.value })
            }
          />
        </label>
        <label>
          Planned end
          <input
            required
            type="date"
            value={form.end_date}
            onChange={(event) =>
              setForm({ ...form, end_date: event.target.value })
            }
          />
        </label>
        <label>
          Target number of MSMEs
          <input
            type="number"
            min="0"
            value={form.target_businesses}
            onChange={(event) =>
              setForm({ ...form, target_businesses: event.target.value })
            }
          />
        </label>
        <label>
          Budget (optional; entered by you)
          <input
            type="number"
            min="0"
            value={form.budget}
            onChange={(event) =>
              setForm({ ...form, budget: event.target.value })
            }
          />
        </label>
        <label className="is-wide">
          Target industries (comma separated)
          <input
            value={form.target_industries}
            onChange={(event) =>
              setForm({ ...form, target_industries: event.target.value })
            }
          />
        </label>
        <label className="is-wide">
          Objectives / description
          <textarea
            maxLength={3000}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <label className="is-wide">
          Eligibility criteria (optional)
          <textarea
            maxLength={2000}
            value={form.eligibility_criteria}
            onChange={(event) =>
              setForm({ ...form, eligibility_criteria: event.target.value })
            }
          />
        </label>
        <label className="is-wide">
          Progress notes
          <textarea
            maxLength={4000}
            value={form.progress_notes}
            onChange={(event) =>
              setForm({ ...form, progress_notes: event.target.value })
            }
          />
        </label>
        <label>
          Reported participants
          <input
            type="number"
            min="0"
            value={form.participant_count}
            onChange={(event) =>
              setForm({ ...form, participant_count: event.target.value })
            }
          />
        </label>
        <label className="is-wide">
          Reported outcome indicators (one `name=value` per line)
          <textarea
            value={form.outcomes}
            onChange={(event) =>
              setForm({ ...form, outcomes: event.target.value })
            }
          />
        </label>
      </div>
      <div className="form-footer">
        <button type="submit" disabled={saving}>
          {saving
            ? "Saving…"
            : editing
              ? "Save program updates"
              : "Save program"}
        </button>
        {editing && (
          <button type="button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
        {message && <span role="status">{message}</span>}
      </div>
    </form>
  )
}

function ProgramList({
  items,

  onChanged,
  onEdit,
}: {
  items: Program[]

  onChanged: () => void
  onEdit: (program: Program) => void
}) {
  const [error, setError] = useState("")

  async function changeStatus(program: Program, program_status: ProgramStatus) {
    setError("")

    try {
      if (
        sessionStorage.getItem("climateshield_demo_role") === "government"
      ) {
        const updated = demoPrograms().map((item) =>
          item.id === program.id ? { ...item, program_status } : item,
        )
        sessionStorage.setItem(DEMO_PROGRAMS_KEY, JSON.stringify(updated))
        onChanged()
        return
      }
      await apiRequest(`/government/programs/${program.id}`, {
        method: "PATCH",

        body: JSON.stringify({
          name: program.name,

          description: program.description,

          scope_state: program.scope_state,

          target_industries: program.target_industries,

          climate_hazard: program.climate_hazard,

          start_date: program.start_date,

          end_date: program.end_date,

          program_status,

          target_businesses: program.target_businesses,

          budget: program.budget,

          eligibility_criteria: program.eligibility_criteria,

          progress_notes: program.progress_notes,

          participant_count: program.participant_count,

          outcomes: program.outcomes,
        }),
      })

      onChanged()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Program update failed.",
      )
    }
  }

  if (!items.length)
    return (
      <div className="empty-state">
        No policy initiative records exist in your authorized states yet. You
        can create a planning record above.
      </div>
    )

  return (
    <div className="government-program-list">
      {error && (
        <div className="partial-data-warning" role="alert">
          {error}
        </div>
      )}
      {items.map((item) => (
        <article className="content-card government-program" key={item.id}>
          <div className="government-program__header">
            <div>
              <strong>{item.name}</strong>
              <span>
                {item.scope_state} · {item.climate_hazard} ·{" "}
                {item.target_industries.join(", ") || "All entered industries"}
              </span>
            </div>
            <div className="government-program__actions">
              <select
                aria-label={`Update status for ${item.name}`}
                value={item.program_status}
                onChange={(event) =>
                  void changeStatus(item, event.target.value as ProgramStatus)
                }
              >
                {["Draft", "Planned", "Active", "Completed", "Archived"].map(
                  (status) => (
                    <option key={status}>{status}</option>
                  ),
                )}
              </select>
              <button
                className="print-button"
                type="button"
                onClick={() => onEdit(item)}
              >
                Edit details
              </button>
            </div>
          </div>
          <p>{item.description || "No objectives entered."}</p>
          <div className="government-program__facts">
            <span>
              {item.start_date} – {item.end_date}
            </span>
            <span>Target: {item.target_businesses}</span>
            <span>Reported participation: {item.participant_count}</span>
            <span>
              Budget:{" "}
              {item.budget == null
                ? "Not entered"
                : `₹${item.budget.toLocaleString("en-IN")}`}
            </span>
          </div>
          <p className="small-note">
            {item.progress_notes || "No progress notes recorded."}
          </p>
          <small>{item.data_label}</small>
        </article>
      ))}
    </div>
  )
}

export default function GovernmentPortal() {
  const location = useLocation()

  const navigate = useNavigate()

  const isDemo =
    sessionStorage.getItem("climateshield_demo_role") === "government"

  const [state, setState] = useState("")

  const [hazard, setHazard] = useState("")

  const [overview, setOverview] = useState<RegionalOverview | null>(null)

  const [mapData, setMapData] = useState<GovernmentMap | null>(null)

  const [programs, setPrograms] = useState<Program[]>([])

  const [editingProgram, setEditingProgram] = useState<Program | null>(null)

  const [impact, setImpact] = useState<Record<number, unknown>>({})

  const [status, setStatus] = useState<PageState>({ status: "loading" })

  const [reportError, setReportError] = useState("")

  const dataLabel = isDemo ? "SYNTHETIC DEMO" : "AUTHORIZED DATA"

  const activeView =
    NAV.find((item) => item.path === location.pathname)?.id ?? "overview"

  const states = overview?.authorized_states ?? []

  function loadData() {
    setStatus({ status: "loading" })

    if (isDemo) {
      setOverview(demoOverview(state))
      setMapData(demoMap(state, hazard))
      setPrograms(
        demoPrograms().filter((program) => !state || program.scope_state === state),
      )
      setImpact({
        1: {
          coverage: { entered_participant_count: 42 },
          risk_indicators: {
            baseline_average: 63.5,
            subsequent_average: 59.2,
            descriptive_change: -4.3,
          },
          data_completeness: 82,
          limitation: "Synthetic example only; descriptive change is not evidence of program impact.",
        },
      })
      setStatus({ status: "ready" })
      return
    }

    const query = state ? `?state=${encodeURIComponent(state)}` : ""

    const mapQuery = new URLSearchParams()

    if (state) mapQuery.set("state", state)

    if (hazard) mapQuery.set("hazard", hazard)

    void Promise.all([
      apiRequest<RegionalOverview>(`/government/overview${query}`),

      apiRequest<GovernmentMap>(
        `/government/map${mapQuery.size ? `?${mapQuery}` : ""}`,
      ),

      apiRequest<{ items: Program[]; authorized_states: string[] }>(
        `/government/programs${query}`,
      ),
    ])
      .then(([summary, map, programResult]) => {
        setOverview(summary)

        setMapData(map)

        setPrograms(programResult.items)

        setStatus({ status: "ready" })
      })
      .catch((error: unknown) => {
        setStatus({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Regional data could not be loaded.",
        })
      })
  }

  useEffect(() => {
    void loadData()
  }, [state, hazard])

  useEffect(() => {
    let active = true

    if (isDemo) return

    void Promise.all(
      programs.map(async (program) => {
        const data = await apiRequest(
          `/government/programs/${program.id}/impact`,
        )

        return [program.id, data] as const
      }),
    )
      .then((entries) => {
        if (active) setImpact(Object.fromEntries(entries))
      })
      .catch(() => {
        if (active) setImpact({})
      })

    return () => {
      active = false
    }
  }, [programs])

  function navigateTo(view: string) {
    const target = NAV.find((item) => item.id === view)

    if (target) navigate(target.path)
  }

  function editProgram(program: Program) {
    setEditingProgram(program)
    navigateTo("programs")
  }

  const points: MapPoint[] = useMemo(
    () =>
      (mapData?.cells ?? []).map((cell, index) => ({
        id: `${cell.state}-${index}`,

        latitude: cell.latitude,

        longitude: cell.longitude,

        label: `${cell.state} · aggregated`,

        detail: `${cell.business_count} businesses · average score ${cell.average_score}`,

        category:
          cell.average_score >= 75
            ? "Critical"
            : cell.average_score >= 50
              ? "High"
              : cell.average_score >= 25
                ? "Moderate"
                : "Low",
      })),
    [mapData],
  )

  async function downloadReport() {
    setReportError("")

    if (isDemo && overview) {
      const rows = [
        ["Metric", "Value"],
        ["Data label", "Synthetic demo data"],
        ["Geographic scope", state || "All assigned demo states"],
        ["Assessment count", overview.assessment_count ?? "Suppressed"],
        ["Privacy threshold", overview.privacy_threshold],
        ...Object.entries(overview.risk_distribution).map(
          ([category, count]) => [`${category} assessments`, count],
        ),
        ...Object.entries(overview.average_hazards).map(
          ([indicator, score]) => [`Average ${indicator} score`, score],
        ),
      ]
      const csv = rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\r\n")
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
      const link = document.createElement("a")
      link.href = url
      link.download = "climateshield-government-demo-summary.csv"
      link.hidden = true
      document.body.append(link)
      link.click()
      window.setTimeout(() => {
        link.remove()
        URL.revokeObjectURL(url)
      }, 1000)
      return
    }

    try {
      await downloadCsv(
        `/government/reports.csv${
          state ? `?state=${encodeURIComponent(state)}` : ""
        }`,
        "climateshield-regional-summary.csv",
      )
    } catch (error) {
      setReportError(
        error instanceof ApiError
          ? error.message
          : "Regional report export failed.",
      )
    }
  }

  if (status.status === "error") {
    return (
      <DashboardLayout
        productLabel="Government & Policy"
        contextTitle="Regional Workspace"
        contextSubtitle="No unauthorized records are displayed"
        navigation={NAV.map(({ path: _path, ...item }) => item)}
        activeView={activeView}
        onNavigate={navigateTo}
      >
        <SectionHeading
          eyebrow="Access controlled"
          title="Regional data unavailable"
          description={status.message}
        />
        <DataNotice label={dataLabel}>
          Government endpoints filter by approved state scope and suppress
          aggregate counts below five. No business financial information is
          returned.
        </DataNotice>
      </DashboardLayout>
    )
  }

  if (status.status === "loading" || !overview) {
    return (
      <DashboardLayout
        productLabel="Government & Policy"
        contextTitle="Regional Workspace"
        contextSubtitle="Loading approved scopes"
        navigation={NAV.map(({ path: _path, ...item }) => item)}
        activeView={activeView}
        onNavigate={navigateTo}
      >
        <div className="empty-state">
          Loading scoped regional indicators and authorized programs…
        </div>
      </DashboardLayout>
    )
  }

  const children = (
    <>
      {activeView === "overview" && (
        <>
          <SectionHeading
            eyebrow="Government and policy portal"
            title="Regional Resilience Overview"
            description={isDemo
              ? "Explore synthetic, privacy-thresholded regional indicators and policy planning tools."
              : "Privacy-thresholded indicators for the regions explicitly assigned to your approved account."}
          />
          <div className="government-toolbar">
            <label>
              {isDemo ? "Demo state scope" : "Authorized state scope"}
              <select
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="">
                  {isDemo ? "All demo states" : "All assigned states"}
                </option>
                {states.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <span>
              {isDemo ? "Demo scope: " : "Assigned scope: "}
              {states.join(", ") || "None"}
            </span>
          </div>
          <DataNotice label={dataLabel}>
            Only aggregate records are returned. Groups smaller than five are
            suppressed. These risk estimates do not establish an official
            hazard, causal policy impact, or validated credit outcome.
          </DataNotice>
          <section className="portfolio-metrics">
            <Metric
              label="Assessed MSMEs"
              value={
                overview.assessment_count == null
                  ? "Suppressed"
                  : String(overview.assessment_count)
              }
              note={
                overview.privacy_suppressed
                  ? "Below the privacy threshold"
                  : isDemo
                    ? "Synthetic sample count"
                    : "Saved assessments in scope"
              }
            />
            <Metric
              label="Elevated scores"
              value={
                overview.elevated_assessment_count == null
                  ? "Suppressed"
                  : String(overview.elevated_assessment_count)
              }
              note="Prototype scores ≥50; not official hazard findings"
            />
            <Metric
              label="Coverage"
              value={
                overview.states_covered.length
                  ? String(overview.states_covered.length)
                  : overview.privacy_suppressed
                    ? "Suppressed"
                    : "0"
              }
              note={
                overview.states_covered.join(", ") ||
                "No reportable region group"
              }
            />
            <Metric
              label="Data completeness"
              value={
                overview.average_completeness == null
                  ? "Unavailable"
                  : `${overview.average_completeness}%`
              }
              note="Assessment inputs, not climate coverage"
            />
          </section>
          <section className="content-card">
            <div className="card-heading">
              <div>
                <strong>Regional risk distribution</strong>
                <span>Only counts at or above five are reported</span>
              </div>
            </div>
            <RiskDistribution values={overview.risk_distribution} />
          </section>
          <section className="content-card">
            <div className="card-heading">
              <div>
                <strong>Industry vulnerability summaries</strong>
                <span>
                  Mean stored prototype risk score, minimum group size five
                </span>
              </div>
            </div>
            {Object.keys(overview.industry_average_scores).length ? (
              <div className="analyst-factor-grid">
                {Object.entries(overview.industry_average_scores).map(
                  ([industry, item]) => (
                    <div key={industry}>
                      <span>
                        {industry} · {item.assessment_count} assessments
                      </span>
                      <strong>{item.average_score}/100</strong>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="empty-state">
                No industry group meets the reporting threshold.
              </div>
            )}
          </section>
          <DataNotice label={dataLabel}>
            Assessment timestamps are available; climate source freshness is not
            inferred from assessment date.
          </DataNotice>
        </>
      )}
      {activeView === "profile" && <PortalProfile portal="government" />}
      {activeView === "map" && (
        <>
          <SectionHeading
            eyebrow="Regional risk map"
            title="Privacy-Safe Geographic Summary"
            description="Coarse assessment cells for the assigned region; no individual business markers or synthetic hazard boundaries."
          />
          <div className="government-toolbar">
            <label>
              State
              <select
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="">
                  {isDemo ? "All demo states" : "All assigned states"}
                </option>
                {states.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Indicator
              <select
                value={hazard}
                onChange={(event) => setHazard(event.target.value)}
              >
                <option value="">Overall prototype score</option>
                <option value="flood">Flood-related rainfall proxy</option>
                <option value="rainfall">Rainfall</option>
                <option value="heat">Heat</option>
                <option value="drought">Short-window dryness</option>
              </select>
            </label>
          </div>
          <GeoMap
            points={points}
            fitPoints
            zoom={5}
            emptyMessage="No aggregated location cell meets the minimum group size."
            className="government-map"
          />
          <DataNotice label={dataLabel}>
            {mapData?.explanation ?? "No map provenance available."}{" "}
            {hazard
              ? "Selected values are derived indicators, not confirmed events."
              : "Overall risk scores are prototype estimates."}
          </DataNotice>
        </>
      )}
      {activeView === "analytics" && (
        <>
          <SectionHeading
            eyebrow="Regional analytics"
            title="Available Climate Indicators"
            description="Summaries from saved records within assigned state scope. Fine-grained district reporting is intentionally unavailable without reliable identifiers."
          />
          <div className="government-toolbar">
            <label>
              State
              <select
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="">
                  {isDemo ? "All demo states" : "All assigned states"}
                </option>
                {states.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <section className="portfolio-metrics">
            {Object.entries(overview.average_hazards).map(([key, value]) => (
              <Metric
                key={key}
                label={key.replace(/_/g, " ")}
                value={`${value}/100`}
                note="Mean available stored indicator"
              />
            ))}
          </section>
          <DataNotice label={dataLabel}>
            Rainfall-derived flood indicators do not confirm inundation. The
            application does not convert coarse coordinates into district-level
            statistics or draw fabricated hazard polygons.
          </DataNotice>
        </>
      )}
      {activeView === "programs" && (
        <>
          <SectionHeading
            eyebrow="Policy program records"
            title="Resilience Initiative Management"
            description={isDemo
              ? "Try creating and managing illustrative programs. Demo changes are saved for this browser session only."
              : "Create and manage programs in your authorized regions. Records are user-entered and not verified schemes."}
          />
          <DataNotice label={dataLabel}>
            No government subsidy, grant, endorsement, or eligibility rule is
            presumed. Enter only information you are authorized to manage.
          </DataNotice>
          <ProgramEditor
            states={states}
            onSaved={loadData}
            editing={editingProgram}
            onCancel={() => setEditingProgram(null)}
          />
          <ProgramList
            items={programs}
            onChanged={loadData}
            onEdit={editProgram}
          />
        </>
      )}
      {activeView === "progress" && (
        <>
          <SectionHeading
            eyebrow="Program monitoring"
            title="Recorded Coverage and Outcomes"
            description="Reported program participation and descriptive pre/post indicators; this is not causal impact evaluation."
          />
          <DataNotice label={dataLabel}>
            Participation and outcome indicators are entered by authorized
            officials. Subsequent score changes may reflect data coverage,
            conditions, or model assumptions and cannot be attributed to a
            program.
          </DataNotice>
          <ProgramList
            items={programs}
            onChanged={loadData}
            onEdit={editProgram}
          />
          <section className="government-program-list">
            {programs.map((program) => {
              const summary = impact[program.id] as {
                coverage?: Record<string, number | null>
                risk_indicators?: Record<string, number | string | null>
                reported_outcomes?: Record<string, unknown>
                data_completeness?: number | null
                limitation?: string
              } | undefined

              return (
                <article
                  className="content-card government-program"
                  key={program.id}
                >
                  <div className="card-heading">
                    <div>
                      <strong>{program.name} · impact tracking</strong>
                      <span>
                        {program.scope_state} · {program.start_date} onward
                      </span>
                    </div>
                  </div>
                  <div className="analyst-factor-grid">
                    <div>
                      <span>Reported participants</span>
                      <strong>
                        {summary?.coverage?.entered_participant_count ??
                          program.participant_count}
                      </strong>
                    </div>
                    <div>
                      <span>Baseline mean score</span>
                      <strong>
                        {summary?.risk_indicators?.baseline_average ??
                          "Unavailable"}
                      </strong>
                    </div>
                    <div>
                      <span>Subsequent mean score</span>
                      <strong>
                        {summary?.risk_indicators?.subsequent_average ??
                          "Unavailable"}
                      </strong>
                    </div>
                    <div>
                      <span>Descriptive change</span>
                      <strong>
                        {summary?.risk_indicators?.descriptive_change ??
                          "Unavailable"}
                      </strong>
                    </div>
                    <div>
                      <span>Completeness</span>
                      <strong>
                        {summary?.data_completeness == null
                          ? "Unavailable"
                          : `${summary.data_completeness}%`}
                      </strong>
                    </div>
                  </div>
                  <p className="small-note">
                    {summary?.limitation ?? "No impact snapshot is available."}
                  </p>
                </article>
              )
            })}
            {!programs.length && (
              <div className="empty-state">
                Create an initiative record to begin recording progress.
              </div>
            )}
          </section>
        </>
      )}
      {activeView === "reports" && (
        <>
          <SectionHeading
            eyebrow="Regional reporting"
            title={isDemo ? "Synthetic Regional Summary" : "Authorized Regional Summary"}
            description={isDemo
              ? "Download a sample CSV of synthetic aggregate categories and program indicators."
              : "Download state-scoped aggregate categories and recorded program progress with small-cell suppression."}
            action={
              <button
                className="print-button"
                type="button"
                onClick={() => void downloadReport()}
              >
                Download regional CSV
              </button>
            }
          />
          <div className="government-toolbar">
            <label>
              State scope
              <select
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="">
                  {isDemo ? "All demo states" : "All assigned states"}
                </option>
                {states.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          {reportError && (
            <div className="partial-data-warning" role="alert">
              {reportError}
            </div>
          )}
          <RiskDistribution values={overview.risk_distribution} />
          <DataNotice label={dataLabel}>
            Reports include scope, available assessment periods, suppressed
            categories, program statuses, and limitations. PDF export is
            available using Print / Save PDF.
          </DataNotice>
          <button
            className="print-button"
            type="button"
            onClick={() => window.print()}
          >
            <DashboardGlyph name="reports" /> Print / Save PDF
          </button>
        </>
      )}
    </>
  )

  return (
    <DashboardLayout
      productLabel="Government & Policy"
      contextTitle="Regional Workspace"
      contextSubtitle={states.join(", ") || "No assigned state scope"}
      navigation={NAV.map(({ path: _path, ...item }) => item)}
      activeView={activeView}
      onNavigate={navigateTo}
    >
      {isDemo && (
        <DataNotice label="SYNTHETIC DEMO">
          This preview uses invented regional aggregates and program records.
          No real businesses, official government data, or authenticated
          records are shown. Demo program changes last only for this browser
          session.
        </DataNotice>
      )}
      {children}
    </DashboardLayout>
  )
}
