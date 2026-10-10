import { useState, type MouseEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { logout } from "../services/auth"

export type DashboardIcon = "overview" | "risk" | "simulator" | "recommendations" | "progress" | "reports" | "profile" | "settings" | "portfolio" | "borrowers" | "exposure" | "alerts" | "insights" | "signout" | "menu" | "bell" | "search" | "close"

const iconPaths: Record<DashboardIcon, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  risk: (
    <>
      <path d="M12 3v18M3 12h18" />
      <circle cx="12" cy="12" r="8" />
    </>
  ),
  simulator: (
    <>
      <path d="M4 19V5m0 14h16" />
      <path d="m7 15 4-5 3 2 5-7" />
    </>
  ),
  recommendations: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.5 14.5a7 7 0 1 1 7 0c-.9.7-1.5 1.4-1.5 2.5h-4c0-1.1-.6-1.8-1.5-2.5Z" />
    </>
  ),
  progress: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16.5 8" />
    </>
  ),
  reports: (
    <>
      <path d="M6 2h9l4 4v16H6z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4.3 3.5-6.5 8-6.5s7.2 2.2 8 6.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  portfolio: (
    <>
      <path d="M3 20h18M5 20V9h4v11m2 0V4h4v16m2 0v-7h4v7" />
    </>
  ),
  borrowers: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 15c3.7-.8 6.2.8 7 5" />
    </>
  ),
  exposure: (
    <>
      <path d="M12 2c4 4.5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7.5 7-12Z" />
      <path d="M8 15c1.5 1.5 3 2 5 1" />
    </>
  ),
  alerts: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  insights: (
    <>
      <path d="m4 17 5-5 4 3 7-9" />
      <path d="M15 6h5v5" />
    </>
  ),
  signout: (
    <>
      <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
}

export function DashboardGlyph({
  name,
  size = 19,
}: {
  name: DashboardIcon
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  )
}

export interface NavigationItem {
  id: string
  label: string
  icon: DashboardIcon
}

interface DashboardLayoutProps {
  productLabel: string
  contextTitle: string
  contextSubtitle: string
  navigation: NavigationItem[]
  activeView: string
  onNavigate: (id: string) => void
  children: ReactNode
}

export default function DashboardLayout({
  productLabel,
  contextTitle,
  contextSubtitle,
  navigation,
  activeView,
  onNavigate,
  children,
}: DashboardLayoutProps) {
  const routerNavigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [signoutError, setSignoutError] = useState("")
  const activeLabel =
    navigation.find((item) => item.id === activeView)?.label ?? "Dashboard"

  function navigate(id: string) {
    onNavigate(id)
    setSidebarOpen(false)
  }

  async function signOut(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    setSignoutError("")
    if (sessionStorage.getItem("climateshield_demo_role")) {
      sessionStorage.removeItem("climateshield_demo_role")
      routerNavigate("/")
      return
    }
    try {
      await logout()
      routerNavigate("/")
    } catch (error) {
      setSignoutError(
        error instanceof Error
          ? `Unable to end the server session: ${error.message}`
          : "Unable to end the server session.",
      )
    }
  }

  return (
    <div className="dashboard-shell">
      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? "dashboard-sidebar--open" : ""
        }`}
      >
        <div className="dashboard-brand">
          <div className="dashboard-brand__mark">CS</div>
          <div>
            <strong>ClimateShield</strong>
            <span>{productLabel}</span>
          </div>
          <button
            className="dashboard-icon-button dashboard-sidebar__close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <DashboardGlyph name="close" />
          </button>
        </div>
        <div className="dashboard-demo-pill">
          <span />
          {sessionStorage.getItem("climateshield_demo_role") ===
            (productLabel === "Business"
              ? "owner"
              : productLabel === "Government & Policy"
                ? "government"
                : "lender")
            ? "Demo mode · Sample data"
            : "Authenticated workspace"}
        </div>
        <nav
          className="dashboard-navigation"
          aria-label={`${productLabel} navigation`}
        >
          {navigation.map((item) => (
            <button
              className={activeView === item.id ? "is-active" : ""}
              type="button"
              onClick={() => navigate(item.id)}
              key={item.id}
            >
              <DashboardGlyph name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <Link className="dashboard-signout" to="/" onClick={signOut}>
          <DashboardGlyph name="signout" />
          <span>Sign out</span>
        </Link>
      </aside>
      {sidebarOpen && (
        <button
          className="dashboard-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="dashboard-workspace">
        <header className="dashboard-topbar">
          <button
            className="dashboard-icon-button dashboard-menu-button"
            type="button"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <DashboardGlyph name="menu" />
          </button>
          <div className="dashboard-topbar__context">
            <span>{activeLabel}</span>
            <strong>{contextTitle}</strong>
            <small>{contextSubtitle}</small>
          </div>
          <div className="dashboard-topbar__actions">
            <label className="dashboard-search">
              <DashboardGlyph name="search" size={17} />
              <input
                aria-label="Quick navigation"
                placeholder="Search this dashboard"
                onChange={(event) => {
                  const match = navigation.find(
                    (item) =>
                      item.label
                        .toLowerCase()
                        .includes(event.target.value.toLowerCase()) &&
                      event.target.value.length > 2,
                  )
                  if (match) onNavigate(match.id)
                }}
              />
            </label>
            <div className="dashboard-notifications">
              <button
                className="dashboard-icon-button"
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((value) => !value)}
              >
                <DashboardGlyph name="bell" />
                <span className="notification-dot" />
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <strong>Demo notifications</strong>
                  <p>Heavy rainfall watch · Sample alert</p>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(productLabel === "Business" ? "risk" : "alerts")
                    }
                  >
                    View alerts
                  </button>
                </div>
              )}
            </div>
            <button
              className="dashboard-avatar"
              type="button"
              aria-label="Profile menu"
            >
              DM
            </button>
          </div>
        </header>
        <main className="dashboard-main">
          {signoutError && (
            <p className="form-message" role="alert">
              {signoutError}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

export function DataNotice({
  children,
  label = "DEMO DATA",
}: {
  children: ReactNode
  label?: string
}) {
  return (
    <div className="data-notice">
      <strong>{label}</strong>
      <span>{children}</span>
    </div>
  )
}

export function RiskBadge({ category }: { category: string }) {
  return (
    <span
      className={`risk-badge risk-badge--${category.toLowerCase().replace(" ", "-")}`}
    >
      {category}
    </span>
  )
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}
