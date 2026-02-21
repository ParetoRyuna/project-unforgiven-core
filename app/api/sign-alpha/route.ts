import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { verifyProof, type Proof } from '@reclaimprotocol/js-sdk';
import { oracleKeypair } from '@/services/shield-oracle/src/oracle';
import nacl from 'tweetnacl'; // 需要安装: npm install tweetnacl

type SignAlphaBody = {
  wallet?: string;
  eventId?: string;
  proof?: unknown;
};

function isProofCandidate(input: unknown): input is Proof {
  if (!input || typeof input !== 'object') return false;
  const claimData = (input as { claimData?: unknown }).claimData;
  const signatures = (input as { signatures?: unknown }).signatures;
  return !!claimData && typeof claimData === 'object' && Array.isArray(signatures) && signatures.length > 0;
}

function normalizeProofs(input: unknown): Proof[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : [input];
  return raw.filter(isProofCandidate);
}

function extractProofOwners(proofs: Proof[]): string[] {
  return proofs
    .map((proof) => proof.claimData?.owner)
    .filter((owner): owner is string => typeof owner === 'string' && owner.length > 0);
}

async function resolveTierLevel(wallet: string, proof: unknown): Promise<{ tierLevel: 1 | 2; error?: string; status?: number }> {
  const proofs = normalizeProofs(proof);
  if (proofs.length === 0) return { tierLevel: 2 };

  const allowInsecureDevProof = process.env.ALLOW_INSECURE_DEV_PROOF === '1' && process.env.NODE_ENV !== 'production';

  let verified = false;
  try {
    verified = await verifyProof(proofs);
  } catch {
    verified = false;
  }

  if (!verified) {
    if (allowInsecureDevProof) {
      console.warn('ALLOW_INSECURE_DEV_PROOF=1: skipping Reclaim signature verification failure');
      return { tierLevel: 2 };
    }
    return { tierLevel: 2, error: 'Invalid Reclaim proof signature', status: 401 };
  }

  const owners = extractProofOwners(proofs);
  const ownerMatchesWallet = owners.length > 0 && owners.every((owner) => owner === wallet);
  if (!ownerMatchesWallet) {
    if (allowInsecureDevProof) {
      console.warn('ALLOW_INSECURE_DEV_PROOF=1: skipping proof owner mismatch');
      return { tierLevel: 2 };
    }
    return { tierLevel: 2, error: 'Proof owner does not match wallet', status: 403 };
  }

  return { tierLevel: 1 };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SignAlphaBody;
    const { wallet, eventId, proof } = body;

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    }

    const userPubkey = new PublicKey(wallet);
    const eventPubkey = eventId
      ? new PublicKey(eventId)
      : new PublicKey('7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT');

    // Tier is resolved by verified proof ownership:
    // - valid proof with owner == wallet => verified (1)
    // - no proof => guest (2)
    const tierResolution = await resolveTierLevel(userPubkey.toBase58(), proof);
    if (tierResolution.error) {
      return NextResponse.json({ error: tierResolution.error }, { status: tierResolution.status ?? 400 });
    }
    const tierLevel = tierResolution.tierLevel;

    const expiry = Math.floor(Date.now() / 1000) + 60;
    const nonce = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));

    // AuthorizationPayload (Spec 3.3): [user_wallet 32][event_id 32][tier_level 1][expiry 8][nonce 8] = 81 bytes LE
    const message = Buffer.alloc(81);
    let offset = 0;
    userPubkey.toBuffer().copy(message, offset, 0, 32);
    offset += 32;
    eventPubkey.toBuffer().copy(message, offset, 0, 32);
    offset += 32;
    message.writeUInt8(tierLevel, offset);
    offset += 1;
    message.writeBigInt64LE(BigInt(expiry), offset);
    offset += 8;
    message.writeBigUInt64LE(nonce, offset);

    const oracle = oracleKeypair();
    const signature = nacl.sign.detached(message, oracle.secretKey);

    console.log(
      `📝 Signed AuthorizationPayload: tier=${tierLevel}, expiry=${expiry}, nonce=${nonce}`
    );
    console.log(`🔑 Oracle Pubkey: ${oracle.publicKey.toBase58()}`);

    return NextResponse.json({
      tierLevel,
      eventId: eventPubkey.toBase58(),
      expiry,
      nonce: nonce.toString(),
      signature: Buffer.from(signature).toString('base64'),
      oraclePubkey: oracle.publicKey.toBase58(),
      messageHex: message.toString('hex'),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Signing failed' }, { status: 500 });
  }
}
