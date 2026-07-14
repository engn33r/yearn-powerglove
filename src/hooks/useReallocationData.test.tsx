import { describe, expect, it } from 'vitest'
import {
  buildReallocationQueryKey,
  buildReallocationRequestUrl,
  isMatchingReallocationRecord
} from '@/hooks/useReallocationData'

function makeRecord(overrides: Partial<Parameters<typeof isMatchingReallocationRecord>[0]> = {}) {
  return {
    vault: '0xabc0000000000000000000000000000000000000',
    strategyDebtRatios: [],
    currentApr: 0,
    proposedApr: 0,
    explain: 'Vault Label (1: 0xabc0000000000000000000000000000000000000)\nTVL: $1 USD',
    source: {
      key: 'api',
      chainId: 1,
      revision: '1',
      isLatestAlias: false,
      timestampUtc: '2024-01-01T00:00:00Z',
      latestMatchedTimestampUtc: null
    },
    ...overrides
  } as Parameters<typeof isMatchingReallocationRecord>[0]
}

describe('buildReallocationQueryKey', () => {
  it('includes the chain id to avoid cache collisions across chains', () => {
    expect(buildReallocationQueryKey('0xAbC', 1)).toEqual(['reallocation', 'history', 1, '0xabc'])
    expect(buildReallocationQueryKey('0xAbC', 1)).not.toEqual(buildReallocationQueryKey('0xAbC', 10))
  })
})

describe('buildReallocationRequestUrl', () => {
  it('adds both vault and chain id params', () => {
    expect(buildReallocationRequestUrl('https://api.example/reallocation', '0xAbC', 10)).toBe(
      'https://api.example/reallocation?vault=0xabc&chainId=10'
    )
  })

  it('appends params onto existing query strings', () => {
    expect(buildReallocationRequestUrl('https://api.example/reallocation?latest=true', '0xAbC', 8453)).toBe(
      'https://api.example/reallocation?latest=true&vault=0xabc&chainId=8453'
    )
  })

  it('can request history mode for the flow-chart timeline', () => {
    expect(buildReallocationRequestUrl('https://api.example/reallocation', '0xAbC', 10, { history: true })).toBe(
      'https://api.example/reallocation?vault=0xabc&chainId=10&history=1'
    )
  })
})

describe('isMatchingReallocationRecord', () => {
  it('accepts a record that matches the requested vault and chain', () => {
    expect(isMatchingReallocationRecord(makeRecord(), '0xAbC0000000000000000000000000000000000000', 1)).toBe(true)
  })

  it('rejects a record with a mismatched vault address', () => {
    expect(
      isMatchingReallocationRecord(
        makeRecord({ vault: '0xdef0000000000000000000000000000000000000' }),
        '0xAbC0000000000000000000000000000000000000',
        1
      )
    ).toBe(false)
  })

  it('rejects a record with a mismatched source chain id', () => {
    expect(
      isMatchingReallocationRecord(
        makeRecord({ source: { ...makeRecord().source, chainId: 10 } }),
        '0xAbC0000000000000000000000000000000000000',
        1
      )
    ).toBe(false)
  })

  it('rejects conflicting explain metadata for vault or chain', () => {
    expect(
      isMatchingReallocationRecord(
        makeRecord({
          explain: 'Vault Label (10: 0xdef0000000000000000000000000000000000000)\nTVL: $1 USD'
        }),
        '0xAbC0000000000000000000000000000000000000',
        1
      )
    ).toBe(false)
  })
})
