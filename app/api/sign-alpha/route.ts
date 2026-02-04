import { NextRequest, NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl'; // 需要安装: npm install tweetnacl

// Oracle (Admin) 私钥：优先从 .env 读取 (Spec 3.3 JIT Signing)
// .env: ORACLE_PRIVATE_KEY="[1,2,3,...]" (64 bytes JSON array)
function getOracleKeypair(): Keypair {
  const envKey = process.env.ORACLE_PRIVATE_KEY;
  if (envKey) {
    try {
      const arr = JSON.parse(envKey) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch (e) {
      console.warn('Invalid ORACLE_PRIVATE_KEY, using ephemeral key');
    }
  }
  return Keypair.generate();
}

let _ORACLE_KEYPAIR: Keypair | null = null;
function getOracle(): Keypair {
  if (!_ORACLE_KEYPAIR) _ORACLE_KEYPAIR = getOracleKeypair();
  return _ORACLE_KEYPAIR;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, eventId, mockProof } = body;

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    }

    const userPubkey = new PublicKey(wallet);
    const eventPubkey = eventId
      ? new PublicKey(eventId)
      : new PublicKey('7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT');

    // Mock zkTLS: JIT scoring -> tier_level (1=Platinum, 2=Gold, 3=Silver)
    const isScalperMode = req.nextUrl.searchParams.get('mode') === 'scalper';
    const tierLevel = isScalperMode
      ? 3
      : (mockProof?.tier ?? Math.floor(Math.random() * 3) + 1);

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

    const oracle = getOracle();
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
