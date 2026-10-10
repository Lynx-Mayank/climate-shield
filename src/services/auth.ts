import { apiRequest } from "./api"

export type AccountType = "owner" | "lender" | "analyst" | "government"

export interface SignInCredentials {
  role: AccountType
  email: string
  password: string
}

export type AuthenticationResult = {
  status: "authenticated"
  role: AccountType
}

export interface AuthenticatedUser {
  id: number
  full_name: string
  email: string
  role: AccountType
  organization_name: string
  is_approved: boolean
}

export async function authenticate(
  credentials: SignInCredentials,
): Promise<AuthenticationResult> {
  const result = await apiRequest<{ user: AuthenticatedUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  })
  return { status: "authenticated", role: result.user.role }
}

export async function registerAccount(input: {
  fullName: string
  email: string
  password: string
  role: AccountType
  organizationName: string
}): Promise<{ user: AuthenticatedUser; approvalRequired: boolean }> {
  const result = await apiRequest<{
    user: AuthenticatedUser
    approval_required: boolean
  }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        full_name: input.fullName,
        email: input.email,
        password: input.password,
        role: input.role,
        organization_name: input.organizationName,
      }),
    },
  )
  return { user: result.user, approvalRequired: result.approval_required }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const result = await apiRequest<{ user: AuthenticatedUser }>("/auth/me")
  return result.user
}

export async function logout(): Promise<void> {
  await apiRequest<void>("/auth/logout", { method: "POST" })
}
