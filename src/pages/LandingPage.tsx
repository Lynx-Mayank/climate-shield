import { ChangeEvent, FormEvent, ReactNode, useState } from "react"
import { Link, useNavigate } from "react-router"
import backgroundImage from "../assets/climate-india-background-new.png"
import { ApiError } from "../services/api"
import { authenticate, type AccountType } from "../services/auth"

type IconName =
  | "bank"
  | "bar-chart"
  | "check"
  | "eye"
  | "eye-off"
  | "lock"
  | "mail"
  | "shield-check"
  | "store"

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  const paths: Record<IconName, ReactNode> = {
    bank: (
      <>
        <path d="m3 10 9-6 9 6" />
        <path d="M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18M4 18h16" />
      </>
    ),
    "bar-chart": (
      <>
        <path d="M4 20V10m6 10V4m6 16v-7m5 7H2" />
        <path d="m4 7 5-4 6 7 6-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    "eye-off": (
      <>
        <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.1 2.8M6.2 6.2C3.8 7.7 2.5 12 2.5 12s3.5 7 9.5 7c1.4 0 2.7-.4 3.8-1" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    "shield-check": (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v10h16V10M3 4h18l-2 6H5L3 4Z" />
        <path d="M8 10v10m8-10v10M8 15h8" />
      </>
    ),
  }

  return <svg {...common}>{paths[name]}</svg>
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <div className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 42 46" fill="none">
          <path
            d="M21 2.5 38 9v12.7C38 33 30.8 40.3 21 44 11.2 40.3 4 33 4 21.7V9L21 2.5Z"
            fill="currentColor"
          />
          <path
            d="M21 33.8V18.2m0 8.2c-5.2 0-8.7-2.8-9.5-7.9 5-.5 8.2 1 9.5 4.5m.2 5.1c4.6 0 7.7-2.5 8.4-7-4.4-.4-7.2.9-8.4 4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="brand__copy">
        <strong>ClimateShield</strong>
        <span>MSME</span>
      </div>
    </div>
  )
}

function Navigation() {
  return (
    <header className="navigation">
      <Brand compact />
      <nav className="navigation__links" aria-label="Primary navigation">
        {["About", "How it Works", "Impact", "Resources", "Contact"].map(
          (item) => (
            <a href={`#${item.toLowerCase().replace(/ /g, "-")}`} key={item}>
              {item}
            </a>
          ),
        )}
      </nav>
      <a className="navigation__login" href="#login">
        Login / Sign Up
      </a>
    </header>
  )
}

const features: { icon: IconName; title: string }[] = [
  { icon: "bar-chart", title: "Early Risk Detection" },
  { icon: "shield-check", title: "Actionable Recommendations" },
  { icon: "bank", title: "Resilience Tracking" },
]

function FeatureList() {
  return (
    <div className="features" id="how-it-works">
      {features.map((feature) => (
        <div className="feature" key={feature.title}>
          <div className="feature__icon">
            <Icon name={feature.icon} size={24} />
          </div>
          <span>{feature.title}</span>
        </div>
      ))}
    </div>
  )
}

const accounts: {
  type: AccountType
  icon: IconName
  title: string
  description: string
  checks: string[]
}[] = [
  {
    type: "owner",
    icon: "store",
    title: "Business Owner",
    description: "For shopkeepers, manufacturers, retailers and other MSMEs.",
    checks: [
      "Check climate risk for your business location",
      "Get early warnings and alerts",
      "Compare protective measures",
      "Track your resilience progress",
    ],
  },
  {
    type: "analyst",
    icon: "bar-chart",
    title: "Climate Analyst",
    description: "For approved analysts reviewing climate-risk assessments.",
    checks: ["Explore scoped assessments", "Compare hazards and data quality"],
  },
  {
    type: "government",
    icon: "shield-check",
    title: "Government / Policy",
    description: "For approved regional resilience and policy teams.",
    checks: ["Review privacy-safe regional data", "Manage resilience programs"],
  },
  {
    type: "lender",
    icon: "bank",
    title: "Bank / Lender",
    description:
      "For credit officers, loan managers and financial institutions.",
    checks: [
      "Monitor borrower climate risk",
      "Assess repayment capacity",
      "Identify high-risk businesses",
      "Evaluate adaptation financing opportunities",
    ],
  },
]

export function AccountSelector({
  selected,
  onChange,
}: {
  selected: AccountType
  onChange: (type: AccountType) => void
}) {
  return (
    <div className="account-grid" role="radiogroup" aria-label="Account type">
      {accounts.map((account) => {
        const active = selected === account.type
        return (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            className={`account-card ${active ? "account-card--active" : ""}`}
            onClick={() => onChange(account.type)}
            key={account.type}
          >
            <div className="account-card__top">
              <div className="account-card__icon">
                <Icon name={account.icon} size={22} />
              </div>
              <span className="account-card__radio" aria-hidden="true">
                {active && <span />}
              </span>
            </div>
            <strong>{account.title}</strong>
            <p>{account.description}</p>
            <ul>
              {account.checks.map((check) => (
                <li key={check}>
                  <span className="check">
                    <Icon name="check" size={12} />
                  </span>
                  {check}
                </li>
              ))}
            </ul>
          </button>
        )
      })}
    </div>
  )
}

function InputField({
  id,
  label,
  type,
  placeholder,
  icon,
  action,
  value,
  onChange,
  error,
  autoComplete,
}: {
  id: string
  label: string
  type: string
  placeholder: string
  icon: IconName
  action?: ReactNode
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  error?: string
  autoComplete: string
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <span
        className={`field__control ${error ? "field__control--error" : ""}`}
      >
        <span className="field__icon">
          <Icon name={icon} size={18} />
        </span>
        <input
          id={id}
          name={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {action}
      </span>
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </label>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.5 14.1a6 6 0 0 1 0-4.2V7.3H3.2a10 10 0 0 0 0 9.4l3.3-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.9c1.5 0 2.9.5 4 1.5l2.7-2.7A9 9 0 0 0 12 2a10 10 0 0 0-8.8 5.3l3.3 2.6a5.8 5.8 0 0 1 5.5-4Z"
      />
    </svg>
  )
}

function LoginCard() {
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountType>("owner")
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  )
  const [message, setMessage] = useState("")
  const [demoPath, setDemoPath] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: { email?: string; password?: string } = {}
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      nextErrors.email = "Enter your email address."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address."
    }

    if (!password) {
      nextErrors.password = "Enter your password."
    }

    setErrors(nextErrors)
    setMessage("")
    setDemoPath("")
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const result = await authenticate({
        role: account,
        email: normalizedEmail,
        password,
      })
      const destinations: Record<AccountType, string> = {
        owner: "/business/dashboard",
        lender: "/lender/dashboard",
        analyst: "/analyst/dashboard",
        government: "/government/dashboard",
      }
      navigate(destinations[result.role])
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message)
      } else {
        setMessage(
          "The authentication service is unavailable. No login occurred. You can still open the clearly labeled synthetic demo.",
        )
        if (account === "owner" || account === "lender") {
          setDemoPath(account === "owner" ? "/business/dashboard" : "/lender/dashboard")
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="login-card" id="login" aria-labelledby="welcome-title">
      <div className="login-card__content">
        <div className="login-card__brand">
          <Brand />
        </div>
        <div className="login-card__heading">
          <h2 id="welcome-title">Welcome</h2>
          <p>Choose your account type to continue</p>
        </div>

        <AccountSelector
          selected={account}
          onChange={(role) => {
            setAccount(role)
            setDemoPath("")
            setMessage("")
          }}
        />
        {account === "government" && (
          <Link
            className="demo-button"
            to="/government/dashboard"
            state={{ demo: true }}
          >
            Preview synthetic Government / Policy dashboard
          </Link>
        )}

        <form className="login-form" onSubmit={submit}>
          <InputField
            id="email"
            label="Email address"
            type="email"
            placeholder="you@company.com"
            icon="mail"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((current) => ({ ...current, email: undefined }))
            }}
            error={errors.email}
            autoComplete="email"
          />
          <InputField
            id="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            icon="lock"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setErrors((current) => ({ ...current, password: undefined }))
            }}
            error={errors.password}
            autoComplete="current-password"
            action={
              <button
                className="field__action"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
              </button>
            }
          />
          <div className="forgot-password">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Checking…" : "Continue"}
            <span aria-hidden="true">→</span>
          </button>
          {message && (
            <div className="form-message" role="status">
              {message}
            </div>
          )}
          {demoPath && (
            <Link className="demo-button" to={demoPath} state={{ demo: true }}>
              Preview demo dashboard
            </Link>
          )}
          <div className="divider">
            <span>OR</span>
          </div>
          <button
            className="google-button"
            type="button"
            onClick={() => {
              setDemoPath("")
              setMessage(
                "Google authentication is not configured. No login occurred.",
              )
            }}
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>

        <p className="signup-copy">
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </section>
  )
}

export default function LandingPage() {
  return (
    <main
      className="app-shell"
      style={
        {
          "--background-image": `url(${backgroundImage})`,
        } as React.CSSProperties
      }
    >
      <Navigation />

      <div className="page-grid">
        <section className="hero" id="about" aria-labelledby="hero-title">
          <div className="hero__copy">
            <div className="eyebrow">
              <span>FUSION 2026</span>
              <span>FIN-05</span>
            </div>
            <h1 id="hero-title">
              Protect Your
              <br />
              Business.
              <br />
              <span>Finance a</span>
              <br />
              <span>Resilient Future.</span>
            </h1>
            <p>
              Real-time climate risk intelligence for MSMEs and financial
              institutions — turning climate insights into stronger businesses
              and safer lending.
            </p>
          </div>

          <FeatureList />
        </section>

        <LoginCard />
      </div>
    </main>
  )
}
