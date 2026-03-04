#!/usr/bin/env node

const { antiBotTicketPlugin } = require('../examples/anti-bot-ticket-plugin/index.js');

async function main() {
  const wallet = process.argv[2] || '11111111111111111111111111111111';
  const ticketId = process.argv[3] || 'show_001';
  const quantity = Number(process.argv[4] || '1');

  const result = await antiBotTicketPlugin(
    { wallet, ticketId, quantity },
    {
      apiBase: process.env.SHIELD_API_BASE,
    },
  );

  console.log(
    JSON.stringify({
      event: 'plugin_ticket_smoke_result',
      wallet,
      ticket_id: ticketId,
      decision: result.decision,
      tier: result.tier,
      final_price_lamports: result.final_price_lamports,
      reason_codes: result.reason_codes,
      ttl_seconds: result.ttl_seconds,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'plugin_ticket_smoke_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
