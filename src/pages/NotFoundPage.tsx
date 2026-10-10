import { Link } from "react-router"

export default function NotFoundPage() {
  return (
    <main className="utility-page">
      <section className="utility-card">
        <div className="status-badge">404</div>
        <h1>Page not found</h1>
        <p>The requested ClimateShield page does not exist.</p>
        <Link className="utility-primary-link" to="/">
          Return to landing page
        </Link>
      </section>
    </main>
  )
}
