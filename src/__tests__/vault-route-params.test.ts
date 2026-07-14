import { describe, expect, it } from 'vitest'
import { isValidVaultRouteParams } from '@/routes/vaults/$chainId/$vaultAddress/index'

describe('isValidVaultRouteParams', () => {
  it('accepts supported chain ids with valid addresses', () => {
    expect(isValidVaultRouteParams('1', '0x0000000000000000000000000000000000000001')).toBe(true)
    expect(isValidVaultRouteParams('80094', '0x0000000000000000000000000000000000000001')).toBe(true)
  })

  it('rejects unsupported chain ids and malformed addresses', () => {
    expect(isValidVaultRouteParams('999999', '0x0000000000000000000000000000000000000001')).toBe(false)
    expect(isValidVaultRouteParams('1', 'not-an-address')).toBe(false)
  })
})
