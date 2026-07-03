// Loading placeholder mirroring the ProtocolOverview layout (KPI row + chart +
// lower panels) so the page doesn't shift when the data resolves.
export function ProtocolOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="h-[88px] animate-pulse border border-border bg-white p-4">
          <div className="mb-3 h-3 w-16 bg-gray-100" />
          <div className="h-5 w-24 bg-gray-100" />
        </div>
        <div className="h-[88px] animate-pulse border border-border bg-white p-4">
          <div className="mb-3 h-3 w-16 bg-gray-100" />
          <div className="h-5 w-24 bg-gray-100" />
        </div>
        <div className="h-[88px] animate-pulse border border-border bg-white p-4">
          <div className="mb-3 h-3 w-16 bg-gray-100" />
          <div className="h-5 w-24 bg-gray-100" />
        </div>
        <div className="h-[88px] animate-pulse border border-border bg-white p-4">
          <div className="mb-3 h-3 w-16 bg-gray-100" />
          <div className="h-5 w-24 bg-gray-100" />
        </div>
      </div>
      <div className="h-[420px] animate-pulse border border-border bg-white" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[280px] animate-pulse border border-border bg-white lg:col-span-2" />
        <div className="h-[280px] animate-pulse border border-border bg-white" />
      </div>
    </div>
  )
}
