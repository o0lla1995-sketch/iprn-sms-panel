'use client'

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts'

export interface DayPoint {
  day: string
  userEarning: number
  /** admin-only series — omitted entirely from non-admin payloads */
  marginKept?: number
  /** admin-only series — omitted entirely from non-admin payloads */
  trueValue?: number
  count: number
}

export function EarningsChart({ data, showMargin }: { data: DayPoint[]; showMargin: boolean }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Earnings over the last 14 days">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
          <Tooltip
            formatter={(value: number | string, name: string) => [`$${Number(value).toFixed(4)}`, name]}
            labelFormatter={(l: string) => l}
          />
          <Area type="monotone" dataKey="userEarning" name="User earnings" stroke="#10b981" fill="#10b98133" strokeWidth={2} />
          {showMargin && (
            <Area type="monotone" dataKey="marginKept" name="Margin kept (admin)" stroke="#f59e0b" fill="#f59e0b26" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ClassBars({ p2p, a2p }: { p2p: number; a2p: number }) {
  const data = [
    { name: 'P2P', messages: p2p },
    { name: 'A2P', messages: a2p },
  ]
  return (
    <div className="h-48 w-full" role="img" aria-label="Traffic by class">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="messages" name="Messages (7d)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={64} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TrafficVolumeChart({ data }: { data: DayPoint[] }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Daily message volume">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" name="Messages / day" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
