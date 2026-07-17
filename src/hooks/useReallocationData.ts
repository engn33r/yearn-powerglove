import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { CHAIN_ID_TO_NAME, type ChainId } from '@/constants/chains'
import { augmentStrategiesFromExplain, parseExplainMetadata, type RawStrategyDebtRatio } from '@/lib/explain-parser'
import { fetchStrategyDisplayNames, fetchVaultStrategies, type NameInfo } from '@/lib/kong-strategy-names'
import {
  buildReallocationPanels,
  type CurrentAllocationInput,
  type ReallocationNormalizedChange
} from '@/lib/reallocation-panels'
import type { ReallocationData } from '@/types/reallocationTypes'
import type { VaultExtended } from '@/types/vaultTypes'

const TOTAL_BPS = 10000
const NORMALIZATION_TOLERANCE_BPS = 5
const MAX_APR_PERCENT = 10000

interface RawVaultOptimization {
  vault: string
  strategyDebtRatios: RawStrategyDebtRatio[]
  currentApr: number
  proposedApr: number
  explain: string
}

interface OptimizationSourceMeta {
  key: string
  chainId: number | null
  revision: string
  isLatestAlias: boolean
  timestampUtc: string | null
  latestMatchedTimestampUtc: string | null
}

interface VaultOptimizationRecord extends RawVaultOptimization {
  source: OptimizationSourceMeta
}

interface ReallocationHistoryResult {
  vault: string
  vaultLabel: string
  chainId: number | null
  chainName: string | null
  changes: ReallocationNormalizedChange[]
}

function normalizeVaultAddress(value: string): string {
  return value.toLowerCase()
}

export function isMatchingReallocationRecord(
  raw: VaultOptimizationRecord,
  requestedVaultAddress: string,
  requestedChainId: ChainId
): boolean {
  const metadata = parseExplainMetadata(raw.explain)
  const normalizedRequestedVaultAddress = normalizeVaultAddress(requestedVaultAddress)
  const normalizedRecordVaultAddress = normalizeVaultAddress(raw.vault)
  if (normalizedRecordVaultAddress !== normalizedRequestedVaultAddress) {
    return false
  }

  if (raw.source.chainId !== null && raw.source.chainId !== requestedChainId) {
    return false
  }

  if (metadata.vaultAddress !== null && metadata.vaultAddress !== normalizedRequestedVaultAddress) {
    return false
  }

  if (metadata.chainId !== null && metadata.chainId !== requestedChainId) {
    return false
  }

  return true
}

function isFiniteBpsValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= TOTAL_BPS
}

function isFiniteAprPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_APR_PERCENT
}

function isValidStrategyDebtRatio(strategy: RawStrategyDebtRatio): boolean {
  return (
    typeof strategy.strategy === 'string' &&
    strategy.strategy.trim().length > 0 &&
    isFiniteBpsValue(strategy.currentRatio) &&
    isFiniteBpsValue(strategy.targetRatio) &&
    (strategy.currentApr === null || strategy.currentApr === undefined || isFiniteAprPercent(strategy.currentApr)) &&
    (strategy.targetApr === null || strategy.targetApr === undefined || isFiniteAprPercent(strategy.targetApr))
  )
}

export function isValidOptimizationRecord(record: VaultOptimizationRecord): boolean {
  if (!Array.isArray(record.strategyDebtRatios) || record.strategyDebtRatios.length === 0) {
    return false
  }

  if (
    !Number.isFinite(record.currentApr) ||
    !Number.isFinite(record.proposedApr) ||
    record.currentApr < 0 ||
    record.proposedApr < 0 ||
    record.currentApr > MAX_APR_PERCENT ||
    record.proposedApr > MAX_APR_PERCENT
  ) {
    return false
  }

  const validStrategies = record.strategyDebtRatios.filter(isValidStrategyDebtRatio)
  if (validStrategies.length !== record.strategyDebtRatios.length) {
    return false
  }

  const totalCurrentBps = validStrategies.reduce((sum, strategy) => sum + strategy.currentRatio, 0)
  const totalTargetBps = validStrategies.reduce((sum, strategy) => sum + strategy.targetRatio, 0)
  return (
    totalCurrentBps <= TOTAL_BPS + NORMALIZATION_TOLERANCE_BPS &&
    totalTargetBps <= TOTAL_BPS + NORMALIZATION_TOLERANCE_BPS
  )
}

function getReallocationApiUrl(): string {
  return import.meta.env.VITE_PUBLIC_REALLOCATION_API_URL?.trim() ?? ''
}

function getRecordTimestampMs(raw: VaultOptimizationRecord): number {
  const timestamp = raw.source.latestMatchedTimestampUtc ?? raw.source.timestampUtc
  if (!timestamp) {
    return 0
  }

  return new Date(timestamp.replace(' UTC', 'Z').replace(' ', 'T')).getTime()
}

function getCurrentVaultStrategies(vaultDetails?: VaultExtended | null) {
  if (!vaultDetails) {
    return []
  }

  if (Array.isArray(vaultDetails.strategyDetails) && vaultDetails.strategyDetails.length > 0) {
    return vaultDetails.strategyDetails.map((strategy) => ({
      address: strategy.address,
      name: strategy.name,
      debtRatio: strategy.debtRatio,
      estimatedApy: strategy.estimatedApy,
      netApr: strategy.netApr
    }))
  }

  if (!Array.isArray(vaultDetails.debts)) {
    return []
  }

  return vaultDetails.debts.map((debt, index) => ({
    address: debt.strategy,
    name: `Strategy ${index + 1}`,
    debtRatio: debt.debtRatio,
    estimatedApy: null,
    netApr: null
  }))
}

function buildCurrentAllocationInput(
  vaultDetails?: VaultExtended | null,
  vaultSnapshotTimestampUtc?: string | null
): CurrentAllocationInput | undefined {
  if (!vaultDetails?.address) {
    return undefined
  }

  const strategies = getCurrentVaultStrategies(vaultDetails).map((strategy) => {
    const currentAprDecimal = strategy.estimatedApy ?? strategy.netApr ?? null

    return {
      strategyAddress: strategy.address,
      name: strategy.name?.trim() || strategy.address,
      allocationPct: (strategy.debtRatio ?? 0) / 100,
      aprPct: currentAprDecimal !== null ? currentAprDecimal * 100 : null
    }
  })

  return {
    timestampUtc: vaultSnapshotTimestampUtc ?? new Date().toISOString(),
    tvl: typeof vaultDetails.tvl?.close === 'number' ? vaultDetails.tvl.close : null,
    tvlUnit: 'USD',
    vaultAprPct: resolveCurrentVaultAprPct(vaultDetails),
    strategies
  }
}

function resolveCurrentVaultAprPct(vaultDetails?: VaultExtended | null): number | null {
  if (!vaultDetails) {
    return null
  }

  const candidateDecimalValues = [vaultDetails.apy?.grossApr, vaultDetails.forwardApyNet, vaultDetails.apy?.net]

  for (const candidateValue of candidateDecimalValues) {
    if (typeof candidateValue === 'number' && Number.isFinite(candidateValue)) {
      return candidateValue * 100
    }
  }

  return null
}

function normalizeRawReallocation(
  raw: VaultOptimizationRecord,
  vaultStrategyLookup: Map<string, string>,
  namesByAddress: Record<string, NameInfo>,
  fallbackChainId?: ChainId
): {
  vaultLabel: string
  chainId: number | null
  chainName: string | null
  change: ReallocationNormalizedChange
} {
  const metadata = parseExplainMetadata(raw.explain)

  const { strategies: augmentedStrategies, syntheticStrategyKeysByAddress } = augmentStrategiesFromExplain(
    raw.explain,
    raw.vault,
    raw.strategyDebtRatios,
    vaultStrategyLookup
  )

  let strategies = augmentedStrategies.map((strategy, index) => ({
    ...strategy,
    name: strategy.name?.trim() || `Strategy ${index + 1}`
  }))

  const totalCurrentBps = strategies.reduce((sum, strategy) => sum + strategy.currentRatio, 0)
  const totalTargetBps = strategies.reduce((sum, strategy) => sum + strategy.targetRatio, 0)
  const unallocatedCurrentBps = Math.max(0, TOTAL_BPS - totalCurrentBps)
  const unallocatedTargetBps = Math.max(0, TOTAL_BPS - totalTargetBps)

  if (unallocatedCurrentBps > NORMALIZATION_TOLERANCE_BPS || unallocatedTargetBps > NORMALIZATION_TOLERANCE_BPS) {
    strategies = [
      ...strategies,
      {
        strategy: 'unallocated',
        name: 'Unallocated',
        currentRatio: unallocatedCurrentBps,
        targetRatio: unallocatedTargetBps,
        currentApr: null,
        targetApr: null
      }
    ]
  }

  const strategyKeys: string[] = []
  const usedKeys = new Set<string>()
  for (const strategy of strategies) {
    const normalizedAddress = strategy.strategy.toLowerCase()
    const baseKey = syntheticStrategyKeysByAddress.get(normalizedAddress) ?? normalizedAddress
    let resolvedKey = baseKey
    let duplicateCounter = 1
    while (usedKeys.has(resolvedKey)) {
      duplicateCounter += 1
      resolvedKey = `${baseKey}#${duplicateCounter}`
    }
    usedKeys.add(resolvedKey)
    strategyKeys.push(resolvedKey)
  }

  const normalizedStrategies = strategies.map((strategy, index) => {
    const normalizedAddress = strategy.strategy.toLowerCase()
    const isUnallocated = strategy.strategy === 'unallocated'
    const strategyAddress =
      syntheticStrategyKeysByAddress.has(normalizedAddress) || isUnallocated ? null : strategy.strategy
    const overrideName = strategyAddress ? namesByAddress[strategyAddress.toLowerCase()]?.name : undefined

    return {
      strategyKey: strategyKeys[index],
      strategyAddress,
      name: overrideName ?? strategy.name,
      isUnallocated,
      currentAllocationPct: strategy.currentRatio / 100,
      targetAllocationPct: strategy.targetRatio / 100,
      currentAprPct:
        strategy.currentApr !== null && strategy.currentApr !== undefined ? strategy.currentApr / 100 : null,
      targetAprPct: strategy.targetApr !== null && strategy.targetApr !== undefined ? strategy.targetApr / 100 : null
    }
  })

  const timestampUtc = raw.source.isLatestAlias
    ? raw.source.latestMatchedTimestampUtc
    : (raw.source.timestampUtc ?? null)
  const chainId = metadata.chainId ?? raw.source.chainId ?? fallbackChainId ?? null
  const chainName = metadata.chainName ?? (chainId ? CHAIN_ID_TO_NAME[chainId as ChainId] : null)
  const vaultLabel = metadata.vaultLabel ?? `${raw.vault.slice(0, 6)}...${raw.vault.slice(-4)}`

  return {
    vaultLabel,
    chainId,
    chainName,
    change: {
      sourceKey: raw.source.key ?? 'api',
      timestampUtc,
      tvl: metadata.tvl,
      tvlUnit: metadata.tvlUnit,
      currentVaultAprPct: raw.currentApr / 100,
      targetVaultAprPct: raw.proposedApr / 100,
      strategies: normalizedStrategies
    }
  }
}

export function buildReallocationQueryKey(vaultAddress: string, vaultChainId: ChainId | undefined) {
  return ['reallocation', 'history', vaultChainId ?? null, vaultAddress.toLowerCase()] as const
}

export function buildReallocationRequestUrl(
  apiUrl: string,
  vaultAddress: string,
  vaultChainId: ChainId,
  options?: { history?: boolean }
): string {
  const separator = apiUrl.includes('?') ? '&' : '?'
  const params = new URLSearchParams({
    vault: vaultAddress.toLowerCase(),
    chainId: String(vaultChainId)
  })

  if (options?.history) {
    params.set('history', '1')
  }

  return `${apiUrl}${separator}${params.toString()}`
}

export function useReallocationData(
  vaultAddress: string,
  vaultChainId: ChainId | undefined,
  currentVaultDetails?: VaultExtended | null,
  currentVaultSnapshotTimestampUtc?: string | null
): {
  data: ReallocationData | null
  isLoading: boolean
} {
  const reallocationApiUrl = getReallocationApiUrl()
  const currentAllocation = useMemo(
    () => buildCurrentAllocationInput(currentVaultDetails, currentVaultSnapshotTimestampUtc),
    [currentVaultDetails, currentVaultSnapshotTimestampUtc]
  )

  const { data, isLoading, error } = useQuery<ReallocationHistoryResult | null, Error>({
    queryKey: buildReallocationQueryKey(vaultAddress, vaultChainId),
    queryFn: async () => {
      if (!reallocationApiUrl || !vaultChainId) {
        return null
      }

      const response = await fetch(
        buildReallocationRequestUrl(reallocationApiUrl, vaultAddress, vaultChainId, { history: true })
      )
      if (!response.ok) {
        console.warn(
          `[reallocation] API returned ${response.status} for vault ${vaultAddress} on chain ${vaultChainId}`
        )
        return null
      }

      const rawPayload = (await response.json()) as VaultOptimizationRecord | VaultOptimizationRecord[] | null
      const rawRecords = Array.isArray(rawPayload) ? rawPayload : rawPayload ? [rawPayload] : []

      if (rawRecords.length === 0) {
        console.warn(`[reallocation] No optimization history found for vault ${vaultAddress}`)
        return null
      }

      const validRecords = rawRecords.filter(isValidOptimizationRecord)
      if (validRecords.length === 0) {
        console.warn(`[reallocation] No valid reallocation records in response for vault ${vaultAddress}`)
        return null
      }

      const matchingRecords = validRecords.filter((record) =>
        isMatchingReallocationRecord(record, vaultAddress, vaultChainId)
      )
      if (matchingRecords.length === 0) {
        console.warn(`[reallocation] No matching optimization history found for vault ${vaultAddress}`)
        return null
      }

      const sortedRecords = [...matchingRecords].sort(
        (left, right) => getRecordTimestampMs(right) - getRecordTimestampMs(left)
      )
      const strategyAddresses = [
        ...new Set(
          sortedRecords
            .flatMap((record) => record.strategyDebtRatios.map((strategy) => strategy.strategy))
            .filter(Boolean)
        )
      ]

      const [vaultStrategyLookup, namesByAddress] = await Promise.all([
        fetchVaultStrategies(vaultChainId, vaultAddress).catch((caughtError) => {
          console.warn('[reallocation] fetchVaultStrategies failed', caughtError)
          return new Map()
        }),
        strategyAddresses.length > 0
          ? fetchStrategyDisplayNames(vaultChainId, strategyAddresses).catch((caughtError) => {
              console.warn('[reallocation] fetchStrategyDisplayNames failed', caughtError)
              return {}
            })
          : Promise.resolve({})
      ])

      const normalizedRecords = sortedRecords.map((record) =>
        normalizeRawReallocation(record, vaultStrategyLookup, namesByAddress, vaultChainId)
      )
      const latestRecord = normalizedRecords[0]
      if (!latestRecord) {
        return null
      }

      return {
        vault: vaultAddress.toLowerCase(),
        vaultLabel: latestRecord.vaultLabel,
        chainId: latestRecord.chainId,
        chainName: latestRecord.chainName,
        changes: normalizedRecords.map((record) => record.change)
      }
    },
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(vaultAddress && vaultChainId && currentVaultDetails?.address),
    retry: 1
  })

  if (error) {
    console.warn(`[reallocation] query error for vault ${vaultAddress}:`, error)
  }

  const transformedData = useMemo<ReallocationData | null>(() => {
    if (!data) {
      return null
    }

    const panels = buildReallocationPanels(data.changes, currentAllocation)
    if (panels.length === 0) {
      return null
    }

    return {
      vault: data.vault,
      vaultLabel: data.vaultLabel,
      chainId: data.chainId,
      chainName: data.chainName,
      panels
    }
  }, [currentAllocation, data])

  return {
    data: transformedData,
    isLoading
  }
}
