import { FormEvent, useState } from "react"
import { Link, useNavigate } from "react-router"
import { AccountSelector } from "./LandingPage"
import { ApiError } from "../services/api"
import { registerAccount, type AccountType } from "../services/auth"

export default function SignupPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<AccountType>("owner")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setSubmitting(true)
    setMessage("")
    try {
      const registration = await registerAccount({
        fullName: String(values.get("name") ?? "").trim(),
        email: String(values.get("email") ?? "").trim(),
        password: String(values.get("password") ?? ""),
        role,
        organizationName: String(
          values.get("businessName") ??
            values.get("institution") ??
            values.get("organization") ??
            "",
        ).trim(),
      })
      if (registration.approvalRequired) {
        setMessage(
          "Your account was created and is pending administrator approval. The analyst/government workspace will be available after approval.",
        )
        form.reset()
        return
      }
      const destinations: Record<AccountType, string> = {
        owner: "/business/dashboard",
        lender: "/lender/dashboard",
        analyst: "/analyst/dashboard",
        government: "/government/dashboard",
      }
      navigate(destinations[role])
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Registration service is unavailable. No account was created.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="utility-page">
      <section className="utility-card utility-card--signup">
        <div className="status-badge">Frontend registration</div>
        <h1>Create your ClimateShield account</h1>
        <p>
          Choose the account type that matches how you will use the platform.
        </p>

        <AccountSelector selected={role} onChange={setRole} />

        <form className="registration-form" onSubmit={submit}>
          <label>
            Full name
            <input name="name" autoComplete="name" required />
          </label>
          {role === "owner" ? (
            <>
              <label>
                Business name
                <input
                  name="businessName"
                  autoComplete="organization"
                  required
                />
              </label>
              <label>
                Business location
                <input name="businessLocation" required />
              </label>
            </>
          ) : role === "lender" ? (
            <>
              <label>
                Financial institution
                <input
                  name="institution"
                  autoComplete="organization"
                  required
                />
              </label>
              <label>
                Role / designation
                <input name="designation" required />
              </label>
            </>
          ) : (
            <label>
              Organization / department
              <input
                name="organization"
                autoComplete="organization"
                required
              />
            </label>
          )}
          <label>
            Work email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="utility-submit" type="submit">
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        {message && (
          <div className="utility-notice" role="status">
            {message}
          </div>
        )}
        <p className="utility-footer">
          Already have an account? <Link to="/">Return to sign in</Link>
        </p>
      </section>
    </main>
  )
}
