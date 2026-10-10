import { useEffect, useState } from "react"

import { getAuthenticatedUser, type AuthenticatedUser } from "../services/auth"

import { DataNotice, SectionHeading } from "./DashboardLayout"

export default function PortalProfile({
  portal,
}: {
  portal: "analyst" | "government"
}) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)

  const [error, setError] = useState("")

  useEffect(() => {
    if (
      portal === "government" &&
      sessionStorage.getItem("climateshield_demo_role") === "government"
    ) {
      setUser({
        id: 0,
        full_name: "Government Portal Demo",
        email: "demo@example.invalid",
        role: "government",
        organization_name: "Synthetic demo organization",
        is_approved: false,
      })
      return
    }

    let active = true

    void getAuthenticatedUser()

      .then((current) => {
        if (active) setUser(current)
      })

      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Profile could not be loaded.",
          )
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <SectionHeading
        eyebrow={`${
          portal === "analyst" ? "Climate analyst" : "Government / policy"
        } account`}
        title={
          portal === "government" &&
          sessionStorage.getItem("climateshield_demo_role") === "government"
            ? "Demo Profile"
            : "Authorized Profile"
        }
        description={
          portal === "government" &&
          sessionStorage.getItem("climateshield_demo_role") === "government"
            ? "Sample identity for preview only; it is not an authenticated account."
            : "Account role, organization, and access approval are controlled by the backend."
        }
      />
      {error && (
        <div className="partial-data-warning" role="alert">
          {error}
        </div>
      )}
      {user && (
        <>
          <DataNotice
            label={
              portal === "government" &&
              sessionStorage.getItem("climateshield_demo_role") === "government"
                ? "SYNTHETIC DEMO"
                : undefined
            }
          >
            {portal === "government" &&
            sessionStorage.getItem("climateshield_demo_role") === "government"
              ? "This is a sample profile for the synthetic preview. It is not an authenticated, approved government account."
              : <>Role: {user.role}. Approval status:{" "}
                  {user.is_approved ? "approved" : "pending"}. Frontend state does not
                  grant portal permissions.</>}
          </DataNotice>
          <section className="content-card portal-profile">
            <dl className="report-grid">
              <div>
                <dt>Name</dt>
                <dd>{user.full_name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Organization</dt>
                <dd>{user.organization_name || "Not provided"}</dd>
              </div>
              <div>
                <dt>Portal role</dt>
                <dd>
                  {portal === "analyst"
                    ? "Climate Analyst"
                    : "Government / Policy Official"}
                </dd>
              </div>
            </dl>
          </section>
          {portal === "government" && (
            <DataNotice
              label={
                sessionStorage.getItem("climateshield_demo_role") === "government"
                  ? "SYNTHETIC DEMO"
                  : undefined
              }
            >
              {sessionStorage.getItem("climateshield_demo_role") === "government"
                ? "This preview is limited to invented sample regions and records."
                : "Government users can view only privacy-thresholded regional records in the explicitly assigned state scopes."}
            </DataNotice>
          )}
        </>
      )}
    </>
  )
}
