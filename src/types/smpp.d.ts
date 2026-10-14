declare module 'smpp' {
  interface Pdu {
    command: string
    command_status?: number
    sequence_number: number
    system_id?: string
    password?: string
    interface_version?: number
    source_addr?: string
    destination_addr?: string
    short_message?: Buffer | string
    registered_delivery?: number
    esm_class?: number
    data_coding?: number
    message_id?: string
    sm_length?: number
    response: (params?: Record<string, unknown>) => Pdu
  }
  interface Session {
    on(event: string, listener: (pdu?: Pdu) => void): Session
    send(pdu: unknown, responseCallback?: (pdu: Pdu) => void): void
    close(): void
    destroy(): void
    deliver_sm(params: Record<string, unknown>, cb?: (pdu?: Pdu) => void): void
    enquire_link_resp(): void
    pause(): void
    resume(): void
    paused: boolean
  }
  interface Server {
    listen(port: number, host?: string, cb?: () => void): void
    on(event: string, listener: (...args: unknown[]) => void): void
    close(): void
  }
  function createServer(options: Record<string, unknown>, cb: (session: Session) => void): Server
  const ESME_ROK: number
  const ESME_RBINDFAIL: number
  const ESME_RSYSERR: number
}
