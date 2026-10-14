/**
 * E2E test: simulate the upstream platform binding into our SMPP gateway
 * and submitting traffic, exactly like the real wholesale platform would.
 */
import smpp from 'smpp'

const HOST = process.env.SMPP_HOST || '127.0.0.1'
const PORT = Number(process.env.SMPP_PORT || 2775)
const SYSTEM_ID = process.env.UPSTREAM_SMPP_SYSTEM_ID || 'iprn-gw01'
const PASSWORD = process.env.UPSTREAM_SMPP_PASSWORD || 'Upstream!Gw01#2026'

function log(...args: unknown[]) {
  console.log('[test]', ...args)
}

function run(session: any) {
  session.bind_transceiver(
    { system_id: SYSTEM_ID, password: PASSWORD, interface_version: 0x34 },
    (pdu: any) => {
      log('bind_transceiver_resp status=', pdu.command_status)
      if (pdu.command_status !== 0) process.exit(1)
      session.submit_sm(
        {
          source_addr: 'PayPal',
          source_addr_ton: 5,
          source_addr_npi: 0,
          destination_addr: '213562242832',
          dest_addr_ton: 1,
          dest_addr_npi: 1,
          data_coding: 0,
          registered_delivery: 1,
          short_message: 'Your code is 778899. Do not share it.',
        },
        (resp: any) => {
          log('submit_sm_resp status=', resp.command_status, 'message_id=', resp.message_id)
          if (resp.command_status !== 0) process.exit(1)
        }
      )
    }
  )

  session.on('deliver_sm', (pdu: any) => {
    const sm = pdu.short_message
    const text = sm && typeof sm === 'object' && 'message' in sm ? String(sm.message) : String(sm ?? '')
    log('deliver_sm (DLR) →', text.slice(0, 120))
    session.deliver_sm_resp({ command_status: 0 })
    log('ACKed DLR — full SMPP cycle complete OK')
    setTimeout(() => process.exit(0), 500)
  })
}

;(smpp as any).connect({ host: HOST, port: PORT, connectTimeout: 8000 }, (session: any) => {
  log('connected to', HOST, ':', PORT)
  run(session)
  setTimeout(() => {
    log('timeout waiting for DLR')
    process.exit(2)
  }, 15000)
})
