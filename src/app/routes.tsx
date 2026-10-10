import { createBrowserRouter } from "react-router"
import BusinessDashboard from "../dashboard/BusinessDashboard"
import LenderDashboard from "../dashboard/LenderDashboard"
import LandingPage from "../pages/LandingPage"
import ForgotPasswordPage from "../pages/ForgotPasswordPage"
import NotFoundPage from "../pages/NotFoundPage"
import SignupPage from "../pages/SignupPage"
import ProtectedPage from "./ProtectedPage"
import AnalystPortal from "../dashboard/AnalystPortal"
import GovernmentPortal from "../dashboard/GovernmentPortal"

export const router = createBrowserRouter([
  { path: "/", Component: LandingPage },
  {
    path: "/business/*",
    element: (
      <ProtectedPage role="owner">
        <BusinessDashboard />
      </ProtectedPage>
    ),
  },
  {
    path: "/lender/*",
    element: (
      <ProtectedPage role="lender">
        <LenderDashboard />
      </ProtectedPage>
    ),
  },
  {
    path: "/analyst/*",
    element: (
      <ProtectedPage role="analyst">
        <AnalystPortal />
      </ProtectedPage>
    ),
  },
  {
    path: "/government/*",
    element: (
      <ProtectedPage role="government">
        <GovernmentPortal />
      </ProtectedPage>
    ),
  },
  { path: "/signup", Component: SignupPage },
  { path: "/forgot-password", Component: ForgotPasswordPage },
  { path: "*", Component: NotFoundPage },
])
