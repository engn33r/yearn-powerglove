import { useEffect, useMemo, useState } from 'react'
import type { ChainId } from '@/constants/chains'
import { fetchVaultUserEvents, sortEventsChronologically } from '@/lib/vault-events'
import type { VaultUserEvent, VaultUserEventType } from '@/types/vaultEventTypes'

const PAGE_SIZE = 50

const normalizeVaultAddresses = (vaultAddress: string | string[] | undefined): string[] => {
  const addresses = Array.isArray(vaultAddress) ? vaultAddress : vaultAddress ? [vaultAddress] : []
  return [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()]
}

export function useVaultEvents(vaultAddress: string | string[] | undefined, chainId: ChainId | undefined) {
  const [allEvents, setAllEvents] = useState<VaultUserEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [eventType, setEventType] = useState<'all' | VaultUserEventType>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const vaultAddressesKey = useMemo(() => normalizeVaultAddresses(vaultAddress).join(','), [vaultAddress])
  const vaultAddresses = useMemo(() => (vaultAddressesKey ? vaultAddressesKey.split(',') : []), [vaultAddressesKey])

  useEffect(() => {
    if (vaultAddresses.length === 0 || !chainId) {
      setAllEvents([])
      setIsLoading(false)
      setCurrentPage(1)
      return
    }

    let cancelled = false
    setCurrentPage(1)
    setIsLoading(true)
    setError(null)

    Promise.all(vaultAddresses.map((address) => fetchVaultUserEvents(address, chainId)))
      .then((eventGroups) => {
        if (!cancelled) {
          setAllEvents(sortEventsChronologically(eventGroups.flat()))
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [vaultAddresses, chainId])

  const filteredEvents = eventType === 'all' ? allEvents : allEvents.filter((e) => e.type === eventType)

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const paginatedEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const depositCount = allEvents.filter((e) => e.type === 'deposit').length
  const withdrawCount = allEvents.filter((e) => e.type === 'withdraw').length
  const transferCount = allEvents.filter((e) => e.type === 'transfer').length

  return {
    events: paginatedEvents,
    totalCount: filteredEvents.length,
    depositCount,
    withdrawCount,
    transferCount,
    isLoading,
    error,
    eventType,
    setEventType,
    currentPage,
    setCurrentPage,
    totalPages
  }
}
