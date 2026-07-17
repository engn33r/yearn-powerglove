import { describe, expect, it } from 'vitest'
import { parseFilteredNoChangeStrategies } from '@/lib/explain-parser'

describe('parseFilteredNoChangeStrategies', () => {
  it('drops strategies above the bounded allocation range', () => {
    const explain = [
      'Test Vault (1: 0x1111111111111111111111111111111111111111)',
      '  Huge Strategy: 150% => no change (filtered)',
      '    (12%) (12% => 13%)'
    ].join('\n')

    expect(parseFilteredNoChangeStrategies(explain)).toEqual([])
  })

  it('keeps sane percentages and normalizes APR values to bps', () => {
    const explain = [
      'Test Vault (1: 0x1111111111111111111111111111111111111111)',
      '  Strategy A: 25% => no change (filtered)',
      '    (12.5%) (11.25% => 13%)'
    ].join('\n')

    expect(parseFilteredNoChangeStrategies(explain)).toEqual([
      {
        name: 'Strategy A',
        currentRatio: 2500,
        targetRatio: 2500,
        currentApr: 1125,
        targetApr: 1300
      }
    ])
  })
})
