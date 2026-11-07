export interface Home {
  id: string
  name: string
}

export interface Member {
  id: string
  homeId: string
  name: string
}

export interface Share {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

export interface Bill {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

export interface Balance {
  memberId: string
  name: string
  outstandingCents: number
}

interface ApiError {
  error?: string
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  let data: unknown

  try {
    data = await response.json()
  } catch {
    throw new Error('Server returned an invalid response')
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as ApiError).error === 'string'
        ? (data as ApiError).error
        : `Request failed with status ${response.status}`

    throw new Error(message)
  }

  return data as T
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(cents / 100)
}