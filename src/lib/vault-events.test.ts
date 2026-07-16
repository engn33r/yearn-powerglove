import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryEnvio } from '@/lib/envio-client'
import { fetchVaultManagementEvents } from './vault-events'

vi.mock('@/lib/envio-client', () => ({
  queryEnvio: vi.fn()
}))

function makeRow(index: number) {
  return {
    id: `event-${index}`,
    chainId: 1,
    blockNumber: String(index + 1),
    blockTimestamp: String(index + 1),
    transactionHash: `0x${String(index + 1).padStart(64, '0')}`,
    vaultAddress: '0xvault',
    logIndex: String(index)
  }
}

describe('vault events fetcher', () => {
  const queryEnvioMock = vi.mocked(queryEnvio)

  beforeEach(() => {
    queryEnvioMock.mockReset()
  })

  it('caps pagination after the configured page budget', async () => {
    queryEnvioMock.mockImplementation(async (query: string) => {
      const aliases = [...query.matchAll(/(\w+):\s+\w+\(/g)].map((match) => match[1])
      const firstAlias = aliases[0]

      return Object.fromEntries(
        aliases.map((alias) => [
          alias,
          alias === firstAlias ? Array.from({ length: 250 }, (_, index) => makeRow(index)) : []
        ])
      )
    })

    const { events, isTruncated } = await fetchVaultManagementEvents('0xvault', 1)

    expect(queryEnvioMock).toHaveBeenCalledTimes(8)
    expect(events).toHaveLength(2000)
    expect(isTruncated).toBe(true)
  })

  it('honors abort signals before making additional requests', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(fetchVaultManagementEvents('0xvault', 1, { signal: controller.signal })).rejects.toThrow(/aborted/i)
    expect(queryEnvioMock).not.toHaveBeenCalled()
  })
})
