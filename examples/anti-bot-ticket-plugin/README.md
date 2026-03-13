# Anti-Bot Ticket Plugin (Contracted Example)

This plugin demonstrates a Shield-first integration with a stable output contract.

## Files
- `index.js`: contracted plugin logic (`allow | block | step_up`)
- `plugin.manifest.template.json`: plugin metadata template

## Output Contract (V1)
The plugin always returns:
- `decision`: `allow | block | step_up`
- `reason_codes`: string array
- `final_price_lamports`: string
- `payload_hex`: string or `null`
- `oracle_signature_hex`: string or `null`
- `oracle_pubkey`: string or `null`
- `ttl_seconds`: number or `null`
- `tier`: `verified | guest | bot_suspected`
- `ticket_id`: string
- `quantity`: number

## Run (Direct)
```bash
SHIELD_API_BASE=http://127.0.0.1:3100 node ./examples/anti-bot-ticket-plugin/index.js 11111111111111111111111111111111
```

## Run (Smoke)
```bash
SHIELD_API_BASE=http://127.0.0.1:3100 npm run smoke:plugin:ticket:v2
```

## Test
```bash
npm run test:plugin:ticket
```

## Behavior Rules
- `block` when dignity score is low.
- `step_up` when price exceeds local surge threshold.
- `allow` when checks pass under threshold.

## Common Errors
- `invalid wallet public key: ...`
- `invalid SHIELD_API_BASE: ...`
- `shield failed (<status>): ...`
- `shield returned non-JSON body (status=...)`
