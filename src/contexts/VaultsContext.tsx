import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { combineFeaturedVaults } from '@/constants/featuredVaults'
import { TokenAssetsContext } from '@/contexts/useTokenAssets'
import { VaultsContext } from '@/contexts/useVaults'
import * as filters from '@/graphql/filters/vaultFilters'
import { useTokenAssets } from '@/hooks/useTokenAssets'
import { fetchKongVaultList } from '@/lib/kong-vault-client'
import { fetchYvUsdAprs } from '@/lib/yvusd-apr-client'
import type { Vault } from '@/types/vaultTypes'
import { applyVaultOverrides } from '@/utils/vaultOverrides'

export function VaultsProvider({ children }: { children: React.ReactNode }) {
  const {
    data: vaultsData = [],
    isLoading: vaultsLoading,
    error: vaultsError
  } = useQuery<Vault[]>({
    queryKey: ['kong', 'vaults', 'list'],
    queryFn: () => fetchKongVaultList(),
    staleTime: 15 * 60 * 1000
  })
  const { data: yvUsdAprData } = useQuery({
    queryKey: ['yvusd', 'aprs'],
    queryFn: fetchYvUsdAprs,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000
  })
  const { assets, loading: assetsLoading, error: assetsError } = useTokenAssets() // fetch token assets

  // Improved loading state coordination
  const loadingState = useMemo(() => {
    const isVaultsLoading = vaultsLoading
    const isAssetsLoading = assetsLoading

    // All queries are loading
    const isInitialLoading = isVaultsLoading && isAssetsLoading

    // Any query is still loading
    const isPartialLoading = isVaultsLoading || isAssetsLoading

    // All critical data has loaded (vaults is most important)
    const isDataReady = !isVaultsLoading && vaultsData.length > 0

    return {
      isInitialLoading,
      isPartialLoading,
      isDataReady,
      vaultsReady: !isVaultsLoading && vaultsData.length > 0,
      strategiesReady: !isVaultsLoading,
      assetsReady: !isAssetsLoading && !!assets?.length,
      yDaemonReady: !isVaultsLoading
    }
  }, [vaultsLoading, assetsLoading, vaultsData.length, assets])

  const globalError = (vaultsError as Error | null) || assetsError || null
  // Memoize vaults to prevent dependency changes in downstream useMemo hooks
  const vaults = useMemo(() => vaultsData, [vaultsData])

  const normalizedVaults = useMemo(
    () => combineFeaturedVaults(applyVaultOverrides(vaults), yvUsdAprData),
    [vaults, yvUsdAprData]
  )

  const filteredVaults = filters.filterYearnVaults(normalizedVaults)

  return (
    <TokenAssetsContext.Provider value={{ assets, loading: assetsLoading, error: assetsError }}>
      <VaultsContext.Provider
        value={{
          vaults: filteredVaults,
          loading: loadingState.isPartialLoading,
          error: globalError,
          loadingState // Added enhanced loading state
        }}
      >
        {children}
      </VaultsContext.Provider>
    </TokenAssetsContext.Provider>
  )
}
