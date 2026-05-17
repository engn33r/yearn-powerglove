import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ChainId } from '@/constants/chains'
import {
  getCanonicalVaultAddress,
  getYieldDataAddress,
  isYBoldAddress,
  isYvUsdAddress,
  YBOLD_CHAIN_ID,
  YBOLD_STAKING_ADDRESS,
  YVUSD_DESCRIPTION
} from '@/constants/featuredVaults'
import type { VaultOverrideConfig } from '@/constants/vaultOverrides'
import { useVaults } from '@/contexts/useVaults'
import { useRestTimeseries } from '@/hooks/useRestTimeseries'
import { fetchKongVaultSnapshotRaw } from '@/lib/kong-vault-client'
import { mapKongSnapshotToVaultExtended } from '@/lib/kong-vault-derivation'
import { fetchYvUsdAprs, getYvUsdApiStrategyApyByAddress, getYvUsdApiVault } from '@/lib/yvusd-apr-client'
import type { TimeseriesDataPoint } from '@/types/dataTypes'
import type { KongVaultSnapshot } from '@/types/kong'
import type { Vault, VaultExtended } from '@/types/vaultTypes'
import {
  applyVaultOverride,
  getVaultBlacklistReason,
  getVaultOverride,
  isVaultBlacklisted
} from '@/utils/vaultOverrides'

interface UseVaultPageDataProps {
  vaultAddress: string
  vaultChainId: ChainId
}

interface TimeseriesQueryResult {
  timeseries: TimeseriesDataPoint[]
}

interface UseVaultPageDataReturn {
  // Vault data
  vaultDetails: VaultExtended | null
  vaultLoading: boolean
  vaultError: Error | undefined
  vaultSnapshotTimestampUtc: string | null

  // Chart data (raw)
  apyWeeklyData: TimeseriesQueryResult | undefined
  apyMonthlyData: TimeseriesQueryResult | undefined
  aprOracleAprData: TimeseriesQueryResult | undefined
  tvlData: TimeseriesQueryResult | undefined
  ppsData: TimeseriesQueryResult | undefined

  // Chart loading states
  chartsLoading: boolean
  chartsError: boolean

  // Combined states
  isInitialLoading: boolean
  hasErrors: boolean
  isBlacklisted: boolean
  blacklistReason?: string
  overrideConfig?: VaultOverrideConfig
  canonicalVaultAddress: string
  yieldDataAddress: string
}

const toBaseVaultExtended = (vault: Vault | null): VaultExtended | null => {
  if (!vault) {
    return null
  }

  return {
    ...vault,
    forwardApyNet: vault.forwardApyNet ?? null,
    strategyForwardAprs: vault.strategyForwardAprs ?? {},
    strategyDetails: []
  }
}

const mergeYBoldDetails = (baseVault: VaultExtended, stakedVault: VaultExtended): VaultExtended => ({
  ...baseVault,
  name: 'yBOLD',
  symbol: 'yBOLD',
  apy: stakedVault.apy ?? baseVault.apy,
  fees: {
    ...baseVault.fees,
    performanceFee: stakedVault.fees?.performanceFee ?? baseVault.fees.performanceFee
  },
  performanceFee: stakedVault.performanceFee ?? baseVault.performanceFee,
  forwardApyNet: stakedVault.forwardApyNet ?? baseVault.forwardApyNet,
  strategyForwardAprs: stakedVault.strategyForwardAprs ?? baseVault.strategyForwardAprs
})

const normalizeYvUsdDetails = (vault: VaultExtended): VaultExtended => ({
  ...vault,
  name: 'yvUSD',
  symbol: 'yvUSD',
  meta: {
    ...vault.meta,
    description: YVUSD_DESCRIPTION,
    displayName: 'yvUSD',
    displaySymbol: 'yvUSD',
    protocols: vault.meta?.protocols ?? [],
    token: vault.meta?.token ?? {
      category: '',
      description: '',
      displayName: '',
      displaySymbol: '',
      icon: '',
      type: ''
    }
  }
})

const applyYvUsdAprData = (
  vault: VaultExtended,
  aprData: Awaited<ReturnType<typeof fetchYvUsdAprs>> | undefined
): VaultExtended => {
  const yvUsdVault = getYvUsdApiVault(aprData, vault.address)
  if (!yvUsdVault) {
    return vault
  }

  return {
    ...vault,
    apy: {
      ...vault.apy,
      grossApr: yvUsdVault.apr ?? vault.apy?.grossApr ?? 0,
      net: yvUsdVault.apy ?? vault.apy?.net ?? 0,
      weeklyNet: yvUsdVault.apy ?? vault.apy?.weeklyNet,
      monthlyNet: yvUsdVault.apy ?? vault.apy?.monthlyNet,
      inceptionNet: vault.apy?.inceptionNet ?? yvUsdVault.apy ?? 0
    },
    forwardApyNet: yvUsdVault.apy ?? vault.forwardApyNet,
    yvUsdStrategyApyByAddress: getYvUsdApiStrategyApyByAddress(yvUsdVault)
  }
}

/**
 * Coordinates data fetching for the vault page and manages loading states
 * Uses Kong REST for vault details and timeseries data
 */
export function useVaultPageData({ vaultAddress, vaultChainId }: UseVaultPageDataProps): UseVaultPageDataReturn {
  const canonicalVaultAddress = getCanonicalVaultAddress(vaultChainId, vaultAddress)
  const yieldDataAddress = getYieldDataAddress(vaultChainId, vaultAddress)
  const isYBold = isYBoldAddress(vaultChainId, vaultAddress)
  const isYvUsd = isYvUsdAddress(vaultChainId, vaultAddress)
  const isBlacklisted = isVaultBlacklisted(vaultChainId, canonicalVaultAddress)
  const blacklistReason = getVaultBlacklistReason(vaultChainId, canonicalVaultAddress)
  const overrideConfig = getVaultOverride(vaultChainId, canonicalVaultAddress)
  const { vaults } = useVaults()
  const normalizedAddress = canonicalVaultAddress.toLowerCase()

  const baseVault = useMemo(() => {
    const matchedVault =
      vaults.find((vault) => vault.chainId === vaultChainId && vault.address.toLowerCase() === normalizedAddress) ??
      null

    return toBaseVaultExtended(matchedVault)
  }, [vaults, vaultChainId, normalizedAddress])

  const {
    data: snapshotData,
    isLoading: vaultLoading,
    error: snapshotError
  } = useQuery<KongVaultSnapshot | null, Error>({
    queryKey: ['kong', 'vault', 'snapshot', vaultChainId, normalizedAddress],
    queryFn: () => fetchKongVaultSnapshotRaw(vaultChainId, canonicalVaultAddress),
    staleTime: 30 * 1000,
    enabled: Boolean(canonicalVaultAddress)
  })

  const { data: yBoldStakedSnapshot } = useQuery<KongVaultSnapshot | null, Error>({
    queryKey: ['kong', 'vault', 'snapshot', YBOLD_CHAIN_ID, YBOLD_STAKING_ADDRESS.toLowerCase()],
    queryFn: () => fetchKongVaultSnapshotRaw(YBOLD_CHAIN_ID, YBOLD_STAKING_ADDRESS),
    staleTime: 30 * 1000,
    enabled: isYBold
  })

  const { data: yvUsdAprData } = useQuery({
    queryKey: ['yvusd', 'aprs'],
    queryFn: fetchYvUsdAprs,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    enabled: isYvUsd
  })

  const vaultDetails = useMemo(() => {
    const mappedBaseVault = snapshotData
      ? mapKongSnapshotToVaultExtended(snapshotData, baseVault)
      : baseVault
        ? { ...baseVault }
        : null

    if (!mappedBaseVault) {
      return null
    }

    const normalizedBaseVault = isYvUsd
      ? applyYvUsdAprData(normalizeYvUsdDetails(mappedBaseVault), yvUsdAprData)
      : mappedBaseVault

    if (!isYBold || !yBoldStakedSnapshot) {
      return applyVaultOverride(normalizedBaseVault)
    }

    return applyVaultOverride(
      mergeYBoldDetails(normalizedBaseVault, mapKongSnapshotToVaultExtended(yBoldStakedSnapshot, null))
    )
  }, [snapshotData, baseVault, isYBold, isYvUsd, yBoldStakedSnapshot, yvUsdAprData])

  const vaultSnapshotTimestampUtc = useMemo(() => {
    const snapshotBlockTime = snapshotData?.blockTime
    if (snapshotBlockTime === null || snapshotBlockTime === undefined) {
      return null
    }

    const numericBlockTime =
      typeof snapshotBlockTime === 'string' ? Number.parseInt(snapshotBlockTime, 10) : Number(snapshotBlockTime)

    if (!Number.isFinite(numericBlockTime) || numericBlockTime <= 0) {
      return null
    }

    return new Date(numericBlockTime * 1000).toISOString()
  }, [snapshotData?.blockTime])

  const isV3Vault = Boolean(
    vaultDetails?.v3 || snapshotData?.apiVersion?.startsWith('3') || snapshotData?.apiVersion?.startsWith('~3')
  )

  // Fetch weekly APY data from REST API
  const {
    data: apyWeeklyData,
    isLoading: apyWeeklyLoading,
    error: apyWeeklyError
  } = useRestTimeseries({
    segment: 'apy-historical',
    chainId: vaultChainId,
    address: yieldDataAddress,
    components: ['weeklyNet']
  })

  // Fetch monthly APY data from REST API
  const {
    data: apyMonthlyData,
    isLoading: apyMonthlyLoading,
    error: apyMonthlyError
  } = useRestTimeseries({
    segment: 'apy-historical',
    chainId: vaultChainId,
    address: yieldDataAddress,
    components: ['monthlyNet']
  })

  // Fetch APR-oracle APR timeseries from REST API (v3 only)
  const { data: aprOracleAprData } = useRestTimeseries({
    segment: 'apr-oracle',
    chainId: vaultChainId,
    address: yieldDataAddress,
    components: ['apr'],
    enabled: isV3Vault
  })

  // Fetch TVL data from REST API
  const {
    data: tvlData,
    isLoading: tvlLoading,
    error: tvlError
  } = useRestTimeseries({
    segment: 'tvl',
    chainId: vaultChainId,
    address: canonicalVaultAddress
  })

  // Fetch PPS data from REST API
  const {
    data: ppsData,
    isLoading: ppsLoading,
    error: ppsError
  } = useRestTimeseries({
    segment: 'pps',
    chainId: vaultChainId,
    address: yieldDataAddress,
    components: ['humanized']
  })

  // Calculate combined loading states
  const chartsLoading = useMemo(() => {
    // `aprOracleApyLoading` is intentionally excluded since it's optional overlay data.
    return apyWeeklyLoading || apyMonthlyLoading || tvlLoading || ppsLoading
  }, [apyWeeklyLoading, apyMonthlyLoading, tvlLoading, ppsLoading])

  // Calculate combined error states
  const chartsError = useMemo(() => {
    // `aprOracleApyError` is intentionally excluded since it's optional overlay data.
    return !!apyWeeklyError || !!apyMonthlyError || !!tvlError || !!ppsError
  }, [apyWeeklyError, apyMonthlyError, tvlError, ppsError])

  // Initial loading only waits for vault data (charts can load separately)
  const isInitialLoading = vaultLoading

  // Has errors if vault fails to load
  const hasErrors = !!snapshotError

  return {
    // Vault data
    vaultDetails,
    vaultLoading,
    vaultError: snapshotError ?? undefined,
    vaultSnapshotTimestampUtc,

    // Chart data
    apyWeeklyData,
    apyMonthlyData,
    aprOracleAprData,
    tvlData,
    ppsData,

    // Chart loading states
    chartsLoading,
    chartsError,

    // Combined states
    isInitialLoading,
    hasErrors,
    isBlacklisted,
    blacklistReason,
    overrideConfig,
    canonicalVaultAddress,
    yieldDataAddress
  }
}
