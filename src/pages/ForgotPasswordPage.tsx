import { FormEvent, useState } from "react"
import { Link } from "react-router"

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("")

  function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(
      "Password recovery is not connected to a backend. No recovery email was sent.",
    )
  }

  return (
    <main className="utility-page">
      <section className="utility-card">
        <div className="status-badge">Backend required</div>
        <h1>Reset your password</h1>
        <p>
          Enter your email to prepare a recovery request. Email delivery will
          become available when authentication is connected.
        </p>
        <form className="registration-form" onSubmit={submit}>
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button className="utility-submit" type="submit">
            Request reset link
          </button>
        </form>
        {message && (
          <div className="utility-notice" role="status">
            {message}
          </div>
        )}
        <p className="utility-footer">
          <Link to="/">Return to sign in</Link>
        </p>
      </section>
    </main>
  )
}
