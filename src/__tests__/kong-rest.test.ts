import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getKongTimeseriesUrl, getKongVaultSnapshotUrl } from '@/lib/kong-rest'

describe('kong REST URL builders', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('encodes dynamic snapshot path segments', () => {
    const url = getKongVaultSnapshotUrl(1, '0x0000000000000000000000000000000000000001/..')

    expect(url).toBe('https://kong.yearn.fi/api/rest/snapshot/1/0x0000000000000000000000000000000000000001%2F..')
  })

  it('encodes dynamic timeseries path segments', () => {
    const url = getKongTimeseriesUrl('apy-historical/weekly', 80094, '0x0000000000000000000000000000000000000001')

    expect(url).toBe(
      'https://kong.yearn.fi/api/rest/timeseries/apy-historical%2Fweekly/80094/0x0000000000000000000000000000000000000001'
    )
  })
})
