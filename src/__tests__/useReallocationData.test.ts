import { describe, expect, it } from 'vitest'
import { isValidOptimizationRecord } from '@/hooks/useReallocationData'
import type { RawStrategyDebtRatio } from '@/lib/explain-parser'

describe('isValidOptimizationRecord', () => {
  const makeRecord = (
    overrides: Partial<{
      currentApr: number
      proposedApr: number
      strategyDebtRatios: RawStrategyDebtRatio[]
    }> = {}
  ) => ({
    vault: '0x1111111111111111111111111111111111111111',
    strategyDebtRatios: overrides.strategyDebtRatios ?? [
      {
        strategy: '0x2222222222222222222222222222222222222222',
        name: 'Strategy A',
        currentRatio: 6000,
        targetRatio: 6500,
        currentApr: 12,
        targetApr: 13
      }
    ],
    currentApr: overrides.currentApr ?? 12,
    proposedApr: overrides.proposedApr ?? 13,
    explain: 'ignored',
    source: {
      key: 'api',
      chainId: 1,
      revision: '1',
      isLatestAlias: false,
      timestampUtc: '2025-01-01T00:00:00Z',
      latestMatchedTimestampUtc: null
    }
  })

  it('accepts a valid record', () => {
    expect(isValidOptimizationRecord(makeRecord())).toBe(true)
  })

  it('accepts high but plausible APRs independently of allocation limits', () => {
    expect(isValidOptimizationRecord(makeRecord({ currentApr: 150, proposedApr: 175 }))).toBe(true)
  })

  it('rejects non-finite or negative numeric fields', () => {
    expect(
      isValidOptimizationRecord(
        makeRecord({
          currentApr: Number.POSITIVE_INFINITY
        })
      )
    ).toBe(false)

    expect(
      isValidOptimizationRecord(
        makeRecord({
          strategyDebtRatios: [
            {
              strategy: '0x2222222222222222222222222222222222222222',
              currentRatio: -1,
              targetRatio: 6500,
              currentApr: 12,
              targetApr: 13
            }
          ]
        })
      )
    ).toBe(false)
  })

  it('rejects records whose allocations exceed 100% beyond tolerance', () => {
    expect(
      isValidOptimizationRecord(
        makeRecord({
          strategyDebtRatios: [
            {
              strategy: '0x2222222222222222222222222222222222222222',
              currentRatio: 7000,
              targetRatio: 7000,
              currentApr: 12,
              targetApr: 13
            },
            {
              strategy: '0x3333333333333333333333333333333333333333',
              currentRatio: 4000,
              targetRatio: 4000,
              currentApr: 5,
              targetApr: 6
            }
          ]
        })
      )
    ).toBe(false)
  })
})
