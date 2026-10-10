import { useEffect, useState, type ReactNode } from "react"

import { Link, useLocation } from "react-router"

import { getAuthenticatedUser, type AccountType } from "../services/auth"

type AccessState =
  | { status: "checking" }
  | { status: "allowed"; demo: boolean }
  | { status: "denied"; message: string }

export default function ProtectedPage({
  role,

  children,
}: {
  role: AccountType

  children: ReactNode
}) {
  const location = useLocation()

  const demoRequested = Boolean(
    (location.state as { demo?: boolean } | null)?.demo,
  )
  const matchingDemo =
    role === "owner" || role === "lender" || role === "government"

  const [access, setAccess] = useState<AccessState>({ status: "checking" })

  useEffect(() => {
    let active = true

    if (demoRequested && matchingDemo) {
      sessionStorage.setItem("climateshield_demo_role", role)

      setAccess({ status: "allowed", demo: true })

      return () => {
        active = false
      }
    }

    if (
      matchingDemo &&
      sessionStorage.getItem("climateshield_demo_role") === role
    ) {
      setAccess({ status: "allowed", demo: true })

      return () => {
        active = false
      }
    }

    setAccess({ status: "checking" })

    void getAuthenticatedUser()

      .then((user) => {
        if (!active) return

        setAccess(
          user.role === role
            ? { status: "allowed", demo: false }
            : {
                status: "denied",

                message:
                "This page is only available to the matching approved account type.",
              },
        )
      })

      .catch(() => {
        if (active) {
          setAccess({
            status: "denied",

            message:
              "Sign in with the matching approved account. Analyst and government accounts require administrator approval.",
          })
        }
      })

    return () => {
      active = false
    }
  }, [demoRequested, location.pathname, role])

  if (access.status === "allowed") {
    return (
      <>
        {access.demo && (
          <div className="route-demo-banner" role="status">
            Demo mode: sample data only; no authenticated private records.
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem("climateshield_demo_role")

                window.location.assign("/")
              }}
            >
              Exit demo
            </button>
          </div>
        )}
        {children}
      </>
    )
  }

  return (
    <main className="utility-page">
      <section className="utility-card">
        <div className="status-badge">
          {access.status === "checking"
            ? "Checking access"
            : "Sign-in required"}
        </div>
        <h1>
          {access.status === "checking"
            ? "Verifying your session"
            : "Protected workspace"}
        </h1>
        <p>
          {access.status === "checking"
            ? "Please wait while ClimateShield checks your account."
            : access.message}
        </p>
        {access.status === "denied" && (
          <Link className="utility-primary-link" to="/">
            Return to sign in
          </Link>
        )}
      </section>
    </main>
  )
}
