import { renderHook } from '@testing-library/react'
import { getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultPageData } from './useVaultPageData'

const useRestTimeseriesMock = vi.fn()
const useVaultsMock = vi.fn()
const useQueryMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args)
}))

vi.mock('@/hooks/useRestTimeseries', () => ({
  useRestTimeseries: (...args: unknown[]) => useRestTimeseriesMock(...args)
}))

vi.mock('@/contexts/useVaults', () => ({
  useVaults: () => useVaultsMock()
}))

vi.mock('@/lib/kong-vault-client', () => ({
  fetchKongVaultSnapshotRaw: vi.fn()
}))

vi.mock('@/lib/kong-vault-derivation', () => ({
  mapKongSnapshotToVaultExtended: vi.fn()
}))

vi.mock('@/utils/vaultOverrides', () => ({
  applyVaultOverride: (vault: unknown) => vault,
  getVaultBlacklistReason: vi.fn(() => undefined),
  getVaultOverride: vi.fn(() => undefined),
  isVaultBlacklisted: vi.fn(() => false)
}))

describe('useVaultPageData', () => {
  beforeEach(() => {
    useVaultsMock.mockReturnValue({ vaults: [] })
    useQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null
    })
    useRestTimeseriesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null
    })
  })

  it('passes a canonical vault address to timeseries queries', () => {
    const vaultAddress = '0x1234567890abcdef1234567890ABCDEF12345678'
    const canonicalAddress = getAddress(vaultAddress)

    renderHook(() => useVaultPageData({ vaultAddress, vaultChainId: 1 }))

    expect(useRestTimeseriesMock).toHaveBeenCalled()
    for (const call of useRestTimeseriesMock.mock.calls) {
      expect(call[0]).toMatchObject({
        address: canonicalAddress
      })
    }
  })
})
