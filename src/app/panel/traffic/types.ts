/**
 * Row shape shared by the traffic page (initial render) and the live poll
 * endpoint (/api/panel/traffic/live). Dates are ISO strings so the shape can
 * cross the server/client boundary.
 */
export interface LiveMessage {
  id: string
  receivedAt: string
  numberFrom: string
  numberTo: string
  destination: string | null
  class: string
  segments: number
  channel: string
  simulated: boolean
  carriedBy: string
  upstreamId: string | null
  text: string
  /** owner name — populated only for admin sessions */
  userName: string | null
  userEarning: number
  /** admin-only fields — never serialized for non-admin sessions */
  trueCost?: number
  marginKept?: number
  billingStatus?: string
  /** set by the live endpoint when the row arrived after the client's last poll watermark */
  isNew?: boolean
}
