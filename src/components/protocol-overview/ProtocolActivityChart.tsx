import React, { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FixedHeightChartContainer } from '@/components/charts/chart-container'
import { formatTvlDisplay } from '@/lib/formatters'
import type { DayActivity } from '@/lib/protocol-activity'

const formatAxisUsd = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

const formatDay = (value: number): string => {
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface ProtocolActivityChartProps {
  byDay: DayActivity[]
  isLoading: boolean
}

const tooltipFormatter = (value: number, name: string): [string, string] => [formatTvlDisplay(Number(value)), name]

function ProtocolActivityChartImpl({ byDay, isLoading }: ProtocolActivityChartProps) {
  const totalDeposits = useMemo(() => byDay.reduce((s, d) => s + d.depositsUsd, 0), [byDay])
  const totalWithdrawals = useMemo(() => byDay.reduce((s, d) => s + d.withdrawalsUsd, 0), [byDay])

  return (
    <section className="flex h-full flex-col border border-border bg-white">
      <div className="flex flex-col gap-1 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">Protocol activity</h2>
        <p className="text-xs text-gray-500">
          Deposits vs withdrawals (USD) · last 30 days
          {!isLoading && byDay.length > 0 && (
            <>
              {' · '}
              <span className="text-emerald-600">+{formatTvlDisplay(totalDeposits)}</span>
              {' / '}
              <span className="text-red-500">-{formatTvlDisplay(totalWithdrawals)}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 sm:px-6">
        <FixedHeightChartContainer heightClassName="min-h-[220px] flex-1 sm:min-h-[260px]">
          {isLoading && byDay.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">Loading activity…</div>
          ) : byDay.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">No activity in window</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border, #e5e7eb)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tickFormatter={formatAxisUsd}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={(label: number) => formatDay(label)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' }}
                  cursor={{ fill: 'rgba(6,87,249,0.05)' }}
                />
                <Bar
                  dataKey="depositsUsd"
                  name="Deposits"
                  fill="#10b981"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="withdrawalsUsd"
                  name="Withdrawals"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </FixedHeightChartContainer>
      </div>
    </section>
  )
}

export const ProtocolActivityChart = React.memo(ProtocolActivityChartImpl)
