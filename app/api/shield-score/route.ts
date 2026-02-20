import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { handleShieldScoreRequest } from '@/services/shield-oracle/src/handler';
import { evaluateShieldRateLimit } from '@/services/shield-oracle/src/rate_limit';

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (!candidate) return null;

  candidate = candidate.replace(/^::ffff:/i, '');
  if (isIP(candidate)) return candidate;

  const withPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (withPort && isIP(withPort[1])) {
    return withPort[1];
  }
  return null;
}

function firstForwardedIp(headerValue: string | null): string | null {
  if (!headerValue) return null;
  for (const raw of headerValue.split(',')) {
    const parsed = normalizeIp(raw);
    if (parsed) return parsed;
  }
  return null;
}

function clientIp(req: NextRequest): string {
  const trustProxyHeaders = process.env.SHIELD_TRUST_PROXY_HEADERS === '1';
  if (trustProxyHeaders) {
    const forwardedIp = firstForwardedIp(req.headers.get('x-forwarded-for'));
    if (forwardedIp) return forwardedIp;

    const realIp = normalizeIp(req.headers.get('x-real-ip'));
    if (realIp) return realIp;
  }

  const requestIp = normalizeIp((req as NextRequest & { ip?: string }).ip);
  if (requestIp) return requestIp;
  return 'unknown';
}

function parseWallet(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const wallet = (body as { wallet?: unknown }).wallet;
  return typeof wallet === 'string' && wallet.length > 0 ? wallet : null;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (process.env.SHIELD_FREEZE === '1') {
    console.warn(
      JSON.stringify({
        event: 'shield_score_frozen',
        wallet: null,
        nonce: null,
        tier: 'frozen',
        blocked: true,
        price_lamports: null,
        ip,
      })
    );
    return NextResponse.json({ error: 'Shield API temporarily frozen by operator' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const wallet = parseWallet(body);
    const decision = await evaluateShieldRateLimit({ ip, wallet });
    if (!decision.ok) {
      const unavailable = decision.reason === 'backend_unavailable';
      console.warn(
        JSON.stringify({
          event: unavailable ? 'shield_rate_limit_backend_unavailable' : 'shield_rate_limited',
          wallet,
          nonce: null,
          tier: unavailable ? 'rate_limit_backend_unavailable' : 'rate_limited',
          blocked: true,
          price_lamports: null,
          ip,
          scope: decision.scope,
          retry_after_sec: decision.retryAfterSec,
        })
      );
      if (unavailable) {
        return NextResponse.json(
          { error: 'Rate limit backend unavailable', retryAfterSec: decision.retryAfterSec },
          { status: 503, headers: { 'Retry-After': String(decision.retryAfterSec) } }
        );
      }
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSec: decision.retryAfterSec, scope: decision.scope },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfterSec) } }
      );
    }

    const result = await handleShieldScoreRequest(body ?? {});
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
