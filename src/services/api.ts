const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api"

export class ApiError extends Error {
  constructor(
    message: string,

    readonly status: number,
  ) {
    super(message)

    this.name = "ApiError"
  }
}

export async function apiRequest<T>(
  path: string,

  init: RequestInit = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,

      credentials: "include",

      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),

        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(
      "The ClimateShield service is temporarily unavailable. Please try again or use the demo dashboard.",
      503,
    )
  }

  let payload: { detail?: unknown } | T | undefined

  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? payload.detail
        : undefined

    throw new ApiError(
      typeof detail === "string"
        ? detail
        : `The API request failed with status ${response.status}.`,

      response.status,
    )
  }

  return payload as T
}

export async function downloadCsv(path: string, filename: string): Promise<void> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
    })
  } catch {
    throw new ApiError(
      "The report export service is currently unavailable. Please try again later.",
      503,
    )
  }

  if (!response.ok) {
    let message = `The export request failed with status ${response.status}.`
    try {
      const payload = (await response.json()) as { detail?: unknown }
      if (typeof payload.detail === "string") message = payload.detail
    } catch {
      // Preserve the HTTP status message when an error response is not JSON.
    }
    throw new ApiError(message, response.status)
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}
