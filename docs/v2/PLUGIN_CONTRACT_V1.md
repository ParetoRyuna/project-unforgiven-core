# UNFORGIVEN v2 Plugin Contract V1

This document defines the minimum integration contract for plugin-style adopters of the UNFORGIVEN fairness layer.

## 1) Scope
- Integration target: high-demand flows (ticketing, launchpad-like access, gated actions).
- Mode: Shield-first decisioning.
- Decision set: `allow | block | step_up`.

## 2) Input Contract
Plugin invocation input:

```ts
type TicketPluginInput = {
  wallet: string;              // required, Solana public key
  ticketId?: string;           // optional, defaults to "ticket_unknown"
  quantity?: number;           // optional, defaults to 1
  attestations?: object[];     // optional, reclaim attestation list
};
```

Runtime options:

```ts
type TicketPluginOptions = {
  apiBase?: string;                  // defaults to SHIELD_API_BASE or http://127.0.0.1:3100
  timeoutMs?: number;                // defaults to 4000
  retryCount?: number;               // defaults to 2
  stepUpThresholdLamports?: bigint;  // defaults to 20_000_000_000n
};
```

## 3) Output Contract
Plugin result:

```ts
type TicketPluginDecisionV1 = {
  decision: "allow" | "block" | "step_up";
  reason_codes: string[];
  final_price_lamports: string;
  payload_hex: string | null;
  oracle_signature_hex: string | null;
  oracle_pubkey: string | null;
  ttl_seconds: number | null;
  tier: "verified" | "guest" | "bot_suspected";
  ticket_id: string;
  quantity: number;
};
```

## 4) Decision Semantics
- `block`: low dignity score.
- `step_up`: surge threshold exceeded or bot-suspected tier.
- `allow`: default path for normal requests.

## 5) Error Contract
Common failure reasons:
- `invalid wallet public key: ...`
- `invalid SHIELD_API_BASE: ...`
- `shield failed (<status>): ...`
- `shield returned non-JSON body (status=...)`

Error behavior:
- Plugin throws on invalid input/config/network contract failures.
- Plugin logs `plugin_ticket_error` in CLI mode.

## 6) Observability Keys
Plugin decision log keys:
- `event`
- `wallet`
- `tier`
- `decision`
- `price_lamports`
- `reason_codes`
- `ticket_id`
- `quantity`

## 7) Week 2 Evidence Commands
```bash
npm run test:scripts:v2
npm run test:plugin:ticket
SHIELD_API_BASE=http://127.0.0.1:3100 npm run smoke:plugin:ticket:v2
```

## 8) Minimal Integration Sequence
1. Validate wallet and runtime config.
2. Call Shield API (`/api/shield-score`) with guest mode or provided attestations.
3. Map response into `TicketPluginDecisionV1`.
4. Execute app logic based on `decision`.
