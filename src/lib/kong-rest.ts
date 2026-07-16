import { getAddress } from 'viem'

const DEFAULT_KONG_REST_URL = 'https://kong.yearn.fi/api/rest'

export const KONG_REST_BASE = (
  import.meta.env.VITE_PUBLIC_REST_URL ||
  import.meta.env.VITE_KONG_REST_URL ||
  DEFAULT_KONG_REST_URL
).replace(/\/$/, '')

const DEFAULT_TIMEOUT_MS = 15_000

const normalizeAddress = (address: string): string => {
  try {
    return getAddress(address)
  } catch {
    return address.toLowerCase()
  }
}

const encodePathSegment = (segment: string | number): string => encodeURIComponent(String(segment))

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchKongJson<T>(url: string, options?: { allow404?: boolean }): Promise<T | null> {
  const response = await fetchWithTimeout(url)

  if (options?.allow404 && response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Kong request failed (${response.status}) for ${url}`)
  }

  return (await response.json()) as T
}

export const getKongVaultListUrl = (): string => `${KONG_REST_BASE}/list/vaults?origin=yearn`

export const getKongVaultSnapshotUrl = (chainId: number, address: string): string => {
  return `${KONG_REST_BASE}/snapshot/${encodePathSegment(chainId)}/${encodePathSegment(normalizeAddress(address))}`
}

export const getKongTimeseriesUrl = (
  segment: string,
  chainId: number,
  address: string,
  components?: string[]
): string => {
  const url = new URL(
    `${KONG_REST_BASE}/timeseries/${encodePathSegment(segment)}/${encodePathSegment(chainId)}/${encodePathSegment(normalizeAddress(address))}`
  )
  components?.forEach((component) => {
    url.searchParams.append('components', component)
  })
  return url.toString()
}
