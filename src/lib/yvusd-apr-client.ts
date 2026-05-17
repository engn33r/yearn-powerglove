const DEFAULT_YVUSD_APR_API_URL = '/api/yvusd/aprs'
const APR_DECIMALS = 18

export const YVUSD_APR_API_BASE = (
  import.meta.env.VITE_PUBLIC_YVUSD_APR_API_URL ||
  import.meta.env.VITE_YVUSD_APR_API_URL ||
  DEFAULT_YVUSD_APR_API_URL
).replace(/\/$/, '')

export type YvUsdAprServiceStrategy = {
  address?: string
  points?: boolean
  debt?: string
  apr_raw?: string
  net_apr_raw?: string
  weighted_apr_raw?: string
  weight?: number
  apr_source?: string
  meta?: {
    name?: string
    type?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type YvUsdAprServiceVault = {
  name?: string
  symbol?: string
  address: string
  chain_id?: number
  apr?: number
  apy?: number
  components?: Array<{
    label?: string
    apr?: number
    apy?: number
    source?: string
    meta?: Record<string, unknown>
  }>
  meta?: {
    strategies?: YvUsdAprServiceStrategy[]
    [key: string]: unknown
  }
  computed_at?: string
  [key: string]: unknown
}

export type YvUsdAprServiceResponse = Record<string, YvUsdAprServiceVault>

const normalizeAddress = (address: string) => address.toLowerCase()

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export function aprToApy(apr: number): number {
  const periodsPerYear = 52
  return (1 + apr / periodsPerYear) ** periodsPerYear - 1
}

export function aprRawToDecimal(rawApr?: string): number | null {
  if (!rawApr) return null

  try {
    return Number(BigInt(rawApr)) / 10 ** APR_DECIMALS
  } catch {
    return toFiniteNumber(rawApr)
  }
}

export function getYvUsdApiVault(
  data: YvUsdAprServiceResponse | null | undefined,
  address: string
): YvUsdAprServiceVault | undefined {
  const normalizedAddress = normalizeAddress(address)
  return Object.values(data ?? {}).find((vault) => normalizeAddress(vault.address) === normalizedAddress)
}

export function getYvUsdApiStrategyApyByAddress(
  vault?: YvUsdAprServiceVault
): Record<string, { apy: number; name?: string }> {
  return (vault?.meta?.strategies ?? []).reduce<Record<string, { apy: number; name?: string }>>((acc, strategy) => {
    if (!strategy.address) return acc

    const apr = aprRawToDecimal(strategy.net_apr_raw ?? strategy.apr_raw)
    if (apr === null) return acc

    acc[normalizeAddress(strategy.address)] = {
      apy: aprToApy(apr),
      name: strategy.meta?.name
    }
    return acc
  }, {})
}

export async function fetchYvUsdAprs(): Promise<YvUsdAprServiceResponse> {
  const response = await fetch(YVUSD_APR_API_BASE, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch yvUSD APRs: ${response.status}`)
  }

  return response.json()
}
