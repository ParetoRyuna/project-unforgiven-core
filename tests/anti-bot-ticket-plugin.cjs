const { expect } = require('chai');

const {
  antiBotTicketPlugin,
  fetchShieldQuote,
  parseApiBase,
} = require('../examples/anti-bot-ticket-plugin/index.js');

function okJson(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function errorJson(status, body) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('anti-bot ticket plugin', () => {
  it('fails fast on invalid wallet input', async () => {
    let err = null;
    try {
      await antiBotTicketPlugin({ wallet: 'bad-wallet' }, { fetchImpl: async () => okJson({}) });
    } catch (error) {
      err = error;
    }
    expect(err).to.be.an('error');
    expect(err.message).to.include('invalid wallet public key');
  });

  it('returns block when dignity score is low', async () => {
    const result = await antiBotTicketPlugin(
      { wallet: '11111111111111111111111111111111', ticketId: 'show_001', quantity: 1 },
      {
        fetchImpl: async () =>
          okJson({
            dignity_score: 12,
            payload: { dignity_score: 12, initial_price: '1000000000', user_mode: 1, attestation_expiry: '9999999999' },
            payload_hex: 'aa',
            oracle_signature_hex: 'bb',
            oracle_pubkey: 'cc',
          }),
      },
    );

    expect(result.decision).to.equal('block');
    expect(result.reason_codes).to.include('low_dignity');
    expect(result.final_price_lamports).to.equal('1000000000');
  });

  it('returns step_up when surge threshold is exceeded', async () => {
    const result = await antiBotTicketPlugin(
      { wallet: '11111111111111111111111111111111', ticketId: 'show_002', quantity: 1 },
      {
        fetchImpl: async () =>
          okJson({
            dignity_score: 45,
            payload: { dignity_score: 45, initial_price: '25000000000', user_mode: 1, attestation_expiry: '9999999999' },
            payload_hex: 'phex',
            oracle_signature_hex: 'sighex',
            oracle_pubkey: 'pk',
          }),
      },
    );

    expect(result.decision).to.equal('step_up');
    expect(result.reason_codes).to.include('surge_protection');
    expect(result.payload_hex).to.equal('phex');
    expect(result.oracle_signature_hex).to.equal('sighex');
    expect(result.oracle_pubkey).to.equal('pk');
  });

  it('returns allow with contract fields for normal quote', async () => {
    const result = await antiBotTicketPlugin(
      { wallet: '11111111111111111111111111111111', ticketId: 'show_003', quantity: 2 },
      {
        nowMs: 1_700_000_000_000,
        fetchImpl: async () =>
          okJson({
            dignity_score: 70,
            payload: {
              dignity_score: 70,
              initial_price: '1200000000',
              user_mode: 2,
              attestation_expiry: String(Math.floor(1_700_000_000_000 / 1000) + 120),
            },
            payload_hex: 'payload',
            oracle_signature_hex: 'signature',
            oracle_pubkey: 'oracle',
          }),
      },
    );

    expect(result.decision).to.equal('allow');
    expect(result.reason_codes).to.deep.equal(['allow_default']);
    expect(result.final_price_lamports).to.equal('1200000000');
    expect(result.tier).to.equal('verified');
    expect(result.ttl_seconds).to.equal(120);
    expect(result.ticket_id).to.equal('show_003');
    expect(result.quantity).to.equal(2);
  });

  it('retries on transient 5xx and succeeds on next attempt', async () => {
    let calls = 0;
    const body = await fetchShieldQuote(
      '11111111111111111111111111111111',
      [],
      {
        retryCount: 2,
        timeoutMs: 1000,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return errorJson(503, { error: 'temporary unavailable' });
          }
          return okJson({ payload: { initial_price: '1000000000', user_mode: 1 } });
        },
      },
    );
    expect(calls).to.equal(2);
    expect(body).to.have.property('payload');
  });

  it('validates SHIELD_API_BASE format', () => {
    let err = null;
    try {
      parseApiBase('not-a-url');
    } catch (error) {
      err = error;
    }
    expect(err).to.be.an('error');
    expect(err.message).to.include('invalid SHIELD_API_BASE');
  });
});
